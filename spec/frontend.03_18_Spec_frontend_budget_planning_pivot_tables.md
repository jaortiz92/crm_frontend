# Especificación FE — Normalización visual de tablas pivote de Planificación de Presupuesto

**Vistas afectadas:** `/budget/planning/:id` → pestañas **"Vista Ejecutiva"** y **"Vista Flujo"**
**Ámbito:** 100 % frontend, presentacional. Cero cambios a cálculos, stores, servicios ni API.
**Fecha:** 2026-10-15 · **Estado:** Aprobado (supuestos confirmados por el usuario)
**Componentes base:** `ExecutivePivotTable.vue`, `CashFlowPivotTable.vue`, `BudgetGridEditor.vue`, `planningFormat.js`

---

## 1. Visión general

Hoy la página renderiza hasta 9 tablas `<table>` independientes por pestaña (`ExecutivePivotTable.vue` con clases `pv-*` y `CashFlowPivotTable.vue` con clases `cf-*`, duplicadas a mano), todas con `table-layout: auto`, por lo que el ancho de los meses varía entre tablas y entre pestañas. Además tienen ~10 notas visibles en Ejecutiva y ~15 en Flujo, varias duplicadas, y **todas las cifras se muestran con el símbolo `$`** (formateador `copFormatter` con `style: 'currency'`).

Esta especificación define una **cuadrícula mensual común** (mismos anchos en todas las tablas y vistas), un **componente de tabla compartido**, una **política de notas** (tooltips + nota intro única por pestaña), mejoras de jerarquía visual y un **formato numérico sin símbolo de moneda**. Estado actual documentado en el Anexo A.

## 2. Alcance

**In-scope** (archivos):
- `crm_frontend/src/components/budget/planning/ExecutivePivotTable.vue`
- `crm_frontend/src/components/budget/planning/CashFlowPivotTable.vue`
- `crm_frontend/src/components/budget/planning/planningFormat.js` (nuevo formateador compacto + formateador sin símbolo)
- `crm_frontend/src/views/budget/planning/BudgetGridEditor.vue` (nota intro única + cifras sin `$`)
- Nuevo: `PivotMonthTable.vue` en `.../planning/`

**Fuera de alcance:** backend, `budgetPlanningStore.js` (datos), `BudgetLineGrid.vue` (tab Editor, ancho propio ya definido), panels CRUD (Internment, PayableTerms, IvaSettlement, etc.), rutas, impresión/PDF, responsive móvil (se mantiene el patrón de scroll horizontal actual), y **otras páginas del CRM** que reutilizan `formatMoney`/`formatCOP` ( conservan el `$`).

## 3. Requisitos funcionales

### RF-1 — Cuadrícula de columnas idéntica en todas las tablas

| Regla | Detalle |
|---|---|
| RF-1.1 | Toda tabla pivote usa `table-layout: fixed` + `<colgroup>` explícito. |
| RF-1.2 | Col 1: rótulo (CECO/Concepto) `width: 230px`, sticky left. Total ≈ 231px con borde. |
| RF-1.3 | Cols 2–13: 12 meses, todas `width: 106px` (igual entre sí y entre vistas). |
| RF-1.4 | Col 14 (Total): `116px`. |
| RF-1.5 | Vista Flujo con toggle IVA ON (16 cols, "Antes/Después"): las 2 columnas extra heredan `106px`; total de tabla `min-width: 1500px` (se conserva el actual). |
| RF-1.6 | Cifras que no quepan → formateo compacto (RF-2.2); celdas `title` con el valor completo. |

### RF-2 — Componente compartido `PivotMonthTable.vue`

- **RF-2.1** Nuevo componente en `.../planning/` que encapsule: `<colgroup>`, cabecera Ene–Dic+Total, slot para cuerpo, slot para `tfoot` opcional, estilos únicos (elimina la duplicación `pv-*`/`cf-*`).
- **RF-2.2** Añade `formatMoneyCompact()` a `planningFormat.js`: `|v| ≥ 10 000 000 → "12 MM"` (millones ENTEROS, SIN decimales) · resto formato plain redondeado al peso (SIN decimales). **Sin símbolo `$` (ver RF-7).** Solo se aplica cuando el render lo solicite (prop `compact`), nunca a cabeceras ni rótulos.
- **RF-2.3** `CashFlowPivotTable` y `ExecutivePivotTable` migran su markup de tabla (thead/tbody/tfoot) a `PivotMonthTable` por bloques, conservando sus computed/lógica de datos intacta.

### RF-3 — Política de notas (pie de página)

