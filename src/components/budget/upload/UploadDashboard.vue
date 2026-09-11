<script setup>
/**
 * UploadDashboard — grid de las 4 tarjetas ETL del Centro de Ingesta
 * (spec §4/§7/§9) + integración del modal único de feedback.
 *
 * El arreglo `ETL_CARDS` es la única fuente de configuración de tarjetas:
 * clave de dataset, título, icono, archivo esperado (placeholder visual,
 * NO validación), endpoint documentado y extras de formulario.
 */
import { computed, ref } from 'vue'
import FileDropZone from '@/components/budget/upload/FileDropZone.vue'
import UploadFeedbackModal from '@/components/budget/upload/UploadFeedbackModal.vue'
import { useBudgetUploadStore } from '@/stores/budgetUploadStore.js'

const budgetUploadStore = useBudgetUploadStore()

const EXTRA_TYPES = {
  totalInput: 'total-input',
  checkInitial: 'check-initial',
  checkForce: 'check-force'
}

const ETL_CARDS = [
  {
    key: 'actualCosts',
    statusKey: 'actual_costs',
    endpoint: '/budget/upload/actual-costs',
    icon: '🧾',
    title: 'Costos Reales',
    hintFile: 'CostosFinal.xlsx',
    extra: EXTRA_TYPES.totalInput
  },
  {
    key: 'actualExpenses',
    statusKey: 'actual_expenses',
    endpoint: '/budget/upload/actual-expenses',
    icon: '📊',
    title: 'Gastos Operativos',
    hintFile: 'LibroAuxiliarCECO.xlsx',
    extra: null
  },
  {
    key: 'paymentLedger',
    statusKey: 'payment_ledger',
    endpoint: '/budget/upload/payment-ledger',
    icon: '💵',
    title: 'Libro de Pagos',
    hintFile: 'Recibos.xlsx',
    extra: EXTRA_TYPES.checkInitial
  },
  {
    key: 'accountsReceivable',
    statusKey: 'accounts_receivable',
    endpoint: '/budget/upload/accounts-receivable',
    icon: '📁',
    title: 'Estado de Cartera',
    hintFile: 'EstadoCuenta306090.xlsx',
    extra: EXTRA_TYPES.checkForce
  }
]

/* ----------------------- estado local del formulario ---------------------- */

/** Archivo en selección por tarjeta (el `File` vive solo en el componente). */
const files = ref({
  actualCosts: null,
  actualExpenses: null,
  paymentLedger: null,
  accountsReceivable: null
})

/** Extras compartidos: cada tarjeta lee solo el suyo (§9). */
const extras = ref({
  excelTotalCost: '',
  includeInitialBalances: false,
  force: false
})

/**
 * Validación del total de Costos Reales (§9.1): number > 0 y parseable.
 */
const costTotalValid = computed(() => {
  const parsed = Number(extras.value.excelTotalCost)
  return Number.isFinite(parsed) && parsed > 0 && String(extras.value.excelTotalCost).trim() !== ''
})

/**
 * Habilita el botón Cargar (§9.5): archivo válido + sin uploading + extras
 * obligatorios completos (solo aplica a Costos Reales).
 * @param {{ key: string, extra: string|null }} card
 * @returns {boolean}
 */
function canSubmit(card) {
  if (!files.value[card.key]) return false
  if (budgetUploadStore.isBusy(card.key)) return false
  if (card.extra === EXTRA_TYPES.totalInput && !costTotalValid.value) return false
  return true
}

/**
 * Construye el objeto `extra` que consume el store según la tarjeta.
 * @param {{ key: string, extra: string|null }} card
 * @returns {Object}
 */
function buildExtra(card) {
  if (card.extra === EXTRA_TYPES.totalInput) {
    return { excelTotalCost: Number(extras.value.excelTotalCost) }
  }
  if (card.extra === EXTRA_TYPES.checkInitial) {
    return { includeInitialBalances: extras.value.includeInitialBalances }
  }
  if (card.extra === EXTRA_TYPES.checkForce) {
    return { force: extras.value.force }
  }
  return {}
}

function handleUpload(card) {
  if (!canSubmit(card)) return
  budgetUploadStore.upload(card.key, { file: files.value[card.key], extra: buildExtra(card) })
}

/* ------------------------- feedback del modal (§10.1) ---------------------- */

