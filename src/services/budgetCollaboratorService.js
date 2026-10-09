import axiosInstance from '@/plugins/axios'

/**
 * Servicio Axios del dominio Colaboradores / Nómina (FE-S15-COLLAB §4,
 * espejo de backend.02_21 §9 = BE-S11). Capa PURA de transporte (patrón
 * A13 del repo: componentes NUNCA importan axios; todo paso por aquí) más
 * un clasificador de errores SIN estado reactivo — `classifyCollaboratorError`
 * — porque FE-S15 decidió NO crear store Pinia (v1: refs/composables
 * locales; el dominio no se comparte entre vistas).
 *
 * Rutas EXACTAS del §4 de la spec FE (sin slash final: autoridad del
 * contrato BE §9 — si el router BE publica colecciones con `"/"`, el 307 de
 * FastAPI lo resuelve el navegador de forma transparente para GET/POST con
 * body y queda documentado como punto de verificación en QA).
 *
 * Instancia compartida de `@/plugins/axios`: JWT auto-inyectado. La subida
 * del Excel usa timeout extendido (patrón `MULTIPART_CONFIG` de
 * `budgetPlanningService`).
 */

const IMPORT_TIMEOUT_MS = 120000

const MULTIPART_CONFIG = {
  headers: { 'Content-Type': 'multipart/form-data' },
  timeout: IMPORT_TIMEOUT_MS
}

export const budgetCollaboratorService = {
  /* ───────────────────────────── maestro ───────────────────────────── */

  /**
   * Listado paginado en servidor (§4: `GET /budget/collaborator`).
   * @param {{q?: string, idCostCenter?: number|string|null, status?: string|null, page?: number, size?: number}} params
   * @returns {Promise<import('axios').AxiosResponse<{ total: number, items: object[] }>>}
   */
  fetchCollaborators({ q = '', idCostCenter = null, status = '', page = 1, size = 25 } = {}) {
    const query = new URLSearchParams()
    if (String(q).trim()) query.set('q', String(q).trim())
    if (idCostCenter !== null && idCostCenter !== undefined && String(idCostCenter) !== '') {
      query.set('id_cost_center', String(idCostCenter))
    }
    if (status) query.set('status', String(status))
    query.set('page', String(page))
    query.set('size', String(size))
    return axiosInstance.get(`/budget/collaborator?${query.toString()}`)
  },

  /**
   * Ficha del colaborador (maestro; planes si el BE los incluye como
   * `salary_plans`).
   * @param {number|string} id
   */
  fetchCollaborator(id) {
    return axiosInstance.get(`/budget/collaborator/${id}`)
  },

  /** Alta manual (maestro). 409 `doc_value` duplicado ⇒ clasificado 'duplicate'. */
  createCollaborator(payload) {
    return axiosInstance.post('/budget/collaborator', payload)
  },

  /** Edición del maestro (NO salario — D-FE15-6). */
  updateCollaborator(id, payload) {
    return axiosInstance.put(`/budget/collaborator/${id}`, payload)
  },

  /**
   * Nuevo plan con vigencia (POST salary-plan): el BE cierra el anterior
   * (BR-COLLAB-02 / D-FE15-6).
   */
  createSalaryPlan(id, payload) {
    return axiosInstance.post(`/budget/collaborator/${id}/salary-plan`, payload)
  },

  /** Terminar contrato ⇒ status terminated + asientos LIQ (BE §5.5). */
  terminateCollaborator(id, terminationDate) {
    return axiosInstance.post(`/budget/collaborator/${id}/terminate`, {
      termination_date: terminationDate
    })
  },

  /* ───────────────────────────── motor / lecturas ───────────────────────────── */

  /**
   * Importe de la plantilla de nómina (multipart, todo-o-nada R-06).
   * 200 ⇒ `{imported, created, updated, no_change, generated_lines}`;
   * 400 ⇒ `{message, invalid_rows:[{excel_row, motivo}]}` (clasificado
   * 'invalid_rows' por el clasificador de abajo).
   * @param {File} file
   */
  importCollaborators(file) {
    const formData = new FormData()
    formData.append('file', file)
    return axiosInstance.post('/budget/collaborator/import', formData, MULTIPART_CONFIG)
  },

  /** Desglose de un mes `YYYY-MM` (capa CAJA/PROVISION + vigencia params). */
  fetchBreakdown(id, month) {
    return axiosInstance.get(
      `/budget/collaborator/${id}/breakdown?month=${encodeURIComponent(month)}`
    )
  },

  /** Saldos de provisiones (prima/cesantías/intereses). */
  fetchProvisions(id) {
    return axiosInstance.get(`/budget/collaborator/${id}/provisions`)
  },

  /**
   * Recalcular mes (D-FE15-9). `scope` ya resuelto por el modal:
   * `{month, id_collaborator?, id_cost_center?}`. 200 ⇒ `{replaced_lines}`.
   */
  recalculate(payload) {
    return axiosInstance.post('/budget/collaborator/recalculate', payload)
  },

  /**
   * Estado de materialización de nómina del escenario activo del año
   * (banner Opcion A, enmienda BE-S11). 200 → {year, scenario_id_budget,
   * active_collaborators, collaborators_with_open_plan,
   * payroll_lines_in_scenario, needs_materialization} — solo conteos.
   */
  fetchMaterializationStatus(year) {
    return axiosInstance.get(
      `/budget/collaborator/materialization-status?year=${encodeURIComponent(year)}`
    )
  },

  /* ───────────────────────────── parámetros / catálogo ───────────────────────────── */

  /**
   * Parámetros laborales de una vigencia (§4.3 BE: clave/valor + arl_rates).
   * 404/422 de vigencia inexistente ⇒ banner rojo (usa `detail.message`).
   * @param {number|string} vigencia
   */
  fetchLaborParams(vigencia) {
    return axiosInstance.get(`/budget/labor-params?vigencia=${encodeURIComponent(vigencia)}`)
  },

  /**
   * Upsert de parámetros (solo admin, D-FE15-4).
   * @param {{vigencia: number, values: Object<string,string>, arl_rates?: Object<string,number>}} payload
   */
  saveLaborParams(payload) {
    return axiosInstance.put('/budget/labor-params', payload)
  },

  /** Catálogo de componentes de costo (solo lectura; UI oculta inactivos). */
  fetchCostComponents() {
    return axiosInstance.get('/budget/cost-components')
  }
}

