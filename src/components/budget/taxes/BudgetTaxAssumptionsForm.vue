<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useBudgetTaxStore } from '@/stores/budgetTaxStore.js'
import { useBudgetPlanningStore } from '@/stores/budgetPlanningStore.js'
import { useUserStore } from '@/stores/userStore.js'

const props = defineProps({
  idBudget: { type: [String, Number], required: true }
})

const BIMONTHLY_PERIODS = [
  { key: 'bimestre_1', label: 'Bimestre 1 · enero – febrero' },
  { key: 'bimestre_2', label: 'Bimestre 2 · marzo – abril' },
  { key: 'bimestre_3', label: 'Bimestre 3 · mayo – junio' },
  { key: 'bimestre_4', label: 'Bimestre 4 · julio – agosto' },
  { key: 'bimestre_5', label: 'Bimestre 5 · septiembre – octubre' },
  { key: 'bimestre_6', label: 'Bimestre 6 · noviembre – diciembre' }
]

const store = useBudgetTaxStore()
const planningStore = useBudgetPlanningStore()
const userStore = useUserStore()
// The fiscal year is the budget's year (set by BudgetTaxesView before mounting).
const taxYear = computed(() => Number(store.taxYear))
const canEdit = computed(() => userStore.hasPermission('high') || userStore.hasRole(['Gerente', 'Financiero']))
const selectedRegime = ref(store.selectedRegime || 'ordinary')
const selectedProfileId = ref('')
const useBudgetIncome = ref(true)
const feedback = ref('')
const feedbackKind = ref('')
const loadingBudget = ref(false)

const form = reactive({
  taxable_income_adjustments: 0,
  non_deductible_expenses: 0,
  exempt_income: 0,
  tax_losses: 0,
  tax_discounts: 0,
  prior_advances: 0,
  prior_withholdings: 0,
  withholding_base: null,
  withholding_suffered: 0,
  reteiva_suffered: 0,
  reteica_base: null,
  notes: '',
  bimestre_1: 0,
  bimestre_2: 0,
  bimestre_3: 0,
  bimestre_4: 0,
  bimestre_5: 0,
  bimestre_6: 0
})

const profilesForYear = computed(() => store.profiles.filter((profile) => Number(profile.tax_year) === taxYear.value))
const profilesForRegime = computed(() => profilesForYear.value.filter((profile) => profile.regime === selectedRegime.value))
const selectedProfile = computed(() => profilesForYear.value.find((profile) => String(profileId(profile)) === String(selectedProfileId.value)) || null)
const budgetIncomeTotal = computed(() => {
  const lines = planningStore.currentScenario?.budget_lines
  if (!Array.isArray(lines)) return null
  return lines.reduce((total, line) => line.line_type === 'income' ? total + Number(line.projected_amount || 0) : total, 0)
})
const moneyFormatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

function profileId(profile) {
  return profile?.id_tax_profile ?? profile?.id ?? ''
}

function profileStatus(profile) {
  return profile.status || (profile.is_active === false ? 'archived' : 'active')
}

function errorMessage(value) {
  if (Array.isArray(value)) return value.map((item) => item.msg || item.detail || String(item)).join(' · ')
  if (value && typeof value === 'object') return value.msg || value.detail || 'Revisa los supuestos enviados.'
  return value || 'No fue posible guardar los supuestos tributarios.'
}

function resetAssumptions() {
  Object.assign(form, {
    taxable_income_adjustments: 0,
    non_deductible_expenses: 0,
    exempt_income: 0,
    tax_losses: 0,
    tax_discounts: 0,
    prior_advances: 0,
    prior_withholdings: 0,
    withholding_base: null,
    withholding_suffered: 0,
    reteiva_suffered: 0,
    reteica_base: null,
    notes: '',
    bimestre_1: 0,
    bimestre_2: 0,
    bimestre_3: 0,
    bimestre_4: 0,
    bimestre_5: 0,
    bimestre_6: 0
  })
  useBudgetIncome.value = true
}

function bimonthlyValue(values, key, index) {
  if (!values || typeof values !== 'object') return 0
  const aliases = [key, `bim-${index + 1}`, `bim_${index + 1}`, `bim${index + 1}`, String(index + 1)]
  const found = aliases.find((alias) => values[alias] !== undefined && values[alias] !== null)
  return found ? values[found] : 0
}

