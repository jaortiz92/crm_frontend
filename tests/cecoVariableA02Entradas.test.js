/**
 * ENMIENDA A-02 (spec `frontend.03_21` §11, 2026-10-21) — base de recaudo =
 * ENTRADAS del flujo. La base de `variable_receivables` deja de ser la
 * facturación (I por budget_date) y pasa a la serie de ENTRADAS del Flujo:
 * Σ importes NETOS de líneas `income` + `fixed` en su MES DE PAGO
 * (`cfMonth = payment_date ?? budget_date`) del CECO GENERADOR resuelto
 * A-01 (propio primero, luego única (zona, línea), SIN fallback).
 *
 * Reglas cubiertas:
 *  - (a) AC-FE21-10: la comisión del MES m usa el RECAUDO del MES m (cobros
 *        con cfMonth = m), NO la facturación de m — payments desplazados
 *        (facturación ene → cobro feb) alimentan las comisiones de feb.
 *  - (b) AC-FE21-11: CECO generador sin cobros ⇒ 0 SIN fallback a facturación.
 *  - Lectura NETA (D-FE14-7): la base no lleva el gross-up ×1.19 del modo IVA
 *        (ese modo es solo presentación del bloque Entradas).
 *
 * Mismo estilo que `cecoVariableA01Resolution.test.js`: catálogo A-01, stores
 * falsos, cero HTTP. NO valida contra el backend (equipo de BE 573).
 */
import { describe, it, expect } from 'vitest'
import { createExecutivePivotModel } from '@/components/budget/planning/executivePivot.js'
import { createCashFlowPivotModel } from '@/components/budget/planning/cashFlowPivot.js'
import {
  entradasCausacionByCeco,
  entradasCausacionByVariableCeco,
  cfMonthOf
} from '@/components/budget/planning/planningFormat.js'
import { movementAmountReconciled, TAB_CAUSED } from '@/components/budget/planning/cecoMovements.js'

/**
 * Catálogo A-01 espejo: 151 factura/cobra (zona 7, línea 1); 210 "Comisiones"
 * de la MISMA (7, 1); 320 "Despacho" de (9, 2) — sin CECO de base.
 */
const catalog = [
  { id_cost_center: 151, cost_center_code: '000151', id_zone: 7, id_line: 1 },
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
 * Escenario A-02: la facturación del CECO 151 está en ENERO (budget) pero su
 * COBRO cae en FEBRERO (payment desplazado); la comisión por recaudo del CECO
 * 210 posiciona la comisión en feb (mes de budget_date de la línea 5) y su
 * base es el RECAUDO de feb.
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
        budget_date: '2026-01-10',
        payment_date: '2026-02-05',
        projected_amount: 1000000,
        has_iva: true,
        variable_rate: null
      },
      {
        id_budget_line: 5,
        id_cost_center: 210,
        line_type: 'expense',
        behavior_type: 'variable_receivables',
        budget_date: '2026-02-15',
        payment_date: '2026-03-10',
        projected_amount: 7000,
        has_iva: true,
        variable_rate: 0.2
      }
    ]
  }
}

describe('A-02 §11: cfMonthOf + entradasCausacionByCeco (serie NETA por MES DE PAGO)', () => {
  it('mes de cobro con fallback (R-1); Σ neta por cfMonth — causación NO entra', () => {
    expect(cfMonthOf({ payment_date: '2026-02-05', budget_date: '2026-01-10' })).toBe(1)
    expect(cfMonthOf({ payment_date: null, budget_date: '2026-01-10' })).toBe(0)
    const byCeco = entradasCausacionByCeco(makeScenario().budget_lines)
    expect(byCeco.get(151)[1]).toBe(1000000) // feb: MES DE COBRO
    expect(byCeco.get(151)[0]).toBe(0) // ene: facturación NO es base de recaudo
  })

  it('entrada no-array ⇒ Map vacío (degradación honesta)', () => {
    expect(entradasCausacionByCeco(null).size).toBe(0)
  })

  it('solo income+fixed entra; income variable no compone base', () => {
    const lines = [
      { line_type: 'income', behavior_type: 'variable_receivables', projected_amount: 999999, budget_date: '2026-01-05', payment_date: null },
      { line_type: 'income', behavior_type: 'fixed', projected_amount: 300, budget_date: '2026-05-01', payment_date: '2026-05-20', id_cost_center: 151 }
    ]
    const byCeco = entradasCausacionByCeco(lines)
    expect(byCeco.get(151)[4]).toBe(300)
    expect(byCeco.size).toBe(1)
  })
})

