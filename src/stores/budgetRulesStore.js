import { defineStore } from 'pinia'
import { budgetRulesService } from '@/services/budgetRulesService.js'
import { RATE_KINDS } from '@/components/budget/rates/ratesConfig.js'
import { useUserStore } from '@/stores/userStore.js'
import { useBudgetPlanningStore } from '@/stores/budgetPlanningStore.js'
import router from '@/router/index.js'

/**
 * Estado de Gestión de Reglas Financieras (FE-S3-RULES, spec §6, A13/A15).
 *
 * Dueño exclusivo de la caché de datos (las vistas/tabla SOLO leen de aquí):
 *  - `lines`: catálogo de líneas cacheado una vez por sesión SPA (A5).
 *  - `rates[kind]`: `null` = NUNCA cargada | `[]` = cargada vacía (A15);
 *    el cambio de tab y los filtros jamás disparan refetch.
 *  - `payableTerms` (FE-S5-PAYABLE-TERMS): catálogo de términos de pago a
 *    proveedores. EXCEPCIÓN a la regla de refetch: AQUÍ LA CACHÉ ES LA FUENTE
 *    — tras cada POST/PUT/DELETE se inserta/reemplaza/retira en el sitio
 *    desde la respuesta del servidor (objeto completo; BE-S5 §5) y solo se
 *    refuerza (force) cuando un 404 avisa de que el catálogo local caducó.
 *  - `ivaPeriods` (FE-S14-IVA, frontend.03_14 §5): calendario de liquidación
 *    de IVA POR AÑO con la misma excepción de caché-fuente; la caché vale
 *    solo para `ivaPeriodsYear` y cada mutación exitosa notifica al
 *    `budgetPlanningStore` (AC-FE14-6: la Liquidación abierta se refresca
 *    viva vía su debounce, sin request síncrono desde aquí).
 * Tras cada mutación exitosa de tasas (POST/PUT) se hace refetch del `kind`
 * afectado: la fuente de verdad es el servidor; se ignoran respuestas
 * optimistas.
 */

/**
 * Normaliza un error de Axios a los "kinds" de la matriz §6.3, en el patrón
 * de `classifyError()` del Centro de Ingesta. Los `detail` verificados vienen
 * en inglés desde `app/crud/budget/{lineCostRate,commissionRate}.py` y NUNCA
 * se muestran crudos al usuario (NFR-5): solo se usa su `kind`.
 *
 * Matriz:
 *   !err.response              → 'network'
 *   401|403                    → 'auth'      (el flujo de sesión redirige; UI calla)
 *   404                        → 'notfound'
 *   400 + detail ~ /Overlap/i  → 'overlap'   (E-CR-2)
 *   400 + detail ~ /on or after/ → 'period'  (E-CR-1)
 *   422                        → 'validation'
 *   5xx                        → 'server'
 *   otro                       → 'unknown'
 *
 * @param {import('axios').AxiosError} err
 * @returns {{ kind: string, [key: string]: any }}
 */
export function classifyRateError(err) {
  const response = err?.response

  // Sin respuesta: red caída, CORS o timeout global de 20 s (§5.5).
  if (!response) {
    return { kind: 'network' }
  }

  const status = response.status

  // 401/403: sin banner ni modal — se limpia la sesión y se redirige a Login.
  if (status === 401 || status === 403) {
    return { kind: 'auth', status }
  }

  if (status === 404) {
    return { kind: 'notfound', status }
  }

  const detail = response.data?.detail

  // 400 de rango (E-CR-1) y solapamiento (E-CR-2) según `detail` literal.
  if (status === 400 && typeof detail === 'string') {
    if (/Overlap/i.test(detail)) {
      return { kind: 'overlap', status }
    }
    if (/on or after/i.test(detail)) {
      return { kind: 'period', status }
    }
  }

  // 422: esquema FastAPI (pct fuera de 0-100, rate_name > 120, fecha inválida).
  if (status === 422) {
    return { kind: 'validation', status }
  }

  if (status >= 500) {
    return { kind: 'server', status }
  }

  return { kind: 'unknown', status }
}

