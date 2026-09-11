<script setup>
/**
 * CashFlowPivotTable — "Vista Flujo" READ-ONLY (FE-S4B-BUDGET-FLUJO §4/§5).
 *
 * Tercer tab del detalle de escenario (D-1: Ejecutiva → Flujo → Editor):
 * perspectiva de LIQUIDEZ de la matriz CECO × Ene–Dic — cuándo entra y sale
 * el efectivo. 100 % client-side desde `props.scenario.budget_lines` (D-2,
 * misma caché que Editor/Ejecutiva → AC-FE-6, cero HTTP, NFR-FV-2).
 *
 * Reglas de ubicación del mes (D-3/D-5):
 *  - Entradas  (income + fixed)  → `cfMonth(line) = payment_date || budget_date`
 *    (mes de cobro, no de causación).
 *  - Salidas fijos (expense + fixed) → mismo `cfMonth` (réplica del motor).
 *  - Salidas variables (expense, behavior != fixed) → DERIVADOS:
 *    `variable_rate × Σ ingresos fijos causados del mes` con el mes por
 *    `budget_date` (causación; fórmula idéntica a la "Opción A" de
 *    `ExecutivePivotTable.variablePivot`, base agregada aparte por
 *    `monthIndexOf(budget_date)`).
 *  - `monthIndexOf(...) === -1` ⇒ la celda mensual no se puebla, pero el
 *    monto SÍ suma al total anual de la fila y al grandTotal (idéntico a
 *    `ExecutivePivotTable.buildPivot`).
 *
 * R-1 (divergencia intencional, §10): los INGRESOS se ubican por
 * `payment_date` mientras `budgetEngine.project_cash_flow` los ubica por
 * `budget_date`; fijos y variables sí replican al motor. Mitigación: nota
 * §5.3 del template. Sin gross-up de IVA en v1 (D-4, nota al pie del bloque
 * Entradas); sin tabla de tasas (D-7: exclusiva de Ejecutiva); sin gráficas
 * ni deps nuevas (D-8).
 *
 * CERO dependencias: tabla HTML nativa + computados (patrón hermano
 * `ExecutivePivotTable`); CSS scoped propio prefijo `cf-*` (§5.4).
 */
import { computed } from 'vue'
import { useBudgetPlanningStore } from '@/stores/budgetPlanningStore.js'
import { MONTH_LABELS, formatMoney, monthIndexOf } from './planningFormat.js'

const props = defineProps({
  /** `BudgetFull` + `parent_budget_name` de la caché del store. */
  scenario: { type: Object, required: true }
})

const budgetPlanningStore = useBudgetPlanningStore()

const lines = computed(() =>
  props.scenario && Array.isArray(props.scenario.budget_lines) ? props.scenario.budget_lines : []
)

/** Vacío extremo (§5.3): sin ninguna línea → único mensaje, ni tablas ni resumen. */
const hasLines = computed(() => lines.value.length > 0)

/** Mes de cobro/pago (D-3): `payment_date` con fallback a `budget_date` (R-1). */
const cfMonth = (line) => monthIndexOf(line.payment_date || line.budget_date)

/**
 * Pivote genérico de un bloque: filas = CECO (agrupa todas sus líneas, orden
 * `localeCompare(..., 'es')`), columnas Ene–Dic según `monthOf(line)`, celda
 * = Σ `projected_amount` crudos (no finitos se ignoran), totales por
 * fila/columna/bloque. El total de fila es ANUAL: montos con mes no
 * ubicable (-1) suman a `row.total`/`grandTotal` aunque no pueblen celda
 * alguna (criterio idéntico a ExecutivePivotTable).
 * @param {(line: object) => boolean} match Filtro de líneas del bloque.
 * @param {(line: object) => number} monthOf Función de ubicación mensual.
 */
