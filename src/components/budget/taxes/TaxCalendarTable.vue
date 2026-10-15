<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useBudgetTaxStore } from '@/stores/budgetTaxStore.js'
import { useUserStore } from '@/stores/userStore.js'

const store = useBudgetTaxStore()
const userStore = useUserStore()

const canEdit = computed(() => userStore.hasPermission('high') || userStore.hasRole(['Gerente', 'Financiero']))
const selectedYear = ref(Number(store.taxYear))
const visibleRegime = ref('all')
const editorOpen = ref(false)
const generateOpen = ref(false)
const deleteOpen = ref(false)
const editingPeriod = ref(null)
const duplicatingPeriod = ref(false)
const deletingPeriod = ref(null)
const attempted = ref(false)
const saveError = ref('')
const deleteError = ref('')
const feedback = ref('')
const feedbackKind = ref('')
const generating = ref(false)
const generateRows = ref([])
const generateError = ref('')
const editorDialogRef = ref(null)
const generateDialogRef = ref(null)
const deleteDialogRef = ref(null)
const deleteCancelButtonRef = ref(null)

const TAX_TYPES = [
  { value: 'income_ordinary', label: 'Renta ordinaria' },
  { value: 'simple', label: 'SIMPLE' },
  { value: 'reteiva', label: 'ReteIVA' },
  { value: 'withholding', label: 'Retención en la fuente' },
  { value: 'ica', label: 'ICA' },
  { value: 'reteica', label: 'ReteICA' }
]

const rows = computed(() => [...store.calendar]
  .filter((row) => visibleRegime.value === 'all' || row.regime === visibleRegime.value || row.regime == null)
  .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0)))

const calendarBusy = computed(() => store.calendarLoading || store.calendarSaving || store.calendarDeleting || generating.value)
const isEdit = computed(() => Boolean(editingPeriod.value))

function defaultTaxType(regime) {
  return regime === 'simple' ? 'simple' : 'income_ordinary'
}

function nextSequence() {
  return rows.value.reduce((max, row) => Math.max(max, Number(row.sequence) || 0), 0) + 1
}

function blankForm() {
  const regime = visibleRegime.value === 'simple' ? 'simple' : 'ordinary'
  return {
    tax_year: selectedYear.value,
    regime,
    tax_type: defaultTaxType(regime),
    period_code: '',
    period_start: '',
    period_end: '',
    declaration_due_date: '',
    payment_due_date: '',
    payment_year: '',
    sequence: nextSequence(),
    notes: '',
    is_active: true
  }
}

const form = reactive(blankForm())

function resetForm() {
  Object.assign(form, blankForm())
  attempted.value = false
  saveError.value = ''
}

function openCreate() {
  if (!canEdit.value || calendarBusy.value) return
  editingPeriod.value = null
  duplicatingPeriod.value = false
  resetForm()
  editorOpen.value = true
}

function openEdit(row) {
  if (!canEdit.value || calendarBusy.value) return
  editingPeriod.value = row
  duplicatingPeriod.value = false
  Object.assign(form, {
    tax_year: row.tax_year ?? selectedYear.value,
    regime: row.regime || 'ordinary',
    tax_type: row.tax_type || 'income_ordinary',
    period_code: row.period_code || '',
    period_start: row.period_start || '',
    period_end: row.period_end || '',
    declaration_due_date: row.declaration_due_date || '',
    payment_due_date: row.payment_due_date || '',
    payment_year: row.payment_year ?? '',
    sequence: row.sequence ?? '',
    notes: row.notes || '',
    is_active: row.is_active !== false
  })
  attempted.value = false
  saveError.value = ''
  editorOpen.value = true
}

function openDuplicate(row) {
  if (!canEdit.value || calendarBusy.value) return
  editingPeriod.value = null
  duplicatingPeriod.value = true
  Object.assign(form, {
    tax_year: row.tax_year ?? selectedYear.value,
    regime: row.regime || 'ordinary',
    tax_type: row.tax_type || 'income_ordinary',
    period_code: row.period_code || '',
    period_start: row.period_start || '',
    period_end: row.period_end || '',
    declaration_due_date: row.declaration_due_date || '',
    payment_due_date: row.payment_due_date || '',
    payment_year: row.payment_year ?? '',
    sequence: row.sequence ?? '',
    notes: row.notes || '',
    is_active: row.is_active !== false
  })
  attempted.value = false
  saveError.value = ''
  editorOpen.value = true
}

