# Spec Frontend: "Vista Flujo" en el Detalle del Escenario (incremento FE-S4)

| Campo | Valor |
|---|---|
| **ID de feature** | `FE-S4B-BUDGET-FLUJO` |
| **Base** | `FE-S4-BUDGET-PLANNING` (`frontend.03_03` §8.2). **Esta spec REEMPLAZA** el conjunto/orden de tabs y el tab por defecto de §8.2; todo lo demás de FE-S4 sigue vigente. |
| **Componentes** | `crm_frontend/src/views/budget/planning/BudgetGridEditor.vue` (modificado) + `crm_frontend/src/components/budget/planning/CashFlowPivotTable.vue` (nuevo) |
| **Backend** | **Cero cambios.** Agregación 100 % client-side (misma política ASM-10 de FE-S4). |
| **Dependencias** | Cero nuevas: Vue 3 `<script setup>`, helpers existentes de `planningFormat.js`, `budgetPlanningStore` (`costCenterLabel`). Sin TS, sin gráficas. |
| **Fuente** | Sesión spec-definer 2026-09-11: historia "nueva pestaña 'Vista Flujo' similar a Vista Ejecutiva pero de Cash Flow" + supuestos 2–8 aprobados y corrección explícita del supuesto 1 (orden y default). |

---

## 1. Objetivo

Añadir una tercera pestaña **"Vista Flujo"** al detalle de escenario (`/budget/planning/:idBudget`) que muestre, en la misma forma de pivote CECO × Ene–Dic de solo lectura que la Vista Ejecutiva, la **perspectiva de liquidez del escenario**: cuándo entra y sale el efectivo según la `payment_date` de cada línea, con un resumen mensual de **entradas, salidas, flujo neto y flujo acumulado**.

**Valor para el stakeholder:** evaluar la presión de caja del escenario (meses en rojo, acumulado) sin salir del editor y sin pedir datos de analítica global (Pilar 2).

## 2. Alcance

**Incluye:**
1. Reordenar/crear tabs en `BudgetGridEditor.vue`: `Ejecutiva → Flujo → Editor`, default **Ejecutiva**.
2. Componente nuevo `CashFlowPivotTable.vue` (read-only, tabla HTML nativa, patrón `ExecutivePivotTable`).
3. Tabla resumen de liquidez (neto + acumulado) derivada de los bloques.

**Excluye (v1):** datos reales de analítica (`accounts_receivable`, `payment_ledger`, costos actuales), gross-up de IVA, gráficos, export, edición en esta vista, cambios de backend/rutas/store, tabla de tasas variables (vive solo en Ejecutiva), y cualquier modificación a "Marcar Meta Activa", ingesta o clonado.

## 3. UI — Tabs en `BudgetGridEditor.vue`

### 3.1 Orden, default y etiquetas (D-1, VINCULANTE)

```js
const TAB_ORDER = ['executive', 'flow', 'editor']            // antes: ['executive', 'editor']
const TAB_LABELS = {
  executive: 'Vista Ejecutiva',
  flow: 'Vista Flujo',
  editor: 'Editor de Celdas'
}
const activeTab = ref('executive')                            // antes: ref('editor')
```

* El default cambia de "Editor de Celdas" a **"Vista Ejecutiva"** (decisión de stakeholder 2026-09-11). Reemplaza lo dicho en FE-S4 §8.2 ("Editor… tab principal").
* El botón del template deja de usar el ternario inline `tab === 'executive' ? … : …` (insuficiente para 3 tabs) y pasa a `{{ TAB_LABELS[tab] }}`.
* Navegación por flechas (`onTabKeydown`) y roving tabindex: **sin cambios**, ciclan los 3 tabs automáticamente al derivar de `TAB_ORDER`.
* Guard `activateTab(kind)` sigue validando contra `TAB_ORDER` (rechaza cualquier otro valor).

### 3.2 Markup del panel

Entre los paneles existentes, en orden:

```html
<div
  id="planning-panel-flow"
  v-show="activeTab === 'flow'"
  class="ge-panel"
  role="tabpanel"
  aria-labelledby="planning-tab-flow"
>
  <CashFlowPivotTable :scenario="scenario" />
</div>
```

