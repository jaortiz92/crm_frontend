<script setup>
/**
 * CollaboratorBreakdownModal — desglose del costo total de un colaborador en
 * un mes (FE-S15-COLLAB §5, D-FE15-3; contrato espejo backend.02_21 §9:
 * `GET /budget/collaborator/{id}/breakdown?month=YYYY-MM` ⇒
 * `{month, components[], total_caja, total_provision, params_vigencia}`).
 *
 * D-FE15-1 VINCULANTE: el modal NO calcula nada — pinta montos, capas y
 * fechas que llegan del motor. Las 12 opciones del selector son calendario
 * (presentación), no aritmética de nómina.
 *
 * D-FE15-3 (§7.2): tabla por componente con badge de capa — CAJA azul "paga
 * este mes" y PROVISIÓN ámbar "paga {fecha legal}" — más la fecha de pago
 * proyectada por asiento y el tooltip canónico "causada hoy, pagada en fecha
 * legal". Badge con TEXTO además del color (NFR-FE-3).
 *
 * Selector: año (rango `buildYearOptions`) + mes (12, default mes actual) —
 * el año extra permite cuadrear AC-FE-5 (mes ANTERIOR a un aumento conserva
 * el salario viejo) y AC-FE-6 (mes siguiente al término = vacío) sin salir
 * del modal.
 *
 * §6: tras terminate/recalculate la vista sube `refreshToken` y el modal
 * RE-CONSULTA (los asientos cambian). 403 (usuario sin permiso de breakdown)
 * ⇒ modal con el mensaje del BE (AC-FE-7); vigencia inexistente (400 R-05)
 * ⇒ `detail.message` del BE sin inventar texto.
 */
import { computed, ref, watch } from 'vue'
import {
  budgetCollaboratorService,
  classifyCollaboratorError
} from '@/services/budgetCollaboratorService.js'
import {
  formatCOP,
  formatDateEs,
  buildYearOptions,
  MONTH_LABELS
} from '@/components/budget/planning/planningFormat.js'
import { componentLabel, layerMeta } from './componentLabels.js'

const props = defineProps({
  open: { type: Boolean, required: true },
  /** Ficha del colaborador (usa id_collaborator + full_name + salary_masked). */
  collaborator: { type: Object, default: null },
  /** Sube la vista tras terminate/recalculate ⇒ re-consulta si está abierto. */
  refreshToken: { type: Number, default: 0 }
})

const emit = defineEmits(['close'])

const now = new Date()
const yearOptions = buildYearOptions()
const selectedYear = ref(now.getFullYear())
const selectedMonth = ref(now.getMonth() + 1)

const loading = ref(false)
/** @type {null | {month, components, total_caja, total_provision, params_vigencia}} */
const data = ref(null)
const errorMessage = ref('')

const monthKey = computed(
  () => `${selectedYear.value}-${String(selectedMonth.value).padStart(2, '0')}`
)

const rows = computed(() => (Array.isArray(data.value?.components) ? data.value.components : []))

const isEmpty = computed(() => !loading.value && !errorMessage.value && rows.value.length === 0)

/**
 * Fila "costo total del mes" (§5): prioriza un total EXPLÍCITO del BE si lo
 * envía (`total_month`/`total`); en caso contrario es la SUMA de los dos Σ
 * que entrega el motor — una suma presentacional de totales ajenos, no un
 * cálculo de nómina (D-FE15-1: cero tasas/prorrateos en cliente).
 */
const grandTotal = computed(() => {
  const source = data.value
  if (!source) return null
  if (source.total_month != null && Number.isFinite(Number(source.total_month))) {
    return Number(source.total_month)
  }
  if (source.total != null && Number.isFinite(Number(source.total))) {
    return Number(source.total)
  }
  const caja = Number(source.total_caja)
  const provision = Number(source.total_provision)
  if (!Number.isFinite(caja) && !Number.isFinite(provision)) return null
  return (Number.isFinite(caja) ? caja : 0) + (Number.isFinite(provision) ? provision : 0)
})

async function load() {
  if (!props.open || !props.collaborator?.id_collaborator) return
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await budgetCollaboratorService.fetchBreakdown(
      props.collaborator.id_collaborator,
      monthKey.value
    )
    data.value = response?.data ?? null
  } catch (err) {
    data.value = null
    const result = classifyCollaboratorError(err)
    if (result.kind === 'forbidden') {
      errorMessage.value =
        result.message || 'No tiene permiso para ver el desglose de este colaborador.'
    } else if (result.kind === 'notfound') {
      errorMessage.value = result.message || 'El colaborador ya no existe.'
    } else if (result.kind === 'network') {
      errorMessage.value = 'Sin conexión con el servidor. Reintente.'
    } else {
      // R-05 (vigencia sin parámetros) y resto: mensaje estructurado del BE.
      errorMessage.value = result.message || 'No se pudo cargar el desglose.'
    }
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.open, props.collaborator?.id_collaborator, selectedYear.value, selectedMonth.value],
  () => {
    if (!props.open) return
    void load()
  },
  { immediate: true }
)

