/**
 * Tests de CARACTERIZACIÓN del módulo `planningFormat.js` (previos a la FASE 1
 * de su división por dominio). Objetivo: fijar el comportamiento ACTUAL de
 * cada exportación —incluidos edge cases (null/undefined, 0, negativos,
 * buckets fuera de año, flags IVA ausentes)— para que el split en
 * `planningDate.js` / `planningIva.js` / `planningCogs.js` /
 * `planningCausation.js` / `planningLabels.js` sea un MOVE VERBATIM y cualquier
 * desviación quede expuesta aquí.
 *
 * TODOS los imports van contra el BARRIL (`planningFormat.js`) para que estos
 * tests sobrevivan intactos a la reorganización interna. Estilo plano de la
 * carpeta `tests/`: datos falsos, cero HTTP, cero stores.
 */
import { describe, it, expect } from 'vitest'
import {
  formatMoney,
  formatCOP,
  formatCount,
  formatMoneyPlain,
  formatMoneyCompact,
  formatDateEs,
  parseCellAmount,
  formatVariableRate,
  buildYearOptions,
  MONTH_LABELS,
  monthIndexOf,
  monthBucketIndexOf,
  cfMonthOf,
  monthEndOf,
  addDaysISO,
  monthEndsOfYear,
  IVA_RATE,
  ivaFlagEffective,
  withIva,
  ivaOf,
  lineChargesIva,
  cogsRatePoolForDate,
  buildCogsRatePool,
  resolveCogsPctFromPool,
  resolveCogsPctByLine,
  fixedIncomeCausationSeries,
  fixedIncomeCausationByCeco,
  resolveVariableBaseCeco,
  fixedIncomeCausationByVariableCeco,
  entradasCausacionByCeco,
  entradasCausacionByVariableCeco,
  fixedIncomeBucketByCeco,
  entradasBucketByCeco,
  fixedIncomeBucketByVariableCeco,
  entradasBucketByVariableCeco,
  variableCollectionDistribution,
  STATUS_LABELS,
  statusChipOf,
  BEHAVIOR_LABELS,
  LINE_TYPE_LABELS,
  VARIABLE_PIVOT_NOTE,
  VARIABLE_COLLECTION_DISTRIBUTION_NOTE
} from '@/components/budget/planning/planningFormat.js'

/* El espacio entre `$` y el número en `es-CO` es un NO-BREAK SPACE (U+00A0). */
const NBSP = '\u00A0'

describe('formatMoney — COP es-CO sin decimales (barril planningFormat)', () => {
  it('entero con símbolo $ y miles con punto', () => {
    expect(formatMoney(1234567)).toBe(`$${NBSP}1.234.567`)
  })
  it('0 → "$ 0"', () => {
    expect(formatMoney(0)).toBe(`$${NBSP}0`)
  })
  it('decimal se REDONDEA solo en display (1234.4 → 1.234)', () => {
    expect(formatMoney(1234.4)).toBe(`$${NBSP}1.234`)
  })
  it('negativo antepone el signo al símbolo', () => {
    expect(formatMoney(-1234.4)).toBe(`-$${NBSP}1.234`)
  })
  it('acepta strings numéricos', () => {
    expect(formatMoney('2500000')).toBe(`$${NBSP}2.500.000`)
  })
  it('null es 0 finito (Number(null) === 0) → "$ 0"; no finitos → "—"', () => {
    expect(formatMoney(null)).toBe(`$${NBSP}0`)
    expect(formatMoney(undefined)).toBe('—')
    expect(formatMoney('abc')).toBe('—')
    expect(formatMoney({})).toBe('—')
    expect(formatMoney(Number.NaN)).toBe('—')
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe('—')
  })
})

describe('formatCOP — nómina COP con 2 decimales (FE-S15-COLLAB §7.1)', () => {
  it('entero → siempre ",00"', () => {
    expect(formatCOP(2750440)).toBe(`$${NBSP}2.750.440,00`)
  })
  it('0 → "$ 0,00"', () => {
    expect(formatCOP(0)).toBe(`$${NBSP}0,00`)
  })
  it('con centavos reales', () => {
    expect(formatCOP(10.5)).toBe(`$${NBSP}10,50`)
  })
  it('null → "$ 0,00" (Number(null) es 0); no finitos → "—"', () => {
    expect(formatCOP(null)).toBe(`$${NBSP}0,00`)
    expect(formatCOP(undefined)).toBe('—')
    expect(formatCOP('x')).toBe('—')
  })
})

describe('formatCount — entero es-CO', () => {
  it('miles con punto', () => {
    expect(formatCount(1234567)).toBe('1.234.567')
  })
  it('negativo', () => {
    expect(formatCount(-9876543)).toBe('-9.876.543')
  })
  it('0', () => {
    expect(formatCount(0)).toBe('0')
  })
  it('null → "0" (Number(null) es 0); undefined → "—"', () => {
    expect(formatCount(null)).toBe('0')
    expect(formatCount(undefined)).toBe('—')
  })
})

describe('formatMoneyPlain — sin símbolo ni decimales (FE-S18 RF-7.1)', () => {
  it('1234567 → "1.234.567"', () => {
    expect(formatMoneyPlain(1234567)).toBe('1.234.567')
  })
  it('redondeo al peso solo display (2750440.5 → 2.750.441)', () => {
    expect(formatMoneyPlain(2750440.5)).toBe('2.750.441')
  })
  it('0 → "0"', () => {
    expect(formatMoneyPlain(0)).toBe('0')
  })
  it('negativo', () => {
    expect(formatMoneyPlain(-1234)).toBe('-1.234')
  })
  it('null → "0" (Number(null) es 0); no finitos → "—"', () => {
    expect(formatMoneyPlain(null)).toBe('0')
    expect(formatMoneyPlain({})).toBe('—')
    expect(formatMoneyPlain(Number.NaN)).toBe('—')
  })
})

