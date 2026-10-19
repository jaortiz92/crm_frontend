import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// ─── mocks de módulos con efectos externos ───
vi.mock('@/services/budgetTaxService.js', () => ({
  budgetTaxService: {
    getProfiles: vi.fn(),
    getRates: vi.fn(),
    getCalendar: vi.fn(),
    createProfile: vi.fn(),
    updateProfile: vi.fn(),
    createRate: vi.fn(),
    updateRate: vi.fn(),
    createCalendarPeriod: vi.fn(),
    updateCalendarPeriod: vi.fn(),
    deleteCalendarPeriod: vi.fn(),
    getAssumptions: vi.fn(),
    updateAssumptions: vi.fn(),
    calculate: vi.fn(),
    getSummary: vi.fn(),
    getComparison: vi.fn(),
    getCashFlow: vi.fn()
  }
}))

vi.mock('@/stores/budgetPlanningStore.js', () => ({
  useBudgetPlanningStore: () => ({
    currentScenarioId: 571,
    currentScenario: { id_budget: 571, budget_year: 2026, budget_lines: [] },
    fetchScenarioDetail: vi.fn(async () => ({ ok: true })),
    markTaxStale: vi.fn()
  })
}))

vi.mock('@/stores/userStore.js', () => ({
  useUserStore: () => ({
    token: 'test-token',
    user: { role: { role_name: 'Administrador', access_type: 'all' } },
    hasPermission: () => true,
    hasRole: () => true
  })
}))

import TaxConfigurationForm from '@/components/budget/taxes/TaxConfigurationForm.vue'
import BudgetTaxAssumptionsForm from '@/components/budget/taxes/BudgetTaxAssumptionsForm.vue'
import { useBudgetTaxStore } from '@/stores/budgetTaxStore.js'
import { budgetTaxService } from '@/services/budgetTaxService.js'

// ─── catálogo "servidor" mutable: simula la verdad de la BD ───
const profilesMaster = [
  {
    id_tax_profile: 1, profile_name: 'Perfil demo 2026', tax_year: 2026,
    regime: 'ordinary', status: 'draft', main_municipality_code: '',
    economic_activity_code: '', iva_responsible: false, withholding_agent: false,
    reteiva_agent: false, reteica_agent: false, id_company: null
  },
  {
    id_tax_profile: 2, profile_name: 'Base Simple', tax_year: 2026,
    regime: 'simple', status: 'active', main_municipality_code: '11001',
    economic_activity_code: '4642', iva_responsible: true, withholding_agent: false,
    reteiva_agent: false, reteica_agent: false, id_company: null
  }
]
let profilesDb = []
let assumptionDb = {}

beforeEach(() => {
  sessionStorage.clear()
  setActivePinia(createPinia())
  vi.clearAllMocks()
  profilesDb = JSON.parse(JSON.stringify(profilesMaster))
  assumptionDb = {
    id_budget_tax_assumption: 5, id_budget: 571, id_tax_profile: 2,
    taxable_income_adjustments: 0, non_deductible_expenses: 0, exempt_income: 0,
    tax_losses: 0, tax_discounts: 0, prior_advances: 0, prior_withholdings: 0,
    withholding_base: null, withholding_suffered: 0, reteiva_suffered: 0,
    reteica_base: null, monthly_sales_taxable_base: null, notes: null
  }
  budgetTaxService.getProfiles.mockImplementation(async () => ({
    data: JSON.parse(JSON.stringify(profilesDb))
  }))
  budgetTaxService.getRates.mockResolvedValue({ data: [] })
  budgetTaxService.getCalendar.mockResolvedValue({ data: [] })
  budgetTaxService.getAssumptions.mockImplementation(async () => ({ data: { ...assumptionDb } }))
  budgetTaxService.getSummary.mockResolvedValue({ data: { results: [] } })
  budgetTaxService.getCashFlow.mockResolvedValue({ data: null })
  budgetTaxService.updateProfile.mockImplementation(async (id, payload) => {
    const idx = profilesDb.findIndex((p) => String(p.id_tax_profile) === String(id))
    profilesDb[idx] = { id_tax_profile: Number(id), ...payload }
    return { data: { ...profilesDb[idx] } }
  })
  budgetTaxService.updateAssumptions.mockImplementation(async (_idBudget, payload) => {
    assumptionDb = { ...assumptionDb, ...payload }
    return { data: { ...assumptionDb } }
  })
})

