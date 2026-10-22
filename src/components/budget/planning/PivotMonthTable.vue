<script setup>
/**
 * PivotMonthTable — componente compartido de las tablas pivote mensuales de
 * Planificación de Presupuesto (FE-S18, spec `frontend.03_18` RF-2.1).
 *
 * Encapsula el markup antes duplicado a mano en `ExecutivePivotTable` (clases
 * `pv-*`) y `CashFlowPivotTable` (clases `cf-*`):
 *  - RF-1.1: `table-layout: fixed` SIEMPRE con `<colgroup>` explícito.
 *  - RF-1.2: col 1 rótulo = 230px, sticky left.
 *  - Total (2026-10): col Total sticky right - el scroll horizontal
 *    recorre SOLO los meses; Concepto (left) y Total (right) quedan fijos.
 *  - RF-1.3: 12 meses de 106px, TODOS iguales entre sí y entre vistas (misma
 *    cuadrícula AC-1/AC-2: 230 + 12×106 + 116).
 *  - RF-1.4: col Total = 116px.
 *  - RF-1.5 (opcional, Vista Flujo): columnas extra "Antes/Después de {año}"
 *    vía prop `extraColumns` — se renderizan DESPUÉS de la col Total
 *    (comportamiento heredado) y, con `extrasBeforeTotal`, ANTES de ella
 *    (ENMIENDA A-05 de la Vista Flujo: `Ene…Dic | Antes | Después | Total`).
 *  - ENMIENDA A-05 (spec `frontend.03_21` §14, prop `generalColumn`): cuando
 *    la tabla "en serio" tiene Antes/Después, la Vista Flujo pasa
 *    `{ label, title }` ⇒ se añade una ÚLTIMA col "Total General" (116px,
 *    pinned right). 2026-10-21 (§14.7): AMBAS columnas de totales quedan
 *    pinned right — la Total interna ancla en el offset de la General
 *    (`right: var(--pt-total-general-w)`), así su header/celdas NO se
 *    desplazan con el scroll (bug reportado: el header Total se iba).
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
const COL_MONTH_WIDTH = 120
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
  /** RF-1.5: renderiza las columnas extra ANTES de la col Total (A-05). */
  extrasBeforeTotal: { type: Boolean, default: false },
  /**
   * A-05: `{ label, title }` de la col "Total General" (12 meses + Antes +
   * Después); `null` ⇒ sin columna (mismo DOM heredado — BR-FE21-19).
   */
  generalColumn: { type: Object, default: null },
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
    COL_TOTAL_WIDTH +
    (props.generalColumn ? COL_TOTAL_WIDTH : 0)
  )
})
const hasGeneral = computed(() => props.generalColumn !== null)
/**
 * 2026-10-21 (§14.7): con `generalColumn`, la col Total interna queda
 * sticky right anclada en `right: var(--pt-total-general-w)` (el ancho de
 * la col Total General). Sin General la var no se emite ⇒ reglas byte-
 * idénticas al sticky-right único heredado.
 */
const tableStyle = computed(() => {
  const style = { minWidth: `${resolvedMinWidth.value}px` }
  if (hasGeneral.value) style['--pt-total-general-w'] = `${COL_TOTAL_WIDTH}px`
  return style
})
const totalHeaderClass = computed(() =>
  hasGeneral.value ? 'pt-col-total pt-col-total-inner' : 'pt-col-total'
)

/**
 * Orden del colgroup/thead según `extrasBeforeTotal` (A-05): ANTES del Total
 * (`...Dic | Antes | Después | Total`) o después (orden heredado). Con
 * `generalColumn` la col "Total General" SIEMPRE queda al final.
 */
</script>

