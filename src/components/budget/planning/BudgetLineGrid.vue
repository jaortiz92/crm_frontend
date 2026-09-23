<script setup>
/**
 * BudgetLineGrid — "Editor de Celdas" (FE-S4 §8.2 tab 2 + FE-S4D-BUDGET-LINES
 * §3: DOS secciones apiladas Ingresos/Gastos con CRUD por fila; FE-S9-PURCHASES-
 * BODEGA §2.3 añade aditivamente la tercera sección COMPRAS — semántica de
 * edición agnóstica de tipo: el PUT de celda (líneas `fixed`, que incluye las
 * compras) y el PUT/DELETE de línea ya funcionaban por igualdad exacta de
 * `line_type`; cero cambios en las dos secciones existentes).
 *
 * 1 fila = 1 `budget_line` leída de la caché del store (la ÚNICA fuente: por
 * eso tras un POST/PUT/DELETE de líneas la Vista Ejecutiva/Flujo se recalcula
 * sola, AC-FE-6). La división es por `line.line_type` (§3.1); `sortKey`,
 * `sortAsc`, filtros y `visibleCount` son INDEPENDIENTES por sección (AC-FD-9),
 * memoizados con `computed` (NFR-FD-4).
 *
 * El stack de edición de celda queda VERBATIM (FD-7/R-FD-1): doble clic o
 * `Enter` sobre MONTO (NFR-F5: `tabindex=0` + `aria-label`) → input →
 * `Enter`/blur dispara UN solo `PUT /budget/planning/cell/{id}` con
 * micro-estados `guardando… → ✓ (~1.5 s) → normal`, guard single-flight por
 * `cellSaving[id_budget_line]` (AC-FE-8) y ROLLBACK visual en error (422
 * inline, 404 con mensaje de recarga, §9). El guard vive por LÍNEA, no por
 * sección: funciona idéntico en ambas (AC-FD-2).
 *
 * Nuevo (FE-S4D): columna Acciones (✏️ `LineFormModal` crear/editar · 🗑
 * `LineDeleteModal`), botón "+ Añadir ingreso/gasto" SIEMPRE habilitado por
 * sección, subtotales de cabecera sobre TODAS las líneas del tipo (ignoran el
 * filtro, AC-FD-9) con `aria-live="polite"` (NFR-FD-3), `tfoot` Σ sobre el
 * slice visible y estados vacíos propios. Los mutadores del modal llaman a las
 * acciones del store (dueñas de `lineSaving`); el grid toasteará el éxito
 * (`saved`/`deleted`) y monta ambos modales (dueño: este componente).
 *
 * CERO dependencias: tabla HTML + estado local (patrón del repo). PQ-F5: sin
 * virtualización; slice "Mostrar 500 más" por sección.
 *
 * FE-S14-IVA (frontend.03_14 §5, prop `ivaMode`): CON el modo "Con IVA"
 *  - Ingresos y Gastos ganan las columnas `IVA` y `Total` derivadas en vivo
 *    (`planningFormat.withIva/ivaOf`, cero hardcodes — D-FE14-6): Ingresos
 *    SIEMPRE gravados (D-S10-5); Gastos solo con flag EFECTIVO True/NULL
 *    (D-FE14-2) — flag `false` ⇒ IVA "—" y Total = neto.
 *  - Columna `Con IVA` (checkbox etiquetado, NFR-FE14-4) SOLO en filas
 *    EXPENSE: cambio ⇒ `PUT /budget/planning/line/{id}` PARCIAL
 *    `{ has_iva }` vía `updateScenarioLine` (la respuesta reemplaza la línea
 *    en la caché; el settlement llega debounced por el store — AC-FE14-2).
 *    Con `has_iva === NULL` el checkbox sale MARCADO con badge "asumido" y
 *    tooltip "Asumido con IVA — edítalo si no" (AC-FE14-4, literal §5).
 *  - Compras (§4.1): sin columnas nuevas (su monto YA es el total bruto de la
 *    importación) ⇒ chip "IVA esperado" `prov×0.19 + Σ cuotas_int×0.19` con
 *    tooltip desglosado (espejo E5/E6, backend.02_19/02_20; sin catálogo de
 *    internación no se inventa la cifra: el chip simplemente no aparece).
 * Con el modo OFF el DOM es byte-idéntico al del FE-S9 (AC-FE14-1: cero
 * regresión visual) — las columnas nuevas ni se montan.
 */
import { computed, nextTick, onBeforeUnmount, reactive, ref } from 'vue'
import { useBudgetPlanningStore } from '@/stores/budgetPlanningStore.js'
import { alertService } from '@/services/alertService.js'
import LineFormModal from './LineFormModal.vue'
import LineDeleteModal from './LineDeleteModal.vue'
import {
  BEHAVIOR_LABELS,
  LINE_TYPE_LABELS,
  formatMoney,
  parseCellAmount,
  lineChargesIva,
  ivaOf,
  withIva
} from './planningFormat.js'

const props = defineProps({
  /** `BudgetFull` + `parent_budget_name` de la caché del store. */
  scenario: { type: Object, required: true },
  /**
   * FE-S14-IVA: interruptor de modo "Neto / Con IVA" del escenario (dueño:
   * `BudgetGridEditor` vía `budgetPlanningStore.ivaMode`; aquí SOLO se lee —
   * columnas y checkbox existen únicamente con el modo ON).
   */
  ivaMode: { type: Boolean, default: false }
})

const budgetPlanningStore = useBudgetPlanningStore()

/** Paso de paginación manual por slice (PQ-F5), independiente por sección. */
const PAGE_SLICE = 500

/* --------------------- edición de celda (stack FE-S4, verbatim) ------------ */

const editingId = ref(null)
const editValue = ref('')
const editInvalid = ref(false)
const editMessage = ref('')

/** Micro-estado por celda: '' | 'saving' | 'saved' | 'error'. */
const cellStatus = reactive({})
/** Mensaje visible bajo la celda en error/validación. */
const cellMessages = reactive({})
/** Valor mostrado durante el PUT (rollback = borrar el override). */
const cellOverrides = reactive({})

