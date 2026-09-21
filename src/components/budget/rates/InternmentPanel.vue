<script setup>
/**
 * InternmentPanel — Internación por Línea (FE-S10-INTERNMENT-SPLIT §2.3;
 * panel del tab 'internment' de `BudgetRulesView`).
 *
 * Define el desglose del costo total de una importación (A-1': el valor de la
 * compra ES el CostoTotal): el % de internación (`line_internment_rates`,
 * fracción 0–1 = recargo SOBRE el costo del proveedor, D-S9-1) parte cada
 * compra en `Proveedor = Total/(1+%)` + `Internación = Total − Proveedor`, y
 * el componente de internación se paga con SUS propios términos
 * (`line_internment_terms`, espejo de forma del catálogo FE-S5 pero base
 * distinta — tablas NO intercambiables, BE-S9 §3.2). Todo se deriva en vivo
 * en la Vista Flujo (D-FE10-1: cero escrituras de cuotas); este panel CRUD
 * NINGÚN escenario — solo el catálogo cacheado en `budgetRulesStore` (LA
 * fuente: las acciones del store insertan/reemplazan/retiran in-place desde
 * la respuesta, patrón `PayableTermsPanel` l.311/344/377).
 *
 * Por Línea seleccionada (mismo selector/alfabeto que `PayableTermsPanel`):
 *  (a) % de internación: input único 0–100 convertido a fracción con
 *      `Number((v/100).toFixed(6))` (FD5-3 espejo l.198). Vacío ⇒ sin tasa
 *      (si existía ⇒ DELETE: la ausencia se representa con la INEXISTENCIA
 *      de fila, BE-S9 §3.1). Guard local `0 < v ≤ 100` ⇒ bloqueo inline SIN
 *      request citando el 422 (AC-FE10-6: 105 % jamás viaja).
 *  (b) Cuotas: renglón `pct % | días` idéntico en forma al de proveedores
 *      (mismos `formatPct`/`formatDays`, "0 → el día de la importación") y
 *      botón "Patrón típico (60 % a 15 d · 40 % a 45 d)" SOLO con la lista
 *      vacía: default de UI que precarga las dos filas persistiéndolas vía
 *      los POST normales (A-4/D-FE10-4: el backend NO seedea).
 *  (c) Aviso Σ: badge `Σ {x} % ≠ 100 %` ámbar si <100 / rojo si >100,
 *      INFORMATIVO, nunca bloquea (A-9/R-S9-1).
 *
 * Los catálogos se cargan como dúo atómico (`fetchInternmentCatalogs`, D-
 * FE10-3): una sola bandera de error compartido (`loadError.internment`).
 * Errores del servidor (rejilla `{ detail, reason? }`; NFR-5 con la
 * excepción expresa de FE-S10 §2.1):
 *   400 "already has an internment rate" → se pinta el `detail` LITERAL (S2.1)
 *   422          → "Revisa los valores marcados." (banner; el modal sigue)
 *   404 término  → toast "La cuota de internación ya no existe." + refetch forzado
 *   404 tasa     → toast "La tasa de internación ya no existe." + refetch forzado
 *   404 línea    → inline bajo el select de Línea
 *   red/5xx      → "No se pudo guardar. Reintenta." (modal permanece abierto,
 *                  datos intactos — AC-S5-FE-7 heredado)
 *   401          → silencioso: `handleAuth` del store cierra sesión y redirige
 *
 * Emite NADA: el panel se basta del store (el padre solo monta/desmonta).
 */
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useBudgetRulesStore } from '@/stores/budgetRulesStore.js'
import { alertService } from '@/services/alertService.js'

const budgetRulesStore = useBudgetRulesStore()

/* ------------------------------------------------------------------ */
/* Textos literales de la spec FE-S10 §2.3 — es-CO hard-coded          */
/* ------------------------------------------------------------------ */

const PANEL_TITLE = 'Internación por Línea (desglose del costo total de la importación)'
const PANEL_SUBTITLE =
  'El % de internación parte cada compra en costo del proveedor + costo de internación; ' +
  'la internación se paga con sus propios términos y se muestra como bloque propio en la Vista Flujo.'
const NO_SELECTION_PLACEHOLDER =
  'Seleccione una línea para ver y administrar el porcentaje de internación y las cuotas ' +
  'con las que su costo de internación se paga en la Vista Flujo.'

/** (a) Helper literal §2.3 (ACEPTACIÓN — copiar verbatim, incluido `×`). */
const RATE_HELPER =
  'Recargo sobre el costo del proveedor: CostoTotal = Proveedor × (1 + %). ' +
  'El valor capturado en las compras es el CostoTotal (ya lo incluye).'

/** (b) Botón literal §2.3 (ACEPTACIÓN — copiar verbatim, incluido `·`). */
const TYPICAL_PATTERN_LABEL = 'Patrón típico (60 % a 15 d · 40 % a 45 d)'

const DAYS_HINT = 'Negativo = antes de la importación (p. ej. −60). 0 = el día de la importación.'
/** Copy del borrado de cuota (espejo del literal FE-S7 del panel payable). */
const DELETE_CONFIRM_TEXT =
  'El costo de internación de esta Línea dejará de diferirse en la Vista Flujo (se verá ' +
  'como un solo pago el día de la importación). No se modifica ninguna línea del escenario.'
const RATE_RANGE_MSG =
  'El porcentaje debe ser mayor que 0 y como máximo 100 % (fuera de rango el servidor responde 422).'
