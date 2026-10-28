<script setup>
/**
 * InitialBalanceModal — configuración de los saldos iniciales (Efectivo y
 * Bodega) de un escenario ya creado (FE-S7-INITBAL, RF-FE-03; autoridad
 * `frontend.03_22` + `backend.02_25` §5). Misma forma co-editable de
 * RF-FE-01: dos bloques independientes con radios exclusivos
 * `carryover` ("Continuar con el presupuesto meta del año anterior") y
 * `manual` ("Agregar manualmente" + input numérico).
 *
 * Ciclo: al abrir lee la config VIGENTE de la caché del store
 * (`initialBalance` — el editor ya la precargó vía GET) y, si el modo
 * vigente es `carryover` con fuente, muestra el valor DERIVADO (RF-FE-04,
 * motor `cashFlowPivot` sobre los datos del escenario fuente; nunca se
 * persiste) como "Tomará este valor: X (derivado de {budget_name})" — §5:
 * valor efectivo solo-lectura para evitar confusiones (riesgo R-S7-2).
 *
 * Validaciones RF-FE-07: bodega manual exige >= 0 (error inline, bloquea el
 * submit — espejo del 422 del BE); efectivo manual permite negativos; con
 * modos `carryover` el valor manual NO viaja editable. Degradación RF-FE-05:
 * `unavailable_reason === "no_source"` ⇒ chip warning literal y el input
 * manual queda usable (el valor efectivo será el del manual).
 *
 * Confirmación §5: cambiar el modo de un saldo a `manual` pide confirmación
 * (alertService.generalQuestion) porque re-encaja el valor derivado con uno
 * manual. Guardar ⇒ PUT (`store.saveInitialBalance`) ⇒ 200 con el detalle
 * completo (el store lo fusiona) ⇒ toast de éxito ⇒ close (la vista Flujo
 * re-seedea por reactividad — RF-FE-03 "refetch re-seed"). 422 del BE ⇒
 * banner inline con el mensaje textual.
 */
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useBudgetScenarioStore } from '@/stores/budgetScenarioStore.js'
import { alertService } from '@/services/alertService.js'
import { formatMoney } from '@/components/budget/planning/planningFormat.js'

const props = defineProps({
  open: { type: Boolean, required: true },
  idBudget: { type: [Number, String], required: true }
})

const emit = defineEmits(['close'])

const scenarioStore = useBudgetScenarioStore()

const attempted = ref(false)
const serverError = ref(null)
/** SD7-FE-1 (1b): guard de hidratación para el watch de modos. */
const hydrating = ref(false)

/**
 * Form local co-editable (`mode` + `manual` como string del input numérico;
 * el backend guarda NUMERIC — se normaliza con `Number()` al emitir).
 * @type {{ cash: {mode: string, manual: string}, warehouse: {mode: string, manual: string} }}
 */
const form = reactive({
  cash: { mode: 'manual', manual: '0' },
  warehouse: { mode: 'manual', manual: '0' }
})

const ib = computed(() => scenarioStore.initialBalance)

/** Shaping del GET vigente (solo lectura): fuente y degradación. */
const config = computed(() => (ib.value.loaded ? ib.value.data : null))
const carryoverSource = computed(() =>
  config.value?.carryover_source && typeof config.value.carryover_source === 'object'
    ? config.value.carryover_source
    : null
)
// V1.1 (backend.02_25 SD7-10): la única señal de indisponibilidad es
// `unavailable_reason === "no_source"`; la fuente viaja resuelta SIEMPRE
// (también con ambos modos manual), así que `carryover_source === null` NO
// es degradación (defecto del 126 en v1.0: falsa advertencia con ambos
// manual + fuente). El criterio está centralizado: este modal solo mira
// `noSource` (que es el getter del store + esta local).
const noSource = computed(() => config.value?.unavailable_reason === 'no_source')

