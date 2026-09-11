import axiosInstance from '@/plugins/axios'

/**
 * Servicio Axios del Módulo de Planeación y Escenarios
 * (FE-S4-BUDGET-PLANNING §5; contrato autoridad = `backend.02_12` §5).
 *
 * Capa PURA de transporte: sin lógica de negocio ni clasificación de errores
 * (eso vive en `budgetPlanningStore`). Componentes y stores NUNCA importan
 * axios directamente; todo paso por aquí (patrón `budgetRulesService`).
 *
 * Rutas exactas (§5 backend):
 *  - `GET  /budget/planning/?budget_year=`   listado agregado (5.4)
 *  - `GET  /budget/planning/{id}/detail`     BudgetFull + parent_budget_name (5.5)
 *  - `POST /budget/planning/upload`          multipart 2 archivos SIIGO (5.1)
 *  - `POST /budget/planning/clone`           JSON (5.2)
 *  - `PUT  /budget/planning/cell/{idBudgetLine}` JSON (5.3)
 *  - `PUT  /budget/planning/{id}/set-target` sin cuerpo (5.6)
 *
 * Slash final obligatorio en la ruta de colección `/budget/planning/` (sin
 * él FastAPI responde 307 — mismo detalle verificado en `budgetRulesService`).
 *
 * Instancia compartida de `@/plugins/axios`: JWT auto-inyectado. El `timeout`
 * global (20 s) NO basta para la subida de dos Excel → se sobreescribe por
 * petición con 120 s (patrón `budgetUploadService`).
 */

const UPLOAD_TIMEOUT_MS = 120000

const MULTIPART_CONFIG = {
  headers: { 'Content-Type': 'multipart/form-data' },
  timeout: UPLOAD_TIMEOUT_MS
}

/**
 * Resultado 201 de `POST /budget/planning/upload` (`PlanningUploadResult`).
 * @typedef {Object} PlanningUploadResult
 * @property {number} id_budget
 * @property {string} scenario_name
 * @property {number} budget_year
 * @property {number} lines_income
 * @property {number} lines_expense
 * @property {number} total_income
 * @property {number} total_expense_fixed
 * @property {number} payment_rules_expansions
 */

export const budgetPlanningService = {
  /**
   * Listado agregado del dashboard. `budgetYear` null/'' → sin filtro (todos).
   * @param {number|string|null} [budgetYear=null]
   * @returns {Promise<import('axios').AxiosResponse<Array<object>>>}
   */
  fetchScenarios(budgetYear = null) {
    const hasYear =
      budgetYear !== null && budgetYear !== undefined && String(budgetYear).trim() !== ''
    const query = hasYear ? `?budget_year=${encodeURIComponent(budgetYear)}` : ''
    return axiosInstance.get(`/budget/planning/${query}`)
  },

  /**
   * Detalle completo (budget + `budget_lines` + `parent_budget_name`).
   * @param {number|string} idBudget
   * @returns {Promise<import('axios').AxiosResponse<object>>}
   */
  fetchScenarioDetail(idBudget) {
    return axiosInstance.get(`/budget/planning/${idBudget}/detail`)
  },

  /**
   * Crea el Presupuesto Base subiendo los DOS archivos SIIGO en una sola
   * petición multipart (ASM-10 vinculante: `file_ingresos` requerido,
   * `file_gastos` opcional; jamás una matriz importable).
   * @param {Object} fields
   * @param {string} fields.scenarioName - ≤120.
   * @param {number|string} fields.budgetYear - 2000–2100 (422 fuera de rango).
   * @param {string} [fields.budgetPeriod='ANUAL'] - ≤20.
   * @param {number|string|null} [fields.idDepartment=null] - opcional.
   * @param {File} fields.fileIngresos - .xlsx requerido.
   * @param {File|null} [fields.fileGastos=null] - .xlsx opcional.
   * @returns {Promise<import('axios').AxiosResponse<PlanningUploadResult>>}
   */
  uploadScenario({
    scenarioName,
    budgetYear,
    budgetPeriod = 'ANUAL',
    idDepartment = null,
    fileIngresos,
    fileGastos = null
  }) {
    const formData = new FormData()
    formData.append('scenario_name', String(scenarioName).trim())
    formData.append('budget_year', String(budgetYear))
    formData.append('budget_period', String(budgetPeriod || 'ANUAL').trim())
    if (idDepartment !== null && idDepartment !== undefined && String(idDepartment) !== '') {
      formData.append('id_department', String(idDepartment))
    }
    formData.append('file_ingresos', fileIngresos)
    if (fileGastos instanceof File) {
      formData.append('file_gastos', fileGastos)
    }
    return axiosInstance.post('/budget/planning/upload', formData, MULTIPART_CONFIG)
  },

  /**
   * Clona un escenario con ajuste porcentual opcional ([-100, ∞); < -100 → 422).
   * Las tasas variables se copian sin escalar (BR-CLN-03 — nota fija del modal).
   * @param {Object} payload
   * @param {number} payload.idBudget
   * @param {string} payload.nuevoNombre - ≤120, único por año (BR-ING-04).
   * @param {number} [payload.modifierPct=0]
   * @returns {Promise<import('axios').AxiosResponse<object>>} 201 objeto `Budget`
   */
  cloneScenario({ idBudget, nuevoNombre, modifierPct = 0 }) {
    return axiosInstance.post('/budget/planning/clone', {
      id_budget: Number(idBudget),
      nuevo_nombre: String(nuevoNombre).trim(),
      modifier_pct: Number(modifierPct)
    })
  },

  /**
   * Edición puntual de UNA celda: `PUT /budget/planning/cell/{idBudgetLine}`.
   * `description` solo se envía si viene definido (PUT parcial, BR-CEL-01).
   * @param {number|string} idBudgetLine
   * @param {number} projectedAmount - finito >= 0 (BR-CEL-02; 422 en otro caso).
   * @param {string} [description=undefined]
   * @returns {Promise<import('axios').AxiosResponse<object>>} 200 línea completa
   */
  updateCell(idBudgetLine, projectedAmount, description = undefined) {
    const payload = { projected_amount: Number(projectedAmount) }
    if (description !== undefined) payload.description = description
    return axiosInstance.put(`/budget/planning/cell/${idBudgetLine}`, payload)
  },

  /**
   * Designa la Meta Activa del año; desactiva al anterior en la misma
   * transacción (BR-TGT-01). Restringido backend a Gerencia/Sistema (ASM-9):
   * 403 con `Financiero`.
   * @param {number|string} idBudget
   * @returns {Promise<import('axios').AxiosResponse<{ id_budget: number, budget_year: number, demoted_budget_id: number|null }>>}
   */
  setTarget(idBudget) {
    return axiosInstance.put(`/budget/planning/${idBudget}/set-target`)
  }
}
