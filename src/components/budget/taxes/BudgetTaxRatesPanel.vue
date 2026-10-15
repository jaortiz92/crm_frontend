<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useBudgetTaxStore } from '@/stores/budgetTaxStore.js'
import { useUserStore } from '@/stores/userStore.js'

const store = useBudgetTaxStore()
const userStore = useUserStore()

const canEdit = computed(() => userStore.hasPermission('high') || userStore.hasRole(['Gerente', 'Financiero']))

const TAX_TYPES = [
  { value: 'income_ordinary', label: 'Renta ordinaria' },
  { value: 'simple', label: 'SIMPLE' },
  { value: 'reteiva', label: 'ReteIVA' },
  { value: 'withholding', label: 'Retención en la fuente' },
  { value: 'ica', label: 'ICA' },
  { value: 'reteica', label: 'ReteICA' }
]

const BASE_TYPES = [
  { value: 'net_income', label: 'Ingreso neto' },
  { value: 'gross_income', label: 'Ingreso bruto' },
  { value: 'iva_amount', label: 'Valor de IVA' },
  { value: 'payment_base', label: 'Base de pago' },
  { value: 'fiscal_income', label: 'Ingreso fiscal' }
]

const selectedYear = ref(Number(store.taxYear))
const selectedType = ref('all')
const selectedRegime = ref('all')
const editorOpen = ref(false)
const editingRate = ref(null)
const attempted = ref(false)
const saveError = ref('')
const feedback = ref('')
const feedbackKind = ref('')
const dialogRef = ref(null)

function blankForm() {
  const regime = selectedRegime.value === 'all' ? store.selectedRegime : selectedRegime.value
  return {
    tax_type: selectedType.value === 'all' ? (regime === 'simple' ? 'simple' : 'income_ordinary') : selectedType.value,
    tax_year: selectedYear.value,
    regime,
    economic_activity_code: '',
    municipality_code: '',
    income_min: '',
    income_max: '',
    rate_percent: '',
    fixed_amount: '',
    base_type: 'net_income',
    valid_from: '',
    valid_to: '',
    is_active: true,
    source_note: ''
  }
}

const form = reactive(blankForm())

const visibleRows = computed(() => store.rates
  .filter((row) => Number(row.tax_year) === Number(selectedYear.value))
  .filter((row) => selectedType.value === 'all' || row.tax_type === selectedType.value)
  .filter((row) => selectedRegime.value === 'all' || row.regime === selectedRegime.value || row.regime == null)
  .sort((a, b) => {
    if (a.tax_type !== b.tax_type) return String(a.tax_type).localeCompare(String(b.tax_type), 'es')
    return Number(a.income_min ?? -1) - Number(b.income_min ?? -1)
  }))

const isEdit = computed(() => Boolean(editingRate.value))

function fieldErrors(values) {
  const errors = {}
  const year = Number(values.tax_year)
  const percent = Number(values.rate_percent)
  const min = values.income_min === '' || values.income_min == null ? null : Number(values.income_min)
  const max = values.income_max === '' || values.income_max == null ? null : Number(values.income_max)
  const fixed = values.fixed_amount === '' || values.fixed_amount == null ? null : Number(values.fixed_amount)

  if (!values.tax_type) errors.tax_type = 'El tipo de impuesto es obligatorio.'
  if (!Number.isInteger(year) || year < 2000 || year > 2100) errors.tax_year = 'El año fiscal debe estar entre 2000 y 2100.'
  if (!values.base_type) errors.base_type = 'La base de cálculo es obligatoria.'
  if (values.rate_percent === '' || values.rate_percent == null) errors.rate_percent = 'La tarifa es obligatoria.'
  else if (!Number.isFinite(percent) || percent < 0 || percent > 100) errors.rate_percent = 'La tarifa debe estar entre 0 % y 100 %.'

  if (min !== null && (!Number.isFinite(min) || min < 0)) errors.income_min = 'El ingreso mínimo debe ser un número mayor o igual a cero.'
  if (max !== null && (!Number.isFinite(max) || max < 0)) errors.income_max = 'El ingreso máximo debe ser un número mayor o igual a cero.'
  if (!errors.income_min && !errors.income_max && min !== null && max !== null && max < min) {
    errors.income_max = 'El ingreso máximo no puede ser menor que el mínimo.'
  }
  if (values.tax_type === 'simple' && min === null) errors.income_min = 'SIMPLE requiere un mínimo para cada rango bimestral.'
  if (values.tax_type === 'simple' && max === null) errors.income_max = 'SIMPLE requiere un máximo para cada rango bimestral.'
  if (fixed !== null && (!Number.isFinite(fixed) || fixed < 0)) errors.fixed_amount = 'El valor fijo debe ser mayor o igual a cero.'
  if (values.valid_from && values.valid_to && values.valid_to < values.valid_from) {
    errors.valid_to = 'La fecha final no puede ser anterior a la fecha inicial.'
  }
  return errors
}