function closeEditor() {
  if (store.calendarSaving) return
  editorOpen.value = false
  editingPeriod.value = null
  duplicatingPeriod.value = false
}

function openDelete(row) {
  if (!canEdit.value || calendarBusy.value) return
  deletingPeriod.value = row
  deleteError.value = ''
  deleteOpen.value = true
}

function closeDelete() {
  if (store.calendarDeleting) return
  deleteOpen.value = false
  deletingPeriod.value = null
  deleteError.value = ''
}

function fieldErrors(values) {
  const errors = {}
  const required = [
    ['tax_year', 'El año fiscal es obligatorio.'],
    ['regime', 'El régimen es obligatorio.'],
    ['tax_type', 'El tipo de impuesto es obligatorio.'],
    ['period_code', 'El código del período es obligatorio.'],
    ['period_start', 'La fecha inicial es obligatoria.'],
    ['period_end', 'La fecha final es obligatoria.'],
    ['declaration_due_date', 'La fecha de declaración es obligatoria.'],
    ['payment_due_date', 'La fecha de pago es obligatoria.'],
    ['payment_year', 'El año de pago es obligatorio.'],
    ['sequence', 'La secuencia es obligatoria.']
  ]
  required.forEach(([key, message]) => {
    if (values[key] === '' || values[key] === null || values[key] === undefined) errors[key] = message
  })
  const taxYear = Number(values.tax_year)
  const paymentYear = Number(values.payment_year)
  const sequence = Number(values.sequence)
  if (!errors.tax_year && (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 2100)) {
    errors.tax_year = 'El año fiscal debe estar entre 2000 y 2100.'
  }
  if (!errors.payment_year && (!Number.isInteger(paymentYear) || paymentYear < 2000 || paymentYear > 2200)) {
    errors.payment_year = 'El año de pago debe estar entre 2000 y 2200.'
  }
  if (!errors.sequence && (!Number.isInteger(sequence) || sequence < 1)) {
    errors.sequence = 'La secuencia debe ser un entero mayor que cero.'
  }
  if (!errors.period_start && !errors.period_end && values.period_end < values.period_start) {
    errors.period_end = 'La fecha final no puede ser anterior a la inicial.'
  }
  if (!errors.payment_year && !errors.payment_due_date
      && Number(values.payment_year) !== Number(String(values.payment_due_date).slice(0, 4))) {
    errors.payment_year = 'El año de pago debe ser el año del vencimiento de pago.'
  }
  return errors
}

const validationErrors = computed(() => fieldErrors(form))
const canSave = computed(() => !Object.keys(validationErrors.value).length && !store.calendarSaving && !store.calendarDeleting)

function fieldMessage(key) {
  if (!attempted.value && !validationErrors.value[key]) return ''
  return validationErrors.value[key] || ''
}

function buildPayload(values = form) {
  return {
    tax_year: Number(values.tax_year),
    regime: values.regime,
    tax_type: values.tax_type,
    period_code: String(values.period_code).trim(),
    period_start: values.period_start,
    period_end: values.period_end,
    declaration_due_date: values.declaration_due_date,
    payment_due_date: values.payment_due_date,
    payment_year: Number(values.payment_year),
    sequence: Number(values.sequence),
    is_active: values.is_active !== false,
    notes: String(values.notes || '').trim() || null
  }
}

function responseMessage(result, fallback) {
  const detail = result?.detail ?? result?.error?.response?.data?.detail
  if (Array.isArray(detail)) return detail.map((item) => item.msg || item.detail || String(item)).join(' · ')
  if (detail && typeof detail === 'object') return detail.msg || detail.detail || fallback
  return detail || fallback
}

