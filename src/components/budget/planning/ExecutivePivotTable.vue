<script setup>
/**
 * ExecutivePivotTable — "Vista Ejecutiva" READ-ONLY (FE-S4 §8.2 tab 1,
 * extendida por FE-S4C-BUDGET-COSTOS-PYG §4: se agregan 3 secciones).
 *
 * ASM-10: la matriz Ene–Dic NO se importa ni se edita aquí; es presentación
 * agregada EN CLIENTE desde las `budget_lines` del escenario cacheado
 * (misma fuente que el Editor de Celdas → jamás diverge, AC-FE-6). Bloques:
 * Ingresos, Costo de ventas estimado (FE-S4C), Gastos fijos (filas = CECO
 * agrupando todas sus líneas, columnas = Ene–Dic del `budget_year`, celda =
 * Σ del mes, totales por fila/columna), un tercer bloque estimado "Gastos
 * variables (calculados)": cada línea `variable_sales`/`variable_receivables`
 * aporta `tasa × Σ ingresos presupuestados del mes de su `budget_date`
 * (réplica client-side de la regla de `budgetEngine.project_cash_flow`,
 * Opción A), y — tras él — "Resultado (P&G)" y "Acumulado (Ene→Mes)"
 * derivados SOLO de columnas ya computadas (FE-S4C §3.3). Esos montos son
 * DERIVADOS de presentación —no se almacenan en las líneas (BR-CLN-03: las
 * líneas guardan solo tasas)— y se recalculan solos al ajustar ingresos. El
 * detalle por línea se lista además debajo como tabla de tasas de solo
 * lectura.
 *
 * FE-S4C — decisiones normativas (spec `frontend.03_05`):
 *  - D-1: el costo se ESTIMA con las tasas "Costos por Línea" de Reglas
 *    Financieras (`cogs_pct`, escala 0–100 → aporte = ingreso × pct / 100);
 *    rentabilidad objetivo implícita = 100 % − cogs. Nunca se guarda.
 *  - D-2/D-3 (§3.1): resolución mensual línea → global (`id_line === null`)
 *    → exclusión anual con advertencia, evaluada contra el ÚLTIMO DÍA local
 *    de cada mes del `budget_year` (réplica del patrón Q6 de
 *    `budgetEngine.get_pnl`: pool vigente ordenado por `id_line_cost_rate`
 *    DESC, `setdefault` por línea, primera global = mayor id). FE-S7 §4:
 *    ese pool/scan se EXTRAJO a `planningFormat.js`
 *    (`buildCogsRatePool`/`resolveCogsPctByLine`) como fuente única con la
 *    derivación de pago a proveedores de la Vista Flujo — comportamiento
 *    de esta vista idéntico (AC-PYG-1..12).
 *  - D-4 (§3.2): tasas cacheadas por sesión en `budgetPlanningStore`
 *    (`ensureCatalogs`), fallo silencioso → `lineCostRatesError`.
 *  - D-5 (§4, enmienda 2026-10-15 por solicitud stakeholder): orden
 *    Resultado (P&G) → Acumulado (Ene→Mes) → Ingresos → Costo de ventas →
 *    Gastos fijos → Gastos variables → Tasas variables → "Impuesto causado
 *    en P&G" (bloque tributario `ScenarioTaxPnlSection` cierra la vista —
 *    resumen primero, patrón Resumen de liquidez del Flujo).
 *  - D-6/D-7 (§4.2): filas P&G con prefijos (+)/(−)/=, signos positivos,
 *    % sobre ingresos del MES.
 *  - D-9/D-10/D-11 (§4.3, enmienda E-01): acumulado
 *    Ene→Mes con UNA fila `%` por concepto (`Costo %`, `Gastos %`, `Margen %`,
 *    `Impuestos %`, `Después de impuestos %`)
 *    inmediatamente debajo del monto que describe, sobre ingresos acumulados
 *    (patrón idéntico a los % del P&G; cero fila consolidada, cero ARIA
 *    especial por celda — §6.4).
 *  - D-8 (§5): degradación honesta con `—` (nunca costo 0 silencioso);
 *    CECOs sin tasa en ningún mes → `·` + nota `pv-warn` (§4.1).
 *  - R-1 (§10): la resolución MES A MES puede diferir del `cogs.budget` del
 *    P&L de analítica (el motor resuelve al cierre del período) — nota
 *    §4.1: "Comparación mes a mes; puede diferir del P&L de analítica si
 *    las tasas cambian intra-anual."
 *
 * CERO dependencias: tabla HTML nativa + computados (patrón `RatesDataTable`).
 *
 * FE-S18 (spec `frontend.03_18`) — FASE 2, migración al componente compartido
 * `PivotMonthTable`: trio de bloques mensuales (P&G, Acumulado y pivotes por
 * CECO) ahora usan `<colgroup>` explícito + `table-layout: fixed` (RF-1.1..1.4,
 * misma cuadrícula AC-1/AC-2), zebra sutil/total destacado/negativos rojos
 * (RF-6), notas descriptivas de bloque → ícono ⓘ con tooltip `title` (RF-3.2)
 * y la intro "Matriz de solo lectura…" sale de este archivo (RF-4.2: la
 * provee UNA vez a nivel tab `BudgetGridEditor` — Fase 4). Las cifras
 * muestran COP SIN símbolo en formato plain `1.234.567`
 * (`formatMoneyPlain`, RF-7.2) y, cuando el valor no cabe en la columna fija
 * de 106px, compacto con `title` = valor completo (RF-2.2/AC-4). Los
 * computados/salidas numéricas NO cambian (AC-7); los avisos de degradación
 * técnica (`COST_EMPTY_*`, `block.warnText`) siguen visibles con `v-if`
 * (RF-3.3). El detalle de tasas conserva su tabla privada (no es pivote
 * mensual, fuera del grid RF-1).
 *
 * FE-S14-IVA ENMIENDA D-FE14-1/§4.1 — 2026-09-23 (frontend.03_14 D-FE14-7):
 * esta vista es el P&G por causación y NUNCA muestra información de IVA: con
 * el modo "Con IVA" activo o apagado, TODAS sus cifras (bloques Ingresos,
 * Costo de ventas, Gastos fijos/variables, P&G, Acumulado y sus %) quedan
 * SOBRE NETOS, byte-idénticas a FE-S4C (AC-FE14-8). El IVA solo genera efecto
 * en la Vista Flujo (`CashFlowPivotTable`) — cero gross-up aquí.
 */
