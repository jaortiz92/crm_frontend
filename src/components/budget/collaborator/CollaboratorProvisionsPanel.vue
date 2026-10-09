<script setup>
/**
 * CollaboratorProvisionsPanel — saldos provisionados de un colaborador
 * (FE-S15-COLLAB §5; contrato espejo backend.02_21 §9:
 * `GET /budget/collaborator/{id}/provisions` ⇒
 * `{balances:[{component_code, accrued, paid, balance}]}`).
 *
 * Presentación (§5/§7): TRES cards PRIMA / CESANTÍAS / INTERESES con lo
 * causado (accrued), lo pagado por el motor (paid) y el SALDO — D-FE15-1:
 * cero cálculo; el saldo ES `balance` del BE (la resta visible viene del
 * servidor, BR-10/D-S11-3). Cada card muestra la PRÓXIMA FECHA LEGAL como
 * texto informativo del calendario legal (espejo §5.3 BE: 30/06-20/12 ·
 * ≤14/02 · ≤31/01) — presentación, no cálculo monetario; la fecha real de
 * cada asiento la exhibe el desglose.
 *
 * Vacío elegante (§5): prestación de servicios ⇒ "solo honorarios, cero
 * provisiones legales" (A-14); terminado ⇒ sin saldos pendientes; activo
 * dependiente sin causación aún ⇒ "aún no hay provisiones".
 */
import { computed, ref, watch } from 'vue'
import {
  budgetCollaboratorService,
  classifyCollaboratorError
} from '@/services/budgetCollaboratorService.js'
import { formatCOP } from '@/components/budget/planning/planningFormat.js'
import { PROVISION_CARDS, nextLegalDateText } from './componentLabels.js'

const props = defineProps({
  open: { type: Boolean, required: true },
  collaborator: { type: Object, default: null },
  refreshToken: { type: Number, default: 0 }
})

const emit = defineEmits(['close'])

const loading = ref(false)
const balances = ref([])
const errorMessage = ref('')

const isService = computed(() => props.collaborator?.contract_type === 'service_provision')
const isTerminated = computed(() => props.collaborator?.status === 'terminated')

const emptyReason = computed(() => {
  if (isService.value) {
    return 'Prestación de servicios: el motor solo causa honorarios (C1S) — sin seguridad social, parafiscales ni provisiones legales (A-14).'
  }
  if (isTerminated.value) {
    return 'Contrato terminado: los saldos pendientes pasaron a la liquidación (LIQ) del mes del término. No quedan provisiones abiertas.'
  }
  return 'Aún no hay provisiones causadas para este colaborador: el motor las acumula desde el primer mes con días causados.'
})

/** @param {string} code @returns {object|null} balance del BE (espejo §9). */
function balanceFor(code) {
  return balances.value.find((item) => String(item?.component_code).toUpperCase() === code) ?? null
}

const cards = computed(() =>
  PROVISION_CARDS.map((card) => {
    const raw = balanceFor(card.code)
    return {
      ...card,
      accrued: raw ? Number(raw.accrued) : null,
      paid: raw ? Number(raw.paid) : null,
      balance: raw ? Number(raw.balance) : null,
      nextLegal: nextLegalDateText(card.mmdd)
    }
  })
)

const hasAny = computed(() => cards.value.some((card) => card.accrued !== null))

async function load() {
  if (!props.open || !props.collaborator?.id_collaborator) return
  if (isService.value) {
    balances.value = []
    return
  }
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await budgetCollaboratorService.fetchProvisions(
      props.collaborator.id_collaborator
    )
    balances.value = Array.isArray(response?.data?.balances) ? response.data.balances : []
  } catch (err) {
    balances.value = []
    const result = classifyCollaboratorError(err)
    if (result.kind === 'forbidden') {
      errorMessage.value =
        result.message || 'No tiene permiso para ver las provisiones de este colaborador.'
    } else if (result.kind === 'network') {
      errorMessage.value = 'Sin conexión con el servidor. Reintente.'
    } else {
      errorMessage.value = result.message || 'No se pudieron cargar las provisiones.'
    }
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.open, props.collaborator?.id_collaborator],
  () => {
    if (props.open) void load()
  },
  { immediate: true }
)

watch(
  () => props.refreshToken,
  () => {
    if (props.open) void load()
  }
)

function onOverlayMousedown(event) {
  if (event.target === event.currentTarget) emit('close')
}
</script>