function setupStore() {
  const store = useBudgetTaxStore()
  store.profiles = JSON.parse(JSON.stringify(profilesDb))
  store.taxYear = 2026
  store.selectedRegime = 'ordinary'
  return store
}

function makePinia() {
  const pinia = createPinia()
  setActivePinia(pinia)
  return pinia
}

describe('S12-TAX-FE: cambio de régimen SIMPLE <-> ORDINARIO', () => {
  it('Perfil tributario: la carga inicial abre el perfil ACTIVO del año (no el contexto ordinario)', async () => {
    const pinia = makePinia()
    setupStore()
    const wrapper = mount(TaxConfigurationForm, { global: { plugins: [pinia] } })
    await flushPromises()
    const selects = wrapper.findAll('select')
    expect(selects[0].element.value).toBe('2')
    expect(selects[1].element.value).toBe('simple')
    wrapper.unmount()
  })

  it('Perfil tributario: convertir "Base Simple" (simple) a ordinario persiste con "Actualizar perfil" sin desvincular el perfil', async () => {
    const pinia = makePinia()
    setupStore()
    const wrapper = mount(TaxConfigurationForm, { global: { plugins: [pinia] } })
    await flushPromises()

    const selects = wrapper.findAll('select')
    await selects[1].setValue('ordinary')
    expect(selects[0].element.value).toBe('2') // sigue editando Base Simple

    const btn = wrapper.findAll('button').find((b) => b.text().includes('Actualizar perfil'))
    await btn.trigger('click')
    await flushPromises()

    expect(budgetTaxService.updateProfile).toHaveBeenCalledTimes(1)
    expect(budgetTaxService.updateProfile).toHaveBeenCalledWith(
      '2',
      expect.objectContaining({ regime: 'ordinary', status: 'active', profile_name: 'Base Simple' })
    )
    expect(selects[0].element.value).toBe('2')
    expect(selects[1].element.value).toBe('ordinary')
    expect(sessionStorage.getItem('taxProfile:lastEditedId')).toBe('2')
    wrapper.unmount()
  })

  it('Supuestos: pasar el presupuesto de simple a ordinario guarda id_tax_profile=1 SIN recargar el catálogo', async () => {
    const pinia = makePinia()
    const store = setupStore()
    store.assumptions = { ...assumptionDb }
    store.selectedRegime = 'simple'
    const wrapper = mount(BudgetTaxAssumptionsForm, {
      props: { idBudget: 571 },
      global: { plugins: [pinia] }
    })
    await flushPromises()

    const selects = wrapper.findAll('select')
    expect(selects[0].element.value).toBe('simple')
    expect(selects[1].element.value).toBe('2')

    await selects[0].setValue('ordinary')
    await flushPromises()
    expect(selects[0].element.value).toBe('ordinary')
    expect(selects[1].element.value).toBe('1')
    expect(budgetTaxService.getProfiles).not.toHaveBeenCalled()

    const btn = wrapper.findAll('button').find((b) => b.text().includes('Guardar supuestos'))
    await btn.trigger('click')
    await flushPromises()

    expect(budgetTaxService.updateAssumptions).toHaveBeenCalledTimes(1)
    expect(budgetTaxService.updateAssumptions).toHaveBeenCalledWith(
      571,
      expect.objectContaining({ id_tax_profile: 1 })
    )
    expect(selects[0].element.value).toBe('ordinary')
    expect(selects[1].element.value).toBe('1')
    wrapper.unmount()
  })

  it('Supuestos: pasar de ordinario a simple guarda id_tax_profile=2 (escenario exacto del usuario)', async () => {
    const pinia = makePinia()
    const store = setupStore()
    store.assumptions = { ...assumptionDb, id_tax_profile: 1 } // vinculacion ordinaria
    const wrapper = mount(BudgetTaxAssumptionsForm, {
      props: { idBudget: 571 },
      global: { plugins: [pinia] }
    })
    await flushPromises()

    const selects = wrapper.findAll('select')
    expect(selects[0].element.value).toBe('ordinary')
    expect(selects[1].element.value).toBe('1')

    await selects[0].setValue('simple')
    await flushPromises()
    expect(selects[0].element.value).toBe('simple')
    expect(selects[1].element.value).toBe('2') // auto-selecciona Base Simple (activa)

    const btn = wrapper.findAll('button').find((b) => b.text().includes('Guardar supuestos'))
    await btn.trigger('click')
    await flushPromises()

    expect(budgetTaxService.updateAssumptions).toHaveBeenCalledTimes(1)
    expect(budgetTaxService.updateAssumptions).toHaveBeenCalledWith(
      571,
      expect.objectContaining({ id_tax_profile: 2 })
    )
    expect(selects[0].element.value).toBe('simple')
    wrapper.unmount()
  })

  it('Página completa: ambas tarjetas montadas — el cambio a simple en Supuestos no lo revierte la otra tarjeta', async () => {
    const pinia = makePinia()
    const store = setupStore()
    store.assumptions = { ...assumptionDb, id_tax_profile: 1 } // perfil 1 ordinario
    const tcf = mount(TaxConfigurationForm, { global: { plugins: [pinia] } })
    const baf = mount(BudgetTaxAssumptionsForm, {
      props: { idBudget: 571 },
      global: { plugins: [pinia] }
    })
    await flushPromises()

    // TCF abre el Activo del año (Base Simple, simple) — store.selectedRegime = 'simple'
    // BAF abre el perfil de los supuestos persistidos (Perfil demo 2026, ordinario)
    const bafSelects = baf.findAll('select')
    expect(bafSelects[0].element.value).toBe('ordinary')

    await bafSelects[0].setValue('simple')
    await flushPromises()
    expect(bafSelects[0].element.value).toBe('simple')
    expect(bafSelects[1].element.value).toBe('2')

    const btn = baf.findAll('button').find((b) => b.text().includes('Guardar supuestos'))
    await btn.trigger('click')
    await flushPromises()

    expect(budgetTaxService.updateAssumptions).toHaveBeenCalledWith(
      571,
      expect.objectContaining({ id_tax_profile: 2 })
    )
    expect(bafSelects[0].element.value).toBe('simple')
    baf.unmount()
    tcf.unmount()
  })

  it('Supuestos: tras cambiar a simple, una recarga de supuestos NO revierte la selección (sticky)', async () => {
    const pinia = makePinia()
    const store = setupStore()
    store.assumptions = { ...assumptionDb, id_tax_profile: 1 } // vinculación ordinaria
    const wrapper = mount(BudgetTaxAssumptionsForm, {
      props: { idBudget: 571 },
      global: { plugins: [pinia] }
    })
    await flushPromises()

    const selects = wrapper.findAll('select')
    await selects[0].setValue('simple')
    await flushPromises()
    expect(selects[1].element.value).toBe('2')

    // simula loadBudget: los supuestos persistidos (aún ordinarios) llegan de nuevo
    store.assumptions = { ...assumptionDb, id_tax_profile: 1 }
    await flushPromises()

    // la selección del usuario NO se revierte mientras no haya guardado
    expect(selects[0].element.value).toBe('simple')
    expect(selects[1].element.value).toBe('2')

    const btn = wrapper.findAll('button').find((b) => b.text().includes('Guardar supuestos'))
    await btn.trigger('click')
    await flushPromises()

    expect(budgetTaxService.updateAssumptions).toHaveBeenCalledWith(
      571,
      expect.objectContaining({ id_tax_profile: 2 })
    )
    expect(selects[0].element.value).toBe('simple')
    wrapper.unmount()
  })

  it('Perfil tributario: tras F5 reabre el último perfil editado de ese año (sessionStorage)', async () => {
    sessionStorage.setItem('taxProfile:lastEditedId', '1')
    const pinia = makePinia()
    setupStore()
    const wrapper = mount(TaxConfigurationForm, { global: { plugins: [pinia] } })
    await flushPromises()
    const selects = wrapper.findAll('select')
    expect(selects[0].element.value).toBe('1')
    expect(selects[1].element.value).toBe('ordinary')
    wrapper.unmount()
  })
})