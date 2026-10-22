/** Mocks EXACT-paths del repro headless (cwd crm_frontend): solo los módulos
 * que el store real importa y que no interesan here. */
import fixtureCarry from './fixture_carry.json' with { type: 'json' }

const FIXTURE_DETAIL = {
  id_budget: 121,
  budget_name: '121',
  budget_year: 2027,
  status: 'active',
  include_carryover: true,
  budget_lines: [
    { id_budget_line: 1, id_budget: 121, id_cost_center: 185, line_type: 'income', behavior_type: 'fixed', budget_date: '2027-01-10', payment_date: '2027-01-10', projected_amount: 1000, has_iva: false, description: 'own' },
    { id_budget_line: 2, id_budget: 121, id_cost_center: 172, line_type: 'income', behavior_type: 'fixed', budget_date: '2027-02-10', payment_date: '2027-02-10', projected_amount: 50, has_iva: false, description: 'own' }
  ]
}

export const budgetPlanningService = {
  fetchScenarioDetail: async () => ({ data: FIXTURE_DETAIL }),
  fetchCarryover: async () => ({ data: fixtureCarry }),
  getInitialBalance: async () => ({ data: null }),
  setInitialBalance: async () => ({ data: FIXTURE_DETAIL }),
  setCarryover: async () => ({ data: FIXTURE_DETAIL }),
  fetchTaxSummary: async () => ({ data: null }),
  fetchTaxCashFlow: async () => ({ data: null }),
  fetchPayrollSimulation: async () => {
    const e = new Error('active')
    e.response = { status: 400, data: { detail: 'active' } }
    throw e
  },
  fetchFinancingSimulation: async () => {
    const e = new Error('active')
    e.response = { status: 400, data: { detail: 'active' } }
    throw e
  },
  fetchFinancingPrincipalFlow: async () => ({ data: null }),
  ensureCatalogsSafe: async () => Promise.all([]),
  fetchPayableTerms: async () => ({ data: [] }),
  fetchInternmentRates: async () => ({ data: [] }),
  fetchInternmentTerms: async () => ({ data: [] })
}

export default budgetPlanningService
