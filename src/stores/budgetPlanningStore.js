import { defineStore } from 'pinia'
import { budgetPlanningService } from '@/services/budgetPlanningService.js'
import { budgetRulesService } from '@/services/budgetRulesService.js'
import { costCenterService } from '@/services/costCenterService.js'
import { collectionService } from '@/services/collectionService.js'
import { useUserStore } from '@/stores/userStore.js'
import { alertService } from '@/services/alertService.js'
import router from '@/router/index.js'

/**
 * Estado del Módulo de Planeación y Escenarios (FE-S4-BUDGET-PLANNING §4).
 *
 * Dueño exclusivo de la caché (las vistas/tablas SOLO leen de aquí, patrón
 * `budgetRulesStore`):
 *  - `scenarios`: lista del dashboard (`null` = nunca cargada; `[]` = vacía).
 *    El orden es el del backend (§6.1: no re-ordenar en cliente). `scenariosStale`
 *    invalida la caché tras editar una celda para que el dashboard no muestre
 *    Σ rancios.
 *  - `currentScenario`: detalle (`BudgetFull` + `parent_budget_name`) con sus
 *    `budget_lines`: ÚNICA fuente del pivote Ene–Dic y del editor de celdas
 *    (ambos derivados client-side, ASM-10; jamás dos fuentes divergentes).
 *  - Catálogos CECO/temporadas cacheados una vez por sesión (patrón A5) para
 *    resolver `id_cost_center`/`id_collection` en etiquetas legibles. Las
 *    tasas de costo activas (`lineCostRates`, FE-S4C §3.2) comparten el mismo
 *    ciclo de vida en `ensureCatalogs()` para la estimación de la Ejecutiva.
 *
 * Flags anti-doble-submit (NFR-F4/AC-FE-8): `uploading`, `cloning`,
 * `settingTarget` (expuestos como `isSubmitting`) y `cellSaving` por
 * `id_budget_line`. Un segundo disparo MIENTRAS hay operación en vuelo es
 * no-op (jamás genera request paralelo).
 */

const GENERIC_UNEXPECTED_MESSAGE =
  'La solicitud fue rechazada por un motivo no clasificado. Reintenta o contacta soporte.'

const GENERIC_VALIDATION_MESSAGE =
  'El servidor rechazó los datos enviados por validación de esquema. Revisa los valores e inténtalo de nuevo.'

/**
 * Humaniza el `detail` de un 422 FastAPI (array `{loc, msg, type}`) a una
 * cadena corta para render inline (§9: "422 → Inline en el campo ofensor").
 * @param {unknown} detail
 * @returns {string}
 */
function humanizeValidationDetail(detail) {
  if (Array.isArray(detail) && detail.length > 0) {
    const messages = detail
      .map((item) =>
        typeof item?.msg === 'string' ? item.msg.replace(/^value\.?/i, '').trim() : ''
      )
      .filter(Boolean)
    if (messages.length) return messages.join(' · ')
  }
  if (typeof detail === 'string' && detail) return detail
  return GENERIC_VALIDATION_MESSAGE
}

/**
 * Normaliza un error de Axios a los "kinds" del mapeo §9 de FE-S4
 * (autoridad: `backend.02_12` §5.1–§5.7). Los cuerpos verificados:
 *
 *   !response                              → 'network'   (toast + estado revertido)
 *   401                                    → 'auth'      (limpia sesión → Login)
 *   403                                    → 'forbidden' (toast + refresco de roles)
 *   404                                    → 'notfound'  (editor: toast + replace dashboard)
 *   422                                    → 'validation' + message humano (inline)
 *   400 detail {missing_cost_centers:[..]} → 'missing_cost_centers'
 *   400 detail {found_years:[..]}          → 'year_mismatch'
 *   400 "…already exists…"                 → 'duplicate_name' (inline bajo Nombre)
 *   5xx                                    → 'server'
 *   resto                                  → 'string_detail' | fallback genérico
 *
 * @param {import('axios').AxiosError} err
 * @returns {{ kind: string, [key: string]: any }}
 */