/** Valores derivados por el motor (RF-FE-04) — anclados a la fuente. */
const derivedCash = computed(() =>
  ib.value.derivedSourceId === Number(carryoverSource.value?.id_budget) &&
  Number.isFinite(ib.value.derivedCash)
    ? ib.value.derivedCash
    : null
)
const derivedWarehouse = computed(() =>
  ib.value.derivedSourceId === Number(carryoverSource.value?.id_budget) &&
  Number.isFinite(ib.value.derivedWarehouse)
    ? ib.value.derivedWarehouse
    : null
)

const NO_SOURCE_MESSAGE =
  'Sin presupuesto meta del año anterior con saldo calculable. Registre el saldo manualmente.'

/** ¿El input manual de cada lado debe estar habilitado? (RF-FE-01/05) */
const cashInputEnabled = computed(
  () => form.cash.mode === 'manual' || (form.cash.mode === 'carryover' && noSource.value)
)
const warehouseInputEnabled = computed(
  () => form.warehouse.mode === 'manual' || (form.warehouse.mode === 'carryover' && noSource.value)
)

/** RF-FE-07: bodega ≥ 0 (espejo del 422 del BE); campos numéricos finitos. */
function parseManual(side) {
  const value = Number(String(side.manual).trim().replace(',', '.'))
  return Number.isFinite(value) ? value : NaN
}

const warehouseError = computed(() => {
  // Igual en degradación carryover-sin-fuente (el manual es el valor efectivo).
  if (!warehouseInputEnabled.value) return ''
  const value = parseManual(form.warehouse)
  if (Number.isNaN(value)) return 'Ingrese un valor numérico válido.'
  if (value < 0) return 'El saldo inicial de bodega no puede ser negativo.'
  return ''
})

const cashError = computed(() => {
  if (!cashInputEnabled.value) return ''
  return Number.isNaN(parseManual(form.cash)) ? 'Ingrese un valor numérico válido.' : ''
})

const canSave = computed(() => !scenarioStore.initialBalance.saving && !warehouseError.value)

const cashPreview = computed(() => {
  if (form.cash.mode === 'carryover') {
    if (carryoverSource.value && derivedCash.value !== null) {
      return `${formatMoney(derivedCash.value)} (derivado de ${carryoverSource.value.budget_name})`
    }
    if (carryoverSource.value) return 'Derivando del presupuesto meta del año anterior…'
    // Degradación RF-FE-05: el valor efectivo será el del manual.
    return `${formatMoney(safeManual(form.cash))} (manual)`
  }
  return `${formatMoney(safeManual(form.cash))} (manual)`
})

const warehousePreview = computed(() => {
  if (form.warehouse.mode === 'carryover') {
    if (carryoverSource.value && derivedWarehouse.value !== null) {
      return `${formatMoney(derivedWarehouse.value)} (derivado de ${carryoverSource.value.budget_name})`
    }
    if (carryoverSource.value) return 'Derivando del presupuesto meta del año anterior…'
  }
  const value = Number.isFinite(parseManual(form.warehouse)) ? parseManual(form.warehouse) : 0
  return `${formatMoney(value)} (manual)`
})

function safeManual(side) {
  const value = Number(side.manual)
  return Number.isFinite(value) ? value : 0
}

/**
 * Cambio de radio a `manual` (§5): PIDE CONFIRMACIÓN — si el usuario cancela,
 * el radio vuelve a `carryover`. Los cambios `carryover` (desde manual) no
 * piden confirmación (no re-encaja nada).
 * @param {'cash'|'warehouse'} sides
 */
function onModeChange(side) {
  const target = side === 'cash' ? form.cash : form.warehouse
  if (target.mode !== 'manual') return
  alertService
    .generalQuestion(
      side === 'cash' ? 'Saldo inicial de efectivo' : 'Saldo inicial de bodega',
      'Pasará a capturar el saldo Manualmente: el valor derivado del presupuesto meta del ' +
        'año anterior dejará de usarse. ¿Continuar?'
    )
    .then((response) => {
      if (!response?.isConfirmed) {
        target.mode = 'carryover'
      }
    })
}

