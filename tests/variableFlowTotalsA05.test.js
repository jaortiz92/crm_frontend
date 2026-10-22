/**
 * ENMIENDA A-05 (spec `frontend.03_21` §14, 2026-10-21) — Totales de la
 * Vista Flujo: `Total` = SOLO la Σ de los 12 meses; nueva col "Total
 * General" (meses + Antes + Después) SOLO cuando la tabla tiene ooy real.
 *
 * Reglas cubiertas (§14.6):
 *  - BR-FE21-16 (a): pivote con before≠0/after≠0 ⇒ `row.total` = solo meses,
 *    `row.generalTotal` = meses + Antes + Después; `pivot.grandTotal` = Σ de
 *    `columnTotals`; `pivot.grandGeneralTotal` = todo-inclusive.
 *  - BR-FE21-16 (c): los builders MÁS usados — `buildFlowPivot` y
 *    `buildVariableFlowPivot` — captan el mismo shape A-05.
 *  - BR-FE21-19 (b): pivote SIN ooy (before=after=0) ⇒ general === total
 *    (igualdad trivial) y las hojas exportables NO agregan la columna.
 *  - BR-FE21-17 (d): hojas del Flujo (`buildFlowSheets` → `matrixSheet` +
 *    `resumenSheet`) con el MISMO gate y orden
 *    `Ene…Dic | Antes de {N} | Después de {N} | Total | Total General`.
 *
 * Estilo de `cecoVariableA01~A04`: catálogo A-01, stores falsos, cero HTTP.
 */
import { describe, it, expect } from 'vitest'
import {
  buildFlowPivot,
  buildVariableFlowPivot
} from '@/components/budget/planning/cashFlowPivot.js'
import { buildFlowSheets } from '@/components/budget/planning/planningExportSheets.js'

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

describe('A-05 §14 (a/c): buildFlowPivot — Total = solo 12 meses', () => {
  const lines = [
    // cobro jun-2026: celda del año
    {
      id_cost_center: 151, line_type: 'income', behavior_type: 'fixed',
      budget_date: '2026-05-01', payment_date: '2026-06-10', projected_amount: 300000,
      has_iva: false
    },
    // cobro dic-2025: ANTES
    {
      id_cost_center: 151, line_type: 'income', behavior_type: 'fixed',
      budget_date: '2025-12-01', payment_date: null, projected_amount: 50000, has_iva: false
    },
    // cobro feb-2027: DESPUÉS
    {
      id_cost_center: 151, line_type: 'income', behavior_type: 'fixed',
      budget_date: '2027-02-01', payment_date: null, projected_amount: 70000, has_iva: false
    }
  ]
  const pivot = buildFlowPivot(lines, {
    match: (line) => line.line_type === 'income' && line.behavior_type === 'fixed',
    monthOf: (line) => monthIndexOfFlow(line),
    costCenterLabel: (id) => `CECO-${id}`,
    scenarioYear: 2026
  })

  it('row.total = solo meses (300.000); row.generalTotal = 420.000 (BR-FE21-16/17)', () => {
    const row = pivot.rows.find((r) => r.id === 151)
    expect(row.months[5]).toBeCloseTo(300000, 8)
    expect(row.months.filter((v) => v !== 0)).toHaveLength(1)
    expect(row.before).toBeCloseTo(50000, 8)
    expect(row.after).toBeCloseTo(70000, 8)
    // A-05: el Antes/Después ya NO suma dentro del total de fila.
    expect(row.total).toBeCloseTo(300000, 8)
    expect(row.generalTotal).toBeCloseTo(300000 + 50000 + 70000, 8)
  })

  it('grandTotal = Σ columnTotals (300.000); grandGeneralTotal = 420.000', () => {
    expect(pivot.columnTotals[5]).toBeCloseTo(300000, 8)
    expect(pivot.columnTotals.reduce((a, b) => a + b, 0)).toBeCloseTo(pivot.grandTotal, 8)
    expect(pivot.grandTotal).toBeCloseTo(300000, 8)
    expect(pivot.grandGeneralTotal).toBeCloseTo(420000, 8)
    expect(pivot.beforeTotal).toBeCloseTo(50000, 8)
    expect(pivot.afterTotal).toBeCloseTo(70000, 8)
    expect(pivot.beforeAfterRowCount).toBe(1)
  })
})

