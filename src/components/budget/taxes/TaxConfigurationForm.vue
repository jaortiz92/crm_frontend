<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useBudgetTaxStore } from '@/stores/budgetTaxStore.js'
import { useUserStore } from '@/stores/userStore.js'

defineProps({ idBudget: { type: [String, Number], default: null } })

const store = useBudgetTaxStore()
const userStore = useUserStore()
const canEdit = computed(() => userStore.hasPermission('high') || userStore.hasRole(['Gerente', 'Financiero']))
const selectedProfileId = ref('')
const feedback = ref('')
const feedbackKind = ref('')

const newProfile = () => ({
  profile_name: '',
  tax_year: store.taxYear,
  regime: store.selectedRegime,
  main_municipality_code: '',
  economic_activity_code: '',
  iva_responsible: false,
  withholding_agent: false,
  reteiva_agent: false,
  reteica_agent: false,
  status: 'draft'
})

const form = reactive(newProfile())

const profileId = (profile) => profile?.id_tax_profile ?? profile?.id ?? ''
const profilesForContext = computed(() => store.profiles.filter((profile) => (
  profile.regime === form.regime && Number(profile.tax_year) === Number(form.tax_year)
)))
// Opción 1: el dropdown "Perfil a editar" lista el catálogo COMPLETO (todos
// los años/régimenes), ordenado por año → régimen → nombre. La
// auto-selección sigue prefiriendo el contexto (año/régimen) del formulario.
const REGIME_LABELS = { ordinary: 'Ordinario', simple: 'SIMPLE' }
const STATUS_LABELS = { draft: 'Borrador', active: 'Activo', archived: 'Archivado' }
const allProfiles = computed(() => [...store.profiles].sort((a, b) => (
  (Number(a.tax_year) - Number(b.tax_year))
  || String(a.regime).localeCompare(String(b.regime))
  || String(a.profile_name || '').localeCompare(String(b.profile_name || ''))
)))
function profileLabel(profile) {
  return [
    profile.profile_name || `Perfil ${profileId(profile)}`,
    profile.tax_year,
    REGIME_LABELS[profile.regime] || profile.regime,
    STATUS_LABELS[profileStatus(profile)] || profileStatus(profile)
  ].join(' · ')
}
const isEditing = computed(() => Boolean(selectedProfileId.value))

function profileStatus(profile) {
  if (profile.status) return profile.status
  return profile.is_active === false ? 'archived' : 'active'
}

function profileValues(profile) {
  return {
    profile_name: profile.profile_name || '',
    tax_year: Number(profile.tax_year) || store.taxYear,
    regime: profile.regime || store.selectedRegime,
    // These fallbacks keep the editor readable if an older response is still
    // using the pre-contract names. Payloads always use the backend names.
    main_municipality_code: profile.main_municipality_code ?? profile.municipality ?? '',
    economic_activity_code: profile.economic_activity_code ?? profile.economic_activity ?? '',
    iva_responsible: Boolean(profile.iva_responsible),
    withholding_agent: Boolean(profile.withholding_agent),
    reteiva_agent: Boolean(profile.reteiva_agent),
    reteica_agent: Boolean(profile.reteica_agent),
    status: profileStatus(profile)
  }
}

function setFormFromProfile(profile) {
  Object.assign(form, profileValues(profile))
  selectedProfileId.value = String(profileId(profile))
  store.selectedRegime = form.regime
}

function clearForm({ keepContext = true } = {}) {
  const context = keepContext ? { tax_year: form.tax_year, regime: form.regime } : {}
  Object.assign(form, newProfile(), context)
  selectedProfileId.value = ''
}

function selectActiveOrFirstProfile() {
  const profile = profilesForContext.value.find((item) => profileStatus(item) === 'active')
    || profilesForContext.value[0]

  if (profile) setFormFromProfile(profile)
  else clearForm()
}

function selectProfile() {
  // Opción 1: la búsqueda se hace sobre el catálogo completo, no solo el
  // contexto del formulario, para poder editar perfiles de otro año/régimen.
  const profile = store.profiles.find((item) => String(profileId(item)) === String(selectedProfileId.value))
  if (profile) setFormFromProfile(profile)
  else clearForm()
  feedback.value = ''
}

async function changeContext() {
  const year = Number(form.tax_year)
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return

  selectedProfileId.value = ''
  const loaded = await store.loadConfiguration(year, form.regime)
  if (loaded) selectActiveOrFirstProfile()
}

async function changeRegime() {
  store.selectedRegime = form.regime
  clearForm()
  await changeContext()
}

function loadExample() {
  // Deliberately illustrative values. They are not legal rates or an
  // assertion about the user's actual tax responsibilities.
  Object.assign(form, {
    profile_name: `Perfil demo ${form.tax_year || store.taxYear}`,
    tax_year: Number(form.tax_year) || store.taxYear,
    main_municipality_code: '11001',
    economic_activity_code: '4642',
    status: 'draft',
    iva_responsible: false,
    withholding_agent: false,
    reteiva_agent: false,
    reteica_agent: false
  })
  selectedProfileId.value = ''
  feedbackKind.value = 'info'
  feedback.value = 'Ejemplo demostrativo cargado. Revisa y ajusta las responsabilidades antes de guardar.'
}

function payloadFromForm() {
  return {
    profile_name: form.profile_name.trim(),
    tax_year: Number(form.tax_year),
    regime: form.regime,
    main_municipality_code: form.main_municipality_code.trim() || null,
    economic_activity_code: form.economic_activity_code.trim() || null,
    iva_responsible: Boolean(form.iva_responsible),
    withholding_agent: Boolean(form.withholding_agent),
    reteiva_agent: Boolean(form.reteiva_agent),
    reteica_agent: Boolean(form.reteica_agent),
    status: form.status
  }
}

