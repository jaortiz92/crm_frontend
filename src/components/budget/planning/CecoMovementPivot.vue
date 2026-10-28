<script setup>
/**
 * CecoMovementPivot — pivote RESUMEN del drill-down de movimientos por CECO
 * (FE-S16 / spec `frontend.03_19` RF-4 + REVISIÓN 2 RF-8.4).
 *
 * Resumen agregado de los movimientos DE UN SOLO CECO (los 4 orígenes de la
 * forma común normalizada que recibe como prop), usado en la vista
 * `CecoDetailView.vue` del drill-down (ruta `BudgetCecoDetail`):
 *  - RF-4.1: construido sobre `PivotMonthTable` (mismo patrón vigente del
 *    módulo: `<colgroup>` explícito, `table-layout: fixed`, thead sticky
 *    top/label sticky left, zebra sutil y tfoot sticky bottom).
 *  - RF-4.2/RF-8.4: filas agrupadas por ORIGEN/TIPO — Presupuesto
 *    (Ingresos/Gastos/Compras) + Nómina + Financiación (intereses/seguros) +
 *    Capital de financiación + Desembolsos (estos dos SOLO el tab Flujo, el
 *    dataset del Causado ya los excluye) — con SUBTOTAL por grupo y Σ Total
 *    general en el tfoot; columnas Ene–Dic + Total y, SOLO en el tab Flujo,
 *    la columna adicional "Sin fecha de pago" (RF-3.3: ANTES del Total,
 *    consolidando todos los movimientos cuya fecha del tab no es posicionable
 *    — base sin `payment_date`, motor sin `payment_date || budget_date`,
 *    capital/desembolso sin `payment_date` — RF-8.5).
 *  - RF-4.3/RF-8.6/RF-7.4: los valores derivan del MISMO dataset de la tabla
 *    tabular con los MISMOS helpers compartidos de `cecoMovements.js`
 *    (`movementAmount`/`movementBucketOf`) — cuadran con el pivote de origen
 *    (base+sims ⇒ fila "Gastos fijos" de la Vista Ejecutiva [Causado] y del
 *    Flujo [caja, fallback `cfMonth`; has_iva=false de los sims ⇒ sin
 *    gross-up], capital/desembolsos ⇒ monto CRUDO igual que sus bloques
 *    homónimos) y con el total de la cabecera de la vista que es la misma
 *    agregación.
 *  - RF-8.5 (fix 2026-10-26): posicionamiento por BUCKET vía
 *    `movementBucketOf` (por origen, tab y año N) en LUGAR del par
 *    causación/pago global — Ene–Dic solo cubre el año del escenario y los
 *    montos con fecha efectiva de N±1 van a las columnas "Antes/Después de N"
 *    (condicionales; FE-S8, mismo criterio FE de `CashFlowPivotTable`).
 *  - RF-4.4/AC-6: respeta `ivaMode` igual que el módulo — el modo se lee del
 *    store (`ivaStore.ivaMode`, misma fuente que
 *    `CashFlowPivotTable`); el tab Causado permanece SIEMPRE neto (D-FE14-7)
 *    y el tab Flujo aplica el gross-up × 1.19 por línea con los helpers de
 *    `planningFormat` (`withIva` + `lineChargesIva`) centralizado en
 *    `movementAmount`. Reacciona en vivo al toggle del editor.
 *  - REVISIÓN 4 (`frontend.03_19` §11, RF-11.3/RF-11.4/AC-16): la línea
 *    variable de GASTO muestra el monto RECONCILIADO de la matriz
 *    (`movementAmountReconciled` con la serie compartida
 *    `fixedIncomeMonths`), posicionada por su mes de CAUSACIÓN en ambos tabs
 *    (criterio de los builders `buildVariableExpensePivot`/
 *    `buildVariableFlowPivot`) — Σ por grupo/mes cuadra EXACTO con el bloque
 *    "Gastos variables (calculados)" correspondiente.
 *
 * Formato de dinero: `0` → '·', cifras COP SIN símbolo (`formatMoneyPlain`)
 * y compacto + `title` completo cuando la celda de 106px no cabe (espejo
 * FE-S18 RF-2.2 via `pivotMoneyText`/`pivotMoneyTitle`).
 *
 * Cero dependencias reactivas extra: tabla nativa vía `PivotMonthTable`.
 */
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import PivotMonthTable from './PivotMonthTable.vue'
import { useBudgetIvaStore } from '@/stores/budgetIvaStore.js'
import { MONTH_LABELS } from './planningFormat.js'
import {
  GROUP_ROW_ORDER,
  MOVEMENT_GROUP_LABELS,
  MOVEMENT_BUCKET_AFTER,
  MOVEMENT_BUCKET_BEFORE,
  TAB_FLOW,
  movementAmountReconciled,
  movementBucketOf,
  movementGroupOf,
  movementAccountKeyOf,
  accountLabelOf,
  sortAccountEntries,
  pivotMoneyText,
  pivotMoneyTitle
} from './cecoMovements.js'

