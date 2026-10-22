/**
 * Helpers compartidos del drill-down de movimientos por CECO
 * (FE-S16 / spec `frontend.03_19` §6/§4 + REVISIÓN 2 RF-8).
 *
 * Funciones PURAS compartidas por `CecoDetailView.vue`, `CecoMovementPivot.vue`
 * y `CecoMovementTable.vue` (RF-4.3/RF-7.4: pivote, tabla tabular y totales de
 * cabecera derivan de LA MISMA agregación — cero divergencia de montos):
 *  - Resolución CECO ↔ código de ruta (RF-1.1/RF-2.3): los pivotes de origen
 *    agrupan por `id_cost_center` y la ruta nueva viaja con el
 *    `cost_center_code` (p. ej. `310100`), así que se necesita la conversión
 *    en ambas direcciones contra el catálogo `costCenters` del store.
 *  - Mes de posicionamiento por tab (RF-3.2/RF-3.3): `monthIndexOf(budget_date)`
 *    en Causado y `monthIndexOf(payment_date)` en Flujo (−1 = "Sin fecha de
 *    pago" — columna consolidada del tab Flujo).
 *  - Monto presentado por tab (`movementAmount`, RF-3.4/RF-4.4): Causado es
 *    SIEMPRE neto (D-FE14-7: el P&G nunca lleva IVA — byte-idéntico a la fila
 *    del CECO en `ExecutivePivotTable`); Flujo respeta `ivaMode` con la MISMA
 *    fórmula compartida de `planningFormat` (`withIva` + `lineChargesIva`,
 *    espejo del `grossLineAmount` de `CashFlowPivotTable`: INCOME siempre
 *    gravado D-S10-5, EXPENSE según el flag EFECTIVO NULL≡True D-FE14-2 y
 *    PURCHASE cruda como el bloque "Compras del mes").
 *  - Formateo de celda de pivote en un ÚNICO lugar (umbral de compactación
 *    ESPEJO del FE-S18 RF-2.2 de las vistas vigentes).
 *  - REVISIÓN 4 (spec `frontend.03_19` §11, RF-11.3/RF-11.4): `movementAmountReconciled`
 *    — el drill-down del bloque "Gastos variables (calculados)" (ahora
 *    `linkable` en `ExecutivePivotTable`) presenta la MISMA cifra derivada de
 *    la matriz `tasa × Σ ingresos fijos del mes de causación` (base
 *    `fixedIncomeCausationSeries` de `planningFormat.js`); el resto de los
 *    movimientos conserva `movementAmount` byte-a-byte (RF-8.6). ENMIENDA
 *    A-02 (spec `frontend.03_21` §11, 2026-10-21): la serie es POR
 *    COMPORTAMIENTO de la línea (I causado para `variable_sales`; ENTRADAS
 *    del Flujo por mes de pago —NETA— para `variable_receivables`), resuelta
 *    con las series A-01/A-02 por CECO (ver `movementAmountReconciled`).
 *
 * Cero dependencias reactivas: los llamadores pasan el estado (tab, ivaMode,
 * catálogo) — los componentes consumen sus `computed` del store como hacen
 * las vistas vigentes (`ExecutivePivotTable`/`CashFlowPivotTable`).
 */
import {
  lineChargesIva,
  monthIndexOf,
  withIva,
  formatMoneyCompact,
  formatMoneyPlain
} from './planningFormat.js'

/** Tab "Causado" (P&G, mes de `budget_date`) — DEFAULT del detalle (RF-3.1). */
export const TAB_CAUSED = 'caused'

/** Tab "Flujo" (caja, mes de `payment_date`; −1 → "Sin fecha de pago"). */
export const TAB_FLOW = 'flow'

/**
 * Mes (0–11) de CAUSACIÓN de una línea (base del tab Causado, RF-3.2).
 * @param {object|null|undefined} line
 * @returns {number} −1 si la fecha no es parseable.
 */
export function causedMonthOf(line) {
  return monthIndexOf(line?.budget_date)
}

/**
 * Mes (0–11) de PAGO de una línea (base del tab Flujo, RF-3.3). Estricto: sin
 * fallback a `budget_date` — las líneas con `payment_date = null` retornan −1
 * y el pivote las consolida en la columna "Sin fecha de pago" (decisión
 * confirmada del spec).
 * REVISIÓN 2 (RF-8.5): parámetro opcional de FALLBACK para las líneas de
 * motores (nómina/financiación what-if): su pivote de origen (bloque
 * "Salidas — Gastos fijos" de `CashFlowPivotTable`) posiciona con
 * `cfMonth = payment_date || budget_date` — byte-cuadre exige el MISMO
 * fallback aquí. Los llamadores actuales sin el flag no cambian de
 * comportamiento nada.
 * @param {object|null|undefined} line
 * @param {boolean} [fallbackToBudget=false] usar `budget_date` cuando no hay `payment_date` (espejo `cfMonth`).
 * @returns {number} −1 si no hay fecha posicionable o no es parseable.
 */
