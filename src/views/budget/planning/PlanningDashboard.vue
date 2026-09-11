<script setup>
/**
 * PlanningDashboard — listado de escenarios de Planeación (`/budget/planning`),
 * ruta `BudgetPlanning` (FE-S4 §3.1/§6).
 *
 * Vista de orquestación: filtro por año + refresco + "Nuevo Escenario (Carga
 * Anual)" + tabla (`ScenarioTable`) + los tres modales auxiliares. El estado
 * vive en `budgetPlanningStore` (orden del backend, sin re-ordenar — §6.1);
 * el gate de "Marcar como Meta Activa" usa `canSetBudgetTarget()` (§3.3,
 * exportado desde `router/index.js` junto a `BUDGET_TARGET_ROLES`).
 * Tras crear/clonar/meta-activa: refresco del listado; el 🎯 es dato, no
 * cálculo (NFR-F3).
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import ScenarioTable from '@/components/budget/planning/ScenarioTable.vue'
import BudgetIngestionModal from '@/components/budget/planning/BudgetIngestionModal.vue'
import CloneScenarioModal from '@/components/budget/planning/CloneScenarioModal.vue'
import SetTargetConfirmModal from '@/components/budget/planning/SetTargetConfirmModal.vue'
import { useBudgetPlanningStore } from '@/stores/budgetPlanningStore.js'
import { useUserStore } from '@/stores/userStore.js'
import { canSetBudgetTarget } from '@/router/index.js'
import { buildYearOptions } from '@/components/budget/planning/planningFormat.js'

const router = useRouter()
const budgetPlanningStore = useBudgetPlanningStore()
const userStore = useUserStore()

/** Filtro por año: 'all' = todos (§6.1); default todos, rango año−2..año+5. */
const yearFilter = ref('all')
const yearOptions = buildYearOptions()

const canTarget = computed(() => canSetBudgetTarget())

/** Filas cacheadas: `null` = primera carga (spinner), `[]` = vacío real. */
const scenarioRows = computed(() =>
  Array.isArray(budgetPlanningStore.scenarios) ? budgetPlanningStore.scenarios : []
)

const showLoading = computed(
  () => budgetPlanningStore.scenariosLoading && !Array.isArray(budgetPlanningStore.scenarios)
)

const isEmpty = computed(
  () =>
    Array.isArray(budgetPlanningStore.scenarios) &&
    !budgetPlanningStore.scenariosLoading &&
    scenarioRows.value.length === 0
)

/* --------------------------------- modales --------------------------------- */

const ingestionOpen = ref(false)
const cloneOpen = ref(false)
const targetOpen = ref(false)
/** @type {null | object} fila sobre la que se clona o designa meta. */
const actionRow = ref(null)

/** Escenario que sería desactivado (caché del listado; dato, no cálculo). */
const demotedName = computed(() => {
  const row = actionRow.value
  if (!row) return null
  const active = budgetPlanningStore.findActiveForYear(row.budget_year, row.id_budget)
  return active ? active.budget_name : null
})

function loadScenarios(force = false) {
  budgetPlanningStore.fetchScenarios({ year: yearFilter.value, force })
}

onMounted(() => {
  // Guard de sesión como en las vistas hermanas: sin token nada que cargar.
  if (!userStore.token) return
  loadScenarios()
})

function onYearChange() {
  loadScenarios(true)
}

/* ------------------------------ acciones fila ------------------------------ */

function onView(row) {
  router.push({ name: 'BudgetPlanningGrid', params: { idBudget: row.id_budget } })
}

function onClone(row) {
  actionRow.value = row
  cloneOpen.value = true
}

function onSetTarget(row) {
  actionRow.value = row
  targetOpen.value = true
}

function onCreated() {
  loadScenarios(true)
}

function onTargetDone() {
  // El store ya actualizó las cachés (BR-TGT-01): el chip 🎯 y el estado
  // Cerrado se reflejan sin refresco manual (AC-FE-5); el refresco suave
  // reconcilia contra el servidor y deja el 🎯 en exactamente un escenario.
  loadScenarios(true)
}
</script>

