<script setup>
/**
 * BudgetIngestionModal — creación del Presupuesto Base (FE-S4 §4/§7).
 *
 * ASM-10 VINCULANTE: se suben los DOS Excel SIIGO "Solicitud de Presupuesto"
 * (Ingresos requerido + Gastos opcional) con el `FileDropZone` EXISTENTE del
 * Centro de Ingesta reutilizado por ruta directa (PQ-F1: el componente no se
 * duplica), `v-model` de `File`, `:maxMb=10` y `datasetKey` propio por zona
 * ('planning-ingresos' / 'planning-gastos'). NO existe matriz importable: la
 * matriz Ene–Dic es presentación de solo lectura en el editor (§8.2).
 *
 * FE-S9-PURCHASES-BODEGA §2.8 (aditivo, helper reemplazado por la Enmienda
 * A-01 §6.3): TERCERA zona opcional "Plan de importaciones" → `file_compras`
 * (layout REAL SIIGO: hoja 1, encabezados en la fila 8, columna Temporada
 * con resolución no bloqueante; una fila = una importación); solo viaja en
 * el multipart si el usuario lo adjunta, y el feedback del 201 añade
 * `Líneas de compra: {lines_purchase} · Total: {formatMoney(total_purchase)}`
 * SOLO si `lines_purchase > 0` (claves con default 0/0.0 en respuestas de
 * backend viejas: sin el 3er archivo el flujo es idéntico a FE-S8).
 *
 * Éxito 201 → toast §7 + `emit('created')` (el dashboard refresca) + cierre.
 * Errores §9: el modal NO se cierra; render estructurados —
 *  missing_cost_centers → lista de chips (máx. 20) + instrucción;
 *  year_mismatch → mensaje con los años encontrados;
 *  duplicate_name → inline bajo el campo Nombre;
 *  422 → inline/banner con el mensaje del backend;
 *  network/5xx → banner con opción de reintentar (el submit conserva datos).
 * No se reutiliza `UploadFeedbackModal`: su API está casada con el estado
 * `budgetUploadStore.feedback` de las 4 tarjetas ETL y no admite la lista
 * `missing_cost_centers`/`found_years` manteniendo el formulario abierto —
 * decisión de "fork local" permitida por FE-S4 §4 (documentada en el reporte).
 *
 * Overlay/foco: mismo patrón de modales del módulo (RateEditorModal):
 * trampa Tab, `Esc`/backdrop solo si no hay subida en vuelo (NFR: "el modal no
 * se cierra con submit en vuelo").
 */
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import FileDropZone from '@/components/budget/upload/FileDropZone.vue'
import { useBudgetPlanningStore } from '@/stores/budgetPlanningStore.js'
import { departmentService } from '@/services/departmentService.js'
import { alertService } from '@/services/alertService.js'
import { buildYearOptions, formatMoney } from '@/components/budget/planning/planningFormat.js'

const props = defineProps({
  open: { type: Boolean, required: true }
})

const emit = defineEmits(['created', 'close'])

const budgetPlanningStore = useBudgetPlanningStore()

const dialogRef = ref(null)
const attempted = ref(false)

/** Archivos en selección (solo viven aquí; el `File` viaja en FormData). */
const files = reactive({
  ingresos: null,
  gastos: null,
  /** FE-S9 §2.8: tercer opcional — "Plan de Importaciones" (`file_compras`). */
  compras: null
})

const form = reactive({
  name: '',
  year: String(new Date().getFullYear() + 1),
  period: 'ANUAL',
  department: ''
})

const nameError = ref('')
const filesError = ref('')
/** @type {null | {kind: string, message?: string, missing_cost_centers?: string[], found_years?: number[]}} */
const serverError = ref(null)

const busy = computed(() => budgetPlanningStore.uploading)

/** Opciones de año §7: default año siguiente, rango año−2..año+5. */
const yearOptions = buildYearOptions()

/* ------------------------------ departamentos ------------------------------ */

