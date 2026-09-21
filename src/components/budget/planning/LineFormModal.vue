<script setup>
/**
 * LineFormModal — crear/editar UNA línea del escenario (FE-S4D-BUDGET-LINES
 * §3.2). Un solo componente en modo `create | edit`. En FE-S4D el `line_type`
 * LO FIJABA la sección que abre el modal (FD-6); FE-S9-PURCHASES-BODEGA §2.2
 * introduce un SELECTOR DE TIPO (Ingreso / Gasto / Compra) precargado con la
 * sección: en create es editable (permite crear una compra desde cualquier
 * sección) y en edit aparece DESHABILITADO (BR-LINE-06: el tipo no se muta).
 * `behavior_type` es seleccionable SOLO en create (en edit aparece
 * deshabilitado: cambiar el comportamiento = crear línea nueva + eliminar la
 * vieja, BR-LINE-06/D-2).
 *
 * Modo Compra (FE-S9 §2.2 ENMENDADO por A-01 §6.1, espejo de BR-PUR-01 del
 * BE): `behavior_type` fijo a `fixed` (el selector de comportamiento se
 * OCULTA), se ocultan también Fecha de Pago y la tasa variable, el label de
 * `budget_date` pasa a `Fecha de importación` y —desde la enmienda— el
 * select "Temporada" SÍ se muestra en compra: el payload de creación envía
 * `{ id_cost_center, line_type:'purchase', budget_date, projected_amount,
 * id_collection?, description? }` con `id_collection` SOLO si hubo selección
 * (nada de ''/0). `payment_date`/`variable_rate`/`behavior_type` jamás viajan
 * (el BE además fuerza `payment_date` a NULL y rechaza cualquier intento de
 * PUT de esos campos sobre una compra, BR-PUR-02/03/04 en su forma A-01: la
 * temporada es metadata informativa, no dimensiona cuotas). La validación
 * pre-red de año sobre `budget_date` (AC-FD-8) aplica idéntica.
 *
 * Shell copiado de `CloneScenarioModal`/`SetTargetConfirmModal` (overlay,
 * `role="dialog"`, `aria-modal`, foco atrapado, ESC cierra).
 *
 * Submit: llama a la acción del store (`createScenarioLine`/`updateScenarioLine`),
 * dueña del guard `lineSaving` (NFR-FD-1). Éxito ⇒ `emit('saved', line)`
 * + cierra (la caché del store es LA fuente: cero refetch, AC-FE-6). FE-S7 §3
 * / BE-S7 §2 (D-S7-6): el 2.º argumento `siblings` de FE-S5 (FD5-5) se
 * RETIRÓ — el 201 volvió a ser `BudgetLine` puro y ya no hay cuotas hermanas
 * que señalizar; el grid solo toastuea el éxito FE-S4D. El modal NO muestra
 * preview de cuotas (PQ-4 BE). Error de servidor ⇒
 * el modal NO se cierra, los datos tecleados se conservan (AC-FD-11) y el mensaje
 * se pinta inline bajo el campo ofensor según el mapeo §6:
 *   422 → "Revisa los valores marcados." + campos ofensoros (loc de FastAPI)
 *   400 BR-LINE-04 → inline en Fecha proyectada
 *   400 BR-LINE-07 → inline en Monto/Tasa
 *   404 FK/presupuesto → inline en los selects
 *   red/5xx → "No se pudo guardar. Reintenta." inline
 *   404 línea → el store ya resincronizó la vista: toast + cierre (§4/§6).
 *
 * Validaciones locales PRE-red (AC-FD-8): año de `budget_date` = año del
 * escenario (espejo de BR-LINE-04), monto numérico >= 0 con `parseCellAmount`
 * (ASM-12, el mismo del grid), tasa 0–100 %; inválidas ⇒ borde rojo SIN request.
 * La tasa se edita en % y se envía `tasa/100` (FD-8, espejo de
 * `formatVariableRate`); el PUT se construye SOLO con los campos MODIFICADOS
 * (parcial; `null = keep` en `PlanningLineUpdate`, por eso los opcionales
 * vacíos jamás se envían) y NUNCA `projected_amount` en variables
 * (BR-LINE-07) ni `line_type`/`behavior_type` (BR-LINE-06).
 *
 * FE-S10-INTERNMENT-SPLIT §2.7 (CLARITY ONLY — cero cambios de contrato): en
 * modo compra el hint canónico es el del split (el valor ES el costo total:
 * proveedor + internación) y, CUANDO el CECO resuelve una Línea con tasa de
 * internación > 0 y el monto es numérico, se pinta la fila de SOLO LECTURA
 * "Desglose estimado: proveedor … + internación …" (derivada client-side de
 * `internmentRateByLine`, reactiva sin refetch). Los payloads CREATE/UPDATE
 * de compra siguen BYTE-IDÉNTICOS a FE-S9 §6.1 (AC-FE10-7; guards BR-PUR-
 * 02/03/04 intactos: ningún campo nuevo viaja jamás).
 */
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useBudgetPlanningStore } from '@/stores/budgetPlanningStore.js'
import { alertService } from '@/services/alertService.js'
import {
  BEHAVIOR_LABELS,
  LINE_TYPE_LABELS,
  formatMoney,
  parseCellAmount
} from './planningFormat.js'

