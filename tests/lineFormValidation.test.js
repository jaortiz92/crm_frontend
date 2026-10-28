/**
 * Tests de CARACTERIZACIÓN de `lineFormValidation.js` (FASE 3 de la
 * refactorización del módulo de Planeación): reglas de validación PRE-red del
 * `LineFormModal` (AC-FD-8) extraídas verbatim del componente a funciones
 * puras. Objetivo: fijar el comportamiento ACTUAL (mensajes literales,
 * umbrales, gating por comportamiento/`isEdit`) para que el módulo siga siendo
 * el espejo exacto de la spec tras futuros cambios.
 *
 * Estilo plano de la carpeta `tests/`: datos literales, cero HTTP, cero
 * stores, cero montaje de componentes.
 */
import { describe, it, expect } from 'vitest'
import {
  RATE_PREFILL_DRIFT_TOLERANCE,
  parseRatePct,
  rateDecimalOf,
  isBudgetYearValid,
  cecoErrorOf,
  budgetDateErrorOf,
  amountErrorOf,
  rateErrorOf
} from '@/components/budget/planning/lineFormValidation.js'

/** Borrador del formulario del modal (estado SIEMPRE strings). */
const draft = (overrides = {}) => ({
  idCostCenter: '3',
  budgetDate: '2026-05-10',
  paymentDate: '',
  idCollection: '',
  behaviorType: 'fixed',
  amountText: '1200000',
  ratePct: '',
  description: '',
  hasIva: true,
  ...overrides
})

describe('RATE_PREFILL_DRIFT_TOLERANCE (hallazgo 4 de auditoría FE)', () => {
  it('es medio paso de 0.01 % (0.00005) — el drift máximo del prefill de tasa', () => {
    expect(RATE_PREFILL_DRIFT_TOLERANCE).toBe(0.00005)
  })
})

describe('parseRatePct — `null` = tasa vacía; número finito o NaN', () => {
  it('string vacío → null', () => {
    expect(parseRatePct('')).toBe(null)
  })
  it('solo espacios → null (trim)', () => {
    expect(parseRatePct('   ')).toBe(null)
  })
  it('entero simple → número', () => {
    expect(parseRatePct('8')).toBe(8)
  })
  it('respeta espacios alrededor (trim)', () => {
    expect(parseRatePct(' 8 ')).toBe(8)
  })
  it('decimal con coma y SIN punto → coma decimal es-CO ("8,5" → 8.5)', () => {
    expect(parseRatePct('8,5')).toBe(8.5)
  })
  it('decimal con punto → estándar ("8.5" → 8.5)', () => {
    expect(parseRatePct('8.5')).toBe(8.5)
  })
  it('ambos separadores ("1,234.5") → NaN: el parser de tasa NO normaliza miles (a diferencia de parseCellAmount; el input type=number jamás los entrega)', () => {
    expect(parseRatePct('1,234.5')).toBeNaN()
  })
  it('ambos separadores ("1.234,5") → NaN (mismo motivo)', () => {
    expect(parseRatePct('1.234,5')).toBeNaN()
  })
  it('texto no numérico → NaN', () => {
    expect(parseRatePct('abc')).toBeNaN()
  })
  it('negativo es finito (el rango lo valida rateErrorOf, no el parser)', () => {
    expect(parseRatePct('-4')).toBe(-4)
  })
  it('número de entrada se stringifica igual que el formulario', () => {
    expect(parseRatePct(8.5)).toBe(8.5)
  })
})

