import axiosInstance from '@/plugins/axios'

/**
 * Servicio Axios del Centro de Ingesta (FE-S3-UPLOAD-CENTER).
 *
 * Contrato verificado contra `crm_backend/app/api/budget/upload.py`
 * (router `budget` con sub-prefijo `/upload`, sin prefijo `/api`).
 *
 * Patrón multipart heredado de `bulkUploadService.js`: se fija únicamente
 * `Content-Type: multipart/form-data` SIN boundary manual; el navegador
 * reescribe el header con el boundary real al enviar el `FormData`
 * (fijarlo a mano rompe el parseo de FastAPI — spec §5.4.2).
 */

/**
 * Timeout por petición de subida (spec §5.4.3 / NFR-8).
 * La instancia global de `@/plugins/axios` trae `timeout: 20000` (PQ-2),
 * insuficiente para ETLs de Excel, por lo que se sobreescribe por petición.
 */
const UPLOAD_TIMEOUT_MS = 120000

const MULTIPART_CONFIG = {
  headers: { 'Content-Type': 'multipart/form-data' },
  timeout: UPLOAD_TIMEOUT_MS
}

/**
 * Respuesta 200 de `POST /budget/upload/actual-costs`.
 * @typedef {Object} ActualCostsResult
 * @property {string} message
 * @property {number} records_inserted
 * @property {number} total_amount - Suma de montos insertados (COP, dinero).
 * @property {string} source_file
 * @property {boolean} replaced - true si se eliminaron documentos duplicados.
 * @property {number} records_deleted
 */

/**
 * Respuesta 200 de `POST /budget/upload/actual-expenses`.
 * @typedef {Object} ActualExpensesResult
 * @property {string} message
 * @property {number} records_inserted
 * @property {number} records_replaced
 * @property {string} source_file
 * @property {{ total_rows_processed: number, rows_filtered: number, valid_expenses: number }} details
 */

/**
 * Respuesta 200 de `POST /budget/upload/payment-ledger`.
 * @typedef {Object} PaymentLedgerResult
 * @property {string} message
 * @property {number} records_inserted
 * @property {number} records_replaced
 * @property {string} source_file
 * @property {boolean} include_initial_balances
 * @property {{ total_rows_processed: number, total_cash_in: number, total_cash_out: number, net_liquidity: number }} details
 */

/**
 * Respuesta 200 de `POST /budget/upload/accounts-receivable`.
 * @typedef {Object} AccountsReceivableResult
 * @property {string} message
 * @property {number} records_inserted
 * @property {number} records_replaced
 * @property {number} records_closed
 * @property {string} source_file
 * @property {string} statement_date - Fecha de corte leída del archivo (ISO).
 * @property {boolean} forced - true si se omitió la guardia de corte antiguo.
 * @property {{ total_outstanding_balance: number }} details
 */

/**
 * Respuesta de `GET /budget/upload/status` (BE-S3-UPLOAD-STATUS).
 * Mientras el endpoint no exista en el backend, esta petición devuelve 404
 * y el store degrada a modo decorativo (spec §7.4) sin bloquear subidas.
 * @typedef {Object} UploadStatusResult
 * @property {{ actual_costs: {last_upload: string|null}, actual_expenses: {last_upload: string|null}, payment_ledger: {last_upload: string|null}, accounts_receivable: {last_upload: string|null} }} datasets
 */

/**
 * Construye el `FormData` base con el archivo.
 * @param {File} file
 * @returns {FormData}
 */
function buildFileFormData(file) {
  const formData = new FormData()
  formData.append('file', file)
  return formData
}

/**
 * Serializa un booleano como cadena para FastAPI `Form(bool)`.
 * Siempre "true"/"false" (spec §5.1, nota al pie).
 * @param {boolean} value
 * @returns {string}
 */
function boolField(value) {
  return value ? 'true' : 'false'
}

export const budgetUploadService = {
  /**
   * Sube el archivo de Costos Reales (CostosFinal.xlsx).
   * @param {File} file - Archivo .xlsx.
   * @param {number|string} excelTotalCost - Total declarado del Excel; el
   *   servidor lo valida con tolerancia de ±100 COP.
   * @returns {Promise<import('axios').AxiosResponse<ActualCostsResult>>}
   */
  uploadActualCosts(file, excelTotalCost) {
    const formData = buildFileFormData(file)
    formData.append('excel_total_cost', String(excelTotalCost))
    return axiosInstance.post('/budget/upload/actual-costs', formData, MULTIPART_CONFIG)
  },

  /**
   * Sube el archivo de Gastos Operativos (LibroAuxiliarCECO.xlsx).
   * @param {File} file - Archivo .xlsx.
   * @returns {Promise<import('axios').AxiosResponse<ActualExpensesResult>>}
   */
  uploadActualExpenses(file) {
    const formData = buildFileFormData(file)
    return axiosInstance.post('/budget/upload/actual-expenses', formData, MULTIPART_CONFIG)
  },

  /**
   * Sube el Libro de Pagos / flujo de caja (Recibos.xlsx).
   * @param {File} file - Archivo .xlsx.
   * @param {boolean} [includeInitialBalances=false] - Sumar saldos iniciales.
   * @returns {Promise<import('axios').AxiosResponse<PaymentLedgerResult>>}
   */
  uploadPaymentLedger(file, includeInitialBalances = false) {
    const formData = buildFileFormData(file)
    formData.append('include_initial_balances', boolField(includeInitialBalances))
    return axiosInstance.post('/budget/upload/payment-ledger', formData, MULTIPART_CONFIG)
  },

  /**
   * Sube el Estado de Cartera (EstadoCuenta306090.xlsx).
   * @param {File} file - Archivo .xlsx.
   * @param {boolean} [force=false] - Omitir la guardia de corte antiguo.
   * @returns {Promise<import('axios').AxiosResponse<AccountsReceivableResult>>}
   */
  uploadAccountsReceivable(file, force = false) {
    const formData = buildFileFormData(file)
    formData.append('force', boolField(force))
    return axiosInstance.post('/budget/upload/accounts-receivable', formData, MULTIPART_CONFIG)
  },

  /**
   * Fecha de última carga por dataset (decorativo; puede no existir aún).
   * @returns {Promise<import('axios').AxiosResponse<UploadStatusResult>>}
   */
  fetchUploadStatus() {
    return axiosInstance.get('/budget/upload/status')
  }
}
