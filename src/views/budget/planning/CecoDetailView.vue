<script setup>
/**
 * CecoDetailView — vista de DETALLE de movimientos por CECO del drill-down
 * de Planificación (FE-S16 / spec `frontend.03_19` RF-2/RF-3/RF-6 + REVISIÓN 2
 * RF-8), ruta `BudgetCecoDetail` (`/budget/planning/:idBudget/ceco/:costCenterCode`).
 *
 * Ensamblaje del drill-down: los pivotes de `BudgetGridEditor` (Ejecutiva y
 * Flujo) navegan aquí al hacer click SOLO en la celda del CECO (RF-1) y esta
 * vista muestra los movimientos individuales del centro de costo en dos tabs
 * estilo módulo, ahora con los 4 ORÍGENES del REVISIÓN 2 (RF-8.1):
 *  - "Causado" (DEFAULT, RF-3.2): dataset por `budget_date` — base + nómina
 *    what-if + financiación what-if, SIEMPRE NETOS (D-FE14-7; cuadra con la
 *    Vista Ejecutiva). Capital/desembolsos NO aparecen (no son P&G).
 *  - "Flujo" (RF-3.3): base + nómina + financiación por
 *    `payment_date || budget_date` (fallback `cfMonth` del pivote de origen)
 *    + capital + desembolsos por `payment_date` puro — cuadra con el resumen
 *    del Flujo del editor (RF-8.5/8.6).
 *
 * Reglas clave:
 *  - RF-8.2: tras `fetchScenarioDetail` ok, mecánica exacta de
 *    `BudgetGridEditor.load()`: escenario NO activo ⇒ `fetchPayrollSimulation`
 *    + `fetchFinancingSimulation` en paralelo (degradación SILENTE,
 *    single-flight en el store); `fetchFinancingPrincipalFlow` SIEMPRE
 *    (active/draft/closed). En ACTIVOS no se piden sims: el motor ya
 *    materializó sus líneas en `budget_lines` (AC-12).
 *  - RF-8.3: los 4 orígenes se normalizan a UNA forma común en
 *    `cecoMovements.js` (espejo del mapeo `simLines`/`financingSimLines` del
 *    editor) vía `allCecoMovements` — validando `budgetId` del store y
 *    `Array.isArray(...lines)` (degradación honesta por origen).
 *  - RF-8.7: los filtros operan sobre la forma común: "Tipo de línea"
 *    extendido a origen/tipo, comportamiento SOLO base, mes según el
 *    posicionamiento RF-8.5 del tab (con "Sin fecha" solo en Flujo).
 *  - RF-8.8: estado vacío SOLO si el CECO resuelto y 0 movimientos en TODOS
 *    los orígenes.
 *  - RF-8.9: fallo de un origen ⇒ notice discreto con Reintentar (acción del
 *    store con `force: true`); loading NO bloquea el render de la base — el
 *    spinner queda solo para el detalle del escenario.
 *  - REVISIÓN 4 (`frontend.03_19` §11): el detalle recibe el drill-down del
 *    bloque "Gastos variables (calculados)" de la Ejecutiva (RF-11.1). Aquí
 *    computa la serie de ingresos fijos por mes de causación CORTADA POR
 *    CECO (REVISIÓN 5 / spec `frontend.03_21` §5.3 — espejo B1c de
 *    `backend.02_24` §5.2: base `tasa × I_c(m)` del propio CECO) y la inyecta
 *    en pivot/tabla/exportación vía el monto `movementAmountReconciled` — la
 *    cifra variable cuadra 1:1 con ambos bloques de la matriz (AC-16).
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CecoMovementPivot from '@/components/budget/planning/CecoMovementPivot.vue'
import CecoMovementTable from '@/components/budget/planning/CecoMovementTable.vue'
import { useBudgetScenarioStore } from '@/stores/budgetScenarioStore.js'
import { useBudgetSimulationStore } from '@/stores/budgetSimulationStore.js'
import { useBudgetIvaStore } from '@/stores/budgetIvaStore.js'
import { useUserStore } from '@/stores/userStore.js'
import { alertService } from '@/services/alertService.js'
import {
  BEHAVIOR_LABELS,
  MONTH_LABELS,
  formatMoneyPlain
} from '@/components/budget/planning/planningFormat.js'
import {
  CARRYOVER_ORIGIN_LABELS,
  MOVEMENT_BUCKET_AFTER,
  MOVEMENT_BUCKET_BEFORE,
  MOVEMENT_BUCKET_UNDATED,
  MOVEMENT_GROUP_FILTERS,
  SOURCE_KINDS,
  TAB_CAUSED,
  TAB_FLOW,
  isCarryoverOrigin,
  movementBucketOf,
  movementsForTab,
  movementAmountReconciled,
  movementGroupOf,
  normalizeBudgetLines,
  normalizeCarryoverLines,
  normalizeFinancingSimLines,
  normalizePayrollSimLines,
  normalizePrincipalFlowLines,
  resolveCostCenterId
} from '@/components/budget/planning/cecoMovements.js'
import {
  fixedIncomeCausationByCeco,
  fixedIncomeCausationByVariableCeco,
  entradasCausacionByCeco,
  entradasCausacionByVariableCeco
} from '@/components/budget/planning/planningFormat.js'
/**
 * FE-S20 (spec `frontend.03_20`): exportación del tab activo (Causado/Flujo)
 * a Excel/CSV — reutiliza los movimientos YA FILTRADOS de la vista
 * (`filteredLines`, sincronía 1:1 con `CecoMovementTable`) y el monto
 * `movementAmount` del helper compartido; serialización en
 * `plugins/tableExport.js` (cero HTTP, RF-9).
 */
import { buildExportFilename, exportSheets } from '@/plugins/tableExport.js'
import { buildCecoSheets } from '@/components/budget/planning/planningExportSheets.js'

const TAB_ORDER = [TAB_CAUSED, TAB_FLOW]
const TAB_LABELS = {
  [TAB_CAUSED]: 'Causado',
  [TAB_FLOW]: 'Flujo'
}

const route = useRoute()
const router = useRouter()
const scenarioStore = useBudgetScenarioStore()
const simulationStore = useBudgetSimulationStore()
const ivaStore = useBudgetIvaStore()
const userStore = useUserStore()

/** Tab INICIAL (RF-8.10): `?tab=flow` al llegar desde la Vista Flujo;
 * cualquier otro valor (o ausencia) ⇒ "Causado" (default de la vista). */
const activeTab = ref(route.query.tab === TAB_FLOW ? TAB_FLOW : TAB_CAUSED)
const detailError = ref(false)

const idBudget = computed(() => Number(route.params.idBudget))

/** Código del CECO desde la ruta (string, p. ej. '310100'). */
const cecoCodeParam = computed(() =>
  route.params.costCenterCode ? String(route.params.costCenterCode) : ''
)

const scenario = computed(() => scenarioStore.currentScenario)

