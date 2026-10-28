/**
 * planningExportSheets — ensamble de HOJAS de exportación por pestaña del
 * módulo de Planeación (FE-S20 / spec `frontend.03_20` §5/§7.2).
 *
 * Transforma el estado de los sub-stores de planeación (`budgetScenarioStore`/`budgetIvaStore`, más las props de la vista)
 * al contrato `sheets: [{ name, columns, rows }]` que consume el plugin
 * `@/plugins/tableExport.js` — SIN duplicar agregación: los pivotes y modelos
 * provienen de los MISMOS builders que alimentan los componentes de pantalla
 * (`executivePivot.js`, `cashFlowPivot.js`, `ivaSettlementModel.js`,
 * `planningFormat.js`, `cecoMovements.js`). La exportación no dispara
 * ninguna petición HTTP (RF-9): todo sale de la caché (ASM-10).
 *
 * Reglas de contenido:
 *  - Forma de MATRIZ, tal como la ve el usuario (§5): una fila por CECO o
 *    concepto + fila "Σ Total"; los pivotes van por bloques, en el orden
 *    visual de cada tab (los títulos de bloque espejan los literales de los
 *    componentes — comentarios cruzados en ambos lados).
 *  - Montos SIEMPRE valores numéricos CRUDOS (CA-3: `1250000`); las
 *    funciones de formato (`planningFormat.js`) se usan solo para etiquetas.
 *  - Filas/columnas vacías por degradación (`null` — p. ej. costo sin tasa)
 *    se exportan como celda vacía, no como 0.
 */
import {
  MONTH_LABELS,
  LINE_TYPE_LABELS,
  BEHAVIOR_LABELS,
  formatDateEs,
  lineChargesIva,
  ivaOf,
  withIva,
  monthIndexOf
} from './planningFormat.js'
import { SOURCE_KIND_LABELS, movementAmountReconciled, movementMetaText } from './cecoMovements.js'
import { createExecutivePivotModel, buildAcumuladoSeries, sumOrNull } from './executivePivot.js'
import { createCashFlowPivotModel, buildOoyBucketSeries, carryRowLabelOf } from './cashFlowPivot.js'
import { buildIvaSettlementViewModel } from './ivaSettlementModel.js'

/* ─────────────────────────── helpers de hoja ─────────────────────────── */

/** Columnas Ene–Dic en el orden visual (`PivotMonthTable`). */
function monthColumns() {
  return MONTH_LABELS.map((label, index) => ({ key: `m${index}`, label }))
}

/**
 * Monto crudo exportable: número JS real o `null` (celda vacía) si no es
 * finito o faltante — jamás texto formateado ni el `0` falso de
 * `Number(null)` (CA-3; una degradación `—` en pantalla es celda vacía, no 0).
 * @param {unknown} value
 * @returns {number|null}
 */