export function flowMonthOf(line, fallbackToBudget = false) {
  return fallbackToBudget
    ? monthIndexOf(line?.payment_date || line?.budget_date)
    : monthIndexOf(line?.payment_date)
}

/**
 * Monto PRESENTADO de una línea según el tab y el modo (RF-3.4/RF-4.4):
 *  - Causado → SIEMPRE neto crudo (D-FE14-7; `NaN` devuelto tal cual para que
 *    el acumulador del llamador lo ignore, mismo contrato que los pivotes).
 *  - Flujo con modo OFF → neto crudo (AC-FE14-1: byte-idéntico).
 *  - Flujo con modo ON → `withIva` según `lineChargesIva` EXCEPTO purchases
 *    (cruda: el valor de la compra ya es el total bruto de la importación,
 *    A-1' — espejo del bloque "Compras del mes" de `CashFlowPivotTable`).
 * @param {object} line `BudgetLine` (Crudo; derivaciones cuelgan de la
 *   reactividad del llamador, AC-FE14-2).
 * @param {string} tab `TAB_CAUSED` | `TAB_FLOW`
 * @param {boolean} ivaActive modo "Con IVA" (`budgetPlanningStore.ivaMode`)
 * @returns {number}
 */
export function movementAmount(line, tab, ivaActive) {
  const net = Number(line?.projected_amount)
  if (!Number.isFinite(net)) return net
  // RF-8.6: capital/desembolsos de financiación NO son gasto P&L ni llevan
  // IVA — monto CRUDO SIEMPRE (espejo de los pivotes homónimos de
  // `CashFlowPivotTable`, que acumulan el raw del payload).
  if (line.source_kind === 'principal' || line.source_kind === 'disbursement') return net
  // FE-S21 (RF-CR-07): el bloque de arrastre del Flujo acumula el
  // `projected_amount` CRUDO del payload (`buildCarryPivot`); el drilldown
  // muestra LA MISMA cifra — sin gross-up ni transformación.
  if (line.source_kind === SOURCE_KINDS.CARRYOVER) return net
  if (tab !== TAB_FLOW) return net
  if (!ivaActive) return net
  if (line.line_type === 'purchase') return net
  return withIva(net, lineChargesIva(line))
}

/* ═══════════ REVISIÓN 4 — RF-11: monto RECONCILIADO de la línea variable ═══════════ */

/**
 * ¿El movimiento es una línea variable de GASTO cuya cifra la define la
 * derivación de la matriz y no el dato crudo? (RF-11.2/RF-11.3): movimiento
 * base (`budget_lines`) de `expense` con `behavior_type !== 'fixed'` — la
 * MISMA selección de `buildVariableExpensePivot` (`executivePivot.js`) y del
 * bloque `variablesPivot` del Flujo (`cashFlowPivot.js`).
 * @param {object|null|undefined} movement forma común del drill-down
 * @returns {boolean}
 */
export function isReconciledVariableMovement(movement) {
  return (
    (movement?.source_kind ?? SOURCE_KINDS.BASE) === SOURCE_KINDS.BASE &&
    movement?.line_type === 'expense' &&
    movement?.behavior_type !== 'fixed'
  )
}

