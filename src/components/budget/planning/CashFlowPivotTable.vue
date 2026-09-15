<script setup>
/**
 * CashFlowPivotTable — "Vista Flujo" READ-ONLY (FE-S4B-BUDGET-FLUJO §4/§5).
 *
 * Tercer tab del detalle de escenario (D-1: Ejecutiva → Flujo → Editor):
 * perspectiva de LIQUIDEZ de la matriz CECO × Ene–Dic — cuándo entra y sale
 * el efectivo. 100 % client-side desde `props.scenario.budget_lines` (D-2,
 * misma caché que Editor/Ejecutiva → AC-FE-6, cero HTTP, NFR-FV-2).
 *
 * Reglas de ubicación del mes (D-3/D-5):
 *  - Entradas  (income + fixed)  → `cfMonth(line) = payment_date || budget_date`
 *    (mes de cobro, no de causación).
 *  - Salidas fijos (expense + fixed) → mismo `cfMonth` (réplica del motor).
 *  - Salidas variables (expense, behavior != fixed) → DERIVADOS:
 *    `variable_rate × Σ ingresos fijos causados del mes` con el mes por
 *    `budget_date` (causación; fórmula idéntica a la "Opción A" de
 *    `ExecutivePivotTable.variablePivot`, base agregada aparte por
 *    `monthIndexOf(budget_date)`).
 *  - `monthIndexOf(...) === -1` ⇒ la celda mensual no se puebla, pero el
 *    monto SÍ suma al total anual de la fila y al grandTotal (idéntico a
 *    `ExecutivePivotTable.buildPivot`).
 *
 * R-1 (divergencia intencional, §10): los INGRESOS se ubican por
 * `payment_date` mientras `budgetEngine.project_cash_flow` los ubica por
 * `budget_date`; fijos y variables sí replican al motor. Mitigación: nota
 * §5.3 del template. Sin gross-up de IVA en v1 (D-4, nota al pie del bloque
 * Entradas); sin tabla de tasas (D-7: exclusiva de Ejecutiva); sin gráficas
 * ni deps nuevas (D-8).
 *
 * CERO dependencias: tabla HTML nativa + computados (patrón hermano
 * `ExecutivePivotTable`); CSS scoped propio prefijo `cf-*` (§5.4).
 *
 * FE-S6-CARRYOVER (aditivo, dos componentes):
 *  - B (arrastre): bloque "Saldos de {N−1} (arrastre)" con pivotes hermanos
 *    construidos SOLO desde `budgetPlanningStore.carryover.lines` (server ya
 *    filtró fijas ∈ N — BR-CO-03; el mes usa la MISMA fecha efectiva que
 *    `cfMonth`). Entra a las SUMAS del resumen (entradas/salidas += cobros/
 *    pagos de arrastre ANTES de neto/acumulado) pero NUNCA a Σ cabecera,
 *    Editor, Ejecutiva ni P&G (SD6-4). Con flag OFF o `lines: []`: cero DOM
 *    nuevo y resumen byte-idéntico a FE-S4B (AC-S6-FE-6).
 *  - C (fuera de año): `buildPivot` extiende cada fila con `before`/`after`
 *    (fecha efectiva `< 01/01/N` / `> 31/12/N`; año del string ISO, patrón
 *    `monthIndexOf`) y el bloque con `beforeTotal/afterTotal/
 *    beforeAfterRowCount`. Con toggle OFF (default, ref de sesión FD6-1) las
 *    celdas/totales son EXACTAMENTE los de hoy (output FE-S4B intacto) y un
 *    chip `⊘ {k} filas con montos fuera de año` revela el pendiente; con
 *    toggle ON los montos fuera-de-año SALEN de su celda mensual hacia las
 *    columnas extra "Antes/Después de {N}", y el pie "Σ meses + fuera de año
 *    = total anual" reconcilia exacto (Q4=4 — nunca mentirle al banquero).
 *    Las columnas van en los dos pivotes propios construidos con
 *    `buildPivot` (Entradas y Salidas fijos); el bloque variable deriva de
 *    causaciones dentro de N (sus fechas `budget_date` son ∈ N por
 *    BR-LINE-04/BR-ING) ⇒ before/after ≡ 0: no lleva columnas ni chip.
 *
 * FE-S7-COGS-PAYFLOW (aditivo, spec `frontend.03_10` §5): bloque derivado
 *  "Salidas — Pago a proveedores (costo de ventas)" — filas por CECO DE
 *  INGRESO × mes de PAGO de cada cuota. Por ingreso fijo propio:
 *  `pct = resolveCogsPctByLine(lineCostRates, id_line(CECO),
 *  monthEnd(budget_date))` (MISMO resolvedor compartido de la Ejecutiva,
 *  §4 → cero divergencia de tasa); `costo = monto × pct/100` (crudo, sin
 *  redondeo); términos de la Línea (`payableTermsByLine`, orden D-7): con
 *  términos ⇒ una cuota `costo × payment_pct` en `budget_date +
 *  payment_days` (`addDaysISO` string-based, cruza mes/año/bisiesto); SIN
 *  términos ⇒ cuota única 100 % en la ancla `budget_date` (D-S7-4). Ancla =
 *  `budget_date` del ingreso (D-S7-5). Reacciona EN VIVO al PUT de celda
 *  (todo cuelga de `props.scenario.budget_lines` + getters del store —
 *  AC-S7-FE-2, NFR-S7-FE-1, cero refetch). `ooy: true` con buckets propios
 *  (término −60 sobre enero ⇒ columna "Antes de N", AC-S7-FE-4). Entra al
 *  resumen (`salidas[m] +=` al mismo punto que el arrastre, antes de
 *  neto/acumulado; nunca a Σ cabecera/P&G — espejo SD6-4). Cortocircuito
 *  honesto: catálogo de términos caído (`payableTermsError`) ⇒ bloque NO
 *  renderizado + nota ámbar bajo el resumen (§5). Con filas `origin:"cogs"`
 *  del carryover (BE-S7 §4), las tablas de arrastre ganan el prefijo
 *  "⌁ Costo {N−1}" + tooltip propio en esas cuotas (material intacto);
 *  payloads sin `origin` (o sin ninguna cuota derivada) producen un DOM
 *  idéntico a FE-S6 (AC-S7-FE-8).
 */
import { computed, ref } from 'vue'
import { useBudgetPlanningStore } from '@/stores/budgetPlanningStore.js'
import { MONTH_LABELS, formatMoney, monthIndexOf, resolveCogsPctByLine } from './planningFormat.js'

const props = defineProps({
  /** `BudgetFull` + `parent_budget_name` de la caché del store. */
  scenario: { type: Object, required: true }
})

const budgetPlanningStore = useBudgetPlanningStore()

const lines = computed(() =>
  props.scenario && Array.isArray(props.scenario.budget_lines) ? props.scenario.budget_lines : []
)

/** Vacío extremo (§5.3): sin ninguna línea → único mensaje, ni tablas ni resumen. */
const hasLines = computed(() => lines.value.length > 0)

/** Mes de cobro/pago (D-3): `payment_date` con fallback a `budget_date` (R-1). */
const cfMonth = (line) => monthIndexOf(line.payment_date || line.budget_date)

/**
 * Fecha EFECTIVA de una línea (fuente idéntica a `cfMonth`, §6.2): con ella
 * se decide el bucket fuera-de-año y la columna del arrastre.
 */