const props = defineProps({
  /**
   * Movimientos DEL CECO (forma común, ya filtrados por la vista — RF-6.2:
   * filtros aplican simultáneas a pivote, tabla y totales); incluye los
   * motores normalizados del REVISIÓN 2 (RF-8.3).
   */
  lines: { type: Array, required: true },
  /** Tab activo: `TAB_CAUSED` = por `budget_date`; `TAB_FLOW` = por pago. */
  tab: { type: String, required: true },
  /**
   * REVISIÓN 4 (RF-11.3/RF-11.4): serie de Σ ingresos fijos por mes de
   * causación del escenario (`fixedIncomeCausationSeries`) — base del monto
   * RECONCILIADO de la línea variable de gasto (igual que el bloque "Gastos
   * variables (calculados)" de la matriz; AC-16). Sin serie ⇒ esas líneas
   * aportan 0 (misma degradación que la matriz).
   */
  fixedIncomeMonths: { type: Array, required: true },
  /**
   * Fix 2026-10-26 (FE-S8 en el drill-down): año N del escenario — activa los
   * buckets fuera de año de `movementBucketOf`. `null` ⇒ degradación al
   * posicionamiento mensual puro (idéntico al comportamiento previo).
   */
  scenarioYear: { type: Number, default: null }
})

const ivaStore = useBudgetIvaStore()

/** Bandera viva del modo "Con IVA" (dueño: store — misma fuente que el Flujo). */
const ivaActive = computed(() => ivaStore.ivaMode === true)

const isFlowTab = computed(() => props.tab === TAB_FLOW)

/**
 * Agregación ÚNICA (una pasada O(N)): grupos por origen/tipo (RF-8.4) con Σ
 * por BUCKET de su tab (fix 2026-10-26: `movementBucketOf` — Ene–Dic del año
 * N, Antes/Después fuera de año y "Sin fecha" en Flujo), subtotal por grupo y
 * total general. Las columnas Antes/Después son CONDICIONALES: solo se
 * muestran cuando el dataset (ya filtrado) tiene montos en ese bucket — el
 * drill-down no lo tenía (tratamiento FE-S8 solo en los pivotes de origen).
 *
 * `columnTotals` y `rowCells` siguen el ORDEN de `columnLabels`: 12 meses
 * + [Antes] + [Después] + ["Sin fecha de pago" solo en Flujo]. El Total
 * (columna final) SIEMPRE suma todo (incl. extra/out-of-year), igual que
 * antes: los totales cuadran con el pivote de origen.
 */
