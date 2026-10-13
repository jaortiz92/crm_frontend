<script setup>
/**
 * BudgetGridEditor — detalle de un escenario (`/budget/planning/:idBudget`),
 * ruta `BudgetPlanningGrid` (FE-S4 §3.1/§8).
 *
 * Cabecera (§8.1): nombre + chip de estado + año + `↳ Clonado de {parent}` +
 * "Marcar Meta Activa" (mismo gate §3.3) + volver al dashboard. Tres tabs
 * (patrón "pill" propio de Reglas Financieras, sin librerías; orden y default
 * redefinidos por FE-S4B §3, frontend.03_04):
 *  1. "Vista Ejecutiva" (DEFAULT, D-1): pivote CECO×Ene–Dic READ-ONLY agregado
 *     en cliente desde `budget_lines` (ASM-10: la matriz es presentación, no
 *     ingesta).
 *  2. "Vista Flujo": pivote de LIQUIDEZ READ-ONLY (FE-S4B-BUDGET-FLUJO):
 *     entradas/salidas por fecha de pago + resumen neto/acumulado; 100 %
 *     derivado de la misma caché (cero HTTP).
 *  3. "Editor de Celdas": grid inline con PUT puntual.
 *
 * El :idBudget no válido se resuelve aquí (NaN → toast + replace a
 * BudgetPlanning, §3.1) porque el `beforeEnter` solo valida el gate de rol.
 * 404 del detalle: toast + `router.replace` al dashboard (§9).
 *
 * FE-S6-CARRYOVER (§5): la cabecera gana el pill "Arrastrar saldos de {N−1}"
 * (visible desde cualquier tab — FD6-2; efecto solo en Flujo) con rollback
 * optimista del store, el aviso de fuente/indisponibilidad bajo el pill SOLO
 * en el tab Flujo (`aria-live="polite"` — FD6-3) y el disparo LAZY del GET
 * (tab Flujo activo + flag ON + sin fetch en vuelo).
 *
 * FE-S14-IVA (frontend.03_14 §5) + ENMIENDA D-FE14-7 (2026-09-23):
 *  - BARRA: switch segmentado "Neto / Con IVA" (D-FE14-1, default ON) — la
 *    preferencia se PERSISTE por `idBudget` en localStorage vía
 *    `budgetPlanningStore.setIvaMode` (cero HTTP). El modo SOLO altera la
 *    Vista Flujo: la cabecera (Σ Ingresos/Σ Gastos) y la Vista Ejecutiva son
 *    SIEMPRE NETOS (D-FE14-7: el P&G nunca lleva información de IVA), y con
 *    el modo ON la cabecera muestra el chip "Modo caja con IVA (proyectado)"
 *    que lo aclara (R-FE14-2).
 *  - TAB 4 "Liquidación": monta `IvaSettlementPanel` (fuente
 *    `GET /budget/iva/settlement/{id}` cacheada en el store). El settlement
 *    se pide AL ABRIR el escenario (§4.2), de nuevo con reintento perezoso
 *    al activar el tab y con el botón "Recalcular" del panel.
 *  - `BudgetLineGrid` recibe la bandera como prop (`iva-mode`, §5).
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ExecutivePivotTable from '@/components/budget/planning/ExecutivePivotTable.vue'
import CashFlowPivotTable from '@/components/budget/planning/CashFlowPivotTable.vue'
import BudgetLineGrid from '@/components/budget/planning/BudgetLineGrid.vue'
import IvaSettlementPanel from '@/components/budget/planning/IvaSettlementPanel.vue'
import SetTargetConfirmModal from '@/components/budget/planning/SetTargetConfirmModal.vue'
import { useBudgetPlanningStore } from '@/stores/budgetPlanningStore.js'
import { useUserStore } from '@/stores/userStore.js'
import { canSetBudgetTarget } from '@/router/index.js'
import { alertService } from '@/services/alertService.js'
import {
  budgetCollaboratorService,
  classifyCollaboratorError
} from '@/services/budgetCollaboratorService.js'
import { formatMoney, statusChipOf } from '@/components/budget/planning/planningFormat.js'

const TAB_ORDER = ['executive', 'flow', 'editor', 'settlement']

/** Etiquetas de los pills (FE-S4B §3.1; FE-S14 suma "Liquidación"). */
const TAB_LABELS = {
  executive: 'Vista Ejecutiva',
  flow: 'Vista Flujo',
  editor: 'Editor de Celdas',
  settlement: 'Liquidación'
}

const route = useRoute()
const router = useRouter()
const budgetPlanningStore = useBudgetPlanningStore()
const userStore = useUserStore()

// Default D-1 (FE-S4B): "Vista Ejecutiva" (antes 'editor').
const activeTab = ref('executive')
const detailError = ref(false)
const targetOpen = ref(false)

const idBudget = computed(() => Number(route.params.idBudget))

const scenario = computed(() => budgetPlanningStore.currentScenario)

const canTarget = computed(() => canSetBudgetTarget())

