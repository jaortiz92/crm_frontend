/**
 * FE-S20 (spec `frontend.03_20`) — smoke test de los modelos extraídos y del
 * ensamble de hojas: garantiza que el refactor verbatim (los cómputos que
 * antes vivían inline en `ExecutivePivotTable`/`CashFlowPivotTable`/
 * `IvaSettlementPanel` y ahora comparten `executivePivot.js`/
 * `cashFlowPivot.js`/`ivaSettlementModel.js`) produce los mismos montos
 * (CA-3 crudos, CA-4 modo IVA) y que `build*Sheets` entrega el contrato
 * `[{ name, columns, rows }]` del plugin `tableExport` (§7).
 *
 * Los factories reciben el store como OBJETO LLANO (sin Pinia): las fábricas
 * son puras respecto del almacén que les inyecten.
 */
import { describe, it, expect } from 'vitest'
import { createExecutivePivotModel } from '@/components/budget/planning/executivePivot.js'
import { createCashFlowPivotModel } from '@/components/budget/planning/cashFlowPivot.js'
import { buildIvaSettlementViewModel } from '@/components/budget/planning/ivaSettlementModel.js'
import {
  buildExecutiveSheets,
  buildFlowSheets,
  buildEditorSheets,
  buildSettlementSheets,
  buildCecoSheets
} from '@/components/budget/planning/planningExportSheets.js'
import { sheetsToCsvText } from '@/plugins/tableExport.js'

/** Catálogo mínimo del store de Planeación (degradaciones cargadas/ok). */
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
    tax: { summary: null, stale: false, budgetId: 127, cashFlow: null },
    settlement: { data: null, loading: false, error: false, loaded: true, year: 2026 },
    carryover: { enabled: false, source: null, lines: [] }
  }
}

/**
 * Escenario con ingreso (mar, pago mar), gasto fijo (jun, pago jun) y
 * una compra (may, sin fecha de pago) — cubre causación y caja.
 */
function makeScenario() {
  return {
    id_budget: 127,
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
        id_budget_line: 2,
        id_cost_center: 201,
        line_type: 'expense',
        behavior_type: 'fixed',
        budget_date: '2026-06-01',
        payment_date: '2026-06-30',
        projected_amount: 400000,
        has_iva: false,
        variable_rate: null
      },
      {
        id_budget_line: 3,
        id_cost_center: 201,
        line_type: 'purchase',
        behavior_type: 'fixed',
        budget_date: '2026-05-05',
        payment_date: null,
        projected_amount: 90000,
        has_iva: false,
        variable_rate: null
      }
    ]
  }
}

describe('FE-S20: executivePivot (modelo compartido de la Vista Ejecutiva)', () => {
  it('agrupa el pivote de ingresos por CECO y cierra el P&G con los netos', () => {
    const scenario = makeScenario()
    const model = createExecutivePivotModel({ scenario, store: makeStore() })
    const income = model.incomePivot.value
    expect(income.rows).toHaveLength(1)
    expect(income.rows[0].label).toBe('CECO-101')
    expect(income.rows[0].months[2]).toBe(1000000)
    expect(income.rows[0].total).toBe(1000000)
    expect(model.hasIncomeRows.value).toBe(true)
    // Sin tasas de costo cargadas que cubran el año ⇒ costo degradado (D-8).
    expect(model.costDegradation.value).toBe('empty')
    expect(model.costPivot.value).toBeNull()
    const pnl = model.pnl.value
    expect(pnl.ingresos[2]).toBe(1000000)
    // Gastos fijos del mes jun (+variables null ⇒ solo fijos).
    expect(pnl.gastos[5]).toBe(400000)
    // Margen/resultado `null` con costo no estimable (filas `—` en pantalla).
    expect(pnl.margen).toBeNull()
    expect(pnl.resultado).toBeNull()
  })
})

