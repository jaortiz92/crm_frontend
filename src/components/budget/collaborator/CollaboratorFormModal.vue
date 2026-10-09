<script setup>
/**
 * CollaboratorFormModal — alta/edición del maestro de colaboradores +
 * registro de aumentos salariales (FE-S15-COLLAB §5; contrato: backend.02_21
 * §9). Un solo componente en modo `create | edit` (patrón `RateEditorModal`).
 *
 * D-FE15-6 (BR-COLLAB-02): el salario NUNCA se edita en línea. En modo
 * edición el campo aparece en lectura ("salario vigente (actual)") con el
 * botón [Registrar aumento], que abre el subform POST
 * `/budget/collaborator/{id}/salary-plan` `{salary, allowance_salary,
 * allowance_non_salary, is_integral, valid_from}` (el BE cierra el plan
 * anterior). Bajo el bloque, la tabla de planes históricos en lectura.
 * En modo creación la captura de la Nómina incluye el PRIMER plan (el POST
 * maestro se encadena con un POST salary-plan: el contrato de alta §9 no
 * define campos de salario en el maestro, así que el plan viaja por su
 * propio endpoint — fuente única).
 *
 * Etiquetas de contrato: ESPEJO EXACTO del enum BE (regla §7.5) desde
 * `componentLabels.js` — UI y plantilla nunca diverjan.
 *
 * 409 `doc_value` duplicado ⇒ error INLINE bajo el documento (§4). 403 ⇒
 * toast (el BE es la autoridad de roles, D-S11-7). 422/400 ⇒ banner con el
 * `detail.message` del BE sin inventar texto (§6).
 *
 * Shell/foco: mismo patrón de modales del módulo (overlay, role=dialog,
 * trampa de Tab, ESC solo si no hay red en vuelo).
 */
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import {
  budgetCollaboratorService,
  classifyCollaboratorError
} from '@/services/budgetCollaboratorService.js'
import { alertService } from '@/services/alertService.js'
import { formatCOP, formatDateEs } from '@/components/budget/planning/planningFormat.js'
import {
  CONTRACT_TYPE_OPTIONS,
  DOC_TYPE_OPTIONS,
  RISK_CLASS_OPTIONS,
  contractTypeLabel
} from './componentLabels.js'

const props = defineProps({
  open: { type: Boolean, required: true },
  /** `null` ⇒ alta; colaborador completo ⇒ edición. */
  collaborator: { type: Object, default: null },
  /** Catálogo CECO `{ id_cost_center, cost_center_code, cost_center_name }`. */
  costCenters: { type: Array, default: () => [] },
  /** Catálogo temporadas `{ id_collection, short_collection_name }`. */
  collections: { type: Array, default: () => [] }
})

const emit = defineEmits(['saved', 'close'])

const dialogRef = ref(null)
const saving = ref(false)
const attempted = ref(false)
const docError = ref('')
const alertMessage = ref('')

/** Estado del formulario maestro — SIEMPRE strings (se numericen al enviar). */
const form = reactive({
  docType: 'CC',
  docValue: '',
  fullName: '',
  idCostCenter: '',
  contractType: 'open_ended',
  hireDate: '',
  terminationDate: '',
  riskClass: '',
  idCollection: '',
  notes: ''
})

/** PRIMER plan en alta (D-FE15-6: el plan SIEMPRE viaja por salary-plan). */
const initialPlan = reactive({
  salaryText: '',
  allowanceSalaryText: '',
  allowanceNonSalaryText: '',
  isIntegral: false,
  validFrom: ''
})

const isEdit = computed(() => Boolean(props.collaborator?.id_collaborator))
const collaboratorId = computed(() => props.collaborator?.id_collaborator ?? null)

/** Hoy ISO local (sin corrimiento UTC del `toISOString`). */
function localTodayISO() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function parseAmount(text) {
  const clean = String(text ?? '').trim()
  if (!clean) return Number.NaN
  return Number(clean.includes(',') && !clean.includes('.') ? clean.replace(',', '.') : clean)
}

/* ----------------------------- validación local ----------------------------- */

const requiredError = computed(() => {
  if (!form.docValue.trim()) return 'El documento es obligatorio.'
  if (!form.fullName.trim()) return 'El nombre completo es obligatorio.'
  if (!form.idCostCenter) return 'El centro de costo (CECO) es obligatorio.'
  if (!form.hireDate) return 'La fecha de ingreso es obligatoria.'
  return ''
})

