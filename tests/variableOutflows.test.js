/**
 * frontend.03_25 — "Gasto variable por salidas de dinero" (`variable_outflows`).
 * Spec: `crm_frontend/spec/frontend.03_25_Spec_frontend_variable_expense_outflows.md`
 * (madre: `spec/04_Spec_Gasto_variable_por_salidas.md`; espejo backend.02_28).
 *
 * Cobertura (§7 plan de pruebas):
 *  1. Composición de Base(m) (BR-VS-F1) e identidad Salidas = Base + Σ aportes
 *     (BR-VS-F6) con los números del §1 del ejemplo de referencia.
 *  2. Derivación por CECO propio y MES DE CAUSACIÓN (BR-VS-F2/F3/F4).
 *  3. Validaciones del formulario (tasa obligatoria, monto deshabilitado —
 *     patrón genérico `!== 'fixed'`, BR-VS-F5) + labels/select (AC-FE-VS-1).
 *  4. Regresión: presupuesto SIN el nuevo tipo (pivotes idénticos, AC-FE-VS-7).
 *  5. Tercera rama en Ejecutiva, drill-down CECO y exportación (AC-FE-VS-6).
 *
 * Mismo estilo que `cecoVariableReconciled.test.js`: factories con stores
 * planos (sin Pinia), datos sintéticos, cero HTTP.
 */
import { describe, it, expect } from 'vitest'
import {
  buildOutflowsBaseBuckets,
  buildOoyBucketSeries,
  buildVariableOutflowsFlowPivot,
  buildCashFlowResumen,
  createCashFlowPivotModel
} from '@/components/budget/planning/cashFlowPivot.js'
import {
  buildVariableExpensePivot,
  createExecutivePivotModel
} from '@/components/budget/planning/executivePivot.js'
import { buildCecoSheets } from '@/components/budget/planning/planningExportSheets.js'
import {
  movementAmountReconciled,
  TAB_CAUSED,
  TAB_FLOW
} from '@/components/budget/planning/cecoMovements.js'
import {
  amountErrorOf,
  rateErrorOf
} from '@/components/budget/planning/lineFormValidation.js'
import {
  BEHAVIOR_LABELS,
  VARIABLE_OUTFLOWS_PIVOT_NOTE
} from '@/components/budget/planning/planningLabels.js'

/** Store plano espejo de `cecoVariableReconciled.makeStore` (sin Pinia). */
function makeStore({ ivaMode = false, settlementData = null, taxCashFlow = null } = {}) {
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
    tax: { summary: null, stale: false, budgetId: 576, cashFlow: taxCashFlow },
    settlement: { data: settlementData, loading: false, error: false, loaded: true, year: 2026 },
    carryover: { enabled: false, source: null, lines: [] }
  }
}

function makeLine(overrides) {
  return {
    id_budget_line: 1,
    id_cost_center: 301,
    line_type: 'expense',
    behavior_type: 'fixed',
    budget_date: '2026-01-10',
    payment_date: '2026-01-25',
    projected_amount: 0,
    has_iva: false,
    variable_rate: null,
    ...overrides
  }
}

/** Escenario del §1 (presupuesto 576 simplificado): fijos = TODA la base. */
function makeSpecScenario() {
  return {
    id_budget: 576,
    budget_year: 2026,
    budget_lines: [
      // Salidas fijas = la única cola de la Base (modo OFF ⇒ sin settlement).
      makeLine({ id_budget_line: 10, projected_amount: 72375235.31 }), // Ene
      makeLine({ id_budget_line: 11, budget_date: '2026-02-10', payment_date: '2026-02-25', projected_amount: 81152462.31 }), // Feb
      // Tercer comportamiento: una línea por mes de causación (tasa 0,4 %).
      makeLine({
        id_budget_line: 20,
        behavior_type: 'variable_outflows',
        variable_rate: 0.004,
        budget_date: '2026-01-05',
        payment_date: '2026-03-01',
        projected_amount: 0
      }),
      makeLine({
        id_budget_line: 21,
        id_cost_center: 302,
        behavior_type: 'variable_outflows',
        variable_rate: 0.004,
        budget_date: '2026-02-05',
        payment_date: '2026-04-01',
        projected_amount: 0
      })
    ]
  }
}

