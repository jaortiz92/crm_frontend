/**
 * ENMIENDA A-03 (spec `frontend.03_21` §12, 2026-10-21) — buckets fuera de
 * año (Antes/Después) del bloque variable en el Flujo.
 *
 * Problema: `buildVariableFlowPivot` hardcodeaba before/after ≡ 0 y
 * descartaba líneas con `budget_date` fuera del año N; el resumen ooy
 * (`buildOoyBucketSeries`) no agregaba las variables.
 *
 * Reglas cubiertas:
 *  - (a) AC-FE21-12: `budget_date` dic-(N−1) ⇒ bucket ANTES con la base
 *        `before` del generador; NO cae en Ene-N.
 *  - (b) AC-FE21-12: `budget_date` ene-(N+1) ⇒ bucket DESPUÉS con base
 *        `after`.
 *  - (c) AC-FE21-14: SOLO variables fuera de año ⇒ `any` del resumen ooy
 *        > 0 (las columnas Antes/Después se activan).
 *  - (d) Sumatorios del pivote: beforeTotal/afterTotal/beforeAfterRowCount/
 *        grandTotal/columnTotals.
 *  - (e) AC-FE21-15 contra-regla: la serie 12-meses (months/columnTotals,
 *        base del P&G de la Ejecutiva y del resumen de liquidez) NO
 *        contiene buckets: meses en 0 y total anual SIN el fuera de año.
 *
 * Estilo de `cecoVariableA01/A02`: catálogo A-01, stores falsos, cero HTTP.
 * NO valida contra el backend (por diseño el BE nunca produjo fuera de año).
 */
import { describe, it, expect } from 'vitest'
import { createExecutivePivotModel } from '@/components/budget/planning/executivePivot.js'
import {
  createCashFlowPivotModel,
  buildOoyBucketSeries,
  buildVariableFlowPivot
} from '@/components/budget/planning/cashFlowPivot.js'
import {
  monthBucketIndexOf,
  fixedIncomeBucketByCeco,
  entradasBucketByCeco,
  entradasBucketByVariableCeco,
  fixedIncomeBucketByVariableCeco
} from '@/components/budget/planning/planningFormat.js'

/** Catálogo A-01 espejo: 151 factura/cobra (7,1); 210 de la MISMA (7,1). */
const catalog = [
  { id_cost_center: 151, cost_center_code: '000151', id_zone: 7, id_line: 1 },
  { id_cost_center: 210, cost_center_code: '210001', id_zone: 7, id_line: 1 }
]

