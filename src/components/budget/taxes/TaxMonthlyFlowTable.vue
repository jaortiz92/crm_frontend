<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useBudgetTaxStore } from '@/stores/budgetTaxStore.js'
import {
  aggregateTaxPayments,
  numericValue,
  summaryRowsOf,
  taxTypeLabel
} from './taxPresentation.js'

const store = useBudgetTaxStore()
const route = useRoute()
const router = useRouter()

const results = computed(() => summaryRowsOf(store.summary))
const rows = computed(() =>
  results.value.map((row, index) => ({
    ...row,
    key: row.id_budget_tax_result ?? `${row.tax_type}-${row.period_start}-${index}`,
    typeLabel: taxTypeLabel(row.tax_type),
    caused: numericValue(row.tax_caused),
    retained: numericValue(row.withholding_amount)
  }))
)
// Cash is presented only as monthly totals of the cash-flow endpoint.
const monthlyCash = computed(() => aggregateTaxPayments(store.cashFlow, store.taxYear))

const money = (value) =>
  value == null ? 'Sin configurar' : new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value)

function periodLabel(row) {
  if (row.tax_type === 'simple') return row.period_code || row.calculation_trace?.period_code || 'Periodo SIMPLE'
  return row.period_start && row.period_end
    ? `${String(row.period_start).slice(0, 10)} – ${String(row.period_end).slice(0, 10)}`
    : 'Vigencia anual'
}

function openTaxSummary() {
  if (route.params.idBudget) {
    router.push({ name: 'BudgetTaxesSummary', params: { idBudget: route.params.idBudget } })
  }
}
</script>

<template>
  <section class="tax-card">
    <div class="tax-section-heading">
      <div><span class="eyebrow">Vista mensual</span><h2>Flujo tributario</h2></div>
      <button v-if="route.params.idBudget" class="btn btn-secondary" type="button" @click="openTaxSummary">Ver cálculo</button>
    </div>
    <div v-if="store.loading" class="tax-empty">Cargando flujo tributario…</div>
    <div v-else-if="!rows.length" class="tax-empty">
      <strong>El cálculo tributario aún no está disponible.</strong>
      <span>Ejecuta el cálculo para ver causado, retenido y salida de caja por tipo.</span>
      <button v-if="route.params.idBudget" class="btn btn-primary" type="button" @click="openTaxSummary">Ejecutar cálculo tributario</button>
    </div>
    <div v-else class="table-wrap">
      <table class="crm-table">
        <thead><tr><th>Tipo</th><th>Periodo</th><th>Causado</th><th>Retenido</th><th>Pago</th><th>Año pago</th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.key">
            <th scope="row">{{ row.typeLabel }}</th>
            <td>{{ periodLabel(row) }}</td>
            <td>{{ money(row.caused) }}</td>
            <td>{{ money(row.retained) }}</td>
            <td>{{ row.payment_date || 'Sin configurar' }}</td>
            <td><span v-if="row.payment_year > store.taxYear" class="year-tag">{{ row.payment_year }} · Año siguiente</span><span v-else>{{ row.payment_year || '—' }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>
    <template v-if="monthlyCash.length">
      <h3>Salida de caja mensual</h3>
      <div class="table-wrap">
        <table class="crm-table">
          <thead><tr><th>Mes de pago</th><th>Salida de caja</th></tr></thead>
          <tbody>
            <tr v-for="month in monthlyCash" :key="month.key">
              <th scope="row">{{ month.key }}<span v-if="month.nextYear" class="year-tag"> · Año siguiente</span></th>
              <td><b>{{ money(month.total) }}</b></td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
    <p class="tax-note">La salida de caja es el valor entregado por el endpoint de flujo tributario. No se trata ReteIVA, retenciones ni ReteICA como gasto del P&amp;G.</p>
  </section>
</template>
