<script setup>
/**
 * PivotMonthTable — componente compartido de las tablas pivote mensuales de
 * Planificación de Presupuesto (FE-S18, spec `frontend.03_18` RF-2.1).
 *
 * Encapsula el markup antes duplicado a mano en `ExecutivePivotTable` (clases
 * `pv-*`) y `CashFlowPivotTable` (clases `cf-*`):
 *  - RF-1.1: `table-layout: fixed` SIEMPRE con `<colgroup>` explícito.
 *  - RF-1.2: col 1 rótulo = 230px, sticky left.
 *  - RF-1.3: 12 meses de 106px, TODOS iguales entre sí y entre vistas (misma
 *    cuadrícula AC-1/AC-2: 230 + 12×106 + 116).
 *  - RF-1.4: col Total = 116px.
 *  - RF-1.5 (opcional, Vista Flujo): columnas extra "Antes/Después de {año}"
 *    vía prop `extraColumns` — se renderizan DESPUÉS de la col Total (mismo
 *    orden del thead vigente del Flujo), heredan 106px y engrosan el
 *    `min-width` por defecto (override con prop `min-width`).
 *  - RF-5/estado actual: thead sticky top, col rótulo sticky left, tfoot
 *    sticky bottom (esquinas z-index 5), sobre el wrapper `overflow: auto`
 *    (max-height: 60vh) que antes vivía por tabla.
 *  - RF-6: zebra sutil (override del global `#e8f3ff` de main.css), filas
 *    totales destacadas, negativos en rojo semántico.
 *  - RF-6.4: overrides del `th` global de main.css (uppercase + fondo
 *    oscuro + th blanco) definidos UNA vez aquí, con el estilo vigente de
 *    las tablas pivote (th pintados sobre fondo claro legibles, mes/total
 *    en 0.72rem).
 *
 * Rótulos de FILA y celdas de datos viven en los slots (la lógica de
 * datos no cambia — RF-2.3), por lo que sus clases compartidas
 * `pt-row-label`, `pt-row-strong`, `pt-cell-money`, `pt-cell-total`,
 * `pt-cell-pct` y `pt-negative` se estilan aquí con `:deep()` para que ambas
 * vistas las consuman SIN duplicar CSS. Cifras sin `$`: el CALLER formatea
 * con `formatMoneyPlain`/`formatMoneyCompact` de `planningFormat.js`.
 *
 * Cero dependencias: tabla HTML nativa (patrón `RatesDataTable`).
 */
import { computed } from 'vue'

/** RF-1.2: ancho de la col rótulo (CECO/Concepto). */
const COL_LABEL_WIDTH = 230
/** RF-1.3: ancho de cada mes (y de las columnas extra, RF-1.5). */
const COL_MONTH_WIDTH = 106
/** RF-1.4: ancho de la col Total. */
const COL_TOTAL_WIDTH = 116

const props = defineProps({
  /** Rótulo de la col 1 (`'Concepto'` en P&G/Acumulado, `'CECO'` en pivotes). */
  labelHeader: { type: String, default: '' },
  /** Etiquetas de los meses (Ene–Dic, `MONTH_LABELS` de planningFormat.js). */
  monthLabels: { type: Array, required: true },
  /** aria-label de la tabla (accesibilidad del bloque). */
  ariaLabel: { type: String, default: null },
  /** Tooltip (RF-3.2) de la cabecera Total; vacío ⇒ sin title. */
  totalTitle: { type: String, default: '' },
  /**
   * RF-1.5 (opcional — Vista Flujo): columnas extra DESPUÉS de Total
   * ("Antes/Después de {año}"), `[{ label, title }]`; heredan 106px.
   */
  extraColumns: { type: Array, default: () => [] },
  /** RF-1.5: override del min-width de la tabla (0 ⇒ derivado del colgroup). */
  minWidth: { type: [Number, String], default: 0 }
})

/**
 * Min-width por defecto = Σ del colgroup explícito (RF-1.1/AC-2). El Flujo
 * con toggle ON pasa su `min-width` por prop si el spec lo indica.
 */
const resolvedMinWidth = computed(() => {
  const override = Number(props.minWidth)
  if (Number.isFinite(override) && override > 0) return override
  return (
    COL_LABEL_WIDTH +
    COL_MONTH_WIDTH * (props.monthLabels.length + props.extraColumns.length) +
    COL_TOTAL_WIDTH
  )
})
</script>

