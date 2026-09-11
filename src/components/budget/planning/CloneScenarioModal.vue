<script setup>
/**
 * CloneScenarioModal — clonar un escenario con ajuste % (FE-S4 §6.2/§9).
 *
 * Submit: `POST /budget/planning/clone` con `{ id_budget, nuevo_nombre,
 * modifier_pct }` (backend §5.2). Preview EN VIVO del agregado:
 * `Σ Ingresos clonado ≈ total_income × (1 + pct/100)` calculado del row del
 * dashboard (nota fija obligatoria: "Las tasas variables se copian sin
 * escalar" — BR-CLN-03). Éxito: toast + `emit('created')` (refresco del
 * dashboard); NO navega automáticamente (§6.2).
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useBudgetPlanningStore } from '@/stores/budgetPlanningStore.js'
import { alertService } from '@/services/alertService.js'
import { formatMoney } from '@/components/budget/planning/planningFormat.js'

const props = defineProps({
  open: { type: Boolean, required: true },
  /** Fila del dashboard o detalle: requiere id_budget/budget_name/total_income/budget_year. */
  scenario: { type: Object, default: null }
})

const emit = defineEmits(['created', 'close'])

const budgetPlanningStore = useBudgetPlanningStore()

const dialogRef = ref(null)
const attempted = ref(false)
const nuevoNombre = ref('')
const modifierPct = ref('')
const nameError = ref('')
/** @type {null | {kind: string, message?: string}} */
const serverError = ref(null)

const busy = computed(() => budgetPlanningStore.cloning)

const pctNumber = computed(() => {
  const raw = String(modifierPct.value).trim()
  if (!raw) return 0
  const num = Number(raw.includes(',') && !raw.includes('.') ? raw.replace(',', '.') : raw)
  return Number.isFinite(num) ? num : NaN
})

const pctValid = computed(() => Number.isFinite(pctNumber.value) && pctNumber.value >= -100)

const nameValid = computed(() => nuevoNombre.value.trim().length > 0)

const canSubmit = computed(() => nameValid.value && pctValid.value && !busy.value)

/** Preview §6.2: Σ ingresos del clon ≈ total_income × (1 + pct/100). */
const previewTotal = computed(() => {
  const income = Number(props.scenario?.total_income)
  if (!Number.isFinite(income) || !pctValid.value) return null
  return income * (1 + pctNumber.value / 100)
})

const visibleServerError = computed(() => {
  const error = serverError.value
  if (!error) return ''
  // 'local_pct' (validación frontal) y cualquier kind con `message` humano
  // del store (§9: 422/string_detail) muestran su propio texto.
  if (error.message) return error.message
  if (error.kind === 'network') {
    return 'Sin conexión con el servidor. Puede reintentar desde este modal.'
  }
  if (error.kind === 'server') {
    return 'El servidor no pudo clonar el escenario. Reintente o contacte soporte.'
  }
  if (error.kind === 'forbidden') {
    return 'No tiene permiso para realizar esta operación.'
  }
  if (error.kind === 'notfound') {
    return 'El escenario origen ya no existe. Actualice la lista e inténtelo de nuevo.'
  }
  return 'No se pudo clonar el escenario.'
})

async function handleClone() {
  attempted.value = true
  serverError.value = null
  nameError.value = ''

  if (!props.scenario) return
  if (!nameValid.value) {
    nameError.value = 'El nuevo nombre es obligatorio (máximo 120 caracteres).'
    return
  }
  if (!pctValid.value) {
    serverError.value = {
      kind: 'local_pct',
      message: 'El ajuste % debe ser un número mayor o igual que -100.'
    }
    return
  }
  if (busy.value) return

  const result = await budgetPlanningStore.cloneScenario({
    idBudget: props.scenario.id_budget,
    nuevoNombre: nuevoNombre.value,
    modifierPct: pctNumber.value
  })

  if (result.ok) {
    const created = result.data ?? {}
    const pctSuffix =
      pctNumber.value === 0 ? '' : `${pctNumber.value > 0 ? '+' : ''}${pctNumber.value}%`
    alertService.generalSucces(
      `Escenario "${created.budget_name || nuevoNombre.value.trim()}" clonado${pctSuffix ? ` (${pctSuffix})` : ''} desde "${props.scenario.budget_name}". Revíselo en la tabla.`
    )
    emit('created')
    resetLocal()
    emit('close')
    return
  }

  if (result.kind === 'busy' || result.kind === 'auth') return

  if (result.kind === 'duplicate_name') {
    nameError.value = `Ya existe un escenario con ese nombre para ${props.scenario.budget_year}.`
    return
  }

  serverError.value = result
}

function resetLocal() {
  nuevoNombre.value = ''
  modifierPct.value = ''
  nameError.value = ''
  serverError.value = null
  attempted.value = false
}

/* ---------------------- cierre, teclado y foco atrapado -------------------- */

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

function tryClose() {
  if (busy.value) return
  emit('close')
}

