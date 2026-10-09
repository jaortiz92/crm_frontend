<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { budgetFinancingCreditService, classifyFinancingCreditError } from '@/services/budgetFinancingCreditService.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  credit: { type: Object, default: null },
  costCenters: { type: Array, default: () => [] },
  canEdit: { type: Boolean, default: false }
})
const emit = defineEmits(['close', 'saved'])

const blankForm = () => ({
  name: '',
  lender_name: '',
  credit_type: '',
  origin_type: '',
  id_cost_center: '',
  method: '',
  currency: 'COP',
  disbursement_date: '',
  original_principal: '',
  cutoff_date: '',
  opening_balance: '',
  annual_rate_percent: '',
  rate_convention: '',
  term_installments: '',
  first_due_date: '',
  insurance_per_installment: ''
})

const form = reactive(blankForm())
const preview = ref(null)
const previewing = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const fieldErrors = ref({})
const activeFieldError = computed(() => (name) => fieldErrors.value[name] || '')
const dialogElement = ref(null)
let previouslyFocused = null
const sortedCostCenters = computed(() =>
  [...props.costCenters].sort((a, b) =>
    String(a.cost_center_code ?? '').localeCompare(String(b.cost_center_code ?? ''), 'es')
  )
)
const installments = computed(() => {
  const data = preview.value
  if (Array.isArray(data?.installments)) return data.installments
  if (Array.isArray(data?.schedule)) return data.schedule
  return []
})
const previewAvailable = computed(() => Boolean(preview.value) && installments.value.length > 0)
const isLegacy = computed(() => form.origin_type === 'legacy')
const isNewCreation = computed(() => !props.credit && form.origin_type === 'new')

function rateToApi(percent) {
  const value = String(percent).trim().replace(',', '.')
  const [whole = '0', decimal = ''] = value.split('.')
  const digits = `${whole || '0'}${decimal}` || '0'
  const shiftedPoint = (whole || '0').length - 2
  if (shiftedPoint <= 0) return `0.${'0'.repeat(-shiftedPoint)}${digits}`
  if (shiftedPoint >= digits.length) return `${digits}${'0'.repeat(shiftedPoint - digits.length)}`
  return `${digits.slice(0, shiftedPoint)}.${digits.slice(shiftedPoint)}`
}

function rateFromApi(rate) {
  if (rate === null || rate === undefined || rate === '') return ''
  const [whole = '0', decimal = ''] = String(rate).replace(',', '.').split('.')
  const digits = `${whole}${decimal}`
  const point = whole.length + 2
  if (point >= digits.length) return `${digits}${'0'.repeat(point - digits.length)}`.replace(/^0+(?=\d)/, '')
  return `${digits.slice(0, point).replace(/^0+(?=\d)/, '')}.${digits.slice(point)}`
}

function setFromCredit(credit) {
  Object.assign(form, blankForm())
  if (!credit) return
  Object.assign(form, {
    name: credit.name ?? '',
    lender_name: credit.lender_name ?? '',
    credit_type: credit.credit_type ?? '',
    origin_type: credit.origin_type ?? '',
    id_cost_center: credit.id_cost_center == null ? '' : String(credit.id_cost_center),
    method: credit.method ?? '',
    currency: credit.currency ?? 'COP',
    disbursement_date: credit.disbursement_date ?? '',
    original_principal: credit.original_principal ?? '',
    cutoff_date: credit.cutoff_date ?? '',
    opening_balance: credit.opening_balance ?? '',
    annual_rate_percent: rateFromApi(credit.annual_rate),
    rate_convention: credit.rate_convention ?? '',
    term_installments: credit.term_installments ?? '',
    first_due_date: credit.first_due_date ?? '',
    insurance_per_installment: credit.insurance_per_installment ?? ''
  })
}

watch(
  () => [props.open, props.credit],
  ([open, credit]) => {
    if (open) {
      setFromCredit(credit)
      preview.value = null
      errorMessage.value = ''
      fieldErrors.value = {}
    }
  },
  { immediate: true }
)

watch(
  form,
  () => {
    preview.value = null
    errorMessage.value = ''
    fieldErrors.value = {}
  },
  { deep: true }
)

function onDialogKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }
  if (event.key !== 'Tab' || !dialogElement.value) return
  const focusable = [...dialogElement.value.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')]
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      previouslyFocused = document.activeElement
      await nextTick()
      dialogElement.value?.querySelector('input, select, button')?.focus()
      document.addEventListener('keydown', onDialogKeydown)
    } else {
      document.removeEventListener('keydown', onDialogKeydown)
      previouslyFocused?.focus?.()
    }
  }
)

