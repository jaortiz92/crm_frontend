<script setup>
/**
 * LineDeleteModal — confirmación DESTRUCTIVA de borrado de línea
 * (FE-S4D-BUDGET-LINES §3.3). Muestra los datos de la fila (CECO resuelto por
 * el getter del store — igual que el grid —, fechas, chip tipo+comportamiento y
 * monto/tasa) para que el usuario sepa QUÉ borra (riesgo R-1 de BE-S4D), con el
 * texto de peligro literal de la spec. Botón rojo `btn-danger` (patrón
 * destructivo de `BudgetRulesView`/`UploadFeedbackModal`).
 *
 * Confirmar ⇒ `deleteScenarioLine` del store (borrado físico D-2: sin undo, el
 * único camino de recuperación es rehacer la carga SIIGO o clonar). El guard
 * anti-doble-submit es `lineSaving[id]` (dueño: la acción del store; aquí se
 * lee junto con `cellSaving[id]` para bloquear también un PUT de celda en vuelo
 * — AC-FD-10). Éxito ⇒ `emit('deleted', id)` (el padre toastea) + cierra; el
 * splice de la caché ya retiró la línea de TODAS las vistas derivadas (AC-FD-7).
 *
 * Shell idéntico a `CloneScenarioModal`: overlay, `role="dialog"`,
 * `aria-modal`, foco atrapado, ESC cierra.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useBudgetPlanningStore } from '@/stores/budgetPlanningStore.js'
import { alertService } from '@/services/alertService.js'
import {
  BEHAVIOR_LABELS,
  LINE_TYPE_LABELS,
  formatMoney,
  formatVariableRate
} from './planningFormat.js'

const props = defineProps({
  open: { type: Boolean, required: true },
  /** Línea de la caché del store a eliminar (null ⇒ el modal no renderiza). */
  line: { type: Object, default: null }
})

const emit = defineEmits(['deleted', 'close'])

const budgetPlanningStore = useBudgetPlanningStore()

const dialogRef = ref(null)
const alertMessage = ref('')

const isVariable = computed(() => Boolean(props.line) && props.line.behavior_type !== 'fixed')

/**
 * Bloqueado mientras la eliminación propia está en vuelo (`lineSaving`) o un
 * PUT de celda de ESA MISMA línea (`cellSaving`, AC-FD-10).
 */
const busy = computed(() => {
  if (!props.line) return false
  const id = props.line.id_budget_line
  return Boolean(budgetPlanningStore.lineSaving[id]) || Boolean(budgetPlanningStore.cellSaving[id])
})

async function confirmDelete() {
  if (!props.line || busy.value) return
  alertMessage.value = ''
  const result = await budgetPlanningStore.deleteScenarioLine(props.line.id_budget_line)

  if (result.ok) {
    emit('deleted', props.line.id_budget_line)
    emit('close')
    return
  }
  if (result.lineGone) {
    // §4/§6: el store ya resincronizó la vista; toast del mensaje literal.
    alertService.generalError(result.message)
    emit('close')
    return
  }
  if (result.kind === 'busy' || result.kind === 'auth') return
  if (result.kind === 'forbidden') {
    // El store ya toastegó + refrescó roles (patrón SetTargetConfirmModal).
    emit('close')
    return
  }
  // red/5xx u otro (§6): el modal permanece con el mensaje inline.
  alertMessage.value = 'No se pudo guardar. Reintenta.'
}

function tryClose() {
  if (busy.value) return
  emit('close')
}

function onOverlayMousedown(event) {
  if (event.target === event.currentTarget) tryClose()
}

/* ---------------------- cierre, teclado y foco atrapado -------------------- */

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

function onGlobalKeydown(event) {
  if (!props.open) return
  if (event.key === 'Escape') {
    tryClose()
    return
  }
  if (event.key !== 'Tab' || !dialogRef.value) return
  const focusables = dialogRef.value.querySelectorAll(FOCUSABLE_SELECTOR)
  if (focusables.length === 0) return
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  const active = document.activeElement
  if (!dialogRef.value.contains(active)) {
    event.preventDefault()
    first.focus()
  } else if (event.shiftKey && active === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    alertMessage.value = ''
    await nextTick()
    dialogRef.value?.focus()
  }
)

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
})
</script>

