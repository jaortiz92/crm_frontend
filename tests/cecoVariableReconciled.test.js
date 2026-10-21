/**
 * REVISIÓN 4 (spec `frontend.03_19` §11) — drill-down de "Gastos variables
 * (calculados)": garantiza que el detalle de CECO reproduce la MISMA cifra
 * derivada de la matriz (`tasa × Σ ingresos fijos del mes de causación`):
 *  (a) helpers de la base (`fixedIncomeCausationSeries` global +
 *      `fixedIncomeCausationByCeco` por CECO);
 *  (b) Σ variable del detalle == celdas de `buildVariableExpensePivot`
 *      (Ejecutiva) Y de `variablesPivot` del Flujo para el mismo CECO (AC-16);
 *  (c) `buildCecoSheets` exporta el monto reconciliado (RF-11.5/AC-17).
 *
 * Mismo estilo que `planningExportModels.test.js`: factories con stores
 * planos (sin Pinia), datos sintéticos, cero HTTP.
 */
import { describe, it, expect } from 'vitest'
import { createExecutivePivotModel } from '@/components/budget/planning/executivePivot.js'
import { createCashFlowPivotModel } from '@/components/budget/planning/cashFlowPivot.js'
import { fixedIncomeCausationByCeco, fixedIncomeCausationSeries } from '@/components/budget/planning/planningFormat.js'
import { buildCecoSheets } from '@/components/budget/planning/planningExportSheets.js'
import {
  movementAmount,
  movementAmountReconciled,
  movementMonthOf,
  TAB_CAUSED,
  TAB_FLOW
} from '@/components/budget/planning/cecoMovements.js'

function makeStore({ ivaMode = false } = {}) {
  return {
    ivaMode,
    costCenters: [],
    costCenterLabel: (id) => `CECO-${id}`,
    collectionLabel: (id) => (id == null ? '—' : `Temp-${id}`),
    lineCostRates: [],
    lineCostRatesError: false,
    lineCostRatesLoaded: true,
    payableTermsLoaded: true,
    payableTermsError: false,
    payableTermsByLine: new Map(),
    internmentCatalogLoaded: true,
    internmentCatalogError: false,
    internmentRateByLine: new Map(),
    internmentTermsByLine: new Map(),
    tax: { summary: null, stale: false, budgetId: 573 },
    settlement: { data: null, loading: false, error: false, loaded: true, year: 2026 },
    carryover: { enabled: false, source: null, lines: [] }
  }
}

/**
 * Escenario sintético: ingresos fijos en mar (1.000.000) y feb (500.000),
 * línea variable de INGRESO (no entra a la base), línea variable de gasto
 * del CECO 201 en mar (tasa 8 %, con IVA), variable en oct (tasa 10 %, SIN
 * IVA), variable con mes ilegible y gasto fijo en jun.
 */
function makeScenario() {
  return {
    id_budget: 573,
    budget_year: 2026,
    budget_lines: [
      {
        id_budget_line: 1,
        id_cost_center: 101,
        line_type: 'income',
        behavior_type: 'fixed',
        budget_date: '2026-03-10',
        payment_date: '2026-03-25',
        projected_amount: 1000000,
        has_iva: true,
        variable_rate: null
      },
      {
        id_budget_line: 4,
        id_cost_center: 102,
        line_type: 'income',
        behavior_type: 'fixed',
        budget_date: '2026-02-05',
        payment_date: '2026-02-20',
        projected_amount: 500000,
        has_iva: true,
        variable_rate: null
      },
      {
        // REVISIÓN 5 (frontend.03_21): ingreso FIJO del PROPIO CECO 201 (mar) —
        // base B1c por CECO del monto variable del detalle.
        id_budget_line: 9,
        id_cost_center: 201,
        line_type: 'income',
        behavior_type: 'fixed',
        budget_date: '2026-03-08',
        payment_date: '2026-03-28',
        projected_amount: 1000000,
        has_iva: true,
        variable_rate: null
      },
      {
        // Variable de RECAUDO (no fija) — NO entra a la base.
        id_budget_line: 2,
        id_cost_center: 103,
        line_type: 'income',
        behavior_type: 'variable_receivables',
        budget_date: '2026-03-01',
        payment_date: '2026-03-01',
        projected_amount: 999999,
        has_iva: true,
        variable_rate: null
      },
      {
        id_budget_line: 5,
        id_cost_center: 201,
        line_type: 'expense',
        behavior_type: 'variable_sales',
        budget_date: '2026-03-15',
        payment_date: '2026-04-10',
        projected_amount: 7000,
        has_iva: true,
        variable_rate: 0.08
      },
      {
        id_budget_line: 6,
        id_cost_center: 201,
        line_type: 'expense',
        behavior_type: 'variable_receivables',
        budget_date: '2026-10-20',
        payment_date: '2026-11-05',
        projected_amount: 12000,
        has_iva: false,
        variable_rate: 0.1
      },
      {
        // Variable con mes de causación ilegible ⇒ aporte 0 (como la matriz).
        id_budget_line: 7,
        id_cost_center: 201,
        line_type: 'expense',
        behavior_type: 'variable_sales',
        budget_date: null,
        payment_date: '2026-06-01',
        projected_amount: 5000,
        has_iva: true,
        variable_rate: 0.25
      },
      {
        id_budget_line: 8,
        id_cost_center: 201,
        line_type: 'expense',
        behavior_type: 'fixed',
        budget_date: '2026-06-01',
        payment_date: '2026-06-30',
        projected_amount: 400000,
        has_iva: false,
        variable_rate: null
      }
    ]
  }
}

