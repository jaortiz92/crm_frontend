<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { budgetFinancingCreditService, classifyFinancingCreditError } from '@/services/budgetFinancingCreditService.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  credit: { type: Object, default: null },
  costCenters: { type: Array, default: () => [] },
  canEdit: { type: Boolean, default: false },
  refreshToken: { type: Number, default: 0 }
})
const emit = defineEmits(['close', 'edit', 'changed'])

const detail = ref(null)
const schedule = ref([])
const total = ref(0)
const page = ref(1)
const PAGE_SIZE = 25
const loading = ref(false)
const errorMessage = ref('')
const actionError = ref('')
const actionMessage = ref('')
const recalculating = ref(false)
const closing = ref(false)
const deleting = ref(false)
const confirmedZeroBalance = ref(false)
const dialogElement = ref(null)
let previouslyFocused = null
const lastPage = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
const warnings = computed(() => {
  const responseWarnings = detail.value?.warnings ?? detail.value?.materialization_warnings
  return Array.isArray(responseWarnings) ? responseWarnings : []
})
const costCenterLabel = computed(() => {
  const source = detail.value || props.credit || {}
  if (source.cost_center_name || source.cost_center_code)
    return `${source.cost_center_code ?? ''} — ${source.cost_center_name ?? ''}`.trim()
  const center = props.costCenters.find(
    (item) => String(item.id_cost_center) === String(source.id_cost_center)
  )
  return center
    ? `${center.cost_center_code ?? ''} — ${center.cost_center_name ?? ''}`.trim()
    : source.id_cost_center != null
      ? `CECO #${source.id_cost_center}`
      : '—'
})

function creditId() {
  return (detail.value || props.credit)?.id_financing_credit ?? props.credit?.id
}

function safeDate(value) {
  if (!value) return '—'
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('es-CO').format(date)
}

function money(value) {
  if (value === null || value === undefined || value === '') return '—'
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)
}

function pick(row, ...keys) {
  for (const key of keys) if (row?.[key] !== undefined && row?.[key] !== null) return row[key]
  return null
}

function warningLabel(warning) {
  if (typeof warning === 'string') return warning
  if (warning?.message) return warning.message
  const year = warning?.year ? `Año ${warning.year}` : ''
  const count = warning?.count ?? warning?.missing_budget_count ?? warning?.unmaterialized_count
  const missing = count == null ? '' : `${count} gastos sin materializar`
  return [year, missing].filter(Boolean).join(' · ') || JSON.stringify(warning)
}

function humanError(error) {
  return classifyFinancingCreditError(error).message
}

async function loadData() {
  const id = creditId()
  if (!props.open || !id) return
  loading.value = true
  errorMessage.value = ''
  try {
    const [detailResponse, scheduleResponse] = await Promise.all([
      budgetFinancingCreditService.getFinancingCredit(id),
      budgetFinancingCreditService.getFinancingSchedule(id, { page: page.value, size: PAGE_SIZE })
    ])
    detail.value = detailResponse?.data ?? null
    const data = scheduleResponse?.data
    schedule.value = Array.isArray(data) ? data : []
    const detailTotal = Number(detail.value?.term_installments)
    total.value = Number.isFinite(detailTotal) && detailTotal >= 0
      ? detailTotal
      : Array.isArray(detail.value?.installments)
        ? detail.value.installments.length
        : 0
  } catch (error) {
    errorMessage.value = humanError(error)
    if (error?.response?.status === 404) {
      detail.value = null
      schedule.value = []
      total.value = 0
    }
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.open, props.credit, props.refreshToken],
  () => {
    if (props.open) {
      page.value = 1
      detail.value = null
      confirmedZeroBalance.value = false
      void loadData()
    }
  },
  { immediate: true }
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
      dialogElement.value?.querySelector('button, input, select')?.focus()
      document.addEventListener('keydown', onDialogKeydown)
    } else {
      document.removeEventListener('keydown', onDialogKeydown)
      previouslyFocused?.focus?.()
    }
  }
)

onBeforeUnmount(() => document.removeEventListener('keydown', onDialogKeydown))

async function goPage(delta) {
  const next = page.value + delta
  if (loading.value || next < 1 || next > lastPage.value) return
  page.value = next
  await loadData()
}