/** Base = Σ de las series de salida YA derivadas (BR-VS-F1) de un modelo. */
function outflowsBaseOf(model) {
  return buildOutflowsBaseBuckets({
    fijos: model.fijosPivot.value,
    variables: model.variablesPivot.value,
    costes: model.costPaymentsPivot.value,
    principal: model.financingPrincipalPivot.value,
    liquidation: model.settlementPaymentsPivot.value,
    taxFlow: model.taxPaymentsPivot.value
  })
}

/* ── 3. Validaciones del formulario + labels (BR-VS-F5 / AC-FE-VS-1) ── */

describe('frontend.03_25: labels y validaciones del formulario (BR-VS-F5)', () => {
  it('BEHAVIOR_LABELS agrega la tercera opción "Variable por Salidas" (el select hereda)', () => {
    expect(BEHAVIOR_LABELS.variable_outflows).toBe('Variable por Salidas')
    // Orden de propagación: el select de LineFormModal usa Object.entries.
    expect(Object.keys(BEHAVIOR_LABELS)).toEqual([
      'fixed',
      'variable_sales',
      'variable_receivables',
      'variable_outflows'
    ])
    expect(VARIABLE_OUTFLOWS_PIVOT_NOTE).toContain('SALIDAS del Flujo')
  })

  it('variable_outflows hereda el patrón genérico !== fixed: tasa obligatoria', () => {
    const draft = { behaviorType: 'variable_outflows', ratePct: '' }
    // Create: tasa obligatoria (idéntico a los otros dos variables).
    expect(rateErrorOf(draft, false)).toBe('La tasa es obligatoria para líneas variables.')
    // Edit: vacía = "sin cambio" (PUT parcial).
    expect(rateErrorOf(draft, true)).toBe('')
    // Rango 0–100 vigente.
    expect(rateErrorOf({ ...draft, ratePct: '150' }, false)).toBe(
      'La tasa debe ser un número entre 0 y 100.'
    )
    expect(rateErrorOf({ ...draft, ratePct: '0,4' }, false)).toBe('')
  })

  it('variable_outflows: monto deshabilitado ⇒ validación del monto NO aplica', () => {
    const draft = { behaviorType: 'variable_outflows', amountText: '' }
    expect(amountErrorOf(draft)).toBe('')
  })
})

/* ── 1/2. Builders puros: Base(m) y derivación por CECO propio/causación ── */

describe('frontend.03_25: buildOutflowsBaseBuckets (composición de Base(m), BR-VS-F1)', () => {
  it('suma por MES las series de salida ya derivadas; pivotes null ⇒ 0', () => {
    const pivots = {
      fijos: { columnTotals: [100, 200], beforeTotal: 5, afterTotal: 7 },
      variables: { columnTotals: [10, 20], beforeTotal: 1, afterTotal: 0 },
      costes: { columnTotals: [1, 2], beforeTotal: 0, afterTotal: 0 },
      principal: { columnTotals: [1000, 2000], beforeTotal: 50, afterTotal: 70 },
      liquidation: null,
      taxFlow: { columnTotals: [4, 8], beforeTotal: 0, afterTotal: 0 }
    }
    const base = buildOutflowsBaseBuckets(pivots)
    expect(base.months[0]).toBe(100 + 10 + 1 + 1000 + 4)
    expect(base.months[1]).toBe(200 + 20 + 2 + 2000 + 8)
    expect(base.before).toBe(5 + 1 + 50)
    expect(base.after).toBe(7 + 70)
    expect(base.months).toHaveLength(12)
  })

  it('snapshot vacío ⇒ base toda cero (12 meses, Antes/Después 0)', () => {
    const base = buildOutflowsBaseBuckets(null)
    expect(base.months.every((value) => value === 0)).toBe(true)
    expect(base.before).toBe(0)
    expect(base.after).toBe(0)
  })
})

