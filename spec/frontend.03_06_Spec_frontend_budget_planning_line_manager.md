# Spec Frontend: Gestor de Líneas en "Editor de Celdas" (secciones Ingresos/Gastos)

| Campo | Valor |
|---|---|
| **ID de feature** | `FE-S4D-BUDGET-LINES` |
| **Versión** | 1.0 — 2026-09-11 |
| **Base** | FE-S4 (`frontend.03_03` §8.2 tab 2). MODIFICA el comportamiento "solo monto editable"; el PUT de celda y sus micro-estados quedan INTACTOS (D-8 de la spec BE). No toca FE-S4B (Vista Flujo) ni FE-S4C (bloques de Ejecutiva) salvo regresión. |
| **Contrato** | Autoridad: `crm_backend/spec/backend.02_13_Spec_Backend_budgets_planning_lines.md` (BE-S4D-BUDGET-LINES §3). |
| **Componentes** | MODIFICA `components/budget/planning/BudgetLineGrid.vue`, `stores/budgetPlanningStore.js`, `services/budgetPlanningService.js`; NUEVOS `components/budget/planning/LineFormModal.vue`, `components/budget/planning/LineDeleteModal.vue` |
| **Dependencias** | Cero nuevas (Vue 3 `<script setup>`, JS sin TS, tablas HTML nativas, modales = patrón `SetTargetConfirmModal`/`CloneScenarioModal` del propio módulo) |
| **Origen** | Sesión spec-definer 2026-09-11: Opción A elegida por el stakeholder + supuestos funcionales 1–8 aprobados. |

---

## 1. Objetivo

Convertir el tab **"Editor de Celdas"** en un gestor de líneas completo con los **ingresos y gastos físicamente separados** (el dolor reportado: "los ingresos se muestran revueltos con los gastos y no se pueden tocar más allá del monto"):

1. Dos secciones apiladas (Ingresos arriba, Gastos abajo), cada una con subtotal, conteo, filtros propios y botón **"+ Añadir línea"**.
2. Columna **Acciones** por fila: ✏️ editar campos (modal) · 🗑 eliminar (modal de confirmación destructiva).
3. Líneas **variables**: su monto sigue no-editable, pero ahora se corrigen **tasa/fechas/temporada** sin re-ingesta (supuesto 4).
4. Monto inline por doble clic: **sin cambios** (AC-FE-4 intacta).

## 2. Alcance

**Incluye:** lo de §1; store (3 acciones) y service (3 métodos); actualización de caché local con recomposición inmediata de Vista Ejecutiva/Flujo/cabecera (supuesto 8).

**Excluye (v1):** undo/papelera; cambiar `line_type`/`behavior_type` de una línea existente (se crea nueva + se elimina la vieja — BE BR-LINE-06); edición de tasas de costo/comisión (eso es Reglas Financieras); bulk pegado TSV; nueva ruta o tab (la Opción B del análisis fue descartada); gate de roles nuevo (misma política que celda/upload).

## 3. UI — `BudgetLineGrid.vue` (refactor)

### 3.1 Estructura nueva

```
gl-zone
├── section.gl-group[data-type=income]
│   ├── header: título "Ingresos" (chip gl-chip-income) + "N líneas · Σ {formatMoney(subtotal)}" + hint
│   ├── toolbar: filtro texto (CECO/concepto) + select temporada + botón [+ Añadir ingreso]
│   ├── tabla (columnas actuales + Acciones) con slice/paginación PROPIO
│   └── tfoot Σ monto visible   (subtotal de cabecera es sobre TODAS las líneas del tipo, no del slice: fuente subtotalIncome computed)
└── section.gl-group[data-type=expense]   (simétrico: "Gastos", [+ Añadir gasto], chip rojo)
```