const grouped = computed(() => {
  const isFlow = isFlowTab.value
  const byGroup = new Map()
  const monthTotals = Array.from({ length: 12 }, () => 0)
  let totalBefore = 0
  let totalAfter = 0
  let totalUndated = 0
  let grandTotal = 0

  for (const movement of props.lines) {
    // REVISIÓN 4 (RF-11.3/RF-11.4): línea variable de gasto ⇒ monto
    // RECONCILIADO con la matriz (tasa × ingresos fijos del mes de
    // causación; idéntico en ambos tabs — solo cambia la columna vía el
    // posicionamiento de más abajo). El resto conserva `movementAmount`
    // byte-a-byte (RF-8.6/AC-10/AC-11).
    const amount = movementAmountReconciled(
      movement,
      props.tab,
      ivaActive.value,
      props.fixedIncomeMonths
    )
    if (!Number.isFinite(amount)) continue
    const groupKey = movementGroupOf(movement)
    if (!byGroup.has(groupKey)) {
      byGroup.set(groupKey, {
        groupKey,
        count: 0,
        months: Array.from({ length: 12 }, () => 0),
        before: 0,
        after: 0,
        undated: 0,
        total: 0,
        // FE-S22: sub-agregación por Cuenta/Categoría (RF-22.1); el Array
        // final ordenado se emite en `subRows` después del bucle.
        subs: new Map()
      })
    }
    const groupRow = byGroup.get(groupKey)
    groupRow.count += 1
    // FE-S22: sub-fila por CUENTA/CATEGORÍA (`cost_component_code`,
    // `movementAccountKeyOf`) — misma pasada O(N), el monto y el bucket del
    // bucle NO se recalculan: cero divergencia con el subtotal del grupo
    // (BR-22-2: Σ sub-filas ≡ subtotal, byte-cuadre Q4=4).
    const accountKey = movementAccountKeyOf(movement)
    if (!groupRow.subs.has(accountKey)) {
      groupRow.subs.set(accountKey, {
        accountKey,
        label: accountLabelOf(accountKey),
        count: 0,
        months: Array.from({ length: 12 }, () => 0),
        before: 0,
        after: 0,
        undated: 0,
        total: 0
      })
    }
    const subRow = groupRow.subs.get(accountKey)
    subRow.count += 1
    // RF-8.5 + fix 2026-10-26: posicionamiento por ORIGEN con BUCKETS
    // (`movementBucketOf` ya resuelve la variable reconciliada por su
    // `budget_date`). Mes inválido / fuera de año / sin fecha ⇒ nunca pueblan
    // celda mensual: FE-S8 — el año N de la columna deja de mezclarse con
    // fechas de N±1 (Ene-2027 NO entra en la col "Ene" de 2026).
    const bucket = movementBucketOf(movement, props.tab, props.scenarioYear)
    // Aplicador ÚNICO del bucket: ni el grupo ni su sub-fila recalculan el
    // posicionamiento — heredan del bucket ya resuelto de la línea (RF-22.9,
    // incluye "Sin fecha de pago" y Antes/Después de N).
    const applyBucket = (target) => {
      if (bucket >= 0 && bucket <= 11) {
        target.months[bucket] += amount
      } else if (bucket === MOVEMENT_BUCKET_BEFORE) {
        target.before += amount
      } else if (bucket === MOVEMENT_BUCKET_AFTER) {
        target.after += amount
      } else if (isFlow) {
        // RF-3.3/RF-8.5: solo la columna de Flujo consolida lo no
        // posicionable (el total SIEMPRE suma, así los totales cuadran con
        // el pivote de origen).
        target.undated += amount
      }
      target.total += amount
    }
    applyBucket(groupRow)
    applyBucket(subRow)
    if (bucket >= 0 && bucket <= 11) monthTotals[bucket] += amount
    else if (bucket === MOVEMENT_BUCKET_BEFORE) totalBefore += amount
    else if (bucket === MOVEMENT_BUCKET_AFTER) totalAfter += amount
    else if (isFlow) totalUndated += amount
    grandTotal += amount
  }

  // Orden normativo RF-8.4: Presupuesto (Ingresos/Gastos/Compras) → Nómina →
  // Financiación → Capital → Desembolsos; grupos desconocidos al final
  // (defensivo).
  const rows = GROUP_ROW_ORDER.filter((key) => byGroup.has(key)).map((key) => byGroup.get(key))
  for (const [key, row] of byGroup) {
    if (!GROUP_ROW_ORDER.includes(key)) rows.push(row)
  }
  // FE-S22: sub-filas por cuenta ALFABÉTICAS, bucket "Sin cuenta" al final
  // (RF-22.1; `sortAccountEntries` de `cecoMovements.js`). El Map temporal
  // `subs` no sale en la superficie pública.
  for (const row of rows) {
    row.subRows = sortAccountEntries([...row.subs.values()])
    delete row.subs
  }
  // Columnas extra CONDICIONALES: visibles solo con montos reales en el
  // bucket (independiente del toggle — el drill-down no tiene toggle ooy).
  const beforeVisible = totalBefore !== 0
  const afterVisible = totalAfter !== 0
  const columnTotals = [...monthTotals]
  if (beforeVisible) columnTotals.push(totalBefore)
  if (afterVisible) columnTotals.push(totalAfter)
  if (isFlow) columnTotals.push(totalUndated)
  return {
    rows,
    columnTotals,
    grandTotal,
    beforeVisible,
    afterVisible
  }
})