describe('A-05 §14 (c): buildVariableFlowPivot — mismo shape (A-03/A-05)', () => {
  it('comisiones fuera de año ⇒ total 0, general = antes + después', () => {
    // Escenario A-03 §12 (facturación íntegra fuera del año N) con las bases
    // en buckets — misma mecánica que cecoVariableA03OutOfYear.
    const lines = [
      {
        id_budget_line: 9, id_cost_center: 210, line_type: 'expense',
        behavior_type: 'variable_sales', budget_date: '2025-12-15', payment_date: null,
        projected_amount: 7000, has_iva: false, variable_rate: 0.2
      },
      {
        id_budget_line: 10, id_cost_center: 210, line_type: 'expense',
        behavior_type: 'variable_sales', budget_date: '2027-01-15', payment_date: null,
        projected_amount: 7000, has_iva: false, variable_rate: 0.1
      }
    ]
    const baseByCecoSales = new Map([
      [210, { before: 1000000, months: zeros12.slice(), after: 500000 }]
    ])
    const pivot = buildVariableFlowPivot(
      lines,
      baseByCecoSales,
      new Map(),
      (id) => `CECO-${id}`,
      false,
      2026
    )
    expect(pivot).not.toBeNull()
    const row = pivot.rows.find((r) => r.id === 210)
    expect(row.months).toEqual(zeros12) // todo fuera de año ⇒ sin meses
    expect(row.before).toBeCloseTo(200000, 8)
    expect(row.after).toBeCloseTo(50000, 8)
    // A-05 (BR-FE21-16/17): total = solo meses (0); general = 250.000.
    expect(row.total).toBeCloseTo(0, 8)
    expect(row.generalTotal).toBeCloseTo(250000, 8)
    expect(pivot.grandTotal).toBeCloseTo(0, 8)
    expect(pivot.grandGeneralTotal).toBeCloseTo(250000, 8)
  })
})

describe('A-05 §14 (b): sin ooy ⇒ general === total y SIN columna nueva (BR-FE21-19)', () => {
  const lines = [
    {
      id_cost_center: 151, line_type: 'income', behavior_type: 'fixed',
      budget_date: '2026-03-01', payment_date: '2026-03-25', projected_amount: 400000,
      has_iva: false
    }
  ]
  const pivot = buildFlowPivot(lines, {
    match: () => true,
    monthOf: (line) => monthIndexOfFlow(line),
    costCenterLabel: (id) => `CECO-${id}`,
    scenarioYear: 2026
  })
  it('igualdad trivial: row.generalTotal === row.total; grandGeneralTotal === grandTotal', () => {
    const row = pivot.rows[0]
    expect(row.before).toBe(0)
    expect(row.after).toBe(0)
    expect(row.total).toBeCloseTo(row.generalTotal, 8)
    expect(row.total).toBeCloseTo(400000, 8)
    expect(pivot.grandTotal).toBeCloseTo(pivot.grandGeneralTotal, 8)
    expect(pivot.beforeAfterRowCount).toBe(0)
  })

  it('export: hoja "Entradas" sin col "Total General" ni Antes/Después', () => {
    const scenario = {
      id_budget: 573,
      budget_year: 2026,
      budget_lines: lines.map((line, index) => ({ id_budget_line: index + 1, ...line }))
    }
    const sheets = buildFlowSheets({
      scenario,
      financingPrincipalLines: [],
      financingDisbursementLines: [],
      store: makeStore()
    })
    const entradas = sheets.find((sheet) => sheet.name === 'Entradas')
    expect(entradas).toBeDefined()
    const labels = entradas.columns.map((column) => column.label)
    expect(labels[labels.length - 1]).toBe('Total')
    expect(labels.some((label) => label === 'Total General')).toBe(false)
    expect(labels.some((label) => label.startsWith('Antes de'))).toBe(false)
    // Total de fila exportada = solo los 12 meses (aun cuando General no sale).
    const row = entradas.rows[0]
    expect(row.total).toBeCloseTo(400000, 8)
  })
})