<template>
  <div class="pt-scroll">
    <table class="pt-table" :aria-label="ariaLabel" :style="tableStyle">
      <colgroup>
        <col :style="{ width: `${COL_LABEL_WIDTH}px` }" />
        <col v-for="month in monthLabels" :key="month" :style="{ width: `${COL_MONTH_WIDTH}px` }" />
        <template v-if="extrasBeforeTotal">
          <col
            v-for="extra in extraColumns"
            :key="extra.label"
            :style="{ width: `${COL_MONTH_WIDTH}px` }"
          />
          <col :style="{ width: `${COL_TOTAL_WIDTH}px` }" />
        </template>
        <template v-else>
          <col :style="{ width: `${COL_TOTAL_WIDTH}px` }" />
          <col
            v-for="extra in extraColumns"
            :key="extra.label"
            :style="{ width: `${COL_MONTH_WIDTH}px` }"
          />
        </template>
        <col v-if="hasGeneral" :style="{ width: `${COL_TOTAL_WIDTH}px` }" />
      </colgroup>
      <thead>
        <tr>
          <th class="pt-col-label">{{ labelHeader }}</th>
          <th v-for="month in monthLabels" :key="month" class="pt-col-month">{{ month }}</th>
          <template v-if="extrasBeforeTotal">
            <th
              v-for="extra in extraColumns"
              :key="extra.label"
              class="pt-col-month pt-col-extra"
              :title="extra.title || null"
            >
              {{ extra.label }}
            </th>
            <th :class="totalHeaderClass" :title="totalTitle || null">Total</th>
          </template>
          <template v-else>
            <th :class="totalHeaderClass" :title="totalTitle || null">Total</th>
            <th
              v-for="extra in extraColumns"
              :key="extra.label"
              class="pt-col-month pt-col-extra"
              :title="extra.title || null"
            >
              {{ extra.label }}
            </th>
          </template>
          <!-- A-05: "Total General" (meses + Antes + Después) — última col,
               hereda el rol sticky right / estilo de la col Total. -->
          <th v-if="hasGeneral" class="pt-col-total" :title="generalColumn.title || null">
            {{ generalColumn.label }}
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
  /* FIJA-VERTICAL/HORIZONTAL: el main.css global pinta table con
   * overflow: hidden (para recortar las esquinas redondeadas). Ese
   * overflow convierte a la propia tabla en scroll-container nunca
   * desplazable, y las celdas sticky (rotulo left / Total right /
   * thead top / tfoot bottom) se anclan a la caja de la tabla en vez
   * de a .pt-scroll: TODO se mueve con el scroll. overflow: visible
   * devuelve el anclaje al wrapper .pt-scroll (overflow: auto). */
  overflow: visible;
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
  box-shadow: inset -1px 0 0 0 var(--color-border-strong, rgba(97, 97, 97, 0.3));
}

/* Esquina superior izquierda: la cabecera gana el z-index (patrón vigente). */
.pt-table thead th.pt-col-label {
  z-index: 5;
}

/* Col Total sticky right: el scroll horizontal recorre SOLO los meses.
 * Concepto queda fijo a la izquierda (RF-1.2) y Total fijo a la derecha.
 * El Total gana z-index sobre los meses (z 3) y queda bajo la esquina
 * superior izquierda (z 5); el fondo opaco impide traslucir los meses
 * que deslizan por debajo. En el Flujo, las columnas extra
 * (Antes/Despues de {anio}) siguen al final del scroll, SIN fijarse:
 * por DOM van despues del Total y con z menor, asi el Total pinned las
 * cubre mientras hay desplazamiento pendiente. */
.pt-table thead th.pt-col-total {
  position: sticky;
  right: 0;
  z-index: 4;
  box-shadow: inset 1px 0 0 0 var(--color-border-strong, rgba(97, 97, 97, 0.3));
}

/* Celdas del Total en el cuerpo: fondo OPACO imprescindible - si quedara
 * transparente, los meses se verian a traves al deslizar debajo. */