/**
 * Año N del escenario (fix 2026-10-26): activa los buckets fuera de año de
 * `movementBucketOf` en pivote y filtros (FE-S8 en el drill-down). No entero
 * ⇒ `null` ⇒ degradación al posicionamiento mensual puro (comportamiento
 * previo, mismos criterios de los pivotes de origen).
 */
const scenarioYear = computed(() => {
  const year = Number(scenario.value?.budget_year)
  return Number.isInteger(year) ? year : null
})

/** ¿El escenario en caché es el de la URL? (falsa=true mientras carga otro). */
const currentReady = computed(
  () => Boolean(scenario.value) && scenario.value.id_budget === idBudget.value
)

/* ─────────────── Carga por URL directa (RF-2.4 / AC-8) ─────────────── */

/**
 * Misma mecánica de `BudgetGridEditor.load()`: `fetchScenarioDetail` es no-op
 * cacheado (`currentScenarioId === idBudget`), así que navegando DESDE la
 * cuadrícula no hay HTTP (RF-7.1) y por entrada directa re-hidrata también
 * los catálogos (`ensureCatalogs`). 404 ⇒ toast + replace al planning (§9);
 * auth lo maneja el store; red/5xx ⇒ estado de error con reintento.
 */
async function load(force = false) {
  detailError.value = false
  const result = await scenarioStore.fetchScenarioDetail(idBudget.value, force)
  if (result.ok) {
    // RF-8.2: mecánica de `BudgetGridEditor.load()` tras el detalle ok.
    // Borradores/cerrados ⇒ sims what-if en paralelo (single-flight/caché en
    // el store, degradación SILENTE); capital/desembolsos SIEMPRE
    // (active/draft/closed). Sin await: el render de la base jamás se
    // bloquea (RF-8.9).
    loadEngineMovements()
    // FE-S21 RF-CR-04 (Tarea 6): cache FRESCO del arrastre por cambio de
    // escenario — la AGENDA `fetchCarryover` del store es no-op cacheada y
    // single-flight (dedupe igual que hoy). Lectura read-only; si falla
    // queda `error` silencioso y el grupo de arrastre simplemente no
    // aparece (degradación honesta — el notice va SOLO para motores).
    void scenarioStore.fetchCarryover(idBudget.value)
    return
  }
  if (result.kind === 'auth') return
  if (result.kind === 'notfound') {
    alertService.generalError('El escenario no existe o fue eliminado.')
    router.replace({ name: 'BudgetPlanningGrid', params: { idBudget: idBudget.value } })
    return
  }
  detailError.value = true
}

onMounted(() => {
  if (!userStore.token) return
  // :idBudget debe ser entero positivo; NaN/0 → toast + replace (§3.1 del
  // editor: el `beforeEnter` solo valida el gate de rol).
  if (!Number.isInteger(idBudget.value) || idBudget.value <= 0) {
    alertService.generalError('Escenario no válido.')
    router.replace({ name: 'BudgetPlanning' })
    return
  }
  load()
})

/**
 * RF-8.2: replica los guards de `BudgetGridEditor.load()`:
 * `loadPayrollSimulation`/`loadFinancingSimulation` no operan cuando el
 * escenario es 'active' porque el backend rechaza la simulación con 400 —
 * las líneas motorizadas ya viven en `budget_lines` (AC-12); el flujo de
 * capital es consulta válida para active/draft/closed. Las acciones del
 * store son single-flight + caché por `idBudget`.
 */
function loadEngineMovements() {
  const base = scenario.value
  if (!base) return
  if (base.status !== 'active') {
    void simulationStore.fetchPayrollSimulation(idBudget.value)
    void simulationStore.fetchFinancingSimulation(idBudget.value)
  }
  void simulationStore.fetchFinancingPrincipalFlow(idBudget.value)
}

/* ─── RF-8.9: notices discretos de fallo de un origen (Reintentar force) ─── */

/** Reintento de la nómina what-if (con `force`, acción existente del store). */
function retryPayrollSim() {
  if (scenario.value && scenario.value.status !== 'active') {
    void simulationStore.fetchPayrollSimulation(idBudget.value, { force: true })
  }
}

/** Reintento de la financiación what-if. */
function retryFinancingSim() {
  if (scenario.value && scenario.value.status !== 'active') {
    void simulationStore.fetchFinancingSimulation(idBudget.value, { force: true })
  }
}

/** Reintento del flujo de capital/desembolsos. */
function retryPrincipalFlow() {
  void simulationStore.fetchFinancingPrincipalFlow(idBudget.value, { force: true })
}

/**
 * Notice POR ORIGEN en ERROR (RF-8.9/AC-13): el resto de los movimientos y
 * toda la interfaz se ve sin afectación (NFR-FE14-3). El LOADING no genera
 * banner: no bloquea el render de la base (el spinner queda solo para el
 * detalle del escenario).
 */
const engineNotices = computed(() => {
  const base = scenario.value
  const showSims = Boolean(base) && base.status !== 'active'
  const list = []
  if (showSims && simulationStore.payrollSim.error) {
    list.push({
      key: 'payroll',
      label: 'la simulación de nómina',
      loading: simulationStore.payrollSim.loading,
      retry: retryPayrollSim
    })
  }
  if (showSims && simulationStore.financingSim.error) {
    list.push({
      key: 'financing',
      label: 'la simulación de financiación',
      loading: simulationStore.financingSim.loading,
      retry: retryFinancingSim
    })
  }
  if (simulationStore.financingPrincipalFlow.error) {
    list.push({
      key: 'principal',
      label: 'el flujo de capital de financiación',
      loading: simulationStore.financingPrincipalFlow.loading,
      retry: retryPrincipalFlow
    })
  }
  return list
})

function backToPlanning() {
  router.push({ name: 'BudgetPlanningGrid', params: { idBudget: idBudget.value } })
}

/* ─────────────── Resolución del CECO (RF-2.3) ─────────────── */

/** id_cost_center resuelto del parámetro de ruta (catálogo del store). */
const costCenterId = computed(() =>
  resolveCostCenterId(scenarioStore.costCenters, cecoCodeParam.value)
)

const costCenter = computed(() =>
  costCenterId.value === null
    ? null
    : (scenarioStore.costCenters.find((item) => item.id_cost_center === costCenterId.value) ??
      null)
)

const cecoResolved = computed(() => costCenterId.value !== null)

/** TODAS las líneas del CECO en el escenario en caché (una sola pasada). */
const cecoLines = computed(() => {
  if (!currentReady.value) return []
  const list = scenario.value.budget_lines
  if (!Array.isArray(list)) return []
  const id = costCenterId.value
  if (id === null) return []
  return list.filter((line) => line.id_cost_center === id)
})

/* ─────────────── Filtros (RF-6.1 / RF-8.7) ─────────────── */