const effectiveDateOf = (line) => line.payment_date || line.budget_date

/** Año N del escenario (base de los buckets; `null` si no es entero). */
const scenarioYear = computed(() => {
  const year = Number(props.scenario?.budget_year)
  return Number.isInteger(year) ? year : null
})

/** N−1: año de la fuente del arrastre (etiquetas §5/§6.1). */
const carrySourceYear = computed(() =>
  scenarioYear.value === null ? null : scenarioYear.value - 1
)

/**
 * Toggle de sesión del bloque C (FD6-1, default OCULTAS — Q4=4): con ON, los
 * montos con fecha efectiva fuera de N se RETIRAN de su celda mensual y se
 * muestran en las columnas "Antes/Después de {N}" (reconciliación exacta);
 * con OFF la matriz es literalmente la de FE-S4B hoy (chip aparte). No se
 * persiste: cada visita al escenario arranca colapsada.
 */
const showOutOfYear = ref(false)

/**
 * Bucket fuera-de-año de una fecha efectiva (§6.2): `-1` antes del 01/01/N,
 * `+1` después del 31/12/N, `0` dentro de N o indeterminable. El año se
 * extrae del string ISO con regex (patrón `monthIndexOf`: sin `new Date`
 * para fechas puras, fallback a `Date` solo en otro formato) — NUNCA por
 * comparación de `Date` (corrimiento UTC).
 */
function outOfYearBucket(value) {
  const yearN = scenarioYear.value
  if (!value || yearN === null) return 0
  let year
  const plain = String(value).match(/^(\d{4})-/)
  if (plain) {
    year = Number(plain[1])
  } else {
    const date = new Date(value)
    year = Number.isNaN(date.getTime()) ? null : date.getFullYear()
  }
  if (year === null) return 0
  if (year < yearN) return -1
  if (year > yearN) return 1
  return 0
}

/**
 * Pivote genérico de un bloque: filas = CECO (agrupa todas sus líneas, orden
 * `localeCompare(..., 'es')`), columnas Ene–Dic según `monthOf(line)`, celda
 * = Σ `projected_amount` crudos (no finitos se ignoran), totales por
 * fila/columna/bloque. El total de fila es ANUAL: montos con mes no
 * ubicable (-1) suman a `row.total`/`grandTotal` aunque no pueblen celda
 * alguna (criterio idéntico a ExecutivePivotTable).
 *
 * FE-S6 §6.2 (aditivo): cada fila gana `before`/`after` (Σ de montos con
 * fecha efectiva `< 01/01/N` / `> 31/12/N`) y el bloque `beforeTotal`,
 * `afterTotal` y `beforeAfterRowCount` (filas con |before|+|after| > 0 → la
 * `k` del chip). `row.total`/`grandTotal` NO cambian jamás de semántica: el
 * bucket solo hace VISIBLE de dónde viene lo que ya sumaba. Con toggle OFF
 * cada monto sigue poblando su celda mensual exactamente como hoy; con ON los
 * fuera-de-año se retiran de la celda hacia sus columnas (así
 * Σ meses + fuera = total anual es EXACTO, AC-S6-FE-4).
 * @param {(line: object) => boolean} match Filtro de líneas del bloque.
 * @param {(line: object) => number} monthOf Función de ubicación mensual.
 */
function buildPivot(match, monthOf) {
  const byCeco = new Map()
  const columnTotals = Array.from({ length: 12 }, () => 0)
  let grandTotal = 0

  for (const line of lines.value) {
    if (!match(line)) continue
    const amount = Number(line.projected_amount)
    if (!Number.isFinite(amount)) continue

    const key = line.id_cost_center
    if (!byCeco.has(key)) {
      byCeco.set(key, {
        id: key,
        label: budgetPlanningStore.costCenterLabel(key),
        months: Array.from({ length: 12 }, () => 0),
        total: 0,
        before: 0,
        after: 0
      })
    }
    const row = byCeco.get(key)
    const month = monthOf(line)
    const bucket = outOfYearBucket(effectiveDateOf(line))
    // OFF ⇒ celda igual que hoy; ON ⇒ el fuera-de-año vive solo en su columna.
    if (month >= 0 && (bucket === 0 || !showOutOfYear.value)) {
      row.months[month] += amount
      columnTotals[month] += amount
    }
    if (bucket === -1) row.before += amount
    else if (bucket === 1) row.after += amount
    row.total += amount
    grandTotal += amount
  }

  const rows = [...byCeco.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'))
  let beforeTotal = 0
  let afterTotal = 0
  let beforeAfterRowCount = 0
  for (const row of rows) {
    beforeTotal += row.before
    afterTotal += row.after
    if (Math.abs(row.before) + Math.abs(row.after) > 0) beforeAfterRowCount += 1
  }
  return { rows, columnTotals, grandTotal, beforeTotal, afterTotal, beforeAfterRowCount }
}

/** Bloque "Entradas" (§4.2): ingresos fijos por fecha de pago (D-3, R-1). */
const entradasPivot = computed(() =>
  buildPivot((line) => line.line_type === 'income' && line.behavior_type === 'fixed', cfMonth)
)

/** Bloque "Salidas — Gastos fijos" (§4.2): gastos fijos por fecha de pago. */
const fijosPivot = computed(() =>
  buildPivot((line) => line.line_type === 'expense' && line.behavior_type === 'fixed', cfMonth)
)

/**
 * Base del bloque variable (D-5): Σ ingresos fijos por MES DE CAUSACIÓN
 * (`monthIndexOf(budget_date)`) — agregación SEPARADA del bloque Entradas
 * (que usa payment date), para replicar numéricamente el `incomePivot.
 * columnTotals` que consume la Vista Ejecutiva (AC-VF-6).
 */
const baseIngresosCausados = computed(() => {
  const base = Array.from({ length: 12 }, () => 0)
  for (const line of lines.value) {
    if (line.line_type !== 'income' || line.behavior_type !== 'fixed') continue
    const amount = Number(line.projected_amount)
    if (!Number.isFinite(amount)) continue
    const month = monthIndexOf(line.budget_date)
    if (month >= 0) base[month] += amount
  }
  return base
})

/** Líneas de gasto variables (origen crudo del bloque estimado). */
const variableSourceLines = computed(() =>
  lines.value.filter((line) => line.line_type === 'expense' && line.behavior_type !== 'fixed')
)

/**
 * Pivote ESTIMADO de gastos variables (D-5, réplica de la "Opción A" de
 * `ExecutivePivotTable.variablePivot`): cada línea variable aporta
 * `(Number(variable_rate) || 0) × base[m]` en `m = monthIndexOf(budget_date)`
 * (causación). Montos DERIVADOS de presentación —no se almacenan (BR-CLN-03)—
 * y se recalculan solos al editar ingresos. `null` (el bloque no se
 * renderiza) si no hay líneas variables o la base es toda cero, mismo guard
 * que Ejecutiva.
 *
 * FE-S6 §6.2: los buckets `before`/`after` son CERO por construcción (cada
 * monto derivado vive en un mes de causación ∈ N, que `monthIndexOf < 0` ya
 * filtra) ⇒ el bloque no recibe columnas fuera-de-año ni chip; se devuelven
 * igualmente las claves para homogeneidad del shape del pivote.
 */
const variablesPivot = computed(() => {
  const source = variableSourceLines.value
  const base = baseIngresosCausados.value
  if (!source.length || !base.some((value) => value !== 0)) return null

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
        before: 0,
        after: 0
      })
    }
    const row = byCeco.get(key)

    const month = monthIndexOf(line.budget_date)
    if (month < 0) continue
    const rate = Number(line.variable_rate) || 0
    const amount = rate * base[month]
    row.months[month] += amount
    row.total += amount
    columnTotals[month] += amount
    grandTotal += amount
  }

  const rows = [...byCeco.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'))
  return { rows, columnTotals, grandTotal, beforeTotal: 0, afterTotal: 0, beforeAfterRowCount: 0 }
})