`v-show` (no `v-if`) como los otros dos: todas las vistas derivan de la misma caché y deben seguir reactivas a los PUT del editor sin recompilar árboles.

## 4. Datos y reglas de cálculo

### 4.1 Fuente (D-2)

`props.scenario.budget_lines` de la caché del store (misma que Editor/Ejecutiva → AC-FE-6: jamás diverge de lo persistido). **Cero HTTP** al activar el tab. Etiquetas CECO por `budgetPlanningStore.costCenterLabel(id_cost_center)`; montos crudos `Number(projected_amount)` (no finitos se ignoran); orden alfabético `localeCompare(…, 'es')` por etiqueta, igual que Ejecutiva.

### 4.2 Mes de cada celda (D-3)

Regla general: **mes de cobro/pago, no de causación**:

```js
const cfMonth = (line) => monthIndexOf(line.payment_date || line.budget_date)
// monthIndexOf(...) === -1 ⇒ la celda mensual no se puebla; el monto SÍ suman
// al total anual de la fila y al grandTotal (idéntico a ExecutivePivotTable).
```

| Bloque | Filtro de líneas | Valor de celda | Mes |
|---|---|---|---|
| **Entradas** | `line_type === 'income' && behavior_type === 'fixed'` | `projected_amount` | `cfMonth(line)` |
| **Salidas — Gastos fijos** | `line_type === 'expense' && behavior_type === 'fixed'` | `projected_amount` | `cfMonth(line)` |
| **Salidas — Gastos variables** | `line_type === 'expense' && behavior_type !== 'fixed'` | `variable_rate ×` (base §4.4) | **`monthIndexOf(line.budget_date)`** (causación, D-5) |

* El resumen de fila (`row.total`) es **anual**: incluye montos con fecha no parseable/nula (mismo criterio que Ejecutiva), de modo que `Σ columnTotals ≤ grandTotal` y el total anual jamás "pierde" plata.
* **Divergencia intencional documentada (R-1):** `budgetEngine.project_cash_flow` ubica los **ingresos** por `budget_date`; aquí se usan `payment_date` (fallback `budget_date`) porque la ingesta la calcula con las reglas de recaudo (`budgetPlanningIngestion`: `payment_date = budget_date + payment_days`) y el propósito de esta vista es "cuándo entra el efectivo". Fijos y variables SÍ replican al motor.

### 4.3 IVA (D-4)

Los importes son **netos, sin IVA** (como Editor y Ejecutiva). El motor gross-up `×(1+TAX_RATE)` (19 %) no se replica: `TAX_RATE` es constante de backend (`app/core/constants.py`) y duplicarla en FE es deuda de coherencia. El bloque "Entradas" lleva nota al pie: *"Montos netos, sin IVA. El pilar de analítica de flujo de caja sí lo incluye."*

### 4.4 Gastos variables calculados (D-5)

Réplica exacta del algoritmo "Opción A" de `ExecutivePivotTable.variablePivot`:
* **Base:** `Σ ingresos fijos del MES DE CAUSACIÓN` (agregación de `line_type==='income' && behavior_type==='fixed'` por `monthIndexOf(budget_date)` — **no** la columna de Entradas de esta vista, que usa payment date).
* Aporte por línea = `Number(variable_rate) || 0` × base del mes de su `budget_date`.
* Son **derivados de presentación**, no se almacenan (BR-CLN-03: las líneas guardan solo tasas); se recalculan solos al editar ingresos en el Editor de Celdas.
* Bloque condicionado a que existan líneas variables con base no nula (si no, no se renderiza — igual que Ejecutiva). Nota al pie con el texto `VARIABLE_PIVOT_NOTE` equivalente.
* `variable_receivables` usa la misma simplificación (base = ingresos), no la base compuesta AR+ingresos del motor: coherencia con lo ya aprobado para Ejecutiva.

### 4.5 Tabla resumen de liquidez (D-6)