const SAVE_ERROR_VALIDATION = 'Revisa los valores marcados.'
const SAVE_ERROR_GENERIC = 'No se pudo guardar. Reintenta.'
const TERM_GONE_TOAST = 'La cuota de internación ya no existe.'
const RATE_GONE_TOAST = 'La tasa de internación ya no existe.'
const LINE_GONE_INLINE = 'La línea seleccionada ya no existe. Elija otra línea del catálogo.'

/** Conversión %→fracción con el redondeo anti float-garbage (FD5-3/FD-8). */
function toFraction(pctValue) {
  return Number((pctValue / 100).toFixed(6))
}

/* ------------------------------ selector de Línea ----------------------------- */

/** `id_line | null` — obligatorio (placeholder §2.3, mismo patrón payable). */
const selectedLineId = ref(null)

/** Opciones alfabéticas: mismo criterio que `PayableTermsPanel`. */
const sortedLines = computed(() =>
  [...budgetRulesStore.lines].sort((a, b) =>
    String(a.line_name).localeCompare(String(b.line_name), 'es')
  )
)

const selectedLineName = computed(() =>
  selectedLineId.value === null ? '' : budgetRulesStore.lineNameById(selectedLineId.value)
)

/** Cuotas de la Línea elegida, en orden de emisión (D-7: días asc, id asc). */
const lineTerms = computed(() => {
  if (selectedLineId.value === null) return []
  return budgetRulesStore.internmentTerms
    .filter((term) => term.id_line === selectedLineId.value)
    .sort(
      (a, b) =>
        a.payment_days - b.payment_days || a.id_line_internment_term - b.id_line_internment_term
    )
})

/** 404 "Line {id} not found" en los POST (inline bajo el select, §3.3 heredado). */
const lineGoneError = ref('')

/* ------------------------- (a) tasa de internación de la Línea ------------------------- */

/** Tasa vigente de la Línea (unicidad BE §3.1 ⇒ máx. una fila). */
const currentRate = computed(() => {
  if (selectedLineId.value === null) return null
  return (
    budgetRulesStore.internmentRates.find((item) => item.id_line === selectedLineId.value) ?? null
  )
})

/** Texto canónico de la tasa en el input (% con 2 dec. recortados, espejo openEdit). */
function rateTextFromStore() {
  if (!currentRate.value) return ''
  return String(Number((Number(currentRate.value.internment_pct) * 100).toFixed(2)))
}

/** Estado del input SIEMPRE string; vacío = "sin tasa" (delete al guardar). */
const rateInput = ref('')
const rateServerError = ref('')

watch(selectedLineId, () => {
  lineGoneError.value = ''
  rateServerError.value = ''
  rateInput.value = rateTextFromStore()
})

// Refetch completo (Reintentar / resync tras 404): la referencia del array
// cambia ⇒ re-sincroniza el input con la verdad del servidor. Los patch
// in-place de las acciones del store se re-sincronizan en sus handlers.
watch(
  () => budgetRulesStore.internmentRates,
  () => {
    rateInput.value = rateTextFromStore()
  }
)

const rateNumber = computed(() => {
  const raw = String(rateInput.value).trim()
  if (!raw) return Number.NaN
  return Number(raw)
})

/** Guard local `0 < v ≤ 100` (fuera ⇒ borde rojo SIN request, AC-FE10-6). */
const rateRangeError = computed(() => {
  const raw = String(rateInput.value).trim()
  if (!raw) return ''
  if (!Number.isFinite(rateNumber.value) || rateNumber.value <= 0 || rateNumber.value > 100) {
    return RATE_RANGE_MSG
  }
  return ''
})

const rateSavingKey = computed(() =>
  currentRate.value ? currentRate.value.id_line_internment_rate : 'new'
)
const rateBusy = computed(() => Boolean(budgetRulesStore.internmentRateSaving[rateSavingKey.value]))
const anyRateSaving = computed(() => Object.keys(budgetRulesStore.internmentRateSaving).length > 0)

/** No-op: vacío sin tasa existente, o el mismo valor que ya está guardado. */
const rateNoop = computed(() => {
  const raw = String(rateInput.value).trim()
  if (!raw) return currentRate.value === null
  if (!currentRate.value) return false
  return toFraction(rateNumber.value) === Number(currentRate.value.internment_pct)
})

const canSaveRate = computed(
  () =>
    selectedLineId.value !== null &&
    !rateBusy.value &&
    !anyRateSaving.value &&
    !rateRangeError.value &&
    !rateNoop.value
)

async function handleSaveRate() {
  rateServerError.value = ''
  if (!canSaveRate.value) return
  const raw = String(rateInput.value).trim()

  // Vacío ⇒ sin tasa: si existía ⇒ DELETE (A-5: sin fila la Línea queda 0 %).
  if (!raw) {
    if (!currentRate.value) return
    const result = await budgetRulesStore.deleteInternmentRate(
      currentRate.value.id_line_internment_rate
    )
    if (result.ok) {
      alertService.generalSucces('Tasa de internación eliminada.')
      rateInput.value = rateTextFromStore()
      return
    }
    applyRateSaveError(result, 'delete')
    return
  }

  const payload = {
    id_line: selectedLineId.value,
    internment_pct: toFraction(rateNumber.value)
  }
  const isUpdate = Boolean(currentRate.value)
  const result = isUpdate
    ? await budgetRulesStore.updateInternmentRate(
        currentRate.value.id_line_internment_rate,
        payload
      )
    : await budgetRulesStore.createInternmentRate(payload)
  if (result.ok) {
    alertService.generalSucces('Tasa de internación guardada.')
    rateInput.value = rateTextFromStore()
    return
  }
  applyRateSaveError(result, isUpdate ? 'update' : 'create')
}