/**
 * REVISIÓN 4 (RF-11.3/RF-11.4 / spec `frontend.03_19` §11): monto PRESENTADO
 * de un movimiento del drill-down donde las líneas variables de GASTO muestra
 * el monto RECONCILIADO con la matriz — EXACTAMENTE la cifra del pivote de
 * origen: `Number(variable_rate) × Σ ingresos fijos del mes de CAUSACIÓN de
 * la línea` (base 12 posiciones de `fixedIncomeCausationSeries` en
 * `planningFormat.js`, la MISMA serie que alimenta `buildVariableExpensePivot`
 * de la Ejecutiva y `variablesPivot` del Flujo; cero duplicación — RF-7.4).
 *
 * Reglas byte-cuadre con la matriz:
 *  - Mes inválido (`monthIndexOf(budget_date) < 0`) o mes sin ingresos fijos
 *    ⇒ aporte 0 (idéntico al `continue` de `buildVariableExpensePivot`/
 *    `buildVariableFlowPivot`: la línea no entra en ninguna celda).
 *  - Tab Causado: SIEMPRE neto (D-FE14-7 — espejo de la Ejecutiva).
 *  - Tab Flujo: monto idéntico al Causado, con sólo el gross-up × 1.19 del
 *    monto DERIVADO según el flag efectivo (`lineChargesIva`, D-FE14) —
 *    byte-idéntico a `buildVariableFlowPivot`; el posicionamiento mensual
 *    usa el mes de CAUSACIÓN porque ese builder (a diferencia de los bloques
 *    fijos con `cfMonth`) posiciona por `budget_date` — AC-16.
 *  - Resto de movimientos (fijos, ingresos, compras, motores, capital):
 *    conservan el `movementAmount` de RF-8.6 byte-a-byte (cláusula
 *    inquebrantable RF-8.6/AC-10/AC-11).
 *
 *  - Resto de movimientos (fijos, ingresos, compras, motores, capital):
 *    conservan el `movementAmount` de RF-8.6 byte-a-byte (cláusula
 *    inquebrantable RF-8.6/AC-10/AC-11).
 *
 * ENMIENDA A-02 (spec `frontend.03_21` §11, 2026-10-21): la serie de base se
 * elige POR COMPORTAMIENTO de la línea — `variable_sales` usa la serie I
 * (facturación por mes de causación) y `variable_receivables` la serie R
 * (ENTRADAS del Flujo por mes de pago, NETA). El parámetro acepta AMBAS
 * formas: una `number[12]` plana (LEGACY, comportamientos previos/enmienda
 * A-01 — se usa como base de todos los comportamiento, retro-compatibilidad
 * con llamadores existentes) o un objeto `{ sales, receivables }` de las
 * series ya resueltas A-01/A-02 por CECO. La TASA sigue visible en la
 * columna/tasa y el crudo queda en tooltip del render
 * (`CecoMovementTable`/`CecoMovementPivot`).
 * @param {object|null|undefined} line movimiento de la forma común
 * @param {string} tab `TAB_CAUSED` | `TAB_FLOW`
 * @param {boolean} ivaActive modo "Con IVA" (`budgetPlanningStore.ivaMode`)
 * @param {number[]|{sales?: number[], receivables?: number[]}|null|undefined}
 *   [fixedIncomeByMonth] serie(s) compartida(s) de base por mes, resuelta(s)
 *   por comportamiento (A-02). Sin serie para el comportamiento ⇒ la línea
 *   variable aporta 0 (degradación honesta: sin base no hay cifra
 *   reconciliada que mostrar).
 * @returns {number}
 */
export function movementAmountReconciled(line, tab, ivaActive, fixedIncomeByMonth) {
  if (!isReconciledVariableMovement(line)) return movementAmount(line, tab, ivaActive)
  const rate = Number(line?.variable_rate) || 0
  // ENMIENDA A-02: serie por comportamiento (plana legacy ⇒ I para todos).
  const behaviorSeries = Array.isArray(fixedIncomeByMonth)
    ? fixedIncomeByMonth
    : line?.behavior_type === 'variable_receivables'
      ? (fixedIncomeByMonth?.receivables ?? null)
      : (fixedIncomeByMonth?.sales ?? null)
  if (!Array.isArray(behaviorSeries)) return 0
  const month = monthIndexOf(line?.budget_date)
  if (month < 0 || month > 11) return 0
  const amount = rate * (Number(behaviorSeries[month]) || 0)
  if (tab !== TAB_FLOW || !ivaActive) return amount
  return withIva(amount, lineChargesIva(line))
}

/**
 * Código de CECO (`cost_center_code`, RF-1.1) de un `id_cost_center` de los
 * pivotes de origen: ENCAJE EXACTO contra el catálogo. `null` ⇒ el llamador
 * NO enlaza la fila (catálogo caído o fila sintética sin CECO — degradación
 * honesta: jamás se navega a una ruta de CECO que el detalle no resuelve,
 * RF-2.3).
 * @param {Array<object>|null|undefined} costCenters catálogo del store
 * @param {number|string|null|undefined} idCostCenter
 * @returns {string|null} código como string, o `null`.
 */
export function costCenterCodeOf(costCenters, idCostCenter) {
  if (idCostCenter === null || idCostCenter === undefined) return null
  const list = Array.isArray(costCenters) ? costCenters : []
  const found = list.find((item) => item && item.id_cost_center === idCostCenter)
  return found ? String(found.cost_center_code) : null
}