export function classifyPlanningError(err) {
  const response = err?.response

  if (!response) {
    return { kind: 'network' }
  }

  const status = response.status
  const detail = response.data?.detail

  if (status === 401) {
    return { kind: 'auth', status }
  }

  if (status === 403) {
    return { kind: 'forbidden', status }
  }

  if (status === 404) {
    return { kind: 'notfound', status }
  }

  if (status === 422) {
    return { kind: 'validation', status, message: humanizeValidationDetail(detail) }
  }

  if (status >= 500) {
    return { kind: 'server', status, detail: detail ?? response.data ?? null }
  }

  if (status === 400) {
    if (detail && typeof detail === 'object') {
      if (Array.isArray(detail.missing_cost_centers)) {
        return {
          kind: 'missing_cost_centers',
          message: typeof detail.message === 'string' ? detail.message : '',
          missing_cost_centers: detail.missing_cost_centers
        }
      }
      if (Array.isArray(detail.found_years)) {
        return {
          kind: 'year_mismatch',
          message: typeof detail.message === 'string' ? detail.message : '',
          found_years: detail.found_years
        }
      }
      if (typeof detail.message === 'string') {
        if (/already exists/i.test(detail.message)) {
          return { kind: 'duplicate_name', message: detail.message }
        }
        return { kind: 'string_detail', message: detail.message }
      }
    }
    if (typeof detail === 'string') {
      if (/already exists/i.test(detail)) {
        return { kind: 'duplicate_name', message: detail }
      }
      return { kind: 'string_detail', message: detail }
    }
  }

  return { kind: 'string_detail', message: GENERIC_UNEXPECTED_MESSAGE }
}

