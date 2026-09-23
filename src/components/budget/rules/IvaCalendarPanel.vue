<script setup>
/**
 * IvaCalendarPanel — Calendario de liquidación de IVA (FE-S14-IVA §5; panel
 * del tab 'iva' de `BudgetRulesView`; autoridad del contrato:
 * `backend.02_20` §3.2/§5.2/§5.8).
 *
 * Espejo de forma de `InternmentPanel`/`PayableTermsPanel`: catálogo de
 * compañía VIVO — el CRUD jamás toca escenarios. El calendario es POR AÑO
 * (D-FE14-5: dato de compañía, no de escenario): selector de año + tabla
 * CRUD de períodos (`period_no`, `date_from`, `date_to`,
 * `payment_due_date`, `description`) con:
 *  - validaciones AMABLES pre-red (espejo del esquema BE §5.2): entero 1–36,
 *    fechas obligatorias, `date_to >= date_from` (el `model_validator` del
 *    BE respondería 422 — aquí se bloquea inline SIN request), vencimiento
 *    obligatorio;
 *  - 400 duplicado `"Period {n} already exists for year {y}"` ⇒ se pinta el
 *    `detail` LITERAL del backend inline en el modal (convenio FE-S10 §2.1
 *    heredado: es mensaje pensado para el usuario);
 *  - 404 ⇒ toast "El período ya no existe." + refetch forzado del año;
 *  - botón "Generar bimestres" (D-FE14-5/A-4): default SOLO de UI — pre
 *    visualiza 6 filas ene–feb … nov–dic del año con vencimiento por defecto
 *    (día 21 del tercer mes siguiente al cierre del bimestre, patrón del
 *    fixture AC-BE10-4: P1 ene–feb ⇒ 21/05) EDITABLE ANTES de enviar; la
 *    confirmación encadena los 6 POST normales en secuencia (el backend NO
 *    seedea; un fallo corta la cadena y muestra el error).
 *
 * Badge de sincronización: tras cada mutación exitosa, la acción del store
 * notifica al `budgetPlanningStore` (AC-FE14-6: la pestaña Liquidación y el
 * bloque del Flujo de un escenario abierto se refrescan vivas vía su
 * debounce); este panel lo comunica con el chip "Sincronizado".
 *
 * Emite NADA: el panel se basta del store (el padre solo monta/desmonta).
 */
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useBudgetRulesStore } from '@/stores/budgetRulesStore.js'
import { alertService } from '@/services/alertService.js'
import { buildYearOptions, formatDateEs } from '@/components/budget/planning/planningFormat.js'

const budgetRulesStore = useBudgetRulesStore()

/* ───────────────────────────── literales es-CO ───────────────────────────── */

const PANEL_TITLE = 'Calendario de liquidación de IVA'
const PANEL_SUBTITLE =
  'Ranges y vencimientos de la liquidación (bimestral u otra periodicidad) por año fiscal. ' +
  'Es dato de compañía: todos los escenarios del año comparten calendario y su pestaña ' +
  '“Liquidación” lo usa para asignar eventos y proyectar los pagos.'
const GENERATE_LABEL = 'Generar bimestres'
const SAVE_ERROR_VALIDATION = 'Revisa los valores marcados.'
const SAVE_ERROR_GENERIC = 'No se pudo guardar. Reintenta.'
const PERIOD_GONE_TOAST = 'El período ya no existe. La tabla se actualizó.'
const DELETE_CONFIRM_TEXT =
  'Los eventos de liquidación del escenario que caían en este período pasarán al bucket ' +
  '“fuera de calendario” y el pago proyectado puede cambiar. No se modifica ninguna línea.'

/* ───────────────────────────── selector de año ───────────────────────────── */

const yearOptions = buildYearOptions()
const selectedYear = ref(new Date().getFullYear())

/** Períodos del año seleccionado, en orden BE (`period_no` ASC). */
const yearPeriods = computed(() => {
  const rows = budgetRulesStore.ivaPeriods.filter((item) => item.period_year === selectedYear.value)
  return rows.sort((a, b) => Number(a.period_no) - Number(b.period_no))
})

/** ¿La caché del store vale para el año mostrado? (guard de parpadeo). */
const showingYear = computed(
  () => budgetRulesStore.ivaPeriodsYear === selectedYear.value && budgetRulesStore.ivaPeriodsLoaded
)

/* ───────────────────────────── carga (lazy) ───────────────────────────── */

function ensureYear(force = false) {
  if (force) {
    void budgetRulesStore.fetchIvaPeriods(selectedYear.value, true)
    return
  }
  if (!showingYear.value && !budgetRulesStore.loading.ivaPeriods) {
    void budgetRulesStore.fetchIvaPeriods(selectedYear.value)
  }
}