Una sola tabla, 12 columnas + "Total", construida de los `columnTotals`/`grandTotal` de los tres bloques (ningún re-recorrido de líneas):

| Fila | Mes m | Total |
|---|---|---|
| Σ Entradas | `entradas.columnTotals[m]` | `entradas.grandTotal` |
| Σ Salidas | `fijos.columnTotals[m] + variables?.columnTotals[m] ?? 0` | suma de grandTotals |
| **Flujo neto** | entradas − salidas | Σ de los 12 netos |
| **Flujo acumulado** | corrido desde Ene (`acc_m = acc_{m-1} + neto_m`) | valor de Dic (= neto anual) |

* Negativos con `formatMoney` estándar (`Intl es-CO`, p. ej. `- $ 1.234`) + clase `cf-negative` (rojo `#c53030`; dark `#ff9b9b`).
* `0` se muestra `·` en celdas mensuales (patrón Ejecutiva); en Neto/Acumulado el `0` muestra `·` también.
* La fila Acumulado es la única cuya "Total" no es una suma: es el valor de diciembre (se documenta en `aria-label`/tooltip para evitar dudas).
* El resumen **siempre** se renderiza (aun con bloques vacíos, muestra ceros), porque "liquidez neta" existe aunque no haya líneas.

## 5. Componente `CashFlowPivotTable.vue`

### 5.1 Contrato

```js
defineProps({ scenario: { type: Object, required: true } }) // BudgetFull + parent_budget_name, igual que ExecutivePivotTable
```

Read-only puro: sin emits, sin inputs, sin HTTP, sin mutar el store. Computados memoizados (`entradasPivot`, `fijosPivot`, `baseIngresosCausados`, `variablesPivot`, `resumen`).

### 5.2 Estructura del template (orden fijo)

1. Nota introductoria (ver §5.3).
2. Bloque **"Entradas"** (pivot §4.2).
3. Bloque **"Salidas — Gastos fijos"**.
4. Bloque **"Salidas — Gastos variables (calculados)"** (condicional, con su nota).
5. Sección **"Resumen de liquidez"** (tabla §4.5).
6. **NO** incluye tabla de tasas (D-7: queda exclusiva de Ejecutiva; acceso cruzado: el usuario puede comparar ambas vistas).

### 5.3 Textos obligatorios (es-CO, hard-coded como el resto del módulo)

* Nota general: *"Matriz de **solo lectura** generada desde las líneas del escenario {year}. Los importes se ajustan en 'Editor de Celdas'. El mes se asigna por **fecha de pago** (no por causación), por lo que puede diferir de la 'Vista Ejecutiva'."*
* Cada bloque sin filas: *"Sin líneas de {nombre} en este escenario."*
* Escenario sin ninguna línea (`budget_lines.length === 0`): un único estado vacío *"Este escenario no tiene líneas presupuestadas. Cárguelas o édítelas en 'Editor de Celdas'."* y nada de tablas (el resumen se suprime en este caso extremo).

### 5.4 Estilo y accesibilidad

Mismo lenguaje visual que `ExecutivePivotTable` pero **CSS scoped propio** (prefijo `cf-*`, copiar patrones `pv-scroll/pv-table/pv-cell-*`: `max-height: 60vh`, `overflow:auto`, sticky `thead`/`tfoot`/primera columna, `min-width` ≈ 1240 px, `font-variant-numeric: tabular-nums`, `text-align:right`). Variables CSS del tema (`--color-*`) → dark mode funciona sin CSS adicional. Tablas con `aria-label` descriptivo en español. Títulos de bloque `h4` jerárquicamente bajo los `tabpanel` existentes.

## 6. Archivos a modificar

