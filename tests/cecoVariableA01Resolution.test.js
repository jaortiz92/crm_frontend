/**
 * ENMIENDA A-01 (spec `frontend.03_21` §10, 2026-10-20) — resolución de la
 * base del gasto variable por **(id_zone, id_line)**:
 *  - Los CECOs de ingreso ("Facturación…" 000xxx) están desacoplados de los
 *    CECOs de gasto variable ("Comisiones…" 210xxx / "Despacho…" 320xxx), así
 *    que buscar la base con el `id_cost_center` de la línea daba TODOS los
 *    montos en 0.
 *  - Decisión: propio CECO primero; única resolución por (zona, línea) contra
 *    CECOs con facturación; 0 o múltiples candidatos ⇒ `null` ⇒ 0 (SIN
 *    fallback al total global ni a otras combinaciones).
 *
 * Cubre: `resolveVariableBaseCeco` + `fixedIncomeCausationByVariableCeco`
 * (`planningFormat.js`), los pivotes (Ejecutiva + Flujo) y la serie del
 * drill-down (`movementAmountReconciled`). Mismo estilo plano que
 * `cecoVariableReconciled.test.js`: stores falsos, cero HTTP.
 */
import { describe, it, expect } from 'vitest'
import { createExecutivePivotModel } from '@/components/budget/planning/executivePivot.js'
import { createCashFlowPivotModel } from '@/components/budget/planning/cashFlowPivot.js'
import {
  fixedIncomeCausationByVariableCeco,
  resolveVariableBaseCeco
} from '@/components/budget/planning/planningFormat.js'
import {
  movementAmountReconciled,
  TAB_CAUSED
} from '@/components/budget/planning/cecoMovements.js'

/**
 * Catálogo A-01 espejo del hallazgo real: 151 factura (zona 7, línea 1);
 * 210 es "Comisiones" de la MISMA (7, 1); 320 es "Despacho" de (9, 2) —
 * zona+línea SIN facturación; 181 comparte (7, 1) con 151 (caso de
 * ambigüedad del resolver directo).
 */