describe('formatMoneyCompact — celdas de 106px (FE-S18 RF-2.2)', () => {
  it('umbral: |v| < 10 MM delega en plain', () => {
    expect(formatMoneyCompact(9999999)).toBe('9.999.999')
  })
  it('umbral: |v| = 10 MM → "10 MM"', () => {
    expect(formatMoneyCompact(10000000)).toBe('10 MM')
  })
  it('millones ENTEROS sin decimales (12.340.000 → "12 MM")', () => {
    expect(formatMoneyCompact(12340000)).toBe('12 MM')
  })
  it('redondeo de millones (1.234.567.890 → "1.235 MM")', () => {
    expect(formatMoneyCompact(1234567890)).toBe('1.235 MM')
  })
  it('negativo grande → "-12 MM"', () => {
    expect(formatMoneyCompact(-12000000)).toBe('-12 MM')
  })
  it('null → "0" (Number(null) es 0, bajo el umbral); undefined → "—"', () => {
    expect(formatMoneyCompact(null)).toBe('0')
    expect(formatMoneyCompact(undefined)).toBe('—')
  })
})

describe('formatDateEs — dd/mm/aaaa sin corrimiento UTC', () => {
  it('ISO puro por regex', () => {
    expect(formatDateEs('2027-01-31')).toBe('31/01/2027')
  })
  it('ISO puro NO valida el día (2026-02-30 pasa tal cual)', () => {
    expect(formatDateEs('2026-02-30')).toBe('30/02/2026')
  })
  it('fallback Date para no-ISO parseable', () => {
    expect(formatDateEs('03/10/2026')).toBe('10/03/2026')
    expect(formatDateEs(new Date(2026, 0, 31))).toBe('31/01/2026')
  })
  it('vacíos → "—"', () => {
    expect(formatDateEs(null)).toBe('—')
    expect(formatDateEs(undefined)).toBe('—')
    expect(formatDateEs('')).toBe('—')
  })
  it('ilegible → devuelve el string crudo', () => {
    expect(formatDateEs('garbage')).toBe('garbage')
  })
})

describe('parseCellAmount — validación pre-red (ASM-12, puntuación es-CO)', () => {
  it('número finito >= 0 pasa tal cual', () => {
    expect(parseCellAmount(5)).toEqual({ valid: true, value: 5 })
    expect(parseCellAmount(0)).toEqual({ valid: true, value: 0 })
  })
  it('número negativo o no finito → inválido con value 0', () => {
    expect(parseCellAmount(-3)).toEqual({ valid: false, value: 0 })
    expect(parseCellAmount(Number.NaN)).toEqual({ valid: false, value: 0 })
    expect(parseCellAmount(Number.POSITIVE_INFINITY)).toEqual({ valid: false, value: 0 })
  })
  it('vacío/null/undefined → inválido', () => {
    expect(parseCellAmount('')).toEqual({ valid: false, value: 0 })
    expect(parseCellAmount('   ')).toEqual({ valid: false, value: 0 })
    expect(parseCellAmount(null)).toEqual({ valid: false, value: 0 })
    expect(parseCellAmount(undefined)).toEqual({ valid: false, value: 0 })
  })
  it('coma decimal ("12,5" → 12.5)', () => {
    expect(parseCellAmount('12,5')).toEqual({ valid: true, value: 12.5 })
  })
  it('solo puntos con agrupación es-CO estricta ("1.234" → 1234)', () => {
    expect(parseCellAmount('1.234')).toEqual({ valid: true, value: 1234 })
  })
  it('agrupación larga ("1.234.567" → 1234567)', () => {
    expect(parseCellAmount('1.234.567')).toEqual({ valid: true, value: 1234567 })
  })
  it('mixto es-CO ("1.234,5" → 1234.5)', () => {
    expect(parseCellAmount('1.234,5')).toEqual({ valid: true, value: 1234.5 })
  })
  it('mixto en-US ("1,234.5" → 1234.5)', () => {
    expect(parseCellAmount('1,234.5')).toEqual({ valid: true, value: 1234.5 })
  })
  it('punto decimal estándar se conserva ("1234.56" → 1234.56)', () => {
    expect(parseCellAmount('1234.56')).toEqual({ valid: true, value: 1234.56 })
  })
  it('recorta espacios', () => {
    expect(parseCellAmount(' 12 ')).toEqual({ valid: true, value: 12 })
  })
  it('no numérico o negativo en texto → inválido', () => {
    expect(parseCellAmount('abc')).toEqual({ valid: false, value: 0 })
    expect(parseCellAmount('-5')).toEqual({ valid: false, value: 0 })
  })
})

describe('formatVariableRate — tasa cruda 0–1 → "N %"', () => {
  it('0.08 → "8 %"', () => {
    expect(formatVariableRate(0.08)).toBe('8 %')
  })
  it('2 decimales (0.0855 → "8.55 %")', () => {
    expect(formatVariableRate(0.0855)).toBe('8.55 %')
  })
  it('cero final se recorta (0.123 → "12.3 %")', () => {
    expect(formatVariableRate(0.123)).toBe('12.3 %')
  })
  it('0 → "0 %"', () => {
    expect(formatVariableRate(0)).toBe('0 %')
  })
  it('null → "0 %" (Number(null) es 0); no finitos → "—"', () => {
    expect(formatVariableRate(null)).toBe('0 %')
    expect(formatVariableRate(undefined)).toBe('—')
    expect(formatVariableRate('x')).toBe('—')
  })
})

describe('buildYearOptions — rango baseYear−2 .. baseYear+5', () => {
  it('2026 → [2024..2031] (8 opciones)', () => {
    expect(buildYearOptions(2026)).toEqual([2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031])
  })
  it('default = año actual en el centro (índice 2)', () => {
    const options = buildYearOptions()
    expect(options).toHaveLength(8)
    expect(options[2]).toBe(new Date().getFullYear())
  })
})

