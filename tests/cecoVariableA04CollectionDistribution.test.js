/**
 * ENMIENDA A-04 (spec `frontend.03_21` §13, 2026-10-21) — la comisión por
 * recaudo del Flujo se posiciona en el BUCKET donde entra el COBRO que la
 * genera (Antes / Mes del año / Después), con la TASA de la línea concepto
 * del MES DE FACTURACIÓN del cobro (criterio de CAJA). Ejecutiva y
 * drill-down siguen devengo (divergencia por diseño — contra-regla).
 *
 * Reglas cubiertas:
 *  - (a) AC-§13: bill facturado dic-2026 cobrado ene-2027 ⇒ comisión en
 *        AFTER con la tasa de la línea dic; NO en dic-2026 (ni en ene).
 *  - (a2) espejo 573: 32.792.290 × 8% = 2.623.383,20 en Después.
 *  - (c) cobro del bucket ANTES (bill facturado dic, cobrado dic-2025)
 *        ⇒ before; espejo 573: 1.689.160 × 8% = 135.132,80 en Antes.
 *  - (b) caso regular: bill facturado y cobrado en su mes ⇒ meses como A-02.
 *  - (d) mes de facturación SIN línea concepto ⇒ 0 (sin fallback).
 *  - Cobro ilegible ⇒ contribución en `unplaced` (invisible en la hoja).
 *  - (e) totales del pivote: row/beforeTotal/afterTotal/beforeAfterRowCount
 *        /grandTotal/columnTotals/undatedTotal con el ejemplo verificado.
 *  - (f) variable_sales SIN cambio (contra-regla: sigue A-02③/A-03).
 *  - (g) Ejecutiva byte-invariante (devengo A-02 intacto).
 *
 * Estilo de `cecoVariableA01/A02/A03`: catálogo A-01, stores falsos, cero
 * HTTP. Datos sintéticos ESPEJO del escenario real 573 (Cobros Antes/
 * Después por (ceco, mes) como fuente de verdad, §13).
 */
import { describe, it, expect } from 'vitest'
import { createExecutivePivotModel } from '@/components/budget/planning/executivePivot.js'
import {
  buildVariableFlowPivot,
  createCashFlowPivotModel
} from '@/components/budget/planning/cashFlowPivot.js'
import {
  variableCollectionDistribution,
  VARIABLE_COLLECTION_DISTRIBUTION_NOTE
} from '@/components/budget/planning/planningFormat.js'

