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
 *    (Q4=4 — nunca mentirle al banquero).
 *    **ENMIENDA A-05** (spec `frontend.03_21` §14, 2026-10-21):
 *    `row.total`/`grandTotal` = solo la Σ de los 12 meses (BR-FE21-16); el
 *    todo-inclusive pasa a `row.generalTotal`/`grandGeneralTotal` y se pinta
 *    como columna "Total General" DESPUÉS de `Después de {N}` (orden
 *    `Ene…Dic | Antes | Después | Total | Total General`), con el gate de las
 *    Antes/Después + `beforeAfterRowCount > 0` (BR-FE21-17/19). Los archivos
 *    exportables (`planningExportSheets.js`) usan el MISMO gate y orden.
 *    Las columnas ooy ahora van ANTES del Total (`extrasBeforeTotal`)
 *    y — cuando la tabla tiene la col General — AMBAS quedan pinned right
 *    (`pt-cell-total-inner` = offset de la General, §14.7 2026-10-21).
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
  IVA_RATE,
  resolveCogsPctByLine
} from './planningFormat.js'
import { costCenterCodeOf, lineIdForCostCenter } from './cecoMovements.js'
/**
 * FE-S20 (spec `frontend.03_20` §7.2): TODO el cómputo de la matriz de
 * liquidez (pivotes por bloque, cuotas derivadas FE-S7/S9/S10, liquidación
 * FE-S14, impuestos FE-S17, arrastre FE-S6, resumen y bodega) vive en el
 * helper compartido `cashFlowPivot.js` — LAS MISMAS funciones de agregación
 * que consume el botón "Exportar" — extraídas verbatim de este componente
 * (cero cambio de comportamiento); aquí queda solo la presentación
 * (celdas `·`/`—`/compactas, notas, toggle fuera-de-año y tooltips).
 */
import { buildOoyBucketSeries, createCashFlowPivotModel, monthEndOf } from './cashFlowPivot.js'

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

/* ═══════ FE-S20 (spec `frontend.03_20` §7.2): modelo compartido de cómputo ═══════
 * Lines, ivaMode, pivotes de todos los bloques, derivaciones de pago al
 * proveedor/internación, liquidación IVA, impuestos tributarios, arrastre
 * N−1, resumen de liquidez y bodega viven en `createCashFlowPivotModel`
 * (`cashFlowPivot.js`) — los getters preservan la reactividad con las props.
 * Este componente conserva ÚNICAMENTE la presentación (formato de celdas,
 * notas tooltips, toggle fuera-de-año). Cero cambio de outputs (AC-7). */

const model = createCashFlowPivotModel({
  scenario: () => props.scenario,
  financingPrincipalLines: () => props.financingPrincipalLines,
  financingDisbursementLines: () => props.financingDisbursementLines,
  store: budgetPlanningStore
})
const {
  lines,
  scenarioYear,
  ivaActive,
  entradasPivot,
  fijosPivot,
  comprasPivot,
  variablesPivot,
  purchaseLines,
  purchasingKeys,
  cogsIncomeLines,
  costPaymentsActive,
  settlement,
  costPaymentsPivot,
  internmentPaymentsPivot,
  financingPrincipalPivot,
  financingDisbursementPivot,
  settlementPaymentsPivot,
  taxPaymentsPivot,
  carryover,
  carryActive,
  cobrosArrastre,
  pagosArrastre,
  resumen,
  bodegaMes
} = model

/** Vacío extremo: capital independiente también habilita el resumen de caja. */
const hasLines = computed(
  () =>
    lines.value.length > 0 ||
    financingPrincipalPivot.value?.rows.length > 0 ||
    financingDisbursementPivot.value?.rows.length > 0
)

/** N−1: año de la fuente del arrastre (etiquetas §5/§6.1). */
const carrySourceYear = computed(() =>
  scenarioYear.value === null ? null : scenarioYear.value - 1
)

/* ─────────── FE-S14-IVA §4.1: modo "Con IVA" — derivación bruto memoizada O(#líneas) ─────────── */

/**
 * Gross-up de las derivaciones vive en `cashFlowPivot.js` (grossLineAmount /
 * grossDerived de la factory); aquí queda solo la tasa EFECTIVA del
 * settlement para las ETIQUETAS del panel/Flujo (D-FE14-6: `tax_rate_used`
 * del BE manda cuando hay respuesta; mientras no la hay, la constante espejo
 * `IVA_RATE`).
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

/* El bucket fuera-de-año (`outOfYearBucket`), el pivote genérico
 * (`buildPivot`) y los bloques Entradas/Salidas fijos/Compras/Gastos
 * variables — con su gross-up FE-S14 — viven en `cashFlowPivot.js`
 * (FE-S20 §7.2: `outOfYearBucketOf`, `buildFlowPivot`,
 * `buildVariableFlowPivot` sobre la factory compartida). */

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