<template>
  <div class="pt-scroll">
    <table class="pt-table" :aria-label="ariaLabel" :style="{ minWidth: `${resolvedMinWidth}px` }">
      <colgroup>
        <col :style="{ width: `${COL_LABEL_WIDTH}px` }" />
        <col v-for="month in monthLabels" :key="month" :style="{ width: `${COL_MONTH_WIDTH}px` }" />
        <col :style="{ width: `${COL_TOTAL_WIDTH}px` }" />
        <col
          v-for="extra in extraColumns"
          :key="extra.label"
          :style="{ width: `${COL_MONTH_WIDTH}px` }"
        />
      </colgroup>
      <thead>
        <tr>
          <th class="pt-col-label">{{ labelHeader }}</th>
          <th v-for="month in monthLabels" :key="month" class="pt-col-month">{{ month }}</th>
          <th class="pt-col-total" :title="totalTitle || null">Total</th>
          <th
            v-for="extra in extraColumns"
            :key="extra.label"
            class="pt-col-month pt-col-extra"
            :title="extra.title || null"
          >
            {{ extra.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <slot />
      </tbody>
      <tfoot v-if="$slots.tfoot">
        <slot name="tfoot" />
      </tfoot>
    </table>
  </div>
</template>

<style scoped>
/* ─── Wrapper de scroll (RF-2.1): el que antes duplicaban pv-scroll/cf-scroll ─── */
.pt-scroll {
  overflow: auto;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 8px;
  background-color: var(--color-surface-card, #ffffff);
  /* Mitigación de riesgo (c) del spec: se conserva el max-height por tabla. */
  max-height: 60vh;
}

/* ─── RF-1.1: grid fija + reset del estilo global de `table` de main.css ─── */
.pt-table {
  table-layout: fixed;
  width: 100%;
  border: none;
  border-radius: 0;
  box-shadow: none;
  font-size: 0.78rem;
}

/* ─── RF-6.4: overrides del `th` global (una sola vez, no por tabla) ───
 * thead dark de main.css + th sticky: el th necesita FONDO PROPIO para que
 * el contenido no se vea a través al hacer scroll vertical dentro del
 * wrapper (mismo look: fondo dark del thead). */
.pt-table thead th {
  position: sticky;
  top: 0;
  z-index: 3;
  background-color: var(--dark-color, #1a202c);
}

/* Col rótulo sticky left (RF-1.2) — thead y filas de datos. */
.pt-table .pt-col-label,
.pt-table :deep(.pt-row-label) {
  position: sticky;
  left: 0;
  z-index: 4;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  background-color: var(--color-surface-card, #ffffff);
}

/* Esquina superior izquierda: la cabecera gana el z-index (patrón vigente). */
.pt-table thead th.pt-col-label {
  z-index: 5;
}

/* `th` pintados sobre fondo claro (esquina rótulo y etiquetas de fila):
 * el `th { color: #ffffff }` global de main.css los haría invisibles en
 * tema claro; `--color-text-primary` se adapta al tema oscuro. */
.pt-table th.pt-col-label,
.pt-table :deep(th.pt-row-label) {
  color: var(--color-text-primary, #070707);
}

/* Cabeceras de mes/Total (estilo pivote vigente 0.72rem/600). */
.pt-col-month,
.pt-col-total {
  font-size: 0.72rem;
  font-weight: 600;
}

/* ─── RF-1.5: columnas extra "Antes/Después de {año}" (Vista Flujo) ───
 * Banda clara propia (idéntica a la del `cf-col-ooy` vigente) para separar
 * visualmente las bucket-columns de los meses — el `th` global dark de
 * main.css las pintaría iguales a los meses. */
.pt-table thead th.pt-col-extra {
  background-color: var(--color-surface, #f7f7f7);
  border-left: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  color: var(--color-text-primary, #070707);
  white-space: nowrap;
}

:root[data-theme='dark'] .pt-table thead th.pt-col-extra {
  background-color: rgba(255, 255, 255, 0.05);
}

/* ─── RF-6.1: filas de total (tfoot Σ) destacadas + sticky bottom ─── */
.pt-table :deep(tfoot th),
.pt-table :deep(tfoot td) {
  position: sticky;
  bottom: 0;
  z-index: 2;
  font-weight: 700;
  background-color: var(--color-surface, #f7f7f7);
}

:root[data-theme='dark'] .pt-table :deep(tfoot th),
:root[data-theme='dark'] .pt-table :deep(tfoot td) {
  background-color: rgba(255, 255, 255, 0.05);
}

.pt-table :deep(tfoot .pt-row-label) {
  background-color: var(--color-surface, #f7f7f7);
}

/* ─── RF-6.3: zebra SUTIL (override del global `#e8f3ff` de main.css) ─── */
.pt-table :deep(tbody tr:nth-child(even)) {
  background-color: rgba(97, 97, 97, 0.04);
}

:root[data-theme='dark'] .pt-table :deep(tbody tr:nth-child(even)) {
  background-color: rgba(255, 255, 255, 0.04);
}

/* Hover fila (paridad con el global de main.css que la zebra propia pisa). */
.pt-table :deep(tbody tr:hover) {
  background-color: rgba(5, 199, 242, 0.2);
}

/* ─── Clases compartidas de los slots (RF-2.1: estilos únicos, sin los
 * duplicados `pv-` del markup de tabla en ambas vistas) ───
 * Los `<tr>/<td>` los renderiza cada vista; aquí se estilan vía `:deep()`. */

/* Celda monetaria: derecha, tabular, nowrap (RF-6/grid pivote) y ellipsis
 * (RF-2.2: la cifra completa vive en el `title` que pone el caller). */
.pt-table :deep(.pt-cell-money) {
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pt-table :deep(.pt-cell-total) {
  font-weight: 600;
}

/* Celda `%` del Acumulado (§4.3, E-01). */
.pt-table :deep(.pt-cell-pct) {
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--color-text-secondary, #555555);
}

/* Filas fuertes del P&G/Acumulado (Margen bruto, Resultado operativo…). */
.pt-table :deep(tr.pt-row-strong th),
.pt-table :deep(tr.pt-row-strong td) {
  font-weight: 700;
}

/* Etiqueta de fila SECUNDARIA (p. ej. arrastre N−1: prefijo tenue `←`/`⌁`):
 * gana a `.pt-row-label` por especificidad (definida DESPUÉS de ella). */
.pt-table :deep(th.pt-row-muted) {
  color: var(--color-text-secondary, #555555);
  font-style: italic;
}

/* ─── RF-6.2: negativos en rojo semántico (mismos valores que `pv-negative`
 *      / `cf-negative` vigentes) ─── */
.pt-table :deep(.pt-negative) {
  color: #c53030;
}

:root[data-theme='dark'] .pt-table :deep(.pt-negative) {
  color: #ff9b9b;
}
</style>