/** Etiqueta del año N para las columnas "Antes/Después" (fallback defensivo). */
const scenarioYearLabel = computed(() =>
  Number.isInteger(props.scenarioYear) ? String(props.scenarioYear) : 'año'
)

/** Etiquetas de columnas: Ene–Dic + [Antes de N] + [Después de N] + [Sin fecha]. */
const columnLabels = computed(() => {
  const labels = [...MONTH_LABELS]
  if (grouped.value.beforeVisible) labels.push(`Antes de ${scenarioYearLabel.value}`)
  if (grouped.value.afterVisible) labels.push(`Después de ${scenarioYearLabel.value}`)
  if (isFlowTab.value) labels.push('Sin fecha de pago')
  return labels
})

/** Etiqueta legible de la fila de grupo (RF-8.4). */
function rowLabel(row) {
  return MOVEMENT_GROUP_LABELS[row.groupKey] ?? row.groupKey
}

/** Tooltip del rótulo de fila (semántica de la tab vigente + origen). */
function rowTitle(row) {
  const basis = isFlowTab.value
    ? 'pago (payment_date, con fallback budget_date en motores)'
    : 'causación (budget_date)'
  return `Σ de ${row.count} movimientos de ${rowLabel(row).toLowerCase()} por ${basis}.`
}

/**
 * Celdas de la fila en el ORDEN de `columnLabels`: 12 meses +
 * [Antes de N] + [Después de N] + ["Sin fecha de pago" en Flujo].
 */
function rowCells(row) {
  const cells = [...row.months]
  if (grouped.value.beforeVisible) cells.push(row.before)
  if (grouped.value.afterVisible) cells.push(row.after)
  if (isFlowTab.value) cells.push(row.undated)
  return cells
}

/**
 * Clase de la celda extra por índice de columna (banda separadora): "Sin
 * fecha de pago" (última de Flujo) conserva `cp-cell-undated`; las celdas
 * Antes/Después llevan la misma banda discontinua del lenguaje `cf-cell-ooy`
 * del pivote de origen.
 * @param {number} index índice de la celda dentro de `rowCells(row)`
 */
function cellClass(index) {
  if (index < 12) return null
  if (isFlowTab.value && index === columnLabels.value.length - 1) return 'cp-cell-undated'
  return 'cp-cell-ooy'
}

/** aria-label de la tabla por tab (accesibilidad del bloque). */
const tableAria = computed(() =>
  isFlowTab.value
    ? 'Resumen mensual de los movimientos del CECO por fecha de pago'
    : 'Resumen mensual de los movimientos del CECO por causación'
)

/* ═════════ FE-S22: expansión de la jerarquía Cuenta/Categoría (RF-22.3/22.4) ═════════ */

/**
 * Estado LOCAL (no persiste) de grupos colapsados: un `Set` con las claves
 * de grupo contraídas (un grupo NO en el set está EXPANDIDO por defecto,
 * RF-22.3). Ocupa una referencia reemplazable por reasignación atómica.
 */
const collapsedGroups = ref(new Set())

function isCollapsed(groupKey) {
  return collapsedGroups.value.has(groupKey)
}

function toggleGroup(groupKey) {
  const next = new Set(collapsedGroups.value)
  if (next.has(groupKey)) next.delete(groupKey)
  else next.add(groupKey)
  collapsedGroups.value = next
}

/** RF-22.3: TODO expandido de nuevo. */
function expandAll() {
  collapsedGroups.value = new Set()
}

/** RF-22.3: contrae TODOS los grupos (subtotal visible siempre, RF-22.4). */
function collapseAll() {
  collapsedGroups.value = new Set(grouped.value.rows.map((row) => row.groupKey))
}

