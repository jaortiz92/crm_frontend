<script setup>
/**
 * RateEditorModal — crear/editar reglas financieras (spec §10).
 *
 * `rate === null` ⇒ modo CREACIÓN; con fila ⇒ EDICIÓN (línea inmutable, A7).
 * Validación frontal reactiva completa (§10.4) incluida la pre-verificación
 * de solapamiento BR-13 sobre la caché del store, que se refresca tras cada
 * mutación. Los errores del servidor NO cierran el modal: banner rojo con
 * textos en español (§10.5); `auth` es silencioso (flujo global de sesión).
 *
 * Overlay CSS propio con foco atrapado; `Esc`/backdrop solo si !saving.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RATE_KINDS, localToday } from '@/components/budget/rates/ratesConfig.js'
import { useBudgetRulesStore } from '@/stores/budgetRulesStore.js'
import { alertService } from '@/services/alertService.js'

const props = defineProps({
  open: { type: Boolean, required: true },
  kind: { type: String, required: true },
  /** null ⇒ creación; fila completa ⇒ edición. */
  rate: { type: Object, default: null }
})

const emit = defineEmits(['saved', 'close'])

const budgetRulesStore = useBudgetRulesStore()

const dialogRef = ref(null)
const attempted = ref(false)
const saveError = ref('')

const cfg = computed(() => RATE_KINDS[props.kind])
const isEdit = computed(() => Boolean(props.rate))
const editedId = computed(() => (props.rate ? props.rate[cfg.value.idField] : null))

/* ------------------------------------------------------------------ */
/* Textos literales de la spec (§10.2–§10.5) — NFR-5: español siempre  */
/* ------------------------------------------------------------------ */

const PCT_REQUIRED_MSG = 'El porcentaje es obligatorio.'
const PCT_RANGE_MSG = 'El porcentaje debe estar entre 0 y 100.'
const DATES_REQUIRED_MSG = 'Ambas fechas de vigencia son obligatorias.'
const PERIOD_MSG = 'La fecha de fin debe ser posterior a la de inicio'
const OVERLAP_PRECHECK_MSG =
  'Precaución: se solapa con una regla activa existente en este rango para la misma línea. ' +
  'Deberás archivarla o ajustar las fechas antes de poder guardar.'
const GLOBAL_HINT_MSG =
  'Esta será la tasa global por defecto si un producto no tiene línea asignada.'
const LINE_LOCKED_MSG =
  'La línea no puede modificarse tras la creación. Para cambiar el alcance, ' +
  'archive la regla y cree una nueva.'

const SAVE_ERROR_BANNERS = {
  overlap:
    'Ya existe una regla activa para esta línea en este rango de fechas. ' +
    'Desactive la regla anterior antes de crear la nueva.',
  period: PERIOD_MSG,
  validation: 'Revisa los datos del formulario.',
  generic: 'No se pudo guardar. Inténtalo de nuevo o contacta soporte.'
}

/* ------------------------------- formulario ------------------------------- */

function blankForm() {
  return {
    id_line: null,
    rate_name: '',
    pct: '',
    date_from: localToday(),
    date_to: '',
    is_active: true
  }
}

const form = ref(blankForm())

/** Re-inicializa el formulario cada vez que el modal se abre (§10.2). */
function initForm() {
  const row = props.rate
  if (row) {
    form.value = {
      id_line: row.id_line ?? null,
      rate_name: row.rate_name ?? '',
      pct: row[cfg.value.pctField] ?? '',
      date_from: row.date_from ?? '',
      date_to: row.date_to ?? '',
      is_active: row.is_active === true
    }
  } else {
    // 'date_from' default HOY solo en creación; 'is_active' default true.
    form.value = blankForm()
  }
  attempted.value = false
  saveError.value = ''
}

/** Líneas del catálogo en orden alfabético (§10.2). */
const sortedLines = computed(() =>
  [...budgetRulesStore.lines].sort((a, b) =>
    String(a.line_name).localeCompare(String(b.line_name), 'es')
  )
)

/** Fila editada cuya línea ya no existe en el catálogo (R-1): opción fantasma. */
const showDeletedLineOption = computed(() => {
  const id = form.value.id_line
  return id !== null && !budgetRulesStore.lines.some((line) => line.id_line === id)
})

/* ----------------------------- validación §10.4 ---------------------------- */

const pctNumber = computed(() => {
  const raw = form.value.pct
  if (raw === '' || raw === null || raw === undefined) return Number.NaN
  return Number(raw)
})

const pctError = computed(() => {
  if (Number.isNaN(pctNumber.value)) return PCT_REQUIRED_MSG
  if (pctNumber.value < 0 || pctNumber.value > 100) return PCT_RANGE_MSG
  return ''
})