function onOverlayMousedown(event) {
  if (event.target === event.currentTarget) tryClose()
}

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
    resetLocal()
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
  <div v-if="open && scenario" class="cl-overlay" @mousedown="onOverlayMousedown">
    <div
      ref="dialogRef"
      class="cl-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="clone-scenario-title"
      tabindex="-1"
    >
      <header class="cl-header">
        <div class="cl-header-text">
          <h3 id="clone-scenario-title" class="cl-title">Clonar Escenario</h3>
          <p class="cl-subtitle">Origen: {{ scenario.budget_name }} · {{ scenario.budget_year }}</p>
        </div>
        <button
          type="button"
          class="cl-x"
          :disabled="busy"
          aria-label="Cerrar ventana"
          @click="tryClose"
        >
          ✕
        </button>
      </header>

      <form class="cl-body" @submit.prevent="handleClone">
        <div class="cl-field">
          <label class="cl-label" for="clone-name">Nuevo nombre</label>
          <input
            id="clone-name"
            v-model="nuevoNombre"
            class="cl-input"
            :class="{ 'is-invalid': attempted && !nameValid }"
            type="text"
            maxlength="120"
            placeholder="Ej.: Plan 2027 +10%"
            :disabled="busy"
          />
          <p v-if="nameError" class="cl-field-error" aria-live="polite">{{ nameError }}</p>
        </div>

        <div class="cl-field">
          <label class="cl-label" for="clone-pct">Ajuste % (opcional)</label>
          <input
            id="clone-pct"
            v-model="modifierPct"
            class="cl-input"
            :class="{ 'is-invalid': attempted && !pctValid }"
            type="number"
            step="any"
            min="-100"
            placeholder="0"
            :disabled="busy"
          />
          <p v-if="!pctValid && attempted" class="cl-field-error" aria-live="polite">
            Número requerido (≥ -100).
          </p>
        </div>

        <div class="cl-preview" aria-live="polite">
          <p class="cl-preview-main">
            Σ Ingresos clonado ≈
            <strong>{{ previewTotal === null ? '—' : formatMoney(previewTotal) }}</strong>
            <span class="cl-preview-formula">
              ({{ formatMoney(scenario.total_income) }} × {{ 1 + (pctNumber || 0) / 100 }})
            </span>
          </p>
          <p class="cl-preview-note">Las tasas variables se copian sin escalar.</p>
        </div>

        <p v-if="visibleServerError" class="cl-alert" role="alert" aria-live="assertive">
          {{ visibleServerError }}
        </p>
      </form>

      <footer class="cl-footer">
        <button type="button" class="btn btn-secondary" :disabled="busy" @click="tryClose">
          Cancelar
        </button>
        <button
          type="button"
          class="btn btn-primary cl-submit"
          :disabled="!canSubmit"
          @click="handleClone"
        >
          <span v-if="busy" class="cl-spinner" aria-hidden="true"></span>
          {{ busy ? 'Clonando…' : 'Clonar' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.cl-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 16px;
  background-color: var(--background-transparency, rgba(7, 7, 7, 0.55));
}

.cl-dialog {
  display: flex;
  flex-direction: column;
  width: min(520px, 96vw);
  overflow: hidden;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 10px;
  background-color: var(--color-surface-card, #ffffff);
  color: var(--color-text-primary, #070707);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
  outline: none;
  animation: cl-pop 0.22s cubic-bezier(0.23, 1, 0.32, 1);
}

@keyframes cl-pop {
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
  .cl-dialog {
    animation: none;
  }
}

.cl-header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
}

.cl-header-text {
  flex: 1;
  min-width: 0;
}

.cl-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.cl-subtitle {
  margin: 2px 0 0;
  overflow: hidden;
  font-size: 0.76rem;
  color: var(--color-text-muted, #8a8a8a);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cl-x {
  padding: 6px 8px;
  border: none;
  border-radius: 6px;
  background: none;
  font-size: 0.95rem;
  color: var(--color-text-muted, #8a8a8a);
  cursor: pointer;
}

.cl-x:hover:not(:disabled) {
  background-color: rgba(120, 120, 120, 0.12);
  color: var(--color-text-primary, #070707);
}

.cl-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 18px;
}

.cl-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cl-label {
  font-size: 0.74rem;
  font-weight: 600;
  color: var(--color-text-secondary, #555555);
}

.cl-input {
  width: 100%;
  margin: 0;
  padding: 8px 10px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 6px;
  background-color: var(--color-surface, #f7f7f7);
  font-size: 0.84rem;
  color: var(--color-text-primary, #070707);
  box-sizing: border-box;
}

.cl-input:focus {
  border-color: var(--color-brand, #03658c);
  outline: 2px solid rgba(3, 101, 140, 0.25);
}

.cl-input.is-invalid {
  border-color: #c53030;
}

.cl-field-error {
  margin: 2px 0 0;
  font-size: 0.76rem;
  font-weight: 500;
  color: #c53030;
}

:root[data-theme='dark'] .cl-field-error {
  color: #ff8f8f;
}

.cl-preview {
  padding: 12px 14px;
  border: 1px solid rgba(3, 101, 140, 0.25);
  border-radius: 8px;
  background-color: rgba(3, 101, 140, 0.05);
}

.cl-preview-main {
  margin: 0;
  font-size: 0.86rem;
}

.cl-preview-formula {
  font-size: 0.74rem;
  color: var(--color-text-muted, #8a8a8a);
}

.cl-preview-note {
  margin: 4px 0 0;
  font-size: 0.74rem;
  font-style: italic;
  color: var(--color-text-secondary, #555555);
}

.cl-alert {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid rgba(197, 48, 48, 0.35);
  border-left: 4px solid #c53030;
  border-radius: 8px;
  background-color: rgba(197, 48, 48, 0.07);
  font-size: 0.82rem;
  color: #9b2222;
}

:root[data-theme='dark'] .cl-alert {
  color: #ff9b9b;
}

.cl-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 18px;
  border-top: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  background-color: var(--color-surface, #f7f7f7);
}

:root[data-theme='dark'] .cl-footer {
  background-color: rgba(255, 255, 255, 0.03);
}

.cl-submit {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}

.cl-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(120, 120, 120, 0.25);
  border-top-color: var(--color-brand, #03658c);
  border-radius: 50%;
  animation: cl-spin 0.8s linear infinite;
}

@keyframes cl-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
