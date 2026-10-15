import { defineStore } from 'pinia'
import { budgetTaxService } from '@/services/budgetTaxService.js'
import { useBudgetPlanningStore } from '@/stores/budgetPlanningStore.js'

const emptyState = () => ({
  profiles: [], rates: [], calendar: [], assumptions: null, summary: null, comparison: null, cashFlow: null,
  selectedRegime: 'ordinary', taxYear: new Date().getFullYear(), loading: false, saving: false,
  ratesLoading: false, rateSaving: false, calendarLoading: false, calendarSaving: false, calendarDeleting: false, calculating: false,
  error: null, lastErrorKind: null
})

function errorKind(error) {
  if (!error?.response) return 'network'
  if (error.response.status === 401) return 'auth'
  if (error.response.status === 403) return 'forbidden'
  if (error.response.status === 404) return 'notfound'
  if (error.response.status === 422) return 'validation'
  return 'server'
}

function invalidatePlanningTaxCache(idBudget) {
  const planningStore = useBudgetPlanningStore()
  if (planningStore.currentScenario?.id_budget === Number(idBudget)) {
    planningStore.markTaxStale()
  }
}

export const useBudgetTaxStore = defineStore('budgetTaxStore', {
  state: emptyState,
  getters: {
    activeProfile: (state) => {
      // Opción 1: el catálogo de perfiles es ahora de TODOS los años, así
      // que aquí se fija el contexto (año + régimen) que antes venía
      // implícito en la lista filtrada por tax_year.
      const matchingProfiles = state.profiles.filter((profile) => (
        profile.regime === state.selectedRegime
        && Number(profile.tax_year) === Number(state.taxYear)
      ))
      return matchingProfiles.find((profile) => profile.is_active || profile.status === 'active') || matchingProfiles[0] || null
    },
    simpleResults: (state) => {
      const rows = state.summary?.results || state.summary?.simple_results || state.summary?.simple?.periods || []
      return Array.isArray(rows) ? rows.filter((row) => row.tax_type === 'simple' || row.regime === 'simple') : []
    },
    hasConfiguration: (state) => Boolean(state.assumptions || state.profiles.some((profile) => profile.is_active || profile.status === 'active')),
    missingConfiguration: (state) => {
      const warnings = []
      if (!state.assumptions?.id_tax_profile) warnings.push('Sin supuestos asociados al presupuesto')
      if (!state.activeProfile) warnings.push('Sin perfil tributario activo')
      const ratesForRegime = state.rates.filter((rate) => !rate.regime || rate.regime === state.selectedRegime)
      if (!ratesForRegime.length) warnings.push('Sin tarifas configuradas')
      if (!state.calendar.length) warnings.push('Sin calendario configurado')
      return warnings
    }
  },
  actions: {
    async request(callback) {
      this.error = null
      try { return { ok: true, data: (await callback()).data } } catch (error) {
        this.lastErrorKind = errorKind(error)
        const detail = error.response?.data?.detail
        this.error = detail || 'No fue posible consultar la información tributaria.'
        return { ok: false, kind: this.lastErrorKind, detail, error }
      }
    },
    async loadCalendar(year = this.taxYear, regime = this.selectedRegime) {
      this.calendarLoading = true
      this.taxYear = Number(year)
      if (regime) this.selectedRegime = regime
      const result = await this.request(() => budgetTaxService.getCalendar(this.taxYear, regime))
      if (result.ok) this.calendar = Array.isArray(result.data) ? result.data : []
      this.calendarLoading = false
      return result.ok
    },
    async loadConfiguration(year = this.taxYear, regime = this.selectedRegime) {
      // Opción 1: los perfiles cargan SIN filtro de año (catálogo completo,
      // el dropdown "Perfil a editar" debe listarlos todos); tarifas y
      // calendario SÍ se anclan al año fiscal evaluado.
      this.loading = true; this.taxYear = Number(year); this.selectedRegime = regime
      const result = await Promise.all([
        this.request(() => budgetTaxService.getProfiles()),
        this.request(() => budgetTaxService.getRates(this.taxYear)),
        this.request(() => budgetTaxService.getCalendar(this.taxYear, regime))
      ])
      this.profiles = Array.isArray(result[0].data) ? result[0].data : []
      this.rates = Array.isArray(result[1].data) ? result[1].data : []
      this.calendar = Array.isArray(result[2].data) ? result[2].data : []
      this.loading = false
      return result.every((item) => item.ok)
    },
    async loadRates(year = this.taxYear, taxType = null) {
      this.ratesLoading = true
      this.taxYear = Number(year)
      const result = await this.request(() => budgetTaxService.getRates(this.taxYear, taxType))
      if (result.ok) this.rates = Array.isArray(result.data) ? result.data : []
      this.ratesLoading = false
      return result.ok
    },
    async resolveBudgetYear(idBudget) {
      const planningStore = useBudgetPlanningStore()
      const result = await planningStore.fetchScenarioDetail(Number(idBudget))
      const year = Number(planningStore.currentScenario?.budget_year)
      return result.ok && Number.isInteger(year) ? year : null
    },
    async loadBudget(idBudget) {
      this.loading = true; this.error = null
      const [assumptions, summary, cashFlow] = await Promise.all([
        this.request(() => budgetTaxService.getAssumptions(idBudget)),
        this.request(() => budgetTaxService.getSummary(idBudget)),
        this.request(() => budgetTaxService.getCashFlow(idBudget))
      ])
      this.assumptions = assumptions.data || null; this.summary = summary.data || null; this.cashFlow = cashFlow.data || null
      this.loading = false
      return assumptions.ok && summary.ok && cashFlow.ok
    },
    async saveAssumptions(idBudget, payload) {
      if (this.saving) return { ok: false, kind: 'busy' }
      this.saving = true; const result = await this.request(() => budgetTaxService.updateAssumptions(idBudget, payload));
      if (result.ok) {
        this.assumptions = result.data
        invalidatePlanningTaxCache(idBudget)
      }
      this.saving = false; return result
    },
    async saveProfile(payload, idTaxProfile = null) {
      if (this.saving) return { ok: false, kind: 'busy' }

      this.saving = true
      const result = await this.request(() => idTaxProfile
        ? budgetTaxService.updateProfile(idTaxProfile, payload)
        : budgetTaxService.createProfile(payload))

      if (result.ok) {
        this.taxYear = Number(payload.tax_year)
        this.selectedRegime = payload.regime
        // The list is the source of truth after either POST or PUT. This also
        // makes a newly created profile immediately selectable in the UI.
        const reloaded = await this.loadConfiguration(this.taxYear, this.selectedRegime)
        result.reloaded = reloaded
      }

      this.saving = false
      return result
    },
    async saveRate(payload, idTaxRate = null) {
      if (this.rateSaving) return { ok: false, kind: 'busy' }

      this.rateSaving = true
      const result = await this.request(() => idTaxRate
        ? budgetTaxService.updateRate(idTaxRate, payload)
        : budgetTaxService.createRate(payload))

      if (result.ok) {
        this.taxYear = Number(payload.tax_year)
        if (payload.regime) this.selectedRegime = payload.regime
        result.reloaded = await this.loadRates(this.taxYear)
      }

      this.rateSaving = false
      return result
    },
    async saveCalendarPeriod(payload, idCalendarPeriod = null, calendarRegime = this.selectedRegime) {
      if (this.calendarSaving || this.calendarDeleting) return { ok: false, kind: 'busy' }

      this.calendarSaving = true
      const result = await this.request(() => idCalendarPeriod
        ? budgetTaxService.updateCalendarPeriod(idCalendarPeriod, payload)
        : budgetTaxService.createCalendarPeriod(payload))

      if (result.ok) {
        this.taxYear = Number(payload.tax_year)
        const reloaded = await this.loadCalendar(this.taxYear, calendarRegime)
        result.reloaded = reloaded
      }

      this.calendarSaving = false
      return result
    },
    async deleteCalendarPeriod(idCalendarPeriod, calendarYear = this.taxYear, calendarRegime = this.selectedRegime) {
      if (this.calendarSaving || this.calendarDeleting) return { ok: false, kind: 'busy' }

      this.calendarDeleting = true
      const result = await this.request(() => budgetTaxService.deleteCalendarPeriod(idCalendarPeriod))

      if (result.ok) {
        this.taxYear = Number(calendarYear)
        const reloaded = await this.loadCalendar(this.taxYear, calendarRegime)
        result.reloaded = reloaded
      }

      this.calendarDeleting = false
      return result
    },
    async calculateBudget(idBudget) {
      if (this.calculating) return { ok: false, kind: 'busy' }
      this.calculating = true; const result = await this.request(() => budgetTaxService.calculate(idBudget));
      if (result.ok) {
        this.summary = result.data
        await this.loadBudget(idBudget)
        invalidatePlanningTaxCache(idBudget)
      }
      this.calculating = false; return result
    },
    async compare(idBudget, regimeA = 'ordinary', regimeB = 'simple') {
      const result = await this.request(() => budgetTaxService.getComparison(idBudget, regimeA, regimeB))
      if (result.ok) this.comparison = result.data
      return result
    }
  }
})