const validationErrors = computed(() => fieldErrors(form))
const canSave = computed(() => !Object.keys(validationErrors.value).length && !store.rateSaving)

function fieldMessage(key) {
  if (!attempted.value && !validationErrors.value[key]) return ''
  return validationErrors.value[key] || ''
}

function resetEditor() {
  Object.assign(form, blankForm())
  attempted.value = false
  saveError.value = ''
}

function openCreate() {
  if (!canEdit.value || store.rateSaving) return
  editingRate.value = null
  resetEditor()
  editorOpen.value = true
}

function openEdit(row) {
  if (!canEdit.value || store.rateSaving) return
  editingRate.value = row
  Object.assign(form, {
    tax_type: row.tax_type || 'income_ordinary',
    tax_year: Number(row.tax_year) || selectedYear.value,
    regime: row.regime || 'all',
    economic_activity_code: row.economic_activity_code || '',
    municipality_code: row.municipality_code || '',
    income_min: row.income_min ?? '',
    income_max: row.income_max ?? '',
    // The API stores a fraction (0–1); the form always edits percentage points (0–100).
    rate_percent: Number.isFinite(Number(row.rate)) ? Number(row.rate) * 100 : '',
    fixed_amount: row.fixed_amount ?? '',
    base_type: row.base_type || 'net_income',
    valid_from: row.valid_from || '',
    valid_to: row.valid_to || '',
    is_active: row.is_active !== false,
    source_note: row.source_note || ''
  })
  attempted.value = false
  saveError.value = ''
  editorOpen.value = true
}

function closeEditor() {
  if (store.rateSaving) return
  editorOpen.value = false
  editingRate.value = null
}

function nullableNumber(value) {
  return value === '' || value === null || value === undefined ? null : Number(value)
}

function buildPayload() {
  return {
    tax_type: form.tax_type,
    tax_year: Number(form.tax_year),
    regime: form.regime === 'all' ? null : form.regime,
    economic_activity_code: String(form.economic_activity_code || '').trim() || null,
    municipality_code: String(form.municipality_code || '').trim() || null,
    income_min: nullableNumber(form.income_min),
    income_max: nullableNumber(form.income_max),
    // Never send the visible percentage directly: TaxRate.rate is a fraction.
    rate: Number(form.rate_percent) / 100,
    fixed_amount: nullableNumber(form.fixed_amount),
    base_type: form.base_type,
    valid_from: form.valid_from || null,
    valid_to: form.valid_to || null,
    is_active: form.is_active !== false,
    source_note: String(form.source_note || '').trim() || null
  }
}

function responseMessage(result, fallback) {
  const detail = result?.detail ?? result?.error?.response?.data?.detail
  if (Array.isArray(detail)) return detail.map((item) => item.msg || item.detail || String(item)).join(' · ')
  if (detail && typeof detail === 'object') return detail.msg || detail.detail || fallback
  return detail || fallback
}

async function handleSave() {
  attempted.value = true
  saveError.value = ''
  if (!canSave.value) return

  const payload = buildPayload()
  const result = await store.saveRate(payload, editingRate.value?.id_tax_rate || null)
  if (result.ok) {
    closeEditor()
    feedbackKind.value = result.reloaded === false ? 'warning' : 'success'
    feedback.value = result.reloaded === false
      ? 'Tarifa guardada, pero no fue posible recargar el catálogo.'
      : 'Tarifa guardada y catálogo recargado.'
    return
  }
  saveError.value = responseMessage(result, result.kind === 'forbidden'
    ? 'No tienes permisos para editar tarifas.'
    : 'No fue posible guardar la tarifa. Revisa los datos e inténtalo de nuevo.')
}

async function refreshRates() {
  feedback.value = ''
  store.error = null
  await store.loadRates(Number(selectedYear.value))
}

