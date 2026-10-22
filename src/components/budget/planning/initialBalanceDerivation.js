/**
 * initialBalanceDerivation — derivación client-side del VALOR por arrastre de
 * los saldos iniciales (FE-S7-INITBAL, RF-FE-04; autoridad
 * `frontend.03_22` + `backend.02_25` SA-1: el backend NO deriva el valor, el
 * FE es la fuente única de las fórmulas con SU motor `cashFlowPivot`).
 *
 * RUTA ELEGIDA para cargar los datos del escenario fuente (documentada por
 * RF-FE-04 con el spec: "no inventar endpoints nuevos en FE"): se reutilizan
 * los MISMOS endpoints/canales con los que la app carga un escenario por su
 * id (los que poblaron la grilla de esa fuente), vía `budgetPlanningService`:
 *
 *   - `fetchScenarioDetail(sourceId)`           → `budget_lines` + año fuente
 *   - `getIvaSettlement(sourceId, sourceYear)`  → pagos de liquidación IVA
 *   - `fetchTaxCashFlow(sourceId)`              → buckets de impuestos (FE-S17)
 *   - `fetchFinancingPrincipalFlow(sourceId)`   → capital + desembolsos (BE-S12)
 *   - `fetchCarryover(sourceId)`                → líneas de arrastre de la
 *     fuente (si el propio N−1 arrastra a N−2: se respeta para que su cierre
 *     coincida con lo que su editor muestra)
 *   - `fetchPayrollSimulation`/`fetchFinancingSimulation` (fuente NO activa)
 *     → las mismas filas what-if que agrega `BudgetGridEditor.scenarioView`.
 *
 * Los catálogos (CECO, tasas de costo, términos de pago, dúo de internación)
 * son cachés A5 de la sesión y viven YA en el store real: se leen de ahí
 * (cero requests extra). El modo IVA se toma del store real para que el
 * derivado signifique lo mismo que la vista Flujo de la fuente.
 *
 * SIMPLIFICACIÓN DOCUMENTADA (sin recursión de config): el escenario fuente
 * corre con semillas de saldo inicial en 0 (su PROPIA config de saldo inicial
 * no se consulta ni se recursa — `initialBalanceEffective` no existe en el
 * store sintético). La derivación es dinámica (sin snapshot, BR-IB-05): se
 * recalcula cada vez que el editor lo pide.
 *
 * Errores: la función NUNCA lanza — cualquier fallo de fetch (red, 404 "la
 * fuente ya no existe", 422, 5xx) ⇒ `null` y la UI degrada (RF-FE-05: el
 * input manual queda usable, el chip muestra su nota).
 */

import { createCashFlowPivotModel } from '@/components/budget/planning/cashFlowPivot.js'
import { budgetPlanningService } from '@/services/budgetPlanningService.js'

/**
 * Mapeo de las filas what-if: réplica EXACTA de `BudgetGridEditor`
 * (`simLines`/`financingSimLines` → filas virtuales con `is_simulated`).
 * @param {object} base `BudgetFull` de la fuente
 * @param {object|null} payrollSim {PayrollSimulationOut|null}
 * @param {object|null} financingSim
 * @returns {object} `BudgetFull` + `budget_lines` extendidas
 */
function withSimulatedLines(base, payrollSim, financingSim) {
  if (!base) return base
  const extra = []
  if (base.status !== 'active') {
    if (payrollSim?.lines) {
      for (const l of payrollSim.lines) {
        extra.push({
          id_budget_line: null,
          id_budget: base.id_budget,
          id_cost_center: l.id_cost_center,
          id_collection: l.id_collection ?? null,
          line_type: 'expense',
          behavior_type: 'fixed',
          budget_date: l.budget_date,
          payment_date: l.payment_date ?? null,
          projected_amount: Number(l.amount),
          has_iva: false,
          description: l.description,
          cost_component_code: l.cost_component_code,
          variable_rate: null,
          source_engine: 'collaborator_cost_sim',
          id_collaborator: l.id_collaborator,
          is_simulated: true
        })
      }
    }
    if (financingSim?.lines) {
      for (const line of financingSim.lines) {
        extra.push({
          id_budget_line: null,
          id_budget: base.id_budget,
          id_cost_center: line.id_cost_center,
          id_collection: null,
          line_type: 'expense',
          behavior_type: 'fixed',
          budget_date: line.budget_date,
          payment_date: line.payment_date ?? null,
          projected_amount: Number(line.amount),
          has_iva: false,
          description: line.description || line.component_name || 'Gasto de financiación',
          cost_component_code: line.cost_component_code,
          variable_rate: null,
          source_engine: 'financing_credit_sim',
          id_financing_credit: line.id_financing_credit,
          id_financing_credit_installment: line.id_financing_credit_installment,
          is_simulated: true
        })
      }
    }
  }
  if (!extra.length) return base
  return {
    ...base,
    budget_lines: [...(base.budget_lines ?? []), ...extra]
  }
}

/**
 * Corre el motor (`createCashFlowPivotModel`) sobre los datos del escenario
 * fuente con un store SINTÉTICO (solo lectura, sin Pinia nuevo — RF-FE-04).
 * @param {object} realStore `useBudgetPlanningStore()` (catálogos A5 compartidos)
 * @param {object} sourceMetrica `carryover_source` del GET: `{id_budget, budget_name, budget_year, status}`
 * @param {object} fuenteData paquete precargado (ver `deriveInitialBalanceFromSource`)
 * @returns {{ cash: number, warehouse: number }}
 */