const savedTimers = new Map()

const lines = computed(() =>
  props.scenario && Array.isArray(props.scenario.budget_lines) ? props.scenario.budget_lines : []
)

/* --------------------------------- orden ----------------------------------- */

/** Columnas ordenables por encabezado (orden = presentación de la tabla). */
const SORT_COLUMNS = [
  { key: 'ceco', label: 'CECO' },
  { key: 'budget_date', label: 'Fecha Proyectada' },
  { key: 'payment_date', label: 'Fecha de Pago' },
  { key: 'description', label: 'Concepto' },
  { key: 'line_type', label: 'Tipo línea' },
  { key: 'collection', label: 'Temporada' },
  { key: 'projected_amount', label: 'Monto' }
]

/**
 * Valor tipado de cada columna para el comparador (etiquetas resueltas
 * contra los catálogos cacheados, igual que el render).
 */
const SORT_ACCESSORS = {
  ceco: (line) => budgetPlanningStore.costCenterLabel(line.id_cost_center),
  budget_date: (line) => line.budget_date || '',
  payment_date: (line) => line.payment_date || '',
  description: (line) => line.description || '',
  line_type: (line) => LINE_TYPE_LABELS[line.line_type] || line.line_type || '',
  collection: (line) => budgetPlanningStore.collectionLabel(line.id_collection),
  projected_amount: (line) => Number(line.projected_amount) || 0
}

/** Flechas del encabezado (mismos paths que `CollectionSummary.vue`). */
const SORT_ARROW_UP_PATH =
  'M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z'
const SORT_ARROW_DOWN_PATH =
  'M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z'

/** Clic en encabezado: misma columna invierte dirección; nueva columna → asc. */
function sortBy(state, key) {
  if (state.sortKey === key) {
    state.sortAsc = !state.sortAsc
    return
  }
  state.sortKey = key
  state.sortAsc = true
}

const ariaSort = (state, key) => {
  if (state.sortKey !== key) return undefined
  return state.sortAsc ? 'ascending' : 'descending'
}

/* ------------------------ secciones Ingresos/Gastos ------------------------ */

/**
 * Estado de filtro/orden/slice POR SECCIÓN (AC-FD-9: `sortKey/sortAsc/
 * visibleCount` ya no son globales). `query` casa código+nombre del CECO o
 * concepto/descripción (case-insensitive); `idCollection` '' = todas.
 * FE-S9 §2.3: tercera sección `purchase` (mismo stack, cero cambio de
 * semántica para income/expense).
 */
const sectionState = reactive({
  income: { query: '', idCollection: '', sortKey: '', sortAsc: true, visibleCount: PAGE_SLICE },
  expense: { query: '', idCollection: '', sortKey: '', sortAsc: true, visibleCount: PAGE_SLICE },
  purchase: { query: '', idCollection: '', sortKey: '', sortAsc: true, visibleCount: PAGE_SLICE }
})

function sumAmount(rows) {
  let total = 0
  for (const line of rows) {
    const amount = Number(line.projected_amount)
    if (Number.isFinite(amount)) total += amount
  }
  return total
}

/* ───────────── FE-S14-IVA: derivación bruto por fila/columna (§4.1) ───────────── */

/** Columna `Con IVA` (checkbox): solo GASTOS con el modo ON (§5). */
function showFlagColumn(sectionType) {
  return props.ivaMode && sectionType === 'expense'
}

/** Columnas `IVA`/`Total`: solo INGRESOS y GASTOS con el modo ON (§5). */
function showIvaColumns(sectionType) {
  return props.ivaMode && (sectionType === 'income' || sectionType === 'expense')
}

/** Cuota de IVA de la fila (0 si no está gravada; refleja el override en edición). */
function ivaAmountFor(line) {
  return lineChargesIva(line) ? ivaOf(displayAmount(line), true) : 0
}

/** Bruto mostrado de la fila: neto + IVA cuando está gravada (§4.1). */
function totalFor(line) {
  const net = displayAmount(line)
  return lineChargesIva(line) ? withIva(net, true) : net
}

function sumIva(rows) {
  let total = 0
  for (const line of rows) total += ivaAmountFor(line)
  return total
}

function sumBruto(rows) {
  let total = 0
  for (const line of rows) total += totalFor(line)
  return total
}

/** `has_iva` NULL ⇒ checkbox marcado + badge "asumido" (D-FE14-2/AC-FE14-4). */
function isAsumidoFlag(line) {
  return line.line_type === 'expense' && (line.has_iva === null || line.has_iva === undefined)
}

/**
 * FE-S14-IVA §4.1 (fila "Cuadrícula Compras"): el monto de una compra YA es
 * el TOTAL bruto de la importación (BE-S9 A-1'), así que NO gana columnas
 * propias — lo que añade el modo "Con IVA" es el **IVA esperado** con tooltip
 * desglosado: `prov×0.19 + Σ cuotas_int×0.19` (espejo exacto de E5/E6 de
 * backend.02_20 §4.3 con la misma descomposición §4 de backend.02_19:
 * `provBase = Total/(1+%int)` con degradación `%int = 0` si la Línea no tiene
 * tasa o el CECO no resuelve; sin términos ⇒ 100 % en la ancla, BR-INT-04).
 * Degradación honesta (patrón D-FE10-3): sin el dúo de internación cargado no
 * se puede partir la base ⇒ no hay tooltip (nunca una cifra inventada). Con el
 * modo OFF devuelve `null` en O(1) ⇒ DOM byte-idéntico (AC-FE14-1).
 * @param {object} line
 * @returns {{ label: string, title: string }|null} chip + tooltip, o `null`.
 */
