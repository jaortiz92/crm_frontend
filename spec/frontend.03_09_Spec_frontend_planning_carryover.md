# Spec Frontend: Arrastre de Saldos y Columnas "Fuera de Año" en Vista Flujo

| Campo | Valor |
|---|---|
| **ID de feature** | `FE-S6-CARRYOVER` |
| **Versión** | 1.0 — 2026-09-14 |
| **Base** | FE-S4B (`frontend.03_04` Vista Flujo) — ÚNICA vista modificada en el detalle, más la cabecera de `BudgetGridEditor` (toggle) y el store/service de planning. MODIFICA `CashFlowPivotTable.vue` de forma aditiva: con flag OFF y sin datos fuera de año, la vista debe quedar pixel-idéntica a hoy (AC-S6-FE-6). No toca `ExecutivePivotTable.vue`, `BudgetLineGrid.vue`, P&G ni Editor (SD6-4 del BE). |
| **Contrato** | Autoridad: `crm_backend/spec/backend.02_16_Spec_Backend_planning_carryover.md` (BE-S6 §5). |
| **Componentes** | MODIFICA `components/budget/planning/CashFlowPivotTable.vue`, `views/budget/planning/BudgetGridEditor.vue`, `stores/budgetPlanningStore.js`, `services/budgetPlanningService.js`. CERO componentes nuevos. |
| **Dependencias** | Cero (mismos patrones: pill-switch del propio editor, `computed` memoizados, tokens CSS, `alertService`) |
| **Origen** | Sesión spec-definer 2026-09-14: Q1=3+toggle, Q2=1 (flag persistido, dinámica), Q3=2 (N−1, ACTIVE>CLOSED>draft), Q4=4 (columnas fuera-de-año colapsadas por default). |

---

## 1. Objetivo

(1) Dar al usuario un **toggle por escenario** "Arrastrar saldos de {N−1}" que, al activarse, incorpora al Flujo los cobros/pagos del escenario anterior cuya fecha de pago cae en el año del escenario — corrigiendo la subestimación de enero/febrero. (2) Hacer **reconciliable** el efectivo que cae fuera del año (cuotas −60/60 de S5): columnas "Antes de {N}" y "Después de {N}" colapsables, con chip que nunca deja mentira la suma visible.

## 2. Alcance

**Incluye:** service+store (fetch/set carryover, estado cacheado), toggle en cabecera con rollback, bloque de arrastre en el Flujo, resumen Entradas/Salidas/Neto/Acumulado += arrastre, buckets fuera-de-año + columnas opcionales + chip + nota de reconciliación.

**Excluye (v1):** edición de saldos (no existe — SD6-1); arrastre visible en Editor/Ejecutiva/P&G (prohibido); persistencia del switch de columnas (es de sesión); saldo inicial de banco (PQ-1 BE).

## 3. Service — `budgetPlanningService.js`

```js
fetchCarryover: (idBudget) => axiosInstance.get(`/budget/planning/${idBudget}/carryover`)
setCarryover: (idBudget, includeCarryover) =>
  axiosInstance.put(`/budget/planning/${idBudget}/carryover`, { include_carryover: includeCarryover })
```

(Sin slash final; `snake_case` en el body según BE §5.2. Verificar contra el API real al implementar.)

## 4. Store — `budgetPlanningStore.js`

```js
// state nuevo
carryover: {
  enabled: false, source: null, lines: [],           // shape BE PlanningCarryoverResult
  loaded: false, loading: false, error: false,
  unavailableReason: null,                            // 'no_source' | null
  saving: false                                       // guard del toggle (patrón lineSaving)
},

// actions nuevas
async fetchCarryover(idBudget, force = false)
// - no-op cacheado si loaded y !force y currentScenario.id_budget === idBudget
// - loading/`error` silenciosos (patrón ensureCatalogs: el Flujo degrada con aviso, nunca toast bloqueante)
async setCarryoverFlag(idBudget, value)
// 1. guardar snapshot anterior; 2. optimistic: currentScenario.include_carryover = value + carryover.enabled = value
// 3. PUT; 200 ⇒ aplicar BudgetFull devuelto a caché + fetchCarryover(id, force:true) ⇒ { ok: true }
// 4. error ⇒ revertir snapshot + { ok: false, ...classifyPlanningError(err) } (404 ⇒ limpiar detalle + force refetch, §4 de FE-S4D)
```