<template>
  <div class="pd-page">
    <div class="section-header">
      <div class="section-accent"></div>
      <h2 class="section-title">Planeación y Escenarios</h2>
    </div>

    <p class="page-description">
      Convierta las Solicitudes de Presupuesto SIIGO en escenarios anuales, compárelos y ajuste sus
      metas celda a celda sin volver a subir el Excel. El escenario marcado como Meta Activa es el
      que alimenta el motor financiero del año.
    </p>

    <div class="pd-toolbar">
      <label class="pd-filter">
        <span class="pd-filter-label">Año</span>
        <select v-model="yearFilter" class="pd-filter-input" @change="onYearChange">
          <option value="all">Todos los años</option>
          <option v-for="year in yearOptions" :key="year" :value="String(year)">{{ year }}</option>
        </select>
      </label>

      <div class="pd-actions">
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="budgetPlanningStore.scenariosLoading"
          @click="loadScenarios(true)"
        >
          Actualizar
        </button>
        <button
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="budgetPlanningStore.isSubmitting"
          @click="ingestionOpen = true"
        >
          Nuevo Escenario (Carga Anual)
        </button>
      </div>
    </div>

    <!-- Error de red: banner + Reintentar (§6.3) -->
    <div
      v-if="budgetPlanningStore.scenariosError"
      class="pd-load-error"
      role="alert"
      aria-live="polite"
    >
      <span>
        No se pudo cargar la lista de escenarios. Verifique su conexión e inténtelo de nuevo.
      </span>
      <button type="button" class="btn btn-secondary btn-sm" @click="loadScenarios(true)">
        Reintentar
      </button>
    </div>

    <div v-else-if="showLoading" class="pd-loading" aria-live="polite">
      <span class="pd-spinner" aria-hidden="true"></span>
      Cargando escenarios…
    </div>

    <!-- Vacío: mensaje + CTA a crear (§6.3) -->
    <div v-else-if="isEmpty" class="pd-empty">
      <p class="pd-empty-text">
        Aún no hay escenarios para {{ yearFilter === 'all' ? 'ningún año' : yearFilter }}. Cree el
        Presupuesto Base subiendo las dos Solicitudes de Presupuesto SIIGO.
      </p>
      <button type="button" class="btn btn-primary" @click="ingestionOpen = true">
        Nuevo Escenario (Carga Anual)
      </button>
    </div>

    <ScenarioTable
      v-else
      :rows="scenarioRows"
      :can-target="canTarget"
      :busy="budgetPlanningStore.isSubmitting"
      @view="onView"
      @set-target="onSetTarget"
      @clone="onClone"
    />

    <p v-if="budgetPlanningStore.scenariosLoading" class="pd-refresh-note" aria-live="polite">
      <span class="pd-spinner" aria-hidden="true"></span>
      Actualizando…
    </p>

    <BudgetIngestionModal
      :open="ingestionOpen"
      @created="onCreated"
      @close="ingestionOpen = false"
    />

    <CloneScenarioModal
      :open="cloneOpen"
      :scenario="actionRow"
      @created="onCreated"
      @close="cloneOpen = false"
    />

    <SetTargetConfirmModal
      :open="targetOpen"
      :scenario="actionRow"
      :demoted-name="demotedName"
      @done="onTargetDone"
      @close="targetOpen = false"
    />
  </div>
</template>

<style scoped>
.pd-page {
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
  padding: 24px;
}

.page-description {
  max-width: 820px;
  margin: 10px 0 22px;
  font-size: 0.86rem;
  line-height: 1.55;
  color: var(--color-text-secondary, #555555);
  text-wrap: pretty;
}

.pd-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 14px;
}

.pd-filter {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pd-filter-label {
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--color-text-secondary, #555555);
}

.pd-filter-input {
  width: 180px;
  margin: 0;
  padding: 7px 10px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 6px;
  background-color: var(--color-surface, #f7f7f7);
  font-size: 0.82rem;
  color: var(--color-text-primary, #070707);
  box-sizing: border-box;
}

.pd-filter-input:focus {
  border-color: var(--color-brand, #03658c);
  outline: 2px solid rgba(3, 101, 140, 0.25);
}

.pd-actions {
  display: flex;
  gap: 8px;
}

.pd-load-error {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  border: 1px solid rgba(197, 48, 48, 0.35);
  border-left: 4px solid #c53030;
  border-radius: 8px;
  background-color: rgba(197, 48, 48, 0.07);
  font-size: 0.84rem;
  line-height: 1.5;
  color: #9b2222;
}

:root[data-theme='dark'] .pd-load-error {
  color: #ff9b9b;
}

.pd-loading,
.pd-empty {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  justify-content: center;
  padding: 36px 16px;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 8px;
  background-color: var(--color-surface-card, #ffffff);
  font-size: 0.85rem;
  color: var(--color-text-muted, #8a8a8a);
}

.pd-empty-text {
  margin: 0;
  text-align: center;
}

.pd-refresh-note {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 10px 0 0;
  font-size: 0.75rem;
  color: var(--color-text-muted, #8a8a8a);
}

.pd-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(120, 120, 120, 0.25);
  border-top-color: var(--color-brand, #03658c);
  border-radius: 50%;
  animation: pd-spin 0.8s linear infinite;
}

@keyframes pd-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .pd-spinner {
    animation-duration: 1.6s;
  }
}

@media (max-width: 768px) {
  .pd-page {
    padding: 20px 16px;
  }
}
</style>