| Archivo | Cambio |
|---|---|
| `crm_frontend/src/components/budget/planning/CashFlowPivotTable.vue` | **NUEVO** (único archivo nuevo). Importa de `./planningFormat.js`: `formatMoney`, `MONTH_LABELS`, `monthIndexOf`; y `useBudgetPlanningStore` para `costCenterLabel`. |
| `crm_frontend/src/views/budget/planning/BudgetGridEditor.vue` | 4 ediciones menores: (a) `import CashFlowPivotTable from '@/components/budget/planning/CashFlowPivotTable.vue'`; (b) `TAB_ORDER`+`TAB_LABELS`+`activeTab` según §3.1; (c) botón → `{{ TAB_LABELS[tab] }}`; (d) panel `planning-panel-flow` según §3.2 entre los actuales. |
| `crm_frontend/spec/frontend.03_03_…budget_planning.md` | (documental) añadir al inicio de §8.2 la línea: *"⚠️ Tabs redefinidos en FE-S4B (`frontend.03_04`) : Ejecutiva → Flujo → Editor; default Ejecutiva."* |

**No se tocan:** router, stores, servicios/axios, backend, `ExecutivePivotTable.vue`, `BudgetLineGrid.vue`, `planningFormat.js` (no añade helpers; `cfMonth` es local al componente para no atarse aún a la decisión R-1).

## 7. Requisitos no funcionales

| ID | Requisito |
|---|---|
| NFR-FV-1 | Rendimiento: complejidad O(L) en 2–3 pasadas sobre las líneas cacheadas (L ≈ 2.000 en el peor escenario SIIGO → < 16 ms estimado, sin parpadeo al cambiar de tab porque es computado). |
| NFR-FV-2 | Reactividad: ningún watch ni estado local derivado de HTTP; tras un PUT del editor, Ejecutiva y Flujo se recalculan solas desde la misma caché (extiende AC-FE-6). |
| NFR-FV-3 | Accesibilidad: patrón WAI-ARIA tabs ya vigente (roles, `aria-selected`, `aria-controls`, roving tabindex, flechas) debe cubrir el tercer tab sin código extra; todas las tablas con `aria-label`. |
| NFR-FV-4 | Cero dependencias nuevas en `package.json`; `npm run lint` sin errores (eslint vue3-essential + prettier). |
| NFR-FV-5 | Tema claro/oscuro vía `var(--color-*)` (mismos tokens de FE-S4); sin animaciones nuevas. |
| NFR-FV-6 | No bloquea ni degrada las vistas hermanas: un fallo futuro en este componente no debe poder romper Editor/Ejecutiva (componente hermano aislado, solo props). |

## 8. Criterios de aceptación (QA manual)

* **AC-VF-1:** Al abrir cualquier escenario válido, el tab activo es **"Vista Ejecutiva"**; los 3 pills aparecen en orden Ejecutiva → Flujo → Editor con esas etiquetas exactas.
* **AC-VF-2:** Flechas ←/→ en el tablist recorren los 3 tabs en ciclo (incluido el nuevo); la activación por teclado mueve el foco al pill activo.
* **AC-VF-3:** Cambiar entre tabs **no genera ninguna petición HTTP** (verificar en DevTools → Network).
* **AC-VF-4:** Una línea de ingreso con `payment_date` en mes ≠ `budget_date` aparece en la columna de `payment_date` en Flujo y en la de `budget_date` en Ejecutiva.
* **AC-VF-5:** Una línea con `payment_date: null` (y con `budget_date` válida) se ubica por `budget_date`; una con ambas nulas/no parseables NO aparece en celdas mensuales pero su monto figura en el total anual de la fila.
* **AC-VF-6:** El bloque "Gastos variables (calculados)" muestra exactamente los mismos valores y columna que el equivalente de Ejecutiva (misma fórmula, §4.4).
* **AC-VF-7:** Resumen: neto mes a mes = Entradas − Salidas; acumulado = corrida desde Ene; Total de "Flujo acumulado" = valor de diciembre. Cambiar un monto en el Editor (p. ej. ingresos de marzo) y volver a Flujo **sin recargar**: ambos se recalculan.
* **AC-VF-8:** Un neto/acumulado negativo se muestra en formato `$` COP con signo y en rojo (ambos temas); los `0` mensuales muestran `·`.
* **AC-VF-9:** Escenario sin líneas: único estado vacío legible, sin tablas; escenario con líneas pero sin variables: no se renderiza el bloque variable (como Ejecutiva).
* **AC-VF-10:** Regresión FE-S4: AC-FE-4/5/6 siguen pasando sin tocar esos componentes; el header "Σ Ingresos / Σ Gastos" (causación) permanece inalterado y puede diferir de Flujo — esperado, explicado por la nota §5.3.
* **AC-VF-11:** Con 30+ CECO y scroll horizontal/vertical: cabecera, pie y columna CECO quedan sticky sin solapamientos en light/dark.
* **AC-VF-12:** `npm run lint` sin errores; `npm run build` (o dev) compila el proyecto sin warnings nuevos.