describe('monthIndexOf — índice 0–11 de un budget_date', () => {
  it('ISO puro extrae del string (sin zona)', () => {
    expect(monthIndexOf('2026-03-10')).toBe(2)
    expect(monthIndexOf('2026-01-01')).toBe(0)
    expect(monthIndexOf('2026-12-31')).toBe(11)
  })
  it('vacíos → -1', () => {
    expect(monthIndexOf(null)).toBe(-1)
    expect(monthIndexOf(undefined)).toBe(-1)
    expect(monthIndexOf('')).toBe(-1)
  })
  it('ilegible → -1', () => {
    expect(monthIndexOf('garbage')).toBe(-1)
  })
  it('mes 00 o 13 fuera de rango → -1', () => {
    expect(monthIndexOf('2026-00-10')).toBe(-1)
    expect(monthIndexOf('2026-13-01')).toBe(-1)
  })
  it('no-ISO parseable cae a Date (V8: "2026-3-5" → marzo)', () => {
    expect(monthIndexOf('2026-3-5')).toBe(2)
    expect(monthIndexOf('March 10, 2026')).toBe(2)
  })
})

describe('monthBucketIndexOf — buckets extendidos A-03', () => {
  it('mes del año N → 0..11', () => {
    expect(monthBucketIndexOf('2026-01-31', 2026)).toBe(0)
    expect(monthBucketIndexOf('2026-03-10', 2026)).toBe(2)
    expect(monthBucketIndexOf('2026-12-31', 2026)).toBe(11)
  })
  it('año < N → -1 (Antes); año > N → 12 (Después)', () => {
    expect(monthBucketIndexOf('2025-06-15', 2026)).toBe(-1)
    expect(monthBucketIndexOf('2027-01-05', 2026)).toBe(12)
  })
  it('fecha vacía/ilegible → -99', () => {
    expect(monthBucketIndexOf(null, 2026)).toBe(-99)
    expect(monthBucketIndexOf('', 2026)).toBe(-99)
    expect(monthBucketIndexOf('sin fecha', 2026)).toBe(-99)
  })
  it('mes 00/13 → -99', () => {
    expect(monthBucketIndexOf('2026-00-15', 2026)).toBe(-99)
    expect(monthBucketIndexOf('2026-13-15', 2026)).toBe(-99)
  })
  it('scenarioYear null/undefined/no entero → degradación a mes 0..11', () => {
    expect(monthBucketIndexOf('2026-06-15', null)).toBe(5)
    expect(monthBucketIndexOf('2026-06-15', undefined)).toBe(5)
    expect(monthBucketIndexOf('2025-06-15', null)).toBe(5)
    expect(monthBucketIndexOf('2026-06-15', 'no-entero')).toBe(5)
  })
  it('scenarioYear numérico en string cuenta como entero', () => {
    expect(monthBucketIndexOf('2026-06-15', '2026')).toBe(5)
    expect(monthBucketIndexOf('2027-06-15', '2026')).toBe(12)
  })
})

describe('cfMonthOf — mes de cobro (payment_date con fallback a budget_date)', () => {
  it('payment_date gana', () => {
    expect(cfMonthOf({ payment_date: '2026-05-01', budget_date: '2026-03-10' })).toBe(4)
  })
  it('sin payment_date → budget_date', () => {
    expect(cfMonthOf({ budget_date: '2026-03-10' })).toBe(2)
  })
  it('línea vacía o nula → -1', () => {
    expect(cfMonthOf({})).toBe(-1)
    expect(cfMonthOf(null)).toBe(-1)
    expect(cfMonthOf(undefined)).toBe(-1)
  })
})

describe('IVA — única fuente local de la fórmula (FE-S14-IVA §5)', () => {
  it('IVA_RATE = 0.19 (espejo TAX_RATE del backend)', () => {
    expect(IVA_RATE).toBe(0.19)
  })
  it('ivaFlagEffective: solo false literal excluye (NULL ≡ True)', () => {
    expect(ivaFlagEffective(true)).toBe(true)
    expect(ivaFlagEffective(false)).toBe(false)
    expect(ivaFlagEffective(null)).toBe(true)
    expect(ivaFlagEffective(undefined)).toBe(true)
    expect(ivaFlagEffective(0)).toBe(true)
  })
  it('withIva: neto × 1.19 cuando gravado', () => {
    expect(withIva(100, true)).toBe(119)
    expect(withIva(50.5, true)).toBe(60.095)
    expect(withIva('100', true)).toBe(119)
  })
  it('withIva: flag false → neto intacto', () => {
    expect(withIva(100, false)).toBe(100)
    expect(withIva(123.45, false)).toBe(123.45)
  })
  it('withIva: flag ausente → gravado (NULL ≡ True)', () => {
    expect(withIva(100)).toBe(119)
    expect(withIva(100, null)).toBe(119)
  })
  it('withIva: no finitos → 0 (contrato de acumuladores)', () => {
    expect(withIva(null, true)).toBe(0)
    expect(withIva(undefined, true)).toBe(0)
    expect(withIva('abc', true)).toBe(0)
  })
  it('ivaOf: cuota neta × 0.19', () => {
    expect(ivaOf(100, true)).toBe(19)
    expect(ivaOf(50.5, true)).toBe(9.595)
  })
  it('ivaOf: sin IVA o no finito → 0', () => {
    expect(ivaOf(100, false)).toBe(0)
    expect(ivaOf(null, true)).toBe(0)
    expect(ivaOf('x', true)).toBe(0)
  })
  it('lineChargesIva: INCOME/PURCHASE siempre gravadas (D-S10-5)', () => {
    expect(lineChargesIva({ line_type: 'income', has_iva: false })).toBe(true)
    expect(lineChargesIva({ line_type: 'purchase', has_iva: false })).toBe(true)
  })
  it('lineChargesIva: EXPENSE con flag EFECTIVO', () => {
    expect(lineChargesIva({ line_type: 'expense', has_iva: false })).toBe(false)
    expect(lineChargesIva({ line_type: 'expense', has_iva: null })).toBe(true)
    expect(lineChargesIva({ line_type: 'expense' })).toBe(true)
  })
  it('lineChargesIva: línea nula → gravada', () => {
    expect(lineChargesIva(null)).toBe(true)
  })
})

