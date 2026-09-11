<script setup>
/**
 * UploadFeedbackModal — ÚNICA instancia de modal de éxito/error para las
 * 4 tarjetas del Centro de Ingesta (spec §10). CSS propio del proyecto,
 * sin Vuetify (NFR-1). Controlado por `budgetUploadStore.feedback`.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useBudgetUploadStore } from '@/stores/budgetUploadStore.js'

const emit = defineEmits(['closed'])

const budgetUploadStore = useBudgetUploadStore()

const dialogRef = ref(null)
const copiedKey = ref('')
let copiedTimer = null

/* ------------------------------------------------------------------ */
/* Formateadores locales es-CO (NFR-7) — sin dependencias nuevas       */
/* ------------------------------------------------------------------ */

const copFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0
})
const intFormatter = new Intl.NumberFormat('es-CO')
const dateTimeFormatter = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' })

/**
 * @param {number|null|undefined} value
 * @returns {string}
 */
function formatMoney(value) {
  const num = Number(value)
  return Number.isFinite(num) ? copFormatter.format(num) : '—'
}

/**
 * @param {number|null|undefined} value
 * @returns {string}
 */
function formatCount(value) {
  const num = Number(value)
  return Number.isFinite(num) ? intFormatter.format(num) : '—'
}

/**
 * Convierte 'YYYY-MM-DD' (o ISO datetime) a Date local sin desplazamiento
 * de zona para las fechas puras, y la formatea es-CO.
 * @param {string|null|undefined} value
 * @returns {string}
 */
function formatLocalDate(value) {
  if (!value) return '—'
  const plain = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const date = plain
    ? new Date(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3]))
    : new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : dateTimeFormatter.format(date)
}

/* ------------------------------------------------------------------ */
/* Estado derivado del store                                           */
/* ------------------------------------------------------------------ */

const isOpen = computed(() => budgetUploadStore.feedback.open)
const dataset = computed(() => budgetUploadStore.feedback.dataset)
const kind = computed(() =>
  budgetUploadStore.feedback.kind === 'success'
    ? 'success'
    : budgetUploadStore.feedback.payload?.kind
)
const payload = computed(() => budgetUploadStore.feedback.payload || {})
const busy = computed(() => budgetUploadStore.isBusy(dataset.value))

const DATASET_LABELS = {
  actualCosts: 'Costos Reales',
  actualExpenses: 'Gastos Operativos',
  paymentLedger: 'Libro de Pagos',
  accountsReceivable: 'Estado de Cartera'
}

const datasetLabel = computed(() => DATASET_LABELS[dataset.value] || 'Dataset')

/**
 * Mapeo §5.2 -> resumen del modal de éxito por dataset.
 * `rows`: contadores; `money`: sumatorias COP (destacada primero).
 */
const SUCCESS_CONFIG = {
  actualCosts: {
    rows: (p) => [
      { label: 'Filas insertadas', value: p.records_inserted },
      { label: 'Filas reemplazadas', value: p.records_deleted }
    ],
    money: (p) => [{ label: 'Total de costos registrados', value: p.total_amount, primary: true }]
  },
  actualExpenses: {
    rows: (p) => [
      { label: 'Filas insertadas', value: p.records_inserted },
      { label: 'Filas reemplazadas', value: p.records_replaced },
      { label: 'Filas procesadas', value: p.details?.total_rows_processed },
      { label: 'Filas filtradas', value: p.details?.rows_filtered },
      { label: 'Gastos válidos', value: p.details?.valid_expenses }
    ],
    money: () => []
  },
  paymentLedger: {
    rows: (p) => [
      { label: 'Filas insertadas', value: p.records_inserted },
      { label: 'Filas reemplazadas', value: p.records_replaced }
    ],
    money: (p) => [
      { label: 'Liquidez neta', value: p.details?.net_liquidity, primary: true },
      { label: 'Entradas de efectivo', value: p.details?.total_cash_in },
      { label: 'Salidas de efectivo', value: p.details?.total_cash_out }
    ]
  },
  accountsReceivable: {
    rows: (p) => [
      { label: 'Filas insertadas', value: p.records_inserted },
      { label: 'Filas reemplazadas', value: p.records_replaced },
      { label: 'Cuentas cerradas', value: p.records_closed },
      { label: 'Fecha de corte', value: p.statement_date, date: true }
    ],
    money: (p) => [
      {
        label: 'Saldo total en cartera',
        value: p.details?.total_outstanding_balance,
        primary: true
      }
    ]
  }
}