/**
 * Estado LOCAL de filtros (RF-6.1). `filters.month` opera sobre el bucket de
 * POSICIONAMIENTO de la TAB ACTIVA (RF-8.5 + fix 2026-10-26): `budget_date`
 * en Causado, `payment_date` (con fallback `cfMonth` para sims, puro para
 * capital/desembolsos) en Flujo — comparados contra el año N del escenario
 * (`movementBucketOf`): '0'–'11' = mes del AÑO, 'none' = "Sin fecha de pago"
 * (solo Flujo) y 'before'/'after' = fuera de año ("Antes/Después de N",
 * AMBOS tabs). `filters.lineType` filtra por GRUPO origen/tipo (RF-8.7); el
 * comportamiento SOLO afecta a la base.
 */
const filters = reactive({ month: 'all', lineType: 'all', behavior: 'all' })

// Volver al tab Causado invalida 'none' ("Sin fecha de pago" es de Flujo);
// el watch lo resetea para no dejar un filtro imposible de aplicar. Igual con
// 'before'/'after' si el TAB DESTINO no tiene montos en ese bucket (la opción
// desaparece del select — fix 2026-10-26: mejor resetear que dejar un select
// "ciego" con el filtro activo sin opción visible).
watch(activeTab, (tab) => {
  const current = filters.month
  if (
    (tab !== TAB_FLOW && current === 'none') ||
    (current === 'before' && !ooyAvailable.value.before) ||
    (current === 'after' && !ooyAvailable.value.after)
  ) {
    filters.month = 'all'
  }
})

/**
 * Matching del filtro "Mes" por BUCKET (fix 2026-10-26): un mes seleccionado
 * ('0'–'11') SOLO cuadra con el mes del AÑO N — un pago con fecha efectiva en
 * mayo de N+1 ya no aparece al filtrar "May" (va a la opción "Después de N").
 * Espejo de la columna del pivote (`movementBucketOf`); sin fecha ⇒ 'none'
 * (columna "Sin fecha de pago" en Flujo; en Causado no puebla columna).
 * @param {object} movement forma común
 * @param {string} tab `TAB_CAUSED` | `TAB_FLOW`
 * @param {string} monthValue valor del `filters.month` ('all'|'none'|'before'|'after'|'0'...'11')
 * @returns {boolean}
 */
function movementMatchesMonthFilter(movement, tab, monthValue) {
  if (monthValue === 'all') return true
  const bucket = movementBucketOf(movement, tab, scenarioYear.value)
  if (monthValue === 'none') return bucket === MOVEMENT_BUCKET_UNDATED
  if (monthValue === 'before') return bucket === MOVEMENT_BUCKET_BEFORE
  if (monthValue === 'after') return bucket === MOVEMENT_BUCKET_AFTER
  return bucket === Number(monthValue)
}

/* ─────────────── Movimientos de los 4 orígenes (RF-8.1/8.3) ─────────────── */

/**
 * Movimientos de MOTORES del CECO (RF-8.1/RF-8.3): nómina what-if +
 * financiación what-if + capital/desembolsos, normalizados a la forma común
 * de `cecoMovements.js` con el MISMO mapeo del editor. Cada origen se toma
 * SOLO si su caché le pertenece a ESTE escenario (`budgetId`) y su payload
 * trae un array de líneas — degradación honesta por origen (RF-8.9).
 */
const cecoEngineMovements = computed(() => {
  if (!currentReady.value) return []
  const id = costCenterId.value
  if (id === null) return []
  const budgetId = idBudget.value
  const withCeco = (movements) => movements.filter((movement) => movement.id_cost_center === id)

  const out = []
  // (2) Nómina what-if (RF-8.2: cacheada solo en escenarios no activos).
  const payrollSim = simulationStore.payrollSim
  if (payrollSim.budgetId === budgetId && Array.isArray(payrollSim.data?.lines)) {
    out.push(...withCeco(normalizePayrollSimLines(payrollSim.data.lines, budgetId)))
  }
  // (3) Financiación what-if (intereses/seguros; capital jamás por aquí).
  const financingSim = simulationStore.financingSim
  if (financingSim.budgetId === budgetId && Array.isArray(financingSim.data?.lines)) {
    out.push(...withCeco(normalizeFinancingSimLines(financingSim.data.lines, budgetId)))
  }
  // (4) Capital/desembolsos del schedule de financiación.
  const principalFlow = simulationStore.financingPrincipalFlow
  if (principalFlow.budgetId === budgetId && principalFlow.data) {
    if (Array.isArray(principalFlow.data.lines)) {
      out.push(
        ...withCeco(normalizePrincipalFlowLines(principalFlow.data.lines, SOURCE_KINDS.PRINCIPAL))
      )
    }
    if (Array.isArray(principalFlow.data.disbursement_lines)) {
      out.push(
        ...withCeco(
          normalizePrincipalFlowLines(
            principalFlow.data.disbursement_lines,
            SOURCE_KINDS.DISBURSEMENT
          )
        )
      )
    }
  }
  return out
})

/**
 * Forma común de TODOS los movimientos del CECO (RF-8.3): base
 * (`budget_lines`, AC-12: materializadas incluidas) + los motores. Dataset
 * raíz de los tabs, de los filtros y del total de cabecera (RF-4.3).
 */
const allCecoMovements = computed(() => [
  ...normalizeBudgetLines(cecoLines.value),
  ...cecoEngineMovements.value
])

/** Estado vacío (RF-8.8) con cualquier dato disponible, motores incluidos. */
const hasAnyMovement = computed(() => allCecoMovements.value.length > 0)

/* ════════════════ FE-S21-CARRYDRILL — grupo "Arrastre {N−1}" ════════════════ */

/**
 * RF-CR-04: disponibilidad del grupo de arrastre — flag ON del cache del
 * store + sin `no_source` + líneas existentes. Con flag OFF o `no_source` el
 * grupo NO se renderiza ni error (AC-S21-FE-5). Los pivotes del año propio
 * ya disparan `fetchCarryover` por lazy (query del editor); aquí el
 * `load()` asegura el fetch fresco (dedupe del store — Tarea 6).
 */
const carryoverState = computed(() => scenarioStore.carryover)

const carryoverAvailable = computed(
  () =>
    carryoverState.value.enabled === true &&
    carryoverState.value.unavailableReason !== 'no_source' &&
    Array.isArray(carryoverState.value.lines) &&
    carryoverState.value.lines.length > 0
)

/**
 * Año fuente del título "Arrastre {N−1}" (RF-CR-05): `source.budget_year`
 * del cache; fallback `scenarioYear − 1`; null si no computa (grupo oculto).
 */
const carryGroupYear = computed(() => {
  const sourceYear = Number(carryoverState.value.source?.budget_year)
  if (Number.isInteger(sourceYear)) return sourceYear
  const own = Number(scenario.value?.budget_year)
  return Number.isInteger(own) ? own - 1 : null
})

/**
 * RF-CR-04/07: movimientos de arrastre DEL CECO del detalle — MISMO slice
 * de `store.carryover.lines` que `buildCarryPivot`, normalizado a la forma
 * común (`normalizeCarryoverLines`) y filtrado POR CECO. Cuadre 1:1 con la
 * fila del pivote por CECO+origen (crudo sin gross-up).
 */