function errorMessage(value) {
  if (Array.isArray(value)) return value.map((item) => item.msg || item.detail || String(item)).join(' · ')
  if (value && typeof value === 'object') return value.msg || value.detail || 'Revisa los datos del perfil.'
  return value || 'No fue posible guardar el perfil tributario.'
}

async function save() {
  feedback.value = ''
  feedbackKind.value = ''
  const payload = payloadFromForm()

  if (!payload.profile_name) {
    feedbackKind.value = 'error'
    feedback.value = 'El nombre del perfil es obligatorio.'
    return
  }
  if (!Number.isInteger(payload.tax_year) || payload.tax_year < 2000 || payload.tax_year > 2100) {
    feedbackKind.value = 'error'
    feedback.value = 'El año fiscal debe estar entre 2000 y 2100.'
    return
  }

  const result = await store.saveProfile(payload, selectedProfileId.value || null)
  if (!result.ok) {
    feedbackKind.value = 'error'
    feedback.value = errorMessage(result.error?.response?.data?.detail || store.error)
    return
  }

  const savedProfile = result.data
  if (savedProfile) setFormFromProfile(savedProfile)
  feedbackKind.value = result.reloaded === false ? 'warning' : 'success'
  feedback.value = result.reloaded === false
    ? 'Perfil guardado, pero no fue posible recargar la configuración.'
    : 'Perfil tributario guardado y configuración recargada.'
}

watch(() => store.profiles, () => {
  const stillExists = profilesForContext.value.some((profile) => String(profileId(profile)) === String(selectedProfileId.value))
  if (!selectedProfileId.value || !stillExists) selectActiveOrFirstProfile()
}, { deep: true })

// The initial catalog is already loaded by BudgetTaxesView before this form
// is rendered, but this also covers mounting the component in isolation.
selectActiveOrFirstProfile()
</script>

<template>
  <section class="tax-card">
    <div class="tax-section-heading">
      <div>
        <span class="eyebrow">Perfil tributario</span>
        <h2>Configuración de la simulación</h2>
      </div>
      <div class="tax-form-actions">
        <button type="button" class="btn btn-secondary" @click="loadExample">Cargar ejemplo</button>
        <button v-if="canEdit" type="button" class="btn btn-primary" :disabled="store.saving" @click="save">
          {{ store.saving ? 'Guardando…' : isEditing ? 'Actualizar perfil' : 'Guardar perfil' }}
        </button>
      </div>
    </div>

    <div class="tax-warning">
      <strong>Advertencia profesional</strong>
      <span>Esta simulación es presupuestal y debe ser validada por el responsable tributario de la empresa.</span>
    </div>

    <p v-if="feedback" class="tax-feedback" :class="`tax-feedback-${feedbackKind}`" role="status">{{ feedback }}</p>

    <div class="tax-form-grid">
      <label>
        Perfil a editar
        <select v-model="selectedProfileId" @change="selectProfile">
          <option value="">Nuevo perfil</option>
          <option v-for="profile in allProfiles" :key="profileId(profile)" :value="String(profileId(profile))">
            {{ profileLabel(profile) }}
          </option>
        </select>
      </label>
      <label>
        Nombre del perfil
        <input v-model="form.profile_name" placeholder="Ej. Operación principal" maxlength="120">
      </label>
      <label>
        Año fiscal
        <input v-model.number="form.tax_year" type="number" min="2000" max="2100" @change="changeContext">
      </label>
      <label>
        Régimen
        <select v-model="form.regime" @change="changeRegime">
          <option value="ordinary">Ordinario</option>
          <option value="simple">SIMPLE</option>
        </select>
      </label>
      <label>
        Código de municipio principal
        <input v-model="form.main_municipality_code" inputmode="numeric" placeholder="Ej. 11001">
      </label>
      <label>
        Código de actividad económica
        <input v-model="form.economic_activity_code" inputmode="numeric" placeholder="Ej. 4642">
      </label>
      <label>
        Estado del perfil
        <select v-model="form.status">
          <option value="draft">Borrador</option>
          <option value="active">Activo</option>
          <option value="archived">Archivado</option>
        </select>
      </label>
    </div>

    <div class="tax-checks">
      <span class="tax-checks-heading">Responsabilidades configurables</span>
      <label><input v-model="form.iva_responsible" type="checkbox"> Responsable de IVA</label>
      <label><input v-model="form.withholding_agent" type="checkbox"> Agente retenedor</label>
      <label><input v-model="form.reteiva_agent" type="checkbox"> Agente de reteIVA</label>
      <label><input v-model="form.reteica_agent" type="checkbox"> Agente de reteICA</label>
    </div>

    <div class="subsection">
      <h3>{{ form.regime === 'ordinary' ? 'Régimen ordinario' : 'Régimen SIMPLE' }}</h3>
      <p v-if="form.regime === 'ordinary'" class="tax-note">
        Las tarifas y parámetros de cálculo se consultan desde los catálogos y supuestos del backend. Este formulario solo administra el perfil tributario.
      </p>
      <p v-else class="tax-note">
        SIMPLE se calcula por periodos configurados. No se captura una tarifa anual aquí: el backend resuelve el rango y la tarifa aplicable para cada bimestre.
      </p>
    </div>
  </section>
</template>
