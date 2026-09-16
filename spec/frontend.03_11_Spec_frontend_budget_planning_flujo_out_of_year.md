# Spec Frontend: Corrección Vista Flujo — Montos con fecha de pago fuera del año del escenario

| Campo | Valor |
|---|---|
| **ID de feature** | `FE-S8-FLUJO-OY` |
| **Tipo** | Fix de presentación + enmienda al comportamiento FE-S6 §6.2 (toggle OFF) |
| **Base** | `FE-S4B-BUDGET-FLUJO` (`frontend.03_04`) y `FE-S6-CARRYOVER` (`frontend.03_09` §6.2) |
| **Componente** | `crm_frontend/src/components/budget/planning/CashFlowPivotTable.vue` (ÚNICO archivo de código) |
| **Backend** | **Cero cambios** (las fechas son legales: `payment_date` nunca se valida contra el año del escenario — BR-LINE-04 solo aplica a `budget_date`) |
| **Datos NO se corrigen** | `2024-12-31` y `2026-02-01` en el presupuesto 69 son fechas válidas (reglas de recaudo SIIGO); el defecto es exclusivamente de visualización |
| **Reporte original** | `/budget/planning/69` (año 2025): CECO 000101 muestra $ 20.000.000 en **Dic** (es cobro del 31/12/**2024**); CECO 000107 muestra un cobro del 01/02/**2026** en una columna de mes de la matriz 2025 |

---

## 1. Causa raíz (verificada en código y datos)

`CashFlowPivotTable.vue`:

1. `cfMonth(line) = monthIndexOf(line.payment_date || line.budget_date)` devuelve el índice de mes 0–11 **sin validar el año** (`planningFormat.js`, `monthIndexOf`).
2. En `buildPivot` (~línea 193) y `buildPivotFrom` (~línea 530) la condición de celda es:
   ```js
   if (month >= 0 && (bucket === 0 || !showOutOfYear.value)) { /* puebla mes y columnTotals */ }
   ```
   Con el toggle de sesión `showOutOfYear = ref(false)` (default, FD6-1), `!showOutOfYear.value === true`, así que **un monto con fecha efectiva fuera de N se pinta en la columna mensual de su número de mes**, como si fuera del año del escenario. El único indicio es el chip `⊘ k filas...`.

Evidencia DB (dev, presupuesto 69, año 2025): CECO 000101 `budget_date=2025-01-30 / payment_date=2024-12-31 / 20.000.000` → caía en "Dic"; CECO 000107 `budget_date=2025-12-18 / payment_date=2026-02-01 / 30.000.000` → caía en "Feb". Ambas filas `INCOME/FIXED`.

## 2. Regla de negocio corregida (VINCULANTE)

**FR-1 — Celdas mensuales puras.** Las 12 columnas Ene–Dic de TODOS los bloques con fechas de pago (Entradas propias, Salidas fijas propias, Pago a proveedores derivado) representan **exclusivamente meses del año N del escenario**. Un monto con fecha efectiva fuera de N **jamás** puebla una celda mensual ni entra en `columnTotals`, **con el toggle en cualquier estado** (ON u OFF). Esto REVOCA el diseño FE-S6 §6.2 que, con toggle OFF, dejaba el monto dentro de la celda mensual.

**FR-2 — El toggle sobrevive (decisión del stakeholder).** El botón de sesión "Mostrar/Ocultar fuera de año" y las columnas "Antes de {N}" / "Después de {N}" se CONSERVAN exactamente con el mismo default OFF de sesión. Lo único que cambia es lo que hacen: ahora revelan/ocultan montos que NUNCA están en los meses, no los expulsan de ellos. El chip `⊘ {k} filas con montos fuera de año` (toggle OFF) pasa a ser obligatorio visualmente: es la única señal de que falta plata en los meses (ya no está "escondida" en Dic/Ene).

**FR-3 — Reconciliación honesta.** `row.total`, `grandTotal`, `before`/`after`, `beforeTotal`/`afterTotal` y `beforeAfterRowCount` conservan su semántica actual (anual, todo-inclusive). El pie de bloque vigente (`El total anual incluye {k} filas fuera de año` con OFF; `Σ meses + fuera de año = total anual` con ON) sigue siendo verídico sin cambios de texto.

**FR-4 — Resumen de liquidez alineado.**
- `entradas[m]`, `salidas[m]`: solo meses ∈ N (consecuencia automática de FR-1 al consumir `columnTotals`).
- **Con toggle ON y `anyOutOfYear`**, la tabla del resumen gana DOS columnas extra tras "Total" (mismo patrón `cf-col-ooy` de los bloques):
  - Σ Entradas: `entradasPivot.beforeTotal` / `entradasPivot.afterTotal`.
  - Σ Salidas: `fijosPivot.beforeTotal + (costPaymentsPivot?.beforeTotal ?? 0)` / ídem `afterTotal`. (Arrastre y variables son ∈ N por construcción ⇒ aportan 0; no se recorre nada extra.)
  - Flujo neto: entradas − salidas en cada columna extra.
  - Flujo acumulado: `—` en ambas columnas extra (tooltip: la corrida es Ene→Dic de N).
- `entradasTotal`/`salidasTotal` (columna Total) siguen siendo ANUALES (incluyen fuera de año) ⇒ en las columnas extra NO se duplica nada: Σ(12 meses) + Antes + Después = Total, fila por fila.
- `netoTotal` cambia de `Σ neto[0..11]` a **`entradasTotal − salidasTotal`** (neto anual, reconcilia con las filas).
- `acumuladoTotal` sigue siendo `acumulado[11]`; su tooltip se ajusta a la verdad nueva: la corrida cubre solo meses ∈ N, y cuando hay montos fuera de año el valor de diciembre ya NO equivale al flujo neto anual (el Total de "Flujo neto" sí).
- El pie `Σ meses + fuera de año = total anual` del resumen se muestra con `anyOutOfYear && showOutOfYear` (se elimina la condición `!carryActive && !costPaymentsActive`: sigue siendo exacto cuando hay arrastre/costo, porque sus montos están incluidos en entradas/salidas/buckets).

**FR-5 — Nota introductoria.** El texto de `cf-note` inicial (§5.3 de FE-S4B) se amplía con una cláusula: los importes con fecha de pago fuera del año del escenario no aparecen en Ene–Dic; se revelan con "Mostrar fuera de año". Redacción literal en §4.3.

**FR-6 — Sin cambios en:** `buildCarryPivot` (arrastre: el server garantiza fechas ∈ N — BR-CO-03/09), `variablesPivot`/`baseIngresosCausados` (causación `budget_date` ∈ N por BR-LINE-04/BR-ING-06), `ExecutivePivotTable.vue`, `BudgetLineGrid.vue`, `planningFormat.js`, store, servicios, router, backend.

## 3. Cambios de código precisos

| # | Ubicación | Cambio |
|---|---|---|
| C-1 | `buildPivot` (~l.193) y `buildPivotFrom` (~l.530) | Condición de celda → `if (month >= 0 && bucket === 0)`. Borde `bucket === 0` (dentro de N o indeterminable) conserva el comportamiento de `outOfYearBucket`: indeterminable ⇒ vive en el mes (no se puede afirmar que esté fuera). |
| C-2 | `computed` nuevo `ooyColumns` | Expone `{ visible: anyOutOfYear && showOutOfYear, entradas: [before, after], salidas: [before, after], neto: [nBefore, nAfter] }` derivado SOLO de los totales ya calculados de los pivotes (cero re-recorridos de líneas — NFR). |
| C-3 | `resumen` | `netoTotal: entradasTotal − salidasTotal`. |
| C-4 | Template `table` del resumen | `:class="{ 'cf-table-ooy': ooyColumns.visible }"`, `<th class="cf-col-ooy">Antes de {scenarioYear}</th>` / `Después de {scenarioYear}` condicionales, y `<td>` extra por fila según FR-4 (acumulado: literal `—` con `title`). |
| C-5 | Template pies del resumen | `v-if="anyOutOfYear && showOutOfYear"` para la nota de reconciliación (sin el guard `!carryActive && !costPaymentsActive`). |
| C-6 | Nota introductoria (template) | Nuevo literal §4.3. |
| C-7 | Comentarios JSDoc del componente | Corregir el bloque FE-S6 §6.2 del header (ya no "con OFF la matriz es literalmente la de FE-S4B": los fuera-de-año SIEMPRE salen de la celda mensual). |

## 4. Textos literales UI (es-CO)

1. **Nota introductoria (reemplazo completo, FR-5):**
   `Matriz de solo lectura generada desde las líneas del escenario {year}. Los importes se ajustan en “Editor de Celdas”. El mes se asigna por fecha de pago (no por causación), por lo que puede diferir de la “Vista Ejecutiva”. Los montos con fecha de pago fuera del año {year} no aparecen en las columnas Ene–Dic; use “Mostrar fuera de año” para verlos.`
   (Mantener las etiquetas `<strong>` existentes sobre "solo lectura" y "fecha de pago".)
2. **Tooltips de columnas extra del resumen:** `Antes de` → `Montos con fecha de pago anterior al 01/01/{year}. No forman parte de los meses ni del acumulado Ene–Dic.` ; `Después de` → análogo con `posterior al 31/12/{year}`.
3. Chip, botón toggle, pies de bloque: **sin cambios**.

## 5. Requisitos no funcionales

| ID | Requisito |
|---|---|
| NFR-OY-1 | Complejidad: ningún computed nuevo recorre `budget_lines` (todo se deriva de totales ya presentes en los pivotes). Cero HTTP adicional. |
| NFR-OY-2 | Reactividad viva: el arreglo debe recalcularse al editar una celda en el Editor (misma caché reactiva — extiende AC-VF-2/NFR-FV-2). |
| NFR-OY-3 | `npm run lint` sin errores; sin deps nuevas; sin TypeScript; CSS solo reutilizando clases `cf-*` existentes. |
| NFR-OY-4 | Con escenario 100 % dentro de año, el DOM del resumen y de los bloques es idéntico al actual (cero regresión visual en el caso normal; `anyOutOfYear=false` ⇒ ni columnas extra ni chip ni toggle). |

## 6. Criterios de aceptación (QA manual sobre `http://localhost:5173/budget/planning/69`, dev docker)