const departments = ref([])
const departmentsLoaded = ref(false)

/** Catálogo de departments ya consumido por el CRM (PQ-F2). */
async function loadDepartmentsOnce() {
  if (departmentsLoaded.value || busy.value) return
  departmentsLoaded.value = true
  try {
    const response = await departmentService.getDepartments()
    const rows = Array.isArray(response?.data) ? response.data : []
    departments.value = [...rows].sort((a, b) =>
      String(a.department_name).localeCompare(String(b.department_name), 'es')
    )
  } catch {
    // Silencioso: el select queda con la opción vacía; la carga no se bloquea.
    departmentsLoaded.value = false
  }
}

/* -------------------------------- validación ------------------------------- */

const nameValid = computed(() => form.name.trim().length > 0)
const ingresosValid = computed(() => files.ingresos instanceof File)

const canSubmit = computed(() => nameValid.value && ingresosValid.value && !busy.value)

/** Mensaje inline del año declarado (para el 400 "Rows outside declared year"). */
const declaredYearLabel = computed(() =>
  Number.isFinite(Number(form.year)) ? Number(form.year) : form.year
)

const visibleServerError = computed(() => {
  const error = serverError.value
  if (!error) return null
  if (error.kind === 'year_mismatch') {
    const years = Array.isArray(error.found_years) ? error.found_years.join(', ') : '—'
    return {
      title: `Las fechas del archivo no pertenecen al año ${declaredYearLabel.value} declarado (encontrado: ${years}).`,
      chips: [],
      note: 'Corrija las fechas del Excel o ajuste el año del escenario y reintente.'
    }
  }
  if (error.kind === 'missing_cost_centers') {
    const codes = Array.isArray(error.missing_cost_centers) ? error.missing_cost_centers : []
    return {
      title: `Centros de costo no encontrados: ${codes.length}`,
      chips: codes.slice(0, 20),
      note:
        codes.length > 20
          ? `Mostrando 20 de ${codes.length}; contacte soporte para la lista completa.`
          : 'Corrija el archivo (columna "Centro de Costo") y reintente. No se creó ningún escenario.'
    }
  }
  if (error.kind === 'network') {
    return {
      title: 'Sin conexión con el servidor o la carga excedió el tiempo de espera.',
      chips: [],
      note: 'Los archivos y datos siguen cargados: puede pulsar “Cargar” para reintentar.'
    }
  }
  if (error.kind === 'server') {
    return {
      title: 'El servidor no pudo procesar los archivos y no se creó ningún escenario.',
      chips: [],
      note: 'Verifique que sean los Excel SIIGO correctos o contacte soporte; puede reintentar.'
    }
  }
  if (error.kind === 'forbidden') {
    return {
      title: 'No tiene permiso para realizar esta operación.',
      chips: [],
      note: ''
    }
  }
  // 'validation' (422) y 'string_detail': mensaje del backend inline.
  return {
    title: error.message || 'El servidor rechazó la solicitud.',
    chips: [],
    note: ''
  }
})

/* --------------------------------- submit ---------------------------------- */

function resetForm() {
  files.ingresos = null
  files.gastos = null
  files.compras = null
  form.name = ''
  form.period = 'ANUAL'
  form.department = ''
  nameError.value = ''
  filesError.value = ''
  serverError.value = null
  attempted.value = false
}

