# Spec Frontend: Drilldown de Detalle de Movimientos de Arrastre (Anos Anteriores)

| Campo | Valor |
|---|---|
| **ID de feature** | `FE-S21-CARRYDRILL` |
| **Version** | 1.2 -- 2026-10-22 |
| **Base** | FE-S6 (`frontend.03_09` arrastre en pivote con `buildCarryPivot`), FE-S4 (`frontend.03_04` vista flujo), drilldown de CECO existente (`frontend.03_19` + `frontend.03_11` fuera de ano) y vista `CecoDetailView.vue`. |
| **Contrato** | Consume el contrato congelado de `crm_backend/spec/backend.02_26_Spec_Backend_planning_carryover_drilldown.md` (BE-S15): `GET /budget/planning/{id}/carryover` ya entrega todas las filas de movimiento; CERO endpoints nuevos. Verificar contra el codigo BACKEND real ante cualquier desviacion. |
| **Componentes** | MODIFICAN: `src/components/budget/planning/cecoMovements.js` (normalizacion de lineas de arrastre + labels de origen), `src/components/budget/planning/cashFlowPivot.js` (solo si hace falta un flag de linkability en `buildCarryPivot`; sin cambio de forma), `src/components/budget/planning/CashFlowPivotTable.vue` (RouterLink en filas de arrastre + query de navegacion), `src/views/budget/planning/CecoDetailView.vue` (dataset de arrastre + grupo "Arrastre {N-1}" + filtro por query), `src/components/budget/planning/CecoMovementTable.vue` (render del grupo con badge de origen; pivote solo si aplica). |
| **Dependencias** | BE-S15 (solo lectura). Sin librerias nuevas. JS + Composition API, sin TypeScript. |

---

> ## NOTA DE ENMIENDA (v1.2 -- 2026-10-22): dedupe single-flight del GET del arrastre (`fetchCarryover`)
>
> **Bug reportado:** grupo "Arrastre {N−1}" VACÍO en `CecoDetailView` para CECOs con movimientos (p. ej. budget 121, fuente 576: CECO 000001 → 2 líneas `purchase`; CECO 000401 → 3 líneas `line`; datos verificados contra el payload real del backend).
>
> **Causa raíz:** el dedupe inicial de `budgetPlanningStore.fetchCarryover` era
> `if (carryover.loading) return { ok: true }` — un no-op CIEGO mientras haya
> cualquier GET en vuelo. Cuando el vuelo en el aire pertenecía a OTRO
> escenario (ventana de carrera deep-link: `currentScenario` cambia en
> `fetchScenarioDetail` mientras un GET viejo sigue en el aire), su respuesta
> acababa descartada por el guard `currentScenario?.id_budget === idBudget`
> (BR-CO-04) y el deep-link dejaba la caché SIN líneas (`lines: []`,
> `loaded: false`) sin re-agendar ⇒ `carryoverAvailable` en `false` ⇒ grupo no
> renderizado (degradación silenciosa por diseño §7).
>
> **Precisión contractual:** el dedupe de `fetchCarryover` pasa a ser: (1) no-op
> cacheado como hoy (`loaded && currentScenario === id`, AC-S6-FE-1 intacto);
> (2) si hay un vuelo ACTIVO, el llamador ESPERA el settle del vuelo
> (promesa single-flight `carryoverInflight` a nivel de módulo) y, si tras él la
> caché sigue sin pertenecer al escenario pedido, re-agenda el GET para ESTE id.
> Consecuencia: un solo GET por vuelo en el aire (el propio), sin requests
> duplicadas para el mismo id y con la caché jamás "silenciosamente vacía" al
> entrar por URL directa. Verificación headless: `tests/carrydrill.repro3.test.js`
> (race incluida + las 2 URLs del bug con fixture REAL del backend — movimientos
> esperados 2 y 3).

---

## 1. Objetivo y usuario

> NOTA DE ENMIENDA (1.1 -- 2026-10-22): `carry` viaja con el ORIGEN de la fila clicada (line|cogs|purchase|internment), no el literal 1 (alinea RF-CR-01 con RF-CR-05/AC-S21-FE-1).

