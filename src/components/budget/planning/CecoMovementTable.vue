<script setup>
/**
 * CecoMovementTable — tabla TABULAR del drill-down de movimientos por CECO
 * (FE-S16 / spec `frontend.03_19` RF-5 + REVISIÓN 2 RF-8.3/RF-8.4).
 *
 * Una fila por movimiento (forma común normalizada del CECO, ya filtrada por
 * la vista): los 4 orígenes del REVISIÓN 2 (base + nómina what-if +
 * financiación what-if + capital/desembolsos).
 *  - RF-5.1: columnas N° de línea, cuenta/categoría (`cost_component_code`),
 *    tipo (chip con los colores del módulo), comportamiento, ORIGEN (chip
 *    Presupuesto/Nómina/Financiación/Capital/Desembolso — RF-8.4; el motor
 *    materializado del escenario activo aparece como Presupuesto, AC-12),
 *    descripción (con META DEL MOTOR en segunda línea: nómina ⇒ colaborador
 *    y componente; financiación/capital/desembolsos ⇒ crédito y cuota del
 *    payload — `movementMetaText`), mes de causación, mes de pago (o '—') y
 *    monto según `ivaMode` (RF-4.4: `movementAmount` — el MISMO helper del
 *    pivote; neto en Causado D-FE14-7, según flag en Flujo; capital/
 *    desembolsos crudo SIEMPRE — RF-8.6).
 *  - RF-5.2: sincronizada 1:1 con los filtros de la vista (la vista pasa el
 *    dataset ya filtrado como prop) y footer con el total de la selección.
 *  - RF-5.3: ordenamiento asc/desc por click en encabezado, 100 % cliente,
 *    LOCAL a esta instancia (no afecta al pivote ni a la otra tab).
 *
 * Clave de fila: `movementKey` de la forma común (las líneas de motor no
 * tienen `id_budget_line` real; las sintéticas nunca colisionan con las de
 * presupuesto). Cero HTTP: presentación pura desde la caché (RF-7.1).
 */
import { computed, reactive } from 'vue'
import { useBudgetPlanningStore } from '@/stores/budgetPlanningStore.js'
import {
  BEHAVIOR_LABELS,
  LINE_TYPE_LABELS,
  MONTH_LABELS,
  formatMoneyPlain,
  monthIndexOf
} from './planningFormat.js'
import {
  SOURCE_KIND_LABELS,
  SOURCE_KINDS,
  movementAmount,
  movementMetaText
} from './cecoMovements.js'

const props = defineProps({
  /**
   * Movimientos DEL CECO (forma común) ya filtrados por la vista (RF-6.2,
   * sincronía 1:1).
   */
  lines: { type: Array, required: true },
  /** Tab activo (`TAB_CAUSED` | `TAB_FLOW`): define la base del monto. */
  tab: { type: String, required: true }
})

const budgetPlanningStore = useBudgetPlanningStore()

const ivaActive = computed(() => budgetPlanningStore.ivaMode === true)

/* ─── chips de tipo (mismo lenguaje de color de `BudgetLineGrid`) ─── */

const LINE_CHIP_CLASS_BY_TYPE = {
  income: 'cmt-chip-income',
  expense: 'cmt-chip-expense',
  purchase: 'cmt-chip-purchase'
}

/* ─── chips de ORIGEN (RF-8.4): tono propio por fuente de movimiento ─── */

/** Clase de chip por origen (base/presupuesto usa el neutro gray-blue). */
const ORIGIN_CHIP_CLASS_BY_KIND = {
  base: 'cmt-chip-origin-base',
  payroll: 'cmt-chip-origin-payroll',
  financing: 'cmt-chip-origin-financing',
  principal: 'cmt-chip-origin-principal',
  disbursement: 'cmt-chip-origin-disbursement'
}

/** Etiqueta legible del ORIGEN del movimiento (RF-8.4); fallback base. */
function originLabel(line) {
  return SOURCE_KIND_LABELS[line?.source_kind ?? SOURCE_KINDS.BASE] ?? 'Presupuesto'
}

/** Tooltip del chip de origen (motor/no materializado + simulación). */
function originTitle(line) {
  const kind = line?.source_kind ?? SOURCE_KINDS.BASE
  const engine = line?.source_engine ? ` (motor: ${line.source_engine})` : ''
  const simulated = line?.is_simulated ? ' · what-if (no materializado)' : ''
  const limit = kind === 'principal' || kind === 'disbursement' ? ' · solo caja, nunca P&G' : ''
  return `${SOURCE_KIND_LABELS[kind] ?? kind}${engine}${simulated}${limit}`
}

/* ─── columnas y ordenamiento (RF-5.3; espejo del patrón sort del grid) ─── */

const SORT_COLUMNS = [
  { key: 'lineNo', label: 'N° línea' },
  { key: 'categoria', label: 'Cuenta/Categoría' },
  { key: 'line_type', label: 'Tipo' },
  { key: 'behavior_type', label: 'Comportamiento' },
  { key: 'origen', label: 'Origen' },
  { key: 'description', label: 'Descripción' },
  { key: 'budget_date', label: 'Mes de causación' },
  { key: 'payment_date', label: 'Mes de pago' },
  { key: 'monto', label: 'Monto' }
]

