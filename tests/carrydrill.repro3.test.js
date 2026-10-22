/**
 * REPRO one-off ronda 3 (FE-S21): deep-link con detalle REAL del 121 (status closed
 * + 36 líneas propias reales) + carryover REAL (269 líneas). TEMPORAL.
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import carryReal from '../_repro/carryReproData.json'
import catalog from '../_repro/carryReproData.cat.json'

const scenarioReal = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '_repro', 'carryReproDetail.json'), 'utf8').replace(/^\uFEFF/, '')
)

vi.mock('@/services/budgetPlanningService.js', () => ({
  budgetPlanningService: {
    fetchScenarioDetail: vi.fn(async () => ({ data: scenarioReal })),
    fetchCarryover: vi.fn(async () => ({ data: carryReal })),
    getInitialBalance: vi.fn(async () => ({ data: null })),
    setInitialBalance: vi.fn(async () => ({ data: scenarioReal })),
    setCarryover: vi.fn(async () => ({ data: scenarioReal })),
    setTarget: vi.fn(async () => ({ data: {} })),
    fetchPayableTerms: vi.fn(async () => ({ data: [] })),
    fetchInternmentRates: vi.fn(async () => ({ data: [] })),
    fetchInternmentTerms: vi.fn(async () => ({ data: [] })),
    fetchTaxSummary: vi.fn(async () => ({ data: null })),
    fetchTaxCashFlow: vi.fn(async () => ({ data: null })),
    fetchPayrollSimulation: vi.fn(async () => ({ data: { lines: [] } })),
    fetchFinancingSimulation: vi.fn(async () => ({ data: { lines: [] } })),
    fetchFinancingPrincipalFlow: vi.fn(async () => ({ data: null }))
  }
}))
vi.mock('@/services/budgetRulesService.js', () => ({ budgetRulesService: { fetchRates: async () => ({ data: [] }) } }))
vi.mock('@/services/costCenterService.js', () => ({ costCenterService: { getCostCenters: async () => ({ data: catalog }) } }))
vi.mock('@/services/collectionService.js', () => ({ collectionService: { getCollections: async () => ({ data: [] }) } }))
vi.mock('@/services/alertService.js', () => ({
  alertService: { generalError: vi.fn(), generalSucces: vi.fn(), generalWarning: vi.fn(), generalQuestion: vi.fn(), generalInformation: vi.fn(), generalQuestionThree: vi.fn(), generalInput: vi.fn() }
}))

const { activeParams, QUERY, routeMock } = vi.hoisted(() => ({
  activeParams: { idBudget: '121', costCenterCode: '000001' },
  QUERY: { tab: 'flow', carry: 'purchase' },
  routeMock: { params: null, query: null }
}))
routeMock.params = activeParams
routeMock.query = QUERY

vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  RouterLink: { name: 'RouterLink', props: ['to'], template: '<a :href="typeof to === \'object\' ? to.fullPath : to"><slot /></a>' }
}))
vi.mock('@/router/index.js', () => ({
  default: { currentRoute: { value: { name: 'BudgetCecoDetail', query: QUERY } }, push: vi.fn(), replace: vi.fn() }
}))
vi.mock('@/stores/userStore.js', () => ({
  useUserStore: () => ({ token: 't', username: 'claudiaramirez', logout: vi.fn(), getUserDetails: vi.fn() })
}))

import CecoDetailView from '@/views/budget/planning/CecoDetailView.vue'
import { useBudgetPlanningStore } from '@/stores/budgetPlanningStore.js'
import { createPinia } from 'pinia'

describe('REPRO ronda 3 — race single-flight del arrastre (ENMIENDA v1.2)', () => {
  it('el deep-link tras un vuelo de OTRO escenario deja la caché con líneas del 121', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useBudgetPlanningStore(pinia)
    const { budgetPlanningService } = await import('@/services/budgetPlanningService.js')
    let release576
    const deferred576 = new Promise((resolve) => {
      release576 = resolve
    })
    budgetPlanningService.fetchCarryover.mockImplementation(async (id) => {
      if (id === 576) return deferred576.then(() => ({ data: { source: null, lines: [], unavailable_reason: 'no_source' } }))
      return { data: carryReal }
    })
    // 1) vuelo en curso para el escenario FUENTE (576), `currentScenario` = 576
    store.currentScenario = { id_budget: 576, budget_year: 2026 }
    store.currentScenarioId = 576
    const flight576 = store.fetchCarryover(576)
    expect(store.carryover.loading).toBe(true)
    // 2) el usuario navega al deep-link del 121: el detalle cambia el escenario
    //    y pide el arrastre MIENTRAS el vuelo anterior sigue en el aire
    store.currentScenario = { id_budget: 121, budget_year: 2027 }
    store.currentScenarioId = 121
    const flight121 = store.fetchCarryover(121)
    await flushPromises()
    // sin el fix: el dedupe `carryover.loading` tranquilamente NO-OPea y el vuelo del
    // 576 se descarta ⇒ caché vacía (`lines.length === 0`) con `loaded: false`.
    await release576()
    await Promise.all([flight576, flight121])
    expect(store.carryover.lines.length).toBe(269)
    expect(store.carryover.loaded).toBe(true)
  })
})

describe('REPRO ronda 3 — deep-link con detalle REAL (closed)', () => {
  it('URL A: CECO 000001 (preset purchase) — grupo con 2 movimientos', async () => {
    activeParams.costCenterCode = '000001'
    QUERY.carry = 'purchase'
    const wrapper = mount(CecoDetailView, { global: { plugins: [createPinia()] } })
    await flushPromises()
    const rows = wrapper.findAll('.cd-carry-group table tbody tr')
    // eslint-disable-next-line no-console
    console.log('URL A rows:', rows.length, '| count label:', wrapper.find('.cd-carry-count').text(), '| toolbar:', wrapper.find('.cd-carry-title').text())
    expect(wrapper.find('.cd-carry-group').exists()).toBe(true)
    expect(rows.length).toBe(2)
  })

  it('URL B: CECO 000401 (preset line) — grupo con 3 movimientos', async () => {
    activeParams.costCenterCode = '000401'
    QUERY.carry = 'line'
    const wrapper = mount(CecoDetailView, { global: { plugins: [createPinia()] } })
    await flushPromises()
    const rows = wrapper.findAll('.cd-carry-group table tbody tr')
    // eslint-disable-next-line no-console
    console.log('URL B rows:', rows.length, '| count label:', wrapper.find('.cd-carry-count').text())
    expect(wrapper.find('.cd-carry-group').exists()).toBe(true)
    expect(rows.length).toBe(3)
  })
})
