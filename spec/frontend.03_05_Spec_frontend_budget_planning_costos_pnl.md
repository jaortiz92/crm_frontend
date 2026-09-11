applied: D-10 applied: AC-PYG-6 applied: §6.4/aria applied: §4.3/pct-rows applied: fuente/E-01 # Spec Frontend: Costos Estimados + P&G + Acumulado en Vista Ejecutiva (incremento FE-S4)

| Campo | Valor |
|---|---|
| **ID de feature** | `FE-S4C-BUDGET-COSTOS-PYG` |
| **Base** | `FE-S4-BUDGET-PLANNING` (`frontend.03_03` §8.2 tab 1). No reemplaza interacciones vigentes de Ejecutiva: solo **agrega secciones** y una caché nueva en el store. Independiente de `FE-S4B` (Vista Flujo, `frontend.03_04`): esa vista NO cambia. |
| **Componentes** | `crm_frontend/src/components/budget/planning/ExecutivePivotTable.vue` (modificado), `crm_frontend/src/stores/budgetPlanningStore.js` (modificado) |
| **Backend** | **Cero cambios.** Se consume el catálogo maestro existente `GET /budget/line-cost-rate/` (ya envuelto por `budgetRulesService.fetchRates('cost')`). |
| **Dependencias** | Cero nuevas (sin TS, sin gráficas, sin servicios nuevos). |
| **Fuente** | Sesión spec-definer 2026-09-11: supuestos 1–8 aprobados + requerimiento #9 del stakeholder detallado en 10–11 y aprobados. **Enmienda E-01 (2026-09-11): el stakeholder movió los % del Acumulado de una fila consolidada a una fila `%` por concepto tras cada monto (patrón P&G) — ver §4.3/D-10.** |

---

## 1. Objetivo

Extender la **"Vista Ejecutiva"** del detalle de escenario (`/budget/planning/:idBudget`) con tres secciones derivadas (read-only, client-side), en este orden tras "Gastos variables (calculados)":

1. **"Costo de ventas (estimado)"** — pivote CECO × Ene–Dic: los ingresos presupuestados de cada CECO de ingreso se multiplican por la **tasa de costo vigente de su línea de producto** (catálogo "Costos por Línea" de Reglas Financieras). La rentabilidad objetivo queda implícita: `margen = 100 % − cogs_pct`.
2. **"Resultado (P&G)"** — tabla mensual `(+) Ingresos − (−) Costos = Margen bruto − (−) Gastos fijos − (−) Gastos variables = Resultado operativo`, con filas de porcentaje sobre ingresos.
3. **"Acumulado (Ene→Mes)"** — Ingresos, Costos y Gastos **acumulados** mes a mes con el **neto directo** y sus porcentajes respectivos.

**Valor para el stakeholder:** leer la rentabilidad proyectada del escenario (margen bruto, punto de equilibrio operativo y evolución acumulada del resultado) sin salir del editor ni abrir el P&L de analítica.

## 2. Alcance

**Incluye:** las 3 secciones en `ExecutivePivotTable.vue`; caché de tasas de costo en `budgetPlanningStore` (una por sesión, fallo silencioso); resolución mensual de tasas client-side; notas de degradación/exclusión; estilos `pv-*` nuevos.

**Excluye (v1):** edición de tasas dentro del escenario, cambios a `BudgetGridEditor.vue`/`CashFlowPivotTable.vue`/`BudgetLineGrid.vue`/`planningFormat.js`/router/backend; IVA (todo es causación neta); nombre de la línea en UI (solo código/pct); export; cualquier cifra "real" (factura/CXC: eso es el P&L de analítica, Pilar 1).

## 3. Fuente de datos y resolución de tasas

### 3.1 Tasa de costo: `line_cost_rates` (Reglas Financieras → "Costos por Línea")