async function handleSave() {
  attempted.value = true
  saveError.value = ''
  if (!canSave.value) return

  const regime = visibleRegime.value === 'all' ? null : visibleRegime.value
  const result = await store.saveCalendarPeriod(
    buildPayload(),
    editingPeriod.value?.id_tax_calendar_period || null,
    regime
  )
  if (result.ok) {
    selectedYear.value = Number(form.tax_year)
    closeEditor()
    feedbackKind.value = result.reloaded === false ? 'warning' : 'success'
    feedback.value = result.reloaded === false
      ? 'Período guardado, pero no fue posible recargar el catálogo.'
      : 'Período guardado y catálogo recargado.'
    return
  }
  saveError.value = responseMessage(result, result.kind === 'forbidden'
    ? 'No tienes permisos para editar el calendario.'
    : 'No fue posible guardar el período.')
}

async function refreshCalendar() {
  feedback.value = ''
  store.error = null
  const regime = visibleRegime.value === 'all' ? null : visibleRegime.value
  await store.loadCalendar(Number(selectedYear.value), regime)
}

async function handleDelete() {
  if (!deletingPeriod.value || store.calendarDeleting) return
  deleteError.value = ''

  const regime = visibleRegime.value === 'all' ? null : visibleRegime.value
  const result = await store.deleteCalendarPeriod(
    deletingPeriod.value.id_tax_calendar_period,
    Number(selectedYear.value),
    regime
  )

  if (result.ok) {
    closeDelete()
    feedbackKind.value = result.reloaded === false ? 'warning' : 'success'
    feedback.value = result.reloaded === false
      ? 'Período eliminado, pero no fue posible recargar el catálogo.'
      : 'Período eliminado y catálogo recargado.'
    return
  }

  if (result.kind !== 'busy') {
    deleteError.value = responseMessage(result, result.kind === 'forbidden'
      ? 'No tienes permisos para eliminar el período.'
      : 'No fue posible eliminar el período.')
  }
}

async function changeContext() {
  if (calendarBusy.value) return
  await refreshCalendar()
}

function firstDayISO(year, month) {
  return `${year}-${String(month).padStart(2, '0')}-01`
}

function lastDayISO(year, month) {
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function draftNote() {
  return 'Borrador generado por la herramienta. Validar las fechas de declaración y pago antes de usarlo.'
}

function openGenerate() {
  if (!canEdit.value || calendarBusy.value) return
  const year = Number(selectedYear.value)
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    feedbackKind.value = 'error'
    feedback.value = 'Indica un año fiscal válido antes de generar el borrador.'
    return
  }
  generateRows.value = Array.from({ length: 6 }, (_, index) => {
    const startMonth = index * 2 + 1
    return {
      tax_year: year,
      regime: 'simple',
      tax_type: 'simple',
      period_code: `B${index + 1}`,
      period_start: firstDayISO(year, startMonth),
      period_end: lastDayISO(year, startMonth + 1),
      declaration_due_date: '',
      payment_due_date: '',
      payment_year: '',
      sequence: index + 1,
      notes: draftNote(),
      is_active: true
    }
  })
  generateRows.value.push({
    tax_year: year,
    regime: 'ordinary',
    tax_type: 'income_ordinary',
    period_code: 'ANUAL',
    period_start: firstDayISO(year, 1),
    period_end: lastDayISO(year, 12),
    declaration_due_date: '',
    payment_due_date: '',
    payment_year: '',
    sequence: 7,
    notes: draftNote(),
    is_active: true
  })
  generateError.value = ''
  generateOpen.value = true
}

const generateInvalid = computed(() => generateRows.value.some((row) => Object.keys(fieldErrors(row)).length))

function closeGenerate() {
  if (generating.value) return
  generateOpen.value = false
}

async function confirmGenerate() {
  if (generateInvalid.value || generating.value) return
  generating.value = true
  generateError.value = ''
  try {
    for (const row of generateRows.value) {
      const result = await store.saveCalendarPeriod(buildPayload(row), null, null)
      if (!result.ok) {
        generateError.value = responseMessage(result, 'No fue posible crear el borrador.')
        return
      }
    }
    const year = Number(generateRows.value[0]?.tax_year)
    selectedYear.value = year
    visibleRegime.value = 'all'
    await store.loadCalendar(year, null)
    generateOpen.value = false
    feedbackKind.value = 'success'
    feedback.value = `Borrador ${year} creado. Las fechas de vencimiento fueron ingresadas por ti y quedan editables.`
  } finally {
    generating.value = false
  }
}