/* ─────────────── Abrir: precarga desde la config del GET ─────────────── */

function hydrateForm() {
  // SD7-FE-1 (1b): durante la precarga el guard evita que el watch de modos
  // dispare re-fetch/derivación por los cambios programáticos.
  hydrating.value = true
  const data = ib.value.data
  const cashMode = data?.cash?.mode === 'carryover' ? 'carryover' : 'manual'
  const warehouseMode = data?.warehouse?.mode === 'carryover' ? 'carryover' : 'manual'
  form.cash.mode = cashMode
  form.warehouse.mode = warehouseMode
  form.cash.manual = String(Number(data?.cash?.manual_value ?? 0))
  form.warehouse.manual = String(Number(data?.warehouse?.manual_value ?? 0))
  void nextTick().then(() => {
    hydrating.value = false
  })
}

/**
 * SD7-FE-1 (1b): al cambiar cualquier radio a `carryover` DENTRO del modal
 * (config del store aún manual / fuentes no resueltas / GET rancio), el GET
 * se re-pide FORZADO (v1.1: resuelve `carryover_source` siempre) y la
 * derivación se disparada inmediatamente (`refreshInitialBalanceAvailability`):
 * el preview "Tomará este valor: X (derivado de …)" recobra su número; si la
 * derivación tarda, "Derivando del presupuesto meta del año anterior…" se
 * muestra mientras (`deriving` del store) y el resultado queda cacheado
 * en `derivedCash`/`derivedWarehouse`.
 */
watch(
  () => [form.cash.mode, form.warehouse.mode],
  () => {
    if (hydrating.value) return
    if (form.cash.mode !== 'carryover' && form.warehouse.mode !== 'carryover') return
    void scenarioStore.refreshInitialBalanceAvailability(props.idBudget)
  }
)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    attempted.value = false
    serverError.value = null
    hydrateForm()
    if (!ib.value.loaded && !ib.value.loading) {
      void scenarioStore.fetchInitialBalance(props.idBudget, true)
    }
  }
)

function tryClose() {
  if (scenarioStore.initialBalance.saving) return
  emit('close')
}

/* ────────────────────────────── Guardar ───────────────────────────── */

async function handleSave() {
  attempted.value = true
  if (!canSave.value) return
  serverError.value = null
  // RF-FE-07 + BR-IB-08: efectivo negativo PERMITIDO; bodega NO (mirror 422).
  if (Number.isNaN(parseManual(form.cash)) || Number.isNaN(parseManual(form.warehouse))) return
  if (form.warehouse.mode === 'manual' && parseManual(form.warehouse) < 0) return

  const payload = {
    cash: { mode: form.cash.mode, manual_value: parseManual(form.cash) },
    warehouse: { mode: form.warehouse.mode, manual_value: parseManual(form.warehouse) }
  }
  const result = await scenarioStore.saveInitialBalance(props.idBudget, payload)
  if (result.ok) {
    await alertService.generalSucces('Saldos iniciales actualizados.')
    emit('close')
    return
  }
  if (result.kind === 'busy' || result.kind === 'auth') return
  serverError.value = result.kind === 'validation' ? { message: result.message } : result
}

function onOverlayMousedown(event) {
  if (event.target === event.currentTarget) tryClose()
}
</script>

