<script setup>
/**
 * SetTargetConfirmModal — confirmación "Marcar como Meta Activa" (FE-S4 §6.2).
 *
 * Nombra SIEMPRE al escenario que será desactivado (AC-FE-5): el padre resuelve
 * `demotedName` desde la caché del listado (`findActiveForYear`) — dato, no
 * cálculo (NFR-F3). Confirmación → `PUT /budget/planning/{id}/set-target`; el
 * store aplica BR-TGT-01 a las cachés sin refresco manual (el otro escenario
 * pasa a `Cerrado` y este a `🎯` al instante) y centraliza el 403 (toast
 * literal §9 + refresco silencioso de roles).
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useBudgetPlanningStore } from '@/stores/budgetPlanningStore.js'
import { alertService } from '@/services/alertService.js'

const props = defineProps({
  open: { type: Boolean, required: true },
  /** Escenario a activar (fila del dashboard o detalle del editor). */
  scenario: { type: Object, default: null },
  /** Nombre del activo actual del mismo año (null = no lo hay). */
  demotedName: { type: String, default: null }
})

const emit = defineEmits(['done', 'close'])

const budgetPlanningStore = useBudgetPlanningStore()

const dialogRef = ref(null)
/** @type {null | {kind: string, message?: string}} */
const serverError = ref(null)

const busy = computed(() => budgetPlanningStore.settingTarget)

const targetName = computed(() => props.scenario?.budget_name ?? '—')
const targetYear = computed(() => props.scenario?.budget_year ?? '—')

async function confirmTarget() {
  if (!props.scenario || busy.value) return
  serverError.value = null
  const result = await budgetPlanningStore.setTarget(props.scenario.id_budget)

  if (result.ok) {
    const payrollLines = Number(result.data?.payroll_lines_created ?? 0)
    const payrollNote =
      payrollLines > 0 ? ` Nómina proyectada automáticamente: ${payrollLines} líneas.` : ''
    const financingLinesValue = result.data?.financing_lines_created
    const financingLines = Number(financingLinesValue)
    const financingNote =
      financingLinesValue !== null &&
      financingLinesValue !== undefined &&
      Number.isFinite(financingLines)
      ? ` Financiación materializada: ${financingLines} líneas de interés/seguro.`
      : ''
    const financingWarnings = result.data?.financing_warnings
    const warningList = Array.isArray(financingWarnings)
      ? financingWarnings
      : financingWarnings !== null && financingWarnings !== undefined && financingWarnings !== ''
        ? [financingWarnings]
        : []
    const financingWarningNote = warningList.length
      ? ` Aviso de financiación: ${warningList
          .map((warning) =>
            typeof warning === 'string'
              ? warning
              : warning?.message || warning?.detail || JSON.stringify(warning)
          )
          .join(' ')}`
      : ''
    alertService.generalSucces(
      (props.demotedName
        ? `"${targetName.value}" es la meta ${targetYear.value}; "${props.demotedName}" quedó Cerrado.`
        : `"${targetName.value}" es la meta ${targetYear.value}.`) +
        payrollNote +
        financingNote +
        financingWarningNote
    )
    emit('done')
    emit('close')
    return
  }

  if (result.kind === 'busy' || result.kind === 'auth' || result.kind === 'forbidden') {
    // 'forbidden' ya fue toast del store (§9); el modal se cierra para no
    // dejar un botón que el refresco de roles acaba de volver a ocultar.
    if (result.kind === 'forbidden') emit('close')
    return
  }

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
  <div v-if="open && scenario" class="st-overlay" @mousedown="onOverlayMousedown">
    <div
      ref="dialogRef"
      class="st-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="set-target-title"
      tabindex="-1"
    >
      <header class="st-header">
        <span class="st-icon" aria-hidden="true">🎯</span>
        <h3 id="set-target-title" class="st-title">Marcar como Meta Activa</h3>
      </header>

      <div class="st-body">
        <p class="st-text">
          Al activar <strong>{{ targetName }}</strong> como meta {{ targetYear }},
          <template v-if="demotedName">
            el escenario <strong>{{ demotedName }}</strong> pasará a estado Cerrado.
          </template>
          <template v-else>
            no hay otra meta activa para {{ targetYear }}, así que ningún escenario se desactivará.
          </template>
        </p>
        <p class="st-note">
          El motor financiero usará esta meta como referencia del año hasta que otra sea designada.
        </p>
        <p v-if="serverError" class="st-alert" role="alert" aria-live="assertive">
          {{
            serverError.message ||
            'No se pudo designar la meta activa. Inténtelo de nuevo o contacte soporte.'
          }}
        </p>
      </div>

      <footer class="st-footer">
        <button type="button" class="btn btn-secondary" :disabled="busy" @click="tryClose">
          Cancelar
        </button>
        <button
          type="button"
          class="btn btn-primary st-confirm"
          :disabled="busy"
          @click="confirmTarget"
        >
          <span v-if="busy" class="st-spinner" aria-hidden="true"></span>
          {{ busy ? 'Guardando…' : 'Sí, marcar como meta' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.st-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 16px;
  background-color: var(--background-transparency, rgba(7, 7, 7, 0.55));
}

.st-dialog {
  width: min(480px, 96vw);
  overflow: hidden;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 10px;
  background-color: var(--color-surface-card, #ffffff);
  color: var(--color-text-primary, #070707);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
  outline: none;
  animation: st-pop 0.22s cubic-bezier(0.23, 1, 0.32, 1);
}

@keyframes st-pop {
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
  .st-dialog {
    animation: none;
  }
}

.st-header {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 16px 18px 0;
}

.st-icon {
  font-size: 1.25rem;
}

.st-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.st-body {
  padding: 12px 18px 4px;
}

.st-text {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.6;
}

.st-note {
  margin: 10px 0 0;
  font-size: 0.76rem;
  color: var(--color-text-muted, #8a8a8a);
}

.st-alert {
  margin: 12px 0 0;
  padding: 10px 12px;
  border: 1px solid rgba(197, 48, 48, 0.35);
  border-left: 4px solid #c53030;
  border-radius: 8px;
  background-color: rgba(197, 48, 48, 0.07);
  font-size: 0.82rem;
  color: #9b2222;
}

:root[data-theme='dark'] .st-alert {
  color: #ff9b9b;
}

.st-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 18px;
}

.st-confirm {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}

.st-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(120, 120, 120, 0.25);
  border-top-color: var(--color-brand, #03658c);
  border-radius: 50%;
  animation: st-spin 0.8s linear infinite;
}

@keyframes st-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