import { computed } from 'vue'
import { useBudgetPlanningStore } from '@/stores/budgetPlanningStore.js'
import ScenarioTaxPnlSection from '@/components/budget/taxes/ScenarioTaxPnlSection.vue'
import PivotMonthTable from './PivotMonthTable.vue'
import { pnlTaxMonthly, taxCalculationAvailable } from '@/components/budget/taxes/taxPresentation.js'
import {
  BEHAVIOR_LABELS,
  LINE_TYPE_LABELS,
  MONTH_LABELS,
  VARIABLE_PIVOT_NOTE,
  buildCogsRatePool,
  formatMoneyCompact,
  formatMoneyPlain,
  formatVariableRate,
  monthIndexOf,
  resolveCogsPctFromPool
} from './planningFormat.js'

const props = defineProps({
  /** `BudgetFull` + `parent_budget_name` de la caché del store. */
  scenario: { type: Object, required: true }
})

const budgetPlanningStore = useBudgetPlanningStore()

/**
 * Tax expense is read from the same cached calculation used by the tax
 * scenario block. The P&L only places the server-provided result; it never
 * recalculates rates, advances or payment schedules.
 */
const taxPnl = computed(() => {
  const tax = budgetPlanningStore.tax
  if (
    !taxCalculationAvailable(tax.summary) ||
    tax.stale ||
    tax.budgetId !== props.scenario?.id_budget
  ) {
    return null
  }
  return pnlTaxMonthly(tax.summary, props.scenario?.budget_year)
})

const lines = computed(() =>
  props.scenario && Array.isArray(props.scenario.budget_lines) ? props.scenario.budget_lines : []
)

/* ───────── FE-S14-IVA D-FE14-7: sin IVA — la Ejecutiva SIEMPRE NETOS ─────────
 * Decisión de enmienda 2026-09-23: el modo "Con IVA" NO toca esta vista (es el
 * P&G en netos por causación). `budgetPlanningStore.ivaMode` no se lee aquí. */

/** Líneas de costo fijo (base del pivote): `behavior_type === 'fixed'`. */
const fixedLines = computed(() => lines.value.filter((line) => line.behavior_type === 'fixed'))

/** Líneas variables crudas: alimentan el pivote estimado Y la tabla de tasas (§8.2). */
const variableSourceLines = computed(() =>
  lines.value.filter((line) => line.behavior_type !== 'fixed')
)

/** Detalle por línea de las variables: tabla de tasas de solo lectura. */
const variableLines = computed(() => {
  const rows = variableSourceLines.value.map((line) => ({
    id: line.id_budget_line,
    ceco: budgetPlanningStore.costCenterLabel(line.id_cost_center),
    fecha: line.budget_date,
    tipoLinea: LINE_TYPE_LABELS[line.line_type] ?? line.line_type,
    comportamiento: BEHAVIOR_LABELS[line.behavior_type] ?? line.behavior_type,
    tasa: formatVariableRate(line.variable_rate)
  }))
  return rows.sort(
    (a, b) => a.ceco.localeCompare(b.ceco, 'es') || String(a.fecha).localeCompare(String(b.fecha))
  )
})

/**
 * Construye el pivote de un bloque (ingresos o gastos fijos) en una pasada:
 * filas por CECO (agrupa todas sus líneas), columnas Ene–Dic por
 * `monthIndexOf(budget_date)`, totales por fila/columna/bloque. Los montos
 * se suman crudos; el formato COP ocurre al render.
 * @param {string} lineType 'income' | 'expense'
 */
