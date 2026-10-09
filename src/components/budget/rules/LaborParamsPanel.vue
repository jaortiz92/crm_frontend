<script setup>
/**
 * LaborParamsPanel — tab "Parámetros laborales" de BudgetRulesView
 * (FE-S15-COLLAB §5, D-FE15-4; espejo del patrón del tab "Calendario IVA"
 * de FE-S14/D-FE14-5: dato de COMPAÑÍA por vigencia anual, no de escenario).
 *
 * Autoridad del contrato: backend.02_21 §9 (`GET/PUT /budget/labor-params`)
 * y §4.3 (claves) + §4.4 (ARL I–V). El grid se hidrata SOLO con lo que
 * responde el BE: CERO defaults inventados en UI (D-FE15-1; los valores de
 * ley los siembra el BE en la Fase 3 de §4.8, nunca esta capa).
 *
 * Flujos:
 *  - selector de vigencia (año) → GET `?vigencia=` → grid editable de las
 *    claves §4.3 con etiquetas en español (`LABOR_PARAM_DEFS`) y tipos
 *    monto / porcentaje / entero SMLV / fecha MM-DD / enum
 *    (`aplicacion_parafiscales`, `dia_pago_*`);
 *  - tabla ARL I–V editable (fracción 0–1 en el BE; UI muestra % — escala
 *    presentacional %↔fracción, precedente FE-S5 FD5-3);
 *  - [Guardar] ⇒ PUT `{vigencia, values, arl_rates}` (upsert admin; el BE
 *    valida R-05);
 *  - [Duplicar año anterior] ⇒ GET vigencia−1 → HIDRATA el grid del año
 *    nuevo (edición posible ANTES de guardar → PUT, D-FE15-4: "GET params
 *    año prev → hidratar grid del año nuevo antes de PUT");
 *  - 404/422 de vigencia inexistente ⇒ BANNER ROJO con el `detail.message`
 *    del BE + texto "Créela antes de importar/recalcular" (cierra R-05 en
 *    UX, §6 spec FE — sin inventar mensajes propios).
 *
 * Visibilidad/edición: solo rol admin — el PADRE (`BudgetRulesView`) monta
 * la pestaña con el mismo predicado de permiso de la vista de colaboradores
 * (D-FE15-4 + D-S11-7: el 403 del backend sigue siendo la autoridad).
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import {
  budgetCollaboratorService,
  classifyCollaboratorError
} from '@/services/budgetCollaboratorService.js'
import { alertService } from '@/services/alertService.js'
import { buildYearOptions } from '@/components/budget/planning/planningFormat.js'
import {
  LABOR_PARAM_DEFS,
  RISK_CLASS_OPTIONS,
  DIA_PAGO_LAST_BUSINESS
} from '@/components/budget/collaborator/componentLabels.js'

const PANEL_TITLE = 'Parámetros laborales'
const PANEL_SUBTITLE =
  'Tarifas, topes y fechas legales de la nómina por vigencia anual (SMLV, auxilio, seguridad ' +
  'social, parafiscales, prestaciones y días de pago). Es dato de compañía: el motor lo usa para ' +
  'toda la proyección. Si la vigencia no existe, créela duplicando el año anterior antes de ' +
  'importar nómina o recalcular.'

const yearOptions = buildYearOptions()
const vigencia = ref(new Date().getFullYear())

const loading = ref(false)
const saving = ref(false)
const duplicating = ref(false)
/** Banner rojo de vigencia inexistente/sin parámetros (404/422/400 R-05). */
const missingVigencia = ref(false)
const missingMessage = ref('')
const errorBanner = ref('')

/** Draft editable keyed por `key` BE (siempre strings; serializan al PUT). */
const values = reactive({})
/** Draft ARL: clase → texto de porcentaje ("1.044" = 1.044 % = 0.01044). */
const arlDraft = reactive({ I: '', II: '', III: '', IV: '', V: '' })

const busy = computed(() => loading.value || saving.value || duplicating.value)

/* ───────────────────────────── codecs tipo↔UI ───────────────────────────── */

