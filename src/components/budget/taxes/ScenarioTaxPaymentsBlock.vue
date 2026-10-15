<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useBudgetPlanningStore } from '@/stores/budgetPlanningStore.js'
import { formatMoney } from '@/components/budget/planning/planningFormat.js'
import { TAX_TYPES, aggregateTaxPayments, taxCalculationAvailable } from './taxPresentation.js'

const props = defineProps({ scenario: { type: Object, required: true } })
const store = useBudgetPlanningStore()
const router = useRouter()
const tax = computed(() => store.tax)
const rows = computed(() => aggregateTaxPayments(tax.value.cashFlow, props.scenario.budget_year))
const needsCalculation = computed(
  () =>
    !tax.value.loaded ||
    tax.value.stale ||
    (!taxCalculationAvailable(tax.value.summary) && tax.value.cashFlow?.calculation_executed !== true)
)

function openTaxPlanning() {
  router.push({ name: 'BudgetTaxesSummary', params: { idBudget: props.scenario.id_budget } })
}

function periodLabel(row) {
  if (!row.month) return `Año ${row.paymentYear || 'sin definir'}`
  const label = new Intl.DateTimeFormat('es-CO', { month: 'long' }).format(new Date(2000, row.month - 1, 1))
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} ${row.year}`
}

function amount(value) {
  return value ? formatMoney(value) : '·'
}
</script>

<template>
  <section class="tax-scenario-block" aria-labelledby="scenario-tax-flow-title">
    <div class="tax-scenario-heading">
      <div>
        <span class="tax-scenario-eyebrow">Fuente: flujo tributario calculado</span>
        <h4 id="scenario-tax-flow-title">Pagos tributarios</h4>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" @click="openTaxPlanning">Ver cálculo</button>
    </div>
    <p class="tax-scenario-note">
      Salidas agrupadas por mes y año de pago. SIMPLE conserva sus periodos bimestrales; Ordinario pagado en el año siguiente queda identificado.
    </p>

    <div v-if="tax.loading" class="tax-scenario-empty" role="status">Cargando pagos tributarios…</div>
    <div v-else-if="tax.error" class="tax-scenario-warning" role="alert">
      <strong>No se pudo cargar el flujo tributario.</strong>
      <button type="button" class="tax-scenario-link" @click="store.fetchTaxData(scenario.id_budget, { force: true })">Reintentar</button>
    </div>
    <div v-else-if="needsCalculation" class="tax-scenario-warning" role="status">
      <div><strong>Calcula primero los impuestos del escenario.</strong><span>Los pagos tributarios aparecerán aquí después de ejecutar el cálculo.</span></div>
      <button type="button" class="tax-scenario-cta" @click="openTaxPlanning">Ejecutar cálculo tributario</button>
    </div>
    <div v-else class="tax-scenario-table-wrap">
      <table class="tax-scenario-table" aria-label="Pagos tributarios agrupados por mes y año de pago">
        <thead><tr><th>Mes / año de pago</th><th v-for="type in TAX_TYPES" :key="type.key">{{ type.shortLabel }}</th><th>Total salida de caja</th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.key">
            <th scope="row">{{ periodLabel(row) }} <span v-if="row.nextYear" class="tax-year-tag">Año siguiente</span></th>
            <td v-for="type in TAX_TYPES" :key="type.key" class="tax-number">{{ amount(row.amounts[type.key]) }}</td>
            <td class="tax-number tax-total">{{ amount(row.total) }}</td>
          </tr>
          <tr v-if="!rows.length"><td :colspan="TAX_TYPES.length + 2" class="tax-scenario-muted">Sin pagos tributarios calculados.</td></tr>
        </tbody>
      </table>
    </div>
    <p class="tax-scenario-legend">La tabla usa únicamente `cash_outflow` del endpoint de flujo tributario. No convierte causado ni retenido en gasto o salida adicional.</p>
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
.tax-scenario-table { width: 100%; min-width: 900px; border-collapse: collapse; font-size: .76rem; }
.tax-scenario-table th, .tax-scenario-table td { padding: 8px 10px; border-bottom: 1px solid var(--color-border, rgba(97, 97, 97, .15)); text-align: left; white-space: nowrap; }
.tax-scenario-table thead th { color: var(--color-text-secondary, #555); background: var(--color-surface, #f7f7f7); font-size: .68rem; text-transform: uppercase; }
.tax-scenario-table tbody th { color: var(--color-text-primary, #070707); font-weight: 600; }
.tax-number { color: var(--color-text-primary, #070707); font-variant-numeric: tabular-nums; text-align: right !important; }
.tax-total { font-weight: 700; }
.tax-year-tag { display: inline-block; margin-left: 4px; padding: 2px 6px; border-radius: 999px; background: rgba(217, 119, 6, .12); color: #b45309; font-size: .65rem; font-weight: 700; }
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