/** Catálogo A-01 espejo 573: 151 factura/cobra (7,1); 210 comisión (7,1). */
const catalog = [
  { id_cost_center: 151, cost_center_code: '000101', id_zone: 7, id_line: 1 },
  { id_cost_center: 181, cost_center_code: '000181', id_zone: 7, id_line: 1 },
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

/**
 * Escenario espejo del 573 (budget_year 2026):
 *  - mar: bill de 1.000.000 facturado y cobrado en mar (caso regular).
 *  - abr: bill de 500.000 facturado abr SIN línea concepto abr (d).
 *  - dic: bill de 32.792.290 cobrado ene-2027 (DESPUÉS — a2) y bill de
 *    1.689.160 cobrado dic-2025 (ANTES — c); además un bill con cobro
 *    ilegible (unplaced).
 *  - Concepto `variable_sales` mar 5% (f) y conceptos `variable_receivables`
 *    mar 8% (b) y dic-28 8% (a/c).
 */
function makeScenario() {
  return {
    id_budget: 573,
    budget_year: 2026,
    budget_lines: [
      {
        id_budget_line: 1, id_cost_center: 151, line_type: 'income', behavior_type: 'fixed',
        budget_date: '2026-03-05', payment_date: '2026-03-25', projected_amount: 1000000,
        has_iva: true, variable_rate: null
      },
      {
        id_budget_line: 2, id_cost_center: 151, line_type: 'income', behavior_type: 'fixed',
        budget_date: '2026-12-10', payment_date: '2027-01-15', projected_amount: 32792290,
        has_iva: true, variable_rate: null
      },
      {
        id_budget_line: 3, id_cost_center: 151, line_type: 'income', behavior_type: 'fixed',
        budget_date: '2026-12-12', payment_date: '2025-12-28', projected_amount: 1689160,
        has_iva: true, variable_rate: null
      },
      {
        id_budget_line: 4, id_cost_center: 151, line_type: 'income', behavior_type: 'fixed',
        budget_date: '2026-04-10', payment_date: '2026-04-20', projected_amount: 500000,
        has_iva: true, variable_rate: null
      },
      {
        id_budget_line: 5, id_cost_center: 151, line_type: 'income', behavior_type: 'fixed',
        budget_date: '2026-12-01', payment_date: 'no-es-fecha', projected_amount: 250000,
        has_iva: true, variable_rate: null
      },
      {
        id_budget_line: 6, id_cost_center: 210, line_type: 'expense',
        behavior_type: 'variable_receivables', budget_date: '2026-03-20',
        payment_date: '2026-04-05', projected_amount: 7000, has_iva: true, variable_rate: 0.08
      },
      {
        id_budget_line: 7, id_cost_center: 210, line_type: 'expense',
        behavior_type: 'variable_receivables', budget_date: '2026-12-28',
        payment_date: null, projected_amount: 7000, has_iva: true, variable_rate: 0.08
      },
      {
        id_budget_line: 8, id_cost_center: 210, line_type: 'expense',
        behavior_type: 'variable_sales', budget_date: '2026-03-15',
        payment_date: '2026-04-10', projected_amount: 7000, has_iva: true, variable_rate: 0.05
      }
    ]
  }
}

describe('A-04 §13: variableCollectionDistribution (builder puro)', () => {
  const lines = makeScenario().budget_lines
  const incomeLines = lines.filter((l) => l.line_type === 'income')
  const receivables = lines.filter((l) => l.behavior_type === 'variable_receivables')

  it('(b) cobro en su mes ⇒ months[2] = 8% × 1.000.000 (igual que A-02)', () => {
    const map = variableCollectionDistribution(receivables, incomeLines, catalog, 2026)
    const mar = map.get(6)
    expect(mar.months[2]).toBeCloseTo(80000, 8)
    expect(mar.before).toBe(0)
    expect(mar.after).toBe(0)
    expect(mar.unplaced).toBe(0)
    expect(mar.months.filter((v) => v !== 0)).toHaveLength(1)
  })

  it('(a)+(c) bill dic cobrado ene-2027 ⇒ AFTER; bill dic cobrado dic-2025 ⇒ ANTES; espejo 573', () => {
    const map = variableCollectionDistribution(receivables, incomeLines, catalog, 2026)
    const dec = map.get(7)
    // 32.792.290 × 8 % = 2.623.383,20 ⇒ Después (cobro ene-2027).
    expect(dec.after).toBeCloseTo(2623383.2, 8)
    // 1.689.160 × 8 % = 135.132,80 ⇒ Antes (cobro dic-2025).
    expect(dec.before).toBeCloseTo(135132.8, 8)
    // ningún aporte a los 12 meses del año con estos bills
    expect(dec.months).toEqual(zeros12)
    // cobro ilegible (250.000) ⇒ omitido de la hoja, contado en unplaced
    expect(dec.unplaced).toBeCloseTo(20000, 8)
  })

  it('(d) mes de facturación sin línea concepto ⇒ sin entrada (rate ausente ⇒ 0, sin fallback)', () => {
    const map = variableCollectionDistribution(receivables, incomeLines, catalog, 2026)
    expect(map.size).toBe(2) // solo las líneas 6 (mar) y 7 (dic)
    expect(map.has(8)).toBe(false) // variable_sales NO está en el map
    // el bill de abr (500.000 cobrado abr) NO genera comisión: ninguna línea
    // concepto fija rate para abr ⇒ nada en ningún bucket
    const totals = [...map.values()].reduce(
      (acc, b) => acc + b.before + b.after + b.months.reduce((a, v) => a + v, 0) + b.unplaced,
      0
    )
    expect(totals).toBeCloseTo(80000 + 2623383.2 + 135132.8 + 20000, 8)
  })

  it('degradación: entradas no-array/lists vacías ⇒ Map vacío; rate ausente ⇒ sin entrada', () => {
    expect(variableCollectionDistribution(null, null, null, 2026).size).toBe(0)
    expect(variableCollectionDistribution([{ id_budget_line: 9, line_type: 'expense', behavior_type: 'variable_receivables', budget_date: '2026-01-05', variable_rate: null }], [], catalog, 2026).size).toBe(0)
  })

  it('resolución A-01 ambigua (dos CECOs facturan la zona+línea) ⇒ sin entrada (fail-closed)', () => {
    const ambiguous = [
      {
        id_budget_line: 1, id_cost_center: 151, line_type: 'income', behavior_type: 'fixed',
        budget_date: '2026-01-10', payment_date: '2026-01-20', projected_amount: 1000,
        has_iva: true, variable_rate: null
      },
      {
        id_budget_line: 2, id_cost_center: 181, line_type: 'income', behavior_type: 'fixed',
        budget_date: '2026-01-10', payment_date: '2026-01-20', projected_amount: 1000,
        has_iva: true, variable_rate: null
      },
      {
        id_budget_line: 9, id_cost_center: 210, line_type: 'expense',
        behavior_type: 'variable_receivables', budget_date: '2026-01-15',
        payment_date: null, projected_amount: 100, has_iva: true, variable_rate: 0.1
      }
    ]
    const map = variableCollectionDistribution(
      ambiguous.filter((l) => l.behavior_type === 'variable_receivables'),
      ambiguous,
      catalog,
      2026
    )
    expect(map.size).toBe(0)
  })

  it('nota exportada para la UI (VARIABLE_COLLECTION_DISTRIBUTION_NOTE)', () => {
    expect(typeof VARIABLE_COLLECTION_DISTRIBUTION_NOTE).toBe('string')
    expect(VARIABLE_COLLECTION_DISTRIBUTION_NOTE).toContain('A-04')
  })
})

describe('A-04 §13 (e): pivote del Flujo — bloque variable con la distribución de cobro', () => {
  it('row/months/antes-después/totales con el ejemplo numérico verificado a mano', () => {
    const model = createCashFlowPivotModel({
      scenario: makeScenario(),
      financingPrincipalLines: [],
      financingDisbursementLines: [],
      store: makeStore()
    })
    const pivot = model.variablesPivot.value
    expect(pivot).not.toBeNull()
    const row = pivot.rows.find((r) => r.id === 210)
    expect(row).toBeDefined()
    // recaudo: mar (80.000) + variable_sales mar (50.000 = 5% × 1.000.000)
    expect(row.months[2]).toBeCloseTo(130000, 8)
    expect(row.months[11]).toBe(0) // (a) la cobranza dic NO cae en dic-2026
    // antes: 1.689.160 × 8% = 135.132,80 · después: 32.792.290 × 8% = 2.623.383,20
    expect(row.before).toBeCloseTo(135132.8, 8)
    expect(row.after).toBeCloseTo(2623383.2, 8)
    // ENMIENDA A-05 (BR-FE21-16): `total` = SOLO los 12 meses (130.000); el
    // todo-inclusive (meses + Antes + Después) vive en `generalTotal`.
    expect(row.total).toBeCloseTo(130000, 8)
    expect(row.generalTotal).toBeCloseTo(130000 + 135132.8 + 2623383.2, 8)
    // unplaced (20.000) NUNCA entra a ninguna celda ni total
    const sumCells =
      row.months.reduce((a, v) => a + v, 0) + row.before + row.after
    expect(sumCells).toBeCloseTo(row.generalTotal, 8)
    expect(pivot.beforeTotal).toBeCloseTo(135132.8, 8)
    expect(pivot.afterTotal).toBeCloseTo(2623383.2, 8)
    expect(pivot.beforeAfterRowCount).toBe(1)
    expect(pivot.columnTotals[2]).toBeCloseTo(130000, 8)
    expect(pivot.columnTotals[11]).toBe(0)
    expect(pivot.undatedTotal).toBe(0)
    expect(pivot.grandTotal).toBeCloseTo(row.total, 8) // A-05: solo 12 meses
    expect(pivot.grandGeneralTotal).toBeCloseTo(row.generalTotal, 8)
  })

  it('modo IVA ON: gross-up ×1.19 del DERIVADO por línea (base neta D-FE14-7)', () => {
    const model = createCashFlowPivotModel({
      scenario: makeScenario(),
      financingPrincipalLines: [],
      financingDisbursementLines: [],
      store: makeStore({ ivaMode: true })
    })
    const pivot = model.variablesPivot.value
    const row = pivot.rows.find((r) => r.id === 210)
    // todas las líneas del 210 llevan has_iva: true ⇒ todo ×1.19
    expect(row.months[2]).toBeCloseTo(130000 * 1.19, 8)
    expect(row.before).toBeCloseTo(135132.8 * 1.19, 8)
    expect(row.after).toBeCloseTo(2623383.2 * 1.19, 8)
  })

  it('path legacy (7º parámetro omitido): receivables conserva el comportamiento line-based A-03', () => {
    const source = [
      {
        id_budget_line: 7, id_cost_center: 210, line_type: 'expense',
        behavior_type: 'variable_receivables', budget_date: '2026-12-28',
        payment_date: null, projected_amount: 7000, has_iva: true, variable_rate: 0.08
      }
    ]
    // Base de recaudo bucket del generador resuelta EXTERNA (A-03: la serie
    // ya llega keyed por el CECO de la línea).
    const entradasBucket = new Map([
      [210, { before: 1689160, months: zeros12.map((_, i) => (i === 11 ? 2000000 : 0)), after: 32792290 }]
    ])
    const pivot = buildVariableFlowPivot(source, new Map(), entradasBucket, (id) => `CECO-${id}`, false, 2026)
    const row = pivot.rows.find((r) => r.id === 210)
    // path legacy A-03: posiciona por budget_date (dic ⇒ months[11]) con la
    // base DEL BUCKET (months[11] = 2.000.000) ⇒ 0.08 × 2.000.000 = 160.000.
    expect(row.months[11]).toBe(160000)
    expect(pivot.grandTotal).toBeCloseTo(160000, 8)
  })
})

describe('A-04 §13 (f): variable_sales SIN cambio (contra-regla)', () => {
  it('la comisión facturada sigue rate × I del MES DE CAUSACIÓN de la línea', () => {
    const model = createCashFlowPivotModel({
      scenario: makeScenario(),
      financingPrincipalLines: [],
      financingDisbursementLines: [],
      store: makeStore()
    })
    const pivot = model.variablesPivot.value
    const row = pivot.rows.find((r) => r.id === 210)
    // sales de mar: 0.05 × facturación mar del generador (1.000.000).
    // A-05 (BR-FE21-16): `row.total` = solo los 12 meses = 130.000 (los
    // buckets Antes/Después ya no suman dentro).
    expect(row.total).toBeCloseTo(130000, 8)
    // y la contabilidad del sales NO depende de los cobros: abr (500.000
    // facturado/cobrado) sin línea concepto ⇒ 0 en months[3]
    expect(row.months[3]).toBe(0)
  })
})

describe('A-04 §13 (g): contra-regla — Ejecutiva byte-invariante (devengo A-02)', () => {
  it('Ejecutiva: años filtrados ⇒ comisión dic = 0 en months[11]; mar = 130.000 (devengo)', () => {
    const model = createExecutivePivotModel({ scenario: makeScenario(), store: makeStore() })
    const row = model.variablePivot.value.rows.find((r) => r.id === 210)
    expect(row).toBeDefined()
    // devengo: comisión del mes m = tasa × RECAUDO del mes m (cobros ∈ N):
    // mar = 0.08 × 1.000.000 (cobro mar) + sales 0.05 × 1.000.000 = 130.000
    expect(row.months[2]).toBeCloseTo(130000, 8)
    // dic: el concepto dic fija la tasa sobre el recaudo de dic (R(dic) = 0:
    // los cobros dic-2025/ene-2027/ilegible se FILTRAN por año en la base
    // devengo A-02) ⇒ 0 — mientras que el Flujo (A-04) muestra
    // 135.132,80/2.623.383,20 en Antes/Después. Divergencia por diseño.
    expect(row.months[11]).toBe(0)
    expect(row.total).toBeCloseTo(130000, 8)
    // la Ejecutiva no tiene buckets Antes/Después (shape 12 meses — A-02)
    expect(row.months).toHaveLength(12)
  })
})