async function handleUpload() {
  attempted.value = true
  serverError.value = null
  nameError.value = ''
  filesError.value = ''

  if (!nameValid.value) {
    nameError.value = 'El nombre del escenario es obligatorio.'
    return
  }
  if (!ingresosValid.value) {
    filesError.value = 'El archivo de Ingresos es obligatorio (Gastos es opcional).'
    return
  }
  if (busy.value) return

  const result = await budgetPlanningStore.uploadScenario({
    scenarioName: form.name,
    budgetYear: Number(form.year),
    budgetPeriod: form.period,
    idDepartment: form.department === '' ? null : Number(form.department),
    fileIngresos: files.ingresos,
    fileGastos: files.gastos instanceof File ? files.gastos : null,
    // FE-S9 §2.8: el store/servicio anexan `file_compras` SOLO si es File.
    fileCompras: files.compras instanceof File ? files.compras : null
  })

  if (result.ok) {
    const data = result.data ?? {}
    let message = `Escenario "${data.scenario_name ?? form.name.trim()}" creado: ${data.lines_income ?? 0} líneas de ingreso, ${data.lines_expense ?? 0} de gasto`
    // §2.8: el tramo de compra SOLO si el backend reportó compras (respuestas
    // viejas traen `undefined`/0 ⇒ `Number(...) > 0` false ⇒ texto idéntico a hoy).
    if (Number(data.lines_purchase) > 0) {
      message += ` · Líneas de compra: ${data.lines_purchase} · Total: ${formatMoney(data.total_purchase)}`
    }
    alertService.generalSucces(message)
    emit('created')
    resetForm()
    emit('close')
    return
  }

  if (result.kind === 'busy' || result.kind === 'auth') return

  if (result.kind === 'duplicate_name') {
    nameError.value = `Ya existe un escenario con ese nombre para ${declaredYearLabel.value}.`
    return
  }

  // Resto de kinds (§9): banner estructurado dentro del modal, que permanece
  // abierto con los archivos en memoria para reintentar sin re-seleccionar.
  serverError.value = result
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
    attempted.value = false
    nameError.value = ''
    filesError.value = ''
    serverError.value = null
    form.year = String(new Date().getFullYear() + 1)
    loadDepartmentsOnce()
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
  <div v-if="open" class="bi-overlay" @mousedown="onOverlayMousedown">
    <div
      ref="dialogRef"
      class="bi-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="budget-ingestion-title"
      tabindex="-1"
    >
      <header class="bi-header">
        <div class="bi-header-text">
          <h3 id="budget-ingestion-title" class="bi-title">Nuevo Escenario (Carga Anual)</h3>
          <p class="bi-subtitle">
            Suba las dos Solicitudes de Presupuesto SIIGO; el escenario se crea todo-o-nada.
          </p>
        </div>
        <button
          type="button"
          class="bi-x"
          :disabled="busy"
          aria-label="Cerrar ventana"
          @click="tryClose"
        >
          ✕
        </button>
      </header>

      <form class="bi-body" @submit.prevent="handleUpload">
        <!-- ============================ Campos ============================ -->
        <div class="bi-fields">
          <div class="bi-field">
            <label class="bi-label" for="bi-name">Nombre del escenario</label>
            <input
              id="bi-name"
              v-model="form.name"
              class="bi-input"
              :class="{ 'is-invalid': attempted && !nameValid }"
              type="text"
              maxlength="120"
              placeholder="Ej.: Plan Inicial 2027"
              :disabled="busy"
            />
            <p v-if="nameError" class="bi-field-error" aria-live="polite">{{ nameError }}</p>
          </div>

          <div class="bi-field">
            <label class="bi-label" for="bi-year">Año</label>
            <select id="bi-year" v-model="form.year" class="bi-input" :disabled="busy">
              <option v-for="year in yearOptions" :key="year" :value="String(year)">
                {{ year }}
              </option>
            </select>
          </div>

          <div class="bi-field">
            <label class="bi-label" for="bi-period">Período</label>
            <input
              id="bi-period"
              v-model="form.period"
              class="bi-input"
              type="text"
              maxlength="20"
              :disabled="busy"
            />
          </div>

          <div class="bi-field">
            <label class="bi-label" for="bi-department">Departamento</label>
            <select id="bi-department" v-model="form.department" class="bi-input" :disabled="busy">
              <option value="">Sin departamento</option>
              <option
                v-for="dept in departments"
                :key="dept.id_department"
                :value="String(dept.id_department)"
              >
                {{ dept.department_name }}
              </option>
            </select>
          </div>
        </div>

        <!-- ========================= Drop-zones SIIGO ========================= -->
        <div class="bi-zones">
          <section class="bi-zone">
            <p class="bi-zone-title">
              Solicitud de <strong>Ingresos</strong>
              <span class="bi-required" aria-hidden="true">*requerido</span>
            </p>
            <FileDropZone
              v-model="files.ingresos"
              dataset-key="planning-ingresos"
              :max-mb="10"
              :disabled="busy"
              hint-file="Formato Solicitud Presupuesto Ingresos.xlsx"
            />
            <p
              v-if="filesError && attempted && !ingresosValid"
              class="bi-field-error"
              aria-live="polite"
            >
              {{ filesError }}
            </p>
          </section>

          <section class="bi-zone">
            <p class="bi-zone-title">Solicitud de <strong>Gastos</strong> (opcional)</p>
            <FileDropZone
              v-model="files.gastos"
              dataset-key="planning-gastos"
              :max-mb="10"
              :disabled="busy"
              hint-file="Formato Solicitud Presupuesto Gastos.xlsx"
            />
            <p class="bi-zone-note">Sin este archivo el escenario se crea solo con ingresos.</p>
          </section>

          <!-- FE-S9 §2.8: tercer input OPCIONAL — Plan de Importaciones
               (helper reemplazado por el layout real SIIGO en A-01 §6.3). -->
          <section class="bi-zone">
            <p class="bi-zone-title">Plan de <strong>importaciones</strong> (opcional)</p>
            <FileDropZone
              v-model="files.compras"
              dataset-key="planning-compras"
              :max-mb="10"
              :disabled="busy"
              hint-file="Plantilla Plan de Importaciones.xlsx"
            />
            <p class="bi-zone-note">
              Formato SIIGO (hoja 1, encabezados en la fila 8): Centro de Costo · Fecha Importacion
              · Temporada · Monto · Descripción. Una fila = una importación; las cuotas al proveedor
              se derivan de los términos de la Línea; el valor es el costo total de la importación
              (proveedor + internación).
            </p>
          </section>
        </div>

        <!-- ====================== Ayuda de formato (§7) ====================== -->
        <aside class="bi-help">
          <p class="bi-help-title">Estructura requerida</p>
          <p class="bi-help-text">
            Hoja con encabezado en la <strong>fila 8</strong>; columnas según el formato SIIGO de
            Solicitud de Presupuesto (Centro de Costo, Fecha Proyectada, Temporada, Monto/Tasa,
            Comportamiento…). El backend revalida el contenido: cualquier inconsistencia se lista
            abajo sin crear el escenario.
          </p>
        </aside>

        <!-- ==================== Banner de error servidor ==================== -->
        <div v-if="visibleServerError" class="bi-alert" role="alert" aria-live="assertive">
          <p class="bi-alert-title">{{ visibleServerError.title }}</p>
          <ul v-if="visibleServerError.chips.length" class="bi-chips">
            <li v-for="code in visibleServerError.chips" :key="code" class="bi-chip">
              {{ code }}
            </li>
          </ul>
          <p v-if="visibleServerError.note" class="bi-alert-note">
            {{ visibleServerError.note }}
          </p>
        </div>
      </form>

      <footer class="bi-footer">
        <button type="button" class="btn btn-secondary" :disabled="busy" @click="tryClose">
          Cancelar
        </button>
        <button
          type="button"
          class="btn btn-primary bi-submit"
          :class="{ 'is-busy': busy }"
          :disabled="!canSubmit"
          @click="handleUpload"
        >
          <span v-if="busy" class="bi-spinner" aria-hidden="true"></span>
          {{ busy ? 'Cargando…' : 'Cargar' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.bi-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 16px;
  background-color: var(--background-transparency, rgba(7, 7, 7, 0.55));
}

.bi-dialog {
  display: flex;
  flex-direction: column;
  width: min(860px, 96vw);
  max-height: min(90vh, 860px);
  overflow: hidden;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 10px;
  background-color: var(--color-surface-card, #ffffff);
  color: var(--color-text-primary, #070707);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
  outline: none;
  animation: bi-pop 0.22s cubic-bezier(0.23, 1, 0.32, 1);
}

@keyframes bi-pop {
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
  .bi-dialog {
    animation: none;
  }
}

.bi-header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
}

.bi-header-text {
  flex: 1;
  min-width: 0;
}

.bi-title {
  margin: 0;
  font-size: 1.06rem;
  font-weight: 600;
  line-height: 1.35;
}

.bi-subtitle {
  margin: 2px 0 0;
  font-size: 0.78rem;
  color: var(--color-text-muted, #8a8a8a);
}

.bi-x {
  flex-shrink: 0;
  padding: 6px 8px;
  border: none;
  border-radius: 6px;
  background: none;
  font-size: 0.95rem;
  color: var(--color-text-muted, #8a8a8a);
  cursor: pointer;
}

.bi-x:hover:not(:disabled) {
  background-color: rgba(120, 120, 120, 0.12);
  color: var(--color-text-primary, #070707);
}

.bi-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  padding: 16px 20px;
}

.bi-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 12px;
}

.bi-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.bi-label {
  font-size: 0.74rem;
  font-weight: 600;
  color: var(--color-text-secondary, #555555);
}

.bi-input {
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

.bi-input:focus {
  border-color: var(--color-brand, #03658c);
  outline: 2px solid rgba(3, 101, 140, 0.25);
  outline-offset: 0;
}

.bi-input.is-invalid {
  border-color: #c53030;
}

.bi-field-error {
  margin: 2px 0 0;
  font-size: 0.76rem;
  font-weight: 500;
  color: #c53030;
}

:root[data-theme='dark'] .bi-field-error {
  color: #ff8f8f;
}

.bi-zones {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 14px;
}

.bi-zone {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bi-zone-title {
  margin: 0;
  font-size: 0.82rem;
  color: var(--color-text-primary, #070707);
}

.bi-required {
  margin-left: 6px;
  font-size: 0.7rem;
  font-weight: 600;
  color: #b45309;
}

.bi-zone-note {
  margin: 0;
  font-size: 0.74rem;
  color: var(--color-text-muted, #8a8a8a);
}

.bi-help {
  padding: 12px 14px;
  border: 1px dashed var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 8px;
  background-color: var(--color-surface, #f7f7f7);
}

:root[data-theme='dark'] .bi-help {
  background-color: rgba(255, 255, 255, 0.04);
}

.bi-help-title {
  margin: 0 0 4px;
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-secondary, #555555);
}

.bi-help-text {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.55;
  color: var(--color-text-secondary, #555555);
}

.bi-alert {
  padding: 12px 14px;
  border: 1px solid rgba(197, 48, 48, 0.35);
  border-left: 4px solid #c53030;
  border-radius: 8px;
  background-color: rgba(197, 48, 48, 0.07);
}

.bi-alert-title {
  margin: 0;
  font-size: 0.86rem;
  font-weight: 600;
  color: #9b2222;
}

:root[data-theme='dark'] .bi-alert-title {
  color: #ff9b9b;
}

.bi-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}

.bi-chip {
  padding: 3px 10px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 999px;
  background-color: var(--color-surface, #f7f7f7);
  font-size: 0.74rem;
  font-variant-numeric: tabular-nums;
}

:root[data-theme='dark'] .bi-chip {
  background-color: rgba(255, 255, 255, 0.05);
}

.bi-alert-note {
  margin: 8px 0 0;
  font-size: 0.78rem;
  color: var(--color-text-secondary, #555555);
}

.bi-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  background-color: var(--color-surface, #f7f7f7);
}

:root[data-theme='dark'] .bi-footer {
  background-color: rgba(255, 255, 255, 0.03);
}

.bi-submit {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}

.bi-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(120, 120, 120, 0.25);
  border-top-color: var(--color-brand, #03658c);
  border-radius: 50%;
  animation: bi-spin 0.8s linear infinite;
}

@keyframes bi-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