const successRows = computed(() => {
  const config = SUCCESS_CONFIG[dataset.value]
  return config ? config.rows(payload.value) : []
})

const successMoney = computed(() => {
  const config = SUCCESS_CONFIG[dataset.value]
  return config ? config.money(payload.value) : []
})

const forced = computed(() => payload.value?.forced === true)

/** Encabezado según kind (título + variante de color). */
const HEADERS = {
  success: { title: null, tone: 'success' },
  missing_customers: { title: null, tone: 'error' },
  stale_cutoff: { title: 'El archivo es de un corte más antiguo', tone: 'warning' },
  total_mismatch: { title: 'El total declarado no coincide', tone: 'error' },
  generic_examples: { title: null, tone: 'error' },
  string_detail: { title: 'El servidor rechazó el archivo', tone: 'error' },
  server: { title: 'Error del servidor', tone: 'error' },
  network: { title: 'Sin conexión con el servidor', tone: 'error' },
  error: { title: 'El archivo no se pudo procesar', tone: 'error' }
}

const headerTone = computed(() => HEADERS[kind.value]?.tone || 'error')

const modalTitle = computed(() => {
  const message = payload.value?.message
  if (kind.value === 'success') return message || 'Carga completada'
  const header = HEADERS[kind.value]
  if (header?.title) return header.title
  // missing_customers y generic_examples usan el `message` del backend
  // como encabezado (§10.2/§10.4).
  return message || 'El archivo no se pudo procesar'
})

/* ----------------------------- string_detail ----------------------------- */

/**
 * Si el detalle parece una lista ("Texto: [ 'a', 'b' ]"), separa el texto
 * introductorio de los elementos para renderizar chips copiables (§10.4).
 * @param {string} text
 * @returns {{ lead: string, items: string[] }|null}
 */
function parseListLike(text) {
  const match = String(text).match(/^(.*?):\s*\[([^\]]*)\]\s*$/)
  if (!match) return null
  const items = match[2]
    .split(',')
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
  if (!items.length) return null
  return { lead: `${match[1].trim()}:`, items }
}

const stringDetail = computed(() => {
  if (kind.value !== 'string_detail') return null
  return parseListLike(payload.value?.message || '')
})

/* --------------------------- generic_examples ---------------------------- */

const genericColumns = computed(() => {
  const rows = payload.value?.rows
  if (!Array.isArray(rows) || rows.length === 0 || typeof rows[0] !== 'object') return []
  return Object.keys(rows[0])
})

/**
 * Convierte una clave tipo `document_number` en etiqueta legible.
 * @param {string} key
 * @returns {string}
 */
function prettyKey(key) {
  const spaced = String(key).replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * @param {*} value
 * @returns {string}
 */
function cellText(value) {
  if (value === null || value === undefined) return '—'
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}

/* ------------------------------- portapapeles ---------------------------- */

/**
 * Copia texto con fallback a `execCommand('copy')` para contextos HTTP no
 * seguros donde `navigator.clipboard` está indisponible (§10.2.4).
 * @param {string} text
 * @returns {Promise<boolean>}
 */
async function copyText(text) {
  const value = String(text ?? '')
  if (!value) return false
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    /* cae al fallback */
  }
  try {
    const area = document.createElement('textarea')
    area.value = value
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

/**
 * Copia con feedback transitorio "Copiado ✓" identificado por `key`.
 * @param {string} key
 * @param {string} text
 */
async function handleCopy(key, text) {
  const ok = await copyText(text)
  if (ok) {
    copiedKey.value = key
    if (copiedTimer) clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => {
      copiedKey.value = ''
    }, 1800)
  }
}

function copyAllNits() {
  const ids = Array.isArray(payload.value?.missing_identifications)
    ? payload.value.missing_identifications
    : []
  handleCopy('all', ids.join(','))
}

function copyMissingCountNote() {
  return (
    Number(payload.value?.missing_count) > 0 &&
    Number(payload.value?.missing_count) > (payload.value?.examples?.length ?? 0)
  )
}

/* -------------------------------- acciones ------------------------------- */

/**
 * Cierra el modal. `reset`: 'all' limpia archivo + formulario de la tarjeta,
 * 'file' solo el archivo (conserva extras), 'none' no toca nada (§10.1).
 * @param {'all'|'file'|'none'} reset
 */
function finish(reset) {
  if (busy.value) return
  emit('closed', { dataset: dataset.value, reset })
  budgetUploadStore.closeFeedback()
}

/** Escenario B (§10.3): reenvía el mismo archivo en memoria con force=true. */
function forceStaleUpload() {
  if (busy.value) return
  budgetUploadStore.retryWithForce(dataset.value || 'accountsReceivable')
}

/** Reintento de red (§10.4): mismo FormData en memoria, modal permanece. */
function retryNetworkUpload() {
  if (busy.value) return
  budgetUploadStore.retrySame(dataset.value)
}

/* ---------------------- teclado, foco y click-fuera ---------------------- */

function onGlobalKeydown(event) {
  if (event.key === 'Escape' && isOpen.value && !busy.value) {
    finish('none')
  }
}

function onOverlayMousedown(event) {
  if (event.target === event.currentTarget && !busy.value) {
    finish('none')
  }
}

watch(isOpen, async (open) => {
  if (open) {
    await nextTick()
    dialogRef.value?.focus()
  } else {
    copiedKey.value = ''
  }
})

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
  if (copiedTimer) clearTimeout(copiedTimer)
})

