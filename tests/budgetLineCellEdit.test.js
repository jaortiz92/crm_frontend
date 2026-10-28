/**
 * Tests de CARACTERIZACIÓN del composable `useBudgetLineCellEdit.js` (FASE 3
 * de la refactorización del módulo de Planeación): el stack de edición inline
 * de celdas del "Editor de Celdas" (FE-S4 §8.2) movido verbatim desde
 * `BudgetLineGrid.vue`.
 *
 * Se cubren:
 *  - `cellErrorMessage` (helper PURO exportado): mapeo §9 de resultados
 *    clasificados del store a mensajes inline.
 *  - El flujo `startEdit` → `commitEdit` contra un STORE FALSO (inyección
 *    explícita del composable, cero Pinia/cero HTTP): UN solo PUT por edición
 *    real (NFR-F2, dedupe Enter/blur), sin PUT cuando el valor no cambió,
 *    validación local sin request (ASM-12), micro-estado `saved` ~1.5 s y
 *    ROLLBACK visual en error.
 *
 * Estilo de la carpeta `tests/`: `vi.fn` como store falso, datos literales,
 * `vi.useFakeTimers` para el timer del ✓. El composable se monta dentro de un
 * componente efímero (`@vue/test-utils`, patrón de `carrydrill.*.test.js`)
 * para que `onBeforeUnmount` tenga instancia real y no llueva warnings.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import {
  cellErrorMessage,
  useBudgetLineCellEdit
} from '@/components/budget/planning/useBudgetLineCellEdit.js'

/** Store falso: solo lo que el composable consume (`cellSaving`, `updateCell`). */
const fakeStore = () => ({
  cellSaving: {},
  updateCell: vi.fn(async () => ({ ok: true, data: {} })),
  costCenterLabel: (id) => `CECO-${id}`
})

/** Línea fija persistida típica del grid. */
const line = (overrides = {}) => ({
  id_budget_line: 42,
  behavior_type: 'fixed',
  projected_amount: 100,
  budget_date: '2026-03-01',
  id_cost_center: 7,
  ...overrides
})