- **RF-3.1** Intro "Matriz de solo lectura…" → **una sola vez por pestaña**, movida a `BudgetGridEditor.vue` (nivel tab), ya no por cada tabla. Debe incluir la aclaración de moneda: *"Montos en COP"* (ver RF-7).
- **RF-3.2** Notas descriptivas de bloque (`VARIABLE_PIVOT_NOTE`, `ENTRADAS_NOTE`, `PNL_NOTE`, `ACUMULADO_NOTE`, notas de pagos/liquidación/arrastre, etc.) → **ícono ℹ️ con tooltip nativo (`title`)** junto al subtítulo del bloque. Son texto estático, no interacciones: tooltips nativos son suficientes.
- **RF-3.3** Avisos de degradación/error (ej. `COST_EMPTY_NO_RATES`, `settlementDegraded` con botón Reintentar, `bodegaNegative`, chip fuera-de-año) → **siguen visibles con `v-if`** solo cuando ocurren. No se ocultan en tooltip: son accionables.
- **RF-3.4** Máximo visible en estado normal: ≤ 2 bloques de texto por pestaña (intro + aviso si existe).

### RF-4 — Eliminación de duplicaciones de texto

- **RF-4.1** Borrar la intro duplicada "Matriz…" de ambos componentes (queda solo la de RF-3.1).
- **RF-4.2** Unificar `VARIABLE_PIVOT_NOTE` (definida 1 vez, consumida por ambas vistas vía `planningFormat.js`).
- **RF-4.3** "Σ meses + fuera de año = total anual" → se muestra **una vez por pestaña** (en la intro única), no una vez por bloque ni en el resumen.

### RF-5 — Cabecera mensual sticky

- **RF-5.1** La fila Ene–Dic queda pegajosa arriba durante el scroll vertical del contenedor de la pestaña, también al desplazarse entre bloques (una cabecera por pestaña, no una por tabla). Se logra con sticky por tabla en contenedor de scroll único por pestaña; aceptable si la cabecera común por contenedor requiere refactor mayor (opción B documentada).

### RF-6 — Jerarquía visual

- **RF-6.1** Filas de total (`tfoot`/fila Total) con fondo distintivo y `font-weight: 700`.
- **RF-6.2** Cifras negativas → color rojo semántico (token de color del proyecto).
- **RF-6.3** Zebra sutil (filas alternas) para lectura horizontal de meses.
- **RF-6.4** Se conservan los overrides del `th` global de `main.css` en el nuevo componente (una sola vez, no en cada tabla).

### RF-7 — Cifras sin símbolo `$`

- **RF-7.1** Nueva exportación `formatMoneyPlain(value)` en `planningFormat.js`: usa `Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })` (separador de miles con punto, sin decimales, **sin símbolo de moneda**). Ejemplo: `1.234.567`. Devuelve `'—'` si no es número finito (propiedad actual de `formatMoney` se conserva).
- **RF-7.2** `ExecutivePivotTable.vue` y `CashFlowPivotTable.vue` cambian `formatMoney` → `formatMoneyPlain` en TODAS las celdas: mensuales, columna Total, `tfoot` Σ y columnas "Antes/Después" del toggle IVA. El mapeo `0 → '·'` y `null → '—'` no cambia.
- **RF-7.3** En `BudgetGridEditor.vue` las cifras de las pestañas Ejecutiva/Flujo (cards Σ Ingresos/Σ Gastos de cabecera y montos dentro de los avisos de nómina/financiación simulada) también usan `formatMoneyPlain`.
- **RF-7.4** La moneda se declara **una sola vez** por pestaña en la intro única (RF-3.1: "Montos en COP"), no por celda.
- **RF-7.5** El formateador compacto `formatMoneyCompact` (RF-2.2) y `formatCOP` (nómina, 2 decimales) NO agregan `$`. `formatCOP` fuera de estas vistas queda intocado.
- **RF-7.6** `formatMoney` global (con `$`) no se modifica: otros módulos del CRM que la usan conservan su comportamiento.

## 4. Criterios de aceptación

| # | Criterio (medible) |
|---|---|
| AC-1 | En la pestaña Vista Ejecutiva, la coordenada `left` de la celda "Ene" en el bloque Ingresos y en Gastos fijos es idéntica (±1px); igual en Vista Flujo (verificación por DevTools/inspección). |
| AC-2 | Los 12 meses + Total + rótulo miden lo mismo en ambas pestañas (misma cuadrícula: 231 + 12×106 + 116). |
| AC-3 | Estado normal (sin errores): ≤ 2 bloques de texto visible por pestaña, y 0 copias del texto "Σ meses + fuera de año" fuera de la intro única. |
| AC-4 | Hover sobre ℹ️ muestra la nota completa; el valor completo de toda celda compacta está en su `title`. Ninguna información se pierde. |
| AC-5 | Escenarios de degradación: los avisos con acción (Reintentar, etc.) siguen visibles. |
| AC-6 | Con toggle "Con IVA" en Flujo, las 16 columnas cumplen RF-1.5. |
| AC-7 | Todos los computed/salidas numéricas de ambas vistas son byte-idénticos al estado previo (diff de recarga, sin cambios en `budgetPlanningStore.js`). |
| AC-8 | `npm run lint` ok, sin restos de CSS `pv-*`/`cf-*` duplicado en ambos componentes. |
| AC-9 | Grep de `$` en el render de ambas vistas + cards Σ de `BudgetGridEditor.vue`: 0 ocurrencias de símbolo de moneda (solo queda en la intro como texto "Montos en COP" si aplica); los valores siguen separados por miles (`1.234.567`). |