function formatPercentFromFraction(raw) {
  const num = Number(raw)
  if (!Number.isFinite(num)) return ''
  return String(Number((num * 100).toFixed(6)))
}

function fractionFromPercentText(text) {
  const clean = String(text ?? '').trim()
  if (!clean) return null
  const num = Number(clean.includes(',') && !clean.includes('.') ? clean.replace(',', '.') : clean)
  if (!Number.isFinite(num)) return null
  return Number((num / 100).toFixed(6))
}

/** MM-DD (espejo del formato §4.3 BE). */
function isMMDD(text) {
  return /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(text ?? '').trim())
}

function hydrate(payload) {
  for (const def of LABOR_PARAM_DEFS) delete values[def.key]
  for (const risk of RISK_CLASS_OPTIONS) arlDraft[risk] = ''
  const rawValues = payload?.values ?? payload?.params ?? {}
  for (const def of LABOR_PARAM_DEFS) {
    const raw = rawValues?.[def.key]
    if (raw === undefined || raw === null) {
      values[def.key] = ''
      continue
    }
    const text = String(raw)
    values[def.key] = def.type === 'percent' ? formatPercentFromFraction(text) : text
  }
  const rawArl = payload?.arl_rates ?? payload?.arl ?? {}
  const arlEntries = Array.isArray(rawArl)
    ? rawArl.map((row) => [row?.risk_class, row?.rate])
    : Object.entries(rawArl)
  for (const [riskClass, rate] of arlEntries) {
    const klass = String(riskClass ?? '').toUpperCase()
    if (klass in arlDraft) arlDraft[klass] = formatPercentFromFraction(rate)
  }
}

/* ───────────────────────────── carga por vigencia ───────────────────────────── */

async function loadVigencia(target = vigencia.value) {
  loading.value = true
  missingVigencia.value = false
  missingMessage.value = ''
  errorBanner.value = ''
  try {
    const response = await budgetCollaboratorService.fetchLaborParams(target)
    hydrate(response?.data ?? {})
    // Vigencia "existente pero vacía" ⇒ BE puede responder 200 con {} — la
    // tratamos idéntica al 404 a efectos del banner (mismo cierre UX de R-05).
    const hasAny = LABOR_PARAM_DEFS.some((def) => String(values[def.key]) !== '')
    if (
      !hasAny &&
      Object.keys(response?.data?.values ?? response?.data?.params ?? {}).length === 0
    ) {
      missingVigencia.value = true
      missingMessage.value = ''
    }
  } catch (err) {
    const result = classifyCollaboratorError(err)
    for (const def of LABOR_PARAM_DEFS) values[def.key] = ''
    for (const risk of RISK_CLASS_OPTIONS) arlDraft[risk] = ''
    if (result.kind === 'notfound' || result.kind === 'validation' || result.kind === 'conflict') {
      missingVigencia.value = true
      missingMessage.value = result.message || ''
    } else if (result.kind === 'forbidden') {
      errorBanner.value =
        result.message || 'No tiene permiso para administrar parámetros laborales.'
    } else if (result.kind === 'network') {
      errorBanner.value = 'Sin conexión con el servidor. Reintente.'
    } else {
      missingVigencia.value = true
      missingMessage.value = result.message || ''
    }
  } finally {
    loading.value = false
  }
}

watch(vigencia, () => {
  void loadVigencia()
})

onMounted(() => {
  void loadVigencia()
})

/* ───────────────────────────── validación pre-red ───────────────────────────── */