/**
 * CECO → `id_line` vía el catálogo `costCenters` cacheado (FE-S4C §3.1).
 * Helper COMPARTIDO (FE-S20 / spec `frontend.03_20`: única definición para
 * `executivePivot.js` y `cashFlowPivot.js`, que antes lo duplicaban inline en
 * sus componentes): desconocido o catálogo caído (R-4) ⇒ `null` ⇒ el CECO cae
 * a la tasa global de costo (§3.1).
 * @param {Array<object>|null|undefined} costCenters catálogo del store
 * @param {number|string|null|undefined} idCostCenter
 * @returns {number|null}
 */
export function lineIdForCostCenter(costCenters, idCostCenter) {
  if (idCostCenter === null || idCostCenter === undefined) return null
  const list = Array.isArray(costCenters) ? costCenters : []
  const found = list.find((item) => item && item.id_cost_center === idCostCenter)
  return typeof found?.id_line === 'number' ? found.id_line : null
}

/**
 * `id_cost_center` a partir del parámetro de ruta `costCenterCode`
 * (RF-2.3:datatype `'310100'`). Cadena: encaje por código → respaldo
 * numérico (el pivote pudo haber navegado con el `id` como código cuando el
 * catálogo degradó — el detalle re-resuelve el MISMO CECO). `null` ⇒ estado
 * vacío "CECO no identificado", cero llamadas API (RF-2.3).
 * @param {Array<object>|null|undefined} costCenters catálogo del store
 * @param {string|number|null|undefined} codeParam
 * @returns {number|null}
 */
export function resolveCostCenterId(costCenters, codeParam) {
  const target = String(codeParam ?? '').trim()
  if (!target) return null
  const list = Array.isArray(costCenters) ? costCenters : []
  const byCode = list.find((item) => item && String(item.cost_center_code) === target)
  if (byCode) return byCode.id_cost_center
  const numeric = Number(target)
  if (Number.isFinite(numeric) && numeric > 0) {
    const byId = list.find((item) => item && item.id_cost_center === numeric)
    if (byId) return numeric
  }
  return null
}

/* ─────────── Formateo de celda de pivote (espejo FE-S18 RF-2.2, ÚNICO sitio) ─────────── */

/** Umbral de compactación: ≥ 1.000.000.000 no cabe en la col de 106px. */
export const PIVOT_MONEY_COMPACT_THRESHOLD = 1_000_000_000

/**
 * Texto de celda monetaria del pivote de detalle (RF-7.2): `0` → '·' (patrón
 * del módulo), resto COP sin símbolo — plain cuando cabe, compacto cuando no
 * (el valor completo vive en el `title` que el render pone con
 * `pivotMoneyTitle`, AC-4).
 * @param {number|null|undefined} value
 * @returns {string}
 */
export function pivotMoneyText(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '—'
  if (num === 0) return '·'
  return Math.abs(num) >= PIVOT_MONEY_COMPACT_THRESHOLD
    ? formatMoneyCompact(num)
    : formatMoneyPlain(num)
}

/**
 * `title` de la celda compacta con el valor plain completo (RF-2.2/AC-4);
 * `null` cuando la celda cabe tal cual.
 * @param {number|null|undefined} value
 * @returns {string|null}
 */
export function pivotMoneyTitle(value) {
  const num = Number(value)
  return Number.isFinite(num) && num !== 0 && Math.abs(num) >= PIVOT_MONEY_COMPACT_THRESHOLD
    ? formatMoneyPlain(num)
    : null
}

/* ═══════════ REVISIÓN 2 — RF-8: movimientos de motores (nómina/financiación) ═══════════ */

/**
 * Origen de un movimiento de la forma común (RF-8.1): `budget_lines` base,
 * nómina what-if, financiación what-if (intereses/seguros) y flujo de
 * capital/desembolsos del schedule de financiación.
 * @returns {{ BASE: 'base', PAYROLL: 'payroll', FINANCING: 'financing', PRINCIPAL: 'principal', DISBURSEMENT: 'disbursement' }}
 */
export const SOURCE_KINDS = {
  BASE: 'base',
  PAYROLL: 'payroll',
  FINANCING: 'financing',
  PRINCIPAL: 'principal',
  DISBURSEMENT: 'disbursement',
  /** FE-S21-CARRYDRILL (RF-CR-08): líneas de arrastre N−1 (`store.carryover.lines`). */
  CARRYOVER: 'carryover'
}

/** Etiqueta legible del ORIGEN (columna "Origen" de la tabla, RF-8.4). */
export const SOURCE_KIND_LABELS = {
  base: 'Presupuesto',
  payroll: 'Nómina',
  financing: 'Financiación',
  principal: 'Capital',
  disbursement: 'Desembolso',
  /** FE-S21: chips por origen de arrastre — vocabulario RF-CR-05. */
  carryover: 'Arrastre'
}

