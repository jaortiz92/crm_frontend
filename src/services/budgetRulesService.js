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
 *    paginación) ordenado por `id_line, payment_days` (BE-S5 §5).
 *  - Catálogos de internación por línea (FE-S10-INTERNMENT-SPLIT §2.1,
 *    contrato congelado en `backend.02_19` §5.3/§6): GET/POST
 *    `/budget/line-internment-rate/` · PUT/DELETE
 *    `/budget/line-internment-rate/{id_line_internment_rate}` y espejo
 *    `/budget/line-internment-term/{id_line_internment_term}`. GET planos
 *    (sin paginación): las tasas ordenan `id_line` (unicidad por Línea —
 *    máx. UNA tasa, §5.1) y los términos `id_line, payment_days` (§5.2).
 *    Errores: la rejilla `{ detail, reason? }` existente — los 400 amables
 *    ("Line {id} already has an internment rate") llegan con el `detail`
 *    literal del backend y se propagan tal cual para su exhibición (§2.1).
 *  - Calendario de liquidación IVA (FE-S14-IVA §5, autoridad
 *    `backend.02_20` §5.8 — espejo del stack `lineInternmentRate`): GET/POST
 *    `/budget/iva-period/` · PUT/DELETE `/budget/iva-period/{id}`; el GET
 *    acepta `?year=` y ordena `period_year, period_no`. 400 duplicado
 *    ("Period {n} already exists for year {y}") y 422 de rango
 *    (`date_to >= date_from`) con la misma rejilla de `detail` propagada.
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
  },

  /* ───────── CATÁLOGOS DE INTERNACIÓN (FE-S10 §2.1 / backend.02_19 §5.3) ───────── */

  /**
   * Catálogo COMPLETO de tasas de internación por línea (GET
   * `/budget/line-internment-rate/`, plano, orden `id_line` — BE-S9 §5.1).
   * Cada fila: `{ id_line_internment_rate, id_line, internment_pct }` con
   * `internment_pct` en FRACCIÓN 0–1 = recargo SOBRE el costo del proveedor
   * (D-S9-1: `CostoTotal = Proveedor × (1 + %)`). Unicidad por Línea (máx.
   * una tasa vigente; la ausencia se representa con la INEXISTENCIA de fila
   * ⇒ sin tasa ⇒ % = 0, A-5).
   * @returns {Promise<import('axios').AxiosResponse<Array<{
   *   id_line_internment_rate: number,
   *   id_line: number,
   *   internment_pct: number
   * }>>>}
   */
  fetchInternmentRates() {
    return axiosInstance.get('/budget/line-internment-rate/')
  },

  /**
   * Crea la tasa de una Línea: POST `{ id_line, internment_pct }` (snake_case
   * exacto BE-S9 §5.3; el %→fracción lo convierte SOLO la capa panel, mismo
   * FD5-3). 201 = objeto completo. Duplicado ⇒ 400 `"Line {id_line} already
   * has an internment rate"` (se pinta con el `detail` literal, §2.1);
   * rango fuera de (0, 1] ⇒ 422 de esquema.
   * @param {Object} payload
   * @returns {Promise<import('axios').AxiosResponse<object>>}
   */
  createInternmentRate(payload) {
    return axiosInstance.post('/budget/line-internment-rate/', payload)
  },

  /**
   * Edita una tasa: PUT de REEMPLAZO TOTAL (mismo body que el POST, espejo
   * del convenio payable-term BE-S5 §5). 404 `"LineInternmentRate {id} not
   * found"`; re-parentear a Línea con tasa existente ⇒ 400 literal análogo.
   * @param {number|string} id `id_line_internment_rate`
   * @param {Object} payload
   * @returns {Promise<import('axios').AxiosResponse<object>>}
   */
  updateInternmentRate(id, payload) {
    return axiosInstance.put(`/budget/line-internment-rate/${id}`, payload)
  },

  /**
   * Elimina una tasa (borrado físico, catálogo sin historial — BE-S9 §5.1;
   * tras ello la Línea vuelve a % = 0 y el Flujo degrada al 100 % proveedor).
   * Respuesta `{ deleted_id }`; 404 `"LineInternmentRate {id} not found"`.
   * @param {number|string} id `id_line_internment_rate`
   * @returns {Promise<import('axios').AxiosResponse<object>>}
   */
  deleteInternmentRate(id) {
    return axiosInstance.delete(`/budget/line-internment-rate/${id}`)
  },

  /**
   * Catálogo COMPLETO de términos de pago de la internación por línea (GET
   * `/budget/line-internment-term/`, plano, orden `id_line, payment_days` —
   * BE-S9 §5.2). Cada fila: `{ id_line_internment_term, id_line,
   * payment_pct, payment_days }`; OJO — SEMÁNTICA DISTINTA de
   * `line-payable-term`: `payment_pct` multiplica el COSTO DE INTERNACIÓN
   * (no el total de la compra) y `payment_days` ancla en la fecha de
   * importación (A-3). Tablas NO intercambiables (BE-S9 §3.2).
   * @returns {Promise<import('axios').AxiosResponse<Array<{
   *   id_line_internment_term: number,
   *   id_line: number,
   *   payment_pct: number,
   *   payment_days: number
   * }>>>}
   */
  fetchInternmentTerms() {
    return axiosInstance.get('/budget/line-internment-term/')
  },

  /**
   * Crea un término de internación: POST `{ id_line, payment_pct,
   * payment_days }` (snake_case exacto; `payment_pct` FRACCIÓN 0–1). 201 =
   * objeto completo. 404 `"Line {id_line} not found"`; 422 pct ∉ (0, 1].
   * @param {Object} payload
   * @returns {Promise<import('axios').AxiosResponse<object>>}
   */
  createInternmentTerm(payload) {
    return axiosInstance.post('/budget/line-internment-term/', payload)
  },

  /**
   * Edita un término de internación: PUT de REEMPLAZO TOTAL (mismo body que
   * el POST). 404 `"LineInternmentTerm {id} not found"`.
   * @param {number|string} id `id_line_internment_term`
   * @param {Object} payload
   * @returns {Promise<import('axios').AxiosResponse<object>>}
   */
  updateInternmentTerm(id, payload) {
    return axiosInstance.put(`/budget/line-internment-term/${id}`, payload)
  },

  /**
   * Elimina un término de internación (borrado físico; la derivación del Flujo
   * degrada a la cuota única 100 % en la ancla — BR-INT-04, BE-S9 §5.2).
   * Respuesta `{ deleted_id }`; 404 `"LineInternmentTerm {id} not found"`.
   * @param {number|string} id `id_line_internment_term`
   * @returns {Promise<import('axios').AxiosResponse<object>>}
   */
  deleteInternmentTerm(id) {
    return axiosInstance.delete(`/budget/line-internment-term/${id}`)
  },

  /* ───── CALENDARIO DE LIQUIDACIÓN IVA (FE-S14-IVA §5 / backend.02_20 §5.8) ───── */

  /**
   * Períodos de liquidación de IVA de un año (GET `/budget/iva-period/?year=`,
   * espejo del stack `line-internment-*`: ruta de colección ⇒ CON slash
   * final; autoridad `backend.02_20` §5.8). Plano, orden
   * `period_year, period_no` (BE-S10 §5.3). Cada fila: `{ id_iva_period,
   * period_year, period_no (1..N; bimestres 1..6), date_from, date_to,
   * payment_due_date, description|null }` — fechas ISO `YYYY-MM-DD`. El
   * calendario es POR AÑO y de compañía única (D-FE14-5): escenario base y
   * what-if del mismo año comparten catálogo.
   * @param {number|string} year año fiscal (2000–2100)
   * @returns {Promise<import('axios').AxiosResponse<Array<object>>>}
   */
  fetchIvaPeriods(year) {
    const query =
      year === null || year === undefined || String(year).trim() === ''
        ? ''
        : `?year=${encodeURIComponent(year)}`
    return axiosInstance.get(`/budget/iva-period/${query}`)
  },

  /**
   * Crea un período: POST `{ period_year, period_no, date_from, date_to,
   * payment_due_date, description? }` (snake_case exacto backend.02_20 §5.2;
   * las fechas viajan ISO crudas — ninguna conversión %↔fracción aquí). 201 =
   * objeto completo. Duplicado ⇒ 400 `"Period {period_no} already exists for
   * year {period_year}"` (el `detail` LITERAL del backend se propaga para
   * exhibición amable, mismo convenio FE-S10 §2.1); rango inválido
   * (`date_to < date_from`) ⇒ 422 de esquema (`model_validator`).
   * @param {Object} payload
   * @returns {Promise<import('axios').AxiosResponse<object>>}
   */
  createIvaPeriod(payload) {
    return axiosInstance.post('/budget/iva-period/', payload)
  },

  /**
   * Edita un período: PUT de REEMPLAZO TOTAL (mismo body que el POST; espejo
   * del convenio internment/payable). 404 `"IvaPeriod {id} not found"`; 400
   * duplicado en re-parent (año+número) con el `detail` literal.
   * @param {number|string} id `id_iva_period`
   * @param {Object} payload
   * @returns {Promise<import('axios').AxiosResponse<object>>}
   */
  updateIvaPeriod(id, payload) {
    return axiosInstance.put(`/budget/iva-period/${id}`, payload)
  },

  /**
   * Elimina un período (borrado físico, catálogo sin historial — BE-S10
   * §5.3). Respuesta `{ deleted_id }`; 404 `"IvaPeriod {id} not found"`.
   * Tras borrar TODOS los del año, la liquidación del escenario vuelve al
   * estado "sin calendario" con el warning de `meta.warnings` (AC-FE14-6).
   * @param {number|string} id `id_iva_period`
   * @returns {Promise<import('axios').AxiosResponse<object>>}
   */
  deleteIvaPeriod(id) {
    return axiosInstance.delete(`/budget/iva-period/${id}`)
  }
}