onBeforeUnmount(() => document.removeEventListener('keydown', onDialogKeydown))

function makePayload() {
  const amountString = (value) => String(value).trim().replace(',', '.')
  const payload = {
    name: form.name.trim(),
    lender_name: form.lender_name.trim(),
    credit_type: form.credit_type.trim() || null,
    origin_type: form.origin_type,
    id_cost_center: form.id_cost_center ? Number(form.id_cost_center) : null,
    method: form.method,
    currency: 'COP',
    frequency: 'monthly',
    opening_balance: amountString(form.origin_type === 'new' ? form.original_principal : form.opening_balance),
    annual_rate: rateToApi(form.annual_rate_percent),
    rate_convention: form.rate_convention,
    day_count_convention: 'monthly_periodic',
    term_installments: String(form.term_installments).trim(),
    insurance_per_installment: amountString(form.insurance_per_installment)
  }
  if (form.origin_type === 'legacy') {
    payload.first_due_date = form.first_due_date
  }
  if (form.origin_type === 'new') {
    payload.disbursement_date = form.disbursement_date
    payload.original_principal = amountString(form.original_principal)
  } else if (form.origin_type === 'legacy') {
    payload.cutoff_date = form.cutoff_date
  }
  return payload
}

function makeUpdatePayload(payload) {
  const updatePayload = { ...payload }
  delete updatePayload.origin_type
  delete updatePayload.currency
  return updatePayload
}

function validate() {
  const errors = {}
  if (!form.name.trim()) errors.name = 'El nombre o referencia es obligatorio.'
  if (!form.lender_name.trim()) errors.lender_name = 'El acreedor es obligatorio.'
  if (!form.id_cost_center) errors.id_cost_center = 'Seleccione el centro de costo.'
  if (!form.origin_type) errors.origin_type = 'Seleccione si es nuevo o antiguo.'
  if (!form.method) errors.method = 'Seleccione un método de amortización.'
  if (isLegacy.value && (!form.opening_balance || !/^\d+(?:[.,]\d{1,2})?$/.test(form.opening_balance) || !/[1-9]/.test(form.opening_balance)))
    errors.opening_balance = 'Ingrese un saldo de capital positivo en COP.'
  if (!form.annual_rate_percent || !/^\d+(?:[.,]\d{1,4})?$/.test(form.annual_rate_percent))
    errors.annual_rate_percent = 'Ingrese la tasa anual explícitamente como porcentaje.'
  if (!form.rate_convention) errors.rate_convention = 'Seleccione la convención de tasa.'
  if (!/^\d+$/.test(String(form.term_installments)) || String(form.term_installments) === '0')
    errors.term_installments = 'Ingrese una cantidad entera positiva de cuotas.'
  if (isLegacy.value && !form.first_due_date)
    errors.first_due_date = 'La próxima fecha de vencimiento es obligatoria.'
  if (!form.insurance_per_installment || !/^\d+(?:[.,]\d{1,2})?$/.test(form.insurance_per_installment))
    errors.insurance_per_installment = 'Ingrese un monto COP o cero si el backend lo permite.'
  if (isLegacy.value) {
    if (!form.cutoff_date) errors.cutoff_date = 'La fecha de corte es obligatoria.'
    if (form.cutoff_date && form.first_due_date && form.first_due_date <= form.cutoff_date)
      errors.first_due_date = 'La próxima fecha de vencimiento debe ser posterior a la fecha de corte.'
  } else if (form.origin_type === 'new') {
    if (!form.disbursement_date) errors.disbursement_date = 'La fecha de desembolso es obligatoria.'
    if (!form.original_principal || !/^\d+(?:[.,]\d{1,2})?$/.test(form.original_principal) || !/[1-9]/.test(form.original_principal))
      errors.original_principal = 'Ingrese un principal desembolsado positivo en COP.'
  }
  if (Object.keys(errors).length) {
    fieldErrors.value = errors
    errorMessage.value = 'Revise los campos obligatorios antes de continuar.'
    return false
  }
  return true
}

