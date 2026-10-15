# Especificación FE — Drill-down de Movimientos por CECO en Planificación de Presupuesto

**Vistas afectadas:** `/budget/planning/:id` → tab **"Vista Ejecutiva"** y tab **"Vista Flujo"** (origen del drill-down) · Nueva vista de detalle `/budget/planning/:id/ceco/:costCenterCode`
**Ámbito:** 100 % frontend, de solo lectura. Cero cambios a backend, modelos, servicios ni endpoints. Se reutiliza la caché del store (convención ASM-10: la matriz es presentación, no ingesta).
**Fecha:** 2026-10-15 · **Estado:** Aprobado (supuestos confirmados por el usuario)
**Componentes base:** `ExecutivePivotTable.vue`, `CashFlowPivotTable.vue`, `BudgetGridEditor.vue`, `PivotMonthTable.vue`, `planningFormat.js`, `budgetPlanningStore.js`

---

## 1. Visión general

Hoy los pivotes de Budget Planning (`ExecutivePivotTable`, `CashFlowPivotTable`) son 100 % read-only y **no tienen drill-down**: el usuario ve el agregado por CECO y mes (como la fila del CECO `310100`), pero no puede ver **qué movimientos individuales generaron esos montos**. El detalle más fino existente es por *línea* (`budget_lines`, tab "Editor de Celdas"), no un detalle contextual desde el pivote.

Esta especificación define: al hacer **click sobre la celda del CECO** (la primera celda de cada fila de datos del pivote, donde se muestra el código del centro de costo), el usuario navega a una **nueva vista de detalle** que muestra todos los **movimientos planificados** (`budget_lines`) de ese CECO, presentados con:

1. **Un componente de tabla pivote** (resumen agregado CECO × meses, con subtotales).
2. **Un componente de tabla tabular** (una fila por movimiento/línea).

Separados a lo largo de dos pestañas: **"Causado"** (P&G, mes de `budget_date`) y **"Flujo"** (caja, mes de `payment_date`).

## 2. Alcance

**In-scope** (archivos):
- ➕ Nuevo: `crm_frontend/src/views/budget/planning/CecoDetailView.vue`
- ➕ Nuevo: `crm_frontend/src/components/budget/planning/CecoMovementPivot.vue`
- ➕ Nuevo: `crm_frontend/src/components/budget/planning/CecoMovementTable.vue`
- ✏️ Modificar: `crm_frontend/src/router/index.js` (nueva ruta hija de `/budget` con gate)
- ✏️ Modificar: `crm_frontend/src/components/budget/planning/ExecutivePivotTable.vue` (celda CECO clicable)
- ✏️ Modificar: `crm_frontend/src/components/budget/planning/CashFlowPivotTable.vue` (ídem)
- 🔧 Opcional: `crm_frontend/src/utils/planningFormat.js` o store — helper compartido de agregación por mes/tipo si se detecta duplicación de lógica

**Fuera de alcance:**
- ❌ Edición de datos en la vista de detalle (la edición sigue en la tab "Editor de Celdas").
- ❌ Datos reales de SIIGO (`actual_expenses`, `payment_ledger`) — no se conectan en esta iteración.
- ❌ Nuevos endpoints backend ni cambios en modelos (`crm_backend/**` no se toca).
- ❌ Exportación (Excel/CSV/PDF) del detalle.
- ❌ Click en celdas de datos del pivote: **solo la celda del CECO** es interactiva (decisión del usuario); el resto de celdas permanece con el comportamiento actual.

## 3. Terminología

| Término | Definición |
|---|---|
| **Movimiento** | Una `budget_line` del escenario en la caché del store (unidad mínima de datos). |
| **Causado** | Monto de la línea posicionado en el mes de su `budget_date` (base de la Vista Ejecutiva). |
| **Flujo** | Monto de la línea posicionado en el mes de su `payment_date` (base de la Vista Flujo). |
| **Celda del CECO** | Primera celda de cada fila de datos del pivote donde se muestra el código del centro de costo (`cost_center_code`, p. ej. `310100`). |
| **Sin fecha de pago** | Líneas con `payment_date = null` (típicamente `PURCHASE`); se consolidan en una columna final en el tab Flujo. |
| **ivaMode** | Toggle Neto/Con IVA del store (`budgetPlanningStore.setIvaMode`), compartido con el editor. |