const props = defineProps({
  open: { type: Boolean, required: true },
  /** 'create' | 'edit' */
  mode: { type: String, default: 'create' },
  /** Línea a editar (null en create). */
  line: { type: Object, default: null },
  /** `BudgetFull` del store: se usa `id_budget` y `budget_year`. */
  scenario: { type: Object, required: true },
  /**
   * 'income' | 'expense' | 'purchase' — tipo INICIAL que fija la sección
   * "+ Añadir X" del grid (FD-6); en create el selector de tipo del modal
   * (FE-S9 §2.2) puede cambiarlo sobre la marcha.
   */
  lineType: { type: String, required: true }
})

const emit = defineEmits(['saved', 'close'])

const budgetPlanningStore = useBudgetPlanningStore()

const dialogRef = ref(null)
const attempted = ref(false)

/** Estado del formulario (SIEMPRE strings; se numericen en los payloads). */
const form = reactive({
  idCostCenter: '',
  budgetDate: '',
  paymentDate: '',
  idCollection: '',
  behaviorType: 'fixed',
  amountText: '',
  ratePct: '',
  description: ''
})

/** Errores server inline por campo (§6) y alerta global. */
const serverFieldErrors = reactive({
  ceco: '',
  budgetDate: '',
  paymentDate: '',
  collection: '',
  amount: '',
  rate: '',
  behavior: '',
  description: ''
})
const alertMessage = ref('')
/** @type {import('vue').Ref<Set<string>>} campos marcados por un 422. */
const flagged = ref(new Set())

const isEdit = computed(() => props.mode === 'edit')
const isVariable = computed(() => form.behaviorType !== 'fixed')

/* ------------------------ selector de tipo (FE-S9 §2.2) ------------------------ */

/**
 * Tipo EFECTIVO del formulario. En create arranca en el tipo de la sección que
 * abrió el modal (`props.lineType`) y es editable; en edit queda clavado al
 * tipo de la línea (BR-LINE-06: el PUT nunca toca `line_type`).
 */
const selectedType = ref(props.lineType || 'income')
const isPurchase = computed(() => selectedType.value === 'purchase')

/** Opciones del selector de tipo (orden = `LINE_TYPE_LABELS`): Ingreso/Gasto/Compra. */
const LINE_TYPE_OPTIONS = Object.entries(LINE_TYPE_LABELS).map(([value, label]) => ({
  value,
  label
}))

/**
 * Hint literal FE-S10 §2.7 (REEMPLAZA al de FE-S9 §6.1; solo en modo compra):
 * el valor capturado ES el costo total (proveedor + internación, A-1') y el
 * desglose se deriva client-side en la Vista Flujo (D-FE10-1). Cero cambios
 * de payload: la fila "Desglose estimado" de abajo es SOLO lectura.
 */
const PURCHASE_HINT =
  'El valor es el costo total (proveedor + internación). Las cuotas al proveedor se derivan del costo del proveedor (total ÷ (1 + % de internación de la Línea)) y las de internación de sus propios términos, ambas sobre la fecha de importación. La temporada es informativa: no genera cuotas.'

/* ───── FE-S10-INTERNMENT-SPLIT §2.7: fila "Desglose estimado" (solo lectura) ───── */

/**
 * Tasa de internación (fracción 0–1) VIGENTE de la LÍNEA del CECO
 * seleccionado en el formulario, resuelta contra los catálogos ya cacheados
 * por `ensureCatalogs` (`costCenters` + getter `internmentRateByLine`) —
 * reactiva a monto/CECO/temporada SIN refetch (NFR-FE10-2). Guard defensivo
 * espejo §2.4-1: no finita o negativa ⇒ 0 (sin desglose).
 */
const purchaseInternmentPct = computed(() => {
  if (!isPurchase.value) return 0
  if (!form.idCostCenter) return 0
  const idCostCenter = Number(form.idCostCenter)
  if (!Number.isFinite(idCostCenter)) return 0
  const found = budgetPlanningStore.costCenters.find((item) => item.id_cost_center === idCostCenter)
  const lineId = typeof found?.id_line === 'number' ? found.id_line : null
  if (lineId === null) return 0
  const pct = Number(budgetPlanningStore.internmentRateByLine.get(lineId) ?? 0)
  return Number.isFinite(pct) && pct > 0 ? pct : 0
})