function makeStore({ ivaMode = false } = {}) {
  return {
    ivaMode,
    costCenters: catalog,
    costCenterLabel: (id) => `CECO-${id}`,
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

const zeros12 = Array.from({ length: 12 }, () => 0)

describe('A-03 §12: monthBucketIndexOf (réplica de outOfYearBucketOf + mes)', () => {
  it('antes / dentro / después / ilegible', () => {
    expect(monthBucketIndexOf('2025-12-10', 2026)).toBe(-1)
    expect(monthBucketIndexOf('2026-01-31', 2026)).toBe(0)
    expect(monthBucketIndexOf('2026-07-05', 2026)).toBe(6)
    expect(monthBucketIndexOf('2027-01-15', 2026)).toBe(12)
    expect(monthBucketIndexOf('no-es-fecha', 2026)).toBe(-99)
    expect(monthBucketIndexOf(null, 2026)).toBe(-99)
    expect(monthBucketIndexOf('2026-13-01', 2026)).toBe(-99)
  })

  it('scenarioYear no entero ⇒ degradación como el resto de los pivotes (bucket in-year)', () => {
    expect(monthBucketIndexOf('2027-03-15', null)).toBe(2)
  })
})

describe('A-03 §12: fixedIncomeBucketByCeco / entradasBucketByCeco (buckets extendidos)', () => {
  const lines = [
    // facturación de dic-2025 (causación ANTES) sin payment ⇒ cobro también antes
    {
      id_cost_center: 151, line_type: 'income', behavior_type: 'fixed',
      budget_date: '2025-12-10', payment_date: null, projected_amount: 1000000, has_iva: true
    },
    // facturación de ene-2027 (DESPUÉS)
    {
      id_cost_center: 151, line_type: 'income', behavior_type: 'fixed',
      budget_date: '2027-01-20', payment_date: null, projected_amount: 500000, has_iva: true
    },
    // facturación dic-2026 con cobro vencido en ene-2027: causación ∈ N,
    // COBRO en `after` (entradasBucket SIN filtro de año)
    {
      id_cost_center: 151, line_type: 'income', behavior_type: 'fixed',
      budget_date: '2026-12-05', payment_date: '2027-01-05', projected_amount: 250000, has_iva: true
    },
    // cobro válido en 2026 (el A-02 de 12 meses SÍ lo admite)
    {
      id_cost_center: 151, line_type: 'income', behavior_type: 'fixed',
      budget_date: '2026-04-02', payment_date: '2026-12-20', projected_amount: 999000, has_iva: true
    }
  ]

  it('facturación: bucket por MES DE CAUSACIÓN (budget_date)', () => {
    const buckets = fixedIncomeBucketByCeco(lines, 2026).get(151)
    expect(buckets.before).toBe(1000000) // dic-2025 ⇒ ANTES
    expect(buckets.months[11]).toBe(250000) // dic-2026 ⇒ celda del año
    expect(buckets.months[0]).toBe(0) // ene-2027 NO cae en Ene-2026
    expect(buckets.after).toBe(500000) // ene-2027 ⇒ DESPUÉS
  })

  it('cobro: bucket por MES DE COBRO (cfMonth) SIN filtro de año — el bucket filtra', () => {
    const buckets = entradasBucketByCeco(lines, 2026).get(151)
    expect(buckets.before).toBe(1000000) // cobro ≡ null ⇒ fallback dic-2025
    expect(buckets.after).toBe(750000) // ene-2027 (cobro desplazado) + facturación ene-2027
    expect(buckets.months[11]).toBe(999000) // cobro dic-2026 ∈ N (fila nueva)
  })

  it('A-02 intocado: entradasCausacionByCeco (12 meses) MANTIENE su filtro de año', async () => {
    const { entradasCausacionByCeco } = await import(
      '@/components/budget/planning/planningFormat.js'
    )
    const byCeco = entradasCausacionByCeco(lines, 2026)
    expect(byCeco.get(151)[11]).toBe(999000) // cobro dic-2026 ∈ N (fila nueva)
    expect(byCeco.get(151)[0]).toBe(0) // el cobro ene-2027 se descarta (filtro año)
  })
})

/** Escenario A-03: facturación/gasto variable íntegramente FUERA del año N. */
function makeScenario() {
  return {
    id_budget: 573,
    budget_year: 2026,
    budget_lines: [
      {
        id_budget_line: 1, id_cost_center: 151, line_type: 'income', behavior_type: 'fixed',
        budget_date: '2025-12-10', payment_date: null, projected_amount: 1000000, has_iva: true,
        variable_rate: null
      },
      {
        id_budget_line: 7, id_cost_center: 151, line_type: 'income', behavior_type: 'fixed',
        budget_date: '2027-01-20', payment_date: null, projected_amount: 500000, has_iva: true,
        variable_rate: null
      },
      {
        id_budget_line: 5, id_cost_center: 210, line_type: 'expense',
        behavior_type: 'variable_sales', budget_date: '2025-12-15', payment_date: null,
        projected_amount: 7000, has_iva: true, variable_rate: 0.2
      },
      {
        id_budget_line: 6, id_cost_center: 210, line_type: 'expense',
        behavior_type: 'variable_sales', budget_date: '2027-01-15', payment_date: null,
        projected_amount: 7000, has_iva: true, variable_rate: 0.1
      }
    ]
  }
}

describe('(a)(b)(d) AC-FE21-12: pivote de flujo con buckets reales', () => {
  it('bases con buckets resolviendo A-01 sobre el generador (151 ⇒ 210)', () => {
    const lines = makeScenario().budget_lines
    const sales = fixedIncomeBucketByVariableCeco(lines, catalog, 2026).get(210)
    expect(sales.before).toBe(1000000)
    expect(sales.after).toBe(500000)
    expect(sales.months).toEqual(zeros12)
    // recaudo por cfMonth: aquí payment null ⇒ mismo bucket de causación.
    const recaudo = entradasBucketByVariableCeco(lines, catalog, 2026).get(210)
    expect(recaudo.before).toBe(1000000)
    expect(recaudo.after).toBe(500000)
  })

  it('pivote: comisión de dic-2025 ⇒ row.before; ene-2027 ⇒ row.after; months en 0', () => {
    const lines = makeScenario().budget_lines
    const sales = fixedIncomeBucketByVariableCeco(lines, catalog, 2026)
    const recaudo = entradasBucketByVariableCeco(lines, catalog, 2026)
    const pivot = buildVariableFlowPivot(
      lines.filter((l) => l.line_type === 'expense' && l.behavior_type !== 'fixed'),
      sales,
      recaudo,
      (id) => `CECO-${id}`,
      false,
      2026
    )
    expect(pivot).not.toBeNull()
    const row = pivot.rows.find((r) => r.id === 210)
    expect(row.before).toBeCloseTo(200000, 8) // 0.2 × 1.000.000 (base ANTES)
    expect(row.after).toBeCloseTo(50000, 8) // 0.1 × 500.000 (base DESPUÉS)
    expect(row.months).toEqual(zeros12) // (a) NO cae en Ene-2026
    // ENMIENDA A-05 (BR-FE21-16): `total` = SOLO los 12 meses; el
    // todo-inclusive (meses + Antes + Después) vive en `generalTotal`.
    expect(row.total).toBeCloseTo(0, 8)
    expect(row.generalTotal).toBeCloseTo(250000, 8)
    expect(pivot.beforeTotal).toBeCloseTo(200000, 8)
    expect(pivot.afterTotal).toBeCloseTo(50000, 8)
    expect(pivot.beforeAfterRowCount).toBe(1) // misma fila tiene antes Y después
    expect(pivot.columnTotals).toEqual(zeros12) // (e): columnas del año sin huecos
    expect(pivot.grandTotal).toBeCloseTo(0, 8) // A-05: solo 12 meses
    expect(pivot.grandGeneralTotal).toBeCloseTo(250000, 8) // A-05: todo-inclusive
    expect(pivot.undatedTotal).toBe(0) // derivado: sin periodo legible ⇒ aporte 0
  })

  it('factory de la Vista Flujo conecta los bucket-maps + scenarioYear', () => {
    const model = createCashFlowPivotModel({
      scenario: makeScenario(),
      financingPrincipalLines: [],
      financingDisbursementLines: [],
      store: makeStore()
    })
    const pivot = model.variablesPivot.value
    expect(pivot).not.toBeNull()
    const row = pivot.rows.find((r) => r.id === 210)
    expect(row.before).toBeCloseTo(200000, 8)
    expect(row.after).toBeCloseTo(50000, 8)
    expect(row.months).toEqual(zeros12)
    // resumen de liquidez: la Σ de SALIDAS usa SOLO la serie mensual
    // (columnTotals en 0) ⇒ salidas 12-meses intactas (contra-regla e).
    expect(model.resumen.value.salidas).toEqual(zeros12)
  })
})

describe('(c) AC-FE21-14: SOLO variables fuera de año ⇒ columnas ooy activas', () => {
  it('buildOoyBucketSeries agrega variables (any>0, salidas antes/después)', () => {
    const model = createCashFlowPivotModel({
      scenario: makeScenario(),
      financingPrincipalLines: [],
      financingDisbursementLines: [],
      store: makeStore()
    })
    const ooy = buildOoyBucketSeries({
      disbursement: model.financingDisbursementPivot.value,
      entradas: model.entradasPivot.value,
      fijos: model.fijosPivot.value,
      costes: model.costPaymentsPivot.value,
      internment: model.internmentPaymentsPivot.value,
      principal: model.financingPrincipalPivot.value,
      liquidation: model.settlementPaymentsPivot.value,
      taxFlow: model.taxPaymentsPivot.value,
      variables: model.variablesPivot.value
    })
    expect(ooy.any).toBe(true) // antes imposible con solo-variables
    expect(ooy.salidas[0]).toBeCloseTo(200000, 8)
    expect(ooy.salidas[1]).toBeCloseTo(50000, 8)
    // entradas: los ingresos fijos del escenario (budget_date/pago en
    // 2025 y 2027, cobros no desplazados) van a Antes (1.000.000) y
    // Después (500.000) — el neto hereda esa asimetría preexistente.
    expect(ooy.entradas[0]).toBeCloseTo(1000000, 8)
    expect(ooy.entradas[1]).toBeCloseTo(500000, 8)
    expect(ooy.neto[0]).toBeCloseTo(800000, 8)
    expect(ooy.neto[1]).toBeCloseTo(450000, 8)
  })
})

describe('(e) AC-FE21-15: contra-regla — P&G de la Ejecutiva SIN cambio (A-03 byte-a-byte)', () => {
  /**
   * La Ejecutiva difunde por `monthIndexOf` (sin filtros de año — FE-S4C):
   * la línea de dic-2025 cae en months[11] con la facturación de mes 11
   * (2025-12 ⇒ 1.000.000) y la de ene-2027 en months[0] con 500.000 —
   * el resultado LEGADO exacto (A-03 no toca `executivePivot.js`). Si
   * alguien mezclara los buckets en el P&L, este total cambiaría.
   */
  it('Ejecutiva: serie 12-meses con el resultado legado; buckets de A-03 fuera', () => {
    const exec = createExecutivePivotModel({ scenario: makeScenario(), store: makeStore() })
    const row = exec.variablePivot.value.rows.find((r) => r.id === 210)
    expect(row).toBeDefined()
    expect(row.months[0]).toBeCloseTo(50000, 8)
    expect(row.months[11]).toBeCloseTo(200000, 8)
    expect(row.months.slice(1, 11)).toEqual(zeros12.slice(1, 11))
    expect(row.total).toBeCloseTo(250000, 8)
  })
})
