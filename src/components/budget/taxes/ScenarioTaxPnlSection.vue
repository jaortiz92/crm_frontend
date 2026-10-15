<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useBudgetPlanningStore } from '@/stores/budgetPlanningStore.js'
import { formatMoney } from '@/components/budget/planning/planningFormat.js'
import {
  TAX_PNL_TYPES,
  numericValue,
  summaryRowsOf,
  taxTypeLabel,
  taxCalculationAvailable
} from './taxPresentation.js'

const props = defineProps({ scenario: { type: Object, required: true } })
const store = useBudgetPlanningStore()
const router = useRouter()

const tax = computed(() => store.tax)
const summaryRows = computed(() => summaryRowsOf(tax.value.summary))
const rows = computed(() =>
  summaryRows.value.map((row, index) => ({
    ...row,
    key: row.id_budget_tax_result ?? `${row.tax_type}-${row.period_start}-${index}`,
    typeLabel: taxTypeLabel(row.tax_type),
    caused: numericValue(row.tax_caused),
    retained: numericValue(row.withholding_amount),
    isPnl: TAX_PNL_TYPES.has(row.tax_type)
  }))
)

const pnlRows = computed(() => rows.value.filter((row) => row.isPnl))
const informativeRows = computed(() => rows.value.filter((row) => !row.isPnl))
const needsCalculation = computed(
  () => !tax.value.loaded || tax.value.stale || !taxCalculationAvailable(tax.value.summary)
)

function openTaxPlanning() {
  router.push({ name: 'BudgetTaxesSummary', params: { idBudget: props.scenario.id_budget } })
}

function periodLabel(row) {
  if (row.tax_type === 'simple') return row.period_code || row.calculation_trace?.period_code || 'Periodo SIMPLE'
  return row.period_start && row.period_end
    ? `${String(row.period_start).slice(0, 10)} – ${String(row.period_end).slice(0, 10)}`
    : 'Vigencia anual'
}

function amount(value) {
  return value ? formatMoney(value) : '·'
}
</script>

<template>
  <section class="tax-scenario-block" aria-labelledby="scenario-tax-pnl-title">
    <div class="tax-scenario-heading">
      <div>
        <span class="tax-scenario-eyebrow">Fuente: resumen tributario calculado</span>
        <h4 id="scenario-tax-pnl-title">Impuesto causado en P&amp;G</h4>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" @click="openTaxPlanning">
        Planeación tributaria
      </button>
    </div>

    <div v-if="tax.loading" class="tax-scenario-empty" role="status">Cargando resultados tributarios…</div>
    <div v-else-if="tax.error" class="tax-scenario-warning" role="alert">
      <strong>No se pudo cargar el cálculo tributario.</strong>
      <button type="button" class="tax-scenario-link" @click="store.fetchTaxData(scenario.id_budget, { force: true })">
        Reintentar
      </button>
    </div>
    <div v-else-if="needsCalculation" class="tax-scenario-warning" role="status">
      <div>
        <strong>El cálculo tributario aún no está disponible.</strong>
        <span>Ejecuta el cálculo para incorporar el impuesto causado y sus pagos al escenario.</span>
      </div>
      <button type="button" class="tax-scenario-cta" @click="openTaxPlanning">Ejecutar cálculo tributario</button>
    </div>
    <template v-else>
      <p class="tax-scenario-note">
        El causado se muestra por tipo. ReteIVA, retención y ReteICA son retenciones/recaudos informativos:
        no se registran como gasto en P&amp;G.
      </p>
      <div class="tax-scenario-table-wrap">
        <table class="tax-scenario-table" aria-label="Impuesto causado por tipo tributario">
          <thead><tr><th>Tipo</th><th>Periodo</th><th>Causado</th><th>Retenido</th></tr></thead>
          <tbody>
            <tr v-for="row in pnlRows" :key="row.key">
              <th scope="row">{{ row.typeLabel }}</th>
              <td>{{ periodLabel(row) }}</td>
              <td class="tax-number">{{ amount(row.caused) }}</td>
              <td class="tax-number">{{ amount(row.retained) }}</td>
            </tr>
            <tr v-if="!pnlRows.length"><td colspan="4" class="tax-scenario-muted">Sin impuestos causados con impacto en resultado.</td></tr>
          </tbody>
        </table>
      </div>
      <h5 class="tax-scenario-subtitle">Retenciones y recaudos · no gasto P&amp;G</h5>
      <div class="tax-scenario-table-wrap">
        <table class="tax-scenario-table" aria-label="Retenciones y recaudos tributarios">
          <thead><tr><th>Tipo</th><th>Periodo</th><th>Causado</th><th>Retenido</th></tr></thead>
          <tbody>
            <tr v-for="row in informativeRows" :key="row.key">
              <th scope="row">{{ row.typeLabel }}</th>
              <td>{{ periodLabel(row) }}</td>
              <td class="tax-number">{{ amount(row.caused) }}</td>
              <td class="tax-number">{{ amount(row.retained) }}</td>
            </tr>
            <tr v-if="!informativeRows.length"><td colspan="4" class="tax-scenario-muted">Sin retenciones o recaudos calculados.</td></tr>
          </tbody>
        </table>
      </div>
      <p class="tax-scenario-legend">Causado = obligación del periodo · Retenido = valor informado por el cálculo. La salida de caja se consulta como total mensual en Planeación tributaria.</p>
    </template>
  </section>