export const useBudgetRulesStore = defineStore('budgetRulesStore', {
  state: () => ({
    /** @type {Array<{ id_line: number, line_name: string }>} catálogo (A5) */
    lines: [],
    linesLoaded: false,
    /** @type {{ cost: Array<object>|null, commission: Array<object>|null }} */
    rates: { cost: null, commission: null },
    /**
     * Catálogo completo de términos de pago a proveedores por línea
     * (FE-S5): `{ id_line_payable_term, id_line, payment_pct, payment_days }`.
     * @type {Array<object>}
     */
    payableTerms: [],
    /** `false` = NUNCA cargada; se marca SOLO en éxito (patrón A15 lazy). */
    payableTermsLoaded: false,
    /**
     * Guard doble-submit de las mutaciones de términos (FE-S5, espejo del
     * `lineSaving` de `budgetPlanningStore`): claves `id_line_payable_term`
     * para PUT/DELETE y `'new'` para POST. Dueño: las acciones del store.
     * @type {Record<number|string, boolean>}
     */
    payableTermSaving: {},
    /**
     * Catálogos de INTERNACIÓN por línea (FE-S10-INTERNMENT-SPLIT §2.2;
     * autoridad `backend.02_19` §3.1/§3.2/§5.3):
     *  - `internmentRates`: `{ id_line_internment_rate, id_line,
     *    internment_pct (fracción 0–1, D-S9-1) }` — unicidad por Línea (máx.
     *    UNA tasa vigente; la ausencia se representa con la INEXISTENCIA de
     *    fila ⇒ sin tasa = 0 %, A-5) ⇒ last-wins imposible al cartular.
     *  - `internmentTerms`: `{ id_line_internment_term, id_line,
     *    payment_pct, payment_days }` — espejo de forma de `payableTerms`
     *    pero la base del pct es el CostoInternación (tablas NO
     *    intercambiables, BE-S9 §3.2).
     * Se cargan SIEMPRE como dúo atómico (`fetchInternmentCatalogs`, UN
     * `Promise.all`): la derivación del split es todo-o-nada — sin el % no
     * se puede partir la base ⇒ UNA sola bandera de error (D-FE10-3). Misma
     * excepción de caché que `payableTerms`: las acciones CRUD patchan
     * in-place desde la respuesta del servidor (sin refetch).
     * @type {Array<object>}
     */
    internmentRates: [],
    /** @type {Array<object>} */
    internmentTerms: [],
    /** `false` = NUNCA cargada; se marca SOLO en éxito del dúo (patrón A15). */
    internmentCatalogsLoaded: false,
    /**
     * Calendario de liquidación de IVA por año (FE-S14-IVA §5; autoridad
     * `backend.02_20` §3.2/§5.8): filas `{ id_iva_period, period_year,
     * period_no, date_from, date_to, payment_due_date, description }`.
     * EXCEPCIÓN de caché-fuente a la `payableTerms`/internment: las acciones
     * CRUD insertan/reemplazan/retiran in-place desde la respuesta (cero
     * refetch). La caché vale SOLO para `ivaPeriodsYear` — cambiar de año en
     * el panel fuerza `fetchIvaPeriods(year)` (no-op si ya es el año
     * cargado). Tras CADA mutación exitosa se notifica al
     * `budgetPlanningStore` (`scheduleSettlementRefresh`): la recurrencia de
     * la liquidación y el bloque del Flujo dependen de este catálogo y el
     * escenario puede estar abierto (AC-FE14-6: "edición en vivo visible en
     * Liquidación al refetch"; borrado total ⇒ estado "sin calendario").
     * @type {Array<object>}
     */
    ivaPeriods: [],
    /** año fiscal de las filas cacheadas (`null` = ninguna carga resuelta). */
    ivaPeriodsYear: null,
    /** `false` = NUNCA cargada; se marca SOLO en éxito (patrón A15). */
    ivaPeriodsLoaded: false,
    /**
     * Guards doble-submit de las mutaciones de internación (espejo de
     * `payableTermSaving`): claves `id_line_internment_rate` /
     * `id_line_internment_term` para PUT/DELETE y `'new'` para POST.
     * Mapas SEPARADOS por entidad: un POST de tasa y un POST de término en
     * vuelo no se bloquean entre sí (la clave `'new'` vive en cada mapa).
     * @type {Record<number|string, boolean>}
     */
    internmentRateSaving: {},
    /** @type {Record<number|string, boolean>} */
    internmentTermSaving: {},
    /**
     * Guard doble-submit de las mutaciones del calendario IVA (espejo de
     * `internmentTermSaving`): claves `id_iva_period` para PUT/DELETE y
     * `'new'` para POST. Dueño: las acciones del store.
     * @type {Record<number|string, boolean>}
     */
    ivaPeriodSaving: {},
    loading: {
      lines: false,
      cost: false,
      commission: false,
      payableTerms: false,
      internment: false,
      ivaPeriods: false
    },
    /** true ⇒ banner rojo con botón "Reintentar" (A11); null = sin error. */
    loadError: { cost: null, commission: null, payableTerms: null, internment: null, ivaPeriods: null },
    /** Flag global de POST/PUT en vuelo (anti doble-submit, §10.5). */
    saving: false
  }),

  getters: {
    /**
     * Nombre de línea resolviendo `id_line` contra el catálogo (la API no
     * devuelve `line_name`, §5.3): `null` ⇒ 'Global'; desconocida ⇒
     * `Línea #<id> (eliminada)` (R-1).
     * @returns {(id: number|null) => string}
     */
    lineNameById: (state) => (id) =>
      id === null
        ? 'Global'
        : (state.lines.find((line) => line.id_line === id)?.line_name ??
          `Línea #${id} (eliminada)`),

    /**
     * Filas crudas del kind (`null` = nunca cargada).
     * @returns {(kind: string) => Array<object>|null}
     */
    ratesOf: (state) => (kind) => state.rates[kind] ?? null
  },

  actions: {
    /**
     * Equivalente localizado del "interceptor global" de sesión (misma
     * desviación documentada que `budgetUploadStore`: el repo solo tiene
     * interceptor de petición en `plugins/axios.js`). Silencioso: sin banner.
     * @param {{ kind: string }} classified
     */
    handleAuth(classified) {
      if (classified.kind !== 'auth') return
      const userStore = useUserStore()
      userStore.logout()
      if (router.currentRoute.value.name !== 'Login') {
        router.push({ name: 'Login' })
      }
    },

    /**
     * Catálogo de líneas con cache total de la SPA (§6.2): si ya cargó,
     * no-op. `linesLoaded` se marca SOLO en éxito.
     * @returns {Promise<{ ok: boolean, kind?: string }>}
     */
    async fetchLinesOnce() {
      if (this.linesLoaded) return { ok: true }
      this.loading.lines = true
      try {
        const response = await budgetRulesService.fetchLines()
        this.lines = Array.isArray(response?.data) ? response.data : []
        this.linesLoaded = true
        return { ok: true }
      } catch (err) {
        const classified = classifyRateError(err)
        this.handleAuth(classified)
        return { ok: false, ...classified }
      } finally {
        this.loading.lines = false
      }
    },

    /**
     * Lista del pilar (A14/A15). Si ya está cargada y `!force` ⇒ no-op: ni
     * el cambio de tab ni los filtros generan tráfico HTTP. Guarda la lista
     * cruda sin ordenar (la tabla ordena client-side).
     * @param {'cost'|'commission'} kind
     * @param {boolean} [force=false] refetch forzado (botón Actualizar/Reintentar)
     * @returns {Promise<{ ok: boolean, kind?: string }>}
     */
    async fetchRates(kind, force = false) {
      if (!RATE_KINDS[kind]) return { ok: false, kind: 'unknown' }
      if (!force && this.rates[kind] !== null) return { ok: true }

      this.loading[kind] = true
      this.loadError[kind] = null
      try {
        const response = await budgetRulesService.fetchRates(kind)
        this.rates[kind] = Array.isArray(response?.data) ? response.data : []
        return { ok: true }
      } catch (err) {
        const classified = classifyRateError(err)
        // 'auth' no deja banner: el flujo de sesión redirige a Login (AC-03).
        if (classified.kind !== 'auth') {
          this.loadError[kind] = true
        }
        this.handleAuth(classified)
        return { ok: false, ...classified }
      } finally {
        this.loading[kind] = false
      }
    },

    /**
     * POST de creación → éxito: refetch del kind (fuente de verdad) →
     * `{ ok: true, data }`. Nunca lanza el error axios crudo al componente.
     * @param {'cost'|'commission'} kind
     * @param {Object} payload
     * @returns {Promise<{ ok: boolean, data?: object|null, kind?: string }>}
     */
    async createRate(kind, payload) {
      this.saving = true
      try {
        const response = await budgetRulesService.createRate(kind, payload)
        await this.fetchRates(kind, true)
        return { ok: true, data: response?.data ?? null }
      } catch (err) {
        const classified = classifyRateError(err)
        this.handleAuth(classified)
        return { ok: false, ...classified }
      } finally {
        this.saving = false
      }
    },

    /**
     * PUT de edición (payload sin `id_line`, §5.3) → éxito: refetch del kind.
     * @param {'cost'|'commission'} kind
     * @param {number|string} id
     * @param {Object} payload solo campos no-null y nunca `id_line` (A6/A7)
     * @returns {Promise<{ ok: boolean, data?: object|null, kind?: string }>}
     */
    async updateRate(kind, id, payload) {
      this.saving = true
      try {
        const response = await budgetRulesService.updateRate(kind, id, payload)
        await this.fetchRates(kind, true)
        return { ok: true, data: response?.data ?? null }
      } catch (err) {
        const classified = classifyRateError(err)
        this.handleAuth(classified)
        return { ok: false, ...classified }
      } finally {
        this.saving = false
      }
    },

    /**
     * Archivar (`value: false`, regla de oro: la historia no se borra, se
     * inactiva) o Reactivar (`value: true`, sujeto a E-CR-2 en el servidor).
     * @param {'cost'|'commission'} kind
     * @param {number|string} id
     * @param {boolean} value
     * @returns {Promise<{ ok: boolean, data?: object|null, kind?: string }>}
     */
    async setActive(kind, id, value) {
      return this.updateRate(kind, id, { is_active: value })
    },

    /* ------------------- Términos de pago a proveedores (FE-S5) ------------------- */

    /**
     * Catálogo completo de términos de pago (GET `/budget/line-payable-term/`,
     * plano, orden `id_line, payment_days` — BE-S5 §5). Lazy igual que el
     * `commission` de `fetchRates`: ya cargado y `!force` ⇒ no-op (NFR-S5-FE-3:
     * UN solo fetch por sesión; el panel filtra por Línea client-side).
     * `payableTermsLoaded` se marca SOLO en éxito.
     * @param {boolean} [force=false] refetch forzado (Reintentar / 404 en PUT|DELETE)
     * @returns {Promise<{ ok: boolean, kind?: string }>}
     */
    async fetchPayableTerms(force = false) {
      if (!force && this.payableTermsLoaded) return { ok: true }

      this.loading.payableTerms = true
      this.loadError.payableTerms = null
      try {
        const response = await budgetRulesService.fetchPayableTerms()
        this.payableTerms = Array.isArray(response?.data) ? response.data : []
        this.payableTermsLoaded = true
        return { ok: true }
      } catch (err) {
        const classified = classifyRateError(err)
        // 'auth' no deja banner: el flujo de sesión redirige a Login (AC-03).
        if (classified.kind !== 'auth') {
          this.loadError.payableTerms = true
        }
        this.handleAuth(classified)
        return { ok: false, ...classified }
      } finally {
        this.loading.payableTerms = false
      }
    },

    /**
     * POST `{ id_line, payment_pct, payment_days }` (snake_case exacto; el
     * %→fracción lo convierte la capa modal, FD5-3). Éxito 201: PUSH del
     * objeto devuelto en el catálogo cacheado — la caché es la fuente, sin
     * refetch (FE-S5 §4). Guard `'new'` espejo de `lineSaving`. Los 404
     * propagan `detail` sin clasificar para que el panel distinga
     * `"Line {id} not found"` (inline en el select) de otros casos (§3.3);
     * NUNCA se muestra crudo al usuario (NFR-5).
     * @param {{ id_line: number, payment_pct: number, payment_days: number }} payload
     * @returns {Promise<{ ok: boolean, term?: object|null, kind?: string, detail?: string|null }>}
     */
    async createPayableTerm(payload) {
      if (this.payableTermSaving.new) return { ok: false, kind: 'busy' }
      this.payableTermSaving.new = true
      try {
        const response = await budgetRulesService.createPayableTerm(payload)
        const term = response?.data ?? null
        if (term) this.payableTerms.push(term)
        return { ok: true, term }
      } catch (err) {
        const classified = classifyRateError(err)
        this.handleAuth(classified)
        return {
          ok: false,
          ...classified,
          detail: typeof err?.response?.data?.detail === 'string' ? err.response.data.detail : null
        }
      } finally {
        delete this.payableTermSaving.new
      }
    },

    /**
     * PUT de REEMPLAZO TOTAL `/budget/line-payable-term/{id}` (mismo body que
     * el POST; el BE no acepta parcial aquí, BE-S5 §5). Éxito: el objeto
     * devuelto SUSTITUYE la fila en el sitio (splice por
     * `id_line_payable_term`). 404 `"LinePayableTerm {id} not found"` ⇒ el
     * llamador toastea + refetch forzado (§3.3): aquí solo se propaga
     * `kind:'notfound'` con `detail`.
     * @param {number|string} id `id_line_payable_term`
     * @param {{ id_line: number, payment_pct: number, payment_days: number }} payload
     * @returns {Promise<{ ok: boolean, term?: object|null, kind?: string, detail?: string|null }>}
     */
    async updatePayableTerm(id, payload) {
      if (this.payableTermSaving[id]) return { ok: false, kind: 'busy' }
      this.payableTermSaving[id] = true
      try {
        const response = await budgetRulesService.updatePayableTerm(id, payload)
        const term = response?.data ?? null
        if (term) {
          const index = this.payableTerms.findIndex(
            (item) => item.id_line_payable_term === Number(id)
          )
          if (index !== -1) this.payableTerms.splice(index, 1, term)
          else this.payableTerms.push(term)
        }
        return { ok: true, term }
      } catch (err) {
        const classified = classifyRateError(err)
        this.handleAuth(classified)
        return {
          ok: false,
          ...classified,
          detail: typeof err?.response?.data?.detail === 'string' ? err.response.data.detail : null
        }
      } finally {
        delete this.payableTermSaving[id]
      }
    },

    /**
     * DELETE `/budget/line-payable-term/{id}` (`{ deleted_id }`). Éxito:
     * SPLICE de la fila en el catálogo cacheado (sin refetch). OJO — NO
     * re-expande escenarios ya creados (BR-TERM-07; el copy del confirm lo
     * explicita, §3.2). 404 se propaga como en `updatePayableTerm`.
     * @param {number|string} id `id_line_payable_term`
     * @returns {Promise<{ ok: boolean, kind?: string, detail?: string|null }>}
     */
    async deletePayableTerm(id) {
      if (this.payableTermSaving[id]) return { ok: false, kind: 'busy' }
      this.payableTermSaving[id] = true
      try {
        await budgetRulesService.deletePayableTerm(id)
        const index = this.payableTerms.findIndex(
          (item) => item.id_line_payable_term === Number(id)
        )
        if (index !== -1) this.payableTerms.splice(index, 1)
        return { ok: true }
      } catch (err) {
        const classified = classifyRateError(err)
        this.handleAuth(classified)
        return {
          ok: false,
          ...classified,
          detail: typeof err?.response?.data?.detail === 'string' ? err.response.data.detail : null
        }
      } finally {
        delete this.payableTermSaving[id]
      }
    },

    /* ---------------------- Catálogos de internación (FE-S10) ---------------------- */

    /**
     * DÚO atómico de internación (FE-S10 §2.2): UN `Promise.all` sobre
     * `GET /budget/line-internment-rate/` + `GET /budget/line-internment-term/`
     * con UNA sola bandera de error — la derivación del split es
     * todo-o-nada (sin el % no se puede partir la base ⇒ D-FE10-3: si
     * cualquiera de los dos GETs falla, `loadError.internment = true` y el
     * panel/Flujo tratan el catálogo completo como NO disponible). Lazy como
     * `fetchPayableTerms`: ya cargado y `!force` ⇒ no-op (NFR-S5-FE-3
     * espejo: UN solo fetch por sesión; el panel filtra por Línea
     * client-side). `internmentCatalogsLoaded` se marca SOLO en éxito.
     * @param {boolean} [force=false] refetch forzado (Reintentar / 404 en PUT|DELETE)
     * @returns {Promise<{ ok: boolean, kind?: string }>}
     */
    async fetchInternmentCatalogs(force = false) {
      if (!force && this.internmentCatalogsLoaded) return { ok: true }

      this.loading.internment = true
      this.loadError.internment = null
      try {
        const [ratesResponse, termsResponse] = await Promise.all([
          budgetRulesService.fetchInternmentRates(),
          budgetRulesService.fetchInternmentTerms()
        ])
        this.internmentRates = Array.isArray(ratesResponse?.data) ? ratesResponse.data : []
        this.internmentTerms = Array.isArray(termsResponse?.data) ? termsResponse.data : []
        this.internmentCatalogsLoaded = true
        this.syncInternmentMirrorToPlanning()
        return { ok: true }
      } catch (err) {
        const classified = classifyRateError(err)
        // 'auth' no deja banner: el flujo de sesión redirige a Login (AC-03).
        if (classified.kind !== 'auth') {
          this.loadError.internment = true
        }
        this.handleAuth(classified)
        return { ok: false, ...classified }
      } finally {
        this.loading.internment = false
      }
    },

    /**
     * PUENTE AC-FE10-6 / NFR-FE10-2: tras cargar o mutar con éxito el catálogo
     * de internación, refresca la COPIA-espejo que el `budgetPlanningStore`
     * cachea en su `ensureCatalogs` (`internmentRates`/`internmentTerms`). La
     * Vista Flujo deriva `internmentRateByLine`/`internmentTermsByLine` de ESA
     * caché (§2.2 "state espejo"), y el CRUD del panel jamás dispara HTTP
     * extra: sin este puente, "crear/update/delete de rate y términos
     * recalcula en vivo el Flujo abierto" solo valdría para el orden
     * Reglas→Flujo de la sesión. No-op si la caché del planning NUNCA cargó
     * (su propio `ensureCatalogs` traerá la verdad del servidor) o si está
     * degradada por error (`internmentCatalogLoaded=false` ⇒ el fail-closed
     * D-FE10-3 del Flujo se respeta intacto). Snapshot copiado (no alias):
     * cada store sigue siendo DUEÑO de su array y los getters-computed
     * recalculan al cambiar la referencia (misma filosofía de "la caché es
     * LA fuente", cero refetch).
     * @returns {void}
     */
    syncInternmentMirrorToPlanning() {
      if (!this.internmentCatalogsLoaded) return
      const planning = useBudgetPlanningStore()
      if (!planning.internmentCatalogLoaded) return
      planning.internmentRates = [...this.internmentRates]
      planning.internmentTerms = [...this.internmentTerms]
    },

    /**
     * POST `{ id_line, internment_pct }` de la tasa de una Línea (el %→
     * fracción lo convierte SOLO el panel, FD5-3 espejo). Éxito 201: PUSH
     * del objeto devuelto en la caché (la caché es LA fuente, sin refetch —
     * patrón `createPayableTerm` l.311). El 400 amable `"Line {id} already
     * has an internment rate"` (BE-S9 §5.3) propaga `detail` para que el
     * panel lo muestre con el literal del backend (FE-S10 §2.1).
     * @param {{ id_line: number, internment_pct: number }} payload
     * @returns {Promise<{ ok: boolean, rate?: object|null, kind?: string, detail?: string|null }>}
     */
    async createInternmentRate(payload) {
      if (this.internmentRateSaving.new) return { ok: false, kind: 'busy' }
      this.internmentRateSaving.new = true
      try {
        const response = await budgetRulesService.createInternmentRate(payload)
        const rate = response?.data ?? null
        if (rate) this.internmentRates.push(rate)
        this.syncInternmentMirrorToPlanning()
        return { ok: true, rate }
      } catch (err) {
        const classified = classifyRateError(err)
        this.handleAuth(classified)
        return {
          ok: false,
          ...classified,
          detail: typeof err?.response?.data?.detail === 'string' ? err.response.data.detail : null
        }
      } finally {
        delete this.internmentRateSaving.new
      }
    },

    /**
     * PUT de REEMPLAZO TOTAL `/budget/line-internment-rate/{id}` (mismo body
     * que el POST; espejo del convenio payable-term). Éxito: el objeto
     * devuelto SUSTITUYE la fila en el sitio (splice por
     * `id_line_internment_rate`, patrón l.344). 404 `"LineInternmentRate
     * {id} not found"` ⇒ el panel toastea + refetch forzado del dúo.
     * @param {number|string} id `id_line_internment_rate`
     * @param {{ id_line: number, internment_pct: number }} payload
     * @returns {Promise<{ ok: boolean, rate?: object|null, kind?: string, detail?: string|null }>}
     */
    async updateInternmentRate(id, payload) {
      if (this.internmentRateSaving[id]) return { ok: false, kind: 'busy' }
      this.internmentRateSaving[id] = true
      try {
        const response = await budgetRulesService.updateInternmentRate(id, payload)
        const rate = response?.data ?? null
        if (rate) {
          const index = this.internmentRates.findIndex(
            (item) => item.id_line_internment_rate === Number(id)
          )
          if (index !== -1) this.internmentRates.splice(index, 1, rate)
          else this.internmentRates.push(rate)
        }
        this.syncInternmentMirrorToPlanning()
        return { ok: true, rate }
      } catch (err) {
        const classified = classifyRateError(err)
        this.handleAuth(classified)
        return {
          ok: false,
          ...classified,
          detail: typeof err?.response?.data?.detail === 'string' ? err.response.data.detail : null
        }
      } finally {
        delete this.internmentRateSaving[id]
      }
    },

    /**
     * DELETE `/budget/line-internment-rate/{id}` (`{ deleted_id }`). Éxito:
     * SPLICE de la fila (la Línea vuelve a "sin tasa" ⇒ % = 0 ⇒ el Flujo
     * degrada al 100 % proveedor, A-5/NFR-FE10-3). 404 se propaga como en
     * `updateInternmentRate`.
     * @param {number|string} id `id_line_internment_rate`
     * @returns {Promise<{ ok: boolean, kind?: string, detail?: string|null }>}
     */
    async deleteInternmentRate(id) {
      if (this.internmentRateSaving[id]) return { ok: false, kind: 'busy' }
      this.internmentRateSaving[id] = true
      try {
        await budgetRulesService.deleteInternmentRate(id)
        const index = this.internmentRates.findIndex(
          (item) => item.id_line_internment_rate === Number(id)
        )
        if (index !== -1) this.internmentRates.splice(index, 1)
        this.syncInternmentMirrorToPlanning()
        return { ok: true }
      } catch (err) {
        const classified = classifyRateError(err)
        this.handleAuth(classified)
        return {
          ok: false,
          ...classified,
          detail: typeof err?.response?.data?.detail === 'string' ? err.response.data.detail : null
        }
      } finally {
        delete this.internmentRateSaving[id]
      }
    },

    /**
     * POST `{ id_line, payment_pct, payment_days }` de un término de
     * internación. Éxito 201: PUSH in-place (patrón l.311). El panel puede
     * encadenar varios POSTs (p. ej. el "Patrón típico", D-FE10-4): el guard
     * `'new'` exige que sean SECUENCIALES (cada `await` libera el flag).
     * @param {{ id_line: number, payment_pct: number, payment_days: number }} payload
     * @returns {Promise<{ ok: boolean, term?: object|null, kind?: string, detail?: string|null }>}
     */
    async createInternmentTerm(payload) {
      if (this.internmentTermSaving.new) return { ok: false, kind: 'busy' }
      this.internmentTermSaving.new = true
      try {
        const response = await budgetRulesService.createInternmentTerm(payload)
        const term = response?.data ?? null
        if (term) this.internmentTerms.push(term)
        this.syncInternmentMirrorToPlanning()
        return { ok: true, term }
      } catch (err) {
        const classified = classifyRateError(err)
        this.handleAuth(classified)
        return {
          ok: false,
          ...classified,
          detail: typeof err?.response?.data?.detail === 'string' ? err.response.data.detail : null
        }
      } finally {
        delete this.internmentTermSaving.new
      }
    },

    /**
     * PUT de REEMPLAZO TOTAL `/budget/line-internment-term/{id}`. Éxito:
     * splice-replace en el sitio (patrón l.344). 404 `"LineInternmentTerm
     * {id} not found"` ⇒ toast + refetch forzado del dúo desde el panel.
     * @param {number|string} id `id_line_internment_term`
     * @param {{ id_line: number, payment_pct: number, payment_days: number }} payload
     * @returns {Promise<{ ok: boolean, term?: object|null, kind?: string, detail?: string|null }>}
     */
    async updateInternmentTerm(id, payload) {
      if (this.internmentTermSaving[id]) return { ok: false, kind: 'busy' }
      this.internmentTermSaving[id] = true
      try {
        const response = await budgetRulesService.updateInternmentTerm(id, payload)
        const term = response?.data ?? null
        if (term) {
          const index = this.internmentTerms.findIndex(
            (item) => item.id_line_internment_term === Number(id)
          )
          if (index !== -1) this.internmentTerms.splice(index, 1, term)
          else this.internmentTerms.push(term)
        }
        this.syncInternmentMirrorToPlanning()
        return { ok: true, term }
      } catch (err) {
        const classified = classifyRateError(err)
        this.handleAuth(classified)
        return {
          ok: false,
          ...classified,
          detail: typeof err?.response?.data?.detail === 'string' ? err.response.data.detail : null
        }
      } finally {
        delete this.internmentTermSaving[id]
      }
    },

    /**
     * DELETE `/budget/line-internment-term/{id}` (`{ deleted_id }`). Éxito:
     * SPLICE en el sitio (patrón l.377). OJO — sin términos la derivación
     * del Flujo degrada a la CUOTA ÚNICA 100 % del costo de internación en
     * la ancla (BR-INT-04, BE-S9 §5.2); ningún escenario se re-expandea aquí.
     * @param {number|string} id `id_line_internment_term`
     * @returns {Promise<{ ok: boolean, kind?: string, detail?: string|null }>}
     */
    async deleteInternmentTerm(id) {
      if (this.internmentTermSaving[id]) return { ok: false, kind: 'busy' }
      this.internmentTermSaving[id] = true
      try {
        await budgetRulesService.deleteInternmentTerm(id)
        const index = this.internmentTerms.findIndex(
          (item) => item.id_line_internment_term === Number(id)
        )
        if (index !== -1) this.internmentTerms.splice(index, 1)
        this.syncInternmentMirrorToPlanning()
        return { ok: true }
      } catch (err) {
        const classified = classifyRateError(err)
        this.handleAuth(classified)
        return {
          ok: false,
          ...classified,
          detail: typeof err?.response?.data?.detail === 'string' ? err.response.data.detail : null
        }
      } finally {
        delete this.internmentTermSaving[id]
      }
    },

    /* ------------------- Calendario de liquidación IVA (FE-S14) ------------------- */

    /**
     * PUENTE AC-FE14-6: tras Crear/Editar/Borrar un período del calendario,
     * la recurrencia de la liquidación (y el bloque "Pago de liquidación de
     * IVA" del Flujo, D-FE14-4) cambió. Si el `budgetPlanningStore` tiene un
     * escenario abierto y su liquidación YA fue leída (cargada o en estado de
     * error), se programa el refetch debounced del store —nunca un request
     * síncrono extra desde este store—. Si jamás se cargó, la deja perezosa:
     * el tab Liquidación la traerá fresca al abrirse.
     * @returns {void}
     */
    notifyIvaCalendarChanged() {
      const planning = useBudgetPlanningStore()
      if (!planning.currentScenario) return
      if (!planning.settlement.loaded && !planning.settlement.error) return
      planning.settlement.loaded = false
      planning.scheduleSettlementRefresh()
    },

    /**
     * Períodos de liquidación IVA de un año (GET `/budget/iva-period/?year=`,
     * backend.02_20 §5.8; plano, orden `period_year, period_no`). Lazy con
     * clave de año: mismo `year` ya cargado y `!force` ⇒ no-op; otro año ⇒
     * refetch (la caché solo vale para `ivaPeriodsYear`, patrón
     * `fetchPayableTerms`/A15). `ivaPeriodsLoaded` se marca SOLO en éxito.
     * @param {number|string} year año fiscal 2000–2100
     * @param {boolean} [force=false] refetch forzado (Reintentar / 404 en PUT|DELETE)
     * @returns {Promise<{ ok: boolean, kind?: string }>}
     */
    async fetchIvaPeriods(year, force = false) {
      const target = Number(year)
      if (!Number.isInteger(target)) return { ok: false, kind: 'unknown' }
      if (!force && this.ivaPeriodsLoaded && this.ivaPeriodsYear === target) return { ok: true }

      this.loading.ivaPeriods = true
      this.loadError.ivaPeriods = null
      try {
        const response = await budgetRulesService.fetchIvaPeriods(target)
        this.ivaPeriods = Array.isArray(response?.data) ? response.data : []
        this.ivaPeriodsYear = target
        this.ivaPeriodsLoaded = true
        return { ok: true }
      } catch (err) {
        const classified = classifyRateError(err)
        // 'auth' no deja banner: el flujo de sesión redirige a Login (AC-03).
        if (classified.kind !== 'auth') {
          this.loadError.ivaPeriods = true
        }
        this.handleAuth(classified)
        return { ok: false, ...classified }
      } finally {
        this.loading.ivaPeriods = false
      }
    },

    /**
     * POST `{ period_year, period_no, date_from, date_to, payment_due_date,
     * description? }` (snake_case exacto backend.02_20 §5.2; fechas ISO
     * crudas). Éxito 201: PUSH del objeto devuelto en la caché (la caché es
     * LA fuente — patrón `createInternmentTerm`, cero refetch) + puente
     * AC-FE14-6. El 400 amable `"Period {n} already exists for year {y}"`
     * (§5.8) propaga `detail` para pintarse LITERAL inline (FE-S10 §2.1
     * heredado); 422 de esquema (rango inválido, num fuera de 1–36) llega
     * como `kind:'validation'`. El "generar bimestres" encadena POSTs con
     * este action en secuencia (el guard `'new'` exige no solaparlos).
     * @param {object} payload
     * @returns {Promise<{ ok: boolean, period?: object|null, kind?: string, detail?: string|null }>}
     */
    async createIvaPeriod(payload) {
      if (this.ivaPeriodSaving.new) return { ok: false, kind: 'busy' }
      this.ivaPeriodSaving.new = true
      try {
        const response = await budgetRulesService.createIvaPeriod(payload)
        const period = response?.data ?? null
        if (period) this.ivaPeriods.push(period)
        this.notifyIvaCalendarChanged()
        return { ok: true, period }
      } catch (err) {
        const classified = classifyRateError(err)
        this.handleAuth(classified)
        return {
          ok: false,
          ...classified,
          detail: typeof err?.response?.data?.detail === 'string' ? err.response.data.detail : null
        }
      } finally {
        delete this.ivaPeriodSaving.new
      }
    },

    /**
     * PUT de REEMPLAZO TOTAL `/budget/iva-period/{id}` (mismo body que el
     * POST; espejo del convenio internment/payable — el BE no acepta parcial
     * aquí). Éxito: el objeto devuelto SUSTITUYE la fila en el sitio (splice
     * por `id_iva_period`). 404 `"IvaPeriod {id} not found"` ⇒ el panel
     * toastea + `fetchIvaPeriods(year, true)`; 400 duplicado en re-parent con
     * `detail` literal propagado.
     * @param {number|string} id `id_iva_period`
     * @param {object} payload
     * @returns {Promise<{ ok: boolean, period?: object|null, kind?: string, detail?: string|null }>}
     */
    async updateIvaPeriod(id, payload) {
      if (this.ivaPeriodSaving[id]) return { ok: false, kind: 'busy' }
      this.ivaPeriodSaving[id] = true
      try {
        const response = await budgetRulesService.updateIvaPeriod(id, payload)
        const period = response?.data ?? null
        if (period) {
          const index = this.ivaPeriods.findIndex((item) => item.id_iva_period === Number(id))
          if (index !== -1) this.ivaPeriods.splice(index, 1, period)
          else this.ivaPeriods.push(period)
        }
        this.notifyIvaCalendarChanged()
        return { ok: true, period }
      } catch (err) {
        const classified = classifyRateError(err)
        this.handleAuth(classified)
        return {
          ok: false,
          ...classified,
          detail: typeof err?.response?.data?.detail === 'string' ? err.response.data.detail : null
        }
      } finally {
        delete this.ivaPeriodSaving[id]
      }
    },

    /**
     * DELETE `/budget/iva-period/{id}` (`{ deleted_id }`, borrado físico —
     * catálogo sin historial, §5.3). Éxito: SPLICE de la fila + puente
     * AC-FE14-6 (borrados los últimos del año, la liquidación vuelve al
     * estado "sin calendario" con su warning: el BE degrada a 200 +
     * `meta.warnings`, nunca 500). 404 se propaga como en `updateIvaPeriod`.
     * @param {number|string} id `id_iva_period`
     * @returns {Promise<{ ok: boolean, kind?: string, detail?: string|null }>}
     */
    async deleteIvaPeriod(id) {
      if (this.ivaPeriodSaving[id]) return { ok: false, kind: 'busy' }
      this.ivaPeriodSaving[id] = true
      try {
        await budgetRulesService.deleteIvaPeriod(id)
        const index = this.ivaPeriods.findIndex((item) => item.id_iva_period === Number(id))
        if (index !== -1) this.ivaPeriods.splice(index, 1)
        this.notifyIvaCalendarChanged()
        return { ok: true }
      } catch (err) {
        const classified = classifyRateError(err)
        this.handleAuth(classified)
        return {
          ok: false,
          ...classified,
          detail: typeof err?.response?.data?.detail === 'string' ? err.response.data.detail : null
        }
      } finally {
        delete this.ivaPeriodSaving[id]
      }
    }
  }
})