/** Monta el composable en un componente efímero y devuelve { cell, store }. */
const setup = (store = fakeStore()) => {
  let cell
  mount(
    defineComponent({
      setup() {
        cell = useBudgetLineCellEdit({
          store,
          rowKey: (l) => l.id_budget_line,
          isSimulated: (l) => l.is_simulated === true
        })
        return () => null
      }
    })
  )
  return { cell, store }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('cellErrorMessage — mapeo §9 (función pura)', () => {
  it('422 validation con mensaje del backend → mensaje inline', () => {
    expect(cellErrorMessage({ kind: 'validation', message: 'El monto excede el máximo.' })).toBe(
      'El monto excede el máximo.'
    )
  })
  it('validation SIN mensaje → cae al genérico', () => {
    expect(cellErrorMessage({ kind: 'validation' })).toBe('No se pudo guardar: valor revertido.')
  })
  it('network → "Sin conexión: valor revertido."', () => {
    expect(cellErrorMessage({ kind: 'network' })).toBe('Sin conexión: valor revertido.')
  })
  it('server (5xx) → "El servidor no pudo guardar: valor revertido."', () => {
    expect(cellErrorMessage({ kind: 'server' })).toBe(
      'El servidor no pudo guardar: valor revertido.'
    )
  })
  it('forbidden (403) → mensaje de permiso', () => {
    expect(cellErrorMessage({ kind: 'forbidden' })).toBe(
      'No tiene permiso para editar esta celda.'
    )
  })
  it('notfound (404) → mensaje de recarga', () => {
    expect(cellErrorMessage({ kind: 'notfound' })).toBe(
      'La línea ya no existe; recargue el escenario.'
    )
  })
  it('auth y kinds desconocidos → genérico (nunca llegan a pintarse en el flujo normal)', () => {
    expect(cellErrorMessage({ kind: 'auth' })).toBe('No se pudo guardar: valor revertido.')
    expect(cellErrorMessage({})).toBe('No se pudo guardar: valor revertido.')
  })
})

describe('useBudgetLineCellEdit — flujo de edición contra store falso', () => {
  it('startEdit precarga el valor crudo de la línea y habilita la edición', async () => {
    const { cell } = setup()
    await cell.startEdit(line())
    expect(cell.editingId.value).toBe(42)
    expect(cell.editValue.value).toBe('100')
    expect(cell.editInvalid.value).toBe(false)
    expect(cell.isEditable(line())).toBe(true)
  })

  it('startEdit NO abre líneas variables ni simuladas', async () => {
    const { cell } = setup()
    await cell.startEdit(line({ behavior_type: 'variable' }))
    expect(cell.editingId.value).toBe(null)
    await cell.startEdit(line({ is_simulated: true }))
    expect(cell.editingId.value).toBe(null)
  })

  it('valor SIN cambio cierra la edición SIN PUT (PUT ≤ 1 por edición real)', async () => {
    const { cell, store } = setup()
    await cell.startEdit(line())
    cell.editValue.value = '100'
    await cell.commitEdit(line())
    expect(store.updateCell).not.toHaveBeenCalled()
    expect(cell.editingId.value).toBe(null)
  })

  it('commit inválido marca el error EN VIVO y NO cierra ni hace request', async () => {
    const { cell, store } = setup()
    await cell.startEdit(line())
    cell.editValue.value = 'abc'
    await cell.commitEdit(line())
    expect(store.updateCell).not.toHaveBeenCalled()
    expect(cell.editingId.value).toBe(42)
    expect(cell.editInvalid.value).toBe(true)
    expect(cell.editMessage.value).toBe('Debe ser un número mayor o igual que 0.')
    // La edición inválida abierta no bloquea: abrir otra celda la descarta.
    await cell.startEdit(line({ id_budget_line: 43 }))
    expect(cell.editingId.value).toBe(43)
    expect(cell.editInvalid.value).toBe(false)
  })

  it('commit válido dispara UN solo PUT y deja el micro-estado saved ~1.5 s', async () => {
    const { cell, store } = setup()
    await cell.startEdit(line())
    cell.editValue.value = '250'
    await cell.commitEdit(line())
    expect(store.updateCell).toHaveBeenCalledTimes(1)
    expect(store.updateCell).toHaveBeenCalledWith(42, 250)
    // Rollback del override al resolver (la caché del store ya tiene el 200).
    expect(cell.cellOverrides[42]).toBeUndefined()
    expect(cell.cellStatus[42]).toBe('saved')
    expect(cell.editingId.value).toBe(null)
    // El ✓ vuelve a normal a los ~1.5 s (markSaved).
    vi.advanceTimersByTime(1500)
    expect(cell.cellStatus[42]).toBe('')
  })

  it('Enter+blur (commit doble) dispara UN solo PUT — NFR-F2', async () => {
    const { cell, store } = setup()
    await cell.startEdit(line())
    cell.editValue.value = '300'
    // Enter lanza el commit (cancelEdit corre en SYNC antes del await del PUT)…
    const first = cell.commitEdit(line())
    // …y el blur posterior no encuentra edición abierta.
    await cell.commitEdit(line())
    await first
    expect(store.updateCell).toHaveBeenCalledTimes(1)
  })

  it('fallo de servidor hace ROLLBACK visual: override limpio + mensaje §9 por celda', async () => {
    const { cell, store } = setup()
    store.updateCell = vi.fn(async () => ({ ok: false, kind: 'server' }))
    await cell.startEdit(line())
    cell.editValue.value = '250'
    await cell.commitEdit(line())
    expect(store.updateCell).toHaveBeenCalledTimes(1)
    expect(cell.cellOverrides[42]).toBeUndefined()
    expect(cell.cellStatus[42]).toBe('error')
    expect(cell.cellMessages[42]).toBe('El servidor no pudo guardar: valor revertido.')
  })

  it('422 validation pinta el mensaje del backend inline bajo la celda', async () => {
    const { cell, store } = setup()
    store.updateCell = vi.fn(async () => ({
      ok: false,
      kind: 'validation',
      message: 'El monto excede el máximo del escenario.'
    }))
    await cell.startEdit(line())
    cell.editValue.value = '250'
    await cell.commitEdit(line())
    expect(cell.cellStatus[42]).toBe('error')
    expect(cell.cellMessages[42]).toBe('El monto excede el máximo del escenario.')
    // El title de la celda prioriza el mensaje de error (cellTitle §9).
    expect(cell.cellTitle(line())).toBe('El monto excede el máximo del escenario.')
  })

  it('auth/busy dejan la celda en estado neutro (sin error pintado)', async () => {
    const { cell, store } = setup()
    store.updateCell = vi.fn(async () => ({ ok: false, kind: 'auth' }))
    await cell.startEdit(line())
    cell.editValue.value = '250'
    await cell.commitEdit(line())
    expect(cell.cellStatus[42]).toBe('')
    expect(cell.cellMessages[42]).toBeUndefined()
  })

  it('cellBusy refleja el guard single-flight del store (AC-FE-8) y startEdit lo respeta', async () => {
    const { cell, store } = setup()
    store.cellSaving[42] = true
    expect(cell.cellBusy(42)).toBe(true)
    await cell.startEdit(line())
    expect(cell.editingId.value).toBe(null)
    delete store.cellSaving[42]
    expect(cell.cellBusy(42)).toBe(false)
  })

  it('displayAmount muestra el override durante el PUT y la caché al resolver', async () => {
    const { cell, store } = setup()
    let resolvePut
    store.updateCell = vi.fn(() => new Promise((resolve) => (resolvePut = resolve)))
    const target = line()
    await cell.startEdit(target)
    cell.editValue.value = '250'
    const committing = cell.commitEdit(target)
    // En vuelo: la celda pinta el override (la caché todavía trae el 100).
    expect(cell.displayAmount(target)).toBe(250)
    expect(cell.cellStatus[42]).toBe('saving')
    resolvePut({ ok: true, data: {} })
    await committing
    expect(cell.displayAmount(target)).toBe(100) // rollback limpio: lee la caché
  })
})