## 4. Requisitos funcionales

### 4.1 Navegación (desde el grid)

| Regla | Detalle |
|---|---|
| RF-1.1 | En `ExecutivePivotTable.vue` y `CashFlowPivotTable.vue`, **únicamente la celda del CECO** (columna inicial de cada fila de datos) es clicable y navega mediante `router.push` a la nueva ruta `BudgetCecoDetail`: `/budget/planning/:idBudget/ceco/:costCenterCode`. |
| RF-1.2 | Las demás celdas del pivote (valores mensuales, subtotales, totales) **no se vuelven interactivas**: el comportamiento visual y funcional actual permanece intacto. |
| RF-1.3 | Affordance visual de la celda del CECO: cursor pointer + estado hover (subrayado o tono resaltado). El hover no debe extenderse a la fila completa ni a las celdas de valores. |
| RF-1.4 | El click **no dispara llamadas HTTP**; los pivotes siguen computados al 100 % en cliente desde `budgetPlanningStore.currentScenario` y el click solo cambia la ruta. |

### 4.2 Ruta y estructura de la vista de detalle

| Regla | Detalle |
|---|---|
| RF-2.1 | Ruta hija de `/budget` en `router/index.js`: `path: 'planning/:idBudget/ceco/:costCenterCode'`, name `BudgetCecoDetail`, con el mismo gate `beforeEnter: canAccessBudgetUpload()` usado por el grid. |
| RF-2.2 | Nueva vista `CecoDetailView.vue`. Cabecera: código y nombre del CECO, nombre del escenario/año, link "← Volver a planning" (`router.back()` o a `/budget/planning/:idBudget`), y el modo "Neto/Con IVA" heredado de `ivaMode` (de solo lectura, sincronizado con el editor). |
| RF-2.3 | Si el CECO del parámetro no tiene `budget_lines` en `currentScenario`: estado vacío ("Sin movimientos para este CECO") + botón volver; **sin** llamadas a la API. |
| RF-2.4 | Llegada por URL directa (bookmark) donde `currentScenario.id !== idBudget`: la vista dispara la carga existente (`GET /budget/planning/{id}/detail` vía `budgetPlanningService`) con el mismo manejo de 404 (`router.replace` a planning) usado por el editor, y muestra skeleton/loader mientras carga. |

### 4.3 Pestañas "Causado" y "Flujo"

| Regla | Detalle |
|---|---|
| RF-3.1 | La vista presenta **dos tabs**: **"Causado"** (default) y **"Flujo"**, con los mismos estilos/tokens de tabs que `BudgetGridEditor`. |
| RF-3.2 | Tab **Causado**: dataset = todas las `budget_lines` del CECO, posicionadas en su mes de `budget_date`. |
| RF-3.3 | Tab **Flujo**: dataset = las mismas líneas en su mes de `payment_date`; las líneas con `payment_date = null` se consolidan en una columna adicional **"Sin fecha de pago"** (última posición, antes del Total), de modo que los totales cuadren contra el causado. |
| RF-3.4 | El tab Flujo de detalle **no replica** los bloques derivados de la Vista Ejecutiva (COGS, tasas, etc.): solo movimientos base. Las derivaciones puras de cliente aplicables (p. ej. IVA en modo Con IVA) se recalculan con los **mismos helpers existentes** para no divergir. |
| RF-3.5 | Ambos tabs muestran el **total del CECO** en la cabecera (suma de la tab activa), que debe cuadrar con el agregado del pivote de `BudgetGridEditor` para ese CECO. |

### 4.4 Componente pivote `CecoMovementPivot.vue`