describe('COGS — pool de tasas vigente (FE-S7-COGS-PAYFLOW §4)', () => {
  const rates = [
    { id_line_cost_rate: 1, id_line: 5, cogs_pct: 30, is_active: true, date_from: '2026-01-01', date_to: '2026-12-31' },
    { id_line_cost_rate: 3, id_line: 5, cogs_pct: 42, is_active: true, date_from: '2026-01-01', date_to: '2026-12-31' },
    { id_line_cost_rate: 2, id_line: null, cogs_pct: 10, is_active: true, date_from: '2026-01-01', date_to: '2026-12-31' },
    { id_line_cost_rate: 9, id_line: undefined, cogs_pct: 20, is_active: true, date_from: '2026-01-01', date_to: '2026-12-31' },
    { id_line_cost_rate: 4, id_line: 6, cogs_pct: 'n/a', is_active: true, date_from: '2026-01-01', date_to: '2026-12-31' },
    { id_line_cost_rate: 5, id_line: 7, cogs_pct: 99, is_active: false, date_from: '2026-01-01', date_to: '2026-12-31' },
    { id_line_cost_rate: 6, id_line: 8, cogs_pct: 50, is_active: true, date_from: '2027-01-01', date_to: '2027-12-31' },
    { id_line_cost_rate: 7, id_line: 9, cogs_pct: 60, is_active: true, date_from: null, date_to: '2026-12-31' }
  ]

  it('cogsRatePoolForDate: filtra activos + ventana string inclusiva, orden id DESC (NO filtra cogs_pct)', () => {
    const pool = cogsRatePoolForDate(rates, '2026-06-30')
    // id 4 entra al pool pese a cogs_pct no finito — el guard vive en buildCogsRatePool
    expect(pool.map((rate) => rate.id_line_cost_rate)).toEqual([9, 4, 3, 2, 1])
  })
  it('cogsRatePoolForDate: ventana INCLUSIVA (ref == date_from == date_to entra)', () => {
    const pool = cogsRatePoolForDate(rates, '2026-01-01')
    expect(pool.map((rate) => rate.id_line_cost_rate)).toContain(1)
  })
  it('cogsRatePoolForDate: catálogo no array → vacío', () => {
    expect(cogsRatePoolForDate(null, '2026-06-30')).toEqual([])
    expect(cogsRatePoolForDate(undefined, '2026-06-30')).toEqual([])
  })
  it('buildCogsRatePool: primera coincidencia por línea gana (mayor id)', () => {
    const { byLine } = buildCogsRatePool(rates, '2026-06-30')
    expect(byLine.get(5)).toBe(42)
    expect(byLine.has(6)).toBe(false) // cogs_pct no finito se ignora
    expect(byLine.has(7)).toBe(false) // inactivo
    expect(byLine.has(8)).toBe(false) // fuera de ventana
  })
  it('buildCogsRatePool: PRIMERA coincidencia global es el respaldo', () => {
    const { globalPct } = buildCogsRatePool(rates, '2026-06-30')
    // id 9 (global) gana a id 2 (global) por el orden DESC del pool
    expect(globalPct).toBe(20)
  })
  it('buildCogsRatePool: sin tasas → pool vacío con global null', () => {
    const pool = buildCogsRatePool(null, '2026-06-30')
    expect(pool.byLine.size).toBe(0)
    expect(pool.globalPct).toBe(null)
  })
  it('resolveCogsPctFromPool: línea propia → respaldo global → null', () => {
    const pool = buildCogsRatePool(rates, '2026-06-30')
    expect(resolveCogsPctFromPool(pool, 5)).toBe(42)
    expect(resolveCogsPctFromPool(pool, 6)).toBe(20) // sin línea propia → global
    expect(resolveCogsPctFromPool(pool, null)).toBe(20)
    expect(resolveCogsPctFromPool(pool, undefined)).toBe(20)
    expect(resolveCogsPctFromPool(null, 5)).toBe(null)
  })
  it('resolveCogsPctFromPool: pool sin global → null cuando la línea no matchea', () => {
    const pool = { byLine: new Map([[5, 42]]), globalPct: null }
    expect(resolveCogsPctFromPool(pool, 99)).toBe(null)
    expect(resolveCogsPctFromPool(pool, 5)).toBe(42)
  })
  it('resolveCogsPctByLine: monthEndISO no string → null (sin filtrar catálogo)', () => {
    expect(resolveCogsPctByLine(rates, 5, null)).toBe(null)
    expect(resolveCogsPctByLine(rates, 5, undefined)).toBe(null)
    expect(resolveCogsPctByLine(rates, 5, 12345)).toBe(null)
  })
  it('resolveCogsPctByLine: cadena completa con month-end legible', () => {
    expect(resolveCogsPctByLine(rates, 5, '2026-06-30')).toBe(42)
    expect(resolveCogsPctByLine(rates, null, '2026-06-30')).toBe(20)
  })
  it('resolveCogsPctByLine: catálogo vacío → null (comparaciones con null nunca casan)', () => {
    expect(resolveCogsPctByLine(null, 5, '2026-06-30')).toBe(null)
  })
})

