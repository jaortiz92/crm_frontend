<script setup>
/**
 * PayableTermsPanel — Términos de pago AL PROVEEDOR del costo de ventas por
 * Línea (FE-S5-PAYABLE-TERMS §3.2; panel del tab 'payable' de
 * `BudgetRulesView`). FE-S7-COGS-PAYFLOW §6 (copy): BE-S7 §2 re-semantizó el
 * catálogo (D-S7-1) — ya NO trocea gastos del escenario (la expansión de
 * FE/BE-S5 fue revertida, D-S7-6); ahora define CÓMO diferimos el pago del
 * COSTO de ventas de la Línea en la Vista Flujo (desfase temporal 100 %
 * derivado, D-S7-2: no se materializa ni una línea). Título/subtítulo,
 * confirmación de borrado y estados vacíos siguen el literal nuevo de §6;
 * la escala (`payment_pct` 0–1 en wire, % en display), el orden de cuotas
 * (`payment_days asc`, desempate id — BE-S5 §6/D-7 VIVO para la derivación)
 * y los hints de días quedan INTACTOS.
 *
 * CRUD completo sobre el catálogo cacheado en `budgetRulesStore.payableTerms`
 * (LA fuente: las acciones del store insertan/reemplazan/retiran en el sitio
 * desde la respuesta). El CRUD NO toca ningún escenario (la derivación del
 * Flujo se recalcula sola al leer el catálogo cacheado): por eso el texto de
 * la confirmación de borrado lo dice explícito (FE-S7 §6). El selector de
 * Línea usa el MISMO catálogo `lines` de `fetchLinesOnce()` (id → `id_line`,
 * etiqueta → `line_name`); el filtrado por línea y el orden de cuotas son un
 * único `computed` memoizado (NFR-S5-FE-3), así que cambiar de Línea jamás
 * deja datos residuales (AC-S5-FE-1).
 *
 * Modal crear/editar propio: shell copiado de `RateEditorModal` (overlay,
 * `role="dialog"`, `aria-modal`, ESC/backdrop solo si !busy, foco atrapado,
 * NFR-S5-FE-2). La conversión %↔fracción vive SOLO aquí (FD5-3/NFR-S5-FE-5:
 * display 30 / wire 0.30, redondeo `toFixed` anti 29.999…%, espejo de FD-8).
 * El PUT es reemplazo TOTAL (mismo body que el POST — BE-S5 §5).
 *
 * Errores del servidor según la tabla §3.3 (nunca se muestra `detail` crudo,
 * NFR-5):
 *   422          → "Revisa los valores marcados." (banner; el modal sigue)
 *   404 término  → toast "El término ya no existe." + refetch forzado del catálogo
 *   404 línea    → inline bajo el select de Línea (improbable: viene del catálogo)
 *   red/5xx      → "No se pudo guardar. Reintenta." (banner; modal permanece
 *                  abierto con los datos intactos — AC-S5-FE-7)
 *   401          → silencioso: `handleAuth` del store cierra sesión y redirige
 *
 * Emite NADA: el panel se basta del store (el padre solo monta/desmonta).
 */
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useBudgetRulesStore } from '@/stores/budgetRulesStore.js'
import { alertService } from '@/services/alertService.js'

const budgetRulesStore = useBudgetRulesStore()

/* ------------------------------------------------------------------ */
/* Textos literales de la spec (FE-S5 §3.2/§3.3 + re-semantización     */
/* FE-S7 §6) — español siempre, literal de `frontend.03_10`            */
/* ------------------------------------------------------------------ */

/** Título/subtítulo SEMÁNTICOS nuevos (FE-S7 §6): costo→proveedor, no gastos. */
const PANEL_TITLE = 'Términos de pago al proveedor del costo de ventas de la Línea'
const PANEL_SUBTITLE = 'Desfase temporal en la Vista Flujo; no trocea los gastos del escenario.'
/** Placeholder del selector antes de elegir Línea (copy §6 coherente). */
const NO_SELECTION_PLACEHOLDER =
  'Seleccione una línea para ver y administrar los términos con los que su COSTO de ' +
  'ventas se paga al proveedor en la Vista Flujo.'