watch(selectedYear, () => {
  editorOpen.value = false
  generateOpen.value = false
  ensureYear()
})

onMounted(() => {
  ensureYear()
})

/** Carga inicial / fetch en vuelo (patrón placeholder de los paneles hermanos). */
const catalogLoading = computed(
  () => !showingYear.value && (budgetRulesStore.loading.ivaPeriods || !budgetRulesStore.ivaPeriodsLoaded)
)

/* ───────────────────────────── helpers de fecha ───────────────────────────── */

/**
 * Último día de `month` (1–12) de `year` en ISO `YYYY-MM-DD` (bisiestos
 * correctos vía `Date.UTC(y, m, 0)` — jamás `toISOString()`, patrón
 * `monthEndOf` del Flujo).
 */
function lastDayISO(year, month) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`
}

/** Primer día de `month` (1–12) de `year` en ISO. */
function firstDayISO(year, month) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`
}

/**
 * Vencimiento default de un bimestre que cierra en `endMonth` (1–12): día 21
 * del TERCER mes siguiente al de cierre (ene–feb cierra en feb ⇒ 21/05;
 * nov–dic cierra en dic ⇒ 21/03 del año SIGUIENTE) — el patrón del fixture
 * AC-BE10-4. Editable antes de enviar (A-4: default SOLO de UI).
 */
function defaultDueDate(year, endMonth) {
  let dueYear = year
  let dueMonth = endMonth + 3
  if (dueMonth > 12) {
    dueYear += 1
    dueMonth -= 12
  }
  return `${String(dueYear).padStart(4, '0')}-${String(dueMonth).padStart(2, '0')}-21`
}

/* ───────────────────────────── busy (dueño: store) ───────────────────────────── */

const anySaving = computed(() => Object.keys(budgetRulesStore.ivaPeriodSaving).length > 0)

/* ───────────────────────────── modal crear/editar ───────────────────────────── */

const editorOpen = ref(false)
/** `null` ⇒ creación; período completo ⇒ edición (PUT = reemplazo total). */
const editingPeriod = ref(null)
/** Estado del formulario SIEMPRE strings (los `input type=date` usan ISO). */
const form = reactive({ periodNo: '', dateFrom: '', dateTo: '', dueDate: '', description: '' })
const attempted = ref(false)
const saveError = ref('')

const isEdit = computed(() => Boolean(editingPeriod.value))
const savingKey = computed(() => (isEdit.value ? editingPeriod.value.id_iva_period : 'new'))
const busy = computed(() => Boolean(budgetRulesStore.ivaPeriodSaving[savingKey.value]))
const editorTitle = computed(() =>
  isEdit.value ? 'Editar período de liquidación' : 'Nuevo período de liquidación'
)

/* --------------------------- validación local PRE-red --------------------------- */

const PERIOD_REQUIRED_MSG = 'El número de período es obligatorio.'
const PERIOD_RANGE_MSG = 'El número debe ser un entero entre 1 y 36.'
const DATE_FROM_MSG = 'La fecha “desde” es obligatoria.'
const DATE_TO_MSG = 'La fecha “hasta” es obligatoria.'
const RANGE_MSG = 'El rango es inválido: “hasta” no puede ser anterior a “desde”.'
const DUE_MSG = 'La fecha de vencimiento es obligatoria.'

const periodNumber = computed(() => {
  const raw = String(form.periodNo).trim()
  if (!raw) return Number.NaN
  return Number(raw)
})

const periodError = computed(() => {
  if (!Number.isFinite(periodNumber.value)) return PERIOD_REQUIRED_MSG
  if (!Number.isInteger(periodNumber.value) || periodNumber.value < 1 || periodNumber.value > 36) {
    return PERIOD_RANGE_MSG
  }
  return ''
})

/** Espejo del `model_validator` BE (`date_to >= date_from` ⇒ 422). */
const rangeError = computed(() => {
  if (!form.dateFrom) return DATE_FROM_MSG
  if (!form.dateTo) return DATE_TO_MSG
  if (form.dateTo < form.dateFrom) return RANGE_MSG
  return ''
})

const dueError = computed(() => (form.dueDate ? '' : DUE_MSG))

/** Los "obligatorio" solo tras intento; el resto (formato/rango) EN VIVO. */
const periodMessage = computed(() =>
  periodError.value === PERIOD_REQUIRED_MSG && !attempted.value ? '' : periodError.value
)
const rangeMessage = computed(() => {
  if (rangeError.value === DATE_FROM_MSG && !form.dateTo && !attempted.value) return ''
  if (rangeError.value === DATE_TO_MSG && !attempted.value && !form.dateFrom) return ''
  return rangeError.value
})
const dueMessage = computed(() => (dueError.value && !attempted.value ? '' : dueError.value))