function taxTypeLabel(value) {
  return TAX_TYPES.find((type) => type.value === value)?.label || value || 'Sin configurar'
}

function regimeLabel(value) {
  return value === 'simple' ? 'SIMPLE' : value === 'ordinary' ? 'Ordinario' : 'Compartido'
}

function rowStatus(row) {
  if (String(row.notes || '').startsWith('Borrador generado')) return 'Borrador'
  if (row.is_active === false) return 'Inactivo'
  if (!row.declaration_due_date || !row.payment_due_date || !row.payment_year) return 'Borrador / incompleto'
  return 'Configurado'
}

function onOverlayMousedown(event, close) {
  if (event.target === event.currentTarget) close()
}

const focusableSelector =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

function onGlobalKeydown(event) {
  const dialog = editorOpen.value
    ? editorDialogRef.value
    : generateOpen.value
      ? generateDialogRef.value
      : deleteOpen.value
        ? deleteDialogRef.value
        : null
  if (!dialog) return
  if (event.key === 'Escape') {
    event.preventDefault()
    if (editorOpen.value) closeEditor()
    else if (generateOpen.value) closeGenerate()
    else closeDelete()
    return
  }
  if (event.key !== 'Tab') return
  const focusables = dialog.querySelectorAll(focusableSelector)
  if (!focusables.length) return
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  if (!dialog.contains(document.activeElement)) {
    event.preventDefault()
    first.focus()
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

watch(editorOpen, async (open) => {
  if (open) {
    await nextTick()
    editorDialogRef.value?.focus()
  }
})

watch(generateOpen, async (open) => {
  if (open) {
    await nextTick()
    generateDialogRef.value?.focus()
  }
})

watch(deleteOpen, async (open) => {
  if (open) {
    await nextTick()
    deleteCancelButtonRef.value?.focus()
  }
})

onMounted(async () => {
  window.addEventListener('keydown', onGlobalKeydown)
  await refreshCalendar()
})

onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKeydown))
</script>