async function recalculate() {
  if (!props.canEdit || recalculating.value || closing.value || deleting.value) return
  recalculating.value = true
  actionError.value = ''
  actionMessage.value = ''
  try {
    const response = await budgetFinancingCreditService.recalculateFinancingCredit(creditId())
    const result = response?.data ?? {}
    actionMessage.value = `Regeneración completada: ${result.replaced_installments ?? '—'} cuotas reemplazadas, ${result.created_installments ?? '—'} creadas; ${result.replaced_budget_lines ?? '—'} líneas de presupuesto reemplazadas y ${result.created_budget_lines ?? '—'} creadas.`
    if (Array.isArray(result.warnings) && result.warnings.length) {
      actionMessage.value += ` Advertencias: ${result.warnings.map((item) => typeof item === 'string' ? item : item.message ?? JSON.stringify(item)).join(' · ')}`
    }
    emit('changed')
    await loadData()
  } catch (error) {
    actionError.value = humanError(error)
  } finally {
    recalculating.value = false
  }
}

async function closeCredit() {
  if (!props.canEdit || closing.value || recalculating.value || deleting.value || !confirmedZeroBalance.value) return
  closing.value = true
  actionError.value = ''
  actionMessage.value = ''
  try {
    await budgetFinancingCreditService.closeFinancingCredit(creditId(), {
      cutoff_date: localToday(),
      remaining_balance: '0.00'
    })
    actionMessage.value = 'Crédito cerrado administrativamente con saldo real cero informado. No se registró un pago ni se realizó conciliación.'
    confirmedZeroBalance.value = false
    emit('changed')
    await loadData()
  } catch (error) {
    actionError.value = humanError(error)
  } finally {
    closing.value = false
  }
}

function confirmDelete() {
  if (!props.canEdit || deleting.value || recalculating.value || closing.value || loading.value) return
  const name = detail.value?.name ?? props.credit?.name ?? `#${creditId()}`
  const confirmed = window.confirm(
    `¿Eliminar DEFINITIVAMENTE el crédito de financiación “${name}”? Esta acción es irreversible.\n\n` +
      'Se eliminarán su calendario, las entradas de financiación futura y SOLO las líneas generadas de interés/seguro. ' +
      'No modifica créditos de facturas ni líneas manuales.\n\n' +
      'Esto NO es “Cerrar”: cerrar con saldo real cero conserva el registro. ¿Desea eliminarlo definitivamente?'
  )
  if (confirmed) void deleteCredit()
}

async function deleteCredit() {
  if (!props.canEdit || deleting.value || recalculating.value || closing.value) return
  deleting.value = true
  actionError.value = ''
  actionMessage.value = ''
  try {
    const response = await budgetFinancingCreditService.deleteFinancingCredit(creditId())
    emit('deleted', response?.data ?? {})
  } catch (error) {
    actionError.value = humanError(error)
  } finally {
    deleting.value = false
  }
}

function localToday() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function close() {
  if (recalculating.value || closing.value || deleting.value) return
  emit('close')
}
</script>