function purchaseIvaHint(line) {
  if (!props.ivaMode || line.line_type !== 'purchase') return null
  if (!budgetPlanningStore.internmentCatalogLoaded || budgetPlanningStore.internmentCatalogError) {
    return null
  }
  const amount = Number(line.projected_amount)
  if (!Number.isFinite(amount) || amount === 0) return null
  const ceco = budgetPlanningStore.costCenters.find(
    (item) => item.id_cost_center === line.id_cost_center
  )
  const lineId = typeof ceco?.id_line === 'number' ? ceco.id_line : null
  const pctIntRaw = Number(budgetPlanningStore.internmentRateByLine.get(lineId) ?? 0)
  const pctInt = !Number.isFinite(pctIntRaw) || pctIntRaw < 0 ? 0 : pctIntRaw
  const provBase = amount / (1 + pctInt)
  const intBase = amount - provBase
  const terms = lineId === null ? undefined : budgetPlanningStore.internmentTermsByLine.get(lineId)
  let coveredPct = 0
  if (terms && terms.length) {
    for (const term of terms) {
      const paymentPct = Number(term.payment_pct)
      if (Number.isFinite(paymentPct)) coveredPct += paymentPct
    }
  } else {
    coveredPct = 1 // BR-INT-04 (espejo E6): sin términos ⇒ 100 % en la ancla
  }
  const importVat = ivaOf(provBase, true)
  const internmentVat = intBase > 0 ? ivaOf(intBase * coveredPct, true) : 0
  const totalVat = importVat + internmentVat
  if (totalVat <= 0) return null
  return {
    label: `+IVA ${formatMoney(totalVat)}`,
    title:
      `IVA esperado de la importación (se paga en las fechas del Flujo): ${formatMoney(totalVat)} · ` +
      `importación ${formatMoney(importVat)} + internación ${formatMoney(internmentVat)}. ` +
      `Salida bruta de caja: ${formatMoney(amount + totalVat)}.`
  }
}

/** Comparador original del FE-S4, ahora parametrizado por sección (FD-7). */
function sortRows(rows, sortKey, sortAsc) {
  const accessor = SORT_ACCESSORS[sortKey]
  if (!accessor) return rows
  const direction = sortAsc ? 1 : -1
  return [...rows].sort((a, b) => {
    const valA = accessor(a)
    const valB = accessor(b)
    const cmp =
      typeof valA === 'number' && typeof valB === 'number'
        ? valA - valB
        : String(valA).localeCompare(String(valB), 'es')
    if (cmp !== 0) return cmp * direction
    return a.id_budget_line - b.id_budget_line
  })
}

/**
 * Vista de sección 100 % memoizada sobre la caché del store (NFR-FD-4):
 * `all` = todas las del tipo (cabecera/subtotal, ignora filtros — AC-FD-9);
 * `visible` = filtro → orden → slice (tabla y `tfoot`).
 */
function buildSection(type) {
  const state = sectionState[type]
  const all = computed(() => lines.value.filter((line) => line.line_type === type))
  const filtered = computed(() => {
    const query = state.query.trim().toLowerCase()
    const collectionId = state.idCollection ? Number(state.idCollection) : null
    return all.value.filter((line) => {
      if (collectionId !== null && (line.id_collection ?? null) !== collectionId) return false
      if (!query) return true
      const haystack = `${budgetPlanningStore.costCenterLabel(line.id_cost_center)} ${
        line.description ?? ''
      }`.toLowerCase()
      return haystack.includes(query)
    })
  })
  const sorted = computed(() => sortRows(filtered.value, state.sortKey, state.sortAsc))
  const visible = computed(() => sorted.value.slice(0, state.visibleCount))
  const subtotal = computed(() => sumAmount(all.value))
  const visibleSubtotal = computed(() => sumAmount(visible.value))
  // FE-S14: Σ del tfoot sobre el slice visible (solo se usan con el modo ON;
  // con OFF el DOM no las monta — cero costo visual, AC-FE14-1).
  const visibleIva = computed(() => sumIva(visible.value))
  const visibleBruto = computed(() => sumBruto(visible.value))
  const hasMore = computed(() => sorted.value.length > visible.value.length)
  return {
    state,
    all,
    filtered,
    sorted,
    visible,
    subtotal,
    visibleSubtotal,
    visibleIva,
    visibleBruto,
    hasMore
  }
}

/** Strings literales §3.1/§3.2 de FE-S4D + tercera sección FE-S9 §2.3. */
const SECTIONS = reactive(
  [
    {
      type: 'income',
      title: 'Ingresos',
      chipClass: 'gl-chip-income',
      addLabel: '+ Añadir ingreso',
      tableLabel: 'Líneas de ingresos del escenario',
      emptyText: "Sin ingresos en este escenario. Usa '+ Añadir ingreso'."
    },
    {
      type: 'expense',
      title: 'Gastos',
      chipClass: 'gl-chip-expense',
      addLabel: '+ Añadir gasto',
      tableLabel: 'Líneas de gastos del escenario',
      emptyText: "Sin gastos en este escenario. Usa '+ Añadir gasto'."
    },
    {
      type: 'purchase',
      title: 'Compras',
      chipClass: 'gl-chip-purchase',
      addLabel: '+ Añadir compra',
      tableLabel: 'Líneas de compras (importaciones) del escenario',
      emptyText: "Sin compras en este escenario. Usa '+ Añadir compra'."
    }
  ].map((meta) => {
    const vm = buildSection(meta.type)
    return { ...meta, state: vm.state, vm }
  })
)

/**
 * Clase del chip por `line_type` (FE-S9 §2.3: el ternario duro income/expense
 * se convierte en lookup; una compra ya no hereda el rojo de gasto). La
 * ETIQUETA siempre fluyó de `LINE_TYPE_LABELS` (agnóstico de tipo).
 */
const LINE_CHIP_CLASS_BY_TYPE = {
  income: 'gl-chip-income',
  expense: 'gl-chip-expense',
  purchase: 'gl-chip-purchase'
}

const HINT_TEXT =
  'Doble clic en un monto para editarlo; ✏️ para el resto de campos. Las variables corríjalas con ✏️ (tasa/fechas).'

/* ---------------------------- modales (dueño) ------------------------------ */