const docErrorLocal = computed(() => (form.docValue.trim() ? '' : 'El documento es obligatorio.'))
const nameErrorLocal = computed(() => (form.fullName.trim() ? '' : 'El nombre es obligatorio.'))
const cecoErrorLocal = computed(() => (form.idCostCenter ? '' : 'Seleccione un CECO.'))
const hireErrorLocal = computed(() => (form.hireDate ? '' : 'La fecha de ingreso es obligatoria.'))

const salaryError = computed(() => {
  if (isEdit.value) return ''
  const value = parseAmount(initialPlan.salaryText)
  if (!String(initialPlan.salaryText).trim())
    return 'El salario es obligatorio para el primer plan.'
  if (!Number.isFinite(value) || value <= 0) return 'El salario debe ser un número mayor que 0.'
  return ''
})

const canSave = computed(() => {
  if (saving.value || requiredError.value) return false
  if (!isEdit.value && (salaryError.value || !planValidFor(initialPlan))) return false
  return true
})

/* ------------------------- modo edición: salario y planes ------------------------- */

const plans = ref([])
const plansLoading = ref(false)

/** Plan abierto (vigencia vigente) = `valid_to == null`; fallback: el más nuevo. */
const currentPlan = computed(() => {
  const open = plans.value.find((plan) => !plan.valid_to)
  if (open) return open
  return plans.value[0] ?? null
})

/** Salario vigente mostrado (el de la ficha si el GET/{id} aún no respondió). */
const currentSalary = computed(() => {
  if (currentPlan.value) return currentPlan.value.salary
  const item = props.collaborator
  const raw = item?.current_salary ?? item?.salary ?? null
  return raw === null ? null : Number(raw)
})

/** El salario NO viaja en PUT maestro (D-FE15-6); solo se lee. */
const masked = computed(() => Boolean(props.collaborator?.salary_masked))

/** Subform "Registrar aumento" (POST salary-plan). */
const increaseOpen = ref(false)
const increaseSaving = ref(false)
const increaseForm = reactive({
  salaryText: '',
  allowanceSalaryText: '',
  allowanceNonSalaryText: '',
  isIntegral: false,
  validFrom: ''
})
const increaseAttempted = ref(false)

const increaseSalaryError = computed(() => {
  const value = parseAmount(increaseForm.salaryText)
  if (!String(increaseForm.salaryText).trim()) return 'El nuevo salario es obligatorio.'
  if (!Number.isFinite(value) || value <= 0) return 'El salario debe ser un número mayor que 0.'
  return ''
})

const increaseValid = computed(() => {
  if (!increaseForm.validFrom) return false
  if (!planValidFor(increaseForm)) return false
  return true
})

function planValidFor(planState) {
  const salary = parseAmount(planState.salaryText)
  if (!Number.isFinite(salary) || salary <= 0) return false
  return [planState.allowanceSalaryText, planState.allowanceNonSalaryText].every((text) => {
    if (!String(text ?? '').trim()) return true
    const value = parseAmount(text)
    return Number.isFinite(value) && value >= 0
  })
}

function openIncrease() {
  if (increaseSaving.value || saving.value) return
  Object.assign(increaseForm, {
    salaryText: currentSalary.value !== null ? String(currentSalary.value) : '',
    allowanceSalaryText:
      currentPlan.value?.allowance_salary != null ? String(currentPlan.value.allowance_salary) : '',
    allowanceNonSalaryText:
      currentPlan.value?.allowance_non_salary != null
        ? String(currentPlan.value.allowance_non_salary)
        : '',
    isIntegral: Boolean(currentPlan.value?.is_integral),
    validFrom: localTodayISO()
  })
  increaseAttempted.value = false
  increaseOpen.value = true
}

function closeIncrease() {
  if (increaseSaving.value) return
  increaseOpen.value = false
}

function buildPlanPayload(planState) {
  const payload = {
    salary: parseAmount(planState.salaryText),
    allowance_salary: parseAmount(planState.allowanceSalaryText) || 0,
    allowance_non_salary: parseAmount(planState.allowanceNonSalaryText) || 0,
    is_integral: Boolean(planState.isIntegral),
    valid_from: planState.validFrom
  }
  return payload
}