function keyErrorsFor(def) {
  const text = String(values[def.key] ?? '').trim()
  if (!text) return 'Obligatorio para la vigencia.'
  if (def.type === 'money') {
    const num = Number(text.includes(',') && !text.includes('.') ? text.replace(',', '.') : text)
    if (!Number.isFinite(num) || num < 0) return 'Debe ser un monto ≥ 0.'
  } else if (def.type === 'percent') {
    const num = Number(text.includes(',') && !text.includes('.') ? text.replace(',', '.') : text)
    if (!Number.isFinite(num) || num < 0 || num > 100) return 'Porcentaje entre 0 y 100.'
  } else if (def.type === 'int') {
    const num = Number(text)
    if (!Number.isInteger(num) || num < 0) return 'Debe ser un entero ≥ 0.'
  } else if (def.type === 'mmdd') {
    if (!isMMDD(text)) return 'Formato MM-DD (p. ej. 06-30).'
  } else if (def.type === 'enum') {
    if (def.freeEntry) {
      const isLiteral = def.options.some((option) => option.value === text)
      const isDay = Number.isInteger(Number(text)) && Number(text) >= 1 && Number(text) <= 31
      if (!isLiteral && !isDay) return 'Elija modo o escriba un día 1–31.'
    } else if (
      !def.options.includes(text) &&
      !def.options.some((option) => option.value === text)
    ) {
      return 'Valor no válido.'
    }
  }
  return ''
}

const arlErrors = computed(() => {
  const errors = {}
  for (const risk of RISK_CLASS_OPTIONS) {
    const text = String(arlDraft[risk] ?? '').trim()
    if (!text) {
      errors[risk] = 'Obligatoria.'
      continue
    }
    const num = Number(text.includes(',') && !text.includes('.') ? text.replace(',', '.') : text)
    errors[risk] = Number.isFinite(num) && num >= 0 && num <= 100 ? '' : 'Porcentaje entre 0 y 100.'
  }
  return errors
})

const gridInvalid = computed(
  () =>
    LABOR_PARAM_DEFS.some((def) => keyErrorsFor(def)) ||
    Object.values(arlErrors.value).some(Boolean)
)

/* ───────────────────────────── guardar / duplicar ───────────────────────────── */

function buildPayload() {
  const out = {}
  for (const def of LABOR_PARAM_DEFS) {
    const text = String(values[def.key] ?? '').trim()
    if (!text) continue
    if (def.type === 'percent') {
      const fraction = fractionFromPercentText(text)
      if (fraction === null) continue
      out[def.key] = String(fraction)
    } else {
      out[def.key] = text
    }
  }
  const arl = {}
  for (const risk of RISK_CLASS_OPTIONS) {
    const fraction = fractionFromPercentText(arlDraft[risk])
    if (fraction !== null) arl[risk] = fraction
  }
  return { vigencia: Number(vigencia.value), values: out, arl_rates: arl }
}

async function handleSave() {
  if (busy.value || gridInvalid.value) return
  saving.value = true
  errorBanner.value = ''
  try {
    await budgetCollaboratorService.saveLaborParams(buildPayload())
    alertService.generalSucces(
      `Parámetros de ${vigencia.value} guardados. Recalcule los meses afectados para regenerar las líneas.`
    )
    missingVigencia.value = false
    await loadVigencia()
  } catch (err) {
    const result = classifyCollaboratorError(err)
    if (result.kind === 'forbidden') {
      errorBanner.value = result.message || 'No tiene permiso para modificar parámetros laborales.'
    } else if (
      result.kind === 'conflict' ||
      result.kind === 'validation' ||
      result.kind === 'notfound'
    ) {
      // R-05 y reglas del BE: se pinta SU message (§6 spec FE).
      errorBanner.value = result.message || 'El servidor rechazó los parámetros. Revíselos.'
    } else if (result.kind === 'network') {
      errorBanner.value = 'Sin conexión con el servidor. Los valores editados se conservan.'
    } else {
      errorBanner.value = result.message || 'No se pudieron guardar los parámetros.'
    }
  } finally {
    saving.value = false
  }
}

/**
 * D-FE15-4: GET vigencia−1 → HIDRATA el grid del año nuevo SIN guardar; el
 * admin revisa/ajusta y pulsa Guardar (PUT).
 */