const formOpen = ref(false)
const formMode = ref('create')
const formType = ref('income')
const formLine = ref(null)
const deleteOpen = ref(false)
const deleteLineRef = ref(null)
/** Última acción de modal abierta ('create' | 'edit') para el toast de éxito. */
const lastFormAction = ref('create')

/**
 * Tipo INICIAL fijado por la sección (FD-6). FE-S9 §2.2: el modal muestra
 * ahora un selector de tipo (Ingreso/Gasto/Compra) PRECARGADO con el tipo de
 * la sección; el grid sigue siendo dueño del `line-type` con el que abre.
 */
function openCreate(section) {
  formMode.value = 'create'
  formType.value = section.type
  formLine.value = null
  lastFormAction.value = 'create'
  formOpen.value = true
}

function openEdit(line) {
  formMode.value = 'edit'
  formType.value = line.line_type
  formLine.value = line
  lastFormAction.value = 'edit'
  formOpen.value = true
}

function openDelete(line) {
  deleteLineRef.value = line
  deleteOpen.value = true
}

/**
 * Éxito del modal crear/editar. FE-S7 §3 (BE-S7 §2, D-S7-6): el toast de
 * desdoble de FE-S5 (FD5-5) se ELIMINA — el 201 volvió a ser `BudgetLine`
 * puro (un gasto fijo entra en una sola línea con su `payment_date`,
 * AC-S7-FE-5) y el modal ya solo emite `saved(line)`; el argumento queda
 * fuera porque el cuerpo no lo consume (`no-unused-vars`). El store ya
 * actualizó la caché in-place: sección y Σ se recalculan solos por
 * reactividad (AC-FE-6). AC-FD-11 intacto: el modal se cerró con
 * `resetForm()` propio, sin estado residual al reabrir.
 */
function onLineSaved() {
  formOpen.value = false
  formLine.value = null
  alertService.generalSucces(
    lastFormAction.value === 'edit' ? 'Línea actualizada.' : 'Línea añadida al escenario.'
  )
}

function onLineDeleted() {
  deleteOpen.value = false
  deleteLineRef.value = null
  alertService.generalSucces('Línea eliminada del escenario.')
}

/**
 * Fila bloqueada para ✏️/🗑 mientras tenga CUALQUIER mutación en vuelo: su PUT
 * de celda (`cellSaving`, AC-FD-10) o su POST/PUT/DELETE de línea
 * (`lineSaving`, dueño: las acciones del store).
 */
function lineBusy(idBudgetLine) {
  return (
    Boolean(budgetPlanningStore.cellSaving[idBudgetLine]) ||
    Boolean(budgetPlanningStore.lineSaving[idBudgetLine])
  )
}

/**
 * FE-S14-IVA §5: toggle del flag `Con IVA` de una fila EXPENSE ⇒ PUT PARCIAL
 * `{ has_iva }` sobre `/budget/planning/line/{id}` (dueño del flag
 * `lineSaving` y del cache-in-place: la respuesta reemplaza la línea, las
 * columnas IVA/Total re-pivotan por reactividad y el settlement llega
 * debounced desde el store — AC-FE14-2, ≤ 1 request nuevo). El checkbox es
 * ONE-WAY (`:checked`): si el request falla vuelve a leer la caché (jamás
 * queda marcado lo que el servidor no aceptó). 404 de línea: el store ya
 * resincronizó el detalle (`lineGone`); otros fallos ⇒ toast simple.
 * @param {object} line
 * @param {Event} event
 */
async function onIvaFlagChange(line, event) {
  const next = event.target.checked
  const result = await budgetPlanningStore.updateScenarioLine(line.id_budget_line, {
    has_iva: next
  })
  if (result.ok || result.kind === 'auth' || result.kind === 'busy') return
  alertService.generalError(result.message || 'No se pudo guardar el flag de IVA. Reintenta.')
}

/* --------------------- edición de celda (stack FE-S4, verbatim) ------------ */

/** Celda bloqueada mientras su PUT está en vuelo (guard por línea, AC-FE-8). */
function cellBusy(idBudgetLine) {
  return Boolean(budgetPlanningStore.cellSaving[idBudgetLine])
}

/** §8.2: solo líneas `fixed` editables por celda (las variables llevan tasa). */
function isEditable(line) {
  return line.behavior_type === 'fixed'
}

function displayAmount(line) {
  const id = line.id_budget_line
  return id in cellOverrides ? cellOverrides[id] : Number(line.projected_amount)
}

function cellLabel(line) {
  return `Monto ${budgetPlanningStore.costCenterLabel(line.id_cost_center)} — ${line.budget_date}`
}

function cellTitle(line) {
  const id = line.id_budget_line
  if (cellStatus[id] === 'error' && cellMessages[id]) return cellMessages[id]
  if (!isEditable(line)) return 'línea variable: edítela con ✏️ (tasa/fechas)'
  if (cellStatus[id] === 'saved') return 'Guardado ✓'
  return 'Doble clic o Enter para editar el monto'
}

async function startEdit(line) {
  if (!isEditable(line) || cellBusy(line.id_budget_line)) return
  // Una edición previa abierta con valor INVÁLIDO (el blur no cerró porque
  // no se disparó PUT) se descarta al abrir otra celda: jamás bloquea la rejilla.
  if (editingId.value !== null && !editInvalid.value) return
  editingId.value = line.id_budget_line
  editValue.value = String(line.projected_amount ?? '')
  editInvalid.value = false
  editMessage.value = ''
  await nextTick()
  const input = document.getElementById(`cell-input-${line.id_budget_line}`)
  if (input) {
    input.focus()
    input.select()
  }
}

function onCellKeydown(event, line) {
  if (event.key === 'Enter') {
    event.preventDefault()
    startEdit(line)
  }
}

function cancelEdit() {
  editingId.value = null
  editValue.value = ''
  editInvalid.value = false
  editMessage.value = ''
}

/**
 * Mensaje legible según §9 para la celda ofensora: 422 → mensaje del backend
 * inline; network/5xx → "valor revertido"; 403 → permiso; resto → genérico.
 */
