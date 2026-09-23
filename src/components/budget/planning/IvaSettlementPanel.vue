<script setup>
/**
 * IvaSettlementPanel — "Liquidación IVA" del escenario (FE-S14-IVA
 * frontend.03_14 §5; consume `GET /budget/iva/settlement/{idBudget}?year=` —
 * contrato autoridad `backend.02_20` §4.6).
 *
 * Es la ÚNICA superficie del FE que muestra cifras IVA del BACKEND (D-FE14-4:
 * la recurrencia bimestral con arrastre de saldos a favor no se recalcula en
 * cliente para evitar divergencia). Todo lo demás del panel es presentación
 * de esa respuesta:
 *  - tabla por período: generado | desglose descontable de 4 conceptos
 *    (`fixed_expenses`, `variable_expenses`, `import_vat`,
 *    `nationalization_vat` — backend.02_20 §4.5) | saldo anterior | base |
 *    PAGO (destacado, con su `payment_due_date`) | arrastre;
 *  - fila Totales con el objeto `totals` del BE — OJO: la clave descontable
 *    llega grafiada `deductable` (sic §4.6); jamás inventar `deductible`;
 *  - bucket `unassigned` (eventos fuera de todo rango del calendario, §4.4):
 *    aviso ámbar con sus sumas — NO participa de la recurrencia;
 *  - warning LITERAL de `meta.warnings` "No IVA calendar for {year};
 *    configure /budget/iva-period" con CTA al tab Reglas Financieras →
 *    Calendario IVA (D-FE14-5);
 *  - chip "Proyectado (base caja)" (`basis === 'cash'`) y tasa efectiva
 *    leída de `tax_rate_used` cuando existe (D-FE14-6 — única fuente del BE;
 *    sin respuesta se degrada a `IVA_RATE` de `planningFormat`).
 *
 * Reactividad (frontend.03_14 §4.2): la fuente es `budgetPlanningStore
 * .settlement` — el editor la pide al abrir, `scheduleSettlementRefresh()`
 * la invalida debounced tras mutaciones de líneas/calendario y "Recalcular"
 * la fuerza (`fetchIvaSettlement(id, { force: true })`). CERO requests desde
 * aquí fuera de esas vías.
 *
 * Degradación (NFR-FE14-3): error de red en el settlement ⇒ bloque "sin
 * dato de liquidación" + botón Reintentar; en vuelo ⇒ spinner; sin
 * calendario ⇒ periods: [] con el warning + CTA (nunca pantalla rota).
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useBudgetPlanningStore } from '@/stores/budgetPlanningStore.js'
import { formatMoney, formatDateEs, IVA_RATE } from './planningFormat.js'

const props = defineProps({
  /** Escenario dueño de la liquidación (padre: `BudgetGridEditor`). */
  idBudget: { type: [Number, String], required: true }
})

const router = useRouter()
const budgetPlanningStore = useBudgetPlanningStore()

/** Caché viva del store (patrón `carryover`: SOLO lee; mutar = acciones). */
const settlement = computed(() => budgetPlanningStore.settlement)
const data = computed(() => settlement.value.data)

const year = computed(() => data.value?.year ?? settlement.value.year ?? null)

/**
 * Tasa mostrada: `tax_rate_used` de la respuesta cuando existe y es finita
 * (D-FE14-6: el BE manda en la liquidación); fallback la constante espejo.
 */
const taxRate = computed(() => {
  const raw = Number(data.value?.tax_rate_used)
  return Number.isFinite(raw) && raw > 0 ? raw : IVA_RATE
})
const taxRateLabel = computed(() => `${Number((taxRate.value * 100).toFixed(2))} %`)

/** Chip de base — el contrato §4.6 fija `basis: "cash"` (proyectado). */
const basisLabel = computed(() => (data.value?.basis === 'cash' ? 'Proyectado (base caja)' : ''))

/* ─────────────── Filas de la tabla (derivación pura de `periods[]`) ─────────────── */

const DEDUCTIBLE_KEYS = [
  { key: 'fixed_expenses', label: 'Gastos fijos (E2)' },
  { key: 'variable_expenses', label: 'Gastos variables (E3/E4)' },
  { key: 'import_vat', label: 'IVA de importación (E5)' },
  { key: 'nationalization_vat', label: 'IVA de internación (E6)' }
]

/** Σ de un dict concepto→monto (`generated` solo trae `ventas` hoy). */
function sumBreakdown(bucket) {
  if (!bucket || typeof bucket !== 'object') return 0
  let total = 0
  for (const value of Object.values(bucket)) {
    const num = Number(value)
    if (Number.isFinite(num)) total += num
  }
  return total
}