<template>
  <div v-if="open" class="ib-modal-overlay" @mousedown="onOverlayMousedown">
    <div
      class="ib-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ib-modal-title"
      tabindex="-1"
    >
      <header class="ib-modal-header">
        <div>
          <h3 id="ib-modal-title" class="ib-modal-title">Saldo inicial</h3>
          <p class="ib-modal-subtitle">
            Define por separado de dónde sale el saldo inicial de efectivo y de bodega de este
            escenario.
          </p>
        </div>
        <button
          type="button"
          class="ib-x"
          aria-label="Cerrar"
          :disabled="scenarioStore.initialBalance.saving"
          @click="tryClose"
        >
          ✕
        </button>
      </header>

      <div class="ib-modal-body">
        <div v-if="ib.loading" class="ib-loading">Cargando configuración actual…</div>
        <div v-else-if="ib.error" class="ib-error-inline" role="alert">
          <span>No se pudo cargar la configuración de saldos iniciales.</span>
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            @click="scenarioStore.fetchInitialBalance(props.idBudget, true)"
          >
            Reintentar
          </button>
        </div>

        <template v-else>
          <!-- ==================== Saldo inicial de efectivo ==================== -->
          <fieldset class="ib-block">
            <legend class="ib-block-title">Saldo inicial de efectivo</legend>
            <label class="ib-radio">
              <input
                v-model="form.cash.mode"
                type="radio"
                name="ib-cash-mode"
                value="carryover"
                :disabled="ib.saving"
              />
              <span>Continuar con el presupuesto meta del año anterior</span>
            </label>
            <p v-if="form.cash.mode === 'carryover' && noSource" class="ib-warning" role="status">
              {{ NO_SOURCE_MESSAGE }}
            </p>
            <label class="ib-radio">
              <input
                v-model="form.cash.mode"
                type="radio"
                name="ib-cash-mode"
                value="manual"
                :disabled="ib.saving"
                @change="onModeChange('cash')"
              />
              <span>Agregar manualmente</span>
            </label>
            <div class="ib-manual-row">
              <input
                v-model="form.cash.manual"
                class="ib-input"
                :class="{ 'is-invalid': attempted && cashError }"
                type="number"
                step="any"
                :disabled="ib.saving || !cashInputEnabled"
                :aria-label="'Valor manual del saldo inicial de efectivo'"
              />
              <p v-if="cashError" class="ib-field-error" aria-live="polite">{{ cashError }}</p>
            </div>
            <p class="ib-preview">
              Tomará este valor: <strong>{{ cashPreview }}</strong>
            </p>
          </fieldset>

          <!-- ==================== Saldo inicial de bodega ==================== -->
          <fieldset class="ib-block">
            <legend class="ib-block-title">Saldo inicial de bodega</legend>
            <label class="ib-radio">
              <input
                v-model="form.warehouse.mode"
                type="radio"
                name="ib-warehouse-mode"
                value="carryover"
                :disabled="ib.saving"
              />
              <span>Continuar con el presupuesto meta del año anterior</span>
            </label>
            <p
              v-if="form.warehouse.mode === 'carryover' && noSource"
              class="ib-warning"
              role="status"
            >
              {{ NO_SOURCE_MESSAGE }}
            </p>
            <label class="ib-radio">
              <input
                v-model="form.warehouse.mode"
                type="radio"
                name="ib-warehouse-mode"
                value="manual"
                :disabled="ib.saving"
              />
              <span>Agregar manualmente</span>
            </label>
            <div class="ib-manual-row">
              <input
                v-model="form.warehouse.manual"
                class="ib-input"
                :class="{ 'is-invalid': attempted && warehouseError }"
                type="number"
                step="any"
                :disabled="ib.saving || !warehouseInputEnabled"
                :aria-label="'Valor manual del saldo inicial de bodega'"
              />
              <p v-if="warehouseError" class="ib-field-error" aria-live="polite">
                {{ warehouseError }}
              </p>
            </div>
            <p class="ib-preview">
              Tomará este valor: <strong>{{ warehousePreview }}</strong>
            </p>
          </fieldset>

          <p class="ib-note">
            El valor por arrastre se recalcula con el presupuesto meta del año anterior en cada
            lectura (no se guarda una cifra congelada). Este ajuste es independiente de la casilla
            «Arrastrar saldos» de la Vista Flujo.
          </p>

          <div v-if="serverError" class="ib-error-inline" role="alert" aria-live="assertive">
            <span>
              {{ serverError.message || 'El servidor rechazó la solicitud. Revisa los valores.' }}
            </span>
          </div>
        </template>
      </div>

      <footer class="ib-modal-footer">
        <button
          type="button"
          class="btn btn-secondary"
          :disabled="scenarioStore.initialBalance.saving"
          @click="tryClose"
        >
          Cancelar
        </button>
        <button
          type="button"
          class="btn btn-primary"
          :class="{ 'is-busy': scenarioStore.initialBalance.saving }"
          :disabled="!canSave"
          @click="handleSave"
        >
          <span v-if="scenarioStore.initialBalance.saving" class="ib-spinner"></span>
          {{ scenarioStore.initialBalance.saving ? 'Guardando…' : 'Guardar' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
/* Reutiliza el idioma visual del BudgetIngestionModal (prefijo propio). */
.ib-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background-color: var(--background-transparency, rgba(7, 7, 7, 0.55));
}

.ib-modal {
  display: flex;
  flex-direction: column;
  width: min(560px, 96vw);
  max-height: min(90vh, 760px);
  overflow: hidden;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 10px;
  background-color: var(--color-surface-card, #ffffff);
  color: var(--color-text-primary, #070707);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
}

.ib-modal-header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
}

.ib-modal-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.ib-modal-subtitle {
  margin: 2px 0 0;
  font-size: 0.78rem;
  color: var(--color-text-muted, #8a8a8a);
}

.ib-x {
  flex-shrink: 0;
  padding: 6px 8px;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--color-text-muted, #8a8a8a);
  cursor: pointer;
}

.ib-modal-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  padding: 16px 20px;
}

.ib-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 12px 14px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 8px;
}

.ib-block-title {
  padding: 0 6px;
  font-size: 0.76rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-secondary, #555555);
}

.ib-radio {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 0.82rem;
}

.ib-manual-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 260px;
}