/**
 * Mapeo FE-S10 §2.1/§3.3 heredado: resultado clasificado del store →
 * presentación. Única excepción a NFR-5: los 400 amables del CRUD de tasas
 * ("Line {id} already has an internment rate") se muestran CON el `detail`
 * literal del backend (así lo exige §2.1).
 * @param {{ kind: string, status?: number, detail?: string|null }} result
 * @param {'create'|'update'|'delete'} action
 */
function applyRateSaveError(result, action) {
  // 'auth': el store cerró sesión y redirige — UI calla. 'busy': no-op.
  if (result.kind === 'auth' || result.kind === 'busy') return

  if (result.kind === 'validation') {
    rateServerError.value = SAVE_ERROR_VALIDATION
    return
  }

  if (result.kind === 'notfound') {
    const detail = String(result.detail ?? '')
    // PUT/DELETE: la tasa murió entre el listado y el request ⇒ toast +
    // refetch forzoso del dúo (§3.3). En POST el 404 solo puede ser de
    // LÍNEA ("Line {id} not found") ⇒ inline bajo el select.
    if (action !== 'create' || /lineinternmentrate/i.test(detail)) {
      alertService.generalError(RATE_GONE_TOAST)
      void budgetRulesStore.fetchInternmentCatalogs(true)
      return
    }
    lineGoneError.value = LINE_GONE_INLINE
    return
  }

  if (typeof result.detail === 'string' && result.detail) {
    rateServerError.value = result.detail
    return
  }

  // network / server / resto: banner con datos intactos (AC-S5-FE-7 heredado).
  rateServerError.value = SAVE_ERROR_GENERIC
}

/* ------------------------------- formato celdas ------------------------------- */

/** `payment_pct × 100` con máx. 2 decimales recortados (0.3 → '30%'). */
function formatPct(paymentPct) {
  const value = Number(paymentPct) * 100
  return Number.isFinite(value) ? `${Number(value.toFixed(2))}%` : '—'
}

/** Humaniza `payment_days` con los literales heredados (−60 / 0 / +n). */
function formatDays(paymentDays) {
  const days = Number(paymentDays)
  if (!Number.isFinite(days)) return '—'
  if (days < 0) return `${Math.abs(days)} días antes`
  if (days === 0) return 'el día de la importación'
  return `${days} días después`
}

/* ------------------------ (c) aviso de Σ de las cuotas ------------------------ */

const termsSumPct = computed(() =>
  lineTerms.value.reduce((sum, term) => {
    const pct = Number(term.payment_pct)
    return Number.isFinite(pct) ? sum + pct * 100 : sum
  }, 0)
)
const termsSumDisplay = computed(() => Number(termsSumPct.value.toFixed(2)))
/** Ámbar si <100, rojo si >100 — INFORMATIVO, nunca bloquea (A-9/R-S9-1). */
const showSigmaWarning = computed(() => lineTerms.value.length > 0 && termsSumDisplay.value !== 100)

/* --------------------------- (b) editor de cuotas (modal) --------------------------- */

const editorOpen = ref(false)
/** `null` ⇒ creación; término completo ⇒ edición (PUT = reemplazo total). */
const editingTerm = ref(null)
/** Estado del formulario (SIEMPRE strings; se numericen en el payload). */
const form = reactive({ pct: '', days: '' })
const attempted = ref(false)
const saveError = ref('')

const isEdit = computed(() => Boolean(editingTerm.value))

/** Clave del guard `internmentTermSaving`: id | 'new' (dueño: el store). */
const savingKey = computed(() => (isEdit.value ? editingTerm.value.id_line_internment_term : 'new'))
const busy = computed(() => Boolean(budgetRulesStore.internmentTermSaving[savingKey.value]))
/** Cualquier mutación de cuotas en vuelo congela la rejilla (✏️/🗑/+). */
const anySaving = computed(() => Object.keys(budgetRulesStore.internmentTermSaving).length > 0)
const applyingTypical = ref(false)

const editorTitle = computed(() =>
  isEdit.value ? 'Editar cuota de internación' : 'Nueva cuota de internación'
)

/* ------------------------- validación local PRE-red -------------------------- */

const PCT_REQUIRED_MSG = 'El porcentaje es obligatorio.'
const PCT_RANGE_MSG = 'El porcentaje debe ser mayor que 0 y como máximo 100.'
const DAYS_REQUIRED_MSG = 'Los días son obligatorios.'
const DAYS_INTEGER_MSG = 'Los días deben ser un número entero.'

const pctNumber = computed(() => {
  const raw = String(form.pct).trim()
  if (!raw) return Number.NaN
  return Number(raw)
})

/** Borde rojo SIN request para 0, 150 o vacío (AC-S5-FE-2 heredado). */
const pctError = computed(() => {
  if (!Number.isFinite(pctNumber.value)) return PCT_REQUIRED_MSG
  if (pctNumber.value <= 0 || pctNumber.value > 100) return PCT_RANGE_MSG
  return ''
})

const daysNumber = computed(() => {
  const raw = String(form.days).trim()
  if (!raw) return Number.NaN
  return Number(raw)
})