Campos consumidos (esquema `LineCostRate`, verificado): `id_line_cost_rate`, `id_line` (`null` = **tasa global de respaldo**), `cogs_pct` (**escala 0–100**, numérico; `Numeric(5,2)` en DB — NO confundir con `variable_rate` que es 0–1), `date_from`, `date_to`, `is_active`.

**Aporte por CECO-ingreso, mes m:** `ingreso_m × pct / 100`, donde la cadena de resolución replica la D-2/BR-7/BR-14/BR-15 del motor (`budgetEngine.get_pnl` Q6) pero **evaluando mes a mes**:

```
tasa aplicable (línea, mes):
  1. referencias = tasas con is_active === true
     y date_from <= finDeMes(m) <= date_to
     ordenadas por id_line_cost_rate DESC
  2. si id_line del CECO != null y existe referencias de ESA línea
        → pct de la de MAYOR id            (source = 'line')
  3. si no, existe referencia global (id_line == null)
        → pct global de MAYOR id           (source = 'global')
  4. si no → el CECO NO aporta costo ese mes (ver exclusión §3.3)
```

* `finDeMes(m)` = último día calendario del mes `m` del `budget_year`, calculado **en hora local sin strings UTC**: `const d = new Date(year, m + 1, 0)` → formatear `YYYY-MM-DD` con componentes propios (prohibido `toISOString()`, patrón `localToday()` de `ratesConfig.js` A6). Convención "period end" del motor llevada a cada mes: si una tasa cambia el 15-jun, los meses Ene–May usan la anterior (si cubría) y Jun–Dic la nueva.
* **Exclusión con advertencia (§3.3):** un CECO de ingreso queda **excluido de todo el año** solo si **ningún mes** le resolvió tasa (regla 4 en los 12 meses). Su `Σ ingreso` se lista en la nota de advertencia. Los meses sin tasa de un CECO parcialmente cubierto muestran `·` sin generar exclusión.
* El catálogo `costCenters` cacheado alimenta el mapeo CECO→línea; si el catálogo falló (estado A5), `id_line` se trata como `null` → el CECO cae a la tasa global.

### 3.2 Caché en `budgetPlanningStore.js` (patrón A5/`ensureCatalogs`)

```js
// state
lineCostRates: [],            // SOLO is_active === true (filtrado al cargar)
lineCostRatesLoaded: false,
lineCostRatesError: false,
// actions: añadir un TERCER job a ensureCatalogs(), mismo patrón silencioso:
if (!this.lineCostRatesLoaded) {
  jobs.push(
    budgetRulesService
      .fetchRates('cost')          // GET /budget/line-cost-rate/?skip=0&limit=500 (A1, slash final)
      .then((r) => {
        this.lineCostRates = (Array.isArray(r?.data) ? r.data : []).filter((x) => x.is_active === true)
        this.lineCostRatesLoaded = true
      })
      .catch(() => { this.lineCostRatesError = true })
  )
}
```

* Sin getter nuevo obligatorio: la resolución por mes vive en el componente (es cálculo de presentación). `ensureCatalogs()` ya se invoca desde `fetchScenarioDetail` → **cero cambios en `BudgetGridEditor.vue`**.
* **Nunca** dispara toast ni bloquea la vista (misma política que CECO/temporadas). `lineCostRatesError` permite diferenciar el mensaje de degradación (§5.5).
* Límites conocidos: `limit=500` (catálogo maestro real ≪ 500; R-3).

### 3.3 Base de ingresos

La matriz de costo usa **exactamente la misma agregación** que el bloque Ingresos vigente: `incomePivot.columnTotals` (fijos-causación por `budget_date`, CECO agrupado). El P&G y el Acumulado se derivan SOLO de columnas ya computadas (ningún re-recorrido de líneas):

| Fila | Fuente de celda mes m |
|---|---|
| Ingresos | `incomePivot.columnTotals[m]` |
| Costo de ventas | `costPivot.columnTotals[m]` |
| Gastos fijos | `expensePivot.columnTotals[m]` |
| Gastos variables | `variablePivot?.columnTotals[m] ?? 0` |