async function duplicatePrevious() {
  if (busy.value) return
  duplicating.value = true
  errorBanner.value = ''
  const previous = Number(vigencia.value) - 1
  try {
    const response = await budgetCollaboratorService.fetchLaborParams(previous)
    const data = response?.data
    const empty = !Object.keys(data?.values ?? data?.params ?? {}).length
    if (empty) {
      alertService.generalWarning(
        'Sin año anterior',
        `La vigencia ${previous} tampoco tiene parámetros: capture los valores manualmente.`
      )
    } else {
      hydrate(data)
      missingVigencia.value = false
      missingMessage.value = ''
      alertService.generalInformation(
        'Borrador duplicado',
        `Valores de ${previous} cargados en ${vigencia.value}. Revise, ajuste y pulse Guardar.`
      )
    }
  } catch (err) {
    const result = classifyCollaboratorError(err)
    if (result.kind === 'notfound') {
      alertService.generalError(`La vigencia ${previous} no existe: capture los parámetros a mano.`)
    } else {
      alertService.generalError(result.message || 'No se pudo leer el año anterior.')
    }
  } finally {
    duplicating.value = false
  }
}

/* ───────────────────────────── helpers de render ───────────────────────────── */

/** Defs agrupadas por `group` (orden de aparición, como en el grid BE §4.3). */
const groups = computed(() => {
  const map = new Map()
  for (const def of LABOR_PARAM_DEFS) {
    if (!map.has(def.group)) map.set(def.group, [])
    map.get(def.group).push(def)
  }
  return [...map.entries()].map(([name, defs]) => ({ name, defs }))
})

function optionsOf(def) {
  return def.options.map((option) =>
    typeof option === 'string' ? { value: option, label: option } : option
  )
}

/** `dia_pago_*`: modo enum + día libre. Se edita con dos controles. */
function diaPagoMode(def) {
  const text = String(values[def.key] ?? '')
  if (!text) return ''
  return text === DIA_PAGO_LAST_BUSINESS ? DIA_PAGO_LAST_BUSINESS : 'day'
}

function setDiaPagoMode(def, mode) {
  if (mode === DIA_PAGO_LAST_BUSINESS) values[def.key] = DIA_PAGO_LAST_BUSINESS
  else if (String(values[def.key] ?? '') === DIA_PAGO_LAST_BUSINESS || !values[def.key]) {
    values[def.key] = '28'
  }
}

function diaPagoDay(def) {
  const text = String(values[def.key] ?? '')
  return text === DIA_PAGO_LAST_BUSINESS ? '' : text
}
</script>