.pt-table :deep(tbody td.pt-cell-total) {
  position: sticky;
  right: 0;
  z-index: 2;
  background-color: var(--color-surface-card, #ffffff);
  box-shadow: inset 1px 0 0 0 var(--color-border-strong, rgba(97, 97, 97, 0.3));
}

/* Esquina Sigma Total x Total (tfoot): hereda sticky bottom de la regla
 * general del tfoot (sin redeclarar position) y suma el anclaje right con
 * un z superior al resto de las celdas del pie.

 * §14.7 (2026-10-21): la Sigma de la col Total INTERNA (clase
 * `pt-cell-total-inner`) también queda pinned en el offset de la General;
 * la General ancla en right 0 via `td.pt-cell-total`. */
.pt-table :deep(tfoot td.pt-cell-total) {
  right: 0;
  z-index: 3;
  box-shadow: inset 1px 0 0 0 var(--color-border-strong, rgba(97, 97, 97, 0.3));
}

.pt-table :deep(tfoot td.pt-cell-total-inner) {
  right: var(--pt-total-general-w, 0px);
  z-index: 3;
}

/* Tema oscuro: el tfoot pinta las celdas con un fondo TRANSLUCIDO
 * (rgba blanco 0.05). La esquina Sigma Total fijada a la derecha
 * necesitan fondo OPACO de lo contrario trasluciria los meses que
 * deslizan por debajo (defecto preexistente del tfoot dark, visible
 * mucho mas con la columna fijada). */
:root[data-theme='dark'] .pt-table :deep(tfoot td.pt-cell-total) {
  background-color: var(--color-surface, #0f1d2e);
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
.pt-col-total,
.pt-col-total-inner {
  font-size: 0.72rem;
  font-weight: 600;
}

/* ENMIENDA A-05 + §14.7 (2026-10-21): con "Total General" presente AMBAS
 * columnas de totales quedan pinned right. La Total interna ancla en
 * `right: var(--pt-total-general-w)` (offset = ancho de la General, 116px)
 * para que su header NO se desplace con el scroll (bug reportado); la
 * General ancla en right 0 (estado previo, sin cambios). Ganancia por
 * doble clase sobre `th.pt-col-total` (right 0). */
.pt-table thead th.pt-col-total-inner {
  right: var(--pt-total-general-w, 0px);
  z-index: 4;
  background-color: var(--dark-color, #1a202c);
}

.pt-table :deep(tbody td.pt-cell-total-inner) {
  font-weight: 600;
  right: var(--pt-total-general-w, 0px);
  z-index: 2;
  /* Fondo OPACO (NFR §14.7): ya no estática, transluciría los meses que
   * deslizan por debajo en el gap entre ambas columnas fijas. */
  background-color: var(--color-surface-card, #ffffff);
  box-shadow: inset 1px 0 0 0 var(--color-border-strong, rgba(97, 97, 97, 0.3));
}

/* ─── RF-1.5: columnas extra "Antes/Después de {año}" (Vista Flujo) ───
 * Banda clara propia (idéntica a la del `cf-col-ooy` vigente) para separar
 * visualmente las bucket-columns de los meses — el `th` global dark de
 * main.css las pintaría iguales a los meses. */
.pt-table thead th.pt-col-extra {
  background-color: var(--color-surface, #f9f9f9);
  border-left: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  color: var(--color-text-primary, #070707);
  white-space: nowrap;
}

/* `--color-surface` es sólido en dark (#0f1d2e, var vigente del tema —
 * mismo patrón del fix "solid background for pivot totals row in dark
 * theme", S12-PIVOT-FIX); el rgba translúcido preexistente traslucía
 * las celdas/meses que deslizan por debajo. */
:root[data-theme='dark'] .pt-table thead th.pt-col-extra {
  background-color: var(--color-surface, #0f1d2e);
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

/* S12-PIVOT-FIX: fila de totales con fondo SÓLIDO en tema oscuro — el rgba
 * translúcido dejaba ver las celdas que deslizan por debajo (tfoot es
 * sticky-bottom en el scroll del pivote), el mismo defecto ya corregido en
 * la esquina Sigma Total x Total. --color-surface es sólido: #0f1d2e. */
:root[data-theme='dark'] .pt-table :deep(tfoot th),
:root[data-theme='dark'] .pt-table :deep(tfoot td) {
  background-color: var(--color-surface, #0f1d2e);
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