const datesMissing = computed(() => !form.value.date_from || !form.value.date_to)

const periodInvalid = computed(
  () =>
    !datesMissing.value &&
    // Comparación ISO lexicográfica: `date_to < date_from` estricto invalida;
    // la IGUALDAD es válida (regla de 1 día exacto, BR-12 — AC-15).
    String(form.value.date_to) < String(form.value.date_from)
)

/**
 * Pre-verificación de solapamiento (BR-13 frontal, A4): solo con datos
 * válidos y `is_active === true`. Nulo-segura sobre `id_line` (globales
 * comparan null === null), ignora filas inactivas y la fila editada, y usa
 * cruce de rangos inclusivo `date_from <= to && date_to >= from`.
 */
const overlapDetected = computed(() => {
  if (pctError.value || datesMissing.value || periodInvalid.value) return false
  if (form.value.is_active !== true) return false
  const rows = budgetRulesStore.rates[props.kind] ?? []
  return rows.some((row) => {
    if (row[cfg.value.idField] === editedId.value) return false
    if (row.is_active !== true) return false
    if (row.id_line !== form.value.id_line) return false
    return (
      String(row.date_from ?? '') <= String(form.value.date_to) &&
      String(row.date_to ?? '') >= String(form.value.date_from)
    )
  })
})

/** Mensajes visibles: los "obligatorio" solo tras intento; el resto en vivo. */
const pctMessage = computed(() =>
  pctError.value === PCT_REQUIRED_MSG && !attempted.value ? '' : pctError.value
)

const datesMessage = computed(() => {
  if (datesMissing.value) return attempted.value ? DATES_REQUIRED_MSG : ''
  return periodInvalid.value ? PERIOD_MSG : ''
})

const canSave = computed(
  () => !pctError.value && !datesMissing.value && !periodInvalid.value && !overlapDetected.value
)

const formInvalid = computed(() => !canSave.value || budgetRulesStore.saving)

/* --------------------------------- guardado -------------------------------- */

/** POST: `id_line` SÍ viaja (null explícito permitido) + `rate_name` null. */
function buildCreatePayload() {
  const trimmedName = String(form.value.rate_name ?? '').trim()
  return {
    id_line: form.value.id_line,
    rate_name: trimmedName || null,
    [cfg.value.pctField]: pctNumber.value,
    date_from: form.value.date_from,
    date_to: form.value.date_to,
    is_active: form.value.is_active
  }
}

/**
 * PUT: merge parcial — SOLO campos no-null y NUNCA `id_line` (§5.3, A6/A7).
 * Un `rate_name` vaciado simplemente se omite: el backend (exclude_none) no
 * puede nullificarlo, así que la UI no ofrece borrar el nombre en edición.
 */
function buildUpdatePayload() {
  const raw = {
    rate_name: String(form.value.rate_name ?? '').trim() || null,
    [cfg.value.pctField]: pctNumber.value,
    date_from: form.value.date_from,
    date_to: form.value.date_to,
    is_active: form.value.is_active
  }
  const payload = {}
  for (const [key, value] of Object.entries(raw)) {
    if (value !== null && value !== undefined) payload[key] = value
  }
  return payload
}

async function handleSave() {
  attempted.value = true
  if (!canSave.value || budgetRulesStore.saving) return
  saveError.value = ''

  const result = isEdit.value
    ? await budgetRulesStore.updateRate(props.kind, editedId.value, buildUpdatePayload())
    : await budgetRulesStore.createRate(props.kind, buildCreatePayload())

  if (result.ok) {
    alertService.generalSucces('Regla guardada correctamente')
    // El padre cierra el modal; el store ya hizo refetch del kind (§4.1).
    emit('saved')
    return
  }

  // 'auth' ⇒ sin banner: el flujo de sesión redirige a Login. 'notfound' y
  // lo no clasificado caen al mensaje genérico.
  if (result.kind === 'auth') return
  saveError.value = SAVE_ERROR_BANNERS[result.kind] || SAVE_ERROR_BANNERS.generic
}

/* ---------------------- cierre, teclado y foco atrapado -------------------- */

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