/** Mes (0–11) de causación de una línea de datos sintéticos (ISO simple). */
function causedMonthOfSynthetic(line) {
  const value = String(line.budget_date ?? '').match(/^(\d{4})-(\d{2})/)
  if (!value) return -1
  const month = Number(value[2]) - 1
  return month >= 0 && month <= 11 ? month : -1
}

/**
 * Σ reconciliada por MES de CAUSACIÓN de las líneas variables de gasto del
 * CECO 201 — cómo vería la serie el detalle (movimiento por movimiento,
 * ambos tabs comparten monto con el posicionamiento del RF-11.4).
 * REVISIÓN 5 (frontend.03_21): la base es la serie POR CECO del detalle
 * (`fixedIncomeCausationByCeco(...).get(201)`) — la MISMA regla que los
 * pivotes corregidos (tasa × I_201(m)).
 */
function reconciledMonthsByTab(scenario, tab, ivaActive) {
  const series = fixedIncomeCausationByCeco(scenario.budget_lines).get(201)
  const fallback = Array.from({ length: 12 }, () => 0)
  const months = Array.from({ length: 12 }, () => 0)
  let total = 0
  for (const line of scenario.budget_lines) {
    if (line.id_cost_center !== 201) continue
    if (line.line_type !== 'expense' || line.behavior_type === 'fixed') continue
    const amount = movementAmountReconciled(
      { ...line, source_kind: 'base' },
      tab,
      ivaActive,
      series ?? fallback
    )
    const month = causedMonthOfSynthetic(line) // criterio RF-11.4 en ambos tabs
    if (month >= 0) {
      months[month] += Number.isFinite(amount) ? amount : 0
      total += Number.isFinite(amount) ? amount : 0
    }
  }
  return { months, total }
}

/* ───────────────────────── (a) helper de la base ───────────────────────── */

describe('REVISIÓN 4 (frontend.03_19 §11): fixedIncomeCausationSeries (base única del variable)', () => {
  it('Σ ingresos fijos por MES DE CAUSACIÓN; ignora variables, no finitos y meses ilegibles', () => {
    const scenario = makeScenario()
    const series = fixedIncomeCausationSeries(scenario.budget_lines)
    expect(series).toHaveLength(12)
    expect(series[1]).toBe(500000) // feb (CECO 102)
    expect(series[2]).toBe(2000000) // mar (1.000.000 CECO 101 + 1.000.000 CECO 201; el variable_receivables NO suma)
    expect(series[9]).toBe(0)
    expect(series.reduce((acc, v) => acc + v, 0)).toBe(2500000)
  })

  it('entrada no-array ⇒ serie de 12 ceros (degradación honesta)', () => {
    expect(fixedIncomeCausationSeries(null)).toEqual(Array.from({ length: 12 }, () => 0))
  })
})