/** Entero admitiendo negativos (p. ej. −60, semántica `payment_days`). */
const daysError = computed(() => {
  if (!Number.isFinite(daysNumber.value)) return DAYS_REQUIRED_MSG
  if (!Number.isInteger(daysNumber.value)) return DAYS_INTEGER_MSG
  return ''
})

/** Mensajes visibles: los "obligatorio" solo tras intento; el resto en vivo. */
const pctMessage = computed(() =>
  pctError.value === PCT_REQUIRED_MSG && !attempted.value ? '' : pctError.value
)
const daysMessage = computed(() =>
  daysError.value === DAYS_REQUIRED_MSG && !attempted.value ? '' : daysError.value
)

const canSave = computed(
  () => editorOpen.value && !busy.value && !pctError.value && !daysError.value
)

/**
 * Body EXACTO BE-S9 §5.3: `{ id_line, payment_pct, payment_days }` — la
 * conversión %→fracción (FD5-3 espejo PayableTermsPanel l.198): 12.5 ⇒ 0.125.
 */
function buildPayload() {
  return {
    id_line: selectedLineId.value,
    payment_pct: toFraction(pctNumber.value),
    payment_days: daysNumber.value
  }
}

/* --------------------------------- guardado ---------------------------------- */

function openCreate() {
  if (selectedLineId.value === null || anySaving.value) return
  editingTerm.value = null
  form.pct = ''
  form.days = ''
  attempted.value = false
  saveError.value = ''
  editorOpen.value = true
}

/** Editar: pre-carga el término (pct en % con 2 dec. redondeados). */
function openEdit(term) {
  if (anySaving.value) return
  editingTerm.value = term
  form.pct = String(Number((Number(term.payment_pct) * 100).toFixed(2)))
  form.days = String(term.payment_days)
  attempted.value = false
  saveError.value = ''
  editorOpen.value = true
}

function closeEditor() {
  if (busy.value) return
  editorOpen.value = false
  editingTerm.value = null
}

function onEditorOverlayMousedown(event) {
  if (event.target === event.currentTarget) closeEditor()
}

async function handleSave() {
  attempted.value = true
  saveError.value = ''
  if (!canSave.value) return

  const result = isEdit.value
    ? await budgetRulesStore.updateInternmentTerm(
        editingTerm.value.id_line_internment_term,
        buildPayload()
      )
    : await budgetRulesStore.createInternmentTerm(buildPayload())

  if (result.ok) {
    alertService.generalSucces('Cuota guardada correctamente')
    closeEditor()
    return
  }
  applyTermSaveError(result, isEdit.value)
}

/* ---------------------- Patrón típico (default SOLO de UI) ---------------------- */

/**
 * D-FE10-4/A-4: el backend NO seedea — el botón precarga las dos filas
 * (60 % a 15 d · 40 % a 45 d) persistiéndolas vía los POST normales, en
 * secuencia (el guard `'new'` del store exige no solapar creationes).
 */
const TYPICAL_PATTERN_ROWS = [
  { pct: 60, days: 15 },
  { pct: 40, days: 45 }
]

async function applyTypicalPattern() {
  if (selectedLineId.value === null || anySaving.value || applyingTypical.value) return
  applyingTypical.value = true
  try {
    for (const row of TYPICAL_PATTERN_ROWS) {
      const result = await budgetRulesStore.createInternmentTerm({
        id_line: selectedLineId.value,
        payment_pct: toFraction(row.pct),
        payment_days: row.days
      })
      if (!result.ok) {
        applyTermSaveError(result, false)
        return
      }
    }
    alertService.generalSucces('Patrón típico aplicado')
  } finally {
    applyingTypical.value = false
  }
}

/**
 * Mapeo §3.3 heredado (payable): la `detail` cruda del server SOLO se
 * regex-testea (cuota vs línea); NUNCA se pinta (NFR-5).
 * @param {{ kind: string, detail?: string|null }} result
 * @param {boolean} editing PUT/DELETE vs POST
 */
function applyTermSaveError(result, editing) {
  if (result.kind === 'auth' || result.kind === 'busy') return

  if (result.kind === 'validation') {
    saveError.value = SAVE_ERROR_VALIDATION
    return
  }

  if (result.kind === 'notfound') {
    const detail = String(result.detail ?? '')
    if (editing || /lineinternmentterm/i.test(detail)) {
      editorOpen.value = false
      editingTerm.value = null
      alertService.generalError(TERM_GONE_TOAST)
      void budgetRulesStore.fetchInternmentCatalogs(true)
      return
    }
    editorOpen.value = false
    editingTerm.value = null
    lineGoneError.value = LINE_GONE_INLINE
    return
  }

  // network / server / resto: el modal PERMANECE con los datos intactos.
  saveError.value = SAVE_ERROR_GENERIC
}

/* ---------------------------- eliminar (destructivo) --------------------------- */

/** Fila objetivo del confirm inline; `null` = cerrado. El store es el dueño del DELETE. */
const deleteTarget = ref(null)
const deleting = computed(() =>
  deleteTarget.value
    ? Boolean(budgetRulesStore.internmentTermSaving[deleteTarget.value.id_line_internment_term])
    : false
)

function openDeleteConfirm(term) {
  if (anySaving.value) return
  deleteTarget.value = term
}

function cancelDelete() {
  if (deleting.value) return
  deleteTarget.value = null
}

function onDeleteOverlayMousedown(event) {
  if (event.target === event.currentTarget) cancelDelete()
}