describe('rateDecimalOf — tasa cruda 0–1 para el payload (FD-8: tasa/100)', () => {
  it('null → null (tasa vacía = keep en PUT parcial)', () => {
    expect(rateDecimalOf(null)).toBe(null)
  })
  it('NaN → null (texto inválido no viaja como tasa)', () => {
    expect(rateDecimalOf(NaN)).toBe(null)
  })
  it('8 → 0.08', () => {
    expect(rateDecimalOf(8)).toBe(0.08)
  })
  it('100 → 1', () => {
    expect(rateDecimalOf(100)).toBe(1)
  })
  it('0 → 0', () => {
    expect(rateDecimalOf(0)).toBe(0)
  })
  it('redondeo anti float-garbage a 6 decimales (8.333333 → 0.083333)', () => {
    expect(rateDecimalOf(8.333333)).toBe(0.083333)
  })
  it('redondeo hacia arriba en la sexta cifra (12.345678 → 0.123457)', () => {
    expect(rateDecimalOf(12.345678)).toBe(0.123457)
  })
})

describe('isBudgetYearValid — año de budget_date = año del escenario (BR-LINE-04)', () => {
  it('mismo año → true', () => {
    expect(isBudgetYearValid('2026-05-10', 2026)).toBe(true)
  })
  it('año distinto → false', () => {
    expect(isBudgetYearValid('2027-05-10', 2026)).toBe(false)
  })
  it('fecha vacía → false (la obligatoriedad la reporta budgetDateErrorOf)', () => {
    expect(isBudgetYearValid('', 2026)).toBe(false)
  })
  it('año de escenario undefined → false (NaN === NaN es false)', () => {
    expect(isBudgetYearValid('2026-05-10', undefined)).toBe(false)
  })
  it('año como string numérico se compara numéricamente (patrón del modal)', () => {
    expect(isBudgetYearValid('2026-05-10', '2026')).toBe(true)
  })
  it('lee el año del ISO sin `new Date` (sin corrimiento UTC→local)', () => {
    expect(isBudgetYearValid('2026-12-31', 2026)).toBe(true)
    expect(isBudgetYearValid('2027-01-01', 2026)).toBe(false)
  })
})

describe('cecoErrorOf — CECO obligatorio (§3.2)', () => {
  it('vacío → mensaje literal', () => {
    expect(cecoErrorOf(draft({ idCostCenter: '' }))).toBe('El CECO es obligatorio.')
  })
  it('seleccionado → sin error', () => {
    expect(cecoErrorOf(draft({ idCostCenter: '7' }))).toBe('')
  })
})

describe('budgetDateErrorOf — obligatoria + año del escenario (AC-FD-8)', () => {
  it('vacía → "La fecha proyectada es obligatoria."', () => {
    expect(budgetDateErrorOf(draft({ budgetDate: '' }), 2026)).toBe(
      'La fecha proyectada es obligatoria.'
    )
  })
  it('año ajeno → mensaje con el año del escenario', () => {
    expect(budgetDateErrorOf(draft({ budgetDate: '2027-05-10' }), 2026)).toBe(
      'La fecha debe ser del año 2026 del escenario.'
    )
  })
  it('año correcto → sin error', () => {
    expect(budgetDateErrorOf(draft({ budgetDate: '2026-12-31' }), 2026)).toBe('')
  })
  it('escenario sin año (null) → marcador "—" en el mensaje', () => {
    expect(budgetDateErrorOf(draft({ budgetDate: '2026-05-10' }), null)).toBe(
      'La fecha debe ser del año — del escenario.'
    )
  })
})