/* ───────────────────────── clasificación de errores ───────────────────────── */

/**
 * Humaniza el `detail` 422 de FastAPI (array `{loc, msg}`) — patrón del
 * store de planning, replicado local porque FE-S15 no introduce store.
 */
function humanize422(detail) {
  if (Array.isArray(detail) && detail.length > 0) {
    const messages = detail
      .map((item) =>
        typeof item?.msg === 'string' ? item.msg.replace(/^value\.?/i, '').trim() : ''
      )
      .filter(Boolean)
    if (messages.length) return messages.join(' · ')
  }
  if (typeof detail === 'string' && detail) return detail
  return 'El servidor rechazó los datos enviados. Revisa los valores e inténtalo de nuevo.'
}

/** Extrae un mensaje legible del cuerpo de error del BE (estilo `Exceptions`). */
function extractApiMessage(data) {
  const detail = data?.detail
  if (detail && typeof detail === 'object') {
    if (typeof detail.message === 'string') return detail.message
    if (typeof detail.reason === 'string') return detail.reason
    return ''
  }
  if (typeof detail === 'string') return detail
  if (typeof data?.message === 'string') return data.message
  return ''
}

/**
 * Normaliza errores Axios del dominio a "kinds" consumibles por la UI
 * (espejo del `classifyPlanningError` de la planeación, extendido con los
 * casos propios de BE-S11 §9):
 *
 *  !response          ⇒ 'network'
 *  401                ⇒ 'auth'        (sesión caída)
 *  403                ⇒ 'forbidden'   (roles COLLAB_* del BE — D-S11-7)
 *  404                ⇒ 'notfound'    + `message` (p. ej. vigencia/colaborador)
 *  409                ⇒ 'duplicate'   + `message` (doc_value duplicado → inline)
 *  422                ⇒ 'validation'  + `message` humano
 *  400 con invalid_rows ⇒ 'invalid_rows' + `message` + `invalid_rows[]` (R-06)
 *  400 resto          ⇒ 'conflict'    + `message` (R-05 vigencia sin params,
 *                                     FK inválida… — se pinta el detalle del
 *                                     BE SIN inventar texto, §6 spec FE)
 *  5xx                ⇒ 'server'
 *  resto              ⇒ 'unknown'     + `message` si lo hubiere
 *
 * @param {import('axios').AxiosError} err
 * @returns {{ kind: string, status?: number, message?: string, invalid_rows?: object[] }}
 */
export function classifyCollaboratorError(err) {
  const response = err?.response
  if (!response) return { kind: 'network' }

  const status = response.status
  const data = response.data
  const message = extractApiMessage(data)

  if (status === 401) return { kind: 'auth', status }
  if (status === 403) return { kind: 'forbidden', status, message }
  if (status === 404) return { kind: 'notfound', status, message }
  if (status === 409) {
    return {
      kind: 'duplicate',
      status,
      message: message || 'Ya existe un colaborador con ese documento.'
    }
  }
  if (status === 422) return { kind: 'validation', status, message: humanize422(data?.detail) }

  if (status === 400) {
    const detail = data?.detail ?? data
    if (detail && typeof detail === 'object' && Array.isArray(detail.invalid_rows)) {
      return {
        kind: 'invalid_rows',
        status,
        message: typeof detail.message === 'string' ? detail.message : '',
        invalid_rows: detail.invalid_rows
      }
    }
    return { kind: 'conflict', status, message }
  }

  if (status >= 500) return { kind: 'server', status, message }
  return { kind: 'unknown', status, message }
}

/** Toast estándar de permiso denegado (el BE es la autoridad, D-S11-7). */
export function forbiddenMessage(result) {
  return result?.message || 'No tiene permiso para realizar esta operación.'
}
