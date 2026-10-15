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
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CecoMovementPivot from '@/components/budget/planning/CecoMovementPivot.vue'
import CecoMovementTable from '@/components/budget/planning/CecoMovementTable.vue'
import { useBudgetPlanningStore } from '@/stores/budgetPlanningStore.js'
import { useUserStore } from '@/stores/userStore.js'
import { alertService } from '@/services/alertService.js'
import {
  BEHAVIOR_LABELS,
  MONTH_LABELS,
  formatMoneyPlain
} from '@/components/budget/planning/planningFormat.js'
import {
  MOVEMENT_GROUP_FILTERS,
  SOURCE_KINDS,
  TAB_CAUSED,
  TAB_FLOW,
  movementsForTab,
  movementAmount,
  movementMonthOf,
  movementGroupOf,
  normalizeBudgetLines,
  normalizeFinancingSimLines,
  normalizePayrollSimLines,
  normalizePrincipalFlowLines,
  resolveCostCenterId
} from '@/components/budget/planning/cecoMovements.js'

const TAB_ORDER = [TAB_CAUSED, TAB_FLOW]
const TAB_LABELS = {
  [TAB_CAUSED]: 'Causado',
  [TAB_FLOW]: 'Flujo'
}

const route = useRoute()
const router = useRouter()
const budgetPlanningStore = useBudgetPlanningStore()
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

const scenario = computed(() => budgetPlanningStore.currentScenario)

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
  const result = await budgetPlanningStore.fetchScenarioDetail(idBudget.value, force)
  if (result.ok) {
    // RF-8.2: mecánica de `BudgetGridEditor.load()` tras el detalle ok.
    // Borradores/cerrados ⇒ sims what-if en paralelo (single-flight/caché en
    // el store, degradación SILENTE); capital/desembolsos SIEMPRE
    // (active/draft/closed). Sin await: el render de la base jamás se
    // bloquea (RF-8.9).
    loadEngineMovements()
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
    void budgetPlanningStore.fetchPayrollSimulation(idBudget.value)
    void budgetPlanningStore.fetchFinancingSimulation(idBudget.value)
  }
  void budgetPlanningStore.fetchFinancingPrincipalFlow(idBudget.value)
}

/* ─── RF-8.9: notices discretos de fallo de un origen (Reintentar force) ─── */

/** Reintento de la nómina what-if (con `force`, acción existente del store). */
function retryPayrollSim() {
  if (scenario.value && scenario.value.status !== 'active') {
    void budgetPlanningStore.fetchPayrollSimulation(idBudget.value, { force: true })
  }
}

/** Reintento de la financiación what-if. */
function retryFinancingSim() {
  if (scenario.value && scenario.value.status !== 'active') {
    void budgetPlanningStore.fetchFinancingSimulation(idBudget.value, { force: true })
  }
}

