<script setup>
/**
 * DeleteScenarioConfirmModal — confirmación DESTRUCTIVA de borrado de un
 * escenario borrador (frontend.03_07; autoridad `backend.02_14`).
 *
 * Muestra nombre, año y nº de líneas del escenario (FD-3: confirmación
 * obligatoria SIN escribir el nombre) y aclara que los clones sobreviven
 * (FD-4). Confirmar ⇒ `deleteScenario` del store (`DELETE /budget/{id}`
 * LEGACY, FD-1): el éxito retira la fila de la caché al instante y emite
 * `deleted` (refresco suave de reconciliación del dashboard). 400
 * `conflict` / 404 `notfound` concurrentes: el store ya fuerza el refresco
 * del listado; aquí `conflict` muestra el mensaje ES inline (el modal sigue
 * abierto y el botón de la fila desaparece al re-render) y `notfound` lo
 * toastea y cierra emitiendo `deleted` (matriz §4). `network`/`server` ⇒
 * inline con reintento posible; `forbidden` ya fue toast del store (§9).
 *
 * Shell clonado de `SetTargetConfirmModal`: overlay con backdrop-click,
 * `role="alertdialog"`, `aria-labelledby` al título, foco inicial en
 * Cancelar, Escape/backdrop cierran SOLO si no hay petición en vuelo.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useBudgetPlanningStore } from '@/stores/budgetPlanningStore.js'
import { alertService } from '@/services/alertService.js'
import { formatCount } from './planningFormat.js'

/** Espejo local del GENERIC_UNEXPECTED_MESSAGE del store (no se exporta). */
const GENERIC_UNEXPECTED_MESSAGE =
  'La solicitud fue rechazada por un motivo no clasificado. Reintenta o contacta soporte.'

const props = defineProps({
  open: { type: Boolean, required: true },
  /** Fila cruda del listado (null ⇒ el modal no renderiza). */
  scenario: { type: Object, default: null }
})

const emit = defineEmits(['deleted', 'close'])

const budgetPlanningStore = useBudgetPlanningStore()

const cancelButtonRef = ref(null)
/** @type {null | {kind: string, message?: string}} */
const serverError = ref(null)

/** Flag propio del borrado (el `busy` global de la tabla no aplica aquí). */
const busy = computed(() => budgetPlanningStore.deleting)

const scenarioName = computed(() => props.scenario?.budget_name ?? '—')
const scenarioYear = computed(() => props.scenario?.budget_year ?? '—')
const scenarioLines = computed(() => `${formatCount(props.scenario?.lines_count)} líneas`)

const visibleErrorMessage = computed(() => {
  const error = serverError.value
  if (!error) return ''
  // conflict/notfound llegan del store con `message` humano en español (§4).
  if (error.message) return error.message
  if (error.kind === 'network') {
    return 'No se pudo conectar con el servidor. Inténtelo de nuevo.'
  }
  return GENERIC_UNEXPECTED_MESSAGE
})

async function confirmDelete() {
  if (!props.scenario || busy.value) return
  serverError.value = null
  const result = await budgetPlanningStore.deleteScenario(props.scenario.id_budget)

  if (result.ok) {
    // La fila ya salió de la caché del store (ASM-7): el padre reconcilia.
    emit('deleted')
    emit('close')
    return
  }

  if (result.kind === 'busy' || result.kind === 'auth') return

  if (result.kind === 'forbidden') {
    // El store ya toastegó + refrescó roles (patrón SetTargetConfirmModal).
    emit('close')
    return
  }

  if (result.kind === 'notfound') {
    // §4: mensaje ES + cierre; el store ya forzó el refresco del listado y
    // la fila desapareció, así que se propaga 'deleted' para reconciliar.
    alertService.generalError(result.message)
    emit('deleted')
    emit('close')
    return
  }

  // conflict / network / server / resto: el modal permanece abierto con el
  // mensaje inline (conflict: la lista ya se refrescó sola; el botón morirá
  // al re-render; network/server: reintento posible).
  serverError.value = result
}

function tryClose() {
  if (busy.value) return
  emit('close')
}

function onOverlayMousedown(event) {
  if (event.target === event.currentTarget) tryClose()
}

function onGlobalKeydown(event) {
  if (!props.open) return
  if (event.key === 'Escape') tryClose()
}

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    serverError.value = null
    await nextTick()
    // Foco inicial en Cancelar (dialogo destructivo): eliminar exige un clic
    // deliberado sobre el botón de peligro.
    cancelButtonRef.value?.focus()
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
  <div v-if="open && scenario" class="ds-overlay" @mousedown="onOverlayMousedown">
    <div
      class="ds-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="delete-scenario-title"
    >
      <header class="ds-header">
        <span class="ds-icon" aria-hidden="true">🗑️</span>
        <h3 id="delete-scenario-title" class="ds-title">Eliminar escenario</h3>
      </header>

      <div class="ds-body">
        <p class="ds-name">
          <strong>{{ scenarioName }}</strong>
        </p>
        <p class="ds-chips">
          <span class="ds-chip">{{ scenarioYear }}</span>
          <span class="ds-chip">{{ scenarioLines }}</span>
        </p>
        <p class="ds-warning">
          Esta acción es irreversible: el escenario y todas sus líneas se eliminarán
          permanentemente. Los escenarios clonados a partir de este se conservarán.
        </p>
        <p v-if="visibleErrorMessage" class="ds-alert" role="alert" aria-live="assertive">
          {{ visibleErrorMessage }}
        </p>
      </div>

      <footer class="ds-footer">
        <button
          ref="cancelButtonRef"
          type="button"
          class="btn btn-secondary"
          :disabled="busy"
          @click="tryClose"
        >
          Cancelar
        </button>
        <button
          type="button"
          class="btn btn-danger ds-confirm"
          :disabled="busy || !scenario"
          @click="confirmDelete"
        >
          <span v-if="busy" class="ds-spinner" aria-hidden="true"></span>
          {{ busy ? 'Eliminando…' : 'Sí, eliminar' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.ds-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 16px;
  background-color: var(--background-transparency, rgba(7, 7, 7, 0.55));
}

.ds-dialog {
  width: min(480px, 96vw);
  overflow: hidden;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 10px;
  background-color: var(--color-surface-card, #ffffff);
  color: var(--color-text-primary, #070707);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
  outline: none;
  animation: ds-pop 0.22s cubic-bezier(0.23, 1, 0.32, 1);
}

@keyframes ds-pop {
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
  .ds-dialog {
    animation: none;
  }
}

.ds-header {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 16px 18px 0;
}

.ds-icon {
  font-size: 1.25rem;
}

.ds-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.ds-body {
  padding: 12px 18px 4px;
}

.ds-name {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: 0.92rem;
}

.ds-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0 0;
}

.ds-chip {
  display: inline-block;
  padding: 3px 10px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* Texto de peligro literal de frontend.03_07 §3.4 (tonos de pd-load-error). */
.ds-warning {
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

:root[data-theme='dark'] .ds-warning {
  color: #ff9b9b;
}

.ds-alert {
  margin: 10px 0 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: #c53030;
}

:root[data-theme='dark'] .ds-alert {
  color: #ff8f8f;
}

.ds-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 18px;
}

.ds-confirm {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}

.ds-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(120, 120, 120, 0.25);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: ds-spin 0.8s linear infinite;
}

@keyframes ds-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