## 5. No funcionales

- **Rendimiento:** solo cambia el render; no debe empeorar el repaint actual (columnas fijas ayudan). Sin nuevas dependencias.
- **Compatibilidad:** Vue 3 `<script setup>`, JS sin TypeScript, alias `@`, sigue convenciones del proyecto (naming camelCase, patrón de imports existente).
- **Riesgos y mitigación:** (a) `table-layout: fixed` puede recortar cifras → formateo compacto + `title`; (b) migrar 9 tablas de Flujo es refactor de riesgo medio → plan de fases (ver §6); (c) sticky compartida puede chocar con `max-height: 60vh` por tabla → mantener scroll wrappers existentes salvo indicación; (d) perder claridad de moneda al quitar `$` → mitigado por RF-7.4 y AC-9.

## 6. Plan de implementación (fases)

1. **Fase 1 — Infraestructura:** `formatMoneyPlain` + `formatMoneyCompact` en `planningFormat.js`; componente `PivotMonthTable.vue`.
2. **Fase 2 — Vista Ejecutiva:** migrar bloques a `PivotMonthTable`, colgroup (RF-1), notas → tooltips (RF-3/RF-4), `$` → plain (RF-7), jerarquía (RF-6). Validar AC-1..AC-9 en esta pestaña.
3. **Fase 3 — Vista Flujo:** mismo tratamiento (incluye toggle IVA de 16 cols y bloque de arrastre).
4. **Fase 4 — Cabecera sticky de pestaña (RF-5)** + nota intro única en `BudgetGridEditor.vue` + limpieza final.

## 7. Trazabilidad

| Fuente | Requisito | Verificación |
|---|---|---|
| Queja del usuario: meses desiguales | RF-1, RF-2, RF-5, RF-6 | AC-1, AC-2, AC-6 |
| Queja del usuario: exceso de texto | RF-3, RF-4 | AC-3, AC-4, AC-5 |
| Solicitud del usuario: quitar `$` | RF-7 | AC-9 |
| Protección de datos/cálculos | — (fuera de alcance) | AC-7, AC-8 |

---

## Anexo A — Estado actual (referencia de código)

### Ancho de columnas (causa raíz)
- Sin `<colgroup>` ni width por columna en ninguna tabla. `.pv-table`/`.cf-table`: `min-width: 1240px` (1500px con fuera-de-año). `table-layout` implícito `auto` ⇒ cada mes se estira por contenido ⇒ anchos distintos entre tablas y vistas.
- Únicos anchos: `.cf-col-ooy { min-width: 118px }`, `.cf-table-ooy { min-width: 1500px }`.
- Rótulo sticky: `max-width: 240px` (Ejecutiva 892–903; Flujo 2329–2340).

### Notas duplicadas (inventario)
- Intro "Matriz de solo lectura…" duplicada: Ejecutiva 663–667 y Flujo 1935–1942 (ambas siempre en DOM por `v-show`, BudgetGridEditor 704/714).
- `VARIABLE_PIVOT_NOTE` duplicada: Ejecutiva 578–580 y Flujo 481–483.
- "Σ meses + fuera de año = total anual": en el resumen (Flujo 1990–1992) y por bloque (2173–2181) ⇒ N copias.

### Formato moneda actual
- `planningFormat.js`: `copFormatter = Intl.NumberFormat('es-CO', {style:'currency', currency:'COP', maximumFractionDigits:0})` ⇒ `formatMoney` devuelve `$ 1.234.567`; `formatCOP` devuelve `$ 2.750.440,00`.
- Usos in-scope a migrar a `formatMoneyPlain`: ExecutivePivotTable (389, 412, 417, 784), CashFlowPivotTable (1828, 1841, 1855, 1865, 2133–2252), BudgetGridEditor (522–523, 632, 662–664).

### Sticky y compartición
- Sticky por tabla: `thead` top:0, `tfoot` bottom:0, col rótulo left:0 (esquinas z-index 5).
- No existe componente de tabla compartido; `RatesDataTable.vue` es específico de Reglas Financieras; los grids son hand-rolled ⇒ Justifica RF-2.