const statusChip = computed(() =>
  scenario.value ? statusChipOf(scenario.value.status) : { label: '', tone: 'draft' }
)

/** Σ informativos de la cabecera, de la MISMA caché de líneas (AC-FE-6).
 *  FE-S14-IVA ENMIENDA D-FE14-7: SIEMPRE NETOS — el modo "Con IVA" no toca
 *  la cabecera ni la Vista Ejecutiva (el IVA solo genera efecto en el Flujo). */
const headerTotals = computed(() => {
  const lines = scenario.value?.budget_lines ?? []
  let income = 0
  let expense = 0
  for (const line of lines) {
    const amount = Number(line.projected_amount)
    if (!Number.isFinite(amount)) continue
    if (line.line_type === 'income') income += amount
    else if (line.line_type === 'expense') expense += amount
  }
  return { income, expense }
})

/* ───────────── FE-S14-IVA §5: switch "Neto / Con IVA" (persistente por escenario) ───────────── */

/** Bandera viva del modo (dueño: store; localStorage por `idBudget`). */
const ivaMode = computed(() => budgetPlanningStore.ivaMode === true)

/**
 * Toggle del switch: SIN HTTP (preferencia de visualización; las derivaciones
 * cuelgan de la reactividad — AC-FE14-1/2). Al encender el modo, si el
 * settlement nunca se cargó (o quedó en error) se refuerza el GET: el bloque
 * del Flujo y la pestaña Liquidación lo necesitan (D-FE14-4).
 * @param {boolean} value
 */
function onIvaModeSelect(value) {
  const flag = Boolean(value)
  if (flag === ivaMode.value) return
  budgetPlanningStore.setIvaMode(idBudget.value, flag)
  if (flag) void budgetPlanningStore.fetchIvaSettlement(idBudget.value)
}

/** Meta activa a desactivar: de la caché del listado (se refresca blando). */
const demotedName = computed(() => {
  if (!scenario.value) return null
  const active = budgetPlanningStore.findActiveForYear(
    scenario.value.budget_year,
    scenario.value.id_budget
  )
  return active ? active.budget_name : null
})

/* ----------------- Arrastre de saldos N−1 (FE-S6-CARRYOVER §5) ----------------- */

/** Caché del arrastre (store): `enabled/source/lines/loading/error/saving…`. */
const carryover = computed(() => budgetPlanningStore.carryover)

/** N−1: año de la fuente (etiqueta del pill y avisos §5). */
const carrySourceYear = computed(() => {
  const year = Number(scenario.value?.budget_year)
  return Number.isInteger(year) ? year - 1 : null
})

/**
 * Texto del aviso bajo el pill (§5/§7, SOLO tab Flujo): fuente cargada ⇒
 * `← {budget_name} · {status}`; sin escenario N−1 ⇒ copy literal; fallo de
 * red/5xx ⇒ "No se pudo cargar el arrastre." (el pill NO revierte por GET:
 * solo el PUT fallido hace rollback).
 */
const carryHintText = computed(() => {
  if (activeTab.value !== 'flow') return ''
  const state = budgetPlanningStore.carryover
  if (!state.enabled) return ''
  if (state.source) return `← ${state.source.budget_name} · ${state.source.status}`
  if (state.unavailableReason === 'no_source') {
    return `No hay escenario de ${carrySourceYear.value} para arrastrar.`
  }
  if (state.error) return 'No se pudo cargar el arrastre.'
  return ''
})

/**
 * Toggle del pill: `setCarryoverFlag` ya aplicó el optimismo y revierte solo
 * (con PUT en vuelo bloqueado por `saving`). Cualquier fallo no-auth (404
 * re-sincronizado por el store incluido) muestra el toast literal §5; el
 * `:checked` del input vuelve al estado del store en el re-render.
 */
async function onCarryoverToggle(event) {
  const next = event.target.checked
  const result = await budgetPlanningStore.setCarryoverFlag(scenario.value.id_budget, next)
  if (!result.ok && result.kind !== 'auth') {
    await alertService.generalError('No se pudo guardar. Reintenta.')
  }
}

/**
 * Disparo LAZY del GET (AC-S6-FE-1): tab Flujo activo + flag ON + sin fetch en
 * vuelo + SIN toggle en vuelo ⇒ `fetchCarryover` (no-op cacheado dentro del
 * store). El guard `!saving` evita la carrera con `setCarryoverFlag`: el
 * optimismo pone `enabled=true` antes del PUT, pero el GET autoritativo lo
 * dispara SOLO la acción (force tras el 200); el watch cubre los otros dos
 * momentos: activar el tab y cargar el escenario (F5 con flag ON persistente).
 * El reintento silencioso §7 queda cubierto: el fallo dejó `loaded:false` y
 * reactivar el tab/toggle vuelve a intentar.
 */
