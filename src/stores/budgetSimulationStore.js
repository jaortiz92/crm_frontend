import { defineStore } from 'pinia'
import { budgetPlanningService } from '@/services/budgetPlanningService.js'
// FASE 2 (split del `budgetPlanningStore`): la clasificación de errores
// (`classifyPlanningError`) y el patrón de sesión (`handleAuth`) viven en el
// sub-store de escenario, dueño del convenio compartido por los 3 sub-stores.
// El import es circular con `budgetScenarioStore.js` (seguro: los bindings
// SOLO se referencian dentro de cuerpos de función, nunca a nivel de módulo).
import { classifyPlanningError, useBudgetScenarioStore } from '@/stores/budgetScenarioStore.js'

/**
 * DOMINIO WHAT-IF (simulaciones) del Módulo de Planeación (BE-S11/BE-S12) —
 * FASE 2: sub-store `budgetSimulation` extraído del `budgetPlanningStore`
 * (mismo comportamiento byte-a-byte; solo cambió el ownership del estado y
 * el wiring).
 *
 * DOMINA (3 cachés read-only por escenario, con descarte de respuestas
 * tardías y degradación silenciosa banner/reintento — NFR-FE14-3):
 *  - `payrollSim`: `PayrollSimulationOut` de escenarios NO activos (BE-S11).
 *    Un escenario ACTIVO jamás la consume (AC-SIM-2: ni una línea simulada
 *    junto a las reales del motor).
 *  - `financingSim`: gastos de interés/seguro what-if en escenarios no
 *    activos (BE-S12).
 *  - `financingPrincipalFlow`: flujo de capital del schedule activo
 *    (capital + desembolsos); separado de toda línea P&L y válido para
 *    active/draft/closed.
 *
 * SE ACOPLA CON:
 *  - `budgetScenarioStore`: lee el escenario abierto (`currentScenario`) para
 *    el guard de descarte de respuestas tardías; reusa `classifyPlanningError`
 *    y `handleAuth` (patrón de sesión).
 *  - `budgetScenarioStore.fetchScenarioDetail` (orquestador): resetea las
 *    tres cachés al cambiar de escenario (nada what-if de OTRO escenario se
 *    asoma).
 */

export const useBudgetSimulationStore = defineStore('budgetSimulation', {
  state: () => ({
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
    }
  }),

  actions: {
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
      const scenario = useBudgetScenarioStore()
      if (this.payrollSim.loading) return { ok: true }
      if (!force && this.payrollSim.loaded && this.payrollSim.budgetId === target) {
        return { ok: true }
      }
      this.payrollSim.loading = true
      try {
        const response = await budgetPlanningService.fetchPayrollSimulation(target)
        if (scenario.currentScenario?.id_budget !== target) return { ok: true }
        const data = response?.data ?? null
        this.payrollSim.data = data && typeof data === 'object' ? data : null
        this.payrollSim.budgetId = target
        this.payrollSim.loaded = true
        this.payrollSim.error = false
        return { ok: true }
      } catch (err) {
        const classified = classifyPlanningError(err)
        scenario.handleAuth(classified)
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
      const scenario = useBudgetScenarioStore()
      if (this.financingSim.loading) return { ok: true }
      if (!force && this.financingSim.loaded && this.financingSim.budgetId === target) {
        return { ok: true }
      }
      this.financingSim.loading = true
      try {
        const response = await budgetPlanningService.fetchFinancingSimulation(target)
        if (scenario.currentScenario?.id_budget !== target) return { ok: true }
        const data = response?.data ?? null
        this.financingSim.data = data && typeof data === 'object' ? data : null
        this.financingSim.budgetId = target
        this.financingSim.loaded = true
        this.financingSim.error = false
        return { ok: true }
      } catch (err) {
        const classified = classifyPlanningError(err)
        scenario.handleAuth(classified)
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
      const scenario = useBudgetScenarioStore()
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
        if (scenario.currentScenario?.id_budget !== target) return { ok: true }
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
        scenario.handleAuth(classified)
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