| Regla | Detalle |
|---|---|
| RF-4.1 | Construido sobre `PivotMonthTable.vue` (mismo patrón: `<colgroup>` explícito, `table-layout: fixed`, thead sticky). |
| RF-4.2 | **Filas:** agrupadas por tipo de línea (`INCOME` / `EXPENSE` / `PURCHASE`) con subtotal por tipo y total general. **Columnas:** Ene–Dic + Total; en el tab Flujo se añade la columna "Sin fecha de pago". |
| RF-4.3 | Los valores **deben cuadrar** con la tabla tabular del detalle y con la fila del CECO en el pivote de origen (diferencia permitida: 0 por redondeo). |
| RF-4.4 | Respeta `ivaMode` (Neto/Con IVA) con el mismo helper de cálculo que `ExecutivePivotTable` — no duplicar la lógica. |

### 4.5 Componente tabular `CecoMovementTable.vue`

| Regla | Detalle |
|---|---|
| RF-5.1 | Una fila por movimiento (línea). **Columnas:** N° orden de línea, cuenta/categoría, tipo (`INCOME/EXPENSE/PURCHASE` con chip de color), comportamiento (`fixed/variable_sales/variable_receivables`), origen (motor si `source_engine` está poblado), descripción, mes de causación, mes de pago (o "—"), monto (según `ivaMode`). |
| RF-5.2 | La tabla respeta los **mismos filtros** que el pivote (sincronizados 1:1) y muestra el **total de la selección** en su footer. |
| RF-5.3 | Ordenamiento columnar simple (asc/desc por click en encabezado), en cliente, sin afectar al pivote. |

### 4.6 Filtros

| Regla | Detalle |
|---|---|
| RF-6.1 | Barra de filtros en `CecoDetailView`: **mes de referencia** (Todos / Ene–Dic; actúa sobre el mes activo del tab: `budget_date` en Causado, `payment_date` en Flujo, con "Sin fecha" como opción del tab Flujo), **tipo de línea** (Todos / Ingresos / Gastos / Compras), **comportamiento** (Todos / Fijo / Variable ventas / Variable cartera). Estado de filtros local a la vista (`ref`). |
| RF-6.2 | Al aplicar un filtro, pivote + tabla + totales de cabecera se actualizan de inmediato (computed). Sin llamadas HTTP. |

## 5. Requisitos no funcionales

| Regla | Detalle |
|---|---|
| RF-7.1 | **Rendimiento:** render a partir de datos ya en caché (0 llamadas nuevas en el flujo normal). Los filtros corren en `computed` sin re-render completo de `BudgetGridEditor`. |
| RF-7.2 | **Consistencia visual:** dinero con `formatMoneyPlain` (COP sin `$`), chips con el patrón `statusChipOf`, thead sticky, scroll horizontal — idéntico a los pivotes vigentes (ver [frontend.03_18]). |
| RF-7.3 | **Accesibilidad:** la celda CECO clicable es `<router-link>` o botón semántico con etiqueta accesible (`Ver detalle de movimientos de CECO {code}`); focus visible. |
| RF-7.4 | **Mantenibilidad:** no duplicar lógica de agregación que ya existe en `budgetPlanningStore.js`/`planningFormat.js` — reutilizar o extraer helper compartido. `npm run lint` limpio. |
| RF-7.5 | Convencciones: `<script setup>` Composition API, JSDoc de spec en encabezado del componente (FE-S16 / frontend.03_19),(Path alias `@`.) servicio Axios centralizado (sin nuevas llamadas en el flujo normal). |

## 6. Contratos de datos (sin cambios de backend)

- **Parámetros de ruta:** `idBudget` (número), `costCenterCode` (string, p. ej. `"310100"`).
- **Dependencias del store:** `currentScenario` (con `budget_lines`), `ivaMode`, catálogos CECO (`ensureCatalogs()` ya garantizada por la carga del grid; en entrada directa se cubre con RF-2.4).
- **Campos de línea usados:** `id_budget_line`, `line_type`, `budget_date`, `payment_date`, `projected_amount`, `behavior_type`, `variable_rate`, `has_iva`, `source_engine`, `id_cost_center` y la cuenta/categoría visible.

## 7. Criterios de aceptación