async function changeYear() {
  const year = Number(selectedYear.value)
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return
  await refreshRates()
}

function taxTypeLabel(value) {
  return TAX_TYPES.find((item) => item.value === value)?.label || value || 'Sin configurar'
}

function regimeLabel(value) {
  return value === 'simple' ? 'SIMPLE' : value === 'ordinary' ? 'Ordinario' : 'Compartido'
}

function baseTypeLabel(value) {
  return BASE_TYPES.find((item) => item.value === value)?.label || value || 'Sin configurar'
}

function formatPercent(value) {
  const percent = Number(value) * 100
  if (!Number.isFinite(percent)) return '—'
  return `${percent.toLocaleString('es-CO', { maximumFractionDigits: 2 })} %`
}

function formatAmount(value) {
  if (value === null || value === undefined || value === '') return '—'
  const amount = Number(value)
  return Number.isFinite(amount) ? amount.toLocaleString('es-CO', { maximumFractionDigits: 2 }) : '—'
}

function rangeLabel(row) {
  if (row.tax_type !== 'simple' && row.income_min == null && row.income_max == null) return 'Base general'
  const min = row.income_min == null ? 'Sin límite' : formatAmount(row.income_min)
  const max = row.income_max == null ? 'Sin límite' : formatAmount(row.income_max)
  return `${min} — ${max}`
}

function statusLabel(row) {
  if (row.is_active === false) return 'Inactiva'
  if (row.valid_to && String(row.valid_to) < new Date().toISOString().slice(0, 10)) return 'Vencida'
  return 'Activa'
}

function onOverlayMousedown(event) {
  if (event.target === event.currentTarget) closeEditor()
}

function onGlobalKeydown(event) {
  if (editorOpen.value && event.key === 'Escape') closeEditor()
}

watch(editorOpen, async (open) => {
  if (open) {
    await nextTick()
    dialogRef.value?.focus()
  }
})

watch(() => form.tax_type, (value) => {
  if (value === 'simple') form.regime = 'simple'
})

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown)
})

onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKeydown))
</script>