const carryMovements = computed(() => {
  if (!carryoverAvailable.value) return []
  const id = costCenterId.value
  if (id === null) return []
  return normalizeCarryoverLines(carryoverState.value.lines).filter(
    (movement) => movement.id_cost_center === id
  )
})

/**
 * RF-CR-05/09: filtro de ORIGEN del grupo de arrastre (distintivo del
 * grupo; los filtros del año propio quedan como hoy). PRESELECCIÓN desde
 * `?carry={origin}` del link del pivote (RF-CR-01); 'all' = TODOS los
 * orígenes (limpiado — AC-S21-FE-2). Solo valores legales.
 */
const carryOriginFilter = ref(
  isCarryoverOrigin(String(route.query.carry ?? '')) ? String(route.query.carry) : 'all'
)

const CARRY_ORIGIN_OPTIONS = [
  { value: 'all', label: 'Todos los orígenes' },
  { value: 'line', label: CARRYOVER_ORIGIN_LABELS.line },
  { value: 'cogs', label: CARRYOVER_ORIGIN_LABELS.cogs },
  { value: 'purchase', label: CARRYOVER_ORIGIN_LABELS.purchase },
  { value: 'internment', label: CARRYOVER_ORIGIN_LABELS.internment }
]

/** Sincronización viva del PRESET (deep-link cambiado en vuelo → 'all' si inválido). */
watch(
  () => route.query.carry,
  (value) => {
    if (isCarryoverOrigin(String(value ?? ''))) carryOriginFilter.value = String(value)
  }
)

/** RF-CR-07/09: slice visible del arrastre — origen + bucket del tab (Flujo). */
const carryFilteredMovements = computed(() => {
  const origin = carryOriginFilter.value
  return carryMovements.value.filter((movement) => {
    if (origin !== 'all' && movement.carryover_origin !== origin) return false
    return movementMatchesMonthFilter(movement, TAB_FLOW, filters.month)
  })
})

/** Σ del grupo visible (mismo `movementAmountReconciled` crudo del kind). */
const carryFilteredTotal = computed(() => {
  let total = 0
  for (const movement of carryFilteredMovements.value) {
    const amount = movementAmountReconciled(
      movement,
      TAB_FLOW,
      ivaActive.value,
      fixedIncomeByMonth.value
    )
    if (Number.isFinite(amount)) total += amount
  }
  return total
})

/**
 * Dataset POR TAB (RF-3.4 revisada): capital/desembolsos SOLO Flujo; base +
 * nómina + financiación en ambos.
 */
const tabMovements = computed(() => movementsForTab(allCecoMovements.value, activeTab.value))

/**
 * Dataset ÚNICO (RF-6.2): pasa a la vez al pivote, a la tabla y alimenta el
 * total de cabecera — los tres derivan de ESTE computed (RF-4.3/RF-8.7).
 */
const filteredLines = computed(() => {
  const month = filters.month
  const type = filters.lineType
  const behavior = filters.behavior
  const tab = activeTab.value
  return tabMovements.value.filter((movement) => {
    // RF-8.7: "Tipo de línea" = grupo origen/tipo ("Nómina", "Financiación",
    // "Capital de financiación", "Desembolsos", …).
    const group = movementGroupOf(movement)
    if (type !== 'all' && group !== type) return false
    // El comportamiento es atributo de la BASE; los motores son 'fixed'
    // implícito, el filtro no los toca (RF-8.7).
    if (
      behavior !== 'all' &&
      (movement.source_kind ?? SOURCE_KINDS.BASE) === SOURCE_KINDS.BASE &&
      movement.behavior_type !== behavior
    ) {
      return false
    }
    if (month === 'all') return true
    return movementMatchesMonthFilter(movement, tab, month)
  })
})

/* ─────────────── Cabecera: modo IVA heredado + total de la tab ─────────────── */

/** Bandera viva del modo (SIN toggle: solo lectura, RF-2.2 / AC-6). */
const ivaActive = computed(() => ivaStore.ivaMode === true)

/**
 * REVISIÓN 5 (RF-11.3/RF-11.6 + spec `frontend.03_21` §5.3): serie de
 * ingresos fijos por mes de causación CORTADA POR CECO — la base del monto
 * variable ES la facturación del MES del PROPIO CECO del detalle (espejo
 * B1c de `backend.02_24` §5.2), no la del escenario completo (bug corregido:
 * la base global hacía que todos los CECOs con la misma tasa mostraran el
 * mismo monto). Helper compartido `planningFormat.fixedIncomeCausationByCeco`
 * sobre la MISMA caché `budget_lines` (cero HTTP, ASM-10); CECO sin líneas de
 * ingreso ⇒ serie de 12 ceros (degradación honesta — BR-FE21-02). La misma
 * serie alimenta el pivote variable de la Ejecutiva (vía las filas del
 * pivote de Ingresos) y el bloque del Flujo — pivot/tabla/exportación quedan
 * byte-cuadre con la matriz (AC-16/AC-FE21-4).
 *
 *  ENMIENDA A-01 (spec `frontend.03_21` §10, 2026-10-20): si el CECO del
 *   detalle es de GASTO variable (Comisiones 210xxx / Despacho 320xxx), su
 *   serie de base la define el CECO GENERADOR de facturación resuelto por
 *   (id_zone, id_line) — `fixedIncomeCausationByVariableCeco`, la MISMA regla
 *   de los pivotes (AC-FE21-8): sin esa resolución el detalle saldría todo en 0
 *   desacoplado de la matriz. Un CECO con facturación propia conserva su serie
 *   propia (propio CECO primero). Zona+línea sin facturación ⇒ serie de 12
 *   ceros (AC-FE21-9, sin fallback).
 *
 *  ENMIENDA A-02 (spec `frontend.03_21` §11, 2026-10-21): la base se elige POR
 *  COMPORTAMIENTO de la línea variable del CECO — `variable_sales` conserva la
 *  serie I (facturación por mes de causación) y `variable_receivables` cambia
 *  a la serie R de las ENTRADAS del Flujo (`entradasCausacionByVariableCeco`:
 *  Σ cobros del CECO generador resuelto por su MES DE PAGO, NETA sin gross-up
 *  — el modo IVA de los inflows es solo presentación). El resultado es el
 *  PAR de series `{ sales, receivables }` que `movementAmountReconciled`
 *  selecciona por línea (AC-FE21-10/AC-FE21-11): pivot/tabla/exportación
 *  quedan byte-cuadre con ambos bloques de la matriz (AC-16).
 */