<template>
  <section class="tax-card calendar-card">
    <div class="tax-section-heading">
      <div>
        <span class="eyebrow">Calendario tributario</span>
        <h2>Causación, declaración y caja</h2>
        <p class="tax-note">Administra períodos del catálogo. Las fechas deben ser validadas por el responsable tributario.</p>
      </div>
      <div class="tax-form-actions">
        <button type="button" class="btn btn-secondary" :disabled="calendarBusy" @click="refreshCalendar">
          {{ store.calendarLoading ? 'Cargando…' : 'Actualizar' }}
        </button>
        <button v-if="canEdit" type="button" class="btn btn-secondary" :disabled="calendarBusy" @click="openGenerate">
          Generar borrador {{ selectedYear }}
        </button>
        <button v-if="canEdit" type="button" class="btn btn-primary" :disabled="calendarBusy" @click="openCreate">
          Nuevo periodo
        </button>
      </div>
    </div>

    <div class="calendar-toolbar">
      <label>
        Año fiscal
        <input v-model.number="selectedYear" type="number" min="2000" max="2100" :disabled="calendarBusy" @change="changeContext">
      </label>
      <label>
        Régimen visible
        <select v-model="visibleRegime" :disabled="calendarBusy" @change="changeContext">
          <option value="all">Todos</option>
          <option value="ordinary">Ordinario</option>
          <option value="simple">SIMPLE</option>
        </select>
      </label>
      <span v-if="!canEdit" class="calendar-readonly">Vista de solo lectura</span>
    </div>

    <p v-if="feedback" class="tax-feedback" :class="`tax-feedback-${feedbackKind}`" role="status">{{ feedback }}</p>
    <div v-if="store.error && !store.calendarLoading" class="calendar-error" role="alert">
      <strong>No fue posible cargar el catálogo.</strong>
      <span>{{ responseMessage({ detail: store.error }, 'Revisa la conexión e inténtalo de nuevo.') }}</span>
      <button type="button" class="btn btn-secondary" @click="refreshCalendar">Reintentar</button>
    </div>
    <div v-else-if="store.calendarLoading" class="calendar-loading" aria-live="polite">Cargando calendario…</div>
    <div v-else-if="!rows.length" class="tax-empty">
      <strong>Sin configurar</strong>
      <span>No hay períodos para este filtro. {{ canEdit ? 'Puedes crear uno o generar un borrador.' : '' }}</span>
    </div>
    <div v-else class="table-wrap">
      <table class="crm-table calendar-table">
        <caption class="sr-only">Períodos tributarios del año {{ selectedYear }}</caption>
        <thead>
          <tr>
            <th>Régimen</th><th>Impuesto</th><th>Periodo</th><th>Inicio</th><th>Fin</th>
            <th>Declaración</th><th>Pago</th><th>Año pago</th><th>Sec.</th><th>Estado</th>
            <th v-if="canEdit">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id_tax_calendar_period">
            <td>{{ regimeLabel(row.regime) }}</td>
            <td>{{ taxTypeLabel(row.tax_type) }}</td>
            <td>{{ row.period_code || 'Sin configurar' }}</td>
            <td>{{ row.period_start }}</td>
            <td>{{ row.period_end }}</td>
            <td>{{ row.declaration_due_date || 'Pendiente' }}</td>
            <td>{{ row.payment_due_date || 'Pendiente' }}</td>
            <td>{{ row.payment_year || 'Pendiente' }}</td>
            <td>{{ row.sequence }}</td>
            <td><span class="status-pill" :class="{ warning: rowStatus(row) !== 'Configurado' }">{{ rowStatus(row) }}</span></td>
            <td v-if="canEdit">
              <div class="calendar-row-actions">
                <button type="button" class="calendar-edit-button" :disabled="calendarBusy" @click="openEdit(row)">Editar</button>
                <button type="button" class="calendar-edit-button" :disabled="calendarBusy" @click="openDuplicate(row)">Duplicar</button>
                <button type="button" class="calendar-edit-button calendar-delete-button" :disabled="calendarBusy" @click="openDelete(row)">Eliminar</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="tax-note"><strong>SIMPLE:</strong> normalmente se configura por períodos. <strong>Ordinario:</strong> puede configurarse como período anual. Las fechas del catálogo no sustituyen una validación legal.</p>

    <div v-if="editorOpen" class="calendar-overlay" @mousedown="onOverlayMousedown($event, closeEditor)">
      <div ref="editorDialogRef" class="calendar-dialog" role="dialog" aria-modal="true" aria-labelledby="calendar-editor-title" tabindex="-1">
        <header class="calendar-dialog-header">
          <div>
            <h3 id="calendar-editor-title">{{ isEdit ? 'Editar periodo tributario' : duplicatingPeriod ? 'Duplicar periodo tributario' : 'Nuevo periodo tributario' }}</h3>
            <p>Todos los campos obligatorios pertenecen al catálogo tributario.</p>
          </div>
          <button type="button" class="calendar-close" :disabled="store.calendarSaving" aria-label="Cerrar ventana" @click="closeEditor">×</button>
        </header>
        <form class="calendar-dialog-body" @submit.prevent="handleSave">
          <div class="calendar-form-grid">
            <label>Año fiscal<input v-model.number="form.tax_year" type="number" min="2000" max="2100" :aria-invalid="Boolean(fieldMessage('tax_year'))" :disabled="store.calendarSaving"></label>
            <label>Régimen<select v-model="form.regime" :disabled="store.calendarSaving"><option value="ordinary">Ordinario</option><option value="simple">SIMPLE</option></select></label>
            <label>Tipo de impuesto<select v-model="form.tax_type" :disabled="store.calendarSaving"><option v-for="type in TAX_TYPES" :key="type.value" :value="type.value">{{ type.label }}</option></select></label>
            <label>Código del período<input v-model="form.period_code" maxlength="30" placeholder="Ej. B1 o ANUAL" :disabled="store.calendarSaving"></label>
            <label>Inicio<input v-model="form.period_start" type="date" :disabled="store.calendarSaving"></label>
            <label>Fin<input v-model="form.period_end" type="date" :disabled="store.calendarSaving"></label>
            <label>Vencimiento de declaración<input v-model="form.declaration_due_date" type="date" :disabled="store.calendarSaving"></label>
            <label>Vencimiento de pago<input v-model="form.payment_due_date" type="date" :disabled="store.calendarSaving"></label>
            <label>Año de pago<input v-model.number="form.payment_year" type="number" min="2000" max="2200" :disabled="store.calendarSaving"></label>
            <label>Secuencia<input v-model.number="form.sequence" type="number" min="1" step="1" :disabled="store.calendarSaving"></label>
          </div>
          <template v-if="attempted">
            <p v-for="(message, key) in validationErrors" :key="key" class="calendar-field-error" role="alert">{{ message }}</p>
          </template>
          <label class="calendar-notes-label">Notas<textarea v-model="form.notes" maxlength="500" rows="3" placeholder="Indica supuestos o pendientes de validación" :disabled="store.calendarSaving"></textarea></label>
          <label class="calendar-check"><input v-model="form.is_active" type="checkbox" :disabled="store.calendarSaving"> Periodo activo</label>
          <p class="calendar-form-help">No se calculan ni se presuponen fechas legales. Revisa declaración, pago y año de pago antes de guardar.</p>
          <p v-if="saveError" class="calendar-error" role="alert">{{ saveError }}</p>
          <footer class="calendar-dialog-footer">
            <button type="button" class="btn btn-secondary" :disabled="store.calendarSaving" @click="closeEditor">Cancelar</button>
            <button type="submit" class="btn btn-primary" :disabled="!canSave">
              {{ store.calendarSaving ? 'Guardando…' : 'Guardar periodo' }}
            </button>
          </footer>
        </form>
      </div>
    </div>

    <div v-if="generateOpen" class="calendar-overlay" @mousedown="onOverlayMousedown($event, closeGenerate)">
      <div ref="generateDialogRef" class="calendar-dialog calendar-dialog-wide" role="dialog" aria-modal="true" aria-labelledby="calendar-generate-title" tabindex="-1">
        <header class="calendar-dialog-header">
          <div>
            <span class="status-pill warning">Borrador editable</span>
            <h3 id="calendar-generate-title">Borrador de calendario {{ generateRows[0]?.tax_year }}</h3>
            <p>Se proponen seis períodos bimestrales SIMPLE y un período anual de renta ordinaria. No se incluyen fechas legales oficiales.</p>
          </div>
          <button type="button" class="calendar-close" :disabled="generating" aria-label="Cerrar ventana" @click="closeGenerate">×</button>
        </header>
        <div class="calendar-dialog-body">
          <div class="draft-grid draft-grid-head" aria-hidden="true"><span>Régimen / período</span><span>Inicio</span><span>Fin</span><span>Declaración</span><span>Pago</span><span>Año pago</span></div>
          <div v-for="(row, index) in generateRows" :key="`${row.regime}-${row.period_code}`" class="draft-grid">
            <div><strong>{{ regimeLabel(row.regime) }}</strong><span>{{ row.period_code }} · {{ taxTypeLabel(row.tax_type) }}</span></div>
            <input v-model="row.period_start" type="date" :disabled="generating" :aria-label="`Inicio ${index + 1}`">
            <input v-model="row.period_end" type="date" :disabled="generating" :aria-label="`Fin ${index + 1}`">
            <input v-model="row.declaration_due_date" type="date" :disabled="generating" :aria-label="`Vencimiento de declaración ${index + 1}`">
            <input v-model="row.payment_due_date" type="date" :disabled="generating" :aria-label="`Vencimiento de pago ${index + 1}`">
            <input v-model.number="row.payment_year" type="number" min="2000" max="2200" :disabled="generating" :aria-label="`Año de pago ${index + 1}`">
          </div>
          <p class="calendar-form-help">Las fechas de declaración y pago, y el año de pago, están vacíos intencionalmente: complétalos con información validada.</p>
          <p v-if="generateInvalid" class="calendar-field-error" role="alert">Completa todas las fechas de vencimiento y años de pago; cada rango debe ser válido.</p>
          <p v-if="generateError" class="calendar-error" role="alert">{{ generateError }}</p>
        </div>
        <footer class="calendar-dialog-footer">
          <button type="button" class="btn btn-secondary" :disabled="generating" @click="closeGenerate">Cancelar</button>
          <button type="button" class="btn btn-primary" :disabled="generateInvalid || generating" @click="confirmGenerate">
            {{ generating ? 'Creando borrador…' : `Crear borrador ${generateRows[0]?.tax_year ?? ''}` }}
          </button>
        </footer>
      </div>
    </div>

    <div v-if="deleteOpen" class="calendar-overlay" @mousedown="onOverlayMousedown($event, closeDelete)">
      <div
        ref="deleteDialogRef"
        class="calendar-dialog calendar-delete-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="calendar-delete-title"
        aria-describedby="calendar-delete-description"
        tabindex="-1"
      >
        <header class="calendar-dialog-header">
          <div>
            <h3 id="calendar-delete-title">Eliminar periodo tributario</h3>
            <p id="calendar-delete-description">Esta acción es irreversible. Confirma que deseas eliminar este período del catálogo.</p>
          </div>
          <button type="button" class="calendar-close" :disabled="store.calendarDeleting" aria-label="Cerrar confirmación" @click="closeDelete">×</button>
        </header>
        <div class="calendar-dialog-body">
          <p class="calendar-delete-summary">
            <strong>{{ deletingPeriod?.period_code || 'Sin código' }}</strong>
            <span>{{ regimeLabel(deletingPeriod?.regime) }} · {{ deletingPeriod?.tax_year || 'Sin año' }}</span>
          </p>
          <p v-if="deleteError" class="calendar-error" role="alert" aria-live="assertive">{{ deleteError }}</p>
        </div>
        <footer class="calendar-dialog-footer">
          <button ref="deleteCancelButtonRef" type="button" class="btn btn-secondary" :disabled="store.calendarDeleting" @click="closeDelete">Cancelar</button>
          <button type="button" class="btn btn-danger" :disabled="store.calendarDeleting" @click="handleDelete">
            {{ store.calendarDeleting ? 'Eliminando…' : 'Sí, eliminar' }}
          </button>
        </footer>
      </div>
    </div>
  </section>
