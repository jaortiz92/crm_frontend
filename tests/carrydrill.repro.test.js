/**
 * REPRO one-off bug FE-S21: grupo "Arrastre N-1" vacío en CecoDetailView
 * (presupuesto 121, fuente 576; CECO 000001 => 2 purchase; CECO 000401 => 3 line).
 * Archivo TEMPORAL — se elimina tras el diagnóstico.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import fixtureCarry from '../_repro/services/fixture_carry.json'

const CATALOG = [
  { cost_center_code: '000001', cost_center_name: 'Facturacion Kyly', id_zone: 100, id_area: 8, id_line: 1, is_active: true, description: '', id_cost_center: 185 },
  { cost_center_code: '000401', cost_center_name: 'Facturacion Centro-Llanos (Zona 4) Kyly', id_zone: 4, id_area: 8, id_line: 1, is_active: true, description: '', id_cost_center: 172 },
  { cost_center_code: '000002', cost_center_name: 'Facturacion Tinta', id_zone: 100, id_area: 8, id_line: 2, is_active: true, description: '', id_cost_center: 186 }
]

const SCENARIOS = {
  121: {
    id_budget: 121,
    budget_name: 'Presupuesto 2027',
    budget_year: 2027,
    status: 'active',
    include_carryover: true,
    budget_lines: [
      { id_budget_line: 100, id_budget: 121, id_cost_center: 185, line_type: 'income', behavior_type: 'fixed', budget_date: '2027-01-10', payment_date: '2027-01-10', projected_amount: 1000, has_iva: false, description: 'own sales' },
      { id_budget_line: 101, id_budget: 121, id_cost_center: 172, line_type: 'income', behavior_type: 'fixed', budget_date: '2027-02-10', payment_date: '2027-02-10', projected_amount: 50, has_iva: false, description: 'own sales' }
    ]
  }
}

// Mocks de transporte ANTES de importar la vista/store.
vi.mock('@/services/budgetPlanningService.js', () => ({
  budgetPlanningService: {
    fetchScenarioDetail: vi.fn(async (id) => ({ data: SCENARIOS[id] ?? null })),
    fetchCarryover: vi.fn(async () => ({ data: fixtureCarry })),
    getInitialBalance: vi.fn(async () => ({ data: null })),
    setInitialBalance: vi.fn(async () => ({ data: SCENARIOS[121] })),
    setCarryover: vi.fn(async () => ({ data: SCENARIOS[121] })),
    setTarget: vi.fn(async () => ({ data: {} })),
    fetchPayableTerms: vi.fn(async () => ({ data: [] })),
    fetchInternmentRates: vi.fn(async () => ({ data: [] })),
    fetchInternmentTerms: vi.fn(async () => ({ data: [] })),
    fetchTaxSummary: vi.fn(async () => ({ data: null })),
    fetchTaxCashFlow: vi.fn(async () => ({ data: null })),
    fetchPayrollSimulation: vi.fn(async () => {
      throw Object.assign(new Error('400'), { response: { status: 400, data: { detail: 'active' } } })
    }),
    fetchFinancingSimulation: vi.fn(async () => {
      throw Object.assign(new Error('400'), { response: { status: 400, data: { detail: 'active' } } })
    }),
    fetchFinancingPrincipalFlow: vi.fn(async () => ({ data: null }))
  }
}))
vi.mock('@/services/budgetRulesService.js', () => ({ budgetRulesService: { fetchRates: async () => ({ data: [] }) } }))
vi.mock('@/services/costCenterService.js', () => ({ costCenterService: { getCostCenters: async () => ({ data: CATALOG }) } }))
vi.mock('@/services/collectionService.js', () => ({ collectionService: { getCollections: async () => ({ data: [] }) } }))
vi.mock('@/services/alertService.js', () => ({
  alertService: { generalError: vi.fn(), generalSucces: vi.fn(), generalWarning: vi.fn(), generalQuestion: vi.fn(), generalInformation: vi.fn(), generalQuestionThree: vi.fn(), generalInput: vi.fn() }
}))

const QUERY = { tab: 'flow', carry: 'purchase' }
const activeParams = { idBudget: '121', costCenterCode: '000001' }
const routeMock = { params: activeParams, query: QUERY }
vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  RouterLink: { name: 'RouterLink', props: ['to'], template: '<a :href="typeof to === \'object\' ? to.fullPath : to"><slot /></a>' }
}))
vi.mock('@/router/index.js', () => ({
  default: {
    currentRoute: {
      value: { name: 'BudgetCecoDetail', query: { tab: 'flow', carry: 'purchase' } }
    },
    push: vi.fn(),
    replace: vi.fn()
  }
}))
vi.mock('@/stores/userStore.js', () => ({
  useUserStore: () => ({ token: 't', username: 'claudiaramirez', logout: vi.fn(), getUserDetails: vi.fn() })
}))

import CecoDetailView from '@/views/budget/planning/CecoDetailView.vue'

import { createPinia } from 'pinia'

describe('REPRO FE-S21 empty carry group', () => {
  it('CECO 000401 (172) con carry=line — grupo visible con 3 movimientos', async () => {
    QUERY.carry = 'line'
    activeParams.costCenterCode = '000401'
    const wrapper = mount(CecoDetailView, { global: { plugins: [createPinia()] } })
    await flushPromises()
    const group = wrapper.find('.cd-carry-group')
    // eslint-disable-next-line no-console
    console.log('GROUP TABLE ROWS:', wrapper.findAll('.cd-carry-group table tbody tr').length)
    console.log('EMPTY MSG:', wrapper.find('.cd-carry-empty').exists())
    expect(group.exists()).toBe(true)
    expect(wrapper.findAll('.cd-carry-group table tbody tr')).toHaveLength(3)
  })
})