function buildPivot(lineType) {
  const byCeco = new Map()
  const columnTotals = Array.from({ length: 12 }, () => 0)
  let grandTotal = 0

  for (const line of fixedLines.value) {
    if (line.line_type !== lineType) continue
    const amount = Number(line.projected_amount)
    if (!Number.isFinite(amount)) continue

    const key = line.id_cost_center
    if (!byCeco.has(key)) {
      byCeco.set(key, {
        id: key,
        label: budgetPlanningStore.costCenterLabel(key),
        months: Array.from({ length: 12 }, () => 0),
        total: 0
      })
    }
    const row = byCeco.get(key)
    const month = monthIndexOf(line.budget_date)
    if (month >= 0) {
      row.months[month] += amount
      columnTotals[month] += amount
    }
    row.total += amount
    grandTotal += amount
  }

  const rows = [...byCeco.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'))
  return { rows, columnTotals, grandTotal }
}

const incomePivot = computed(() => buildPivot('income'))
const expensePivot = computed(() => buildPivot('expense'))

/**
 * Pivote ESTIMADO de gastos variables (Opción A, réplica client-side de la
 * regla de `budgetEngine.project_cash_flow`): cada línea variable `v` aporta
 * `tasa_v × ingresos del mes de v` a la celda `monthIndexOf(v.budget_date)`,
 * donde `ingresos del mes` se reutiliza de `incomePivot.columnTotals` —
 * misma fuente agregada que el bloque Ingresos → coherencia garantizada y
 * recálculo reactivo gratis al editar montos en el Editor de Celdas.
 * Los montos son DERIVADOS (no se almacenan; ASM-10: la matriz es
 * presentación). `null` si no hay líneas variables o no hay ingresos: el
 * bloque simplemente no se renderiza.
 *
 * FE-S14-IVA D-FE14-7: siempre NETOS — el estimado corre sobre el ingreso
 * neto del mes y no recibe gross-up (la Ejecutiva nunca muestra IVA).
 */
function buildVariablePivot() {
  const source = variableSourceLines.value
  const incomeTotals = incomePivot.value.columnTotals
  if (!source.length || !incomeTotals.some((value) => value !== 0)) return null

  const byCeco = new Map()
  const columnTotals = Array.from({ length: 12 }, () => 0)
  let grandTotal = 0

  for (const line of source) {
    const key = line.id_cost_center
    if (!byCeco.has(key)) {
      byCeco.set(key, {
        id: key,
        label: budgetPlanningStore.costCenterLabel(key),
        months: Array.from({ length: 12 }, () => 0),
        total: 0,
        rates: []
      })
    }
    const row = byCeco.get(key)
    row.rates.push(formatVariableRate(line.variable_rate))

    const month = monthIndexOf(line.budget_date)
    if (month < 0) continue
    const rate = Number(line.variable_rate) || 0
    const amount = rate * incomeTotals[month]
    row.months[month] += amount
    row.total += amount
    columnTotals[month] += amount
    grandTotal += amount
  }

  const rows = [...byCeco.values()]
    .sort((a, b) => a.label.localeCompare(b.label, 'es'))
    .map((row) => ({ ...row, title: `Tasas: ${row.rates.join(' / ')}` }))
  return { rows, columnTotals, grandTotal }
}

/** Pivote estimado — SIEMPRE neto (D-FE14-7: la Ejecutiva nunca muestra IVA). */
const variablePivot = computed(() => buildVariablePivot())

/* ─────────────────── FE-S4C: resolución de tasas de costo (§3.1) ─────────────────── */

/** Guard §5.4: sin CECOs de ingreso no hay nada que estimar ni P&G que cerrar. */
const hasIncomeRows = computed(() => incomePivot.value.rows.length > 0)

/**
 * Último día calendario de cada mes 0–11 del `budget_year` en ISO local
 * `YYYY-MM-DD` (D-3). PROHIBIDO `toISOString()` (corrimiento UTC, patrón
 * `localToday()` de `ratesConfig.js`): se arma con `new Date(year, m + 1, 0)`
 * + padding manual de componentes locales.
 */
const monthEndISO = computed(() => {
  const parsed = Number(props.scenario?.budget_year)
  const year = Number.isFinite(parsed) && parsed > 0 ? parsed : new Date().getFullYear()
  return Array.from({ length: 12 }, (_, month) => {
    const last = new Date(year, month + 1, 0)
    const mm = String(last.getMonth() + 1).padStart(2, '0')
    const dd = String(last.getDate()).padStart(2, '0')
    return `${last.getFullYear()}-${mm}-${dd}`
  })
})

/**
 * Catálogo cacheado (§3.2: el store ya filtra `is_active === true`); se
 * re-filtra defensivamente dentro del resolvedor compartido.
 * `lineCostRatesError`/`Loaded` diferencian la degradación (§5.1/§5.2) sin
 * disparar jamás un request nuevo (NFR-CY-1).
 */
const activeCostRates = computed(() =>
  (Array.isArray(budgetPlanningStore.lineCostRates)
    ? budgetPlanningStore.lineCostRates
    : []
  ).filter((rate) => rate && rate.is_active === true)
)

/**
 * Resolución por mes (réplica mensual del Q6 de `budgetEngine.get_pnl`):
 * FE-S7 §4 extrajo el pool+scan a `buildCogsRatePool`/`resolveCogsPctByLine`
 * en `planningFormat.js` (pool vigente al cierre del mes, comparación
 * lexicográfica de ISOs con padding, orden `id_line_cost_rate` DESC → la
 * primera coincidencia de cada línea gana —semántica `setdefault` = mayor
 * id— y la primera coincidencia global (`id_line == null`) es el respaldo).
 * Aquí queda SOLO el pool por mes, que `costDegradation` consulta para el
 * "¿cubre alguna tasa el año?"; los pct de celda se resuelven con
 * `resolveCogsPctByLine` (misma cadena línea → global → `null`, cero
 * cambio de comportamiento — AC-PYG-1..12 intactos).
 */
const monthlyRates = computed(() =>
  monthEndISO.value.map((monthEnd) => buildCogsRatePool(activeCostRates.value, monthEnd))
)

/**
 * CECO → `id_line` vía el catálogo `costCenters` cacheado. Desconocido o
 * catálogo A5 caído (R-4) ⇒ `null` ⇒ el CECO cae a la tasa global (§3.1).
 * @param {number|null|undefined} idCostCenter
 * @returns {number|null}
 */
function lineIdForCostCenter(idCostCenter) {
  if (idCostCenter === null || idCostCenter === undefined) return null
  const found = budgetPlanningStore.costCenters.find((item) => item.id_cost_center === idCostCenter)
  return typeof found?.id_line === 'number' ? found.id_line : null
}

/**
 * Degradación §5.1/§5.2 (D-8): `'error'` = fetch fallado (sin conexión);
 * `'empty'` = cargadas pero ninguna cubre el `budget_year`; `null` = el
 * costo es estimable. Cuando no es `null`, 4.1 muestra `pv-empty` y
 * P&G/Acumulado pintan `—` en costo/margen/neto y sus % (NUNCA 0).
 */
const costDegradation = computed(() => {
  if (budgetPlanningStore.lineCostRatesError) return 'error'
  if (!budgetPlanningStore.lineCostRatesLoaded) return null
  const covered = monthlyRates.value.some((pool) => pool.globalPct !== null || pool.byLine.size > 0)
  return covered ? null : 'empty'
})

/**
 * Pivote ESTIMADO de costo de ventas (§4.1, D-1/D-2/D-3): filas = mismo
 * CECO/orden de `incomePivot.rows` (lista completa, siempre); celda mes m =
 * `ingreso_m × pct / 100` (⚠️ `cogs_pct` es 0–100, NO 0–1 como
 * `variable_rate`), o `null` (→ `·`) si ese mes no resolvió tasa. CECO sin
 * NI UN mes resuelto ⇒ exclusión anual: `total = null` (→ `·`) y etiqueta a
 * `excludedLabels` (nota `pv-warn`, §3.1 regla 4). `null` si no estimable.
 */
const costPivot = computed(() => {
  if (costDegradation.value || !hasIncomeRows.value) return null
  const pools = monthlyRates.value
  const excludedLabels = []
  const columnTotals = Array.from({ length: 12 }, () => 0)
  let grandTotal = 0

  const rows = incomePivot.value.rows.map((incomeRow) => {
    const lineId = lineIdForCostCenter(incomeRow.id)
    const months = Array.from({ length: 12 }, () => null)
    const pcts = []
    let total = 0
    for (let m = 0; m < 12; m += 1) {
      // FE-S7 §4: la cadena línea → global → `null` vive ahora en el
      // resolvedor compartido (`resolveCogsPctFromPool`, el MISMO cuerpo que
      // usa `resolveCogsPctByLine` en la Vista Flujo) sobre los pools
      // memoizados de `monthlyRates` — resultado idéntico al del scan inline
      // pre-refactor (AC-PYG-1..12), cero rebuilds del catálogo por celda.
      const pct = resolveCogsPctFromPool(pools[m], lineId)
      if (pct === null) continue
      months[m] = (incomeRow.months[m] * pct) / 100
      total += months[m]
      columnTotals[m] += months[m]
      grandTotal += months[m]
      if (!pcts.includes(pct)) pcts.push(pct)
    }
    if (!pcts.length) excludedLabels.push(incomeRow.label)
    return {
      id: incomeRow.id,
      label: incomeRow.label,
      months,
      total: pcts.length ? total : null,
      title: pcts.length
        ? `Tasa(s): ${pcts.map((pct) => `${pctText(pct)} %`).join(', ')}`
        : 'Sin tasa de costo aplicable'
    }
  })

  return { rows, columnTotals, grandTotal, excludedLabels }
})

/* ─────────────── FE-S4C: helpers de formato local (§6.5 — no tocar `planningFormat.js`) ─────────────── */

/**
 * FE-S18 (spec frontend.03_18) RF-7/RF-2.2: UMBRAL de compactación de celda.
 * Con la cuadrícula fija de 106px (RF-1.3) y `formatMoneyPlain`, un monto de
 * ≥ 1.000.000.000 (13 caracteres «1.234.567.890») no cabe en la celda → se
 * muestra compacto (`formatMoneyCompact`) y el valor completo vive en el
 * `title` (AC-4: ninguna información se pierde). `formatMoneyCompact` también
 * abrevia ≥ 1e6 en «1,2 M», pero ese rango SÍ cabe (RF-2.2 solo compacta
 * cuando el render lo pide).
 */
const COMPACT_CELL_THRESHOLD = 1_000_000_000

/** ¿La celda necesita `title` con el valor completo plain? (RF-2.2/AC-4). */
function cellTitle(value) {
  return value !== null && Math.abs(Number(value)) >= COMPACT_CELL_THRESHOLD
    ? formatMoneyPlain(value)
    : null
}

/**
 * Celda monetaria con texto AJUSTADO a la columna fija (RF-7 sin `$` + RF-2.2
 * compacto): full plain cuando cabe, compacto cuando no. El valor completo
 * (`cellTitle`) lo pone el render en el atributo `title`.
 * @param {number|null} value
 */
function fitMoney(value) {
  return Math.abs(Number(value)) >= COMPACT_CELL_THRESHOLD
    ? formatMoneyCompact(value)
    : formatMoneyPlain(value)
}

/**
 * Puro 0–100 → texto con 1 decimal y ceros finales razonables:
 * 62.5 → '62.5', 58.0 → '58' (formato `pvPct`/tooltip §4.1).
 * @param {number} pct
 * @returns {string}
 */
function pctText(pct) {
  return String(Number(pct.toFixed(1)))
}

/**
 * Proporción (0–1 — `x / ingresos`) → `'62.5 %'`; `—` si `null`, `NaN` o
 * `Infinity` (p. ej. denominador ingresos = 0 → el llamador pasa `null`
 * o la división misma da `NaN`). §6.5: `formatVariableRate` NO aplica
 * (recibe 0–1 ya, y aquí la fuente es una división cruda).
 * @param {number|null|undefined} ratio
 * @returns {string}
 */
function pvPct(ratio) {
  const num = Number(ratio)
  if (ratio === null || ratio === undefined || !Number.isFinite(num)) return '—'
  return `${pctText(num * 100)} %`
}

/** Celda monetaria derivada: `—` si no estimable (D-8); `·` si 0 (patrón
 * vigente). FE-S18 RF-7: texto sin `$` con `fitMoney` (plain/compacto) y
 * `title` = valor completo plain cuando la celda quedó compacta (AC-4). */
function moneyCell(value) {
  return {
    text: value === null ? '—' : value === 0 ? '·' : fitMoney(value),
    negative: value !== null && value < 0,
    title: cellTitle(value)
  }
}

/** Σ de las 12 columnas; `null` (→ `—`) si la fuente no es estimable. */
function sumOrNull(values) {
  return values.some((value) => value === null)
    ? null
    : values.reduce((acc, value) => acc + value, 0)
}

/** Corrida acumulada Ene→mes (§4.3). */
function runningSums(values) {
  let acc = 0
  return values.map((value) => (acc += value))
}

/**
 * Celda de los bloques-pivote (Ingresos/Costo/Gastos): `·` para 0 o para
 * `null` (mes del costo sin tasa resuelta, §3.1) — el resto, COP sin símbolo
 * (FE-S18 RF-7, `formatMoneyPlain`).
 */
function pivotCell(value) {
  return value === null || value === 0 ? '·' : fitMoney(value)
}

/** Total de fila: `·` si el CECO quedó excluido de todo el año (§3.1 regla 4). */
function rowTotal(value) {
  return value === null ? '·' : fitMoney(value)
}

/* ─────────────── FE-S4C: Resultado (P&G) y Acumulado — solo de columnas computadas (§3.3) ─────────────── */

/**
 * Base compartida P&G/Acumulado (§3.3): NI ÚNICO re-recorrido de líneas;
 * columnas de los pivots superiores. `costo`/`margen`/`resultado` en `null`
 * (filas completas `—`, D-8) cuando el costo no es estimable. El TOTAL del
 * P&G es Σ de las 12 columnas (cierre aritmético), NO `grandTotal` (R-2).
 */
const pnl = computed(() => {
  const ingresos = incomePivot.value.columnTotals
  const costo = costPivot.value ? costPivot.value.columnTotals : null
  const fijos = expensePivot.value.columnTotals
  const variables = variablePivot.value ? variablePivot.value.columnTotals : null
  const impuestos = taxPnl.value?.months ?? null
  const gastos = ingresos.map((_, m) => fijos[m] + (variables ? variables[m] : 0))
  const margen = costo ? ingresos.map((value, m) => value - costo[m]) : null
  const resultado = margen ? margen.map((value, m) => value - gastos[m]) : null
  const resultadoDespuesImpuestos =
    resultado && impuestos ? resultado.map((value, m) => value - impuestos[m]) : null
  return {
    ingresos,
    costo,
    fijos,
    variables,
    gastos,
    impuestos,
    margen,
    resultado,
    resultadoDespuesImpuestos
  }
})

/**
 * Filas de §4.2 en orden; `Margen bruto`, `Resultado
 * operativo` y `Resultado
 * después de impuestos` fuertes (`pt-row-strong`); los % corren sobre ingresos del MES (Total:
 * sobre Σ 12) y valen `—` con ingresos 0 o costo degradado (fila fuente `—`).
 * FE-S12/S14: % del resultado después de impuestos al final de la cola.
 */
const pnlRows = computed(() => {
  const { ingresos, costo, fijos, variables, impuestos, margen, resultado, resultadoDespuesImpuestos } =
    pnl.value
  const nulls = Array.from({ length: 12 }, () => null)
  const zeros = Array.from({ length: 12 }, () => 0)
  const costoV = costo || nulls
  const margenV = margen || nulls
  const resultadoV = resultado || nulls
  const impuestosV = impuestos || nulls
  const variablesV = variables || zeros
  const resultadoDespuesImpuestosV = resultadoDespuesImpuestos || nulls
  const incomeTotal = ingresos.reduce((acc, value) => acc + value, 0)

  const amountRow = (label, values, strong = false) => ({
    label,
    strong,
    cells: values.map((value) => moneyCell(value)),
    total: moneyCell(sumOrNull(values))
  })
  const pctRow = (label, values) => {
    const cell = (value, base) => {
      const ratio = value === null || base === 0 ? null : value / base
      return { text: pvPct(ratio), negative: ratio !== null && ratio < 0 }
    }
    return {
      label,
      strong: false,
      cells: values.map((value, m) => cell(value, ingresos[m])),
      total: cell(sumOrNull(values), incomeTotal)
    }
  }

  return [
    amountRow('(+) Ingresos', ingresos),
    amountRow('(−) Costo de ventas', costoV),
    amountRow('= Margen bruto', margenV, true),
    pctRow('Margen bruto %', margenV),
    amountRow('(−) Gastos fijos', fijos),
    amountRow('(−) Gastos variables', variablesV),
    amountRow('= Resultado operativo', resultadoV, true),
    pctRow('Resultado %', resultadoV),
    amountRow('(-) Impuestos', impuestosV),
    amountRow('= Resultado después de impuestos', resultadoDespuesImpuestosV, true),
    pctRow('Resultado después de impuestos %', resultadoDespuesImpuestosV)
  ]
})

/**
 * Acumulado Ene→Mes (§4.3, D-9/D-10/D-11 + enmienda stakeholder E-01; cola
 * tributaria añadida FE-S12/S14): filas de montos (gastos fijos + variables
 * UNIDOS en una fila, D-9) y UNA fila `%` por concepto inmediatamente debajo
 * del monto que describe (`Costo %`, `Gastos %`, `Margen %`, `Impuestos %`,
 * `Después de impuestos %`), patrón idéntico a `pnlRows`. Cada
 * celda `%` = concepto ÷ ingresos ACUMULADOS del mismo mes; Total = ratio
 * sobre los acumulados a diciembre (misma columna Total). Columna Total de
 * montos = valor de diciembre (redundancia intencional, `title`
 * aclaratorio). Degradación (§5.1/§5.2): costo/neto y sus filas `%` y la
 * cola tributaria (impuestos + neto después) a `—` (sin tasa, sin cálculo
 * tributario o costo no estimable); `Gastos %` sigue operativo (su
 * denominador, ingresos acumulados, siempre existe) e ingresos/gastos
 * acumulan igual.
 */
const acumulado = computed(() => {
  const { ingresos, costo, gastos, margen, impuestos } = pnl.value
  const nulls = Array.from({ length: 12 }, () => null)
  const ingresosAcc = runningSums(ingresos)
  const costoAcc = costo ? runningSums(costo) : nulls
  const gastosAcc = runningSums(gastos)
  const netoAcc = margen ? ingresosAcc.map((value, m) => value - costoAcc[m] - gastosAcc[m]) : nulls
  // Impuestos por causación (FE-S12/S14): meses diarios de `pnlTaxMonthly`
  // (SIMPLE/Ordinario cierran en diciembre; ICA en su mes de liquidación).
  // Sin cálculo tributario ejecutado (`impuestos` null) toda la cola
  // tributaria degrada a `—` (patrón D-8 del costo).
  const impuestosAcc = impuestos ? runningSums(impuestos) : nulls
  const netoDespuesImpuestosAcc = impuestos
    ? impuestosAcc.map((value, m) => (netoAcc[m] === null ? null : netoAcc[m] - value))
    : nulls

  const amountRow = (label, values, strong = false) => ({
    label,
    strong,
    isPct: false,
    cells: values.map((value) => moneyCell(value)),
    total: moneyCell(values[11])
  })

  /** Fila `%` de §4.3/E-01 (mismo constructor que los % del P&G): `—` con
   * ingresos acumulados 0 o valor no estimado (`null`); `Costo %`/`Gastos %`
   * jamás disparan el flag negativo, pero corren por la misma lógica. */
  const pctRow = (label, values) => {
    const cell = (value, base) => {
      const ratio = value === null || base === 0 ? null : value / base
      return { text: pvPct(ratio), negative: ratio !== null && ratio < 0 }
    }
    return {
      label,
      strong: false,
      isPct: true,
      cells: values.map((value, m) => cell(value, ingresosAcc[m])),
      total: cell(values[11], ingresosAcc[11])
    }
  }

  return [
    amountRow('(+) Ingresos acumulados', ingresosAcc),
    amountRow('(−) Costo de ventas acumulado', costoAcc),
    pctRow('Costo %', costoAcc),
    amountRow('(−) Gastos acumulados', gastosAcc),
    pctRow('Gastos %', gastosAcc),
    amountRow('= Neto acumulado', netoAcc, true),
    pctRow('Margen %', netoAcc),
    amountRow('(−) Impuestos acumulados', impuestosAcc),
    pctRow('Impuestos %', impuestosAcc),
    amountRow('= Neto después de impuestos acumulado', netoDespuesImpuestosAcc, true),
    pctRow('Después de impuestos %', netoDespuesImpuestosAcc)
  ]
})

/** Nota de cálculo del bloque estimado — FE-S18 RF-4.2: ahora se importa de
 * `planningFormat.js` (ÚNICA definición, compartida con la Vista Flujo);
 * en esta vista solo se muestra como tooltip ⓘ (RF-3.2). */

/* ─────────────── FE-S4C: textos normativos de notas (§4/§5, literal de spec) ─────────────── */

/** Nota del bloque 4.1: derivación (§4.1) + divergencia R-1 (§10), en un párrafo. */
const COST_BLOCK_NOTE =
  'Estimación derivada: ingresos presupuestados × tasa de costo vigente de la ' +
  'línea (o global). No se almacena en las líneas; se recalcula al editar ingresos ' +
  'o tasas. Comparación mes a mes; puede diferir del P&L de analítica si las tasas ' +
  'cambian intra-anual.'

/** Mensajes exactos de degradación §5.1 (sin tasas vigentes) y §5.2 (fetch fallido). */
const COST_EMPTY_NO_RATES =
  'No hay tasas de costo vigentes. Defínalas en Reglas Financieras → Costos por ' +
  'Línea para estimar el costo de ventas.'
const COST_EMPTY_ERROR =
  'No fue posible cargar las tasas de costo (sin conexión). Reintente recargando la página.'

/** Notas descriptivas del P&G — FE-S18 RF-3.2: ahora viven en el ícono ⓘ
 * junto al subtítulo del bloque (tip tooltip nativo `title`), no como texto
 * visible (RF-3.1/RF-4.1: la intro de la pestaña se provee a nivel tab —
 * Fase 4 — y el texto entra en el máximo de RF-3.4).
 * Nota al pie del P&G (§4.2) + aclaración del Total (§3.3, R-2). */
const PNL_NOTE =
  'Cifras netas, sin IVA, por causación (budget_date). Impuestos causados vienen del cálculo tributario; ver “Vista Flujo” para liquidez.'
const PNL_TOTAL_NOTE = 'No incluye montos sin fecha de causación asignable.'
const PNL_TOTAL_TITLE = 'Total = Σ de las 12 columnas mensuales del P&G.'

/** Nota del Acumulado (§4.3) y aclaración de la redundancia del Total. */
const ACUMULADO_NOTE =
  'Cada celda acumula de enero a ese mes; los porcentajes corren sobre los ' +
  'ingresos acumulados del mes. Impuestos por causación del cálculo tributario; ' +
  'sin cálculo ejecutado se muestran en «—».'
const ACUMULADO_TOTAL_TITLE = 'Total = acumulado a diciembre (Ene→Dic): repite la última columna.'

/** Nota de exclusión §4.1 (ámbar `pv-warn`, nunca roja: es dato, no error). */
const costWarnText = computed(() => {
  const pivot = costPivot.value
  if (!pivot || !pivot.excludedLabels.length) return ''
  return `Sin tasa de costo aplicable (no se estimó costo): ${pivot.excludedLabels.join(', ')}`
})

/**
 * Bloques del template (§8.2 + D-5/§4: Ingresos → Costo de ventas →
 * Gastos fijos → Gastos variables). El bloque de costo se omite por
 * completo sin filas de ingreso (§5.4) y degrada a `pv-empty` con el
 * mensaje exacto §5.1/§5.2 cuando la resolución no está disponible.
 * FE-S14-IVA D-FE14-7: TODOS los bloques leen los pivotes NETOS — el modo
 * "Con IVA" no altera esta vista (el IVA solo genera efecto en el Flujo).
 */
const blocks = computed(() => {
  const list = [
    {
      title: 'Ingresos',
      emptyText: 'Sin líneas fijas de ingresos en este escenario.',
      pivot: incomePivot.value
    }
  ]
  if (hasIncomeRows.value) {
    list.push({
      title: 'Costo de ventas (estimado)',
      aria: 'Costo de ventas estimado por centro de costo y mes',
      note: COST_BLOCK_NOTE,
      emptyText: costDegradation.value === 'error' ? COST_EMPTY_ERROR : COST_EMPTY_NO_RATES,
      warnText: costWarnText.value,
      pivot: costPivot.value
    })
  }
  list.push({
    title: 'Gastos fijos',
    emptyText: 'Sin líneas fijas de gastos fijos en este escenario.',
    pivot: expensePivot.value
  })
  if (variablePivot.value) {
    list.push({
      title: 'Gastos variables (calculados)',
      emptyText: 'Sin líneas de gastos variables en este escenario.',
      pivot: variablePivot.value,
      note: VARIABLE_PIVOT_NOTE
    })
  }
  return list
})
</script>

<template>
  <!-- FE-S18 RF-4.2/RF-3.1: la intro "Matriz de solo lectura…" ya NO vive
       aquí — se provee UNA VEZ a nivel tab en BudgetGridEditor (Fase 4). -->
  <div class="pv-zone">
    <section v-if="hasIncomeRows" class="pv-block">
      <h4 class="pv-block-title">
        Resultado (P&G)
        <!-- RF-3.2: notas descriptivas → ícono ⓘ con tooltip nativo. -->
        <span class="pv-info" :title="`${PNL_NOTE} ${PNL_TOTAL_NOTE}`">ⓘ</span>
      </h4>
      <PivotMonthTable
        label-header="Concepto"
        :month-labels="MONTH_LABELS"
        aria-label="Resultado mensual (P&G) del escenario"
        :total-title="PNL_TOTAL_TITLE"
      >
        <tr v-for="row in pnlRows" :key="row.label" :class="{ 'pt-row-strong': row.strong }">
          <th class="pt-row-label" scope="row" :title="row.label">{{ row.label }}</th>
          <td
            v-for="(cell, index) in row.cells"
            :key="index"
            class="pt-cell-money"
            :class="{ 'pt-negative': cell.negative }"
            :title="cell.title"
          >
            {{ cell.text }}
          </td>
          <td
            class="pt-cell-money pt-cell-total"
            :class="{ 'pt-negative': row.total.negative }"
            :title="row.total.title ?? PNL_TOTAL_TITLE"
          >
            {{ row.total.text }}
          </td>
        </tr>
      </PivotMonthTable>
    </section>

    <section v-if="hasIncomeRows" class="pv-block">
      <h4 class="pv-block-title">
        Acumulado (Ene→Mes)
        <span class="pv-info" :title="ACUMULADO_NOTE">ⓘ</span>
      </h4>
      <PivotMonthTable
        label-header="Concepto"
        :month-labels="MONTH_LABELS"
        aria-label="Montos acumulados de enero a cada mes del escenario"
        :total-title="ACUMULADO_TOTAL_TITLE"
      >
        <tr v-for="row in acumulado" :key="row.label" :class="{ 'pt-row-strong': row.strong }">
          <th class="pt-row-label" scope="row" :title="row.label">{{ row.label }}</th>
          <td
            v-for="(cell, index) in row.cells"
            :key="index"
            :class="[
              row.isPct ? 'pt-cell-pct' : 'pt-cell-money',
              { 'pt-negative': cell.negative }
            ]"
            :title="cell.title"
          >
            {{ cell.text }}
          </td>
          <td
            :class="[
              row.isPct ? 'pt-cell-pct' : 'pt-cell-money pt-cell-total',
              { 'pt-negative': row.total.negative }
            ]"
            :title="row.isPct ? ACUMULADO_TOTAL_TITLE : (row.total.title ?? ACUMULADO_TOTAL_TITLE)"
          >
            {{ row.total.text }}
          </td>
        </tr>
      </PivotMonthTable>
    </section>

    <!-- D-FE14-7: sin chip de modo IVA — esta vista SIEMPRE muestra netos. -->

    <section v-for="block in blocks" :key="block.title" class="pv-block">
      <h4 class="pv-block-title">
        {{ block.title }}
        <!-- RF-3.2: la nota descriptiva del bloque (COST_BLOCK_NOTE /
             VARIABLE_PIVOT_NOTE) pasa a tooltip ⓘ; los avisos de
             degradación técnica (v-else / warnText) SIGUEN visibles con
             `v-if` (RF-3.3). -->
        <span v-if="block.note" class="pv-info" :title="block.note">ⓘ</span>
      </h4>
      <PivotMonthTable
        v-if="block.pivot && block.pivot.rows.length"
        label-header="CECO"
        :month-labels="MONTH_LABELS"
        :aria-label="block.aria ?? `Pivote ${block.title} por centro de costo y mes`"
      >
        <tr v-for="row in block.pivot.rows" :key="row.id">
          <th class="pt-row-label" scope="row" :title="row.title ?? row.label">
            {{ row.label }}
          </th>
          <td
            v-for="(value, index) in row.months"
            :key="index"
            class="pt-cell-money"
            :title="cellTitle(value)"
          >
            {{ pivotCell(value) }}
          </td>
          <td class="pt-cell-money pt-cell-total" :title="cellTitle(row.total)">
            {{ rowTotal(row.total) }}
          </td>
        </tr>
        <template #tfoot>
          <tr>
            <th class="pt-row-label" scope="row">Σ Total</th>
            <td
              v-for="(value, index) in block.pivot.columnTotals"
              :key="index"
              class="pt-cell-money"
              :title="cellTitle(value)"
            >
              {{ pivotCell(value) }}
            </td>
            <td class="pt-cell-money pt-cell-total" :title="cellTitle(block.pivot.grandTotal)">
              {{ pivotCell(block.pivot.grandTotal) }}
            </td>
          </tr>
        </template>
      </PivotMonthTable>
      <p v-else class="pv-empty">{{ block.emptyText }}</p>
      <p v-if="block.warnText" class="pv-warn">{{ block.warnText }}</p>
    </section>

    <section class="pv-block">
      <h4 class="pv-block-title">Tasas variables (solo lectura)</h4>
      <!-- Tabla propia del detalle de tasas (NO es pivote mensual): conserva
           su grid privada, sin la cuadrícula de meses de RF-1. -->
      <div v-if="variableLines.length" class="rates-scroll">
        <table class="rates-table" aria-label="Líneas variables con tasa">
          <thead>
            <tr>
              <th>CECO</th>
              <th>Fecha</th>
              <th>Tipo línea</th>
              <th>Comportamiento</th>
              <th>Tasa</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in variableLines" :key="row.id">
              <td class="rates-cell-name" :title="row.ceco">{{ row.ceco }}</td>
              <td class="rates-cell-date">{{ row.fecha || '—' }}</td>
              <td>{{ row.tipoLinea }}</td>
              <td>{{ row.comportamiento }}</td>
              <td class="rates-cell-rate">Tasa {{ row.tasa }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="pv-empty">Este escenario no contiene líneas variables.</p>
    </section>

    <!-- Impuesto causado en P&G (FE-S12/S14): al FINAL de la vista por decisión
         stakeholder 2026-10-15 — el resumen P&G/Acumulado manda arriba, el
         bloque tributario cierra la página. -->
    <ScenarioTaxPnlSection :scenario="scenario" />
  </div>
</template>

<style scoped>
.pv-zone {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.pv-block-title {
  margin: 0 0 8px;
  font-size: 0.86rem;
  font-weight: 700;
  color: var(--color-text-primary, #070707);
}

/* FE-S18 RF-3.2: ícono ⓘ de nota descriptiva junto al subtítulo del bloque
 * (tooltip nativo `title`). Disco gris con cursor help — texto estático,
 * nunca interacción; los avisos de degradación (pv-empty/pv-warn) siguen
 * visibles con `v-if` (RF-3.3). */
.pv-info {
  margin-left: 6px;
  font-size: 0.8rem;
  font-weight: 400;
  color: var(--color-text-muted, #8a8a8a);
  cursor: help;
}

/* FE-S18 RF-2.1: el markup/estilos de las tablas pivote (scroll, colgroup,
 * sticky, zebra, totales, negativos) viven EN `PivotMonthTable.vue` (clases
 * `pt-*`) — aquí solo queda la tabla propia del detalle de tasas, que NO es
 * pivote mensual y conserva su grid privada. */
.rates-scroll {
  overflow: auto;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 8px;
  background-color: var(--color-surface-card, #ffffff);
  max-height: 60vh;
}

.rates-table {
  min-width: 720px;
  border: none;
  border-radius: 0;
  box-shadow: none;
  font-size: 0.78rem;
}

.rates-table thead th {
  position: sticky;
  top: 0;
  z-index: 3;
  background-color: var(--dark-color, #1a202c);
}

.rates-cell-date {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.rates-cell-rate {
  font-weight: 600;
  white-space: nowrap;
}

.rates-cell-name {
  max-width: 260px;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pv-empty {
  margin: 0;
  padding: 14px;
  border: 1px dashed var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 8px;
  font-size: 0.8rem;
  color: var(--color-text-muted, #8a8a8a);
  text-align: center;
}

/* Nota de exclusión (§4.1): borde/fondo ámbar estilo `chip-closed` con texto
 * `--color-text-secondary` (token adaptativo, §6.3) — es información de
 * cobertura, NUNCA un error rojo. RF-3.3: sigue VISIBLE con `v-if`. */
.pv-warn {
  margin: 8px 0 0;
  padding: 8px 12px;
  border: 1px solid rgba(180, 83, 9, 0.4);
  border-radius: 8px;
  background-color: rgba(245, 158, 11, 0.1);
  font-size: 0.78rem;
  color: var(--color-text-secondary, #555555);
}
</style>
