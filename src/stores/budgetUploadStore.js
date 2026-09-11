import { defineStore } from 'pinia'
import { budgetUploadService } from '@/services/budgetUploadService.js'
import { useUserStore } from '@/stores/userStore.js'
import router from '@/router/index.js'

/**
 * Estado del Centro de Ingesta (FE-S3-UPLOAD-CENTER, spec §6).
 *
 * Claves de dataset en camelCase para flags/UI; el estado del backend
 * (`GET /budget/upload/status`) usa claves snake_case, mapeadas aquí.
 */
const DATASETS = {
  actualCosts: {
    statusKey: 'actual_costs',
    run: (file, extra) => budgetUploadService.uploadActualCosts(file, extra.excelTotalCost)
  },
  actualExpenses: {
    statusKey: 'actual_expenses',
    run: (file) => budgetUploadService.uploadActualExpenses(file)
  },
  paymentLedger: {
    statusKey: 'payment_ledger',
    run: (file, extra) =>
      budgetUploadService.uploadPaymentLedger(file, Boolean(extra.includeInitialBalances))
  },
  accountsReceivable: {
    statusKey: 'accounts_receivable',
    run: (file, extra) => budgetUploadService.uploadAccountsReceivable(file, Boolean(extra.force))
  }
}

const GENERIC_VALIDATION_MESSAGE =
  'La solicitud fue rechazada por validación de datos. Reintenta o contacta soporte.'

const GENERIC_UNEXPECTED_MESSAGE =
  'El servidor rechazó el archivo por un motivo no clasificado. Reintenta o contacta soporte.'

/**
 * Normaliza un error de Axios a los "kinds" de la matriz §5.3 de la spec,
 * verificados contra `app/api/budget/upload.py` y
 * `app/utils/templates/budgetTemplates.py`.
 *
 * Kinds producidos: `network`, `auth` (401/403 — sin modal), `string_detail`,
 * `missing_customers`, `stale_cutoff`, `total_mismatch`, `generic_examples`,
 * `server` (5xx).
 *
 * @param {import('axios').AxiosError} err
 * @returns {{ kind: string, [key: string]: any }}
 */
export function classifyError(err) {
  const response = err?.response

  // Sin respuesta: red caída, CORS o timeout de la subida (§10.4 `network`).
  if (!response) {
    return { kind: 'network' }
  }

  const status = response.status

  // 401/403 NO abren modal: la sesión se limpia y se redirige a Login.
  // (Desviación documentada: el repo no tiene interceptor de respuesta 401;
  // la spec §6 asume que lo hay. Se resuelve de forma localizada aquí, sin
  // tocar `plugins/axios.js` para no afectar el flujo de LoginView.)
  if (status === 401 || status === 403) {
    return { kind: 'auth', status }
  }

  // 422: validación FastAPI de campos Form -> string_detail genérico (§6).
  if (status === 422) {
    return { kind: 'string_detail', message: GENERIC_VALIDATION_MESSAGE }
  }

  const detail = response.data?.detail

  if (status >= 500) {
    return { kind: 'server', detail: detail ?? response.data ?? null }
  }

  // Variante 1: detail como string plano ("Only .xlsx files are supported",
  // "N records have invalid dates", "References not found in catalog: [...]").
  if (typeof detail === 'string') {
    return { kind: 'string_detail', message: detail }
  }

  if (detail && typeof detail === 'object') {
    // Escenario A (solo Cartera): clientes no registrados en el CRM.
    if (Array.isArray(detail.missing_identifications)) {
      return {
        kind: 'missing_customers',
        message: detail.message,
        missing_count: detail.missing_count ?? detail.missing_identifications.length,
        missing_identifications: detail.missing_identifications,
        examples: Array.isArray(detail.examples) ? detail.examples : []
      }
    }

    // Escenario B (solo Cartera): guardia de corte antiguo.
    if (detail.file_cutoff !== undefined && detail.stored_cutoff !== undefined) {
      return {
        kind: 'stale_cutoff',
        message: detail.message,
        file_cutoff: detail.file_cutoff,
        stored_cutoff: detail.stored_cutoff
      }
    }

    // Solo Costos: el total digitado no cuadra con la suma del archivo.
    if (detail.excel_total !== undefined && detail.calculated_total !== undefined) {
      return {
        kind: 'total_mismatch',
        message: detail.message,
        excel_total: detail.excel_total,
        calculated_total: detail.calculated_total,
        difference: detail.difference,
        tolerance: detail.tolerance
      }
    }

    // Costos (centros de costo no resueltos) y variantes equivalentes del
    // ETL de Gastos (`invalid_cost_centers`, no listada en la spec madre):
    // se renderizan con la misma tabla dinámica por claves.
    const rows = Array.isArray(detail.examples)
      ? detail.examples
      : Array.isArray(detail.invalid_cost_centers)
        ? detail.invalid_cost_centers
        : null
    if (rows) {
      return { kind: 'generic_examples', message: detail.message, rows }
    }

    // Objeto con solo `message`.
    if (typeof detail.message === 'string') {
      return { kind: 'string_detail', message: detail.message }
    }
  }

  return { kind: 'string_detail', message: GENERIC_UNEXPECTED_MESSAGE }
}