export const useBudgetPlanningStore = defineStore('budgetPlanningStore', {
  state: () => ({
    /** @type {Array<object>|null} listado del dashboard; null = nunca cargada */
    scenarios: null,
    /** clave del filtro con el que se cargó la caché ('all' | String(year)) */
    scenariosYear: 'all',
    /** true tras una edición de celda: obliga al próximo fetch a refrescar */
    scenariosStale: false,
    scenariosLoading: false,
    scenariosError: false,

    /** @type {object|null} `BudgetFull` + `parent_budget_name` del editor */
    currentScenario: null,
    currentScenarioId: null,
    detailLoading: false,

    /** @type {Array<object>} catálogo CECO (id → code/name/id_line), cache A5 */
    costCenters: [],
    costCentersLoaded: false,
    /** @type {Array<object>} catálogo temporadas (id → short_collection_name) */
    collections: [],
    collectionsLoaded: false,
    /**
     * @type {Array<object>} catálogo maestro "Costos por Línea" de Reglas
     * Financieras (`line_cost_rates`), cache A5/FE-S4C §3.2: se almacenan
     * SOLO las `is_active === true`. La resolución mensual por línea/global
     * es cálculo de presentación y vive en `ExecutivePivotTable` (D-2/D-3).
     */
    lineCostRates: [],
    lineCostRatesLoaded: false,
    lineCostRatesError: false,

    /** Flags anti-doble-submit (NFR-F4/AC-FE-8). */
    uploading: false,
    cloning: false,
    settingTarget: false,
    /** @type {Record<number|string, boolean>} PUTs de celda en vuelo */
    cellSaving: {}
  }),

  getters: {
    /** `isSubmitting` (§6.3): bloquea acciones del dashboard mientras hay operación en vuelo. */
    isSubmitting: (state) => state.uploading || state.cloning || state.settingTarget,

    /**
     * Etiqueta legible de un CECO resolviendo contra el catálogo cacheado
     * (el schema `BudgetLine` NO trae el objeto cost_center). Desconocido o
     * catálogo caído → fallback `CECO #<id>` (patrón `lineNameById`).
     * @returns {(id: number|null) => string}
     */
    costCenterLabel: (state) => (id) => {
      if (id === null || id === undefined) return '—'
      const cc = state.costCenters.find((item) => item.id_cost_center === id)
      return cc ? `${cc.cost_center_code} — ${cc.cost_center_name}` : `CECO #${id}`
    },

    /**
     * Nombre corto de la temporada (`collection`) de una línea.
     * @returns {(id: number|null) => string}
     */
    collectionLabel: (state) => (id) => {
      if (id === null || id === undefined) return '—'
      const found = state.collections.find((item) => item.id_collection === id)
      return found?.short_collection_name ?? `Temporada #${id}`
    },

    /**
     * Meta Activa del año según la caché del listado (chips 🎯 = dato, no
     * cálculo — NFR-F3). `exceptId` excluye al propio escenario consultado.
     * @returns {(year: number, exceptId?: number|null) => object|null}
     */
    findActiveForYear:
      (state) =>
      (year, exceptId = null) => {
        if (!Array.isArray(state.scenarios)) return null
        return (
          state.scenarios.find(
            (row) =>
              row.budget_year === year && row.status === 'active' && row.id_budget !== exceptId
          ) ?? null
        )
      }
  },

  actions: {
    /**
     * Equivalente localizado del "interceptor global" de sesión (desviación
     * documentada compartida con `budgetUploadStore`/`budgetRulesStore`: el
     * repo solo tiene interceptor de petición en `plugins/axios.js`).
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
     * 403 (§9): refresco de roles SILENCIOSO "por si cambió el rol". Si el
     * 403 era un token expirado, `getUserDetails` fallará y se cierra la
     * sesión con redirección a Login (no queda un usuario deslogueado falso).
     */
    async refreshRolesSilently() {
      const userStore = useUserStore()
      try {
        await userStore.getUserDetails()
      } catch {
        userStore.logout()
        if (router.currentRoute.value.name !== 'Login') {
          router.push({ name: 'Login' })
        }
      }
    },

    /**
     * Listado del dashboard. Caché: mismo `year` y ya cargada y no `stale` ⇒
     * no-op (el refresco manual pasa `force: true`). NUNCA re-ordena (§6.1).
     * @param {{ year?: number|string|'all', force?: boolean }} [options]
     * @returns {Promise<{ ok: boolean, kind?: string }>}
     */
    async fetchScenarios({ year = 'all', force = false } = {}) {
      const key = year === null || year === undefined || year === '' ? 'all' : String(year)
      if (!force && this.scenarios !== null && this.scenariosYear === key && !this.scenariosStale) {
        return { ok: true }
      }
      this.scenariosLoading = true
      this.scenariosError = false
      try {
        const response = await budgetPlanningService.fetchScenarios(
          key === 'all' ? null : Number(key)
        )
        this.scenarios = Array.isArray(response?.data) ? response.data : []
        this.scenariosYear = key
        this.scenariosStale = false
        return { ok: true }
      } catch (err) {
        const classified = classifyPlanningError(err)
        if (classified.kind !== 'auth') this.scenariosError = true
        this.handleAuth(classified)
        return { ok: false, ...classified }
      } finally {
        this.scenariosLoading = false
      }
    },

    /**
     * Catálogos CECO + temporadas + tasas de costo cacheados una vez por
     * sesión (A5; FE-S4C §3.2 para las tasas). El fallo es SIEMPRE
     * silencioso: las etiquetas degradan a `CECO #<id>`, la vista sigue
     * funcionando y `lineCostRatesError` permite diferenciar la degradación
     * visual en la Vista Ejecutiva (§5.2) — jamás toast ni bloqueo (D-4).
     * @returns {Promise<void>}
     */
    async ensureCatalogs() {
      const jobs = []
      if (!this.costCentersLoaded) {
        jobs.push(
          costCenterService
            .getCostCenters()
            .then((response) => {
              this.costCenters = Array.isArray(response?.data) ? response.data : []
              this.costCentersLoaded = true
            })
            .catch(() => {
              /* silencioso: fallback de etiquetas */
            })
        )
      }
      if (!this.collectionsLoaded) {
        jobs.push(
          collectionService
            .getCollections()
            .then((response) => {
              this.collections = Array.isArray(response?.data) ? response.data : []
              this.collectionsLoaded = true
            })
            .catch(() => {
              /* silencioso: fallback de etiquetas */
            })
        )
      }
      if (!this.lineCostRatesLoaded) {
        jobs.push(
          budgetRulesService
            .fetchRates('cost')
            .then((response) => {
              this.lineCostRates = (Array.isArray(response?.data) ? response.data : []).filter(
                (rate) => rate.is_active === true
              )
              this.lineCostRatesLoaded = true
            })
            .catch(() => {
              /* silencioso: degradación visual en Vista Ejecutiva (FE-S4C §5.2) */
              this.lineCostRatesError = true
            })
        )
      }
      await Promise.all(jobs)
    },

    /**
     * Detalle para el editor. Misma `id` ya cacheada y `!force` ⇒ no-op.
     * Carga además los catálogos (una sola pasada, A5/§8.2).
     * @param {number} idBudget
     * @param {boolean} [force=false]
     * @returns {Promise<{ ok: boolean, kind?: string }>}
     */
    async fetchScenarioDetail(idBudget, force = false) {
      if (!force && this.currentScenarioId === idBudget && this.currentScenario) {
        return { ok: true }
      }
      this.detailLoading = true
      try {
        const [response] = await Promise.all([
          budgetPlanningService.fetchScenarioDetail(idBudget),
          this.ensureCatalogs()
        ])
        const data = response?.data ?? null
        this.currentScenario = data && typeof data === 'object' ? data : null
        this.currentScenarioId = this.currentScenario ? idBudget : null
        if (!this.currentScenario) return { ok: false, kind: 'notfound' }
        return { ok: true }
      } catch (err) {
        this.currentScenario = null
        this.currentScenarioId = null
        const classified = classifyPlanningError(err)
        this.handleAuth(classified)
        return { ok: false, ...classified }
      } finally {
        this.detailLoading = false
      }
    },

    /**
     * POST multipart de creación del Base (dos SIIGO, ASM-10). Guarda la
     * respuesta 201 en `data` para el toast del modal (§7).
     * @param {Parameters<budgetPlanningService['uploadScenario']>[0]} fields
     * @returns {Promise<{ ok: boolean, data?: object|null, kind?: string }>}
     */
    async uploadScenario(fields) {
      // Guard de reentrada: spam de clics ⇒ UN solo request (AC-FE-8).
      if (this.uploading) return { ok: false, kind: 'busy' }
      this.uploading = true
      try {
        const response = await budgetPlanningService.uploadScenario(fields)
        this.scenariosStale = true
        return { ok: true, data: response?.data ?? null }
      } catch (err) {
        const classified = classifyPlanningError(err)
        this.handleAuth(classified)
        if (classified.kind === 'forbidden') {
          alertService.generalError('No tiene permiso para realizar esta operación.')
          await this.refreshRolesSilently()
        }
        return { ok: false, ...classified }
      } finally {
        this.uploading = false
      }
    },

    /**
     * POST clon con `modifier_pct` (preview ≈ lo que mostrará el backend).
     * Éxito: stale del listado para que el dashboard muestre la fila nueva.
     * @param {{ idBudget: number, nuevoNombre: string, modifierPct?: number }} payload
     * @returns {Promise<{ ok: boolean, data?: object|null, kind?: string }>}
     */
    async cloneScenario({ idBudget, nuevoNombre, modifierPct = 0 }) {
      if (this.cloning) return { ok: false, kind: 'busy' }
      this.cloning = true
      try {
        const response = await budgetPlanningService.cloneScenario({
          idBudget,
          nuevoNombre,
          modifierPct
        })
        this.scenariosStale = true
        return { ok: true, data: response?.data ?? null }
      } catch (err) {
        const classified = classifyPlanningError(err)
        this.handleAuth(classified)
        if (classified.kind === 'forbidden') {
          alertService.generalError('No tiene permiso para realizar esta operación.')
          await this.refreshRolesSilently()
        }
        return { ok: false, ...classified }
      } finally {
        this.cloning = false
      }
    },

    /**
     * Aplica el efecto BR-TGT-01 a las cachés SIN refresco manual (AC-FE-5):
     * el nuevo pasa a `active`; otro activo del mismo año a `closed`; el
     * detalle abierto en el editor refleja el chip al instante.
     * @param {number} idBudget
     * @param {number} budgetYear
     */
    applySetTargetToCaches(idBudget, budgetYear) {
      if (Array.isArray(this.scenarios)) {
        this.scenarios = this.scenarios.map((row) => {
          if (row.id_budget === idBudget) return { ...row, status: 'active' }
          if (row.budget_year === budgetYear && row.status === 'active') {
            return { ...row, status: 'closed' }
          }
          return row
        })
      }
      if (this.currentScenario?.id_budget === idBudget) {
        this.currentScenario = { ...this.currentScenario, status: 'active' }
      }
    },

    /**
     * PUT set-target. 403 → toast literal §9 + refresco de roles (el backend
     * es la autoridad; la UI solo oculta el botón por rol).
     * @param {number} idBudget
     * @returns {Promise<{ ok: boolean, data?: {demoted_budget_id: number|null}|null, kind?: string }>}
     */
    async setTarget(idBudget) {
      if (this.settingTarget) return { ok: false, kind: 'busy' }
      this.settingTarget = true
      try {
        const response = await budgetPlanningService.setTarget(idBudget)
        const data = response?.data ?? {}
        this.applySetTargetToCaches(idBudget, data.budget_year)
        return { ok: true, data }
      } catch (err) {
        const classified = classifyPlanningError(err)
        this.handleAuth(classified)
        if (classified.kind === 'forbidden') {
          alertService.generalError('No tiene permiso para designar la meta activa')
          await this.refreshRolesSilently()
        }
        return { ok: false, ...classified }
      } finally {
        this.settingTarget = false
      }
    },

    /**
     * PUT puntual de UNA celda (§8.2). Guard por `id_budget_line`: segundo
     * disparo en vuelo = no-op (NFR-F2/AC-FE-8). Éxito: reemplaza la línea
     * en la caché del detalle (respuesta = `BudgetLine` completa) → el grid y
     * la Vista Ejecutiva se recalculan desde aquí y NUNCA quedan stale; marca
     * el listado como `stale` (los Σ agregados del dashboard cambian).
     * @param {number|string} idBudgetLine
     * @param {number} projectedAmount finito >= 0, ya validado en cliente
     * @returns {Promise<{ ok: boolean, data?: object|null, kind?: string, message?: string }>}
     */
    async updateCell(idBudgetLine, projectedAmount) {
      if (this.cellSaving[idBudgetLine]) return { ok: false, kind: 'busy' }
      this.cellSaving[idBudgetLine] = true
      try {
        const response = await budgetPlanningService.updateCell(idBudgetLine, projectedAmount)
        const line = response?.data ?? null
        if (
          line &&
          this.currentScenario &&
          line.id_budget === this.currentScenario.id_budget &&
          Array.isArray(this.currentScenario.budget_lines)
        ) {
          this.currentScenario.budget_lines = this.currentScenario.budget_lines.map((item) =>
            item.id_budget_line === line.id_budget_line ? line : item
          )
        }
        this.scenariosStale = true
        return { ok: true, data: line }
      } catch (err) {
        const classified = classifyPlanningError(err)
        this.handleAuth(classified)
        if (classified.kind === 'forbidden') {
          alertService.generalError('No tiene permiso para realizar esta operación.')
          await this.refreshRolesSilently()
        }
        return { ok: false, ...classified }
      } finally {
        delete this.cellSaving[idBudgetLine]
      }
    }
  }
})
