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
 *    DESC, `setdefault` por línea, primera global = mayor id).
 *  - D-4 (§3.2): tasas cacheadas por sesión en `budgetPlanningStore`
 *    (`ensureCatalogs`), fallo silencioso → `lineCostRatesError`.
 *  - D-5 (§4): orden Ingresos → Costo de ventas → Gastos fijos → Gastos
 *    variables → Resultado (P&G) → Acumulado → Tasas variables.
 *  - D-6/D-7 (§4.2): 8 filas P&G con prefijos (+)/(−)/=, signos positivos,
 *    % sobre ingresos del MES; D-9/D-10/D-11 (§4.3, enmienda E-01): acumulado
 *    Ene→Mes con UNA fila `%` por concepto (`Costo %`, `Gastos %`, `Margen %`)
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
 */
import { computed } from 'vue'
import { useBudgetPlanningStore } from '@/stores/budgetPlanningStore.js'
import {
  BEHAVIOR_LABELS,
  LINE_TYPE_LABELS,
  MONTH_LABELS,
  formatMoney,
  formatVariableRate,
  monthIndexOf
} from './planningFormat.js'

const props = defineProps({
  /** `BudgetFull` + `parent_budget_name` de la caché del store. */
  scenario: { type: Object, required: true }
})

const budgetPlanningStore = useBudgetPlanningStore()

const lines = computed(() =>
  props.scenario && Array.isArray(props.scenario.budget_lines) ? props.scenario.budget_lines : []
)

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
 */
const variablePivot = computed(() => {
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
})

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
 * re-filtra defensivamente aquí. `lineCostRatesError`/`Loaded` diferencian
 * la degradación (§5.1/§5.2) sin disparar jamás un request nuevo (NFR-CY-1).
 */
const activeCostRates = computed(() =>
  (Array.isArray(budgetPlanningStore.lineCostRates)
    ? budgetPlanningStore.lineCostRates
    : []
  ).filter((rate) => rate && rate.is_active === true)
)

/**
 * Resolución por mes (réplica mensual del Q6 de `budgetEngine.get_pnl`):
 * pool vigente al cierre del mes (comparación lexicográfica de ISOs con
 * padding) ordenado por `id_line_cost_rate` DESC → la primera coincidencia
 * de cada línea gana (semántica `setdefault` = mayor id) y la primera
 * coincidencia global (`id_line == null`) es el respaldo (mayor id global).
 */