</template>

<style scoped>
.tax-scenario-block { display: flex; flex-direction: column; gap: 10px; padding: 16px; border: 1px solid var(--color-border, rgba(97, 97, 97, .15)); border-radius: 8px; background: var(--color-surface-card, #fff); }
.tax-scenario-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.tax-scenario-eyebrow { color: var(--color-text-muted, #8a8a8a); font-size: .68rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
.tax-scenario-heading h4 { margin: 3px 0 0; color: var(--color-text-primary, #070707); font-size: .92rem; }
.tax-scenario-note, .tax-scenario-legend { margin: 0; color: var(--color-text-secondary, #555); font-size: .76rem; line-height: 1.45; }
.tax-scenario-legend { color: var(--color-text-muted, #8a8a8a); }
.tax-scenario-table-wrap { overflow-x: auto; border: 1px solid var(--color-border, rgba(97, 97, 97, .15)); border-radius: 6px; }
.tax-scenario-table { width: 100%; min-width: 690px; border-collapse: collapse; font-size: .76rem; }
.tax-scenario-table th, .tax-scenario-table td { padding: 8px 10px; border-bottom: 1px solid var(--color-border, rgba(97, 97, 97, .15)); text-align: left; white-space: nowrap; }
.tax-scenario-table thead th { color: var(--color-text-secondary, #555); background: var(--color-surface, #f7f7f7); font-size: .68rem; text-transform: uppercase; }
.tax-scenario-table tbody th { color: var(--color-text-primary, #070707); font-weight: 600; }
.tax-number { color: var(--color-text-primary, #070707); font-variant-numeric: tabular-nums; text-align: right !important; }
.tax-scenario-subtitle { margin: 6px 0 0; color: var(--color-text-secondary, #555); font-size: .78rem; }
.tax-scenario-empty, .tax-scenario-muted { padding: 12px; color: var(--color-text-muted, #8a8a8a); text-align: center !important; }
.tax-scenario-warning { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; border: 1px solid rgba(217, 119, 6, .35); border-left: 4px solid #d97706; border-radius: 6px; background: rgba(245, 158, 11, .08); color: var(--color-text-secondary, #555); font-size: .78rem; }
.tax-scenario-warning strong { display: block; color: #b45309; }
.tax-scenario-link, .tax-scenario-cta { border: 1px solid rgba(217, 119, 6, .45); border-radius: 6px; padding: 6px 10px; background: transparent; color: #b45309; cursor: pointer; font-size: .74rem; font-weight: 600; }
.tax-scenario-cta { background: rgba(217, 119, 6, .12); }
:root[data-theme='dark'] .tax-scenario-block { background: var(--color-surface-card, #151c24); }
:root[data-theme='dark'] .tax-scenario-table thead th { background: rgba(255, 255, 255, .05); }
:root[data-theme='dark'] .tax-scenario-warning strong, :root[data-theme='dark'] .tax-scenario-link, :root[data-theme='dark'] .tax-scenario-cta { color: #fbbf24; }
@media (max-width: 640px) { .tax-scenario-heading { align-items: stretch; flex-direction: column; } .tax-scenario-heading .btn { align-self: flex-start; } }
</style>