async function confirmDelete() {
  const term = deleteTarget.value
  if (!term || deleting.value) return
  const result = await budgetRulesStore.deleteInternmentTerm(term.id_line_internment_term)
  if (result.ok) {
    deleteTarget.value = null
    alertService.generalSucces('Cuota eliminada.')
    return
  }
  if (result.kind === 'auth' || result.kind === 'busy') return
  if (result.kind === 'notfound') {
    // Ya no está en el servidor: toast + refetch forzoso del dúo.
    deleteTarget.value = null
    alertService.generalError(TERM_GONE_TOAST)
    void budgetRulesStore.fetchInternmentCatalogs(true)
    return
  }
  // red/5xx: el confirm queda abierto para reintento o cancelación.
  alertService.generalError('No se pudo eliminar la cuota. Reintenta.')
}

/* ---------------------- cierre, teclado y foco atrapado -------------------- */

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

const editorDialogRef = ref(null)
const deleteDialogRef = ref(null)

function onGlobalKeydown(event) {
  const deleteOpen = Boolean(deleteTarget.value)
  if (!deleteOpen && !editorOpen.value) return

  if (event.key === 'Escape') {
    // El confirm de borrado manda si está encima (orden defensivo).
    if (deleteOpen) cancelDelete()
    else closeEditor()
    return
  }

  if (event.key !== 'Tab') return
  const dialog = deleteOpen ? deleteDialogRef.value : editorDialogRef.value
  if (!dialog) return
  // Trampa de foco circular dentro del diálogo visible (NFR-S5-FE-2 heredado).
  const focusables = dialog.querySelectorAll(FOCUSABLE_SELECTOR)
  if (focusables.length === 0) return
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  const active = document.activeElement
  if (!dialog.contains(active)) {
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

watch(editorOpen, async (open) => {
  if (!open) return
  await nextTick()
  editorDialogRef.value?.focus()
})

watch(deleteTarget, async (target) => {
  if (!target) return
  await nextTick()
  deleteDialogRef.value?.focus()
})

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
})
</script>