<template>
  <section class="tax-card rate-catalog-card">
    <div class="tax-section-heading">
      <div>
        <span class="eyebrow">Catálogo tributario</span>
        <h2>Tarifas por impuesto y vigencia</h2>
        <p class="tax-note">Administra las filas que el motor usa para resolver la tarifa aplicable.</p>
      </div>
      <div class="tax-form-actions">
        <button type="button" class="btn btn-secondary" :disabled="store.ratesLoading" @click="refreshRates">
          {{ store.ratesLoading ? 'Cargando…' : 'Actualizar' }}
        </button>
        <button v-if="canEdit" type="button" class="btn btn-primary" :disabled="store.rateSaving" @click="openCreate">
          Nueva tarifa / rango
        </button>
      </div>
    </div>

    <div class="tax-warning rate-percent-warning">
      <strong>Porcentajes seguros</strong>
      <span>La tarifa se muestra como porcentaje (por ejemplo, 35 %) y se envía al backend como decimal (0.35).</span>
    </div>

    <div class="rate-toolbar">
      <label>Año fiscal<input v-model.number="selectedYear" type="number" min="2000" max="2100" :disabled="store.ratesLoading" @change="changeYear"></label>
      <label>Tipo de impuesto<select v-model="selectedType"><option value="all">Todos</option><option v-for="type in TAX_TYPES" :key="type.value" :value="type.value">{{ type.label }}</option></select></label>
      <label>Régimen visible<select v-model="selectedRegime"><option value="all">Todos</option><option value="ordinary">Ordinario</option><option value="simple">SIMPLE</option></select></label>
      <span v-if="!canEdit" class="rate-readonly">Vista de solo lectura</span>
    </div>

    <p v-if="feedback" class="tax-feedback" :class="`tax-feedback-${feedbackKind}`" role="status">{{ feedback }}</p>
    <div v-if="store.error && !store.ratesLoading" class="rate-error" role="alert">
      <strong>No fue posible cargar las tarifas.</strong><span>{{ responseMessage({ detail: store.error }, 'Revisa la conexión e inténtalo de nuevo.') }}</span>
      <button type="button" class="btn btn-secondary" @click="refreshRates">Reintentar</button>
    </div>
    <div v-else-if="store.ratesLoading" class="rate-loading" aria-live="polite">Cargando tarifas…</div>
    <div v-else-if="!visibleRows.length" class="tax-empty">
      <strong>Sin tarifas para este filtro</strong>
      <span>{{ canEdit ? 'Crea una tarifa validada por tu responsable tributario.' : 'Solicita a un usuario autorizado que configure el catálogo.' }}</span>
    </div>
    <div v-else class="table-wrap">
      <table class="crm-table rate-table">
        <caption class="sr-only">Tarifas tributarias del año {{ selectedYear }}</caption>
        <thead><tr><th>Impuesto</th><th>Régimen</th><th>Rango de ingresos</th><th>Tarifa</th><th>Valor fijo</th><th>Base</th><th>Vigencia</th><th>Estado</th><th v-if="canEdit">Acciones</th></tr></thead>
        <tbody>
          <tr v-for="row in visibleRows" :key="row.id_tax_rate">
            <td>{{ taxTypeLabel(row.tax_type) }}</td>
            <td>{{ regimeLabel(row.regime) }}</td>
            <td class="rate-range" :class="{ 'simple-range': row.tax_type === 'simple' }">
              <strong v-if="row.tax_type === 'simple'">Rango bimestral</strong>
              {{ rangeLabel(row) }}
            </td>
            <td class="rate-percent">{{ formatPercent(row.rate) }}</td>
            <td>{{ formatAmount(row.fixed_amount) }}</td>
            <td>{{ baseTypeLabel(row.base_type) }}</td>
            <td>{{ row.valid_from || 'Sin inicio' }}<br><span class="rate-muted">{{ row.valid_to || 'Sin fin' }}</span></td>
            <td><span class="status-pill" :class="{ warning: statusLabel(row) !== 'Activa' }">{{ statusLabel(row) }}</span></td>
            <td v-if="canEdit"><button type="button" class="rate-edit-button" :disabled="store.rateSaving" @click="openEdit(row)">Editar</button></td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="tax-note"><strong>SIMPLE:</strong> cada fila representa un rango de ingresos; el backend selecciona la tarifa aplicable por bimestre según la base y la vigencia. No se captura una tarifa anual única.</p>

    <div v-if="editorOpen" class="rate-overlay" @mousedown="onOverlayMousedown">
      <div ref="dialogRef" class="rate-dialog" role="dialog" aria-modal="true" aria-labelledby="rate-editor-title" tabindex="-1">
        <header class="rate-dialog-header">
          <div><h3 id="rate-editor-title">{{ isEdit ? 'Editar tarifa tributaria' : 'Nueva tarifa tributaria' }}</h3><p>Los valores deben ser validados por el responsable tributario antes de activarlos.</p></div>
          <button type="button" class="rate-close" :disabled="store.rateSaving" aria-label="Cerrar ventana" @click="closeEditor">×</button>
        </header>
        <form class="rate-dialog-form" @submit.prevent="handleSave">
          <div class="rate-form-grid">
            <label>Tipo de impuesto<select v-model="form.tax_type" :disabled="store.rateSaving"><option v-for="type in TAX_TYPES" :key="type.value" :value="type.value">{{ type.label }}</option></select><span v-if="fieldMessage('tax_type')" class="rate-field-error">{{ fieldMessage('tax_type') }}</span></label>
            <label>Año fiscal<input v-model.number="form.tax_year" type="number" min="2000" max="2100" :disabled="store.rateSaving"><span v-if="fieldMessage('tax_year')" class="rate-field-error">{{ fieldMessage('tax_year') }}</span></label>
            <label>Régimen<select v-model="form.regime" :disabled="form.tax_type === 'simple' || store.rateSaving"><option value="all">Compartido</option><option value="ordinary">Ordinario</option><option value="simple">SIMPLE</option></select><small>Puede ser compartida si no aplica a un régimen específico.</small></label>
            <label>Base de cálculo<select v-model="form.base_type" :disabled="store.rateSaving"><option value="">Selecciona una base</option><option v-for="base in BASE_TYPES" :key="base.value" :value="base.value">{{ base.label }}</option></select><span v-if="fieldMessage('base_type')" class="rate-field-error">{{ fieldMessage('base_type') }}</span></label>
            <label>Código de actividad económica<input v-model="form.economic_activity_code" maxlength="30" placeholder="Opcional" :disabled="store.rateSaving"></label>
            <label>Código de municipio<input v-model="form.municipality_code" maxlength="30" placeholder="Opcional" :disabled="store.rateSaving"></label>
          </div>

          <div class="rate-range-block">
            <div><h4>{{ form.tax_type === 'simple' ? 'Rango de ingresos SIMPLE' : 'Rango de ingresos (opcional)' }}</h4><p>{{ form.tax_type === 'simple' ? 'Crea una fila por cada rango. El motor lo resolverá por bimestre; no es una tarifa anual.' : 'Déjalo vacío para una tarifa de base general.' }}</p></div>
            <div class="rate-form-grid rate-form-grid-2">
              <label>Ingreso mínimo<input v-model="form.income_min" type="number" min="0" step="0.01" placeholder="Ej. 0" :disabled="store.rateSaving"><span v-if="fieldMessage('income_min')" class="rate-field-error">{{ fieldMessage('income_min') }}</span></label>
              <label>Ingreso máximo<input v-model="form.income_max" type="number" min="0" step="0.01" placeholder="Ej. 10000000" :disabled="store.rateSaving"><span v-if="fieldMessage('income_max')" class="rate-field-error">{{ fieldMessage('income_max') }}</span></label>
            </div>
          </div>

          <div class="rate-form-grid rate-form-grid-2">
            <label>Tarifa (%)<input v-model="form.rate_percent" type="number" min="0" max="100" step="0.01" placeholder="Ej. 35" :disabled="store.rateSaving"><small>Escribe 35 para 35 %. Nunca se enviará como 35: se convertirá a 0.35.</small><span v-if="fieldMessage('rate_percent')" class="rate-field-error">{{ fieldMessage('rate_percent') }}</span></label>
            <label>Valor fijo<input v-model="form.fixed_amount" type="number" min="0" step="0.01" placeholder="Opcional" :disabled="store.rateSaving"><span v-if="fieldMessage('fixed_amount')" class="rate-field-error">{{ fieldMessage('fixed_amount') }}</span></label>
            <label>Vigencia desde<input v-model="form.valid_from" type="date" :disabled="store.rateSaving"></label>
            <label>Vigencia hasta<input v-model="form.valid_to" type="date" :disabled="store.rateSaving"><span v-if="fieldMessage('valid_to')" class="rate-field-error">{{ fieldMessage('valid_to') }}</span></label>
          </div>
          <label class="rate-notes-label">Fuente / nota<textarea v-model="form.source_note" maxlength="1000" rows="3" placeholder="Indica la fuente que debe validar el contador; no se presume información oficial." :disabled="store.rateSaving"></textarea></label>
          <label class="rate-check"><input v-model="form.is_active" type="checkbox" :disabled="store.rateSaving"> Tarifa activa</label>
          <p v-if="saveError" class="rate-error" role="alert">{{ saveError }}</p>
          <footer class="rate-dialog-footer"><button type="button" class="btn btn-secondary" :disabled="store.rateSaving" @click="closeEditor">Cancelar</button><button type="submit" class="btn btn-primary" :disabled="!canSave">{{ store.rateSaving ? 'Guardando…' : 'Guardar tarifa' }}</button></footer>
        </form>
      </div>
    </div>
  </section>
