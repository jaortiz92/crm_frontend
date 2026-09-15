import axiosInstance from '@/plugins/axios'
import { RATE_KINDS } from '@/components/budget/rates/ratesConfig.js'

/**
 * Servicio Axios de Gestión de Reglas Financieras (FE-S3-RULES, spec §4/§5).
 *
 * Capa PURA de transporte: sin lógica de negocio ni clasificación de errores
 * (eso vive en `budgetRulesStore`). Componentes y stores NUNCA importan axios
 * directamente (A13); todo paso por aquí.
 *
 * Contrato verificado contra `app/api/budget/{lineCostRate,commissionRate}.py`
 * y `app/api/line.py`:
 *  - Costos:  GET/POST `/budget/line-cost-rate/` (SINGULAR, A1) · PUT
 *    `/budget/line-cost-rate/{id}`.
 *  - Comisiones: GET/POST `/budget/commission-rates/` · PUT
 *    `/budget/commission-rates/{id}`.
 *  - Slash final obligatorio en rutas de colección (`@router.get("/")`); sin
 *    él el servidor responde 307.
 *  - Catálogo de líneas: `GET /line/?skip=0&limit=500` — el `limit` por
 *    defecto de `/line/` es 10, por lo que SIEMPRE se envía `limit=500` (A6).
 *  - Términos de pago a proveedores por línea (FE-S5-PAYABLE-TERMS §4,
 *    verificado contra el openapi vivo de BE-S5): GET/POST
 *    `/budget/line-payable-term/` · PUT/DELETE
 *    `/budget/line-payable-term/{id_line_payable_term}`. GET plano (sin
 *    paginación) ordenado por `id_line, payment_days`.
 *
 * Instancia compartida de `@/plugins/axios`: JWT auto-inyectado y `timeout`
 * global de 20 s suficiente para estos GET/PUT JSON (sin overrides, §5.5).
 * Sin reintentos; la única caché vive en Pinia.
 */

/** Parámetros fijos de listado (A14): una sola pasada de hasta 500 filas. */
const LIST_QUERY = '?skip=0&limit=500'

export const budgetRulesService = {
  /**
   * Lista cruda (sin ordenar) de las tasas del pilar indicado.
   * @param {'cost'|'commission'} kind
   * @returns {Promise<import('axios').AxiosResponse<Array<object>>>}
   */
  fetchRates(kind) {
    return axiosInstance.get(`${RATE_KINDS[kind].listUrl}${LIST_QUERY}`)
  },

  /**
   * Catálogo de líneas de producto `{ id_line, line_name }` (solo lectura).
   * @returns {Promise<import('axios').AxiosResponse<Array<{ id_line: number, line_name: string }>>>}
   */
  fetchLines() {
    return axiosInstance.get('/line/?skip=0&limit=500')
  },

  /**
   * Crea una regla: POST a la ruta de colección.
   * @param {'cost'|'commission'} kind
   * @param {Object} payload snake_case completo (id_line admite null explícito)
   * @returns {Promise<import('axios').AxiosResponse<object>>}
   */
  createRate(kind, payload) {
    return axiosInstance.post(RATE_KINDS[kind].listUrl, payload)
  },

  /**
   * Edita/archiva una regla: PUT parcial sobre la ruta de item.
   * El payload debe venir SIN `id_line` y solo con campos no-null (§5.3/§10.2).
   * @param {'cost'|'commission'} kind
   * @param {number|string} id
   * @param {Object} payload
   * @returns {Promise<import('axios').AxiosResponse<object>>}
   */
  updateRate(kind, id, payload) {
    return axiosInstance.put(RATE_KINDS[kind].itemUrl(id), payload)
  },

  /**
   * Catálogo COMPLETO de términos de pago a proveedores por línea
   * (FE-S5 §4). El endpoint no pagina: fila plana ordenada
   * `id_line, payment_days` (BE-S5 §5).
   * @returns {Promise<import('axios').AxiosResponse<Array<{
   *   id_line_payable_term: number,
   *   id_line: number,
   *   payment_pct: number,
   *   payment_days: number
   * }>>>}
   */
  fetchPayableTerms() {
    return axiosInstance.get('/budget/line-payable-term/')
  },

  /**
   * Crea un término: POST `{ id_line, payment_pct, payment_days }` (snake_case
   * exacto BE-S5 §5; `payment_pct` es FRACCIÓN 0–1 — la conversión %↔fracción
   * vive SOLO en la capa modal, FD5-3). Respuesta 201 = objeto completo.
   * @param {Object} payload
   * @returns {Promise<import('axios').AxiosResponse<object>>}
   */
  createPayableTerm(payload) {
    return axiosInstance.post('/budget/line-payable-term/', payload)
  },

  /**
   * Edita un término: PUT de REEMPLAZO TOTAL (mismo body que el POST; el BE
   * NO acepta PATCH parcial aquí, BE-S5 §5). Respuesta 200 = objeto completo.
   * @param {number|string} id `id_line_payable_term`
   * @param {Object} payload
   * @returns {Promise<import('axios').AxiosResponse<object>>}
   */
  updatePayableTerm(id, payload) {
    return axiosInstance.put(`/budget/line-payable-term/${id}`, payload)
  },

  /**
   * Elimina un término (borrado físico; NO re-expande escenarios ya creados —
   * BR-TERM-07). Respuesta `{ deleted_id }`.
   * @param {number|string} id `id_line_payable_term`
   * @returns {Promise<import('axios').AxiosResponse<object>>}
   */
  deletePayableTerm(id) {
    return axiosInstance.delete(`/budget/line-payable-term/${id}`)
  }
}