watch(
  [
    activeTab,
    () => budgetPlanningStore.carryover.enabled,
    () => budgetPlanningStore.currentScenario?.id_budget
  ],
  () => {
    const state = budgetPlanningStore.carryover
    if (activeTab.value === 'flow' && state.enabled && !state.loading && !state.saving) {
      void budgetPlanningStore.fetchCarryover(idBudget.value)
    }
  }
)

/* ============ BE-S11 enmienda (Opcion A): banner de nómina sin proyectar ============
 * Al abrir un escenario ACTIVO se consulta materialization-status (solo
 * conteos, auth simple). needs_materialization = nómina cargada (planes
 * abiertos) pero cero líneas del motor en este escenario — típico cuando la
 * meta se creó DESPUÉS del import o cuando el import avisó "no materialized".
 * El botón reusa POST recalculate con ancla enero del año del escenario
 * (R-13 idempotente: nunca duplica, jamás toca líneas ajenas al motor). */
const payrollStatus = ref(null)
const payrollBusy = ref(false)

const payrollNoticeText = computed(() => {
  if (!payrollStatus.value) return ''
  const n = payrollStatus.value.collaborators_with_open_plan
  return `Hay ${n} colaborador(es) con salario vigente, pero la nómina no está proyectada en este escenario.`
})

async function checkPayrollStatus() {
  const year = Number(scenario.value?.budget_year)
  if (!year || scenario.value?.status !== 'active') {
    payrollStatus.value = null
    return
  }
  try {
    const res = await budgetCollaboratorService.fetchMaterializationStatus(year)
    payrollStatus.value = res?.data?.needs_materialization ? res.data : null
  } catch (err) {
    payrollStatus.value = null
  }
}

async function projectPayrollNow() {
  const year = Number(scenario.value?.budget_year)
  if (!year || payrollBusy.value) return
  payrollBusy.value = true
  try {
    const res = await budgetCollaboratorService.recalculate({ month: `${year}-01` })
    const created = Number(res?.data?.created_lines ?? 0)
    const warns = res?.data?.warnings ?? []
    alertService.generalSucces(
      `Nómina proyectada en el escenario: ${created} líneas.` +
        (warns.length ? ` Aviso: ${warns[0]}` : '')
    )
    await load(true)
  } catch (err) {
    const classified = classifyCollaboratorError(err)
    alertService.generalError(classified.message || 'No se pudo proyectar la nómina.')
  } finally {
    payrollBusy.value = false
  }
}

/* ============ BE-S11 what-if: nómina simulada (escenarios NO activos) ============
 * El motor SOLO materializa líneas en el escenario activo (Opción C): los
 * borradores quedarían sin coste laboral visible, así que el editor pide la
 * SIMULACIÓN (GET payroll-simulation, cero escrituras) y la fusiona a las
 * líneas como filas read-only. El análisis de funcionalidad (ingresos vs
 * nómina) ocurre ANTES de marcar meta. AC-SIM-2: con status 'active' nunca
 * se inyecta (las reales ya están); la puerta es el status, no el timing. */
const payrollSim = computed(() => budgetPlanningStore.payrollSim)

const simLines = computed(() => {
  const base = scenario.value
  if (!base || base.status === 'active') return []
  const sim = payrollSim.value.data
  if (!sim || payrollSim.value.budgetId !== base.id_budget) return []
  return (sim.lines || []).map((l) => ({
    id_budget_line: null,
    id_budget: base.id_budget,
    id_cost_center: l.id_cost_center,
    id_collection: l.id_collection ?? null,
    line_type: 'expense',
    behavior_type: 'fixed',
    budget_date: l.budget_date,
    payment_date: l.payment_date ?? null,
    projected_amount: Number(l.amount),
    has_iva: false,
    description: l.description,
    cost_component_code: l.cost_component_code,
    variable_rate: null,
    source_engine: 'collaborator_cost_sim',
    id_collaborator: l.id_collaborator,
    is_simulated: true
  }))
})

/* ============ BE-S12 what-if: gastos de financiación (interés/seguro) ============
 * El endpoint entrega únicamente gastos presupuestarios. Capital jamás forma
 * parte de estas filas/P&L; su flujo específico del presupuesto se consulta
 * aparte y se presenta solo en CashFlowPivotTable. */
const financingSim = computed(() => budgetPlanningStore.financingSim)
const financingPrincipalFlow = computed(() => budgetPlanningStore.financingPrincipalFlow)

const financingPrincipalLines = computed(() => {
  const base = scenario.value
  const flow = financingPrincipalFlow.value
  if (!base || flow.budgetId !== base.id_budget || !flow.data) return []
  return Array.isArray(flow.data.lines) ? flow.data.lines : []
})

const financingDisbursementLines = computed(() => {
  const base = scenario.value
  const flow = financingPrincipalFlow.value
  if (!base || flow.budgetId !== base.id_budget || !flow.data) return []
  return Array.isArray(flow.data.disbursement_lines) ? flow.data.disbursement_lines : []
})