const DAYS_HINT = 'Negativo = antes de la importación (p. ej. −60). 0 = el día de la importación.'
/** Confirmación de borrado nueva (FE-S7 §6, literal — cero expansión de gastos). */
const DELETE_CONFIRM_TEXT =
  'El pago del costo de esta Línea dejará de diferirse en la Vista Flujo (se verá como ' +
  'un solo pago el día de la causación). No se modifica ninguna línea del escenario.'
const SAVE_ERROR_VALIDATION = 'Revisa los valores marcados.'
const SAVE_ERROR_GENERIC = 'No se pudo guardar. Reintenta.'
const TERM_GONE_TOAST = 'El término ya no existe.'
const LINE_GONE_INLINE = 'La línea seleccionada ya no existe. Elija otra línea del catálogo.'

/* ------------------------------ selector de Línea ----------------------------- */

/** `id_line | null` — obligatorio (placeholder "Seleccione una línea…", §3.2). */
const selectedLineId = ref(null)

/** Opciones alfabéticas: mismo criterio que la barra de filtros y `RateEditorModal`. */
const sortedLines = computed(() =>
  [...budgetRulesStore.lines].sort((a, b) =>
    String(a.line_name).localeCompare(String(b.line_name), 'es')
  )
)

const selectedLineName = computed(() =>
  selectedLineId.value === null ? '' : budgetRulesStore.lineNameById(selectedLineId.value)
)

/** Términos de la Línea elegida, en orden de emisión de cuotas (BE-S5 §6). */
const lineTerms = computed(() => {
  if (selectedLineId.value === null) return []
  return budgetRulesStore.payableTerms
    .filter((term) => term.id_line === selectedLineId.value)
    .sort(
      (a, b) => a.payment_days - b.payment_days || a.id_line_payable_term - b.id_line_payable_term
    )
})

/** 404 "Line {id} not found" en el POST (inline bajo el select, §3.3). */
const lineGoneError = ref('')

watch(selectedLineId, () => {
  lineGoneError.value = ''
})

/* ------------------------------- formato celdas ------------------------------- */

/** `payment_pct × 100` con máx. 2 decimales recortados (0.3 → '30%'). */
function formatPct(paymentPct) {
  const value = Number(paymentPct) * 100
  return Number.isFinite(value) ? `${Number(value.toFixed(2))}%` : '—'
}

/** Humaniza `payment_days` con los literales de §3.2 (−60 / 0 / +n). */
function formatDays(paymentDays) {
  const days = Number(paymentDays)
  if (!Number.isFinite(days)) return '—'
  if (days < 0) return `${Math.abs(days)} días antes`
  if (days === 0) return 'el día de la importación'
  return `${days} días después`
}

/* --------------------------------- editor ---------------------------------- */

const editorOpen = ref(false)
/** `null` ⇒ creación; término completo ⇒ edición (PUT = reemplazo total). */
const editingTerm = ref(null)
/** Estado del formulario (SIEMPRE strings; se numericen en el payload). */
const form = reactive({ pct: '', days: '' })
const attempted = ref(false)
const saveError = ref('')

const isEdit = computed(() => Boolean(editingTerm.value))

/** Clave del guard `payableTermSaving`: id | 'new' (dueño: el store, FE-S5 §4). */
const savingKey = computed(() => (isEdit.value ? editingTerm.value.id_line_payable_term : 'new'))
const busy = computed(() => Boolean(budgetRulesStore.payableTermSaving[savingKey.value]))
/** Cualquier mutación en vuelo congela la rejilla (botones ✏️/🗑/+). */
const anySaving = computed(() => Object.keys(budgetRulesStore.payableTermSaving).length > 0)