/**
 * "Cerrar" limpia archivo y formulario; "Cargar otro archivo" conserva los
 * extras (p. ej. `excel_total_cost`). Ambos liberan el archivo en memoria.
 * @param {{ dataset: string, reset: 'all'|'file'|'none' }} detail
 */
function onModalClosed({ dataset, reset }) {
  if (!dataset) return
  if (reset === 'all' || reset === 'file') {
    files.value[dataset] = null
    budgetUploadStore.resetDataset(dataset)
  }
  if (reset === 'all') {
    const card = ETL_CARDS.find((item) => item.key === dataset)
    if (card?.extra === EXTRA_TYPES.totalInput) extras.value.excelTotalCost = ''
    if (card?.extra === EXTRA_TYPES.checkInitial) extras.value.includeInitialBalances = false
    if (card?.extra === EXTRA_TYPES.checkForce) extras.value.force = false
  }
}

/* ------------------------ estado "última carga" (§7) ----------------------- */

const lastUploadFormatter = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'medium',
  timeStyle: 'short'
})

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Parseo tolerante de la fecha del backend (ISO datetime o 'YYYY-MM-DD'
 * puro, interpretado en local para evitar corrimientos de zona).
 * @param {string|null|undefined} value
 * @returns {Date|null}
 */
function parseUploadDate(value) {
  if (!value) return null
  const plain = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const date = plain
    ? new Date(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3]))
    : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Tiempo relativo simple en español: hoy / ayer / N días / N semanas.
 * @param {Date} date
 * @returns {string}
 */
function relativeTime(date) {
  const diffDays = Math.floor((Date.now() - date.getTime()) / DAY_MS)
  if (diffDays <= 0) return 'hoy'
  if (diffDays === 1) return 'ayer'
  if (diffDays < 7) return `hace ${diffDays} días`
  if (diffDays < 30) return `hace ${Math.floor(diffDays / 7)} semana${diffDays < 14 ? '' : 's'}`
  return `hace ${Math.floor(diffDays / 30)} mes${diffDays < 60 ? '' : 'es'}`
}

/**
 * Modo de render de la línea "Última carga" de una tarjeta:
 * loading | failed | empty | value.
 * @param {{ key: string, statusKey: string }} card
 * @returns {{ mode: string, text: string }}
 */
function statusInfo(card) {
  if (budgetUploadStore.statusLoading) {
    return { mode: 'loading', text: '' }
  }
  if (budgetUploadStore.statusFailed || !budgetUploadStore.status) {
    return { mode: budgetUploadStore.statusFailed ? 'failed' : 'loading', text: '' }
  }
  const raw = budgetUploadStore.status[card.statusKey]?.last_upload
  const date = parseUploadDate(raw)
  if (!date) {
    return { mode: 'empty', text: '' }
  }
  return { mode: 'value', text: `Última carga: ${lastUploadFormatter.format(date)}` }
}

const tooltipTotal =
  'Suma de la columna de costos del archivo. Sin separadores de miles; decimal con punto. El servidor valida con tolerancia de 100.'
const tooltipInitialBalances =
  'Suma los registros de saldos iniciales del archivo al flujo de caja.'
const tooltipForce =
  'Use solo si está seguro de que el archivo corresponde a un corte anterior válido; marcar documentos como pagados podría generar cierres falsos.'
</script>

