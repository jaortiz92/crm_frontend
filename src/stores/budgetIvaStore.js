import { defineStore } from 'pinia'
import { budgetPlanningService } from '@/services/budgetPlanningService.js'
// FASE 2 (split del `budgetPlanningStore`): la clasificación de errores
// (`classifyPlanningError`) y el patrón de sesión (`handleAuth`) viven en el
// sub-store de escenario, dueño del convenio compartido por los 3 sub-stores.
// El import es circular con `budgetScenarioStore.js` (seguro: los bindings
// SOLO se referencian dentro de cuerpos de función, nunca a nivel de módulo).
import { classifyPlanningError, useBudgetScenarioStore } from '@/stores/budgetScenarioStore.js'

/**
 * DOMINIO IVA del Módulo de Planeación (FE-S14-IVA, frontend.03_14 §4.2/§5) —
 * FASE 2: sub-store `budgetIva` extraído del `budgetPlanningStore` (mismo
 * comportamiento byte-a-byte; solo cambió el ownership del estado y el wiring).
 *
 * DOMINA:
 *  - `ivaMode` + `ivaModeBudgetId`: interruptor de presentación "Neto / Con
 *    IVA" POR ESCENARIO, PERSISTIDO en `localStorage` (D-FE14-1, default ON).
 *    CONTRATO INMUTABLE: la clave de localStorage es EXACTAMENTE
 *    `budgetPlanning.ivaMode.<idBudget>` (prefijo `IVA_MODE_STORAGE_PREFIX`) —
 *    cambiarla perdería las preferencias de los usuarios existentes.
 *    ENMIENDA D-FE14-7: el modo SOLO altera la Vista Flujo — la cabecera y la
 *    Vista Ejecutiva (P&G) se calculan SIEMPRE sobre netos.
 *  - `settlement`: caché del `IvaSettlementResult` del BE (D-FE14-4: único
 *    dato IVA server-side) con fetch lazy + invalidación debounced (~400 ms)
 *    tras toda mutación de líneas y todo cambio de calendario IVA puente
 *    desde `budgetRulesStore` (AC-FE14-2/6).
 *
 * SE ACOPLA CON:
 *  - `budgetScenarioStore`: lee el escenario abierto (`currentScenario`) para
 *    el `budget_year` del GET de liquidación, el guard de descarte de
 *    respuestas tardías y el debounce; reusa `classifyPlanningError` y
 *    `handleAuth` (patrón de sesión).
 *  - `budgetRulesStore` (puente AC-FE14-6): tras mutar el calendario IVA de
 *    liquidación llama `scheduleSettlementRefresh()` directamente en este
 *    store.
 *  - `budgetScenarioStore.fetchScenarioDetail` (orquestador): re-hidrata el
 *    modo y resetea esta caché al cambiar de escenario.
 */

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

export const useBudgetIvaStore = defineStore('budgetIva', {
  state: () => ({
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
    }
  }),

  actions: {
    /**
     * Re-hidrata `ivaMode` desde la preferencia guardada del escenario
     * (frontend.03_14 D-FE14-1: persistido POR `idBudget` en localStorage,
     * default ON). Lo llama `fetchScenarioDetail` (budgetScenarioStore) en el
     * éxito; el editor no necesita hacer nada extra al cambiar de escenario.
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
      const scenario = useBudgetScenarioStore()
      // Single-flight SIEMPRE (spam del "Recalcular" ⇒ un solo GET, NFR-FE14-2):
      if (this.settlement.loading) return { ok: true }
      if (!force && this.settlement.loaded && this.settlement.budgetId === target) {
        return { ok: true }
      }
      const year = Number(scenario.currentScenario?.budget_year)
      const effectiveYear = Number.isInteger(year) ? year : null
      this.settlement.loading = true
      try {
        const response = await budgetPlanningService.getIvaSettlement(target, effectiveYear)
        // El escenario cambió mientras volaba: se descarta (la próxima lectura
        // —apertura del tab o mutation debounce— trae la verdad actual).
        if (scenario.currentScenario?.id_budget !== target) return { ok: true }
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
        scenario.handleAuth(classified)
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
     * Lo llaman las mutaciones de línea del `budgetScenarioStore` y —puente
     * AC-FE14-6— `budgetRulesStore` tras mutar el calendario IVA (los
     * `payment_due_date` y la existencia de períodos cambian la recurrencia).
     * No-op si no hay escenario abierto en `currentScenario`.
     * @param {number} [delayMs=SETTLEMENT_DEBOUNCE_MS]
     * @returns {void}
     */
    scheduleSettlementRefresh(delayMs = SETTLEMENT_DEBOUNCE_MS) {
      const scenario = useBudgetScenarioStore()
      const idBudget = scenario.currentScenario?.id_budget
      if (!idBudget) return
      if (settlementRefreshTimer) clearTimeout(settlementRefreshTimer)
      settlementRefreshTimer = setTimeout(() => {
        settlementRefreshTimer = null
        if (scenario.currentScenario?.id_budget !== idBudget) return
        void this.fetchIvaSettlement(idBudget, { force: true })
      }, delayMs)
    }
  }
})