/**
 * Reinicio del estado local al cambiar el ESCENARIO/CECO/tab (RF-22.3): la
 * vista anfitriona vive en la ruta `BudgetCecoDetail`, así que los parámetros
 * (`:idBudget`/`:costCenterCode`) y `?tab=` la identifican sin props extra
 * (solo lectura de la ruta — cero mutación ni dependencia de datos).
 */
const route = useRoute()
watch(
  () => [route.params.idBudget, route.params.costCenterCode, route.query.tab],
  () => {
    collapsedGroups.value = new Set()
  }
)

/** Tooltip del rótulo de sub-fila (semántica de la tab vigente + cuenta). */
function subRowTitle(row, subRow) {
  const basis = isFlowTab.value
    ? 'pago (payment_date, con fallback budget_date en motores)'
    : 'causación (budget_date)'
  return `Σ de ${subRow.count} movimiento(s) con cuenta/categoría ${
    subRow.accountKey || 'sin código'
  } dentro de ${rowLabel(row).toLowerCase()} por ${basis}.`
}

/** Contador legible compartido de filas (grupo y sub-fila). */
function countText(count) {
  return `· ${count} ${count === 1 ? 'movimiento' : 'movimientos'}`
}

/** ¿Hay sub-filas por cuenta que desagregar? (toolbar solo con hier real). */
const hasSubRows = computed(() => grouped.value.rows.some((row) => row.subRows.length > 0))
</script>