/** Tooltip desglosado `concepto: monto` por línea (evita comas de miles). */
function breakdownTitle(bucket, entries) {
  if (!bucket || typeof bucket !== 'object') return ''
  return entries
    .map((entry) => `${entry.label}: ${formatMoney(Number(bucket[entry.key]) || 0)}`)
    .join(' · ')
}

const periodRows = computed(() => {
  const periods = Array.isArray(data.value?.periods) ? data.value.periods : []
  return periods.map((period) => {
    const generated = sumBreakdown(period?.generated)
    const deductible = sumBreakdown(period?.deductible)
    const payment = Number(period?.payment)
    const carry = Number(period?.carry_balance)
    return {
      id: `${period?.period_no ?? 'p'}-${period?.date_from ?? ''}`,
      periodNo: period?.period_no ?? null,
      dateFrom: period?.date_from ?? null,
      dateTo: period?.date_to ?? null,
      dueDate: period?.payment_due_date ?? null,
      description: period?.description ?? '',
      generated,
      generatedTitle: breakdownTitle(period?.generated, [
        { key: 'ventas', label: 'Ventas (E1)' }
      ]),
      deductible,
      deductibleParts: DEDUCTIBLE_KEYS.map((entry) => ({
        ...entry,
        value: Number(period?.deductible?.[entry.key]) || 0
      })),
      deductibleTitle: breakdownTitle(period?.deductible, DEDUCTIBLE_KEYS),
      priorBalance: Number(period?.prior_balance) || 0,
      taxBase: Number(period?.tax_base) || 0,
      payment: Number.isFinite(payment) ? payment : 0,
      carryBalance: Number.isFinite(carry) ? carry : 0,
      eventsCount: Number(period?.events_count) || 0
    }
  })
})

/** Fila Totales: los objetos `totals`/`unassigned` del BE mandan (§4.6). */
const totals = computed(() => {
  const raw = data.value?.totals
  if (!raw || typeof raw !== 'object') return null
  return {
    generated: Number(raw.generated) || 0,
    // CLAVE LITERAL DEL CONTRATO: `deductable` (sic backend.02_20 §4.6).
    deductable: Number(raw.deductable) || 0,
    payments: Number(raw.payments) || 0,
    finalBalance: Number(raw.final_balance) || 0
  }
})

/** Bucket `unassigned` con datos (aviso aparte; NO entra a la recurrencia). */
const unassigned = computed(() => {
  const raw = data.value?.unassigned
  if (!raw || typeof raw !== 'object') return null
  const generated = Number(raw.generated) || 0
  const deductible = Number(raw.deductible) || 0
  const eventsCount = Number(raw.events_count) || 0
  if (!eventsCount && !generated && !deductible) return null
  return { generated, deductible, eventsCount }
})

/* ───────────────────────── Warnings y CTA ───────────────────────── */

/** `meta.warnings` (array de strings literales del BE, §4.6). */
const warnings = computed(() => {
  const raw = data.value?.meta?.warnings
  return Array.isArray(raw) ? raw.filter((item) => typeof item === 'string' && item) : []
})

/** Warning "sin calendario" (backend.02_20 §4.4) ⇒ dispara el CTA. */
const noCalendarWarning = computed(() =>
  warnings.value.some((warning) => /no iva calendar/i.test(warning))
)

/**
 * CTA al catálogo (D-FE14-5: el calendario es dato de compañía y se
 * administra en Reglas Financieras → tab Calendario IVA; el query `tab` lo
 * preselecciona en `BudgetRulesView`).
 */
function goIvaCalendar() {
  router.push({ name: 'BudgetRules', query: { tab: 'iva' } })
}

/* ───────────────────────── Acciones de datos ───────────────────────── */

/** "Recalcular" (frontend.03_14 §4.2) ⇒ refetch forzado del settlement. */
function recalculate() {
  void budgetPlanningStore.fetchIvaSettlement(props.idBudget, { force: true })
}

/** ¿Algún período con desembolso? (destacado del pago, §5). */
const hasPayments = computed(() => periodRows.value.some((row) => row.payment > 0))
</script>

