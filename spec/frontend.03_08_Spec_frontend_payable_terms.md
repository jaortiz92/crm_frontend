# Spec Frontend: Términos de Pago a Proveedores (Reglas Financieras + integración Editor)

| Campo | Valor |
|---|---|
| **ID de feature** | `FE-S5-PAYABLE-TERMS` |
| **Versión** | 1.0 — 2026-09-14 |
| **Base** `FE-S3-RULES` (`BudgetRulesView.vue`, tabs `['cost','commission']`) + `FE-S4D-BUDGET-LINES` (`frontend.03_06` §3.2/§4). MODIFICA el panel de Reglas Financieras (tab nuevo) y el manejo de la respuesta de `createScenarioLine`. NO toca Vista Flujo, Vista Ejecutiva, P&G, el PUT de celda ni el algoritmo de expansión (es 100 % server-side). |
| **Contrato** | Autoridad: `crm_backend/spec/backend.02_15_Spec_Backend_payable_terms.md` (BE-S5-PAYABLE-TERMS §5 y §7). |
| **Componentes** | MODIFICA `views/budget/BudgetRulesView.vue`, `stores/budgetRulesStore.js`, `services/budgetRulesService.js`, `stores/budgetPlanningStore.js`, `components/budget/planning/LineFormModal.vue`, `components/budget/planning/BudgetLineGrid.vue`; NUEVO `components/budget/rates/PayableTermsPanel.vue` |
| **Dependencias** | Cero nuevas (mismos patrones del repo: pill-tabs de `BudgetRulesView`, `btn-danger` destructivo, `alertService`, tokens CSS) |
| **Origen** | Sesión spec-definer 2026-09-14 (historia "ver el flujo de los costos desglosado por términos de pago" + supuestos 1–12 aprobados + aclaración: `line_payment_rules` es de cobro, NO se reutiliza). |

---

## 1. Objetivo

Darle al usuario (a) la capacidad de **administrar los términos de pago a proveedores por Línea** desde Reglas Financieras (`/budget/rules`), y (b) que el trabajo de FE-S4D "digiera" la expansión server-side: al crear manualmente un gasto fijo cuya Línea tiene términos, **todas las cuotas aparecen de inmediato** en la sección de Gastos del Editor, con toast que informa el desdoble. El desglose del flujo en Vista Flujo ocurre "gratis" porque BE-S5 materializa las cuotas como líneas con su `payment_date` (D-3 de BE).

## 2. Alcance

**Incluye:** tab 3 "Términos de pago" en `BudgetRulesView` con CRUD completo por Línea (catálogo `line_payable_terms`); conversión % ↔ fracción (D-6 de BE); integración `expanded_siblings` en store/modal/grid de planning; toasts; regresión FE-S4D/S4C/S4B.

**Excluye (v1):** términos por proveedor (PQ-3 BE); preview del desdoble ANTES de guardar en `LineFormModal` (PQ-4 BE); agrupar visualmente cuotas hermanas (PQ-FD-1 heredado); validación suma = 100 % en la UI (PQ-2 BE — v2); columna "fuera de año" en Flujo (R-S5-1, PQ-1 BE); tocar `CashFlowPivotTable.vue`/`ExecutivePivotTable.vue`/`ratesConfig.js`.

## 3. UI — Reglas Financieras (`BudgetRulesView.vue`)

### 3.1 Tab nuevo

- `TAB_ORDER = ['cost', 'commission', 'payable']`; `TAB_LABELS.payable = 'Términos de pago'`; subtítulo de cabecera: agregar a la línea existente "… y los términos de pago a proveedores por línea (fechas de salida del efectivo)".
- Mismo patrón pill + `role="tablist"`/`role="tab"`/`aria-selected` + lazy: el catálogo de términos se trae UNA vez en la primera activación del tab (patrón `commission`), no en `onMounted`.
- `activeTab` default sigue siendo `'cost'` (no cambia el orden existente; la nueva pestaña va al final).

### 3.2 `PayableTermsPanel.vue` (nuevo, `components/budget/rates/`)

- Fuente de Líneas: `budgetRulesStore.lines` del propio store (ya existe `fetchLinesOnce()`); selector `select` "Línea" (obligatorio, placeholder "Seleccione una línea…").
- Tabla de términos de la Línea seleccionada: columnas **% de pago** (`payment_pct × 100`, 2 dec.max), **Días desde la importación** (`payment_days`, muestra `−60` ⇒ "60 días antes", `0` ⇒ "el día de la importación", `+n` ⇒ "n días después"), **Acciones** (✏️ editar, 🗑 eliminar).
- Botón `+ Añadir término`: modal pequeño reutilizando el shell de `RateEditorModal` (overlay, `role=dialog`, `aria-modal`, ESC, foco atrapado) con DOS campos:
  - `% del pago` — `input type=number step=0.01 min=0.01 max=100` obligatorio; envía `payment_pct = pct/100` (espejo FD-8/D-6).
  - `Días respecto a la fecha de importación` — `input type=number step=1` obligatorio, admite negativos; hint: "Negativo = antes de la importación (p. ej. −60). 0 = el día de la importación."
  - Payload: `{ id_line, payment_pct, payment_days }` (snake_case exacto BE-S5 §5).