async function submitIncrease() {
  increaseAttempted.value = true
  if (!increaseValid.value || increaseSaving.value) return
  increaseSaving.value = true
  alertMessage.value = ''
  try {
    await budgetCollaboratorService.createSalaryPlan(
      collaboratorId.value,
      buildPlanPayload(increaseForm)
    )
    alertService.generalSucces('Aumento registrado: el motor regenera los meses desde la vigencia.')
    increaseOpen.value = false
    await loadPlans()
    emit('saved')
  } catch (err) {
    applyError(err, { inlineTarget: null })
  } finally {
    increaseSaving.value = false
  }
}

/* ------------------------------ carga de planes ------------------------------ */

async function loadPlans() {
  if (!isEdit.value) return
  plansLoading.value = true
  try {
    const response = await budgetCollaboratorService.fetchCollaborator(collaboratorId.value)
    const data = response?.data
    const list = Array.isArray(data?.salary_plans)
      ? data.salary_plans
      : Array.isArray(data?.plans)
        ? data.plans
        : null
    if (list) {
      plans.value = [...list].sort((a, b) =>
        String(b.valid_from).localeCompare(String(a.valid_from))
      )
    }
  } catch (err) {
    const classified = classifyCollaboratorError(err)
    if (classified.kind === 'forbidden') {
      plans.value = []
    }
    // 404/red: la ficha del listado sigue mostrando el salario vigente.
  } finally {
    plansLoading.value = false
  }
}

/* --------------------------------- payloads --------------------------------- */

function buildMasterPayload() {
  const payload = {
    doc_type: form.docType,
    doc_value: form.docValue.trim(),
    full_name: form.fullName.trim(),
    id_cost_center: Number(form.idCostCenter),
    contract_type: form.contractType,
    hire_date: form.hireDate,
    termination_date: form.terminationDate || null,
    risk_class: form.riskClass || null,
    id_collection: form.idCollection ? Number(form.idCollection) : null,
    notes: form.notes.trim() || null
  }
  return payload
}

/* ---------------------------------- errores ---------------------------------- */

/** Mapeo §4/§6: 409 → inline bajo el documento; resto → banner/toast. */
function applyError(err, { inlineTarget } = {}) {
  const result = classifyCollaboratorError(err)
  if (result.kind === 'auth' || result.kind === 'busy') return
  if (result.kind === 'forbidden') {
    alertService.generalError(result.message || 'No tiene permiso para esta operación.')
    return
  }
  if (result.kind === 'duplicate') {
    docError.value = result.message
    return
  }
  if (result.kind === 'notfound' || result.kind === 'conflict' || result.kind === 'validation') {
    alertMessage.value =
      result.message ||
      (result.kind === 'notfound'
        ? 'El colaborador o el centro de costo ya no existe.'
        : 'No se pudo guardar. Reintenta.')
    return
  }
  if (result.kind === 'network') {
    alertMessage.value = 'Sin conexión con el servidor. Los datos se conservan: reintenta.'
    return
  }
  alertMessage.value = result.message || 'No se pudo guardar. Reintenta.'
  if (inlineTarget) inlineTarget.value = ''
}

/* ---------------------------------- submit ---------------------------------- */

async function handleSave() {
  attempted.value = true
  docError.value = ''
  alertMessage.value = ''
  if (!canSave.value) return
  saving.value = true
  try {
    if (isEdit.value) {
      await budgetCollaboratorService.updateCollaborator(collaboratorId.value, buildMasterPayload())
      alertService.generalSucces('Colaborador actualizado.')
      emit('saved')
      emit('close')
      return
    }
    const created = await budgetCollaboratorService.createCollaborator(buildMasterPayload())
    const newId = created?.data?.id_collaborator
    if (newId !== null && newId !== undefined && planValidFor(initialPlan)) {
      try {
        await budgetCollaboratorService.createSalaryPlan(newId, buildPlanPayload(initialPlan))
      } catch (planErr) {
        // El maestro ya existe: avisamos del plan fallido pero la vista refresca.
        applyError(planErr, {})
        alertService.generalWarning(
          'Colaborador creado sin plan salarial',
          'Registre el salario con "Registrar aumento" para que el motor genere las líneas.'
        )
        emit('saved')
        emit('close')
        return
      }
    }
    alertService.generalSucces('Colaborador creado.')
    emit('saved')
    emit('close')
  } catch (err) {
    applyError(err, {})
  } finally {
    saving.value = false
  }
}