describe('A-02 §11: entradasCausacionByVariableCeco (resolución A-01 sobre cobro)', () => {
  it('210 ⇒ serie de cobro del generador 151; 320 (zona+línea sin cobro) ⇒ sin fila', () => {
    const map = entradasCausacionByVariableCeco(makeScenario().budget_lines, catalog)
    expect(map.get(210)[1]).toBe(1000000)
    expect(map.get(320)).toBeUndefined()
  })
})

describe('(a) AC-FE21-10: comisión de feb usa el RECAUDO de feb (cobros), no la facturación de feb', () => {
  const scenario = makeScenario()

  it('Vista Ejecutiva: celda de feb = 0.2 × cobro feb (1.000.000); ene (facturación) aporta 0', () => {
    const model = createExecutivePivotModel({ scenario, store: makeStore() })
    const row = model.variablePivot.value.rows.find((r) => r.id === 210)
    expect(row).toBeDefined()
    expect(row.months[1]).toBe(200000) // 0.2 × recaudo de FEB (payment_date 2026-02-05)
    expect(row.months[0]).toBe(0) // facturación de ene NO es base de recaudo
    expect(row.total).toBe(200000)
    // la comisión cae en el MES DE CAUSACIÓN de la línea (feb = budget_date).
  })

  it('Vista Flujo (A-04 §13): el bill se FACTURA en ene ⇒ sin línea concepto ene ⇒ comisión 0; sin fallback', () => {
    const model = createCashFlowPivotModel({
      scenario,
      financingPrincipalLines: [],
      financingDisbursementLines: [],
      store: makeStore()
    })
    const row = model.variablesPivot.value.rows.find((r) => r.id === 210)
    expect(row).toBeDefined()
    // A-04: en el Flujo la comisión de recaudo sigue a los COBROS con la tasa
    // del MES DE FACTURACIÓN del bill. Este bill se factura en ENE (sin
    // línea concepto ene) ⇒ NO genera comisión aunque se cobre en feb
    // (§13 punto 3: rate ausente ⇒ 0, SIN fallback). La celda devengo de la
    // Ejecutiva sigue en feb (test de arriba) — divergencia por diseño.
    expect(row.months[1]).toBe(0)
    expect(row.months[2]).toBe(0)
    expect(row.total).toBe(0)
  })

  it('Vista Flujo (A-04 §13, caso regular): bill facturado y COBRADO en su mes ⇒ igual que A-02', () => {
    const scenarioRegular = {
      id_budget: 573,
      budget_year: 2026,
      budget_lines: [
        {
          id_budget_line: 1, id_cost_center: 151, line_type: 'income', behavior_type: 'fixed',
          budget_date: '2026-02-10', payment_date: '2026-02-25', projected_amount: 1000000,
          has_iva: true, variable_rate: null
        },
        {
          id_budget_line: 5, id_cost_center: 210, line_type: 'expense',
          behavior_type: 'variable_receivables', budget_date: '2026-02-15',
          payment_date: '2026-03-10', projected_amount: 7000, has_iva: true, variable_rate: 0.2
        }
      ]
    }
    const model = createCashFlowPivotModel({
      scenario: scenarioRegular,
      financingPrincipalLines: [],
      financingDisbursementLines: [],
      store: makeStore()
    })
    const row = model.variablesPivot.value.rows.find((r) => r.id === 210)
    expect(row).toBeDefined()
    // Cobro en SU mes (feb) ⇒ bucket 1 con la tasa de la línea feb:
    // 0.2 × 1.000.000 = 200.000 — idéntico al A-02 (caso regular).
    expect(row.months[1]).toBe(200000)
    expect(row.months[2]).toBe(0)
    expect(row.total).toBe(200000)
  })

  it('modo IVA: la base NO se gross-uppea (neta D-FE14-7); solo el monto derivado ×1.19', () => {
    const model = createExecutivePivotModel({ scenario, store: makeStore({ ivaMode: true }) })
    const pivot = model.variablePivot.value
    // Ejecutiva es SIEMPRE neta: base neta × tasa sin gross-up.
    expect(pivot.rows.find((r) => r.id === 210).months[1]).toBe(200000)
    // Flujo con modo ON: el DERIVADO lleva ×1.19, la base sigue neta (sin 1.19²).
    // A-04: bill FACTURADO en feb (mes con línea concepto) cobrado en su
    // mes ⇒ el aporte de recaudo cae en feb; el gross-up es del flag de la
    // línea (elige un caso regular — el original A-04-iza a 0, §13 punto 3).
    const flow = createCashFlowPivotModel({
      scenario: {
        id_budget: 573,
        budget_year: 2026,
        budget_lines: [
          {
            id_budget_line: 1, id_cost_center: 151, line_type: 'income', behavior_type: 'fixed',
            budget_date: '2026-02-10', payment_date: '2026-02-25', projected_amount: 1000000,
            has_iva: true, variable_rate: null
          },
          {
            id_budget_line: 5, id_cost_center: 210, line_type: 'expense',
            behavior_type: 'variable_receivables', budget_date: '2026-02-15',
            payment_date: '2026-03-10', projected_amount: 7000, has_iva: true, variable_rate: 0.2
          }
        ]
      },
      financingPrincipalLines: [],
      financingDisbursementLines: [],
      store: makeStore({ ivaMode: true })
    })
    // Flujo con modo ON: el DERIVADO lleva ×1.19 sobre la base NETA ⇒
    // 0.2 × 1.000.000 × 1.19 = 238.000. Si la base fuera bruta daría
    // 0.2 × 1.190.000 × 1.19 = 283.220 (la lectura neta lo excluye).
    const row = flow.variablesPivot.value.rows.find((r) => r.id === 210)
    expect(row.months[1]).toBeCloseTo(238000, 8)
    expect(row.months[1]).not.toBeCloseTo(283220, 8)
  })
})