/**
 * Literal §2.7 (solo lectura — NO es campo, NO viaja en payload): visible
 * SOLO en modo compra con CECO que resuelve Línea con `pct > 0` y monto
 * numérico (`parseCellAmount` válido, ASM-12). Fórmula espejo backend.02_19
 * §4: `proveedor = amount / (1 + pct)`, `internación = amount − proveedor`.
 */
const purchaseBreakdownText = computed(() => {
  const pct = purchaseInternmentPct.value
  if (pct <= 0) return ''
  const parsed = amountParse.value
  if (!parsed.valid) return ''
  const provBase = parsed.value / (1 + pct)
  return `Desglose estimado: proveedor ${formatMoney(provBase)} + internación ${formatMoney(parsed.value - provBase)}`
})

/** Opciones del select de comportamiento (orden = `BEHAVIOR_LABELS`). */
const BEHAVIOR_OPTIONS = Object.entries(BEHAVIOR_LABELS).map(([value, label]) => ({
  value,
  label
}))

/** Con tipo Compra el comportamiento queda FIJO a `fixed` (BR-PUR-01). */
watch(selectedType, (type) => {
  if (type === 'purchase') form.behaviorType = 'fixed'
})

/* ------------------------------- busy / guard ------------------------------- */

/**
 * Clave `lineSaving` según el contrato del store (§4): edit ⇒ id de línea;
 * create ⇒ 'new' + TIPO SELECCIONADO (la acción del store deriva la misma
 * clave de `payload.line_type`). El STORE es el dueño del flag; aquí solo se
 * lee.
 */
const savingKey = computed(() =>
  isEdit.value && props.line ? props.line.id_budget_line : `new${selectedType.value}`
)
const busy = computed(() => Boolean(budgetPlanningStore.lineSaving[savingKey.value]))

/* --------------------------------- títulos --------------------------------- */

const dialogTitle = computed(() => {
  if (isEdit.value) return 'Editar línea'
  if (selectedType.value === 'income') return 'Añadir ingreso al escenario'
  if (selectedType.value === 'purchase') return 'Añadir compra al escenario'
  return 'Añadir gasto al escenario'
})

/* ------------------------------ parse / errores ----------------------------- */

const amountParse = computed(() => parseCellAmount(form.amountText))

/** `null` = tasa vacía; si no, número finito (o NaN si el texto no es válido). */
const ratePctNumber = computed(() => {
  const raw = String(form.ratePct).trim()
  if (!raw) return null
  const num = Number(raw.includes(',') && !raw.includes('.') ? raw.replace(',', '.') : raw)
  return Number.isFinite(num) ? num : NaN
})

/** Tasa cruda 0–1 para el payload (FD-8: `tasa/100`; redondeo anti float-garbage). */
const rateDecimal = computed(() =>
  ratePctNumber.value === null || Number.isNaN(ratePctNumber.value)
    ? null
    : Number((ratePctNumber.value / 100).toFixed(6))
)

const yearValid = computed(() => {
  if (!form.budgetDate) return false
  // `input type=date` entrega ISO puro 'YYYY-MM-DD': se lee el año del string
  // (patrón de `planningFormat.monthIndexOf`, sin corrimiento UTC→local de
  // `new Date(v).getFullYear()`), mismo resultado semántico que pide la spec.
  return Number(form.budgetDate.slice(0, 4)) === Number(props.scenario?.budget_year)
})

const cecoError = computed(() => (form.idCostCenter ? '' : 'El CECO es obligatorio.'))

const budgetDateError = computed(() => {
  if (!form.budgetDate) return 'La fecha proyectada es obligatoria.'
  if (!yearValid.value) {
    return `La fecha debe ser del año ${props.scenario?.budget_year ?? '—'} del escenario.`
  }
  return ''
})

const amountError = computed(() => {
  if (isVariable.value) return ''
  if (!String(form.amountText).trim()) return 'El monto es obligatorio.'
  if (!amountParse.value.valid) return 'Debe ser un número mayor o igual que 0.'
  return ''
})

const rateError = computed(() => {
  if (!isVariable.value) return ''
  if (ratePctNumber.value === null) {
    // Obligatoria en create; en edit vacía = "sin cambio" (PUT parcial, keep).
    return isEdit.value ? '' : 'La tasa es obligatoria para líneas variables.'
  }
  if (Number.isNaN(ratePctNumber.value) || ratePctNumber.value < 0 || ratePctNumber.value > 100) {
    return 'La tasa debe ser un número entre 0 y 100.'
  }
  return ''
})

