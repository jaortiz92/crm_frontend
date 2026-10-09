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
 * Rutas FE-S4D-BUDGET-LINES (autoridad: `backend.02_13` §3; verificadas contra
 * los decoradores reales de `app/api/budget/planning.py`):
 *  - `POST   /budget/planning/{idBudget}/line`      JSON `PlanningLineCreate` (201)
 *  - `PUT    /budget/planning/line/{idBudgetLine}`  JSON `PlanningLineUpdate` (parcial)
 *  - `DELETE /budget/planning/line/{idBudgetLine}`  sin cuerpo → `{deleted_id}`
 * SIN slash final: no son rutas de colección con `@router.get("/")` (spec FE §5).
 *
 * Rutas frontend.03_07 (autoridad: `backend.02_14` D-3/FD-1):
 *  - `DELETE /budget/{idBudget}`  endpoint LEGACY del CRUD de presupuestos:
 *    borrado FÍSICO de escenarios borrador (400 si el estado cambió en vuelo,
 *    404 si ya no existe). NO existe `/budget/planning/{id}` DELETE: no
 *    inventar rutas. También ruta unitaria ⇒ SIN slash final.
 *
 * Rutas FE-S6-CARRYOVER (autoridad: `backend.02_16` §5; verificadas contra el
 * OpenAPI vivo de `:8003` el 2026-09-14 — `GET → PlanningCarryoverResult`,
 * `PUT body PlanningCarryoverFlag → 200 BudgetFull`):
 *  - `GET /budget/planning/{idBudget}/carryover`   consulta del arrastre N−1
 *  - `PUT /budget/planning/{idBudget}/carryover`   toggle persistido (idempotente)
 * Rutas de detalle ⇒ SIN slash final (misma convención verificada arriba).
 * BE-S7 (`backend.02_17` §4) extendió el GET del arrastre: las `lines[]`
 * ganan `origin: "line" | "cogs"` y las derivadas traen `id_budget_line: null`.
 *
 * Rutas FE-S7-COGS-PAYFLOW (autoridad: `backend.02_17` §2 — catálogo
 * re-semantizado D-S7-1; verificado contra el OpenAPI vivo de `:8003`):
 *  - `GET /budget/line-payable-term/`  términos de pago al PROVEEDOR del
 *    costo de ventas por Línea: `[{ id_line_payable_term, id_line,
 *    payment_pct (0–1), payment_days (negativo = antes de la ancla) }]`.
 * RUTA DE COLECCIÓN ⇒ CON slash final (307 sin él, mismo detalle verificado
 * para `/budget/planning/`). El mismo catálogo lo administra
 * `budgetRulesService` en Reglas Financieras; aquí SOLO se cachea para la
 * derivación de la Vista Flujo (D-S7-2).
 *
 * Rutas FE-S14-IVA (autoridad: `backend.02_20` §5.9 — contrato §4.6):
 *  - `GET /budget/iva/settlement/{idBudget}?year=`  liquidación bimestral
 *    proyectada del escenario (único dato IVA server-side del FE, D-FE14-4).
 * Ruta unitaria ⇒ SIN slash final.
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
 * FE-S9/BE-S8 §5.2: claves ADITIVAS `lines_purchase`/`total_purchase` con
 * default 0 / 0.0 en el schema → respuestas de backends viejos también son
 * válidas (el modal las trata como opcionales).
 * @typedef {Object} PlanningUploadResult
 * @property {number} id_budget
 * @property {string} scenario_name
 * @property {number} budget_year
 * @property {number} lines_income
 * @property {number} lines_expense
 * @property {number} total_income
 * @property {number} total_expense_fixed
 * @property {number} payment_rules_expansions
 * @property {number} [lines_purchase]
 * @property {number} [total_purchase]
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
   * BE-S11 what-if: nómina SIMULADA de un escenario NO activo (solo lectura,
   * cero escrituras server-side). Escenario ACTIVO ⇒ 400 (sus líneas reales
   * ya viven en budget_lines; la simulación nunca se mezcla con ellas).
   */
  fetchPayrollSimulation(idBudget) {
    return axiosInstance.get(`/budget/planning/${idBudget}/payroll-simulation`)
  },

  /**
   * Crea el Presupuesto Base subiendo los Excel SIIGO en una sola petición
   * multipart (ASM-10 vinculante: `file_ingresos` requerido, `file_gastos`
   * opcional y —desde FE-S9/BE-S8 §5.3— `file_compras` opcional como TERCER
   * archivo "Plan de Importaciones"; jamás una matriz importable).
   * @param {Object} fields
   * @param {string} fields.scenarioName - ≤120.
   * @param {number|string} fields.budgetYear - 2000–2100 (422 fuera de rango).
   * @param {string} [fields.budgetPeriod='ANUAL'] - ≤20.
   * @param {number|string|null} [fields.idDepartment=null] - opcional.
   * @param {File} fields.fileIngresos - .xlsx requerido.
   * @param {File|null} [fields.fileGastos=null] - .xlsx opcional.
   * @param {File|null} [fields.fileCompras=null] - .xlsx opcional (FE-S9 §2.8:
   *   hoja "Importaciones"; SOLO se anexa `file_compras` si llega un File).
   * @returns {Promise<import('axios').AxiosResponse<PlanningUploadResult>>}
   */
  uploadScenario({
    scenarioName,
    budgetYear,
    budgetPeriod = 'ANUAL',
    idDepartment = null,
    fileIngresos,
    fileGastos = null,
    fileCompras = null
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
    // FE-S9 §2.8: parámetro opcional al final de la firma (no rompe llamantes
    // viejos); el campo multipart NUNCA viaja si no hay archivo.
    if (fileCompras instanceof File) {
      formData.append('file_compras', fileCompras)
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
   * Crea UNA línea del escenario (FE-S4D §5 / BE-S4D §3.1):
   * `POST /budget/planning/{idBudget}/line`. `data` es el payload
   * `PlanningLineCreate` ya construido por el modal (snake_case exacto:
   * `id_cost_center, line_type, budget_date, payment_date|null,
   * id_collection|null, projected_amount, description|null, behavior_type,
   * variable_rate|null`). Errores mapeados en store/modal (§6): 404 FK,
   * 400 BR-LINE-04 (año), 422 schema.
   * @param {number|string} idBudget
   * @param {Object} data
   * @returns {Promise<import('axios').AxiosResponse<object>>} 201 línea completa
   */
  createLine(idBudget, data) {
    return axiosInstance.post(`/budget/planning/${idBudget}/line`, data)
  },

  /**
   * Edita los campos estructurales de UNA línea (FE-S4D §5 / BE-S4D §3.2):
   * `PUT /budget/planning/line/{idBudgetLine}`. Contrato PARCIAL
   * (`PlanningLineUpdate`): solo campos editables modificados; omitido =
   * keep (y `null` también = keep ⇒ borrar valores opcionales no soportado).
   * `line_type`/`behavior_type` NUNCA se envían (BR-LINE-06).
   *
   * FE-S14-IVA (backend.02_20 §5.2): `has_iva` es un campo aditivo del
   * contrato parcial — el grid y el modal envían SOLO `{ has_iva: <bool> }`
   * para marcar/desmarcar el flag de una línea EXPENSE; la derivación del
   * backend interpreta `NULL ≡ True` (D-S10-3) y lo IGNORA en INCOME/PURCHASE
   * (D-S10-5). Al ser parcial, ningún otro campo se toca con ese body.
   * @param {number|string} idLine
   * @param {Object} data
   * @returns {Promise<import('axios').AxiosResponse<object>>} 200 línea completa
   */
  updateLine(idLine, data) {
    return axiosInstance.put(`/budget/planning/line/${idLine}`, data)
  },

  /**
   * Elimina FÍSICAMENTE UNA línea (FE-S4D §5 / BE-S4D §3.3):
   * `DELETE /budget/planning/line/{idBudgetLine}` → `{ deleted_id }`.
   * Sin cascadas ni lock por status (D-2/BR-LINE-05).
   * @param {number|string} idLine
   * @returns {Promise<import('axios').AxiosResponse<{deleted_id: number}>>}
   */
  deleteLine(idLine) {
    return axiosInstance.delete(`/budget/planning/line/${idLine}`)
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
  },

  /**
   * Consulta del arrastre de saldos N−1 (FE-S6 §3 / BE-S6 §5.1):
   * `GET /budget/planning/{idBudget}/carryover` → `PlanningCarryoverResult`
   * `{ enabled, source|null, lines[], unavailable_reason|null }`. Con el flag
   * OFF el backend responde `enabled:false, source:null, lines:[]` sin
   * consultar más (BR-CO-01); `lines` solo contienen filas FIJAS de la fuente
   * con fecha efectiva (`payment_date || budget_date`) en el año del escenario
   * (BR-CO-03), orden `coalesce(payment_date, budget_date) ASC,
   * id_budget_line ASC`. 404 `"Budget {id} not found"` si el escenario no
   * existe (aunque esté deshabilitado).
   * @param {number|string} idBudget
   * @returns {Promise<import('axios').AxiosResponse<object>>}
   */
  fetchCarryover(idBudget) {
    return axiosInstance.get(`/budget/planning/${idBudget}/carryover`)
  },

  /**
   * Toggle persistido del arrastre (FE-S6 §3 / BE-S6 §5.2):
   * `PUT /budget/planning/{idBudget}/carryover` con body
   * `PlanningCarryoverFlag` (`{ include_carryover: <bool> }`, snake_case
   * exacto). 200 = el DETALLE COMPLETO (`BudgetFull` + `parent_budget_name` +
   * `budget_lines`) ya con `include_carryover` nuevo — el store lo fusiona
   * con la caché con la MISMA asignación de `fetchScenarioDetail`.
   * Idempotente; jamás valida año ni existencia de fuente (BR-CO-08: flag ON
   * sin fuente es estado legal que presenta el FE).
   * @param {number|string} idBudget
   * @param {boolean} includeCarryover
   * @returns {Promise<import('axios').AxiosResponse<object>>}
   */
  setCarryover(idBudget, includeCarryover) {
    return axiosInstance.put(`/budget/planning/${idBudget}/carryover`, {
      include_carryover: Boolean(includeCarryover)
    })
  },

  /**
   * Catálogo de términos de pago al PROVEEDOR del costo de ventas por Línea
   * (FE-S7 §3; autoridad `backend.02_17` §2/§4 — re-semantizado D-S7-1, la
   * tabla `line_payable_terms` y su CRUD están VIVOS):
   * `GET /budget/line-payable-term/` → `[{ id_line_payable_term, id_line,
   * payment_pct }]` con `payment_pct` en escala 0–1 y `payment_days`
   * negativo = ANTES de la ancla (`budget_date` del ingreso). Lo consume el
   * store (`ensureCatalogs` → `payableTerms`, getter `payableTermsByLine`)
   * para la derivación client-side del bloque "Pago a proveedores" de la
   * Vista Flujo (D-S7-2). Colección ⇒ CON slash final.
   * @returns {Promise<import('axios').AxiosResponse<Array<object>>>}
   */
  fetchPayableTerms: () => axiosInstance.get('/budget/line-payable-term/'),

  /**
   * Catálogo de TASAS DE INTERNACIÓN por Línea (FE-S10-INTERNMENT-SPLIT §2.1;
   * autoridad `backend.02_19` §3.1/§5.3):
   * `GET /budget/line-internment-rate/` → `[{ id_line_internment_rate,
   * id_line, internment_pct }]` con `internment_pct` en FRACCIÓN 0–1
   * (D-S9-1: recargo sobre el costo del proveedor; `CostoProveedor =
   * Total / (1 + %)`). Unicidad por Línea (máx. una tasa; ausencia ⇒ 0,
   * A-5). Lo consume el store (`ensureCatalogs` → `internmentRateByLine`)
   * para el split client-side de la Vista Flujo (D-FE10-1). Colección ⇒ CON
   * slash final.
   * @returns {Promise<import('axios').AxiosResponse<Array<object>>>}
   */
  fetchInternmentRates: () => axiosInstance.get('/budget/line-internment-rate/'),

  /**
   * Catálogo de TÉRMINOS DE PAGO DE LA INTERNACIÓN por Línea (FE-S10 §2.1;
   * autoridad `backend.02_19` §3.2/§5.3):
   * `GET /budget/line-internment-term/` → `[{ id_line_internment_term,
   * id_line, payment_pct, payment_days }]`. SEMÁNTICA DISTINTA de
   * `line-payable-term`: `payment_pct` multiplica el CostoInternación (no el
   * total de la compra) — tablas NO intercambiables. Mismo ciclo de vida
   * (ensureCatalogs, dúo atómico con la tasa ⇒ D-FE10-3). Colección ⇒ CON
   * slash final.
   * @returns {Promise<import('axios').AxiosResponse<Array<object>>>}
   */
  fetchInternmentTerms: () => axiosInstance.get('/budget/line-internment-term/'),

  /**
   * Liquidación de IVA del escenario (FE-S14-IVA §5; autoridad
   * `backend.02_20` §4.6/§5.9): `GET /budget/iva/settlement/{idBudget}`
   * con `?year=` opcional (el BE defaultea a `budget.budget_year`; aquí se
   * envía explícito cuando se conoce para fijar la clave de caché).
   * ÚNICO dato IVA que viaja del backend (D-FE14-4: la recurrencia con
   * arrastre no se recalcula en FE para evitar divergencia). Contrato de
   * respuesta `IvaSettlementResult` (§4.6): claves `tax_rate_used`,
   * `basis: "cash"`, `periods[]` (`generated/deductible{fixed_expenses,
   * variable_expenses,import_vat,nationalization_vat}/prior_balance/
   * tax_base/payment/carry_balance/events_count`), `unassigned`,
   * `totals{generated,deductable,payments,final_balance}` (ojo: `deductable`
   * con la grafía literal del BE) y `meta.warnings`. Ruta unitaria ⇒ SIN
   * slash final. 404 `"Budget {id} not found"`; sin calendario ⇒ 200 con
   * `periods: []` + warning (nunca error — NFR-BE10-3).
   * @param {number|string} idBudget
   * @param {number|string|null} [year=null] null/'' ⇒ el default del backend
   * @returns {Promise<import('axios').AxiosResponse<object>>}
   */
  getIvaSettlement(idBudget, year = null) {
    const hasYear =
      year !== null && year !== undefined && String(year).trim() !== ''
    const query = hasYear ? `?year=${encodeURIComponent(year)}` : ''
    return axiosInstance.get(`/budget/iva/settlement/${idBudget}${query}`)
  },

  /**
   * Elimina FÍSICAMENTE un escenario borrador reutilizando el endpoint
   * LEGACY del CRUD de presupuestos (frontend.03_07 / autoridad
   * `backend.02_14` D-3): `DELETE /budget/{idBudget}`. NO existe ruta
   * `/budget/planning/{id}` DELETE (FD-1: no inventar rutas).
   *
   * Ruta unitaria ⇒ SIN slash final (misma forma que
   * `/budget/planning/line/{idBudgetLine}`). El backend re-valida el estado
   * en vuelo: 400 "Only draft budgets can be deleted" → kind `conflict`;
   * id inexistente → 404 → kind `notfound` (los clasifica el store).
   * @param {number|string} idBudget
   * @returns {Promise<import('axios').AxiosResponse<{message: string}>>}
   */
  deleteScenario(idBudget) {
    return axiosInstance.delete(`/budget/${idBudget}`)
  }
}