const canSave = computed(
  () => editorOpen.value && !busy.value && !periodError.value && !rangeError.value && !dueError.value
)

function buildPayload() {
  const payload = {
    period_year: selectedYear.value,
    period_no: periodNumber.value,
    date_from: form.dateFrom,
    date_to: form.dateTo,
    payment_due_date: form.dueDate
  }
  const description = form.description.trim()
  if (description) payload.description = description
  return payload
}

function openCreate() {
  if (anySaving.value) return
  editingPeriod.value = null
  Object.assign(form, { periodNo: '', dateFrom: '', dateTo: '', dueDate: '', description: '' })
  attempted.value = false
  saveError.value = ''
  editorOpen.value = true
}

function openEdit(period) {
  if (anySaving.value) return
  editingPeriod.value = period
  Object.assign(form, {
    periodNo: String(period.period_no ?? ''),
    dateFrom: period.date_from ?? '',
    dateTo: period.date_to ?? '',
    dueDate: period.payment_due_date ?? '',
    description: period.description ?? ''
  })
  attempted.value = false
  saveError.value = ''
  editorOpen.value = true
}

function closeEditor() {
  if (busy.value) return
  editorOpen.value = false
  editingPeriod.value = null
}

function onEditorOverlayMousedown(event) {
  if (event.target === event.currentTarget) closeEditor()
}

async function handleSave() {
  attempted.value = true
  saveError.value = ''
  if (!canSave.value) return

  const result = isEdit.value
    ? await budgetRulesStore.updateIvaPeriod(editingPeriod.value.id_iva_period, buildPayload())
    : await budgetRulesStore.createIvaPeriod(buildPayload())

  if (result.ok) {
    alertService.generalSucces('Período guardado. La Liquidación de los escenarios abiertos se recalcula.')
    closeEditor()
    return
  }
  applySaveError(result)
}

/**
 * Mapeo de errores (espejo `applyRateSaveError` de FE-S10 §2.1/§3.3):
 *  400 duplicado ⇒ `detail` LITERAL del backend (mensaje amable exigido por
 *  §5.8, se pinta tal cual); 422 ⇒ banner de revisión (el modal permanece);
 *  404 ⇒ toast + refetch forzoso del año; red/5xx ⇒ banner con datos intactos.
 */
function applySaveError(result) {
  if (result.kind === 'auth' || result.kind === 'busy') return
  if (result.kind === 'validation') {
    saveError.value = SAVE_ERROR_VALIDATION
    return
  }
  if (result.kind === 'notfound') {
    editorOpen.value = false
    editingPeriod.value = null
    alertService.generalError(PERIOD_GONE_TOAST)
    void budgetRulesStore.fetchIvaPeriods(selectedYear.value, true)
    return
  }
  if (typeof result.detail === 'string' && result.detail) {
    saveError.value = result.detail
    return
  }
  saveError.value = SAVE_ERROR_GENERIC
}

/* ───────────────────────────── eliminar (destructivo) ───────────────────────────── */

const deleteTarget = ref(null)
const deleting = computed(() =>
  deleteTarget.value ? Boolean(budgetRulesStore.ivaPeriodSaving[deleteTarget.value.id_iva_period]) : false
)

function openDeleteConfirm(period) {
  if (anySaving.value) return
  deleteTarget.value = period
}

function cancelDelete() {
  if (deleting.value) return
  deleteTarget.value = null
}

function onDeleteOverlayMousedown(event) {
  if (event.target === event.currentTarget) cancelDelete()
}

async function confirmDelete() {
  const period = deleteTarget.value
  if (!period || deleting.value) return
  const result = await budgetRulesStore.deleteIvaPeriod(period.id_iva_period)
  if (result.ok) {
    deleteTarget.value = null
    alertService.generalSucces('Período eliminado.')
    return
  }
  if (result.kind === 'auth' || result.kind === 'busy') return
  if (result.kind === 'notfound') {
    deleteTarget.value = null
    alertService.generalError(PERIOD_GONE_TOAST)
    void budgetRulesStore.fetchIvaPeriods(selectedYear.value, true)
    return
  }
  alertService.generalError('No se pudo eliminar el período. Reintenta.')
}

/* ─────────────────────── generar bimestres (default editable) ─────────────────────── */

const generateOpen = ref(false)
const generating = ref(false)
const generateRows = ref([])
const generateError = ref('')

/**
 * A-4/D-FE14-5: el botón PRE-VISUALIZA las 6 filas ene–feb … nov–dic con
 * rangos derivados del año (bisiesto incluido) y vencimientos por defecto
 * editables ANTES de enviar; la confirmación encadena 6 POST normales
 * (secuencia exigida por el guard `'new'` del store). `period_no` se propone
 * tras los existentes del año (idempotencia amable: regenerar no pisar).
 */