- División por `line.line_type === 'income' | 'expense'` sobre `lines` (la fuente sigue siendo SOLO la caché del store; prohibido otra).
- `sortKey/sortAsc` y `visibleCount` se vuelven **por sección** (reactivo `{ income:…, expense:… }`); la lógica de `SORT_ACCESSORS`/flechas se conserva tal cual aplicándola por sección.
- El hint actual ("Las líneas variables se corrigen recargando el escenario") se RETIRA del toolbar → nuevo texto: "Doble clic en un monto para editarlo; ✏️ para el resto de campos. Las variables corríjalas con ✏️ (tasa/fechas)."
- Chip de comportamiento visible solo en gastos (o donde `behavior_type !== 'fixed'`, como hoy).
- Columna "Acciones" (fija a la derecha visual del flujo, `th` con `color: var(--color-text-primary)` según la regla aprendida de `main.css`): dos `btn-icon-sm` con `aria-label="Editar línea {ceco} {fecha}"` / "Eliminar…"; deshabilitados mientras esa línea tenga una mutación en vuelo.
- Estado vacío por sección: ingresos ⇒ "Sin ingresos en este escenario. Usa '+ Añadir ingreso'."; gastos análogo. El botón "Añadir" NUNCA se deshabilita por vacío.

### 3.2 `LineFormModal.vue` (crear + editar — un componente, modo `create|edit`)

Props: `{ open, mode, line?: BudgetLine, scenario, lineType: 'income'|'expense' }`; emits `saved(line)`, `close`. Patrón de modales del módulo (overlay + `role="dialog"` + `aria-modal` + foco atrapado + ESC cierra, como `SetTargetConfirmModal`).

Campos (orden de tab = orden visual):

| Campo | Control | Reglas |
|---|---|---|
| CECO | `select` de `budgetPlanningStore.costCenters` (`{code} — {name}`) | obligatorio; en edit, precargado |
| Fecha proyectada | `input type=date` | obligatoria; `new Date(v).getFullYear() === scenario.budget_year` ⇒ si no, error inline "La fecha debe ser del año {year} del escenario." (validación ESPEJO de BR-LINE-04; el servidor manda si engaña) |
| Fecha de pago | `input type=date` | opcional; hint "Si se omite, se asume la fecha proyectada". SIN check de año (legal en enero+1) |
| Temporada | `select` de `budgetPlanningStore.collections` (+ opción "— ninguna —") | opcional |
| Comportamiento | `select` fixed/variable_sales/variable_receivables (`BEHAVIOR_LABELS`) | **solo en create**; en edit aparece DESHABILITADO con hint "Para cambiar el comportamiento, cree una línea nueva" |
| Monto | texto con `parseCellAmount` (ASM-12) | fixed: obligatorio `>= 0`; variable: **input deshabilitado con valor "derivado de la tasa"** (BR-LINE-03) |
| Tasa (%) | `input type=number step=0.01 min=0 max=100` | visible SOLO si comportamiento != fixed; obligatoria en create variable; **envía `tasa/100`** (conversión %↔0-1, espejo de `formatVariableRate`) |
| Descripción | `input type=text` | opcional |

- Título: "Añadir ingreso al escenario" / "Añadir gasto…" / "Editar línea" según modo+tipo.
- Botón guardar deshabilitado con errores locales; en error del servidor el modal **NO se cierra** y el mensaje se muestra inline bajo el campo correspondiente (mapeo §6); success ⇒ emit `saved` + cierra.
- Payload create (snake_case exacto): `{ id_cost_center, line_type, budget_date, payment_date|null, id_collection|null, projected_amount, variable_rate|null, description|null }`; PUT: solo los campos editables modificados (parcial; omitir `projected_amount` en variables SIEMPRE).

### 3.3 `LineDeleteModal.vue`

Recibe `line`; muestra CECO resuelto, fechas, chip tipo+comportamiento y monto/tasa, con el texto de peligro: *"Se eliminará definitivamente del escenario. Esta acción no se puede deshacer; para recuperarla, rehaz la carga SIIGO o clona el escenario."* Botón rojo "Eliminar definitivamente" (patrón destructivo de `BudgetRulesView` archivar). Emite `deleted(id)`.

## 4. Store — `budgetPlanningStore.js`

```js
// state nuevo
lineSaving: {},        // { [id_budget_line | 'new' + sectionKey]: true } — guard doble-submit (AC-FE-8)

// actions nuevas (todas clasificadoras con classifyPlanningError existente + kind 'conflict' para 400)
async createScenarioLine(idBudget, payload)   // POST …/line  → 201 ⇒ push a currentScenario.budget_lines (mutación in-place reactiva), soft-fetch del listado (mismo patrón silencioso que load() en FE-S4), return { ok, line }
async updateScenarioLine(idLine, payload)     // PUT  …/line/{id} → reemplaza el objeto en la caché, return { ok, line }
async deleteScenarioLine(idLine)              // DELETE …/line/{id} → splice de la caché, return { ok }
```

