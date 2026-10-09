import axiosInstance from '@/plugins/axios'

const BASE_PATH = '/budget/financing-credit'

/** Transporte puro del dominio de financiación empresarial (FE-S16 / BE-S12). */
export const budgetFinancingCreditService = {
  listFinancingCredits({
    q = '',
    idCostCenter = '',
    status = '',
    originType = '',
    page = 1,
    size = 25
  } = {}) {
    const query = new URLSearchParams()
    if (String(q).trim()) query.set('q', String(q).trim())
    if (idCostCenter !== '' && idCostCenter != null)
      query.set('id_cost_center', String(idCostCenter))
    if (status) query.set('status', String(status))
    if (originType) query.set('origin_type', String(originType))
    query.set('page', String(page))
    query.set('size', String(size))
    return axiosInstance.get(`${BASE_PATH}?${query.toString()}`)
  },
  previewFinancingCredit(payload) {
    return axiosInstance.post(`${BASE_PATH}/preview`, payload)
  },
  createFinancingCredit(payload) {
    return axiosInstance.post(BASE_PATH, payload)
  },
  getFinancingCredit(id) {
    return axiosInstance.get(`${BASE_PATH}/${id}`)
  },
  getFinancingSchedule(id, { dateFrom = '', dateTo = '', page = 1, size = 25 } = {}) {
    const query = new URLSearchParams({
      offset: String(Math.max(0, (Number(page) - 1) * Number(size))),
      limit: String(size)
    })
    if (dateFrom) query.set('date_from', dateFrom)
    if (dateTo) query.set('date_to', dateTo)
    return axiosInstance.get(`${BASE_PATH}/${id}/schedule?${query.toString()}`)
  },
  updateFinancingCredit(id, payload) {
    return axiosInstance.put(`${BASE_PATH}/${id}`, payload)
  },
  recalculateFinancingCredit(id) {
    return axiosInstance.post(`${BASE_PATH}/${id}/recalculate`)
  },
  closeFinancingCredit(id, payload) {
    return axiosInstance.post(`${BASE_PATH}/${id}/close`, payload)
  },
  deleteFinancingCredit(id) {
    return axiosInstance.delete(`${BASE_PATH}/${id}`)
  },
  /** Lee la curva global existente; se renderiza tal cual responde BE. */
  fetchBudgetCashFlow({ dateFrom, dateTo }) {
    const query = new URLSearchParams({
      date_from: dateFrom,
      date_to: dateTo,
      granularity: 'monthly'
    })
    return axiosInstance.get(`/budget/analytics/cash-flow?${query.toString()}`)
  }
}

export const {
  listFinancingCredits,
  previewFinancingCredit,
  createFinancingCredit,
  getFinancingCredit,
  getFinancingSchedule,
  updateFinancingCredit,
  recalculateFinancingCredit,
  closeFinancingCredit,
  deleteFinancingCredit,
  fetchBudgetCashFlow
} = budgetFinancingCreditService

/** Mantiene mensajes estructurados 400/422 y permisos/red identificables. */
export function classifyFinancingCreditError(error) {
  const response = error?.response
  if (!response) return { kind: 'network', message: 'Sin conexión con el servidor. Reintente.' }

  const { status, data } = response
  const detail = data?.detail
  const message =
    (typeof detail === 'object' && (detail?.message || detail?.reason)) ||
    (typeof detail === 'string' ? detail : '') ||
    data?.message ||
    ''
  const field =
    (typeof detail === 'object' && detail?.field) ||
    (Array.isArray(detail) ? detail.find((item) => item?.loc?.length)?.loc?.at(-1) : undefined)

  if (status === 401)
    return { kind: 'auth', status, message: 'La sesión expiró. Inicie sesión nuevamente.' }
  if (status === 403)
    return {
      kind: 'forbidden',
      status,
      message: message || 'No tiene permiso para consultar o modificar financiación empresarial.'
    }
  if (status === 404)
    return { kind: 'notfound', status, message: message || 'No se encontró el crédito o el CECO.' }
  if (status === 409)
    return {
      kind: 'conflict',
      status,
      message:
        message || 'Las condiciones o la revisión cambiaron. Recargue y solicite una nueva previsualización.'
    }
  if (status === 400 || status === 422) {
    const validation = Array.isArray(detail)
      ? detail.map((item) => item?.msg).filter(Boolean).join(' · ')
      : ''
    return {
      kind: 'validation',
      status,
      field,
      message:
        message || validation || 'El servidor rechazó los datos enviados. Revise las condiciones.'
    }
  }
  if (status >= 500)
    return { kind: 'server', status, message: message || 'Error del servidor. Puede reintentar.' }
  return { kind: 'unknown', status, message: message || 'No se pudo completar la operación.' }
}