function tryClose() {
  if (budgetRulesStore.saving) return
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
  // Trampa de foco circular dentro del diálogo (NFR-4).
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
    initForm()
    // Catálogo garantizado al abrir (§10.2); no-op si ya está cacheado.
    budgetRulesStore.fetchLinesOnce()
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
  <div v-if="open" class="rm-overlay" @mousedown="onOverlayMousedown">
    <div
      ref="dialogRef"
      class="rm-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rate-editor-title"
      tabindex="-1"
    >
      <header class="rm-header">
        <div class="rm-header-text">
          <h3 id="rate-editor-title" class="rm-title">
            {{ isEdit ? `Editar ${cfg.entityLabel}` : `Nueva ${cfg.entityLabel}` }}
          </h3>
          <p class="rm-subtitle">{{ cfg.tabLabel }}</p>
        </div>
        <button
          type="button"
          class="rm-x"
          :disabled="budgetRulesStore.saving"
          aria-label="Cerrar ventana"
          @click="tryClose"
        >
          ✕
        </button>
      </header>

      <form class="rm-body" @submit.prevent="handleSave">
        <!-- Línea de producto (inmutable al editar, A7) -->
        <div class="rm-field">
          <label class="rm-label" for="rate-editor-line">Línea de producto</label>
          <select
            id="rate-editor-line"
            v-model="form.id_line"
            class="rm-input"
            :disabled="isEdit || budgetRulesStore.saving"
          >
            <option :value="null">Aplica globalmente (sin línea)</option>
            <option v-for="line in sortedLines" :key="line.id_line" :value="line.id_line">
              {{ line.line_name }}
            </option>
            <option v-if="showDeletedLineOption" :value="form.id_line" disabled>
              {{ budgetRulesStore.lineNameById(form.id_line) }}
            </option>
          </select>
          <p v-if="isEdit" class="rm-help rm-help-lock">{{ LINE_LOCKED_MSG }}</p>
          <p v-else-if="form.id_line === null" class="rm-info" aria-live="polite">
            {{ GLOBAL_HINT_MSG }}
          </p>
        </div>

        <!-- Nombre de la tasa (opcional, A3) -->
        <div class="rm-field">
          <label class="rm-label" for="rate-editor-name">Nombre de la tasa</label>
          <input
            id="rate-editor-name"
            v-model="form.rate_name"
            class="rm-input"
            type="text"
            maxlength="120"
            placeholder="Ej.: COGS 2026"
            :disabled="budgetRulesStore.saving"
          />
          <p class="rm-help">Opcional, pero recomendada para la auditoría de la regla.</p>
        </div>

        <!-- Porcentaje según pilar (A9) -->
        <div class="rm-field">
          <label class="rm-label" for="rate-editor-pct">
            {{ cfg.pctLabel }}
            <span class="rm-required" aria-hidden="true">*</span>
          </label>
          <input
            id="rate-editor-pct"
            v-model="form.pct"
            class="rm-input"
            type="number"
            min="0"
            max="100"
            step="0.01"
            required
            :disabled="budgetRulesStore.saving"
          />
          <p v-if="pctMessage" class="rm-error" role="alert" aria-live="polite">{{ pctMessage }}</p>
        </div>

        <!-- Vigencia explícita, cerrada por ambos lados (A8/BR-12) -->
        <div class="rm-grid-2">
          <div class="rm-field">
            <label class="rm-label" for="rate-editor-from">
              Vigencia Desde
              <span class="rm-required" aria-hidden="true">*</span>
            </label>
            <input
              id="rate-editor-from"
              v-model="form.date_from"
              class="rm-input"
              type="date"
              required
              :disabled="budgetRulesStore.saving"
            />
          </div>
          <div class="rm-field">
            <label class="rm-label" for="rate-editor-to">
              Vigencia Hasta
              <span class="rm-required" aria-hidden="true">*</span>
            </label>
            <input
              id="rate-editor-to"
              v-model="form.date_to"
              class="rm-input"
              type="date"
              required
              :disabled="budgetRulesStore.saving"
            />
          </div>
        </div>
        <p v-if="datesMessage" class="rm-error rm-error-spacing" role="alert" aria-live="polite">
          {{ datesMessage }}
        </p>

        <!-- Activa (archivada = inactiva; nunca DELETE, §11) -->
        <div class="rm-field">
          <label class="rm-check">
            <input v-model="form.is_active" type="checkbox" :disabled="budgetRulesStore.saving" />
            <span>Regla activa</span>
          </label>
        </div>

        <!-- Pre-check de solapamiento (BR-13 frontal, §10.4): rojo, bloquea -->
        <p v-if="overlapDetected" class="rm-overlap" role="alert" aria-live="polite">
          {{ OVERLAP_PRECHECK_MSG }}
        </p>

        <!-- Banner de error del servidor: el modal NO se cierra (§10.5) -->
        <p v-if="saveError" class="rm-banner" role="alert" aria-live="polite">{{ saveError }}</p>
      </form>

      <footer class="rm-footer">
        <button
          type="button"
          class="btn btn-secondary"
          :disabled="budgetRulesStore.saving"
          @click="tryClose"
        >
          Cancelar
        </button>
        <button
          type="button"
          class="btn btn-primary rm-save"
          :disabled="formInvalid"
          @click="handleSave"
        >
          <span v-if="budgetRulesStore.saving" class="rm-spinner" aria-hidden="true"></span>
          {{ budgetRulesStore.saving ? 'Guardando…' : 'Guardar' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.rm-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 16px;
  background-color: var(--background-transparency, rgba(7, 7, 7, 0.55));
}

.rm-dialog {
  display: flex;
  flex-direction: column;
  width: min(560px, 96vw);
  max-height: min(88vh, 780px);
  overflow: hidden;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 10px;
  background-color: var(--color-surface-card, #ffffff);
  color: var(--color-text-primary, #070707);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
  outline: none;
  animation: rm-pop 0.22s cubic-bezier(0.23, 1, 0.32, 1);
}

@keyframes rm-pop {
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
  .rm-dialog {
    animation: none;
  }
}

.rm-header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  background: linear-gradient(rgba(30, 142, 90, 0.07), rgba(30, 142, 90, 0.015));
}

.rm-header-text {
  flex: 1;
  min-width: 0;
}

.rm-title {
  margin: 0;
  font-size: 1.06rem;
  font-weight: 600;
  line-height: 1.35;
  text-wrap: balance;
}

.rm-subtitle {
  margin: 2px 0 0;
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--color-text-muted, #8a8a8a);
}

.rm-x {
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

.rm-x:hover:not(:disabled) {
  background-color: rgba(120, 120, 120, 0.12);
  color: var(--color-text-primary, #070707);
}

.rm-x:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.rm-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1;
  width: auto;
  min-width: 0;
  margin: 0;
  padding: 18px 20px;
  overflow-y: auto;
  border: none;
  border-radius: 0;
  box-sizing: border-box;
}

.rm-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 0;
}

.rm-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

@media (max-width: 480px) {
  .rm-grid-2 {
    grid-template-columns: 1fr;
  }
}

.rm-label {
  display: flex;
  gap: 6px;
  align-items: center;
  width: auto;
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--color-text-primary, #070707);
}

.rm-required {
  color: #c53030;
}

.rm-input {
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 8px 10px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 6px;
  background-color: var(--color-surface, #f7f7f7);
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-primary, #070707);
  box-sizing: border-box;
}

.rm-input:focus {
  border-color: var(--color-brand, #03658c);
  outline: 2px solid rgba(3, 101, 140, 0.25);
  outline-offset: 0;
}

.rm-help {
  margin: 0;
  font-size: 0.7rem;
  line-height: 1.45;
  color: var(--color-text-muted, #8a8a8a);
}

.rm-help-lock {
  font-weight: 500;
  color: #96590a;
}

:root[data-theme='dark'] .rm-help-lock {
  color: #f6c177;
}

.rm-info {
  margin: 0;
  padding: 7px 10px;
  border-left: 3px solid var(--color-brand, #03658c);
  background-color: rgba(3, 101, 140, 0.07);
  font-size: 0.74rem;
  line-height: 1.45;
  color: var(--color-text-secondary, #555555);
}

.rm-check {
  display: flex;
  gap: 8px;
  align-items: center;
  width: auto;
  font-size: 0.8rem;
  color: var(--color-text-primary, #070707);
  cursor: pointer;
}

.rm-check input[type='checkbox'] {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--color-brand, #03658c);
  cursor: pointer;
}

.rm-error {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 500;
  line-height: 1.4;
  color: #c53030;
}

.rm-error-spacing {
  margin-top: -6px;
}

:root[data-theme='dark'] .rm-error {
  color: #ff9b9b;
}

.rm-overlap {
  margin: 0;
  padding: 9px 12px;
  border-left: 4px solid #c53030;
  background-color: rgba(197, 48, 48, 0.07);
  font-size: 0.78rem;
  font-weight: 500;
  line-height: 1.5;
  color: #9b2222;
}

:root[data-theme='dark'] .rm-overlap {
  color: #ff9b9b;
}

.rm-banner {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid rgba(197, 48, 48, 0.35);
  border-left: 4px solid #c53030;
  border-radius: 8px;
  background-color: rgba(197, 48, 48, 0.07);
  font-size: 0.82rem;
  font-weight: 500;
  line-height: 1.5;
  color: #9b2222;
}

:root[data-theme='dark'] .rm-banner {
  color: #ff9b9b;
}

.rm-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  background-color: var(--color-surface, #f7f7f7);
}

:root[data-theme='dark'] .rm-footer {
  background-color: rgba(255, 255, 255, 0.03);
}

.rm-save {
  gap: 8px;
}

.rm-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: var(--text-white, #eeeeee);
  border-radius: 50%;
  animation: rm-spin 0.8s linear infinite;
}

@keyframes rm-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