const catalog = [
  { id_cost_center: 151, cost_center_code: '000151', id_zone: 7, id_line: 1 },
  { id_cost_center: 181, cost_center_code: '000181', id_zone: 7, id_line: 1 },
  { id_cost_center: 210, cost_center_code: '210001', id_zone: 7, id_line: 1 },
  { id_cost_center: 320, cost_center_code: '320001', id_zone: 9, id_line: 2 }
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

/**
 * Escenario A-01: facturación del CECO 151 en mar (zona 7, línea 1); gasto
 * variable "Comisiones" del CECO 210 (misma zona+línea ⇒ 1 candidato) y
 * "Despacho" del CECO 320 (zona 9, línea 2 ⇒ SIN facturación).
 */
function makeScenario() {
  return {
    id_budget: 573,
    budget_year: 2026,
    budget_lines: [
      {
        id_budget_line: 1,
        id_cost_center: 151,
        line_type: 'income',
        behavior_type: 'fixed',
        budget_date: '2026-03-10',
        payment_date: '2026-03-25',
        projected_amount: 1000000,
        has_iva: true,
        variable_rate: null
      },
      {
        id_budget_line: 5,
        id_cost_center: 210,
        line_type: 'expense',
        behavior_type: 'variable_sales',
        budget_date: '2026-03-15',
        payment_date: '2026-04-10',
        projected_amount: 7000,
        has_iva: true,
        variable_rate: 0.05
      },
      {
        id_budget_line: 6,
        id_cost_center: 320,
        line_type: 'expense',
        behavior_type: 'variable_receivables',
        budget_date: '2026-03-20',
        payment_date: '2026-04-20',
        projected_amount: 9000,
        has_iva: true,
        variable_rate: 0.2
      }
    ]
  }
}

describe('A-01 §10: resolveVariableBaseCeco (propio primero, única resolución zona+línea, sin fallback)', () => {
  it('(a) CECO de gasto cuya (zona, línea) SÍ tiene facturación en OTRO CECO ⇒ generador resuelto', () => {
    // 210 NO factura; su base la genera el CECO 151 de la MISMA (7, 1).
    expect(resolveVariableBaseCeco(210, [151], catalog)).toBe(151)
  })

  it('(b) CECO que factura él mismo ⇒ propio CECO (compatibilidad, paso 1)', () => {
    expect(resolveVariableBaseCeco(151, [151], catalog)).toBe(151)
    expect(resolveVariableBaseCeco(210, [210], catalog)).toBe(210)
  })

  it('(b) zona+línea SIN facturación ⇒ null (sin fallback)', () => {
    // (9, 2) del CECO 320 no tiene ningún CECO con ingreso.
    expect(resolveVariableBaseCeco(320, [151], catalog)).toBeNull()
  })

  it('MÚLTIPLES candidatos en la misma (zona, línea) ⇒ null (fail-closed AC-FE21-8)', () => {
    // 151 y 181 con ingreso a la vez ⇒ ambigüedad ⇒ null.
    expect(resolveVariableBaseCeco(210, [151, 181], catalog)).toBeNull()
  })

  it('CECO sin catálogo / catálogo caído / sin id_zone ⇒ null (degradación honesta)', () => {
    expect(resolveVariableBaseCeco(210, [151], [])).toBeNull()
    expect(resolveVariableBaseCeco(210, [151], null)).toBeNull()
    expect(resolveVariableBaseCeco(999, [151], catalog)).toBeNull()
    expect(
      resolveVariableBaseCeco(222, [151], [{ id_cost_center: 222, id_zone: 1, id_line: null }])
    ).toBeNull()
  })
})

describe('A-01 §10: fixedIncomeCausationByVariableCeco (Map keyed por CECO de gasto)', () => {
  it('210 ⇒ serie del generador 151; 320 (sin facturación) ⇒ SIN fila; 210 con ingreso propio ⇒ propia', () => {
    const scenario = makeScenario()
    // (a) resolución por (zona, línea) — la serie del Map es la del 151.
    const baseMap = fixedIncomeCausationByVariableCeco(scenario.budget_lines, catalog)
    expect(baseMap.get(210)[2]).toBe(1000000)
    // (b) zona+línea sin facturación ⇒ sin fila ⇒ el llamador degrada a 0.
    expect(baseMap.get(320)).toBeUndefined()
    // Catálogo caído ⇒ Map vacío (sin resolución, sin fallback).
    expect(fixedIncomeCausationByVariableCeco(scenario.budget_lines, null).size).toBe(0)
  })
})

describe('A-01 §10: pivote Ejecutiva resuelve la base por (zona, línea)', () => {
  const scenario = makeScenario()

  it('(a) comisiones del CECO 210 = tasa × facturación del CECO 151 (mar) — ya NO todo en 0', () => {
    const model = createExecutivePivotModel({ scenario, store: makeStore() })
    const row = model.variablePivot.value.rows.find((r) => r.id === 210)
    expect(row).toBeDefined()
    expect(row.months[2]).toBe(50000) // 0.05 × 1.000.000 (facturación del 151)
    expect(row.total).toBe(50000)
  })

  it('(b) zona+línea sin facturación (CECO 320) ⇒ fila con montos en 0, sin fallback', () => {
    const model = createExecutivePivotModel({ scenario, store: makeStore() })
    const row = model.variablePivot.value.rows.find((r) => r.id === 320)
    expect(row).toBeDefined()
    expect(row.months).toEqual(Array.from({ length: 12 }, () => 0))
    expect(row.total).toBe(0)
    // columnTotals del bloque NO incluye el monto del 320 (sin fallback).
    expect(model.variablePivot.value.columnTotals[2]).toBe(50000)
  })
})

describe('A-01 §10: pivote Flujo resuelve la base por (zona, línea)', () => {
  const scenario = makeScenario()

  it('(a) bloque variable del Flujo = tasa × ingreso causado del generador 151', () => {
    const model = createCashFlowPivotModel({
      scenario,
      financingPrincipalLines: [],
      financingDisbursementLines: [],
      store: makeStore()
    })
    const row = model.variablesPivot.value.rows.find((r) => r.id === 210)
    expect(row).toBeDefined()
    expect(row.months[2]).toBe(50000)
    expect(row.months[3]).toBe(0) // pago en abr; posición por CAUSACIÓN (mar)
  })

  it('(b) CECO 320 sin facturación en su (zona, línea) ⇒ montos en 0, sin fallback global', () => {
    const model = createCashFlowPivotModel({
      scenario,
      financingPrincipalLines: [],
      financingDisbursementLines: [],
      store: makeStore()
    })
    const row = model.variablesPivot.value.rows.find((r) => r.id === 320)
    expect(row).toBeDefined()
    expect(row.months).toEqual(Array.from({ length: 12 }, () => 0))
    expect(row.total).toBe(0)
  })
})

describe('A-01 §10: drill-down (movementAmountReconciled) usa la MISMA serie resuelta', () => {
  it('(a) serie del detalle del CECO 210 == serie del generador 151 ⇒ monto 50.000', () => {
    const scenario = makeScenario()
    const series = fixedIncomeCausationByVariableCeco(scenario.budget_lines, catalog).get(210)
    const line = scenario.budget_lines.find((l) => l.id_budget_line === 5)
    expect(movementAmountReconciled(line, TAB_CAUSED, false, series)).toBe(50000)
  })

  it('(b) CECO 320 sin base resuelta ⇒ serie indefinida ⇒ monto 0 (sin fallback)', () => {
    const scenario = makeScenario()
    const series = fixedIncomeCausationByVariableCeco(scenario.budget_lines, catalog).get(320)
    expect(series).toBeUndefined()
    const line = scenario.budget_lines.find((l) => l.id_budget_line === 6)
    expect(movementAmountReconciled(line, TAB_CAUSED, false, series)).toBe(0)
  })
})