/**
 * Error visible por campo: el de servidor (inline §6) manda sobre el local;
 * los de "obligatorio vacío" solo tras un intento de guardar; los de formato
 * (año, monto, tasa) se muestran EN VIVO (AC-FD-8: borde rojo sin request).
 */
function fieldMessage(key) {
  if (serverFieldErrors[key]) return serverFieldErrors[key]
  const local =
    key === 'ceco'
      ? cecoError.value
      : key === 'budgetDate'
        ? budgetDateError.value
        : key === 'amount'
          ? amountError.value
          : key === 'rate'
            ? rateError.value
            : ''
  if (!local) return ''
  const filled =
    key === 'ceco'
      ? Boolean(form.idCostCenter)
      : key === 'budgetDate'
        ? Boolean(form.budgetDate)
        : key === 'amount'
          ? Boolean(String(form.amountText).trim())
          : Boolean(String(form.ratePct).trim())
  return filled || attempted.value ? local : ''
}

const isFlagged = (key) => flagged.value.has(key)

/* --------------------------------- payloads -------------------------------- */

const createPayload = computed(() => {
  if (isPurchase.value) {
    // FE-S9 §2.2 ENMENDADO por A-01 §6.1: la compra envía
    // { id_cost_center, line_type, budget_date, projected_amount,
    // id_collection?, description? } — comportamiento fijo, `payment_date` y
    // `variable_rate` JAMÁS viajan (BR-PUR-01/02; el BE además fuerza
    // `payment_date` a NULL, pero el contrato FE no lo depende). La
    // TEMPORADA sí puede viajar (informativa, sin cuotas): SOLO si el
    // usuario seleccionó una — nada de ''/0.
    const payload = {
      id_cost_center: Number(form.idCostCenter),
      line_type: 'purchase',
      budget_date: form.budgetDate,
      projected_amount: amountParse.value.value
    }
    if (form.idCollection) {
      const collection = Number(form.idCollection)
      if (Number.isFinite(collection) && collection > 0) {
        payload.id_collection = collection
      }
    }
    const description = form.description.trim()
    if (description) payload.description = description
    return payload
  }
  const payload = {
    id_cost_center: Number(form.idCostCenter),
    line_type: selectedType.value,
    // §3.2 lista los campos editables; `behavior_type` VIAJA porque el default
    // del BE es FIXED (BE-S4D §3.1): sin él, AC-FD-4 (crear variable) sería
    // imposible. El monto/tasa van condicionados por comportamiento (§3.2).
    behavior_type: form.behaviorType,
    budget_date: form.budgetDate,
    payment_date: form.paymentDate || null,
    id_collection: form.idCollection ? Number(form.idCollection) : null,
    description: form.description.trim() || null
  }
  if (isVariable.value) payload.variable_rate = rateDecimal.value
  else payload.projected_amount = amountParse.value.value
  return payload
})

/**
 * PUT parcial: solo los campos editables DISTINTOS a la línea original.
 * `null = keep` en `PlanningLineUpdate` (BE-S4D §3.2), así que un opcional
 * vacío jamás se envía (limpiar payment_date/temporada/descripción no es
 * soportado por el contrato; documentado en el reporte). Nunca
 * `projected_amount` en variables (BR-LINE-07) ni `line_type`/`behavior_type`
 * (BR-LINE-06). `null` = no hay cambios ⇒ guardar deshabilitado.
 */
const updatePayload = computed(() => {
  if (!isEdit.value || !props.line) return null
  const original = props.line
  const payload = {}
  const costCenter = Number(form.idCostCenter)
  if (costCenter && costCenter !== original.id_cost_center) payload.id_cost_center = costCenter
  if (form.budgetDate && form.budgetDate !== original.budget_date) {
    payload.budget_date = form.budgetDate
  }
  // FE-S9 A-01 §6.1: el gate `!isPurchase` se ESTRECHA — en una compra sigue
  // prohibidísimo `payment_date` (BR-PUR-04; el campo además está oculto: un
  // residuo en el modelo jamás viaja). `behavior_type`/`variable_rate` no
  // aplican: el watch clava `fixed` en compra ⇒ `isVariable` false y el PUT
  // de tasa/behavior nunca se construye aquí.
  if (!isPurchase.value) {
    if (form.paymentDate && form.paymentDate !== original.payment_date) {
      payload.payment_date = form.paymentDate
    }
  }
  // La TEMPORADA SÍ puede enviarse cuando cambió, también en compra (A-01:
  // `id_collection` es metadata legal en una línea de compra). Patrón
  // vigente: solo cambios, opcional vacío jamás (PUT parcial `null = keep`).
  if (form.idCollection) {
    const collection = Number(form.idCollection)
    if (collection > 0 && collection !== original.id_collection) {
      payload.id_collection = collection
    }
  }
  if (!isVariable.value) {
    const parsed = amountParse.value
    if (parsed.valid && parsed.value !== Number(original.projected_amount)) {
      payload.projected_amount = parsed.value
    }
  } else if (
    rateDecimal.value !== null &&
    rateDecimal.value !== Number(original.variable_rate ?? NaN)
  ) {
    payload.variable_rate = rateDecimal.value
  }
  const description = form.description.trim()
  if (description && description !== (original.description ?? '')) payload.description = description
  return Object.keys(payload).length > 0 ? payload : null
})