- Editar: pre-carga el término; PUT `/budget/line-payable-term/{id}` con el objeto completo (el BE no acepta PATCH parcial aquí).
- Eliminar: confirmación destructiva inline (patrón `btn-danger` del propio view): "Este término dejará de usarse en nuevas cargas y nuevas líneas de gasto. Las cuotas ya creadas no se modifican." → DELETE.
- **El CRUD de términos NO re-explota escenarios existentes** (BR-TERM-07 BE): si el usuario esperaba que cambie cuotas ya guardadas, el texto anterior es la respuesta visible (v1).

### 3.3 Errores (mapa local, patrón `classifyRateError`)

| BE | Presentación |
|---|---|
| 422 (pct ∉ (0,1], `payment_days` no entero) | "Revisa los valores marcados." inline en el modal editor |
| 404 `"LinePayableTerm {id} not found"` | toast "El término ya no existe." + refetch del listado |
| 404 `"Line {id} not found"` | inline en el select de Línea (improbable: viene del catálogo) |
| 401 | `handleAuth` estándar del store |
| red/5xx | "No se pudo guardar. Reintenta." inline; modal permanece |

## 4. Store — `budgetRulesStore.js`

```js
// state nuevo
payableTerms: [],            // catálogo completo (por Línea)
payableTermsLoaded: false,
payableTermSaving: {},       // { [id | 'new']: true } guard doble-submit (patrón lineSaving)

// actions nuevas (misma clasificadora classifyRateError + handleAuth del store)
async fetchPayableTerms(force = false)      // GET /budget/line-payable-term/ → payableTerms
async createPayableTerm(payload)            // POST → push al catálogo, { ok, term }
async updatePayableTerm(id, payload)        // PUT → reemplazo en catálogo, { ok, term }
async deletePayableTerm(id)                 // DELETE → splice, { ok }
```

Y en `budgetRulesService.js` (estilo `listUrl/itemUrl` de `ratesConfig.js`, puede vivir como funciones hermanas, NO se toca `ratesConfig.js`):

```js
fetchPayableTerms: () => axiosInstance.get('/budget/line-payable-term/')
createPayableTerm: (data) => axiosInstance.post('/budget/line-payable-term/', data)
updatePayableTerm: (id, data) => axiosInstance.put(`/budget/line-payable-term/${id}`, data)
deletePayableTerm: (id) => axiosInstance.delete(`/budget/line-payable-term/${id}`)
```

## 5. Integración planning (FE-S4D → FE-S5)

### 5.1 `budgetPlanningStore.createScenarioLine`

- La respuesta del POST puede traer `expanded_siblings: BudgetLine[]` (BE-S5 §7). Cambios mínimos:
  - Éxito: `applyLineToCache(line)` (igual hoy) + `for (const sib of result.expanded_siblings ?? []) applyLineToCache(sib)` (push en la MISMA caché `budget_lines` → las cuotas aparecen en la sección sin ningún otro cambio, AC-FE-6 intacto).
  - Retorno: `{ ok: true, line, siblings }` (`siblings` siempre array, `[]` cuando no hubo desdoble — retro-compatible para los consumidores actuales que leen `.line`).
- `updateScenarioLine`/`deleteScenarioLine`: sin cambios (la cuota es una línea normal).

### 5.2 `LineFormModal.vue`

- `emit('saved', line, siblings)` (segundo argumento opcional; en FE-S4D el grid ya ignora el 1.º). Todo lo demás intacto (payloads, validaciones, §6 de FE-S4D). El modal NO muestra preview de cuotas (PQ-4 BE).

### 5.3 `BudgetLineGrid.vue`

- `onLineSaved(line, siblings)`: si `Array.isArray(siblings) && siblings.length` ⇒ toast "El gasto se desdobló en {siblings.length + 1} cuotas según los términos de pago de la línea." con `alertService` (texto literal de esta spec); si no, el toast FE-S4D de siempre.
- Hint de la sección Gastos: NO cambia en v1 (el desdoble solo ocurre si la Línea del CECO tiene términos; explicarlo en la tabla sería ruido). Documentado como PQ-4 BE.

## 6. NFR