const SORT_ACCESSORS = {
  lineNo: (line) => Number(line.id_budget_line) || 0,
  categoria: (line) => line.cost_component_code || '',
  line_type: (line) => LINE_TYPE_LABELS[line.line_type] || line.line_type || '',
  behavior_type: (line) => BEHAVIOR_LABELS[line.behavior_type] ?? line.behavior_type ?? '',
  origen: (line) => originLabel(line),
  description: (line) => line.description || '',
  budget_date: (line) => line.budget_date || '',
  payment_date: (line) => line.payment_date || '',
  monto: (line) => movementAmount(line, props.tab, ivaActive.value)
}

const sort = reactive({ key: '', asc: true })

function sortBy(key) {
  if (sort.key === key) {
    sort.asc = !sort.asc
    return
  }
  sort.key = key
  sort.asc = true
}

const ariaSort = (key) => (sort.key !== key ? undefined : sort.asc ? 'ascending' : 'descending')

/** Flechas del encabezado (mismos paths del patrón del módulo). */
const SORT_ARROW_UP_PATH =
  'M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z'
const SORT_ARROW_DOWN_PATH =
  'M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z'

/** Filas ordenadas (copia; `props.lines` y el pivote NUNCA se mutan). */
const sortedLines = computed(() => {
  if (!sort.key) return props.lines
  const accessor = SORT_ACCESSORS[sort.key]
  if (!accessor) return props.lines
  const factor = sort.asc ? 1 : -1
  return [...props.lines].sort((a, b) => {
    const x = accessor(a)
    const y = accessor(b)
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * factor
    return String(x).localeCompare(String(y), 'es') * factor
  })
})

/** Total de la selección (footer) con el MISMO monto que celda y pivote. */
const selectionTotal = computed(() => {
  let total = 0
  for (const line of props.lines) {
    const amount = movementAmount(line, props.tab, ivaActive.value)
    if (Number.isFinite(amount)) total += amount
  }
  return total
})

/** Monto formateado de la fila (plain COP sin símbolo; '—' si no finito). */
function moneyText(line) {
  const amount = movementAmount(line, props.tab, ivaActive.value)
  return Number.isFinite(amount) ? formatMoneyPlain(amount) : '—'
}

/** Mes legible de una fecha ISO: `Ene 2026`; '—' si no parsea. */
function monthLabelOf(value) {
  const index = monthIndexOf(value)
  if (index < 0) return '—'
  const plain = String(value ?? '').match(/^(\d{4})/)
  return plain ? `${MONTH_LABELS[index]} ${plain[1]}` : MONTH_LABELS[index]
}
</script>

<template>
  <div class="cmt-scroll">
    <table class="cmt-table" aria-label="Movimientos del CECO, una fila por línea">
      <thead>
        <tr>
          <th
            v-for="column in SORT_COLUMNS"
            :key="column.key"
            class="cmt-th"
            :class="{ 'cmt-th-money': column.key === 'monto' }"
            :aria-sort="ariaSort(column.key)"
            @click="sortBy(column.key)"
          >
            <span class="cmt-th-content">
              {{ column.label }}
              <svg
                v-if="sort.key === column.key"
                class="cmt-arrow"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fill-rule="evenodd"
                  clip-rule="evenodd"
                  :d="sort.asc ? SORT_ARROW_UP_PATH : SORT_ARROW_DOWN_PATH"
                />
              </svg>
            </span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="line in sortedLines" :key="line.movementKey ?? line.id_budget_line">
          <td class="cmt-cell-num">{{ line.id_budget_line ?? '—' }}</td>
          <td class="cmt-cell-cat" :title="line.cost_component_code || ''">
            {{ line.cost_component_code || '—' }}
          </td>
          <td>
            <span class="cmt-chip" :class="LINE_CHIP_CLASS_BY_TYPE[line.line_type] || 'cmt-chip'">{{
              LINE_TYPE_LABELS[line.line_type] || line.line_type || '—'
            }}</span>
          </td>
          <td class="cmt-cell-behavior">
            {{ BEHAVIOR_LABELS[line.behavior_type] ?? line.behavior_type ?? '—' }}
          </td>
          <td class="cmt-cell-origin">
            <span
              class="cmt-chip"
              :class="ORIGIN_CHIP_CLASS_BY_KIND[line.source_kind ?? 'base'] || 'cmt-chip'"
              :title="originTitle(line)"
            >
              {{ originLabel(line) }}
            </span>
          </td>
          <td class="cmt-cell-desc">
            <span class="cmt-desc-main" :title="line.description || ''">{{
              line.description || '—'
            }}</span>
            <span v-if="movementMetaText(line)" class="cmt-desc-meta">{{
              movementMetaText(line)
            }}</span>
          </td>
          <td class="cmt-cell-date">{{ monthLabelOf(line.budget_date) }}</td>
          <td class="cmt-cell-date">
            {{ line.payment_date ? monthLabelOf(line.payment_date) : '—' }}
          </td>
          <td class="cmt-cell-money">{{ moneyText(line) }}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <td colspan="8" class="cmt-foot-label">Σ Total de la selección</td>
          <td class="cmt-cell-money cmt-foot-total">{{ formatMoneyPlain(selectionTotal) }}</td>
        </tr>
      </tfoot>
    </table>
  </div>
