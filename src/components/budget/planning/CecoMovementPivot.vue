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
 *    (`movementAmount`/`movementMonthOf`) — cuadran con el pivote de origen
 *    (base+sims ⇒ fila "Gastos fijos" de la Vista Ejecutiva [Causado] y del
 *    Flujo [caja, fallback `cfMonth`; has_iva=false de los sims ⇒ sin
 *    gross-up], capital/desembolsos ⇒ monto CRUDO igual que sus bloques
 *    homónimos) y con el total de la cabecera de la vista que es la misma
 *    agregación.
 *  - RF-8.5: posicionamiento por mes vía `movementMonthOf` (por origen y tab)
 *    en LUGAR del par causación/pago global.
 *  - RF-4.4/AC-6: respeta `ivaMode` igual que el módulo — el modo se lee del
 *    store (`budgetPlanningStore.ivaMode`, misma fuente que
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
import { computed } from 'vue'
import PivotMonthTable from './PivotMonthTable.vue'
import { useBudgetPlanningStore } from '@/stores/budgetPlanningStore.js'
import { MONTH_LABELS, monthIndexOf } from './planningFormat.js'
import {
  GROUP_ROW_ORDER,
  MOVEMENT_GROUP_LABELS,
  TAB_FLOW,
  isReconciledVariableMovement,
  movementAmountReconciled,
  movementMonthOf,
  movementGroupOf,
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
  fixedIncomeMonths: { type: Array, required: true }
})

const budgetPlanningStore = useBudgetPlanningStore()

/** Bandera viva del modo "Con IVA" (dueño: store — misma fuente que el Flujo). */
const ivaActive = computed(() => budgetPlanningStore.ivaMode === true)

const isFlowTab = computed(() => props.tab === TAB_FLOW)

/**
 * Agregación ÚNICA (una pasada O(N)): grupos por origen/tipo (RF-8.4) con Σ
 * por mes de su tab, subtotal por grupo y total general. `columnTotals`
 * tiene 13 columnas en Flujo (índice 12 = "Sin fecha de pago"); los
 * movimientos del tab Causado sin mes asignable no pueblan columna pero SÍ
 * el total (criterio idéntico a `ExecutivePivotTable.buildPivot`).
 */
const grouped = computed(() => {
  const isFlow = isFlowTab.value
  const columnCount = isFlow ? 13 : 12
  const byGroup = new Map()
  const columnTotals = Array.from({ length: columnCount }, () => 0)
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
        undated: 0,
        total: 0
      })
    }
    const row = byGroup.get(groupKey)
    row.count += 1
    // RF-8.5: posicionamiento por ORIGEN (base estricto; sims con fallback
    // `cfMonth`; capital/desembolsos `payment_date` puro). REVISIÓN 4
    // (RF-11.4/AC-16): la línea variable de gasto se posiciona por su MES DE
    // CAUSACIÓN en AMBOS tabs — los builders de la matriz
    // (`buildVariableExpensePivot`/`buildVariableFlowPivot`) posicionan por
    // `budget_date`, no por `payment_date`, y el cuadre byte-cuadre exige el
    // mismo criterio aquí. Mes inválido no puebla columna (los PivotMoney
    // enseñan '·' porque el monto reconciliado ya es 0).
    const month = isReconciledVariableMovement(movement)
      ? monthIndexOf(movement.budget_date)
      : movementMonthOf(movement, props.tab)
    if (month >= 0) {
      row.months[month] += amount
      columnTotals[month] += amount
    } else if (isFlow) {
      // RF-3.3/RF-8.5: solo la columna de Flujo consolida lo no posicionable
      // (el total SIEMPRE suma, así los totales cuadran con el pivote de
      // origen).
      row.undated += amount
      columnTotals[12] += amount
    }
    row.total += amount
    grandTotal += amount
  }

  // Orden normativo RF-8.4: Presupuesto (Ingresos/Gastos/Compras) → Nómina →
  // Financiación → Capital → Desembolsos; grupos desconocidos al final
  // (defensivo).
  const rows = GROUP_ROW_ORDER.filter((key) => byGroup.has(key)).map((key) => byGroup.get(key))
  for (const [key, row] of byGroup) {
    if (!GROUP_ROW_ORDER.includes(key)) rows.push(row)
  }
  return { rows, columnTotals, grandTotal }
})

/** Etiquetas de columnas del colgroup: Ene–Dic (+ "Sin fecha de pago" en Flujo). */
const columnLabels = computed(() =>
  isFlowTab.value ? [...MONTH_LABELS, 'Sin fecha de pago'] : [...MONTH_LABELS]
)

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

/** Celdas de la fila: 12 meses (+ 1 col "Sin fecha de pago" en Flujo). */
function rowCells(row) {
  return isFlowTab.value ? [...row.months, row.undated] : row.months
}

/** aria-label de la tabla por tab (accesibilidad del bloque). */
const tableAria = computed(() =>
  isFlowTab.value
    ? 'Resumen mensual de los movimientos del CECO por fecha de pago'
    : 'Resumen mensual de los movimientos del CECO por causación'
)
</script>

<template>
  <PivotMonthTable
    v-if="grouped.rows.length"
    label-header="Origen · Tipo"
    :month-labels="columnLabels"
    :aria-label="tableAria"
  >
    <tr v-for="row in grouped.rows" :key="row.groupKey">
      <th class="pt-row-label cp-row-label" scope="row" :title="rowTitle(row)">
        {{ rowLabel(row) }} · {{ row.count }}
        {{ row.count === 1 ? 'movimiento' : 'movimientos' }}
      </th>
      <td
        v-for="(value, index) in rowCells(row)"
        :key="index"
        class="pt-cell-money"
        :class="{ 'cp-cell-undated': isFlowTab && index === 12 }"
        :title="pivotMoneyTitle(value)"
      >
        {{ pivotMoneyText(value) }}
      </td>
      <td class="pt-cell-money pt-cell-total" :title="pivotMoneyTitle(row.total)">
        {{ pivotMoneyText(row.total) }}
      </td>
    </tr>
    <template #tfoot>
      <tr>
        <th class="pt-row-label" scope="row">Σ Total</th>
        <td
          v-for="(value, index) in grouped.columnTotals"
          :key="index"
          class="pt-cell-money"
          :class="{ 'cp-cell-undated': isFlowTab && index === 12 }"
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
  <p v-else class="cp-empty">Sin movimientos con los filtros aplicados.</p>
</template>

<style scoped>
/* Subtotal de tipo: misma intensidad que las filas fuertes del módulo. */
.cp-row-label {
  font-weight: 600;
}

/* Columna "Sin fecha de pago": banda separadora discontinua (mismo lenguaje
 * visual de `cf-cell-ooy` del Flujo), solo en el tab Flujo (RF-3.3). */
.cp-cell-undated {
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