**Columna "Total" = Σ de las 12 columnas** (no `grandTotal`): el P&G es aritméticamente cerrado con su propia grilla; los montos con fecha nula/no parseable siguen apareciendo en los bloques superiores (total de fila `grandTotal`) pero no en el P&G (R-2, nota al pie del P&G: *"No incluye montos sin fecha de causación asignable"*).

## 4. Estructura de secciones en `ExecutivePivotTable.vue`

Orden final del template (§8.2 tab 1 extendido):

1. Nota introductoria (existente, + mención: *"El costo de ventas se ESTIMA con las tasas de Reglas Financieras; no se almacena en las líneas."*)
2. Bloque **Ingresos** (existente, sin cambios)
3. **NUEVO — "Costo de ventas (estimado)"**
4. Bloque **Gastos fijos** (existente)
5. Bloque **Gastos variables (calculados)** (existente)
6. **NUEVO — "Resultado (P&G)"**
7. **NUEVO — "Acumulado (Ene→Mes)"**
8. Sección **Tasas variables (solo lectura)** (existente, se mantiene al final)

### 4.1 "Costo de ventas (estimado)"

* Tabla `pv-table` idéntica en estructura al bloque Ingresos (esquina CECO + Ene–Dic + Total), **mismas filas/sort** que `incomePivot.rows`.
* Celda = `ingreso_m × pct/100` resuelto §3.1 (redondeo solo visual vía `formatMoney`).
* `title` de la etiqueta de fila: `"Tasa(s): 62.5 %, 58 %"` (pcts distintos aplicados, orden de aparición) — sin columna extra.
* Nota al pie del bloque: *"Estimación derivada: ingresos presupuestados × tasa de costo vigente de la línea (o global). No se almacena en las líneas; se recalcula al editar ingresos o tasas."*
* Si hay CECOs excluidos (§3.1 regla 4): nota amarilla `pv-warn`: *"Sin tasa de costo aplicable (no se estimó costo): {lista de etiquetas}"*.
* Estados degradados (§5.5).

### 4.2 "Resultado (P&G)"

Una tabla con columna "Concepto" + Ene–Dic + Total. Filas exactas (orden):

| # | Fila | Celda mes m | Total |
|---|---|---|---|
| 1 | `(+) Ingresos` | ingresos | Σ12 |
| 2 | `(−) Costo de ventas` | costo (o `—` §5.5) | Σ12 (o `—`) |
| 3 | **`= Margen bruto`** (fuerte) | fila1 − fila2 (o `—`) | idem |
| 4 | `Margen bruto %` | `(margen/ingresos)` — `—` si ingresos m = 0 | sobre Σ total ingresos |
| 5 | `(−) Gastos fijos` | gastos fijos | Σ12 |
| 6 | `(−) Gastos variables` | variables (cero `·` si no hay bloque) | Σ12 |
| 7 | **`= Resultado operativo`** (fuerte) | margen − fila5 − fila6 (o `—`) | idem |
| 8 | `Resultado %` | sobre ingresos del mes — `—` si 0 | sobre Σ total |

* Los `0` mensuales se muestran `·` (patrón existente); negativos en **rojo** (clase `pv-negative`, §6.3).
* Encabezado `aria-label="Resultado mensual (P&G) del escenario"`; nota al pie: *"Cifras netas, sin IVA, por causación (budget_date). Ver 'Vista Flujo' para liquidez."*

### 4.3 "Acumulado (Ene→Mes)"