<template>
  <div class="isp-zone">
    <header class="isp-header">
      <div class="isp-heading">
        <h4 class="isp-title">
          Liquidación de IVA
          <span v-if="data?.budget_name" class="isp-sub">{{ data.budget_name }}</span>
          <span v-else class="isp-sub">escenario {{ idBudget }}</span>
          <span v-if="year" class="isp-sub">· {{ year }}</span>
        </h4>
        <p class="isp-caption">
          Recaudo generado y descuentos disponibles por período del Calendario IVA, con la
          recurrencia de arrastre de saldos a favor. Cifras del motor de liquidación del servidor:
          se recalculan solas al editar líneas o “Recalcular”.
        </p>
      </div>
      <div class="isp-header-actions">
        <span v-if="basisLabel" class="isp-chip isp-chip-info">{{ basisLabel }}</span>
        <span class="isp-chip isp-chip-rate">Tasa {{ taxRateLabel }}</span>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="settlement.loading"
          @click="recalculate"
        >
          <span v-if="settlement.loading" class="isp-spinner" aria-hidden="true"></span>
          {{ settlement.loading ? 'Recalculando…' : 'Recalcular' }}
        </button>
      </div>
    </header>

    <!-- Error de red/5xx (NFR-FE14-3): nota + reintento, nunca pantalla rota. -->
    <div v-if="settlement.error && !settlement.loading" class="isp-error" role="alert">
      <span>
        Sin dato de liquidación: no fue posible consultar el motor de IVA. Verifique su conexión
        e inténtelo de nuevo.
      </span>
      <button type="button" class="btn btn-secondary btn-sm" @click="recalculate">Reintentar</button>
    </div>

    <!-- Primer fetch -->
    <div v-else-if="!data && settlement.loading" class="isp-placeholder" aria-live="polite">
      <span class="isp-spinner" aria-hidden="true"></span>
      Calculando la liquidación…
    </div>

    <template v-else-if="data">
      <!-- Warnings literales del BE (§4.6 `meta.warnings`) con CTA al calendario -->
      <div v-if="warnings.length" class="isp-warnings" role="status" aria-live="polite">
        <p v-for="warning in warnings" :key="warning" class="isp-warning">
          {{ warning }}
          <button
            v-if="noCalendarWarning && /iva-period/i.test(warning)"
            type="button"
            class="isp-cta"
            @click="goIvaCalendar"
          >
            Configurar Calendario IVA →
          </button>
        </p>
      </div>

      <!-- Estado "sin calendario": periods: [] + warning arriba (nunca error). -->
      <p v-if="!periodRows.length" class="isp-empty">
        Aún no hay períodos asignados: configure el Calendario IVA del año {{ year ?? '—' }} en
        Reglas Financieras → Calendario IVA y la liquidación se dibujará aquí.
      </p>

      <template v-else>
        <div class="isp-scroll">
          <table class="isp-table" aria-label="Liquidación de IVA por período del calendario">
            <thead>
              <tr>
                <th class="isp-col-num">P.N.º</th>
                <th>Rango</th>
                <th>Vencimiento</th>
                <th class="isp-col-money">Generado</th>
                <th class="isp-col-money" title="Desglose descontable por concepto (E2–E6)">
                  Descontable
                </th>
                <th class="isp-col-money isp-col-part">Gastos fijos</th>
                <th class="isp-col-money isp-col-part">Gastos variables</th>
                <th class="isp-col-money isp-col-part">Importación</th>
                <th class="isp-col-money isp-col-part">Internación</th>
                <th class="isp-col-money">Saldo anterior</th>
                <th class="isp-col-money">Base</th>
                <th class="isp-col-money">Pago</th>
                <th class="isp-col-money">Arrastre</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in periodRows" :key="row.id">
                <td class="isp-cell-center">{{ row.periodNo ?? '—' }}</td>
                <td class="isp-cell-date">
                  {{ formatDateEs(row.dateFrom) }} – {{ formatDateEs(row.dateTo) }}
                  <span v-if="row.description" class="isp-desc" :title="row.description">
                    · {{ row.description }}
                  </span>
                </td>
                <td class="isp-cell-date">{{ formatDateEs(row.dueDate) }}</td>
                <td class="isp-cell-money" :title="row.generatedTitle || undefined">
                  {{ formatMoney(row.generated) }}
                </td>
                <td class="isp-cell-money" :title="row.deductibleTitle || undefined">
                  {{ formatMoney(row.deductible) }}
                </td>
                <td
                  v-for="part in row.deductibleParts"
                  :key="part.key"
                  class="isp-cell-money isp-cell-part"
                  :title="`${part.label}: ${formatMoney(part.value)}`"
                >
                  {{ part.value === 0 ? '·' : formatMoney(part.value) }}
                </td>
                <td class="isp-cell-money">
                  {{ row.priorBalance === 0 ? '·' : formatMoney(row.priorBalance) }}
                </td>
                <td class="isp-cell-money">{{ formatMoney(row.taxBase) }}</td>
                <!-- Monto a pagar destacado en su `payment_due_date` (§5). -->
                <td class="isp-cell-money isp-cell-payment" :class="{ 'is-due': row.payment > 0 }">
                  <template v-if="row.payment > 0">
                    <span class="isp-payment-amount">{{ formatMoney(row.payment) }}</span>
                    <span class="isp-payment-due">vence {{ formatDateEs(row.dueDate) }}</span>
                  </template>
                  <template v-else>{{ formatMoney(row.payment) }}</template>
                </td>
                <td class="isp-cell-money">
                  {{ row.carryBalance === 0 ? '·' : formatMoney(row.carryBalance) }}
                </td>
              </tr>
            </tbody>
            <!-- Fila Totales: el objeto `totals` del BE (clave `deductable`, §4.6). -->
            <tfoot v-if="totals">
              <tr>
                <th class="isp-cell-center" colspan="3">Totales</th>
                <td class="isp-cell-money">{{ formatMoney(totals.generated) }}</td>
                <td class="isp-cell-money" title="Σ descontable (clave BE `deductable`)">
                  {{ formatMoney(totals.deductable) }}
                </td>
                <td class="isp-cell-money isp-cell-part">—</td>
                <td class="isp-cell-money isp-cell-part">—</td>
                <td class="isp-cell-money isp-cell-part">—</td>
                <td class="isp-cell-money isp-cell-part">—</td>
                <td class="isp-cell-money">—</td>
                <td class="isp-cell-money">—</td>
                <td class="isp-cell-money isp-cell-payment">{{ formatMoney(totals.payments) }}</td>
                <td class="isp-cell-money" title="Saldo a favor final (arrastre al cierre)">
                  {{ formatMoney(totals.finalBalance) }}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <p v-if="hasPayments" class="isp-note">
          El pago de cada período se desembolsa en su fecha de vencimiento y aparece como bloque
          “Pago de liquidación de IVA” en la Vista Flujo (los pagos se dibujan en el mes del
          vencimiento).
        </p>

        <!-- Bucket `unassigned` (§4.4): eventos fuera de todo rango ⇒ aviso, no
             participan de la recurrencia. -->
        <div v-if="unassigned" class="isp-warn" role="status">
          {{ unassigned.eventsCount }} evento(s) con fecha fuera del calendario del año
          {{ year ?? '—' }} no participan de la recurrencia (generado
          {{ formatMoney(unassigned.generated) }} · descontable
          {{ formatMoney(unassigned.deductible) }}). Ajuste los rangos del Calendario IVA para
          cubrirlos.
        </div>
      </template>
    </template>

    <!-- Nunca cargado (escenario sin settlement aún): reintento disponible. -->
    <div v-else class="isp-placeholder">
      <span>Sin dato de liquidación todavía.</span>
      <button type="button" class="btn btn-secondary btn-sm" @click="recalculate">
        Consultar ahora
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Mismo lenguaje de paneles del editor (prefijo isp-* propio, tokens del repo). */