/** §6: refresco externo (terminate/recalculate) sin cerrar el modal. */
watch(
  () => props.refreshToken,
  () => {
    if (props.open) void load()
  }
)

function onOverlayMousedown(event) {
  if (event.target === event.currentTarget) emit('close')
}
</script>

<template>
  <div v-if="open" class="bd-overlay" @mousedown="onOverlayMousedown">
    <div
      class="bd-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="breakdown-title"
      tabindex="-1"
    >
      <header class="bd-header">
        <div class="bd-header-text">
          <h3 id="breakdown-title" class="bd-title">
            Desglose de costo — {{ props.collaborator?.full_name || 'Colaborador' }}
          </h3>
          <p class="bd-subtitle">
            Documento {{ props.collaborator?.doc_value || '—' }} · los montos los calcula el motor:
            esta vista no suma ni prorratea.
          </p>
        </div>
        <button type="button" class="bd-x" aria-label="Cerrar ventana" @click="emit('close')">
          ✕
        </button>
      </header>

      <div class="bd-toolbar">
        <label class="bd-field">
          <span class="bd-label">Año</span>
          <select v-model.number="selectedYear" class="bd-input">
            <option v-for="year in yearOptions" :key="year" :value="year">{{ year }}</option>
          </select>
        </label>
        <label class="bd-field">
          <span class="bd-label">Mes</span>
          <select v-model.number="selectedMonth" class="bd-input">
            <option v-for="(label, index) in MONTH_LABELS" :key="label" :value="index + 1">
              {{ label }}
            </option>
          </select>
        </label>
        <span class="bd-month-key" aria-hidden="true">{{ monthKey }}</span>
      </div>

      <div class="bd-body">
        <div v-if="loading" class="bd-loading" aria-live="polite">
          <span class="bd-spinner" aria-hidden="true"></span>
          Cargando desglose…
        </div>

        <p v-else-if="errorMessage" class="bd-banner" role="alert">{{ errorMessage }}</p>

        <p v-else-if="isEmpty" class="bd-empty">
          Sin asientos para {{ monthKey }}: el motor no causó costo en este mes (contrato no
          vigente, ya terminado, o sin días causados).
        </p>

        <table v-else class="bd-table" :aria-label="`Desglose de nómina ${monthKey}`">
          <thead>
            <tr>
              <th scope="col">Componente</th>
              <th scope="col">Capa</th>
              <th scope="col" class="bd-col-money">Monto</th>
              <th scope="col">Fecha de pago proyectada</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in rows" :key="`${row.code}-${index}`">
              <td class="bd-cell-name">{{ componentLabel(row.code, row.name) }}</td>
              <td>
                <span
                  class="bd-badge"
                  :class="`is-${layerMeta(row.layer).tone}`"
                  :title="layerMeta(row.layer).tooltip"
                >
                  {{ layerMeta(row.layer).label }}
                </span>
              </td>
              <td class="bd-cell-money">{{ formatCOP(row.amount) }}</td>
              <td class="bd-cell-date">
                <template v-if="layerMeta(row.layer).tone === 'caja'">
                  {{ formatDateEs(row.payment_date) }}
                  <span class="bd-cap">paga este mes</span>
                </template>
                <template v-else>
                  {{ formatDateEs(row.payment_date) }}
                  <span class="bd-cap">paga fecha legal</span>
                </template>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="bd-total">
              <td colspan="2">Σ CAJA (paga este mes)</td>
              <td class="bd-cell-money">{{ formatCOP(data?.total_caja) }}</td>
              <td></td>
            </tr>
            <tr class="bd-total">
              <td colspan="2">Σ PROVISIÓN (causada hoy, pagada en fecha legal)</td>
              <td class="bd-cell-money">{{ formatCOP(data?.total_provision) }}</td>
              <td></td>
            </tr>
            <tr v-if="grandTotal !== null" class="bd-total bd-total-grand">
              <td colspan="2">Costo total del mes</td>
              <td class="bd-cell-money">{{ formatCOP(grandTotal) }}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <footer class="bd-footer">
        <p class="bd-footnote">
          Parámetros vigencia {{ data?.params_vigencia ?? '—' }} · los totales Σ los entrega el
          backend (D-FE15-1); "provisión" = causada hoy, pagada en fecha legal.
        </p>
        <button type="button" class="btn btn-secondary btn-sm" @click="emit('close')">
          Cerrar
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.bd-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background-color: var(--background-transparency, rgba(7, 7, 7, 0.55));
}