<template>
  <div class="payable-panel">
    <!-- FE-S10 §2.3: panel de internación (tasa por Línea + cuotas propias). -->
    <header class="pt-header">
      <h3 class="pt-heading">{{ PANEL_TITLE }}</h3>
      <p class="pt-caption">{{ PANEL_SUBTITLE }}</p>
    </header>

    <div class="pt-toolbar">
      <label class="pt-field">
        <span class="pt-label">
          Línea
          <span class="pt-required" aria-hidden="true">*</span>
        </span>
        <select v-model="selectedLineId" class="pt-input">
          <option :value="null">Seleccione una línea…</option>
          <option v-for="line in sortedLines" :key="line.id_line" :value="line.id_line">
            {{ line.line_name }}
          </option>
        </select>
        <p v-if="lineGoneError" class="pt-inline-error" role="alert" aria-live="polite">
          {{ lineGoneError }}
        </p>
      </label>

      <div class="pt-toolbar-actions">
        <button
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="selectedLineId === null || anySaving || applyingTypical"
          @click="openCreate"
        >
          + Añadir cuota
        </button>
        <!-- (b) Botón literal §2.3 — visible SOLO con la lista vacía
             (D-FE10-4: default de UI; el backend no seedea). -->
        <button
          v-if="selectedLineId !== null && lineTerms.length === 0"
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="anySaving || applyingTypical || anyRateSaving"
          @click="applyTypicalPattern"
        >
          <span v-if="applyingTypical" class="ptm-spinner" aria-hidden="true"></span>
          {{ TYPICAL_PATTERN_LABEL }}
        </button>
      </div>
    </div>

    <!-- Error de carga del DÚO (bandera única compartida, D-FE10-3): banner
         rojo + Reintentar con refetch forzado de ambos catálogos. -->
    <div
      v-if="budgetRulesStore.loadError.internment"
      class="pt-load-error"
      role="alert"
      aria-live="polite"
    >
      <span>
        No se pudo cargar el catálogo de internación. Verifique su conexión e inténtelo de nuevo.
      </span>
      <button
        type="button"
        class="btn btn-secondary btn-sm"
        @click="budgetRulesStore.fetchInternmentCatalogs(true)"
      >
        Reintentar
      </button>
    </div>

    <!-- Primer fetch (lazy en la primera activación del tab, FE-S10 §2.3) -->
    <div
      v-else-if="!budgetRulesStore.internmentCatalogsLoaded"
      class="pt-placeholder"
      aria-live="polite"
    >
      <span class="pt-mini-spinner" aria-hidden="true"></span>
      Cargando catálogo de internación…
    </div>

    <div v-else-if="selectedLineId === null" class="pt-placeholder">
      {{ NO_SELECTION_PLACEHOLDER }}
    </div>

    <template v-else>
      <!-- ─────────────── (a) % de internación de la Línea ─────────────── -->
      <section class="ip-rate-zone">
        <header class="pt-header">
          <h4 class="pt-heading">% de internación</h4>
          <p class="pt-caption">{{ RATE_HELPER }}</p>
        </header>

        <div class="ip-rate-row">
          <label class="pt-field">
            <span class="pt-label">Internación (%)</span>
            <input
              v-model="rateInput"
              class="pt-input"
              :class="{ 'is-invalid': Boolean(rateRangeError) }"
              type="number"
              step="0.01"
              min="0.01"
              max="100"
              :disabled="anyRateSaving"
              :aria-invalid="rateRangeError ? 'true' : 'false'"
              aria-describedby="ip-rate-help"
              placeholder="Ej.: 20"
            />
            <p v-if="rateRangeError" class="pt-inline-error" role="alert" aria-live="polite">
              {{ rateRangeError }}
            </p>
          </label>

          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="!canSaveRate"
            @click="handleSaveRate"
          >
            <span v-if="rateBusy" class="ptm-spinner" aria-hidden="true"></span>
            {{ rateBusy ? 'Guardando…' : 'Guardar tasa' }}
          </button>
        </div>

        <p id="ip-rate-help" class="pt-caption">
          {{
            currentRate
              ? `Tasa vigente: ${formatPct(currentRate.internment_pct)} sobre el costo del proveedor.`
              : 'Sin tasa: el valor de la compra se ve completo como pago al proveedor.'
          }}
          Vacíe el campo y guarde para quitar la tasa.
        </p>
        <p v-if="rateServerError" class="pt-load-error" role="alert" aria-live="polite">
          {{ rateServerError }}
        </p>
      </section>

      <!-- ─────────────── (b/c) cuotas de internación ─────────────── -->
      <div class="pt-table-zone">
        <table class="pt-table" :aria-label="`Cuotas de internación de ${selectedLineName}`">
          <thead>
            <tr>
              <th class="pt-col-pct">% de pago</th>
              <th>Días desde la importación</th>
              <th class="pt-col-actions">Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="term in lineTerms" :key="term.id_line_internment_term">
              <td class="pt-cell-pct">{{ formatPct(term.payment_pct) }}</td>
              <td>{{ formatDays(term.payment_days) }}</td>
              <td>
                <div class="pt-row-actions">
                  <button
                    type="button"
                    class="pt-icon-btn"
                    aria-label="Editar cuota de internación"
                    :disabled="anySaving"
                    @click="openEdit(term)"
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    class="pt-icon-btn pt-icon-btn-danger"
                    aria-label="Eliminar cuota de internación"
                    :disabled="anySaving"
                    @click="openDeleteConfirm(term)"
                  >
                    🗑
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <p v-if="lineTerms.length === 0" class="pt-empty" aria-live="polite">
          Sin cuotas definidas para esta línea: el costo de internación se verá completo el día de
          la importación en la Vista Flujo. Use '+ Añadir cuota' o el 'Patrón típico' para diferirlo
          en cuotas.
        </p>

        <!-- (c) Badge Σ literal §2.3: ámbar si <100, rojo si >100; nunca
             bloquea (A-9/R-S9-1). -->
        <p
          v-if="showSigmaWarning"
          class="ip-sigma"
          :class="termsSumDisplay < 100 ? 'ip-sigma-warn' : 'ip-sigma-danger'"
          role="status"
          aria-live="polite"
        >
          Σ {{ termsSumDisplay }} % ≠ 100 %
        </p>
      </div>
    </template>

    <!-- ----------------------- modal crear / editar cuota ----------------------- -->
    <div v-if="editorOpen" class="ptm-overlay" @mousedown="onEditorOverlayMousedown">
      <div
        ref="editorDialogRef"
        class="ptm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="internment-editor-title"
        tabindex="-1"
      >
        <header class="ptm-header">
          <div class="ptm-header-text">
            <h3 id="internment-editor-title" class="ptm-title">{{ editorTitle }}</h3>
            <p class="ptm-subtitle">{{ selectedLineName }}</p>
          </div>
          <button
            type="button"
            class="ptm-x"
            :disabled="busy"
            aria-label="Cerrar ventana"
            @click="closeEditor"
          >
            ✕
          </button>
        </header>

        <form class="ptm-body" @submit.prevent="handleSave">
          <div class="ptm-field">
            <label class="ptm-label" for="internment-editor-pct">
              % del costo de internación
              <span class="ptm-required" aria-hidden="true">*</span>
            </label>
            <input
              id="internment-editor-pct"
              v-model="form.pct"
              class="ptm-input"
              :class="{ 'is-invalid': Boolean(pctMessage) }"
              type="number"
              step="0.01"
              min="0.01"
              max="100"
              required
              :disabled="busy"
              :aria-invalid="pctMessage ? 'true' : 'false'"
            />
            <p v-if="pctMessage" class="ptm-field-error" role="alert" aria-live="polite">
              {{ pctMessage }}
            </p>
          </div>

          <div class="ptm-field">
            <label class="ptm-label" for="internment-editor-days">
              Días respecto a la fecha de importación
              <span class="ptm-required" aria-hidden="true">*</span>
            </label>
            <input
              id="internment-editor-days"
              v-model="form.days"
              class="ptm-input"
              :class="{ 'is-invalid': Boolean(daysMessage) }"
              type="number"
              step="1"
              required
              :disabled="busy"
              :aria-invalid="daysMessage ? 'true' : 'false'"
            />
            <p class="ptm-help">{{ DAYS_HINT }}</p>
            <p v-if="daysMessage" class="ptm-field-error" role="alert" aria-live="polite">
              {{ daysMessage }}
            </p>
          </div>

          <!-- Banner de error del servidor: el modal NO se cierra (AC-S5-FE-7) -->
          <p v-if="saveError" class="ptm-banner" role="alert" aria-live="polite">{{ saveError }}</p>
        </form>

        <footer class="ptm-footer">
          <button type="button" class="btn btn-secondary" :disabled="busy" @click="closeEditor">
            Cancelar
          </button>
          <button
            type="button"
            class="btn btn-primary ptm-save"
            :disabled="!canSave"
            @click="handleSave"
          >
            <span v-if="busy" class="ptm-spinner" aria-hidden="true"></span>
            {{ busy ? 'Guardando…' : 'Guardar' }}
          </button>
        </footer>
      </div>
    </div>

    <!-- ------------------- confirmación destructiva (btn-danger) ------------------- -->
    <div v-if="deleteTarget" class="ptm-overlay" @mousedown="onDeleteOverlayMousedown">
      <div
        ref="deleteDialogRef"
        class="ptm-dialog ptm-dialog-narrow"
        role="dialog"
        aria-modal="true"
        aria-labelledby="internment-delete-title"
        tabindex="-1"
      >
        <header class="ptm-header">
          <div class="ptm-header-text">
            <h3 id="internment-delete-title" class="ptm-title">Eliminar cuota de internación</h3>
            <p class="ptm-subtitle">{{ selectedLineName }}</p>
          </div>
          <button
            type="button"
            class="ptm-x"
            :disabled="deleting"
            aria-label="Cerrar ventana"
            @click="cancelDelete"
          >
            ✕
          </button>
        </header>

        <div class="ptm-body">
          <p class="ptm-delete-summary">
            {{ formatPct(deleteTarget.payment_pct) }} ·
            {{ formatDays(deleteTarget.payment_days) }}
          </p>
          <p class="ptm-delete-warning" role="alert">{{ DELETE_CONFIRM_TEXT }}</p>
        </div>

        <footer class="ptm-footer">
          <button
            type="button"
            class="btn btn-secondary"
            :disabled="deleting"
            @click="cancelDelete"
          >
            Cancelar
          </button>
          <button
            type="button"
            class="btn btn-danger ptm-save"
            :disabled="deleting"
            @click="confirmDelete"
          >
            <span v-if="deleting" class="ptm-spinner ptm-spinner-danger" aria-hidden="true"></span>
            {{ deleting ? 'Eliminando…' : 'Eliminar' }}
          </button>
        </footer>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Reusa el lenguaje del panel hermano (`PayableTermsPanel`) — clases del
   panel (pt-* / ptm-*) copiada su cartulación; extras propios con prefijo
   `ip-` (FE-S10 §2.3: CSS solo clases de panel, scoped). */