<template>
  <div v-if="grouped.rows.length">
    <!-- FE-S22: toolbar de expansión de la jerarquía (RF-22.3) — junto al
         header del pivote, solo con jerarquía real que desagregar. -->
    <div v-if="hasSubRows" class="cp-toolbar">
      <span class="cp-toolbar-hint">Cuenta/Categoría por grupo:</span>
      <button type="button" class="cp-toolbar-btn" @click="expandAll">Expandir todo</button>
      <button type="button" class="cp-toolbar-btn" @click="collapseAll">Contraer todo</button>
    </div>
    <PivotMonthTable
      label-header="Origen · Tipo · Cuenta/Categoría"
      :month-labels="columnLabels"
      :aria-label="tableAria"
    >
      <template v-for="row in grouped.rows" :key="row.groupKey">
        <!-- Fila de GRUPO (Origen · Tipo): subtotal SIEMPRE visible
             (RF-22.2/RF-22.4), negrita + chevron (▾ expandido / ▸ colapsado). -->
        <tr class="cp-group-row">
          <th class="pt-row-label cp-row-label" scope="row" :title="rowTitle(row)">
            <button
              type="button"
              class="cp-toggle"
              :aria-expanded="!isCollapsed(row.groupKey)"
              :aria-label="`${
                isCollapsed(row.groupKey) ? 'Expandir' : 'Colapsar'
              } grupo ${rowLabel(row)}`"
              :title="rowTitle(row)"
              @click="toggleGroup(row.groupKey)"
            >
              <span
                class="cp-chevron"
                :class="{ 'cp-chevron-collapsed': isCollapsed(row.groupKey) }"
                aria-hidden="true"
                >▾</span
              >
              <span class="cp-group-label"
                >{{ rowLabel(row) }} {{ countText(row.count) }}</span
              >
            </button>
          </th>
          <td
            v-for="(value, index) in rowCells(row)"
            :key="index"
            class="pt-cell-money"
            :class="cellClass(index)"
            :title="pivotMoneyTitle(value)"
          >
            {{ pivotMoneyText(value) }}
          </td>
          <td class="pt-cell-money pt-cell-total" :title="pivotMoneyTitle(row.total)">
            {{ pivotMoneyText(row.total) }}
          </td>
        </tr>
        <!-- Sub-filas por Cuenta/Categoría (RF-22.1), ocultas si el grupo
             está colapsado (RF-22.4: el subtotal de arriba no desaparece) -->
        <tr
          v-for="subRow in isCollapsed(row.groupKey) ? [] : row.subRows"
          :key="`${row.groupKey}::${subRow.accountKey}`"
          class="cp-sub-row"
        >
          <th class="pt-row-label cp-sub-label" scope="row" :title="subRowTitle(row, subRow)">
            <span class="cp-sub-marker" aria-hidden="true">└</span>
            {{ subRow.label }} {{ countText(subRow.count) }}
          </th>
          <td
            v-for="(value, index) in rowCells(subRow)"
            :key="index"
            class="pt-cell-money"
            :class="cellClass(index)"
            :title="pivotMoneyTitle(value)"
          >
            {{ pivotMoneyText(value) }}
          </td>
          <td
            class="pt-cell-money pt-cell-total cp-sub-total"
            :title="pivotMoneyTitle(subRow.total)"
          >
            {{ pivotMoneyText(subRow.total) }}
          </td>
        </tr>
      </template>
      <template #tfoot>
        <tr>
          <th class="pt-row-label" scope="row">Σ Total</th>
          <td
            v-for="(value, index) in grouped.columnTotals"
            :key="index"
            class="pt-cell-money"
            :class="cellClass(index)"
            :title="pivotMoneyTitle(value)"
          >
            {{ pivotMoneyText(value) }}
          </td>
          <td class="pt-cell-money pt-cell-total" :title="pivotMoneyTitle(grouped.grandTotal)">
            {{ pivotMoneyText(grouped.grandTotal) }}
          </td>
        </tr>
      </template>
    </PivotMonthTable>
  </div>
  <p v-else class="cp-empty">Sin movimientos con los filtros aplicados.</p>
</template>

<style scoped>
/* ═════════ FE-S22: toolbar Expandir/Contraer todo (RF-22.3) ═════════ */
.cp-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
}

.cp-toolbar-hint {
  font-size: 0.75rem;
  color: var(--color-text-muted, #8a8a8a);
}

.cp-toolbar-btn {
  padding: 2px 10px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 6px;
  background: transparent;
  font-size: 0.75rem;
  cursor: pointer;
  color: var(--color-text-primary, #070707);
}

.cp-toolbar-btn:hover {
  background: rgba(5, 199, 242, 0.12);
}

/* Botón-chevron del grupo: reset de apariencia (hereda el rótulo). */
.cp-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

/* Chevron ▾ (expandido) → rotate a ▸ (colapsado). */
.cp-chevron {
  display: inline-block;
  transition: transform 0.12s ease;
}

.cp-chevron-collapsed {
  transform: rotate(-90deg);
}

/* Fila de GRUPO en negrita (RF-22.5): refuerzo del 600 del rótulo. */
.cp-group-row th,
.cp-group-row td {
  font-weight: 600;
}

/* Sub-fila de CUENTA/CATEGORÍA: sangría + prefijo └ (RF-22.5). */
.cp-sub-label {
  padding-left: 16px;
}

.cp-sub-marker {
  display: inline-block;
  margin-right: 4px;
  color: var(--color-text-muted, #8a8a8a);
}

/* Sub-fila más tenue que el subtotal del grupo (que sigue en negrita). */
.cp-sub-label {
  font-weight: 400;
  font-size: 0.72rem;
  white-space: normal;
}

/* Total de la sub-fila (conserva el sticky-right de pt-cell-total del
 * módulo; solo baja el peso — especificidad 3 clases + elemento). */
tbody td.pt-cell-money.cp-sub-total {
  font-weight: 500;
}

/* Subtotal de tipo: misma intensidad que las filas fuertes del módulo. */
.cp-row-label {
  font-weight: 600;
}

/* Columna "Sin fecha de pago": banda separadora discontinua (mismo lenguaje
 * visual de `cf-cell-ooy` del Flujo), solo en el tab Flujo (RF-3.3). Las
 * columnas "Antes/Después de N" (fix 2026-10-26) comparten la banda. */
.cp-cell-undated,
.cp-cell-ooy {
  border-left: 1px dashed var(--color-border, rgba(97, 97, 97, 0.15));
}

.cp-empty {
  margin: 0;
  padding: 14px;
  border: 1px dashed var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 8px;
  font-size: 0.8rem;
  color: var(--color-text-muted, #8a8a8a);
  text-align: center;
}
</style>