function runEngineOnSource(realStore, sourceMetrica, fuenteData) {
  const base = fuenteData.detail?.data ?? null
  if (!base || typeof base !== 'object') {
    throw new Error('source detail missing')
  }
  const settled = fuenteData.settlement?.data ?? null
  const taxCashFlow = fuenteData.taxCashFlow?.data ?? null
  const principalFlow = fuenteData.principal?.data ?? null
  const carryData = fuenteData.carry?.data ?? null
  const payrollSim = fuenteData.payrollSim?.data ?? null
  const financingSim = fuenteData.financingSim?.data ?? null

  /** "store" sintético para `createCashFlowPivotModel` (solo lo que lee). */
  const syntheticStore = {
    ivaMode: realStore.ivaMode === true,
    costCenters: realStore.costCenters,
    lineCostRates: realStore.lineCostRates,
    costCenterLabel: (id) => realStore.costCenterLabel(id),
    payableTerms: realStore.payableTerms,
    payableTermsLoaded: realStore.payableTermsLoaded,
    payableTermsError: realStore.payableTermsError,
    payableTermsByLine: realStore.payableTermsByLine,
    internmentRates: realStore.internmentRates,
    internmentTerms: realStore.internmentTerms,
    internmentCatalogLoaded: realStore.internmentCatalogLoaded,
    internmentCatalogError: realStore.internmentCatalogError,
    internmentRateByLine: realStore.internmentRateByLine,
    internmentTermsByLine: realStore.internmentTermsByLine,
    settlement: { data: settled },
    tax: { cashFlow: taxCashFlow },
    carryover: {
      enabled: carryData?.enabled === true,
      source: carryData?.source ?? null,
      lines: Array.isArray(carryData?.lines) ? carryData.lines : []
    }
    // SIN `initialBalanceEffective` ⇒ las semillas del motor quedan en 0
    // (la fuente corre SIN su propia config de saldo inicial — ver la
    // simplificación documentada en el encabezado).
  }

  const scenarioView = withSimulatedLines(base, payrollSim, financingSim)
  const model = createCashFlowPivotModel({
    scenario: () => scenarioView,
    financingPrincipalLines: () => (Array.isArray(principalFlow?.lines) ? principalFlow.lines : []),
    financingDisbursementLines: () =>
      Array.isArray(principalFlow?.disbursement_lines) ? principalFlow.disbursement_lines : [],
    store: syntheticStore
  })

  const cash = Number(model.resumen.value?.acumulado?.[11])
  const warehouse = Number(model.bodegaMes.value?.[11])
  if (!Number.isFinite(cash) || !Number.isFinite(warehouse)) {
    throw new Error('source derived values not finite')
  }
  return { cash, warehouse }
}

/**
 * Deriva los saldos de cierre de diciembre (año N−1 = fuente):
 *  - `cash`: acumulado de caja al cierre de dic de la fuente (resumen.acumulado[11]).
 *  - `warehouse`: `bodega[dic]` de la fuente con la fórmula del motor.
 * @param {object} realStore `useBudgetPlanningStore()`
 * @param {object} sourceMetrica `carryover_source` del GET de saldos
 * @returns {Promise<{ cash: number, warehouse: number }|null>} null en fallo
 */
export async function deriveInitialBalanceFromSource(realStore, sourceMetrica) {
  const sourceId = Number(sourceMetrica?.id_budget)
  if (!Number.isFinite(sourceId) || sourceId <= 0) return null
  try {
    // 7 canales preguntados para el fetch total; allSettled: el fallo de uno
    // no tira la derivación (solo `detail` es bloqueante).
    const [detail, settlement, taxCashFlow, principal, carry, payrollSim, financingSim] =
      await Promise.allSettled([
        budgetPlanningService.fetchScenarioDetail(sourceId),
        budgetPlanningService.getIvaSettlement(sourceId, sourceMetrica.budget_year ?? null),
        budgetPlanningService.fetchTaxCashFlow(sourceId),
        budgetPlanningService.fetchFinancingPrincipalFlow(sourceId),
        budgetPlanningService.fetchCarryover(sourceId),
        // Los what-if devuelven 400 p/ escenarios activos: `allSettled` y el
        // mapeo solo los usa si la fuente NO es activa (idéntico al editor).
        budgetPlanningService.fetchPayrollSimulation(sourceId),
        budgetPlanningService.fetchFinancingSimulation(sourceId)
      ])
    // Si el DETALLE falló (fuente borrada /red), no se puede derivar.
    if (detail.status !== 'fulfilled') return null
    return runEngineOnSource(realStore, sourceMetrica, {
      detail: detail.status === 'fulfilled' ? detail.value : null,
      settlement: settlement.status === 'fulfilled' ? settlement.value : null,
      taxCashFlow: taxCashFlow.status === 'fulfilled' ? taxCashFlow.value : null,
      principal: principal.status === 'fulfilled' ? principal.value : null,
      carry: carry.status === 'fulfilled' ? carry.value : null,
      payrollSim: payrollSim.status === 'fulfilled' ? payrollSim.value : null,
      financingSim: financingSim.status === 'fulfilled' ? financingSim.value : null
    })
  } catch {
    // Degradación (RF-FE-05): sin derivado la UI usa el manual, nunca bloquea.
    return null
  }
}