export const useBudgetUploadStore = defineStore('budgetUploadStore', {
  state: () => ({
    /** @type {Record<string, {last_upload: string|null}>|null} */
    status: null,
    statusLoading: false,
    /** true si `GET /budget/upload/status` falló (404/network). Solo degrada líneas de fecha (§7.4). */
    statusFailed: false,
    /** Flags de subida por tarjeta (anti doble-envío, NFR-3). */
    uploading: {
      actualCosts: false,
      actualExpenses: false,
      paymentLedger: false,
      accountsReceivable: false
    },
    /** Archivos/extras conservados en memoria para reintentos (§10.3/§10.4). */
    pending: {},
    /** @type {{ open: boolean, dataset: string, kind: 'success'|'error', payload: object }} */
    feedback: { open: false, dataset: '', kind: '', payload: null }
  }),

  getters: {
    /**
     * @returns {(datasetKey: string) => boolean}
     */
    isBusy: (state) => (datasetKey) => Boolean(state.uploading[datasetKey]),

    /**
     * `last_upload` (ISO o null) de un dataset según la clave camelCase.
     * @returns {(datasetKey: string) => string|null}
     */
    lastUploadOf: (state) => (datasetKey) => {
      const statusKey = DATASETS[datasetKey]?.statusKey
      if (!statusKey || !state.status) return null
      const entry = state.status[statusKey]
      return entry?.last_upload ?? null
    }
  },

  actions: {
    /**
     * Refresco del estado por tarjeta. El fallo es SIEMPRE silencioso
     * (nunca toast/modal): el status es decorativo (spec §7.4/§7.5).
     * @param {{ silent?: boolean }} [options] - `silent` evita el skeleton
     *   durante el refresco posterior a una subida exitosa (§7.2).
     */
    async fetchStatus({ silent = false } = {}) {
      if (!silent) {
        this.statusLoading = true
      }
      try {
        const response = await budgetUploadService.fetchUploadStatus()
        this.status = response?.data ?? null
        this.statusFailed = false
      } catch {
        // 404 (endpoint aún no implementado, PQ-3), 401 u otros: degradado inline.
        this.statusFailed = true
      } finally {
        if (!silent) {
          this.statusLoading = false
        }
      }
    },

    /**
     * Sube el archivo de una tarjeta. Guarda el `File` en memoria por dataset
     * para permitir "Forzar carga" y "Reintentar" sin re-abrir el explorador
     * (decisiones A11/§10.3).
     *
     * @param {string} datasetKey - `actualCosts|actualExpenses|paymentLedger|accountsReceivable`.
     * @param {{ file: File, extra?: Object }} payload
     */
    async upload(datasetKey, { file, extra = {} } = {}) {
      const entry = DATASETS[datasetKey]
      if (!entry || !file) return

      // Guard de reentrada: segundo click no genera una segunda petición (§6).
      if (this.uploading[datasetKey]) return

      this.pending[datasetKey] = { file, extra }
      this.uploading[datasetKey] = true

      try {
        const response = await entry.run(file, extra)
        this.feedback = {
          open: true,
          dataset: datasetKey,
          kind: 'success',
          payload: response?.data ?? {}
        }
        // SIEMPRE refresco del status tras un 200 (§6/§7.2), silencioso.
        await this.fetchStatus({ silent: true })
      } catch (err) {
        const classified = classifyError(err)
        if (classified.kind === 'auth') {
          // 401/403: sin modal; limpia sesión y redirige a Login (equivalente
          // localizado al "interceptor global" que la spec da por existente).
          const userStore = useUserStore()
          userStore.logout()
          if (router.currentRoute.value.name !== 'Login') {
            router.push({ name: 'Login' })
          }
          return
        }
        this.feedback = {
          open: true,
          dataset: datasetKey,
          kind: 'error',
          payload: classified
        }
      } finally {
        this.uploading[datasetKey] = false
      }
    },

    /**
     * Escenario B (§10.3): reenvía el MISMO archivo en memoria con
     * `force='true'`, cerrando el modal para mostrar el spinner de la tarjeta.
     * @param {string} datasetKey
     */
    async retryWithForce(datasetKey) {
      const saved = this.pending[datasetKey]
      if (!saved?.file || this.uploading[datasetKey]) return
      this.closeFeedback()
      await this.upload(datasetKey, {
        file: saved.file,
        extra: { ...saved.extra, force: true }
      })
    },

    /**
     * Reintento de red (§10.4): mismo archivo y mismos extras en memoria.
     * @param {string} datasetKey
     */
    async retrySame(datasetKey) {
      const saved = this.pending[datasetKey]
      if (!saved?.file || this.uploading[datasetKey]) return
      await this.upload(datasetKey, { file: saved.file, extra: saved.extra })
    },

    /** Cierra el modal de feedback conservando el archivo para reintentos. */
    closeFeedback() {
      this.feedback = { ...this.feedback, open: false }
    },

    /**
     * Libera el archivo/extras en memoria de una tarjeta tras "Cerrar" o
     * "Cargar otro archivo" (§10.1, manejado por el dashboard).
     * @param {string} datasetKey
     */
    resetDataset(datasetKey) {
      if (this.uploading[datasetKey]) return
      delete this.pending[datasetKey]
    }
  }
})