const fixedIncomeByMonth = computed(() => {
  const zeroSeries = Array.from({ length: 12 }, () => 0)
  if (!currentReady.value) return { sales: zeroSeries, receivables: zeroSeries }
  const lines = scenario.value.budget_lines
  const costCenters = scenarioStore.costCenters
  const id = costCenterId.value
  // A-01/A-02: serie ya resuelta por el CECO de gasto variable POR
  // COMPORTAMIENTO (facturado ⇒ I causado; recaudo ⇒ R cobro del mes de pago).
  const salesSeries =
    fixedIncomeCausationByVariableCeco(lines, costCenters).get(id) ??
    // CECO de ingreso (o cualquier otro): su serie propia (compatibilidad).
    fixedIncomeCausationByCeco(lines).get(id) ??
    zeroSeries
  const receivablesSeries =
    entradasCausacionByVariableCeco(lines, costCenters, Number(scenario.value.budget_year)).get(
      id
    ) ??
    // Fallback de PRESENTACIÓN para CECOs sin resolución de recaudo: la serie
    // de ENTRADAS propia del CECO (espejo `entradasCausacionByCeco`); sin
    // cobros ⇒ 12 ceros (AC-FE21-11, sin fallback a otras zonas/líneas).
    entradasCausacionByCeco(lines, Number(scenario.value.budget_year)).get(id) ??
    zeroSeries
  return { sales: salesSeries, receivables: receivablesSeries }
})

/** Etiquetas de mes para el filtro (Ene–Dic de `planningFormat`). */
const MONTHS = MONTH_LABELS

/**
 * Disponibilidad de las opciones extra del filtro "Mes" (fix 2026-10-26):
 * "Antes/Después de N" solo se ofrecen cuando el dataset DEL TAB (sin el
 * propio filtro de mes — antes de que se vuelvan incapturables) tiene algún
 * movimiento en ese bucket, en espejo de las columnas CONDICIONALES del
 * pivote. `scenarioYear` no entero ⇒ sin opciones (degradación del bucket).
 */
const ooyAvailable = computed(() => {
  const out = { before: false, after: false }
  if (scenarioYear.value === null) return out
  const tab = activeTab.value
  for (const movement of tabMovements.value) {
    if (out.before && out.after) break
    const bucket = movementBucketOf(movement, tab, scenarioYear.value)
    if (bucket === MOVEMENT_BUCKET_BEFORE) out.before = true
    else if (bucket === MOVEMENT_BUCKET_AFTER) out.after = true
  }
  return out
})

/**
 * Total del CECO de la TAB ACTIVA (RF-3.5) sobre el dataset filtrado, con el
 * MISMO `movementAmountReconciled` de pivote/tabla — cuadra con las filas
 * base del pivote de origen para el CECO y, desde la REVISIÓN 4
 * (`frontend.03_19` §11), también con el bloque "Gastos variables
 * (calculados)" (monto reconciliado, AC-16).
 */
const cecoTotal = computed(() => {
  let total = 0
  for (const line of filteredLines.value) {
    const amount = movementAmountReconciled(
      line,
      activeTab.value,
      ivaActive.value,
      fixedIncomeByMonth.value
    )
    if (Number.isFinite(amount)) total += amount
  }
  return total
})

/** Tooltip del chip de modo (R-FE14-2: se aclara qué tab altera el modo). */
const ivaChipTitle =
  'Heredado del editor de este escenario (preferencia por presupuesto). ' +
  'Solo lectura aquí: la tab Causado permanece neta (P&G) y la tab Flujo ' +
  'muestra caja bruta proyectada (× 1.19) con el modo activo.'

/** Tabs de activación con teclado ←/→ (mismo patrón `BudgetGridEditor`). */
function activateTab(kind) {
  if (!TAB_ORDER.includes(kind)) return
  activeTab.value = kind
  // Deep-link: la URL refleja el tab activo (sin recargar, sin historial).
  const query = { ...route.query }
  if (kind === TAB_FLOW) query.tab = 'flow'
  else delete query.tab
  router.replace({ query }).catch(() => {})
}

function onTabKeydown(event, index) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  const delta = event.key === 'ArrowRight' ? 1 : -1
  const next = TAB_ORDER[(index + delta + TAB_ORDER.length) % TAB_ORDER.length]
  activateTab(next)
  document.getElementById(`ceco-tab-${next}`)?.focus()
}

/* ============ FE-S20 (spec `frontend.03_20`): Exportar (Excel/CSV) ============ */

/** Slug de tab para el nombre de archivo `ceco-{code}-{tab}_{fecha}` (RF-6). */
const EXPORT_TAB_SLUGS = {
  [TAB_CAUSED]: 'causado',
  [TAB_FLOW]: 'flujo'
}

/** Menú de formato abierto (RF-2) + ancla del cierre por click fuera. */
const exportOpen = ref(false)
const exportRoot = ref(null)

/**
 * RF-7/CA-6: deshabilitado con 0 movimientos FILTRADOS (la vista pasa el
 * mismo dataset a la tabla) o con el detalle del escenario en vuelo.
 */
const exportDisabled = computed(
  () => scenarioStore.detailLoading || !currentReady.value || filteredLines.value.length === 0
)

/** `title` del botón deshabilitado (RF-7: explicativo). */
const exportDisabledTitle = computed(() => {
  if (scenarioStore.detailLoading) {
    return 'Exportación disponible cuando termine de cargar el escenario.'
  }
  return 'No hay movimientos que exportar (¿filtro sin resultados?).'
})

/** Cierre del menú al hacer click fuera (listener global, mismo patrón del editor). */
function onDocClickForExport(event) {
  if (!exportOpen.value) return
  if (exportRoot.value && !exportRoot.value.contains(event.target)) exportOpen.value = false
}

onMounted(() => document.addEventListener('click', onDocClickForExport))
onBeforeUnmount(() => document.removeEventListener('click', onDocClickForExport))

/**
 * RF-2/RF-3/RF-4/RF-5/RF-6 + CA-2: exporta los movimientos del tab activo
 * con los filtros RF-8.x aplicados (mismo dataset `filteredLines` de la
 * tabla) y los montos `movementAmountReconciled` del helper compartido —
 * REVISIÓN 4 (RF-11.5/AC-17): línea variable ⇒ monto reconciliado igual a
 * pantalla. Sin HTTP (RF-9) y con error vía `alertService` (RF-10).
 * @param {'csv'|'xlsx'} format
 */
function onExportSelect(format) {
  exportOpen.value = false
  try {
    const sheets = buildCecoSheets({
      movements: filteredLines.value,
      tab: activeTab.value,
      ivaActive: ivaActive.value,
      fixedIncomeByMonth: fixedIncomeByMonth.value,
      sheetName: TAB_LABELS[activeTab.value]
    })
    if (!sheets.length) throw new Error('El tab activo no tiene movimientos para exportar.')
    exportSheets({
      format,
      filename: buildExportFilename(
        `ceco-${cecoCodeParam.value || 'CECO'}-${EXPORT_TAB_SLUGS[activeTab.value]}`,
        format
      ),
      sheets
    })
  } catch {
    alertService.generalError('No se pudo generar el archivo de exportación.')
  }
}
</script>