/* FE-S14-IVA D-FE14-3 (fila "IVA de importación"), las anclas de fecha
 * (`monthEndOf`/`addDaysISO`), `cogsIncomeLines` y el switch de fuente D-4'
 * (`purchaseIndex`/`purchaseLines`/`purchasingKeys`) con sus streams de
 * cuotas derivadas viven en `cashFlowPivot.js` (FE-S20 §7.2 — factory
 * compartida con la exportación). El resolvedor ÚNICO de `id_line` es
 * `cecoMovements.lineIdForCostCenter`. */

/**
 * Clave de fuente D-4' (ENMIENDA A-02 §7.1, espejo de las claves `line:`/`cc:`
 * que el backend aplica en el carryover): `line:<id_line>` cuando el catálogo
 * `costCenters` le conoce Línea al CECO —todas las facetas de una misma Línea
 * (la compradora "Facturación" y los zonales que solo venden) comparten clave
 * ⇒ el switch de fuente es POR LÍNEA—; `cc:<id_cost_center>` cuando el CECO
 * es desconocido o el catálogo A5 cayó. DEGRADACIÓN HONESTA §7.1: sin
 * catálogo la clave vuelve a ser por-CECO (A-01, conservador). Local solo
 * para la condición `costTermsDegraded`; la derivación usa la MISMA regla
 * dentro de la factory (`cashFlowPivot.js`).
 * @param {number|null|undefined} idCostCenter
 * @returns {string}
 */
function sourceKeyForCostCenter(idCostCenter) {
  const lineId = lineIdForCostCenter(budgetPlanningStore.costCenters, idCostCenter)
  return lineId === null ? `cc:${idCostCenter}` : `line:${lineId}`
}

/* `internmentCatalogReady`, `costPaymentRows` y `costPaymentsActive`
 * (cuotas derivadas §5 + streams D-FE10) viven en `cashFlowPivot.js`
 * (FE-S20 §7.2). */

/** Nota literal del bloque §2.5 (ACEPTACIÓN — `−` U+2212 verbatim). */
const INTERNMENT_PAYMENT_NOTE =
  'Desglose del valor importado: costo de internación = total − total/(1 + % internación de la Línea), pagado según sus propios términos. Informativo en caja: no altera el P&L (causación).'

/* El pivote del bloque "Pago de internación", la caché `settlement` del
 * store, los pivotes "Pago de liquidación de IVA" (FE-S14 D-FE14-4) y
 * "Impuestos" (FE-S17) viven en `cashFlowPivot.js` (FE-S20 §7.2). */

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
    const lineId = lineIdForCostCenter(budgetPlanningStore.costCenters, line.id_cost_center)
    const pct = resolveCogsPctByLine(rates, lineId, monthEndOf(line.budget_date))
    return pct !== null && pct !== 0
  })
})

/* Los pivotes de los BLOQUES derivados/motor (`costPaymentsPivot`,
 * `financingPrincipalPivot`, `financingDisbursementPivot`) viven en la
 * factory compartida `cashFlowPivot.js` (FE-S20 §7.2). */

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
      // ENMIENDA A-03 (spec frontend.03_21 §12): el pivote ya produce
      // buckets reales (Antes/Después de la causación de la línea vs año N)
      // ⇒ mismas columnas ooy que el resto de bloques (AC-FE21-12/13/14).
      ooy: true
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

/* La caché `carryover`, la puerta `carryActive` y los pivotes de
 * Cobros/Pagos de arrastre (`buildCarryPivot` + rank de orígenes) viven en
 * `cashFlowPivot.js` (FE-S20 §7.2); aquí solo se ensambla la sección. */

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

/**
 * Series/bandera fuera-de-año con la ÚNICA pasada compartida
 * (`buildOoyBucketSeries`, FE-S20 — la exportación del resumen usa la MISMA
 * agregación). `any` = ¿algún bloque propio tiene montos fuera de año? ⇒
 * toggle visible y chips.
 */
const ooySeries = computed(() =>
  buildOoyBucketSeries({
    disbursement: financingDisbursementPivot.value,
    entradas: entradasPivot.value,
    fijos: fijosPivot.value,
    costes: costPaymentsPivot.value,
    internment: internmentPaymentsPivot.value,
    principal: financingPrincipalPivot.value,
    liquidation: settlementPaymentsPivot.value,
    taxFlow: taxPaymentsPivot.value,
    // ENMIENDA A-03 (frontend.03_21 §12): buckets reales del bloque variable.
    variables: variablesPivot.value
  })
)