const monthlyRates = computed(() =>
  monthEndISO.value.map((monthEnd) => {
    const candidates = activeCostRates.value
      .filter(
        (rate) =>
          typeof rate.date_from === 'string' &&
          typeof rate.date_to === 'string' &&
          rate.date_from <= monthEnd &&
          monthEnd <= rate.date_to
      )
      .sort((a, b) => Number(b.id_line_cost_rate ?? 0) - Number(a.id_line_cost_rate ?? 0))
    const byLine = new Map()
    let globalPct = null
    for (const rate of candidates) {
      const pct = Number(rate.cogs_pct)
      if (!Number.isFinite(pct)) continue
      if (rate.id_line === null || rate.id_line === undefined) {
        if (globalPct === null) globalPct = pct
      } else if (!byLine.has(rate.id_line)) {
        byLine.set(rate.id_line, pct)
      }
    }
    return { byLine, globalPct }
  })
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
      const pool = pools[m]
      const pct =
        lineId !== null && pool.byLine.has(lineId) ? pool.byLine.get(lineId) : pool.globalPct
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

/** Celda monetaria derivada: `—` si no estimable (D-8); `·` si 0 (patrón vigente). */
function moneyCell(value) {
  return {
    text: value === null ? '—' : value === 0 ? '·' : formatMoney(value),
    negative: value !== null && value < 0
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
 * `null` (mes del costo sin tasa resuelta, §3.1) — el resto, COP.
 */
function pivotCell(value) {
  return value === null || value === 0 ? '·' : formatMoney(value)
}

/** Total de fila: `·` si el CECO quedó excluido de todo el año (§3.1 regla 4). */
function rowTotal(value) {
  return value === null ? '·' : formatMoney(value)
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
  const gastos = ingresos.map((_, m) => fijos[m] + (variables ? variables[m] : 0))
  const margen = costo ? ingresos.map((value, m) => value - costo[m]) : null
  const resultado = margen ? margen.map((value, m) => value - gastos[m]) : null
  return { ingresos, costo, fijos, variables, gastos, margen, resultado }
})

/**
 * 8 filas exactas de §4.2 en orden; `Margen bruto` y `Resultado operativo`
 * fuertes (`pv-row-strong`); los % corren sobre ingresos del MES (Total:
 * sobre Σ 12) y valen `—` con ingresos 0 o costo degradado (fila fuente `—`).
 */
const pnlRows = computed(() => {
  const { ingresos, costo, fijos, variables, margen, resultado } = pnl.value
  const nulls = Array.from({ length: 12 }, () => null)
  const zeros = Array.from({ length: 12 }, () => 0)
  const costoV = costo || nulls
  const margenV = margen || nulls
  const resultadoV = resultado || nulls
  const variablesV = variables || zeros
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
    pctRow('Resultado %', resultadoV)
  ]
})

/**
 * Acumulado Ene→Mes (§4.3, D-9/D-10/D-11 + enmienda stakeholder E-01):
 * 7 filas — 4 de montos (gastos fijos + variables UNIDOS en una fila, D-9)
 * y UNA fila `%` por concepto inmediatamente debajo del monto que describe
 * (`Costo %`, `Gastos %`, `Margen %`), patrón idéntico a `pnlRows`. Cada
 * celda `%` = concepto ÷ ingresos ACUMULADOS del mismo mes; Total = ratio
 * sobre los acumulados a diciembre (misma columna Total). Columna Total de
 * montos = valor de diciembre (redundancia intencional, `title`
 * aclaratorio). Degradación (§5.1/§5.2): costo/neto y sus filas `%` a `—`;
 * `Gastos %` sigue operativo (su denominador, ingresos acumulados, siempre
 * existe) e ingresos/gastos acumulan igual.
 */
const acumulado = computed(() => {
  const { ingresos, costo, gastos, margen } = pnl.value
  const nulls = Array.from({ length: 12 }, () => null)
  const ingresosAcc = runningSums(ingresos)
  const costoAcc = costo ? runningSums(costo) : nulls
  const gastosAcc = runningSums(gastos)
  const netoAcc = margen ? ingresosAcc.map((value, m) => value - costoAcc[m] - gastosAcc[m]) : nulls

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
    pctRow('Margen %', netoAcc)
  ]
})

/** Nota de cálculo del bloque estimado (los montos no se almacenan). */
const VARIABLE_PIVOT_NOTE =
  'Monto estimado = tasa × ingresos presupuestados del mes. No se almacena en ' +
  'las líneas del escenario; se recalcula al ajustar el presupuesto.'

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

/** Nota al pie del P&G (§4.2) + cierre aritmético del Total (§3.3, R-2). */
const PNL_NOTE =
  'Cifras netas, sin IVA, por causación (budget_date). Ver “Vista Flujo” para liquidez.'
const PNL_TOTAL_NOTE = 'No incluye montos sin fecha de causación asignable.'
const PNL_TOTAL_TITLE = 'Total = Σ de las 12 columnas mensuales del P&G.'