</template>

<style scoped>
.cmt-scroll {
  overflow: auto;
  max-height: 45vh;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 8px;
  background-color: var(--color-surface-card, #ffffff);
}

.cmt-table {
  min-width: 1080px;
  font-size: 0.78rem;
}

.cmt-th {
  cursor: pointer;
  white-space: nowrap;
}

.cmt-th:hover {
  color: #cfe9ff;
}

.cmt-th-content {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  justify-content: center;
}

.cmt-arrow {
  width: 14px;
  height: 14px;
}

.cmt-cell-num,
.cmt-cell-date {
  font-variant-numeric: tabular-nums;
  text-align: center;
  white-space: nowrap;
}

.cmt-cell-money {
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
  font-weight: 600;
}

.cmt-cell-cat,
.cmt-cell-origin {
  max-width: 220px;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Descripción: dos líneas apiladas (texto del motor + meta del motor). */
.cmt-cell-desc {
  max-width: 220px;
  overflow: hidden;
  text-align: left;
}

.cmt-desc-main {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cmt-desc-meta {
  display: block;
  overflow: hidden;
  font-size: 0.66rem;
  color: var(--color-text-muted, #8a8a8a);
  text-overflow: ellipsis;
  white-space: nowrap;
}

:root[data-theme='dark'] .cmt-desc-meta {
  color: #9aa4ad;
}

.cmt-cell-behavior {
  white-space: nowrap;
}

.cmt-foot-label,
.cmt-foot-total {
  position: sticky;
  bottom: 0;
  font-weight: 700;
  background-color: var(--color-surface, #f7f7f7);
}

.cmt-foot-label {
  text-align: right;
  padding-right: 10px;
}

:root[data-theme='dark'] .cmt-foot-label,
:root[data-theme='dark'] .cmt-foot-total {
  background-color: rgba(255, 255, 255, 0.05);
}

/* ─── Chip de tipo: misma familia de color del módulo (BudgetLineGrid) ─── */

.cmt-chip {
  display: inline-block;
  padding: 2px 8px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 600;
  white-space: nowrap;
}

.cmt-chip-income {
  border-color: rgba(46, 164, 79, 0.45);
  background-color: rgba(46, 164, 79, 0.1);
  color: #22683a;
}

:root[data-theme='dark'] .cmt-chip-income {
  color: #7bd89a;
}

.cmt-chip-expense {
  border-color: rgba(197, 48, 48, 0.35);
  background-color: rgba(197, 48, 48, 0.08);
  color: #9b2222;
}

:root[data-theme='dark'] .cmt-chip-expense {
  color: #ff9b9b;
}

/* Chip de compra (familia ámbar del módulo). */
.cmt-chip-purchase {
  border-color: rgba(180, 83, 9, 0.4);
  background-color: rgba(245, 158, 11, 0.1);
  color: #96590a;
}

:root[data-theme='dark'] .cmt-chip-purchase {
  color: #f6c177;
}

/* ─── Chips de ORIGEN (RF-8.4): tono por fuente del movimiento ─── */

/* Presupuesto (base): azul-gris del módulo, el neutro "default". */
.cmt-chip-origin-base {
  border-color: rgba(3, 101, 140, 0.35);
  background-color: rgba(3, 101, 140, 0.07);
  color: var(--color-brand, #03658c);
}

:root[data-theme='dark'] .cmt-chip-origin-base {
  color: #56c8ee;
}

/* Nómina what-if: verde suave ( familia "proyección positiva"). */
.cmt-chip-origin-payroll {
  border-color: rgba(46, 164, 79, 0.35);
  background-color: rgba(46, 164, 79, 0.08);
  color: #22683a;
}

:root[data-theme='dark'] .cmt-chip-origin-payroll {
  color: #7bd89a;
}

/* Financiación what-if (intereses/seguros): rojo suave (es expense). */
.cmt-chip-origin-financing {
  border-color: rgba(197, 48, 48, 0.3);
  background-color: rgba(197, 48, 48, 0.07);
  color: #9b2222;
}

:root[data-theme='dark'] .cmt-chip-origin-financing {
  color: #ff9b9b;
}

/* Capital de financiación: violeta suave (salida de caja, no gasto P&G). */
.cmt-chip-origin-principal {
  border-color: rgba(107, 78, 189, 0.4);
  background-color: rgba(107, 78, 189, 0.1);
  color: #5b3fb0;
}

:root[data-theme='dark'] .cmt-chip-origin-principal {
  color: #c3adee;
}

/* Desembolso de financiación: entrada de caja (verde azulado). */
.cmt-chip-origin-disbursement {
  border-color: rgba(14, 132, 123, 0.4);
  background-color: rgba(14, 132, 123, 0.1);
  color: #0c6e67;
}

:root[data-theme='dark'] .cmt-chip-origin-disbursement {
  color: #7ad9d1;
}
</style>
