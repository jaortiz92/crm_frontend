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
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ExecutivePivotTable from '@/components/budget/planning/ExecutivePivotTable.vue'
import CashFlowPivotTable from '@/components/budget/planning/CashFlowPivotTable.vue'
import BudgetLineGrid from '@/components/budget/planning/BudgetLineGrid.vue'
import SetTargetConfirmModal from '@/components/budget/planning/SetTargetConfirmModal.vue'
import { useBudgetPlanningStore } from '@/stores/budgetPlanningStore.js'
import { useUserStore } from '@/stores/userStore.js'
import { canSetBudgetTarget } from '@/router/index.js'
import { alertService } from '@/services/alertService.js'
import { formatMoney, statusChipOf } from '@/components/budget/planning/planningFormat.js'

const TAB_ORDER = ['executive', 'flow', 'editor']

/** Etiquetas de los pills (FE-S4B §3.1: el ternario inline ya no basta para 3 tabs). */
const TAB_LABELS = {
  executive: 'Vista Ejecutiva',
  flow: 'Vista Flujo',
  editor: 'Editor de Celdas'
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

/** Σ informativos de la cabecera, de la MISMA caché de líneas (AC-FE-6). */
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
  // El store ya mutó la caché del detalle (chip al instante, AC-FE-5).
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
          </p>
          <p class="ge-totals" aria-live="polite">
            Σ Ingresos <strong>{{ formatMoney(headerTotals.income) }}</strong> · Σ Gastos
            <strong>{{ formatMoney(headerTotals.expense) }}</strong>
            <span class="ge-lines">· {{ (scenario.budget_lines || []).length }} líneas</span>
          </p>
        </div>
        <div class="ge-header-actions">
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
        <ExecutivePivotTable :scenario="scenario" />
      </div>
      <!-- FE-S4B §3.2: v-show (no v-if) → sigue reactiva a los PUT sin recompilar. -->
      <div
        id="planning-panel-flow"
        v-show="activeTab === 'flow'"
        class="ge-panel"
        role="tabpanel"
        aria-labelledby="planning-tab-flow"
      >
        <CashFlowPivotTable :scenario="scenario" />
      </div>
      <div
        id="planning-panel-editor"
        v-show="activeTab === 'editor'"
        class="ge-panel"
        role="tabpanel"
        aria-labelledby="planning-tab-editor"
      >
        <BudgetLineGrid :scenario="scenario" />
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
</style>