/** Nota del Acumulado (§4.3) y aclaración de la redundancia del Total. */
const ACUMULADO_NOTE =
  'Cada celda acumula de enero a ese mes; los porcentajes corren sobre los ' +
  'ingresos acumulados del mes.'
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
  <div class="pv-zone">
    <p class="pv-note">
      Matriz de <strong>solo lectura</strong> generada desde las líneas del escenario
      {{ scenario.budget_year }}. Los montos se ajustan en “Editor de Celdas”. El costo de ventas se
      ESTIMA con las tasas de Reglas Financieras; no se almacena en las líneas.
    </p>

    <section v-for="block in blocks" :key="block.title" class="pv-block">
      <h4 class="pv-block-title">{{ block.title }}</h4>
      <p v-if="block.note" class="pv-note pv-block-note">{{ block.note }}</p>
      <div v-if="block.pivot && block.pivot.rows.length" class="pv-scroll">
        <table
          class="pv-table"
          :aria-label="block.aria ?? `Pivote ${block.title} por centro de costo y mes`"
        >
          <thead>
            <tr>
              <th class="pv-col-ceco">CECO</th>
              <th v-for="month in MONTH_LABELS" :key="month" class="pv-col-month">{{ month }}</th>
              <th class="pv-col-total">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in block.pivot.rows" :key="row.id">
              <th class="pv-row-label" scope="row" :title="row.title ?? row.label">
                {{ row.label }}
              </th>
              <td v-for="(value, index) in row.months" :key="index" class="pv-cell-money">
                {{ pivotCell(value) }}
              </td>
              <td class="pv-cell-money pv-cell-total">{{ rowTotal(row.total) }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th class="pv-row-label" scope="row">Σ Total</th>
              <td
                v-for="(value, index) in block.pivot.columnTotals"
                :key="index"
                class="pv-cell-money"
              >
                {{ pivotCell(value) }}
              </td>
              <td class="pv-cell-money pv-cell-total">{{ formatMoney(block.pivot.grandTotal) }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p v-else class="pv-empty">{{ block.emptyText }}</p>
      <p v-if="block.warnText" class="pv-warn">{{ block.warnText }}</p>
    </section>

    <section v-if="hasIncomeRows" class="pv-block">
      <h4 class="pv-block-title">Resultado (P&G)</h4>
      <p class="pv-note pv-block-note">{{ PNL_NOTE }}</p>
      <p class="pv-note pv-block-note">{{ PNL_TOTAL_NOTE }}</p>
      <div class="pv-scroll">
        <table class="pv-table" aria-label="Resultado mensual (P&G) del escenario">
          <thead>
            <tr>
              <th class="pv-col-ceco">Concepto</th>
              <th v-for="month in MONTH_LABELS" :key="month" class="pv-col-month">{{ month }}</th>
              <th class="pv-col-total" :title="PNL_TOTAL_TITLE">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in pnlRows" :key="row.label" :class="{ 'pv-row-strong': row.strong }">
              <th class="pv-row-label" scope="row" :title="row.label">{{ row.label }}</th>
              <td
                v-for="(cell, index) in row.cells"
                :key="index"
                class="pv-cell-money"
                :class="{ 'pv-negative': cell.negative }"
              >
                {{ cell.text }}
              </td>
              <td
                class="pv-cell-money pv-cell-total"
                :class="{ 'pv-negative': row.total.negative }"
                :title="PNL_TOTAL_TITLE"
              >
                {{ row.total.text }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="hasIncomeRows" class="pv-block">
      <h4 class="pv-block-title">Acumulado (Ene→Mes)</h4>
      <p class="pv-note pv-block-note">{{ ACUMULADO_NOTE }}</p>
      <div class="pv-scroll">
        <table class="pv-table" aria-label="Montos acumulados de enero a cada mes del escenario">
          <thead>
            <tr>
              <th class="pv-col-ceco">Concepto</th>
              <th v-for="month in MONTH_LABELS" :key="month" class="pv-col-month">{{ month }}</th>
              <th class="pv-col-total" :title="ACUMULADO_TOTAL_TITLE">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in acumulado" :key="row.label" :class="{ 'pv-row-strong': row.strong }">
              <th class="pv-row-label" scope="row" :title="row.label">{{ row.label }}</th>
              <td
                v-for="(cell, index) in row.cells"
                :key="index"
                :class="[
                  row.isPct ? 'pv-cell-pct' : 'pv-cell-money',
                  { 'pv-negative': cell.negative }
                ]"
              >
                {{ cell.text }}
              </td>
              <td
                :class="[
                  row.isPct ? 'pv-cell-pct' : 'pv-cell-money pv-cell-total',
                  { 'pv-negative': row.total.negative }
                ]"
                :title="ACUMULADO_TOTAL_TITLE"
              >
                {{ row.total.text }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="pv-block">
      <h4 class="pv-block-title">Tasas variables (solo lectura)</h4>
      <div v-if="variableLines.length" class="pv-scroll">
        <table class="pv-table pv-table-rates" aria-label="Líneas variables con tasa">
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
              <td class="pv-cell-name" :title="row.ceco">{{ row.ceco }}</td>
              <td class="pv-cell-date">{{ row.fecha || '—' }}</td>
              <td>{{ row.tipoLinea }}</td>
              <td>{{ row.comportamiento }}</td>
              <td class="pv-cell-rate">Tasa {{ row.tasa }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="pv-empty">Este escenario no contiene líneas variables.</p>
    </section>
  </div>
</template>

<style scoped>
.pv-zone {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.pv-note {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-text-secondary, #555555);
}

/* Nota de cálculo dentro de un bloque (p. ej. "Gastos variables (calculados)"). */
.pv-block-note {
  margin: -2px 0 8px;
}

.pv-block-title {
  margin: 0 0 8px;
  font-size: 0.86rem;
  font-weight: 700;
  color: var(--color-text-primary, #070707);
}

.pv-scroll {
  overflow: auto;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 8px;
  background-color: var(--color-surface-card, #ffffff);
  max-height: 60vh;
}

.pv-table {
  min-width: 1240px;
  border: none;
  border-radius: 0;
  box-shadow: none;
  font-size: 0.78rem;
}

.pv-table-rates {
  min-width: 720px;
}

.pv-table thead th {
  position: sticky;
  top: 0;
  z-index: 3;
}

.pv-table tfoot th,
.pv-table tfoot td {
  position: sticky;
  bottom: 0;
  z-index: 2;
  font-weight: 700;
  background-color: var(--color-surface, #f7f7f7);
}

:root[data-theme='dark'] .pv-table tfoot th,
:root[data-theme='dark'] .pv-table tfoot td {
  background-color: rgba(255, 255, 255, 0.05);
}

.pv-col-ceco,
.pv-row-label {
  position: sticky;
  left: 0;
  z-index: 4;
  max-width: 240px;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  background-color: var(--color-surface-card, #ffffff);
}

.pv-table thead .pv-col-ceco {
  z-index: 5;
}

/* `th` pintados sobre fondo claro (esquina CECO, etiquetas de fila y `tfoot`):
 * el `th { color: #ffffff }` global de `main.css` los haría invisibles en
 * tema claro; `--color-text-primary` se adapta solo al tema oscuro. */
.pv-table th.pv-col-ceco,
.pv-table th.pv-row-label {
  color: var(--color-text-primary, #070707);
}

.pv-table tfoot .pv-row-label {
  background-color: var(--color-surface, #f7f7f7);
}

.pv-col-month,
.pv-col-total {
  font-size: 0.72rem;
  font-weight: 600;
}

.pv-cell-money,
.pv-cell-total {
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}

.pv-cell-total {
  font-weight: 600;
}

.pv-cell-date {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.pv-cell-rate {
  font-weight: 600;
  white-space: nowrap;
}

.pv-cell-name {
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

/* ── FE-S4C §6.3: clases nuevas (mismos valores que `cf-negative`, FE-S4B) ── */

/* Filas fuertes del P&G/Acumulado (Margen bruto, Resultado operativo, Neto). */
.pv-row-strong th,
.pv-row-strong td {
  font-weight: 700;
}

/* Filas `%` del Acumulado (§4.3, E-01: una por concepto bajo su monto; antes,
 * fila única consolidada). */
.pv-cell-pct {
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
  color: var(--color-text-secondary, #555555);
}

/* Negativos (margen/resultado/%, neto acumulado) en rojo. Definida DESPUÉS
 * de `.pv-cell-pct` (misma especificidad) para que el rojo gane también en
 * la fila `Margen %` del Acumulado cuando el neto acumulado es negativo. */
.pv-negative {
  color: #c53030;
}

:root[data-theme='dark'] .pv-negative {
  color: #ff9b9b;
}

/* Nota de exclusión (§4.1): borde/fondo ámbar estilo `chip-closed` con texto
 * `--color-text-secondary` (token adaptativo, §6.3) — es información de
 * cobertura, NUNCA un error rojo. */
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