const financingSimLines = computed(() => {
  const base = scenario.value
  if (!base || base.status === 'active') return []
  const sim = financingSim.value.data
  if (!sim || financingSim.value.budgetId !== base.id_budget) return []
  return (sim.lines || []).map((line) => ({
    id_budget_line: null,
    id_budget: base.id_budget,
    id_cost_center: line.id_cost_center,
    id_collection: null,
    line_type: 'expense',
    behavior_type: 'fixed',
    budget_date: line.budget_date,
    payment_date: line.payment_date ?? null,
    projected_amount: Number(line.amount),
    has_iva: false,
    description: line.description || line.component_name || 'Gasto de financiación',
    cost_component_code: line.cost_component_code,
    variable_rate: null,
    source_engine: 'financing_credit_sim',
    id_financing_credit: line.id_financing_credit,
    id_financing_credit_installment: line.id_financing_credit_installment,
    is_simulated: true
  }))
})

/** Lo que consumen Ejecutiva/Flujo/Cuadrícula: líneas reales + simuladas. */
const scenarioView = computed(() => {
  const base = scenario.value
  if (!base) return base
  const extra = [...simLines.value, ...financingSimLines.value]
  if (!extra.length) return base
  return { ...base, budget_lines: [...(base.budget_lines || []), ...extra] }
})

const payrollSimCount = computed(() => simLines.value.length)
const payrollSimTotal = computed(() => Number(payrollSim.value.data?.total_annual ?? 0))

async function loadPayrollSimulation(force = false) {
  if (!scenario.value || scenario.value.status === 'active') return
  await budgetPlanningStore.fetchPayrollSimulation(idBudget.value, { force })
}

const financingSimCount = computed(() => financingSimLines.value.length)
const financingSimInterest = computed(() =>
  Number(financingSim.value.data?.total_interest ?? 0)
)
const financingSimInsurance = computed(() =>
  Number(financingSim.value.data?.total_insurance ?? 0)
)
const financingSimTotal = computed(() =>
  Number(financingSim.value.data?.total_annual_expenses ?? 0)
)

async function loadFinancingSimulation(force = false) {
  if (!scenario.value || scenario.value.status === 'active') return
  await budgetPlanningStore.fetchFinancingSimulation(idBudget.value, { force })
}

/** Principal de schedule activo; independiente de las líneas presupuestarias. */
async function loadFinancingPrincipalFlow(force = false) {
  if (!scenario.value) return
  await budgetPlanningStore.fetchFinancingPrincipalFlow(idBudget.value, { force })
}

function goDashboard() {
  router.push({ name: 'BudgetPlanning' })
}

async function load(force = false) {
  detailError.value = false
  const result = await budgetPlanningStore.fetchScenarioDetail(idBudget.value, force)
  if (result.ok) {
    // Refresco SUAVE del listado para resolver el escenario a desactivar en
    // "Marcar Meta Activa" (silencioso: su fallo no rompe el editor).
    budgetPlanningStore.fetchScenarios({ year: scenario.value?.budget_year ?? 'all', force: true })
    // FE-S14-IVA §4.2: el settlement se pide AL ABRIR el escenario (único
    // request server-side del IVA; silente por diseño del store: su fallo
    // degrada panel/Flujo con "sin dato de liquidación" + reintento, nunca
    // toast ni pantalla rota — NFR-FE14-3).
    void budgetPlanningStore.fetchIvaSettlement(idBudget.value)
    void checkPayrollStatus()
    void loadPayrollSimulation()
    void loadFinancingSimulation()
    // Aplica por igual a presupuestos active, draft y closed. Este endpoint
    // solo alimenta la Vista Flujo, nunca `scenarioView` ni la P&L.
    void loadFinancingPrincipalFlow()
    return
  }
  if (result.kind === 'auth') return
  if (result.kind === 'notfound') {
    alertService.generalError('El escenario no existe o fue eliminado.')
    goDashboard()
    return
  }
  detailError.value = true
}

/**
 * FE-S14-IVA: reintento perezoso al activar el tab Liquidación (mismo
 * lenguaje del lazy-fetch del arrastre): si la caché nunca cargó o quedó en
 * error, reactivar el tab vuelve a intentar; el store dedupe el vuelo y el
 * fetch cacheado es no-op. El GET del "Recalcular" del panel pasa `force`.
 */
watch(activeTab, (tab) => {
  const state = budgetPlanningStore.settlement
  if (tab === 'settlement' && !state.loading && (!state.loaded || state.error)) {
    void budgetPlanningStore.fetchIvaSettlement(idBudget.value)
  }
})

onMounted(() => {
  if (!userStore.token) return
  // :idBudget debe ser entero positivo; NaN/0 → toast + replace (§3.1).
  if (!Number.isInteger(idBudget.value) || idBudget.value <= 0) {
    alertService.generalError('Escenario no válido.')
    router.replace({ name: 'BudgetPlanning' })
    return
  }
  load()
})