function openGenerate() {
  if (anySaving.value || generating.value) return
  const nextNo =
    yearPeriods.value.reduce((max, item) => Math.max(max, Number(item.period_no) || 0), 0) + 1
  generateRows.value = Array.from({ length: 6 }, (_, i) => {
    const startMonth = i * 2 + 1
    const endMonth = startMonth + 1
    return {
      periodNo: nextNo + i,
      dateFrom: firstDayISO(selectedYear.value, startMonth),
      dateTo: lastDayISO(selectedYear.value, endMonth),
      dueDate: defaultDueDate(selectedYear.value, endMonth),
      description: `Bimestre ${i + 1} (${i + 1}-${i + 2})`
    }
  })
  generateError.value = ''
  generateOpen.value = true
}

function closeGenerate() {
  if (generating.value) return
  generateOpen.value = false
}

function onGenerateOverlayMousedown(event) {
  if (event.target === event.currentTarget) closeGenerate()
}

/** Solo visual: filas con rango inválido (bloquean el envío). */
const generateInvalid = computed(() =>
  generateRows.value.some(
    (row) =>
      !Number.isInteger(Number(row.periodNo)) ||
      Number(row.periodNo) < 1 ||
      Number(row.periodNo) > 36 ||
      !row.dateFrom ||
      !row.dateTo ||
      !row.dueDate ||
      row.dateTo < row.dateFrom
  )
)

async function confirmGenerate() {
  if (generateInvalid.value || generating.value) return
  generating.value = true
  generateError.value = ''
  try {
    for (const row of generateRows.value) {
      const payload = {
        period_year: selectedYear.value,
        period_no: Number(row.periodNo),
        date_from: row.dateFrom,
        date_to: row.dateTo,
        payment_due_date: row.dueDate
      }
      const description = String(row.description ?? '').trim()
      if (description) payload.description = description
      const result = await budgetRulesStore.createIvaPeriod(payload)
      if (!result.ok) {
        // Corta la cadena al primer fallo y lo muestra en el propio modal de
        // generación (400 duplicado ⇒ `detail` LITERAL del backend, §5.8).
        if (result.kind === 'auth' || result.kind === 'busy') return
        if (result.kind === 'validation') generateError.value = SAVE_ERROR_VALIDATION
        else if (typeof result.detail === 'string' && result.detail) {
          generateError.value = result.detail
        } else if (result.kind === 'notfound') {
          generateError.value = PERIOD_GONE_TOAST
          void budgetRulesStore.fetchIvaPeriods(selectedYear.value, true)
        } else generateError.value = SAVE_ERROR_GENERIC
        return
      }
    }
    alertService.generalSucces('Calendario de bimestres creado.')
    generateOpen.value = false
  } finally {
    generating.value = false
  }
}

/* ───────────────────────────── foco atrapado / ESC ───────────────────────────── */

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

const editorDialogRef = ref(null)
const deleteDialogRef = ref(null)
const generateDialogRef = ref(null)

function onGlobalKeydown(event) {
  const deleteOpen = Boolean(deleteTarget.value)
  if (!deleteOpen && !editorOpen.value && !generateOpen.value) return
  if (event.key === 'Escape') {
    if (deleteOpen) cancelDelete()
    else if (generateOpen.value) closeGenerate()
    else closeEditor()
    return
  }
  if (event.key !== 'Tab') return
  const dialog = deleteOpen
    ? deleteDialogRef.value
    : generateOpen.value
      ? generateDialogRef.value
      : editorDialogRef.value
  if (!dialog) return
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

watch(generateOpen, async (open) => {
  if (!open) return
  await nextTick()
  generateDialogRef.value?.focus()
})

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
})
</script>