async function requestPreview() {
  if (previewing.value || saving.value || !validate()) return
  previewing.value = true
  preview.value = null
  errorMessage.value = ''
  const requestPayload = makePayload()
  const requestSignature = JSON.stringify(requestPayload)
  try {
    const response = await budgetFinancingCreditService.previewFinancingCredit(requestPayload)
    if (requestSignature !== JSON.stringify(makePayload())) {
      errorMessage.value = 'Las condiciones cambiaron durante la previsualización. Solicite una nueva preview.'
      return
    }
    preview.value = response?.data ?? null
    if (!installments.value.length) {
      errorMessage.value = 'El backend no devolvió cuotas para la previsualización.'
      preview.value = null
    }
  } catch (error) {
    const result = classifyFinancingCreditError(error)
    setRequestError(result)
  } finally {
    previewing.value = false
  }
}

async function saveCredit() {
  if (!previewAvailable.value || saving.value || !props.canEdit) return
  saving.value = true
  errorMessage.value = ''
  try {
    const payload = makePayload()
    if (props.credit) {
      await budgetFinancingCreditService.updateFinancingCredit(
        props.credit.id_financing_credit,
        makeUpdatePayload(payload)
      )
    } else {
      await budgetFinancingCreditService.createFinancingCredit(payload)
    }
    emit('saved')
    emit('close')
  } catch (error) {
    const result = classifyFinancingCreditError(error)
    setRequestError(result)
    if (result.kind === 'conflict') preview.value = null
  } finally {
    saving.value = false
  }
}

function formatCOP(value) {
  if (value === null || value === undefined || value === '') return '—'
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)
}

function dateLabel(value) {
  if (!value) return '—'
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? String(value) : new Intl.DateTimeFormat('es-CO').format(parsed)
}

function pick(item, ...keys) {
  for (const key of keys) if (item?.[key] !== undefined && item?.[key] !== null) return item[key]
  return null
}

function pickTotal(...keys) {
  return pick(preview.value?.totals, ...keys)
}

function setRequestError(result) {
  errorMessage.value = result.message
  const fieldMap = { annual_rate: 'annual_rate_percent', id_cost_center: 'id_cost_center' }
  const field = fieldMap[result.field] || result.field
  if (field) fieldErrors.value = { [field]: result.message }
}

function close() {
  if (saving.value || previewing.value) return
  emit('close')
}
</script>