/** Activación de tab (las tres vistas derivan de la misma caché: sin HTTP). */
function activateTab(kind) {
  if (TAB_ORDER.includes(kind)) activeTab.value = kind
}

function onTabKeydown(event, index) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  const delta = event.key === 'ArrowRight' ? 1 : -1
  const next = TAB_ORDER[(index + delta + TAB_ORDER.length) % TAB_ORDER.length]
  activateTab(next)
  document.getElementById(`planning-tab-${next}`)?.focus()
}

function onTargetDone() {
  targetOpen.value = false
  // El store mutó el estado al instante; recargar también trae las líneas de
  // nómina/financiación que el backend acaba de materializar al activar.
  void load(true)
}

function backToPlanning() {
  goDashboard()
}
</script>

<template>
  <div class="ge-page">
    <div class="section-header">
      <div class="section-accent"></div>
      <h2 class="section-title">Detalle del Escenario</h2>
    </div>

    <!-- Cargando primer fetch -->
    <div
      v-if="budgetPlanningStore.detailLoading && !scenario"
      class="ge-loading"
      aria-live="polite"
    >
      <span class="ge-spinner" aria-hidden="true"></span>
      Cargando escenario…
    </div>

    <!-- Error de carga (404 ya redirigió; esto es red/5xx) -->
    <div v-else-if="detailError" class="ge-error" role="alert">
      <span>No se pudo cargar el escenario. Verifique su conexión e inténtelo de nuevo.</span>
      <div class="ge-error-actions">
        <button type="button" class="btn btn-secondary btn-sm" @click="load(true)">
          Reintentar
        </button>
        <button type="button" class="btn btn-outline btn-sm" @click="backToPlanning">
          Volver a Planeación
        </button>
      </div>
    </div>

    <template v-else-if="scenario">
      <!-- ============================ Cabecera §8.1 ============================ -->
      <header class="ge-header">
        <div class="ge-header-main">
          <button
            type="button"
            class="ge-back"
            aria-label="Volver al dashboard de planeación"
            @click="goDashboard"
          >
            ← Volver a Planeación
          </button>
          <h3 class="ge-name" :title="scenario.budget_name">{{ scenario.budget_name }}</h3>
          <p class="ge-meta">
            <span class="chip" :class="`chip-${statusChip.tone}`">{{ statusChip.label }}</span>
            <span class="ge-year">{{ scenario.budget_year }}</span>
            <span v-if="scenario.is_scenario && scenario.parent_budget_name" class="ge-parent">
              ↳ Clonado de {{ scenario.parent_budget_name }}
            </span>
            <!-- FE-S14-IVA R-FE14-2 + D-FE14-7: el chip aclara que el modo IVA
                 SOLO altera la Vista Flujo (cabecera y Ejecutiva son netos). -->
            <span
              v-if="ivaMode"
              class="chip chip-iva"
              title="El IVA solo afecta a la Vista Flujo (caja bruta × 1.19). La cabecera y la Vista Ejecutiva (P&G) siempre muestran netos."
            >
              Modo caja con IVA (proyectado)
            </span>
          </p>
          <p class="ge-totals" aria-live="polite">
            Σ Ingresos <strong>{{ formatMoney(headerTotals.income) }}</strong> · Σ Gastos
            <strong>{{ formatMoney(headerTotals.expense) }}</strong>
            <span class="ge-lines">· {{ (scenarioView?.budget_lines || []).length }} líneas</span>
          </p>
        </div>
        <div class="ge-header-actions">
          <!-- FE-S14-IVA §5: switch segmentado "Neto / Con IVA" (barra de
               cabecera, visible en todo tab; preferencia POR ESCENARIO en
               localStorage vía el store — D-FE14-1). -->
          <div
            class="ge-mode-group"
            role="group"
            aria-label="Modo de montos: netos o con IVA"
            title="Neto: cifras de presupuesto sin IVA. Con IVA: la Vista Flujo muestra caja bruta proyectada (× 1.19); la cabecera y la Vista Ejecutiva (P&G) siempre muestran netos."
          >
            <span class="ge-mode-caption">Montos</span>
            <div class="ge-mode-switch">
              <button
                type="button"
                class="ge-mode-btn"
                :class="{ 'is-active': !ivaMode }"
                :aria-pressed="!ivaMode ? 'true' : 'false'"
                @click="onIvaModeSelect(false)"
              >
                Neto
              </button>
              <button
                type="button"
                class="ge-mode-btn"
                :class="{ 'is-active': ivaMode }"
                :aria-pressed="ivaMode ? 'true' : 'false'"
                @click="onIvaModeSelect(true)"
              >
                Con IVA
              </button>
            </div>
          </div>
          <!-- FE-S6 §5: pill del arrastre (FD6-2: visible en todo tab; efecto
               solo en Flujo) + aviso de fuente SOLO en tab Flujo (FD6-3). -->
          <div class="ge-carry-group">
            <label
              class="ge-carry-pill"
              :class="{ 'is-on': carryover.enabled }"
              title="Solo afecta a esta Vista Flujo; no genera líneas."
            >
              <input
                type="checkbox"
                class="ge-carry-input"
                :checked="carryover.enabled"
                :disabled="carryover.saving"
                :aria-label="`Arrastrar saldos del año ${carrySourceYear} al flujo de caja`"
                @change="onCarryoverToggle"
              />
              <span>Arrastrar saldos de {{ carrySourceYear }}</span>
            </label>
            <p
              v-if="activeTab === 'flow' && carryover.enabled"
              class="ge-carry-hint"
              aria-live="polite"
            >
              {{ carryHintText }}
            </p>
          </div>
          <button
            v-if="scenario.status !== 'active' && canTarget"
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="budgetPlanningStore.settingTarget"
            @click="targetOpen = true"
          >
            Marcar Meta Activa
          </button>
        </div>
      </header>

      <div v-if="payrollStatus" class="ge-payroll-notice" role="status">
        <span>{{ payrollNoticeText }}</span>
        <button
          type="button"
          class="ge-payroll-action"
          :disabled="payrollBusy"
          @click="projectPayrollNow"
        >
          {{ payrollBusy ? 'Proyectando...' : 'Proyectar nómina ahora' }}
        </button>
      </div>

      <div
        v-if="
          scenario.status !== 'active' &&
          (payrollSim.loading || payrollSim.loaded || payrollSim.error)
        "
        class="ge-payroll-notice ge-payroll-notice-sim"
        role="status"
      >
        <span v-if="payrollSim.loading">Proyectando nómina simulada…</span>
        <span v-else-if="payrollSim.error">
          No se pudo simular la nómina en este escenario (¿faltan parámetros de la
          vigencia?).
        </span>
        <span v-else-if="payrollSimCount">
          Nómina simulada: {{ payrollSimCount }} líneas · Σ anual
          {{ formatMoney(payrollSimTotal) }} — cifras what-if (no materializadas);
          marca Meta Activa para proyectarlas de verdad.
        </span>
        <span v-else>Nómina simulada: sin colaboradores con salario vigente proyectable.</span>
        <button
          v-if="payrollSim.error"
          type="button"
          class="ge-payroll-action"
          :disabled="payrollSim.loading"
          @click="loadPayrollSimulation(true)"
        >
          Reintentar
        </button>
      </div>

      <div
        v-if="
          scenario.status !== 'active' &&
          (financingSim.loading || financingSim.loaded || financingSim.error)
        "
        class="ge-payroll-notice ge-payroll-notice-sim"
        role="status"
      >
        <span v-if="financingSim.loading">Simulando gastos de financiación…</span>
        <span v-else-if="financingSim.error">
          No se pudo cargar la simulación de financiación para este escenario.
        </span>
        <span v-else-if="financingSimCount">
          Financiación simulada: {{ financingSimCount }} líneas de gasto
          ({{ financingSim.data?.financing_credits_count ?? 0 }} créditos) · Intereses
          {{ formatMoney(financingSimInterest) }} · Seguros
          {{ formatMoney(financingSimInsurance) }} · Σ gastos anuales
          {{ formatMoney(financingSimTotal) }} — cifras what-if/no materializadas; al marcar Meta
          Activa se materializan.
        </span>
        <span v-else>
          Financiación simulada: sin líneas de interés o seguro proyectables. Estas cifras what-if
          no se materializan hasta marcar Meta Activa.
        </span>
        <button
          v-if="financingSim.error"
          type="button"
          class="ge-payroll-action"
          :disabled="financingSim.loading"
          @click="loadFinancingSimulation(true)"
        >
          Reintentar
        </button>
      </div>

      <!-- =============================== Tabs =============================== -->
      <div class="ge-tabs" role="tablist" aria-label="Vistas del escenario">
        <button
          v-for="(tab, index) in TAB_ORDER"
          :id="`planning-tab-${tab}`"
          :key="tab"
          class="tab-pill"
          :class="{ 'is-active': activeTab === tab }"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab"
          :aria-controls="`planning-panel-${tab}`"
          :tabindex="activeTab === tab ? 0 : -1"
          @click="activateTab(tab)"
          @keydown="onTabKeydown($event, index)"
        >
          {{ TAB_LABELS[tab] }}
        </button>
      </div>

      <div
        id="planning-panel-executive"
        v-show="activeTab === 'executive'"
        class="ge-panel"
        role="tabpanel"
        aria-labelledby="planning-tab-executive"
      >
        <ExecutivePivotTable :scenario="scenarioView" />
      </div>
      <!-- FE-S4B §3.2: v-show (no v-if) → sigue reactiva a los PUT sin recompilar. -->
      <div
        id="planning-panel-flow"
        v-show="activeTab === 'flow'"
        class="ge-panel"
        role="tabpanel"
        aria-labelledby="planning-tab-flow"
      >
        <CashFlowPivotTable
          :scenario="scenarioView"
          :financing-principal-lines="financingPrincipalLines"
          :financing-disbursement-lines="financingDisbursementLines"
        />
        <div
          v-if="financingPrincipalFlow.loading || financingPrincipalFlow.error"
          class="ge-payroll-notice ge-payroll-notice-sim"
          role="status"
        >
          <span v-if="financingPrincipalFlow.loading">Cargando pagos de capital…</span>
          <span v-else>No se pudo cargar el flujo de capital de financiación.</span>
          <button
            v-if="financingPrincipalFlow.error"
            type="button"
            class="ge-payroll-action"
            :disabled="financingPrincipalFlow.loading"
            @click="loadFinancingPrincipalFlow(true)"
          >
            Reintentar
          </button>
        </div>
      </div>
      <div
        id="planning-panel-editor"
        v-show="activeTab === 'editor'"
        class="ge-panel"
        role="tabpanel"
        aria-labelledby="planning-tab-editor"
      >
        <!-- FE-S14-IVA: la bandera de modo viaja como prop (§5): columnas
             IVA/Total + checkbox `Con IVA` solo con el modo ON. -->
        <BudgetLineGrid :scenario="scenarioView" :iva-mode="ivaMode" />
      </div>
      <!-- FE-S14-IVA §5: pestaña nueva "Liquidación" — monta el panel de
           liquidación IVA (fuente: settlement cacheado en el store; el
           reintento perezoso al activar el tab vive en el `watch` de arriba). -->
      <div
        id="planning-panel-settlement"
        v-show="activeTab === 'settlement'"
        class="ge-panel"
        role="tabpanel"
        aria-labelledby="planning-tab-settlement"
      >
        <IvaSettlementPanel :id-budget="idBudget" />
      </div>
    </template>

    <SetTargetConfirmModal
      :open="targetOpen"
      :scenario="scenario"
      :demoted-name="demotedName"
      @done="onTargetDone"
      @close="targetOpen = false"
    />
  </div>