/** Claves de GRUPO del pivote (RF-8.4): Presupuesto (Ingresos/Gastos/Compras) + Nómina + Financiación + Capital + Desembolsos. */
export const GROUP_KEYS = {
  baseIncome: 'presupuesto-ingresos',
  baseExpense: 'presupuesto-gastos',
  basePurchase: 'presupuesto-compras',
  payroll: 'nomina',
  financing: 'financiacion',
  principal: 'capital',
  disbursement: 'desembolsos',
  /** FE-S21-CARRYDRILL (RF-CR-05/08): grupo "Arrastre {N−1}" del tab Flujo. */
  carryover: 'arrastre'
}

/** Orden normativo de filas del pivote de detalle (RF-8.4). */
export const GROUP_ROW_ORDER = [
  GROUP_KEYS.baseIncome,
  GROUP_KEYS.baseExpense,
  GROUP_KEYS.basePurchase,
  GROUP_KEYS.payroll,
  GROUP_KEYS.financing,
  GROUP_KEYS.principal,
  GROUP_KEYS.disbursement,
  // FE-S21: el grupo de arrastre viva SOLO en el tab Flujo (RF-CR-05); al
  // final para no invadir la lectura de los grupos del año propio.
  GROUP_KEYS.carryover
]

/** Etiqueta legible de cada grupo de fila del pivote (vocabulario del editor). */
export const MOVEMENT_GROUP_LABELS = {
  [GROUP_KEYS.baseIncome]: 'Presupuesto · Ingresos',
  [GROUP_KEYS.baseExpense]: 'Presupuesto · Gastos',
  [GROUP_KEYS.basePurchase]: 'Presupuesto · Compras',
  [GROUP_KEYS.payroll]: 'Nómina',
  [GROUP_KEYS.financing]: 'Financiación (intereses y seguros)',
  [GROUP_KEYS.principal]: 'Capital de financiación',
  [GROUP_KEYS.disbursement]: 'Desembolso de financiación',
  [GROUP_KEYS.carryover]: 'Arrastre del año anterior'
}

/** Opciones del filtro "Tipo de línea" extendidas a origen/tipo (RF-8.7). */
export const MOVEMENT_GROUP_FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: GROUP_KEYS.baseIncome, label: 'Ingresos' },
  { value: GROUP_KEYS.baseExpense, label: 'Gastos' },
  { value: GROUP_KEYS.basePurchase, label: 'Compras' },
  { value: GROUP_KEYS.payroll, label: 'Nómina' },
  { value: GROUP_KEYS.financing, label: 'Financiación' },
  { value: GROUP_KEYS.principal, label: 'Capital de financiación' },
  { value: GROUP_KEYS.disbursement, label: 'Desembolsos' },
  { value: GROUP_KEYS.carryover, label: 'Arrastre N−1' }
]

/**
 * FE-S21 (RF-CR-05): etiquetas del BADGE de origen de las filas de arrastre
 * (el `origin` del payload `PlanningCarryoverLine` del BE-S15 v1.1: line ∨
 * cogs/purchase/internment derivadas — siempre expense).
 */
export const CARRYOVER_ORIGIN_LABELS = {
  line: 'Línea de presupuesto',
  cogs: 'Costo de venta',
  purchase: 'Pago a proveedor',
  internment: 'Internación'
}

/** ¿Valor legal de `route.query.carry` / `carryover_origin`? (RF-CR-05/09). */
export function isCarryoverOrigin(value) {
  return typeof value === 'string' && value in CARRYOVER_ORIGIN_LABELS
}

/**
 * Clave de GRUPO de un movimiento de la forma común (RF-8.4). Los base son
 * "Presupuesto" según su `line_type` (Ingresos/Gastos/Compras); los de
 * motores agrupan por ORIGEN (Nómina/Financiación/Capital/Desembolsos).
 * @param {object|null|undefined} movement
 * @returns {string}
 */