<template>
  <div class="icp-panel">
    <header class="icp-header">
      <div>
        <h3 class="icp-heading">{{ PANEL_TITLE }}</h3>
        <p class="icp-caption">{{ PANEL_SUBTITLE }}</p>
      </div>
      <!-- Badge de sincronización (AC-FE14-6): el catálogo se propaga vivo a
           la Liquidación de los escenarios abiertos vía el debounce del
           `budgetPlanningStore` (gestionado por las acciones del store). -->
      <span class="icp-sync-chip" title="Los cambios se reflejan en la pestaña “Liquidación” de los escenarios abiertos">
        ⟳ Sincronizado con Liquidación
      </span>
    </header>

    <div class="icp-toolbar">
      <label class="icp-field">
        <span class="icp-label">Año fiscal</span>
        <select v-model.number="selectedYear" class="icp-input">
          <option v-for="year in yearOptions" :key="year" :value="year">{{ year }}</option>
        </select>
      </label>
      <div class="icp-toolbar-actions">
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="anySaving || generating"
          @click="ensureYear(true)"
        >
          Actualizar
        </button>
        <!-- D-FE14-5/A-4: default SOLO de UI; 6 POSTs con vencimientos
             editables ANTES de enviar (el backend no seedea). -->
        <button
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="!showingYear || anySaving || generating"
          @click="openGenerate"
        >
          {{ GENERATE_LABEL }}
        </button>
        <button
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="!showingYear || anySaving"
          @click="openCreate"
        >
          + Añadir período
        </button>
      </div>
    </div>

    <!-- Error de carga (banner rojo + Reintentar, patrón PayableTermsPanel) -->
    <div v-if="budgetRulesStore.loadError.ivaPeriods" class="icp-load-error" role="alert">
      <span>
        No se pudo cargar el calendario de {{ selectedYear }}. Verifique su conexión e inténtelo
        de nuevo.
      </span>
      <button
        type="button"
        class="btn btn-secondary btn-sm"
        @click="budgetRulesStore.fetchIvaPeriods(selectedYear, true)"
      >
        Reintentar
      </button>
    </div>

    <div v-else-if="catalogLoading" class="icp-placeholder" aria-live="polite">
      <span class="icp-mini-spinner" aria-hidden="true"></span>
      Cargando calendario de {{ selectedYear }}…
    </div>

    <div v-else class="icp-table-zone">
      <table class="icp-table" :aria-label="`Períodos de liquidación de IVA del año ${selectedYear}`">
        <thead>
          <tr>
            <th class="icp-col-num">N.º</th>
            <th>Desde</th>
            <th>Hasta</th>
            <th>Vencimiento</th>
            <th>Descripción</th>
            <th class="icp-col-actions">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="period in yearPeriods" :key="period.id_iva_period">
            <td class="icp-cell-num">{{ period.period_no }}</td>
            <td class="icp-cell-date">{{ formatDateEs(period.date_from) }}</td>
            <td class="icp-cell-date">{{ formatDateEs(period.date_to) }}</td>
            <td class="icp-cell-date icp-cell-due">{{ formatDateEs(period.payment_due_date) }}</td>
            <td class="icp-cell-desc" :title="period.description || ''">
              {{ period.description || '—' }}
            </td>
            <td>
              <div class="icp-row-actions">
                <button
                  type="button"
                  class="icp-icon-btn"
                  aria-label="Editar período"
                  :disabled="anySaving"
                  @click="openEdit(period)"
                >
                  ✏️
                </button>
                <button
                  type="button"
                  class="icp-icon-btn icp-icon-btn-danger"
                  aria-label="Eliminar período"
                  :disabled="anySaving"
                  @click="openDeleteConfirm(period)"
                >
                  🗑
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="yearPeriods.length === 0" class="icp-empty" aria-live="polite">
        Sin períodos para {{ selectedYear }}: la “Liquidación” de los escenarios de este año
        mostrará el aviso “sin calendario” con su CTA. Use '+ Añadir período' o
        “{{ GENERATE_LABEL }}” para crear el calendario.
      </p>
    </div>

    <!-- ─────────────────── modal crear / editar período ─────────────────── -->
    <div v-if="editorOpen" class="icp-overlay" @mousedown="onEditorOverlayMousedown">
      <div
        ref="editorDialogRef"
        class="icp-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="iva-editor-title"
        tabindex="-1"
      >
        <header class="icp-modal-header">
          <div>
            <h3 id="iva-editor-title" class="icp-title">{{ editorTitle }}</h3>
            <p class="icp-modal-sub">Año fiscal {{ selectedYear }}</p>
          </div>
          <button
            type="button"
            class="icp-x"
            :disabled="busy"
            aria-label="Cerrar ventana"
            @click="closeEditor"
          >
            ✕
          </button>
        </header>

        <form class="icp-body" @submit.prevent="handleSave">
          <div class="icp-modal-field">
            <label class="icp-modal-label" for="icp-period-no">
              N.º de período <span class="icp-required" aria-hidden="true">*</span>
            </label>
            <input
              id="icp-period-no"
              v-model="form.periodNo"
              class="icp-modal-input"
              :class="{ 'is-invalid': Boolean(periodMessage) }"
              type="number"
              min="1"
              max="36"
              step="1"
              :disabled="busy"
              :aria-invalid="periodMessage ? 'true' : 'false'"
            />
            <p v-if="periodMessage" class="icp-field-error" role="alert" aria-live="polite">
              {{ periodMessage }}
            </p>
          </div>

          <div class="icp-modal-row">
            <div class="icp-modal-field">
              <label class="icp-modal-label" for="icp-date-from">
                Desde <span class="icp-required" aria-hidden="true">*</span>
              </label>
              <input
                id="icp-date-from"
                v-model="form.dateFrom"
                class="icp-modal-input"
                :class="{ 'is-invalid': Boolean(rangeMessage) && !form.dateFrom }"
                type="date"
                :disabled="busy"
              />
            </div>
            <div class="icp-modal-field">
              <label class="icp-modal-label" for="icp-date-to">
                Hasta <span class="icp-required" aria-hidden="true">*</span>
              </label>
              <input
                id="icp-date-to"
                v-model="form.dateTo"
                class="icp-modal-input"
                :class="{ 'is-invalid': rangeMessage === RANGE_MSG || (Boolean(rangeMessage) && !form.dateTo) }"
                type="date"
                :disabled="busy"
              />
            </div>
          </div>
          <p v-if="rangeMessage" class="icp-field-error" role="alert" aria-live="polite">
            {{ rangeMessage }}
          </p>

          <div class="icp-modal-field">
            <label class="icp-modal-label" for="icp-due">
              Vencimiento de pago <span class="icp-required" aria-hidden="true">*</span>
            </label>
            <input
              id="icp-due"
              v-model="form.dueDate"
              class="icp-modal-input"
              :class="{ 'is-invalid': Boolean(dueMessage) }"
              type="date"
              :disabled="busy"
              :aria-invalid="dueMessage ? 'true' : 'false'"
            />
            <p class="icp-help">
              Fecha en la que el pago de la liquidación sale de caja (bloque “Pago de liquidación
              de IVA” de la Vista Flujo).
            </p>
            <p v-if="dueMessage" class="icp-field-error" role="alert" aria-live="polite">
              {{ dueMessage }}
            </p>
          </div>

          <div class="icp-modal-field">
            <label class="icp-modal-label" for="icp-description">Descripción</label>
            <input
              id="icp-description"
              v-model="form.description"
              class="icp-modal-input"
              type="text"
              maxlength="120"
              :disabled="busy"
            />
          </div>

          <p v-if="saveError" class="icp-banner" role="alert" aria-live="polite">{{ saveError }}</p>
        </form>

        <footer class="icp-footer">
          <button type="button" class="btn btn-secondary" :disabled="busy" @click="closeEditor">
            Cancelar
          </button>
          <button
            type="button"
            class="btn btn-primary icp-save"
            :disabled="!canSave"
            @click="handleSave"
          >
            <span v-if="busy" class="icp-spinner" aria-hidden="true"></span>
            {{ busy ? 'Guardando…' : 'Guardar' }}
          </button>
        </footer>
      </div>
    </div>

    <!-- ─────────────────── modal generar bimestres ─────────────────── -->
    <div v-if="generateOpen" class="icp-overlay" @mousedown="onGenerateOverlayMousedown">
      <div
        ref="generateDialogRef"
        class="icp-dialog icp-dialog-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="iva-generate-title"
        tabindex="-1"
      >
        <header class="icp-modal-header">
          <div>
            <h3 id="iva-generate-title" class="icp-title">
              {{ GENERATE_LABEL }} — {{ selectedYear }}
            </h3>
            <p class="icp-modal-sub">
              Revise y ajuste los vencimientos ANTES de enviar: se crearán los 6 períodos con los
              POST normales del catálogo.
            </p>
          </div>
          <button
            type="button"
            class="icp-x"
            :disabled="generating"
            aria-label="Cerrar ventana"
            @click="closeGenerate"
          >
            ✕
          </button>
        </header>

        <div class="icp-body">
          <div class="icp-gen-head" aria-hidden="true">
            <span>N.º</span><span>Desde</span><span>Hasta</span><span>Vencimiento</span>
            <span>Descripción</span>
          </div>
          <div v-for="(row, index) in generateRows" :key="index" class="icp-gen-row">
            <input
              v-model="row.periodNo"
              class="icp-modal-input icp-gen-num"
              type="number"
              min="1"
              max="36"
              step="1"
              aria-label="Número de período"
              :disabled="generating"
            />
            <input v-model="row.dateFrom" class="icp-modal-input" type="date" :disabled="generating" aria-label="Fecha desde" />
            <input v-model="row.dateTo" class="icp-modal-input" type="date" :disabled="generating" aria-label="Fecha hasta" />
            <input v-model="row.dueDate" class="icp-modal-input" type="date" :disabled="generating" aria-label="Vencimiento" />
            <input
              v-model="row.description"
              class="icp-modal-input"
              type="text"
              maxlength="120"
              :disabled="generating"
              aria-label="Descripción"
            />
          </div>
          <p v-if="generateInvalid" class="icp-field-error" role="alert">
            Hay filas inválidas: número entre 1 y 36 y rango “hasta” no anterior a “desde”.
          </p>
          <p v-if="generateError" class="icp-banner" role="alert" aria-live="polite">
            {{ generateError }}
          </p>
        </div>

        <footer class="icp-footer">
          <button type="button" class="btn btn-secondary" :disabled="generating" @click="closeGenerate">
            Cancelar
          </button>
          <button
            type="button"
            class="btn btn-primary icp-save"
            :disabled="generateInvalid || generating"
            @click="confirmGenerate"
          >
            <span v-if="generating" class="icp-spinner" aria-hidden="true"></span>
            {{ generating ? 'Creando…' : `Crear 6 bimestres de ${selectedYear}` }}
          </button>
        </footer>
      </div>
    </div>

    <!-- ─────────────────── confirmación destructiva ─────────────────── -->
    <div v-if="deleteTarget" class="icp-overlay" @mousedown="onDeleteOverlayMousedown">
      <div
        ref="deleteDialogRef"
        class="icp-dialog icp-dialog-narrow"
        role="dialog"
        aria-modal="true"
        aria-labelledby="iva-delete-title"
        tabindex="-1"
      >
        <header class="icp-modal-header">
          <h3 id="iva-delete-title" class="icp-title">Eliminar período de liquidación</h3>
          <button
            type="button"
            class="icp-x"
            :disabled="deleting"
            aria-label="Cerrar ventana"
            @click="cancelDelete"
          >
            ✕
          </button>
        </header>
        <div class="icp-body">
          <p class="icp-delete-summary">
            P.{{ deleteTarget.period_no }} · {{ formatDateEs(deleteTarget.date_from) }} –
            {{ formatDateEs(deleteTarget.date_to) }} · vence
            {{ formatDateEs(deleteTarget.payment_due_date) }}
          </p>
          <p class="icp-delete-warning" role="alert">{{ DELETE_CONFIRM_TEXT }}</p>
        </div>
        <footer class="icp-footer">
          <button type="button" class="btn btn-secondary" :disabled="deleting" @click="cancelDelete">
            Cancelar
          </button>
          <button
            type="button"
            class="btn btn-danger icp-save"
            :disabled="deleting"
            @click="confirmDelete"
          >
            <span v-if="deleting" class="icp-spinner icp-spinner-danger" aria-hidden="true"></span>
            {{ deleting ? 'Eliminando…' : 'Eliminar' }}
          </button>
        </footer>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Mismo lenguaje de paneles de Reglas Financieras (`payable-panel`/`ptm-*` de
   FE-S5/FE-S10), con prefijo icp-* propio. */