function rawNumber(value) {
  if (value === null || value === undefined) return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

/**
 * Celda % del P&G/Acumulado: el display pinta `62,5 %` con 1 decimal
 * (`pvPct`/`pctText`); la exportación porta el MISMO valor como número.
 * `null` (celda vacía) cuando el valor no es estimable o la base es 0.
 * @param {number|null} value
 * @param {number} base
 * @returns {number|null}
 */
function pctExportCell(value, base) {
  if (value === null || base === 0) return null
  return Number(((value / base) * 100).toFixed(1))
}

/** `Mes de causación`/`Mes de pago` legible — espejo de `CecoMovementTable.monthLabelOf`. */
function monthLabelOf(value) {
  const index = monthIndexOf(value)
  if (index < 0) return '—'
  const plain = String(value ?? '').match(/^(\d{4})/)
  return plain ? `${MONTH_LABELS[index]} ${plain[1]}` : MONTH_LABELS[index]
}

/**
 * Hoja de matriz CECO×meses de un bloque pivote (Ejecutiva y Flujo comparten
 * forma): filas por CECO + fila "Σ Total". **ENMIENDA A-05 (spec
 * `frontend.03_21` §14)**: con la bandera `ooy` y montos fuera de año el
 * orden es `CECO | Ene…Dic | Antes/Después de {N} | Total | Total General`
 * (mismo gate de las Antes/Después — BR-FE21-17); sin ooy: `CECO | Ene…Dic |
 * Total`. `Total` = solo los 12 meses (BR-FE21-16); "Total General" =
 * meses + Antes + Después (`generalTotal`/`grandGeneralTotal`).
 * @param {string} title título del bloque (→ nombre de hoja)
 * @param {{ rows: Array, columnTotals: number[], grandTotal: number, grandGeneralTotal?: number, beforeTotal?: number, afterTotal?: number, beforeAfterRowCount?: number }} pivot
 * @param {{ scenarioYear?: number|null, ooy?: boolean }} [options]
 */
function matrixSheet(title, pivot, { scenarioYear = null, ooy = false } = {}) {
  const includeOoy = Boolean(ooy) && pivot.beforeAfterRowCount > 0 && scenarioYear !== null
  const columns = [{ key: 'ceco', label: 'CECO' }, ...monthColumns()]
  if (includeOoy) {
    columns.push({ key: 'antes', label: `Antes de ${scenarioYear}` })
    columns.push({ key: 'despues', label: `Después de ${scenarioYear}` })
  }
  columns.push({ key: 'total', label: 'Total' })
  if (includeOoy) columns.push({ key: 'totalGeneral', label: 'Total General' })
  const rows = pivot.rows.map((row) => {
    const out = { ceco: row.label }
    row.months.forEach((value, index) => {
      out[`m${index}`] = rawNumber(value)
    })
    if (includeOoy) {
      out.antes = rawNumber(row.before)
      out.despues = rawNumber(row.after)
    }
    out.total = rawNumber(row.total)
    if (includeOoy) out.totalGeneral = rawNumber(row.generalTotal)
    return out
  })
  const footer = { ceco: 'Σ Total' }
  pivot.columnTotals.forEach((value, index) => {
    footer[`m${index}`] = rawNumber(value)
  })
  if (includeOoy) {
    footer.antes = rawNumber(pivot.beforeTotal)
    footer.despues = rawNumber(pivot.afterTotal)
  }
  footer.total = rawNumber(pivot.grandTotal)
  if (includeOoy) footer.totalGeneral = rawNumber(pivot.grandGeneralTotal)
  rows.push(footer)
  return { name: title, columns, rows }
}

/* ───────────────────────── Vista Ejecutiva (§5) ─────────────────────── */

/**
 * Definiciones de fila del P&G (§4.2) — ESPEJO del orden/etiquetas de
 * `ExecutivePivotTable.pnlRows` (misma fuente visual; actualizar ambos si
 * cambia el spec). `key` = serie del modelo P&G; `pctOf` = serie base del %.
 */
const PNL_EXPORT_ROWS = [
  { label: '(+) Ingresos', key: 'ingresos' },
  { label: '(−) Costo de ventas', key: 'costo' },
  { label: '= Margen bruto', key: 'margen' },
  { label: 'Margen bruto %', key: 'margen', pctOf: 'ingresos' },
  { label: '(−) Gastos fijos', key: 'fijos' },
  { label: '(−) Gastos variables', key: 'variables' },
  { label: '= Resultado operativo', key: 'resultado' },
  { label: 'Resultado %', key: 'resultado', pctOf: 'ingresos' },
  { label: '(-) Impuestos', key: 'impuestos' },
  { label: '= Resultado después de impuestos', key: 'resultadoDespuesImpuestos' },
  { label: 'Resultado después de impuestos %', key: 'resultadoDespuesImpuestos', pctOf: 'ingresos' }
]

/**
 * Definiciones de fila del Acumulado (§4.3) — ESPEJO de
 * `ExecutivePivotTable.acumulado`; base de los % = ingresos acumulados del
 * mes y Total = valor/razón de diciembre (la columna Total repite la última).
 */
const ACUMULADO_EXPORT_ROWS = [
  { label: '(+) Ingresos acumulados', key: 'ingresosAcc' },
  { label: '(−) Costo de ventas acumulado', key: 'costoAcc' },
  { label: 'Costo %', key: 'costoAcc', pctOf: 'ingresosAcc' },
  { label: '(−) Gastos acumulados', key: 'gastosAcc' },
  { label: 'Gastos %', key: 'gastosAcc', pctOf: 'ingresosAcc' },
  { label: '= Neto acumulado', key: 'netoAcc' },
  { label: 'Margen %', key: 'netoAcc', pctOf: 'ingresosAcc' },
  { label: '(−) Impuestos acumulados', key: 'impuestosAcc' },
  { label: 'Impuestos %', key: 'impuestosAcc', pctOf: 'ingresosAcc' },
  { label: '= Neto después de impuestos acumulado', key: 'netoDespuesImpuestosAcc' },
  { label: 'Después de impuestos %', key: 'netoDespuesImpuestosAcc', pctOf: 'ingresosAcc' }
]

/**
 * Serie P&G con los MISMO defaults del render (`pnlRows`: costo/margen/
 * resultado/impuestos degradan a `null`s; variables a ceros).
 */
function pnlSeriesOf(pnl, key) {
  if (key === 'variables') return pnl.variables || Array.from({ length: 12 }, () => 0)
  return pnl[key] || Array.from({ length: 12 }, () => null)
}

/** Hoja "Resultado (P&G)": filas del modelo P&G (montos crudos + % numéricos). */
function pnlSheet(pnl) {
  const incomeTotal = pnl.ingresos.reduce((acc, value) => acc + value, 0)
  const columns = [
    { key: 'concepto', label: 'Concepto' },
    ...monthColumns(),
    { key: 'total', label: 'Total' }
  ]
  const rows = PNL_EXPORT_ROWS.map((def) => {
    const row = { concepto: def.label }
    const series = pnlSeriesOf(pnl, def.key)
    if (def.pctOf) {
      const base = pnl[def.pctOf]
      for (let m = 0; m < 12; m += 1) row[`m${m}`] = pctExportCell(series[m], base[m])
      // Total del %: Σ anual de la serie sobre Σ anual de ingresos (R-2). El
      // denominador de la base de ingresos siempre es finito (Σ de números).
      row.total = pctExportCell(sumOrNull(series), incomeTotal)
    } else {
      for (let m = 0; m < 12; m += 1) row[`m${m}`] = rawNumber(series[m])
      row.total = rawNumber(sumOrNull(series))
    }
    return row
  })
  return { name: 'Resultado (P&G)', columns, rows }
}

/** Hoja "Acumulado (Ene→Mes)": corrida Ene→Mes; Total = valor de diciembre. */
function acumuladoSheet(pnl) {
  const series = buildAcumuladoSeries(pnl)
  const columns = [
    { key: 'concepto', label: 'Concepto' },
    ...monthColumns(),
    { key: 'total', label: 'Total' }
  ]
  const rows = ACUMULADO_EXPORT_ROWS.map((def) => {
    const row = { concepto: def.label }
    const values = series[def.key]
    if (def.pctOf) {
      // FE-S4C §4.3/E-01: los % corren sobre los ingresos ACUMULADOS del mes;
      // Total = razón sobre los acumulados a diciembre.
      const base = series.ingresosAcc
      for (let m = 0; m < 12; m += 1) row[`m${m}`] = pctExportCell(values[m], base[m])
      row.total = pctExportCell(values[11], base[11])
    } else {
      for (let m = 0; m < 12; m += 1) row[`m${m}`] = rawNumber(values[m])
      row.total = rawNumber(values[11])
    }
    return row
  })
  return { name: 'Acumulado (Ene→Mes)', columns, rows }
}

/**
 * Hojas del tab "Vista Ejecutiva" (FE-S20 §5): P&G + Acumulado (solo con
 * ingresos) + bloques Ingresos/Costo/Gastos fijos/Gastos variables en el
 * orden visual de `ExecutivePivotTable.blocks`.
 * @param {{ scenario: object|(() => object), store: object }} params
 */
export function buildExecutiveSheets({ scenario, store }) {
  const model = createExecutivePivotModel({ scenario, store })
  const sheets = []
  if (model.hasIncomeRows.value) {
    sheets.push(pnlSheet(model.pnl.value))
    sheets.push(acumuladoSheet(model.pnl.value))
  }
  const incomePivot = model.incomePivot.value
  if (incomePivot.rows.length) sheets.push(matrixSheet('Ingresos', incomePivot))
  const costPivot = model.costPivot.value
  if (costPivot && costPivot.rows.length) {
    sheets.push(matrixSheet('Costo de ventas (estimado)', costPivot))
  }
  const expensePivot = model.expensePivot.value
  if (expensePivot.rows.length) sheets.push(matrixSheet('Gastos fijos', expensePivot))
  const variablePivot = model.variablePivot.value
  if (variablePivot) sheets.push(matrixSheet('Gastos variables (calculados)', variablePivot))
  return sheets
}

/* ───────────────────────── Vista Flujo (§5) ─────────────────────────── */

/**
 * Hoja "Resumen de liquidez" (§4.5): Σ Entradas / Σ Salidas / Flujo neto /
 * Flujo acumulado / Bodega estimada. Series fuera-de-año de `ooyColumns` con
 * la MISMA agregación (`buildOoyBucketSeries`); Flujo acumulado y Bodega
 * llevan `null` en Antes/Después (la corrida solo cubre Ene–Dic de N) y su
 * General = Total (§14). **ENMIENDA A-05 (§14)**: orden de columnas
 * `Ene…Dic | Antes | Después de {N} | Total | Total General` con el MISMO
 * gate ooy; `Total` = solo 12 meses (BR-FE21-16) y General = el `*GeneralTotal`
 * del resumen (meses + Antes + Después — BR-FE21-17).
 */
function resumenSheet(resumen, bodegaMes, ooy, scenarioYear) {
  const includeOoy = Boolean(ooy.any) && scenarioYear !== null
  const columns = [{ key: 'concepto', label: 'Concepto' }, ...monthColumns()]
  if (includeOoy) {
    columns.push({ key: 'antes', label: `Antes de ${scenarioYear}` })
    columns.push({ key: 'despues', label: `Después de ${scenarioYear}` })
  }
  columns.push({ key: 'total', label: 'Total' })
  if (includeOoy) columns.push({ key: 'totalGeneral', label: 'Total General' })
  const specs = [
    {
      concepto: 'Σ Entradas',
      months: resumen.entradas,
      total: resumen.entradasTotal,
      general: resumen.entradasGeneralTotal,
      ooyCells: ooy.entradas
    },
    {
      concepto: 'Σ Salidas',
      months: resumen.salidas,
      total: resumen.salidasTotal,
      general: resumen.salidasGeneralTotal,
      ooyCells: ooy.salidas
    },
    {
      concepto: 'Flujo neto',
      months: resumen.neto,
      total: resumen.netoTotal,
      general: resumen.netoGeneralTotal,
      ooyCells: ooy.neto
    },
    {
      concepto: 'Flujo acumulado',
      months: resumen.acumulado,
      total: resumen.acumuladoTotal,
      general: resumen.acumuladoTotal,
      ooyCells: [null, null]
    },
    // FE-S9 §2.6: fila INFORMATIVA (no entra en entradas/salidas/neto).
    {
      concepto: 'Bodega estimada (cierre)',
      months: bodegaMes,
      total: bodegaMes[11],
      general: bodegaMes[11],
      ooyCells: [null, null]
    }
  ]
  const rows = specs.map((spec) => {
    const row = { concepto: spec.concepto }
    spec.months.forEach((value, index) => {
      row[`m${index}`] = rawNumber(value)
    })
    if (includeOoy) {
      row.antes = rawNumber(spec.ooyCells[0])
      row.despues = rawNumber(spec.ooyCells[1])
    }
    row.total = rawNumber(spec.total)
    if (includeOoy) row.totalGeneral = rawNumber(spec.general)
    return row
  })
  return { name: 'Resumen de liquidez', columns, rows }
}

/** Hoja de una cara del arrastre (etiquetas tal como las pinta la vista). */
function carrySheet(title, pivot, carryYear) {
  const columns = [
    { key: 'ceco', label: 'CECO' },
    ...monthColumns(),
    { key: 'total', label: 'Total' }
  ]
  const rows = pivot.rows.map((row) => {
    const out = { ceco: carryRowLabelOf(row, carryYear) }
    row.months.forEach((value, index) => {
      out[`m${index}`] = rawNumber(value)
    })
    out.total = rawNumber(row.total)
    return out
  })
  const footer = { ceco: 'Σ Total' }
  pivot.columnTotals.forEach((value, index) => {
    footer[`m${index}`] = rawNumber(value)
  })
  footer.total = rawNumber(pivot.grandTotal)
  rows.push(footer)
  return { name: title, columns, rows }
}

/**
 * Hojas del tab "Vista Flujo" (FE-S20 §5): resumen + bloques de los pivotes
 * + caras del arrastre, en el orden visual de `CashFlowPivotTable.blocks` /
 * template. Los títulos y banderas `ooy` ESPEJAN los literales del
 * componente (actualizar ambos si cambia el spec). Respeta `ivaMode` (los
 * derivados del modelo ya llevan el gross-up — CA-4).
 * @param {{
 *   scenario: object|(() => object),
 *   financingPrincipalLines: Array|(() => Array),
 *   financingDisbursementLines: Array|(() => Array),
 *   store: object
 * }} params
 */
export function buildFlowSheets({
  scenario,
  financingPrincipalLines,
  financingDisbursementLines,
  store
}) {
  const model = createCashFlowPivotModel({
    scenario,
    financingPrincipalLines,
    financingDisbursementLines,
    store
  })
  const scenarioYear = model.scenarioYear.value
  const ooy = buildOoyBucketSeries({
    disbursement: model.financingDisbursementPivot.value,
    entradas: model.entradasPivot.value,
    fijos: model.fijosPivot.value,
    costes: model.costPaymentsPivot.value,
    internment: model.internmentPaymentsPivot.value,
    principal: model.financingPrincipalPivot.value,
    liquidation: model.settlementPaymentsPivot.value,
    taxFlow: model.taxPaymentsPivot.value,
    // ENMIENDA A-03 (frontend.03_21 §12): buckets reales del bloque variable.
    variables: model.variablesPivot.value
  })
  const hasLines =
    model.lines.value.length > 0 ||
    Boolean(model.financingPrincipalPivot.value) ||
    Boolean(model.financingDisbursementPivot.value)

  const sheets = []
  // El tab muestra el resumen salvo en el estado vacío extremo
  // (`!hasLines && !carryActive`) — mismo guard del template.
  if (hasLines || model.carryActive.value) {
    sheets.push(resumenSheet(model.resumen.value, model.bodegaMes.value, ooy, scenarioYear))
  }
  const blocks = [
    {
      title: 'Entradas - Desembolso de financiación',
      pivot: model.financingDisbursementPivot.value,
      ooy: true
    },
    { title: 'Entradas', pivot: model.entradasPivot.value, ooy: true },
    { title: 'Compras del mes (importaciones)', pivot: model.comprasPivot.value, ooy: false },
    {
      title: 'Salidas — Pago a proveedores (costo de ventas)',
      pivot: model.costPaymentsPivot.value,
      ooy: true
    },
    { title: 'Pago de internación', pivot: model.internmentPaymentsPivot.value, ooy: true },
    {
      title: 'Salidas — Capital de financiación',
      pivot: model.financingPrincipalPivot.value,
      ooy: true
    },
    { title: 'Salidas — Gastos fijos', pivot: model.fijosPivot.value, ooy: true },
    {
      title: 'Salidas — Gastos variables (calculados)',
      pivot: model.variablesPivot.value,
      // ENMIENDA A-03 (frontend.03_21 §12): buckets reales ⇒ hereda Antes/
      // Después en la hoja por `matrixSheet(ooy)` (AC-FE21-16).
      ooy: true
    },
    { title: 'Pago de liquidación de IVA', pivot: model.settlementPaymentsPivot.value, ooy: true },
    {
      title: 'Salidas — Impuestos (planeación tributaria)',
      pivot: model.taxPaymentsPivot.value,
      ooy: true
    }
  ]
  for (const block of blocks) {
    if (block.pivot && block.pivot.rows.length) {
      sheets.push(matrixSheet(block.title, block.pivot, { scenarioYear, ooy: block.ooy }))
    }
  }
  // Arrastre N−1 (FE-S6 §6.1): dos caras; las fechas efectivas siempre ∈ N
  // ⇒ sin columnas fuera-de-año (igual que la vista). Etiquetas con prefijo
  // ← / ⌁ como en pantalla (año real de la fuente si el BE lo trajo).
  const carryover = store.carryover
  const sourceYear = carryover?.source?.budget_year ?? null
  const carryYear = sourceYear ?? (scenarioYear === null ? null : scenarioYear - 1)
  const carryLabelYear = carryYear === null ? 'año anterior' : carryYear
  const carryFaces = [
    { title: 'Cobros de arrastre', pivot: model.cobrosArrastre.value },
    { title: 'Pagos de arrastre', pivot: model.pagosArrastre.value }
  ]
  for (const face of carryFaces) {
    if (face.pivot && face.pivot.rows.length) {
      sheets.push(carrySheet(face.title, face.pivot, carryLabelYear))
    }
  }
  return sheets
}

/* ───────────────────── Editor de Celdas (§5) ─────────────────────────── */

/**
 * Hojas del tab "Editor de Celdas" (FE-S20 §5): una hoja por SECCIÓN del
 * `BudgetLineGrid` (Ingresos/Gastos/Compras) con las columnas del grid en su
 * orden y el modo IVA aplicado (CA-4: flag "Con IVA" solo en Gastos e IVA/
 * Total en Ingresos y Gastos — idéntico a `showFlagColumn`/`showIvaColumns`).
 * Montos crudos; filas en el orden base por sección (el grid arranca sin
 * ordenamiento). Las etiquetas CECO/Temporada salen de los catálogos
 * cacheados (`store.costCenterLabel`/`store.collectionLabel`).
 * @param {{ scenario: object|(() => object), ivaMode: boolean, store: object }} params
 */
export function buildEditorSheets({ scenario, ivaMode, store }) {
  const scenarioValue = typeof scenario === 'function' ? scenario() : scenario
  const lines = Array.isArray(scenarioValue?.budget_lines) ? scenarioValue.budget_lines : []
  const sections = [
    { type: 'income', name: 'Editor — Ingresos' },
    { type: 'expense', name: 'Editor — Gastos' },
    { type: 'purchase', name: 'Editor — Compras' }
  ]
  const sheets = []
  for (const section of sections) {
    const sectionLines = lines.filter((line) => line.line_type === section.type)
    if (!sectionLines.length) continue
    const columns = [
      { key: 'ceco', label: 'CECO', value: (line) => store.costCenterLabel(line.id_cost_center) },
      { key: 'budget_date', label: 'Fecha Proyectada', value: (line) => line.budget_date ?? '' },
      { key: 'payment_date', label: 'Fecha de Pago', value: (line) => line.payment_date ?? '' },
      { key: 'description', label: 'Concepto', value: (line) => line.description ?? '' },
      {
        key: 'line_type',
        label: 'Tipo línea',
        value: (line) => LINE_TYPE_LABELS[line.line_type] ?? line.line_type ?? ''
      },
      {
        key: 'collection',
        label: 'Temporada',
        value: (line) => store.collectionLabel(line.id_collection)
      },
      { key: 'monto', label: 'Monto', value: (line) => rawNumber(line.projected_amount) }
    ]
    if (ivaMode && section.type === 'expense') {
      // Checkbox "Con IVA" (NULL≡True — D-FE14-2): bandera legible, no monto.
      columns.push({
        key: 'conIva',
        label: 'Con IVA',
        value: (line) => (lineChargesIva(line) ? 'Sí' : 'No')
      })
    }
    if (ivaMode && (section.type === 'income' || section.type === 'expense')) {
      columns.push({
        key: 'iva',
        label: 'IVA',
        value: (line) =>
          lineChargesIva(line) ? rawNumber(ivaOf(Number(line.projected_amount), true)) : 0
      })
      columns.push({
        key: 'total',
        label: 'Total',
        value: (line) =>
          lineChargesIva(line)
            ? rawNumber(withIva(Number(line.projected_amount), true))
            : rawNumber(line.projected_amount)
      })
    }
    const rows = sectionLines.map((line) => {
      const row = {}
      for (const column of columns) row[column.key] = column.value(line)
      return row
    })
    sheets.push({
      name: section.name,
      columns: columns.map((column) => ({ key: column.key, label: column.label })),
      rows
    })
  }
  return sheets
}

/* ─────────────────────── Liquidación (§5) ───────────────────────────── */

/**
 * Hoja del tab "Liquidación" (FE-S20 §5): la tabla de períodos del
 * `IvaSettlementPanel` TAL COMO SE RENDERIZA (mismos encabezados en español,
 * misma fila Totales) via el modelo compartido `ivaSettlementModel.js`; el
 * bucket `unassigned` (warning aparte en pantalla) no forma parte de la
 * tabla y no se exporta.
 * @param {{ store: object }} params
 */
export function buildSettlementSheets({ store }) {
  const viewModel = buildIvaSettlementViewModel(store.settlement?.data ?? null)
  if (!viewModel.periodRows.length) return []
  const columns = [
    { key: 'periodo', label: 'P.N.º' },
    { key: 'rango', label: 'Rango' },
    { key: 'vencimiento', label: 'Vencimiento' },
    { key: 'generado', label: 'Generado' },
    { key: 'descontable', label: 'Descontable' },
    { key: 'gastosFijos', label: 'Gastos fijos' },
    { key: 'gastosVariables', label: 'Gastos variables' },
    { key: 'importacion', label: 'Importación' },
    { key: 'internacion', label: 'Internación' },
    { key: 'saldoAnterior', label: 'Saldo anterior' },
    { key: 'base', label: 'Base' },
    { key: 'pago', label: 'Pago' },
    { key: 'arrastre', label: 'Arrastre' }
  ]
  /** Parte descontable por clave literal del BE (`DEDUCTIBLE_KEYS`). */
  const partValue = (row, key) => {
    const part = row.deductibleParts.find((entry) => entry.key === key)
    return part ? part.value : 0
  }
  const rows = viewModel.periodRows.map((row) => ({
    periodo: row.periodNo ?? '',
    rango: `${formatDateEs(row.dateFrom)} – ${formatDateEs(row.dateTo)}${
      row.description ? ` · ${row.description}` : ''
    }`,
    vencimiento: formatDateEs(row.dueDate),
    generado: rawNumber(row.generated),
    descontable: rawNumber(row.deductible),
    gastosFijos: rawNumber(partValue(row, 'fixed_expenses')),
    gastosVariables: rawNumber(partValue(row, 'variable_expenses')),
    importacion: rawNumber(partValue(row, 'import_vat')),
    internacion: rawNumber(partValue(row, 'nationalization_vat')),
    saldoAnterior: rawNumber(row.priorBalance),
    base: rawNumber(row.taxBase),
    pago: rawNumber(row.payment),
    arrastre: rawNumber(row.carryBalance)
  }))
  if (viewModel.totals) {
    // Fila Totales: el objeto `totals` del BE (clave `deductable`, §4.6);
    // las partidas descontables muestran `—` en pantalla ⇒ celdas vacías.
    rows.push({
      periodo: '',
      rango: 'Totales',
      vencimiento: '',
      generado: rawNumber(viewModel.totals.generated),
      descontable: rawNumber(viewModel.totals.deductable),
      gastosFijos: null,
      gastosVariables: null,
      importacion: null,
      internacion: null,
      saldoAnterior: null,
      base: null,
      pago: rawNumber(viewModel.totals.payments),
      arrastre: rawNumber(viewModel.totals.finalBalance)
    })
  }
  return [{ name: 'Liquidación de IVA', columns, rows }]
}

/* ──────────────── Detalle CECO — Causado/Flujo (§5) ─────────────────── */

/**
 * Hoja del tab activo de `CecoDetailView` (RF-8.x): movimientos de la forma
 * común de `cecoMovements.js` YA FILTRADOS por la vista (`filteredLines`,
 * sincronía 1:1 con la tabla), con las columnas de `CecoMovementTable` en su
 * orden y encabezados en español; el monto es el MISMO
 * `movementAmountReconciled` que pinta la pantalla (neto en Causado, según
 * `ivaMode` en Flujo, crudo para capital/desembolsos Y — REVISIÓN 4
 * `frontend.03_19` §11 RF-11.5/AC-17 — monto reconciliado de la línea
 * variable de gasto: `tasa × Σ ingresos fijos del mes de causación`) y la
 * fila final replica el footer "Σ Total de la selección".
 * @param {{
 *   movements: Array<object>,
 *   tab: string,
 *   ivaActive: boolean,
 *   sheetName: string,
 *   fixedIncomeByMonth?: number[]
 * }} params
 */
export function buildCecoSheets({ movements, tab, ivaActive, sheetName, fixedIncomeByMonth }) {
  const list = Array.isArray(movements) ? movements : []
  if (!list.length) return []
  const columns = [
    { key: 'lineNo', label: 'N° línea', value: (m) => m.id_budget_line ?? '' },
    { key: 'categoria', label: 'Cuenta/Categoría', value: (m) => m.cost_component_code ?? '' },
    {
      key: 'tipo',
      label: 'Tipo',
      value: (m) => LINE_TYPE_LABELS[m.line_type] ?? m.line_type ?? ''
    },
    {
      key: 'comportamiento',
      label: 'Comportamiento',
      value: (m) => BEHAVIOR_LABELS[m.behavior_type] ?? m.behavior_type ?? ''
    },
    {
      key: 'origen',
      label: 'Origen',
      value: (m) => SOURCE_KIND_LABELS[m.source_kind ?? 'base'] ?? 'Presupuesto'
    },
    {
      key: 'descripcion',
      label: 'Descripción',
      value: (m) => {
        // La tabla apila descripción + meta del motor (`movementMetaText`);
        // la exportación las une con el mismo separador ' · ' del helper.
        const description = m.description || ''
        const meta = movementMetaText(m)
        if (meta) return description ? `${description} · ${meta}` : meta
        return description
      }
    },
    { key: 'mesCausacion', label: 'Mes de causación', value: (m) => monthLabelOf(m.budget_date) },
    {
      key: 'mesPago',
      label: 'Mes de pago',
      value: (m) => (m.payment_date ? monthLabelOf(m.payment_date) : '')
    },
    {
      key: 'monto',
      label: 'Monto',
      value: (m) => rawNumber(movementAmountReconciled(m, tab, ivaActive, fixedIncomeByMonth))
    }
  ]
  const rows = list.map((movement) => {
    const row = {}
    for (const column of columns) row[column.key] = column.value(movement)
    return row
  })
  // Footer: Σ Total de la selección (mismo acumulado que `CecoMovementTable`).
  let total = 0
  for (const movement of list) {
    const amount = movementAmountReconciled(movement, tab, ivaActive, fixedIncomeByMonth)
    if (Number.isFinite(amount)) total += amount
  }
  rows.push({ lineNo: 'Σ Total de la selección', monto: rawNumber(total) })
  return [
    {
      name: sheetName,
      columns: columns.map((column) => ({ key: column.key, label: column.label })),
      rows
    }
  ]
}