function loadAssumptionIntoForm(assumption) {
  resetAssumptions()
  if (!assumption) return

  const fields = [
    'taxable_income_adjustments', 'non_deductible_expenses', 'exempt_income', 'tax_losses',
    'tax_discounts', 'prior_advances', 'prior_withholdings', 'withholding_base',
    'withholding_suffered', 'reteiva_suffered', 'reteica_base'
  ]
  fields.forEach((field) => { form[field] = assumption[field] ?? form[field] })
  form.notes = assumption.notes || ''
  useBudgetIncome.value = assumption.monthly_sales_taxable_base === null || assumption.monthly_sales_taxable_base === undefined
  BIMONTHLY_PERIODS.forEach((period, index) => {
    form[period.key] = bimonthlyValue(assumption.monthly_sales_taxable_base, period.key, index)
  })
  selectedProfileId.value = assumption.id_tax_profile ? String(assumption.id_tax_profile) : ''
  const profile = profilesForYear.value.find((item) => String(profileId(item)) === selectedProfileId.value)
  if (profile) selectedRegime.value = profile.regime
}

function selectDefaultProfile() {
  const assumptionProfile = profilesForRegime.value.find((profile) => String(profileId(profile)) === String(store.assumptions?.id_tax_profile))
  const profile = assumptionProfile || profilesForRegime.value.find((item) => profileStatus(item) === 'active') || profilesForRegime.value[0]
  selectedProfileId.value = profile ? String(profileId(profile)) : ''
  if (profile && store.assumptions?.id_tax_profile !== profileId(profile)) loadAssumptionIntoForm(store.assumptions)
}

async function ensureBudgetLoaded() {
  if (!props.idBudget || planningStore.currentScenarioId === Number(props.idBudget)) return
  loadingBudget.value = true
  await planningStore.fetchScenarioDetail(Number(props.idBudget))
  loadingBudget.value = false
}

async function ensureProfilesLoaded() {
  if (!store.profiles.some((profile) => Number(profile.tax_year) === taxYear.value)) {
    await store.loadConfiguration(taxYear.value, selectedRegime.value)
  }
}

