<script setup>
import { computed } from 'vue'
import { useBudgetTaxStore } from '@/stores/budgetTaxStore.js'
import TaxSimpleBimonthlyPanel from '@/components/budget/taxes/TaxSimpleBimonthlyPanel.vue'
import { cashFlowRowsOf, numericValue } from './taxPresentation.js'
const props = defineProps({ idBudget: { type: [String, Number], required: true } }); const store = useBudgetTaxStore()
const summary = computed(() => store.summary || {})
const canCalculate = computed(() => Boolean(store.assumptions?.id_tax_profile))
const calculationFeedback = computed(() => {
  return store.error || ''
})
const results = computed(() => Array.isArray(summary.value.results) ? summary.value.results : [])
const cashRows = computed(() => cashFlowRowsOf(store.cashFlow))
const annualCashOutflow = computed(() =>
  cashRows.value.reduce(
    (total, row) => total + numericValue(row.cash_outflow ?? row.payment ?? row.amount),
    0
  )
)
const isSimple = computed(() => summary.value.regime === 'simple' || store.activeProfile?.regime === 'simple' || store.selectedRegime === 'simple')
const currency = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 })

function aggregate(key, predicate = () => true) {
  const rows = results.value.filter(predicate)
  return rows.length ? rows.reduce((total, row) => total + Number(row[key] || 0), 0) : null
}

function resultValue(key, aliases = [], fallback) {
  for (const name of [key, ...aliases]) {
    if (summary.value[name] !== null && summary.value[name] !== undefined) return summary.value[name]
  }
  return fallback
}

function value(key) {
  const simpleRows = (row) => row.tax_type === 'simple'
  const ordinaryRows = (row) => row.tax_type === 'income_ordinary'
  const fallbacks = {
    tax_total: aggregate('tax_caused'),
    pending_balance: aggregate('balance_payable'),
    advances: aggregate('advance_amount'),
    withholdings: aggregate('withholding_amount'),
    next_due_date: results.value.map((row) => row.payment_date).filter(Boolean).sort()[0],
    annual_cash_outflow: annualCashOutflow.value,
    income_tax: aggregate('tax_caused', isSimple.value ? simpleRows : ordinaryRows),
    pending_income_tax: aggregate('balance_payable', isSimple.value ? simpleRows : ordinaryRows),
    iva_generated: aggregate('taxable_base', (row) => row.tax_type === 'reteiva'),
    iva_deductible: summary.value.iva_deductible,
    reteiva: aggregate('tax_caused', (row) => row.tax_type === 'reteiva'),
    iva_balance: summary.value.iva_balance,
    withholding: aggregate('tax_caused', (row) => row.tax_type === 'withholding'),
    ica: aggregate('tax_caused', (row) => row.tax_type === 'ica'),
    reteica: aggregate('tax_caused', (row) => row.tax_type === 'reteica'),
  }

  return resultValue(key, key === 'tax_total' ? ['total_caused'] : key === 'pending_balance' ? ['total_payable'] : [], fallbacks[key]) ?? 'Sin configurar'
}

const monetaryKeys = new Set(['tax_total', 'pending_balance', 'advances', 'withholdings', 'annual_cash_outflow', 'income_tax', 'pending_income_tax', 'iva_generated', 'iva_deductible', 'reteiva', 'iva_balance', 'withholding', 'ica', 'reteica'])
const format = (raw, key) => monetaryKeys.has(key) && raw !== 'Sin configurar' && raw !== null && raw !== undefined && Number.isFinite(Number(raw)) ? currency.format(Number(raw)) : raw
defineExpose({ props })
</script>
<template>
  <div class="tax-summary-stack">
    <section class="tax-card">
      <div class="tax-section-heading">
        <div><span class="eyebrow">Panel del presupuesto</span><h2>Impacto tributario y caja</h2></div>
        <button class="btn btn-primary" :disabled="store.calculating || !canCalculate" @click="store.calculateBudget(idBudget)">
          {{ store.calculating ? 'Calculando…' : 'Ejecutar cálculo' }}
        </button>
      </div>
      <div v-if="store.missingConfiguration.length" class="tax-warning">
        <strong>Datos incompletos</strong><span>{{ store.missingConfiguration.join(' · ') }}</span>
      </div>
      <div v-else-if="!results.length" class="tax-warning">
        <strong>Cálculo tributario pendiente</strong>
        <span>Ejecuta el cálculo para publicar causado, retenido y salida de caja.</span>
      </div>
      <p v-if="calculationFeedback" class="tax-feedback tax-feedback-error" role="alert">{{ calculationFeedback }}</p>
      <div class="metric-grid">
        <article v-for="metric in [['tax_total','Impuesto total estimado'],['pending_balance','Saldo tributario pendiente'],['advances','Anticipos'],['withholdings','Retenciones'],['next_due_date','Próximo vencimiento'],['annual_cash_outflow','Salida de caja tributaria del año']]" :key="metric[0]" class="metric">
          <span>{{ metric[1] }}</span><strong>{{ format(value(metric[0]), metric[0]) }}</strong>
        </article>
      </div>
      <div class="tax-columns">
        <div><h3>Renta / SIMPLE</h3><p>Impuesto causado: <b>{{ format(value('income_tax'), 'income_tax') }}</b></p><p>Saldo por pagar: <b>{{ format(value('pending_income_tax'), 'pending_income_tax') }}</b></p></div>
        <div><h3>ReteIVA integrado</h3><p>IVA generado: <b>{{ format(value('iva_generated'), 'iva_generated') }}</b></p><p>IVA descontable: <b>{{ format(value('iva_deductible'), 'iva_deductible') }}</b></p><p>ReteIVA: <b>{{ format(value('reteiva'), 'reteiva') }}</b></p><p>Saldo tributario resultante: <b>{{ format(value('iva_balance'), 'iva_balance') }}</b></p></div>
        <div><h3>Otros conceptos</h3><p>Retención en la fuente: <b>{{ format(value('withholding'), 'withholding') }}</b></p><p>ICA: <b>{{ format(value('ica'), 'ica') }}</b> · ReteICA: <b>{{ format(value('reteica'), 'reteica') }}</b></p></div>
      </div>
      <p class="tax-note">ReteIVA se muestra como integración del IVA existente; no duplica el IVA ni se registra como gasto en el P&amp;G.</p>
    </section>
    <TaxSimpleBimonthlyPanel v-if="isSimple" />
  </div>
</template>