describe('REVISIÓN 5 (frontend.03_21 §5.1): fixedIncomeCausationByCeco (base por CECO del variable)', () => {
  it('Σ ingresos fijos por CECO y mes de causación; CECO sin ingreso ⇒ sin fila en el Map', () => {
    const byCeco = fixedIncomeCausationByCeco(makeScenario().budget_lines)
    expect(byCeco.get(102)[1]).toBe(500000) // feb
    expect(byCeco.get(201)[2]).toBe(1000000) // mar del PROPIO CECO 201
    expect(byCeco.get(103)).toBeUndefined() // variable_receivables NO entra a la base
    expect(byCeco.get(999)).toBeUndefined()
  })

  it('entrada no-array ⇒ Map vacío (degradación honesta)', () => {
    expect(fixedIncomeCausationByCeco(null).size).toBe(0)
  })
})

/* ─── (b) Σ del detalle == celdas de los pivotes de matriz (AC-16) ─── */

describe('REVISIÓN 4: Σ variable del detalle cuadra con buildVariableExpensePivot y variablesPivot', () => {
  const scenario = makeScenario()
  // REVISIÓN 5 (frontend.03_21): la base del detalle ES la serie POR CECO del
  // CECO de drill-down (201) — la misma regla de los pivotes corregidos.
  const cecoSeries = fixedIncomeCausationByCeco(scenario.budget_lines).get(201)

  it('tab Causado == fila variable del pivote de la Ejecutiva (neto, D-FE14-7)', () => {
    const model = createExecutivePivotModel({ scenario, store: makeStore() })
    const variablePivot = model.variablePivot.value
    const row = variablePivot.rows.find((r) => r.id === 201)
    expect(row).toBeDefined()
    const middle = reconciledMonthsByTab(scenario, TAB_CAUSED, false)
    expect(middle.months[2]).toBe(80000) // 0.08 × 1.000.000 (ingreso del PROPIO CECO 201)
    expect(middle.months[2]).toBe(row.months[2])
    expect(middle.months[9]).toBe(row.months[9]) // 0.1 × 0 ingresos base ⇒ 0
    expect(middle.total).toBe(row.total)
  })

  it('tab Flujo (neto) == bloque variablesPivot del Flujo; misma cifra que Causado', () => {
    const model = createCashFlowPivotModel({
      scenario,
      financingPrincipalLines: [],
      financingDisbursementLines: [],
      store: makeStore()
    })
    const row = model.variablesPivot.value.rows.find((r) => r.id === 201)
    expect(row).toBeDefined()
    const middle = reconciledMonthsByTab(scenario, TAB_FLOW, false)
    // El builder del Flujo posiciona por MES DE CAUSACIÓN (budget_date).
    expect(middle.months[2]).toBe(80000)
    expect(middle.months[2]).toBe(row.months[2])
    expect(middle.months[9]).toBe(row.months[9])
    expect(middle.total).toBe(row.total)
    // El monto presentado del detalle en Flujo (neto) es el MISMO que en Causado:
    const line = scenario.budget_lines.find((l) => l.id_budget_line === 5)
    expect(movementAmountReconciled(line, TAB_FLOW, false, cecoSeries)).toBe(
      movementAmountReconciled(line, TAB_CAUSED, false, cecoSeries)
    )
  })

  it('tab Flujo con IVA (×1.19 sobre el derivado, flag has_iva) == variablesPivot bruto', () => {
    const model = createCashFlowPivotModel({
      scenario,
      financingPrincipalLines: [],
      financingDisbursementLines: [],
      store: makeStore({ ivaMode: true })
    })
    const row = model.variablesPivot.value.rows.find((r) => r.id === 201)
    expect(row).toBeDefined()
    const middle = reconciledMonthsByTab(scenario, TAB_FLOW, true)
    expect(middle.months[2]).toBe(80000 * 1.19)
    expect(middle.months[2]).toBe(row.months[2])
    // La variable SIN IVA efectivo has_iva:false no lleva gross-up (D-FE14);
    // oct sin base ⇒ 0 en ambos lados.
    expect(middle.months[9]).toBe(row.months[9])
    expect(middle.months[9]).toBe(0)
  })

  it('mes ilegible o sin base ⇒ 0 (idéntico al `continue` de los builders)', () => {
    const lines = scenario.budget_lines
    expect(
      movementAmountReconciled(lines.find((l) => l.id_budget_line === 7), TAB_CAUSED, false, cecoSeries)
    ).toBe(0)
    // La variable de oct aporta 0 porque el mes NO tiene ingresos del CECO.
    expect(
      movementAmountReconciled(lines.find((l) => l.id_budget_line === 6), TAB_CAUSED, false, cecoSeries)
    ).toBe(0)
    // Sin serie ⇒ 0 (degradación honesta: sin base no hay cifra reconciliada).
    expect(
      movementAmountReconciled(lines.find((l) => l.id_budget_line === 5), TAB_CAUSED, false, undefined)
    ).toBe(0)
  })

  it('posicionamiento del detalle: Causado por budget_date; variable en Flujo TAMBIÉN por causación (RF-11.4)', () => {
    const line = makeScenario().budget_lines.find((l) => l.id_budget_line === 5)
    // Base genérica: Causado budget_date (mar = 2), Flujo payment_date (abr = 3).
    expect(movementMonthOf(line, TAB_CAUSED)).toBe(2)
    expect(movementMonthOf(line, TAB_FLOW)).toBe(3)
    // La suma variable usa su criterio de builder en el pivot (verificado por
    // el cuadre mes a mes en las pruebas anteriores contra variablesPivot).
    expect(movementAmountReconciled(line, TAB_FLOW, false, cecoSeries)).toBe(80000)
  })

  it('los movimientos NO variables conservan movementAmount byte-a-byte (RF-8.6)', () => {
    for (const line of scenario.budget_lines) {
      if (line.line_type === 'expense' && line.behavior_type !== 'fixed') continue
      const movement = { ...line, source_kind: 'base' }
      expect(movementAmountReconciled(movement, TAB_CAUSED, false, cecoSeries)).toBe(
        movementAmount(movement, TAB_CAUSED, false)
      )
      expect(movementAmountReconciled(movement, TAB_CAUSED, true, cecoSeries)).toBe(
        movementAmount(movement, TAB_CAUSED, true)
      )
      expect(movementAmountReconciled(movement, TAB_FLOW, true, cecoSeries)).toBe(
        movementAmount(movement, TAB_FLOW, true)
      )
    }
  })
})