- `fetchScenarioDetail` (carga normal) setea `carryover.enabled` desde el flag de la respuesta y deja `lines: [], loaded: false` (el fetch real es lazy: solo cuando el tab Flujo está activo y `enabled`).
- Cero impacto en las derivadas existentes: `carryover` NUNCA alimenta computeds de Ejecutiva/P&G/Σ (regla de fuego SD6-4).

## 5. UI — Cabecera (`BudgetGridEditor.vue`)

- Control tipo pill/checkbox (patrón del propio editor) junto a Σ/meta: **"Arrastrar saldos de {N−1}"** (`aria-label="Arrastrar saldos del año {N-1} al flujo de caja"`), `disabled` mientras `carryover.saving` o mutación de escenario en vuelo.
- Al activar y cargar con éxito, bajo el pill (solo en tab Flujo, `aria-live="polite"`): fuente usada ⇒ `← {budget_name} · {status de fuente}`; `no_source` ⇒ aviso "No hay escenario de {N−1} para arrastrar."; error de red ⇒ "No se pudo cargar el arrastre." (el pill revierte con el toast del store).

## 6. UI — `CashFlowPivotTable.vue`

### 6.1 Arrastre (componente B)

- Nuevos pivotes hermanos (mismo `buildPivot` parametrizado, ahora también sobre `carryover.lines`): **Cobros de arrastre** (`income`) y **Pagos de arrastre** (`expense`), bloque único "Saldos de {N−1} (arrastre)" debajo de los actuales con sus totales; celdas por `monthIndexOf(payment_date || budget_date)` — siempre dentro de N por BR-CO-03.
- Filas del bloque con prefijo visual tenue + tooltip: "Línea del escenario {budget_name} ({N−1}) — no forma parte de la causación de este escenario." (R-S6-1).
- **Resumen mensual:** `entradas[m] += cobrosArrastre.columnTotals[m]`, `salidas[m] += pagosArrastre.columnTotals[m]` ANTES de calcular neto/acumulado (el acumulado sigue arrancando en 0 — PQ-1). El bloque propio del escenario conserva su subtotales separados: el resumen muestra además la fórmula textual "incluye arrastre {N−1}" cuando `enabled && lines.length`.
- Con flag OFF o `lines: []` ⇒ bloque y ajustes inexistentes (render idéntico a hoy, AC-S6-FE-6).

### 6.2 Fuera de año (componente C — decisión Q4=4)

> ⚠️ Modificado por FE-S8-FLUJO-OY (`frontend.03_11`): los montos fuera de año nunca poblan celdas mensuales; el toggle solo controla las columnas Antes/Después.

- `buildPivot` extiende fila: `before`/`after` = montos con fecha efectiva `< 01/01/{N}` / `> 31/12/{N}` (mismo `cfMonth`-fuente que las celdas; el total anual `row.total` NO cambia: -1 ya sumaba al total — solo se hace visible de dónde viene).
- Columnas "Antes de {N}" y "Después de {N}" al final de cada tabla (Entradas / Salidas propias; el arrastre no las necesita: sus fechas son siempre ∈ N): **ocultas por default**; toggle de texto `Mostrar fuera de año` / `Ocultar` (ref local de sesión, junto al título de la vista).
- Cuando están ocultas y existe cualquier `before/after ≠ 0` ⇒ chip en cada bloque con afectado: `⊘ {k} filas con montos fuera de año` (click = activar el toggle). El chip NUNCA se oculta con valores pendientes (mentirle al banquero es el bug que matamos).
- Pie de cada tabla con toggle ON: "Σ meses + fuera de año = total anual"; con OFF: "El total anual incluye {k} filas fuera de año" solo si aplica.
- `th` nuevas con la regla aprendida `color: var(--color-text-primary)` (fondo claro).

## 7. Mapeo de errores

| BE (BE-S6 §5) | Presentación FE |
|---|---|
| PUT 404 `"Budget … not found"` | toast + resync detalle (patrón FE-S4D §4); pill revertido |
| PUT 403 | toast de permiso + `refreshRolesSilently` (patrón del store) |
| GET 404 (escenario) | el tab Flujo ya muere con el detalle — nada extra |
| GET red/5xx | `carryover.error = true` ⇒ aviso §5, resumen SIN arrastre (nunca con arrastre a medias), reintento silencioso al reactivar el tab o toggle |
| `unavailable_reason: 'no_source'` | aviso informativo §5, resumen intacto |
| 401 | `handleAuth` estándar |

## 8. NFR