export function movementGroupOf(movement) {
  if (!movement) return GROUP_KEYS.baseExpense
  if (movement.source_kind === SOURCE_KINDS.PAYROLL) return GROUP_KEYS.payroll
  if (movement.source_kind === SOURCE_KINDS.FINANCING) return GROUP_KEYS.financing
  if (movement.source_kind === SOURCE_KINDS.PRINCIPAL) return GROUP_KEYS.principal
  if (movement.source_kind === SOURCE_KINDS.DISBURSEMENT) return GROUP_KEYS.disbursement
  // FE-S21 (RF-CR-05/08): las líneas del arrastre forman SU propio grupo.
  if (movement.source_kind === SOURCE_KINDS.CARRYOVER) return GROUP_KEYS.carryover
  // Base (implícito: materializadas del motor incluidas — RF-8.2) por tipo.
  if (movement.line_type === 'income') return GROUP_KEYS.baseIncome
  if (movement.line_type === 'expense') return GROUP_KEYS.baseExpense
  if (movement.line_type === 'purchase') return GROUP_KEYS.basePurchase
  return GROUP_KEYS.baseExpense
}

/**
 * Normalizador de `budget_lines` del CECO a la forma común (RF-8.3): anota
 * `source_kind: 'base'` + clave estable de fila, SIN tocar su forma de
 * `BudgetLine` (las materializadas del motor conservan su `source_engine`
 * original — AC-12: aparecen como base).
 * @param {Array<object>|null|undefined} lines
 * @returns {Array<object>}
 */
export function normalizeBudgetLines(lines) {
  if (!Array.isArray(lines)) return []
  return lines.map((line, index) => ({
    ...line,
    source_kind: SOURCE_KINDS.BASE,
    movementKey: `base-${line?.id_budget_line ?? index}`
  }))
}

/**
 * Normalizador de líneas de la NÓMINA WHAT-IF (`store.payrollSim.data.lines`,
 * RF-8.3): ESPEJO byte-a-byte del `simLines` de `BudgetGridEditor.vue`
 * (pseudo-budget_line: `expense` + `fixed` + `has_iva: false` +
 * `source_engine: 'collaborator_cost_sim'`) para que el detalle cuadre con el
 * pivote de origen (RF-8.6). Meta de fila: colaborador y componente.
 * @param {Array<object>|null|undefined} simLines
 * @param {number} budgetId id del escenario (se propaga como el editor).
 * @returns {Array<object>}
 */
export function normalizePayrollSimLines(simLines, budgetId) {
  if (!Array.isArray(simLines)) return []
  return simLines.map((line, index) => ({
    id_budget_line: null,
    id_budget: budgetId,
    id_cost_center: line?.id_cost_center,
    id_collection: line?.id_collection ?? null,
    line_type: 'expense',
    behavior_type: 'fixed',
    budget_date: line?.budget_date,
    payment_date: line?.payment_date ?? null,
    projected_amount: Number(line?.amount),
    has_iva: false,
    description: line?.description,
    cost_component_code: line?.cost_component_code,
    variable_rate: null,
    source_engine: 'collaborator_cost_sim',
    id_collaborator: line?.id_collaborator,
    collaborator_name: line?.collaborator_name,
    is_simulated: true,
    source_kind: SOURCE_KINDS.PAYROLL,
    movementKey: `payroll-${index}`
  }))
}

/**
 * Normalizador de líneas de la FINANCIACIÓN WHAT-IF
 * (`store.financingSim.data.lines`: FIN_INTEREST/FIN_INSURANCE, RF-8.3):
 * ESPEJO del `financingSimLines` de `BudgetGridEditor.vue` (idénticos valores
 * EXACTOS de mapeo). Capital JAMÁS entra por aquí.
 * @param {Array<object>|null|undefined} simLines
 * @param {number} budgetId id del escenario.
 * @returns {Array<object>}
 */
export function normalizeFinancingSimLines(simLines, budgetId) {
  if (!Array.isArray(simLines)) return []
  return simLines.map((line, index) => ({
    id_budget_line: null,
    id_budget: budgetId,
    id_cost_center: line?.id_cost_center,
    id_collection: null,
    line_type: 'expense',
    behavior_type: 'fixed',
    budget_date: line?.budget_date,
    payment_date: line?.payment_date ?? null,
    projected_amount: Number(line?.amount),
    has_iva: false,
    description: line?.description || line?.component_name || 'Gasto de financiación',
    cost_component_code: line?.cost_component_code,
    variable_rate: null,
    source_engine: 'financing_credit_sim',
    id_financing_credit: line?.id_financing_credit,
    id_financing_credit_installment: line?.id_financing_credit_installment,
    is_simulated: true,
    source_kind: SOURCE_KINDS.FINANCING,
    movementKey: `financing-${index}`
  }))
}