.isp-zone {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.isp-header {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
  padding: 14px 16px;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 8px;
  background-color: var(--color-surface-card, #ffffff);
}

.isp-heading {
  min-width: 0;
}

.isp-title {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--color-text-primary, #070707);
}

.isp-sub {
  margin-left: 4px;
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--color-text-muted, #8a8a8a);
}

.isp-caption {
  max-width: 720px;
  margin: 4px 0 0;
  font-size: 0.78rem;
  line-height: 1.45;
  color: var(--color-text-secondary, #555555);
}

.isp-header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
}

/* Chips AA: info (azul brand suave) y tasa (verde). */
.isp-chip {
  padding: 3px 10px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
}

.isp-chip-info {
  border-color: rgba(20, 161, 217, 0.45);
  background-color: rgba(20, 161, 217, 0.1);
  color: #14718f;
}

:root[data-theme='dark'] .isp-chip-info {
  color: #7fd4ef;
}

.isp-chip-rate {
  border-color: rgba(46, 164, 79, 0.45);
  background-color: rgba(46, 164, 79, 0.1);
  color: #22683a;
}

:root[data-theme='dark'] .isp-chip-rate {
  color: #7bd89a;
}

/* Estados */

.isp-placeholder {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 8px;
  background-color: var(--color-surface-card, #ffffff);
  font-size: 0.85rem;
  color: var(--color-text-muted, #8a8a8a);
}

.isp-error {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border: 1px solid rgba(197, 48, 48, 0.35);
  border-left: 4px solid #c53030;
  border-radius: 8px;
  background-color: rgba(197, 48, 48, 0.07);
  font-size: 0.84rem;
  line-height: 1.5;
  color: #9b2222;
}

:root[data-theme='dark'] .isp-error {
  color: #ff9b9b;
}

.isp-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(120, 120, 120, 0.25);
  border-top-color: var(--color-brand, #03658c);
  border-radius: 50%;
  animation: isp-spin 0.8s linear infinite;
}

@keyframes isp-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .isp-spinner {
    animation-duration: 1.6s;
  }
}

/* Warnings literales del BE + CTA */

.isp-warnings {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.isp-warning {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  margin: 0;
  padding: 8px 12px;
  border: 1px solid rgba(180, 83, 9, 0.4);
  border-left: 4px solid #b7791f;
  border-radius: 8px;
  background-color: rgba(245, 158, 11, 0.1);
  font-size: 0.78rem;
  line-height: 1.5;
  color: #96590a;
  overflow-wrap: anywhere;
}

:root[data-theme='dark'] .isp-warning {
  color: #f6c177;
}

.isp-cta {
  padding: 4px 10px;
  border: 1px solid rgba(180, 83, 9, 0.55);
  border-radius: 999px;
  background-color: transparent;
  font-size: 0.74rem;
  font-weight: 600;
  color: inherit;
  cursor: pointer;
  white-space: nowrap;
}

.isp-cta:hover {
  background-color: rgba(245, 158, 11, 0.14);
}

.isp-warn {
  margin: 0;
  padding: 8px 12px;
  border: 1px solid rgba(180, 83, 9, 0.4);
  border-radius: 8px;
  background-color: rgba(245, 158, 11, 0.1);
  font-size: 0.78rem;
  line-height: 1.5;
  color: #96590a;
}

:root[data-theme='dark'] .isp-warn {
  color: #f6c177;
}

.isp-empty {
  margin: 0;
  padding: 22px 16px;
  border: 1px dashed var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 8px;
  font-size: 0.84rem;
  color: var(--color-text-muted, #8a8a8a);
  text-align: center;
}

/* Tabla de períodos */

.isp-scroll {
  overflow: auto;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 8px;
  background-color: var(--color-surface-card, #ffffff);
  max-height: 62vh;
}

.isp-table {
  min-width: 1180px;
  border: none;
  border-radius: 0;
  box-shadow: none;
  font-size: 0.78rem;
}

.isp-table thead th {
  position: sticky;
  top: 0;
  z-index: 3;
  color: var(--color-text-primary, #070707);
}

.isp-table tfoot th,
.isp-table tfoot td {
  position: sticky;
  bottom: 0;
  z-index: 2;
  font-weight: 700;
  background-color: var(--color-surface, #f7f7f7);
}

:root[data-theme='dark'] .isp-table tfoot th,
:root[data-theme='dark'] .isp-table tfoot td {
  background-color: rgba(255, 255, 255, 0.05);
}

.isp-col-num {
  min-width: 56px;
}

.isp-col-money {
  min-width: 128px;
  text-align: right;
}

.isp-col-part {
  min-width: 118px;
  font-size: 0.7rem;
}

.isp-cell-money {
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}

.isp-cell-center {
  text-align: center;
}

.isp-cell-part {
  color: var(--color-text-secondary, #555555);
}

.isp-cell-date {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.isp-desc {
  color: var(--color-text-muted, #8a8a8a);
}

/* Pago destacado (monto a pagar en `payment_due_date`, §5). */
.isp-cell-payment {
  font-weight: 600;
}

.isp-cell-payment.is-due {
  background-color: rgba(46, 164, 79, 0.08);
}

:root[data-theme='dark'] .isp-cell-payment.is-due {
  background-color: rgba(46, 164, 79, 0.14);
}

.isp-payment-amount {
  display: block;
  font-variant-numeric: tabular-nums;
}

.isp-payment-due {
  display: block;
  font-size: 0.66rem;
  font-weight: 600;
  font-style: italic;
  white-space: nowrap;
  color: #22683a;
}

:root[data-theme='dark'] .isp-payment-due {
  color: #7bd89a;
}

.isp-note {
  margin: 0;
  font-size: 0.76rem;
  line-height: 1.45;
  color: var(--color-text-secondary, #555555);
}
</style>