describe('amountErrorOf — obligatorio/válido SOLO en líneas fijas (BR-LINE-07)', () => {
  it('línea variable → sin error aunque el monto esté vacío (se deriva de la tasa)', () => {
    expect(amountErrorOf(draft({ behaviorType: 'variable', amountText: '' }))).toBe('')
  })
  it('cualquier comportamiento ≠ fixed cuenta como variable', () => {
    expect(amountErrorOf(draft({ behaviorType: 'per_unit', amountText: 'abc' }))).toBe('')
  })
  it('fija + vacío → "El monto es obligatorio."', () => {
    expect(amountErrorOf(draft({ behaviorType: 'fixed', amountText: '' }))).toBe(
      'El monto es obligatorio.'
    )
  })
  it('fija + solo espacios → "El monto es obligatorio."', () => {
    expect(amountErrorOf(draft({ behaviorType: 'fixed', amountText: '   ' }))).toBe(
      'El monto es obligatorio.'
    )
  })
  it('fija + texto no numérico → "Debe ser un número mayor o igual que 0."', () => {
    expect(amountErrorOf(draft({ behaviorType: 'fixed', amountText: 'abc' }))).toBe(
      'Debe ser un número mayor o igual que 0.'
    )
  })
  it('fija + negativo → "Debe ser un número mayor o igual que 0."', () => {
    expect(amountErrorOf(draft({ behaviorType: 'fixed', amountText: '-5' }))).toBe(
      'Debe ser un número mayor o igual que 0.'
    )
  })
  it('fija + entero positivo → sin error', () => {
    expect(amountErrorOf(draft({ behaviorType: 'fixed', amountText: '1200000' }))).toBe('')
  })
  it('fija + puntuación es-CO del propio módulo ("12,5") → sin error (ASM-12)', () => {
    expect(amountErrorOf(draft({ behaviorType: 'fixed', amountText: '12,5' }))).toBe('')
  })
  it('fija + miles con punto ("1.234.567") → sin error', () => {
    expect(amountErrorOf(draft({ behaviorType: 'fixed', amountText: '1.234.567' }))).toBe('')
  })
  it('fija + 0 → sin error (mayor o IGUAL que 0)', () => {
    expect(amountErrorOf(draft({ behaviorType: 'fixed', amountText: '0' }))).toBe('')
  })
})

describe('rateErrorOf — SOLO variables; obligatoria en create, opcional en edit', () => {
  it('línea fija → sin error aunque la tasa esté vacía', () => {
    expect(rateErrorOf(draft({ behaviorType: 'fixed', ratePct: '' }), false)).toBe('')
  })
  it('variable + create + vacía → "La tasa es obligatoria para líneas variables."', () => {
    expect(rateErrorOf(draft({ behaviorType: 'variable', ratePct: '' }), false)).toBe(
      'La tasa es obligatoria para líneas variables.'
    )
  })
  it('variable + edit + vacía → sin error (PUT parcial: vacía = keep)', () => {
    expect(rateErrorOf(draft({ behaviorType: 'variable', ratePct: '' }), true)).toBe('')
  })
  it('variable + texto no numérico (NaN) → "La tasa debe ser un número entre 0 y 100."', () => {
    expect(rateErrorOf(draft({ behaviorType: 'variable', ratePct: 'abc' }), false)).toBe(
      'La tasa debe ser un número entre 0 y 100.'
    )
  })
  it('variable + negativa → fuera de rango', () => {
    expect(rateErrorOf(draft({ behaviorType: 'variable', ratePct: '-1' }), false)).toBe(
      'La tasa debe ser un número entre 0 y 100.'
    )
  })
  it('variable + 101 → fuera de rango', () => {
    expect(rateErrorOf(draft({ behaviorType: 'variable', ratePct: '101' }), false)).toBe(
      'La tasa debe ser un número entre 0 y 100.'
    )
  })
  it('variable + 0 → dentro del rango cerrado', () => {
    expect(rateErrorOf(draft({ behaviorType: 'variable', ratePct: '0' }), false)).toBe('')
  })
  it('variable + 100 → dentro del rango cerrado', () => {
    expect(rateErrorOf(draft({ behaviorType: 'variable', ratePct: '100' }), false)).toBe('')
  })
  it('variable + decimal con coma ("8,5") → dentro del rango', () => {
    expect(rateErrorOf(draft({ behaviorType: 'variable', ratePct: '8,5' }), false)).toBe('')
  })
  it('variable + decimal con punto ("8.5") → dentro del rango', () => {
    expect(rateErrorOf(draft({ behaviorType: 'variable', ratePct: '8.5' }), true)).toBe('')
  })
})