function cellErrorMessage(result) {
  if (result.kind === 'validation' && result.message) return result.message
  if (result.kind === 'network') return 'Sin conexión: valor revertido.'
  if (result.kind === 'server') return 'El servidor no pudo guardar: valor revertido.'
  if (result.kind === 'forbidden') return 'No tiene permiso para editar esta celda.'
  if (result.kind === 'notfound') return 'La línea ya no existe; recargue el escenario.'
  return 'No se pudo guardar: valor revertido.'
}

function markSaved(idBudgetLine) {
  cellStatus[idBudgetLine] = 'saved'
  delete cellMessages[idBudgetLine]
  const previous = savedTimers.get(idBudgetLine)
  if (previous) clearTimeout(previous)
  savedTimers.set(
    idBudgetLine,
    setTimeout(() => {
      if (cellStatus[idBudgetLine] === 'saved') cellStatus[idBudgetLine] = ''
      savedTimers.delete(idBudgetLine)
    }, 1500)
  )
}

/**
 * Cierre de edición con disparo único del PUT (NFR-F2: Enter dispara el PUT y
 * el blur posterior no encuentra edición abierta, o viceversa — jamás dos
 * requests por la misma edición).
 */
async function commitEdit(line) {
  if (editingId.value !== line.id_budget_line) return

  const parsed = parseCellAmount(editValue.value)
  if (!parsed.valid) {
    editInvalid.value = true
    editMessage.value = 'Debe ser un número mayor o igual que 0.'
    return
  }

  const original = Number(line.projected_amount)
  if (parsed.value === original) {
    // Sin cambio: no se contamina el servidor (PUT ≤ 1 por edición real).
    cancelEdit()
    return
  }

  const id = line.id_budget_line
  cancelEdit()
  cellOverrides[id] = parsed.value
  cellStatus[id] = 'saving'
  delete cellMessages[id]

  const result = await budgetPlanningStore.updateCell(id, parsed.value)
  delete cellOverrides[id]

  if (result.ok) {
    markSaved(id)
    return
  }

  if (result.kind === 'auth' || result.kind === 'busy') {
    cellStatus[id] = ''
    return
  }

  // Rollback visual: el override se borró y la celda vuelve a leer la caché.
  cellStatus[id] = 'error'
  cellMessages[id] = cellErrorMessage(result)
}

function clearTimers() {
  for (const timer of savedTimers.values()) clearTimeout(timer)
  savedTimers.clear()
}

onBeforeUnmount(clearTimers)
</script>