/* --------------------------- apertura / prellenado --------------------------- */

function resetForms() {
  Object.assign(form, {
    docType: 'CC',
    docValue: '',
    fullName: '',
    idCostCenter: '',
    contractType: 'open_ended',
    hireDate: '',
    terminationDate: '',
    riskClass: '',
    idCollection: '',
    notes: ''
  })
  Object.assign(initialPlan, {
    salaryText: '',
    allowanceSalaryText: '',
    allowanceNonSalaryText: '',
    isIntegral: false,
    validFrom: localTodayISO()
  })
  plans.value = []
  increaseOpen.value = false
  attempted.value = false
  docError.value = ''
  alertMessage.value = ''
}

function prefillFromCollaborator(item) {
  Object.assign(form, {
    docType: item.doc_type || 'CC',
    docValue: item.doc_value ?? '',
    fullName: item.full_name ?? '',
    idCostCenter: item.id_cost_center != null ? String(item.id_cost_center) : '',
    contractType: item.contract_type || 'open_ended',
    hireDate: item.hire_date ?? '',
    terminationDate: item.termination_date ?? '',
    riskClass: item.risk_class ?? '',
    idCollection: item.id_collection != null ? String(item.id_collection) : '',
    notes: item.notes ?? ''
  })
}

watch(
  () => [props.open, props.collaborator],
  async ([open, item]) => {
    if (!open) return
    resetForms()
    if (item) {
      prefillFromCollaborator(item)
      void loadPlans()
    } else {
      initialPlan.validFrom = localTodayISO()
    }
    await nextTick()
    dialogRef.value?.focus()
  },
  { immediate: true }
)

/* ---------------------- cierre, teclado y foco atrapado -------------------- */

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

function tryClose() {
  if (saving.value || increaseSaving.value) return
  emit('close')
}

function onOverlayMousedown(event) {
  if (event.target === event.currentTarget) tryClose()
}

function onGlobalKeydown(event) {
  if (!props.open) return
  if (event.key === 'Escape') {
    if (increaseOpen.value) {
      closeIncrease()
      return
    }
    tryClose()
    return
  }
  if (event.key !== 'Tab' || !dialogRef.value) return
  const focusables = dialogRef.value.querySelectorAll(FOCUSABLE_SELECTOR)
  if (focusables.length === 0) return
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  const active = document.activeElement
  if (!dialogRef.value.contains(active)) {
    event.preventDefault()
    first.focus()
  } else if (event.shiftKey && active === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
})

const dialogTitle = computed(() => (isEdit.value ? 'Editar colaborador' : 'Nuevo colaborador'))
</script>