/** Nota del bloque estimado (§4.4): equivalente a `VARIABLE_PIVOT_NOTE` de Ejecutiva. */
const VARIABLE_PIVOT_NOTE =
  'Monto estimado = tasa × ingresos fijos presupuestados del mes de causación. ' +
  'No se almacena en las líneas del escenario; se recalcula al ajustar el presupuesto.'

/** Nota al pie del bloque Entradas (D-4, §4.3): montos netos, sin gross-up de IVA. */
const ENTRADAS_NOTE = 'Montos netos, sin IVA. El pilar de analítica de flujo de caja sí lo incluye.'

/* ─────────── FE-S7-COGS-PAYFLOW §5: derivación "Pago a proveedores (costo de ventas)" ─────────── */

/** Nota del bloque derivado (literal spec §5): no altera la causación del P&G. */
const COGS_PAYMENT_NOTE =
  'Derivado: % costo de ventas vigente × ingreso causado, por los términos de pago de ' +
  'la Línea. No altera el P&G (causación).'

/** Nota de degradación §5 (catálogo de términos caído): literal de spec. */
const COGS_TERMS_UNAVAILABLE_NOTE =
  'No fue posible calcular el pago a proveedores (catálogo de términos no disponible).'

/**
 * Último día calendario del mes de una fecha ISO `YYYY-MM-DD` — la fecha de
 * REFERENCIA con la que el resolvedor compartido evalúa la vigencia de la
 * tasa de costo (month-end ∈ [date_from, date_to], espejo exacto del ancla
 * mes-a-mes de `ExecutivePivotTable.monthEndISO` y del `_month_end` de
 * `get_carryover_cogs_lines` server). Parsing por regex sobre el string
 * (patrón `monthIndexOf`: sin `new Date` para ISO puras); el día `0` de
 * `Date.UTC(año, mes, 0)` es el último día del mes (bisiestos correctos,
 * zona inmutable) y se re-serializa con padding manual — prohibido
 * `toISOString()` (corrimiento UTC).
 * @param {string|null|undefined} value
 * @returns {string|null} `'YYYY-MM-DD'` o `null` si no es parseable.
 */
function monthEndOf(value) {
  if (!value) return null
  let year
  let month
  const plain = String(value).match(/^(\d{4})-(\d{2})/)
  if (plain) {
    year = Number(plain[1])
    month = Number(plain[2])
  } else {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    year = date.getFullYear()
    month = date.getMonth() + 1
  }
  if (!Number.isFinite(year) || !Number.isInteger(year) || month < 1 || month > 12) return null
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const mm = String(month).padStart(2, '0')
  const dd = String(last).padStart(2, '0')
  return `${String(year).padStart(4, '0')}-${mm}-${dd}`
}

/**
 * Suma `days` (entero; NEGATIVO = antes de la ancla, semántica
 * `payment_days`) a una fecha ISO `YYYY-MM-DD` y re-serializa ISO. Cruza
 * mes/AÑO con rollover y bisiestos vía aritmética de milisegundos sobre
 * `Date.UTC` (epoch UTC + days×86 400 000 y re-extracción con `getUTC*` —
 * jamás `Date` local + `toISOString()`, que corrimentea la fecha; jamás
 * `new Date` sobre la ISO pura, patrón `monthIndexOf`). Cero redondeo: la
 * aritmética de enteros-milisegundos es exacta para el rango de fechas de
 * presupuesto.
 * @param {string|null|undefined} value
 * @param {number} days
 * @returns {string|null} `'YYYY-MM-DD'` o `null` si la base/días no son válidos.
 */