<template>
  <div class="upload-dashboard">
    <div class="cards-grid">
      <article
        v-for="card in ETL_CARDS"
        :key="card.key"
        class="etl-card"
        :data-dataset="card.key"
        :data-endpoint="card.endpoint"
      >
        <header class="card-head">
          <span class="card-icon" aria-hidden="true">{{ card.icon }}</span>
          <div class="card-headings">
            <h3 class="card-title">{{ card.title }}</h3>
            <p class="card-file" :title="`Archivo esperado (ayuda visual): ${card.hintFile}`">
              {{ card.hintFile }}
            </p>
          </div>
        </header>

        <!-- Línea de última carga: decorativa, nunca bloquea (§7.4) -->
        <div class="card-status" aria-live="polite">
          <template v-if="statusInfo(card).mode === 'value'">
            <span class="status-dot is-ok" aria-hidden="true"></span>
            <span class="status-text">
              {{ statusInfo(card).text }}
              <em
                v-if="parseUploadDate(budgetUploadStore.status[card.statusKey]?.last_upload)"
                class="status-relative"
              >
                ·
                {{
                  relativeTime(
                    parseUploadDate(budgetUploadStore.status[card.statusKey].last_upload)
                  )
                }}
              </em>
            </span>
          </template>
          <template v-else-if="statusInfo(card).mode === 'empty'">
            <span class="status-dot" aria-hidden="true"></span>
            <span class="status-text is-faded">Sin cargas registradas</span>
          </template>
          <template v-else-if="statusInfo(card).mode === 'failed'">
            <span class="status-dot is-failed" aria-hidden="true"></span>
            <span class="status-text is-faded">Fecha de última carga no disponible</span>
            <button
              type="button"
              class="status-retry"
              title="Volver a consultar el estado de carga"
              aria-label="Reintentar consulta de última carga"
              @click="budgetUploadStore.fetchStatus()"
            >
              ↻
            </button>
          </template>
          <template v-else>
            <span class="status-dot" aria-hidden="true"></span>
            <span class="status-text is-loading">—</span>
          </template>
        </div>

        <!-- Extras de formulario por tarjeta (§9) -->
        <div v-if="card.extra === EXTRA_TYPES.totalInput" class="card-extra">
          <label class="field-label" :for="`total-${card.key}`">
            Total de costo según el Excel
            <span class="required-mark" aria-hidden="true">*</span>
            <span
              class="info-tip"
              :data-tip="tooltipTotal"
              tabindex="0"
              aria-label="Cómo calcular el total"
              >ⓘ</span
            >
          </label>
          <input
            :id="`total-${card.key}`"
            v-model="extras.excelTotalCost"
            class="field-input"
            type="number"
            inputmode="decimal"
            min="0"
            step="any"
            placeholder="Ej.: 12500000.50"
            :disabled="budgetUploadStore.isBusy(card.key)"
            required
          />
          <p class="field-help">{{ tooltipTotal }}</p>
        </div>

        <div v-else-if="card.extra === EXTRA_TYPES.checkInitial" class="card-extra">
          <label class="check-row">
            <input
              v-model="extras.includeInitialBalances"
              type="checkbox"
              :disabled="budgetUploadStore.isBusy(card.key)"
            />
            <span>Incluir saldos iniciales</span>
            <span
              class="info-tip"
              :data-tip="tooltipInitialBalances"
              tabindex="0"
              aria-label="Más información sobre saldos iniciales"
              >ⓘ</span
            >
          </label>
        </div>

        <div v-else-if="card.extra === EXTRA_TYPES.checkForce" class="card-extra">
          <label class="check-row">
            <input
              v-model="extras.force"
              type="checkbox"
              :disabled="budgetUploadStore.isBusy(card.key)"
            />
            <span>Forzar carga (omitir guardia de corte antiguo)</span>
            <span
              class="info-tip"
              :data-tip="tooltipForce"
              tabindex="0"
              aria-label="Más información sobre la carga forzada"
              >ⓘ</span
            >
          </label>
        </div>

        <FileDropZone
          v-model="files[card.key]"
          :dataset-key="card.key"
          :disabled="budgetUploadStore.isBusy(card.key)"
          :max-mb="25"
          :hint-file="card.hintFile"
        />

        <button
          type="button"
          class="btn btn-primary card-submit"
          :disabled="!canSubmit(card)"
          @click="handleUpload(card)"
        >
          <span
            v-if="budgetUploadStore.isBusy(card.key)"
            class="submit-spinner"
            aria-hidden="true"
          ></span>
          {{ budgetUploadStore.isBusy(card.key) ? 'Procesando...' : 'Cargar' }}
        </button>
      </article>
    </div>

    <UploadFeedbackModal @closed="onModalClosed" />
  </div>
</template>

<style scoped>
/* Grid responsive: 1 (móvil) · 2 (>=768px) · 4 (>=1280px) — NFR-5 */
.cards-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

@media (min-width: 768px) {
  .cards-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1280px) {
  .cards-grid {
    grid-template-columns: repeat(4, 1fr);
    gap: 18px;
  }
}