.payable-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.pt-header {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pt-heading {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text-primary, #070707);
}

.pt-caption {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.45;
  color: var(--color-text-secondary, #555555);
}

/* Barra superior: selector de Línea + acciones */

.pt-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: flex-end;
  padding: 14px 16px;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 8px;
  background-color: var(--color-surface-card, #ffffff);
}

.pt-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: auto;
  min-width: 0;
}

.pt-label {
  display: flex;
  gap: 4px;
  align-items: center;
  width: auto;
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--color-text-secondary, #555555);
}

.pt-required {
  color: #c53030;
}

.pt-input {
  width: 260px;
  min-width: 150px;
  max-width: none;
  margin: 0;
  padding: 7px 10px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 6px;
  background-color: var(--color-surface, #f7f7f7);
  font-size: 0.82rem;
  color: var(--color-text-primary, #070707);
  box-sizing: border-box;
}

.pt-input:focus {
  border-color: var(--color-brand, #03658c);
  outline: 2px solid rgba(3, 101, 140, 0.25);
  outline-offset: 0;
}

.pt-input.is-invalid {
  border-color: #c53030;
}

.pt-inline-error {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 500;
  line-height: 1.4;
  color: #c53030;
}

:root[data-theme='dark'] .pt-inline-error {
  color: #ff9b9b;
}

.pt-toolbar-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

/* Estados de carga / error del catálogo */

.pt-load-error {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  border: 1px solid rgba(197, 48, 48, 0.35);
  border-left: 4px solid #c53030;
  border-radius: 8px;
  background-color: rgba(197, 48, 48, 0.07);
  font-size: 0.84rem;
  line-height: 1.5;
  color: #9b2222;
}

:root[data-theme='dark'] .pt-load-error {
  color: #ff9b9b;
}

.pt-placeholder {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: center;
  padding: 36px 16px;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 8px;
  background-color: var(--color-surface-card, #ffffff);
  font-size: 0.85rem;
  color: var(--color-text-muted, #8a8a8a);
}

.pt-mini-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(120, 120, 120, 0.25);
  border-top-color: var(--color-brand, #03658c);
  border-radius: 50%;
  animation: pt-spin 0.8s linear infinite;
}

/* ─── FE-S10 (a): zona de la tasa de internación ─── */

.ip-rate-zone {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 8px;
  background-color: var(--color-surface-card, #ffffff);
}

.ip-rate-row {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: flex-end;
}

.ip-rate-row .pt-input {
  width: 180px;
}

/* ─── FE-S10 (c): badge Σ (ámbar <100 · rojo >100) ─── */

.ip-sigma {
  align-self: flex-start;
  margin: 10px 14px 14px;
  padding: 3px 10px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 0.74rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.ip-sigma-warn {
  border-color: rgba(180, 83, 9, 0.4);
  background-color: rgba(245, 158, 11, 0.1);
  color: #96590a;
}

:root[data-theme='dark'] .ip-sigma-warn {
  color: #f6c177;
}

.ip-sigma-danger {
  border-color: rgba(197, 48, 48, 0.45);
  background-color: rgba(197, 48, 48, 0.08);
  color: #9b2222;
}

:root[data-theme='dark'] .ip-sigma-danger {
  color: #ff9b9b;
}

/* Rejilla de cuotas (usa los estilos globales de `table`) */

.pt-table-zone {
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 8px;
  background-color: var(--color-surface-card, #ffffff);
}

.pt-table {
  min-width: 560px;
  border: none;
  border-radius: 0;
  overflow: visible;
  box-shadow: none;
}

.pt-table .pt-col-pct {
  width: 160px;
}

.pt-table .pt-col-actions {
  width: 140px;
}

.pt-table .pt-cell-pct {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.pt-row-actions {
  display: flex;
  gap: 6px;
  justify-content: center;
  white-space: nowrap;
}

.pt-icon-btn {
  padding: 5px 9px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 6px;
  background-color: var(--color-surface, #f7f7f7);
  font-size: 0.85rem;
  line-height: 1.2;
  color: var(--color-text-primary, #070707);
  cursor: pointer;
  transition:
    background-color 0.18s cubic-bezier(0.23, 1, 0.32, 1),
    border-color 0.18s cubic-bezier(0.23, 1, 0.32, 1);
}

.pt-icon-btn:hover:not(:disabled) {
  border-color: var(--color-brand, #03658c);
  background-color: var(--color-brand-light, #d0ebda);
}

.pt-icon-btn:focus-visible {
  outline: 2px solid var(--color-brand, #03658c);
  outline-offset: 1px;
}

.pt-icon-btn:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.pt-icon-btn-danger:hover:not(:disabled) {
  border-color: #c53030;
  background-color: rgba(197, 48, 48, 0.08);
}

.pt-empty {
  margin: 0;
  padding: 26px 16px;
  font-size: 0.85rem;
  color: var(--color-text-muted, #8a8a8a);
  text-align: center;
}

/* ------------------------- modales (shell de RateEditorModal) ------------------------- */

.ptm-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 16px;
  background-color: var(--background-transparency, rgba(7, 7, 7, 0.55));
}

.ptm-dialog {
  display: flex;
  flex-direction: column;
  width: min(480px, 96vw);
  max-height: min(88vh, 780px);
  overflow: hidden;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 10px;
  background-color: var(--color-surface-card, #ffffff);
  color: var(--color-text-primary, #070707);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
  outline: none;
  animation: pt-pop 0.22s cubic-bezier(0.23, 1, 0.32, 1);
}

.ptm-dialog-narrow {
  width: min(420px, 96vw);
}

@keyframes pt-pop {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(6px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes pt-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ptm-dialog {
    animation: none;
  }

  .pt-mini-spinner,
  .ptm-spinner {
    animation-duration: 1.6s;
  }
}

.ptm-header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
}

.ptm-header-text {
  flex: 1;
  min-width: 0;
}

.ptm-title {
  margin: 0;
  font-size: 1.02rem;
  font-weight: 600;
  line-height: 1.35;
  text-wrap: balance;
}

.ptm-subtitle {
  margin: 2px 0 0;
  overflow: hidden;
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--color-text-muted, #8a8a8a);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ptm-x {
  flex-shrink: 0;
  padding: 6px 8px;
  border: none;
  border-radius: 6px;
  background: none;
  font-size: 0.95rem;
  color: var(--color-text-muted, #8a8a8a);
  cursor: pointer;
}

.ptm-x:hover:not(:disabled) {
  background-color: rgba(120, 120, 120, 0.12);
  color: var(--color-text-primary, #070707);
}

.ptm-x:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.ptm-body {
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

.ptm-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 0;
}

.ptm-label {
  display: flex;
  gap: 6px;
  align-items: center;
  width: auto;
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--color-text-primary, #070707);
}

.ptm-required {
  color: #c53030;
}

.ptm-input {
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

.ptm-input:focus {
  border-color: var(--color-brand, #03658c);
  outline: 2px solid rgba(3, 101, 140, 0.25);
  outline-offset: 0;
}

.ptm-input.is-invalid {
  border-color: #c53030;
}

.ptm-input:disabled {
  color: var(--color-text-muted, #8a8a8a);
}

.ptm-help {
  margin: 0;
  font-size: 0.7rem;
  line-height: 1.45;
  color: var(--color-text-muted, #8a8a8a);
}

.ptm-field-error {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 500;
  line-height: 1.4;
  color: #c53030;
}

:root[data-theme='dark'] .ptm-field-error {
  color: #ff9b9b;
}

.ptm-banner {
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

:root[data-theme='dark'] .ptm-banner {
  color: #ff9b9b;
}

.ptm-delete-summary {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-primary, #070707);
}

.ptm-delete-warning {
  margin: 0;
  padding: 10px 12px;
  border-left: 4px solid var(--red-color, #c21a1a);
  border-radius: 6px;
  background-color: rgba(197, 48, 48, 0.07);
  font-size: 0.82rem;
  line-height: 1.5;
  color: #9b2222;
}

:root[data-theme='dark'] .ptm-delete-warning {
  color: #ff9b9b;
}

.ptm-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  background-color: var(--color-surface, #f7f7f7);
}

:root[data-theme='dark'] .ptm-footer {
  background-color: rgba(255, 255, 255, 0.03);
}

.ptm-save {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}

.ptm-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(120, 120, 120, 0.25);
  border-top-color: var(--color-brand, #03658c);
  border-radius: 50%;
  animation: pt-spin 0.8s linear infinite;
}

.ptm-spinner-danger {
  border-color: rgba(255, 255, 255, 0.35);
  border-top-color: var(--text-white, #eeeeee);
}

@media (max-width: 480px) {
  .pt-toolbar-actions {
    margin-left: 0;
  }
}
</style>
