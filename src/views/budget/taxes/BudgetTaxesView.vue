<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TaxConfigurationForm from '@/components/budget/taxes/TaxConfigurationForm.vue'
import BudgetTaxAssumptionsForm from '@/components/budget/taxes/BudgetTaxAssumptionsForm.vue'
import TaxCalendarTable from '@/components/budget/taxes/TaxCalendarTable.vue'
import TaxSummaryPanel from '@/components/budget/taxes/TaxSummaryPanel.vue'
import TaxComparisonPanel from '@/components/budget/taxes/TaxComparisonPanel.vue'
import TaxMonthlyFlowTable from '@/components/budget/taxes/TaxMonthlyFlowTable.vue'
import BudgetTaxRatesPanel from '@/components/budget/taxes/BudgetTaxRatesPanel.vue'
import { useBudgetTaxStore } from '@/stores/budgetTaxStore.js'

const route = useRoute(); const router = useRouter(); const store = useBudgetTaxStore()
const idBudget = computed(() => route.params.idBudget || null)
const section = computed(() => route.path.endsWith('/configuration') ? 'configuration' : route.path.endsWith('/rates') ? 'rates' : route.path.endsWith('/calendar') ? 'calendar' : route.path.endsWith('/comparison') ? 'comparison' : idBudget.value ? 'summary' : 'configuration')
const tabs = computed(() => idBudget.value ? [{ key: 'summary', label: 'Panel' }, { key: 'configuration', label: 'Configuración' }, { key: 'rates', label: 'Tarifas' }, { key: 'calendar', label: 'Calendario' }, { key: 'comparison', label: 'Comparar' }] : [{ key: 'configuration', label: 'Configuración' }, { key: 'rates', label: 'Tarifas' }, { key: 'calendar', label: 'Calendario' }])
function go(key) {
  const suffix = key[0].toUpperCase() + key.slice(1)
  const name = idBudget.value ? (key === 'summary' ? 'BudgetTaxesSummary' : `BudgetTaxesBudget${suffix}`) : `BudgetTaxes${suffix}`
  router.push(idBudget.value ? { name, params: { idBudget: idBudget.value } } : { name })
}
const ready = ref(false)
// The fiscal year always follows the budget. Child forms mount only after the
// year is known, so they never load profiles for the store's default year.
async function loadPage() {
  ready.value = false
  if (idBudget.value) {
    const year = await store.resolveBudgetYear(idBudget.value)
    if (year === null) {
      store.error = 'No fue posible determinar el año fiscal del presupuesto.'
    } else {
      await store.loadConfiguration(year)
      await store.loadBudget(idBudget.value)
    }
  } else {
    await store.loadConfiguration()
  }
  ready.value = true
}
onMounted(loadPage)
watch(idBudget, async (next, previous) => { if (next && next !== previous) { store.$reset(); await loadPage() } })
function print() { window.print() }
</script>
<template>
  <main class="tax-page"><header class="tax-hero"><div><span class="eyebrow">Planeación tributaria · {{ store.taxYear }}</span><h1>{{ idBudget ? 'Impacto tributario del presupuesto' : 'Configuración tributaria' }}</h1><p>Separa lo que se causa de lo que realmente sale de caja.</p></div><button v-if="idBudget" class="btn btn-secondary" @click="print">Imprimir / exportar</button></header>
    <nav class="tax-tabs" aria-label="Secciones tributarias"><button v-for="tab in tabs" :key="tab.key" :class="{ active: section === tab.key }" @click="go(tab.key)">{{ tab.label }}</button></nav>
    <div v-if="!ready || store.loading" class="tax-loading">Cargando información tributaria…</div><div v-else-if="store.error" class="tax-error"><strong>No fue posible cargar los datos.</strong> {{ store.error }} <button class="btn btn-secondary" @click="loadPage">Reintentar</button></div>
    <template v-else-if="section === 'configuration'"><TaxConfigurationForm :id-budget="idBudget" /><BudgetTaxAssumptionsForm v-if="idBudget" :id-budget="idBudget" /><TaxSummaryPanel v-if="idBudget" :id-budget="idBudget" /></template>
     <BudgetTaxRatesPanel v-else-if="section === 'rates'" />
     <TaxCalendarTable v-else-if="section === 'calendar'" />
    <template v-else-if="section === 'comparison'"><TaxComparisonPanel :id-budget="idBudget" /><TaxMonthlyFlowTable /></template>
    <template v-else><TaxSummaryPanel :id-budget="idBudget" /><TaxMonthlyFlowTable /></template>
    <p class="tax-disclaimer">Valores estimados para planeación financiera. Validar con el contador o asesor tributario antes de utilizarlos para obligaciones fiscales reales.</p>
  </main>
</template>
<style scoped>
.tax-page { max-width: 1200px; min-height: calc(100vh - 70px); margin: 0 auto; padding: 32px 24px 48px; color: var(--color-text-primary); background: var(--color-surface); }
.tax-hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 32px; }
.tax-hero h1 { margin: 8px 0; color: var(--color-text-primary); font-size: 28px; font-weight: 600; letter-spacing: -.02em; text-wrap: balance; }
.tax-hero p { margin: 0; color: var(--color-text-secondary); font-size: 14px; }
.tax-tabs { display: flex; gap: 4px; margin-bottom: 24px; overflow-x: auto; border-bottom: 1px solid var(--color-border); }
.tax-tabs button { flex: 0 0 auto; padding: 12px 16px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--color-text-secondary); cursor: pointer; font-size: 14px; font-weight: 600; }
.tax-tabs button:hover { background: var(--color-brand-light); color: var(--color-brand); }
.tax-tabs button:focus-visible { outline: 2px solid var(--color-brand); outline-offset: -2px; }
.tax-tabs button.active { color: var(--color-brand); border-bottom-color: var(--color-brand); }
.tax-loading, .tax-error { padding: 24px; background: var(--color-surface-card); border: 1px solid var(--color-border); border-radius: 8px; color: var(--color-text-secondary); }
.tax-error { border-color: var(--color-danger); }
.tax-error strong { color: var(--color-danger); }
.tax-disclaimer { margin: 24px 0 0; color: var(--color-text-tertiary); font-size: 12px; line-height: 1.5; text-align: center; }
@media (max-width: 700px) { .tax-page { padding: 24px 16px 40px; } .tax-hero { align-items: stretch; flex-direction: column; gap: 16px; } .tax-hero h1 { font-size: 24px; } }
</style>