| ID | Requisito |
|---|---|
| NFR-S6-FE-1 | Cero deps nuevas, cero TS, `@` alias, lint/build limpios. |
| NFR-S6-FE-2 | Rendimiento: los 2 pivotes extra son 1 pasada O(L_carry) memoizada; con flag OFF coste cero observable (corto-circuito en `computed`). |
| NFR-S6-FE-3 | A11y: pill con label, avisos `aria-live="polite"`, toggle de columnas announce (`aria-expanded` no aplicable: usar `aria-pressed`), tooltips con `title` + texto visible en chip. |
| NFR-S6-FE-4 | Regresión: AC-VF-1..12 (FE-S4B), AC-FD-1..13 (FE-S4D), AC-PYG-* y tabs/Ejecutiva inalterados; `git diff` solo en los 4 archivos de §"Componentes". |
| NFR-S6-FE-5 | El arrastre jamás se suma a Σ cabecera, P&G, ni pivotes de Ejecutiva (verificar en QA con toggle ON). |

## 9. Criterios de aceptación (QA manual)

- **AC-S6-FE-1:** activar pill ⇒ persiste tras F5 y tras navegar; el GET `…/carryover` se dispara una sola vez por activación (Network), sin refetch del detalle.
- **AC-S6-FE-2:** escenario N−1 con una cuota de pago el 19-ene-N de $700 k ⇒ bloque "Saldos de {N−1}" la muestra en Enero; la fila **Salidas** y **Neto** de enero suben 700 k; **Acumulado** reflejado; Editor/Ejecutiva/P&G Σ cabecera: valores idénticos a flag OFF (AC-S6-FE-5).
- **AC-S6-FE-3:** flag ON sin escenario N−1 ⇒ aviso "No hay escenario…", resumen intacto, sin filas nuevas.
- **AC-S6-FE-4:** filas propias con cuota dic-(N−1) (por S5) ⇒ con columnas ocultas aparece el chip "⊘ N filas…" en el bloque afectado; activar "Mostrar fuera de año" ⇒ columna "Antes de {N}" con el monto, y Σ meses + columna = total anual exacto en el pie.
- **AC-S6-FE-5:** cortar red con pill ON recién activado ⇒ PUT rollback (pill OFF), toast "No se pudo guardar. Reintenta.", GET fallido ⇒ aviso §7 y resumen sin arrastre.
- **AC-S6-FE-6:** escenario con flag OFF y todas las fechas dentro del año ⇒ DOM del tab Flujo idéntico al pre-FE-S6 (mismas clases/columnas; no se renderizan pill-avisos ni arrays vacíos).
- **AC-S6-FE-7:** spam del pill ⇒ 1 PUT (guard `saving`); concurrente con mutaciones de línea sin interferencia.
- **AC-S6-FE-8:** `npm run lint` + `npm run build` verdes; `CashFlowPivotTable.vue` conserva sus AC-VF propias (R-1 nota, IVA, orden de bloques).

## 10. Decision Log

Reutiliza SD6-1..SD6-6 de BE-S6 §8 (sesión 2026-09-14). FE-únicas: FD6-1 toggle de columnas = estado de sesión, no persistido (costo/beneficio); FD6-2 el pill vive en cabecera (visible desde cualquier tab, efecto solo en Flujo); FD6-3 aviso de fuente bajo el pill solo en tab Flujo (menos ruido).

## 11. Riesgos y PQs

- **R-S6-FE-1:** usuario puede asumir que el pill cambia "el presupuesto" ⇒ copy: "Solo afecta a esta Vista Flujo; no genera líneas."
- **R-S6-FE-2:** doble conteo si alguien agrega arrastre a un presupuesto ya "cargado a mano" con esas cuotas ⇒ mitigación: pill default OFF + copy del tooltip.
- **PQ:** arrastre multi-año (SD6 PQ-2), saldo inicial de banco (PQ-1), columna fuera-de-año también en Vista Ejecutiva (solo si causación cross-year se declara), export.

## 12. Checklist de implementación

1. Service (2 métodos) ⇒ store (state + 2 actions + integración `fetchScenarioDetail`).
2. Pill en `BudgetGridEditor.vue` + avisos.
3. `CashFlowPivotTable.vue`: buckets before/after ⇒ columnas colapsables + chip + pies ⇒ bloque arrastre ⇒ resumen.
4. Lint/build + QA AC-S6-FE-1..8 (con BE-S6 real y escenario N−1 activo con S5 cargado — la cadena completa: términos → cuotas → arrastre).