| # | Criterio |
|---|---|
| AC-1 | En `/budget/planning/562`, tab Vista Ejecutiva, al hacer click **solo** en la celda donde aparece el CECO `310100` se navega a `/budget/planning/562/ceco/310100`. El click en cualquier otra celda no navega. |
| AC-2 | Ídem en la tab Vista Flujo. |
| AC-3 | La vista de detalle muestra pivote y tabla tabular solo del CECO `310100`; los totales del pivote de detalle cuadran mes a mes con la fila del CECO en el pivote de origen. |
| AC-4 | El tab "Causado" agrupa por `budget_date` y el tab "Flujo" por `payment_date`; en Flujo, las líneas sin `payment_date` aparecen en la columna "Sin fecha de pago". |
| AC-5 | Los filtros de mes/tipo/comportamiento aplican simultáneamente a pivote, tabla y totales, sin requests nuevas (verificado en la pestaña Network). |
| AC-6 | El toggle Neto/Con IVA refleja el estado del editor y recalcula los montos de forma consistente. |
| AC-7 | CECO sin líneas → estado vacío con botón volver; sin errores en consola. |
| AC-8 | Llegada por URL directa con escenario no cargado → se carga el detalle vía `GET /budget/planning/{id}/detail` con loader y manejo de 404 igual que el editor. |
| AC-9 | `npm run lint` sin errores/warnings; `npm run dev` carga la ruta nueva sin fallos. |

## 8. Riesgos / notas de implementación

1. **Divergencia de cálculo:** mayor riesgo es que el pivote de detalle no cuadre con el de origen. Mitigación: reutilizar/extraer los mismos helpers de agregación en vez de reimplementarlos (RF-4.3, RF-7.4).
2. **Líneas sin `payment_date`:** decisión explícita (confirmada) de mostrarlas en la columna "Sin fecha de pago" del tab Flujo (RF-3.3) para que los totales cuadren.
3. **Caché no poblada:** cubierto por RF-2.4 / AC-8 para entrada por URL directa.

---
---

# REVISIÓN 2 (2026-10-15) — Extensión: movimientos de Nómina, Financiación y Capital

**Origen:** verificación en BD. Un CECO puede responder por movimientos que NO son `budget_lines`: el CECO `510100` (Financiera General) en el escenario `562` no tiene líneas de presupuesto, pero **sí** tiene movimientos proyectados por los motores: intereses/seguros de financiación (`financing-simulation`), capital y desembolsos (`financing-principal-flow`) y nómina what-if (`payroll-simulation`). `BudgetGridEditor` los muestra fusionados en `scenarioView`, así que el drill-down debe verlos también (refina **RF-3.4**).

## 8. Movimientos de motores (RF-8)