describe('(b) AC-FE21-11: generador resuelto SIN cobros ⇒ 0 SIN fallback', () => {
  /**
   * CECO 151 tiene FACTURACIÓN (ene; sobre `budget_date`) pero NINGUNA
   * entrada en el Flujo (payment_date ilegible ⇒ cfMonth −1 ⇒ excluida de la
   * serie de cobro); la base de recaudo resuelta (151) queda de 12 ceros ⇒
   * la comisión del 210 es 0, jamás usa la facturación (base I) ni el total
   * global (AC-FE21-11).
   */
  function scenarioSinCobros() {
    return {
      id_budget: 573,
      budget_year: 2026,
      budget_lines: [
        {
          id_budget_line: 1,
          id_cost_center: 151,
          line_type: 'income',
          behavior_type: 'fixed',
          budget_date: '2026-01-10',
          payment_date: 'no-es-fecha',
          projected_amount: 1000000,
          has_iva: true,
          variable_rate: null
        },
        {
          id_budget_line: 5,
          id_cost_center: 210,
          line_type: 'expense',
          behavior_type: 'variable_receivables',
          budget_date: '2026-02-15',
          payment_date: '2026-03-10',
          projected_amount: 7000,
          has_iva: true,
          variable_rate: 0.2
        }
      ]
    }
  }

  it('Ejecutiva y Flujo: fila con montos en 0 aún con facturación del generador', () => {
    const exec = createExecutivePivotModel({
      scenario: scenarioSinCobros(),
      store: makeStore()
    })
    const rowExec = exec.variablePivot.value.rows.find((r) => r.id === 210)
    expect(rowExec).toBeDefined()
    expect(rowExec.months).toEqual(Array.from({ length: 12 }, () => 0))
    expect(rowExec.total).toBe(0)

    const flow = createCashFlowPivotModel({
      scenario: scenarioSinCobros(),
      financingPrincipalLines: [],
      financingDisbursementLines: [],
      store: makeStore()
    })
    const rowFlow = flow.variablesPivot.value.rows.find((r) => r.id === 210)
    expect(rowFlow).toBeDefined()
    expect(rowFlow.months).toEqual(Array.from({ length: 12 }, () => 0))
    expect(rowFlow.total).toBe(0)
  })

  it('drill-down: par { sales, receivables } ⇒ receivables sin cobro ⇒ monto 0; sales conserva I', () => {
    const scenario = scenarioSinCobros()
    const lines = scenario.budget_lines
    const receivablesSeries =
      entradasCausacionByVariableCeco(lines, catalog).get(210) ?? null
    expect(receivablesSeries).toBeNull() // sin cobros resueltos ⇒ sin base R
    const line = lines.find((l) => l.id_budget_line === 5)
    // Par de series { sales, receivables }: la serie I (facturación del 151)
    // existe, pero el comportamiento es recaudo ⇒ NO hay fallback ⇒ 0.
    expect(
      movementAmountReconciled(
        { ...line, source_kind: 'base' },
        TAB_CAUSED,
        false,
        { sales: [1000000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], receivables: null }
      )
    ).toBe(0)
  })
})
