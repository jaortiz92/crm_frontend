import axiosInstance from '@/plugins/axios.js'

// Transporte únicamente: las fórmulas y la precisión pertenecen al backend.
export const budgetTaxService = {
  // Sin ``taxYear`` devuelve el catálogo COMPLETO (el parámetro es opcional en
  // el backend, GET /budget/tax/profiles): el dropdown "Perfil a editar"
  // necesita todos los años/régimenes (opción 1). Año dado ⇒ filtro clásico.
  getProfiles: (taxYear) => axiosInstance.get(
    '/budget/tax/profiles',
    taxYear == null ? undefined : { params: { tax_year: taxYear } }
  ),
  createProfile: (payload) => axiosInstance.post('/budget/tax/profiles', payload),
  updateProfile: (id, payload) => axiosInstance.put(`/budget/tax/profiles/${id}`, payload),
  getRates: (taxYear, taxType) => axiosInstance.get('/budget/tax/rates', { params: { tax_year: taxYear, tax_type: taxType } }),
  createRate: (payload) => axiosInstance.post('/budget/tax/rates', payload),
  updateRate: (id, payload) => axiosInstance.put(`/budget/tax/rates/${id}`, payload),
  getCalendar: (taxYear, regime) => axiosInstance.get('/budget/tax/calendar', { params: { tax_year: taxYear, regime } }),
  createCalendarPeriod: (payload) => axiosInstance.post('/budget/tax/calendar', payload),
  updateCalendarPeriod: (id, payload) => axiosInstance.put(`/budget/tax/calendar/${id}`, payload),
  deleteCalendarPeriod: (id) => axiosInstance.delete(`/budget/tax/calendar/${id}`),
  getAssumptions: (idBudget) => axiosInstance.get(`/budget/tax/budgets/${idBudget}/assumptions`),
  updateAssumptions: (idBudget, payload) => axiosInstance.put(`/budget/tax/budgets/${idBudget}/assumptions`, payload),
  calculate: (idBudget) => axiosInstance.post(`/budget/tax/budgets/${idBudget}/calculate`),
  getSummary: (idBudget) => axiosInstance.get(`/budget/tax/budgets/${idBudget}/summary`),
  getComparison: (idBudget, regimeA, regimeB) => axiosInstance.get(`/budget/tax/budgets/${idBudget}/comparison`, { params: { regime_a: regimeA, regime_b: regimeB } }),
  getCashFlow: (idBudget) => axiosInstance.get(`/budget/tax/budgets/${idBudget}/cash-flow`)
}