<template>
  <div v-if="open" class="fin-overlay" @mousedown.self="close">
    <section ref="dialogElement" class="fin-dialog" role="dialog" aria-modal="true" aria-labelledby="schedule-title">
      <header class="fin-header">
        <div>
          <h2 id="schedule-title">Financiación empresarial · {{ detail?.name ?? credit?.name ?? 'Detalle' }}</h2>
          <p>Calendario proyectado; no es constancia de pago real.</p>
        </div>
        <button type="button" class="fin-close" aria-label="Cerrar" :disabled="recalculating || closing || deleting" @click="close">×</button>
      </header>
      <div class="fin-body" aria-live="polite">
        <div v-if="loading" class="fin-loading"><span class="fin-spinner" aria-hidden="true"></span>Cargando detalle y calendario desde el backend…</div>
        <div v-else-if="errorMessage" class="fin-error" role="alert"><span>{{ errorMessage }}</span><button type="button" class="btn btn-secondary btn-sm" @click="loadData">Reintentar</button></div>
        <template v-else>
          <section class="fin-section">
            <h3>Condiciones</h3>
            <dl class="fin-details">
              <div><dt>Acreedor</dt><dd>{{ detail?.lender_name ?? credit?.lender_name ?? '—' }}</dd></div>
              <div><dt>Origen</dt><dd><span class="fin-chip">{{ (detail?.origin_type ?? credit?.origin_type) === 'legacy' ? 'Antiguo — desde corte' : 'Nuevo' }}</span></dd></div>
              <div><dt>Estado</dt><dd>{{ detail?.status === 'closed' ? 'Cerrado administrativamente' : 'Activo · Proyectado' }}</dd></div>
              <div><dt>Método</dt><dd>{{ (detail?.method ?? credit?.method) === 'french_fixed_payment' ? 'Cuota fija (francés)' : (detail?.method ?? credit?.method) === 'german_fixed_principal' ? 'Capital fijo (alemán)' : '—' }}</dd></div>
              <div class="fin-detail-wide"><dt>Centro de costo</dt><dd>{{ costCenterLabel }}</dd></div>
              <div><dt>Moneda</dt><dd>{{ detail?.currency ?? credit?.currency ?? 'COP' }}</dd></div>
               <div><dt>Saldo registrado (apertura)</dt><dd>{{ money(detail?.opening_balance ?? credit?.opening_balance) }}</dd></div>
              <div><dt>Fecha de desembolso</dt><dd>{{ safeDate(detail?.disbursement_date ?? credit?.disbursement_date) }}</dd></div>
               <div v-if="(detail?.origin_type ?? credit?.origin_type) === 'legacy'"><dt>Fecha de corte</dt><dd>{{ safeDate(detail?.cutoff_date ?? credit?.cutoff_date) }}</dd></div>
              <div><dt>Tasa anual</dt><dd>{{ detail?.annual_rate ?? credit?.annual_rate ?? '—' }} · {{ detail?.rate_convention ?? credit?.rate_convention ?? 'convención pendiente' }}</dd></div>
              <div><dt>Day-count</dt><dd>{{ detail?.day_count_convention ?? credit?.day_count_convention ?? '—' }}</dd></div>
              <div><dt>Primera cuota</dt><dd>{{ safeDate(detail?.first_due_date ?? credit?.first_due_date) }}</dd></div>
              <div><dt>Revisión del calendario</dt><dd>{{ detail?.schedule_revision ?? credit?.schedule_revision ?? '—' }}</dd></div>
            </dl>
            <p v-if="(detail?.origin_type ?? credit?.origin_type) === 'legacy'" class="fin-cutoff-note" role="note">No se muestran cuotas previas al corte.</p>
          </section>

          <section class="fin-section">
            <h3>Calendario futuro · componentes separados</h3>
            <p class="fin-explainer"><span class="fin-chip">Capital · financiación</span> Salida de financiación; excluida del gasto P&amp;L. <span class="fin-chip fin-chip-expense">Interés / seguro · gasto</span> Gastos presupuestarios; el endpoint de flujo de caja toma los tres componentes del calendario activo una sola vez.</p>
            <div class="fin-table-scroll">
              <table aria-label="Calendario futuro de cuotas de financiación">
                <thead><tr><th scope="col">Cuota</th><th scope="col">Vencimiento capital</th><th scope="col">Capital (financiación)</th><th scope="col">Vencimiento interés</th><th scope="col">Interés (gasto)</th><th scope="col">Vencimiento seguro</th><th scope="col">Seguro (gasto)</th><th scope="col">Saldo después</th><th scope="col">Estado</th></tr></thead>
                <tbody><tr v-for="(row, index) in schedule" :key="pick(row, 'id_financing_credit_installment', 'installment_number') ?? index">
                  <td>{{ pick(row, 'installment_number', 'number') ?? '—' }}</td>
                  <td>{{ safeDate(pick(row, 'principal_due_date')) }}</td><td class="fin-amount">{{ money(pick(row, 'principal_amount')) }}</td>
                  <td>{{ safeDate(pick(row, 'interest_due_date')) }}</td><td class="fin-amount">{{ money(pick(row, 'interest_amount')) }}</td>
                  <td>{{ safeDate(pick(row, 'insurance_due_date')) }}</td><td class="fin-amount">{{ money(pick(row, 'insurance_amount')) }}</td>
                  <td class="fin-amount">{{ money(pick(row, 'closing_balance')) }}</td><td><span class="fin-chip">{{ pick(row, 'projection_status', 'status') ?? 'Proyectado' }}</span></td>
                </tr></tbody>
              </table>
            </div>
            <div v-if="schedule.length" class="fin-pagination">
              <button type="button" class="btn btn-secondary btn-sm" :disabled="page <= 1 || loading" @click="goPage(-1)">← Anterior</button>
              <span aria-live="polite">Página {{ page }} de {{ lastPage }} · {{ total }} cuotas</span>
              <button type="button" class="btn btn-secondary btn-sm" :disabled="page >= lastPage || loading" @click="goPage(1)">Siguiente →</button>
            </div>
            <p v-else class="fin-empty">No hay cuotas futuras devueltas por el backend para este crédito.</p>
          </section>

          <section class="fin-section">
            <h3>Tratamiento en presupuesto</h3>
            <p>Interés y seguro se materializan como gastos presupuestarios separados asociados al CECO. Capital no es una línea de gasto ni forma parte del P&amp;L. El detalle no recompone ni suma schedule sobre ningún flujo de caja.</p>
            <dl class="fin-details fin-component-totals">
               <div><dt>Capital futuro · financiación (no P&amp;L)</dt><dd>{{ money(detail?.totals?.principal) }}</dd></div>
               <div><dt>Intereses futuros · gasto presupuestario</dt><dd>{{ money(detail?.totals?.interest) }}</dd></div>
               <div><dt>Seguro futuro · gasto presupuestario</dt><dd>{{ money(detail?.totals?.insurance) }}</dd></div>
               <div><dt>Salida total proyectada de caja</dt><dd>{{ money(detail?.totals?.total_cash_outflow) }}</dd></div>
            </dl>
            <div v-if="warnings.length" class="fin-warning" role="status"><strong>Advertencias de materialización presupuestaria</strong><ul><li v-for="(warning, index) in warnings" :key="index">{{ warningLabel(warning) }} <RouterLink v-if="warning?.id_budget" :to="{ name: 'BudgetPlanningGrid', params: { idBudget: warning.id_budget } }">Abrir presupuesto</RouterLink></li></ul><p>El calendario pudo guardarse aunque algunos gastos no tengan presupuesto destino; no se afirma que el presupuesto esté actualizado.</p></div>
            <div v-else><strong>{{ detail?.materialized_budget_lines ?? detail?.created_budget_lines ?? '—' }}</strong> líneas de gasto de interés/seguro informadas por el backend.</div>
          </section>

          <section class="fin-section">
            <h3>Trazabilidad</h3>
            <dl class="fin-details">
              <div><dt>Revisión del schedule</dt><dd>{{ detail?.schedule_revision ?? '—' }}</dd></div>
              <div><dt>Origen</dt><dd>{{ detail?.origin_type === 'legacy' ? 'Antiguo — desde corte' : 'Nuevo' }}</dd></div>
              <div v-if="detail?.origin_type === 'legacy'"><dt>Corte observado</dt><dd>{{ safeDate(detail?.cutoff_date) }}</dd></div>
              <div><dt>Creado</dt><dd>{{ detail?.created_at ?? '—' }}</dd></div>
              <div><dt>Actualizado</dt><dd>{{ detail?.updated_at ?? '—' }}</dd></div>
            </dl>
          </section>

          <section class="fin-section fin-open-questions">
            <h3>Decisiones abiertas (no aprobadas)</h3>
            <p>Frecuencia mensual y convención monthly-periodic: defaults del sistema para v1. La convención de tasa nominal/efectiva debe elegirse al editar; regla del seguro pendiente; calendario/días inhábiles pendientes; pagos reales frente a proyección pendiente. Importación masiva, abonos anticipados, gracia, tasa variable y reestructuración fuera de v1.</p>
          </section>
          <div v-if="actionMessage" class="fin-success" role="status">{{ actionMessage }}</div>
          <div v-if="actionError" class="fin-error" role="alert">{{ actionError }}</div>
          <div v-if="canEdit && detail && detail.status !== 'closed'" class="fin-close-confirmation">
            <label><input v-model="confirmedZeroBalance" type="checkbox" /> Confirmo que verifiqué que el saldo real pendiente es cero.</label>
            <p>El cierre solo informa saldo cero y fecha de corte. No registra pago ni concilia movimientos reales.</p>
          </div>
        </template>
      </div>
      <footer class="fin-footer">
        <button type="button" class="btn btn-secondary" :disabled="recalculating || closing || deleting" @click="close">Volver al listado</button>
        <template v-if="canEdit && detail && detail.status !== 'closed'">
          <button type="button" class="btn btn-secondary" :disabled="recalculating || closing || deleting || loading" @click="emit('edit', detail)">Editar condiciones</button>
          <button type="button" class="btn btn-secondary" :disabled="recalculating || closing || deleting || loading" @click="recalculate">{{ recalculating ? 'Regenerando…' : 'Regenerar calendario' }}</button>
           <button type="button" class="btn btn-danger" :disabled="recalculating || closing || deleting || loading || !confirmedZeroBalance" @click="closeCredit">{{ closing ? 'Cerrando…' : 'Cerrar crédito con saldo real cero' }}</button>
        </template>
        <button v-if="canEdit && detail" type="button" class="btn btn-danger" :disabled="recalculating || closing || deleting || loading" @click="confirmDelete">{{ deleting ? 'Eliminando…' : 'Eliminar definitivamente' }}</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.fin-overlay {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--background-transparency, rgba(7, 7, 7, 0.68));
}