<template>
  <div class="gl-zone">
    <section
      v-for="section in SECTIONS"
      :key="section.type"
      class="gl-group"
      :data-type="section.type"
    >
      <header class="gl-group-header">
        <div class="gl-group-heading">
          <span class="gl-chip" :class="section.chipClass">{{ section.title }}</span>
          <span class="gl-group-sub" aria-live="polite">
            {{ section.vm.all.length }} líneas · Σ {{ formatMoney(section.vm.subtotal) }}
          </span>
        </div>
        <p class="gl-count" aria-live="polite">
          {{ section.vm.visible.length }} de {{ section.vm.filtered.length }} líneas
        </p>
      </header>

      <p class="gl-hint">{{ HINT_TEXT }}</p>

      <div class="gl-section-toolbar">
        <input
          v-model="section.state.query"
          class="gl-filter-input"
          type="text"
          autocomplete="off"
          placeholder="Filtrar por CECO o concepto…"
          :aria-label="`Filtrar ${section.title} por CECO o concepto`"
        />
        <select
          v-model="section.state.idCollection"
          class="gl-filter-select"
          :aria-label="`Filtrar ${section.title} por temporada`"
        >
          <option value="">Todas las temporadas</option>
          <option
            v-for="collection in budgetPlanningStore.collections"
            :key="collection.id_collection"
            :value="String(collection.id_collection)"
          >
            {{ collection.short_collection_name }}
          </option>
        </select>
        <button type="button" class="btn btn-primary btn-sm gl-add" @click="openCreate(section)">
          {{ section.addLabel }}
        </button>
      </div>

      <p v-if="!section.vm.all.length" class="gl-empty">{{ section.emptyText }}</p>

      <div v-else class="gl-scroll">
        <table class="gl-table" :aria-label="section.tableLabel">
          <thead>
            <tr>
              <th
                v-for="column in SORT_COLUMNS"
                :key="column.key"
                class="sortable-th"
                :class="{ 'gl-col-money': column.key === 'projected_amount' }"
                :aria-sort="ariaSort(section.state, column.key)"
                @click="sortBy(section.state, column.key)"
              >
                <div class="th-content">
                  <span>{{ column.label }}</span>
                  <svg
                    v-if="section.state.sortKey === column.key"
                    class="sort-arrow"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      fill-rule="evenodd"
                      clip-rule="evenodd"
                      :d="section.state.sortAsc ? SORT_ARROW_UP_PATH : SORT_ARROW_DOWN_PATH"
                    />
                  </svg>
                </div>
              </th>
              <!-- FE-S14-IVA §5 (solo con el modo ON): checkbox por fila en
                   Gastos, luego las columnas bruto de Ingresos y Gastos. Con
                   el modo OFF estos `th` no existen ⇒ DOM idéntico al FE-S9. -->
              <th v-if="showFlagColumn(section.type)" class="gl-col-ivaflag">Con IVA</th>
              <template v-if="showIvaColumns(section.type)">
                <th class="gl-col-iva">IVA</th>
                <th class="gl-col-iva">Total</th>
              </template>
              <th class="gl-col-actions">Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="line in section.vm.visible" :key="line.id_budget_line">
              <td
                class="gl-cell-ceco"
                :title="budgetPlanningStore.costCenterLabel(line.id_cost_center)"
              >
                {{ budgetPlanningStore.costCenterLabel(line.id_cost_center) }}
              </td>
              <td class="gl-cell-date">{{ line.budget_date }}</td>
              <td class="gl-cell-date">{{ line.payment_date || '—' }}</td>
              <td class="gl-cell-desc" :title="line.description || ''">
                {{ line.description || '—' }}
              </td>
              <td>
                <span class="gl-chip" :class="LINE_CHIP_CLASS_BY_TYPE[line.line_type] || 'gl-chip'">
                  {{ LINE_TYPE_LABELS[line.line_type] || line.line_type }}
                </span>
                <span
                  v-if="line.behavior_type !== 'fixed'"
                  class="gl-chip gl-chip-var"
                  :title="`Comportamiento: ${BEHAVIOR_LABELS[line.behavior_type] || line.behavior_type}`"
                >
                  {{ BEHAVIOR_LABELS[line.behavior_type] || line.behavior_type }}
                </span>
              </td>
              <td>{{ budgetPlanningStore.collectionLabel(line.id_collection) }}</td>
              <td
                class="gl-cell-money"
                :class="{
                  'is-editable': isEditable(line),
                  'is-readonly': !isEditable(line),
                  'is-saving': cellStatus[line.id_budget_line] === 'saving',
                  'is-saved': cellStatus[line.id_budget_line] === 'saved',
                  'is-error': cellStatus[line.id_budget_line] === 'error'
                }"
                :tabindex="isEditable(line) ? 0 : -1"
                :aria-label="cellLabel(line)"
                :aria-describedby="`cell-note-${line.id_budget_line}`"
                :title="cellTitle(line)"
                role="gridcell"
                @dblclick="startEdit(line)"
                @keydown="onCellKeydown($event, line)"
              >
                <input
                  v-if="editingId === line.id_budget_line"
                  :id="`cell-input-${line.id_budget_line}`"
                  v-model="editValue"
                  class="gl-input"
                  :class="{ 'is-invalid': editInvalid }"
                  type="text"
                  inputmode="decimal"
                  autocomplete="off"
                  aria-label="Nuevo monto de la celda"
                  :aria-invalid="editInvalid ? 'true' : 'false'"
                  @keydown.enter.prevent="commitEdit(line)"
                  @keydown.esc.prevent="cancelEdit"
                  @blur="commitEdit(line)"
                />
                <span v-else class="gl-amount">{{ formatMoney(displayAmount(line)) }}</span>
                <!-- FE-S14-IVA §4.1 (fila Cuadrícula Compras, solo modo ON): IVA
                     esperado = prov×0.19 + Σ cuotas_int×0.19 con tooltip
                     desglosado; la compra ya muestra su TOTAL, sin columnas
                     nuevas. Con modo OFF o catálogo caído `purchaseIvaHint` es
                     `null` ⇒ DOM idéntico al FE-S9 (AC-FE14-1). -->
                <span
                  v-if="editingId !== line.id_budget_line && purchaseIvaHint(line)"
                  class="gl-iva-hint"
                  :title="purchaseIvaHint(line).title"
                  >{{ purchaseIvaHint(line).label }}</span
                >
                <span
                  v-if="cellStatus[line.id_budget_line] === 'saving'"
                  class="gl-state gl-state-saving"
                  aria-hidden="true"
                >
                  guardando…
                </span>
                <span
                  v-else-if="cellStatus[line.id_budget_line] === 'saved'"
                  class="gl-state gl-state-saved"
                  aria-hidden="true"
                >
                  ✓
                </span>
                <span
                  v-if="editInvalid && editingId === line.id_budget_line"
                  class="gl-state gl-state-error"
                >
                  !
                </span>
                <p :id="`cell-note-${line.id_budget_line}`" class="gl-cell-note" aria-live="polite">
                  <template v-if="editingId === line.id_budget_line && editInvalid">
                    {{ editMessage }}
                  </template>
                  <template v-else-if="cellStatus[line.id_budget_line] === 'error'">
                    {{ cellMessages[line.id_budget_line] }}
                  </template>
                </p>
              </td>
              <!-- FE-S14-IVA: checkbox `Con IVA` etiquetado (SOLO EXPENSE,
                   modo ON; NFR-FE14-4). `has_iva === NULL` ⇒ marcado + badge
                   con el literal §5 "Asumido con IVA — edítalo si no"
                   (AC-FE14-4, D-S10-3). Un solo PUT parcial `{ has_iva }`;
                   el dueño del flag `lineSaving` es la acción del store. -->
              <td v-if="showFlagColumn(section.type)" class="gl-cell-ivaflag">
                <label class="gl-iva-check">
                  <input
                    type="checkbox"
                    class="gl-iva-input"
                    :checked="lineChargesIva(line)"
                    :disabled="lineBusy(line.id_budget_line)"
                    @change="onIvaFlagChange(line, $event)"
                  />
                  <span class="gl-iva-check-text">Con IVA</span>
                  <span
                    v-if="isAsumidoFlag(line)"
                    class="gl-iva-badge"
                    title="El archivo no trajo la columna Con IVA: asumido gravado (D-S10-3)"
                    >Asumido con IVA — edítalo si no</span
                  >
                </label>
              </td>
              <template v-if="showIvaColumns(section.type)">
                <td class="gl-cell-money gl-cell-iva">
                  {{ lineChargesIva(line) ? formatMoney(ivaAmountFor(line)) : '—' }}
                </td>
                <td class="gl-cell-money gl-cell-bruto">{{ formatMoney(totalFor(line)) }}</td>
              </template>
              <td class="gl-cell-actions">
                <button
                  type="button"
                  class="btn-icon-sm"
                  title="Editar línea"
                  :disabled="lineBusy(line.id_budget_line)"
                  :aria-label="`Editar línea ${budgetPlanningStore.costCenterLabel(line.id_cost_center)} ${line.budget_date}`"
                  @click="openEdit(line)"
                >
                  ✏️
                </button>
                <button
                  type="button"
                  class="btn-icon-sm"
                  title="Eliminar línea"
                  :disabled="lineBusy(line.id_budget_line)"
                  :aria-label="`Eliminar línea ${budgetPlanningStore.costCenterLabel(line.id_cost_center)} ${line.budget_date}`"
                  @click="openDelete(line)"
                >
                  🗑
                </button>
              </td>
            </tr>
            <tr v-if="!section.vm.visible.length" class="gl-row-nomatch">
              <td
                :colspan="
                  SORT_COLUMNS.length +
                  1 +
                  (showFlagColumn(section.type) ? 1 : 0) +
                  (showIvaColumns(section.type) ? 2 : 0)
                "
                class="gl-no-match"
              >
                Sin coincidencias con los filtros aplicados.
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th colspan="6" class="gl-foot-label">Σ visible</th>
              <td class="gl-cell-money" aria-live="polite">
                {{ formatMoney(section.vm.visibleSubtotal) }}
              </td>
              <!-- FE-S14-IVA: Σ IVA y Σ bruto del slice visible (modo ON). -->
              <td v-if="showFlagColumn(section.type)"></td>
              <template v-if="showIvaColumns(section.type)">
                <td class="gl-cell-money gl-cell-iva" aria-live="polite">
                  {{ formatMoney(section.vm.visibleIva) }}
                </td>
                <td class="gl-cell-money gl-cell-bruto" aria-live="polite">
                  {{ formatMoney(section.vm.visibleBruto) }}
                </td>
              </template>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div v-if="section.vm.hasMore" class="gl-more">
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          @click="section.state.visibleCount += PAGE_SLICE"
        >
          Mostrar 500 más
        </button>
      </div>
    </section>

    <LineFormModal
      :open="formOpen"
      :mode="formMode"
      :line="formLine"
      :scenario="scenario"
      :line-type="formType"
      @saved="onLineSaved"
      @close="formOpen = false"
    />
    <LineDeleteModal
      :open="deleteOpen"
      :line="deleteLineRef"
      @deleted="onLineDeleted"
      @close="deleteOpen = false"
    />
  </div>