/**
 * Normalizador de las líneas de CAPITAL / DESEMBOLSOS del schedule de
 * financiación (`store.financingPrincipalFlow.data.lines / disbursement_lines`,
 * RF-8.3): forma `BudgetLine` mínima con `projected_amount = amount` CRUDO
 * (`movementAmount` lo devuelve sin P&L ni IVA — RF-8.6). Solo tab Flujo
 * (RF-8.2): el filtro pantalla por `movementMonthOf`/`movementsForTab` con su
 * `payment_date` PURO (sin fallback — posición exacta del bloque
 * "Salidas — Capital de financiación" del pivote de origen).
 * @param {Array<object>|null|undefined} flowLines
 * @param {'principal'|'disbursement'} kind
 * @returns {Array<object>}
 */
export function normalizePrincipalFlowLines(flowLines, kind) {
  if (!Array.isArray(flowLines)) return []
  const sourceKind =
    kind === SOURCE_KINDS.DISBURSEMENT ? SOURCE_KINDS.DISBURSEMENT : SOURCE_KINDS.PRINCIPAL
  return flowLines.map((line, index) => ({
    id_budget_line: null,
    id_cost_center: line?.id_cost_center,
    line_type: sourceKind === SOURCE_KINDS.DISBURSEMENT ? 'income' : 'expense',
    // No son gastos P&L: sin comportamiento aplicable (el filtro de
    // comportamiento RF-8.7 solo opera sobre base).
    behavior_type: null,
    budget_date: null,
    payment_date: line?.payment_date ?? null,
    projected_amount: Number(line?.amount),
    has_iva: false,
    description:
      line?.description ||
      (sourceKind === SOURCE_KINDS.DISBURSEMENT
        ? 'Desembolso de crédito nuevo'
        : 'Pago de capital'),
    cost_component_code: null,
    variable_rate: null,
    source_engine: 'financing_principal_flow',
    id_financing_credit: line?.id_financing_credit,
    installment_number: line?.installment_number,
    is_simulated: false,
    source_kind: sourceKind,
    movementKey: `${sourceKind}-${index}`
  }))
}

/**
 * FE-S21-CARRYDRILL (RF-CR-08): normalizador de las líneas de ARRASTRE
 * (`store.carryover.lines`, payload `PlanningCarryoverLine` del BE-S15 v1.1)
 * a la forma común de movimientos. ESPEJO de `buildCarryPivot`
 * (`cashFlowPivot.js` §6.1) para que el detalle cuadre 1:1 con la fila del
 * pivote por CECO+origen (RF-CR-07):
 *  - `source_kind: 'carryover'` + `carryover_origin` original preservado.
 *  - `projected_amount` RAW (el pivote de arrastre NO aplica gross-up — su
 *    monto es el crudo del payload).
 *  - `id_budget_line` presente SOLO en filas `line`; null en derivadas
 *    (backend.02_26 §2.1, v1.1).
 *  - `budget_date`: fecha propia en material, ANCLAJE de la fuente en
 *    derivadas; `payment_date`: siempre fecha en derivadas con términos; en
 *    material puede ser null (fallback al anclaje — BE v1.1).
 *  - sin claves de P&L sintética (`has_iva: true`? NO — crudo: el IVA no se
 *    toca aquí, `movementAmount` devuelve el crudo para este kind).
 * La ordenación es LA DEL PAYLOAD (fecha efectiva ASC + rank origen + id
 * null-safe — backend.02_26 §2.1): aqui se conserva el índice estable.
 * @param {Array<object>|null|undefined} carryLines
 * @returns {Array<object>}
 */
export function normalizeCarryoverLines(carryLines) {
  if (!Array.isArray(carryLines)) return []
  return carryLines.map((line, index) => ({
    id_budget_line: line?.id_budget_line ?? null,
    id_cost_center: line?.id_cost_center,
    id_collection: null,
    line_type: line?.line_type ?? 'expense',
    behavior_type: null,
    budget_date: line?.budget_date ?? null,
    payment_date: line?.payment_date ?? null,
    projected_amount: Number(line?.projected_amount),
    has_iva: false,
    description: line?.description ?? '',
    cost_component_code: null,
    variable_rate: null,
    origin: line?.origin ?? 'line',
    is_simulated: false,
    source_kind: SOURCE_KINDS.CARRYOVER,
    carryover_origin: line?.origin ?? 'line',
    movementKey: `carry-${line?.origin ?? 'line'}-${index}`
  }))
}