describe('frontend.03_25: buildVariableOutflowsFlowPivot (BR-VS-F2/F3/F4)', () => {
  const label = (id) => `CECO-${id}`
  const base = { before: 0, months: [1000000, 500000], after: 0 }

  it('fila por CECO PROPIO y mes de causación: celda = tasa × Base(mes)', () => {
    const pivot = buildVariableOutflowsFlowPivot(
      [
        makeLine({ id_cost_center: 301, behavior_type: 'variable_outflows', variable_rate: 0.004, budget_date: '2026-01-05' }),
        makeLine({ id_cost_center: 302, behavior_type: 'variable_outflows', variable_rate: 0.004, budget_date: '2026-02-05' })
      ],
      base,
      label,
      2026
    )
    expect(pivot.rows.map((row) => row.id)).toEqual([301, 302])
    expect(pivot.rows[0].months[0]).toBe(4000) // 0.4 % × 1.000.000
    expect(pivot.rows[1].months[1]).toBe(2000) // 0.4 % × 500.000 — Base de SU mes
    expect(pivot.rows[0].months[1]).toBe(0)
    expect(pivot.columnTotals[0]).toBe(4000)
    expect(pivot.columnTotals[1]).toBe(2000)
    expect(pivot.grandTotal).toBe(6000)
  })

  it('dos líneas del mismo mes en CECOs distintos ⇒ aportes independientes (AC-VS-3)', () => {
    const pivot = buildVariableOutflowsFlowPivot(
      [
        makeLine({ id_cost_center: 301, behavior_type: 'variable_outflows', variable_rate: 0.004, budget_date: '2026-01-05' }),
        makeLine({ id_cost_center: 302, behavior_type: 'variable_outflows', variable_rate: 0.004, budget_date: '2026-01-20' })
      ],
      base,
      label,
      2026
    )
    expect(pivot.rows[0].months[0]).toBe(4000)
    expect(pivot.rows[1].months[0]).toBe(4000)
    expect(pivot.columnTotals[0]).toBe(8000)
  })

  it('causación fuera del año N o ilegible ⇒ aporte 0 (fila existe, BR-VS-02)', () => {
    const pivot = buildVariableOutflowsFlowPivot(
      [
        makeLine({ behavior_type: 'variable_outflows', variable_rate: 0.004, budget_date: '2025-01-05' }), // Antes
        makeLine({ id_cost_center: 302, behavior_type: 'variable_outflows', variable_rate: 0.004, budget_date: '2027-01-05' }), // Después
        makeLine({ id_cost_center: 303, behavior_type: 'variable_outflows', variable_rate: 0.004, budget_date: null }) // ilegible
      ],
      base,
      label,
      2026
    )
    expect(pivot.rows.map((row) => row.id)).toEqual([301, 302, 303])
    expect(pivot.rows.every((row) => row.months.every((value) => value === 0))).toBe(true)
    expect(pivot.grandTotal).toBe(0)
    expect(pivot.beforeTotal).toBe(0)
    expect(pivot.afterTotal).toBe(0)
  })

  it('la línea de febrero usa la Base de FEBRERO (mes de causación, no de pago — AC-VS-4)', () => {
    const pivot = buildVariableOutflowsFlowPivot(
      [
        makeLine({ behavior_type: 'variable_outflows', variable_rate: 0.004, budget_date: '2026-02-05', payment_date: '2026-01-30' })
      ],
      base,
      label,
      2026
    )
    // Mes de pago (ene) NO manda: la causación (feb) posiciona y da la Base.
    expect(pivot.rows[0].months[0]).toBe(0)
    expect(pivot.rows[0].months[1]).toBe(2000)
  })

  it('SIN gross-up: el aporte es la tasa × Base cruda incluso con IVA activo en el llamador', () => {
    // El builder no recibe ivaMode: la identidad BR-VS-F6 manda y la Base ya
    // es la serie presentada. Aquí se verifica que el monto no lleva ×1.19.
    const pivot = buildVariableOutflowsFlowPivot(
      [makeLine({ behavior_type: 'variable_outflows', variable_rate: 0.004, has_iva: true, budget_date: '2026-01-05' })],
      base,
      label,
      2026
    )
    expect(pivot.rows[0].months[0]).toBe(4000)
  })

  it('sin líneas o Base toda cero ⇒ null (bloque ausente, AC-FE-VS-7)', () => {
    expect(buildVariableOutflowsFlowPivot([], base, label, 2026)).toBeNull()
    expect(
      buildVariableOutflowsFlowPivot(
        [makeLine({ behavior_type: 'variable_outflows', variable_rate: 0.004 })],
        { before: 0, months: Array.from({ length: 12 }, () => 0), after: 0 },
        label,
        2026
      )
    ).toBeNull()
  })
})

/* ── 1. Motor completo: Base(m) + identidad BR-VS-F6 (§1 presupuesto 576) ── */