</template>

<style scoped>
.calendar-card { position: relative; }
.calendar-toolbar { display: flex; flex-wrap: wrap; gap: 16px; align-items: end; padding: 14px 16px; margin-bottom: 18px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-surface); }
.calendar-toolbar label { display: flex; flex-direction: column; gap: 6px; color: var(--color-text-secondary); font-size: 12px; font-weight: 600; }
.calendar-toolbar input, .calendar-toolbar select, .calendar-dialog input, .calendar-dialog select, .calendar-dialog textarea { box-sizing: border-box; min-width: 0; margin: 0; padding: 8px 10px; border: 1px solid var(--color-border-strong); border-radius: 7px; background: var(--color-surface); color: var(--color-text-primary); font: inherit; }
.calendar-toolbar input, .calendar-toolbar select { width: 150px; }
.calendar-toolbar input:focus, .calendar-toolbar select:focus, .calendar-dialog input:focus, .calendar-dialog select:focus, .calendar-dialog textarea:focus { outline: 2px solid var(--color-brand); outline-offset: 2px; }
.calendar-readonly { margin-left: auto; color: var(--color-text-tertiary); font-size: 12px; }
.calendar-table { min-width: 1180px !important; }
.calendar-table td, .calendar-table th { vertical-align: middle; }
.calendar-row-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.calendar-edit-button { padding: 6px 10px; border: 1px solid var(--color-border-strong); border-radius: 6px; background: var(--color-surface); color: var(--color-brand); cursor: pointer; font: inherit; font-size: 12px; font-weight: 600; }
.calendar-edit-button:hover:not(:disabled) { background: var(--color-brand-light); }
.calendar-delete-button { color: var(--color-danger); }
.calendar-delete-button:hover:not(:disabled) { background: color-mix(in srgb, var(--color-danger) 10%, var(--color-surface)); }
.calendar-edit-button:focus-visible, .calendar-close:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 2px; }
.calendar-loading, .calendar-error { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 16px; border: 1px solid var(--color-border); border-radius: 8px; color: var(--color-text-secondary); font-size: 13px; line-height: 1.5; }
.calendar-error { border-color: color-mix(in srgb, var(--color-danger) 45%, transparent); color: var(--color-danger); }
.calendar-error strong { margin-right: 4px; }
.calendar-overlay { position: fixed; inset: 0; z-index: 1200; display: flex; align-items: center; justify-content: center; padding: 16px; background: var(--background-transparency, rgba(7, 7, 7, .55)); }
.calendar-dialog { display: flex; flex-direction: column; width: min(760px, 96vw); max-height: min(90vh, 860px); overflow: hidden; border: 1px solid var(--color-border); border-radius: 10px; background: var(--color-surface-card); color: var(--color-text-primary); box-shadow: 0 12px 32px rgba(0, 0, 0, .22); animation: calendar-pop .2s cubic-bezier(.23, 1, .32, 1); }
.calendar-dialog-wide { width: min(1120px, 97vw); }
@keyframes calendar-pop { from { opacity: 0; transform: scale(.97) translateY(6px); } to { opacity: 1; transform: scale(1) translateY(0); } }
.calendar-dialog-header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; padding: 18px 20px 14px; border-bottom: 1px solid var(--color-border); }
.calendar-dialog-header h3 { margin: 8px 0 3px; font-size: 18px; font-weight: 600; }
.calendar-dialog-header p { max-width: 760px; margin: 0; color: var(--color-text-secondary); font-size: 12px; line-height: 1.45; }
.calendar-close { flex: 0 0 auto; padding: 4px 8px; border: 0; border-radius: 6px; background: transparent; color: var(--color-text-secondary); cursor: pointer; font-size: 22px; line-height: 1; }
.calendar-close:hover:not(:disabled) { background: var(--color-brand-light); color: var(--color-text-primary); }
.calendar-dialog-body { display: flex; flex-direction: column; gap: 14px; overflow-y: auto; padding: 18px 20px; }
.calendar-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 16px; }
.calendar-form-grid label, .calendar-notes-label { display: flex; flex-direction: column; gap: 6px; color: var(--color-text-secondary); font-size: 12px; font-weight: 600; }
.calendar-form-grid input, .calendar-form-grid select, .calendar-notes-label textarea { width: 100%; }
.calendar-check { display: flex; gap: 8px; align-items: center; color: var(--color-text-secondary); font-size: 13px; }
.calendar-check input { accent-color: var(--color-brand); }
.calendar-field-error { margin: -6px 0 0; color: var(--color-danger); font-size: 12px; font-weight: 600; }
.calendar-form-help { margin: 0; color: var(--color-text-tertiary); font-size: 12px; line-height: 1.45; }
.calendar-dialog-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--color-border); background: var(--color-surface); }
.calendar-delete-dialog { width: min(520px, 96vw); }
.calendar-delete-summary { display: flex; flex-direction: column; gap: 4px; margin: 0; color: var(--color-text-secondary); font-size: 13px; }
.calendar-delete-summary strong { color: var(--color-text-primary); font-size: 16px; }
.draft-grid { display: grid; grid-template-columns: 1.4fr repeat(5, minmax(105px, 1fr)); gap: 8px; align-items: center; }
.draft-grid > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; font-size: 12px; }
.draft-grid > div span { color: var(--color-text-tertiary); font-size: 11px; }
.draft-grid-head { color: var(--color-text-secondary); font-size: 11px; font-weight: 700; text-transform: uppercase; }
.draft-grid input { width: 100%; font-size: 12px; }
@media (prefers-reduced-motion: reduce) { .calendar-dialog { animation: none; } }
@media (max-width: 760px) { .tax-section-heading { align-items: stretch; } .calendar-readonly { margin-left: 0; } .calendar-form-grid { grid-template-columns: 1fr; } .draft-grid { min-width: 900px; } .calendar-dialog-body { overflow-x: auto; } }
</style>