Como usuario del planning: al ver en la vista Flujo (`/budget/planning/{idBudget}/`) la seccion "Saldos de {N-1} (arrastre)" que hoy muestra solo etiquetas de rastro (las generadas por `carryRowLabelOf` y `carryRowLabelTitle`: para material el rastro de flecha hacia el CECO de origen; para derivados el rastro de onda con "Costo/Compra/Internacion {N-1}" y el CECO), quiero hacer clic sobre esa fila y ver el DETALLE de los movimientos que la componen, de la misma forma que ya lo hago con los CECOs del mismo ano (navegacion a `/budget/planning/{idBudget}/ceco/{code}` -> `CecoDetailView`).

## 2. Reglas funcionales

### 2.1 Disparo desde el pivote (CashFlowPivotTable.vue)

- **RF-CR-01:** Las filas de "Cobros de arrastre" y "Pagos de arrastre" cuyo CECO se resuelve en el catalogo (`costCenterCodeOf(costCenters, row.id)`, patron del `cecoLink()` existente en `CashFlowPivotTable.vue` (esquinas 220-236)) se renderizan como `<RouterLink>` con el MISMO patron de estructura/estilo que los labels de CECO del ano (patron de las cajas 1228-1236), navegando a `BudgetCecoDetail` (params `idBudget` + `costCenterCode`) con `query: { tab: 'flow', carry: {origin} }`.
- **RF-CR-02 (preservar el contexto):** la nota de origen se MUESTRA igual que hoy dentro de la celda (via `carryRowLabelOf` / `carryRowLabelTitle`); el tooltip sigue mostrando "nombre CECO -- nota origen" (fix v1.1 anterior). El link NO altera el contenido visual de la celda, solo la vuelve navegable (cursor/hover).
- **RF-CR-03 (degradacion honesta):** cuando el CECO no se resuelve en el catalogo (filas sinteticas/degradadas), la fila queda texto plano SIN link, igual que RF-1.2 de los CECOs del ano.

### 2.2 Vista de detalle extendida (CecoDetailView.vue)

- **RF-CR-04 (dataset de arrastre):** `CecoDetailView` agrega los movimientos de arrastre leyendo el cache del store (`store.carryover` -> `fetchCarryover(idBudget)` con su patron lazy ya implementado). El grupo solo se construye cuando `enabled === true` y hay `lines`. Con flag OFF o `unavailable_reason === "no_source"` el grupo NO se renderiza (ni error).
- **RF-CR-05 (grupo "Arrastre {N-1}"):** en el tab de flujo (`tab=flow`), la vista muestra un grupo/pesta nueva "Arrastre {N-1}" (usar `source.budget_year`, con fallback `scenarioYear - 1`) con los movimientos de arrastre de ese CECO, SIN invadir los grupos causado/flujo del ano propio. Con `route.query.carry === '1'` (o valor de `carry`), el filtro de origen llega PRESELECCIONADO con el origen de la fila clicada:
  - `line` => badge "Linea de presupuesto".
  - `cogs` => badge "Costo de venta".
  - `purchase` => badge "Pago a proveedor".
  - `internment` => badge "Internacion".
  Y con posibilidad de limpiar el filtro para ver todos los origenes de arrastre del CECO.
- **RF-CR-06 (columnas por movimiento):** cada movimiento de arrastre se muestra con: fecha de pago efectiva (`payment_date`), con fallback claro si es null (mostrar el anclaje `budget_date` con etiqueta "sin termino de pago"), monto (`projected_amount`), descripcion, badge de origen y CECO. La ordenacion es la del payload (fecha efectiva ASC + rank de origen + id null-safe).
- **RF-CR-07 (cuadre 1:1):** los totales del grupo arrastre del detalle cuadran con el total de la fila del pivote por CECO+origen (ambos leen el mismo slice de `store.carryover.lines`). Si el slice filtrado quede vacio, mostrar 0 resultados (sin crash ni estados enganosos).

### 2.3 Reutilizacion de componentes