function addDaysISO(value, days) {
  const offset = Number(days)
  if (!value || !Number.isInteger(offset)) return null
  let year
  let month
  let day
  const plain = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (plain) {
    year = Number(plain[1])
    month = Number(plain[2])
    day = Number(plain[3])
  } else {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    year = date.getFullYear()
    month = date.getMonth() + 1
    day = date.getDate()
  }
  if (!Number.isFinite(year) || !Number.isInteger(year) || month < 1 || month > 12) return null
  if (day < 1 || day > 31) return null
  const shifted = new Date(Date.UTC(year, month - 1, day) + offset * 86400000)
  if (Number.isNaN(shifted.getTime())) return null
  const yyyy = String(shifted.getUTCFullYear()).padStart(4, '0')
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(shifted.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** Ingresos fijos PROPIOS del escenario: la única base de la derivación §5. */
const cogsIncomeLines = computed(() =>
  lines.value.filter((line) => line.line_type === 'income' && line.behavior_type === 'fixed')
)

/**
 * CECO → `id_line` vía el catálogo `costCenters` cacheado — ESPEJO exacto
 * del helper local de `ExecutivePivotTable` (§3.1): desconocido o catálogo
 * A5 caído ⇒ `null` ⇒ el CECO cae a la tasa GLOBAL y NO tiene términos
 * propios (misma cadena que server-side en `get_carryover_cogs_lines`).
 * @param {number|null|undefined} idCostCenter
 * @returns {number|null}
 */
function lineIdForCostCenter(idCostCenter) {
  if (idCostCenter === null || idCostCenter === undefined) return null
  const found = budgetPlanningStore.costCenters.find((item) => item.id_cost_center === idCostCenter)
  return typeof found?.id_line === 'number' ? found.id_line : null
}

/**
 * Cuotas DERIVADAS de pago al proveedor por costo de ventas (§5; D-S7-2:
 * NUNCA se materializan — vivimos solo aquí). Por cada ingreso fijo propio:
 *  1. `pct = resolveCogsPctByLine(lineCostRates, id_line(CECO),
 *     monthEndOf(budget_date))` (resolvedor COMPARTIDO con la Ejecutiva →
 *     mismo % y mismo mes, R-S7-FE-1); `null` ⇒ cero filas por esa línea
 *     (degradación silenciosa, espejo AC-S7-BE-6).
 *  2. `costo = projected_amount × pct / 100` — floats CRUDOS, cero redondeo
 *     intermedio (el formato ocurre solo al render; espejo de la regla
 *     `cost = float(amount) * pct / 100.0` server).
 *  3. términos de la LÍNEA del CECO (`payableTermsByLine`, orden D-7):
 *     CON términos ⇒ una cuota `{ costo × payment_pct (0–1), ancla +
 *     payment_days }` por término; SIN términos (línea sin términos, o CECO
 *     sin id_line) ⇒ cuota ÚNICA al 100 % en la ancla `budget_date`
 *     (D-S7-4; AC-S7-FE-3). Ancla = `budget_date` del ingreso, NO la cuota
 *     de cobro (D-S7-5).
 * Cortocircuito: catálogo de términos no cargado o caído ⇒ `[]` (el bloque
 * no se renderiza; el aviso vive bajo el resumen). Si un `payment_days`
 * basura impidiera el desplazamiento, la cuota queda en la ancla (el monto
 * NUNCA se pierde — reconciliación con el total de la fila).
 * Memoizada O(#ingresos × #términos) sobre `budget_lines` + getters (AC-S7-FE-2).
 * @returns {Array<{ idCostCenter: number, amount: number, effectiveDate: string|null }>}
 */
const costPaymentRows = computed(() => {
  if (!budgetPlanningStore.payableTermsLoaded || budgetPlanningStore.payableTermsError) return []
  const incomes = cogsIncomeLines.value
  if (!incomes.length) return []
  const rates = budgetPlanningStore.lineCostRates
  const termsByLine = budgetPlanningStore.payableTermsByLine
  const rows = []
  for (const line of incomes) {
    // AC-S7-FE-2: ingreso editado a 0 (o tasa 0) ⇒ costo 0 ⇒ NI UNA cuota ⇒
    // el bloque DESAPARECE (`rows.length === 0`). El monto nulo jamás se
    // pinta como fila fantasma (las sumas no cambian: aportar 0 es aportar nada).
    const amount = Number(line.projected_amount)
    if (!Number.isFinite(amount) || amount === 0) continue
    const lineId = lineIdForCostCenter(line.id_cost_center)
    const pct = resolveCogsPctByLine(rates, lineId, monthEndOf(line.budget_date))
    if (pct === null || pct === 0) continue
    const cost = (amount * pct) / 100
    const terms = lineId === null ? undefined : termsByLine.get(lineId)
    if (terms && terms.length) {
      for (const term of terms) {
        const paymentPct = Number(term.payment_pct)
        if (!Number.isFinite(paymentPct)) continue
        rows.push({
          idCostCenter: line.id_cost_center,
          amount: cost * paymentPct,
          effectiveDate: addDaysISO(line.budget_date, Number(term.payment_days)) ?? line.budget_date
        })
      }
    } else {
      rows.push({
        idCostCenter: line.id_cost_center,
        amount: cost,
        effectiveDate: line.budget_date
      })
    }
  }
  return rows
})

/** ¿El bloque derivado tiene filas? (empty ⇒ no se renderiza, §5). */
const costPaymentsActive = computed(() => costPaymentRows.value.length > 0)

/**
 * Degradación §5 (espejo del patrón `costDegradation` de Ejecutiva): SOLO
 * con el catálogo de términos CAÍDO (`payableTermsError`) y además ingresos
 * que PRODUCIRÍAN filas (tasa de costo resolviendo a su month-end). Mientras
 * está EN VUELO (`!loaded` sin error) no se pinta nada — el bloque simplemente
 * aún no existe (cero parpadeo; DOM idéntico a FE-S4B en usuario nuevo,
 * AC-S7-FE-8).
 */
const costTermsDegraded = computed(() => {
  if (!budgetPlanningStore.payableTermsError) return false
  const rates = budgetPlanningStore.lineCostRates
  return cogsIncomeLines.value.some((line) => {
    // MISMOS filtros de "produciría filas" que `costPaymentRows` (§5).
    const amount = Number(line.projected_amount)
    if (!Number.isFinite(amount) || amount === 0) return false
    const lineId = lineIdForCostCenter(line.id_cost_center)
    const pct = resolveCogsPctByLine(rates, lineId, monthEndOf(line.budget_date))
    return pct !== null && pct !== 0
  })
})

/**
 * Builder HERMANO de `buildPivot` para cuotas derivadas
 * `{ idCostCenter, amount, effectiveDate }` (FE-S7 §5): MISMA cartulación y
 * MISMAS reglas de celda/bucket/toggle que el original — pero el builder de
 * las líneas materiales queda UNTOUCHED (cero riesgo de regresión sobre
 * Entradas/Salidas fijos; el shape de entrada es distinto a `BudgetLine` y
 * `effectiveDate` YA es la fecha de pago, no un `payment_date || budget_date`).
 * @param {Array<{ idCostCenter: number, amount: number, effectiveDate: string|null }>} rows
 */
function buildPivotFrom(rows) {
  const byCeco = new Map()
  const columnTotals = Array.from({ length: 12 }, () => 0)
  let grandTotal = 0

  for (const item of rows) {
    const amount = Number(item.amount)
    if (!Number.isFinite(amount)) continue

    const key = item.idCostCenter
    if (!byCeco.has(key)) {
      byCeco.set(key, {
        id: key,
        label: budgetPlanningStore.costCenterLabel(key),
        months: Array.from({ length: 12 }, () => 0),
        total: 0,
        before: 0,
        after: 0
      })
    }
    const row = byCeco.get(key)
    const month = monthIndexOf(item.effectiveDate)
    const bucket = outOfYearBucket(item.effectiveDate)
    if (month >= 0 && (bucket === 0 || !showOutOfYear.value)) {
      row.months[month] += amount
      columnTotals[month] += amount
    }
    if (bucket === -1) row.before += amount
    else if (bucket === 1) row.after += amount
    row.total += amount
    grandTotal += amount
  }

  const out = [...byCeco.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'))
  let beforeTotal = 0
  let afterTotal = 0
  let beforeAfterRowCount = 0
  for (const row of out) {
    beforeTotal += row.before
    afterTotal += row.after
    if (Math.abs(row.before) + Math.abs(row.after) > 0) beforeAfterRowCount += 1
  }
  return { rows: out, columnTotals, grandTotal, beforeTotal, afterTotal, beforeAfterRowCount }
}

/** Pivote del bloque derivado (CECO de ingreso × mes de PAGO). `null` ⇒ sin bloque. */
const costPaymentsPivot = computed(() => {
  if (!costPaymentsActive.value) return null
  return buildPivotFrom(costPaymentRows.value)
})

/** Bloques del template en orden fijo (§5.2: 1 Entradas, 2 fijos, 3 variables condicional; FE-S7: 4 pago a proveedores condicional). */
const blocks = computed(() => {
  const list = [
    {
      title: 'Entradas',
      emptyName: 'entradas',
      pivot: entradasPivot.value,
      aria: 'Entradas (ingresos fijos) por centro de costo y mes según fecha de pago',
      note: ENTRADAS_NOTE,
      // §6.2: pivotes PROPIOS con fechas de pago que pueden caer fuera de N.
      ooy: true
    },
  ]
  if (costPaymentsPivot.value) {
    list.push({
      title: 'Salidas — Pago a proveedores (costo de ventas)',
      emptyName: 'pagos a proveedores',
      pivot: costPaymentsPivot.value,
      aria: 'Salidas de pago a proveedores por costo de ventas derivado, por centro de costo de ingreso y mes de pago',
      note: COGS_PAYMENT_NOTE,
      ooy: true
    })
  }
 
  if (fijosPivot.value) {
    list.push({
      title: 'Salidas — Gastos fijos',
      emptyName: 'gastos fijos',
      pivot: fijosPivot.value,
      aria: 'Salidas de gastos fijos por centro de costo y mes según fecha de pago',
      ooy: true
    })
  }

  if (variablesPivot.value) {
    list.push({
      title: 'Salidas — Gastos variables (calculados)',
      emptyName: 'gastos variables',
      pivot: variablesPivot.value,
      aria: 'Salidas de gastos variables calculados por centro de costo y mes según fecha de causación',
      note: VARIABLE_PIVOT_NOTE,
      // Estimados por causación ∈ N: before/after ≡ 0 ⇒ sin columnas §6.2.
      ooy: false
    })
  }
  // FE-S7 §5: DESPUÉS de variables; solo si la derivación produjo cuotas
  // (empty ⇒ el bloque no se renderiza — DOM idéntico a FE-S4B, AC-S7-FE-8).
  // `ooy: true`: los términos negativos pueden anclar antes del 01/01 y los
  // positivos después del 31/12 (AC-S7-FE-4) — buckets propios.
  return list
})

/* ------------------- Arrastre de saldos N−1 (FE-S6 §6.1) ------------------- */

/** Caché viva del store (`enabled/source/lines/…`): SOLO lee (SD6-4). */
const carryover = computed(() => budgetPlanningStore.carryover)

/**
 * Única puerta de todo el componente B: OFF o `lines: []` ⇒ los computeds de
 * arrastre cortocircuitan, el bloque no se renderiza y el resumen no suma
 * nada (coste cero observable — NFR-S6-FE-2 / AC-S6-FE-6).
 */
const carryActive = computed(
  () =>
    carryover.value.enabled &&
    Array.isArray(carryover.value.lines) &&
    carryover.value.lines.length > 0
)

/**
 * Pivote hermano del arrastre: MISMA ubicación mensual por fecha efectiva
 * (`monthIndexOf(payment_date || budget_date)` — siempre ∈ N por BR-CO-03/
 * BR-CO-09, se usa igual el índice 0-based del mes), mismas reglas de
 * celda/total. El server ya filtró (materiales fijos de la fuente con fecha
 * efectiva ∈ N + cuotas de costo derivadas, orden estable efectivo-asc con
 * `line` antes de `cogs` en empates, BR-CO-10); aquí solo se agrupa.
 *
 * FE-S7 §5: las cuotas derivadas llegan con `origin: "cogs"` y
 * `id_budget_line: null` — el agrupamiento JAMÁS usó el id de línea (clave =
 * CECO), así que `null` es inocuo; para poder etiquetarlas distinto sin
 * mezclarlas con el material del MISMO CECO, el grupo se clave por
 * `CECO|origen` (`row.key`, compuesto ⇒ cero colisión de `:key` en la tabla
 * aunque el CECO aparezca en ambas caras). Payloads sin ninguna fila `cogs`
 * producen exactamente los mismos grupos/orden/DOM que en FE-S6 (AC-S7-FE-8:
 * el origen único `'line'` conserva el orden de inserción estable). Una
 * pasada O(L_carry) memoizada.
 * @param {(line: object) => boolean} match
 */
function buildCarryPivot(match) {
  if (!carryActive.value) return null
  const byCeco = new Map()
  const columnTotals = Array.from({ length: 12 }, () => 0)
  let grandTotal = 0

  for (const line of carryover.value.lines) {
    if (!match(line)) continue
    const amount = Number(line.projected_amount)
    if (!Number.isFinite(amount)) continue

    const origin = line.origin === 'cogs' ? 'cogs' : 'line'
    const key = `${line.id_cost_center}|${origin}`
    if (!byCeco.has(key)) {
      byCeco.set(key, {
        key,
        id: line.id_cost_center,
        origin,
        label: budgetPlanningStore.costCenterLabel(line.id_cost_center),
        months: Array.from({ length: 12 }, () => 0),
        total: 0
      })
    }
    const row = byCeco.get(key)
    const month = monthIndexOf(effectiveDateOf(line))
    if (month >= 0) {
      row.months[month] += amount
      columnTotals[month] += amount
    }
    row.total += amount
    grandTotal += amount
  }

  // Orden etiqueta-asc (igual que FE-S6) + desempate material-antes-que-cogs
  // por el MISMO criterio de orden BR-CO-10 del server (estable garantizado).
  const rows = [...byCeco.values()].sort(
    (a, b) =>
      a.label.localeCompare(b.label, 'es') ||
      (a.origin === b.origin ? 0 : a.origin === 'line' ? -1 : 1)
  )
  return { rows, columnTotals, grandTotal }
}

/** Cobros de arrastre (ingresos de la fuente N−1 con cobro ∈ N). */
const cobrosArrastre = computed(() => buildCarryPivot((line) => line.line_type === 'income'))

/** Pagos de arrastre (gastos de la fuente N−1 con pago ∈ N). */
const pagosArrastre = computed(() => buildCarryPivot((line) => line.line_type === 'expense'))

/**
 * Tablas del bloque "Saldos de {N−1} (arrastre)": solo las caras NO vacías
 * (§6.1: si un lado no tiene filas, se omite su tabla).
 */
const carryTables = computed(() => {
  const tables = []
  const cobros = cobrosArrastre.value
  const pagos = pagosArrastre.value
  if (cobros && cobros.rows.length) {
    tables.push({
      title: 'Cobros de arrastre',
      pivot: cobros,
      aria: 'Cobros de arrastre del escenario anterior por centro de costo y mes según fecha de cobro'
    })
  }
  if (pagos && pagos.rows.length) {
    tables.push({
      title: 'Pagos de arrastre',
      pivot: pagos,
      aria: 'Pagos de arrastre del escenario anterior por centro de costo y mes según fecha de pago'
    })
  }
  return tables
})

/** Tooltip R-S6-1/§6.1 en cada fila del bloque (la fuente manda nombre/año). */
const carryRowTitle = computed(() => {
  const source = carryover.value.source
  const name = source?.budget_name ?? 'año anterior'
  const year = source?.budget_year ?? carrySourceYear.value
  return `Línea del escenario ${name} (${year}) — no forma parte de la causación de este escenario.`
})

/** Año real N−1 de la fuente para el prefijo "⌁ Costo {N−1}" (FE-S7 §5; `source` manda). */
const carryCogsYear = computed(() => {
  const year = carryover.value.source?.budget_year ?? carrySourceYear.value
  return year === null ? 'año anterior' : year
})

/** Tooltip literal §5 (frontend.03_10) para las filas `origin:"cogs"`; el material conserva `carryRowTitle`. */
const carryCogsRowTitle = computed(() => {
  const source = carryover.value.source
  const name = source?.budget_name ?? 'año anterior'
  return `Cuota de costo derivada del escenario ${name} (${carryCogsYear.value}); no es una línea del escenario.`
})

/* ------------------- Fuera de año: control global (FE-S6 §6.2) ------------------- */

/** ¿Algún bloque propio tiene montos fuera de año? ⇒ toggle visible y chips. */
const anyOutOfYear = computed(
  () =>
    entradasPivot.value.beforeAfterRowCount +
      fijosPivot.value.beforeAfterRowCount +
      // FE-S7 §5: el bloque derivado es "propio" y sus cuotas pueden salir de
      // N (términos negativos sobre enero / +120 sobre diciembre) ⇒ el toggle
      // debe existir cuando solo ÉL tiene pendientes (AC-S7-FE-4). Sin filas
      // derivadas el sumando es 0: DOM idéntico a la era pre-FE-S7 (AC-S7-FE-8).
      (costPaymentsPivot.value ? costPaymentsPivot.value.beforeAfterRowCount : 0) >
    0
)

/**
 * Resumen de liquidez (D-6, §4.5): construido SOLO de los
 * `columnTotals`/`grandTotal` de los bloques (ningún re-recorrido de
 * líneas). Neto = entradas − salidas por mes, Total = Σ de los 12 netos;
 * Acumulado = corrida desde Ene, Total = valor de diciembre (≡ neto anual).
 *
 * FE-S6 §6.1: las columnas mensuales de Entradas/Salidas +=
 * `cobros/pagosArrastre.columnTotals` ANTES de derivar neto/acumulado (el
 * acumulado sigue arrancando en 0 — SD6-6, cero saldo inicial); los Totales
 * anuales también. Con el arrastre inactivo (`carryActive` false) los `map`
 * suman 0: resultados numéricos idénticos a FE-S4B (AC-S6-FE-6) sin ninguna
 * pasada extra sobre `carryover.lines`.
 *
 * FE-S7 §5: el MISMO punto de integración para el bloque derivado —
 * `salidas[m] += costPaymentsPivot.columnTotals[m]` (y el total anual +=
 * `grandTotal`; con toggle ON, la columna de un mes excluye los buckets
 * antes/después igual que Entradas/Salidas propios: `row.total`/anual los
 * conserva, AC-S7-FE-4 "el total anual lo incluye"). Sin filas derivadas el
 * sumando es 0: resumen byte-idéntico a FE-S4B/FE-S6 (AC-S7-FE-8). El
 * acumulado sigue arrancando en 0 (ningún saldo nuevo arriba de la corrida).
 */
const resumen = computed(() => {
  const cobros = cobrosArrastre.value
  const pagos = pagosArrastre.value
  const costes = costPaymentsPivot.value
  const entradasPropias = entradasPivot.value.columnTotals
  const fijos = fijosPivot.value.columnTotals
  const variables = variablesPivot.value ? variablesPivot.value.columnTotals : null

  const entradas = entradasPropias.map((value, m) => value + (cobros ? cobros.columnTotals[m] : 0))
  const salidas = entradas.map(
    (_, m) =>
      fijos[m] +
      (variables ? variables[m] : 0) +
      (pagos ? pagos.columnTotals[m] : 0) +
      (costes ? costes.columnTotals[m] : 0)
  )
  const neto = entradas.map((value, m) => value - salidas[m])

  let acc = 0
  const acumulado = neto.map((value) => {
    acc += value
    return acc
  })

  const entradasTotal = entradasPivot.value.grandTotal + (cobros ? cobros.grandTotal : 0)
  const salidasTotal =
    fijosPivot.value.grandTotal +
    (variablesPivot.value ? variablesPivot.value.grandTotal : 0) +
    (pagos ? pagos.grandTotal : 0) +
    (costes ? costes.grandTotal : 0)
  const netoTotal = neto.reduce((sum, value) => sum + value, 0)
  const acumuladoTotal = acumulado[11]

  return {
    entradas,
    salidas,
    neto,
    acumulado,
    entradasTotal,
    salidasTotal,
    netoTotal,
    acumuladoTotal
  }
})

/** `0` → '·' (patrón Ejecutiva); negativos con signo estándar de `formatMoney`. */
function resumenCell(value) {
  return value === 0 ? '·' : formatMoney(value)
}

/** Filas del resumen de liquidez (§4.5). `signed`: neto/acumulado → rojos si < 0. */
const resumenRows = computed(() => {
  const r = resumen.value
  return [
    {
      label: 'Σ Entradas',
      months: r.entradas,
      totalText: formatMoney(r.entradasTotal),
      negativeTotal: false,
      signed: false,
      strong: false,
      totalTitle: undefined
    },
    {
      label: 'Σ Salidas',
      months: r.salidas,
      totalText: formatMoney(r.salidasTotal),
      negativeTotal: false,
      signed: false,
      strong: false,
      totalTitle: undefined
    },
    {
      label: 'Flujo neto',
      months: r.neto,
      totalText: resumenCell(r.netoTotal),
      negativeTotal: r.netoTotal < 0,
      signed: true,
      strong: true,
      totalTitle: 'Σ de los 12 flujos netos mensuales.'
    },
    {
      label: 'Flujo acumulado',
      months: r.acumulado,
      totalText: resumenCell(r.acumuladoTotal),
      negativeTotal: r.acumuladoTotal < 0,
      signed: true,
      strong: true,
      totalTitle:
        'Corrida acumulada desde enero; el total corresponde al valor de diciembre (equivale al flujo neto anual).'
    }
  ]
})

/** Celda negativa (neto/acumulado < 0) → clase `cf-negative` (§4.5). */
function negativeCell(row, value) {
  return row.signed && value < 0
}
</script>

<template>
  <div class="cf-zone">
    <p class="cf-note">
      Matriz de <strong>solo lectura</strong> generada desde las líneas del escenario
      {{ scenario.budget_year }}. Los importes se ajustan en “Editor de Celdas”. El mes se asigna
      por <strong>fecha de pago</strong> (no por causación), por lo que puede diferir de la “Vista
      Ejecutiva”.
    </p>

    <!-- FE-S6 §6.2: toggle de sesión "fuera de año" junto a la cabecera de la
         vista. Solo existe si algún bloque propio tiene montos fuera de año
         (flag OFF + fechas dentro de N ⇒ DOM idéntico a FE-S4B, AC-S6-FE-6). -->
    <button
      v-if="anyOutOfYear"
      type="button"
      class="cf-ooy-toggle"
      :aria-pressed="showOutOfYear ? 'true' : 'false'"
      @click="showOutOfYear = !showOutOfYear"
    >
      {{ showOutOfYear ? 'Ocultar fuera de año' : 'Mostrar fuera de año' }}
    </button>

    <!-- Estado vacío extremo (§5.3): sin líneas propias NI arrastre. -->
    <p v-if="!hasLines && !carryActive" class="cf-empty">
      Este escenario no tiene líneas presupuestadas. Cárguelas o édítelas en “Editor de Celdas”.
    </p>

    <template v-else>
      <section v-for="block in blocks" :key="block.title" class="cf-block">
        <h4 class="cf-block-title">{{ block.title }}</h4>
        <!-- Chip §6.2: columnas ocultas + pendientes fuera de año ⇒ NUNCA se
             oculta (mentirle al banquero es el bug que matamos); clic = ON. -->
        <button
          v-if="block.ooy && !showOutOfYear && block.pivot.beforeAfterRowCount > 0"
          type="button"
          class="cf-ooy-chip"
          :aria-label="`Mostrar las ${block.pivot.beforeAfterRowCount} filas con montos fuera de año en ${block.title}`"
          @click="showOutOfYear = true"
        >
          ⊘ {{ block.pivot.beforeAfterRowCount }} filas con montos fuera de año
        </button>
        <p v-if="block.note" class="cf-note cf-block-note">{{ block.note }}</p>
        <div v-if="block.pivot.rows.length" class="cf-scroll">
          <table
            class="cf-table"
            :class="{ 'cf-table-ooy': showOutOfYear && block.ooy }"
            :aria-label="block.aria"
          >
            <thead>
              <tr>
                <th class="cf-col-ceco">CECO</th>
                <th v-for="month in MONTH_LABELS" :key="month" class="cf-col-month">{{ month }}</th>
                <th class="cf-col-total">Total</th>
                <template v-if="showOutOfYear && block.ooy">
                  <th class="cf-col-ooy">Antes de {{ scenarioYear }}</th>
                  <th class="cf-col-ooy">Después de {{ scenarioYear }}</th>
                </template>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in block.pivot.rows" :key="row.id">
                <th class="cf-row-label" scope="row" :title="row.label">{{ row.label }}</th>
                <td v-for="(value, index) in row.months" :key="index" class="cf-cell-money">
                  {{ value === 0 ? '·' : formatMoney(value) }}
                </td>
                <td class="cf-cell-money cf-cell-total">{{ formatMoney(row.total) }}</td>
                <template v-if="showOutOfYear && block.ooy">
                  <td class="cf-cell-money cf-cell-ooy">
                    {{ row.before === 0 ? '·' : formatMoney(row.before) }}
                  </td>
                  <td class="cf-cell-money cf-cell-ooy">
                    {{ row.after === 0 ? '·' : formatMoney(row.after) }}
                  </td>
                </template>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <th class="cf-row-label" scope="row">Σ Total</th>
                <td
                  v-for="(value, index) in block.pivot.columnTotals"
                  :key="index"
                  class="cf-cell-money"
                >
                  {{ value === 0 ? '·' : formatMoney(value) }}
                </td>
                <td class="cf-cell-money cf-cell-total">
                  {{ formatMoney(block.pivot.grandTotal) }}
                </td>
                <template v-if="showOutOfYear && block.ooy">
                  <td class="cf-cell-money cf-cell-ooy">
                    {{ block.pivot.beforeTotal === 0 ? '·' : formatMoney(block.pivot.beforeTotal) }}
                  </td>
                  <td class="cf-cell-money cf-cell-ooy">
                    {{ block.pivot.afterTotal === 0 ? '·' : formatMoney(block.pivot.afterTotal) }}
                  </td>
                </template>
              </tr>
            </tfoot>
          </table>
        </div>
        <p v-else class="cf-empty">Sin líneas de {{ block.emptyName }} en este escenario.</p>
        <!-- Pies §6.2: ON ⇒ reconciliación; OFF ⇒ admisión solo si aplica. -->
        <p v-if="block.ooy && showOutOfYear" class="cf-note cf-block-foot">
          Σ meses + fuera de año = total anual
        </p>
        <p
          v-else-if="block.ooy && block.pivot.beforeAfterRowCount > 0"
          class="cf-note cf-block-foot"
        >
          El total anual incluye {{ block.pivot.beforeAfterRowCount }} filas fuera de año
        </p>
      </section>

      <!-- ================= Arrastre N−1 (FE-S6 §6.1, componente B) =================
           UN bloque tras los propios; dos tablas (Cobros/Pagos) omitiendo la cara
           vacía. Filas con prefijo tenue `←` + tooltip R-S6-1; sin columnas
           fuera-de-año (las fechas efectivas del arrastre siempre son ∈ N). -->
      <section v-if="carryActive" class="cf-block">
        <h4 class="cf-block-title">Saldos de {{ carrySourceYear }} (arrastre)</h4>
        <p class="cf-note cf-block-note">
          Arrastre automático del escenario {{ carrySourceYear }}: solo afecta a esta Vista Flujo;
          no genera líneas.
        </p>
        <section v-for="carryTable in carryTables" :key="carryTable.title" class="cf-carry-table">
          <h5 class="cf-carry-subtitle">{{ carryTable.title }}</h5>
          <div class="cf-scroll">
            <table class="cf-table" :aria-label="carryTable.aria">
              <thead>
                <tr>
                  <th class="cf-col-ceco">CECO</th>
                  <th v-for="month in MONTH_LABELS" :key="month" class="cf-col-month">
                    {{ month }}
                  </th>
                  <th class="cf-col-total">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in carryTable.pivot.rows" :key="row.key">
                  <th
                    class="cf-row-label cf-carry-label"
                    scope="row"
                    :title="row.origin === 'cogs' ? carryCogsRowTitle : carryRowTitle"
                  >
                    <!-- FE-S7 §5: la fila MATERIAL se pinta byte-idéntica a
                         FE-S6 (`← label`); la cuota derivada `origin:"cogs"`
                         gana el prefijo "⌁ Costo {N−1}" y su tooltip propio. -->
                    <template v-if="row.origin === 'cogs'"
                      >⌁ Costo {{ carryCogsYear }} · {{ row.label }}</template
                    >
                    <template v-else>← {{ row.label }}</template>
                  </th>
                  <td v-for="(value, index) in row.months" :key="index" class="cf-cell-money">
                    {{ value === 0 ? '·' : formatMoney(value) }}
                  </td>
                  <td class="cf-cell-money cf-cell-total">{{ formatMoney(row.total) }}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <th class="cf-row-label" scope="row">Σ Total</th>
                  <td
                    v-for="(value, index) in carryTable.pivot.columnTotals"
                    :key="index"
                    class="cf-cell-money"
                  >
                    {{ value === 0 ? '·' : formatMoney(value) }}
                  </td>
                  <td class="cf-cell-money cf-cell-total">
                    {{ formatMoney(carryTable.pivot.grandTotal) }}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      </section>

      <!-- Resumen de liquidez (D-6, §4.5): SIEMPRE con líneas, aun con bloques vacíos. -->
      <section class="cf-block">
        <h4 class="cf-block-title">Resumen de liquidez</h4>
        <!-- Nota textual §6.1: el resumen cuadra CON el arrastre. La segunda es
             el pie canónico §6.2 aplicado al resumen (toggle ON con montos
             fuera de año retirados de los meses): mismo texto, cero invención.
             FE-S7 §5: la nota "incluye pago a proveedores" convive con la del
             arrastre (AC-S7-FE-6); la cadena original queda SEMÁNTICAMENTE
             INTACTA cuando el derivado está vacío (AC-S7-FE-8). -->
        <p v-if="carryActive" class="cf-note cf-block-note">
          El resumen incluye arrastre {{ carrySourceYear }}.
        </p>
        <p v-if="costPaymentsActive" class="cf-note cf-block-note">
          El resumen incluye pago a proveedores (costo de ventas).
        </p>
        <p
          v-if="!carryActive && !costPaymentsActive && showOutOfYear && anyOutOfYear"
          class="cf-note cf-block-note"
        >
          Σ meses + fuera de año = total anual
        </p>
        <div class="cf-scroll">
          <table
            class="cf-table"
            aria-label="Resumen de liquidez mensual del escenario: entradas, salidas, flujo neto y flujo acumulado"
          >
            <thead>
              <tr>
                <th class="cf-col-ceco">Concepto</th>
                <th v-for="month in MONTH_LABELS" :key="month" class="cf-col-month">{{ month }}</th>
                <th class="cf-col-total">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in resumenRows"
                :key="row.label"
                :class="{ 'cf-row-strong': row.strong }"
              >
                <th class="cf-row-label" scope="row">{{ row.label }}</th>
                <td
                  v-for="(value, index) in row.months"
                  :key="index"
                  class="cf-cell-money"
                  :class="{ 'cf-negative': negativeCell(row, value) }"
                >
                  {{ resumenCell(value) }}
                </td>
                <td
                  class="cf-cell-money cf-cell-total"
                  :class="{ 'cf-negative': row.negativeTotal }"
                  :title="row.totalTitle"
                >
                  {{ row.totalText }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <!-- FE-S7 §5: aviso ámbar de degradación (CATÁLOGO DE TÉRMINOS CAÍDO
             con ingresos que producirían filas): el bloque derivado NO se
             renderiza y el resto del Flujo queda intacto (AC-S7-FE-7). Bajo
             el resumen, junto al pie del §6.2 — el patrón `pv-warn` de
             Ejecutiva es información, no error rojo. -->
        <p v-if="costTermsDegraded" class="cf-warn" role="status">
          {{ COGS_TERMS_UNAVAILABLE_NOTE }}
        </p>
      </section>
    </template>
  </div>
</template>

<style scoped>
/* Mismo lenguaje visual que ExecutivePivotTable (§5.4), prefijo cf-* propio. */

.cf-zone {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.cf-note {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-text-secondary, #555555);
}

/* Nota de cálculo dentro de un bloque (Entradas / Gastos variables). */
.cf-block-note {
  margin: -2px 0 8px;
}

.cf-block-title {
  margin: 0 0 8px;
  font-size: 0.86rem;
  font-weight: 700;
  color: var(--color-text-primary, #070707);
}

.cf-scroll {
  overflow: auto;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 8px;
  background-color: var(--color-surface-card, #ffffff);
  max-height: 60vh;
}

.cf-table {
  min-width: 1240px;
  border: none;
  border-radius: 0;
  box-shadow: none;
  font-size: 0.78rem;
}

.cf-table thead th {
  position: sticky;
  top: 0;
  z-index: 3;
}

.cf-table tfoot th,
.cf-table tfoot td {
  position: sticky;
  bottom: 0;
  z-index: 2;
  font-weight: 700;
  background-color: var(--color-surface, #f7f7f7);
}

:root[data-theme='dark'] .cf-table tfoot th,
:root[data-theme='dark'] .cf-table tfoot td {
  background-color: rgba(255, 255, 255, 0.05);
}

.cf-col-ceco,
.cf-row-label {
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

.cf-table thead .cf-col-ceco {
  z-index: 5;
}

/* `th` sobre fondo claro (esquina CECO/Concepto, etiquetas de fila y `tfoot`):
 * el `th { color: #ffffff }` global de `main.css` los volvería invisibles en
 * tema claro; `--color-text-primary` se adapta solo al tema oscuro. */
.cf-table th.cf-col-ceco,
.cf-table th.cf-row-label {
  color: var(--color-text-primary, #070707);
}

.cf-table tfoot .cf-row-label {
  background-color: var(--color-surface, #f7f7f7);
}

.cf-col-month,
.cf-col-total {
  font-size: 0.72rem;
  font-weight: 600;
}

.cf-cell-money,
.cf-cell-total {
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}

.cf-cell-total {
  font-weight: 600;
}

/* Filas destacadas del resumen (Flujo neto / Flujo acumulado). */
.cf-row-strong th,
.cf-row-strong td {
  font-weight: 700;
}

/* Negativos de neto/acumulado en rojo (§4.5, D-6); dark mode vía convención .ge-error. */
.cf-negative {
  color: #c53030;
}

:root[data-theme='dark'] .cf-negative {
  color: #ff9b9b;
}

.cf-empty {
  margin: 0;
  padding: 14px;
  border: 1px dashed var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 8px;
  font-size: 0.8rem;
  color: var(--color-text-muted, #8a8a8a);
  text-align: center;
}

/* ---------- FE-S6 §6.2: columnas "fuera de año" (toggle de sesión) ---------- */

.cf-ooy-toggle {
  align-self: flex-start;
  margin-top: -8px;
  padding: 5px 13px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 999px;
  background-color: var(--color-surface, #f7f7f7);
  font-size: 0.74rem;
  font-weight: 600;
  color: var(--color-text-secondary, #555555);
  cursor: pointer;
}

.cf-ooy-toggle:hover {
  border-color: var(--color-brand, #03658c);
  color: var(--color-brand, #03658c);
}

.cf-ooy-toggle[aria-pressed='true'] {
  border-color: rgba(3, 101, 140, 0.45);
  background-color: rgba(3, 101, 140, 0.1);
  color: var(--color-brand, #03658c);
}

:root[data-theme='dark'] .cf-ooy-toggle[aria-pressed='true'] {
  color: #56c8ee;
}

/* Chip revelador: lenguaje de atención ámbar (misma familia `chip-closed`). */
.cf-ooy-chip {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  margin: -2px 0 8px;
  padding: 3px 10px;
  border: 1px solid rgba(180, 83, 9, 0.4);
  border-radius: 999px;
  background-color: rgba(245, 158, 11, 0.1);
  font-size: 0.72rem;
  font-weight: 600;
  color: #96590a;
  cursor: pointer;
}

.cf-ooy-chip:hover {
  border-color: rgba(180, 83, 9, 0.7);
}

:root[data-theme='dark'] .cf-ooy-chip {
  color: #f6c177;
}

/* Pie reconciliador (§6.2): ON ⇒ identidad; OFF ⇒ admisión solo si aplica. */
.cf-block-foot {
  margin: 6px 0 0;
}

/* Con columnas extra la matriz pide más lienzo antes de scrollear. */
.cf-table-ooy {
  min-width: 1500px;
}

/* `th` fuera-de-año sobre banda clara propia (BANDA, no calendaria): aplica la
 * regla aprendida — el `th { color: #ffffff }` global de `main.css` los
 * volvería invisibles; `--color-text-primary` se adapta solo al tema oscuro
 * (paridad oscura vía tokens, espejo de `tfoot`). */
.cf-table th.cf-col-ooy {
  min-width: 118px;
  background-color: var(--color-surface, #f7f7f7);
  border-left: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--color-text-primary, #070707);
  white-space: nowrap;
}

:root[data-theme='dark'] .cf-table th.cf-col-ooy {
  background-color: rgba(255, 255, 255, 0.05);
}

.cf-cell-ooy {
  border-left: 1px dashed var(--color-border, rgba(97, 97, 97, 0.15));
}

/* ---------- FE-S6 §6.1: bloque "Saldos de {N−1} (arrastre)" ---------- */

.cf-carry-table {
  margin-top: 10px;
}

.cf-carry-subtitle {
  margin: 0 0 6px;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--color-text-secondary, #555555);
}

/* Prefijo tenue `←` en la etiqueta del CECO (R-S6-1): secundaria + cursiva;
 * sigue siendo `th` de fondo claro, por eso SOLO cambia color/estilo (la regla
 * primaria del `th` de etiqueta ya está arriba; misma especificidad → gana el
 * orden de fuente). */
.cf-table th.cf-carry-label {
  color: var(--color-text-secondary, #555555);
  font-style: italic;
}

/* ---------- FE-S7 §5: aviso de degradación del bloque derivado ---------- */

/* Mismo lenguaje ámbar `pv-warn` de la Ejecutiva (información de cobertura,
 * NUNCA error rojo) y colocación bajo el resumen, tras el pie §6.2. */
.cf-warn {
  margin: 8px 0 0;
  padding: 8px 12px;
  border: 1px solid rgba(180, 83, 9, 0.4);
  border-radius: 8px;
  background-color: rgba(245, 158, 11, 0.1);
  font-size: 0.78rem;
  color: var(--color-text-secondary, #555555);
}
</style>