const editorTitle = computed(() =>
  isEdit.value ? 'Editar término de pago' : 'Nuevo término de pago'
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

/** Borde rojo SIN request para 0, 150 o vacío (AC-S5-FE-2; 422 solo de rescate). */
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

/** Entero admitiendo negativos (p. ej. −60, §3.2). */
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

/* --------------------------------- payloads --------------------------------- */

/**
 * Body EXACTO BE-S5 §5: `{ id_line, payment_pct, payment_days }` — la
 * conversión %→fracción (FD5-3) con el mismo redondeo anti float-garbage de
 * `rateDecimal` (FE-S4D FD-8): 12.5 ⇒ 0.125 (AC-S5-FE-2).
 */
function buildPayload() {
  return {
    id_line: selectedLineId.value,
    payment_pct: Number((pctNumber.value / 100).toFixed(6)),
    payment_days: daysNumber.value
  }
}

/* -------------------------------- guardado ---------------------------------- */

function openCreate() {
  if (selectedLineId.value === null || anySaving.value) return
  editingTerm.value = null
  form.pct = ''
  form.days = ''
  attempted.value = false
  saveError.value = ''
  editorOpen.value = true
}

/** Editar: pre-carga el término (pct en % con 2 dec. redondeados, §3.2). */
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
    ? await budgetRulesStore.updatePayableTerm(
        editingTerm.value.id_line_payable_term,
        buildPayload()
      )
    : await budgetRulesStore.createPayableTerm(buildPayload())

  if (result.ok) {
    alertService.generalSucces('Término guardado correctamente')
    closeEditor()
    return
  }
  applySaveError(result)
}

/**
 * Mapeo §3.3: resultado clasificado del store → presentación. La `detail`
 * cruda del server SOLO se regex-testea (distinguir 404 de término vs de
 * línea); jamás se pinta (NFR-5).
 */
function applySaveError(result) {
  // 'auth': el store cerró sesión y redirige — UI calla. 'busy': no-op.
  if (result.kind === 'auth' || result.kind === 'busy') return

  if (result.kind === 'validation') {
    saveError.value = SAVE_ERROR_VALIDATION
    return
  }

  if (result.kind === 'notfound') {
    const detail = String(result.detail ?? '')
    // PUT/DELETE: el término murió entre el listado y el request → toast +
    // refetch forzoso del catálogo (§3.3). En POST el 404 solo puede ser de
    // LÍNEA ("Line {id} not found") → inline bajo el select.
    if (isEdit.value || /linepayableterm/i.test(detail)) {
      editorOpen.value = false
      editingTerm.value = null
      alertService.generalError(TERM_GONE_TOAST)
      void budgetRulesStore.fetchPayableTerms(true)
      return
    }
    editorOpen.value = false
    editingTerm.value = null
    lineGoneError.value = LINE_GONE_INLINE
    return
  }

  // network / server / resto (red/5xx): el modal PERMANECE con los datos
  // intactos (AC-S5-FE-7, mismo patrón AC-FD-11).
  saveError.value = SAVE_ERROR_GENERIC
}

/* ---------------------------- eliminar (destructivo) --------------------------- */