describe('frontend.03_25: motor de Flujo — identidad Salidas(m) = Base(m) + Σ aportes (BR-VS-F6)', () => {
  const scenario = makeSpecScenario()
  const model = createCashFlowPivotModel({
    scenario,
    financingPrincipalLines: [],
    financingDisbursementLines: [],
    store: makeStore()
  })

  it('Base(Ene/Feb) = salidas fijas; aportes 0,4 % = cifras del §1 (±0,01)', () => {
    const base = outflowsBaseOf(model)
    expect(base.months[0]).toBe(72375235.31)
    expect(base.months[1]).toBe(81152462.31)
    const outflows = model.variableOutflowsPivot.value
    expect(outflows).not.toBeNull()
    // Presentación a 2 decimales (los crudos usan float sin redondeo).
    expect(Number(outflows.columnTotals[0].toFixed(2))).toBe(289500.94)
    expect(Number(outflows.columnTotals[1].toFixed(2))).toBe(324609.85)
    // El bloque variable clásico NO recibe las líneas variable_outflows.
    expect(model.variablesPivot.value).toBeNull()
  })

  it('Salidas(total) del resumen = Base + Σ aportes, exacta a 2 decimales (§1)', () => {
    const resumen = model.resumen.value
    const base = outflowsBaseOf(model)
    const aportes = model.variableOutflowsPivot.value.columnTotals
    for (let m = 0; m < 12; m += 1) {
      // Identidad EXACTA en crudo (BR-VS-F6).
      expect(resumen.salidas[m]).toBe(base.months[m] + aportes[m])
    }
    expect(Number(resumen.salidas[0].toFixed(2))).toBe(72664736.25)
    expect(Number(resumen.salidas[1].toFixed(2))).toBe(81477072.16)
    expect(Number(resumen.salidasTotal.toFixed(2))).toBe(
      Number((72375235.31 + 81152462.31 + 289500.94 + 324609.85).toFixed(2))
    )
  })

  it('el impuesto/taxFlow y la liquidación NO cambian por la presencia del tipo (BR-VS-F4)', () => {
    // Sin settlement ni taxFlow en el caché ⇒ pivotes null con y sin líneas.
    expect(model.settlementPaymentsPivot.value).toBeNull()
    expect(model.taxPaymentsPivot.value).toBeNull()
    // Y la Base compuesta no depende del aporte nuevo (excluido por orden).
    const baseCon = outflowsBaseOf(model)
    expect(baseCon.months[0]).toBe(72375235.31)
  })

  it('fuera de año: la serie nueva entra a la cola de salidas con Antes/Después 0', () => {
    const series = buildOoyBucketSeries({
      entradas: model.entradasPivot.value,
      fijos: model.fijosPivot.value,
      variables: model.variablesPivot.value,
      variableOutflows: model.variableOutflowsPivot.value
    })
    expect(series.salidas).toEqual([0, 0])
    expect(series.any).toBe(false)
  })
})

describe('frontend.03_25: AC-VS-3 en el resumen — dos líneas 0,4 %, Base 1.000.000', () => {
  const scenario = {
    id_budget: 577,
    budget_year: 2026,
    budget_lines: [
      makeLine({ id_budget_line: 30, projected_amount: 1000000 }),
      makeLine({ id_budget_line: 31, behavior_type: 'variable_outflows', variable_rate: 0.004, budget_date: '2026-01-05' }),
      makeLine({
        id_budget_line: 32,
        id_cost_center: 302,
        behavior_type: 'variable_outflows',
        variable_rate: 0.004,
        budget_date: '2026-01-20'
      })
    ]
  }
  const model = createCashFlowPivotModel({
    scenario,
    financingPrincipalLines: [],
    financingDisbursementLines: [],
    store: makeStore()
  })

  it('cada fila de CECO muestra 4.000 y las salidas suben 8.000', () => {
    const outflows = model.variableOutflowsPivot.value
    expect(outflows.rows.map((row) => row.months[0])).toEqual([4000, 4000])
    expect(model.resumen.value.salidas[0]).toBe(1000000 + 8000)
  })
})

/* ── 4. Regresión: presupuesto SIN el nuevo tipo (AC-FE-VS-7) ── */

