<script setup>
/**
 * CashFlowPivotTable — "Vista Flujo" READ-ONLY (FE-S4B-BUDGET-FLUJO §4/§5).
 *
 * Tercer tab del detalle de escenario (D-1: Ejecutiva → Flujo → Editor):
 * perspectiva de LIQUIDEZ de la matriz CECO × Ene–Dic — cuándo entra y sale
 * el efectivo. Los flujos existentes se derivan de `props.scenario.budget_lines`;
 * el capital de financiación llega por `financingPrincipalLines`, una fuente
 * read-only separada que nunca forma parte del P&L.
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
 * `ExecutivePivotTable`).
 *
 * FE-S18 (spec `frontend.03_18`) — FASE 3, migración al componente compartido
 * `PivotMonthTable`: TODAS las tablas mensuales (Resumen de liquidez, bloques
 * Fuente/Usos y arrastre) comparten la misma cuadrícula `<colgroup>` +
 * `table-layout: fixed` (RF-1.1..1.4, AC-1/AC-2); el toggle "fuera de año"
 * usa la prop `extraColumns` (RF-1.5: «Antes/Después de {N}» DESPUÉS del
 * Total, 106px). Cifras SIN `$` (`formatMoneyPlain`/`formatMoneyCompact` +
 * `title` completo, RF-7.2/RF-2.2; los mapeos `0 → '·'`/`null → '—'`
 * intactos). Notas descriptivas de bloque → ⓘ con tooltip `title` (RF-3.2),
 * `VARIABLE_PIVOT_NOTE` UNIFICADA desde `planningFormat.js` (RF-4.2) y los
 * pies «Σ meses + fuera de año = total anual»/«El total anual incluye N
 * filas fuera de año» salen del render (la fórmula quedará en la intro de
 * tab de Fase 4 — RF-4.3; la N exacta la sigue mostrando el chip ⊘). Los
 * avisos de degradación (bodega negativa, catálogo de términos, settlement
 * con Reintentar) siguen VISIBLES con `v-if` (RF-3.3). Computed de datos
 * byte-idénticos (AC-7).
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
 *    beforeAfterRowCount`. FE-S8-FLUJO-OY ENMIENDA §6.2 (FR-1/FR-2): los
 *    montos con fecha efectiva fuera de N NUNCA pueblan las 12 celdas
 *    mensuales ni `columnTotals`, con el toggle en cualquier estado (ON u
 *    OFF) — ya NO es cierto que "con OFF la matriz es la de FE-S4B"; el
 *    toggle de sesión (default OFF, FD6-1) solo REVELA/OCULTA las columnas
 *    extra "Antes/Después de {N}". Con OFF el chip `⊘ {k} filas con montos
 *    fuera de año` es la señal obligatoria de que falta plata en los meses;
 *    con ON el pie "Σ meses + fuera de año = total anual" reconcilia exacto
 *    (Q4=4 — nunca mentirle al banquero). `row.total`/`grandTotal`/buckets
 *    conservan su semántica anual todo-inclusive (FR-3).
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
 *
 * FE-S9-PURCHASES-BODEGA (aditivo, spec `frontend.03_12` §2): (A) bloque
 *  "Compras del mes (importaciones)" — pivote por CECO × `monthIndexOf
 *  (budget_date)` de las líneas `purchase` (causación de importación, siempre
 *  ∈ N por validación BE ⇒ `ooy: false`, sin chip ni columnas extra); entra
 *  ENTRE Entradas y Pago a proveedores, SOLO si hay compras (§2.4). (B) switch
 *  de fuente D-4' ENMIENDA A-02 §7.1 — POR LÍNEA, reemplaza la mecánica
 *  por-CECO de §2.5, espejo de la rama D-4' del carryover server (claves
 *  `line:`/`cc:`): cada CECO se cartula con el helper local
 *  `sourceKeyForCostCenter` (`line:<id_line>` si el catálogo `costCenters`
 *  le conoce Línea, `cc:<id_cost_center>` si no) y `purchasingKeys` = claves
 *  de las filas `purchase` ⇒ los ingresos cuya clave es compradora NO generan
 *  cuota cogs (nunca doble cuenta). Ejemplo (defecto 266): la compra en el
 *  CECO Facturación de la Línea (000001) apaga la derivación por ingreso de
 *  los CECOS zonales de esa Línea (000101/000201). Cada compra genera sus
 *  cuotas con los términos de la Línea del CECO sobre su `budget_date`
 *  (mismo shape FE-S7, ancla = fecha de importación, cuota única 100 % sin
 *  términos/id_line; `buildPivotFrom` y FE-S8 intactos: la cuota fuera de N
 *  vive solo en Antes/Después) (§2.5 punto 2 inalterado). Degradación honesta
 *  §7.1: catálogo de CECOS caído o CECO desconocido ⇒ `lineIdForCostCenter`
 *  devuelve `null` ⇒ claves `cc:` ⇒ comportamiento por-CECO conservador de
 *  A-01: una compra solo apaga la derivación de su MISMO CECO, jamás switcha
 *  de más.
 *  (C) fila informativa "Bodega estimada (cierre)" AL FINAL del Resumen de
 *  Liquidez: `bodega[m] = bodega[m−1] + compras[m] − costoCausadoPorMes[m]`
 *  (costo de ventas CAUSADO = Σ ingreso fijo × cogs_pct del month-end,
 *  INDEPENDIENTE del catálogo de términos; `pct` `null` ⇒ 0; NO toca
 *  entradas/salidas/neto/acumulado; `—` en Antes/Después; Total = bodega[11];
 *  negativos en ámbar + nota bajo la tabla; se renderiza SIEMPRE) (§2.6).
 *  (D) arrastre con `origin:"purchase"` (BE-S8): grupo CECO|origen con orden
 *  line < cogs < purchase, prefijo "⌁ Compra {N−1}" + tooltip propio; payloads
 *  sin origen purchase = DOM idéntico a FE-S7/FE-S8 (§2.7).
 *
 * FE-S10-INTERNMENT-SPLIT (aditivo, spec `frontend.03_13` §2.4-2.6; autoridad
 *  de fórmula `backend.02_19` §4): el valor de una compra ES el costo total
 *  (A-1'). Las compras de `costPaymentRows` se parten client-side (D-FE10-1,
 *  cero escrituras): `pctInt = internmentRateByLine.get(lineId) ?? 0` (no
 *  finito o negativo ⇒ 0, guard §2.4-1), `provBase = amount / (1 + pctInt)`,
 *  `intBase = amount − provBase` — el stream proveedor conserva el mecanismo
 *  FE-S7/FE-S9 INTACTO pero sobre `provBase` (cuota única D-S7-4 incluida).
 *  El stream de internación vive en `internmentPaymentRows` (MISMO shape
 *  `{ idCostCenter, amount, effectiveDate }`, precedente D-FE9-4): solo
 *  compras con `intBase > 0.005` (D-FE10-5), cuotas por `internmentTermsByLine`
 *  (orden D-7) o cuota única en la ancla sin términos (BR-INT-04); pct 0 ⇒
 *  cero filas (BR-INT-05). Bloque NUEVO "Pago de internación" entre "Pago a
 *  proveedores" y "Gastos fijos", SOLO si hay filas propias ∨ cuotas de
 *  arrastre `origin:"internment"` (NFR-FE10-3: sin configuración, DOM
 *  idéntico a FE-S9). Fail-closed D-FE10-3: `internmentCatalogError`
 *  cortocircuita AMBOS streams de compra (no se puede partir la base) con el
 *  aviso de `costTermsDegraded` extendido; la ruta `cogs` sobre ingresos NO
 *  usa rates ⇒ byte-idéntica (A-8/§2.4-6). Arrastre §2.6: origin normalizado
 *  también a 'internment' (rank line < cogs < purchase < internment), fila
 *  "⌁ Internación {N−1}" con tooltip propio (comparte resolvedor de año).
 *
 * FE-S16-CECO-DRILLDOWN (spec `frontend.03_19` RF-1): en los bloques BASE
 * derivados de `budget_lines` del propio escenario (Entradas, Compras del
 * mes, Gastos fijos) la PRIMERA celda de cada fila enlaza con `RouterLink`
 * a la ruta nueva `BudgetCecoDetail`
 * (`/budget/planning/:idBudget/ceco/:costCenterCode`, código encajado
 * contra el catálogo con `cecoMovements.costCenterCodeOf`); cursor pointer
 * + hover/focus de la CELDA + aria-label (RF-1.3/RF-7.3). El resto de
 * celdas no interactúa (RF-1.2) y el click NO dispara HTTP (RF-1.4: la
 * vista de detalle usa la MISMA caché del store). Los bloques de movimientos del Motor (capital y desembolsos de financiación) TAMBIÉN enlazan desde la Revisión 2 del drill-down (RF-8 de la spec 03_19: el detalle reproduce esos movimientos). El resto de DERIVADOS (pago a proveedores, internación, variables, liquidación e impuestos) NO enlaza: el detalle no los reproduce.
 */
import { computed, ref } from 'vue'
import { useBudgetPlanningStore } from '@/stores/budgetPlanningStore.js'
import ScenarioTaxPaymentsBlock from '@/components/budget/taxes/ScenarioTaxPaymentsBlock.vue'
import PivotMonthTable from './PivotMonthTable.vue'
import {
  MONTH_LABELS,
  VARIABLE_PIVOT_NOTE,
  formatMoneyCompact,
  formatMoneyPlain,
  formatDateEs,
  monthIndexOf,
  resolveCogsPctByLine,
  IVA_RATE,
  lineChargesIva,
  withIva,
  ivaOf
} from './planningFormat.js'
import { costCenterCodeOf } from './cecoMovements.js'

const props = defineProps({
  /** `BudgetFull` + `parent_budget_name` de la caché del store. */
  scenario: { type: Object, required: true },
  /** Líneas del endpoint financing-principal-flow; separadas de budget_lines. */
  financingPrincipalLines: { type: Array, default: () => [] },
  /** New-credit disbursements: cash inflows on disbursement date. */
  financingDisbursementLines: { type: Array, default: () => [] }
})

const budgetPlanningStore = useBudgetPlanningStore()

/* ─────────── FE-S16 (frontend.03_19) RF-1: celda CECO → drill-down ─────────── */

/** Catálogo CECO cacheado (fuente del encaje código de ruta ↔ id). */
const costCenters = computed(() => budgetPlanningStore.costCenters)

/**
 * FE-S16 RF-1: destino del drill-down de una fila cuyo rótulo es un CECO.
 * `null` (fila sintética de liquidación/impuestos/IVA de importación, o
 * catálogo caído) ⇒ el llamador NO enlaza la celda (degradación honesta).
 * RF-1.2/RF-1.4: SOLO la celda CECO navega y sin HTTP — la vista de detalle
 * deriva de la MISMA caché del store.
 * @param {number|string|null|undefined} rowId `id_cost_center` de la fila
 * @returns {{ to: object, code: string }|null}
 */
function cecoLink(rowId) {
  const code = costCenterCodeOf(costCenters.value, rowId)
  if (code === null) return null
  return {
    to: {
      name: 'BudgetCecoDetail',
      // RF-8.10: al entrar DESDE la Vista Flujo el detalle abre en el tab "Flujo"
      // directamente (la Vista Ejecutiva no manda query ⇒ default "Causado").
      query: { tab: 'flow' },
      params: {
        idBudget: props.scenario?.id_budget ?? budgetPlanningStore.currentScenarioId ?? '',
        costCenterCode: code
      }
    },
    code
  }
}

const lines = computed(() =>
  props.scenario && Array.isArray(props.scenario.budget_lines) ? props.scenario.budget_lines : []
)

/** Vacío extremo: capital independiente también habilita el resumen de caja. */
const hasLines = computed(
  () =>
    lines.value.length > 0 ||
    financingPrincipalPivot.value?.rows.length > 0 ||
    financingDisbursementPivot.value?.rows.length > 0
)

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

/* ─────────── FE-S14-IVA §4.1: modo "Con IVA" — derivación bruto memoizada O(#líneas) ─────────── */

/**
 * Bandera viva del interruptor "Neto / Con IVA" del escenario
 * (frontend.03_14 D-FE14-1; dueño: `budgetPlanningStore.ivaMode`,
 * persistido por `idBudget`). Con OFF todas las derivaciones de abajo
 * devuelven el neto crudo: DOM y cifras byte-idénticas al FE-S10
 * (AC-FE14-1, cero regresión).
 */