- **La caché `budget_lines` es LA fuente** (AC-FE-6): tras crear/editar/eliminar, Ejecutiva (pivotes + costo + P&G + Acumulado), Flujo y Σ de cabecera se recalculan SOLAS — prohibido refetch del detalle en estas acciones.
- 404 en update/delete ⇒ limpiar caché de detalle y `fetchScenarioDetail(id, force=true)` + mensaje "La línea ya no existe (¿carga nueva?). La vista se actualizó."
- Tras éxito de las 3: refresco SUAVE del listado (`fetchScenarios({…, force:true})` silencioso) para que el dashboard muestre Σ frescos al volver (patrón ya usado en `load()`).

## 5. Service — `budgetPlanningService.js`

```js
createLine: (idBudget, data) => axiosInstance.post(`/budget/planning/${idBudget}/line`, data)
updateLine: (idLine, data)   => axiosInstance.put(`/budget/planning/line/${idLine}`, data)
deleteLine: (idLine)         => axiosInstance.delete(`/budget/planning/line/${idLine}`)
```

(Sin slash final: no son rutas de colección de FastAPI con `@router.get("/")`; verificar contra el API real al implementar — BE los define exactos en `backend.02_13` §3.)

## 6. Mapeo de errores de servidor (modal inline / toast)

|BE|FE mensaje|Presentación|
|---|---|---|
|422 (monto/tasa/schema)|"Revisa los valores marcados."+ campo offending|inline modal|
|400 BR-LINE-04 (año)|"La fecha proyectada debe ser del año {budget_year}."|inline en fecha|
|400 BR-LINE-07 (monto en variable / tasa en fixed)|texto del detalle traducido|"El monto de una línea variable se deriva de su tasa."|inline|
|404 FK / presupuesto|"El CECO o la temporada seleccionada ya no existen."|inline select|
|404 línea|"La línea ya no existe."|modal cierra + vista refrescada (§4)|
|401|logout/redirect estándar (handleAuth)|—|
|red/5xx|"No se pudo guardar. Reintenta."|inline + modal permanece|

## 7. NFR

| ID | Requisito |
|---|---|
| NFR-FD-1 | Un solo request de mutación por acción (no refetch detalle); doble-submit imposibilidad por `lineSaving` (AC-FE-8). |
| NFR-FD-2 | Cero dependencias nuevas; cero TypeScript; `@` alias; ESLint/Prettier limpios. |
| NFR-FD-3 | A11y: modales con foco atrapado/ESC/`aria-modal`; botones de fila con `aria-label`; subtotales `aria-live="polite"`; tema claro/oscuro por tokens (regla `th` sobre fondo claro del §6.2 de FE-S4C aplica a la nueva columna Acciones). |
| NFR-FD-4 | Rendimiento: filtros/sorts computeds memoizados; con 2.000 líneas el refresco de secciones < 1 frame típico (mismas O(L) pasadas actuales ×2). |
| NFR-FD-5 | Regresión nula en Vista Flujo/Ejecutiva/editor de celdas (AC-VF-*, AC-PYG-* y AC-FE-4/6 siguen pasando). |

## 8. Criterios de aceptación (QA manual)