describe('FE-S20: buildExecutiveSheets (hojas del tab Vista Ejecutiva)', () => {
  it('exporta P&G + Acumulado + bloques con montos crudos (CA-1/CA-3)', () => {
    const sheets = buildExecutiveSheets({ scenario: makeScenario(), store: makeStore() })
    expect(sheets.map((sheet) => sheet.name)).toEqual([
      'Resultado (P&G)',
      'Acumulado (Ene→Mes)',
      'Ingresos',
      'Gastos fijos'
    ])
    const pg = sheets[0]
    expect(pg.columns[0]).toEqual({ key: 'concepto', label: 'Concepto' })
    expect(pg.columns[pg.columns.length - 1]).toEqual({ key: 'total', label: 'Total' })
    const ingresosRow = pg.rows.find((row) => row.concepto === '(+) Ingresos')
    expect(ingresosRow.m2).toBe(1000000)
    expect(ingresosRow.total).toBe(1000000)
    const costoRow = pg.rows.find((row) => row.concepto === '(−) Costo de ventas')
    expect(costoRow.m2).toBeNull()
    const fijosRow = pg.rows.find((row) => row.concepto === '(−) Gastos fijos')
    expect(fijosRow.m5).toBe(400000)
    const impuestosRow = pg.rows.find((row) => row.concepto === '(-) Impuestos')
    expect(impuestosRow.m11).toBeNull()
    // Acumulado Ene→Mes: Total = valor de diciembre (redundancia §4.3).
    const acumulado = sheets[1]
    expect(acumulado.rows.find((r) => r.concepto === '(+) Ingresos acumulados').m2).toBe(1000000)
    expect(
      acumulado.rows.find((r) => r.concepto === '(+) Ingresos acumulados').total
    ).toBe(1000000)
    // Bloque Ingresos: filas CECO + pie Σ Total (matriz visible).
    const bloque = sheets[2]
    expect(bloque.rows).toHaveLength(2)
    expect(bloque.rows[0].ceco).toBe('CECO-101')
    expect(bloque.rows[1].ceco).toBe('Σ Total')
    expect(bloque.rows[1].total).toBe(1000000)
  })

  it('el CSV derivado queda con BOM y monto crudo (CA-7/CA-3)', () => {
    const csv = sheetsToCsvText(buildExecutiveSheets({ scenario: makeScenario(), store: makeStore() }))
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toContain('1000000')
  })
})

describe('FE-S20: cashFlowPivot (modelo compartido de la Vista Flujo, CA-4)', () => {
  it('en Neto usa montos crudos por fecha de pago y en Con IVA aplica ×1.19', () => {
    const scenario = makeScenario()
    const neto = createCashFlowPivotModel({ scenario, financingPrincipalLines: [], financingDisbursementLines: [], store: makeStore() })
    expect(neto.entradasPivot.value.rows[0].months[2]).toBe(1000000)
    expect(neto.fijosPivot.value.rows[0].months[5]).toBe(400000)
    // Compras por MES DE CAUSACIÓN (may), sin fecha de pago (BR-PUR-01).
    expect(neto.comprasPivot.value.rows[0].months[4]).toBe(90000)
    // Bodega §2.6: sin tasas ⇒ costo 0 ⇒ bodega = compras acumuladas.
    expect(neto.bodegaMes.value[11]).toBe(90000)
    expect(neto.carryActive.value).toBe(false)

    const bruto = createCashFlowPivotModel({
      scenario,
      financingPrincipalLines: [],
      financingDisbursementLines: [],
      store: makeStore({ ivaMode: true })
    })
    // Ingreso SIEMPRE gravado (D-S10-5): 1.000.000 × 1,19.
    expect(bruto.entradasPivot.value.rows[0].months[2]).toBe(1190000)
    // Gasto con flag `has_iva: false` ⇒ NETO sin gross-up (AC-FE14-4).
    expect(bruto.fijosPivot.value.rows[0].months[5]).toBe(400000)
    expect(bruto.resumen.value.entradasTotal).toBe(1190000)
  })
})

describe('FE-S20: buildFlowSheets / buildEditorSheets (hojas de la vista)', () => {
  it('Flujo: resumen + bloques en orden visual, montos y totals reconciliados', () => {
    const sheets = buildFlowSheets({
      scenario: makeScenario(),
      financingPrincipalLines: [],
      financingDisbursementLines: [],
      store: makeStore()
    })
    expect(sheets.map((sheet) => sheet.name)).toEqual([
      'Resumen de liquidez',
      'Entradas',
      'Compras del mes (importaciones)',
      'Salidas — Pago a proveedores (costo de ventas)',
      'Salidas — Gastos fijos'
    ])
    const resumen = sheets[0]
    const entradasRow = resumen.rows.find((row) => row.concepto === 'Σ Entradas')
    expect(entradasRow.m2).toBe(1000000)
    expect(entradasRow.total).toBe(1000000)
    // Σ Salidas: fijo (jun) + cuota del proveedor por la compra (FE-S9, ancla
    // may — % internación 0 ⇒ provBase 90000).
    const salidasRow = resumen.rows.find((row) => row.concepto === 'Σ Salidas')
    expect(salidasRow.m4).toBe(90000)
    expect(salidasRow.m5).toBe(400000)
    expect(salidasRow.total).toBe(490000)
    const netoRow = resumen.rows.find((row) => row.concepto === 'Flujo neto')
    expect(netoRow.total).toBe(510000) // FE-S8 C-3: entradasTotal − salidasTotal
    const acumuladoRow = resumen.rows.find((row) => row.concepto === 'Flujo acumulado')
    expect(acumuladoRow.m11).toBe(510000)
    expect(acumuladoRow.total).toBe(510000)
    const bodegaRow = resumen.rows.find((row) => row.concepto === 'Bodega estimada (cierre)')
    expect(bodegaRow.m11).toBe(90000)
    // Sin montos fuera de año: sin columnas Antes/Después (FE-S8).
    expect(resumen.columns.some((column) => column.label === 'Antes de 2026')).toBe(false)
  })

  it('Editor de Celdas: 3 hojas (una por sección) y modo IVA aplicado', () => {
    const scenario = makeScenario()
    const neto = buildEditorSheets({ scenario, ivaMode: false, store: makeStore() })
    expect(neto.map((s) => s.name)).toEqual(['Editor — Ingresos', 'Editor — Gastos', 'Editor — Compras'])
    const gastoNeto = neto[1].rows[0]
    expect(gastoNeto.monto).toBe(400000)
    expect(gastoNeto.conIva).toBeUndefined()
    const bruto = buildEditorSheets({ scenario, ivaMode: true, store: makeStore() })
    const ingresoBruto = bruto[0].rows[0]
    expect(ingresoBruto.iva).toBe(190000)
    expect(ingresoBruto.total).toBe(1190000)
    const gastoBruto = bruto[1].rows[0]
    expect(gastoBruto.conIva).toBe('No') // flag `has_iva: false` NULL≡True solo para nulls
    expect(gastoBruto.iva).toBe(0)
    expect(gastoBruto.total).toBe(400000)
  })
})