</template>

<style scoped>
.rate-catalog-card { position: relative; }
.rate-percent-warning { margin-top: 0; }
.rate-toolbar { display: flex; flex-wrap: wrap; align-items: end; gap: 16px; padding: 14px 16px; margin-bottom: 18px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-surface); }
.rate-toolbar label { display: flex; flex-direction: column; gap: 6px; color: var(--color-text-secondary); font-size: 12px; font-weight: 600; }
.rate-toolbar input, .rate-toolbar select { box-sizing: border-box; width: 150px; margin: 0; padding: 8px 10px; border: 1px solid var(--color-border-strong); border-radius: 7px; background: var(--color-surface-card); color: var(--color-text-primary); font: inherit; }
.rate-toolbar input:focus, .rate-toolbar select:focus, .rate-dialog input:focus, .rate-dialog select:focus, .rate-dialog textarea:focus { outline: 2px solid var(--color-brand); outline-offset: 2px; }
.rate-readonly { margin-left: auto; color: var(--color-text-tertiary); font-size: 12px; }
.rate-table { min-width: 1160px !important; }
.rate-table td, .rate-table th { vertical-align: middle; }
.rate-percent { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.rate-range { min-width: 160px; font-variant-numeric: tabular-nums; }
.rate-range strong { display: block; margin-bottom: 3px; color: var(--color-brand); font-size: 11px; }
.rate-range.simple-range { border-left: 3px solid var(--color-brand); }
.rate-muted { color: var(--color-text-tertiary); font-size: 11px; }
.rate-edit-button { padding: 6px 10px; border: 1px solid var(--color-border-strong); border-radius: 6px; background: var(--color-surface); color: var(--color-brand); cursor: pointer; font: inherit; font-size: 12px; font-weight: 600; }
.rate-edit-button:hover:not(:disabled) { background: var(--color-brand-light); }
.rate-loading, .rate-error { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 16px; border: 1px solid var(--color-border); border-radius: 8px; color: var(--color-text-secondary); font-size: 13px; line-height: 1.5; }
.rate-error { border-color: color-mix(in srgb, var(--color-danger) 45%, transparent); color: var(--color-danger); }
.rate-error strong { margin-right: 4px; }
.rate-overlay { position: fixed; inset: 0; z-index: 1200; display: flex; align-items: center; justify-content: center; padding: 16px; background: var(--background-transparency, rgba(7, 7, 7, .55)); }
.rate-dialog { display: flex; flex-direction: column; width: min(820px, 97vw); max-height: min(92vh, 900px); overflow: hidden; border: 1px solid var(--color-border); border-radius: 10px; background: var(--color-surface-card); color: var(--color-text-primary); box-shadow: 0 12px 32px rgba(0, 0, 0, .22); animation: rate-pop .2s cubic-bezier(.23, 1, .32, 1); }
@keyframes rate-pop { from { opacity: 0; transform: scale(.97) translateY(6px); } to { opacity: 1; transform: scale(1) translateY(0); } }
.rate-dialog-header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; padding: 18px 20px 14px; border-bottom: 1px solid var(--color-border); }
.rate-dialog-header h3 { margin: 0 0 4px; font-size: 18px; font-weight: 600; }
.rate-dialog-header p { margin: 0; color: var(--color-text-secondary); font-size: 12px; line-height: 1.45; }
.rate-close { flex: 0 0 auto; padding: 4px 8px; border: 0; border-radius: 6px; background: transparent; color: var(--color-text-secondary); cursor: pointer; font-size: 22px; line-height: 1; }
.rate-close:hover:not(:disabled) { background: var(--color-brand-light); color: var(--color-text-primary); }
.rate-dialog-form { display: flex; flex-direction: column; gap: 16px; width: auto; min-width: 0; min-height: 0; margin: 0; padding: 18px 20px 0; overflow-y: auto; border: 0; border-radius: 0; }
.rate-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 16px; }
.rate-form-grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.rate-form-grid label, .rate-notes-label { display: flex; flex-direction: column; gap: 6px; color: var(--color-text-secondary); font-size: 12px; font-weight: 600; }
.rate-dialog input, .rate-dialog select, .rate-dialog textarea { box-sizing: border-box; width: 100%; min-width: 0; margin: 0; padding: 8px 10px; border: 1px solid var(--color-border-strong); border-radius: 7px; background: var(--color-surface); color: var(--color-text-primary); font: inherit; }
.rate-dialog small { color: var(--color-text-tertiary); font-size: 11px; font-weight: 400; line-height: 1.4; }
.rate-field-error { color: var(--color-danger); font-size: 11px; font-weight: 600; line-height: 1.35; }
.rate-range-block { display: flex; flex-direction: column; gap: 12px; padding: 14px 16px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-surface); }
.rate-range-block h4 { margin: 0 0 3px; color: var(--color-text-primary); font-size: 14px; }
.rate-range-block p { margin: 0; color: var(--color-text-tertiary); font-size: 12px; line-height: 1.4; }
.rate-notes-label textarea { resize: vertical; }
.rate-check { display: flex; align-items: center; gap: 8px; color: var(--color-text-secondary); font-size: 13px; }
.rate-check input { width: 16px; height: 16px; margin: 0; accent-color: var(--color-brand); }
.rate-dialog-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 0; border-top: 1px solid var(--color-border); background: var(--color-surface-card); }
@media (prefers-reduced-motion: reduce) { .rate-dialog { animation: none; } }
@media (max-width: 760px) { .rate-readonly { margin-left: 0; } .rate-form-grid, .rate-form-grid-2 { grid-template-columns: 1fr; } .rate-dialog { max-height: 94vh; } }
</style>