| ID | Requisito |
|---|---|
| NFR-S5-FE-1 | Cero dependencias nuevas; cero TypeScript; `@` alias; ESLint/Prettier limpios. |
| NFR-S5-FE-2 | Accesibilidad: tercer tab con la misma semántica `tablist/tab` del view; botones ✏️/🗑 con `aria-label`; modal con foco atrapado/ESC (patrón propio del módulo). |
| NFR-S5-FE-3 | Rendimiento: catálogo `payableTerms` cacheado por sesión (1 fetch); panel filtra por Línea en `computed` memoizado. |
| NFR-S5-FE-4 | Regresión nula: tabs `cost`/`commission` y todo `AC-FD-1..13`/`AC-PYG-*`/`AC-VF-*` siguen pasando; `CashFlowPivotTable.vue`/`ExecutivePivotTable.vue`/`ratesConfig.js` SIN diff. |
| NFR-S5-FE-5 | Conversión %↔fracción SOLO en la capa modal (display 30 / wire 0.30), espejo de FD-8; redondeo `toFixed(2)` al display para evitar 29.999…% |

## 7. Criterios de aceptación (QA manual)

- **AC-S5-FE-1:** En `/budget/rules`, tab "Términos de pago": seleccionar Línea X y crear {30 %, −60} y {70 %, 0} ⇒ aparecen en la tabla; F5 sigue ahí; en "Términos de pago" NO hay datos residuales al cambiar de Línea (el `computed` reacciona al filtro).
- **AC-S5-FE-2:** Crear término con % = 0 o 150 ⇒ invalido local (borde rojo, sin request); con 12.5 ⇒ payload `payment_pct: 0.125`.
- **AC-S5-FE-3:** Eliminar término ⇒ confirmación con el texto de §3.2; "Cancelar" no borra; confirmar lo quita de la tabla y tras F5 desaparece (DELETE server).
- **AC-S5-FE-4:** Editor de Celdas ⇒ "+ Añadir gasto" con CECO de la Línea X (términos del AC-1) y monto 1 000 000 fijo ⇒ tras guardar, la sección Gastos muestra DOS líneas ($300 000 con payment_date = fecha−60 y $700 000 con payment_date = fecha), el Σ de la sección sube 1 000 000 exacto y el toast dice "…se desdobló en 2 cuotas…". Network: 1 POST.
- **AC-S5-FE-5:** Tras REHACER la carga SIIGO de egresos con términos configurados, Vista Flujo muestra la salida del gasto partida en los meses de las cuotas, y la Vista Ejecutiva/P&G (causación) muestra el mismo total mensual que antes del desdoble (BR-TERM-04).
- **AC-S5-FE-6:** Reglas de costo/comisión (tabs actuales) intactas; `npm run lint` y `npm run build` verdes; diffs SOLO en los 7 archivos de §"Componentes".
- **AC-S5-FE-7:** Servidor caído al crear término ⇒ modal abierto con "No se pudo guardar. Reintenta." y datos intactos (mismo patrón AC-FD-11).

## 8. Decision Log

| ID | Decisión | Origen |
|---|---|---|
| FD5-1 | UI de administración vive en Reglas Financieras (tab 3), no en el Editor ni pantalla nueva | Supuesto 11 (aprobado) |
| FD5-2 | La expansión es server-side; el FE solo consume `expanded_siblings` | BE-S5 D-3/D-5 (aprobado en sesión) |
| FD5-3 | `%` en UI, fracción en alambre | BE-S5 D-6, espejo FD-8 de FE-S4D |
| FD5-4 | Sin preview de cuotas en el modal (v1) | PQ-4 BE — requiere duplicar la lógica de anclas en FE |
| FD5-5 | `siblings` como 2.º argumento del emit (no rompe consumidores de FE-S4D) | Mínimo diff en el contrato `saved(line)` |

## 9. Riesgos y PQs

- **R-S5-FE-1:** cuotas "fuera del año" (ene-1 ⇒ dic-año anterior) no se ven en Vista Flujo (`monthIndexOf === -1`, R-S5-1 BE). Mitigación: se ven en el Editor con su fecha literal; columna "Fuera de año" = PQ-1.
- **R-S5-FE-2:** el usuario puede confundir el tab nuevo con `line_payment_rules` (cobro). Mitigación: etiquetas explícitas "a proveedores" y subtítulo §3.1.
- **PQs (v2):** PQ-1 Flujo "fuera de año"; PQ-2 warning suma ≠ 100 % en el panel; PQ-3 términos por proveedor+Línea; PQ-4 preview en modal; PQ-5 agrupar cuotas hermanas (= PQ-FD-1).

## 10. Checklist de implementación (orden sugerido)

1. BE-S5 completo (checklist `backend.02_15` §12) — el FE no puede probar sin `expanded_siblings` real.
2. `budgetRulesService.js` + `budgetRulesStore.js` (catálogo + 4 acciones).
3. `PayableTermsPanel.vue` + tab en `BudgetRulesView.vue` (lazy first-activation).
4. `budgetPlanningStore.createScenarioLine` (siblings) → `LineFormModal` (emit) → `BudgetLineGrid` (toast).
5. Lint/build + QA AC-S5-FE-1..7 y regresión AC-FD-1..13 con escenario draft real.