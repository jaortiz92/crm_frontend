<script setup>
import { computed } from 'vue'
import { useBudgetTaxStore } from '@/stores/budgetTaxStore.js'

const store = useBudgetTaxStore()

const moneyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 2,
})

const percentFormatter = new Intl.NumberFormat('es-CO', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
})

const dateFormatter = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'medium',
})

const results = computed(() => [...store.simpleResults].sort((a, b) => String(a.period_start || '').localeCompare(String(b.period_start || ''))))

const simpleRates = computed(() => store.rates.filter((rate) => rate.tax_type === 'simple'))

function display(value, formatter) {
  return value === null || value === undefined || value === '' ? 'Sin configurar' : formatter(value)
}

function money(value) {
  return display(value, (amount) => Number.isFinite(Number(amount)) ? moneyFormatter.format(Number(amount)) : amount)
}

function rate(value) {
  return display(value, (amount) => Number.isFinite(Number(amount)) ? percentFormatter.format(Number(amount)) : amount)
}

function date(value) {
  if (!value) return 'Sin configurar'
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? value : dateFormatter.format(parsed)
}

function periodLabel(row, index) {
  if (row.period_code || row.period) return row.period_code || row.period
  return `Bimestre ${index + 1}`
}

function trace(row) {
  return row.calculation_trace || row.trace || {}
}

function periodIncome(row) {
  return row.bimonthly_income ?? row.period_income ?? row.income ?? row.taxable_base ?? trace(row).bimonthly_income
}

function findRate(row) {
  const base = Number(periodIncome(row))
  if (!Number.isFinite(base)) return null

  return (
    simpleRates.value.find((item) => {
      const minimum = item.income_min === null || item.income_min === undefined ? -Infinity : Number(item.income_min)
      const maximum = item.income_max === null || item.income_max === undefined ? Infinity : Number(item.income_max)
      return base >= minimum && base <= maximum
    }) || null
  )
}

function rangeLabel(row) {
  const source = row.income_range || row.applied_range || trace(row).income_range || trace(row).rate_range
  if (source) return source

  const selectedRate = findRate(row)
  if (!selectedRate || (selectedRate.income_min == null && selectedRate.income_max == null)) return 'Sin configurar'

  const minimum = selectedRate.income_min == null ? 'Sin límite' : money(selectedRate.income_min)
  const maximum = selectedRate.income_max == null ? 'Sin límite' : money(selectedRate.income_max)
  return `${minimum} – ${maximum}`
}

function appliedRate(row) {
  // tax_rate is the backend's result for this period, never an annual rate.
  return rate(row.tax_rate ?? row.applied_rate ?? row.rate ?? findRate(row)?.rate)
}

function paymentDate(row) {
  return date(row.advance_payment_date || row.advance_date || row.payment_date)
}

function declarationDate(row) {
  return date(row.declaration_date || row.filing_date)
}
</script>

<template>
  <section class="tax-card simple-bimonthly-panel">
    <div class="tax-section-heading">
      <div>
        <span class="eyebrow">Régimen SIMPLE</span>
        <h2>Resultado por bimestre</h2>
      </div>
      <span class="periodicity-badge">6 periodos · anticipos durante el año</span>
    </div>

    <div v-if="!results.length" class="tax-empty">
      <strong>Sin resultados bimestrales</strong>
      <span>Ejecuta el cálculo con una tarifa y un calendario SIMPLE configurados para ver cada periodo.</span>
    </div>

    <div v-else class="table-wrap">
      <table class="crm-table simple-bimonthly-table">
        <caption class="sr-only">Resultados del impuesto SIMPLE por bimestre</caption>
        <thead>
          <tr>
            <th>Bimestre</th>
            <th>Ingresos del bimestre</th>
            <th>Rango aplicado</th>
            <th>Tarifa aplicada</th>
            <th>Impuesto causado</th>
            <th>Declaración</th>
            <th>Anticipo / pago</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in results" :key="row.id_budget_tax_result || `${row.period_start}-${index}`">
            <th scope="row">{{ periodLabel(row, index) }}</th>
            <td>{{ money(periodIncome(row)) }}</td>
            <td>{{ rangeLabel(row) }}</td>
            <td>{{ appliedRate(row) }}</td>
            <td><strong>{{ money(row.tax_caused) }}</strong></td>
            <td>{{ declarationDate(row) }}</td>
            <td>
              {{ paymentDate(row) }}
              <span v-if="row.payment_year" class="year-tag">{{ row.payment_year }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="tax-note">
      La tarifa y el rango se muestran para cada bimestre según el resultado del backend. No se asume una tarifa única anual;
      el total del año es únicamente una referencia agregada de los periodos calculados.
    </p>
  </section>
</template>