const anyOutOfYear = computed(() => ooySeries.value.any)

/**
 * Columnas "fuera de año" del resumen de liquidez (FE-S8-FLUJO-OY C-2/FR-4):
 * series `[antes, después]` de `buildOoyBucketSeries` (ÚNICA agregación,
 * FE-S20) + flag de visibilidad (`anyOutOfYear` + toggle ON — mismo lenguaje
 * visual que los bloques).
 */
const ooyColumns = computed(() => ({
  visible: anyOutOfYear.value && showOutOfYear.value,
  entradas: ooySeries.value.entradas,
  salidas: ooySeries.value.salidas,
  neto: ooySeries.value.neto
}))

/* ─────────── ENMIENDA A-05 (spec frontend.03_21 §14): "Total General" ───────────
 * `Total` = SOLO la Σ de los 12 meses (BR-FE21-16, los builders ya separaron
 * `grandTotal`/`generalTotal`); la col "Total General" (12 meses + Antes +
 * Después, BR-FE21-17) SOLO se renderiza cuando la tabla EN SERIO tiene
 * before/after (BR-FE21-19), reordenando las cols a
 * `Ene…Dic | Antes | Después | Total | Total General`. */
const GENERAL_COLUMN = Object.freeze({
  label: 'Total General',
  title:
    'Σ de los 12 meses + Antes + Después de {N} (todo-inclusive). La col Total cubre solo los 12 meses del año.'
})

/** Columna General del Resumen: mismo gate que sus columnas Antes/Después. */
const resumenGeneralColumn = computed(() => (ooyColumns.value.visible ? GENERAL_COLUMN : null))

/**
 * Gate por bloque (BR-FE21-17): mismo lenguaje del toggle (`block.ooy &&
 * showOutOfYear`) + la prueba de que el bloque tiene montos ooy reales.
 * @param {{ ooy: boolean, pivot: object }} block
 * @returns {object|null}
 */
function blockGeneralColumn(block) {
  return block.ooy && showOutOfYear.value && block.pivot.beforeAfterRowCount > 0
    ? GENERAL_COLUMN
    : null
}

