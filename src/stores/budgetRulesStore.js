import { defineStore } from 'pinia'
import { budgetRulesService } from '@/services/budgetRulesService.js'
import { RATE_KINDS } from '@/components/budget/rates/ratesConfig.js'
import { useUserStore } from '@/stores/userStore.js'
import router from '@/router/index.js'

/**
 * Estado de Gestión de Reglas Financieras (FE-S3-RULES, spec §6, A13/A15).
 *
 * Dueño exclusivo de la caché de datos (las vistas/tabla SOLO leen de aquí):
 *  - `lines`: catálogo de líneas cacheado una vez por sesión SPA (A5).
 *  - `rates[kind]`: `null` = NUNCA cargada | `[]` = cargada vacía (A15);
 *    el cambio de tab y los filtros jamás disparan refetch.
 * Tras cada mutación exitosa (POST/PUT) se hace refetch del `kind` afectado:
 * la fuente de verdad es el servidor; se ignoran respuestas optimistas.
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
    loading: { lines: false, cost: false, commission: false },
    /** true ⇒ banner rojo con botón "Reintentar" (A11); null = sin error. */
    loadError: { cost: null, commission: null },
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
    }
  }
})