<template>
  <div v-if="open" class="fin-overlay" @mousedown.self="close">
    <section ref="dialogElement" class="fin-dialog" role="dialog" aria-modal="true" aria-labelledby="fin-form-title">
      <header class="fin-header">
        <div>
          <h2 id="fin-form-title">{{ credit ? 'Editar financiación empresarial' : 'Nuevo crédito de financiación' }}</h2>
          <p>Las condiciones financieras se validan y proyectan exclusivamente en el backend.</p>
        </div>
        <button type="button" class="fin-close" aria-label="Cerrar" :disabled="saving || previewing" @click="close">×</button>
      </header>

      <div class="fin-body">
        <div class="fin-pending" role="note">
          <strong>Convenciones y decisiones pendientes</strong>
          <p>La frecuencia mensual y la convención monthly-periodic son defaults del sistema para v1. La convención de tasa (nominal o efectiva) debe elegirse explícitamente. Regla del seguro por confirmar; calendario y días inhábiles por confirmar; solo proyección, sin registro de pagos reales. Importación masiva, abonos anticipados, gracia, tasa variable y reestructuración fuera de alcance.</p>
        </div>

        <fieldset class="fin-grid fin-fields" :disabled="previewing || saving">
          <label class="fin-field"><span>Nombre o referencia *</span><input v-model="form.name" :aria-invalid="Boolean(activeFieldError('name'))" /><small v-if="activeFieldError('name')">{{ activeFieldError('name') }}</small></label>
          <label class="fin-field"><span>Acreedor *</span><input v-model="form.lender_name" :aria-invalid="Boolean(activeFieldError('lender_name'))" /><small v-if="activeFieldError('lender_name')">{{ activeFieldError('lender_name') }}</small></label>
          <label class="fin-field"><span>Tipo de crédito (opcional)</span><input v-model="form.credit_type" /></label>
          <label class="fin-field"><span>Origen *</span><select v-model="form.origin_type" :disabled="Boolean(credit)"><option value="">Seleccione…</option><option value="new">Nuevo</option><option value="legacy">Antiguo — desde corte</option></select><small v-if="activeFieldError('origin_type')">{{ activeFieldError('origin_type') }}</small></label>
          <label class="fin-field"><span>Centro de costo (CECO) *</span><select v-model="form.id_cost_center" :aria-invalid="Boolean(activeFieldError('id_cost_center'))"><option value="">Seleccione…</option><option v-for="center in sortedCostCenters" :key="center.id_cost_center" :value="String(center.id_cost_center)">{{ center.cost_center_code }} — {{ center.cost_center_name }}</option></select><small v-if="activeFieldError('id_cost_center')">{{ activeFieldError('id_cost_center') }}</small><small>Destino presupuestario de interés y seguro; capital es financiación.</small></label>
          <label class="fin-field"><span>Método de amortización *</span><select v-model="form.method"><option value="">Seleccione…</option><option value="french_fixed_payment">Cuota fija (francés)</option><option value="german_fixed_principal">Capital fijo (alemán)</option></select><small v-if="activeFieldError('method')">{{ activeFieldError('method') }}</small><small>Francés: importe financiero normalmente estable. Alemán: capital fijo y cuota financiera normalmente decreciente. Seguro aparte.</small></label>

          <label v-if="form.origin_type === 'new'" class="fin-field"><span>Fecha de desembolso *</span><input v-model="form.disbursement_date" type="date" :aria-invalid="Boolean(activeFieldError('disbursement_date'))" /><small v-if="activeFieldError('disbursement_date')">{{ activeFieldError('disbursement_date') }}</small></label>
          <label v-if="form.origin_type === 'new'" class="fin-field"><span>Principal desembolsado (COP) *</span><input v-model="form.original_principal" inputmode="decimal" placeholder="Ej. 1200000.00" :aria-invalid="Boolean(activeFieldError('original_principal'))" /><small v-if="activeFieldError('original_principal')">{{ activeFieldError('original_principal') }}</small></label>
          <label v-if="isLegacy" class="fin-field"><span>Fecha de corte *</span><input v-model="form.cutoff_date" type="date" :aria-invalid="Boolean(activeFieldError('cutoff_date'))" /><small v-if="activeFieldError('cutoff_date')">{{ activeFieldError('cutoff_date') }}</small></label>
          <label v-if="isLegacy" class="fin-field"><span>Saldo de capital pendiente (COP) *</span><input v-model="form.opening_balance" inputmode="decimal" placeholder="COP" :aria-invalid="Boolean(activeFieldError('opening_balance'))" /><small v-if="activeFieldError('opening_balance')">{{ activeFieldError('opening_balance') }}</small></label>
          <label class="fin-field"><span>Tasa anual (%) *</span><input v-model="form.annual_rate_percent" inputmode="decimal" placeholder="Ej. 18 para 18%" :aria-invalid="Boolean(activeFieldError('annual_rate_percent'))" /><small>Se enviará al backend como fracción (18% → 0.18).</small><small v-if="activeFieldError('annual_rate_percent')">{{ activeFieldError('annual_rate_percent') }}</small></label>
          <label class="fin-field"><span>Convención de tasa *</span><select v-model="form.rate_convention" :aria-invalid="Boolean(activeFieldError('rate_convention'))"><option value="">Seleccione explícitamente…</option><option value="nominal_annual">Nominal anual (pendiente de aprobación)</option><option value="effective_annual">Efectiva anual (pendiente de aprobación)</option></select><small v-if="activeFieldError('rate_convention')">{{ activeFieldError('rate_convention') }}</small></label>
          <label class="fin-field"><span>Cuotas restantes *</span><input v-model="form.term_installments" inputmode="numeric" placeholder="Entero positivo" :aria-invalid="Boolean(activeFieldError('term_installments'))" /><small v-if="activeFieldError('term_installments')">{{ activeFieldError('term_installments') }}</small></label>
          <label v-if="isLegacy" class="fin-field"><span>Próxima fecha de vencimiento *</span><input v-model="form.first_due_date" type="date" :aria-invalid="Boolean(activeFieldError('first_due_date'))" /><small v-if="activeFieldError('first_due_date')">{{ activeFieldError('first_due_date') }}</small></label>
          <label class="fin-field"><span>Seguro por cuota (COP) — regla provisional *</span><input v-model="form.insurance_per_installment" inputmode="decimal" placeholder="Indique un monto; 0 solo si BE lo permite" :aria-invalid="Boolean(activeFieldError('insurance_per_installment'))" /><small>No hay un valor predeterminado. Regla fija provisional; cero solo se envía si el backend lo permite.</small><small v-if="activeFieldError('insurance_per_installment')">{{ activeFieldError('insurance_per_installment') }}</small></label>
        </fieldset>

        <p class="fin-note" role="note">Frecuencia mensual y convención monthly-periodic: defaults del sistema para v1. No se calculan fechas ni cuotas en esta pantalla.</p>
        <p v-if="isLegacy" class="fin-warning" role="note">El saldo ingresado corresponde a la fecha de corte. El calendario comienza después de esa fecha; no se reconstruyen cuotas anteriores ni se enlaza con un libro de pagos.</p>
        <p class="fin-note">Capital es una salida de financiación, no un gasto P&amp;L. Interés y seguro son gastos presupuestarios y también se incluyen en el flujo de caja.</p>
        <div v-if="errorMessage" class="fin-error" role="alert" aria-live="polite">{{ errorMessage }}</div>
        <div v-if="previewing" class="fin-preview-loading" role="status" aria-live="polite"><span class="fin-spinner" aria-hidden="true"></span>El backend está generando la previsualización. No se mostrarán cuotas hasta recibir la respuesta.</div>

        <section v-if="previewAvailable" class="fin-preview" aria-live="polite">
          <h3>Previsualización del backend · {{ form.method === 'french_fixed_payment' ? 'Cuota fija (francés)' : 'Capital fijo (alemán)' }} · CECO #{{ form.id_cost_center }}</h3>
          <p>Los importes siguientes provienen del backend; no se calculan ni estiman en esta pantalla.</p>
          <p v-if="isNewCreation" class="fin-note">Primera fecha de vencimiento derivada por el backend: <strong>{{ dateLabel(preview.conditions?.first_due_date) }}</strong></p>
          <div class="fin-table-scroll">
            <table aria-label="Previsualización del calendario de financiación">
              <thead><tr><th scope="col">Cuota</th><th scope="col">Vencimiento capital</th><th scope="col">Capital (financiación)</th><th scope="col">Vencimiento interés</th><th scope="col">Interés (gasto)</th><th scope="col">Vencimiento seguro</th><th scope="col">Seguro (gasto)</th><th scope="col">Saldo después</th></tr></thead>
              <tbody><tr v-for="(item, index) in installments" :key="pick(item, 'installment_number', 'number') ?? index">
                <td>{{ pick(item, 'installment_number', 'number') ?? '—' }}</td>
                <td>{{ dateLabel(pick(item, 'principal_due_date')) }}</td><td>{{ formatCOP(pick(item, 'principal_amount')) }}</td>
                <td>{{ dateLabel(pick(item, 'interest_due_date')) }}</td><td>{{ formatCOP(pick(item, 'interest_amount')) }}</td>
                <td>{{ dateLabel(pick(item, 'insurance_due_date')) }}</td><td>{{ formatCOP(pick(item, 'insurance_amount')) }}</td>
                <td>{{ formatCOP(pick(item, 'closing_balance')) }}</td>
              </tr></tbody>
            </table>
          </div>
          <dl class="fin-totals">
             <div><dt>Capital futuro (financiación)</dt><dd>{{ formatCOP(pickTotal('principal')) }}</dd></div>
             <div><dt>Intereses futuros (gasto)</dt><dd>{{ formatCOP(pickTotal('interest')) }}</dd></div>
             <div><dt>Seguro futuro (gasto)</dt><dd>{{ formatCOP(pickTotal('insurance')) }}</dd></div>
             <div><dt>Salida total proyectada de caja</dt><dd>{{ formatCOP(pickTotal('total_cash_outflow')) }}</dd></div>
          </dl>
          <ul v-if="preview.warnings?.length" class="fin-warnings"><li v-for="(warning, index) in preview.warnings" :key="index">{{ typeof warning === 'string' ? warning : warning.message ?? JSON.stringify(warning) }}</li></ul>
        </section>
      </div>

      <footer class="fin-footer">
        <button type="button" class="btn btn-secondary" :disabled="saving || previewing" @click="close">Cancelar</button>
        <button v-if="canEdit" type="button" class="btn btn-secondary" :disabled="previewing || saving" @click="requestPreview">{{ previewing ? 'Solicitando preview…' : 'Previsualizar calendario' }}</button>
        <button v-if="canEdit" type="button" class="btn btn-primary" :disabled="!previewAvailable || saving || previewing" @click="saveCredit">{{ saving ? 'Guardando…' : credit ? 'Guardar cambios y proyección' : 'Crear crédito y guardar proyección' }}</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.fin-overlay{position:fixed;inset:0;z-index:1300;display:flex;align-items:center;justify-content:center;padding:16px;background:var(--background-transparency,rgba(7,7,7,.58))}.fin-dialog{display:flex;flex-direction:column;width:min(1120px,98vw);max-height:92vh;border:1px solid var(--color-border,rgba(97,97,97,.2));border-radius:10px;background:var(--color-surface-card,#fff);color:var(--color-text-primary,#111);box-shadow:0 12px 32px #0003}.fin-header,.fin-footer{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid var(--color-border,rgba(97,97,97,.15))}.fin-header h2{margin:0;font-size:1.05rem}.fin-header p{margin:4px 0 0;color:var(--color-text-secondary,#555);font-size:.78rem}.fin-close{border:0;background:none;color:inherit;font-size:1.5rem;cursor:pointer}.fin-body{overflow:auto;padding:16px 20px;display:flex;flex-direction:column;gap:14px}.fin-pending,.fin-warning,.fin-note,.fin-error{margin:0;padding:10px 12px;border:1px solid var(--color-border,rgba(97,97,97,.2));border-left:4px solid #b7791f;border-radius:7px;background:rgba(183,121,31,.08);font-size:.78rem;line-height:1.5}.fin-pending p{margin:5px 0 0}.fin-note{border-left-color:#03658c;background:rgba(3,101,140,.07)}.fin-error{border-left-color:#c53030;background:rgba(197,48,48,.08);color:#9b2222}.fin-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.fin-field{display:flex;flex-direction:column;gap:5px;min-width:0;font-size:.78rem}.fin-field>span{font-weight:600;color:var(--color-text-secondary,#555)}.fin-field input,.fin-field select{width:100%;box-sizing:border-box;padding:8px 9px;border:1px solid var(--color-border-strong,rgba(97,97,97,.3));border-radius:6px;background:var(--color-surface,#f7f7f7);color:var(--color-text-primary,#111)}.fin-field [aria-invalid=true]{border-color:#c53030}.fin-field small{font-size:.69rem;line-height:1.4;color:var(--color-text-muted,#777)}.fin-field small:has(+small){margin-top:-2px}.fin-preview{display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid var(--color-border,rgba(97,97,97,.18));border-radius:8px}.fin-preview h3,.fin-preview p{margin:0}.fin-preview h3{font-size:.88rem}.fin-preview p{font-size:.74rem;color:var(--color-text-secondary,#555)}.fin-table-scroll{overflow:auto}.fin-table-scroll table{min-width:1050px;width:100%;font-size:.73rem}.fin-table-scroll th,.fin-table-scroll td{white-space:nowrap;padding:7px}.fin-totals{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:0}.fin-totals div{padding:8px;border-radius:6px;background:var(--color-surface,#f6f7f8)}.fin-totals dt{font-size:.7rem;color:var(--color-text-secondary,#555)}.fin-totals dd{margin:4px 0 0;font-size:.8rem;font-weight:700}.fin-warnings{margin:0;padding-left:20px;color:#9b5b00;font-size:.76rem}.fin-footer{justify-content:flex-end;border-top:1px solid var(--color-border,rgba(97,97,97,.15));border-bottom:0;background:var(--color-surface,#f7f7f7)}@media(max-width:800px){.fin-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.fin-totals{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:520px){.fin-overlay{padding:6px}.fin-body{padding:12px}.fin-grid{grid-template-columns:1fr}.fin-footer{flex-wrap:wrap;padding:10px}.fin-footer button{flex:1}}
.fin-fields{min-width:0;margin:0;padding:0;border:0}.fin-preview-loading{display:flex;align-items:center;gap:9px;padding:9px 11px;border:1px dashed var(--color-border-strong,rgba(97,97,97,.3));border-radius:7px;font-size:.76rem;color:var(--color-text-secondary,#555)}.fin-spinner{width:14px;height:14px;flex:none;border:2px solid #8884;border-top-color:var(--color-brand,#03658c);border-radius:50%;animation:fin-spin .8s linear infinite}@keyframes fin-spin{to{transform:rotate(360deg)}}
:global(:root[data-theme='dark']) .fin-error{color:#ffb3b3}:global(:root[data-theme='dark']) .fin-warning,:global(:root[data-theme='dark']) .fin-warnings{color:#ffd27a}:global(:root[data-theme='dark']) .fin-chip-expense{color:#ffd27a}
</style>