const ivaActive = computed(() => budgetPlanningStore.ivaMode === true)

/**
 * Monto PRESENTADO de una línea material (fija) bajo el modo: neto × 1.19
 * cuando está gravada — INCOME siempre (D-S10-5), EXPENSE según el flag
 * EFECTIVO (`has_iva`, NULL≡True; D-FE14-2) y PURCHASE no aplica (sus
 * streams se derivan aparte). `planningFormat.withIva` es la ÚNICA fórmula
 * (D-FE14-6). Reacciona en vivo al PUT de celda/toggle de flag porque cuelga
 * de `lines` + `ivaActive` (AC-FE14-2, NFR-FE14-1: cero re-fetch).
 * @param {object} line
 * @returns {number}
 */
function grossLineAmount(line) {
  const net = Number(line.projected_amount)
  if (!Number.isFinite(net)) return net
  if (!ivaActive.value) return net
  return withIva(net, lineChargesIva(line))
}

/**
 * Gross-up de un monto DERIVADO (cuotas de internación): con el modo OFF o
 * línea no gravada devuelve el neto crudo (identidad numérica, NFR-FE10-3
 * heredado). El IVA de importación NO pasa por aquí: es fila propia del
 * bloque "Pago a proveedores" (D-FE14-3).
 * @param {number} net
 * @param {boolean} [charged=true] gravado (internación siempre: es servicio)
 * @returns {number}
 */
function grossDerived(net, charged = true) {
  if (!ivaActive.value || !charged) return net
  return withIva(net, true)
}

/**
 * Tasa efectiva del settlement para las etiquetas del panel/Flujo
 * (D-FE14-6: `tax_rate_used` del BE manda cuando hay respuesta; mientras no
 * la hay, la constante espejo `IVA_RATE`).
 * @returns {number}
 */
const settlementTaxRate = computed(() => {
  const raw = Number(budgetPlanningStore.settlement.data?.tax_rate_used)
  return Number.isFinite(raw) && raw > 0 ? raw : IVA_RATE
})
/** P. ej. `19 %` (nunca hardcode: se deriva de `settlementTaxRate`). */
const settlementTaxRateLabel = computed(
  () => `${Number((settlementTaxRate.value * 100).toFixed(2))} %`
)

/**
 * Toggle de sesión del bloque C (FD6-1, default OCULTAS — Q4=4). FE-S8-FLUJO-OY
 * (FR-1/FR-2): los montos con fecha efectiva fuera de N NUNCA están en las
 * celdas mensuales; el toggle solo revela/oculta las columnas "Antes/Después
 * de {N}" (con ON, Σ meses + fuera de año = total anual reconcilia exacto;
 * con OFF, el chip ⊘ es la señal obligatoria del pendiente). No se
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
 * bucket solo hace VISIBLE de dónde viene lo que ya sumaba. FE-S8-FLUJO-OY
 * (FR-1/C-1): el fuera-de-año NUNCA puebla la celda mensual ni `columnTotals`
 * (toggle ON u OFF); con ON vive en sus columnas Antes/Después y con OFF solo
 * lo revelan chip/pie (así Σ meses + fuera = total anual es EXACTO,
 * AC-S6-FE-4 → AC-OY-1..3). `bucket === 0` incluye fechas indeterminables
 * (D-OY-6): no se puede afirmar fuera ⇒ vive en el mes.
 * @param {(line: object) => boolean} match Filtro de líneas del bloque.
 * @param {(line: object) => number} monthOf Función de ubicación mensual.
 * @param {((line: object) => number)|null} [amountOf=null] extractor del
 *   monto a acumular (FE-S14-IVA: con el modo "Con IVA" cada bloque pasa su
 *   derivación bruto por bandera efectiva; `null` ⇒ `projected_amount` crudo
 *   — modo OFF byte-idéntico a FE-S4B, AC-FE14-1).
 */