* **AC-OY-1:** Toggle OFF (default): la fila 000101 muestra `·` en **Dic** y su Total de fila sigue siendo $ 100.000.000 (20+30+30+20); aparece el chip `⊘ 1 filas…` en Entradas con el texto vigente.
* **AC-OY-2:** Toggle ON: aparece `Antes de 2025` = $ 20.000.000 en la fila 000101; ningún mes lo contiene. Σ meses + Antes = Total, exacto.
* **AC-OY-3:** Toggle ON: la fila 000107 muestra su $ 30.000.000 en `Después de 2025` (payment 01/02/2026) y `·` en Feb/Ene; el ingreso de 30M causado dic-18/2025 con cobro 2026 no contamina Ene–Dic.
* **AC-OY-4:** Resumen con toggle ON: columnas extra presentes; en Σ Salidas las extra son `·` (0) porque el escenario solo tiene ingresos; Flujo neto `Antes` = +20.000.000 y Total neto = entradasTotal − salidasTotal; Flujo acumulado `Antes/Después` = `—`.
* **AC-OY-5:** Resumen con toggle OFF: Ene–Dic excluyen los 20M/30M; Total de Σ Entradas los incluye; pie `El total anual incluye…` / nota de reconciliación visible solo según C-5; Dec del acumulado ≠ Total neto CUANDO hay fuera-de-año (esperado, tooltip lo dice).
* **AC-OY-6:** Editar en el Editor el monto 2024-12-31 a otro valor y volver a Flujo **sin recargar**: celdas, chip, columnas extra y resumen reflejan el nuevo valor (reactividad NFR-OY-2).
* **AC-OY-7:** Un escenario sin ninguna fecha fuera de año (p. ej. cualquiera al azar del dashboard): DOM idéntico a hoy (NFR-OY-4) — sin toggle, sin chip, resumen sin columnas extra.
* **AC-OY-8:** Ejecutiva, Arrastre y Gastos variables sin cambio observable; `npm run lint` verde.
* **AC-OY-9:** Bloque "Pago a proveedores (costo de ventas)" (FE-S7) con toggle ON y términos que crucen el borde de año (término sobre dic o ene): la cuota fuera de año vive solo en su columna Antes/Después, nunca en el mes (mismo C-1 vía `buildPivotFrom`).