describe('A-05 §14 (d): hojas del Flujo con ooy real (gate + orden BR-FE21-17)', () => {
  const scenario = {
    id_budget: 573,
    budget_year: 2026,
    budget_lines: [
      // cobro jun-2026 (celda del año)
      {
        id_budget_line: 1, id_cost_center: 151, line_type: 'income', behavior_type: 'fixed',
        budget_date: '2026-05-01', payment_date: '2026-06-10', projected_amount: 300000,
        has_iva: false
      },
      // cobro dic-2025 (ANTES)
      {
        id_budget_line: 2, id_cost_center: 151, line_type: 'income', behavior_type: 'fixed',
        budget_date: '2025-12-01', payment_date: null, projected_amount: 50000, has_iva: false
      },
      // cobro feb-2027 (DESPUÉS)
      {
        id_budget_line: 3, id_cost_center: 151, line_type: 'income', behavior_type: 'fixed',
        budget_date: '2027-02-01', payment_date: null, projected_amount: 70000, has_iva: false
      }
    ]
  }
  const sheets = buildFlowSheets({
    scenario,
    financingPrincipalLines: [],
    financingDisbursementLines: [],
    store: makeStore()
  })

  it('hoja "Entradas": columns ...Antes/Después, Total, Total General (en ese orden)', () => {
    const entradas = sheets.find((sheet) => sheet.name === 'Entradas')
    const labels = entradas.columns.map((column) => column.label)
    expect(labels[13]).toBe('Antes de 2026')
    expect(labels[14]).toBe('Después de 2026')
    expect(labels[15]).toBe('Total')
    expect(labels[16]).toBe('Total General')
    const row = entradas.rows[0]
    // Total = solo meses (300.000); General = 420.000.
    expect(row.total).toBeCloseTo(300000, 8)
    expect(row.totalGeneral).toBeCloseTo(420000, 8)
    expect(row.antes).toBeCloseTo(50000, 8)
    expect(row.despues).toBeCloseTo(70000, 8)
    const footer = entradas.rows.find((r) => r.ceco === 'Σ Total')
    expect(footer.total).toBeCloseTo(300000, 8)
    expect(footer.totalGeneral).toBeCloseTo(420000, 8)
  })

  it('hoja "Resumen de liquidez": General = entradasTotal + antes − ... (BR-FE21-17)', () => {
    const resumen = sheets.find((sheet) => sheet.name === 'Resumen de liquidez')
    const labels = resumen.columns.map((column) => column.label)
    expect(labels[labels.length - 1]).toBe('Total General')
    expect(labels[13]).toBe('Antes de 2026')
    const entradasRow = resumen.rows.find((row) => row.concepto === 'Σ Entradas')
    // Total (12 meses) = 300.000; General = 300.000 + 50.000 + 70.000.
    expect(entradasRow.total).toBeCloseTo(300000, 8)
    expect(entradasRow.totalGeneral).toBeCloseTo(420000, 8)
    expect(entradasRow.antes).toBeCloseTo(50000, 8)
    expect(entradasRow.despues).toBeCloseTo(70000, 8)
    // Neto: solo el mes jun entra a los 12 meses; General hereda los buckets.
    const netoRow = resumen.rows.find((row) => row.concepto === 'Flujo neto')
    expect(netoRow.total).toBeCloseTo(300000, 8)
    expect(netoRow.totalGeneral).toBeCloseTo(420000, 8)
  })
})

/** `monthIndexOf` local (evita repetir el import del name largo). */
function monthIndexOfFlow(line) {
  const date = line.payment_date || line.budget_date
  const plain = String(date || '').match(/^\d{4}-(\d{2})/)
  return plain ? Number(plain[1]) - 1 : -1
}