const canSave = computed(() => {
  if (busy.value || !props.scenario?.id_budget) return false
  if (cecoError.value || budgetDateError.value || amountError.value || rateError.value) {
    return false
  }
  if (isEdit.value && !updatePayload.value) return false
  return true
})

/* ---------------------------------- submit --------------------------------- */

function clearServerErrors() {
  serverFieldErrors.ceco = ''
  serverFieldErrors.budgetDate = ''
  serverFieldErrors.paymentDate = ''
  serverFieldErrors.collection = ''
  serverFieldErrors.amount = ''
  serverFieldErrors.rate = ''
  serverFieldErrors.behavior = ''
  serverFieldErrors.description = ''
  alertMessage.value = ''
  flagged.value = new Set()
}

/** Claves snake_case de `PlanningLineCreate/Update` → campos del formulario. */
const FIELD_BY_SCHEMA_KEY = {
  id_cost_center: 'ceco',
  budget_date: 'budgetDate',
  payment_date: 'paymentDate',
  id_collection: 'collection',
  projected_amount: 'amount',
  variable_rate: 'rate',
  behavior_type: 'behavior',
  description: 'description'
}

/** Mapeo §6: resultado clasificado del store → mensajes inline del modal. */
function applyServerError(result) {
  if (result.lineGone) {
    // §4/§6: el store ya limpió y refrescó el detalle ⇒ la vista está fresca.
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
  if (result.kind === 'validation') {
    alertMessage.value = 'Revisa los valores marcados.'
    flagged.value = new Set(
      (Array.isArray(result.fields) ? result.fields : [])
        .map((fieldKey) => FIELD_BY_SCHEMA_KEY[fieldKey])
        .filter(Boolean)
    )
    return
  }
  if (result.kind === 'conflict') {
    const message = String(result.message || '')
    if (/does not match scenario year/i.test(message)) {
      serverFieldErrors.budgetDate = `La fecha proyectada debe ser del año ${
        props.scenario?.budget_year ?? '—'
      }.`
      return
    }
    if (/derive their amount from the rate/i.test(message)) {
      serverFieldErrors.amount = 'El monto de una línea variable se deriva de su tasa.'
      return
    }
    if (/do not carry a variable rate/i.test(message)) {
      serverFieldErrors.rate = 'Una línea fija no lleva tasa: edite el monto.'
      return
    }
    alertMessage.value = message
    return
  }
  if (result.kind === 'notfound') {
    // 404 de FK/presupuesto (el de línea ya se resolvió arriba con lineGone).
    const message = 'El CECO o la temporada seleccionada ya no existen.'
    const detail = String(result.detail || '')
    if (/cost center/i.test(detail)) serverFieldErrors.ceco = message
    else if (/collection/i.test(detail)) serverFieldErrors.collection = message
    else alertMessage.value = message
    return
  }
  // network / server / resto (FE-S4D §6: red/5xx): el modal permanece abierto
  // con los datos intactos (AC-FD-11).
  alertMessage.value = 'No se pudo guardar. Reintenta.'
}

async function handleSave() {
  attempted.value = true
  clearServerErrors()
  if (!canSave.value) return
  const result = isEdit.value
    ? await budgetPlanningStore.updateScenarioLine(
        props.line.id_budget_line,
        updatePayload.value ?? {}
      )
    : await budgetPlanningStore.createScenarioLine(props.scenario.id_budget, createPayload.value)

  if (result.ok) {
    // FE-S7 §3: `saved` emite SOLO la línea (el 2.º argumento `siblings` de
    // FE-S5 murió con el rollback BE-S7 §2 — el 201 es `BudgetLine` puro).
    emit('saved', result.line ?? null)
    resetForm()
    emit('close')
    return
  }
  applyServerError(result)
}

/* --------------------------- apertura / reinicio ---------------------------- */

function resetForm() {
  Object.assign(form, {
    idCostCenter: '',
    budgetDate: '',
    paymentDate: '',
    idCollection: '',
    behaviorType: 'fixed',
    amountText: '',
    ratePct: '',
    description: ''
  })
  // FE-S9 §2.2: en create el selector arranca en la sección que abrió el
  // modal; en edit queda clavado al tipo de la línea (selector deshabilitado).
  selectedType.value =
    isEdit.value && props.line?.line_type ? props.line.line_type : props.lineType || 'income'
  clearServerErrors()
  attempted.value = false
}

/** Precarga en modo edit desde la línea de la caché (AC-FD-11: sin residuo). */
function prefillFromLine(line) {
  Object.assign(form, {
    idCostCenter: line.id_cost_center != null ? String(line.id_cost_center) : '',
    budgetDate: line.budget_date ?? '',
    paymentDate: line.payment_date ?? '',
    idCollection: line.id_collection != null ? String(line.id_collection) : '',
    behaviorType: line.behavior_type ?? 'fixed',
    amountText: String(line.projected_amount ?? ''),
    ratePct:
      line.variable_rate !== null && line.variable_rate !== undefined
        ? String(Number((Number(line.variable_rate) * 100).toFixed(2)))
        : '',
    description: line.description ?? ''
  })
}

watch(
  () => [props.open, props.line],
  async ([open, line]) => {
    if (!open) return
    resetForm()
    if (isEdit.value && line) prefillFromLine(line)
    // Catálogos CECO/temporadas: ya cargados por `fetchScenarioDetail` (A5);
    // este no-op defensivo cubre la apertura directa sin esperar el fetch.
    void budgetPlanningStore.ensureCatalogs()
    await nextTick()
    dialogRef.value?.focus()
  },
  { immediate: true }
)

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

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
})
</script>

