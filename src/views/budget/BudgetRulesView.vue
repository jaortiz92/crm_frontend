<script setup>
/**
 * BudgetRulesView — Gestión de Reglas Financieras (`/budget/rules`), spec
 * FE-S3-RULES §8 + FE-S5-PAYABLE-TERMS §3.1. Vista: cabecera + tabs custom
 * "pill" (A2, sin Vuetify) + un panel por pilar (Costos por Línea / Comisiones
 * de Venta) con barra de filtros, tabla reutilizable y modal crear/editar, más
 * el tercer tab 'payable' (Términos de pago, panel propio).
 *
 * El estado vive en `budgetRulesStore` (caché §6) y los FILTROS en la vista,
 * por kind y sin compartirse (§8.3). Ni el cambio de tab ni los filtros
 * disparan HTTP (NFR-2): `commission` y `payable` se cargan perezosamente una
 * sola vez en SU primera activación (A15 / FE-S5 §3.1). `activeTab` sigue
 * arrancando en 'cost': la pestaña nueva va al final (FE-S5 §3.1).
 */
import { computed, onMounted, reactive, ref } from 'vue'
import RatesDataTable from '@/components/budget/rates/RatesDataTable.vue'
import RateEditorModal from '@/components/budget/rates/RateEditorModal.vue'
import PayableTermsPanel from '@/components/budget/rates/PayableTermsPanel.vue'
import { RATE_KINDS } from '@/components/budget/rates/ratesConfig.js'
import { useBudgetRulesStore } from '@/stores/budgetRulesStore.js'
import { useUserStore } from '@/stores/userStore.js'
import { alertService } from '@/services/alertService.js'

/** Pilares de tasas: paneles FE-S3 con `ratesConfig.js` como única fuente. */
const RATE_TABS = ['cost', 'commission']

/** Orden de los tres tabs (FE-S5 §3.1): `payable` se renderiza aparte. */
const TAB_ORDER = ['cost', 'commission', 'payable']

/** Etiquetas del pill: las dos tasas salen de `RATE_KINDS` (sin tocarla). */
const TAB_LABELS = {
  cost: RATE_KINDS.cost.tabLabel,
  commission: RATE_KINDS.commission.tabLabel,
  payable: 'Términos de pago'
}

const budgetRulesStore = useBudgetRulesStore()
const userStore = useUserStore()

const activeTab = ref('cost')
const modalOpen = ref(false)
const editingRate = ref(null)

/**
 * Estado de filtros POR KIND, local a la vista (§8.3, A10): `activeOnly`
 * arranca ON y 'solo activas' NO excluye vencidas (§9.2).
 */
const filters = reactive({
  cost: { lineFilter: 'all', activeOnly: true, search: '' },
  commission: { lineFilter: 'all', activeOnly: true, search: '' }
})

/** Opciones del select de línea, alfabéticas (mismo criterio que el modal). */
const sortedLines = computed(() =>
  [...budgetRulesStore.lines].sort((a, b) =>
    String(a.line_name).localeCompare(String(b.line_name), 'es')
  )
)

onMounted(async () => {
  // Guard de sesión como en las vistas hermanas: sin token nada que cargar.
  if (!userStore.token) return
  // NFR-1: catálogo de líneas + ÚNICAMENTE el tab activo; comisiones lazy.
  await Promise.all([budgetRulesStore.fetchLinesOnce(), budgetRulesStore.fetchRates('cost')])
})

/**
 * Activa un tab. La primera activación de 'commission' dispara el único
 * `GET /budget/commission-rates/` (re-pulsear la tab es no-op, AC-04/A15) y
 * la de 'payable' hace lo propio con el catálogo `GET /budget/line-payable-term/`
 * (lazy FE-S5 §3.1, jamás en `onMounted`).
 * @param {'cost'|'commission'|'payable'} kind
 */
function activateTab(kind) {
  if (!TAB_ORDER.includes(kind) || activeTab.value === kind) return
  activeTab.value = kind
  if (kind === 'payable') {
    if (!budgetRulesStore.payableTermsLoaded) {
      budgetRulesStore.fetchPayableTerms()
    }
    return
  }
  if (budgetRulesStore.rates[kind] === null) {
    budgetRulesStore.fetchRates(kind)
  }
}

/** Navegación accesible de tabs con flechas ←/→ (roving tabindex, §8.1). */
function onTabKeydown(event, index) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  const delta = event.key === 'ArrowRight' ? 1 : -1
  const nextKind = TAB_ORDER[(index + delta + TAB_ORDER.length) % TAB_ORDER.length]
  activateTab(nextKind)
  document.getElementById(`rates-tab-${nextKind}`)?.focus()
}

/* ------------------------------- modal editor ------------------------------ */