## 7. Decisiones y trazabilidad

| ID | Decisión | Origen |
|---|---|---|
| D-OY-1 | Meses = solo año N, toggle en cualquier estado | Supuesto 1 + reporte del stakeholder 2026-09-15 |
| D-OY-2 | **Se conserva** el toggle Mostrar/Ocultar fuera de año y sus columnas | Corrección explícita del stakeholder al supuesto 2 |
| D-OY-3 | El chip `⊘` pasa a ser la señal obligatoria con toggle OFF (la plata ya no está en el mes) | Consecuencia de D-OY-1 |
| D-OY-4 | Resumen: columnas extra solo con toggle ON (mismo lenguaje visual que bloques) | Supuesto 3 aprobado |
| D-OY-5 | Datos y validación de ingesta/creación: intocables | Supuesto 5 aprobado |
| D-OY-6 | `bucket === 0` incluye fechas indeterminables (defensa: no se puede afirmar fuera ⇒ se queda en el mes) | Conserva `outOfYearBucket` vigente |

## 8. Riesgos

* **R-OY-1 (asumido):** con toggle OFF el Σ de las 12 columnas ya no cuadra contra el Total de fila sin leer el chip/pie. Mitigación: chip visible (click ⇒ ON) + pie. Es el trade-off que el stakeholder eligió al conservar el toggle.
* **R-OY-2 (bajo):** `netoTotal` cambia de fórmula (`entradasTotal − salidasTotal`); para escenarios sin fuera-de-año el valor es idéntico (conmutativa de sumas). Sin riesgo numérico, pero los QA deben verificar AC-OY-7.

## 9. Checklist de implementación

1. C-1…C-3 en `<script setup>` (computeds/matemática).
2. C-4…C-6 en template.
3. C-7 comentarios; nota documental cruzada: añadir al inicio de `frontend.03_09` §6.2 y de `frontend.03_04` §10 una línea `⚠️ Modificado por FE-S8-FLUJO-OY: los montos fuera de año nunca poblan celdas mensuales; el toggle solo controla las columnas Antes/Después.`
4. `npm run lint` (desde `crm_frontend/`).
5. QA manual AC-OY-1…9 en light/dark.