describe('fixedIncomeCausationSeries — Σ ingresos fijos por mes de CAUSACIÓN', () => {
  const lines = [
    { line_type: 'income', behavior_type: 'fixed', budget_date: '2026-03-10', projected_amount: 100 },
    { line_type: 'income', behavior_type: 'fixed', budget_date: '2026-03-20', projected_amount: 50 },
    { line_type: 'income', behavior_type: 'variable_sales', budget_date: '2026-03-10', projected_amount: 999 },
    { line_type: 'expense', behavior_type: 'fixed', budget_date: '2026-03-10', projected_amount: 999 },
    { line_type: 'income', behavior_type: 'fixed', budget_date: 'garbage', projected_amount: 999 },
    { line_type: 'income', behavior_type: 'fixed', projected_amount: 999 },
    { line_type: 'income', behavior_type: 'fixed', budget_date: '2026-04-01', projected_amount: 'abc' },
    { line_type: 'income', behavior_type: 'fixed', budget_date: '2025-07-01', projected_amount: 7 }
  ]

  it('solo income+fixed con mes legible suma; mes 2 acumula 150 y año < N igual entra', () => {
    expect(fixedIncomeCausationSeries(lines)).toEqual([
      0, 0, 150, 0, 0, 0, 7, 0, 0, 0, 0, 0
    ])
  })
  it('null/undefined/[] → serie de 12 ceros', () => {
    expect(fixedIncomeCausationSeries(null)).toEqual(Array.from({ length: 12 }, () => 0))
    expect(fixedIncomeCausationSeries(undefined)).toEqual(Array.from({ length: 12 }, () => 0))
    expect(fixedIncomeCausationSeries([])).toEqual(Array.from({ length: 12 }, () => 0))
  })
})