<template>
  <div v-if="open && line" class="ld-overlay" @mousedown="onOverlayMousedown">
    <div
      ref="dialogRef"
      class="ld-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="line-delete-title"
      tabindex="-1"
    >
      <header class="ld-header">
        <span class="ld-icon" aria-hidden="true">🗑️</span>
        <h3 id="line-delete-title" class="ld-title">Eliminar línea del escenario</h3>
      </header>

      <div class="ld-body">
        <dl class="ld-summary">
          <div class="ld-row">
            <dt>CECO</dt>
            <dd class="ld-dd-strong">
              {{ budgetPlanningStore.costCenterLabel(line.id_cost_center) }}
            </dd>
          </div>
          <div class="ld-row">
            <dt>Fecha proyectada</dt>
            <dd>{{ line.budget_date }}</dd>
          </div>
          <div class="ld-row">
            <dt>Fecha de pago</dt>
            <dd>{{ line.payment_date || '—' }}</dd>
          </div>
          <div class="ld-row">
            <dt>Tipo</dt>
            <dd>
              <span
                class="gl-chip"
                :class="line.line_type === 'income' ? 'gl-chip-income' : 'gl-chip-expense'"
              >
                {{ LINE_TYPE_LABELS[line.line_type] || line.line_type }}
              </span>
              <span
                v-if="line.behavior_type !== 'fixed'"
                class="gl-chip gl-chip-var"
                :title="`Comportamiento: ${BEHAVIOR_LABELS[line.behavior_type] || line.behavior_type}`"
              >
                {{ BEHAVIOR_LABELS[line.behavior_type] || line.behavior_type }}
              </span>
            </dd>
          </div>
          <div class="ld-row">
            <dt>{{ isVariable ? 'Tasa' : 'Monto' }}</dt>
            <dd class="ld-dd-money">
              {{
                isVariable
                  ? formatVariableRate(line.variable_rate)
                  : formatMoney(line.projected_amount)
              }}
            </dd>
          </div>
          <div v-if="line.description" class="ld-row">
            <dt>Concepto</dt>
            <dd>{{ line.description }}</dd>
          </div>
        </dl>

        <p class="ld-warning" role="alert" aria-live="assertive">
          Se eliminará definitivamente del escenario. Esta acción no se puede deshacer; para
          recuperarla, rehaz la carga SIIGO o clona el escenario.
        </p>

        <p v-if="alertMessage" class="ld-alert" role="alert" aria-live="assertive">
          {{ alertMessage }}
        </p>
      </div>

      <footer class="ld-footer">
        <button type="button" class="btn btn-secondary" :disabled="busy" @click="tryClose">
          Cancelar
        </button>
        <button
          type="button"
          class="btn btn-danger ld-confirm"
          :disabled="busy"
          @click="confirmDelete"
        >
          <span v-if="busy" class="ld-spinner" aria-hidden="true"></span>
          {{ busy ? 'Eliminando…' : 'Eliminar definitivamente' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.ld-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 16px;
  background-color: var(--background-transparency, rgba(7, 7, 7, 0.55));
}

.ld-dialog {
  display: flex;
  flex-direction: column;
  width: min(500px, 96vw);
  overflow: hidden;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 10px;
  background-color: var(--color-surface-card, #ffffff);
  color: var(--color-text-primary, #070707);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
  outline: none;
  animation: ld-pop 0.22s cubic-bezier(0.23, 1, 0.32, 1);
}

@keyframes ld-pop {
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
  .ld-dialog {
    animation: none;
  }
}

.ld-header {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 16px 18px 0;
}

.ld-icon {
  font-size: 1.25rem;
}

.ld-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.ld-body {
  padding: 12px 18px 4px;
}

/* Resumen de la fila (los mismos chips resueltos que en la rejilla). */
.ld-summary {
  margin: 0;
  padding: 12px 14px;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 8px;
  background-color: var(--color-surface, #f7f7f7);
}

:root[data-theme='dark'] .ld-summary {
  background-color: rgba(255, 255, 255, 0.03);
}

.ld-row {
  display: flex;
  gap: 10px;
  align-items: baseline;
  justify-content: space-between;
  padding: 3px 0;
}

.ld-row dt {
  font-size: 0.74rem;
  font-weight: 600;
  color: var(--color-text-secondary, #555555);
}

.ld-row dd {
  margin: 0;
  font-size: 0.82rem;
  text-align: right;
}

.ld-dd-strong {
  font-weight: 600;
}

.ld-dd-money {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.gl-chip {
  display: inline-block;
  margin-left: 4px;
  padding: 2px 8px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 600;
  white-space: nowrap;
}

.gl-chip-income {
  border-color: rgba(46, 164, 79, 0.45);
  background-color: rgba(46, 164, 79, 0.1);
  color: #22683a;
}

:root[data-theme='dark'] .gl-chip-income {
  color: #7bd89a;
}

.gl-chip-expense {
  border-color: rgba(197, 48, 48, 0.35);
  background-color: rgba(197, 48, 48, 0.08);
  color: #9b2222;
}

:root[data-theme='dark'] .gl-chip-expense {
  color: #ff9b9b;
}

.gl-chip-var {
  border-color: rgba(20, 161, 217, 0.45);
  background-color: rgba(20, 161, 217, 0.1);
  color: #14718f;
}

:root[data-theme='dark'] .gl-chip-var {
  color: #7fd4ef;
}

/* Texto de peligro literal de FE-S4D §3.3. */
.ld-warning {
  margin: 14px 0 0;
  padding: 10px 12px;
  border: 1px solid rgba(197, 48, 48, 0.35);
  border-left: 4px solid #c53030;
  border-radius: 8px;
  background-color: rgba(197, 48, 48, 0.07);
  font-size: 0.84rem;
  font-weight: 500;
  line-height: 1.55;
  color: #9b2222;
}

:root[data-theme='dark'] .ld-warning {
  color: #ff9b9b;
}

.ld-alert {
  margin: 10px 0 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: #c53030;
}

:root[data-theme='dark'] .ld-alert {
  color: #ff8f8f;
}

.ld-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 18px;
}

.ld-confirm {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}

.ld-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(120, 120, 120, 0.25);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: ld-spin 0.8s linear infinite;
}

@keyframes ld-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