.fin-dialog {
  display: flex;
  flex-direction: column;
  width: min(1120px, 98vw);
  min-width: 0;
  max-height: 92vh;
  max-height: 92dvh;
  overflow: hidden;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 12px;
  background: var(--color-surface-card, #fff);
  color: var(--color-text-primary, #111);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
}

.fin-header,
.fin-footer {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  background: var(--color-surface-card, #fff);
}

.fin-header {
  justify-content: space-between;
  border-bottom: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
}

.fin-header > div {
  min-width: 0;
}

.fin-header h2 {
  margin: 0;
  font-size: 1.08rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.fin-header p {
  margin: 4px 0 0;
  color: var(--color-text-secondary, #555);
  font-size: 0.8rem;
  line-height: 1.45;
}

.fin-close {
  display: grid;
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.2));
  border-radius: 7px;
  background: transparent;
  color: inherit;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
}

.fin-close:hover:not(:disabled) {
  background: var(--color-surface, #f7f7f7);
}

.fin-close:focus-visible,
.fin-footer button:focus-visible,
.fin-pagination button:focus-visible {
  outline: 3px solid var(--color-brand, #03658c);
  outline-offset: 2px;
}

.fin-close:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.fin-body {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 16px;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 18px 20px;
  overscroll-behavior: contain;
}

.fin-section {
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.17));
  border-radius: 10px;
  background: var(--color-surface-card, #fff);
}

.fin-section + .fin-section {
  margin-top: 1px;
}

.fin-section h3 {
  margin: 0 0 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  font-size: 1rem;
  line-height: 1.4;
}

.fin-section p {
  color: var(--color-text-secondary, #555);
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.fin-section > p:last-child {
  margin-bottom: 0;
}

.fin-details {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  min-width: 0;
  margin: 0;
}

.fin-details > div {
  display: flex;
  min-width: 0;
  min-height: 68px;
  flex-direction: column;
  justify-content: space-between;
  gap: 8px;
  padding: 11px 12px;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.18));
  border-radius: 8px;
  background: var(--color-surface, #f9f9f9);
}

.fin-details dt {
  color: var(--color-text-secondary, #616161);
  font-size: 0.73rem;
  font-weight: 600;
  line-height: 1.35;
}

.fin-details dd {
  min-width: 0;
  margin: 0;
  color: var(--color-text-primary, #070707);
  font-size: 0.91rem;
  font-weight: 700;
  line-height: 1.4;
  text-align: right;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
  word-break: normal;
}

.fin-details .fin-detail-wide {
  grid-column: span 2;
}

.fin-cutoff-note {
  margin: 10px 0 0;
  padding: 9px 11px;
  border-left: 3px solid var(--color-brand, #03658c);
  border-radius: 4px;
  background: var(--color-surface, #f9f9f9);
  color: var(--color-text-secondary, #555);
  font-size: 0.8rem;
  line-height: 1.45;
}

.fin-component-totals {
  margin: 12px 0;
}

.fin-chip {
  display: inline-block;
  max-width: 100%;
  padding: 3px 8px;
  border: 1px solid rgba(3, 101, 140, 0.24);
  border-radius: 999px;
  background: rgba(3, 101, 140, 0.09);
  color: #075675;
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.fin-chip-expense {
  border-color: rgba(183, 121, 31, 0.3);
  background: rgba(183, 121, 31, 0.1);
  color: #80520e;
}

.fin-explainer {
  margin: 0 0 12px;
  font-size: 0.83rem;
}

.fin-explainer .fin-chip {
  margin: 0 4px 4px 0;
}

.fin-table-scroll {
  max-width: 100%;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.18));
  border-radius: 8px;
  scrollbar-gutter: stable;
}

.fin-table-scroll table {
  width: 100%;
  min-width: 1050px;
  border-collapse: collapse;
  color: var(--color-text-primary, #070707);
  font-size: 0.78rem;
}

.fin-table-scroll th,
.fin-table-scroll td {
  padding: 9px 10px;
  border-bottom: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  text-align: left;
  vertical-align: middle;
  white-space: nowrap;
}

.fin-table-scroll .fin-amount {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.fin-table-scroll th {
  background: var(--color-surface, #f2f4f6);
  color: var(--color-text-secondary, #555);
  font-weight: 700;
}

.fin-table-scroll tbody tr:nth-child(even) {
  background: var(--color-surface, #f9f9f9);
}

.fin-table-scroll tbody tr:last-child td {
  border-bottom: 0;
}

.fin-pagination,
.fin-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.fin-pagination {
  justify-content: center;
  padding-top: 12px;
  color: var(--color-text-secondary, #555);
  font-size: 0.82rem;
}

.fin-footer {
  justify-content: flex-end;
  border-top: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
}

.fin-footer button {
  max-width: 100%;
  white-space: normal;
}

.fin-loading,
.fin-error,
.fin-success,
.fin-warning,
.fin-close-confirmation {
  padding: 12px 14px;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.2));
  border-radius: 8px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.fin-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--color-text-secondary, #555);
}

.fin-spinner {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  border: 2px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-top-color: var(--color-brand, #03658c);
  border-radius: 50%;
  animation: fin-spin 0.8s linear infinite;
}

@keyframes fin-spin {
  to { transform: rotate(360deg); }
}

.fin-error {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-left: 4px solid #b42318;
  background: rgba(180, 35, 24, 0.08);
  color: #8f1d14;
}

.fin-success {
  border-left: 4px solid #218838;
  background: rgba(33, 136, 56, 0.09);
  color: #176b2b;
}

.fin-warning {
  margin-top: 12px;
  border-left: 4px solid #b7791f;
  background: rgba(183, 121, 31, 0.09);
  color: #70480e;
}

.fin-warning ul {
  padding-left: 20px;
}

.fin-warning p {
  margin-bottom: 0;
}

.fin-close-confirmation {
  background: var(--color-surface, #f9f9f9);
}

.fin-close-confirmation label {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-weight: 600;
}

.fin-close-confirmation input {
  flex: 0 0 auto;
  margin-top: 3px;
}

.fin-close-confirmation p {
  margin: 7px 0 0;
  font-size: 0.82rem;
}

.fin-empty {
  margin: 12px 0 0;
  color: var(--color-text-secondary, #555);
  font-size: 0.85rem;
}

.fin-open-questions p {
  margin: 0;
}

:global(:root[data-theme='dark']) .fin-chip {
  border-color: rgba(106, 196, 227, 0.32);
  background: rgba(26, 138, 191, 0.2);
  color: #a9e5fa;
}

:global(:root[data-theme='dark']) .fin-chip-expense {
  border-color: rgba(240, 180, 41, 0.35);
  background: rgba(240, 180, 41, 0.13);
  color: #ffd27a;
}

:global(:root[data-theme='dark']) .fin-error {
  color: #ffb3b3;
}

:global(:root[data-theme='dark']) .fin-warning {
  color: #ffd27a;
}

:global(:root[data-theme='dark']) .fin-success {
  color: #9ce1ac;
}

@media (max-width: 900px) {
  .fin-details {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 600px) {
  .fin-overlay {
    align-items: stretch;
    padding: 8px;
  }

  .fin-dialog {
    width: 100%;
    max-height: calc(100vh - 16px);
    max-height: calc(100dvh - 16px);
    border-radius: 9px;
  }

  .fin-header,
  .fin-footer {
    padding: 12px;
  }

  .fin-header h2 {
    font-size: 0.98rem;
  }

  .fin-body {
    gap: 12px;
    padding: 12px;
  }

  .fin-section {
    padding: 12px;
  }

  .fin-details {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }

  .fin-details .fin-detail-wide {
    grid-column: auto;
  }

  .fin-details > div {
    min-height: 0;
  }

  .fin-footer {
    justify-content: stretch;
  }

  .fin-footer button {
    flex: 1 1 100%;
  }

  .fin-pagination {
    justify-content: space-between;
  }
}
</style>