| Regla | Detalle |
|---|---|
| RF-8.1 | El detalle resume **4 orígenes** de movimiento, todos con `id_cost_center`: (1) `budget_lines` (base), (2) **nómina what-if** `store.payrollSim.data.lines`, (3) **financiación** `store.financingSim.data.lines` (FIN_INTEREST/FIN_INSURANCE), (4) **capital/desembolsos** `store.financingPrincipalFlow.data.lines / disbursement_lines`. |
| RF-8.2 | Carga (misma mecánica del editor `BudgetGridEditor.load()`): tras `fetchScenarioDetail` ok, si `scenario.status !== 'active'` ⇒ `fetchPayrollSimulation` + `fetchFinancingSimulation` en paralelo (degradación SILENTE, single-flight); y `fetchFinancingPrincipalFlow` SIEMPRE (active/draft/closed). En escenarios ACTIVOS el motor ya materializó sus líneas en `budget_lines` (source_engine='payroll' etc.): no se piden sims (el backend 400). |
| RF-8.3 | Normalización: los movimientos de los 4 orígenes se convierten a UNA forma común en `cecoMovements.js` (`source_kind: 'base' | 'payroll' | 'financing' | 'principal' | 'disbursement'`), espejo del mapeo del editor: sims ⇒ `line_type 'expense'`, `behavior 'fixed'`, **`has_iva: false`** (el pivote Flujo de origen NO aplica gross-up a lo simulado: byte-cuadre), meta (colaborador, componente, cuota, crédito). Capital/desembolsos ⇒ NUNCA entran al P&L: solo tab Flujo. |
| RF-8.4 | Agrupación del pivote por origen/tipo: **Presupuesto** (Ingresos/Gastos/Compras) + **Nómina** + **Financiación** (intereses/seguros) + **Capital de financiación** y **Desembolsos** (solo tab Flujo), con subtotal por grupo y Σ Total de la tab. |
| RF-8.5 | Posicionamiento por mes (cuadre con origen): base ⇒ `causedMonthOf`/`flowMonthOf` (estricto, columna "Sin fecha de pago"); sims ⇒ Causado por `budget_date`, Flujo por `payment_date || budget_date` (mismo fallback que `cfMonth` del pivote de origen); capital/desembolsos ⇒ `payment_date` puro. |
| RF-8.6 | Montos: reutilizar `movementAmount` (Causado neto; Flujo respeta IVA pero `has_iva=false` de los sims ⇒ sin gross-up, ÷ igual al origen). Capital/desembolsos siempre monto crudo (no son gasto P&L ni llevan IVA). |
| RF-8.7 | Filtros: el selector "Tipo de línea" se extiende a origen/tipo (Todos / Ingresos / Gastos / Compras / Nómina / Financiación / Capital de financiación / Desembolsos). El filtro "Comportamiento" solo afecta a los movimientos base (los motores son 'fixed' implícito). El filtro de mes opera sobre el mes de posición del RF-8.5 según tab. |
| RF-8.8 | Estado vacío: "Sin movimientos" SOLO si el CECO no tiene movimientos en NINGUN origen. Si el CECO existe en catálogo pero no tiene líneas de presupuesto y solo movimientos de motores, el mensaje se elimina en cuanto aparece cualquier origen. |
| RF-8.9 | Degradación: si payrollSim/financingSim/principalFlow fallan (error/en carga), notice discreto en la vista con "Reintentar" (acción del store existente); la vista jamás rompe (NFR-FE14-3). Loading de los orígenes no bloquea el render de la base. |

## 9. Criterios de aceptación adicionales

| # | Criterio |
|---|---|
| AC-10 | `/budget/planning/562/ceco/510100` (draft, CECO sin budget_lines pero con crédito activo de financiación): muestra en tab Flujo los intereses/seguros (financiación), el capital por cuota y los desembolsos con descripcion/banner propio; en tab Causado aparecen los intereses/seguros por su budget_date. Σ Total cuadra con el CECO 510100 del pivote Flujo de origen. |
| AC-11 | Escenario draft con presupuesto, nómina what-if y financiación: la tab Causado cuadra con "Gastos fijos" de la Vista Ejecutiva (base + simulados), y tab Flujo con "Gastos fijos" del Flujo. |
| AC-12 | Escenario ACTIVO: no se piden sims (0 requests a payroll-simulation/financing-simulation) y sus líneas motorizadas ya materializadas aparecen como base. |
| AC-13 | Fallo de un origen: notice con reintento; el resto de los movimientos se ve sin afectación. |

## 10. REVISIÓN 3 (2026-10-15) — Tab inicial según la vista de origen

| Regla | Detalle |
|---|---|
| RF-8.10 | La celda CECO de la **Vista Flujo** (`CashFlowPivotTable`) navega con query `?tab=flow`; `CecoDetailView` inicializa el tab activo en **"Flujo"** cuando llega con esa query y en **"Causado"** en cualquier otro caso (incluida la Vista Ejecutiva). Al cambiar de tab dentro del detalle, la query se actualiza con `router.replace` (deep-link sin recargos de datos ni entradas al historial). |

**AC-14:** click en la celda de un CECO en "Salidas — Capital de financiación" (o cualquier bloque de Flujo) → el detalle abre directamente en tab "Flujo" con la URL `.../ceco/{code}?tab=flow`; click desde la Vista Ejecutiva → abre en "Causado" sin query.