describe('FE-S20: Liquidación (modelo compartido del panel) + hoja', () => {
  it('filas del panel tal como se renderizan + fila Totales (clave `deductable`)', () => {
    const data = {
      year: 2026,
      periods: [
        {
          period_no: 3,
          date_from: '2026-05-01',
          date_to: '2026-06-30',
          payment_due_date: '2026-07-21',
          description: 'Bimestre 3',
          generated: { ventas: 500000 },
          deductible: {
            fixed_expenses: 300000,
            variable_expenses: 50000,
            import_vat: 10000,
            nationalization_vat: 5000
          },
          prior_balance: 1000,
          tax_base: 235000,
          payment: 235000,
          carry_balance: 0,
          events_count: 7
        }
      ],
      totals: { generated: 500000, deductable: 365000, payments: 235000, final_balance: 0 }
    }
    const vm = buildIvaSettlementViewModel(data)
    expect(vm.periodRows).toHaveLength(1)
    expect(vm.periodRows[0].payment).toBe(235000)
    expect(vm.totals.deductable).toBe(365000)
    const [sheet] = buildSettlementSheets({ store: { settlement: { data, loading: false, error: false } } })
    expect(sheet.name).toBe('Liquidación de IVA')
    const row = sheet.rows[0]
    expect(row.rango).toBe('01/05/2026 – 30/06/2026 · Bimestre 3')
    expect(row.gastosFijos).toBe(300000)
    expect(row.pago).toBe(235000)
    const totales = sheet.rows[1]
    expect(totales.rango).toBe('Totales')
    expect(totales.descontable).toBe(365000)
    expect(totales.gastosFijos).toBeNull()
  })
})

describe('FE-S20: Detalle CECO (tab activo con el monto movementAmount)', () => {
  it('Causado exporta netos y flujo respeta el modo (CA-2 dataset ya filtrado)', () => {
    const movements = makeScenario().budget_lines
    const [causado] = buildCecoSheets({
      movements,
      tab: 'caused',
      ivaActive: false,
      sheetName: 'Causado'
    })
    expect(causado.name).toBe('Causado')
    expect(causado.columns.map((c) => c.label)).toEqual([
      'N° línea',
      'Cuenta/Categoría',
      'Tipo',
      'Comportamiento',
      'Origen',
      'Descripción',
      'Mes de causación',
      'Mes de pago',
      'Monto'
    ])
    expect(causado.rows).toHaveLength(4) // 3 movimientos + Σ Total de la selección
    const compra = causado.rows.find((r) => r.tipo === 'Compra')
    expect(compra.mesCausacion).toBe('May 2026')
    expect(compra.monto).toBe(90000)
    expect(causado.rows[3].lineNo).toBe('Σ Total de la selección')
    expect(causado.rows[3].monto).toBe(1490000)
    // Flujo con modo IVA: ingreso ×1.19, compra CRUDA (A-1'), gasto neto.
    const [flujo] = buildCecoSheets({
      movements,
      tab: 'flow',
      ivaActive: true,
      sheetName: 'Flujo'
    })
    const ingreso = flujo.rows.find((r) => r.lineNo === 1)
    expect(ingreso.monto).toBe(1190000)
    const gasto = flujo.rows.find((r) => r.lineNo === 2)
    expect(gasto.monto).toBe(400000) // has_iva:false ⇒ neto
    expect(flujo.rows[3].monto).toBe(1680000)
  })
})