/* El resumen de liquidez (D-6, §4.5 — agregación de TODOS los bloques con
 * neto/acumulado y totales) y la fila "Bodega estimada" (§2.6: compras por
 * mes, costo causado por mes y corrida) viven en la factory compartida
 * `cashFlowPivot.js` (FE-S20 §7.2). */

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
      // A-05: lado General (meses + Antes + Después) — mismo gate que las
      // columnas ooy de esta tabla (`resumenGeneralColumn`).
      generalText: fitMoney(r.entradasGeneralTotal),
      generalNegative: false,
      signed: false,
      strong: false,
      totalTitle: totalTitleText(
        r.entradasTotal,
        'Σ de los 12 meses del año. Los montos Antes/Después del año van en el Total General.'
      ),
      ooy: unsignedCells(ooy.entradas)
    },
    {
      label: 'Σ Salidas',
      months: r.salidas,
      totalText: fitMoney(r.salidasTotal),
      negativeTotal: false,
      generalText: fitMoney(r.salidasGeneralTotal),
      generalNegative: false,
      signed: false,
      strong: false,
      totalTitle: totalTitleText(
        r.salidasTotal,
        'Σ de los 12 meses del año. Los montos Antes/Después del año van en el Total General.'
      ),
      ooy: unsignedCells(ooy.salidas)
    },
    {
      label: 'Flujo neto',
      months: r.neto,
      totalText: resumenCell(r.netoTotal),
      negativeTotal: r.netoTotal < 0,
      generalText: resumenCell(r.netoGeneralTotal),
      generalNegative: r.netoGeneralTotal < 0,
      signed: true,
      strong: true,
      totalTitle: totalTitleText(
        r.netoTotal,
        'Flujo neto anual: Σ entradas − Σ salidas del año. Montos fuera de año: ver el Total General.'
      ),
      ooy: signedCells(ooy.neto)
    },
    {
      label: 'Flujo acumulado',
      months: r.acumulado,
      totalText: resumenCell(r.acumuladoTotal),
      negativeTotal: r.acumuladoTotal < 0,
      // A-05: su cubeta ooy es '—' (corrida solo Ene–Dic) ⇒ General = Total.
      generalText: resumenCell(r.acumuladoTotal),
      generalNegative: r.acumuladoTotal < 0,
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
      // A-05: cubetas ooy '—' ⇒ General = Total.
      generalText: resumenCell(bodegaMes.value[11]),
      generalNegative: bodegaMes.value[11] < 0,
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
          extras-before-total
          :general-column="resumenGeneralColumn"
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
            <!-- A-05: Antes/Después ANTES de la col Total; cubetas [Antes,
                 Después] de cada fila (acumulado: `—` con `title`, §FR-4). -->
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
            <td
              :class="[
                'pt-cell-money pt-cell-total',
                {
                  'pt-cell-total-inner': Boolean(resumenGeneralColumn),
                  'pt-negative': row.negativeTotal && !row.bodega,
                  'cf-bodega-negative': row.bodega && row.negativeTotal
                }
              ]"
              :title="row.totalTitle"
            >
              {{ row.totalText }}
            </td>
            <!-- A-05: "Total General" (mismas clases sticky que Total — hereda
                 right 0; la Total interna ancla a su izquierda (14.7 2026-10-21). -->
            <td
              v-if="resumenGeneralColumn"
              class="pt-cell-money pt-cell-total pt-cell-total-general"
              :class="{
                'pt-negative': row.generalNegative && !row.bodega,
                'cf-bodega-negative': row.bodega && row.generalNegative
              }"
              :title="resumenGeneralColumn.title"
            >
              {{ row.generalText }}
            </td>
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
          extras-before-total
          :general-column="blockGeneralColumn(block)"
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
            <!-- A-05: Antes/Después ANTES de la col Total (orden vigente §14). -->
            <template v-if="showOutOfYear && block.ooy">
              <td class="pt-cell-money cf-cell-ooy" :title="cellTitle(row.before)">
                {{ row.before === 0 ? '·' : fitMoney(row.before) }}
              </td>
              <td class="pt-cell-money cf-cell-ooy" :title="cellTitle(row.after)">
                {{ row.after === 0 ? '·' : fitMoney(row.after) }}
              </td>
            </template>
            <!-- A-05 (BR-FE21-16): Total = solo los 12 meses; con Total
                 General pinned (§14.7 2026-10-21, pt-cell-total-inner). -->
            <td
              :class="[
                'pt-cell-money pt-cell-total',
                { 'pt-cell-total-inner': Boolean(blockGeneralColumn(block)) }
              ]"
              :title="cellTitle(row.total)"
            >
              {{ fitMoney(row.total) }}
            </td>
            <!-- A-05 (BR-FE21-17): Total General = row.generalTotal (meses +
                 Antes + Después); pinned right 0 (14.7 2026-10-21). -->
            <td
              v-if="blockGeneralColumn(block)"
              class="pt-cell-money pt-cell-total"
              :title="cellTitle(row.generalTotal)"
            >
              {{ fitMoney(row.generalTotal) }}
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
                {{ value === 0 ? '·' : fitMoney(value) }}
              </td>
              <template v-if="showOutOfYear && block.ooy">
                <td class="pt-cell-money cf-cell-ooy" :title="cellTitle(block.pivot.beforeTotal)">
                  {{ block.pivot.beforeTotal === 0 ? '·' : fitMoney(block.pivot.beforeTotal) }}
                </td>
                <td class="pt-cell-money cf-cell-ooy" :title="cellTitle(block.pivot.afterTotal)">
                  {{ block.pivot.afterTotal === 0 ? '·' : fitMoney(block.pivot.afterTotal) }}
                </td>
              </template>
              <td
                :class="[
                  'pt-cell-money pt-cell-total',
                  { 'pt-cell-total-inner': Boolean(blockGeneralColumn(block)) }
                ]"
                :title="cellTitle(block.pivot.grandTotal)"
              >
                {{ fitMoney(block.pivot.grandTotal) }}
              </td>
              <td
                v-if="blockGeneralColumn(block)"
                class="pt-cell-money pt-cell-total"
                :title="cellTitle(block.pivot.grandGeneralTotal)"
              >
                {{ fitMoney(block.pivot.grandGeneralTotal) }}
              </td>
            </tr>
          </template>
        </PivotMonthTable>
        <p v-else class="cf-empty">Sin líneas de {{ block.emptyName }} en este escenario.</p>
        <!-- Hallazgo 5 (auditoría FE): montos con fecha efectiva ILEGIBLE —
             honestidad de reconciliación (mismo patrón `undatedTotal` del
             bloque de impuestos): no viven en ningún mes ni en las columnas
             Antes/Después; solo suman al Total anual del bloque. -->
        <p v-if="block.pivot && block.pivot.undatedTotal > 0" class="cf-warn" role="status">
          El bloque incluye {{ formatMoneyPlain(block.pivot.undatedTotal) }} con fecha ilegible: no
          aparece en ningún mes ni en las columnas Antes/Después; solo suma al Total General.
        </p>
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