</template>

<style scoped>
.gl-zone {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* Sección (Ingresos/Gastos): contenedor apilado (§3.1). */
.gl-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.gl-group-header {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: baseline;
  justify-content: space-between;
}

.gl-group-heading {
  display: flex;
  gap: 8px;
  align-items: baseline;
}

.gl-group-sub {
  font-size: 0.74rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-secondary, #555555);
}

.gl-hint {
  margin: 0;
  font-size: 0.78rem;
  color: var(--color-text-secondary, #555555);
}

.gl-count {
  margin: 0;
  font-size: 0.74rem;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-muted, #8a8a8a);
}

.gl-section-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.gl-filter-input,
.gl-filter-select {
  width: auto;
  max-width: 240px;
  min-width: 150px;
  margin: 0;
  padding: 6px 8px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 6px;
  background-color: var(--color-surface-card, #ffffff);
  font-size: 0.78rem;
  color: var(--color-text-primary, #070707);
  box-sizing: border-box;
}

.gl-filter-input:focus,
.gl-filter-select:focus {
  border-color: var(--color-brand, #03658c);
  outline: 2px solid rgba(3, 101, 140, 0.25);
}

/* "+ Añadir ingreso/gasto": NUNCA deshabilitado, ni con sección vacía (§3.1). */
.gl-add {
  margin-left: auto;
}

.gl-scroll {
  max-height: 62vh;
  overflow: auto;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 8px;
  background-color: var(--color-surface-card, #ffffff);
}

.gl-table {
  min-width: 1140px;
  border: none;
  border-radius: 0;
  box-shadow: none;
  font-size: 0.8rem;
}

.gl-table thead th {
  position: sticky;
  top: 0;
  z-index: 3;
}

.gl-table thead th.sortable-th {
  cursor: pointer;
  user-select: none;
  transition: background-color 0.2s;
}

.gl-table thead th.sortable-th:hover {
  background-color: rgba(3, 101, 140, 0.08);
}

.th-content {
  display: flex;
  align-items: center;
  justify-content: inherit;
  gap: 4px;
}

.sort-arrow {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  color: var(--color-brand, #03658c);
}

/*
 * Regla aprendida (FE-S4C §6.2, misma que `cf-table`/`pv-table`): el
 * `th { color: #ffffff }` global de `main.css` debe sobreescribirse en los
 * `th` que pintan sobre superficie clara ⇒ la nueva columna Acciones y la
 * etiqueta del `tfoot` usan `--color-text-primary` (se adapta sola al tema
 * oscuro).
 */
.gl-table thead th.gl-col-actions,
.gl-table tfoot th.gl-foot-label {
  color: var(--color-text-primary, #070707);
}

.gl-col-actions {
  min-width: 96px;
  text-align: center;
}

.gl-table tfoot th.gl-foot-label,
.gl-table tfoot td {
  font-weight: 700;
  background-color: var(--color-surface, #f7f7f7);
}

:root[data-theme='dark'] .gl-table tfoot th.gl-foot-label,
:root[data-theme='dark'] .gl-table tfoot td {
  background-color: rgba(255, 255, 255, 0.05);
}

.gl-foot-label {
  font-size: 0.72rem;
  text-align: right;
}

.gl-cell-ceco,
.gl-cell-desc {
  max-width: 240px;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gl-cell-date {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.gl-chip {
  display: inline-block;
  margin-right: 4px;
  padding: 2px 8px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 600;
  white-space: nowrap;
}

.gl-chip-income {
  border-color: rgba(46, 164, 79, 0.45);
  background-color: rgba(46, 164, 79, 0.1);
  color: #22683a;
}

:root[data-theme='dark'] .gl-chip-income {
  color: #7bd89a;
}

.gl-chip-expense {
  border-color: rgba(197, 48, 48, 0.35);
  background-color: rgba(197, 48, 48, 0.08);
  color: #9b2222;
}

:root[data-theme='dark'] .gl-chip-expense {
  color: #ff9b9b;
}

/* FE-S9 §2.3: chip de compra (familia ámbar del módulo — misma del chip ⊘
   de Flujo y de la fila "Bodega estimada"). */
.gl-chip-purchase {
  border-color: rgba(180, 83, 9, 0.4);
  background-color: rgba(245, 158, 11, 0.1);
  color: #96590a;
}

:root[data-theme='dark'] .gl-chip-purchase {
  color: #f6c177;
}

.gl-chip-var {
  border-color: rgba(20, 161, 217, 0.45);
  background-color: rgba(20, 161, 217, 0.1);
  color: #14718f;
}

:root[data-theme='dark'] .gl-chip-var {
  color: #7fd4ef;
}

/* Celda de monto: editable (input a mano alzada) vs read-only */

.gl-cell-money {
  position: relative;
  min-width: 168px;
  text-align: right;
}

.gl-cell-money.is-editable {
  cursor: cell;
}

.gl-cell-money.is-editable:hover {
  background-color: rgba(3, 101, 140, 0.06);
}

.gl-cell-money.is-editable:focus-visible {
  outline: 2px solid var(--color-brand, #03658c);
  outline-offset: -2px;
}

.gl-cell-money.is-readonly .gl-amount {
  color: var(--color-text-muted, #8a8a8a);
}

.gl-cell-money.is-saved {
  background-color: rgba(46, 164, 79, 0.08);
}

.gl-cell-money.is-error {
  background-color: rgba(197, 48, 48, 0.07);
}

.gl-amount {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.gl-input {
  width: 130px;
  margin: 0;
  padding: 4px 8px;
  border: 1px solid var(--color-brand, #03658c);
  border-radius: 5px;
  background-color: var(--color-surface-card, #ffffff);
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-primary, #070707);
  text-align: right;
  box-sizing: border-box;
}

.gl-input.is-invalid {
  border-color: #c53030;
  outline: 2px solid rgba(197, 48, 48, 0.25);
}

.gl-state {
  margin-left: 6px;
  font-size: 0.68rem;
  font-weight: 600;
  white-space: nowrap;
}

.gl-state-saving {
  color: var(--color-text-muted, #8a8a8a);
}

.gl-state-saved {
  color: #2ea44f;
}

.gl-state-error {
  color: #c53030;
}

.gl-cell-note {
  min-height: 0;
  margin: 2px 0 0;
  font-size: 0.68rem;
  font-weight: 500;
  line-height: 1.3;
  color: #c53030;
  text-align: right;
  white-space: normal;
}

:root[data-theme='dark'] .gl-cell-note {
  color: #ff8f8f;
}

/* Columna Acciones (FE-S4D §3.1): botones ✏️/🗑 por fila. */
.gl-cell-actions {
  width: 96px;
  white-space: nowrap;
}

.btn-icon-sm {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin: 0 2px;
  padding: 0;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 6px;
  background-color: transparent;
  font-size: 0.85rem;
  line-height: 1;
  color: var(--color-text-primary, #070707);
  cursor: pointer;
  transition: background-color 0.2s ease;
  box-sizing: border-box;
}

.btn-icon-sm:hover:not(:disabled) {
  background-color: rgba(3, 101, 140, 0.08);
}

.btn-icon-sm:focus-visible {
  outline: 2px solid var(--color-brand, #03658c);
  outline-offset: 1px;
}

.btn-icon-sm:disabled {
  cursor: not-allowed;
  background-color: transparent;
  opacity: 0.4;
}

.gl-no-match {
  padding: 16px;
  font-size: 0.78rem;
  color: var(--color-text-muted, #8a8a8a);
}

.gl-empty {
  margin: 0;
  padding: 22px 16px;
  border: 1px dashed var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 8px;
  font-size: 0.84rem;
  color: var(--color-text-muted, #8a8a8a);
  text-align: center;
}

.gl-more {
  display: flex;
  justify-content: center;
}

/* ───────── FE-S14-IVA: flag `Con IVA` + columnas bruto (solo modo ON) ───────── */

/* Regla aprendida (FE-S4C §6.2): los `th` nuevos pintan sobre la banda clara
   del header ⇒ `--color-text-primary` (el `th { color:#fff }` de `main.css`
   los volvería invisibles en tema claro). */
.gl-table thead th.gl-col-ivaflag,
.gl-table thead th.gl-col-iva {
  color: var(--color-text-primary, #070707);
}

.gl-col-ivaflag {
  min-width: 190px;
  text-align: center;
}

.gl-col-iva {
  min-width: 128px;
  font-size: 0.72rem;
  font-weight: 600;
  text-align: right;
}

.gl-cell-ivaflag {
  white-space: nowrap;
}

.gl-iva-check {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  user-select: none;
}

.gl-iva-input {
  width: 15px;
  height: 15px;
  margin: 0;
  padding: 0;
  accent-color: var(--color-brand, #03658c);
  cursor: pointer;
}

.gl-iva-check:has(.gl-iva-input:disabled) {
  cursor: not-allowed;
  opacity: 0.55;
}

.gl-iva-check-text {
  font-size: 0.7rem;
  font-weight: 500;
  color: var(--color-text-secondary, #555555);
}

/* Badge NULL≡True (AC-FE14-4): familia ámbar "informativo", nunca roja. */
.gl-iva-badge {
  padding: 1px 7px;
  border: 1px solid rgba(180, 83, 9, 0.4);
  border-radius: 999px;
  background-color: rgba(245, 158, 11, 0.1);
  font-size: 0.62rem;
  font-weight: 600;
  white-space: nowrap;
  color: #96590a;
}

:root[data-theme='dark'] .gl-iva-badge {
  color: #f6c177;
}

/* Chip "IVA esperado" de COMPRAS (§4.1): informativo ámbar suave bajo el
   total, NUNCA compite con el monto (fonte menor, tabular). */
.gl-iva-hint {
  display: block;
  margin-top: 2px;
  font-size: 0.62rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: #96590a;
  cursor: help;
}

:root[data-theme='dark'] .gl-iva-hint {
  color: #f6c177;
}

.gl-cell-iva {
  min-width: 128px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}

.gl-cell-bruto {
  min-width: 140px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}
</style>