/** Fila objetivo del confirm inline; `null` = cerrado. El store es el dueño del DELETE. */
const deleteTarget = ref(null)
const deleting = computed(() =>
  deleteTarget.value
    ? Boolean(budgetRulesStore.payableTermSaving[deleteTarget.value.id_line_payable_term])
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
  const result = await budgetRulesStore.deletePayableTerm(term.id_line_payable_term)
  if (result.ok) {
    deleteTarget.value = null
    alertService.generalSucces('Término eliminado.')
    return
  }
  if (result.kind === 'auth' || result.kind === 'busy') return
  if (result.kind === 'notfound') {
    // Ya no está en el servidor: toast literal §3.3 + refetch forzoso.
    deleteTarget.value = null
    alertService.generalError(TERM_GONE_TOAST)
    void budgetRulesStore.fetchPayableTerms(true)
    return
  }
  // red/5xx: el confirm queda abierto para reintento o cancelación.
  alertService.generalError('No se pudo eliminar el término. Reintenta.')
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
    // El confirm de borrado manda si está encima (nunca hay dos modales a la vez,
    // pero el orden defensivo evita sorpresas con HMR/teclado rápido).
    if (deleteOpen) cancelDelete()
    else closeEditor()
    return
  }

  if (event.key !== 'Tab') return
  const dialog = deleteOpen ? deleteDialogRef.value : editorDialogRef.value
  if (!dialog) return
  // Trampa de foco circular dentro del diálogo visible (NFR-S5-FE-2).
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
    <!-- FE-S7 §6: identidad semántica nueva del catálogo (costo de ventas →
         proveedor, desfase SOLO en la Vista Flujo; los gastos del escenario
         ya NO se trocean — rollback BE-S7 §2). -->
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
          :disabled="selectedLineId === null || anySaving"
          @click="openCreate"
        >
          + Añadir término
        </button>
      </div>
    </div>

    <!-- Error de carga del catálogo: banner rojo + Reintentar (patrón del view) -->
    <div
      v-if="budgetRulesStore.loadError.payableTerms"
      class="pt-load-error"
      role="alert"
      aria-live="polite"
    >
      <span>
        No se pudieron cargar los términos de pago. Verifique su conexión e inténtelo de nuevo.
      </span>
      <button
        type="button"
        class="btn btn-secondary btn-sm"
        @click="budgetRulesStore.fetchPayableTerms(true)"
      >
        Reintentar
      </button>
    </div>

    <!-- Primer fetch (lazy en la primera activación del tab, FE-S5 §3.1) -->
    <div v-else-if="!budgetRulesStore.payableTermsLoaded" class="pt-placeholder" aria-live="polite">
      <span class="pt-mini-spinner" aria-hidden="true"></span>
      Cargando términos de pago…
    </div>

    <div v-else-if="selectedLineId === null" class="pt-placeholder">
      {{ NO_SELECTION_PLACEHOLDER }}
    </div>

    <div v-else class="pt-table-zone">
      <table class="pt-table" :aria-label="`Términos de pago de ${selectedLineName}`">
        <thead>
          <tr>
            <th class="pt-col-pct">% de pago</th>
            <th>Días desde la importación</th>
            <th class="pt-col-actions">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="term in lineTerms" :key="term.id_line_payable_term">
            <td class="pt-cell-pct">{{ formatPct(term.payment_pct) }}</td>
            <td>{{ formatDays(term.payment_days) }}</td>
            <td>
              <div class="pt-row-actions">
                <button
                  type="button"
                  class="pt-icon-btn"
                  aria-label="Editar término de pago"
                  :disabled="anySaving"
                  @click="openEdit(term)"
                >
                  ✏️
                </button>
                <button
                  type="button"
                  class="pt-icon-btn pt-icon-btn-danger"
                  aria-label="Eliminar término de pago"
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
        Sin términos definidos para esta línea: el pago del costo de ventas se verá completo el día
        de la causación en la Vista Flujo. Use '+ Añadir término' para diferirlo en cuotas.
      </p>
    </div>

    <!-- ----------------------- modal crear / editar ----------------------- -->
    <div v-if="editorOpen" class="ptm-overlay" @mousedown="onEditorOverlayMousedown">
      <div
        ref="editorDialogRef"
        class="ptm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payable-editor-title"
        tabindex="-1"
      >
        <header class="ptm-header">
          <div class="ptm-header-text">
            <h3 id="payable-editor-title" class="ptm-title">{{ editorTitle }}</h3>
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
            <label class="ptm-label" for="payable-editor-pct">
              % del pago
              <span class="ptm-required" aria-hidden="true">*</span>
            </label>
            <input
              id="payable-editor-pct"
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
            <label class="ptm-label" for="payable-editor-days">
              Días respecto a la fecha de importación
              <span class="ptm-required" aria-hidden="true">*</span>
            </label>
            <input
              id="payable-editor-days"
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

          <!-- Banner de error del servidor: el modal NO se cierra (§3.3/AC-S5-FE-7) -->
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
        aria-labelledby="payable-delete-title"
        tabindex="-1"
      >
        <header class="ptm-header">
          <div class="ptm-header-text">
            <h3 id="payable-delete-title" class="ptm-title">Eliminar término de pago</h3>
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
.payable-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* FE-S7 §6: cabecera semántica del panel (costo de ventas → proveedor). */

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

/* Barra superior: selector de Línea + acción (misma cartulación que el view) */

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

/* Estados de carga / error del catálogo (patrón del view) */

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

/* Rejilla de términos (usa los estilos globales de `table`) */

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
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: var(--text-white, #eeeeee);
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