/* ── (c) buildCecoSheets exporta el monto reconciliado (RF-11.5/AC-17) ── */

describe('REVISIÓN 4/5: buildCecoSheets exporta montos reconciliados (1:1 con pantalla)', () => {
  it('Causado/Flujo con la serie POR CECO: variable = tasa × I_201(m); fijo conserva su crudo', () => {
    const scenario = makeScenario()
    // REVISIÓN 5 (frontend.03_21): la base que viaja a pivot/tabla/export es la
    // serie POR CECO del CECO de drill-down (201).
    const series = fixedIncomeCausationByCeco(scenario.budget_lines).get(201)
    const movements = scenario.budget_lines
    const [causado] = buildCecoSheets({
      movements,
      tab: TAB_CAUSED,
      ivaActive: false,
      fixedIncomeByMonth: series,
      sheetName: 'Causado'
    })
    const variable = causado.rows.find((row) => row.lineNo === 5)
    expect(variable.monto).toBe(80000)
    expect(causado.rows.find((row) => row.lineNo === 6).monto).toBe(0)
    expect(causado.rows.find((row) => row.lineNo === 7).monto).toBe(0)
    expect(causado.rows.find((row) => row.lineNo === 8).monto).toBe(400000)
    // Σ Total sobre el dataset completo (incluye los ingresos): 3.499.999
    // ingresos (1 MM CECO 101 + 0,5 MM CECO 102 + 999.999 variable + 1 MM CECO
    // 201) + 80.000 variable + 0 (oct/ilegible) + 400.000 fijo.
    expect(causado.rows[causado.rows.length - 1].monto).toBe(3979999)

    const [flujo] = buildCecoSheets({
      movements,
      tab: TAB_FLOW,
      ivaActive: true,
      fixedIncomeByMonth: series,
      sheetName: 'Flujo'
    })
    // Variable con IVA (has_iva: true ⇒ ×1.19 del DERIVADO); fijo has_iva:false ⇒ neto.
    expect(flujo.rows.find((row) => row.lineNo === 5).monto).toBe(80000 * 1.19)
    expect(flujo.rows.find((row) => row.lineNo === 8).monto).toBe(400000)
  })
})