<template>
  <div class="cd-page">
    <div class="section-header">
      <div class="section-accent"></div>
      <h2 class="section-title">Movimientos del CECO</h2>
    </div>

    <!-- Cargando primer fetch / escenario de la URL no en caché (RF-2.4) -->
    <div
      v-if="scenarioStore.detailLoading && !currentReady"
      class="cd-loading"
      aria-live="polite"
    >
      <span class="cd-spinner" aria-hidden="true"></span>
      Cargando escenario…
    </div>

    <!-- Error de carga (404 ya redirigió; esto es red/5xx) -->
    <div v-else-if="detailError" class="cd-error" role="alert">
      <span>No se pudo cargar el escenario. Verifique su conexión e inténtelo de nuevo.</span>
      <div class="cd-error-actions">
        <button type="button" class="btn btn-secondary btn-sm" @click="load(true)">
          Reintentar
        </button>
        <button type="button" class="btn btn-outline btn-sm" @click="backToPlanning">
          Volver a Planeación
        </button>
      </div>
    </div>

    <template v-else-if="currentReady">
      <!-- Cabecera: CECO + escenario/año + modo heredado + total de la tab -->
      <header class="cd-header">
        <div class="cd-header-main">
          <button
            type="button"
            class="cd-back"
            aria-label="Volver al detalle del escenario"
            @click="backToPlanning"
          >
            ← Volver a planning
          </button>
          <h3 class="cd-name">
            <span class="cd-ceco-code">{{ cecoCodeParam || 'CECO' }}</span>
            <span v-if="costCenter" class="cd-ceco-name">— {{ costCenter.cost_center_name }}</span>
            <span v-else-if="!cecoResolved" class="cd-ceco-name cd-ceco-name-missing">
              — CECO no identificado en el catálogo
            </span>
          </h3>
          <p class="cd-meta">
            <span class="cd-scenario" :title="scenario.budget_name">{{
              scenario.budget_name
            }}</span>
            <span class="cd-year">{{ scenario.budget_year }}</span>
            <span v-if="ivaActive" class="cd-chip cd-chip-iva" :title="ivaChipTitle">
              Modo caja con IVA (proyectado)
            </span>
            <span v-else class="cd-chip cd-chip-neto" :title="ivaChipTitle">Montos netos</span>
          </p>
          <p class="cd-total" aria-live="polite">
            Σ Total ({{ TAB_LABELS[activeTab] }})
            <strong>{{ formatMoneyPlain(cecoTotal) }}</strong>
            <span class="cd-lines">
              · {{ filteredLines.length }}
              {{ filteredLines.length === 1 ? 'movimiento' : 'movimientos' }}
            </span>
          </p>
        </div>
      </header>

      <!-- RF-8.9 / AC-13: fallo de un origen ⇒ notice discreto con
           Reintentar; la base y los demás orígenes se ven sin afectación.
           El loading de motores NO bloquea el render (sin banner mientras). -->
      <div v-for="notice in engineNotices" :key="notice.key" class="cd-notice" role="status">
        <span
          >No se pudo cargar {{ notice.label }}; el resto de los movimientos se muestra
          completo.</span
        >
        <button
          type="button"
          class="cd-notice-retry"
          :disabled="notice.loading"
          @click="notice.retry"
        >
          Reintentar
        </button>
      </div>

      <!-- =============================== Tabs =============================== -->
      <!-- FE-S20 (spec `frontend.03_20`) RF-1/RF-2: barra de pills + control
           "Exportar" (menú Excel/CSV) sobre la misma línea; se cierra al
           hacer click fuera (listener global del script). -->
      <div class="cd-tabs-row">
        <div class="cd-tabs" role="tablist" aria-label="Perspectivas de los movimientos del CECO">
          <button
            v-for="(tab, index) in TAB_ORDER"
            :id="`ceco-tab-${tab}`"
            :key="tab"
            class="cd-tab-pill"
            :class="{ 'is-active': activeTab === tab }"
            type="button"
            role="tab"
            :aria-selected="activeTab === tab"
            :aria-controls="`ceco-panel-${tab}`"
            :tabindex="activeTab === tab ? 0 : -1"
            @click="activateTab(tab)"
            @keydown="onTabKeydown($event, index)"
          >
            {{ TAB_LABELS[tab] }}
          </button>
        </div>
        <div ref="exportRoot" class="cd-export">
          <button
            type="button"
            class="cd-export-btn"
            :class="{ 'is-open': exportOpen }"
            :disabled="exportDisabled"
            :title="
              exportDisabled
                ? exportDisabledTitle
                : 'Exportar los movimientos de esta pestaña (Excel o CSV)'
            "
            aria-haspopup="menu"
            :aria-expanded="exportOpen ? 'true' : 'false'"
            @click.stop="exportOpen = !exportOpen"
          >
            <svg
              class="cd-export-icon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Exportar</span>
          </button>
          <div
            v-if="exportOpen"
            class="cd-export-menu"
            role="menu"
            aria-label="Formato de exportación"
          >
            <button
              type="button"
              class="cd-export-item"
              role="menuitem"
              @click="onExportSelect('xlsx')"
            >
              Excel (.xlsx)
            </button>
            <button
              type="button"
              class="cd-export-item"
              role="menuitem"
              @click="onExportSelect('csv')"
            >
              CSV
            </button>
          </div>
        </div>
      </div>

      <template v-if="hasAnyMovement || (carryoverAvailable && carryMovements.length > 0)">
        <!-- ===================== Barra de filtros (RF-6.1) ===================== -->
        <div class="cd-filters" role="group" aria-label="Filtros de los movimientos del CECO">
          <label class="cd-filter">
            <span>Mes</span>
            <select
              v-model="filters.month"
              class="cd-select"
              aria-label="Filtrar por mes de referencia"
            >
              <option value="all">Todos los meses</option>
              <option v-if="activeTab === TAB_FLOW" value="none">Sin fecha de pago</option>
              <option v-if="ooyAvailable.before" value="before">Antes de {{ scenarioYear }}</option>
              <option v-if="ooyAvailable.after" value="after">Después de {{ scenarioYear }}</option>
              <option v-for="(label, index) in MONTHS" :key="label" :value="String(index)">
                {{ label }}
              </option>
            </select>
          </label>
          <label class="cd-filter">
            <span>Tipo de línea</span>
            <select
              v-model="filters.lineType"
              class="cd-select"
              aria-label="Filtrar por tipo y origen del movimiento"
            >
              <option
                v-for="option in MOVEMENT_GROUP_FILTERS"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </label>
          <label class="cd-filter">
            <span>Comportamiento</span>
            <select
              v-model="filters.behavior"
              class="cd-select"
              aria-label="Filtrar por comportamiento (solo movimientos de presupuesto)"
            >
              <option value="all">Todos</option>
              <option v-for="(label, key) in BEHAVIOR_LABELS" :key="key" :value="key">
                {{ label }}
              </option>
            </select>
          </label>
        </div>

        <!-- ================= Panel Causado (Default, RF-3.2) ================= -->
        <div
          id="ceco-panel-caused"
          v-show="activeTab === TAB_CAUSED"
          class="cd-panel"
          role="tabpanel"
          aria-labelledby="ceco-tab-caused"
        >
          <p class="cd-tab-note">
            Movimientos del CECO por causación (budget_date): presupuesto, nómina y financiación
            what-if (RF-8.5). Montos en COP (sin símbolo) sobre netos: cuadra con las filas base y
            simuladas de la Vista Ejecutiva. La línea variable de gasto muestra el monto
            reconciliado tasa × ingresos fijos del mes (REVISIÓN 4). El capital y los desembolsos de
            financiación no entran: no son gasto del P&G (RF-8.3). Las causaciones del año
            {{ scenarioYear }} llenan las columnas Ene–Dic; las de otros años van en las columnas
            "Antes/Después de {{ scenarioYear }}" cuando existen.
          </p>
          <CecoMovementPivot
            :lines="filteredLines"
            :tab="TAB_CAUSED"
            :fixed-income-months="fixedIncomeByMonth"
            :scenario-year="scenarioYear"
          />
          <CecoMovementTable
            :lines="filteredLines"
            :tab="TAB_CAUSED"
            :fixed-income-months="fixedIncomeByMonth"
          />
        </div>

        <!-- ==================== Panel Flujo (RF-3.3) ==================== -->
        <div
          id="ceco-panel-flow"
          v-show="activeTab === TAB_FLOW"
          class="cd-panel"
          role="tabpanel"
          aria-labelledby="ceco-tab-flow"
        >
          <p class="cd-tab-note">
            Movimientos del CECO por pago: base/nómina/financiación con el fallback payment_date →
            budget_date y capital/desembolsos por su payment_date puro (RF-8.5) — cuadra con los
            bloques "Gastos fijos", "Capital de financiación" y "Desembolsos" de la Vista Flujo. La
            línea variable conservará el monto reconciliado (tasa × ingresos fijos por causación) y
            cae en el mes de su budget_date, igual que el bloque "Gastos variables (calculados)" del
            Flujo (REVISIÓN 4). Solo los pagos del año {{ scenarioYear }} llenan Ene–Dic: los de
            otros años van en "Antes/Después de {{ scenarioYear }}" cuando existen (fix de la mezcla
            de 2026/2027 en la misma columna) y los sin fecha en la columna "Sin fecha de pago".
          </p>
          <CecoMovementPivot
            :lines="filteredLines"
            :tab="TAB_FLOW"
            :fixed-income-months="fixedIncomeByMonth"
            :scenario-year="scenarioYear"
          />
          <CecoMovementTable
            :lines="filteredLines"
            :tab="TAB_FLOW"
            :fixed-income-months="fixedIncomeByMonth"
          />

          <!-- ═════ FE-S21-CARRYDRILL RF-CR-05: grupo "Arrastre {N−1}" ═════
               SOLO en el tab Flujo; NO invade el pivote/tabla del año
               propio (dataset aparte del MISMO slice del store). Con
               slice vacío (filtro origen/mes sin resultado) muestra su
               estado "0 resultados" — sin crash (RF-CR-07). -->
          <section
            v-if="carryoverAvailable && carryMovements.length > 0"
            class="cd-carry-group"
            aria-label="Movimientos de arrastre del CECO"
          >
            <header class="cd-carry-header">
              <h4 class="cd-carry-title">
                Arrastre de {{ carryGroupYear ?? 'año anterior' }}
                <span class="cd-carry-count">
                  {{ carryFilteredMovements.length }}
                  {{ carryFilteredMovements.length === 1 ? 'movimiento' : 'movimientos' }} ·
                  {{ formatMoneyPlain(carryFilteredTotal) }}
                </span>
              </h4>
              <label class="cd-filter">
                <span>Origen</span>
                <select
                  v-model="carryOriginFilter"
                  class="cd-select"
                  aria-label="Filtrar movimientos de arrastre por origen"
                >
                  <option
                    v-for="option in CARRY_ORIGIN_OPTIONS"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>
              </label>
            </header>
            <CecoMovementTable
              v-if="carryFilteredMovements.length"
              :lines="carryFilteredMovements"
              :tab="TAB_FLOW"
              :fixed-income-months="fixedIncomeByMonth"
              :carry-year="carryGroupYear"
              carry-mode
            />
            <p v-else class="cd-carry-empty" role="status">0 resultados con el filtro actual.</p>
          </section>
        </div>
      </template>

      <!-- RF-2.3 / RF-8.8 / AC-7: estado vacío SOLO si el CECO resuelto y
           cero movimientos en TODOS los orígenes (base + motores). -->
      <div v-else class="cd-empty" role="status">
        <p>
          {{
            cecoResolved
              ? 'Sin movimientos para este CECO en este escenario (tampoco nómina, financiación ni capital).'
              : `No se pudo identificar el CECO ${cecoCodeParam} en el catálogo (¿no disponible por ahora?).`
          }}
        </p>
        <button type="button" class="btn btn-secondary btn-sm" @click="backToPlanning">
          Volver a planning
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.cd-page {
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
  padding: 24px;
}