* **AC-FD-1:** El tab "Editor de Celdas" muestra DOS secciones: Ingresos (con Σ y N) arriba, Gastos abajo; ninguna mezcla de `line_type`.
* **AC-FD-2:** Doble clic en monto sigue igual (guardando… → ✓ → rollback en error) — AC-FE-4 sin regresión.
* **AC-FD-3:** "+ Añadir ingreso" crea una línea fija: aparece en la sección, el Σ de sección/cabecera sube exactamente su monto, y Ejecutiva/Flujo/P&G la incluyen sin ningún refetch (Network: 1 POST + el refresco suave del listado).
* **AC-FD-4:** Añadir VARIABLE por venta: el modal muestra tasa obligatoria en % (p. ej. `8` ⇒ payload `variable_rate: 0.08`), monto deshabilitado; la fila creada lleva chip variable, monto `$ 0`; el bloque "Gastos variables (calculados)" de Ejecutiva la dibuja con esa tasa.
* **AC-FD-5:** ✏️ permite cambiar CECO/fechas/temporada/concepto (y monto en fijas, tasa en variables); tras recargar la página los valores persisten.
* **AC-FD-6:** En una fixed, el campo Tasa está oculto; en una variable, el monto aparece deshabilitado con hint (sin PUT de monto posible desde esta UI).
* **AC-FD-7:** 🗑 abre confirmación con los datos de la línea; "Cancelar" no borra nada; "Eliminar definitivamente" la quita de la sección y de TODAS las vistas derivadas al instante; desaparece tras F5.
* **AC-FD-8:** Fecha de otro año ⇒ error inline sin request; monto negativo/texto ⇒ invalido (borde rojo, sin request — ASM-12).
* **AC-FD-9:** Filtros por CECO/concepto y temporada actúan SOLO sobre su sección; el botón "Mostrar 500 más" es independiente por sección; el subtotal de cabecera ignora el filtro (muestra el total real).
* **AC-FD-10:** Spam de clics en guardar/eliminar ⇒ 1 request (spinner/desabilitado); PUT de celda concurrente sobre la MISMA línea bloqueada (`cellBusy` también deshabilita ✏️/🗑).
* **AC-FD-11:** Servidor caído/5xx durante crear ⇒ modal sigue abierto con mensaje y los datos tecleados intactos; reabrir modal tras éxito los muestra frescos (sin state residuo).
* **AC-FD-12:** Regresión: eliminar/crear líneas deja operativos AC-PYG-1..12 (costo/P&G/Acumulado reaccionan, degradación `—` intacta) y AC-VF-1..12; el orden/default de tabs (FE-S4B D-1) no cambia.
* **AC-FD-13:** `npm run lint` y `npm run build` verdes; sin diffs fuera de los 5 archivos de §"Archivos".

## 9. Decision Log (sesión spec-definer 2026-09-11)

| ID | Decisión | Origen |
|---|---|---|
| FD-1 | Opción A: sin ruta/tab nuevo; el tab existente se particiona en Ingresos/Gastos con CRUD por fila | Stakeholder aprobó la recomendación |
| FD-2 | Editar = modal de formulario (no inline por celda) | Supuesto 3 |
| FD-3 | Borrar = físico, confirmación con datos, sin undo | Supuesto 2 (BE D-2) |
| FD-4 | Variables: monto bloqueado, tasa/fechas/temporada editables | Supuesto 4 (BE BR-LINE-07) |
| FD-5 | Editable sin importar status (draft/active/closed) | Supuesto 5 (BE BR-LINE-05) |
| FD-6 | `line_type` se fija por la sección "+ Añadir"; sin selector de tipo en el modal | Supuestos 3/6 (BE D-3) |
| FD-7 | Reutilización total del stack de celdas (micro-estados, parse, busy) — el refactor NO reescribe el PUT cell | Regresión AC-FE-4 |
| FD-8 | Tasa en el modal se muestra/edita en % (0–100), se envía en 0–1 | Espejo `formatVariableRate`/`variable_rate` (AC-LINE-9 BE) |

## 10. Riesgos y PQs

* **R-FD-1:** `BudgetLineGrid.vue` es sensible a regresión del cell-editing (commit single-flight, timers `savedTimers`): el refactor a secciones debe mantenerlos por LÍNEA (no por sección). Mitigación: AC-FD-2/10 obligatorias.
* **R-FD-2:** el listado del dashboard muestra Σ calculados en servidor; entre la mutación y el refresco suave puede verse 2–3 s desfasado al volver — aceptado (patrón FE-S4 existente).
* **PQ-FD-1:** agrupar visualmente líneas hermanas del mismo CECO+mes (padre-hijo plegable) — v2.
* **PQ-FD-2:** duplicar fila desde ✏️ (botón "Duplicar…") — v2.
* **PQ-FD-3:** edición inline completa (todos los campos en la tabla) si la gerencia rechaza el modal.

## 11. Checklist de implementación (orden sugerido)

1. BE primero (`backend.02_13` §3–5 + smoke) — o trabajar contra la ruta pactada con mock.
2. `budgetPlanningService.js`: 3 métodos → `budgetPlanningStore.js`: state+3 acciones.
3. `LineFormModal.vue` (crear/editar) → `LineDeleteModal.vue`.
4. Refactor `BudgetLineGrid.vue` a 2 secciones + columna Acciones (conservando edición de celda).
5. Lint/build + QA AC-FD-1..13 con escenario draft real (crear, corregir variable, borrar, F5).