function buildPivot(match, monthOf) {
  const byCeco = new Map()
  const columnTotals = Array.from({ length: 12 }, () => 0)
  let grandTotal = 0

  for (const line of lines.value) {
    if (!match(line)) continue
    const amount = Number(line.projected_amount)
    if (!Number.isFinite(amount)) continue

    const key = line.id_cost_center
    if (!byCeco.has(key)) {
      byCeco.set(key, {
        id: key,
        label: budgetPlanningStore.costCenterLabel(key),
        months: Array.from({ length: 12 }, () => 0),
        total: 0
      })
    }
    const row = byCeco.get(key)
    const month = monthOf(line)
    if (month >= 0) {
      row.months[month] += amount
      columnTotals[month] += amount
    }
    row.total += amount
    grandTotal += amount
  }

  const rows = [...byCeco.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'))
  return { rows, columnTotals, grandTotal }
}

/** Bloque "Entradas" (§4.2): ingresos fijos por fecha de pago (D-3, R-1). */
const entradasPivot = computed(() =>
  buildPivot((line) => line.line_type === 'income' && line.behavior_type === 'fixed', cfMonth)
)

/** Bloque "Salidas — Gastos fijos" (§4.2): gastos fijos por fecha de pago. */
const fijosPivot = computed(() =>
  buildPivot((line) => line.line_type === 'expense' && line.behavior_type === 'fixed', cfMonth)
)

/**
 * Base del bloque variable (D-5): Σ ingresos fijos por MES DE CAUSACIÓN
 * (`monthIndexOf(budget_date)`) — agregación SEPARADA del bloque Entradas
 * (que usa payment date), para replicar numéricamente el `incomePivot.
 * columnTotals` que consume la Vista Ejecutiva (AC-VF-6).
 */
const baseIngresosCausados = computed(() => {
  const base = Array.from({ length: 12 }, () => 0)
  for (const line of lines.value) {
    if (line.line_type !== 'income' || line.behavior_type !== 'fixed') continue
    const amount = Number(line.projected_amount)
    if (!Number.isFinite(amount)) continue
    const month = monthIndexOf(line.budget_date)
    if (month >= 0) base[month] += amount
  }
  return base
})

/** Líneas de gasto variables (origen crudo del bloque estimado). */
const variableSourceLines = computed(() =>
  lines.value.filter((line) => line.line_type === 'expense' && line.behavior_type !== 'fixed')
)

/**
 * Pivote ESTIMADO de gastos variables (D-5, réplica de la "Opción A" de
 * `ExecutivePivotTable.variablePivot`): cada línea variable aporta
 * `(Number(variable_rate) || 0) × base[m]` en `m = monthIndexOf(budget_date)`
 * (causación). Montos DERIVADOS de presentación —no se almacenan (BR-CLN-03)—
 * y se recalculan solos al editar ingresos. `null` (el bloque no se
 * renderiza) si no hay líneas variables o la base es toda cero, mismo guard
 * que Ejecutiva.
 */
const variablesPivot = computed(() => {
  const source = variableSourceLines.value
  const base = baseIngresosCausados.value
  if (!source.length || !base.some((value) => value !== 0)) return null

  const byCeco = new Map()
  const columnTotals = Array.from({ length: 12 }, () => 0)
  let grandTotal = 0

  for (const line of source) {
    const key = line.id_cost_center
    if (!byCeco.has(key)) {
      byCeco.set(key, {
        id: key,
        label: budgetPlanningStore.costCenterLabel(key),
        months: Array.from({ length: 12 }, () => 0),
        total: 0
      })
    }
    const row = byCeco.get(key)

    const month = monthIndexOf(line.budget_date)
    if (month < 0) continue
    const rate = Number(line.variable_rate) || 0
    const amount = rate * base[month]
    row.months[month] += amount
    row.total += amount
    columnTotals[month] += amount
    grandTotal += amount
  }

  const rows = [...byCeco.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'))
  return { rows, columnTotals, grandTotal }
})

/** Nota del bloque estimado (§4.4): equivalente a `VARIABLE_PIVOT_NOTE` de Ejecutiva. */
const VARIABLE_PIVOT_NOTE =
  'Monto estimado = tasa × ingresos fijos presupuestados del mes de causación. ' +
  'No se almacena en las líneas del escenario; se recalcula al ajustar el presupuesto.'

/** Nota al pie del bloque Entradas (D-4, §4.3): montos netos, sin gross-up de IVA. */
const ENTRADAS_NOTE = 'Montos netos, sin IVA. El pilar de analítica de flujo de caja sí lo incluye.'

/** Bloques del template en orden fijo (§5.2: 1 Entradas, 2 fijos, 3 variables condicional). */
const blocks = computed(() => {
  const list = [
    {
      title: 'Entradas',
      emptyName: 'entradas',
      pivot: entradasPivot.value,
      aria: 'Entradas (ingresos fijos) por centro de costo y mes según fecha de pago',
      note: ENTRADAS_NOTE
    },
    {
      title: 'Salidas — Gastos fijos',
      emptyName: 'gastos fijos',
      pivot: fijosPivot.value,
      aria: 'Salidas de gastos fijos por centro de costo y mes según fecha de pago'
    }
  ]
  if (variablesPivot.value) {
    list.push({
      title: 'Salidas — Gastos variables (calculados)',
      emptyName: 'gastos variables',
      pivot: variablesPivot.value,
      aria: 'Salidas de gastos variables calculados por centro de costo y mes según fecha de causación',
      note: VARIABLE_PIVOT_NOTE
    })
  }
  return list
})

/**
 * Resumen de liquidez (D-6, §4.5): construido SOLO de los
 * `columnTotals`/`grandTotal` de los bloques (ningún re-recorrido de
 * líneas). Neto = entradas − salidas por mes, Total = Σ de los 12 netos;
 * Acumulado = corrida desde Ene, Total = valor de diciembre (≡ neto anual).
 */
const resumen = computed(() => {
  const entradas = entradasPivot.value.columnTotals
  const fijos = fijosPivot.value.columnTotals
  const variables = variablesPivot.value ? variablesPivot.value.columnTotals : null

  const salidas = entradas.map((_, m) => fijos[m] + (variables ? variables[m] : 0))
  const neto = entradas.map((value, m) => value - salidas[m])

  let acc = 0
  const acumulado = neto.map((value) => {
    acc += value
    return acc
  })

  const entradasTotal = entradasPivot.value.grandTotal
  const salidasTotal =
    fijosPivot.value.grandTotal + (variablesPivot.value ? variablesPivot.value.grandTotal : 0)
  const netoTotal = neto.reduce((sum, value) => sum + value, 0)
  const acumuladoTotal = acumulado[11]

  return {
    entradas,
    salidas,
    neto,
    acumulado,
    entradasTotal,
    salidasTotal,
    netoTotal,
    acumuladoTotal
  }
})

/** `0` → '·' (patrón Ejecutiva); negativos con signo estándar de `formatMoney`. */
function resumenCell(value) {
  return value === 0 ? '·' : formatMoney(value)
}

/** Filas del resumen de liquidez (§4.5). `signed`: neto/acumulado → rojos si < 0. */
const resumenRows = computed(() => {
  const r = resumen.value
  return [
    {
      label: 'Σ Entradas',
      months: r.entradas,
      totalText: formatMoney(r.entradasTotal),
      negativeTotal: false,
      signed: false,
      strong: false,
      totalTitle: undefined
    },
    {
      label: 'Σ Salidas',
      months: r.salidas,
      totalText: formatMoney(r.salidasTotal),
      negativeTotal: false,
      signed: false,
      strong: false,
      totalTitle: undefined
    },
    {
      label: 'Flujo neto',
      months: r.neto,
      totalText: resumenCell(r.netoTotal),
      negativeTotal: r.netoTotal < 0,
      signed: true,
      strong: true,
      totalTitle: 'Σ de los 12 flujos netos mensuales.'
    },
    {
      label: 'Flujo acumulado',
      months: r.acumulado,
      totalText: resumenCell(r.acumuladoTotal),
      negativeTotal: r.acumuladoTotal < 0,
      signed: true,
      strong: true,
      totalTitle:
        'Corrida acumulada desde enero; el total corresponde al valor de diciembre (equivale al flujo neto anual).'
    }
  ]
})

/** Celda negativa (neto/acumulado < 0) → clase `cf-negative` (§4.5). */
function negativeCell(row, value) {
  return row.signed && value < 0
}
</script>

<template>
  <div class="cf-zone">
    <p class="cf-note">
      Matriz de <strong>solo lectura</strong> generada desde las líneas del escenario
      {{ scenario.budget_year }}. Los importes se ajustan en “Editor de Celdas”. El mes se asigna
      por <strong>fecha de pago</strong> (no por causación), por lo que puede diferir de la “Vista
      Ejecutiva”.
    </p>

    <!-- Estado vacío extremo (§5.3): sin líneas ⇒ ni bloques ni resumen. -->
    <p v-if="!hasLines" class="cf-empty">
      Este escenario no tiene líneas presupuestadas. Cárguelas o édítelas en “Editor de Celdas”.
    </p>

    <template v-else>
      <section v-for="block in blocks" :key="block.title" class="cf-block">
        <h4 class="cf-block-title">{{ block.title }}</h4>
        <p v-if="block.note" class="cf-note cf-block-note">{{ block.note }}</p>
        <div v-if="block.pivot.rows.length" class="cf-scroll">
          <table class="cf-table" :aria-label="block.aria">
            <thead>
              <tr>
                <th class="cf-col-ceco">CECO</th>
                <th v-for="month in MONTH_LABELS" :key="month" class="cf-col-month">{{ month }}</th>
                <th class="cf-col-total">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in block.pivot.rows" :key="row.id">
                <th class="cf-row-label" scope="row" :title="row.label">{{ row.label }}</th>
                <td v-for="(value, index) in row.months" :key="index" class="cf-cell-money">
                  {{ value === 0 ? '·' : formatMoney(value) }}
                </td>
                <td class="cf-cell-money cf-cell-total">{{ formatMoney(row.total) }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <th class="cf-row-label" scope="row">Σ Total</th>
                <td
                  v-for="(value, index) in block.pivot.columnTotals"
                  :key="index"
                  class="cf-cell-money"
                >
                  {{ value === 0 ? '·' : formatMoney(value) }}
                </td>
                <td class="cf-cell-money cf-cell-total">
                  {{ formatMoney(block.pivot.grandTotal) }}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p v-else class="cf-empty">Sin líneas de {{ block.emptyName }} en este escenario.</p>
      </section>

      <!-- Resumen de liquidez (D-6, §4.5): SIEMPRE con líneas, aun con bloques vacíos. -->
      <section class="cf-block">
        <h4 class="cf-block-title">Resumen de liquidez</h4>
        <div class="cf-scroll">
          <table
            class="cf-table"
            aria-label="Resumen de liquidez mensual del escenario: entradas, salidas, flujo neto y flujo acumulado"
          >
            <thead>
              <tr>
                <th class="cf-col-ceco">Concepto</th>
                <th v-for="month in MONTH_LABELS" :key="month" class="cf-col-month">{{ month }}</th>
                <th class="cf-col-total">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in resumenRows"
                :key="row.label"
                :class="{ 'cf-row-strong': row.strong }"
              >
                <th class="cf-row-label" scope="row">{{ row.label }}</th>
                <td
                  v-for="(value, index) in row.months"
                  :key="index"
                  class="cf-cell-money"
                  :class="{ 'cf-negative': negativeCell(row, value) }"
                >
                  {{ resumenCell(value) }}
                </td>
                <td
                  class="cf-cell-money cf-cell-total"
                  :class="{ 'cf-negative': row.negativeTotal }"
                  :title="row.totalTitle"
                >
                  {{ row.totalText }}
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
/* Mismo lenguaje visual que ExecutivePivotTable (§5.4), prefijo cf-* propio. */

.cf-zone {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.cf-note {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-text-secondary, #555555);
}

/* Nota de cálculo dentro de un bloque (Entradas / Gastos variables). */
.cf-block-note {
  margin: -2px 0 8px;
}

.cf-block-title {
  margin: 0 0 8px;
  font-size: 0.86rem;
  font-weight: 700;
  color: var(--color-text-primary, #070707);
}

.cf-scroll {
  overflow: auto;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 8px;
  background-color: var(--color-surface-card, #ffffff);
  max-height: 60vh;
}

.cf-table {
  min-width: 1240px;
  border: none;
  border-radius: 0;
  box-shadow: none;
  font-size: 0.78rem;
}

.cf-table thead th {
  position: sticky;
  top: 0;
  z-index: 3;
}

.cf-table tfoot th,
.cf-table tfoot td {
  position: sticky;
  bottom: 0;
  z-index: 2;
  font-weight: 700;
  background-color: var(--color-surface, #f7f7f7);
}

:root[data-theme='dark'] .cf-table tfoot th,
:root[data-theme='dark'] .cf-table tfoot td {
  background-color: rgba(255, 255, 255, 0.05);
}

.cf-col-ceco,
.cf-row-label {
  position: sticky;
  left: 0;
  z-index: 4;
  max-width: 240px;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  background-color: var(--color-surface-card, #ffffff);
}

.cf-table thead .cf-col-ceco {
  z-index: 5;
}

/* `th` sobre fondo claro (esquina CECO/Concepto, etiquetas de fila y `tfoot`):
 * el `th { color: #ffffff }` global de `main.css` los volvería invisibles en
 * tema claro; `--color-text-primary` se adapta solo al tema oscuro. */
.cf-table th.cf-col-ceco,
.cf-table th.cf-row-label {
  color: var(--color-text-primary, #070707);
}

.cf-table tfoot .cf-row-label {
  background-color: var(--color-surface, #f7f7f7);
}

.cf-col-month,
.cf-col-total {
  font-size: 0.72rem;
  font-weight: 600;
}

.cf-cell-money,
.cf-cell-total {
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}

.cf-cell-total {
  font-weight: 600;
}

/* Filas destacadas del resumen (Flujo neto / Flujo acumulado). */
.cf-row-strong th,
.cf-row-strong td {
  font-weight: 700;
}

/* Negativos de neto/acumulado en rojo (§4.5, D-6); dark mode vía convención .ge-error. */
.cf-negative {
  color: #c53030;
}

:root[data-theme='dark'] .cf-negative {
  color: #ff9b9b;
}

.cf-empty {
  margin: 0;
  padding: 14px;
  border: 1px dashed var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 8px;
  font-size: 0.8rem;
  color: var(--color-text-muted, #8a8a8a);
  text-align: center;
}
</style>
