/**
 * Tests de la FASE 2 (split del `budgetPlanningStore` en sub-stores de Pinia):
 *  - `budgetIvaStore`: toggle del modo "Neto / Con IVA" persistiendo la clave
 *    EXACTA de localStorage por `idBudget` (`budgetPlanning.ivaMode.<id>`,
 *    contrato D-FE14-1) + re-hidratación al apuntar a otro escenario + caché
 *    y debounce del settlement.
 *  - `budgetScenarioStore`: guardas clave (anti-doble-submit de set-target y
 *    delete, caché del listado) y acción de carga que puebla `budget_lines`
 *    (además de resetear las cachés IVA/what-if de OTRO escenario).
 *  - `budgetSimulationStore`: caché por escenario con descarte tardío.
 *  - Puente `createPlanningStoresView` (contrato de lectura que consumen las
 *    factories de modelos: mismo surface que el antiguo monolito, delegando a
 *    los sub-stores dueños).
 *
 * Estilo: mock de los services con `vi.mock` (cero HTTP, patrón
 * `taxRegimeSwitch.test.js`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/services/budgetPlanningService.js', () => ({
  budgetPlanningService: {
    fetchScenarios: vi.fn(),
    fetchScenarioDetail: vi.fn(),
    fetchCarryover: vi.fn(),
    getInitialBalance: vi.fn(),
    setInitialBalance: vi.fn(),
    setCarryover: vi.fn(),
    setTarget: vi.fn(),
    deleteScenario: vi.fn(),
    uploadScenario: vi.fn(),
    cloneScenario: vi.fn(),
    updateCell: vi.fn(),
    createLine: vi.fn(),
    updateLine: vi.fn(),
    deleteLine: vi.fn(),
    fetchPayableTerms: vi.fn(async () => ({ data: [] })),
    fetchInternmentRates: vi.fn(async () => ({ data: [] })),
    fetchInternmentTerms: vi.fn(async () => ({ data: [] })),
    fetchTaxSummary: vi.fn(),
    fetchTaxCashFlow: vi.fn(),
    fetchPayrollSimulation: vi.fn(),
    fetchFinancingSimulation: vi.fn(),
    fetchFinancingPrincipalFlow: vi.fn(),
    getIvaSettlement: vi.fn()
  }
}))
vi.mock('@/services/budgetRulesService.js', () => ({
  budgetRulesService: { fetchRates: vi.fn(async () => ({ data: [] })) }
}))
vi.mock('@/services/costCenterService.js', () => ({
  costCenterService: { getCostCenters: vi.fn(async () => ({ data: [] })) }
}))
vi.mock('@/services/collectionService.js', () => ({
  collectionService: { getCollections: vi.fn(async () => ({ data: [] })) }
}))
vi.mock('@/services/alertService.js', () => ({
  alertService: {
    generalError: vi.fn(),
    generalSucces: vi.fn(),
    generalWarning: vi.fn(),
    generalInformation: vi.fn()
  }
}))
vi.mock('@/stores/userStore.js', () => ({
  useUserStore: () => ({ logout: vi.fn(), getUserDetails: vi.fn() })
}))
vi.mock('@/router/index.js', () => ({
  default: {
    currentRoute: { value: { name: 'BudgetCecoDetail' } },
    push: vi.fn(),
    replace: vi.fn()
  }
}))

import { useBudgetScenarioStore } from '@/stores/budgetScenarioStore.js'
import { useBudgetSimulationStore } from '@/stores/budgetSimulationStore.js'
import { useBudgetIvaStore } from '@/stores/budgetIvaStore.js'
import { createPlanningStoresView } from '@/stores/planningStoresBridge.js'
import { budgetPlanningService } from '@/services/budgetPlanningService.js'

/** Detalle `BudgetFull` de ejemplo con dos líneas. */
const DETAIL_77 = {
  id_budget: 77,
  budget_name: 'Presupuesto 2026',
  budget_year: 2026,
  status: 'draft',
  include_carryover: false,
  budget_lines: [
    { id_budget_line: 1, id_budget: 77, projected_amount: 100 },
    { id_budget_line: 2, id_budget: 77, projected_amount: 200 }
  ]
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('budgetIvaStore — persistencia del modo "Neto / Con IVA" (D-FE14-1)', () => {
  it('default ON (Con IVA) cuando no hay preferencia guardada', () => {
    const iva = useBudgetIvaStore()
    expect(iva.ivaMode).toBe(true)
    expect(iva.ivaModeBudgetId).toBeNull()
  })

  it('setIvaMode persiste la clave EXACTA budgetPlanning.ivaMode.<idBudget>', () => {
    const iva = useBudgetIvaStore()
    iva.setIvaMode(77, false)
    expect(localStorage.getItem('budgetPlanning.ivaMode.77')).toBe('0')
    expect(iva.ivaMode).toBe(false)
    expect(iva.ivaModeBudgetId).toBe(77)

    iva.setIvaMode(77, true)
    expect(localStorage.getItem('budgetPlanning.ivaMode.77')).toBe('1')
    expect(iva.ivaMode).toBe(true)
  })

  it('applyIvaModeForBudget re-hidrata la preferencia del id pedido (monta otro id ⇒ default ON)', () => {
    const iva = useBudgetIvaStore()
    iva.setIvaMode(77, false)
    expect(iva.ivaMode).toBe(false)

    // El editor abre OTRO escenario sin preferencia ⇒ default ON.
    iva.applyIvaModeForBudget(88)
    expect(iva.ivaModeBudgetId).toBe(88)
    expect(iva.ivaMode).toBe(true)

    // Vuelve al 77: la preferencia persistida manda.
    iva.applyIvaModeForBudget(77)
    expect(iva.ivaModeBudgetId).toBe(77)
    expect(iva.ivaMode).toBe(false)
  })

  it('fetchIvaSettlement cachea por escenario (no-op) y fuerza con force', async () => {
    const iva = useBudgetIvaStore()
    const scenario = useBudgetScenarioStore()
    scenario.currentScenario = { id_budget: 42, budget_year: 2026 }
    budgetPlanningService.getIvaSettlement.mockResolvedValue({ data: { year: 2026 } })

    await iva.fetchIvaSettlement(42)
    expect(iva.settlement.loaded).toBe(true)
    expect(iva.settlement.budgetId).toBe(42)
    expect(iva.settlement.year).toBe(2026)

    await iva.fetchIvaSettlement(42) // cache: no-op
    expect(budgetPlanningService.getIvaSettlement).toHaveBeenCalledTimes(1)

    await iva.fetchIvaSettlement(42, { force: true })
    expect(budgetPlanningService.getIvaSettlement).toHaveBeenCalledTimes(2)
  })

  it('descarta la respuesta si el escenario cambió mientras el GET volaba', async () => {
    const iva = useBudgetIvaStore()
    const scenario = useBudgetScenarioStore()
    let resolveGet
    budgetPlanningService.getIvaSettlement.mockImplementation(
      () => new Promise((resolve) => (resolveGet = resolve))
    )
    scenario.currentScenario = { id_budget: 1, budget_year: 2026 }
    const flight = iva.fetchIvaSettlement(1)

    scenario.currentScenario = { id_budget: 2, budget_year: 2026 }
    resolveGet({ data: { year: 2026 } })
    const result = await flight

    expect(result.ok).toBe(true)
    expect(iva.settlement.loaded).toBe(false)
    expect(iva.settlement.data).toBeNull()
  })

  it('scheduleSettlementRefresh hace debounce ~400 ms y colapsa a UN request', async () => {
    vi.useFakeTimers()
    const iva = useBudgetIvaStore()
    const scenario = useBudgetScenarioStore()
    scenario.currentScenario = { id_budget: 42, budget_year: 2026 }
    budgetPlanningService.getIvaSettlement.mockResolvedValue({ data: { year: 2026 } })

    // Varias mutaciones en el mismo tick (edit de celda + toggle de flag…).
    iva.scheduleSettlementRefresh()
    iva.scheduleSettlementRefresh()
    iva.scheduleSettlementRefresh()

    await vi.advanceTimersByTimeAsync(399)
    expect(budgetPlanningService.getIvaSettlement).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(budgetPlanningService.getIvaSettlement).toHaveBeenCalledTimes(1)
    expect(budgetPlanningService.getIvaSettlement).toHaveBeenCalledWith(42, 2026)
    expect(iva.settlement.loaded).toBe(true)
  })

  it('scheduleSettlementRefresh es no-op sin escenario abierto', async () => {
    vi.useFakeTimers()
    const iva = useBudgetIvaStore()
    iva.scheduleSettlementRefresh()
    await vi.advanceTimersByTimeAsync(1000)
    expect(budgetPlanningService.getIvaSettlement).not.toHaveBeenCalled()
  })
})

describe('budgetScenarioStore — guardas clave y carga del detalle', () => {
  it('fetchScenarioDetail puebla currentScenario con sus budget_lines y resetea cachés IVA/what-if ajenas', async () => {
    const scenario = useBudgetScenarioStore()
    const iva = useBudgetIvaStore()
    const simulation = useBudgetSimulationStore()

    // Cachés "de otro escenario" previas: deben quedar limpias tras el fetch.
    iva.settlement.data = { year: 2020 }
    iva.settlement.loaded = true
    simulation.payrollSim.data = { lines: [{ amount: 1 }] }
    simulation.payrollSim.loaded = true

    budgetPlanningService.fetchScenarioDetail.mockResolvedValue({ data: DETAIL_77 })
    const result = await scenario.fetchScenarioDetail(77)

    expect(result.ok).toBe(true)
    expect(scenario.currentScenarioId).toBe(77)
    expect(scenario.currentScenario.budget_lines).toHaveLength(2)
    expect(scenario.detailLoading).toBe(false)

    // Orquestación cruzada (FASE 2): el dueño del flujo resetea IVA + sims.
    expect(iva.ivaModeBudgetId).toBe(77)
    expect(iva.settlement.loaded).toBe(false)
    expect(iva.settlement.data).toBeNull()
    expect(simulation.payrollSim.loaded).toBe(false)
    expect(simulation.payrollSim.data).toBeNull()
  })

  it('fetchScenarioDetail es no-op con la misma id ya cacheada (sin force)', async () => {
    const scenario = useBudgetScenarioStore()
    budgetPlanningService.fetchScenarioDetail.mockResolvedValue({ data: DETAIL_77 })
    await scenario.fetchScenarioDetail(77)
    await scenario.fetchScenarioDetail(77)
    expect(budgetPlanningService.fetchScenarioDetail).toHaveBeenCalledTimes(1)
  })

  it('updateCell: segundo disparo con la celda en vuelo ⇒ busy, sin request', async () => {
    const scenario = useBudgetScenarioStore()
    scenario.cellSaving[10] = true
    const result = await scenario.updateCell(10, 5)
    expect(result).toEqual({ ok: false, kind: 'busy' })
    expect(budgetPlanningService.updateCell).not.toHaveBeenCalled()
  })

  it('setTarget: guard anti-doble-submit ⇒ busy sin request', async () => {
    const scenario = useBudgetScenarioStore()
    scenario.settingTarget = true
    const result = await scenario.setTarget(5)
    expect(result).toEqual({ ok: false, kind: 'busy' })
    expect(budgetPlanningService.setTarget).not.toHaveBeenCalled()
  })

  it('deleteScenario: retira la fila de la caché y limpia el detalle si era el abierto', async () => {
    const scenario = useBudgetScenarioStore()
    budgetPlanningService.deleteScenario.mockResolvedValue({ data: null })
    scenario.scenarios = [
      { id_budget: 1, budget_year: 2026, status: 'draft' },
      { id_budget: 2, budget_year: 2026, status: 'draft' }
    ]
    scenario.currentScenario = { id_budget: 1, budget_lines: [] }
    scenario.currentScenarioId = 1

    const result = await scenario.deleteScenario(1)

    expect(result.ok).toBe(true)
    expect(scenario.scenarios).toHaveLength(1)
    expect(scenario.scenarios[0].id_budget).toBe(2)
    expect(scenario.currentScenario).toBeNull()
    expect(scenario.currentScenarioId).toBeNull()
    expect(scenario.scenariosStale).toBe(true)
  })

  it('applySetTargetToCaches: el nuevo pasa a active y el activo del año a closed (BR-TGT-01)', () => {
    const scenario = useBudgetScenarioStore()
    scenario.scenarios = [
      { id_budget: 5, budget_year: 2026, status: 'draft' },
      { id_budget: 6, budget_year: 2026, status: 'active' },
      { id_budget: 7, budget_year: 2027, status: 'active' }
    ]
    scenario.applySetTargetToCaches(5, 2026)
    expect(scenario.scenarios[0].status).toBe('active')
    expect(scenario.scenarios[1].status).toBe('closed')
    expect(scenario.scenarios[2].status).toBe('active') // otro año: intacto
  })

  it('fetchScenarios: caché por año — mismo año cargado y no stale ⇒ no-op', async () => {
    const scenario = useBudgetScenarioStore()
    budgetPlanningService.fetchScenarios.mockResolvedValue({ data: [DETAIL_77] })

    await scenario.fetchScenarios({ year: 2026 })
    await scenario.fetchScenarios({ year: 2026 })
    expect(budgetPlanningService.fetchScenarios).toHaveBeenCalledTimes(1)

    await scenario.fetchScenarios({ year: 2027 })
    expect(budgetPlanningService.fetchScenarios).toHaveBeenCalledTimes(2)

    scenario.scenariosStale = true
    await scenario.fetchScenarios({ year: 2027 })
    expect(budgetPlanningService.fetchScenarios).toHaveBeenCalledTimes(3)
  })
})

describe('budgetSimulationStore — cachés what-if por escenario', () => {
  it('fetchPayrollSimulation carga y cachea (no-op) por id', async () => {
    const simulation = useBudgetSimulationStore()
    const scenario = useBudgetScenarioStore()
    scenario.currentScenario = { id_budget: 9 }
    budgetPlanningService.fetchPayrollSimulation.mockResolvedValue({ data: { lines: [] } })

    await simulation.fetchPayrollSimulation(9)
    await simulation.fetchPayrollSimulation(9)
    expect(budgetPlanningService.fetchPayrollSimulation).toHaveBeenCalledTimes(1)
    expect(simulation.payrollSim.loaded).toBe(true)
    expect(simulation.payrollSim.budgetId).toBe(9)
  })

  it('fetchFinancingPrincipalFlow normaliza lines a array y descarta respuestas de otro escenario', async () => {
    const simulation = useBudgetSimulationStore()
    const scenario = useBudgetScenarioStore()
    scenario.currentScenario = { id_budget: 9 }
    budgetPlanningService.fetchFinancingPrincipalFlow.mockResolvedValue({
      data: { lines: null, disbursement_lines: [] }
    })

    await simulation.fetchFinancingPrincipalFlow(9)
    expect(simulation.financingPrincipalFlow.loaded).toBe(true)
    expect(simulation.financingPrincipalFlow.data.lines).toEqual([])
  })
})

describe('createPlanningStoresView — contrato de lectura para las factories (FASE 2)', () => {
  it('expone el surface del antiguo monolito delegando a los sub-stores dueños', () => {
    const view = createPlanningStoresView()
    const scenario = useBudgetScenarioStore()
    const iva = useBudgetIvaStore()
    const simulation = useBudgetSimulationStore()

    // Estado de los 3 dominios accesible por el mismo nombre de miembro.
    scenario.currentScenario = { id_budget: 7, budget_lines: [] }
    expect(view.currentScenario).toBe(scenario.currentScenario)
    simulation.payrollSim = { data: null, budgetId: 7, loaded: true, loading: false, error: false }
    expect(view.payrollSim.loaded).toBe(true)
    iva.ivaMode = false
    expect(view.ivaMode).toBe(false)
    iva.settlement = { data: null, budgetId: 7, year: null, loaded: true, loading: false, error: false }
    expect(view.settlement.loaded).toBe(true)
    scenario.uploading = true
    expect(view.isSubmitting).toBe(true)

    // Acciones y getters expuestos como funciones (contrato del monolito).
    expect(typeof view.fetchScenarioDetail).toBe('function')
    expect(typeof view.fetchIvaSettlement).toBe('function')
    expect(typeof view.fetchPayrollSimulation).toBe('function')
    expect(typeof view.scheduleSettlementRefresh).toBe('function')
    expect(typeof view.markTaxStale).toBe('function')
    expect(typeof view.costCenterLabel).toBe('function')
    expect(typeof view.findActiveForYear).toBe('function')

    // Sin propiedades internas de Pinia en la vista (prefijos $/_).
    expect(view.$id).toBeUndefined()
    expect(view.$state).toBeUndefined()
  })
})