.icp-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.icp-header {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
}

.icp-heading {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text-primary, #070707);
}

.icp-caption {
  max-width: 820px;
  margin: 2px 0 0;
  font-size: 0.8rem;
  line-height: 1.45;
  color: var(--color-text-secondary, #555555);
}

.icp-sync-chip {
  padding: 3px 10px;
  border: 1px solid rgba(46, 164, 79, 0.45);
  border-radius: 999px;
  background-color: rgba(46, 164, 79, 0.1);
  font-size: 0.7rem;
  font-weight: 600;
  white-space: nowrap;
  color: #22683a;
}

:root[data-theme='dark'] .icp-sync-chip {
  color: #7bd89a;
}

/* Toolbar */

.icp-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: flex-end;
  padding: 14px 16px;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 8px;
  background-color: var(--color-surface-card, #ffffff);
}

.icp-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.icp-label {
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--color-text-secondary, #555555);
}

.icp-input {
  width: 140px;
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

.icp-input:focus {
  border-color: var(--color-brand, #03658c);
  outline: 2px solid rgba(3, 101, 140, 0.25);
  outline-offset: 0;
}

.icp-toolbar-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

/* Estados */

.icp-load-error {
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

:root[data-theme='dark'] .icp-load-error {
  color: #ff9b9b;
}

.icp-placeholder {
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

.icp-mini-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(120, 120, 120, 0.25);
  border-top-color: var(--color-brand, #03658c);
  border-radius: 50%;
  animation: icp-spin 0.8s linear infinite;
}

/* Tabla */

.icp-table-zone {
  overflow: auto;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 8px;
  background-color: var(--color-surface-card, #ffffff);
}

.icp-table {
  min-width: 760px;
  border: none;
  border-radius: 0;
  overflow: visible;
  box-shadow: none;
}

.icp-col-num {
  width: 70px;
}

.icp-col-actions {
  width: 130px;
}

.icp-cell-num {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.icp-cell-date {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.icp-cell-due {
  font-weight: 600;
}

.icp-cell-desc {
  max-width: 280px;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.icp-row-actions {
  display: flex;
  gap: 6px;
  justify-content: center;
  white-space: nowrap;
}

.icp-icon-btn {
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

.icp-icon-btn:hover:not(:disabled) {
  border-color: var(--color-brand, #03658c);
  background-color: var(--color-brand-light, #d0ebda);
}

.icp-icon-btn:focus-visible {
  outline: 2px solid var(--color-brand, #03658c);
  outline-offset: 1px;
}

.icp-icon-btn:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.icp-icon-btn-danger:hover:not(:disabled) {
  border-color: #c53030;
  background-color: rgba(197, 48, 48, 0.08);
}

.icp-empty {
  margin: 0;
  padding: 26px 16px;
  font-size: 0.85rem;
  color: var(--color-text-muted, #8a8a8a);
  text-align: center;
}

/* ─────────── modales (shell ptm- de los paneles hermanos) ─────────── */

.icp-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background-color: var(--background-transparency, rgba(7, 7, 7, 0.55));
}

.icp-dialog {
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
  animation: icp-pop 0.22s cubic-bezier(0.23, 1, 0.32, 1);
}

.icp-dialog-wide {
  width: min(880px, 96vw);
}

.icp-dialog-narrow {
  width: min(420px, 96vw);
}

@keyframes icp-pop {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(6px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes icp-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .icp-dialog {
    animation: none;
  }

  .icp-mini-spinner,
  .icp-spinner {
    animation-duration: 1.6s;
  }
}

.icp-modal-header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
}

.icp-title {
  margin: 0;
  font-size: 1.02rem;
  font-weight: 600;
  line-height: 1.35;
}

.icp-modal-sub {
  margin: 2px 0 0;
  font-size: 0.78rem;
  color: var(--color-text-muted, #8a8a8a);
}

.icp-x {
  flex-shrink: 0;
  padding: 6px 8px;
  border: none;
  border-radius: 6px;
  background: none;
  font-size: 0.95rem;
  color: var(--color-text-muted, #8a8a8a);
  cursor: pointer;
}

.icp-x:hover:not(:disabled) {
  background-color: rgba(120, 120, 120, 0.12);
  color: var(--color-text-primary, #070707);
}

.icp-x:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.icp-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1;
  padding: 18px 20px;
  overflow-y: auto;
}

.icp-modal-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.icp-modal-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.icp-modal-row .icp-modal-field {
  flex: 1;
  min-width: 180px;
}

.icp-modal-label {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--color-text-primary, #070707);
}

.icp-required {
  color: #c53030;
}

.icp-modal-input {
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

.icp-modal-input:focus {
  border-color: var(--color-brand, #03658c);
  outline: 2px solid rgba(3, 101, 140, 0.25);
  outline-offset: 0;
}

.icp-modal-input.is-invalid {
  border-color: #c53030;
}

.icp-modal-input:disabled {
  color: var(--color-text-muted, #8a8a8a);
}

.icp-help {
  margin: 0;
  font-size: 0.7rem;
  line-height: 1.45;
  color: var(--color-text-muted, #8a8a8a);
}

.icp-field-error {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 500;
  line-height: 1.4;
  color: #c53030;
}

:root[data-theme='dark'] .icp-field-error {
  color: #ff9b9b;
}

.icp-banner {
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
  overflow-wrap: anywhere;
}

:root[data-theme='dark'] .icp-banner {
  color: #ff9b9b;
}

.icp-footer {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding: 14px 20px;
  border-top: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  background-color: var(--color-surface, #f7f7f7);
}

:root[data-theme='dark'] .icp-footer {
  background-color: rgba(255, 255, 255, 0.03);
}

.icp-save {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}

.icp-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(120, 120, 120, 0.25);
  border-top-color: var(--color-brand, #03658c);
  border-radius: 50%;
  animation: icp-spin 0.8s linear infinite;
}

.icp-spinner-danger {
  border-color: rgba(255, 255, 255, 0.35);
  border-top-color: var(--text-white, #eeeeee);
}

/* Generador de bimestres */

.icp-gen-head {
  display: grid;
  grid-template-columns: 64px 1fr 1fr 1fr 1.4fr;
  gap: 8px;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--color-text-secondary, #555555);
}

.icp-gen-row {
  display: grid;
  grid-template-columns: 64px 1fr 1fr 1fr 1.4fr;
  gap: 8px;
  align-items: center;
}

.icp-gen-num {
  text-align: center;
}

.icp-delete-summary {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-primary, #070707);
}

.icp-delete-warning {
  margin: 0;
  padding: 10px 12px;
  border-left: 4px solid var(--red-color, #c21a1a);
  border-radius: 6px;
  background-color: rgba(197, 48, 48, 0.07);
  font-size: 0.82rem;
  line-height: 1.5;
  color: #9b2222;
}

:root[data-theme='dark'] .icp-delete-warning {
  color: #ff9b9b;
}

@media (max-width: 640px) {
  .icp-toolbar-actions {
    margin-left: 0;
  }

  .icp-gen-head,
  .icp-gen-row {
    grid-template-columns: 52px 1fr 1fr 1fr;
  }

  .icp-gen-head span:last-child,
  .icp-gen-row input:last-child {
    display: none;
  }
}
</style>