</template>

<style scoped>
.ge-page {
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
  padding: 24px;
}

.ge-loading {
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

.ge-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(120, 120, 120, 0.25);
  border-top-color: var(--color-brand, #03658c);
  border-radius: 50%;
  animation: ge-spin 0.8s linear infinite;
}

@keyframes ge-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ge-spinner {
    animation-duration: 1.6s;
  }
}

.ge-error {
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

:root[data-theme='dark'] .ge-error {
  color: #ff9b9b;
}

.ge-error-actions {
  display: flex;
  gap: 8px;
}

/* Cabecera §8.1 */

.ge-header {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;
  margin: 14px 0 18px;
  padding: 16px 18px;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 8px;
  background-color: var(--color-surface-card, #ffffff);
}

.ge-header-main {
  min-width: 0;
}

.ge-back {
  margin-bottom: 8px;
  padding: 0;
  border: none;
  background: none;
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--color-brand, #03658c);
  cursor: pointer;
}

.ge-back:hover {
  text-decoration: underline;
}

.ge-name {
  margin: 0;
  overflow: hidden;
  font-size: 1.12rem;
  font-weight: 700;
  color: var(--color-text-primary, #070707);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ge-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin: 6px 0 0;
  font-size: 0.8rem;
}

.ge-year {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--color-text-secondary, #555555);
}

.ge-parent {
  font-style: italic;
  color: var(--color-text-muted, #8a8a8a);
}

.ge-totals {
  margin: 8px 0 0;
  font-size: 0.8rem;
  color: var(--color-text-secondary, #555555);
}

.ge-totals strong {
  font-variant-numeric: tabular-nums;
  color: var(--color-brand, #03658c);
}

:root[data-theme='dark'] .ge-totals strong {
  color: #56c8ee;
}

.ge-lines {
  color: var(--color-text-muted, #8a8a8a);
}

/* Cabecera §5 (FE-S6): acciones + pill del arrastre. */

.ge-header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: flex-start;
  justify-content: flex-end;
}

.ge-carry-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
  align-items: flex-end;
}

.ge-carry-pill {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  padding: 6px 13px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 999px;
  background-color: var(--color-surface, #f2f4f7);
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--color-text-secondary, #555555);
  cursor: pointer;
  user-select: none;
  transition:
    background-color 0.18s cubic-bezier(0.23, 1, 0.32, 1),
    border-color 0.18s cubic-bezier(0.23, 1, 0.32, 1),
    color 0.18s cubic-bezier(0.23, 1, 0.32, 1);
}

:root[data-theme='dark'] .ge-carry-pill {
  background-color: rgba(255, 255, 255, 0.05);
}

.ge-carry-pill.is-on {
  border-color: rgba(3, 101, 140, 0.45);
  background-color: rgba(3, 101, 140, 0.1);
  color: var(--color-brand, #03658c);
}

:root[data-theme='dark'] .ge-carry-pill.is-on {
  color: #56c8ee;
}

.ge-carry-pill:has(.ge-carry-input:focus-visible) {
  outline: 2px solid var(--color-brand, #03658c);
  outline-offset: 1px;
}

.ge-carry-pill:has(.ge-carry-input:disabled) {
  opacity: 0.6;
  cursor: progress;
}

.ge-carry-input {
  margin: 0;
  accent-color: var(--color-brand, #03658c);
  cursor: inherit;
}

.ge-carry-hint {
  max-width: 320px;
  margin: 0;
  font-size: 0.72rem;
  color: var(--color-text-muted, #8a8a8a);
  text-align: right;
}

/* ───────── FE-S14-IVA §5: switch segmentado "Neto / Con IVA" + chip de modo ───────── */

.ge-mode-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
  align-items: flex-end;
}

.ge-mode-caption {
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--color-text-muted, #8a8a8a);
}

.ge-mode-switch {
  display: inline-flex;
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 999px;
  background-color: var(--color-surface, #f2f4f7);
}

:root[data-theme='dark'] .ge-mode-switch {
  background-color: rgba(255, 255, 255, 0.05);
}

.ge-mode-btn {
  padding: 5px 13px;
  border: none;
  border-radius: 999px;
  background: transparent;
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--color-text-secondary, #555555);
  cursor: pointer;
  transition:
    background-color 0.18s cubic-bezier(0.23, 1, 0.32, 1),
    color 0.18s cubic-bezier(0.23, 1, 0.32, 1);
}

.ge-mode-btn:hover:not(.is-active) {
  background-color: rgba(3, 101, 140, 0.08);
  color: var(--color-text-primary, #070707);
}

.ge-mode-btn:focus-visible {
  outline: 2px solid var(--color-brand, #03658c);
  outline-offset: 1px;
}

.ge-mode-btn.is-active {
  background-color: var(--color-brand, #03658c);
  color: var(--text-white, #eeeeee);
  box-shadow: 0 1px 4px rgba(3, 101, 140, 0.35);
}

/* Chip ámbar del modo (misma familia "proyección" de `chip-closed`). */
.chip-iva {
  border-color: rgba(180, 83, 9, 0.4);
  background-color: rgba(245, 158, 11, 0.1);
  color: #96590a;
}

:root[data-theme='dark'] .chip-iva {
  color: #f6c177;
}

.chip {
  display: inline-block;
  padding: 3px 10px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
}

.chip-active {
  border-color: rgba(46, 164, 79, 0.45);
  background-color: rgba(46, 164, 79, 0.12);
  color: #22683a;
}

:root[data-theme='dark'] .chip-active {
  color: #7bd89a;
}

.chip-draft {
  border-color: rgba(120, 120, 120, 0.35);
  background-color: rgba(120, 120, 120, 0.12);
  color: var(--color-text-secondary, #555555);
}

:root[data-theme='dark'] .chip-draft {
  color: #b8c4d0;
}

.chip-closed {
  border-color: rgba(180, 83, 9, 0.4);
  background-color: rgba(245, 158, 11, 0.1);
  color: #96590a;
}

:root[data-theme='dark'] .chip-closed {
  color: #f6c177;
}

/* Tabs "pill" (mismo patrón visual de Reglas Financieras) */

.ge-tabs {
  display: inline-flex;
  gap: 4px;
  margin-bottom: 16px;
  padding: 4px;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 999px;
  background-color: var(--color-surface, #f2f4f7);
}

:root[data-theme='dark'] .ge-tabs {
  background-color: rgba(255, 255, 255, 0.05);
}

.tab-pill {
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

.tab-pill:hover:not(.is-active) {
  background-color: rgba(3, 101, 140, 0.08);
  color: var(--color-text-primary, #070707);
}

.tab-pill:focus-visible {
  outline: 2px solid var(--color-brand, #03658c);
  outline-offset: 1px;
}

.tab-pill.is-active {
  background-color: var(--color-brand, #03658c);
  font-weight: 600;
  color: var(--text-white, #eeeeee);
  box-shadow: 0 1px 4px rgba(3, 101, 140, 0.35);
}

.ge-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

@media (max-width: 768px) {
  .ge-page {
    padding: 20px 16px;
  }
}
.ge-payroll-notice {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  margin: 10px 0 0;
  padding: 10px 14px;
  border: 1px solid #fde68a;
  border-left: 4px solid #d97706;
  border-radius: 8px;
  background: #fffbeb;
  color: #92400e;
  font-size: 13px;
}

/* BE-S11 what-if: variante ámbar (simulada, no materializada) */

.ge-payroll-notice-sim {
  border-style: dashed;
}

.ge-payroll-notice-sim .ge-payroll-action {
  border-color: rgba(217, 119, 6, 0.45);
  background-color: rgba(217, 119, 6, 0.12);
  color: #b45309;
}

:root[data-theme='dark'] .ge-payroll-notice-sim .ge-payroll-action {
  color: #fbbf24;
}
.ge-payroll-action {
  border: 1px solid #d97706;
  border-radius: 6px;
  background: #fff;
  color: #b45309;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.ge-payroll-action:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