<template>
  <div class="lp-panel">
    <header class="lp-header">
      <div>
        <h3 class="lp-heading">{{ PANEL_TITLE }}</h3>
        <p class="lp-caption">{{ PANEL_SUBTITLE }}</p>
      </div>
    </header>

    <div class="lp-toolbar">
      <label class="lp-field">
        <span class="lp-label">Vigencia (año)</span>
        <select v-model.number="vigencia" class="lp-input" :disabled="busy">
          <option v-for="year in yearOptions" :key="year" :value="year">{{ year }}</option>
        </select>
      </label>
      <div class="lp-toolbar-actions">
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="busy"
          @click="loadVigencia()"
        >
          Actualizar
        </button>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="busy"
          @click="duplicatePrevious"
        >
          <span v-if="duplicating" class="lp-spinner" aria-hidden="true"></span>
          {{ duplicating ? 'Leyendo…' : 'Duplicar año anterior' }}
        </button>
        <button
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="busy || gridInvalid || missingVigencia"
          @click="handleSave"
        >
          <span v-if="saving" class="lp-spinner" aria-hidden="true"></span>
          {{ saving ? 'Guardando…' : `Guardar ${vigencia}` }}
        </button>
      </div>
    </div>

    <!-- Banner rojo vigencia (§5/§6: "Créela antes de importar/recalcular") -->
    <div v-if="missingVigencia" class="lp-missing" role="alert" aria-live="polite">
      <strong>La vigencia {{ vigencia }} no tiene parámetros.</strong>
      <span v-if="missingMessage" class="lp-missing-detail">{{ missingMessage }}</span>
      <span v-else>Use el botón «Duplicar año anterior» y GUARDE para crearla.</span>
      <span class="lp-missing-note">
        Sin vigencia creada, el importador y el recálculo fallan (error R-05 del backend).
      </span>
    </div>

    <div v-else-if="errorBanner" class="lp-banner" role="alert">
      {{ errorBanner }}
    </div>

    <div v-if="loading" class="lp-placeholder" aria-live="polite">
      <span class="lp-spinner" aria-hidden="true"></span>
      Cargando parámetros de {{ vigencia }}…
    </div>

    <template v-else>
      <section v-for="group in groups" :key="group.name" class="lp-group">
        <h4 class="lp-group-title">{{ group.name }}</h4>
        <div class="lp-grid">
          <div v-for="def in group.defs" :key="def.key" class="lp-cell">
            <label class="lp-cell-label" :for="`lp-${def.key}`">{{ def.label }}</label>

            <select
              v-if="def.type === 'enum' && !def.freeEntry"
              :id="`lp-${def.key}`"
              v-model="values[def.key]"
              class="lp-input"
              :class="{ 'is-invalid': Boolean(keyErrorsFor(def)) }"
              :disabled="busy || missingVigencia"
            >
              <option value="">—</option>
              <option v-for="option in optionsOf(def)" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>

            <div v-else-if="def.type === 'enum' && def.freeEntry" class="lp-dia-pago">
              <select
                :id="`lp-${def.key}`"
                class="lp-input lp-dia-mode"
                :value="diaPagoMode(def)"
                :disabled="busy || missingVigencia"
                @change="setDiaPagoMode(def, $event.target.value)"
              >
                <option value="">—</option>
                <option :value="DIA_PAGO_LAST_BUSINESS">Último día hábil</option>
                <option value="day">Día del mes…</option>
              </select>
              <input
                v-if="diaPagoMode(def) === 'day'"
                class="lp-input lp-dia-day"
                :value="diaPagoDay(def)"
                type="number"
                min="1"
                max="31"
                step="1"
                aria-label="Día del mes"
                :disabled="busy || missingVigencia"
                @input="values[def.key] = $event.target.value"
              />
            </div>

            <input
              v-else
              :id="`lp-${def.key}`"
              v-model="values[def.key]"
              class="lp-input"
              :class="{ 'is-invalid': Boolean(keyErrorsFor(def)) }"
              :type="
                def.type === 'money' || def.type === 'percent'
                  ? 'text'
                  : def.type === 'int'
                    ? 'number'
                    : 'text'
              "
              :inputmode="def.type === 'mmdd' ? 'text' : 'decimal'"
              :placeholder="def.type === 'mmdd' ? 'MM-DD' : ''"
              autocomplete="off"
              :disabled="busy || missingVigencia"
            />

            <span class="lp-suffix" v-if="def.type === 'percent'">%</span>
            <p v-if="keyErrorsFor(def)" class="lp-cell-error" aria-live="polite">
              {{ keyErrorsFor(def) }}
            </p>
          </div>
        </div>
      </section>

      <!-- Tabla ARL I–V (§4.4 BE) -->
      <section class="lp-group">
        <h4 class="lp-group-title">Tarifas ARL por clase de riesgo (anuales, %)</h4>
        <div class="lp-arl-zone">
          <table class="lp-arl-table" aria-label="Tarifas ARL por vigencia">
            <thead>
              <tr>
                <th scope="col">Clase</th>
                <th scope="col">Tasa (%)</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="risk in RISK_CLASS_OPTIONS" :key="risk">
                <th scope="row">{{ risk }}</th>
                <td class="lp-arl-cell">
                  <input
                    v-model="arlDraft[risk]"
                    class="lp-input lp-arl-input"
                    :class="{ 'is-invalid': Boolean(arlErrors[risk]) }"
                    type="text"
                    inputmode="decimal"
                    autocomplete="off"
                    :aria-label="`Tasa ARL clase ${risk}`"
                    :disabled="busy || missingVigencia"
                  />
                  <span v-if="arlErrors[risk]" class="lp-cell-error">{{ arlErrors[risk] }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
/* Mismo lenguaje visual de los paneles de Reglas Financieras (icp-/ptm-). */

.lp-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.lp-header {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
}

.lp-heading {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text-primary, #070707);
}

.lp-caption {
  max-width: 860px;
  margin: 2px 0 0;
  font-size: 0.8rem;
  line-height: 1.45;
  color: var(--color-text-secondary, #555555);
}

.lp-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: flex-end;
  padding: 14px 16px;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 8px;
  background-color: var(--color-surface-card, #ffffff);
}

.lp-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.lp-label {
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--color-text-secondary, #555555);
}

.lp-input {
  min-width: 120px;
  max-width: 260px;
  margin: 0;
  padding: 7px 10px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 6px;
  background-color: var(--color-surface, #f7f7f7);
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-primary, #070707);
  box-sizing: border-box;
}

.lp-input:focus {
  border-color: var(--color-brand, #03658c);
  outline: 2px solid rgba(3, 101, 140, 0.25);
  outline-offset: 0;
}

.lp-input.is-invalid {
  border-color: #c53030;
}

.lp-input:disabled {
  color: var(--color-text-muted, #8a8a8a);
}

.lp-toolbar-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.lp-missing {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border: 1px solid rgba(197, 48, 48, 0.45);
  border-left: 4px solid #c53030;
  border-radius: 8px;
  background-color: rgba(197, 48, 48, 0.09);
  font-size: 0.84rem;
  line-height: 1.5;
  color: #9b2222;
}

:root[data-theme='dark'] .lp-missing {
  color: #ff9b9b;
}

.lp-missing-detail {
  font-weight: 500;
  overflow-wrap: anywhere;
}

.lp-missing-note {
  font-style: italic;
  opacity: 0.85;
}

.lp-banner {
  padding: 10px 12px;
  border: 1px solid rgba(197, 48, 48, 0.35);
  border-left: 4px solid #c53030;
  border-radius: 8px;
  background-color: rgba(197, 48, 48, 0.07);
  font-size: 0.82rem;
  line-height: 1.5;
  color: #9b2222;
  overflow-wrap: anywhere;
}

:root[data-theme='dark'] .lp-banner {
  color: #ff9b9b;
}

.lp-placeholder {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: center;
  padding: 36px 16px;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 8px;
  background-color: var(--color-surface-card, #ffffff);
  font-size: 0.85rem;
  color: var(--color-text-muted, #8a8a8a);
}

.lp-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(120, 120, 120, 0.25);
  border-top-color: var(--color-brand, #03658c);
  border-radius: 50%;
  animation: lp-spin 0.8s linear infinite;
}

@keyframes lp-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .lp-spinner {
    animation-duration: 1.6s;
  }
}

.lp-group {
  padding: 14px 16px;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 8px;
  background-color: var(--color-surface-card, #ffffff);
}

.lp-group-title {
  margin: 0 0 12px;
  font-size: 0.76rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-secondary, #555555);
}

.lp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 12px 16px;
}

.lp-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.lp-cell-label {
  font-size: 0.74rem;
  font-weight: 500;
  color: var(--color-text-secondary, #555555);
}

.lp-cell-error {
  margin: 0;
  font-size: 0.7rem;
  font-weight: 500;
  color: #c53030;
}

:root[data-theme='dark'] .lp-cell-error {
  color: #ff9b9b;
}

.lp-dia-pago {
  display: flex;
  gap: 8px;
  align-items: center;
}

.lp-dia-mode {
  flex: 1;
  min-width: 0;
}

.lp-dia-day {
  width: 74px;
  min-width: 74px;
  max-width: 74px;
}

.lp-suffix {
  font-size: 0.7rem;
  color: var(--color-text-muted, #8a8a8a);
}

.lp-arl-zone {
  max-width: 420px;
}

.lp-arl-table {
  min-width: 100%;
}

.lp-arl-cell {
  text-align: center;
}

.lp-arl-input {
  width: 140px;
  max-width: 140px;
  text-align: right;
}

@media (max-width: 768px) {
  .lp-toolbar-actions {
    margin-left: 0;
  }
}
</style>