* Columnas Ene–Dic; cada celda = acumulado **desde enero hasta ese mes**; columna "Total" = valor de Dic (redundancia intencional por simetría, con `title` que lo aclara).
* Filas: `(+) Ingresos acumulados`, `(−) Costo de ventas acumulado`, `(−) Gastos acumulados` (**fijos + variables en una sola fila**, ya desglosados en el P&G), **`= Neto acumulado`** (fuerte; ingresos − costo − gastos).
* **Una fila de porcentaje por concepto, inmediatamente debajo del monto al que describe (E-01; patrón idéntico al P&G):** `Costo %` tras "Costo de ventas acumulado", `Gastos %` tras "Gastos acumulados", `Margen %` tras "Neto acumulado". Cada celda = ratio sobre los **ingresos acumulados del mismo mes** (no sobre el total anual); estilo y formato iguales a las filas `%` del P&G (`.pv-cell-pct`, `pvPct` 1 decimal); `—` cuando los ingresos acumulados del mes sean 0. El `—` degradado (§5.1/§5.2) aplica a las filas Costo, Neto y sus `%`; Ingresos y Gastos acumulan igual. Las tres filas `Concepto` usan `th.pv-row-label` (regla §6.2).
* Negativos (neto, margen < 0) en rojo.

## 5. Estados y degradación