function payloadNumber(value, fallback = 0) {
  if (value === '' || value === null || value === undefined) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function payloadFromForm() {
  const payload = {
    id_tax_profile: Number(selectedProfileId.value),
    taxable_income_adjustments: payloadNumber(form.taxable_income_adjustments),
    non_deductible_expenses: payloadNumber(form.non_deductible_expenses),
    exempt_income: payloadNumber(form.exempt_income),
    tax_losses: payloadNumber(form.tax_losses),
    tax_discounts: payloadNumber(form.tax_discounts),
    prior_advances: payloadNumber(form.prior_advances),
    prior_withholdings: payloadNumber(form.prior_withholdings),
    withholding_base: form.withholding_base === '' || form.withholding_base === null ? null : payloadNumber(form.withholding_base, null),
    withholding_suffered: payloadNumber(form.withholding_suffered),
    reteiva_suffered: payloadNumber(form.reteiva_suffered),
    reteica_base: form.reteica_base === '' || form.reteica_base === null ? null : payloadNumber(form.reteica_base, null),
    monthly_sales_taxable_base: selectedRegime.value === 'simple' && !useBudgetIncome.value
      ? Object.fromEntries(BIMONTHLY_PERIODS.map((period) => [period.key, payloadNumber(form[period.key])]))
      : null,
    notes: form.notes.trim() || null
  }
  return payload
}

function validate(payload) {
  if (!selectedProfile.value || !Number.isInteger(payload.id_tax_profile) || payload.id_tax_profile <= 0) return `Selecciona un perfil tributario ${taxYear.value} para este presupuesto.`
  const nonNegativeFields = [
    'non_deductible_expenses', 'exempt_income', 'tax_losses', 'tax_discounts', 'prior_advances',
    'prior_withholdings', 'withholding_base', 'withholding_suffered', 'reteiva_suffered', 'reteica_base'
  ]
  const invalidField = nonNegativeFields.find((field) => payload[field] !== null && payload[field] < 0)
  if (invalidField) return 'Los supuestos monetarios no pueden ser negativos.'
  if (payload.monthly_sales_taxable_base && Object.values(payload.monthly_sales_taxable_base).some((value) => value < 0)) {
    return 'Las bases bimestrales no pueden ser negativas.'
  }
  return ''
}

async function save() {
  feedback.value = ''
  feedbackKind.value = ''
  const payload = payloadFromForm()
  const validationMessage = validate(payload)
  if (validationMessage) {
    feedbackKind.value = 'error'
    feedback.value = validationMessage
    return
  }

  const result = await store.saveAssumptions(props.idBudget, payload)
  if (!result.ok) {
    feedbackKind.value = 'error'
    feedback.value = errorMessage(result.error?.response?.data?.detail || store.error)
    // The form presents mutation errors inline; do not replace the whole tab
    // with the page-level loading error state while the user corrects a field.
    store.error = null
    return
  }

  await Promise.all([
    store.loadBudget(props.idBudget),
    planningStore.fetchScenarioDetail(Number(props.idBudget), true)
  ])
  feedbackKind.value = 'success'
  feedback.value = 'Supuestos guardados y presupuesto recargado. Ya puedes ejecutar el cálculo.'
}

async function changeRegime() {
  store.selectedRegime = selectedRegime.value
  const profile = profilesForRegime.value.find((item) => profileStatus(item) === 'active') || profilesForRegime.value[0]
  selectedProfileId.value = profile ? String(profileId(profile)) : ''
  await store.loadConfiguration(taxYear.value, selectedRegime.value)
}

watch(() => store.assumptions, (assumption) => {
  loadAssumptionIntoForm(assumption)
}, { deep: true, immediate: true })

watch(selectedRegime, () => {
  store.selectedRegime = selectedRegime.value
  if (!selectedProfile.value || selectedProfile.value.regime !== selectedRegime.value) selectDefaultProfile()
})

watch(() => store.profiles, () => {
  if (!selectedProfileId.value || !selectedProfile.value) selectDefaultProfile()
}, { deep: true })

onMounted(async () => {
  await Promise.all([ensureProfilesLoaded(), ensureBudgetLoaded()])
  loadAssumptionIntoForm(store.assumptions)
  if (store.assumptions?.id_tax_profile) {
    selectedProfileId.value = String(store.assumptions.id_tax_profile)
  } else {
    selectDefaultProfile()
  }
})
</script>

<template>
  <section class="tax-card assumptions-card">
    <div class="tax-section-heading">
      <div>
        <span class="eyebrow">Supuestos del escenario</span>
        <h2>Asociar configuración tributaria al presupuesto</h2>
        <p class="tax-note">Selecciona un perfil de {{ taxYear }} y guarda las bases que usará el cálculo de este escenario.</p>
      </div>
      <div class="tax-form-actions">
        <button type="button" class="btn btn-primary" :disabled="store.saving || !canEdit" @click="save">
          {{ store.saving ? 'Guardando…' : 'Guardar supuestos' }}
        </button>
      </div>
    </div>

    <p v-if="feedback" class="tax-feedback" :class="`tax-feedback-${feedbackKind}`" role="status">{{ feedback }}</p>

    <div class="tax-warning" v-if="!profilesForYear.length">
      <strong>Configuración faltante</strong>
      <span>No hay perfiles tributarios {{ taxYear }}. Crea y guarda uno en Configuración tributaria antes de asociarlo al presupuesto.</span>
    </div>
    <div class="tax-form-grid">
      <label>
        Régimen
        <select v-model="selectedRegime" :disabled="!canEdit" @change="changeRegime">
          <option value="ordinary">Ordinario</option>
          <option value="simple">SIMPLE</option>
        </select>
      </label>
      <label>
        Perfil tributario {{ taxYear }}
        <select v-model="selectedProfileId" :disabled="!canEdit || !profilesForRegime.length">
          <option value="">Selecciona un perfil</option>
          <option v-for="profile in profilesForRegime" :key="profileId(profile)" :value="String(profileId(profile))">
            {{ profile.profile_name }} · {{ profileStatus(profile) }}
          </option>
        </select>
      </label>
    </div>

    <div v-if="!profilesForRegime.length" class="tax-empty">
      <strong>Sin perfil para {{ selectedRegime === 'simple' ? 'SIMPLE' : 'régimen ordinario' }} en {{ taxYear }}</strong>
      <span>Guarda un perfil con este régimen en la configuración tributaria para poder continuar.</span>
    </div>

    <div class="subsection">
      <h3>Base de renta y saldos</h3>
      <div class="tax-form-grid">
        <label> Ajustes a la renta gravable <input v-model.number="form.taxable_income_adjustments" type="number" step="0.01"> </label>
        <label> Gastos no deducibles <input v-model.number="form.non_deductible_expenses" type="number" min="0" step="0.01"> </label>
        <label> Ingresos exentos <input v-model.number="form.exempt_income" type="number" min="0" step="0.01"> </label>
        <label> Pérdidas fiscales <input v-model.number="form.tax_losses" type="number" min="0" step="0.01"> </label>
        <label> Descuentos tributarios <input v-model.number="form.tax_discounts" type="number" min="0" step="0.01"> </label>
        <label> Anticipos anteriores <input v-model.number="form.prior_advances" type="number" min="0" step="0.01"> </label>
        <label> Retenciones anteriores <input v-model.number="form.prior_withholdings" type="number" min="0" step="0.01"> </label>
        <label> Base de retención <input v-model.number="form.withholding_base" type="number" min="0" step="0.01" placeholder="Opcional"> </label>
        <label> Retención sufrida <input v-model.number="form.withholding_suffered" type="number" min="0" step="0.01"> </label>
        <label> ReteIVA sufrida <input v-model.number="form.reteiva_suffered" type="number" min="0" step="0.01"> </label>
        <label> Base de reteICA <input v-model.number="form.reteica_base" type="number" min="0" step="0.01" placeholder="Opcional"> </label>
      </div>
    </div>

    <div v-if="selectedRegime === 'simple'" class="subsection">
      <h3>Ingresos del SIMPLE</h3>
      <div class="tax-checks simple-income-options">
        <label><input v-model="useBudgetIncome" type="radio" :value="true"> Usar ingresos del presupuesto</label>
        <label><input v-model="useBudgetIncome" type="radio" :value="false"> Definir bases por bimestre</label>
      </div>
      <p v-if="budgetIncomeTotal !== null" class="tax-form-help">
        Ingresos detectados en el presupuesto: <strong>{{ moneyFormatter.format(budgetIncomeTotal) }}</strong>
        <span v-if="loadingBudget"> · Actualizando…</span>
      </p>
      <p class="tax-note">SIMPLE se liquida por seis bimestres. No se captura ni se permite una tarifa anual.</p>
      <div v-if="!useBudgetIncome" class="tax-form-grid simple-override-grid">
        <label v-for="period in BIMONTHLY_PERIODS" :key="period.key">
          {{ period.label }}
          <input v-model.number="form[period.key]" type="number" min="0" step="0.01">
        </label>
      </div>
    </div>

    <div class="subsection">
      <label class="tax-notes-field">
        Notas
        <textarea v-model="form.notes" rows="3" maxlength="2000" placeholder="Anota criterios o fuentes de los supuestos."></textarea>
      </label>
    </div>
  </section>
</template>

<style scoped>
.assumptions-card .tax-section-heading { align-items: flex-start; }
.assumptions-card .tax-section-heading p { max-width: 680px; }
.tax-form-help { margin: 12px 0 0; color: var(--color-text-secondary); font-size: 13px; }
.tax-form-help strong { color: var(--color-text-primary); }
.simple-income-options { grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 18px 0 0; padding-top: 0; border-top: 0; }
.simple-income-options label { cursor: pointer; }
.simple-income-options input { width: 16px; height: 16px; margin: 0; accent-color: var(--color-brand); }
.simple-override-grid { margin-top: 18px; }
.tax-notes-field { display: flex; flex-direction: column; gap: 8px; color: var(--color-text-secondary); font-size: 12px; font-weight: 600; }
.tax-notes-field textarea { box-sizing: border-box; width: 100%; resize: vertical; padding: 10px 12px; border: 1px solid var(--color-border-strong); border-radius: 8px; background: var(--color-surface); color: var(--color-text-primary); font: inherit; }
.tax-notes-field textarea:focus { outline: 2px solid var(--color-brand); outline-offset: 2px; }
@media (max-width: 768px) { .simple-income-options { grid-template-columns: 1fr; } }
</style>