describe('frontend.03_25: regresión 0 — presupuesto sin líneas variable_outflows', () => {
  const scenario = {
    id_budget: 578,
    budget_year: 2026,
    budget_lines: [
      makeLine({ id_budget_line: 40, projected_amount: 500000 }),
      makeLine({ id_budget_line: 41, budget_date: '2026-03-10', payment_date: '2026-03-25', projected_amount: 300000 }),
      makeLine({
        id_budget_line: 42,
        id_cost_center: 201,
        behavior_type: 'variable_sales',
        variable_rate: 0.08,
        budget_date: '2026-01-15',
        payment_date: '2026-02-10',
        projected_amount: 8000
      }),
      makeLine({
        id_budget_line: 43,
        id_cost_center: 201,
        line_type: 'income',
        behavior_type: 'fixed',
        budget_date: '2026-01-05',
        payment_date: '2026-01-20',
        projected_amount: 1000000
      })
    ]
  }
  const model = createCashFlowPivotModel({
    scenario,
    financingPrincipalLines: [],
    financingDisbursementLines: [],
    store: makeStore()
  })

  it('serie por salidas ausente (null) ⇒ resumen byte-idéntico al anterior', () => {
    expect(model.variableOutflowsPivot.value).toBeNull()
    const legacy = buildCashFlowResumen({
      disbursement: model.financingDisbursementPivot.value,
      cobros: model.cobrosArrastre.value,
      pagos: model.pagosArrastre.value,
      costes: model.costPaymentsPivot.value,
      internment: model.internmentPaymentsPivot.value,
      principal: model.financingPrincipalPivot.value,
      liquidation: model.settlementPaymentsPivot.value,
      taxFlow: model.taxPaymentsPivot.value,
      entradasPivot: model.entradasPivot.value,
      fijosPivot: model.fijosPivot.value,
      variablesPivot: model.variablesPivot.value
    })
    expect(model.resumen.value.salidas).toEqual(legacy.salidas)
    expect(model.resumen.value.neto).toEqual(legacy.neto)
    expect(model.resumen.value.acumulado).toEqual(legacy.acumulado)
    expect(model.resumen.value.salidasTotal).toBe(legacy.salidasTotal)
  })

  it('el bloque variable clásico sigue con su base de facturación intacta', () => {
    const variables = model.variablesPivot.value
    expect(variables).not.toBeNull()
    // 0.08 × 1.000.000 de facturación ene (CECO 201 propio ⇒ resolución A-01).
    expect(variables.columnTotals[0]).toBe(80000)
  })
})

/* ── 5. Ejecutiva: tercera rama (AC-FE-VS-6) ── */

describe('frontend.03_25: buildVariableExpensePivot — rama variable_outflows', () => {
  const label = (id) => `CECO-${id}`
  const incomeRows = [{ id: 201, months: Array.from({ length: 12 }, (_, m) => (m === 0 ? 1000000 : 0)) }]
  const outflowsBase = [1000000]

  it('aporte = tasa × Base(mes de causación), CECO propio (sin resolución por cubeta)', () => {
    const pivot = buildVariableExpensePivot(
      [makeLine({ behavior_type: 'variable_outflows', variable_rate: 0.004, budget_date: '2026-01-15' })],
      incomeRows,
      label,
      [],
      [],
      outflowsBase
    )
    expect(pivot).not.toBeNull()
    const row = pivot.rows.find((r) => r.id === 301)
    expect(row.months[0]).toBe(4000)
    expect(pivot.columnTotals[0]).toBe(4000)
  })

  it('SIN serie de salidas ⇒ aporte 0, jamás base de facturación', () => {
    const pivot = buildVariableExpensePivot(
      [makeLine({ behavior_type: 'variable_outflows', variable_rate: 0.004, budget_date: '2026-01-15' })],
      incomeRows,
      label,
      []
    )
    expect(pivot).not.toBeNull()
    expect(pivot.rows.find((r) => r.id === 301).months[0]).toBe(0)
  })

  it('la base de salidas habilita el pivote por sí sola (sin facturación ni cobros)', () => {
    const pivot = buildVariableExpensePivot(
      [makeLine({ behavior_type: 'variable_outflows', variable_rate: 0.004, budget_date: '2026-01-15' })],
      [],
      label,
      [],
      [],
      outflowsBase
    )
    expect(pivot).not.toBeNull()
    expect(pivot.columnTotals[0]).toBe(4000)
  })
})

describe('frontend.03_25: createExecutivePivotModel — la Ejecutiva deriva la base NETA con el motor de Flujo', () => {
  const scenario = {
    id_budget: 579,
    budget_year: 2026,
    budget_lines: [
      makeLine({ id_budget_line: 50, projected_amount: 1000000 }),
      makeLine({ id_budget_line: 51, behavior_type: 'variable_outflows', variable_rate: 0.004, budget_date: '2026-01-05' })
    ]
  }
  const model = createExecutivePivotModel({ scenario, store: makeStore() })

  it('variablePivot de la Ejecutiva = tasa × Base neta de salidas (SIEMPRE neto)', () => {
    const base = model.outflowsBaseMonths.value
    expect(base[0]).toBe(1000000)
    const row = model.variablePivot.value.rows.find((r) => r.id === 301)
    expect(row.months[0]).toBe(4000)
  })
})