1. **`lineCostRatesLoaded && lineCostRates.length === 0`** (o ninguna cubre el `budget_year`): bloque 4.1 reemplazado por `pv-empty`: *"No hay tasas de costo vigentes. Defínalas en Reglas Financieras → Costos por Línea para estimar el costo de ventas."* En P&G y Acumulado, **Costo, Neto/Margen y sus % muestran `—`** (nunca costo 0 silencioso: el resultado inflado es peor que un vacío honesto — decisión #8/#11 aprobada).
2. **`lineCostRatesError`**: mismo tratamiento visual, mensaje: *"No fue posible cargar las tasas de costo (sin conexión). Reintente recargando la página."*
3. **Cubrimiento parcial**: meses sin tasa de una línea SIN global → celda `·` + nota §4.1; si ningún mes cubre → CECO a la lista de exclusión.
4. Escenario sin líneas: vigente (solo nota introductoria; las secciones nuevas tampoco se renderizan — el guard `hasLines`/rows vacíos debe cubrir 4.1–4.3 además del patrón existente).
5. Reactividad: toda la cadena (`costPivot → pnl → acumulado`) es computada de `budget_lines` cacheado → tras un PUT en el Editor se recalcula sola sin HTTP (extiende AC-FE-6); tasas nuevas requieren recarga de página (caché por sesión, A5 — documentado en §9 PQ-R).

## 6. Estilo y accesibilidad (lecciones FE-S4B aplicadas)

1. Reaprovechar patrones `pv-*` (sticky thead/tfoot/CECO, `60vh`, `tabular-nums`).
2. **Regla obligatoria (bug light-theme ya corregido):** toda celda `th` que se pinte sobre fondo claro (`--color-surface-card`/`--color-surface`) debe fijar su propio `color: var(--color-text-primary, #070707)` explícito; el `th { color:#ffffff }` global de `main.css` la dejaría invisible en tema claro. Las nuevas columnas "Concepto" y filas fuertes usan `th.pv-row-label`/`th.pv-col-concepto` con color propio + fondo del token.
3. Clases nuevas: `.pv-row-strong th/td { font-weight: 700 }`, `.pv-negative { color:#c53030 }` + `:root[data-theme='dark'] .pv-negative { color:#ff9b9b }` (mismos valores que `cf-negative`), `.pv-cell-pct { font-size:0.72rem; color: var(--color-text-secondary) }`, `.pv-warn` (nota de exclusión: borde/ámbulo estilo `chip-closed`, texto `var(--color-text-secondary)`, nunca rojo — no es un error).
4. `aria-label` en español en cada tabla nueva; las filas `%` del Acumulado son filas normales con etiqueta `th` (E-01), sin ARIA especial por celda (mismo patrón que los % del P&G), sin librerías.
5. Formato de porcentaje: `formatVariableRate` no aplica (recibe 0–1; aquí la proporción ya se calcula como `x / ingresos` → función local `pvPct(ratio)` que devuelve `"62.5 %"` con 1 decimal, `—` si `!isFinite`). No tocar `planningFormat.js`.

## 7. Requisitos no funcionales

| ID | Requisito |
|---|---|
| NFR-CY-1 | HTTP: +1 request por sesión (tasas) dentro de `ensureCatalogs`; NINGUNO al cambiar de tab ni al alternar escenarios. |
| NFR-CY-2 | Cálculo O(CECOs × 12 × log R) ≈ despreciable (R ≤ 500); sin watchers ni setInterval; memoizado vía computeds. |
| NFR-CY-3 | Cero dependencias nuevas; `npm run lint` 0 errores; `npm run build` OK. |
| NFR-CY-4 | Tema claro/oscuro verificado para las 3 secciones (regla §6.2). |
| NFR-CY-5 | Regresión nula: sin cambios en `CashFlowPivotTable.vue`, `BudgetLineGrid.vue`, `BudgetGridEditor.vue` ni en el store más allá del job de `ensureCatalogs` + 3 campos de state. |

## 8. Criterios de aceptación (QA manual)

* **AC-PYG-1:** Orden de secciones en Ejecutiva: Ingresos → Costo de ventas → Gastos fijos → Gastos variables → Resultado (P&G) → Acumulado → Tasas variables.
* **AC-PYG-2:** Con una tasa global `cogs_pct=60`: cada celda de costo = 60 % del ingreso del mismo mes/CECO; el Total anual cuadra con Σ de las 12 celdas.
* **AC-PYG-3:** Tasa de línea con ventana `date_from=15-mar` → meses Ene–Feb usan la tasa global (o `·` si no hay) y Mar–Dic la de línea; una segunda tasa de la misma línea solapada gana por **mayor `id_line_cost_rate`**.
* **AC-PYG-4:** CECO de ingreso con línea sin tasa y sin global todo el año → no aporta costo, aparece en la nota de exclusión con su etiqueta; los demás CECO no se ven afectados.
* **AC-PYG-5:** P&G: Margen = ingresos − costo; Resultado = margen − fijos − variables; los % usan ingresos del mes y `—` con ingresos 0; negativos en rojo en ambos temas.
* **AC-PYG-6:** Acumulado: cada celda = Σ desde Ene; Dic == columna Total; cada concepto tiene su propia fila `%` justo debajo (`Costo %`, `Gastos %`, `Margen %`, E-01; cero fila consolidada), con `—` si acumulado de ingresos = 0; Gastos = fijos+variables en una sola fila.
* **AC-PYG-7:** Editar un ingreso en "Editor de Celdas" (p. ej. julio) y volver a Ejecutiva sin recargar: costo, P&G y Acumulado de jul→dic se recalculan (reactividad AC-FE-6).
* **AC-PYG-8:** Sin tasas vigentes: mensaje de Reglas Financieras en 4.1, `—` en costo/margen/resultado (P&G) y costo/neto (Acumulado); con red caída y caché no lograda: mensaje de reintento; en ambos casos Ingresos/Gastos del P&G siguen operativos.
* **AC-PYG-9:** DevTools→Network: exactamente 1 petición a `/budget/line-cost-rate/?skip=0&limit=500` por sesión, aunque se naveguen varios escenarios; 0 peticiones al cambiar de tab.
* **AC-PYG-10:** Regresión: Vista Flujo, Editor, bloques Ejecutiva existentes, "Marcar Meta Activa" y los chips intactos; `CashFlowPivotTable.vue` sin diff.
* **AC-PYG-11:** Escenario con montos sin fecha asignable: no entran al P&G pero sí al total de fila de los bloques; la nota al pie lo declara.
* **AC-PYG-12:** lint + build en verde; sticky/scroll y ambos temas OK en las tablas de 12 columnas + Concepto.

## 9. Decisiones y trazabilidad

| ID | Decisión | Origen (sesión 2026-09-11) |
|---|---|---|
| D-1 | Fuente de estimación = tasas "Costos por Línea" existentes (`cogs_pct`); rentabilidad = 100 − cogs; sin tasa nueva en escenario | Supuesto 1 aprobado |
| D-2 | Cadena línea → global (id_line NULL) → exclusión con advertencia (réplica BR-7/BR-14/BR-15 mensual) | Supuesto 2 aprobado |
| D-3 | Resolución de tasa por mes con referencia = último día del mes | Supuesto 3 aprobado |
| D-4 | Fetch único por sesión cacheado en `budgetPlanningStore.ensureCatalogs`, fallo silencioso con estado `lineCostRatesError` | Supuesto 4 aprobado |
| D-5 | Orden de secciones §4 | Supuesto 5 aprobado |
| D-6 | Filas del P&G + 2 filas de % sobre ingresos del mes | Supuesto 6 aprobado |
| D-7 | Signos positivos con `(−)` en concepto; netos negativos en rojo; sin IVA | Supuesto 7 aprobado |
| D-8 | Degradación con `—` (no costo 0 silencioso) | Supuesto 8 aprobado |
| D-9 | Tabla Acumulado (Ene→Mes) tras el P&G: Ingresos/Costos/Gastos (fijos+variables unidos)/Neto directo, Dic = Total | **Requerimiento #9 del stakeholder** |
| D-10 | % del Acumulado: **una fila por concepto tras su monto** (`Costo %`, `Gastos %`, `Margen %`) sobre ingresos ACUMULADOS del mes | Supuesto 10 aprobado → **revisión E-01 del stakeholder (2026-09-11)**; antes: fila única consolidada |
| D-11 | Coherencia del `—` degradado también en Acumulado; negativos en rojo | Supuesto 11 aprobado |

## 10. Riesgos y divergencias conocidas

* **R-1 (aceptado, informado):** el P&L de analítica (motor) resuelve la tasa al **cierre del período consultado** y no mes a mes; con cambios de tasa intra-año, la suma anual de esta matriz puede diferir de `cogs.budget` del Pilar 1. Es la semántica que pidió el stakeholder (tendencia mensual); se documenta en nota al pie de 4.1: *"Comparación mes a mes; puede diferir del P&L de analítica si las tasas cambian intra-anual."* Si gerencia exige igualdad, PQ-CY-1.
* **R-2:** montos sin mes asignable quedan fuera del P&G/Acumulado (Σ 12 ≠ `grandTotal` de fila). Nota al pie §3.3.
* **R-3:** `limit=500` fija por el servicio; catálogo > 500 tasas activas truncaría (hoy ≪). Revisar si Reglas crece.
* **R-4:** catálogo CECO caído ⇒ todas las líneas tratan `null` ⇒ solo la tasa global estima costo (nota del §3.1). Aceptado por patrón A5.
* **R-5:** las tasas editadas en Reglas Financieras en la misma sesión NO se reflejan hasta recarga (caché una-por-sesión deliberada, A5).

## 11. Preguntas abiertas (no bloquean)

* **PQ-CY-1:** ¿Alinear el motor (`get_pnl` Q6) a resolución mensual para que ambas lecturas concuerden? (Backend spec aparte.)
* **PQ-CY-2:** ¿Mostrar nombre de línea y tasa aplicada como columna extra o solo tooltip? (v1: tooltip.)
* **PQ-CY-3:** ¿Export CSV de P&G/Acumulado? (FUERA de v1, igual que FE-S4B.)

## 12. Checklist de implementación

1. `budgetPlanningStore.js`: 3 campos de state + job en `ensureCatalogs` (§3.2).
2. `ExecutivePivotTable.vue`: computeds de resolución (§3.1) + 3 secciones (§4) + CSS (§6); header doc-comment cite `FE-S4C §…`.
3. Nota documental cruzada en `frontend.03_03` §8.2: *"⚠️ Secciones extendidas en FE-S4C (`frontend.03_05`): Costo de ventas, Resultado (P&G) y Acumulado."*
4. `npm run lint` + `npm run build` desde `crm_frontend/`.
5. QA manual AC-PYG-1…12 (preparar: 1 tasa global, 1 tasa de línea con ventana parcial y un CECO sin tasa; probar claro/oscuro).