function buildPivot(match, monthOf, amountOf = null) {
  const byCeco = new Map()
  const columnTotals = Array.from({ length: 12 }, () => 0)
  let grandTotal = 0

  for (const line of lines.value) {
    if (!match(line)) continue
    const amount = amountOf ? amountOf(line) : Number(line.projected_amount)
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
    // FE-S8-FLUJO-OY C-1 (FR-1): el fuera-de-año NUNCA puebla la celda mensual
    // ni `columnTotals` (toggle ON u OFF); `bucket === 0` además cubre fechas
    // indeterminables (D-OY-6): no se puede afirmar fuera ⇒ vive en el mes.
    if (month >= 0 && bucket === 0) {
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

/**
 * Bloque "Entradas" (§4.2): ingresos fijos por fecha de pago (D-3, R-1).
 * FE-S14-IVA §4.1: con el modo ON el recaudo se muestra BRUTO (× 1.19 — el
 * ingreso siempre genera IVA, D-S10-5); con OFF el neto crudo de siempre.
 */
const entradasPivot = computed(() =>
  buildPivot(
    (line) => line.line_type === 'income' && line.behavior_type === 'fixed',
    cfMonth,
    grossLineAmount
  )
)

/**
 * Bloque "Salidas — Gastos fijos" (§4.2): gastos fijos por fecha de pago.
 * FE-S14-IVA §4.1: × 1.19 según el flag efectivo de la línea (NULL≡True);
 * flag `false` ⇒ neto sin gross-up (AC-FE14-4).
 */
const fijosPivot = computed(() =>
  buildPivot(
    (line) => line.line_type === 'expense' && line.behavior_type === 'fixed',
    cfMonth,
    grossLineAmount
  )
)

/* ─────────── FE-S9-PURCHASES-BODEGA §2.4: bloque "Compras del mes" ─────────── */

/**
 * Pivote de COMPRAS de importación (§2.4): filas por CECO × MES DE CAUSACIÓN
 * de la importación (`monthIndexOf(budget_date)` — NO la fecha de pago: una
 * compra nunca tiene `payment_date`, BR-PUR-01). `bucket` siempre 0 (el BE
 * valida `budget_date` ∈ N, BR-LINE-04) ⇒ bloque `ooy: false`: sin columnas
 * Antes/Después ni chip. Solo se renderiza si el escenario tiene compras
 * (NFR-FE9-3: sin compras, DOM idéntico a FE-S8).
 */
const comprasPivot = computed(() =>
  buildPivot(
    (line) => line.line_type === 'purchase',
    (line) => monthIndexOf(line.budget_date)
  )
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
    // FE-S14-IVA §4.1: la BASE de la estimación sigue siendo neta (igual que
    // E3/E4 del motor BE, backend.02_20 §4.3); el gross-up × 1.19 se aplica
    // al MONTO DERIVADO según el flag efectivo de la línea variable
    // (NULL≡True). Con modo OFF `grossDerived` es identidad: cifra idéntica.
    const amount = grossDerived(rate * base[month], lineChargesIva(line))
    row.months[month] += amount
    row.total += amount
    columnTotals[month] += amount
    grandTotal += amount
  }

  const rows = [...byCeco.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'))
  return { rows, columnTotals, grandTotal, beforeTotal: 0, afterTotal: 0, beforeAfterRowCount: 0 }
})

/** Nota del bloque estimado (§4.4) — FE-S18 RF-4.2: se importa de
 * `planningFormat.js` (ÚNICA definición compartida con la Ejecutiva);
 * aquí solo se muestra como tooltip ⓘ (RF-3.2). */

/**
 * Nota al pie del bloque Entradas (D-4, §4.3) — FE-S14-IVA D-FE14-1 la
 * RE-SEMANTIZA: con el modo "Con IVA" activo declara la fórmula bruta
 * mostrada (porcentaje derivado de `tax_rate_used`/`IVA_RATE`, cero
 * hardcode); apagado el modo vuelve el literal neto de siempre (AC-FE14-1:
 * cero regresión byte-a-byte).
 */
const ENTRADAS_NOTE = computed(() =>
  ivaActive.value
    ? `Recaudo bruto = neto × (1 + ${settlementTaxRateLabel.value}). ` +
      'Modo "Con IVA": caja bruta proyectada.'
    : 'Montos netos, sin IVA. El pilar de analítica de flujo de caja sí lo incluye.'
)

/* ─────────── FE-S7-COGS-PAYFLOW §5: derivación "Pago a proveedores (costo de ventas)" ─────────── */

/**
 * Nota del bloque derivado — TEXTO VIGENTE desde la ENMIENDA A-02 §7.2
 * (reemplaza el literal §2.5.5): describe las DOS fuentes POR LÍNEA de la
 * derivación (compras de la Línea × términos; Línea sin plan de compras:
 * % costo de ventas × ingreso causado). No altera la causación del P&G.
 */
const COGS_PAYMENT_NOTE =
  'Derivado: compras de la Línea × términos de pago; Línea sin plan de ' +
  'compras: % costo de ventas vigente × ingreso causado. No altera el P&L (causación).'

/** Nota de degradación §5 (catálogo de términos caído): literal de spec. */
const COGS_TERMS_UNAVAILABLE_NOTE =
  'No fue posible calcular el pago a proveedores (catálogo de términos no disponible).'

/* ── FE-S14-IVA D-FE14-3: fila única "IVA de importación" dentro de "Pago a proveedores" ── */

/** Clave sintética de la fila agregada (NUNCA colisiona con un `id_cost_center`). */
const IMPORT_VAT_ROW_KEY = 'iva-importacion'
/** Etiqueta literal de la fila (AC-FE14-3). */
const IMPORT_VAT_ROW_LABEL = 'IVA de importación'

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

/* ── FE-S9-PURCHASES-BODEGA §2.5 + ENMIENDA A-02 §7.1: switch de fuente D-4' POR LÍNEA (VINCULANTE) ── */

/**
 * Regla de fuente única D-4' (VINCULANTE, ENMIENDA A-02 §7.1 — reemplaza la
 * por-CECO de §2.5): una LÍNEA con ≥1 línea de compra en el escenario es
 * COMPRADORA ⇒ el pago a proveedores de TODOS sus CECOS (la comprador
 * "Facturación" y los zonales que solo venden) se deriva de sus COMPRAS y
 * NUNCA de ingreso × cogs_pct (cero doble cuenta; el defecto 266: compra en
 * 000001/000002 y venta en 000101/000201/000202/000302 de las MISMAS Líneas
 * ⇒ el switch por-CECO nunca casaba). Una sola pasada O(L) memoizada
 * alimenta AMBOS consumidores (§2.5/§7.1): `purchasingKeys` (skip en la
 * derivación FE-S7) y `purchaseLines` (fuente de las cuotas de compra,
 * INALTERADAS por la enmienda).
 */
const purchaseIndex = computed(() => {
  const purchaseLinesArr = []
  const keySet = new Set()
  for (const line of lines.value) {
    if (line.line_type === 'purchase') {
      purchaseLinesArr.push(line)
      keySet.add(sourceKeyForCostCenter(line.id_cost_center))
    }
  }
  return { lines: purchaseLinesArr, keys: keySet }
})

/** @see purchaseIndex — líneas `purchase` crudas (fuente de las cuotas §2.5). */
const purchaseLines = computed(() => purchaseIndex.value.lines)

/**
 * @see purchaseIndex — claves D-4' (A-02 §7.1) de las Líneas con plan de
 * compras: la derivación FE-S7 por ingreso se saltea la fila ingreso si su
 * `sourceKeyForCostCenter(id_cost_center)` pertenece a este Set.
 */
const purchasingKeys = computed(() => purchaseIndex.value.keys)

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
 * Clave de fuente D-4' (ENMIENDA A-02 §7.1, espejo de las claves `line:`/`cc:`
 * que el backend aplica en el carryover): `line:<id_line>` cuando el catálogo
 * `costCenters` le conoce Línea al CECO —todas las facetas de una misma Línea
 * (la compradora "Facturación" y los zonales que solo venden) comparten clave
 * ⇒ el switch de fuente es POR LÍNEA—; `cc:<id_cost_center>` cuando
 * `lineIdForCostCenter` devuelve `null` (CECO desconocido o catálogo A5
 * caído). DEGRADACIÓN HONESTA §7.1: sin catálogo la clave vuelve a ser
 * por-CECO (comportamiento A-01, conservador: una compra solo apaga la
 * derivación de su MISMO CECO y jamás apaga de más por una Línea que no se
 * puede conocer). Los prefijos evitan cualquier colisión entre `id_line` e
 * `id_cost_center`.
 * @param {number|null|undefined} idCostCenter
 * @returns {string}
 */
function sourceKeyForCostCenter(idCostCenter) {
  const lineId = lineIdForCostCenter(idCostCenter)
  return lineId === null ? `cc:${idCostCenter}` : `line:${lineId}`
}

/**
 * ¿Dúo de internación disponible (cargado y sin error)? FE-S10 §2.4-5
 * (D-FE10-3, fail-closed): SIN el % vigente no se puede partir la base de
 * las compras ⇒ AMBOS streams de compra (proveedor e internación) se
 * cortocircuitan mientras el catálogo esté en vuelo o caído; la ruta `cogs`
 * sobre ingresos NO usa rates y queda intacta (A-8). Como `ensureCatalogs`
 * se.await-a antes de pintar el detalle, el estado transitorio "en vuelo"
 * no produce parpadeo (patrón FE-S7: el bloque simplemente aún no existe).
 */
const internmentCatalogReady = computed(
  () => budgetPlanningStore.internmentCatalogLoaded && !budgetPlanningStore.internmentCatalogError
)

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
 * FE-S10 §2.4: en las COMPRAS la base deja de ser el total de la fila y pasa
 * a ser `provBase = amount / (1 + pctInt)` (fórmula §4 de `backend.02_19`
 * replicada cliente, D-FE10-1); el mecanismo de cuotas queda INTACTO. Con el
 * dúo de internación no disponible se cortocircuita SOLO el bloque de
 * compras (fail-closed, D-FE10-3) — los ingresos `cogs` siguen.
 * Memoizada O(#ingresos × #términos) sobre `budget_lines` + getters (AC-S7-FE-2).
 * @returns {Array<{ idCostCenter: number, amount: number, effectiveDate: string|null }>}
 */
const costPaymentRows = computed(() => {
  if (!budgetPlanningStore.payableTermsLoaded || budgetPlanningStore.payableTermsError) return []
  const incomes = cogsIncomeLines.value
  const purchases = purchaseLines.value
  if (!incomes.length && !purchases.length) return []
  const rates = budgetPlanningStore.lineCostRates
  const termsByLine = budgetPlanningStore.payableTermsByLine
  const purchasing = purchasingKeys.value
  const rows = []
  for (const line of incomes) {
    // FE-S9 §2.5-1 + A-02 §7.1 (D-4'): LÍNEA COMPRADORA (o CECO comprador bajo
    // la degradación `cc:`) ⇒ su ingreso NO genera cuota cogs (el proveedor ya
    // se paga por las compras de arriba — nunca doble cuenta). La compra en el
    // CECO Facturación de la Línea apaga también la derivación de los CECOS
    // zonales de esa Línea (defecto 266: 43M + 28.2M ⇒ ahora 43M exactos).
    if (purchasing.has(sourceKeyForCostCenter(line.id_cost_center))) continue
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
  // FE-S9 §2.5-2 + FE-S10 §2.4: CUOTAS DE COMPRA (stream PROVEEDOR) — mismo
  // shape `{ idCostCenter, amount, effectiveDate }` (D-FE9-4: `buildPivotFrom`
  // y FE-S8 sin cambios). Ancla = `budget_date` de la importación; término con
  // `payment_days` sobre esa ancla (negativo ⇒ antes). SIN términos (o CECO
  // sin `id_line`) ⇒ cuota única 100 % en la ancla (D-S7-4 extendido) — ahora
  // SOBRE `provBase` (FE-S10): Línea sin tasa ⇒ pctInt 0 ⇒ `provBase ===
  // amount` ⇒ DOM idéntico a FE-S9 (NFR-FE10-3). Mismos guards FE-S7: monto no
  // finito o 0 ⇒ sin cuota; `payment_pct` basura ⇒ skip del término;
  // `addDaysISO` `null` ⇒ la cuota queda anclada (el monto NUNCA se pierde).
  // Fail-closed D-FE10-3: sin el dúo de internación NO se puede partir la
  // base ⇒ este stream tampoco se deriva (la ruta `cogs` de arriba es
  // independiente de rates y sigue intacta, A-8).
  if (!internmentCatalogReady.value) return rows
  const internmentPctsByLine = budgetPlanningStore.internmentRateByLine
  for (const line of purchases) {
    const amount = Number(line.projected_amount)
    if (!Number.isFinite(amount) || amount === 0) continue
    const lineId = lineIdForCostCenter(line.id_cost_center)
    // §2.4-1: `Number(map.get(lineId) ?? 0)`; basura o negativa ⇒ 0 (CECO sin
    // Línea ⇒ `get(null)` undefined ⇒ 0, misma fila del borde BE §4).
    const pctIntRaw = Number(internmentPctsByLine.get(lineId) ?? 0)
    const pctInt = !Number.isFinite(pctIntRaw) || pctIntRaw < 0 ? 0 : pctIntRaw
    // §2.4-2: `provBase = amount / (1 + pctInt)` (pctInt 0 ⇒ amount EXACTO —
    // `x / 1 === x` en IEEE-754: cero regresión numérica, NFR-FE10-3).
    const provBase = amount / (1 + pctInt)
    // FE-S14-IVA D-FE14-3/AC-FE14-3 (modo ON): el IVA de importación NO crea
    // bloque nuevo ni embute en las cuotas — es UNA fila agregada "IVA de
    // importación" del bloque "Pago a proveedores" en la FECHA DE COMPRA, con
    // la MISMA descomposición §4 de backend.02_19/BE-S10 E5: base =
    // Total/(1+%int) (`provBase` arriba; degradación %int = 0 sin tasa o sin
    // Línea ⇒ base = Total) y monto = base × 19 % (`ivaOf`, cero hardcodes).
    // Las cuotas del proveedor de abajo siguen NETAS (AC-FE14-3).
    if (ivaActive.value) {
      rows.push({
        idCostCenter: line.id_cost_center,
        rowKey: IMPORT_VAT_ROW_KEY,
        label: IMPORT_VAT_ROW_LABEL,
        amount: ivaOf(provBase, true),
        effectiveDate: line.budget_date
      })
    }
    const terms = lineId === null ? undefined : termsByLine.get(lineId)
    if (terms && terms.length) {
      for (const term of terms) {
        const paymentPct = Number(term.payment_pct)
        if (!Number.isFinite(paymentPct)) continue
        rows.push({
          idCostCenter: line.id_cost_center,
          amount: provBase * paymentPct,
          effectiveDate: addDaysISO(line.budget_date, Number(term.payment_days)) ?? line.budget_date
        })
      }
    } else {
      rows.push({
        idCostCenter: line.id_cost_center,
        amount: provBase,
        effectiveDate: line.budget_date
      })
    }
  }
  return rows
})

/** ¿El bloque derivado tiene filas? (empty ⇒ no se renderiza, §5). */
const costPaymentsActive = computed(() => costPaymentRows.value.length > 0)

/* ─────────── FE-S10-INTERNMENT-SPLIT §2.4: stream de internación de las compras ─────────── */

/**
 * Épsilon COP para suprimir filas de internación residuales de float crudo
 * (D-FE10-5/§2.4-4: `intBase > 0.005`; convención BE-S8 §4 "raw float, cero
 * redondeo intermedio" — NUNCA redondear el monto derivado, solo excluir).
 */
const INTERNMENT_EPSILON_COP = 0.005

/**
 * Cuotas DERIVADAS de pago de la INTERNACIÓN (FE-S10 §2.4-4): MISMO shape
 * `{ idCostCenter, amount, effectiveDate }` que `costPaymentRows` (precedente
 * D-FE9-4 ⇒ `buildPivotFrom` reutilizado sin tocar). Solo compras:
 *  - `pctInt = Number(internmentRateByLine.get(lineId) ?? 0)` (§2.4-1: no
 *    finito o negativo ⇒ 0, guard defensivo espejo del skip por pct basura);
 *  - `intBase = amount − amount / (1 + pctInt)` (BR-INT-01);
 *  - `pctInt === 0` ⇒ CERO filas (BR-INT-05/A-5) y `intBase ≤ 0.005` ⇒ cero
 *    filas (§2.4-4);
 *  - CON `internmentTermsByLine.get(lineId)` ⇒ una cuota `{ intBase ×
 *    payment_pct, addDaysISO(budget_date, payment_days) ?? budget_date }` por
 *    término (orden D-7 del getter; mismos guards FE-S7: pct no finito ⇒
 *    skip, addDays `null` ⇒ ancla);
 *  - SIN términos ⇒ cuota ÚNICA `{ intBase, budget_date }` (BR-INT-04, espejo
 *    D-S7-4). Ancla = fecha de importación también para este stream (A-3).
 * Fail-closed D-FE10-3: sin el dúo cargado (o con `internmentCatalogError`)
 * ⇒ `[]` (el bloque no se deriva; el aviso vive en `costTermsDegraded`).
 * O(L_compras) memoizada dentro del mismo loop de derivation (§2.4; NFR-
 * FE10-1: ≤2 pasadas constantes, cero anidados extra fuera de cuotas).
 * @returns {Array<{ idCostCenter: number, amount: number, effectiveDate: string|null }>}
 */
const internmentPaymentRows = computed(() => {
  if (!internmentCatalogReady.value) return []
  const purchases = purchaseLines.value
  if (!purchases.length) return []
  const ratesByLine = budgetPlanningStore.internmentRateByLine
  const termsByLine = budgetPlanningStore.internmentTermsByLine
  const rows = []
  for (const line of purchases) {
    const amount = Number(line.projected_amount)
    if (!Number.isFinite(amount) || amount === 0) continue
    const lineId = lineIdForCostCenter(line.id_cost_center)
    const pctIntRaw = Number(ratesByLine.get(lineId) ?? 0)
    const pctInt = !Number.isFinite(pctIntRaw) || pctIntRaw < 0 ? 0 : pctIntRaw
    if (pctInt === 0) continue // A-5/BR-INT-05: sin tasa ⇒ cero filas
    const intBase = amount - amount / (1 + pctInt) // BR-INT-01
    if (intBase <= INTERNMENT_EPSILON_COP) continue // §2.4-4 (float crudo)
    const terms = lineId === null ? undefined : termsByLine.get(lineId)
    if (terms && terms.length) {
      for (const term of terms) {
        const paymentPct = Number(term.payment_pct)
        if (!Number.isFinite(paymentPct)) continue
        rows.push({
          idCostCenter: line.id_cost_center,
          // FE-S14-IVA §4.1/D-FE14-3/AC-FE14-3: cada cuota del bloque "Pago
          // de internación" ×1.19 (el servicio de internación paga IVA; E6
          // del motor BE). Con modo OFF `grossDerived` es identidad exacta.
          amount: grossDerived(intBase * paymentPct),
          effectiveDate: addDaysISO(line.budget_date, Number(term.payment_days)) ?? line.budget_date
        })
      }
    } else {
      // BR-INT-04: Línea con tasa pero sin cuotas de internación ⇒ pago
      // completo el día de la importación.
      rows.push({
        idCostCenter: line.id_cost_center,
        amount: grossDerived(intBase),
        effectiveDate: line.budget_date
      })
    }
  }
  return rows
})

/**
 * ¿Hay cuotas de internación ARRASTRADAS del escenario N−1? §2.5: el bloque
 * también se muestra con `origin:"internment"` en el carryover (el BE ya
 * filtró por año, BR-CO-09 — aquí solo se detecta presencia). Lectura directa
 * de `budgetPlanningStore.carryover` (SD6-4: SOLO lee).
 */
const carryInternmentActive = computed(() => {
  const carry = budgetPlanningStore.carryover
  return (
    carry.enabled &&
    Array.isArray(carry.lines) &&
    carry.lines.some((line) => line.origin === 'internment')
  )
})

/** §2.5: render-condición del bloque (filas propias ∨ arrastre int ⇒ NFR-
 *  FE10-3: sin configuración ninguna de las dos ⇒ bloque ausente, DOM idéntico). */
const internmentPaymentsActive = computed(
  () => internmentPaymentRows.value.length > 0 || carryInternmentActive.value
)

/** Nota literal del bloque §2.5 (ACEPTACIÓN — `−` U+2212 verbatim). */
const INTERNMENT_PAYMENT_NOTE =
  'Desglose del valor importado: costo de internación = total − total/(1 + % internación de la Línea), pagado según sus propios términos. Informativo en caja: no altera el P&L (causación).'

/** Pivote del bloque "Pago de internación" (CECO de la compra × mes de
 *  vencimiento de la cuota; cuotas fuera de año → Antes/Después, FE-S8
 *  intacto). `null` ⇒ sin bloque. */
const internmentPaymentsPivot = computed(() => {
  if (!internmentPaymentsActive.value) return null
  return buildPivotFrom(internmentPaymentRows.value)
})

/* ─────────── FE-S14-IVA D-FE14-4: bloque "Pago de liquidación de IVA" (fuente settlementCache) ─────────── */

/**
 * Caché viva de la liquidación en el store (patrón `carryover`: SOLO lee,
 * SD6-4 heredado — jamás dispara HTTP desde la derivación). La recurrencia
 * con arrastre es el ÚNICO dato IVA que viaja del BE (D-FE14-4: no se
 * recalcula en FE para evitar divergencia); el bloque se alimenta de ella.
 */
const settlement = computed(() => budgetPlanningStore.settlement)

/**
 * Pivote de los DESEMBOLSOS de liquidación (frontend.03_14 §4.1/AC-FE14-5):
 * una fila por período con `payment > 0` (A8 del BE: `pago_p` es el único
 * desembolso), ubicada en el MES de `payment_due_date` del Calendario IVA.
 * Existe SOLO con el modo Con IVA activo (con OFF el DOM debe volver a los
 * netos byte-a-byte, AC-FE14-1) y con calendario respondido — sin
 * `iva_periods` el Flujo NO colapsa: simplemente no hay bloque (AC-FE14-5).
 * Vencimientos del último período que caen en N+1 viven en la columna
 * "Después de N" (regla FE-S8/AC-OY-9 intacta).
 * @returns {object|null} shape idéntico al de `buildPivotFrom`.
 */
const settlementPaymentsPivot = computed(() => {
  if (!ivaActive.value) return null
  const data = settlement.value.data
  const periods = data && Array.isArray(data.periods) ? data.periods : []
  if (!periods.length) return null
  const rows = []
  const columnTotals = Array.from({ length: 12 }, () => 0)
  let grandTotal = 0
  let beforeTotal = 0
  let afterTotal = 0
  let beforeAfterRowCount = 0
  for (const period of periods) {
    const payment = Number(period?.payment)
    if (!Number.isFinite(payment) || payment <= 0) continue
    const dueDate = typeof period.payment_due_date === 'string' ? period.payment_due_date : null
    const month = monthIndexOf(dueDate)
    const bucket = outOfYearBucket(dueDate)
    const months = Array.from({ length: 12 }, () => 0)
    let before = 0
    let after = 0
    if (month >= 0 && bucket === 0) {
      months[month] += payment
      columnTotals[month] += payment
    }
    if (bucket === -1) before = payment
    else if (bucket === 1) after = payment
    if (before + after !== 0) beforeAfterRowCount += 1
    beforeTotal += before
    afterTotal += after
    grandTotal += payment
    const periodNo = Number(period.period_no)
    rows.push({
      id: `iva-liq-${Number.isFinite(periodNo) ? periodNo : rows.length + 1}`,
      label: `Liquidación P${Number.isFinite(periodNo) ? periodNo : '—'} · vence ${formatDateEs(dueDate)}`,
      months,
      total: payment,
      before,
      after
    })
  }
  if (!rows.length || grandTotal <= 0) return null
  return { rows, columnTotals, grandTotal, beforeTotal, afterTotal, beforeAfterRowCount }
})

/**
 * Planeación tributaria: pagos netos de tributos por mes (FE-S17, integración
 * hermana de D-FE14-4). Fuente ÚNICA: `budgetPlanningStore.tax.cashFlow` — la
 * agregación server-side del motor (anticipo de renta en diciembre del año,
 * pagos bimestrales SIMPLE y vencimientos ICA/reteIVA/retención/reteICA) ya
 * excluye como caja los créditos, así que cada bucket cae directamente en el
 * mes/etiqueta que el BE le asignó; NUNCA se deriva ni re-coloca aquí.
 *
 * Buckets de `payment_year` distinto de N viven SOLO en Antes/Después
 * (misma regla FE-S8/AC-OY-9). Buckets SIN fecha (el BE los advierte en sus
 * warnings) se excluyen de la agregación para conservar exacta la
 * reconciliación Σ meses + Antes/Después = total anual; su monto queda
 * informativo en `undatedTotal` (nota del bloque).
 *
 * Sin cálculo ejecutado (`calculation_executed !== true`) ⇒ pivote null:
 * bloque ausente y resumen byte-idéntico (sumando 0 — AC-S17-FE-*).
 */
const taxPaymentsPivot = computed(() => {
  const data = budgetPlanningStore.tax?.cashFlow
  if (!data || data.calculation_executed !== true) return null
  const yearN = scenarioYear.value
  if (yearN === null) return null
  const buckets = Array.isArray(data.monthly) ? data.monthly : []
  if (!buckets.length) return null
  const rows = []
  const columnTotals = Array.from({ length: 12 }, () => 0)
  let grandTotal = 0
  let beforeTotal = 0
  let afterTotal = 0
  let beforeAfterRowCount = 0
  let undatedTotal = 0
  for (const bucket of buckets) {
    const amount = Number(bucket?.net_outflow ?? bucket?.cash_outflow)
    if (!Number.isFinite(amount) || amount === 0) continue
    const payYearRaw = Number(bucket.payment_year)
    const payMonthRaw = Number(bucket.payment_month)
    const payYear = Number.isInteger(payYearRaw) ? payYearRaw : null
    const payMonth = Number.isInteger(payMonthRaw) ? payMonthRaw : null
    if (payYear === null) {
      undatedTotal += amount
      continue
    }
    const months = Array.from({ length: 12 }, () => 0)
    let before = 0
    let after = 0
    if (payYear === yearN && payMonth !== null && payMonth >= 1 && payMonth <= 12) {
      months[payMonth - 1] += amount
      columnTotals[payMonth - 1] += amount
    } else if (payYear < yearN) {
      before = amount
    } else if (payYear > yearN) {
      after = amount
    }
    if (before + after !== 0) beforeAfterRowCount += 1
    beforeTotal += before
    afterTotal += after
    grandTotal += amount
    rows.push({
      id: `tax-pass-${payYear}-${payMonth ?? 'x'}-${rows.length + 1}`,
      label:
        payMonth !== null
          ? `Impuestos · vence ${payYear}-${String(payMonth).padStart(2, '0')}`
          : `Impuestos · año ${payYear}`,
      months,
      total: amount,
      before,
      after
    })
  }
  if (!rows.length) {
    // Solo buckets sin fecha: nada entra al resumen; el aviso vive en el BE.
    return null
  }
  return {
    rows,
    columnTotals,
    grandTotal,
    beforeTotal,
    afterTotal,
    beforeAfterRowCount,
    undatedTotal
  }
})

/** Nota del bloque de tributos (fuente server-side, cero hardcodes). */
const TAX_PAYMENTS_NOTE = computed(() => {
  const pivot = taxPaymentsPivot.value
  const undated =
    pivot && pivot.undatedTotal > 0
      ? ` Excluye ${pivot.undatedTotal.toLocaleString('es-CO')} sin fecha de pago (ver Planeación tributaria).`
      : ''
  return (
    'Pagos netos de la planeación tributaria del escenario: anticipo de renta de diciembre del año, ' +
    'pagos bimestrales SIMPLE y vencimientos de ICA/reteIVA/retención/reteICA ' +
    'según el Calendario tributario configurado. El monto ya netea los créditos aplicados. ' +
    'Fuente: motor server-side (dato del cálculo, no derivado).' +
    undated
  )
})

/**
 * Degradación NFR-FE14-3: error de red/5xx en el settlement CON el modo
 * activo ⇒ nota "sin dato de liquidación" + reintento (bloque del Flujo
 * ausente, panel propio con su banner; jamás pantalla rota). Sin modo activo
 * el settlement no se muestra ⇒ la nota tampoco.
 */
const settlementDegraded = computed(() => ivaActive.value && settlement.value.error === true)

/** Nota del bloque de liquidación (porcentaje derivado, cero hardcodes). */
const SETTLEMENT_PAYMENT_NOTE = computed(
  () =>
    `Pagos de la liquidación de IVA (${settlementTaxRateLabel.value} base caja) según los ` +
    'vencimientos del Calendario IVA; el monto ya netea los descuentos y el arrastre de saldos ' +
    'a favor. Fuente: motor de liquidación del escenario (dato server-side, no derivado).'
)

/**
 * Degradación §5 (espejo del patrón `costDegradation` de Ejecutiva): SOLO
 * con el catálogo de términos CAÍDO (`payableTermsError`) y además ingresos
 * que PRODUCIRÍAN filas (tasa de costo resolviendo a su month-end). Mientras
 * está EN VUELO (`!loaded` sin error) no se pinta nada — el bloque simplemente
 * aún no existe (cero parpadeo; DOM idéntico a FE-S4B en usuario nuevo,
 * AC-S7-FE-8).
 *
 * FE-S10 §2.4-5 (extiende FE-S9 §2.5-3): "produciría filas" cubre TAMBIÉN
 * los streams nuevos — con `internmentCatalogError` ambos streams de COMPRA
 * quedan cortocircuitados (D-FE10-3), así que el aviso aplica con cualquier
 * compra finita ≠ 0 (no requieren tasa de costo); la ruta `cogs` de los
 * ingresos NO depende del catálogo de internación (A-8) y su regla queda
 * intacta (solo `payableTermsError` la degrada).
 */
const costTermsDegraded = computed(() => {
  // FE-S10: catálogo de internación caído ⇒ streams de COMPRAS (proveedor +
  // internación) indegradables: cualquier compra que produciría filas dispara
  // el aviso compartido (`COGS_TERMS_UNAVAILABLE_NOTE`).
  if (budgetPlanningStore.internmentCatalogError) {
    for (const line of purchaseLines.value) {
      const amount = Number(line.projected_amount)
      if (Number.isFinite(amount) && amount !== 0) return true
    }
  }
  if (!budgetPlanningStore.payableTermsError) return false
  // FE-S9 §2.5-3 (con el matiz A-02 §7.1): "produciría filas" ahora cubre
  // AMBAS fuentes — COMPRAS (ninguna necesita tasa de costo: cualquier compra
  // finita ≠ 0 produce cuota, y sin catálogo tampoco puede derivarse) e
  // INGRESOS NO COMPRADORES POR LÍNEA (regla FE-S7 intacta; los de Línea
  // compradora ya no producirían nada — mismas claves D-4' que arriba).
  const rates = budgetPlanningStore.lineCostRates
  const purchasing = purchasingKeys.value
  for (const line of purchaseLines.value) {
    const amount = Number(line.projected_amount)
    if (Number.isFinite(amount) && amount !== 0) return true
  }
  return cogsIncomeLines.value.some((line) => {
    if (purchasing.has(sourceKeyForCostCenter(line.id_cost_center))) return false
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
 *
 * FE-S14-IVA (D-FE14-3): las filas pueden traer `rowKey`/`label` opcionales ⇒
 * se agrupan por esa clave SINTÉTICA con esa etiqueta fija (fila única "IVA de
 * importación" que agrega el IVA de todas las compras sin mezclarse con los
 * CECOS). Sin esas claves el comportamiento es idéntico al de FE-S7/FE-S10.
 * @param {Array<{ idCostCenter: number, amount: number, effectiveDate: string|null, rowKey?: string|number, label?: string }>} rows
 */
function buildPivotFrom(rows) {
  const byCeco = new Map()
  const columnTotals = Array.from({ length: 12 }, () => 0)
  let grandTotal = 0

  for (const item of rows) {
    const amount = Number(item.amount)
    if (!Number.isFinite(amount)) continue

    // FE-S14-IVA D-FE14-3: `rowKey`/`label` opcionales → agrupación SINTÉTICA
    // (fila única "IVA de importación" que suma todas las compras sin
    // mezclarse con CECOS). Sin ellos: comportamiento FE-S7 idéntico.
    const key = item.rowKey ?? item.idCostCenter
    if (!byCeco.has(key)) {
      byCeco.set(key, {
        id: key,
        label: item.label ?? budgetPlanningStore.costCenterLabel(item.idCostCenter),
        months: Array.from({ length: 12 }, () => 0),
        total: 0,
        before: 0,
        after: 0
      })
    }
    const row = byCeco.get(key)
    const month = monthIndexOf(item.effectiveDate)
    const bucket = outOfYearBucket(item.effectiveDate)
    // FE-S8-FLUJO-OY C-1 (AC-OY-9): MISMA regla que `buildPivot` — la cuota
    // con fecha de pago fuera de N vive solo en su columna Antes/Después.
    if (month >= 0 && bucket === 0) {
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

/** Capital servido por BE: bucket por CECO y fecha real de pago/vencimiento. */
const financingPrincipalPivot = computed(() => {
  const rows = props.financingPrincipalLines
    .filter((line) => Number.isFinite(Number(line.amount)) && Number(line.amount) !== 0)
    .map((line) => ({
      idCostCenter: line.id_cost_center,
      amount: line.amount,
      effectiveDate: line.payment_date
    }))
  if (!rows.length) return null
  return buildPivotFrom(rows)
})

/** New-credit disbursements are inflows, never expenses. */
const financingDisbursementPivot = computed(() => {
  const rows = props.financingDisbursementLines
    .filter((line) => Number.isFinite(Number(line.amount)) && Number(line.amount) !== 0)
    .map((line) => ({
      idCostCenter: line.id_cost_center,
      amount: line.amount,
      effectiveDate: line.payment_date
    }))
  if (!rows.length) return null
  return buildPivotFrom(rows)
})

/** Nota del bloque "Compras del mes (importaciones)" (literal §2.4): destino del pago. */
const COMPRAS_NOTE =
  'Valor de la mercancía importada por fecha de importación. El pago al proveedor se muestra, ' +
  'por términos de la Línea, en “Salidas — Pago a proveedores”.'

/**
 * Bloques del template. Orden vigente (FE-S9 §2.4 + FE-S10 §2.5): Entradas →
 * [Compras del mes] → [Pago a proveedores] → [Pago de internación] → Gastos
 * fijos → Gastos variables — el orden relativo FE-S4B/FE-S7 se conserva;
 * "Compras del mes" entra JUSTO antes de Pago a proveedores y solo con
 * compras; "Pago de internación" entra JUSTO DESPUÉS de Pago a proveedores
 * (antes de fijos) y solo con filas propias ∨ arrastre `internment`
 * (NFR-FE9-3/NFR-FE10-3: sin configuraciones el DOM es idéntico al previo).
 */
const blocks = computed(() => {
  // FE-S16 RF-1.1 (linkable) + Revisión 2 RF-8: los bloques base (Entradas,
  // Compras del mes, Gastos fijos) SON navegables al drill-down; los de
  // movimientos del Motor (capital, desembolsos) TAMBIÉN — el detalle los
  // reproduce con normalizePrincipalFlowLines. El resto de derivados (pago a
  // proveedores, internación, variables, liquidación, impuestos) NO enlaza:
  // el detalle no los reproduce.
  const list = [
    {
      title: 'Entradas',
      emptyName: 'entradas',
      pivot: entradasPivot.value,
      aria: 'Entradas (ingresos fijos) por centro de costo y mes según fecha de pago',
      note: ENTRADAS_NOTE.value,
      // §6.2: pivotes PROPIOS con fechas de pago que pueden caer fuera de N.
      ooy: true,
      linkable: true
    }
  ]
  if (financingDisbursementPivot.value) {
    list.splice(0, 0, {
      title: 'Entradas - Desembolso de financiación',
      emptyName: 'desembolsos de financiación',
      pivot: financingDisbursementPivot.value,
      aria: 'Entradas por desembolso de créditos de financiación',
      note: 'Desembolso de crédito nuevo: entrada de caja en la fecha de desembolso',
      ooy: true,
      // Revisión 2 RF-8: el detalle reproduce estos movimientos
      // (normalizePrincipalFlowLines, kind 'disbursement').
      linkable: true
    })
  }
  // FE-S9 §2.4: causación de importación ∈ N ⇒ `ooy: false` (sin columnas
  // extra ni chip): el bucket de una compra es 0 por construcción.
  if (comprasPivot.value.rows.length) {
    list.push({
      title: 'Compras del mes (importaciones)',
      emptyName: 'compras',
      pivot: comprasPivot.value,
      aria: 'Compras de importación del escenario por centro de costo y mes de importación',
      note: COMPRAS_NOTE,
      ooy: false,
      linkable: true
    })
  }
  // FE-S7 §5 (orden intacto desde FE-S8): después de Entradas (y ahora de
  // Compras) y antes de fijos; solo si la derivación produjo cuotas
  // (empty ⇒ el bloque no se renderiza — DOM idéntico a FE-S4B, AC-S7-FE-8).
  // `ooy: true`: los términos negativos pueden anclar antes del 01/01 y los
  // positivos después del 31/12 (AC-S7-FE-4) — buckets propios; regla
  // FE-S8/AC-OY-9 vigente: cuota ∈ 2026 ⇒ vive solo en Antes/Después.
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
  // FE-S10 §2.5 (D-FE10-2): bloque PROPIO de internación — destinatario y
  // plazos distintos, NUNCA mezclado con "Pago a proveedores" — insertado
  // JUSTO después de él y antes de fijos. Solo con filas propias ∨ cuotas de
  // arrastre `internment` (NFR-FE10-3). `ooy: true`: los términos pueden
  // anclar fuera de N (regla FE-S8/AC-OY-9 vigente: cuota ∉ N vive solo en
  // Antes/Después). Neto/salidas/acumulado lo incorpora la agregación del
  // `resumen`/`ooyColumns`, que suma los pivotes (sin lista hard-coded de
  // IDs de bloque — verificado §2.5).
  if (internmentPaymentsPivot.value) {
    list.push({
      title: 'Pago de internación',
      emptyName: 'pagos de internación',
      pivot: internmentPaymentsPivot.value,
      aria: 'Pago de internación del escenario por centro de costo y mes de vencimiento',
      note: INTERNMENT_PAYMENT_NOTE,
      ooy: true
    })
  }

  // Capital viene de un endpoint independiente del escenario y no se mezcla
  // con gastos fijos/variables ni con las líneas usadas por la P&L.
  if (financingPrincipalPivot.value) {
    list.push({
      title: 'Salidas — Capital de financiación',
      emptyName: 'pagos de capital de financiación',
      pivot: financingPrincipalPivot.value,
      aria: 'Pagos de capital de financiación por centro de costo y fecha de pago',
      note: 'Pago de capital: salida de financiación, no gasto P&L',
      ooy: true,
      // Revisión 2 RF-8: el detalle reproduce estos movimientos
      // (normalizePrincipalFlowLines, kind 'principal').
      linkable: true
    })
  }

  if (fijosPivot.value) {
    list.push({
      title: 'Salidas — Gastos fijos',
      emptyName: 'gastos fijos',
      pivot: fijosPivot.value,
      aria: 'Salidas de gastos fijos por centro de costo y mes según fecha de pago',
      ooy: true,
      linkable: true
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
  // FE-S14-IVA D-FE14-4: bloque NUEVO alimentado por `settlementCache` — los
  // pagos de la liquidación (períodos con `payment > 0`) en el MES de su
  // `payment_due_date`. Único dato IVA que viaja del BE (la recurrencia con
  // arrastre no se recalcula en FE). Sin calendario ni respuesta ⇒ sin
  // bloque (AC-FE14-5: el Flujo no colapsa); con modo OFF ⇒ sin bloque
  // (AC-FE14-1). `ooy: true`: vencimientos del último período caen en N+1.
  if (settlementPaymentsPivot.value) {
    list.push({
      title: 'Pago de liquidación de IVA',
      emptyName: 'pagos de liquidación de IVA',
      pivot: settlementPaymentsPivot.value,
      aria: 'Salidas de pago de liquidación de IVA por período del calendario y mes de vencimiento',
      note: SETTLEMENT_PAYMENT_NOTE.value,
      ooy: true
    })
  }
  // FE-S17: bloque de planeación tributaria — pagos netos de SIMPLE/renta/ICA/
  // reteIVA/retención/reteICA en el mes que el BE asignó (anticipo de renta en
  // diciembre del año; pagos por periodo). Sin cálculo ejecutado ⇒ sin bloque
  // (`taxPaymentsPivot` null). `ooy: true`: la renta ordinaria paga el saldo en
  // N+1 y los buckets de otros años viven en Antes/Después (FE-S8/AC-OY-9).
  if (taxPaymentsPivot.value) {
    list.push({
      title: 'Salidas — Impuestos (planeación tributaria)',
      emptyName: 'pagos de impuestos',
      pivot: taxPaymentsPivot.value,
      aria: 'Salidas de impuestos del planning tributario por mes de pago',
      note: TAX_PAYMENTS_NOTE.value,
      ooy: true
    })
  }
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
 *
 * FE-S9 §2.7: BE-S8 añadió el tercer origen `'purchase'` (cuota de compra
 * derivada server-side, `id_budget_line: null`, `line_type:"expense"`) — el
 * FIX colapsa a `'line'` solo lo que NO es `cogs`/`purchase`; grupos y orden
 * quedan line < cogs < purchase. Payloads sin `'purchase'` (los anteriores a
 * BE-S8) producen un DOM idéntico a FE-S7/FE-S8 (AC-FE9-5).
 *
 * FE-S10 §2.6: BE-S9 añadió el CUARTO origen `'internment'` (cuota de
 * internación arrastrada, misma forma) — la normalización lo reconoce y el
 * rank extiende el desempate a line < cogs < purchase < internment (espejo
 * del rank BE §5.4-3). Payloads sin `'internment'` ⇒ DOM idéntico a FE-S9.
 * @param {(line: object) => boolean} match
 */
/**
 * Orden de desempate por origen dentro del MISMO CECO (FE-S9 §2.7 + FE-S10
 * §2.6): `line` < `cogs` < `purchase` < `internment` — extensión del rank
 * BE §5.4-3 (`_carryover_order_key`, BR-CO-10 ampliado): para payloads sin
 * internment da exactamente el mismo resultado que FE-S9.
 */
const CARRY_ORIGIN_RANK = { line: 0, cogs: 1, purchase: 2, internment: 3 }

function buildCarryPivot(match) {
  if (!carryActive.value) return null
  const byCeco = new Map()
  const columnTotals = Array.from({ length: 12 }, () => 0)
  let grandTotal = 0

  for (const line of carryover.value.lines) {
    if (!match(line)) continue
    const amount = Number(line.projected_amount)
    if (!Number.isFinite(amount)) continue

    // FE-S9 §2.7 + FE-S10 §2.6 (FIX obligatorio): normalizar a
    // 'line' | 'cogs' | 'purchase' | 'internment' — antes TODO lo no-cogs
    // colapsaba a 'line' y una cuota 'purchase' del BE-S8 se habría
    // disfrazado de material; con BE-S9 la cuota de INTERNACIÓN llega con
    // `origin:"internment"` (id_budget_line null, línea `expense` derivada).
    // Payloads viejos (sin `origin` o con valores desconocidos) siguen
    // cayendo a 'line': DOM idéntico (R-S9-3 tolerado en BE, montos iguales).
    const origin = ['cogs', 'purchase', 'internment'].includes(line.origin) ? line.origin : 'line'
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

  // Orden etiqueta-asc (igual que FE-S6) + desempate por origen
  // line < cogs < purchase (FE-S9 §2.7 extiende el BR-CO-10 del server con
  // el mismo criterio — estable garantizado).
  const rows = [...byCeco.values()].sort(
    (a, b) =>
      a.label.localeCompare(b.label, 'es') ||
      CARRY_ORIGIN_RANK[a.origin] - CARRY_ORIGIN_RANK[b.origin]
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

/** Año real N−1 de la fuente para los prefijos "⌁ Costo {N−1}" / "⌁ Compra {N−1}" (FE-S7 §5 / FE-S9 §2.7; `source` manda). */
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

/**
 * Tooltip literal §2.7 (frontend.03_12) para las filas `origin:"purchase"`
 * — comparte el resolvedor de año/nombre de la fuente con `carryCogsRowTitle`.
 */
const carryPurchaseRowTitle = computed(() => {
  const source = carryover.value.source
  const name = source?.budget_name ?? 'año anterior'
  return `Cuota de compra derivada del escenario ${name} (${carryCogsYear.value}); no es una línea del escenario.`
})

/**
 * Tooltip literal §2.6 (frontend.03_13) para las filas `origin:"internment"`
 * (BE-S9: cuotas de internación arrastradas) — comparte el resolvedor de
 * año/nombre de la fuente con `carryCogsRowTitle`/`carryPurchaseRowTitle`.
 */
const carryInternmentRowTitle = computed(() => {
  const source = carryover.value.source
  const name = source?.budget_name ?? 'año anterior'
  return `Cuota de internación derivada del escenario ${name} (${carryCogsYear.value}); no es una línea del escenario.`
})

/** Per-origin tooltip de fila de arrastre (material | cogs | purchase | internment). */
const carryTitlesByOrigin = computed(() => ({
  line: carryRowTitle.value,
  cogs: carryCogsRowTitle.value,
  purchase: carryPurchaseRowTitle.value,
  internment: carryInternmentRowTitle.value
}))

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
      (costPaymentsPivot.value ? costPaymentsPivot.value.beforeAfterRowCount : 0) +
      // FE-S10 §2.5: mismo caso para "Pago de internación" (AC-OY-* siguen:
      // cuota int fuera de N vive solo en Antes/Después). Sin filas ⇒ 0.
      (internmentPaymentsPivot.value ? internmentPaymentsPivot.value.beforeAfterRowCount : 0) +
      (financingPrincipalPivot.value ? financingPrincipalPivot.value.beforeAfterRowCount : 0) +
      (financingDisbursementPivot.value
        ? financingDisbursementPivot.value.beforeAfterRowCount
        : 0) +
      // FE-S14-IVA: vencimiento de liquidación del último período puede caer
      // en N+1 ("Después de N"). Sin bloque ⇒ sumando 0 (DOM idéntico).
      (settlementPaymentsPivot.value ? settlementPaymentsPivot.value.beforeAfterRowCount : 0) +
      // FE-S17: el saldo de renta ordinaria se paga en N+1 ⇒ el toggle
      // también existe por él (sin pivote ⇒ 0, DOM idéntico).
      (taxPaymentsPivot.value ? taxPaymentsPivot.value.beforeAfterRowCount : 0) >
    0
)

/**
 * Columnas "fuera de año" del resumen de liquidez (FE-S8-FLUJO-OY C-2/FR-4):
 * series `[antes, después]` derivadas SOLO de los totales ya calculados de los
 * pivotes — cero re-recorridos de `budget_lines` (NFR-OY-1) y recálculo vivo
 * desde la misma caché reactiva (NFR-OY-2). Visibles solo con `anyOutOfYear`
 * + toggle ON (mismo lenguaje visual que los bloques). Entradas = buckets del
 * pivote de ingresos propios; Salidas = fijos + pago a proveedores + pago de
 * internación (FE-S10 §2.5; arrastre y variables aportan 0 a los buckets por
 * construcción — BR-CO-03/BR-LINE-04, no se recorren); Neto = entradas −
 * salidas por columna.
 */
const ooyColumns = computed(() => {
  const disbursement = financingDisbursementPivot.value
  const entradas = [
    entradasPivot.value.beforeTotal + (disbursement ? disbursement.beforeTotal : 0),
    entradasPivot.value.afterTotal + (disbursement ? disbursement.afterTotal : 0)
  ]
  const costes = costPaymentsPivot.value
  const internment = internmentPaymentsPivot.value
  const principal = financingPrincipalPivot.value
  // FE-S14-IVA: los vencimientos de liquidación fuera de N también bucketean.
  const liquidation = settlementPaymentsPivot.value
  // FE-S17: los tributos también bucketean fuera de año (renta ordinaria: el
  // saldo se paga en N+1 — §6 del spec tributario).
  const taxFlow = taxPaymentsPivot.value
  const salidas = [
    fijosPivot.value.beforeTotal +
      (costes ? costes.beforeTotal : 0) +
      (internment ? internment.beforeTotal : 0) +
      (principal ? principal.beforeTotal : 0) +
      (liquidation ? liquidation.beforeTotal : 0) +
      (taxFlow ? taxFlow.beforeTotal : 0),
    fijosPivot.value.afterTotal +
      (costes ? costes.afterTotal : 0) +
      (internment ? internment.afterTotal : 0) +
      (principal ? principal.afterTotal : 0) +
      (liquidation ? liquidation.afterTotal : 0) +
      (taxFlow ? taxFlow.afterTotal : 0)
  ]
  return {
    visible: anyOutOfYear.value && showOutOfYear.value,
    entradas,
    salidas,
    neto: [entradas[0] - salidas[0], entradas[1] - salidas[1]]
  }
})

/**
 * Resumen de liquidez (D-6, §4.5): construido SOLO de los
 * `columnTotals`/`grandTotal` de los bloques (ningún re-recorrido de
 * líneas). Neto = entradas − salidas por mes. FE-S8-FLUJO-OY C-3/FR-4:
 * `netoTotal` = entradasTotal − salidasTotal (neto ANUAL: reconcilia con las
 * filas aun con fuera-de-año; sin ellos coincide con Σ de los 12 netos —
 * R-OY-2). Acumulado = corrida desde Ene, Total = valor de diciembre (solo
 * meses ∈ N: con fuera-de-año ya NO equivale al neto anual).
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
 * `grandTotal`; FE-S8 C-1: la columna de un mes SIEMPRE excluye los buckets
 * antes/después — toggle ON u OFF: `row.total`/anual los conserva,
 * AC-S7-FE-4/AC-OY-9 "el total anual lo incluye"). Sin filas derivadas el
 * sumando es 0: resumen byte-idéntico a FE-S4B/FE-S6 (AC-S7-FE-8). El
 * acumulado sigue arrancando en 0 (ningún saldo nuevo arriba de la corrida).
 */
const resumen = computed(() => {
  const disbursement = financingDisbursementPivot.value
  const cobros = cobrosArrastre.value
  const pagos = pagosArrastre.value
  const costes = costPaymentsPivot.value
  // FE-S10 §2.5: el bloque propio "Pago de internación" entra a salidas por
  // la MISMA agregación de pivotes (sin lista hard-coded de IDs de bloque);
  // sin filas el sumando es 0: resumen byte-idéntico a FE-S9 (NFR-FE10-3).
  const internment = internmentPaymentsPivot.value
  const principal = financingPrincipalPivot.value
  // FE-S14-IVA D-FE14-4: la liquidación entra a salidas por la misma vía.
  const liquidation = settlementPaymentsPivot.value
  const entradasPropias = entradasPivot.value.columnTotals
  const fijos = fijosPivot.value.columnTotals
  const variables = variablesPivot.value ? variablesPivot.value.columnTotals : null

  const entradas = entradasPropias.map(
    (value, m) =>
      value +
      (cobros ? cobros.columnTotals[m] : 0) +
      (disbursement ? disbursement.columnTotals[m] : 0)
  )
  // FE-S17: los pagos tributarios entran a salidas por la misma vía del
  // bloque IVA (D-FE14-4): el BE ya decidió mes/amount neto de créditos.
  const taxFlow = taxPaymentsPivot.value
  const salidas = entradas.map(
    (_, m) =>
      fijos[m] +
      (variables ? variables[m] : 0) +
      (pagos ? pagos.columnTotals[m] : 0) +
      (costes ? costes.columnTotals[m] : 0) +
      (internment ? internment.columnTotals[m] : 0) +
      (principal ? principal.columnTotals[m] : 0) +
      // FE-S14-IVA: pago de liquidación al mes de su vencimiento (D-FE14-4).
      (liquidation ? liquidation.columnTotals[m] : 0) +
      (taxFlow ? taxFlow.columnTotals[m] : 0)
  )
  const neto = entradas.map((value, m) => value - salidas[m])

  let acc = 0
  const acumulado = neto.map((value) => {
    acc += value
    return acc
  })

  const entradasTotal =
    entradasPivot.value.grandTotal +
    (cobros ? cobros.grandTotal : 0) +
    (disbursement ? disbursement.grandTotal : 0)
  const salidasTotal =
    fijosPivot.value.grandTotal +
    (variablesPivot.value ? variablesPivot.value.grandTotal : 0) +
    (pagos ? pagos.grandTotal : 0) +
    (costes ? costes.grandTotal : 0) +
    (internment ? internment.grandTotal : 0) +
    (principal ? principal.grandTotal : 0) +
    (liquidation ? liquidation.grandTotal : 0) +
    // FE-S17: los tributos del año y sus buckets fuera de año al total anual
    // (AC-OY-9: el total anual lo incluye).
    (taxFlow ? taxFlow.grandTotal : 0)
  // FE-S8 C-3 (FR-4): neto ANUAL = entradas − salidas (ya no Σ de los 12
  // netos: con fuera-de-año esos importes no viven en ningún mes pero sí en
  // los totales; sin fuera-de-año el valor es idéntico — R-OY-2).
  const netoTotal = entradasTotal - salidasTotal
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

/**
 * ─────────── FE-S9-PURCHASES-BODEGA §2.6: fila "Bodega estimada (cierre)" ───────────
 * Derivación PURA de presentación (informativa): NUNCA toca entradas/salidas/
 * neto/acumulado — el resumen de caja cuadra igual. Se construye SOLO de
 * totales ya memoizados + una pasada de `cogsIncomeLines` (NFR-FE9-1).
 */

/** Compras causadas por mes (`columnTotals` del bloque §2.4; ceros si no hay). */
const comprasPorMes = computed(() => comprasPivot.value.columnTotals)

/**
 * Costo de ventas CAUSADO por mes de causación: Σ `monto × pct / 100` sobre
 * los INGRESOS FIJOS propios con `pct = resolveCogsPctByLine(lineCostRates,
 * id_line(CECO), monthEnd(budget_date))` — MISMO resolvedor compartido de la
 * Ejecutiva/FE-S7 (cero divergencia). `pct` `null` ⇒ contribuye 0.
 * INDEPENDIENTE de `payableTermsByLine`: la bodega funciona aunque el
 * catálogo de términos esté caído (§2.6). Incluye TAMBIÉN los ingresos de
 * las Líneas compradoras y de sus CECOS zonales (es causación P&L, no caja:
 * el switch D-4' de A-02 solo afecta a las cuotas de pago).
 */
const costoCausadoPorMes = computed(() => {
  const out = Array.from({ length: 12 }, () => 0)
  const rates = budgetPlanningStore.lineCostRates
  for (const line of cogsIncomeLines.value) {
    const amount = Number(line.projected_amount)
    if (!Number.isFinite(amount) || amount === 0) continue
    const month = monthIndexOf(line.budget_date)
    if (month < 0) continue
    const pct = resolveCogsPctByLine(
      rates,
      lineIdForCostCenter(line.id_cost_center),
      monthEndOf(line.budget_date)
    )
    if (pct === null || !Number.isFinite(pct)) continue
    out[month] += (amount * pct) / 100
  }
  return out
})

/** `bodega[m] = bodega[m−1] + compras[m] − costoCausado[m]`, `bodega[−1] = 0` (D-FE9-3). */
const bodegaMes = computed(() => {
  const compras = comprasPorMes.value
  const costos = costoCausadoPorMes.value
  const out = []
  let acc = 0
  for (let month = 0; month < 12; month += 1) {
    acc += compras[month] - costos[month]
    out.push(acc)
  }
  return out
})

/** ¿Algún mes negativo? ⇒ nota literal bajo la tabla del resumen (§2.6). */
const bodegaNegative = computed(() => bodegaMes.value.some((value) => value < 0))

/** `totalTitle` literal §2.6 (cabecera de la fila en el Resumen). */
const BODEGA_TOTAL_TITLE =
  'Σ compras − Σ costo de ventas causado, acumulado mes a mes (arranca en 0 en enero). ' +
  'Estimación: el costo de lo vendido se valúa a cogs_pct; no es efectivo y no suma al neto.'

/** Nota literal §2.6 (solo si algún mes de bodega < 0). */
const BODEGA_NEGATIVE_NOTE =
  'La bodega estimada quedó negativa: se está vendiendo costo de períodos previos al ' +
  'escenario o la tasa de costo está sub-calibrada.'

/* ─────────── FE-S18 (spec frontend.03_18) Fase 3: celdas SIN símbolo ─────────── */

/**
 * RF-7/RF-2.2 — UMBRAL de compactación de celda (mismo patrón que la Vista
 * Ejecutiva): con la cuadrícula fija de 106px (RF-1.3) y `formatMoneyPlain`,
 * un monto ≥ 1.000.000.000 («1.234.567.890», 13 chars) no cabe en la celda →
 * `formatMoneyCompact`; el valor completo vive en el `title` (AC-4).
 */
const COMPACT_CELL_THRESHOLD = 1_000_000_000

/** ¿La celda necesita `title` con el valor completo plain? (RF-2.2/AC-4). */
function cellTitle(value) {
  return value !== null && Math.abs(Number(value)) >= COMPACT_CELL_THRESHOLD
    ? formatMoneyPlain(value)
    : null
}

/** Texto de celda AJUSTADO a la columna fija: plain cuando cabe, compacto cuando no (RF-7 + RF-2.2). */
function fitMoney(value) {
  return Math.abs(Number(value)) >= COMPACT_CELL_THRESHOLD
    ? formatMoneyCompact(value)
    : formatMoneyPlain(value)
}

/**
 * Título de la celda Total del resumen (RF-2.2/AC-4): el título SEMÁNTICO
 * manda (bodega, neto anual…); si además la celda quedó compacta (≥ 1e9) se
 * le añade el valor plain para no perder la cifra exacta.
 * @param {number} raw monto TOTAL crudo
 * @param {string|null} [semantic=null] título semántico literal vigente
 * @returns {string|null}
 */
function totalTitleText(raw, semantic = null) {
  const full = cellTitle(raw)
  if (!semantic) return full
  return full ? `${semantic} · ${full}` : semantic
}

/** `0` → '·' (patrón Ejecutiva); el resto sin símbolo (RF-7: plain/compacto). */
function resumenCell(value) {
  return value === 0 ? '·' : fitMoney(value)
}

/**
 * Filas del resumen de liquidez (§4.5). `signed`: neto/acumulado → rojos si < 0.
 * FE-S8 C-4: cada fila gana `ooy` = celdas `[Antes, Después]` derivadas de
 * `ooyColumns` (Σ Entradas/Σ Salidas: sus buckets; Flujo neto: el neto del
 * bucket con `pt-negative` si < 0, igual que sus hermanos; Flujo acumulado:
 * literal `—` con `title` — la corrida solo cubre Ene–Dic de N).
 * FE-S18 RF-7: TODAS las celdas sin símbolo (`fitMoney`); RF-2.2: `title`
 * con el valor plain completo en las celdas compactas (`cellTitle`) y en el
 * Total el semántico vigente se fusiona con la cifra (`totalTitleText`).
 */
const resumenRows = computed(() => {
  const r = resumen.value
  const ooy = ooyColumns.value
  const moneyCell = (value) => (value === 0 ? '·' : fitMoney(value))
  const unsignedCells = (series) =>
    series.map((value) => ({ text: moneyCell(value), negative: false, title: cellTitle(value) }))
  const signedCells = (series) =>
    series.map((value) => ({
      text: moneyCell(value),
      negative: value < 0,
      title: cellTitle(value)
    }))
  const dashCell = {
    text: '—',
    negative: false,
    title: `La corrida acumulada cubre solo los meses Ene–Dic de ${scenarioYear.value}.`
  }
  return [
    {
      label: 'Σ Entradas',
      months: r.entradas,
      totalText: fitMoney(r.entradasTotal),
      negativeTotal: false,
      signed: false,
      strong: false,
      totalTitle: totalTitleText(r.entradasTotal),
      ooy: unsignedCells(ooy.entradas)
    },
    {
      label: 'Σ Salidas',
      months: r.salidas,
      totalText: fitMoney(r.salidasTotal),
      negativeTotal: false,
      signed: false,
      strong: false,
      totalTitle: totalTitleText(r.salidasTotal),
      ooy: unsignedCells(ooy.salidas)
    },
    {
      label: 'Flujo neto',
      months: r.neto,
      totalText: resumenCell(r.netoTotal),
      negativeTotal: r.netoTotal < 0,
      signed: true,
      strong: true,
      totalTitle: totalTitleText(
        r.netoTotal,
        'Flujo neto anual: Σ entradas − Σ salidas. Incluye los montos con fecha de pago fuera del año.'
      ),
      ooy: signedCells(ooy.neto)
    },
    {
      label: 'Flujo acumulado',
      months: r.acumulado,
      totalText: resumenCell(r.acumuladoTotal),
      negativeTotal: r.acumuladoTotal < 0,
      signed: true,
      strong: true,
      totalTitle: totalTitleText(
        r.acumuladoTotal,
        'Corrida acumulada desde enero; el total corresponde al valor de diciembre. Solo cubre los meses del año del escenario: con montos fuera de año NO equivale al flujo neto anual (ese es el Total de “Flujo neto”).'
      ),
      ooy: [dashCell, { ...dashCell }]
    },
    // FE-S9 §2.6: fila INFORMATIVA al final (se renderiza SIEMPRE — aun sin
    // compras, bodega = −Σ costos causados; única diferencia DOM admitida
    // frente a FE-S8 en un escenario sin compras, NFR-FE9-3). `bodega: true`
    // enruta los negativos al ámbar `.cf-bodega-negative` en el template, NO
    // al rojo de caja `pt-negative`; `signed/strong: false`: no entra en
    // entradas/salidas/neto/acumulado. Antes/Después: '—' (es por mes ∈ N).
    {
      label: 'Bodega estimada (cierre)',
      months: bodegaMes.value,
      totalText: resumenCell(bodegaMes.value[11]),
      negativeTotal: bodegaMes.value[11] < 0,
      signed: false,
      strong: false,
      bodega: true,
      labelTitle:
        'Fila informativa: no entra en entradas, salidas, neto ni acumulado del resumen de caja.',
      totalTitle: totalTitleText(bodegaMes.value[11], BODEGA_TOTAL_TITLE),
      ooy: [
        {
          text: '—',
          negative: false,
          title: `La bodega estimada se calcula solo por mes ∈ ${scenarioYear.value}; los montos fuera de año no aplican.`
        },
        {
          text: '—',
          negative: false,
          title: `La bodega estimada se calcula solo por mes ∈ ${scenarioYear.value}; los montos fuera de año no aplican.`
        }
      ]
    }
  ]
})

/** Celda negativa (neto/acumulado < 0) → clase `pt-negative` (§4.5, componente). */
function negativeCell(row, value) {
  return row.signed && value < 0
}

/* ─────────── FE-S18 Fase 3: notas → tooltip ⓘ y columnas extra del toggle ─────────── */

/**
 * Cabeceras (y `<col>`s) de las columnas extra del toggle "fuera de año"
 * (RF-1.5): las renderiza `PivotMonthTable` DESPUÉS de la col Total (mismo
 * orden vigente del thead del resumen), heredan 106px y ganan el `title`
 * D-OY vigente. Condición resumen = `ooyColumns.visible` (el idioma visual
 * de los bloques es `showOutOfYear && block.ooy`, aplicado en el template).
 */
const ooyExtras = computed(() => {
  if (!showOutOfYear.value || scenarioYear.value === null) return []
  return [
    {
      label: `Antes de ${scenarioYear.value}`,
      title: `Montos con fecha de pago anterior al 01/01/${scenarioYear.value}. No forman parte de los meses ni del acumulado Ene–Dic.`
    },
    {
      label: `Después de ${scenarioYear.value}`,
      title: `Montos con fecha de pago posterior al 31/12/${scenarioYear.value}. No forman parte de los meses ni del acumulado Ene–Dic.`
    }
  ]
})

/**
 * RF-3.2: las notas de cobertura del resumen (antes `<p>` visibles
 * condicionales) se juntan en el tooltip ⓘ del título del bloque — MISMOS
 * literales, cero invención; el ícono solo existe cuando aplica al menos
 * una (RF-3.3: si no hay nada que aclarar, sin badge).
 */
const resumenCoverageNote = computed(() => {
  const parts = []
  if (carryActive.value) parts.push(`El resumen incluye arrastre ${carrySourceYear.value}.`)
  if (costPaymentsActive.value) {
    parts.push('El resumen incluye pago a proveedores (costo de ventas).')
  }
  if (settlementPaymentsPivot.value) {
    parts.push('El resumen incluye pago de liquidación de IVA (base caja, proyectado).')
  }
  if (financingPrincipalPivot.value) {
    parts.push('El resumen incluye pagos de capital de financiación; no son gastos P&L.')
  }
  return parts.join(' ') || null
})

/** RF-3.2: nota descriptiva del bloque de arrastre (base + modo IVA si aplica). */
const carryBlockNote = computed(() => {
  const base = `Arrastre automático del escenario ${carrySourceYear.value}: solo afecta a esta Vista Flujo; no genera líneas.`
  return ivaActive.value ? `${base} Los arrastres se muestran netos (v1).` : base
})
</script>

<template>
  <!-- FE-S18 Fase 3 (RF-3.1/RF-4.2): la intro "Matriz de solo lectura…" ya
       NO vive aquí — se provee UNA VEZ a nivel tab en BudgetGridEditor, junto
       con "Σ meses + fuera de año = total anual" (RF-4.3). -->
  <div class="cf-zone">
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

    <!-- Estado vacío extremo: sin líneas presupuestarias, capital NI arrastre. -->
    <p v-if="!hasLines && !carryActive" class="cf-empty">
      Este escenario no tiene líneas presupuestadas ni pagos de capital de financiación. Cárguelas o
      édítelas en “Editor de Celdas”.
    </p>

    <template v-else>
      <!-- Resumen de liquidez (D-6, §4.5): SIEMPRE con líneas, aun con bloques vacíos.
           Enmienda 2026-10-15 (stakeholder): el resumen va PRIMERO en la vista —
           antes de los bloques propios y del arrastre (antes quedaba al final). -->
      <section class="cf-block">
        <h4 class="cf-block-title">
          Resumen de liquidez
          <!-- FE-S18 RF-3.2: las notas de cobertura del resumen (arrastre, pago a
               proveedores, liquidación, capital) ya no son texto visible — se
               unen en el tooltip ⓘ del título (mismos literales, condiciones
               idénticas, RF-3.4). -->
          <span v-if="resumenCoverageNote" class="cf-info" :title="resumenCoverageNote">ⓘ</span>
        </h4>
        <PivotMonthTable
          label-header="Concepto"
          :month-labels="MONTH_LABELS"
          aria-label="Resumen de liquidez mensual del escenario: entradas, salidas, flujo neto y flujo acumulado"
          :extra-columns="ooyColumns.visible ? ooyExtras : []"
        >
          <tr v-for="row in resumenRows" :key="row.label" :class="{ 'pt-row-strong': row.strong }">
            <th class="pt-row-label" scope="row" :title="row.labelTitle">
              {{ row.label }}
            </th>
            <td
              v-for="(value, index) in row.months"
              :key="index"
              class="pt-cell-money"
              :class="{
                'pt-negative': negativeCell(row, value),
                'cf-bodega-negative': row.bodega && value < 0
              }"
              :title="cellTitle(value)"
            >
              {{ resumenCell(value) }}
            </td>
            <td
              class="pt-cell-money pt-cell-total"
              :class="{
                'pt-negative': row.negativeTotal && !row.bodega,
                'cf-bodega-negative': row.bodega && row.negativeTotal
              }"
              :title="row.totalTitle"
            >
              {{ row.totalText }}
            </td>
            <!-- FE-S8 C-4: buckets [Antes, Después] de cada fila
                 (acumulado: `—` con `title`, §FR-4). -->
            <template v-if="ooyColumns.visible">
              <td
                v-for="(cell, index) in row.ooy"
                :key="index"
                class="pt-cell-money cf-cell-ooy"
                :class="{ 'pt-negative': cell.negative }"
                :title="cell.title"
              >
                {{ cell.text }}
              </td>
            </template>
          </tr>
        </PivotMonthTable>
        <!-- FE-S9 §2.6: nota bajo la tabla SOLO si algún mes de bodega < 0
             (mismo lenguaje ámbar de la degradación — no es error rojo). RF-3.3:
             los avisos de degradación siguen VISIBLES con `v-if`. -->
        <p v-if="bodegaNegative" class="cf-warn" role="status">{{ BODEGA_NEGATIVE_NOTE }}</p>
        <!-- FE-S7 §5: aviso ámbar de degradación (CATÁLOGO DE TÉRMINOS CAÍDO
             con filas que se producirían — FE-S9: compras o ingresos de
             Líneas NO compradoras D-4'/A-02): el bloque derivado NO se
             renderiza y el resto del Flujo queda intacto (AC-S7-FE-7). Bajo
             el resumen, junto al pie del §6.2. -->
        <p v-if="costTermsDegraded" class="cf-warn" role="status">
          {{ COGS_TERMS_UNAVAILABLE_NOTE }}
        </p>
        <!-- FE-S14-IVA NFR-FE14-3: error de red en el settlement ⇒ nota "sin
             dato de liquidación" + reintento (sin bloque, sin pantalla rota). -->
        <div v-if="settlementDegraded" class="cf-warn cf-warn-row" role="status">
          <span>
            Sin dato de liquidación de IVA (no fue posible consultarla). El bloque “Pago de
            liquidación de IVA” y el panel “Liquidación” quedan temporalmente sin cifras.
          </span>
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            :disabled="settlement.loading"
            @click="budgetPlanningStore.fetchIvaSettlement(scenario.id_budget, { force: true })"
          >
            Reintentar
          </button>
        </div>
      </section>
      <section v-for="block in blocks" :key="block.title" class="cf-block">
        <h4 class="cf-block-title">
          {{ block.title }}
          <!-- FE-S18 RF-3.2: la nota descriptiva del bloque (ENTRADAS_NOTE,
               COMPRAS_NOTE, COGS_PAYMENT_NOTE, INTERNMENT_PAYMENT_NOTE,
               SETTLEMENT_PAYMENT_NOTE, TAX_PAYMENTS_NOTE, VARIABLE_PIVOT_NOTE
               e inline 1284/1343) pasa a tooltip ⓘ junto al subtítulo. -->
          <span v-if="block.note" class="cf-info" :title="block.note">ⓘ</span>
        </h4>
        <!-- Chip §6.2: columnas ocultas + pendientes fuera de año ⇒ NUNCA se
             oculta (mentirle al banquero es el bug que matamos); clic = ON.
             RF-3.3: sigue visible con `v-if` — esta es la señal que antes
             repetía el pie "El total anual incluye N filas fuera de año". -->
        <button
          v-if="block.ooy && !showOutOfYear && block.pivot.beforeAfterRowCount > 0"
          type="button"
          class="cf-ooy-chip"
          :aria-label="`Mostrar las ${block.pivot.beforeAfterRowCount} filas con montos fuera de año en ${block.title}`"
          @click="showOutOfYear = true"
        >
          ⊘ {{ block.pivot.beforeAfterRowCount }} filas con montos fuera de año
        </button>
        <PivotMonthTable
          v-if="block.pivot.rows.length"
          label-header="CECO"
          :month-labels="MONTH_LABELS"
          :aria-label="block.aria"
          :extra-columns="block.ooy && showOutOfYear ? ooyExtras : []"
        >
          <tr v-for="row in block.pivot.rows" :key="row.id">
            <th class="pt-row-label" scope="row" :title="row.label">
              <!-- FE-S16 RF-1: única celda interactiva — el CECO enlaza al
                   detalle de movimientos (hover/focus en la CELDA, RF-1.3).
                   Filas sintéticas (IVA de importación, liquidación,
                   impuestos) o catálogo caído ⇒ texto plano (RF-1.2). -->
              <RouterLink
                v-if="block.linkable && cecoLink(row.id)"
                class="cf-ceco-link"
                :to="cecoLink(row.id).to"
                :aria-label="`Ver detalle de movimientos de CECO ${cecoLink(row.id).code}`"
              >
                {{ row.label }}
              </RouterLink>
              <template v-else>{{ row.label }}</template>
            </th>
            <td
              v-for="(value, index) in row.months"
              :key="index"
              class="pt-cell-money"
              :title="cellTitle(value)"
            >
              {{ value === 0 ? '·' : fitMoney(value) }}
            </td>
            <td class="pt-cell-money pt-cell-total" :title="cellTitle(row.total)">
              {{ fitMoney(row.total) }}
            </td>
            <template v-if="showOutOfYear && block.ooy">
              <td class="pt-cell-money cf-cell-ooy" :title="cellTitle(row.before)">
                {{ row.before === 0 ? '·' : fitMoney(row.before) }}
              </td>
              <td class="pt-cell-money cf-cell-ooy" :title="cellTitle(row.after)">
                {{ row.after === 0 ? '·' : fitMoney(row.after) }}
              </td>
            </template>
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
                {{ value === 0 ? '·' : fitMoney(value) }}
              </td>
              <td class="pt-cell-money pt-cell-total" :title="cellTitle(block.pivot.grandTotal)">
                {{ fitMoney(block.pivot.grandTotal) }}
              </td>
              <template v-if="showOutOfYear && block.ooy">
                <td class="pt-cell-money cf-cell-ooy" :title="cellTitle(block.pivot.beforeTotal)">
                  {{ block.pivot.beforeTotal === 0 ? '·' : fitMoney(block.pivot.beforeTotal) }}
                </td>
                <td class="pt-cell-money cf-cell-ooy" :title="cellTitle(block.pivot.afterTotal)">
                  {{ block.pivot.afterTotal === 0 ? '·' : fitMoney(block.pivot.afterTotal) }}
                </td>
              </template>
            </tr>
          </template>
        </PivotMonthTable>
        <p v-else class="cf-empty">Sin líneas de {{ block.emptyName }} en este escenario.</p>
        <!-- FE-S18 RF-4.3: los pies por bloque — «Σ meses + fuera de año = total
             anual» (ON) y «El total anual incluye N filas fuera de año» (OFF) —
             SE QUITAN del render visible: la fórmula vive en la intro de tab
             (Fase 4) y la N exacta la sigue mostrando el chip ⊘ de arriba. -->
      </section>

      <!-- ================= Arrastre N−1 (FE-S6 §6.1, componente B) =================
           UN bloque tras los propios; dos tablas (Cobros/Pagos) omitiendo la cara
           vacía. Filas con prefijo tenue `←` + tooltip R-S6-1; sin columnas
           fuera-de-año (las fechas efectivas del arrastre siempre son ∈ N). -->
      <section v-if="carryActive" class="cf-block">
        <h4 class="cf-block-title">
          Saldos de {{ carrySourceYear }} (arrastre)
          <!-- FE-S18 RF-3.2: nota descriptiva §6.1 y la nota de netos (v1) →
               tooltip ⓘ único (mismos literales; RF-3.4). -->
          <span class="cf-info" :title="carryBlockNote">ⓘ</span>
        </h4>
        <section v-for="carryTable in carryTables" :key="carryTable.title" class="cf-carry-table">
          <h5 class="cf-carry-subtitle">{{ carryTable.title }}</h5>
          <PivotMonthTable
            label-header="CECO"
            :month-labels="MONTH_LABELS"
            :aria-label="carryTable.aria"
          >
            <tr v-for="row in carryTable.pivot.rows" :key="row.key">
              <th
                class="pt-row-label pt-row-muted"
                scope="row"
                :title="carryTitlesByOrigin[row.origin]"
              >
                <!-- FE-S7 §5: la fila MATERIAL se pinta byte-idéntica a
                     FE-S6 (`← label`); la cuota derivada `origin:"cogs"`
                     gana el prefijo "⌁ Costo {N−1}" y su tooltip propio.
                     FE-S9 §2.7: la cuota `origin:"purchase"` (BE-S8)
                     gana "⌁ Compra {N−1}" + tooltip de compra.
                     FE-S10 §2.6: la cuota `origin:"internment"` (BE-S9)
                     gana "⌁ Internación {N−1}" + tooltip propio. -->
                <template v-if="row.origin === 'cogs'"
                  >⌁ Costo {{ carryCogsYear }} · {{ row.label }}</template
                >
                <template v-else-if="row.origin === 'purchase'"
                  >⌁ Compra {{ carryCogsYear }} · {{ row.label }}</template
                >
                <template v-else-if="row.origin === 'internment'"
                  >⌁ Internación {{ carryCogsYear }} · {{ row.label }}</template
                >
                <template v-else>← {{ row.label }}</template>
              </th>
              <td
                v-for="(value, index) in row.months"
                :key="index"
                class="pt-cell-money"
                :title="cellTitle(value)"
              >
                {{ value === 0 ? '·' : fitMoney(value) }}
              </td>
              <td class="pt-cell-money pt-cell-total" :title="cellTitle(row.total)">
                {{ fitMoney(row.total) }}
              </td>
            </tr>
            <template #tfoot>
              <tr>
                <th class="pt-row-label" scope="row">Σ Total</th>
                <td
                  v-for="(value, index) in carryTable.pivot.columnTotals"
                  :key="index"
                  class="pt-cell-money"
                  :title="cellTitle(value)"
                >
                  {{ value === 0 ? '·' : fitMoney(value) }}
                </td>
                <td
                  class="pt-cell-money pt-cell-total"
                  :title="cellTitle(carryTable.pivot.grandTotal)"
                >
                  {{ fitMoney(carryTable.pivot.grandTotal) }}
                </td>
              </tr>
            </template>
          </PivotMonthTable>
        </section>
      </section>
    </template>
    <ScenarioTaxPaymentsBlock :scenario="scenario" />
  </div>
</template>

<style scoped>
/* FE-S18 Fase 3 (RF-2.1/RF-6): el lenguaje visual de las tablas pivote
 * (scroll, colgroup, sticky, zebra, totales, negativos) vive EN
 * `PivotMonthTable.vue` (clases `pt-*`, compartido con la Ejecutiva).
 * Aquí solo queda el chrome propio del Flujo: bloque/título/empty, toggle
 * fuera-de-año, banda de celdas extra, arrastre, avisos de degradación. */

.cf-zone {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.cf-block-title {
  margin: 0 0 8px;
  font-size: 0.86rem;
  font-weight: 700;
  color: var(--color-text-primary, #070707);
}

/* FE-S18 RF-3.2: ícono ⓘ de nota descriptiva junto al subtítulo del bloque
 * (tooltip nativo `title`) — MISMO estilo que la Vista Ejecutiva. Texto
 * estático; los avisos con `v-if` (cf-empty/cf-warn/chip) siguen visibles
 * (RF-3.3). */
.cf-info {
  margin-left: 6px;
  font-size: 0.8rem;
  font-weight: 400;
  color: var(--color-text-muted, #8a8a8a);
  cursor: help;
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

/* Celdas "Antes/Después": borde izquierdo discontinuo sobre la banda clara
 * del `th.pt-col-extra` del componente (solo la celda, una regla única — el
 * markup/estilos de tabla viven en el componente). */
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

/* ---------- FE-S7 §5: aviso de degradación del bloque derivado ---------- */

/* Mismo lenguaje ámbar `pv-warn` de la Ejecutiva (información de cobertura,
 * NUNCA error rojo) y colocación bajo el resumen. RF-3.3: visible con `v-if`. */
.cf-warn {
  margin: 8px 0 0;
  padding: 8px 12px;
  border: 1px solid rgba(180, 83, 9, 0.4);
  border-radius: 8px;
  background-color: rgba(245, 158, 11, 0.1);
  font-size: 0.78rem;
  color: var(--color-text-secondary, #555555);
}

/* FE-S14-IVA NFR-FE14-3: variante con acción (nota de settlement + Reintentar). */
.cf-warn-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
}

/* FE-S16 (frontend.03_19) RF-1.3/RF-7.3: affordance de la celda CECO —
 * mismo lenguaje que la Ejecutiva (`pv-ceco-link`): cursor pointer, hover
 * y focus de la CELDA (jamás de la fila completa/color de celdas de
 * valores). */
.cf-ceco-link {
  color: inherit;
  text-decoration: none;
  cursor: pointer;
}

.cf-ceco-link:hover {
  color: var(--color-brand, #03658c);
  text-decoration: underline;
}

:root[data-theme='dark'] .cf-ceco-link:hover {
  color: #56c8ee;
}

.cf-ceco-link:focus-visible {
  outline: 2px solid var(--color-brand, #03658c);
  outline-offset: 2px;
}

/* ---------- FE-S9 §2.6: negativos de "Bodega estimada" en ámbar ---------- */
/* NO es rojo de caja (`pt-negative`): la bodega es una estimación
 * informativa de inventario; la familia ámbar es la del chip ⊘/`cf-warn`. */
.cf-bodega-negative {
  color: #b7791f;
}

:root[data-theme='dark'] .cf-bodega-negative {
  color: #f6e05e;
}
</style>