.ib-input {
  width: 100%;
  margin: 0;
  padding: 8px 10px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 6px;
  background-color: var(--color-surface, #f7f7f7);
  font-size: 0.84rem;
  color: var(--color-text-primary, #070707);
}

.ib-input:disabled {
  opacity: 0.55;
}

.ib-input.is-invalid {
  border-color: #c53030;
}

.ib-field-error {
  margin: 0;
  font-size: 0.76rem;
  font-weight: 500;
  color: #c53030;
}

:root[data-theme='dark'] .ib-field-error {
  color: #ff8f8f;
}

.ib-preview {
  margin: 2px 0 0;
  font-size: 0.76rem;
  color: var(--color-text-secondary, #555555);
}

.ib-preview strong {
  font-variant-numeric: tabular-nums;
}

.ib-warning {
  margin: 0;
  padding: 8px 10px;
  border: 1px solid rgba(180, 83, 9, 0.35);
  border-left: 4px solid #b45309;
  border-radius: 6px;
  background-color: rgba(180, 83, 9, 0.08);
  font-size: 0.76rem;
  color: #b45309;
}

.ib-note {
  margin: 0;
  font-size: 0.74rem;
  color: var(--color-text-muted, #8a8a8a);
}

.ib-loading {
  font-size: 0.82rem;
  color: var(--color-text-secondary, #555555);
}

.ib-error-inline {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid rgba(197, 48, 48, 0.35);
  border-left: 4px solid #c53030;
  border-radius: 6px;
  background-color: rgba(197, 48, 48, 0.07);
  font-size: 0.8rem;
  color: #9b2222;
}

.ib-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  background-color: var(--color-surface, #f7f7f7);
}

.ib-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(120, 120, 120, 0.25);
  border-top-color: var(--color-brand, #03658c);
  border-radius: 50%;
  animation: ib-spin 0.8s linear infinite;
}

@keyframes ib-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