/** Reintento del flujo de capital/desembolsos. */
function retryPrincipalFlow() {
  void budgetPlanningStore.fetchFinancingPrincipalFlow(idBudget.value, { force: true })
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
  if (showSims && budgetPlanningStore.payrollSim.error) {
    list.push({
      key: 'payroll',
      label: 'la simulación de nómina',
      loading: budgetPlanningStore.payrollSim.loading,
      retry: retryPayrollSim
    })
  }
  if (showSims && budgetPlanningStore.financingSim.error) {
    list.push({
      key: 'financing',
      label: 'la simulación de financiación',
      loading: budgetPlanningStore.financingSim.loading,
      retry: retryFinancingSim
    })
  }
  if (budgetPlanningStore.financingPrincipalFlow.error) {
    list.push({
      key: 'principal',
      label: 'el flujo de capital de financiación',
      loading: budgetPlanningStore.financingPrincipalFlow.loading,
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
  resolveCostCenterId(budgetPlanningStore.costCenters, cecoCodeParam.value)
)

const costCenter = computed(() =>
  costCenterId.value === null
    ? null
    : (budgetPlanningStore.costCenters.find((item) => item.id_cost_center === costCenterId.value) ??
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
 * Estado LOCAL de filtros (RF-6.1). `filters.month` opera sobre el mes de
 * POSICIONAMIENTO de la TAB ACTIVA (RF-8.5): `budget_date` en Causado,
 * `payment_date` (con fallback `cfMonth` para sims, puro para
 * capital/desembolsos) en Flujo, con la opción 'none' ("Sin fecha de pago")
 * solo disponible en Flujo. `filters.lineType` filtra por GRUPO
 * origen/tipo (RF-8.7); el comportamiento SOLO afecta a la base.
 */
const filters = reactive({ month: 'all', lineType: 'all', behavior: 'all' })

// Volver al tab Causado invalida 'none' ("Sin fecha de pago" es de Flujo);
// el watch lo resetea para no dejar un filtro imposible de aplicar.
watch(activeTab, (tab) => {
  if (tab !== TAB_FLOW && filters.month === 'none') filters.month = 'all'
})

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
  const payrollSim = budgetPlanningStore.payrollSim
  if (payrollSim.budgetId === budgetId && Array.isArray(payrollSim.data?.lines)) {
    out.push(...withCeco(normalizePayrollSimLines(payrollSim.data.lines, budgetId)))
  }
  // (3) Financiación what-if (intereses/seguros; capital jamás por aquí).
  const financingSim = budgetPlanningStore.financingSim
  if (financingSim.budgetId === budgetId && Array.isArray(financingSim.data?.lines)) {
    out.push(...withCeco(normalizeFinancingSimLines(financingSim.data.lines, budgetId)))
  }
  // (4) Capital/desembolsos del schedule de financiación.
  const principalFlow = budgetPlanningStore.financingPrincipalFlow
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
    if (month === 'none') return movementMonthOf(movement, tab) === -1
    return movementMonthOf(movement, tab) === Number(month)
  })
})

/* ─────────────── Cabecera: modo IVA heredado + total de la tab ─────────────── */

/** Bandera viva del modo (SIN toggle: solo lectura, RF-2.2 / AC-6). */
const ivaActive = computed(() => budgetPlanningStore.ivaMode === true)

/** Etiquetas de mes para el filtro (Ene–Dic de `planningFormat`). */
const MONTHS = MONTH_LABELS

/**
 * Total del CECO de la TAB ACTIVA (RF-3.5) sobre el dataset filtrado, con el
 * MISMO `movementAmount` de pivote/tabla — cuadra con las filas base del
 * pivote de origen para el CECO (diferencia permitida: 0 por redondeo).
 */
const cecoTotal = computed(() => {
  let total = 0
  for (const line of filteredLines.value) {
    const amount = movementAmount(line, activeTab.value, ivaActive.value)
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
</script>

<template>
  <div class="cd-page">
    <div class="section-header">
      <div class="section-accent"></div>
      <h2 class="section-title">Movimientos del CECO</h2>
    </div>

    <!-- Cargando primer fetch / escenario de la URL no en caché (RF-2.4) -->
    <div
      v-if="budgetPlanningStore.detailLoading && !currentReady"
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

      <template v-if="hasAnyMovement">
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
            simuladas de la Vista Ejecutiva. El capital y los desembolsos de financiación no entran:
            no son gasto del P&G (RF-8.3).
          </p>
          <CecoMovementPivot :lines="filteredLines" :tab="TAB_CAUSED" />
          <CecoMovementTable :lines="filteredLines" :tab="TAB_CAUSED" />
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
            bloques "Gastos fijos", "Capital de financiación" y "Desembolsos" de la Vista Flujo. Las
            líneas sin fecha quedan en la columna "Sin fecha de pago".
          </p>
          <CecoMovementPivot :lines="filteredLines" :tab="TAB_FLOW" />
          <CecoMovementTable :lines="filteredLines" :tab="TAB_FLOW" />
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

/* Tabs "pill" (patrón de BudgetGridEditor) */

.cd-tabs {
  display: inline-flex;
  gap: 4px;
  margin-bottom: 16px;
  padding: 4px;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 999px;
  background-color: var(--color-surface, #f2f4f7);
}

:root[data-theme='dark'] .cd-tabs {
  background-color: rgba(255, 255, 255, 0.05);
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

@media (max-width: 768px) {
  .cd-page {
    padding: 20px 16px;
  }
}
</style>