## 9. Decisiones y trazabilidad

| ID | Decisión | Origen (sesión 2026-09-11) |
|---|---|---|
| D-1 | Orden Ejecutiva → Flujo → Editor; **default Ejecutiva** (reemplaza default actual 'editor') | **Corrección explícita del stakeholder al supuesto 1** |
| D-2 | 100 % client-side, solo líneas del escenario (sin CXC/libro de pagos reales) | Supuesto 2 aprobado |
| D-3 | Mes por `payment_date || budget_date` (incluye refinamiento por bloque y nota R-1) | Supuesto 3 aprobado + precisión de esta spec |
| D-4 | Sin gross-up de IVA en v1, con nota al pie | Supuesto 4 aprobado |
| D-5 | Variables = regla idéntica a Vista Ejecutiva (causación por `budget_date`) | Supuesto 5 aprobado (resuelve tensión con D-3: lo específico gana) |
| D-6 | Resumen con entradas, salidas, neto y acumulado; COP con negativos en rojo | Supuesto 6 aprobado |
| D-7 | Vista read-only, sin tabla de tasas duplicada | Supuesto 7 aprobado |
| D-8 | Sin gráficas/dependencias nuevas | Supuesto 8 aprobado |

## 10. Riesgos y divergencias conocidas

> ⚠️ Modificado por FE-S8-FLUJO-OY (`frontend.03_11`): los montos fuera de año nunca poblan celdas mensuales; el toggle solo controla las columnas Antes/Después.

* **R-1 (bajo, aceptado):** ingresos por `payment_date` diverge de `project_cash_flow` (motor: `budget_date`); puede leerse distinto que el dashboard Pilar 2. Mitigación: nota §5.3 y esta decisión registrada. Si gerencia pide conciliación exacta, se mueve el ingreso a `budget_date` en 1 línea (candidato PQ-VF-1).
* **R-2 (bajo):** el cambio de tab default puede sorprender a usuarios que aterrizaban directo al editor. Rollback: una línea (`ref('editor')`).
* **R-3 (informativo):** el "Σ Salidas" del resumen mezcla criterios de ubicación (fijos por pago, variables por causación) — es deliberado (§4.2) y coincide con cómo el motor construye `outflows_by_month`.
* **R-4 (técnico):** no duplicar `TAX_RATE` en FE es deuda consciente; si llega IVA se expone vía `.env` (`VITE_TAX_RATE`) con validación, no hard-coded.

## 11. Preguntas abiertas (no bloquean la v1)

* **PQ-VF-1:** ¿Alinear el ingreso a `budget_date` para que Flujo == motor del Pilar 2? (Depende de R-1; decide gerencia al validar el prototipo.)
* **PQ-VF-2:** ¿Añadir columna "IVA proyectado" y entradas con gross-up en una v2?
* **PQ-VF-3:** ¿Export CSV/PNG del resumen en el futuro? (La spec base ya excluye export por ahora.)

## 12. Checklist de implementación (orden sugerido)

1. Crear `CashFlowPivotTable.vue` (§5, §4) — se puede desarrollar mockeando `scenario` con datos de un escenario existente.
2. Editar `BudgetGridEditor.vue` (§3, §6).
3. `npm run lint` desde `crm_frontend/`.
4. QA manual contra `http://127.0.0.1:5173/budget/planning/:id` (dev docker: backend :8003) con la lista AC-VF-1…12, en light y dark theme.
5. Nota documental cruzada en `frontend.03_03` §8.2.