<template>
  <div v-if="open" class="pv-overlay" @mousedown="onOverlayMousedown">
    <div
      class="pv-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="provisions-title"
      tabindex="-1"
    >
      <header class="pv-header">
        <div class="pv-header-text">
          <h3 id="provisions-title" class="pv-title">
            Provisiones — {{ props.collaborator?.full_name || 'Colaborador' }}
          </h3>
          <p class="pv-subtitle">
            Causado acumulado − pagado por el motor = saldo (D-S11-3). Saldos del backend: aquí no
            se calcula nada.
          </p>
        </div>
        <button type="button" class="pv-x" aria-label="Cerrar ventana" @click="emit('close')">
          ✕
        </button>
      </header>

      <div class="pv-body">
        <div v-if="loading" class="pv-loading" aria-live="polite">
          <span class="pv-spinner" aria-hidden="true"></span>
          Cargando provisiones…
        </div>

        <p v-else-if="errorMessage" class="pv-banner" role="alert">{{ errorMessage }}</p>

        <div v-else-if="isService || (isTerminated && !hasAny)" class="pv-empty">
          <span class="pv-empty-icon" aria-hidden="true">🗂</span>
          <p class="pv-empty-text">{{ emptyReason }}</p>
        </div>

        <template v-else>
          <div v-if="!hasAny" class="pv-empty">
            <span class="pv-empty-icon" aria-hidden="true">🌱</span>
            <p class="pv-empty-text">{{ emptyReason }}</p>
          </div>
          <div class="pv-cards" :class="{ 'is-dim': !hasAny }">
            <article v-for="card in cards" :key="card.code" class="pv-card">
              <header class="pv-card-head">
                <h4 class="pv-card-title">{{ card.title }}</h4>
                <span class="pv-card-code" aria-hidden="true">{{ card.code }}</span>
              </header>
              <dl class="pv-card-data">
                <div class="pv-line">
                  <dt>Causado acumulado</dt>
                  <dd>{{ formatCOP(card.accrued) }}</dd>
                </div>
                <div class="pv-line">
                  <dt>Pagado (motor)</dt>
                  <dd>{{ formatCOP(card.paid) }}</dd>
                </div>
                <div class="pv-line pv-line-balance">
                  <dt>Saldo</dt>
                  <dd>{{ formatCOP(card.balance) }}</dd>
                </div>
              </dl>
              <footer class="pv-card-foot">
                <span class="pv-legal-label">Próximo pago legal</span>
                <span class="pv-legal-date">{{ card.nextLegal }}</span>
                <span class="pv-legal-schedule">{{ card.schedule }}</span>
              </footer>
            </article>
          </div>
          <p class="pv-footnote">
            Las fechas de pago efectivas de cada asiento (30/06, 20/12, ≤31/01, ≤14/02 del año
            siguiente) las fija el motor: véalas en [Desglose].
          </p>
        </template>
      </div>

      <footer class="pv-footer">
        <button type="button" class="btn btn-secondary btn-sm" @click="emit('close')">
          Cerrar
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.pv-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background-color: var(--background-transparency, rgba(7, 7, 7, 0.55));
}

.pv-dialog {
  display: flex;
  flex-direction: column;
  width: min(860px, 96vw);
  max-height: min(88vh, 780px);
  overflow: hidden;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 10px;
  background-color: var(--color-surface-card, #ffffff);
  color: var(--color-text-primary, #070707);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
  outline: none;
  animation: pv-pop 0.22s cubic-bezier(0.23, 1, 0.32, 1);
}

@keyframes pv-pop {
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
  .pv-dialog {
    animation: none;
  }
}

.pv-header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
}

.pv-header-text {
  flex: 1;
  min-width: 0;
}

.pv-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.pv-subtitle {
  margin: 2px 0 0;
  font-size: 0.74rem;
  color: var(--color-text-muted, #8a8a8a);
}

.pv-x {
  padding: 6px 8px;
  border: none;
  border-radius: 6px;
  background: none;
  font-size: 0.95rem;
  color: var(--color-text-muted, #8a8a8a);
  cursor: pointer;
}

.pv-x:hover:not(:disabled) {
  background-color: rgba(120, 120, 120, 0.12);
  color: var(--color-text-primary, #070707);
}

.pv-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  padding: 16px 20px;
}

.pv-loading {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: center;
  padding: 30px 8px;
  font-size: 0.84rem;
  color: var(--color-text-muted, #8a8a8a);
}

.pv-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(120, 120, 120, 0.25);
  border-top-color: var(--color-brand, #03658c);
  border-radius: 50%;
  animation: pv-spin 0.8s linear infinite;
}

@keyframes pv-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .pv-spinner {
    animation-duration: 1.6s;
  }
}

.pv-banner {
  margin: 0;
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

:root[data-theme='dark'] .pv-banner {
  color: #ff9b9b;
}

.pv-empty {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  padding: 34px 12px;
  text-align: center;
}

.pv-empty-icon {
  font-size: 1.6rem;
}

.pv-empty-text {
  max-width: 560px;
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.55;
  color: var(--color-text-secondary, #555555);
}

.pv-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 14px;
}

.pv-cards.is-dim {
  margin-top: 6px;
  opacity: 0.55;
}

.pv-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 10px;
  background-color: var(--color-surface, #f7f7f7);
}

:root[data-theme='dark'] .pv-card {
  background-color: rgba(255, 255, 255, 0.04);
}

.pv-card-head {
  display: flex;
  gap: 8px;
  align-items: baseline;
  justify-content: space-between;
}

.pv-card-title {
  margin: 0;
  font-size: 0.86rem;
  font-weight: 600;
  color: var(--color-text-primary, #070707);
}

.pv-card-code {
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--color-text-muted, #8a8a8a);
}

.pv-card-data {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
}

.pv-line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.78rem;
}

.pv-line dt {
  color: var(--color-text-secondary, #555555);
}

.pv-line dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-primary, #070707);
}

.pv-line-balance {
  padding-top: 4px;
  border-top: 1px dashed var(--color-border-strong, rgba(97, 97, 97, 0.3));
  font-weight: 700;
}

.pv-line-balance dd {
  color: #b45309;
}

:root[data-theme='dark'] .pv-line-balance dd {
  color: #fbbf24;
}

.pv-card-foot {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  align-items: baseline;
  padding-top: 6px;
  border-top: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  font-size: 0.7rem;
}

.pv-legal-label {
  color: var(--color-text-muted, #8a8a8a);
}

.pv-legal-date {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-primary, #070707);
}

.pv-legal-schedule {
  width: 100%;
  font-style: italic;
  color: var(--color-text-muted, #8a8a8a);
}

.pv-footnote {
  margin: 0;
  font-size: 0.72rem;
  line-height: 1.5;
  color: var(--color-text-muted, #8a8a8a);
}

.pv-footer {
  display: flex;
  justify-content: flex-end;
  padding: 12px 20px;
  border-top: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  background-color: var(--color-surface, #f7f7f7);
}

:root[data-theme='dark'] .pv-footer {
  background-color: rgba(255, 255, 255, 0.03);
}
</style>
