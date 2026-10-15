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
 *    tasas de costo activas (`lineCostRates`, FE-S4C §3.2), los términos de
 *    pago al proveedor del costo (`payableTerms`, FE-S7 §3) y el dúo de
 *    internación (`internmentRates`/`internmentTerms`, FE-S10 §2.2) comparten
 *    el mismo ciclo de vida en `ensureCatalogs()` para la estimación de la
 *    Ejecutiva y la derivación "Pago a proveedores" + split "Pago de
 *    internación" de la Vista Flujo.
 *
 * Flags anti-doble-submit (NFR-F4/AC-FE-8): `uploading`, `cloning`,
 * `settingTarget`, `deleting` (expuestos como `isSubmitting`), `cellSaving`
 * por `id_budget_line` y `lineSaving` por `id_budget_line` o
 * `'new'+sectionKey` (FE-S4D §4). Un segundo disparo MIENTRAS hay operación
 * en vuelo es no-op (jamás genera request paralelo).
 *
 * FE-S14-IVA (frontend.03_14 §5) añade:
 *  - `ivaMode` + `ivaModeBudgetId`: interruptor de presentación "Neto / Con
 *    IVA" PERSISTIDO por `idBudget` en localStorage (D-FE14-1, default ON).
 *    ENMIENDA D-FE14-7 (2026-09-23): el modo SOLO altera la Vista Flujo — la
 *    cabecera y la Vista Ejecutiva (P&G) se calculan SIEMPRE sobre netos.
 *  - `settlement`: caché del `IvaSettlementResult` del BE (D-FE14-4: único
 *    dato IVA server-side) con fetch lazy + invalidación debounced (~400 ms)
 *    tras toda mutación de líneas y todo cambio de calendario IVA puente desde
 *    `budgetRulesStore` (AC-FE14-2/6).
 *  - La fórmula del gross-up vive en `planningFormat.js`
 *    (`IVA_RATE`/`withIva`/`ivaOf`, D-FE14-6: cero hardcodes sueltos) y solo
 *    la consumen `CashFlowPivotTable` (Flujo) y `BudgetLineGrid` (columnas
 *    informativas del editor).
 */

const GENERIC_UNEXPECTED_MESSAGE =
  'La solicitud fue rechazada por un motivo no clasificado. Reintenta o contacta soporte.'

const GENERIC_VALIDATION_MESSAGE =
  'El servidor rechazó los datos enviados por validación de esquema. Revisa los valores e inténtalo de nuevo.'

/** Mensaje §6 (FE-S4D) para 404 de línea en update/delete tras resync de la vista. */
const LINE_GONE_MESSAGE = 'La línea ya no existe (¿carga nueva?). La vista se actualizó.'

/* ─────────── FE-S14-IVA: persistencia del modo + debounce del settlement ─────────── */

/**
 * Prefijo de la clave de `localStorage` del modo "Neto / Con IVA" POR
 * ESCENARIO (D-FE14-1 / frontend.03_14 §5 `BudgetGridEditor`: persistente por
 * `idBudget`; default ON = "mundo real" cuando no hay preferencia guardada).
 */
const IVA_MODE_STORAGE_PREFIX = 'budgetPlanning.ivaMode.'

/**
 * Lee la preferencia de modo para un escenario. Cero guardados / valor no
 * binario / `localStorage` inaccesible (modo privado) ⇒ `true` (D-FE14-1:
 * el default es Con IVA activo).
 * @param {number|string} idBudget
 * @returns {boolean}
 */
function readIvaModePreference(idBudget) {
  try {
    const raw = localStorage.getItem(`${IVA_MODE_STORAGE_PREFIX}${idBudget}`)
    if (raw === '0' || raw === 'false') return false
    if (raw === '1' || raw === 'true') return true
  } catch {
    /* localStorage bloqueado: degradar al default sin romper la vista */
  }
  return true
}

/**
 * Escribe la preferencia (mejor-effort: jamás rompe el toggle si el
 * almacenamiento está indisponible — la sesión sigue en memoria).
 * @param {number|string} idBudget
 * @param {boolean} value
 */
function writeIvaModePreference(idBudget, value) {
  try {
    localStorage.setItem(`${IVA_MODE_STORAGE_PREFIX}${idBudget}`, value ? '1' : '0')
  } catch {
    /* ignorar: persistencia opcional */
  }
}

/**
 * Debounce del refetch de liquidación tras mutaciones de líneas
 * (frontend.03_14 §4.2 / AC-FE14-2: ≤ 1 request nuevo, ~400 ms, "same
 * pattern del refresh de carryover"). Timer a nivel de módulo: no forma
 * parte del estado reactivo ni se serializa.
 */
const SETTLEMENT_DEBOUNCE_MS = 400
let settlementRefreshTimer = null

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
 * Campos ofensores de un 422 FastAPI (`loc: ['body', '<campo>', …]`): último
 * segmento (string) distinto de 'body' de cada error, deduplicado. El modal
 * de líneas lo usa para marcar en rojo el campo correspondiente (§6 FE-S4D:
 * "422 → + campo offending"). Detalle desconocido/otro formato → [].
 * @param {unknown} detail
 * @returns {string[]}
 */
function extractValidationFields(detail) {
  if (!Array.isArray(detail)) return []
  const fields = new Set()
  for (const item of detail) {
    const loc = Array.isArray(item?.loc) ? item.loc : []
    const last = loc.filter((segment) => typeof segment === 'string' && segment !== 'body').pop()
    if (last) fields.add(last)
  }
  return [...fields]
}

/**
 * Discrimina el 404 "de línea" (BE-S4D §3.4 `"BudgetLine {id} not found"` ⇒
 * la vista se resincroniza, §4) del 404 "de FK/presupuesto" (`"Cost center …"`
 * / `"Collection …"` / `"Budget …"` ⇒ error inline en los selects, §6). Los
 * detalles literales están verificados en `crud/budget/planning.py`.
 * @param {unknown} detail
 * @returns {boolean}
 */
function isLineNotFoundDetail(detail) {
  return typeof detail === 'string' && /budgetline/i.test(detail)
}