/* ── 5. Drill-down CECO + exportación: tercera base (AC-FE-VS-6) ── */

describe('frontend.03_25: movementAmountReconciled — tercera base por tab (BR-VS-F2/F3/F6)', () => {
  const bases = {
    sales: Array.from({ length: 12 }, () => 999),
    receivables: Array.from({ length: 12 }, () => 888),
    outflows: {
      caused: Array.from({ length: 12 }, (_, m) => (m === 0 ? 1000000 : 0)),
      flow: Array.from({ length: 12 }, (_, m) => (m === 0 ? 1190000 : 0))
    }
  }
  const line = makeLine({ behavior_type: 'variable_outflows', variable_rate: 0.004, budget_date: '2026-01-15' })

  it('tab Causado usa la base NETA; tab Flujo la PRESENTADA', () => {
    expect(movementAmountReconciled(line, TAB_CAUSED, false, bases, 2026)).toBe(4000)
    expect(movementAmountReconciled(line, TAB_FLOW, false, bases, 2026)).toBe(4760)
  })

  it('tab Flujo con modo IVA ON ⇒ SIN gross-up (la base ya es presentada — BR-VS-F6)', () => {
    expect(movementAmountReconciled(line, TAB_FLOW, true, bases, 2026)).toBe(4760)
  })

  it('filtro de año BR-VS-02: causación fuera de N ⇒ 0; sin scenarioYear ⇒ sin filtro', () => {
    const oldLine = makeLine({ behavior_type: 'variable_outflows', variable_rate: 0.004, budget_date: '2025-01-15' })
    expect(movementAmountReconciled(oldLine, TAB_CAUSED, false, bases, 2026)).toBe(0)
    expect(movementAmountReconciled(oldLine, TAB_CAUSED, false, bases)).toBe(4000)
  })

  it('sin base para el comportamiento ⇒ 0 (degradación honesta); plano legacy se respeta', () => {
    expect(movementAmountReconciled(line, TAB_CAUSED, false, { sales: [], receivables: [] }, 2026)).toBe(0)
    // Legacy (llamadores viejos): serie plana como base de todos.
    const legacy = Array.from({ length: 12 }, (_, m) => (m === 0 ? 500000 : 0))
    expect(movementAmountReconciled(line, TAB_CAUSED, false, legacy)).toBe(2000)
  })
})

describe('frontend.03_25: buildCecoSheets exporta el aporte por salidas (AC-FE-VS-6)', () => {
  const bases = {
    sales: Array.from({ length: 12 }, () => 0),
    receivables: Array.from({ length: 12 }, () => 0),
    outflows: {
      caused: Array.from({ length: 12 }, (_, m) => (m === 0 ? 1000000 : 0)),
      flow: Array.from({ length: 12 }, (_, m) => (m === 0 ? 1190000 : 0))
    }
  }
  const movements = [
    { ...makeLine({ id_budget_line: 1, behavior_type: 'variable_outflows', variable_rate: 0.004, budget_date: '2026-01-15' }), source_kind: 'base' },
    { ...makeLine({ id_budget_line: 2, projected_amount: 250000 }), source_kind: 'base' }
  ]

  it('Causado/Flujo exportan la cifra del tab (neto / presentada, sin gross-up)', () => {
    const [causado] = buildCecoSheets({
      movements,
      tab: TAB_CAUSED,
      ivaActive: false,
      fixedIncomeByMonth: bases,
      scenarioYear: 2026,
      sheetName: 'Causado'
    })
    expect(causado.rows.find((row) => row.lineNo === 1).monto).toBe(4000)

    const [flujo] = buildCecoSheets({
      movements,
      tab: TAB_FLOW,
      ivaActive: true,
      fixedIncomeByMonth: bases,
      scenarioYear: 2026,
      sheetName: 'Flujo'
    })
    expect(flujo.rows.find((row) => row.lineNo === 1).monto).toBe(4760)
    // El fijo conserva su crudo byte-a-byte.
    expect(flujo.rows.find((row) => row.lineNo === 1).monto).not.toBe(flujo.rows[1].monto)
    expect(flujo.rows[1].monto).toBe(250000)
  })
})