.etl-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: var(--border-radius-size, 8px);
  background: var(--color-surface-card, #ffffff);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.card-head {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.card-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 8px;
  background-color: var(--color-surface, #f7f7f7);
  font-size: 1.15rem;
}

:root[data-theme='dark'] .card-icon {
  background-color: rgba(255, 255, 255, 0.05);
}

.card-headings {
  min-width: 0;
}

.card-title {
  margin: 0;
  font-size: 0.98rem;
  font-weight: 600;
  line-height: 1.3;
  color: var(--color-text-primary, #070707);
}

.card-file {
  margin: 2px 0 0;
  overflow: hidden;
  font-size: 0.73rem;
  color: var(--color-text-muted, #8a8a8a);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Línea de última carga (decorativa, §7) */

.card-status {
  display: flex;
  gap: 7px;
  align-items: center;
  min-height: 20px;
  padding: 4px 0;
  font-size: 0.76rem;
}

.status-dot {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 50%;
}

.status-dot.is-ok {
  border-color: rgba(46, 164, 79, 0.5);
  background-color: #2ea44f;
}

.status-dot.is-failed {
  border-color: rgba(197, 48, 48, 0.45);
  background-color: rgba(197, 48, 48, 0.55);
}

.status-text {
  color: var(--color-text-secondary, #555555);
}

.status-text.is-faded {
  color: var(--color-text-muted, #8a8a8a);
}

.status-relative {
  font-style: normal;
  color: var(--color-text-muted, #8a8a8a);
}

.status-text.is-loading {
  display: inline-block;
  width: 90px;
  height: 10px;
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    var(--color-border, rgba(97, 97, 97, 0.15)) 25%,
    rgba(97, 97, 97, 0.06) 50%,
    var(--color-border, rgba(97, 97, 97, 0.15)) 75%
  );
  background-size: 200% 100%;
  animation: status-shimmer 1.2s ease-in-out infinite;
}

@keyframes status-shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}

.status-retry {
  padding: 1px 7px;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.2));
  border-radius: 5px;
  background: none;
  font-size: 0.78rem;
  line-height: 1.3;
  color: var(--color-text-secondary, #555555);
  cursor: pointer;
  transition:
    background-color 0.18s cubic-bezier(0.23, 1, 0.32, 1),
    color 0.18s cubic-bezier(0.23, 1, 0.32, 1);
}

.status-retry:hover {
  background-color: rgba(3, 101, 140, 0.08);
  color: var(--color-brand, #03658c);
}

/* Extras de formulario (§9) */

.card-extra {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.field-label {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--color-text-primary, #070707);
}

.required-mark {
  color: #c53030;
}

.field-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 6px;
  background-color: var(--color-surface, #f7f7f7);
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-primary, #070707);
}

:root[data-theme='dark'] .field-input {
  background-color: rgba(0, 0, 0, 0.25);
}

.field-input:focus {
  border-color: var(--color-brand, #03658c);
  outline: 2px solid rgba(3, 101, 140, 0.25);
  outline-offset: 0;
}

.field-help {
  margin: 0;
  font-size: 0.7rem;
  line-height: 1.45;
  color: var(--color-text-muted, #8a8a8a);
}

.check-row {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 0.8rem;
  color: var(--color-text-primary, #070707);
  cursor: pointer;
}

.check-row input[type='checkbox'] {
  width: 16px;
  height: 16px;
  accent-color: var(--color-brand, #03658c);
  cursor: pointer;
}

/* Tooltip informativo (CSS propio, accesible por foco) */

.info-tip {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 50%;
  font-size: 0.62rem;
  font-weight: 600;
  color: var(--color-text-muted, #8a8a8a);
  cursor: help;
}

.info-tip::after {
  content: attr(data-tip);
  position: absolute;
  bottom: calc(100% + 7px);
  left: 50%;
  z-index: 20;
  width: max-content;
  max-width: 240px;
  padding: 8px 10px;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.2));
  border-radius: 6px;
  background-color: var(--dark-color, #141e28);
  font-size: 0.72rem;
  font-weight: 400;
  line-height: 1.45;
  color: var(--text-white, #eeeeee);
  text-align: left;
  white-space: normal;
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, 4px);
  transition:
    opacity 0.18s cubic-bezier(0.23, 1, 0.32, 1),
    transform 0.18s cubic-bezier(0.23, 1, 0.32, 1);
}

.info-tip:hover::after,
.info-tip:focus-visible::after {
  opacity: 1;
  transform: translate(-50%, 0);
}

/* Botón Cargar común (§9.5) */

.card-submit {
  gap: 8px;
  width: 100%;
  margin-top: auto;
}

.submit-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: var(--text-white, #eeeeee);
  border-radius: 50%;
  animation: submit-spin 0.8s linear infinite;
}

@keyframes submit-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