/**
 * Normaliza un error de Axios a los "kinds" del mapeo §9 de FE-S4
 * (autoridad: `backend.02_12` §5.1–§5.7), extendido por FE-S4D §6 para el
 * CRUD de líneas. Los cuerpos verificados:
 *
 *   !response                              → 'network'   (toast + estado revertido)
 *   401                                    → 'auth'      (limpia sesión → Login)
 *   403                                    → 'forbidden' (toast + refresco de roles)
 *   404                                    → 'notfound' + `detail` string (el
 *                                            consumidor distingue línea vs FK
 *                                            con `isLineNotFoundDetail`, §6)
 *   422                                    → 'validation' + message humano +
 *                                            `fields` ofensoros (inline)
 *   400 detail {missing_cost_centers:[..]} → 'missing_cost_centers'
 *   400 detail {found_years:[..]}          → 'year_mismatch'
 *   400 "…already exists…"                 → 'duplicate_name' (inline bajo Nombre)
 *   400 resto (reglas de negocio, p. ej.
 *       BR-LINE-04 año / BR-LINE-07 monto↔tasa)
 *                                          → 'conflict' + `message` (FE-S4D §6)
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
    return { kind: 'notfound', status, detail: typeof detail === 'string' ? detail : null }
  }

  if (status === 422) {
    return {
      kind: 'validation',
      status,
      message: humanizeValidationDetail(detail),
      fields: extractValidationFields(detail)
    }
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
        // FE-S4D §6: cualquier otro 400 es conflicto de regla de negocio
        // (BR-LINE-04/07); conserva `message` para el mapeo inline del modal.
        return { kind: 'conflict', message: detail.message }
      }
      // BE-S8 §5.1 (guards purchase): 400 con detalle {reason: "<literal>"} —
      // shape dict SIN `message`: se tolera explícitamente clasificándolo como
      // el mismo 'conflict' (el modal lo muestra inline; jamás revienta por
      // un `detail` de forma inesperada).
      if (typeof detail.reason === 'string') {
        return { kind: 'conflict', message: detail.reason }
      }
    }
    if (typeof detail === 'string') {
      if (/already exists/i.test(detail)) {
        return { kind: 'duplicate_name', message: detail }
      }
      return { kind: 'conflict', message: detail }
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

    /**
     * Arrastre de saldos N−1 (FE-S6-CARRYOVER §4). Espejo de la respuesta
     * `PlanningCarryoverResult` (BE-S6 §5.1) + flags de sesión. `enabled` es
     * LA fuente de verdad del pill: optimista en `setCarryoverFlag` (con
     * rollback) y resincronizada desde `include_carryover` en cada
     * `fetchScenarioDetail`. El GET es LAZY (solo lo dispara la vista con el
     * tab Flujo activo) y su fallo es SILENCIOSO (§7: el Flujo degrada con
     * aviso, nunca toast). `saving` es el guard anti-spam del toggle (patrón
     * `lineSaving`). Regla de fuego SD6-4: `carryover` NUNCA alimenta los Σ
     * de cabecera, la Ejecutiva, el P&G ni el listado — solo el Flujo.
     */
    carryover: {
      enabled: false,
      /** @type {object|null} `PlanningCarryoverSource` o null */
      source: null,
      /** @type {Array<object>} `PlanningCarryoverLine[]` (orden del backend) */
      lines: [],
      loaded: false,
      loading: false,
      error: false,
      /** 'no_source' | null (BE-S6 §5.1) */
      unavailableReason: null,
      saving: false
    },

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
     * es cálculo de presentación: vive en el resolvedor compartido
     * `planningFormat.buildCogsRatePool`/`resolveCogsPctByLine` (FE-S7 §4)
     * que consumen `ExecutivePivotTable` (D-2/D-3) y la derivación "Pago a
     * proveedores" de `CashFlowPivotTable` — misma tasa, cero divergencia.
     */
    lineCostRates: [],
    lineCostRatesLoaded: false,
    lineCostRatesError: false,
    /**
     * @type {Array<object>} catálogo `line_payable_terms` (FE-S7 §3;
     * autoridad `backend.02_17` §2: re-semantizado D-S7-1 como "términos con
     * los que pagamos al proveedor el COSTO de ventas de la Línea"). Cada
     * entrada: `{ id_line_payable_term, id_line, payment_pct (0–1),
     * payment_days (negativo = antes de la ancla) }`. Cache A5/misma sesión
     * y MISMO ciclo de vida que `lineCostRates`: fallo SILENCIOSO →
     * `payableTermsError` (degradación de la Vista Flujo, jamás toast ni
     * request extra — NFR-CY-1).
     */
    payableTerms: [],
    payableTermsLoaded: false,
    payableTermsError: false,
    /**
     * @type {Array<object>} catálogos de internación por Línea (FE-S10-
     * INTERNMENT-SPLIT §2.2; autoridad `backend.02_19` §3.1/§3.2):
     * `internmentRates` = `{ id_line_internment_rate, id_line,
     * internment_pct (FRACCIÓN 0–1, D-S9-1: recargo SOBRE el costo del
     * proveedor) }` (unicidad por Línea ⇒ last-wins imposible en
     * `internmentRateByLine`) e `internmentTerms` = `{
     * id_line_internment_term, id_line, payment_pct, payment_days }` (la
     * base del pct es el CostoInternación, NO el total de la fila — tablas
     * no intercambiables con `payableTerms`). Se cargan como UN dúo atómico
     * en `ensureCatalogs`: el fallo de cualquiera de los dos GETs marca
     * `internmentCatalogError` (D-FE10-3: sin el % no se puede partir la
     * base ⇒ la Vista Flujo cortocircuita AMBOS streams de compra con aviso
     * — FE-S10 §2.4-5) y NO bloquea el resto de catálogos. Cache A5/misma
     * sesión, mismo convenio silencioso de `payableTerms` (jamás toast ni
     * request extra — NFR-CY-1).
     */
    internmentRates: [],
    /** @type {Array<object>} */
    internmentTerms: [],
    /** dúo completamente cargado (ambas GETs exitosas). */
    internmentCatalogLoaded: false,
    /** true ⇒ cortocircuito fail-closed de los streams de compra (§2.4-5). */
    internmentCatalogError: false,

    /**
     * FE-S14-IVA (frontend.03_14 D-FE14-1 + ENMIENDA D-FE14-7): modo de
     * visualización "Neto / Con IVA" POR ESCENARIO. `ivaMode` es la bandera
     * viva que leen el Flujo, la cuadrícula (columnas informativas) y el
     * panel de liquidación — NUNCA la Vista Ejecutiva ni los Σ de cabecera
     * (el P&G siempre en netos, D-FE14-7); `ivaModeBudgetId` recuerda a qué
     * escenario pertenece (se re-hydrata desde `localStorage` en cada
     * `fetchScenarioDetail`). Default ON = mundo real; el toggle existe para
     * no romper la lectura de quienes prefieran neto (AC-FE14-1: OFF ⇒ las
     * vistas vuelven a los netos actuales byte-a-byte).
     */
    ivaMode: true,
    ivaModeBudgetId: null,

    /**
     * FE-S14-IVA (frontend.03_14 §4.2/§5, D-FE14-4): caché de la liquidación
     * `IvaSettlementResult` del BE (backend.02_20 §4.6) — ÚNICO dato IVA que
     * viaja del servidor (la recurrencia con arrastre no se recalcula en FE).
     * La piden: el editor al abrir el escenario, el tab Liquidación (lazy),
     * el debounce de `scheduleSettlementRefresh()` tras mutaciones de líneas
     * y el botón "Recalcular" (force). Degradación NFR-FE14-3: `error: true`
     * ⇒ panel y Flujo muestran "sin dato de liquidación" + reintento; jamás
     * pantalla rota. Se RESETA al cambiar de escenario (nunca se muestra la
     * liquidación de otro presupuesto).
     */
    settlement: {
      /** @type {object|null} `IvaSettlementResult` crudo (claves §4.6 del BE) */
      data: null,
      /** escenario al que pertenece `data` (descarte defensivo de respuestas tardías) */
      budgetId: null,
      /** año pedido (eco local; el de la respuesta manda en el panel) */
      year: null,
      loaded: false,
      loading: false,
      error: false
    },

    /**
     * Resultados tributarios del escenario. `summary` y `cashFlow` son
     * respuestas crudas de los endpoints de tax planning: las vistas solo
     * presentan sus filas, nunca reproducen reglas ni calendarios.
     */
    tax: {
      summary: null,
      cashFlow: null,
      budgetId: null,
      loaded: false,
      loading: false,
      error: false,
      stale: false
    },

    /**
     * BE-S11 what-if: caché del `PayrollSimulationOut` de escenarios NO
     * activos (la pide el editor al abrir; degrada en silencio con banner +
     * reintento, patrón NFR-FE14-3). Se RESETA al cambiar de escenario y un
     * escenario ACTIVO jamás la consume (AC-SIM-2: ni una línea simulada
     * junto a las reales del motor).
     */
    payrollSim: {
      /** @type {object|null} `PayrollSimulationOut` crudo */
      data: null,
      /** escenario al que pertenece `data` (descarte de respuestas tardías) */
      budgetId: null,
      loaded: false,
      loading: false,
      error: false
    },

    /** BE-S12 financing what-if: gastos de interés/seguro en escenarios no activos. */
    financingSim: {
      /** @type {object|null} resultado crudo de FinancingSimulationOut */
      data: null,
      /** escenario al que pertenece `data` (descarte de respuestas tardías) */
      budgetId: null,
      loaded: false,
      loading: false,
      error: false
    },

    /** Flujo de capital del schedule activo; separado de toda línea P&L. */
    financingPrincipalFlow: {
      /** @type {object|null} respuesta cruda del endpoint */
      data: null,
      /** presupuesto al que pertenece la respuesta */
      budgetId: null,
      loaded: false,
      loading: false,
      error: false
    },

    /** Flags anti-doble-submit (NFR-F4/AC-FE-8). */
    uploading: false,
    cloning: false,
    settingTarget: false,
    /** Borrado de escenario borrador en vuelo (frontend.03_07). */
    deleting: false,
    /** @type {Record<number|string, boolean>} PUTs de celda en vuelo */
    cellSaving: {},
    /**
     * @type {Record<number|string, boolean>} mutaciones de línea (FE-S4D
     * §4, AC-FE-8) en vuelo. Claves: `id_budget_line` para update/delete y
     * `'new' + sectionKey` (sectionKey = `line_type`) para create. Las dueñas
     * del flag son las ACCIONES del store (set/clear alrededor del request,
     * igual que `cellSaving` en `updateCell`); modales y botones de la rejilla
     * solo lo LEEN para deshabilitarse (NFR-FD-1).
     */
    lineSaving: {}
  }),

  getters: {
    /** `isSubmitting` (§6.3): bloquea acciones del dashboard mientras hay operación en vuelo. */
    isSubmitting: (state) =>
      state.uploading || state.cloning || state.settingTarget || state.deleting,

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
     * Términos de pago al proveedor del costo de ventas agrupados por
     * `id_line` (FE-S7 §3): `Map<number, Array<object>>`, cada lista
     * ordenada `payment_days asc, id_line_payable_term asc` — el MISMO
     * orden D-7 (BE-S5 §6) que aplica la derivación server-side del
     * arrastre (`get_carryover_cogs_lines`) para que FE y BE emitan las
     * cuotas en idéntica secuencia. Getters de Pinia = `computed`: el Map
     * se reconstruye SOLO cuando muta `payableTerms` (NFR-S7-FE-1). Líneas
     * sin términos NO figuran ⇒ `get(id_line)` es `undefined` y el
     * consumidor aplica la cuota única 100 % en la ancla (D-S7-4).
     * @returns {Map<number, Array<object>>}
     */
    payableTermsByLine() {
      const byLine = new Map()
      for (const term of Array.isArray(this.payableTerms) ? this.payableTerms : []) {
        if (!term || typeof term.id_line !== 'number') continue
        if (!byLine.has(term.id_line)) byLine.set(term.id_line, [])
        byLine.get(term.id_line).push(term)
      }
      for (const terms of byLine.values()) {
        terms.sort(
          (a, b) =>
            Number(a.payment_days) - Number(b.payment_days) ||
            Number(a.id_line_payable_term) - Number(b.id_line_payable_term)
        )
      }
      return byLine
    },

    /**
     * Tasa de internación vigente por `id_line` (FE-S10 §2.2):
     * `Map<number, number>` con `internment_pct` en FRACCIÓN 0–1 (D-S9-1).
     * Unicidad BE (backend.02_19 §3.1) ⇒ last-wins imposible; pcts no
     * finitos se descartan (defensivo, espejo del guard §2.4-1 del Flujo).
     * Getters de Pinia = `computed`: el Map se reconstruye SOLO cuando muta
     * `internmentRates` (NFR-S7-FE-1 pattern). Líneas sin tasa NO figuran ⇒
     * `get(lineId)` es `undefined` y el consumidor aplica `?? 0` (A-5:
     * provBase = amount, DOM idéntico a FE-S9 — NFR-FE10-3).
     * @returns {Map<number, number>}
     */
    internmentRateByLine() {
      const byLine = new Map()
      for (const rate of Array.isArray(this.internmentRates) ? this.internmentRates : []) {
        if (!rate || typeof rate.id_line !== 'number') continue
        const pct = Number(rate.internment_pct)
        if (!Number.isFinite(pct)) continue
        byLine.set(rate.id_line, pct)
      }
      return byLine
    },

    /**
     * Términos de pago de la INTERNACIÓN agrupados por `id_line` (FE-S10
     * §2.2): `Map<number, Array<object>>`, cada lista ordenada
     * `payment_days asc, id_line_internment_term asc` — orden D-7 (espejo
     * EXACTO del getter hermano `payableTermsByLine` de arriba, incluida la
     * reconstrucción solo cuando muta el catálogo). Líneas sin términos NO
     * figuran ⇒ `get(id_line)` es `undefined` y el consumidor aplica la
     * cuota única 100 % del CostoInternación en la ancla (BR-INT-04,
     * espejo D-S7-4).
     * @returns {Map<number, Array<object>>}
     */
    internmentTermsByLine() {
      const byLine = new Map()
      for (const term of Array.isArray(this.internmentTerms) ? this.internmentTerms : []) {
        if (!term || typeof term.id_line !== 'number') continue
        if (!byLine.has(term.id_line)) byLine.set(term.id_line, [])
        byLine.get(term.id_line).push(term)
      }
      for (const terms of byLine.values()) {
        terms.sort(
          (a, b) =>
            Number(a.payment_days) - Number(b.payment_days) ||
            Number(a.id_line_internment_term) - Number(b.id_line_internment_term)
        )
      }
      return byLine
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
     * Catálogos CECO + temporadas + tasas de costo + términos de pago +
     * dúo de internación cacheados una vez por sesión (A5; FE-S4C §3.2 para
     * las tasas, FE-S7 §3 para los términos, FE-S10 §2.2 para la
     * internación). El fallo es SIEMPRE silencioso: las etiquetas degradan a
     * `CECO #<id>`, la vista sigue funcionando y
     * `lineCostRatesError`/`payableTermsError`/`internmentCatalogError`
     * permiten diferenciar la degradación visual en la Vista Ejecutiva
     * (§5.2) y en los bloques derivados "Pago a proveedores" / "Pago de
     * internación" de la Vista Flujo (FE-S7 §5 / FE-S10 §2.4-5) — jamás
     * toast ni bloqueo (D-4). Cada catálogo es un job INDEPENDIENTE del
     * `Promise.all`: la caída de uno no bloquea la carga de los demás.
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
      // FE-S7 §3: MISMO patrón silencioso que `lineCostRates` — la Vista
      // Flujo degrada con aviso (jamás dispara un request extra por leerla).
      if (!this.payableTermsLoaded) {
        jobs.push(
          budgetPlanningService
            .fetchPayableTerms()
            .then((response) => {
              this.payableTerms = Array.isArray(response?.data) ? response.data : []
              this.payableTermsLoaded = true
            })
            .catch(() => {
              /* silencioso: degradación visual en Vista Flujo (FE-S7 §5) */
              this.payableTermsError = true
            })
        )
      }
      // FE-S10 §2.2: dúo de internación (tasas + términos) en UN solo job —
      // `Promise.all` atómico con UNA sola bandera de error (D-FE10-3: sin
      // el % no se puede partir la base ⇒ fail-closed de AMBOS streams de
      // compra en la Vista Flujo, FE-S10 §2.4-5). Es un job MÁS del mismo
      // `jobs`: su fallo NO bloquea al resto de catálogos (Promise.all de
      // arriba ya aísla cada job con su propio .catch silencioso).
      if (!this.internmentCatalogLoaded) {
        jobs.push(
          Promise.all([
            budgetPlanningService.fetchInternmentRates(),
            budgetPlanningService.fetchInternmentTerms()
          ])
            .then(([ratesResponse, termsResponse]) => {
              this.internmentRates = Array.isArray(ratesResponse?.data) ? ratesResponse.data : []
              this.internmentTerms = Array.isArray(termsResponse?.data) ? termsResponse.data : []
              this.internmentCatalogLoaded = true
            })
            .catch(() => {
              /* silencioso: cortocircuito fail-closed de los streams de
                 compra en la Vista Flujo (FE-S10 §2.4-5, aviso vía
                 `costTermsDegraded`) */
              this.internmentCatalogError = true
            })
        )
      }
      await Promise.all(jobs)
    },

    /**
     * Detalle para el editor. Misma `id` ya cacheada y `!force` ⇒ no-op.
     * Carga además los catálogos (una sola pasada, A5/§8.2).
     *
     * FE-S6 §4: en el éxito, `carryover.enabled` se resincroniza desde el flag
     * aditivo `include_carryover` de la respuesta y el resto de la caché del
     * arrastre se REINICIA (`lines: []`, `loaded: false`, …): el fetch real es
     * lazy y lo dispara la vista solo con el tab Flujo activo y `enabled`.
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
        // FE-S6: flag desde el detalle + reset de la caché de líneas.
        this.carryover.enabled = data.include_carryover === true
        this.carryover.source = null
        this.carryover.lines = []
        this.carryover.loaded = false
        this.carryover.error = false
        this.carryover.unavailableReason = null
        // FE-S14-IVA: el modo se re-hidrata POR ESCENARIO (persistente en
        // localStorage; default ON D-FE14-1) y la caché de liquidación se
        // RESETEA: la de otro escenario jamás debe asomarse (y el GET fresco
        // lo dispara el editor al abrir, §4.2 — no aquí, para no acoplar el
        // fetch del detalle al de la liquidación).
        this.applyIvaModeForBudget(idBudget)
        this.resetSettlementCache()
        this.resetTaxCache()
        // BE-S11 what-if: la simulación de OTRO escenario tampoco se asoma.
        this.resetPayrollSimCache()
        this.resetFinancingSimCache()
        this.resetFinancingPrincipalFlowCache()
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
     * POST multipart de creación del Base (dos SIIGO + el opcional TERCER
     * archivo "Plan de Importaciones" de FE-S9 §2.8 — `fields.fileCompras`
     * viaja tal cual al servicio, que solo anexa `file_compras` si es `File`).
     * Guarda la respuesta 201 en `data` para el toast del modal (§7), cuyas
     * claves aditivas `lines_purchase`/`total_purchase` (BE-S8) se muestran
     * solo si `lines_purchase > 0`.
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
     * DELETE `/budget/{idBudget}` LEGACY (frontend.03_07 / backend.02_14):
     * borrado físico de un escenario BORRADOR. Éxito 200: la fila se retira
     * de la caché al instante (ASM-7; sin refetch manual obligatorio) y se
     * marca `scenariosStale` para la reconciliación suave del dashboard; si
     * el detalle abierto era ese escenario se limpia `currentScenario`
     * (quedar viendo líneas de un presupuesto ya inexistente es imposible).
     * 400 (`conflict`: el estado cambió en vuelo — el backend es la autoridad)
     * y 404 (`notfound`) fuerzan refresco del listado CON el año cacheado
     * para que la tabla muestre la verdad (el botón desaparece en esa fila)
     * y devuelven `message` en español para el inline del modal. 403: toast
     * + refresco de roles (patrón defensivo del store, sin gate de rol hoy).
     * @param {number|string} idBudget
     * @returns {Promise<{ ok: boolean, kind?: string, message?: string }>}
     */
    async deleteScenario(idBudget) {
      if (this.deleting) return { ok: false, kind: 'busy' }
      this.deleting = true
      try {
        await budgetPlanningService.deleteScenario(idBudget)
        this.scenarios = Array.isArray(this.scenarios)
          ? this.scenarios.filter((row) => row.id_budget !== Number(idBudget))
          : this.scenarios
        this.scenariosStale = true
        if (this.currentScenario?.id_budget === Number(idBudget)) {
          this.currentScenario = null
          this.currentScenarioId = null
        }
        return { ok: true }
      } catch (err) {
        const classified = classifyPlanningError(err)
        this.handleAuth(classified)
        if (classified.kind === 'conflict') {
          void this.fetchScenarios({ year: this.scenariosYear, force: true })
          return {
            ok: false,
            kind: 'conflict',
            message:
              'El escenario ya no está en estado Borrador: solo pueden eliminarse borradores.'
          }
        }
        if (classified.kind === 'notfound') {
          void this.fetchScenarios({ year: this.scenariosYear, force: true })
          return {
            ok: false,
            kind: 'notfound',
            message: 'El escenario ya no existe. La lista se actualizó.'
          }
        }
        if (classified.kind === 'forbidden') {
          alertService.generalError('No tiene permiso para realizar esta operación.')
          await this.refreshRolesSilently()
        }
        return { ok: false, ...classified }
      } finally {
        this.deleting = false
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
        this.markTaxStale()
        // FE-S14-IVA AC-FE14-2: la base de la liquidación cambió ⇒ debounce
        // de refetch (§4.2). NO bloquea ni ensucia el resultado de la celda.
        this.scheduleSettlementRefresh()
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
    },

    /* ------------------- CRUD de líneas (FE-S4D-BUDGET-LINES) ---------------- */

    /**
     * Reemplaza (o añade si no estaba) UNA línea en la caché del detalle sin
     * ningún refetch (§4/AC-FE-6: `budget_lines` es LA fuente; Ejecutiva, Flujo
     * y los Σ derivados se recalculan solos por reactividad). Mutación
     * in-place (push/splice) sobre el array de Pinia.
     * @param {object|null} line respuesta `BudgetLine` completa del backend
     */
    applyLineToCache(line) {
      if (
        !line ||
        !this.currentScenario ||
        line.id_budget !== this.currentScenario.id_budget ||
        !Array.isArray(this.currentScenario.budget_lines)
      ) {
        return
      }
      const index = this.currentScenario.budget_lines.findIndex(
        (item) => item.id_budget_line === line.id_budget_line
      )
      if (index !== -1) this.currentScenario.budget_lines.splice(index, 1, line)
      else this.currentScenario.budget_lines.push(line)
    },

    /**
     * Refresco SUAVE y silencioso del listado tras una mutación de líneas
     * (§4): marca `scenariosStale` y fuerza el fetch con el año del detalle
     * abierto (mismo patrón de `load()` en `BudgetGridEditor`) para que el
     * dashboard muestre Σ frescos al volver. Su fallo NO interrumpe ni
     * contamina el resultado de la mutación ya aplicada.
     */
    softRefreshScenarioList() {
      this.scenariosStale = true
      const year = this.currentScenario?.budget_year ?? 'all'
      void this.fetchScenarios({ year, force: true })
    },

    /**
     * 404 de línea en update/delete (§4): limpia la caché de detalle del mismo
     * modo en que `fetchScenarioDetail` la limpia al fallar y la vuelve a
     * forzar, de modo que la vista se resincronice sin salir de la ruta.
     * @returns {Promise<void>}
     */
    async reloadScenarioDetail() {
      const idBudget = this.currentScenario?.id_budget ?? this.currentScenarioId
      if (!idBudget) return
      this.currentScenario = null
      this.currentScenarioId = null
      await this.fetchScenarioDetail(idBudget, true)
    },

    /**
     * POST `/{idBudget}/line` (BE-S4D §3.1). Éxito 201: push IN-PLACE de la
     * línea devuelta a `currentScenario.budget_lines` + refresco suave del
     * listado; prohibido el refetch del detalle (§4). Doble-submit: segunda
     * llamada con `'new'+line_type` en vuelo ⇒ `{ ok:false, kind:'busy' }`
     * (AC-FE-8/NFR-FD-1). El 404 de FK/presupuesto se propaga con `detail`
     * para el mapeo inline del modal (§6); no resincroniza la vista.
     *
     * FE-S7-COGS-PAYFLOW §3 / BE-S7 §2 (rollback D-S7-6): el 201 volvió a
     * ser `BudgetLine` PURO — la expansión server-side de gastos con
     * `expanded_siblings` fue retirada del contrato, así que aquí ya no hay
     * loop de hermanas: se cachea la única línea creada y se devuelve
     * `{ ok, line }`. El `payment_date` del payload se respeta tal cual
     * (un gasto fijo = una cuota); los términos de pago SOLO diferencian el
     * COSTO de ventas, y eso es derivación client-side del Flujo (D-S7-2),
     * jamás persistida aquí (AC-S7-FE-5).
     * @param {number} idBudget
     * @param {object} payload `PlanningLineCreate` (snake_case) ya validado
     * @returns {Promise<{ ok: boolean, line?: object|null, kind?: string, [key: string]: any }>}
     */
    async createScenarioLine(idBudget, payload) {
      const key = `new${payload?.line_type ?? ''}`
      if (this.lineSaving[key]) return { ok: false, kind: 'busy' }
      this.lineSaving[key] = true
      try {
        const response = await budgetPlanningService.createLine(idBudget, payload)
        const line = response?.data ?? null
        if (line) this.applyLineToCache(line)
        this.softRefreshScenarioList()
        this.markTaxStale()
        // FE-S14-IVA AC-FE14-2: línea nueva (con o sin `has_iva` en el
        // payload) ⇒ settlement debounce.
        this.scheduleSettlementRefresh()
        return { ok: true, line }
      } catch (err) {
        const classified = classifyPlanningError(err)
        this.handleAuth(classified)
        if (classified.kind === 'forbidden') {
          alertService.generalError('No tiene permiso para realizar esta operación.')
          await this.refreshRolesSilently()
        }
        return { ok: false, ...classified }
      } finally {
        delete this.lineSaving[key]
      }
    },

    /**
     * PUT `/line/{idLine}` (BE-S4D §3.2, payload PARCIAL). Éxito: reemplazo
     * in-place del objeto en la caché + refresco suave (sin refetch del
     * detalle, §4). 404 "BudgetLine … not found" ⇒ `reloadScenarioDetail()` y
     * `{ ok:false, kind:'notfound', lineGone:true, message }` para que el
     * llamador lo toastee (§4/§6). Otros 404 (FK) se propagan con `detail`.
     * Bloqueado también mientras el PUT de celda de la MISMA línea está en
     * vuelo (`cellSaving`, AC-FD-10).
     * @param {number|string} idLine
     * @param {object} payload `PlanningLineUpdate` (solo campos modificados)
     * @returns {Promise<{ ok: boolean, line?: object|null, kind?: string, [key: string]: any }>}
     */
    async updateScenarioLine(idLine, payload) {
      if (this.lineSaving[idLine] || this.cellSaving[idLine]) return { ok: false, kind: 'busy' }
      this.lineSaving[idLine] = true
      try {
        const response = await budgetPlanningService.updateLine(idLine, payload)
        const line = response?.data ?? null
        if (line) this.applyLineToCache(line)
        this.softRefreshScenarioList()
        this.markTaxStale()
        // FE-S14-IVA AC-FE14-2: este PUT cubre TAMBIÉN el toggle parcial
        // `{ has_iva }` de la cuadrícula (frontend.03_14 §5): la liquidación
        // (descuentos E2/E3/E4) cambia ⇒ debounce de refetch.
        this.scheduleSettlementRefresh()
        return { ok: true, line }
      } catch (err) {
        const classified = classifyPlanningError(err)
        if (classified.kind === 'notfound' && isLineNotFoundDetail(classified.detail)) {
          await this.reloadScenarioDetail()
          return { ok: false, kind: 'notfound', lineGone: true, message: LINE_GONE_MESSAGE }
        }
        this.handleAuth(classified)
        if (classified.kind === 'forbidden') {
          alertService.generalError('No tiene permiso para realizar esta operación.')
          await this.refreshRolesSilently()
        }
        return { ok: false, ...classified }
      } finally {
        delete this.lineSaving[idLine]
      }
    },

    /**
     * DELETE `/line/{idLine}` (BE-S4D §3.3, borrado físico D-2). Éxito: splice
     * de la caché + refresco suave; las vistas derivadas desaparecen la línea
     * al instante (AC-FD-7). 404 de línea: mismo resync forzado que
     * `updateScenarioLine`. Guard cruzado con `cellSaving` (AC-FD-10).
     * @param {number|string} idLine
     * @returns {Promise<{ ok: boolean, kind?: string, [key: string]: any }>}
     */
    async deleteScenarioLine(idLine) {
      if (this.lineSaving[idLine] || this.cellSaving[idLine]) return { ok: false, kind: 'busy' }
      this.lineSaving[idLine] = true
      try {
        await budgetPlanningService.deleteLine(idLine)
        if (this.currentScenario && Array.isArray(this.currentScenario.budget_lines)) {
          const index = this.currentScenario.budget_lines.findIndex(
            (item) => item.id_budget_line === idLine
          )
          if (index !== -1) this.currentScenario.budget_lines.splice(index, 1)
        }
        this.softRefreshScenarioList()
        this.markTaxStale()
        // FE-S14-IVA: borrado de línea ⇒ debounce del settlement (AC-FE14-2).
        this.scheduleSettlementRefresh()
        return { ok: true }
      } catch (err) {
        const classified = classifyPlanningError(err)
        if (classified.kind === 'notfound' && isLineNotFoundDetail(classified.detail)) {
          await this.reloadScenarioDetail()
          return { ok: false, kind: 'notfound', lineGone: true, message: LINE_GONE_MESSAGE }
        }
        this.handleAuth(classified)
        if (classified.kind === 'forbidden') {
          alertService.generalError('No tiene permiso para realizar esta operación.')
          await this.refreshRolesSilently()
        }
        return { ok: false, ...classified }
      } finally {
        delete this.lineSaving[idLine]
      }
    },

    /* ---------------- Arrastre de saldos N−1 (FE-S6-CARRYOVER) ---------------- */

    /**
     * GET lazy del arrastre (FE-S6 §4). No-op cacheado si `loaded`, `!force` y
     * el `currentScenario` sigue siendo el mismo escenario; dedupe también
     * mientras hay un GET en vuelo (AC-S6-FE-1: una sola request por
     * activación; el reintento silencioso al reactivar el tab/toggle pasa
     * porque el fallo dejó `loaded: false`).
     *
     * Errores SILENCIOSOS (patrón `ensureCatalogs`, §7): NUNCA toast — el Flujo
     * degrada con el aviso de la cabecera (`carryover.error`) y el resumen sin
     * arrastre (las líneas se limpian para que jamás quede "a medias"). El 404
     * de escenario NO pone `error`: el tab Flujo ya muere con el detalle. 401
     * ⇒ `handleAuth` estándar. Si el escenario cambió mientras el request
     * volaba, la respuesta se descarta (BR-CO-04 recalcula en la próxima
     * lectura; el flag `enabled` NO se toca aquí: es propiedad del detalle).
     * @param {number|string} idBudget
     * @param {boolean} [force=false]
     * @returns {Promise<{ ok: boolean, kind?: string, [key: string]: any }>}
     */
    async fetchCarryover(idBudget, force = false) {
      const carryover = this.carryover
      if (!force) {
        if (carryover.loading) return { ok: true }
        if (carryover.loaded && this.currentScenario?.id_budget === idBudget) return { ok: true }
      }
      carryover.loading = true
      try {
        const response = await budgetPlanningService.fetchCarryover(idBudget)
        if (this.currentScenario?.id_budget === idBudget) {
          const data = response?.data ?? null
          if (data && typeof data === 'object') {
            carryover.source = data.source && typeof data.source === 'object' ? data.source : null
            carryover.lines = Array.isArray(data.lines) ? data.lines : []
            carryover.unavailableReason = data.unavailable_reason ?? null
          } else {
            carryover.source = null
            carryover.lines = []
            carryover.unavailableReason = null
          }
          carryover.error = false
          carryover.loaded = true
        }
        return { ok: true }
      } catch (err) {
        const classified = classifyPlanningError(err)
        this.handleAuth(classified)
        if (classified.kind !== 'auth' && classified.kind !== 'notfound') {
          carryover.error = true
          carryover.loaded = false
          carryover.source = null
          carryover.lines = []
          carryover.unavailableReason = null
        }
        return { ok: false, ...classified }
      } finally {
        carryover.loading = false
      }
    },

    /**
     * Toggle persistido del arrastre (FE-S6 §4/§5, BE-S6 §5.2) con rollback.
     * 1. Snapshot ANTES de mutar: `currentScenario` es el objeto de la caché
     *    que el resto de acciones muta in-place (`applyLineToCache` empuja/
     *    splicea `budget_lines`), así que el rollback restaura la REFERENCIA
     *    previa y revierte solo el campo tocado aquí (`include_carryover`);
     *    clonar superficialmente no bastaría (compartiría el array mutado).
     * 2. Optimista: `carryover.enabled = value` + `include_carryover` local.
     * 3. PUT ⇒ 200 con el `BudgetFull` completo del escenario: se aplica a la
     *    caché con la MISMA asignación de `fetchScenarioDetail` (líneas
     *    frescas incluidas) y se fuerza el GET del arrastre (`force: true`).
     * 4. Error ⇒ reversa de ambos estados + `{ ok: false, ...classified }`;
     *    403 toast de permiso + `refreshRolesSilently` (patrón del store);
     *    404 "Budget … not found" ⇒ resync del detalle (patrón FE-S4D §4).
     * Guard `saving`: spam del pill ⇒ UN solo PUT (AC-S6-FE-7); `busy` jamás
     * toca el optimistic set.
     * @param {number|string} idBudget
     * @param {boolean} value
     * @returns {Promise<{ ok: boolean, kind?: string, [key: string]: any }>}
     */
    async setCarryoverFlag(idBudget, value) {
      if (this.carryover.saving) return { ok: false, kind: 'busy' }
      const snapshotScenario = this.currentScenario
      const previousEnabled = this.carryover.enabled
      const flag = Boolean(value)
      // 2. Optimistic set (el pill lee `carryover.enabled`: revert = volver).
      this.carryover.enabled = flag
      if (snapshotScenario) snapshotScenario.include_carryover = flag
      this.carryover.saving = true
      try {
        const response = await budgetPlanningService.setCarryover(idBudget, flag)
        // 3. Fusión idéntica al éxito de `fetchScenarioDetail` (sin refetch).
        const data = response?.data ?? null
        if (data && typeof data === 'object') {
          this.currentScenario = data
          this.currentScenarioId = idBudget
        }
        await this.fetchCarryover(idBudget, true)
        // FE-S14-IVA: el PUT de arrastre reemplaza el detalle completo
        // (líneas frescas que pueden haber cambiado la base) ⇒ el
        // settlement se invalida y el próximo lector lo refuerza.
        this.scheduleSettlementRefresh()
        return { ok: true }
      } catch (err) {
        // 4. Rollback de AMBOS (referencia previa + su campo + enabled).
        this.carryover.enabled = previousEnabled
        this.currentScenario = snapshotScenario
        if (snapshotScenario) snapshotScenario.include_carryover = previousEnabled
        const classified = classifyPlanningError(err)
        this.handleAuth(classified)
        if (classified.kind === 'forbidden') {
          alertService.generalError('No tiene permiso para realizar esta operación.')
          await this.refreshRolesSilently()
        }
        if (classified.kind === 'notfound') {
          // Escenario eliminado en vuelo: limpia detalle + refetch forzado.
          await this.reloadScenarioDetail()
        }
        return { ok: false, ...classified }
      } finally {
        this.carryover.saving = false
      }
    },

    /* ─────────────── Resultados tributarios del escenario ─────────────── */

    /** Limpia la caché tributaria al cambiar de escenario. */
    resetTaxCache() {
      this.tax.summary = null
      this.tax.cashFlow = null
      this.tax.budgetId = null
      this.tax.loaded = false
      this.tax.loading = false
      this.tax.error = false
      this.tax.stale = false
    },

    /** Marca los resultados como potencialmente desactualizados tras editar líneas. */
    markTaxStale() {
      if (this.tax.budgetId === this.currentScenario?.id_budget) this.tax.stale = true
    },

    /**
     * Carga en paralelo el resumen y el flujo tributario persistidos. Un solo
     * estado compartido alimenta P&G y Flujo; no se calculan impuestos en FE.
     */
    async fetchTaxData(idBudget, { force = false } = {}) {
      const target = Number(idBudget)
      if (!Number.isFinite(target) || target <= 0) return { ok: false, kind: 'notfound' }
      if (this.tax.loading) return { ok: true }
      if (!force && this.tax.loaded && this.tax.budgetId === target && !this.tax.stale) {
        return { ok: true }
      }

      this.tax.loading = true
      try {
        const [summaryResponse, cashFlowResponse] = await Promise.all([
          budgetPlanningService.fetchTaxSummary(target),
          budgetPlanningService.fetchTaxCashFlow(target)
        ])
        if (this.currentScenario?.id_budget !== target) return { ok: true }
        this.tax.summary = summaryResponse?.data ?? null
        this.tax.cashFlow = cashFlowResponse?.data ?? null
        this.tax.budgetId = target
        this.tax.loaded = true
        this.tax.error = false
        this.tax.stale = false
        return { ok: true }
      } catch (err) {
        const classified = classifyPlanningError(err)
        this.handleAuth(classified)
        if (classified.kind !== 'auth') {
          this.tax.error = true
          this.tax.loaded = false
          this.tax.budgetId = target
        }
        return { ok: false, ...classified }
      } finally {
        this.tax.loading = false
      }
    },

    /* ─────────────── FE-S14-IVA: modo Con IVA + liquidación ─────────────── */

    /**
     * Re-hidrata `ivaMode` desde la preferencia guardada del escenario
     * (frontend.03_14 D-FE14-1: persistido POR `idBudget` en localStorage,
     * default ON). Lo llama `fetchScenarioDetail` en el éxito; el editor no
     * necesita hacer nada extra al cambiar de escenario.
     * @param {number|string} idBudget
     * @returns {void}
     */
    applyIvaModeForBudget(idBudget) {
      this.ivaModeBudgetId = Number(idBudget)
      this.ivaMode = readIvaModePreference(idBudget)
    },

    /**
     * Toggle del modo "Neto / Con IVA" (sin HTTP: es preferencia de
     * VISUALIZACIÓN — las derivaciones cuelgan de la reactividad de la
     * bandera, AC-FE14-1/2). Persiste en localStorage por escenario y
     * re-hidrata si el editor apunta a otro (guard defensivo de carrera).
     * @param {number|string} idBudget
     * @param {boolean} value
     * @returns {void}
     */
    setIvaMode(idBudget, value) {
      const flag = Boolean(value)
      this.ivaModeBudgetId = Number(idBudget)
      this.ivaMode = flag
      writeIvaModePreference(idBudget, flag)
    },

    /**
     * Limpia la caché de liquidación (escenario nuevo / resync). No cancela
     * un request en vuelo: la acción lo descarta por `budgetId` al resolver.
     * @returns {void}
     */
    resetSettlementCache() {
      this.settlement.data = null
      this.settlement.budgetId = null
      this.settlement.year = null
      this.settlement.loaded = false
      this.settlement.loading = false
      this.settlement.error = false
    },

    /**
     * GET de la liquidación `IvaSettlementResult` (backend.02_20 §4.6/§5.9) —
     * único dato IVA server-side (D-FE14-4). La piden: el editor al abrir el
     * escenario, el tab Liquidación (lazy), `scheduleSettlementRefresh()`
     * tras mutaciones de líneas/calendario (debounce ⇒ ≤ 1 request nuevo,
     * AC-FE14-2) y el botón "Recalcular" (`force: true`).
     *
     * Caché: mismo escenario ya cargado y `!force` ⇒ no-op; dedupe mientras
     * hay un GET en vuelo. El `year` se envía SOLO si el escenario lo define
     * (por lo demás defaultea el BE). Errores (NFR-FE14-3): `network`/`5xx`
     * ⇒ `settlement.error = true` + `loaded = false` (panel y Flujo degradan
     * con "sin dato de liquidación" + reintento; JAMÁS toast: el dato es de
     * presentación y la vista no rompe); 404 de escenario deja el estado
     * limpio (el editor ya murió con el detalle); 401 ⇒ `handleAuth`. Si el
     * escenario cambió en vuelo, la respuesta se DESCARTA.
     * @param {number|string} idBudget
     * @param {{ force?: boolean }} [options]
     * @returns {Promise<{ ok: boolean, kind?: string, [key: string]: any }>}
     */
    async fetchIvaSettlement(idBudget, { force = false } = {}) {
      const target = Number(idBudget)
      if (!Number.isFinite(target) || target <= 0) return { ok: false, kind: 'notfound' }
      // Single-flight SIEMPRE (spam del "Recalcular" ⇒ un solo GET, NFR-FE14-2):
      if (this.settlement.loading) return { ok: true }
      if (!force && this.settlement.loaded && this.settlement.budgetId === target) {
        return { ok: true }
      }
      const year = Number(this.currentScenario?.budget_year)
      const effectiveYear = Number.isInteger(year) ? year : null
      this.settlement.loading = true
      try {
        const response = await budgetPlanningService.getIvaSettlement(target, effectiveYear)
        // El escenario cambió mientras volaba: se descarta (la próxima lectura
        // —apertura del tab o mutation debounce— trae la verdad actual).
        if (this.currentScenario?.id_budget !== target) return { ok: true }
        const data = response?.data ?? null
        this.settlement.data = data && typeof data === 'object' ? data : null
        this.settlement.budgetId = target
        this.settlement.year = Number.isInteger(this.settlement.data?.year)
          ? this.settlement.data.year
          : effectiveYear
        this.settlement.loaded = true
        this.settlement.error = false
        return { ok: true }
      } catch (err) {
        const classified = classifyPlanningError(err)
        this.handleAuth(classified)
        if (classified.kind !== 'auth') {
          this.settlement.error = true
          this.settlement.loaded = false
          this.settlement.data = null
          this.settlement.budgetId = target
          this.settlement.year = effectiveYear
        }
        return { ok: false, ...classified }
      } finally {
        this.settlement.loading = false
      }
    },

    /**
     * Invalida y re-programa el refetch del settlement con debounce ~400 ms
     * (frontend.03_14 §4.2: "tras cualquier mutación de líneas (debounce,
     * same pattern del refresh de carryover)"). RÁPIDO: varias mutaciones en
     * el mismo tick (edit de celda + toggle de flag) colapsan a UN request.
     * Lo llaman las mutaciones de línea del propio store y —puente
     * AC-FE14-6— `budgetRulesStore` tras mutar el calendario IVA (los
     * `payment_due_date` y la existencia de períodos cambian la recurrencia).
     * No-op si no hay escenario abierto en `currentScenario`.
     * @param {number} [delayMs=SETTLEMENT_DEBOUNCE_MS]
     * @returns {void}
     */
    scheduleSettlementRefresh(delayMs = SETTLEMENT_DEBOUNCE_MS) {
      const idBudget = this.currentScenario?.id_budget
      if (!idBudget) return
      if (settlementRefreshTimer) clearTimeout(settlementRefreshTimer)
      settlementRefreshTimer = setTimeout(() => {
        settlementRefreshTimer = null
        if (this.currentScenario?.id_budget !== idBudget) return
        void this.fetchIvaSettlement(idBudget, { force: true })
      }, delayMs)
    },

    /** BE-S11 what-if: deja la caché de simulación limpia. */
    resetPayrollSimCache() {
      this.payrollSim.data = null
      this.payrollSim.budgetId = null
      this.payrollSim.loaded = false
      this.payrollSim.loading = false
      this.payrollSim.error = false
    },

    /**
     * GET `/budget/planning/{id}/payroll-simulation` (BE-S11 what-if de
     * escenarios NO activos). Espejo de `fetchIvaSettlement`: single-flight
     * (spam del "Reintentar" ⇒ un solo GET), caché por escenario, respuesta
     * tardía descartada y degradación SILENTE — el editor muestra banner +
     * reintento; la vista jamás rompe (NFR-FE14-3). El 400 de escenario
     * activo queda como `error` sin data (el editor no lo pide en ese caso,
     * defensa en profundidad).
     * @param {number|string} idBudget
     * @param {{ force?: boolean }} [options]
     * @returns {Promise<{ ok: boolean, kind?: string, [key: string]: any }>}
     */
    async fetchPayrollSimulation(idBudget, { force = false } = {}) {
      const target = Number(idBudget)
      if (!Number.isFinite(target) || target <= 0) return { ok: false, kind: 'notfound' }
      if (this.payrollSim.loading) return { ok: true }
      if (!force && this.payrollSim.loaded && this.payrollSim.budgetId === target) {
        return { ok: true }
      }
      this.payrollSim.loading = true
      try {
        const response = await budgetPlanningService.fetchPayrollSimulation(target)
        if (this.currentScenario?.id_budget !== target) return { ok: true }
        const data = response?.data ?? null
        this.payrollSim.data = data && typeof data === 'object' ? data : null
        this.payrollSim.budgetId = target
        this.payrollSim.loaded = true
        this.payrollSim.error = false
        return { ok: true }
      } catch (err) {
        const classified = classifyPlanningError(err)
        this.handleAuth(classified)
        if (classified.kind !== 'auth') {
          this.payrollSim.error = true
          this.payrollSim.loaded = false
          this.payrollSim.data = null
          this.payrollSim.budgetId = target
        }
        return { ok: false, ...classified }
      } finally {
        this.payrollSim.loading = false
      }
    },

    /** Limpia la caché what-if de financiación al cambiar de escenario. */
    resetFinancingSimCache() {
      this.financingSim.data = null
      this.financingSim.budgetId = null
      this.financingSim.loaded = false
      this.financingSim.loading = false
      this.financingSim.error = false
    },

    /**
     * GET financing-simulation, read-only y cacheado por escenario. La
     * respuesta tardía se descarta; errores no bloquean la vista y quedan
     * disponibles para el banner/reintento del editor.
     * @param {number|string} idBudget
     * @param {{ force?: boolean }} [options]
     */
    async fetchFinancingSimulation(idBudget, { force = false } = {}) {
      const target = Number(idBudget)
      if (!Number.isFinite(target) || target <= 0) return { ok: false, kind: 'notfound' }
      if (this.financingSim.loading) return { ok: true }
      if (!force && this.financingSim.loaded && this.financingSim.budgetId === target) {
        return { ok: true }
      }
      this.financingSim.loading = true
      try {
        const response = await budgetPlanningService.fetchFinancingSimulation(target)
        if (this.currentScenario?.id_budget !== target) return { ok: true }
        const data = response?.data ?? null
        this.financingSim.data = data && typeof data === 'object' ? data : null
        this.financingSim.budgetId = target
        this.financingSim.loaded = true
        this.financingSim.error = false
        return { ok: true }
      } catch (err) {
        const classified = classifyPlanningError(err)
        this.handleAuth(classified)
        if (classified.kind !== 'auth') {
          this.financingSim.error = true
          this.financingSim.loaded = false
          this.financingSim.data = null
          this.financingSim.budgetId = target
        }
        return { ok: false, ...classified }
      } finally {
        this.financingSim.loading = false
      }
    },

    /** Limpia la caché de capital al cambiar de presupuesto. */
    resetFinancingPrincipalFlowCache() {
      this.financingPrincipalFlow.data = null
      this.financingPrincipalFlow.budgetId = null
      this.financingPrincipalFlow.loaded = false
      this.financingPrincipalFlow.loading = false
      this.financingPrincipalFlow.error = false
    },

    /**
     * Consulta y cachea el capital del schedule activo por id de presupuesto.
     * Es una consulta read-only válida para active/draft/closed; errores no
     * bloquean el flujo presupuestario restante y permiten reintento explícito.
     * @param {number|string} idBudget
     * @param {{ force?: boolean }} [options]
     */
    async fetchFinancingPrincipalFlow(idBudget, { force = false } = {}) {
      const target = Number(idBudget)
      if (!Number.isFinite(target) || target <= 0) return { ok: false, kind: 'notfound' }
      if (this.financingPrincipalFlow.loading) return { ok: true }
      if (
        !force &&
        this.financingPrincipalFlow.loaded &&
        this.financingPrincipalFlow.budgetId === target
      ) {
        return { ok: true }
      }
      this.financingPrincipalFlow.loading = true
      try {
        const response = await budgetPlanningService.fetchFinancingPrincipalFlow(target)
        if (this.currentScenario?.id_budget !== target) return { ok: true }
        const data = response?.data ?? null
        this.financingPrincipalFlow.data =
          data && typeof data === 'object'
            ? { ...data, lines: Array.isArray(data.lines) ? data.lines : [] }
            : null
        this.financingPrincipalFlow.budgetId = target
        this.financingPrincipalFlow.loaded = true
        this.financingPrincipalFlow.error = false
        return { ok: true }
      } catch (err) {
        const classified = classifyPlanningError(err)
        this.handleAuth(classified)
        if (classified.kind !== 'auth') {
          this.financingPrincipalFlow.error = true
          this.financingPrincipalFlow.loaded = false
          this.financingPrincipalFlow.data = null
          this.financingPrincipalFlow.budgetId = target
        }
        return { ok: false, ...classified }
      } finally {
        this.financingPrincipalFlow.loading = false
      }
    }
  }
})
