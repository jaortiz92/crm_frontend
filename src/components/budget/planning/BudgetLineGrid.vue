<script setup>
/**
 * BudgetLineGrid — "Editor de Celdas" (FE-S4 §8.2 tab 2, PRINCIPAL).
 *
 * 1 fila = 1 `budget_line` leída de la caché del store (jamía de otra fuente:
 * por eso tras un PUT exitoso la Vista Ejecutiva se recalcula sola, AC-FE-6).
 * Solo la celda MONTO es editable: doble clic o `Enter` sobre la celda
 * (NFR-F5: `tabindex=0` + `aria-label`) → input numérico → `Enter`/blur
 * dispara UN solo `PUT /budget/planning/cell/{idBudgetLine}` (NFR-F2) con
 * micro-estados `guardando… → ✓ (~1.5 s) → normal`; en error hay
 * ROLLBACK visual al valor anterior (el valor mostrado sale de la caché +
 * override transitorio) y el mensaje queda bajo la celda (422 inline, §9).
 *
 * Validación pre-red (ASM-12): numérico, `>= 0`, finito; inválido → borde
 * rojo y NUNCA dispara el PUT. Filas `behavior_type !== 'fixed'`: monto de
 * solo lectura con tooltip (BR-CEL-01 backend también lo impediría).
 *
 * CERO dependencias: tabla HTML + estado de edición local (patrón del repo).
 * PQ-F5: sin virtualización; slice "Mostrar 500 más" para escenarios largos.
 */
import { computed, nextTick, onBeforeUnmount, reactive, ref } from 'vue'
import { useBudgetPlanningStore } from '@/stores/budgetPlanningStore.js'
import {
  BEHAVIOR_LABELS,
  LINE_TYPE_LABELS,
  formatMoney,
  parseCellAmount
} from './planningFormat.js'

const props = defineProps({
  /** `BudgetFull` + `parent_budget_name` de la caché del store. */
  scenario: { type: Object, required: true }
})

const budgetPlanningStore = useBudgetPlanningStore()

/** Paso de paginación manual por slice (PQ-F5). */
const PAGE_SLICE = 500

const visibleCount = ref(PAGE_SLICE)
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

/** Columna activa ('' = orden original del backend) y dirección. */
const sortKey = ref('')
const sortAsc = ref(true)

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
function sortBy(key) {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value
    return
  }
  sortKey.value = key
  sortAsc.value = true
}

const ariaSort = (key) => {
  if (sortKey.value !== key) return undefined
  return sortAsc.value ? 'ascending' : 'descending'
}

/** Orden reactivo sobre la caché (desempate por id: ordenación estable). */
const sortedLines = computed(() => {
  const rows = lines.value
  const accessor = SORT_ACCESSORS[sortKey.value]
  if (!accessor) return rows
  const direction = sortAsc.value ? 1 : -1
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
})

const visibleLines = computed(() => sortedLines.value.slice(0, visibleCount.value))

const totalLines = computed(() => lines.value.length)
const hasMore = computed(() => totalLines.value > visibleLines.value.length)

/** Celda bloqueada mientras su PUT está en vuelo (guard por línea, AC-FE-8). */
function cellBusy(idBudgetLine) {
  return Boolean(budgetPlanningStore.cellSaving[idBudgetLine])
}

/** §8.2: solo líneas `fixed` editables por celda (las variables se corrigen recargando). */
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
  if (!isEditable(line)) return 'línea variable: edítela recargando el escenario'
  if (cellStatus[id] === 'saved') return 'Guardado ✓'
  return 'Doble clic o Enter para editar el monto'
}

/* --------------------------------- edición -------------------------------- */

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
    <div class="gl-toolbar">
      <p class="gl-hint">
        Doble clic (o foco + Enter) sobre un <strong>Monto</strong> para editarlo; Enter o salir del
        campo guarda esa celda. Las líneas variables se corrigen recargando el escenario.
      </p>
      <p class="gl-count" aria-live="polite">
        {{ Math.min(visibleCount, totalLines) }} de {{ totalLines }} líneas
      </p>
    </div>

    <div class="gl-scroll">
      <table class="gl-table" aria-label="Editor de celdas del escenario">
        <thead>
          <tr>
            <th
              v-for="column in SORT_COLUMNS"
              :key="column.key"
              class="sortable-th"
              :class="{ 'gl-col-money': column.key === 'projected_amount' }"
              :aria-sort="ariaSort(column.key)"
              @click="sortBy(column.key)"
            >
              <div class="th-content">
                <span>{{ column.label }}</span>
                <svg
                  v-if="sortKey === column.key"
                  class="sort-arrow"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    :d="sortAsc ? SORT_ARROW_UP_PATH : SORT_ARROW_DOWN_PATH"
                  />
                </svg>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="line in visibleLines" :key="line.id_budget_line">
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
              <span
                class="gl-chip"
                :class="line.line_type === 'income' ? 'gl-chip-income' : 'gl-chip-expense'"
              >
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
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="!totalLines" class="gl-empty">
      Este escenario no tiene líneas. Cree el Presupuesto Base desde el dashboard con la carga anual
      SIIGO.
    </p>

    <div v-if="hasMore" class="gl-more">
      <button type="button" class="btn btn-secondary btn-sm" @click="visibleCount += PAGE_SLICE">
        Mostrar 500 más
      </button>
    </div>
  </div>
</template>

<style scoped>
.gl-zone {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.gl-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: baseline;
  justify-content: space-between;
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

.gl-scroll {
  max-height: 62vh;
  overflow: auto;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 8px;
  background-color: var(--color-surface-card, #ffffff);
}

.gl-table {
  min-width: 1040px;
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
</style>
