/**
 * useBudgetLineCellEdit — flujo de edición inline de celdas de meses del
 * "Editor de Celdas" (FE-S4 §8.2, stack VERBATIM FD-7/R-FD-1): doble clic o
 * `Enter` sobre MONTO (NFR-F5: `tabindex=0` + `aria-label`) → input →
 * `Enter`/blur dispara UN solo `PUT /budget/planning/cell/{id}` con
 * micro-estados `guardando… → ✓ (~1.5 s) → normal`, guard single-flight por
 * `cellSaving[id_budget_line]` (AC-FE-8) y ROLLBACK visual en error (422
 * inline, 404 con mensaje de recarga, §9).
 *
 * FASE 3: movido VERBATIM desde `BudgetLineGrid.vue` a composable. El STORE
 * (`budgetScenarioStore`) se INYECTA por parámetro —no se importa aquí— para
 * mantener el flujo testeable con un store falso; `rowKey` e `isSimulated`
 * también se inyectan porque son dominio de la rejilla (compartidos con los
 * chips, las acciones ✏️/🗑 y el flag IVA). El estado devuelto es el mismo que
 * antes era local al componente (mismas refs/reactives, mismo ciclo de vida:
 * el composable se crea UNA vez en el setup y limpia sus timers al desmontar).
 */
import { nextTick, onBeforeUnmount, reactive, ref } from 'vue'
import { parseCellAmount } from './planningFormat.js'

/**
 * Mensaje legible según §9 para la celda ofensora: 422 → mensaje del backend
 * inline; network/5xx → "valor revertido"; 403 → permiso; resto → genérico.
 * Función PURA (exportada para caracterización en `tests/`).
 * @param {{ kind?: string, message?: string }} result resultado clasificado de `updateCell`
 * @returns {string}
 */
export function cellErrorMessage(result) {
  if (result.kind === 'validation' && result.message) return result.message
  if (result.kind === 'network') return 'Sin conexión: valor revertido.'
  if (result.kind === 'server') return 'El servidor no pudo guardar: valor revertido.'
  if (result.kind === 'forbidden') return 'No tiene permiso para editar esta celda.'
  if (result.kind === 'notfound') return 'La línea ya no existe; recargue el escenario.'
  return 'No se pudo guardar: valor revertido.'
}

/**
 * @param {object} deps
 * @param {object} deps.store `budgetScenarioStore` (lee `cellSaving`, llama `updateCell`/`costCenterLabel`)
 * @param {(line: object) => string|number} deps.rowKey clave v-for estable de la fila
 * @param {(line: object) => boolean} deps.isSimulated `true` en proyecciones what-if (no editables)
 */
export function useBudgetLineCellEdit({ store, rowKey, isSimulated }) {
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

  /** Celda bloqueada mientras su PUT está en vuelo (guard por línea, AC-FE-8). */
  function cellBusy(idBudgetLine) {
    return Boolean(store.cellSaving[idBudgetLine])
  }

  /** §8.2: solo líneas `fixed` editables por celda (las variables llevan tasa). */
  function isEditable(line) {
    return line.behavior_type === 'fixed' && !isSimulated(line)
  }

  function displayAmount(line) {
    const id = line.id_budget_line
    return id in cellOverrides ? cellOverrides[id] : Number(line.projected_amount)
  }

  function cellLabel(line) {
    return `Monto ${store.costCenterLabel(line.id_cost_center)} — ${line.budget_date}`
  }

  function cellTitle(line) {
    const id = line.id_budget_line
    if (isSimulated(line)) {
      return line.source_engine === 'financing_credit_sim'
        ? 'Línea simulada de financiación (what-if): no editable'
        : 'Línea simulada de nómina (what-if): no editable'
    }
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
    editingId.value = rowKey(line)
    editValue.value = String(line.projected_amount ?? '')
    editInvalid.value = false
    editMessage.value = ''
    await nextTick()
    const input = document.getElementById(`cell-input-${rowKey(line)}`)
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
    if (editingId.value !== rowKey(line)) return

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

    const result = await store.updateCell(id, parsed.value)
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

  return {
    editingId,
    editValue,
    editInvalid,
    editMessage,
    cellStatus,
    cellMessages,
    cellOverrides,
    cellBusy,
    isEditable,
    displayAmount,
    cellLabel,
    cellTitle,
    startEdit,
    onCellKeydown,
    cancelEdit,
    commitEdit
  }
}