<template>
  <div v-if="open" class="lf-overlay" @mousedown="onOverlayMousedown">
    <div
      ref="dialogRef"
      class="lf-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="line-form-title"
      tabindex="-1"
    >
      <header class="lf-header">
        <div class="lf-header-text">
          <h3 id="line-form-title" class="lf-title">{{ dialogTitle }}</h3>
          <p class="lf-subtitle">{{ scenario.budget_name }} · {{ scenario.budget_year }}</p>
        </div>
        <button
          type="button"
          class="lf-x"
          :disabled="busy"
          aria-label="Cerrar ventana"
          @click="tryClose"
        >
          ✕
        </button>
      </header>

      <form class="lf-body" @submit.prevent="handleSave">
        <div class="lf-field">
          <label class="lf-label" for="lf-line-type">Tipo de línea *</label>
          <!-- FE-S9 §2.2: tres opciones (Ingreso/Gasto/Compra). En create el
               valor inicial lo fija la sección "+ Añadir X"; en edit queda
               deshabilitado (BR-LINE-06: el tipo no se muta). -->
          <select
            id="lf-line-type"
            v-model="selectedType"
            class="lf-input"
            :disabled="isEdit || busy"
          >
            <option v-for="option in LINE_TYPE_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
          <p v-if="isPurchase" class="lf-hint">{{ PURCHASE_HINT }}</p>
          <p v-else-if="isEdit" class="lf-hint">
            El tipo no se puede cambiar: para otro tipo, cree una línea nueva
          </p>
        </div>

        <div class="lf-field">
          <label class="lf-label" for="lf-ceco">CECO *</label>
          <select
            id="lf-ceco"
            v-model="form.idCostCenter"
            class="lf-input"
            :class="{ 'is-invalid': Boolean(fieldMessage('ceco')) || isFlagged('ceco') }"
            :disabled="busy"
          >
            <option value="">Seleccione un CECO…</option>
            <option
              v-for="center in budgetPlanningStore.costCenters"
              :key="center.id_cost_center"
              :value="String(center.id_cost_center)"
            >
              {{ center.cost_center_code }} — {{ center.cost_center_name }}
            </option>
          </select>
          <p
            v-if="fieldMessage('ceco') || isFlagged('ceco')"
            class="lf-field-error"
            aria-live="polite"
          >
            {{ fieldMessage('ceco') || 'Revisa este valor.' }}
          </p>
        </div>

        <div class="lf-field">
          <!-- FE-S9 §2.2: en modo compra la fecha proyectada SE LLAMA "Fecha
               de importación" (el payload sigue enviando `budget_date`). -->
          <label class="lf-label" for="lf-budget-date">{{
            isPurchase ? 'Fecha de importación *' : 'Fecha proyectada *'
          }}</label>
          <input
            id="lf-budget-date"
            v-model="form.budgetDate"
            class="lf-input"
            :class="{
              'is-invalid': Boolean(fieldMessage('budgetDate')) || isFlagged('budgetDate')
            }"
            type="date"
            :disabled="busy"
            :aria-invalid="fieldMessage('budgetDate') ? 'true' : 'false'"
          />
          <p
            v-if="fieldMessage('budgetDate') || isFlagged('budgetDate')"
            class="lf-field-error"
            aria-live="polite"
          >
            {{ fieldMessage('budgetDate') || 'Revisa este valor.' }}
          </p>
        </div>

        <!-- FE-S9 §2.2: compra ⇒ se OCULTA la fecha de pago (el BE fuerza
             payment_date a NULL: las cuotas se derivan por términos). -->
        <div v-if="!isPurchase" class="lf-field">
          <label class="lf-label" for="lf-payment-date">Fecha de pago</label>
          <input
            id="lf-payment-date"
            v-model="form.paymentDate"
            class="lf-input"
            :class="{ 'is-invalid': isFlagged('paymentDate') }"
            type="date"
            :disabled="busy"
          />
          <p class="lf-hint">Si se omite, se asume la fecha proyectada</p>
          <p v-if="isFlagged('paymentDate')" class="lf-field-error" aria-live="polite">
            Revisa este valor.
          </p>
        </div>

        <!-- FE-S9 A-01 §6.1: la Temporada se muestra TAMBIÉN en compra
             (informativa: no genera cuotas; 404 de colección cae en el
             mensaje campo `collection` vigente). Comportamiento, fecha de
             pago y tasa variable SIGUEN ocultos en compra (§2.2 intacto). -->
        <div class="lf-field">
          <label class="lf-label" for="lf-collection">Temporada</label>
          <select
            id="lf-collection"
            v-model="form.idCollection"
            class="lf-input"
            :class="{
              'is-invalid': Boolean(serverFieldErrors.collection) || isFlagged('collection')
            }"
            :disabled="busy"
          >
            <option value="">— ninguna —</option>
            <option
              v-for="collection in budgetPlanningStore.collections"
              :key="collection.id_collection"
              :value="String(collection.id_collection)"
            >
              {{ collection.short_collection_name }}
            </option>
          </select>
          <p
            v-if="serverFieldErrors.collection || isFlagged('collection')"
            class="lf-field-error"
            aria-live="polite"
          >
            {{ serverFieldErrors.collection || 'Revisa este valor.' }}
          </p>
        </div>

        <!-- FE-S9 §2.2: compra ⇒ comportamiento FIJO a `fixed`: el selector
             se oculta (a diferencia del edit de FE-S4D, que lo deshabilita). -->
        <div v-if="!isPurchase" class="lf-field">
          <label class="lf-label" for="lf-behavior">Comportamiento</label>
          <select
            id="lf-behavior"
            v-model="form.behaviorType"
            class="lf-input"
            :class="{ 'is-invalid': isFlagged('behavior') }"
            :disabled="isEdit || busy"
          >
            <option v-for="option in BEHAVIOR_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
          <p v-if="isEdit" class="lf-hint">Para cambiar el comportamiento, cree una línea nueva</p>
        </div>

        <div class="lf-field">
          <label class="lf-label" for="lf-amount"
            >Monto<template v-if="!isVariable"> *</template></label
          >
          <input
            id="lf-amount"
            v-model="form.amountText"
            class="lf-input"
            :class="{ 'is-invalid': Boolean(fieldMessage('amount')) || isFlagged('amount') }"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            :disabled="isVariable || busy"
            :placeholder="isVariable ? 'derivado de la tasa' : 'Ej.: 1200000'"
            :aria-invalid="fieldMessage('amount') ? 'true' : 'false'"
          />
          <p v-if="isVariable" class="lf-hint">derivado de la tasa</p>
          <p
            v-else-if="isEdit && updatePayload && 'projected_amount' in updatePayload"
            class="lf-hint"
          >
            Actual: {{ formatMoney(props.line?.projected_amount) }}
          </p>
          <!-- FE-S10 §2.7: fila informativa SOLO lectura (no campo, no
               payload) — solo modo compra con Línea de rate > 0 y monto
               numérico; AC-FE10-7: los payloads son idénticos a FE-S9. -->
          <p v-if="purchaseBreakdownText" class="lf-hint" aria-live="polite">
            {{ purchaseBreakdownText }}
          </p>
          <p
            v-if="fieldMessage('amount') || isFlagged('amount')"
            class="lf-field-error"
            aria-live="polite"
          >
            {{ fieldMessage('amount') || 'Revisa este valor.' }}
          </p>
        </div>

        <div v-if="isVariable" class="lf-field">
          <label class="lf-label" for="lf-rate"
            >Tasa (%)<template v-if="!isEdit"> *</template></label
          >
          <input
            id="lf-rate"
            v-model="form.ratePct"
            class="lf-input"
            :class="{ 'is-invalid': Boolean(fieldMessage('rate')) || isFlagged('rate') }"
            type="number"
            step="0.01"
            min="0"
            max="100"
            :disabled="busy"
            placeholder="Ej.: 8"
            :aria-invalid="fieldMessage('rate') ? 'true' : 'false'"
          />
          <p class="lf-hint">Se envía como fracción (8 % ⇒ 0.08)</p>
          <p
            v-if="fieldMessage('rate') || isFlagged('rate')"
            class="lf-field-error"
            aria-live="polite"
          >
            {{ fieldMessage('rate') || 'Revisa este valor.' }}
          </p>
        </div>

        <div class="lf-field">
          <label class="lf-label" for="lf-description">Descripción</label>
          <input
            id="lf-description"
            v-model="form.description"
            class="lf-input"
            :class="{ 'is-invalid': isFlagged('description') }"
            type="text"
            maxlength="255"
            :disabled="busy"
          />
          <p v-if="isFlagged('description')" class="lf-field-error" aria-live="polite">
            Revisa este valor.
          </p>
        </div>

        <p v-if="alertMessage" class="lf-alert" role="alert" aria-live="assertive">
          {{ alertMessage }}
        </p>
      </form>

      <footer class="lf-footer">
        <button type="button" class="btn btn-secondary" :disabled="busy" @click="tryClose">
          Cancelar
        </button>
        <button
          type="button"
          class="btn btn-primary lf-submit"
          :disabled="!canSave"
          @click="handleSave"
        >
          <span v-if="busy" class="lf-spinner" aria-hidden="true"></span>
          {{ busy ? 'Guardando…' : 'Guardar' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.lf-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 16px;
  background-color: var(--background-transparency, rgba(7, 7, 7, 0.55));
}

.lf-dialog {
  display: flex;
  flex-direction: column;
  max-height: min(92vh, 860px);
  width: min(520px, 96vw);
  overflow: hidden;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 10px;
  background-color: var(--color-surface-card, #ffffff);
  color: var(--color-text-primary, #070707);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
  outline: none;
  animation: lf-pop 0.22s cubic-bezier(0.23, 1, 0.32, 1);
}

@keyframes lf-pop {
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
  .lf-dialog {
    animation: none;
  }
}

.lf-header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
}

.lf-header-text {
  flex: 1;
  min-width: 0;
}

.lf-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.lf-subtitle {
  margin: 2px 0 0;
  overflow: hidden;
  font-size: 0.76rem;
  color: var(--color-text-muted, #8a8a8a);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lf-x {
  padding: 6px 8px;
  border: none;
  border-radius: 6px;
  background: none;
  font-size: 0.95rem;
  color: var(--color-text-muted, #8a8a8a);
  cursor: pointer;
}

.lf-x:hover:not(:disabled) {
  background-color: rgba(120, 120, 120, 0.12);
  color: var(--color-text-primary, #070707);
}

.lf-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 18px;
  overflow-y: auto;
}

.lf-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.lf-label {
  font-size: 0.74rem;
  font-weight: 600;
  color: var(--color-text-secondary, #555555);
}

.lf-input {
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 8px 10px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 6px;
  background-color: var(--color-surface, #f7f7f7);
  font-size: 0.84rem;
  color: var(--color-text-primary, #070707);
  box-sizing: border-box;
}

.lf-input:focus {
  border-color: var(--color-brand, #03658c);
  outline: 2px solid rgba(3, 101, 140, 0.25);
}

.lf-input.is-invalid {
  border-color: #c53030;
}

.lf-input:disabled {
  color: var(--color-text-muted, #8a8a8a);
}

.lf-field-error {
  margin: 2px 0 0;
  font-size: 0.76rem;
  font-weight: 500;
  color: #c53030;
}

:root[data-theme='dark'] .lf-field-error {
  color: #ff8f8f;
}

.lf-hint {
  margin: 2px 0 0;
  font-size: 0.74rem;
  font-style: italic;
  color: var(--color-text-muted, #8a8a8a);
}

.lf-alert {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid rgba(197, 48, 48, 0.35);
  border-left: 4px solid #c53030;
  border-radius: 8px;
  background-color: rgba(197, 48, 48, 0.07);
  font-size: 0.82rem;
  color: #9b2222;
}

:root[data-theme='dark'] .lf-alert {
  color: #ff9b9b;
}

.lf-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 18px;
  border-top: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  background-color: var(--color-surface, #f7f7f7);
}

:root[data-theme='dark'] .lf-footer {
  background-color: rgba(255, 255, 255, 0.03);
}

.lf-submit {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}

.lf-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(120, 120, 120, 0.25);
  border-top-color: var(--color-brand, #03658c);
  border-radius: 50%;
  animation: lf-spin 0.8s linear infinite;
}

@keyframes lf-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