<template>
  <div v-if="open" class="cf-overlay" @mousedown="onOverlayMousedown">
    <div
      ref="dialogRef"
      class="cf-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="collab-form-title"
      tabindex="-1"
    >
      <header class="cf-header">
        <div class="cf-header-text">
          <h3 id="collab-form-title" class="cf-title">{{ dialogTitle }}</h3>
          <p class="cf-subtitle">
            <template v-if="isEdit">
              {{ props.collaborator?.full_name || '—' }} ·
              {{ contractTypeLabel(props.collaborator?.contract_type) }}
            </template>
            <template v-else>Capture solo el salario: el sistema calcula el resto</template>
          </p>
        </div>
        <button
          type="button"
          class="cf-x"
          :disabled="saving || increaseSaving"
          aria-label="Cerrar ventana"
          @click="tryClose"
        >
          ✕
        </button>
      </header>

      <form class="cf-body" @submit.prevent="handleSave">
        <!-- ══════════════════ datos del maestro ══════════════════ -->
        <div class="cf-row">
          <div class="cf-field cf-field-small">
            <label class="cf-label" for="cf-doc-type">Tipo documento *</label>
            <select id="cf-doc-type" v-model="form.docType" class="cf-input" :disabled="saving">
              <option v-for="option in DOC_TYPE_OPTIONS" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </div>
          <div class="cf-field">
            <label class="cf-label" for="cf-doc-value">
              Documento *
              <span class="cf-hint-inline">(clave del upsert de la plantilla)</span>
            </label>
            <input
              id="cf-doc-value"
              v-model="form.docValue"
              class="cf-input"
              :class="{ 'is-invalid': Boolean(docError) || (attempted && docErrorLocal) }"
              type="text"
              maxlength="20"
              autocomplete="off"
              :disabled="saving"
            />
            <p v-if="docError || (attempted && docErrorLocal)" class="cf-field-error" role="alert">
              {{ docError || docErrorLocal }}
            </p>
          </div>
        </div>

        <div class="cf-field">
          <label class="cf-label" for="cf-full-name">Nombres y apellidos *</label>
          <input
            id="cf-full-name"
            v-model="form.fullName"
            class="cf-input"
            :class="{ 'is-invalid': attempted && nameErrorLocal }"
            type="text"
            maxlength="150"
            autocomplete="off"
            :disabled="saving"
          />
          <p v-if="attempted && nameErrorLocal" class="cf-field-error" role="alert">
            {{ nameErrorLocal }}
          </p>
        </div>

        <div class="cf-row">
          <div class="cf-field">
            <label class="cf-label" for="cf-ceco">Centro de costo (CECO) *</label>
            <select
              id="cf-ceco"
              v-model="form.idCostCenter"
              class="cf-input"
              :class="{ 'is-invalid': attempted && cecoErrorLocal }"
              :disabled="saving"
            >
              <option value="">Seleccione un CECO…</option>
              <option
                v-for="center in props.costCenters"
                :key="center.id_cost_center"
                :value="String(center.id_cost_center)"
              >
                {{ center.cost_center_code }} — {{ center.cost_center_name }}
              </option>
            </select>
            <p v-if="attempted && cecoErrorLocal" class="cf-field-error" role="alert">
              {{ cecoErrorLocal }}
            </p>
          </div>
          <div class="cf-field">
            <label class="cf-label" for="cf-contract">Tipo de contrato *</label>
            <select
              id="cf-contract"
              v-model="form.contractType"
              class="cf-input"
              :disabled="saving"
            >
              <option
                v-for="option in CONTRACT_TYPE_OPTIONS"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </div>
        </div>

        <div class="cf-row">
          <div class="cf-field cf-field-small">
            <label class="cf-label" for="cf-hire">Fecha de ingreso *</label>
            <input
              id="cf-hire"
              v-model="form.hireDate"
              class="cf-input"
              :class="{ 'is-invalid': attempted && hireErrorLocal }"
              type="date"
              :disabled="saving"
            />
          </div>
          <div class="cf-field cf-field-small">
            <label class="cf-label" for="cf-term">Fecha de terminación</label>
            <input
              id="cf-term"
              v-model="form.terminationDate"
              class="cf-input"
              type="date"
              :disabled="saving"
            />
          </div>
          <div class="cf-field cf-field-small">
            <label class="cf-label" for="cf-risk">Clase de riesgo ARL</label>
            <select id="cf-risk" v-model="form.riskClass" class="cf-input" :disabled="saving">
              <option value="">— (por defecto)</option>
              <option v-for="risk in RISK_CLASS_OPTIONS" :key="risk" :value="risk">
                {{ risk }}
              </option>
            </select>
          </div>
          <div class="cf-field cf-field-small">
            <label class="cf-label" for="cf-collection">Temporada</label>
            <select
              id="cf-collection"
              v-model="form.idCollection"
              class="cf-input"
              :disabled="saving"
            >
              <option value="">— ninguna —</option>
              <option
                v-for="collection in props.collections"
                :key="collection.id_collection"
                :value="String(collection.id_collection)"
              >
                {{ collection.short_collection_name }}
              </option>
            </select>
          </div>
        </div>

        <div class="cf-field">
          <label class="cf-label" for="cf-notes">Observaciones</label>
          <textarea
            id="cf-notes"
            v-model="form.notes"
            class="cf-input cf-textarea"
            rows="2"
            maxlength="500"
            :disabled="saving"
          ></textarea>
        </div>

        <!-- ══════════════════ bloque salarial ══════════════════ -->
        <template v-if="!isEdit">
          <fieldset class="cf-plan" :disabled="saving">
            <legend class="cf-legend">Salario del primer plan</legend>
            <p class="cf-note">
              Capture solo el salario; el sistema calcula auxilio, seguridad social, parafiscales y
              provisiones.
            </p>
            <div class="cf-row">
              <div class="cf-field">
                <label class="cf-label" for="cf-salary">Salario básico mensual (COP) *</label>
                <input
                  id="cf-salary"
                  v-model="initialPlan.salaryText"
                  class="cf-input"
                  :class="{ 'is-invalid': attempted && salaryError }"
                  type="text"
                  inputmode="decimal"
                  autocomplete="off"
                  placeholder="Ej.: 2000000"
                />
                <p v-if="attempted && salaryError" class="cf-field-error" role="alert">
                  {{ salaryError }}
                </p>
              </div>
              <div class="cf-field">
                <label class="cf-label" for="cf-allow-sal">Asignación salarial</label>
                <input
                  id="cf-allow-sal"
                  v-model="initialPlan.allowanceSalaryText"
                  class="cf-input"
                  type="text"
                  inputmode="decimal"
                  autocomplete="off"
                  placeholder="0"
                />
              </div>
              <div class="cf-field">
                <label class="cf-label" for="cf-allow-non">Asignación no salarial</label>
                <input
                  id="cf-allow-non"
                  v-model="initialPlan.allowanceNonSalaryText"
                  class="cf-input"
                  type="text"
                  inputmode="decimal"
                  autocomplete="off"
                  placeholder="0"
                />
              </div>
              <div class="cf-field cf-field-small">
                <label class="cf-label" for="cf-valid-from">Vigencia desde *</label>
                <input
                  id="cf-valid-from"
                  v-model="initialPlan.validFrom"
                  class="cf-input"
                  type="date"
                />
              </div>
            </div>
            <label class="cf-check" for="cf-integral">
              <input id="cf-integral" v-model="initialPlan.isIntegral" type="checkbox" />
              <span>Salario integral</span>
            </label>
          </fieldset>
        </template>

        <template v-else>
          <section class="cf-plan">
            <p class="cf-legend">Salario vigente (actual)</p>
            <div class="cf-salary-line">
              <strong class="cf-salary-value">
                {{ masked ? '— (restringido)' : formatCOP(currentSalary) }}
              </strong>
              <span v-if="currentPlan?.valid_from" class="cf-salary-from">
                desde {{ formatDateEs(currentPlan.valid_from) }}
              </span>
              <button
                type="button"
                class="btn btn-primary btn-sm cf-increase-btn"
                :disabled="saving || increaseSaving || masked"
                :title="
                  masked
                    ? 'Salario restringido para su rol'
                    : 'Nuevo plan con vigencia (BR-COLLAB-02)'
                "
                @click="openIncrease"
              >
                + Registrar aumento
              </button>
            </div>

            <!-- Subform POST salary-plan (D-FE15-6) -->
            <div v-if="increaseOpen" class="cf-increase">
              <p class="cf-note">
                El aumento crea un NUEVO plan con fecha de vigencia; el plan anterior se cierra
                automáticamente y el motor regenera los meses desde esa fecha.
              </p>
              <div class="cf-row">
                <div class="cf-field">
                  <label class="cf-label" for="cf-inc-salary">Nuevo salario (COP) *</label>
                  <input
                    id="cf-inc-salary"
                    v-model="increaseForm.salaryText"
                    class="cf-input"
                    :class="{ 'is-invalid': increaseAttempted && increaseSalaryError }"
                    type="text"
                    inputmode="decimal"
                    autocomplete="off"
                    :disabled="increaseSaving"
                  />
                  <p
                    v-if="increaseAttempted && increaseSalaryError"
                    class="cf-field-error"
                    role="alert"
                  >
                    {{ increaseSalaryError }}
                  </p>
                </div>
                <div class="cf-field">
                  <label class="cf-label" for="cf-inc-allow-sal">Asignación salarial</label>
                  <input
                    id="cf-inc-allow-sal"
                    v-model="increaseForm.allowanceSalaryText"
                    class="cf-input"
                    type="text"
                    inputmode="decimal"
                    autocomplete="off"
                    :disabled="increaseSaving"
                  />
                </div>
                <div class="cf-field">
                  <label class="cf-label" for="cf-inc-allow-non">Asignación no salarial</label>
                  <input
                    id="cf-inc-allow-non"
                    v-model="increaseForm.allowanceNonSalaryText"
                    class="cf-input"
                    type="text"
                    inputmode="decimal"
                    autocomplete="off"
                    :disabled="increaseSaving"
                  />
                </div>
                <div class="cf-field cf-field-small">
                  <label class="cf-label" for="cf-inc-from">Vigente desde *</label>
                  <input
                    id="cf-inc-from"
                    v-model="increaseForm.validFrom"
                    class="cf-input"
                    type="date"
                    :disabled="increaseSaving"
                  />
                </div>
              </div>
              <div class="cf-increase-foot">
                <label class="cf-check" for="cf-inc-integral">
                  <input
                    id="cf-inc-integral"
                    v-model="increaseForm.isIntegral"
                    type="checkbox"
                    :disabled="increaseSaving"
                  />
                  <span>Salario integral</span>
                </label>
                <div class="cf-increase-actions">
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    :disabled="increaseSaving"
                    @click="closeIncrease"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    class="btn btn-primary btn-sm"
                    :disabled="increaseSaving || (increaseAttempted && !increaseValid)"
                    @click="submitIncrease"
                  >
                    <span v-if="increaseSaving" class="cf-spinner" aria-hidden="true"></span>
                    {{ increaseSaving ? 'Registrando…' : 'Registrar aumento' }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Planes históricos (lectura) -->
            <div class="cf-plans-zone">
              <p class="cf-plans-title">Planes salariales (historial, solo lectura)</p>
              <div v-if="plansLoading" class="cf-plans-loading" aria-live="polite">
                <span class="cf-spinner" aria-hidden="true"></span> Cargando…
              </div>
              <table v-else-if="plans.length" class="cf-plans-table">
                <thead>
                  <tr>
                    <th scope="col">Vigente desde</th>
                    <th scope="col">Vigente hasta</th>
                    <th scope="col">Salario</th>
                    <th scope="col">Asig. salarial</th>
                    <th scope="col">Asig. no salarial</th>
                    <th scope="col">Integral</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="plan in plans" :key="plan.id_salary_plan ?? plan.valid_from">
                    <td class="cf-cell-date">{{ formatDateEs(plan.valid_from) }}</td>
                    <td class="cf-cell-date">
                      {{ plan.valid_to ? formatDateEs(plan.valid_to) : 'abierto' }}
                    </td>
                    <td class="cf-cell-money">{{ formatCOP(plan.salary) }}</td>
                    <td class="cf-cell-money">{{ formatCOP(plan.allowance_salary) }}</td>
                    <td class="cf-cell-money">{{ formatCOP(plan.allowance_non_salary) }}</td>
                    <td>{{ plan.is_integral ? 'Sí' : 'No' }}</td>
                  </tr>
                </tbody>
              </table>
              <p v-else class="cf-plans-empty">
                {{
                  masked
                    ? 'Historial restringido para su rol.'
                    : 'Sin planes registrados: use “Registrar aumento” para crear el primero.'
                }}
              </p>
            </div>
          </section>
        </template>

        <p v-if="alertMessage" class="cf-alert" role="alert" aria-live="assertive">
          {{ alertMessage }}
        </p>
      </form>

      <footer class="cf-footer">
        <button
          type="button"
          class="btn btn-secondary"
          :disabled="saving || increaseSaving"
          @click="tryClose"
        >
          Cancelar
        </button>
        <button
          type="button"
          class="btn btn-primary cf-submit"
          :disabled="!canSave"
          @click="handleSave"
        >
          <span v-if="saving" class="cf-spinner" aria-hidden="true"></span>
          {{ saving ? 'Guardando…' : 'Guardar' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.cf-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background-color: var(--background-transparency, rgba(7, 7, 7, 0.55));
}

.cf-dialog {
  display: flex;
  flex-direction: column;
  width: min(720px, 96vw);
  max-height: min(92vh, 900px);
  overflow: hidden;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 10px;
  background-color: var(--color-surface-card, #ffffff);
  color: var(--color-text-primary, #070707);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
  outline: none;
  animation: cf-pop 0.22s cubic-bezier(0.23, 1, 0.32, 1);
}

@keyframes cf-pop {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(6px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .cf-dialog {
    animation: none;
  }
}

.cf-header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
}

.cf-header-text {
  flex: 1;
  min-width: 0;
}

.cf-title {
  margin: 0;
  font-size: 1.02rem;
  font-weight: 600;
}

.cf-subtitle {
  margin: 2px 0 0;
  overflow: hidden;
  font-size: 0.76rem;
  color: var(--color-text-muted, #8a8a8a);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cf-x {
  padding: 6px 8px;
  border: none;
  border-radius: 6px;
  background: none;
  font-size: 0.95rem;
  color: var(--color-text-muted, #8a8a8a);
  cursor: pointer;
}

.cf-x:hover:not(:disabled) {
  background-color: rgba(120, 120, 120, 0.12);
  color: var(--color-text-primary, #070707);
}

.cf-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  padding: 16px 20px;
}

.cf-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.cf-field {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-width: 180px;
}

.cf-field-small {
  flex: 0 1 160px;
  min-width: 140px;
}

.cf-label {
  font-size: 0.74rem;
  font-weight: 600;
  color: var(--color-text-secondary, #555555);
}

.cf-hint-inline {
  font-weight: 400;
  font-style: italic;
  color: var(--color-text-muted, #8a8a8a);
}

.cf-input {
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 8px 10px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 6px;
  background-color: var(--color-surface, #f7f7f7);
  font-size: 0.84rem;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-primary, #070707);
  box-sizing: border-box;
}

.cf-input:focus {
  border-color: var(--color-brand, #03658c);
  outline: 2px solid rgba(3, 101, 140, 0.25);
  outline-offset: 0;
}

.cf-input.is-invalid {
  border-color: #c53030;
}

.cf-input:disabled {
  color: var(--color-text-muted, #8a8a8a);
}

.cf-textarea {
  resize: vertical;
  font-family: inherit;
}

.cf-field-error {
  margin: 2px 0 0;
  font-size: 0.76rem;
  font-weight: 500;
  color: #c53030;
}

:root[data-theme='dark'] .cf-field-error {
  color: #ff8f8f;
}

.cf-note {
  margin: 0 0 8px;
  font-size: 0.74rem;
  line-height: 1.5;
  color: var(--color-text-secondary, #555555);
}

.cf-plan {
  padding: 12px 14px;
  border: 1px dashed var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 8px;
  background-color: var(--color-surface, #f7f7f7);
}

:root[data-theme='dark'] .cf-plan {
  background-color: rgba(255, 255, 255, 0.04);
}

.cf-legend {
  margin: 0 0 8px;
  padding: 0;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-secondary, #555555);
}

.cf-check {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 0.82rem;
  color: var(--color-text-primary, #070707);
  cursor: pointer;
}

.cf-check input[type='checkbox'] {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--color-brand, #03658c);
  cursor: pointer;
}

.cf-salary-line {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: baseline;
}

.cf-salary-value {
  font-size: 1rem;
  font-variant-numeric: tabular-nums;
}

.cf-salary-from {
  font-size: 0.74rem;
  color: var(--color-text-muted, #8a8a8a);
}

.cf-increase-btn {
  margin-left: auto;
}

.cf-increase {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 8px;
  background-color: var(--color-surface-card, #ffffff);
}

.cf-increase-foot {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
}

.cf-increase-actions {
  display: flex;
  gap: 8px;
}

.cf-plans-zone {
  margin-top: 14px;
}

.cf-plans-title {
  margin: 0 0 6px;
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-secondary, #555555);
}

.cf-plans-loading,
.cf-plans-empty {
  margin: 0;
  font-size: 0.78rem;
  color: var(--color-text-muted, #8a8a8a);
}

.cf-plans-table {
  min-width: 100%;
  font-size: 0.78rem;
}

.cf-cell-date {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.cf-cell-money {
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.cf-alert {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid rgba(197, 48, 48, 0.35);
  border-left: 4px solid #c53030;
  border-radius: 8px;
  background-color: rgba(197, 48, 48, 0.07);
  font-size: 0.82rem;
  color: #9b2222;
}

:root[data-theme='dark'] .cf-alert {
  color: #ff9b9b;
}

.cf-footer {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding: 12px 20px;
  border-top: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  background-color: var(--color-surface, #f7f7f7);
}

:root[data-theme='dark'] .cf-footer {
  background-color: rgba(255, 255, 255, 0.03);
}

.cf-submit {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}

.cf-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(120, 120, 120, 0.25);
  border-top-color: var(--color-brand, #03658c);
  border-radius: 50%;
  animation: cf-spin 0.8s linear infinite;
}

@keyframes cf-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .cf-spinner {
    animation-duration: 1.6s;
  }
}
</style>