function openCreate() {
  editingRate.value = null
  modalOpen.value = true
}

/** @param {'cost'|'commission'} kind */
function onEdit(kind, row) {
  editingRate.value = row
  modalOpen.value = true
}

function closeModal() {
  modalOpen.value = false
  editingRate.value = null
}

/* --------------------- archivar / reactivar (§11) -------------------------- */

/**
 * Archivar = `PUT { is_active: false }` con confirmación SWAL. La historia
 * NO se borra: desde esta vista jamás se emite DELETE (regla de oro, A12).
 */
async function onArchive(kind, row) {
  const cfg = RATE_KINDS[kind]
  const question = await alertService.generalQuestion(
    'Archivar regla',
    `Archivar esta ${cfg.entityLabel}? La historia se conserva; quedará inactiva y podrá reactivarse.`
  )
  if (!question.isConfirmed) return
  const result = await budgetRulesStore.setActive(kind, row[cfg.idField], false)
  if (result.ok) {
    alertService.generalSucces('Regla archivada')
  } else if (result.kind !== 'auth') {
    alertService.generalError(
      'No se pudo archivar la regla. Inténtalo de nuevo o contacta soporte.'
    )
  }
}

/**
 * Reactivar = `PUT { is_active: true }` con confirmación SWAL; el servidor
 * puede responder E-CR-2 (overlap) → error SWAL en español (§11.3).
 */
async function onRestore(kind, row) {
  const cfg = RATE_KINDS[kind]
  const question = await alertService.generalQuestion(
    'Reactivar regla',
    `Reactivará esta ${cfg.entityLabel} para su rango de vigencia. El servidor validará que no exista otra regla activa solapada.`
  )
  if (!question.isConfirmed) return
  const result = await budgetRulesStore.setActive(kind, row[cfg.idField], true)
  if (result.ok) {
    alertService.generalSucces('Regla reactivada')
  } else if (result.kind === 'overlap') {
    alertService.generalError(
      'No se puede reactivar: ya existe una regla activa que cubre este rango para la misma línea. Archívala o ajusta primero.'
    )
  } else if (result.kind !== 'auth') {
    alertService.generalError(
      'No se pudo reactivar la regla. Inténtalo de nuevo o contacta soporte.'
    )
  }
}
</script>

<template>
  <div class="budget-rules-page">
    <div class="section-header">
      <div class="section-accent"></div>
      <h2 class="section-title">Reglas Financieras</h2>
    </div>

    <p class="page-description">
      Administre las tasas que alimentan el motor financiero: costo de ventas (COGS) y comisión
      comercial, por línea de producto o globales, y los términos de pago a proveedores por línea
      (fechas de salida del efectivo). La historia no se borra: las reglas se archivan y quedan
      auditables con su nombre, vigencia y estado.
    </p>

    <div class="rates-tabs" role="tablist" aria-label="Pilares de reglas financieras">
      <button
        v-for="(kind, index) in TAB_ORDER"
        :id="`rates-tab-${kind}`"
        :key="kind"
        class="tab-pill"
        :class="{ 'is-active': activeTab === kind }"
        type="button"
        role="tab"
        :aria-selected="activeTab === kind"
        :aria-controls="`rates-panel-${kind}`"
        :tabindex="activeTab === kind ? 0 : -1"
        @click="activateTab(kind)"
        @keydown="onTabKeydown($event, index)"
      >
        {{ TAB_LABELS[kind] }}
      </button>
    </div>

    <div
      v-for="kind in RATE_TABS"
      :id="`rates-panel-${kind}`"
      :key="kind"
      v-show="activeTab === kind"
      class="rates-panel"
      role="tabpanel"
      :aria-labelledby="`rates-tab-${kind}`"
    >
      <div class="panel-toolbar">
        <label class="filter-field">
          <span class="filter-label">Línea de producto</span>
          <select v-model="filters[kind].lineFilter" class="filter-input">
            <option value="all">Todas las líneas</option>
            <option value="global">Global (sin línea)</option>
            <option v-for="line in sortedLines" :key="line.id_line" :value="String(line.id_line)">
              {{ line.line_name }}
            </option>
          </select>
        </label>

        <label class="filter-field">
          <span class="filter-label">Buscar por nombre</span>
          <input
            v-model="filters[kind].search"
            class="filter-input"
            type="search"
            placeholder="Nombre de la tasa…"
          />
        </label>

        <label class="filter-check">
          <input v-model="filters[kind].activeOnly" type="checkbox" />
          <span>Mostrar solo activas</span>
        </label>

        <div class="toolbar-actions">
          <button type="button" class="btn btn-primary btn-sm" @click="openCreate">
            + Nueva regla
          </button>
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            :disabled="budgetRulesStore.loading[kind]"
            @click="budgetRulesStore.fetchRates(kind, true)"
          >
            Actualizar
          </button>
        </div>
      </div>

      <!-- Error de carga: banner rojo + Reintentar con refetch forzado (§8.5) -->
      <div
        v-if="budgetRulesStore.loadError[kind]"
        class="load-error"
        role="alert"
        aria-live="polite"
      >
        <span>
          No se pudieron cargar las reglas de {{ RATE_KINDS[kind].tabLabel }}. Verifique su conexión
          e inténtelo de nuevo.
        </span>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          @click="budgetRulesStore.fetchRates(kind, true)"
        >
          Reintentar
        </button>
      </div>

      <!-- Primer fetch del pilar (NFR-1: <2 s en LAN) -->
      <div
        v-else-if="budgetRulesStore.rates[kind] === null"
        class="rates-loading"
        aria-live="polite"
      >
        <span class="mini-spinner" aria-hidden="true"></span>
        Cargando reglas…
      </div>

      <template v-else>
        <RatesDataTable
          :kind="kind"
          :line-filter="filters[kind].lineFilter"
          :active-only="filters[kind].activeOnly"
          :search="filters[kind].search"
          @edit="(row) => onEdit(kind, row)"
          @archive="(row) => onArchive(kind, row)"
          @restore="(row) => onRestore(kind, row)"
        />
        <p v-if="budgetRulesStore.loading[kind]" class="refresh-note" aria-live="polite">
          <span class="mini-spinner" aria-hidden="true"></span>
          Actualizando…
        </p>
      </template>
    </div>

    <!-- FE-S5 §3.1/§3.2: el panel de términos SOLO se monta con su tab activo
         (lazy: el catálogo ya lo trajo `activateTab` en la primera activación) -->
    <div
      v-if="activeTab === 'payable'"
      id="rates-panel-payable"
      class="rates-panel"
      role="tabpanel"
      aria-labelledby="rates-tab-payable"
    >
      <PayableTermsPanel />
    </div>

    <RateEditorModal
      :open="modalOpen"
      :kind="activeTab === 'payable' ? 'cost' : activeTab"
      :rate="editingRate"
      @saved="closeModal"
      @close="closeModal"
    />
  </div>