const serverDetailRaw = computed(() => {
  const raw = payload.value?.detail
  if (raw === null || raw === undefined) return 'Sin detalle técnico disponible.'
  if (typeof raw === 'string') return raw
  try {
    return JSON.stringify(raw, null, 2)
  } catch {
    return String(raw)
  }
})
</script>

<template>
  <div v-if="isOpen" class="fb-overlay" @mousedown="onOverlayMousedown">
    <div
      ref="dialogRef"
      class="fb-dialog"
      :class="`tone-${headerTone}`"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="'upload-feedback-title'"
      tabindex="-1"
    >
      <!-- ============================ Encabezado =========================== -->
      <header class="fb-header">
        <span v-if="kind === 'success'" class="fb-header-icon" aria-hidden="true">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </span>
        <span v-else-if="headerTone === 'warning'" class="fb-header-icon" aria-hidden="true"
          >⚠️</span
        >
        <span v-else class="fb-header-icon" aria-hidden="true">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </span>
        <div class="fb-header-text">
          <h3 id="upload-feedback-title" class="fb-title">{{ modalTitle }}</h3>
          <p class="fb-subtitle">
            {{ datasetLabel }}
            <span v-if="forced && kind === 'success'" class="fb-badge-forced">Carga forzada</span>
          </p>
        </div>
        <button
          type="button"
          class="fb-x"
          :disabled="busy"
          aria-label="Cerrar ventana"
          @click="finish('none')"
        >
          ✕
        </button>
      </header>

      <p v-if="busy" class="fb-busy-banner" aria-live="polite">
        <span class="fb-spinner" aria-hidden="true"></span> Procesando archivo, no cierre esta
        ventana…
      </p>

      <!-- ============================== ÉXITO ============================== -->
      <div v-if="kind === 'success'" class="fb-body">
        <ul class="fb-stats">
          <li v-for="row in successRows" :key="row.label" class="fb-stat">
            <span class="fb-stat-value">
              {{ row.date ? formatLocalDate(row.value) : formatCount(row.value) }}
            </span>
            <span class="fb-stat-label">{{ row.label }}</span>
          </li>
        </ul>

        <div v-if="successMoney.length" class="fb-money-zone">
          <div
            v-for="item in successMoney"
            :key="item.label"
            class="fb-money"
            :class="{ 'is-primary': item.primary }"
          >
            <span class="fb-money-value">{{ formatMoney(item.value) }}</span>
            <span class="fb-money-label">{{ item.label }}</span>
          </div>
        </div>

        <p v-if="payload.source_file" class="fb-meta">
          Archivo procesado: {{ payload.source_file }}
        </p>
      </div>

      <!-- =================== Escenario A: clientes fantasma ================ -->
      <div v-else-if="kind === 'missing_customers'" class="fb-body">
        <p class="fb-alert fb-alert-error">
          No pudimos procesar el archivo porque estos clientes no están registrados en el CRM.
        </p>

        <div class="fb-table-scroll">
          <table class="fb-table">
            <thead>
              <tr>
                <th>NIT / identificación</th>
                <th>Nombre</th>
                <th>Documentos</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in payload.examples || []" :key="index">
                <td class="fb-cell-id">
                  <span>{{ row.identification }}</span>
                  <button
                    type="button"
                    class="fb-copy-mini"
                    :title="`Copiar identificación ${row.identification}`"
                    @click="handleCopy(`row-${index}`, row.identification)"
                  >
                    {{ copiedKey === `row-${index}` ? 'Copiado ✓' : 'Copiar' }}
                  </button>
                </td>
                <td>{{ row.customer_name }}</td>
                <td>{{ (row.documents || []).join(', ') }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="fb-toolbar">
          <button type="button" class="btn btn-secondary" @click="copyAllNits">
            {{ copiedKey === 'all' ? 'Copiado ✓' : 'Copiar todos los NITs' }}
          </button>
          <span v-if="copiedKey === 'all'" class="fb-copied-feedback" aria-live="polite">
            Copiado ✓
          </span>
        </div>

        <p v-if="copyMissingCountNote()" class="fb-note">
          Mostrando los primeros {{ payload.examples?.length || 0 }} de
          {{ payload.missing_count }} clientes faltantes; la lista completa para copiado está
          disponible con el botón anterior.
        </p>

        <p class="fb-footnote">No se guardó ningún cambio en el CRM.</p>
      </div>

      <!-- =============== Escenario B: corte antiguo (stale) ================ -->
      <div v-else-if="kind === 'stale_cutoff'" class="fb-body">
        <div class="fb-alert fb-alert-warning">
          <p class="fb-alert-title">
            Este archivo corresponde a un corte más antiguo que el almacenado.
          </p>
          <p v-if="payload.message" class="fb-server-msg">{{ payload.message }}</p>
          <div class="fb-cutoff-compare">
            <div class="fb-cutoff">
              <span class="fb-cutoff-label">Corte del archivo</span>
              <span class="fb-cutoff-value">{{ formatLocalDate(payload.file_cutoff) }}</span>
            </div>
            <div class="fb-cutoff">
              <span class="fb-cutoff-label">Corte almacenado</span>
              <span class="fb-cutoff-value">{{ formatLocalDate(payload.stored_cutoff) }}</span>
            </div>
          </div>
          <p class="fb-alert-help">
            Marcar documentos como pagados podría generar cierres falsos. Forzar la carga solo es
            recomendable si este corte anterior es válido.
          </p>
        </div>
        <p class="fb-footnote">No se guardó ningún cambio en el CRM.</p>
      </div>

      <!-- ====================== total_mismatch (§10.4) ===================== -->
      <div v-else-if="kind === 'total_mismatch'" class="fb-body">
        <p class="fb-alert fb-alert-error">
          El total digitado no cuadra con la suma de los costos del archivo (±100 COP). Revisa y
          vuelve a intentar.
        </p>
        <div class="fb-table-scroll">
          <table class="fb-table fb-table-compare">
            <tbody>
              <tr>
                <th>Total declarado</th>
                <td class="is-money">{{ formatMoney(payload.excel_total) }}</td>
              </tr>
              <tr>
                <th>Suma calculada</th>
                <td class="is-money">{{ formatMoney(payload.calculated_total) }}</td>
              </tr>
              <tr>
                <th>Diferencia</th>
                <td class="is-money is-diff">{{ formatMoney(payload.difference) }}</td>
              </tr>
              <tr>
                <th>Tolerancia</th>
                <td class="is-money">{{ formatMoney(payload.tolerance) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="fb-footnote">No se guardó ningún cambio en el CRM.</p>
      </div>

      <!-- ==================== generic_examples (§10.4) ===================== -->
      <div v-else-if="kind === 'generic_examples'" class="fb-body">
        <div class="fb-table-scroll">
          <table class="fb-table">
            <thead>
              <tr>
                <th v-for="column in genericColumns" :key="column">{{ prettyKey(column) }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in payload.rows || []" :key="index">
                <td v-for="column in genericColumns" :key="column">{{ cellText(row[column]) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="fb-footnote">No se guardó ningún cambio en el CRM.</p>
      </div>

      <!-- ====================== string_detail (§10.4) ====================== -->
      <div v-else-if="kind === 'string_detail'" class="fb-body">
        <template v-if="stringDetail">
          <p class="fb-text" style="white-space: pre-line">{{ stringDetail.lead }}</p>
          <ul class="fb-chips">
            <li v-for="(item, index) in stringDetail.items" :key="item + index">
              <button
                type="button"
                class="fb-chip"
                title="Copiar referencia"
                @click="handleCopy(`chip-${index}`, item)"
              >
                {{ copiedKey === `chip-${index}` ? 'Copiado ✓' : item }}
              </button>
            </li>
          </ul>
        </template>
        <p v-else class="fb-text" style="white-space: pre-line">{{ payload.message }}</p>
        <p class="fb-footnote">No se guardó ningún cambio en el CRM.</p>
      </div>

      <!-- ========================= server (500) ============================ -->
      <div v-else-if="kind === 'server'" class="fb-body">
        <p class="fb-alert fb-alert-error">
          El servidor no pudo procesar el archivo y no se guardó ningún cambio. Verifica que sea el
          Excel correcto o contacta soporte.
        </p>
        <details class="fb-details">
          <summary>Detalle técnico</summary>
          <pre class="fb-pre">{{ serverDetailRaw }}</pre>
        </details>
        <p class="fb-footnote">No se guardó ningún cambio en el CRM.</p>
      </div>

      <!-- ========================== network ================================ -->
      <div v-else-if="kind === 'network'" class="fb-body">
        <p class="fb-alert fb-alert-error">
          Sin conexión con el servidor o la carga excedió el tiempo de espera.
        </p>
        <p class="fb-note">
          El archivo sigue cargado en la tarjeta; puede reintentarse sin volver a seleccionarlo.
        </p>
      </div>

      <!-- ============================ fallback ============================= -->
      <div v-else class="fb-body">
        <p class="fb-text">Ocurrió un error inesperado durante el procesamiento.</p>
        <p class="fb-footnote">No se guardó ningún cambio en el CRM.</p>
      </div>

      <!-- =============================== pie =============================== -->
      <footer class="fb-footer">
        <template v-if="kind === 'success'">
          <button type="button" class="btn btn-secondary" @click="finish('all')">Cerrar</button>
          <button type="button" class="btn btn-primary" @click="finish('file')">
            Cargar otro archivo
          </button>
        </template>
        <template v-else-if="kind === 'stale_cutoff'">
          <button type="button" class="btn btn-secondary" :disabled="busy" @click="finish('none')">
            Cancelar
          </button>
          <button
            type="button"
            class="btn btn-danger fb-btn-force"
            :disabled="busy || !budgetUploadStore.pending[dataset]?.file"
            @click="forceStaleUpload"
          >
            <span v-if="busy" class="fb-spinner" aria-hidden="true"></span>
            Forzar Carga de Corte Antiguo
          </button>
        </template>
        <template v-else-if="kind === 'network'">
          <button type="button" class="btn btn-secondary" @click="finish('none')">Cerrar</button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="busy || !budgetUploadStore.pending[dataset]?.file"
            @click="retryNetworkUpload"
          >
            <span v-if="busy" class="fb-spinner" aria-hidden="true"></span>
            Reintentar
          </button>
        </template>
        <template v-else>
          <button type="button" class="btn btn-secondary" @click="finish('none')">Cerrar</button>
        </template>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.fb-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 16px;
  background-color: var(--background-transparency, rgba(7, 7, 7, 0.55));
}

.fb-dialog {
  display: flex;
  flex-direction: column;
  width: min(680px, 96vw);
  max-height: min(86vh, 760px);
  overflow: hidden;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 10px;
  background-color: var(--color-surface-card, #ffffff);
  color: var(--color-text-primary, #070707);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
  outline: none;
  animation: fb-pop 0.22s cubic-bezier(0.23, 1, 0.32, 1);
}

@keyframes fb-pop {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(6px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .fb-dialog {
    animation: none;
  }
}

/* ------------------------------- encabezado ------------------------------ */

.fb-header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
}

.tone-success .fb-header {
  background: linear-gradient(rgba(46, 164, 79, 0.08), rgba(46, 164, 79, 0.02));
}

.tone-error .fb-header {
  background: linear-gradient(rgba(197, 48, 48, 0.07), rgba(197, 48, 48, 0.015));
}

.tone-warning .fb-header {
  background: linear-gradient(rgba(180, 83, 9, 0.09), rgba(180, 83, 9, 0.02));
}

.fb-header-icon {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  font-size: 1.35rem;
}

.tone-success .fb-header-icon {
  color: #2ea44f;
  background-color: rgba(46, 164, 79, 0.14);
}

.tone-error .fb-header-icon {
  color: #c53030;
  background-color: rgba(197, 48, 48, 0.1);
}

.tone-warning .fb-header-icon {
  color: #b45309;
  background-color: rgba(245, 158, 11, 0.14);
}

.fb-header-text {
  flex: 1;
  min-width: 0;
}

.fb-title {
  margin: 0;
  font-size: 1.06rem;
  font-weight: 600;
  line-height: 1.35;
  text-wrap: balance;
}

.fb-subtitle {
  margin: 2px 0 0;
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--color-text-muted, #8a8a8a);
}

.fb-badge-forced {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  border: 1px solid rgba(221, 107, 32, 0.4);
  border-radius: 999px;
  background-color: rgba(221, 107, 32, 0.12);
  font-size: 0.7rem;
  font-weight: 600;
  color: #c05621;
}

:root[data-theme='dark'] .fb-badge-forced {
  color: #f6ad55;
}

.fb-x {
  flex-shrink: 0;
  padding: 6px 8px;
  border: none;
  border-radius: 6px;
  background: none;
  font-size: 0.95rem;
  color: var(--color-text-muted, #8a8a8a);
  cursor: pointer;
  transition:
    background-color 0.18s cubic-bezier(0.23, 1, 0.32, 1),
    color 0.18s cubic-bezier(0.23, 1, 0.32, 1);
}

.fb-x:hover:not(:disabled) {
  background-color: rgba(120, 120, 120, 0.12);
  color: var(--color-text-primary, #070707);
}

.fb-x:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.fb-busy-banner {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 0;
  padding: 8px 20px;
  background-color: rgba(20, 161, 217, 0.08);
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--color-text-secondary, #3c6b7d);
}

:root[data-theme='dark'] .fb-busy-banner {
  color: #7fd4ef;
}

.fb-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(120, 120, 120, 0.25);
  border-top-color: var(--color-brand, #03658c);
  border-radius: 50%;
  animation: fb-spin 0.8s linear infinite;
}

@keyframes fb-spin {
  to {
    transform: rotate(360deg);
  }
}

/* --------------------------------- cuerpo -------------------------------- */

.fb-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

/* Éxito: resumen numérico destacado */

.fb-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 10px;
  margin: 0 0 14px;
  padding: 0;
  list-style: none;
}

.fb-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 10px;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 8px;
  text-align: center;
}

.fb-stat-value {
  font-size: 1.45rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  color: var(--color-text-primary, #070707);
}

.fb-stat-label {
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--color-text-muted, #8a8a8a);
}

.fb-money-zone {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.fb-money {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 14px;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 8px;
  background-color: var(--color-surface, #f7f7f7);
}

:root[data-theme='dark'] .fb-money {
  background-color: rgba(255, 255, 255, 0.04);
}

.fb-money.is-primary {
  border-color: rgba(3, 101, 140, 0.35);
  background-color: rgba(3, 101, 140, 0.06);
}

.fb-money-value {
  font-size: 1.15rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--color-brand, #03658c);
}

:root[data-theme='dark'] .fb-money-value {
  color: #56c8ee;
}

.fb-money-label,
.fb-meta,
.fb-note {
  font-size: 0.76rem;
  color: var(--color-text-muted, #8a8a8a);
}

.fb-meta,
.fb-note {
  margin: 12px 0 0;
}

/* Alertas locales por kind */

.fb-alert {
  margin: 0 0 12px;
  padding: 12px 14px;
  border-radius: 8px;
  font-size: 0.88rem;
  line-height: 1.5;
}

.fb-alert-error {
  border-left: 4px solid #c53030;
  background-color: rgba(197, 48, 48, 0.07);
  font-weight: 500;
  color: #9b2222;
}

:root[data-theme='dark'] .fb-alert-error {
  color: #ff9b9b;
}

.fb-alert-warning {
  border-left: 4px solid #d69e2e;
  background-color: rgba(245, 158, 11, 0.09);
}

.fb-alert-title {
  margin: 0 0 8px;
  font-size: 0.92rem;
  font-weight: 600;
  color: #96590a;
}

:root[data-theme='dark'] .fb-alert-title {
  color: #f6c177;
}

.fb-alert-help {
  margin: 10px 0 0;
  font-size: 0.78rem;
  color: var(--color-text-secondary, #555555);
}

.fb-cutoff-compare {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
}

.fb-cutoff {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid rgba(214, 158, 46, 0.35);
  border-radius: 8px;
  background-color: var(--color-surface-card, #ffffff);
}

.fb-cutoff-label {
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--color-text-muted, #8a8a8a);
}

.fb-cutoff-value {
  font-size: 1.05rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* Tablas propias (NFR-1, sin Vuetify) */

.fb-table-scroll {
  overflow-x: auto;
  margin-bottom: 12px;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 8px;
}

.fb-table {
  width: 100%;
  border: none;
  border-radius: 0;
  font-size: 0.82rem;
}

.fb-table th,
.fb-table td {
  padding: 9px 12px;
  text-align: left;
  vertical-align: top;
}

.fb-table thead th {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.fb-table td {
  font-variant-numeric: tabular-nums;
}

.fb-cell-id {
  white-space: nowrap;
}

.fb-copy-mini {
  margin-left: 8px;
  padding: 2px 7px;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.2));
  border-radius: 5px;
  background: none;
  font-size: 0.68rem;
  font-weight: 500;
  color: var(--color-text-secondary, #555555);
  cursor: pointer;
  transition:
    background-color 0.18s cubic-bezier(0.23, 1, 0.32, 1),
    color 0.18s cubic-bezier(0.23, 1, 0.32, 1);
}

.fb-copy-mini:hover {
  background-color: rgba(3, 101, 140, 0.08);
  color: var(--color-brand, #03658c);
}

.fb-table-compare th {
  font-weight: 500;
  color: var(--color-text-secondary, #555555);
}

.fb-table-compare .is-money {
  font-weight: 600;
}

.fb-table-compare .is-diff {
  color: #c53030;
}

:root[data-theme='dark'] .fb-table-compare .is-diff {
  color: #ff8f8f;
}

.fb-toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
}

.fb-copied-feedback {
  font-size: 0.8rem;
  font-weight: 600;
  color: #2ea44f;
}

.fb-server-msg {
  margin: 0 0 10px;
  font-size: 0.85rem;
  line-height: 1.5;
  color: var(--color-text-secondary, #555555);
}

.fb-text {
  margin: 0 0 10px;
  font-size: 0.88rem;
  line-height: 1.55;
}

.fb-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 10px;
  padding: 0;
  list-style: none;
}

.fb-chip {
  padding: 4px 10px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 999px;
  background-color: var(--color-surface, #f7f7f7);
  font-size: 0.76rem;
  font-weight: 500;
  color: var(--color-text-primary, #070707);
  cursor: pointer;
  transition:
    background-color 0.18s cubic-bezier(0.23, 1, 0.32, 1),
    border-color 0.18s cubic-bezier(0.23, 1, 0.32, 1);
}

:root[data-theme='dark'] .fb-chip {
  background-color: rgba(255, 255, 255, 0.05);
}

.fb-chip:hover {
  border-color: var(--color-brand, #03658c);
  background-color: rgba(3, 101, 140, 0.08);
}

.fb-details {
  margin-top: 12px;
  font-size: 0.8rem;
}

.fb-details summary {
  color: var(--color-text-secondary, #555555);
  cursor: pointer;
}

.fb-pre {
  overflow-x: auto;
  margin: 8px 0 0;
  padding: 10px 12px;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 6px;
  background-color: var(--color-surface, #f7f7f7);
  font-size: 0.72rem;
  white-space: pre-wrap;
}

:root[data-theme='dark'] .fb-pre {
  background-color: rgba(0, 0, 0, 0.3);
}

.fb-footnote {
  margin: 14px 0 0;
  padding-top: 10px;
  border-top: 1px dashed var(--color-border, rgba(97, 97, 97, 0.2));
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--color-text-muted, #8a8a8a);
}

/* ---------------------------------- pie ---------------------------------- */

.fb-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  background-color: var(--color-surface, #f7f7f7);
}

:root[data-theme='dark'] .fb-footer {
  background-color: rgba(255, 255, 255, 0.03);
}

.fb-btn-force {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}
</style>