- **RF-CR-08:** Reusar `CecoMovementTable.vue` (y/o `CecoMovementPivot.vue` si el tab lo pide) de la MISMA forma: normalizacion paralela de lineas de arrastre al patron de `normalizeBudgetLines` (nueva `normalizeCarryoverLines` en `cecoMovements.js`) + `SOURCE_KINDS`/`GROUP_KEYS` extendidas con `carryover`. El text de meta por fila usa la extension del `movementMetaText` (origen + N-1 + descripcion cuando aplique).
- **RF-CR-09 (filtrado):** reutilizar los filtros existentes del detalle (month/lineType/behavior) donde aplique; el ORIGEN es un filtro distintivo SOLO del grupo de arrastre. El valor de `route.query.carry` solo PRESELECCION ese filtro (los filtros de ano propio quedan como hoy).

## 3. Contracto de servicio (nada nuevo en budgetPlanningService.js)

- `fetchCarryover(idBudget)` es la UNICA llamada usada por el grupo de arrastre del detalle. Sin params ni fields nuevos.

## 4. Store (`budgetPlanningStore.js`)

- Asegurar cache fresco de `carryover` al entrar a `CecoDetailView` (un llamado por cambio de escenario, dedupe/tard-ao discreta igual que hoy). NINGUN store nuevo; sin nuevos estado de evoluciones (`carryover` ya existe).

## 5. UX resumida

- El `<RouterLink>` de filas de arrastre hereda el estilo visual de los links de CECO del ano (mismo look, tono muted para distinguir).
- El grupo arrastre lleva su titulo con el anio fuente_anto ("Arrastre de 2026"). El badge de origen es un chip pequeno dentro de la fila del detalle (no como una columna aparte).

## 6 Criterios de aceptacion (smoke)

- **AC-S21-FE-1:** con flag ON y catalogo activo: las filas de arrastre navegan (RouterLink) a `BudgetCecoDetail` con el `costCenterCode` correcto y `?tab=flow&carry={origin}`; el link no cambia la celda visualmente (solo cursor/hover).
- **AC-S21-FE-2:** en `CecoDetailView` con `carry={origen}`: el grupo "Arrastre {N-1}" aparece con fecha de pago, monto, descripcion y badge de origen, y el filtro de origen llega preseleccionado; limpiarlo muestra TODOS los origenes de arrastre del CECO.
- **AC-S21-FE-3:** la suma del grupo arrastre del detalle cuadra con el total de la fila del pivote por CECO+origen (1:1, mismo slice del store).
- **AC-S21-FE-4:** CECO no resoluble en catalogo (degradacion) => fila de arrastre queda texto plano sin link; sin link muerto ni crash.
- **AC-S21-FE-5:** con flag OFF o `no_source` => sin grupo de arrastre en el detalle; las filas del pivote de arrastre no son links (regresion del estado actual).
- **AC-S21-FE-6:** los tabs/grupos del ano propio (Causado/Flujo) quedan byte-identicos al comportamiento actual (regresion de `CecoDetailView`).
- **AC-S21-FE-7:** el tooltip `carryRowLabelTitle` sigue mostrando "nombre CECO -- nota origen" tambien en filas linkables (fix v1.1 anterior intacto).

## 7 Checklist de implementacion

1. `cecoMovements.js`: `normalizeCarryoverLines` + labels de origen + `movementMetaText` para arrastre.
2. `cashFlowPivot.js`: evaluar si hay que exponer un flag `linkable`/`origin` (sin cambios de forma en la fila: `key/id/origin/label/months/total`).
3. `CashFlowPivotTable.vue`: RouterLink condicional en el `<th>` de filas de arrastre (RF-CR-01..03).
4. `CecoDetailView.vue`: carga de arrastre (RF-CR-04), grupo (RF-CR-05), filtro por query (RF-CR-05/09), totales 1:1 (RF-CR-07).
5. `CecoMovementTable.vue` (+ pivote si aplica): render del grupo con badge (RF-CR-06/08).
6. `npm run lint` + smoke AC-S21-FE-1..7 por lectura (NO levantar servidores/docker).