</template>

<style scoped>
.budget-rules-page {
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
  padding: 24px;
}

.page-description {
  max-width: 760px;
  margin: 10px 0 22px;
  font-size: 0.86rem;
  line-height: 1.55;
  color: var(--color-text-secondary, #555555);
  text-wrap: pretty;
}

/* Tabs "pill" propios (A2, sin framework CSS) */

.rates-tabs {
  display: inline-flex;
  gap: 4px;
  margin-bottom: 18px;
  padding: 4px;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 999px;
  background-color: var(--color-surface, #f2f4f7);
}

:root[data-theme='dark'] .rates-tabs {
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

.rates-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* Barra de filtros + acciones (§8.3/§8.1) */

.panel-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: flex-end;
  padding: 14px 16px;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 8px;
  background-color: var(--color-surface-card, #ffffff);
}

.filter-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: auto;
  min-width: 0;
}

.filter-label {
  width: auto;
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--color-text-secondary, #555555);
}

.filter-input {
  width: 220px;
  min-width: 150px;
  max-width: none;
  margin: 0;
  padding: 7px 10px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 6px;
  background-color: var(--color-surface, #f7f7f7);
  font-size: 0.82rem;
  color: var(--color-text-primary, #070707);
  box-sizing: border-box;
}

.filter-input:focus {
  border-color: var(--color-brand, #03658c);
  outline: 2px solid rgba(3, 101, 140, 0.25);
  outline-offset: 0;
}

.filter-check {
  display: flex;
  gap: 8px;
  align-items: center;
  width: auto;
  padding-bottom: 8px;
  font-size: 0.8rem;
  color: var(--color-text-primary, #070707);
  cursor: pointer;
}

.filter-check input[type='checkbox'] {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--color-brand, #03658c);
  cursor: pointer;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

/* Estados de carga/transporte (§8.5) */

.load-error {
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

:root[data-theme='dark'] .load-error {
  color: #ff9b9b;
}

.rates-loading {
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

.refresh-note {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-text-muted, #8a8a8a);
}

.mini-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(120, 120, 120, 0.25);
  border-top-color: var(--color-brand, #03658c);
  border-radius: 50%;
  animation: rules-spin 0.8s linear infinite;
}

@keyframes rules-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .mini-spinner {
    animation-duration: 1.6s;
  }
}

@media (max-width: 768px) {
  .budget-rules-page {
    padding: 20px 16px;
  }
}
</style>