/**
 * Mes (0–11) de POSICIONAMIENTO de un movimiento según su origen y el tab
 * (RF-8.5 — la regla del cuadre con los pivotes de origen):
 *  - base ⇒ Causado `budget_date` estricto / Flujo `payment_date` estricto
 *    (columna "Sin fecha de pago" para null).
 *  - nómina/financiación ⇒ Causado `budget_date` (= Ejecutiva); Flujo
 *    `payment_date || budget_date` (mismo fallback que `cfMonth` del bloque
 *    "Gastos fijos" de `CashFlowPivotTable`).
 *  - capital/desembolsos ⇒ `payment_date` PURO (pivote homónimo del Flujo).
 * @param {object|null|undefined} movement
 * @param {string} tab `TAB_CAUSED` | `TAB_FLOW`
 * @returns {number} −1 sin fecha posicionable (columna "Sin fecha de pago").
 */
export function movementMonthOf(movement, tab) {
  const kind = movement?.source_kind ?? SOURCE_KINDS.BASE
  if (kind === SOURCE_KINDS.PAYROLL || kind === SOURCE_KINDS.FINANCING) {
    if (tab !== TAB_FLOW) return monthIndexOf(movement?.budget_date)
    return monthIndexOf(movement?.payment_date || movement?.budget_date)
  }
  if (kind === SOURCE_KINDS.PRINCIPAL || kind === SOURCE_KINDS.DISBURSEMENT) {
    return monthIndexOf(movement?.payment_date)
  }
  // FE-S21 (RF-CR-07): espejo EXACTO de `buildCarryPivot` — posicionamiento
  // por fecha EFECTIVA con fallback `payment_date || budget_date`. SOLO
  // tiene uso en el tab Flujo (`movementsForTab` lo excluye de Causado).
  if (kind === SOURCE_KINDS.CARRYOVER) {
    return monthIndexOf(movement?.payment_date || movement?.budget_date)
  }
  return tab === TAB_CAUSED ? causedMonthOf(movement) : flowMonthOf(movement)
}

/**
 * Dataset POR TAB (RF-8.2/RF-3.4): capital/desembolsos SOLO viven en el tab
 * Flujo (caja; jamás P&L); todo lo demás entra a ambos tabs.
 * FE-S21 (RF-CR-05): el arrastre N−1 es caja igualmente — SOLO el tab Flujo
 * (el bloque "Saldos de {N−1}" del pivote de origen es de la Vista Flujo y
 * los meses de Causado del año propio jamás lo incluyen, RF-FE-6 regresión).
 * @param {Array<object>} movements forma común
 * @param {string} tab `TAB_CAUSED` | `TAB_FLOW`
 * @returns {Array<object>}
 */
export function movementsForTab(movements, tab) {
  const list = Array.isArray(movements) ? movements : []
  if (tab === TAB_FLOW) return [...list]
  return list.filter((movement) => {
    const kind = movement?.source_kind ?? SOURCE_KINDS.BASE
    return (
      kind !== SOURCE_KINDS.PRINCIPAL &&
      kind !== SOURCE_KINDS.DISBURSEMENT &&
      // FE-S21: jamás en Causado (caja del año propio intacta — AC-S21-FE-6).
      kind !== SOURCE_KINDS.CARRYOVER
    )
  })
}

/**
 * Meta legible de un movimiento de MOTOR para la fila de la tabla
 * (nómina: colaborador · componente; financiación/capital/desembolsos:
 * cuota y crédito). `''` para los base.
 * FE-S21 (Tarea 1 del spec `frontend.03_23`): los de ARRASTRE llevan el
 * meta "origen · Arrastre {N−1}" (segunda línea, la descripción propia del
 * payload ya vive en la primera).
 * @param {object|null|undefined} movement
 * @param {{ carryYear?: number|string|null }} [context] año fuente del
 *   arrastre (`source.budget_year` o `scenarioYear − 1`); ignorado fuera
 *   del kind carryover (parámetro ADITIVO: llamantes viejos intactos).
 * @returns {string}
 */
export function movementMetaText(movement, { carryYear = null } = {}) {
  if (!movement) return ''
  const kind = movement.source_kind
  if (kind === SOURCE_KINDS.CARRYOVER) {
    const originLabel = CARRYOVER_ORIGIN_LABELS[movement.carryover_origin] ?? 'Arrastre'
    const year = carryYear === null || carryYear === undefined ? 'anterior' : carryYear
    return `${originLabel} · Arrastre ${year}`
  }
  if (kind === SOURCE_KINDS.PAYROLL) {
    const parts = [movement.collaborator_name, movement.cost_component_code].filter(Boolean)
    return parts.join(' · ')
  }
  const credit =
    movement.id_financing_credit != null ? `Crédito #${movement.id_financing_credit}` : ''
  const installment =
    movement.installment_number != null ? `Cuota ${movement.installment_number}` : ''
  return [credit, installment].filter(Boolean).join(' · ')
}