.bd-dialog {
  display: flex;
  flex-direction: column;
  width: min(820px, 96vw);
  max-height: min(90vh, 860px);
  overflow: hidden;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 10px;
  background-color: var(--color-surface-card, #ffffff);
  color: var(--color-text-primary, #070707);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
  outline: none;
  animation: bd-pop 0.22s cubic-bezier(0.23, 1, 0.32, 1);
}

@keyframes bd-pop {
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
  .bd-dialog {
    animation: none;
  }
}

.bd-header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
}

.bd-header-text {
  flex: 1;
  min-width: 0;
}

.bd-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.bd-subtitle {
  margin: 2px 0 0;
  font-size: 0.74rem;
  color: var(--color-text-muted, #8a8a8a);
}

.bd-x {
  padding: 6px 8px;
  border: none;
  border-radius: 6px;
  background: none;
  font-size: 0.95rem;
  color: var(--color-text-muted, #8a8a8a);
  cursor: pointer;
}

.bd-x:hover:not(:disabled) {
  background-color: rgba(120, 120, 120, 0.12);
  color: var(--color-text-primary, #070707);
}

.bd-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-end;
  padding: 12px 20px 0;
}

.bd-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bd-label {
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--color-text-secondary, #555555);
}

.bd-input {
  min-width: 120px;
  margin: 0;
  padding: 7px 10px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 6px;
  background-color: var(--color-surface, #f7f7f7);
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-primary, #070707);
  box-sizing: border-box;
}

.bd-input:focus {
  border-color: var(--color-brand, #03658c);
  outline: 2px solid rgba(3, 101, 140, 0.25);
  outline-offset: 0;
}

.bd-month-key {
  padding-bottom: 9px;
  font-size: 0.74rem;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-muted, #8a8a8a);
}

.bd-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  padding: 14px 20px;
}

.bd-loading,
.bd-empty {
  margin: 0;
  padding: 28px 8px;
  font-size: 0.84rem;
  text-align: center;
  color: var(--color-text-muted, #8a8a8a);
}

.bd-loading {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: center;
}

.bd-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(120, 120, 120, 0.25);
  border-top-color: var(--color-brand, #03658c);
  border-radius: 50%;
  animation: bd-spin 0.8s linear infinite;
}

@keyframes bd-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .bd-spinner {
    animation-duration: 1.6s;
  }
}

.bd-banner {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid rgba(197, 48, 48, 0.35);
  border-left: 4px solid #c53030;
  border-radius: 8px;
  background-color: rgba(197, 48, 48, 0.07);
  font-size: 0.82rem;
  line-height: 1.5;
  color: #9b2222;
  overflow-wrap: anywhere;
}

:root[data-theme='dark'] .bd-banner {
  color: #ff9b9b;
}

.bd-table {
  min-width: 640px;
  font-size: 0.8rem;
}

.bd-col-money {
  width: 170px;
}

.bd-cell-name {
  text-align: left;
}

.bd-cell-money {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}

.bd-cell-date {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.bd-cap {
  display: block;
  font-size: 0.68rem;
  font-style: italic;
  color: var(--color-text-muted, #8a8a8a);
}

.bd-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.bd-badge.is-caja {
  border: 1px solid rgba(3, 101, 140, 0.45);
  background-color: rgba(3, 101, 140, 0.1);
  color: #03658c;
}

:root[data-theme='dark'] .bd-badge.is-caja {
  color: #7fd4f0;
}

.bd-badge.is-provision {
  border: 1px solid rgba(180, 83, 9, 0.5);
  background-color: rgba(217, 119, 6, 0.12);
  color: #92400e;
}

:root[data-theme='dark'] .bd-badge.is-provision {
  color: #fbbf24;
}

.bd-total td {
  font-weight: 700;
}

.bd-total td:first-child {
  text-align: left;
}

.bd-total-grand td {
  background-color: var(--color-surface, #f2f4f7);
}

.bd-footer {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-top: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  background-color: var(--color-surface, #f7f7f7);
}

:root[data-theme='dark'] .bd-footer {
  background-color: rgba(255, 255, 255, 0.03);
}

.bd-footnote {
  margin: 0;
  font-size: 0.72rem;
  line-height: 1.45;
  color: var(--color-text-muted, #8a8a8a);
}

@media (max-width: 640px) {
  .bd-toolbar {
    padding: 12px 12px 0;
  }

  .bd-body {
    padding: 12px;
  }
}
</style>