describe('fixedIncomeCausationByCeco — misma serie cortada POR CECO', () => {
  const lines = [
    { id_cost_center: 151, line_type: 'income', behavior_type: 'fixed', budget_date: '2026-03-10', projected_amount: 1000 },
    { id_cost_center: 151, line_type: 'income', behavior_type: 'fixed', budget_date: '2026-06-10', projected_amount: 2000 },
    { id_cost_center: 181, line_type: 'income', behavior_type: 'fixed', budget_date: '2026-03-15', projected_amount: 500 },
    { id_cost_center: 181, line_type: 'income', behavior_type: 'fixed', budget_date: 'garbage', projected_amount: 500 }
  ]

  it('Map por CECO con serie de 12; fechas ilegibles no crean celdas', () => {
    const map = fixedIncomeCausationByCeco(lines)
    expect(map.size).toBe(2)
    expect(map.get(151)).toEqual([0, 0, 1000, 0, 0, 2000, 0, 0, 0, 0, 0, 0])
    expect(map.get(181)).toEqual([0, 0, 500, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  })
  it('CECO sin fechas legibles NO tiene fila', () => {
    const map = fixedIncomeCausationByCeco([
      { id_cost_center: 999, line_type: 'income', behavior_type: 'fixed', budget_date: 'x', projected_amount: 1 }
    ])
    expect(map.size).toBe(0)
  })
  it('no array → Map vacío', () => {
    expect(fixedIncomeCausationByCeco(null).size).toBe(0)
  })
})

describe('resolveVariableBaseCeco — resolución A-01 por (zona, línea)', () => {
  const catalog = [
    { id_cost_center: 151, id_zone: 7, id_line: 1 },
    { id_cost_center: 181, id_zone: 7, id_line: 1 },
    { id_cost_center: 210, id_zone: 7, id_line: 1 },
    { id_cost_center: 320, id_zone: 9, id_line: 2 }
  ]

  it('propio CECO primero (compatibilidad) — incluso sin catálogo', () => {
    expect(resolveVariableBaseCeco(151, [151], catalog)).toBe(151)
    expect(resolveVariableBaseCeco(151, new Set([151]), [])).toBe(151)
  })
  it('candidato único por (zona, línea) → 151 resuelve a sí mismo vía 210', () => {
    // 210 NO factura; clave (7,1) con ingreso: solo 151 (181 sin ingreso)
    expect(resolveVariableBaseCeco(210, [151], catalog)).toBe(151)
  })
  it('múltiples candidatos → null (SIN fallback)', () => {
    expect(resolveVariableBaseCeco(210, [151, 181], catalog)).toBe(null)
  })
  it('cero candidatos → null', () => {
    expect(resolveVariableBaseCeco(210, [], catalog)).toBe(null)
    expect(resolveVariableBaseCeco(320, [151], catalog)).toBe(null)
  })
  it('ceco ausente del catálogo → null', () => {
    expect(resolveVariableBaseCeco(999, [151], catalog)).toBe(null)
  })
  it('zona o línea null en el propio ceco → null', () => {
    expect(resolveVariableBaseCeco(400, [151], [{ id_cost_center: 400, id_zone: null, id_line: 1 }])).toBe(null)
    expect(resolveVariableBaseCeco(400, [151], [{ id_cost_center: 400, id_zone: 7, id_line: null }])).toBe(null)
  })
  it('acepta Set o iterable de incomeCecoIds', () => {
    expect(resolveVariableBaseCeco(210, new Set([151]), catalog)).toBe(151)
  })
})

describe('fixedIncomeCausationByVariableCeco — base keyed POR CECO variable (A-01)', () => {
  const catalog = [
    { id_cost_center: 151, id_zone: 7, id_line: 1 },
    { id_cost_center: 210, id_zone: 7, id_line: 1 },
    { id_cost_center: 320, id_zone: 9, id_line: 2 }
  ]
  const lines = [
    { id_cost_center: 151, line_type: 'income', behavior_type: 'fixed', budget_date: '2026-03-10', projected_amount: 1000000 },
    { id_cost_center: 210, line_type: 'expense', behavior_type: 'variable_sales', budget_date: '2026-03-15', projected_amount: 50000 },
    { id_cost_center: 320, line_type: 'expense', behavior_type: 'variable_sales', budget_date: '2026-03-15', projected_amount: 50000 },
    { id_cost_center: 181, line_type: 'expense', behavior_type: 'fixed', budget_date: '2026-03-15', projected_amount: 1 }
  ]

  it('CECO variable 210 → serie del generador 151; 320 sin resolución → sin fila', () => {
    const map = fixedIncomeCausationByVariableCeco(lines, catalog)
    expect(map.size).toBe(1)
    expect(map.get(210)).toEqual([0, 0, 1000000, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(map.has(320)).toBe(false)
  })
  it('expense con behavior fixed NO es CECO variable (181 no aparece)', () => {
    const map = fixedIncomeCausationByVariableCeco(lines, catalog)
    expect(map.has(181)).toBe(false)
  })
  it('no array → Map vacío', () => {
    expect(fixedIncomeCausationByVariableCeco(null, catalog).size).toBe(0)
  })
})

describe('entradasCausacionByCeco — ENTRADAS por MES DE PAGO con filtro de año (A-02)', () => {
  const line2027 = {
    id_cost_center: 151,
    line_type: 'income',
    behavior_type: 'fixed',
    budget_date: '2026-03-10',
    payment_date: '2027-01-15',
    projected_amount: 1000000
  }

  it('filtro de año: cobro de dic-N vencido en ene-N+1 NO entra al año N', () => {
    const map = entradasCausacionByCeco([line2027], 2026)
    expect(map.size).toBe(0)
  })
  it('scenarioYear null (default) → SIN filtro: entra al mes de PAGO (ene → 0)', () => {
    expect(entradasCausacionByCeco([line2027]).get(151)).toEqual([
      1000000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    ])
    expect(entradasCausacionByCeco([line2027], null).get(151)[0]).toBe(1000000)
  })
  it('mes de pago gana sobre el de causación', () => {
    const map = entradasCausacionByCeco([line2027], 2027)
    expect(map.get(151)).toEqual([1000000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  })
  it('sin payment_date → budget_date; ilegibles no suman', () => {
    const map = entradasCausacionByCeco(
      [
        { id_cost_center: 151, line_type: 'income', behavior_type: 'fixed', budget_date: '2026-03-10', projected_amount: 100 },
        { id_cost_center: 151, line_type: 'income', behavior_type: 'fixed', payment_date: 'x', budget_date: 'y', projected_amount: 100 }
      ],
      2026
    )
    expect(map.get(151)).toEqual([0, 0, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  })
  it('no array → Map vacío', () => {
    expect(entradasCausacionByCeco(null, 2026).size).toBe(0)
  })
})

describe('entradasCausacionByVariableCeco — base de recaudo keyed por CECO variable (A-02)', () => {
  const catalog = [
    { id_cost_center: 151, id_zone: 7, id_line: 1 },
    { id_cost_center: 210, id_zone: 7, id_line: 1 }
  ]
  const lines = [
    { id_cost_center: 151, line_type: 'income', behavior_type: 'fixed', budget_date: '2026-03-10', payment_date: '2026-04-20', projected_amount: 800 },
    { id_cost_center: 210, line_type: 'expense', behavior_type: 'variable_receivables', budget_date: '2026-03-15', projected_amount: 100 }
  ]

  it('serie por MES DE PAGO del generador, keyed por el CECO variable 210', () => {
    const map = entradasCausacionByVariableCeco(lines, catalog, 2026)
    expect(map.size).toBe(1)
    expect(map.get(210)).toEqual([0, 0, 0, 800, 0, 0, 0, 0, 0, 0, 0, 0])
  })
  it('filtro de año del cobro aplica igual que la serie directa', () => {
    const conCobro2027 = [
      { id_cost_center: 151, line_type: 'income', behavior_type: 'fixed', budget_date: '2026-12-10', payment_date: '2027-01-15', projected_amount: 800 },
      { id_cost_center: 210, line_type: 'expense', behavior_type: 'variable_receivables', budget_date: '2026-03-15', projected_amount: 100 }
    ]
    expect(entradasCausacionByVariableCeco(conCobro2027, catalog, 2026).size).toBe(0)
  })
  it('no array → Map vacío', () => {
    expect(entradasCausacionByVariableCeco(null, catalog, 2026).size).toBe(0)
  })
})

describe('fixedIncomeBucketByCeco — buckets extendidos por CAUSACIÓN (A-03)', () => {
  const lines = [
    { id_cost_center: 151, line_type: 'income', behavior_type: 'fixed', budget_date: '2025-12-20', projected_amount: 100 },
    { id_cost_center: 151, line_type: 'income', behavior_type: 'fixed', budget_date: '2026-05-20', projected_amount: 200 },
    { id_cost_center: 151, line_type: 'income', behavior_type: 'fixed', budget_date: '2027-02-20', projected_amount: 300 },
    { id_cost_center: 151, line_type: 'income', behavior_type: 'fixed', budget_date: 'garbage', projected_amount: 400 }
  ]

  it('before / months[12] / after con ilegibles excluidas', () => {
    const map = fixedIncomeBucketByCeco(lines, 2026)
    expect(map.size).toBe(1)
    expect(map.get(151)).toEqual({
      before: 100,
      months: [0, 0, 0, 0, 200, 0, 0, 0, 0, 0, 0, 0],
      after: 300
    })
  })
  it('CECO solo con fechas ilegibles → sin fila', () => {
    const map = fixedIncomeBucketByCeco(
      [{ id_cost_center: 999, line_type: 'income', behavior_type: 'fixed', budget_date: 'x', projected_amount: 1 }],
      2026
    )
    expect(map.size).toBe(0)
  })
  it('no array → Map vacío', () => {
    expect(fixedIncomeBucketByCeco(null, 2026).size).toBe(0)
  })
})

describe('entradasBucketByCeco — buckets por MES DE COBRO, SIN filtro de año (A-03)', () => {
  const lines = [
    { id_cost_center: 151, line_type: 'income', behavior_type: 'fixed', budget_date: '2026-12-10', payment_date: '2027-01-15', projected_amount: 500 },
    { id_cost_center: 151, line_type: 'income', behavior_type: 'fixed', budget_date: '2026-01-10', payment_date: '2025-11-01', projected_amount: 600 },
    { id_cost_center: 151, line_type: 'income', behavior_type: 'fixed', budget_date: '2026-06-10', payment_date: '2026-06-25', projected_amount: 700 },
    { id_cost_center: 151, line_type: 'income', behavior_type: 'fixed', budget_date: '2026-07-10', payment_date: 'sin fecha', projected_amount: 800 }
  ]

  it('el bucket ES el filtro: dic-N cobrado en N+1 → after (a diferencia de A-02)', () => {
    const map = entradasBucketByCeco(lines, 2026)
    expect(map.get(151)).toEqual({
      before: 600,
      months: [0, 0, 0, 0, 0, 700, 0, 0, 0, 0, 0, 0],
      after: 500
    })
  })
  it('cobro ilegible → excluida (sin unplaced aquí)', () => {
    const map = entradasBucketByCeco(
      [{ id_cost_center: 151, line_type: 'income', behavior_type: 'fixed', budget_date: '2026-07-10', payment_date: 'sin fecha', projected_amount: 800 }],
      2026
    )
    expect(map.size).toBe(0)
  })
  it('no array → Map vacío', () => {
    expect(entradasBucketByCeco(null, 2026).size).toBe(0)
  })
})

describe('fixedIncomeBucketByVariableCeco — buckets de facturación keyed por CECO variable (A-03)', () => {
  const catalog = [
    { id_cost_center: 151, id_zone: 7, id_line: 1 },
    { id_cost_center: 210, id_zone: 7, id_line: 1 }
  ]
  const lines = [
    { id_cost_center: 151, line_type: 'income', behavior_type: 'fixed', budget_date: '2025-12-20', projected_amount: 100 },
    { id_cost_center: 151, line_type: 'income', behavior_type: 'fixed', budget_date: '2026-05-20', projected_amount: 200 },
    { id_cost_center: 151, line_type: 'income', behavior_type: 'fixed', budget_date: '2027-02-20', projected_amount: 300 },
    { id_cost_center: 210, line_type: 'expense', behavior_type: 'variable_sales', budget_date: '2026-05-20', projected_amount: 1 }
  ]

  it('shape {before, months, after} del generador copiado bajo el CECO variable', () => {
    const map = fixedIncomeBucketByVariableCeco(lines, catalog, 2026)
    expect(map.get(210)).toEqual({
      before: 100,
      months: [0, 0, 0, 0, 200, 0, 0, 0, 0, 0, 0, 0],
      after: 300
    })
  })
  it('no array → Map vacío', () => {
    expect(fixedIncomeBucketByVariableCeco(null, catalog, 2026).size).toBe(0)
  })
})

describe('entradasBucketByVariableCeco — buckets de recaudo keyed por CECO variable (A-03)', () => {
  const catalog = [
    { id_cost_center: 151, id_zone: 7, id_line: 1 },
    { id_cost_center: 210, id_zone: 7, id_line: 1 }
  ]
  const lines = [
    { id_cost_center: 151, line_type: 'income', behavior_type: 'fixed', budget_date: '2026-12-10', payment_date: '2027-01-15', projected_amount: 500 },
    { id_cost_center: 151, line_type: 'income', behavior_type: 'fixed', budget_date: '2026-06-10', payment_date: '2026-06-25', projected_amount: 700 },
    { id_cost_center: 210, line_type: 'expense', behavior_type: 'variable_receivables', budget_date: '2026-06-15', projected_amount: 1 }
  ]

  it('buckets por MES DE PAGO del generador (sin filtro de año)', () => {
    const map = entradasBucketByVariableCeco(lines, catalog, 2026)
    expect(map.get(210)).toEqual({
      before: 0,
      months: [0, 0, 0, 0, 0, 700, 0, 0, 0, 0, 0, 0],
      after: 500
    })
  })
  it('no array → Map vacío', () => {
    expect(entradasBucketByVariableCeco(null, catalog, 2026).size).toBe(0)
  })
})

describe('variableCollectionDistribution — distribución de cobro A-04', () => {
  const catalog = [
    { id_cost_center: 151, id_zone: 7, id_line: 1 },
    { id_cost_center: 210, id_zone: 7, id_line: 1 }
  ]
  const concept = (overrides = {}) => ({
    id_budget_line: 5,
    id_cost_center: 210,
    line_type: 'expense',
    behavior_type: 'variable_receivables',
    budget_date: '2026-03-05',
    variable_rate: 0.1,
    ...overrides
  })
  const bill = (overrides = {}) => ({
    id_budget_line: 11,
    id_cost_center: 151,
    line_type: 'income',
    behavior_type: 'fixed',
    budget_date: '2026-03-10',
    payment_date: '2026-03-25',
    projected_amount: 1000000,
    ...overrides
  })

  it('comisión del mes: rate × facturación del generador en su bucket de COBRO', () => {
    const map = variableCollectionDistribution([concept()], [bill()], catalog, 2026)
    expect(map.size).toBe(1)
    expect(map.get(5)).toEqual({
      before: 0,
      months: [0, 0, 100000, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      after: 0,
      unplaced: 0
    })
  })
  it('criterio de caja: Antes / Después / unplaced del COBRO', () => {
    const bills = [
      bill({ id_budget_line: 21, budget_date: '2026-02-10', payment_date: '2025-12-30', projected_amount: 500000 }),
      bill({ id_budget_line: 22, budget_date: '2026-02-10', payment_date: '2027-01-15', projected_amount: 300000 }),
      bill({ id_budget_line: 23, budget_date: '2026-02-10', payment_date: 'sin fecha', projected_amount: 200000 })
    ]
    const concepts = [concept({ id_budget_line: 7, budget_date: '2026-02-05', variable_rate: 0.5 })]
    const map = variableCollectionDistribution(concepts, bills, catalog, 2026)
    expect(map.get(7)).toEqual({
      before: 250000,
      months: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      after: 150000,
      unplaced: 100000
    })
  })
  it('cobros de OTRO mes de facturación no alimentan al concepto', () => {
    const bills = [bill({ budget_date: '2026-04-10', payment_date: '2026-04-20', projected_amount: 400000 })]
    const map = variableCollectionDistribution([concept()], bills, catalog, 2026)
    expect(map.has(5)).toBe(false)
  })
  it('rate ausente o 0 → sin entrada (sin fallback); ceco sin resolución → sin entrada', () => {
    const bills = [bill()]
    const map = variableCollectionDistribution(
      [concept({ id_budget_line: 31, variable_rate: null }), concept({ id_budget_line: 32, variable_rate: 0 }), concept({ id_cost_center: 320, id_budget_line: 33 })],
      bills,
      catalog,
      2026
    )
    expect(map.size).toBe(0)
  })
  it('varios conceptos del MISMO CECO+mes acumulan por separado (keyed por línea)', () => {
    const bills = [bill({ projected_amount: 1000000 })]
    const concepts = [concept({ id_budget_line: 41, variable_rate: 0.1 }), concept({ id_budget_line: 42, variable_rate: 0.2 })]
    const map = variableCollectionDistribution(concepts, bills, catalog, 2026)
    expect(map.get(41).months[2]).toBe(100000)
    expect(map.get(42).months[2]).toBe(200000)
  })
  it('sin conceptos → Map vacío', () => {
    expect(variableCollectionDistribution([], [bill()], catalog, 2026).size).toBe(0)
    expect(variableCollectionDistribution(null, [bill()], catalog, 2026).size).toBe(0)
  })
})

describe('primitivas de fecha consolidadas — re-exportadas por el barril (planningDate.js)', () => {
  it('monthEndOf: último día del mes por regex/aritmética UTC', () => {
    expect(monthEndOf('2026-02-10')).toBe('2026-02-28')
    expect(monthEndOf('2024-02-10')).toBe('2024-02-29') // bisiesto
    expect(monthEndOf('2026-12-31')).toBe('2026-12-31')
    expect(monthEndOf(null)).toBe(null)
    expect(monthEndOf('garbage')).toBe(null)
    expect(monthEndOf('2026-13-01')).toBe(null)
  })
  it('addDaysISO: aritmética Date.UTC, cruza mes/año y valida entrada', () => {
    expect(addDaysISO('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysISO('2026-06-15', 0)).toBe('2026-06-15')
    expect(addDaysISO(null, 5)).toBe(null)
    expect(addDaysISO('2026-06-15', 1.5)).toBe(null) // offset no entero
    expect(addDaysISO('2026-06-00', 1)).toBe(null) // día fuera de rango
  })
  it('monthEndsOfYear: 12 month-ends ISO locales del año (fallback año actual)', () => {
    expect(monthEndsOfYear(2026)[0]).toBe('2026-01-31')
    expect(monthEndsOfYear(2026)[1]).toBe('2026-02-28')
    expect(monthEndsOfYear(2024)[1]).toBe('2024-02-29')
    expect(monthEndsOfYear(2026)[11]).toBe('2026-12-31')
    expect(monthEndsOfYear('no-numero')).toHaveLength(12)
  })
})

describe('labels — constantes de presentación', () => {
  it('MONTH_LABELS Ene..Dic', () => {
    expect(MONTH_LABELS).toEqual(['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'])
  })
  it('STATUS_LABELS exactos (§6.1)', () => {
    expect(STATUS_LABELS).toEqual({ active: '🎯 Meta Activa', draft: 'Borrador', closed: 'Cerrado' })
  })
  it('statusChipOf: active/closed/draft con su tone', () => {
    expect(statusChipOf('active')).toEqual({ label: '🎯 Meta Activa', tone: 'active' })
    expect(statusChipOf('closed')).toEqual({ label: 'Cerrado', tone: 'closed' })
    expect(statusChipOf('draft')).toEqual({ label: 'Borrador', tone: 'draft' })
  })
  it('statusChipOf: estado desconocido → chip draft (fallback)', () => {
    expect(statusChipOf('otro')).toEqual({ label: 'Borrador', tone: 'draft' })
    expect(statusChipOf(undefined)).toEqual({ label: 'Borrador', tone: 'draft' })
  })
  it('BEHAVIOR_LABELS (BehaviorTypeEnum)', () => {
    expect(BEHAVIOR_LABELS).toEqual({
      fixed: 'Fijo',
      variable_sales: 'Variable por Facturación',
      variable_receivables: 'Variable por Recaudo'
    })
  })
  it('LINE_TYPE_LABELS (FE-S9 §2.1: += purchase)', () => {
    expect(LINE_TYPE_LABELS).toEqual({ income: 'Ingreso', expense: 'Gasto', purchase: 'Compra' })
  })
  it('VARIABLE_PIVOT_NOTE — texto único del bloque estimado (FE-S18 RF-4.2 + A-02)', () => {
    expect(typeof VARIABLE_PIVOT_NOTE).toBe('string')
    expect(VARIABLE_PIVOT_NOTE).toContain('Monto estimado según el comportamiento de la línea')
    expect(VARIABLE_PIVOT_NOTE).toContain('base por CECO resuelto (A-01)')
    expect(VARIABLE_PIVOT_NOTE).toContain('recaudo = tasa × ENTRADAS del Flujo del MES de cobro')
    expect(VARIABLE_PIVOT_NOTE).toContain('REVISIÓN 5 / frontend.03_21 §5.3')
  })
  it('VARIABLE_COLLECTION_DISTRIBUTION_NOTE — nota del criterio de caja (A-04 §13)', () => {
    expect(typeof VARIABLE_COLLECTION_DISTRIBUTION_NOTE).toBe('string')
    expect(VARIABLE_COLLECTION_DISTRIBUTION_NOTE).toContain('Criterio de caja (A-04)')
    expect(VARIABLE_COLLECTION_DISTRIBUTION_NOTE).toContain('La Vista Ejecutiva mantiene el devengo por línea')
    expect(VARIABLE_COLLECTION_DISTRIBUTION_NOTE).toContain('frontend.03_21 §13')
  })
})