.cd-loading {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: center;
  padding: 36px 16px;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 8px;
  background-color: var(--color-surface-card, #ffffff);
  font-size: 0.85rem;
  color: var(--color-text-muted, #8a8a8a);
}

.cd-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(120, 120, 120, 0.25);
  border-top-color: var(--color-brand, #03658c);
  border-radius: 50%;
  animation: cd-spin 0.8s linear infinite;
}

@keyframes cd-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .cd-spinner {
    animation-duration: 1.6s;
  }
}

.cd-error {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border: 1px solid rgba(197, 48, 48, 0.35);
  border-left: 4px solid #c53030;
  border-radius: 8px;
  background-color: rgba(197, 48, 48, 0.07);
  font-size: 0.84rem;
  color: #9b2222;
}

:root[data-theme='dark'] .cd-error {
  color: #ff9b9b;
}

.cd-error-actions {
  display: flex;
  gap: 8px;
}

/* Cabecera (misma familia del editor) */

.cd-header {
  margin: 14px 0 18px;
  padding: 16px 18px;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 8px;
  background-color: var(--color-surface-card, #ffffff);
}

.cd-back {
  margin-bottom: 8px;
  padding: 0;
  border: none;
  background: none;
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--color-brand, #03658c);
  cursor: pointer;
}

.cd-back:hover {
  text-decoration: underline;
}

.cd-name {
  margin: 0;
  font-size: 1.12rem;
  font-weight: 700;
  color: var(--color-text-primary, #070707);
}

.cd-ceco-code {
  font-variant-numeric: tabular-nums;
}

.cd-ceco-name {
  color: var(--color-text-secondary, #555555);
}

.cd-ceco-name-missing {
  font-size: 0.9rem;
  font-style: italic;
  color: var(--color-text-muted, #8a8a8a);
}

.cd-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin: 6px 0 0;
  font-size: 0.8rem;
}

.cd-scenario {
  font-weight: 600;
  color: var(--color-text-primary, #070707);
}

.cd-year {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--color-text-secondary, #555555);
}

.cd-total {
  margin: 8px 0 0;
  font-size: 0.8rem;
  color: var(--color-text-secondary, #555555);
}

.cd-total strong {
  font-variant-numeric: tabular-nums;
  color: var(--color-brand, #03658c);
}

:root[data-theme='dark'] .cd-total strong {
  color: #56c8ee;
}

.cd-lines {
  color: var(--color-text-muted, #8a8a8a);
}

/* Chips (mismos tonos del editor: ámbar "proyección" / gris neto) */

.cd-chip {
  display: inline-block;
  padding: 3px 10px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
}

.cd-chip-iva {
  border-color: rgba(180, 83, 9, 0.4);
  background-color: rgba(245, 158, 11, 0.1);
  color: #96590a;
}

:root[data-theme='dark'] .cd-chip-iva {
  color: #f6c177;
}

.cd-chip-neto {
  border-color: rgba(120, 120, 120, 0.35);
  background-color: rgba(120, 120, 120, 0.12);
  color: var(--color-text-secondary, #555555);
}

/* Tabs "pill" (patrón de BudgetGridEditor)
 * FE-S20: la fila completa (pills + Exportar) lleva el margen inferior. */

.cd-tabs-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 16px;
}

.cd-tabs {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 999px;
  background-color: var(--color-surface, #f2f4f7);
}

:root[data-theme='dark'] .cd-tabs {
  background-color: rgba(255, 255, 255, 0.05);
}

/* ─── FE-S20 (spec `frontend.03_20`) RF-1/RF-2/RF-7: botón + menú Exportar ─── */

.cd-export {
  position: relative;
}

.cd-export-btn {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 8px 16px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 999px;
  background-color: var(--color-surface-card, #ffffff);
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--color-text-secondary, #555555);
  cursor: pointer;
  transition:
    background-color 0.18s cubic-bezier(0.23, 1, 0.32, 1),
    color 0.18s cubic-bezier(0.23, 1, 0.32, 1);
}

:root[data-theme='dark'] .cd-export-btn {
  background-color: rgba(255, 255, 255, 0.05);
}

.cd-export-icon {
  width: 14px;
  height: 14px;
}

.cd-export-btn:hover:not(:disabled),
.cd-export-btn.is-open {
  background-color: rgba(3, 101, 140, 0.08);
  color: var(--color-text-primary, #070707);
}

:root[data-theme='dark'] .cd-export-btn:hover:not(:disabled),
:root[data-theme='dark'] .cd-export-btn.is-open {
  background-color: rgba(86, 200, 238, 0.12);
  color: #56c8ee;
}

.cd-export-btn:focus-visible {
  outline: 2px solid var(--color-brand, #03658c);
  outline-offset: 1px;
}

.cd-export-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.cd-export-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 190px;
  padding: 6px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 10px;
  background-color: var(--color-surface-card, #ffffff);
  box-shadow: 0 10px 30px rgba(7, 7, 7, 0.16);
}

:root[data-theme='dark'] .cd-export-menu {
  border-color: rgba(255, 255, 255, 0.14);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}

:root[data-theme='dark'] .cd-export-item {
  color: #d5dde4;
}

.cd-export-item {
  padding: 8px 12px;
  border: none;
  border-radius: 7px;
  background: transparent;
  font-size: 0.8rem;
  color: var(--color-text-primary, #070707);
  text-align: left;
  cursor: pointer;
}

.cd-export-item:hover {
  background-color: rgba(3, 101, 140, 0.08);
}

.cd-export-item:focus-visible {
  outline: 2px solid var(--color-brand, #03658c);
  outline-offset: -2px;
}

.cd-tab-pill {
  padding: 8px 18px;
  border: none;
  border-radius: 999px;
  background: transparent;
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--color-text-secondary, #555555);
  cursor: pointer;
  transition:
    background-color 0.18s cubic-bezier(0.23, 1, 0.32, 1),
    color 0.18s cubic-bezier(0.23, 1, 0.32, 1);
}

.cd-tab-pill:hover:not(.is-active) {
  background-color: rgba(3, 101, 140, 0.08);
  color: var(--color-text-primary, #070707);
}

.cd-tab-pill:focus-visible {
  outline: 2px solid var(--color-brand, #03658c);
  outline-offset: 1px;
}

.cd-tab-pill.is-active {
  background-color: var(--color-brand, #03658c);
  font-weight: 600;
  color: var(--text-white, #eeeeee);
  box-shadow: 0 1px 4px rgba(3, 101, 140, 0.35);
}

/* Barra de filtros */

.cd-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: flex-end;
  margin-bottom: 14px;
}

.cd-filter {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cd-filter > span {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--color-text-muted, #8a8a8a);
}

.cd-select {
  min-width: 170px;
  padding: 6px 10px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 6px;
  background-color: var(--color-surface-card, #ffffff);
  color: var(--color-text-primary, #070707);
  font-size: 0.8rem;
}

.cd-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cd-tab-note {
  margin: -6px 0 0;
  font-size: 0.8rem;
  color: var(--color-text-secondary, #555555);
}

/* Estado vacío (RF-2.3) */

.cd-empty {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  padding: 32px 16px;
  border: 1px dashed var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 8px;
  font-size: 0.84rem;
  color: var(--color-text-muted, #8a8a8a);
  text-align: center;
}

.cd-empty p {
  margin: 0;
}

/* Notice discreto de origen en error (RF-8.9): tono ámbar suave, metadata
 * viva con Reintentar (acción del store con force=true). */
.cd-notice {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  padding: 8px 12px;
  border: 1px solid rgba(180, 83, 9, 0.35);
  border-left: 4px solid #b45309;
  border-radius: 8px;
  background-color: rgba(245, 158, 11, 0.08);
  font-size: 0.78rem;
  color: #96590a;
}

:root[data-theme='dark'] .cd-notice {
  color: #f6c177;
}

.cd-notice-retry {
  flex: none;
  padding: 2px 10px;
  border: 1px solid rgba(3, 101, 140, 0.5);
  border-radius: 6px;
  background: none;
  font-size: 0.74rem;
  font-weight: 600;
  color: var(--color-brand, #03658c);
  cursor: pointer;
}

.cd-notice-retry:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ═══════════ FE-S21-CARRYDRILL: grupo "Arrastre {N−1}" (tab Flujo) ═══════════ */
.cd-carry-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 16px;
  padding: 12px 14px;
  border: 1px dashed var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 8px;
  background-color: var(--color-surface, #f7f7f7);
}

.cd-carry-header {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
}

.cd-carry-title {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text-primary, #070707);
}

.cd-carry-count {
  margin-left: 8px;
  font-size: 0.76rem;
  font-weight: 500;
  color: var(--color-text-muted, #8a8a8a);
  font-variant-numeric: tabular-nums;
}

.cd-carry-empty {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-text-muted, #8a8a8a);
}

@media (max-width: 768px) {
  .cd-page {
    padding: 20px 16px;
  }
}
</style>
