# SPEC frontend.03_21 — Gastos variables con base por CECO (pivotes frontend)

> Estado: PROPUESTA
> Fecha: 2026-10-20
> Módulos afectados: `executivePivot.js`, `cashFlowPivot.js`,
> `ExecutivePivotTable.vue` (texto/tooltip), `CecoDetailView.vue` (consistencia),
> `planningExportSheets.js` (heredan el cambio, sin código propio).
> Spec pareja backend: `crm_backend/spec/backend.02_24_Spec_Backend_variable_expense_ceco_scope.md`.
> Specs relacionadas: frontend.03_18 (pivotes), frontend.03_19 (drill-down CECO),
> frontend.03_05 (costos P&L), frontend.03_20 (export).

---

## 1. Contexto y problema

El pivote de "Gastos variables (calculados)" de la Vista Ejecutiva replica
client-side la regla del backend (`budgetEngine.project_cash_flow`, Opción A,
ver header de `buildVariableExpensePivot` en `executivePivot.js` línea ~152):

```javascript
const amount = rate * incomeTotals[month]   // ← incomeTotals = Σ ingresos de TODOS los CECOs
```

La base del cálculo es el **total global de ingresos del mes** (`columnTotals`
del bloque Ingresos), no el ingreso del CECO de cada línea. Resultado: todos
los CECOs con la misma tasa muestran el mismo monto (p. ej. comisiones y
despachos de Enero idénticos en todos los CECOs), aunque el usuario haya
definido tasas por CECO (zona+línea) en el planning.

La regla de negocio es que el % se causa sobre la facturación (o recaudo) de
la zona+línea que sirve ese CECO. Corrección backend: spec pareja 02_24. Esta
spec alinea el espejo client-side.

## 2. Historia de usuario

Igual que backend.02_24 §2. En el frontend, el usuario espera ver en la Vista
Ejecutiva, por CECO y por mes, `tasa × ingreso del propio CECO`, y en Cash
Flow `tasa × recaudo esperado del propio CECO`.

## 3. Alcance

### 3.1 In-scope
1. `executivePivot.js` — `buildVariableExpensePivot`: base por CECO en vez de
   global.
2. `cashFlowPivot.js` — réplica B1/B2 (línea ~657): misma corrección y la base
   B2 (recaudo esperado) por CECO, no global.
3. `CecoDetailView.vue` — la línea variable que reconcilia con la Ejecutiva
   (RF-11.1/AC-16) usa el monto nuevo (debe caer gratis si consume el pivote
   corregido; verificar y documentar).
4. Tooltips/labels: la celda debe seguir mostrando la(s) tasa(s); el diseño
   (colores, orden, títulos) no cambia.

### 3.2 Out-of-scope
1. Cambios de Spring/store: los `variableSourceLines` ya traen
   `id_cost_center` de cada línea — no se pide nada nuevo al backend.
2. Catálogo de tasas (`RatesDataTable`, `RateEditorModal`, `LineFormModal`):
   sin cambios (supuesto 3 de 02_24).
3. P&L del backend (BR-16) y el bloque de costo de ventas (D-2/D-3 pool por
   línea, sin CECO): sin cambios.

## 4. Fórmula nueva (client-side, espejo de 02_24 §5.2)

Para el mes `m` del CECO `c`:

```
variable_sales:      amount_cm += Σ_v∈variable_sales,   v.ceco=c, m=v.date ⇒ rate_v × I_c(m)
variable_receivables: amount_cm += Σ_v∈variable_receivables           rate_v × R_c(m)
```

* Base Ejecutiva (I_c(m)): Σ `projected_amount` de las líneas `income`
  client-touch: pivote de Ingresos de la Ejecutiva es por CECO; la fila
  correspondiente al CECO `c` del bloque Ingresos ya expone `months[m]`
  (verificar tipo: la fila de ingreso `id` ES el `id_cost_center` — ver
  `buildPivot` de `executivePivot.js`). `I_c(m)` SIEMPRE neto, sin IVA.
* Base Cash Flow (R_c(m)): el pivote de Cash Flow compone recaudo esperado
  (AR vencido + ingreso presupuestado) del mes global — versión por CECO.

## 5. Puntos de cambio exactos (frontend)

### 5.1 `executivePivot.js`
1. `buildVariableExpensePivot(variableExpenseLines, incomeColumnTotals, costCenterLabel)`
   ⇒ nuevo signature:
   `buildVariableExpensePivot(variableExpenseLines, incomeRows, costCenterLabel)`,
   donde `incomeRows` es el array de filas del pivote de Ingresos
   (`{ id: cecoId, months: number[12] }`), del cual se deduce
   `Map<cecoId, number[12]>`.
2. Dentro del loop: `const baseC = incomeCeco.get(line.id_cost_center)`;
   `amount = rate * (baseC ? baseC[month] : 0)`.
3. `columnTotals[month]` de salida = Σ de los CECOs (BR-VE-04 backend).
4. El usuario de `buildVariableExpensePivot` (composable, línea ~341) cambia a
   pasar `incomePivot.value.rows` en vez de `incomePivot.value.columnTotals`.
5. Se conserva el guard `!source.length || !incomeRows.some(...)` adaptado:
   RFC: si no hay ingresos ni agregados, `null` (mismos empty states).

### 5.2 `cashFlowPivot.js`
1. Localizar la clave `variableSourceLines` (~línea 657) y su réplica de
   B1/B2; convertir la base a dict por CECO:
   * B1c: base = `income_client_ceco[c][m]` (compatible con lo ya calculado
     como `ingresos por CECO`).
   * B2c: base = `I_c(m) + AR_c(m)` — necesita AR por CECO en el pivote; si
     el pivote de flujo hoy compone la base global sin CECO, agregar el
     `id_cost_center` de las filas AR en la composición (la data ya está en
     front; verificar en el store `budget`).
2. Los totales por CECO y por mes doivent reproducir EXACTAMENTE lo que el
   backend devolve (`project_cash_flow`) — AC-FE21-3.

### 5.3 `CecoDetailView.vue`
1. Verificar que la línea variable del detalle CECO lee del pivote corregido
   (si el detalle usa su propia búsqueda base-global, unificarla con
   `buildVariableExpensePivot` o con la ruta por CECO). AC-FE21-4.

### 5.4 `PlanningDashboard` / exportes
1. `planningExportSheets.js` (~línea 246) consume `model.variablePivot` —
   hereda el cambio sin modificación de código; verificar que la hoja
   exportada muestra los montos por CECO nuevos.
2. Cualquier snapshot/tabla de "Tasas variables (solo lectura)" NO cambia
   (muestra tasas, no montos).

## 6. Reglas (BR-FE21-*)
* **BR-FE21-01** — La filosofía del pivote no cambia: sigue siendo cálculo
  ESTIMADO client-side espejo del backend (Opción A).
* **BR-FE21-02** — CECO sin ingreso en el mes ⇒ celda 0 (sin exclusión anual,
  sin NaN). D-FE14-7 se mantiene (base neta).
* **BR-FE21-03** — El tooltip de la celda sigue mostrando la(s) tasa(s)
  aplicables; opcionalmente puede agregarse la base usada (no requerido).
* **BR-FE21-04** — Cash Flow y Ejecutiva deben cuadrar entre sí por CECO+mes
  (luego de corrección B2c).
* **BR-FE21-05** — Exportes (Excel/pantalla) reproducen los mismos montos.

## 7. No funcionales
* NFR-1 — Sin cambios de API ni de store signature (solo internals de pivote).
* NFR-2 — Complejidad igual (Map lookup O(1) por línea).
* NFR-3 — Lint/format: mantener Prettier del proyecto.

## 8. Criterios de aceptación (frontend)

| ID | Criterio |
|---|---|
| AC-FE21-1 | Escenario 573: en la Vista Ejecutiva, la comisión de Enero de cada CECO difiere y es = tasa × facturación del MES de ESE CECO ( spotting directo del bug original). |
| AC-FE21-2 | Ídem despachos (y cualquier otro concepto variable). |
| AC-FE21-3 | El pivote de Cash Flow de la pestaña Flujo muestra por CECO+mes los mismos montos que el backend `project_cash_flow` (dentro de redondeo 0,01). |
| AC-FE21-4 | `CecoDetailView`, filtrado por CECO, muestra un monto variable mensual que cuadra 1:1 con la fila del pivote renovado (AC-16 / RF-11.1 prevalecen). |
| AC-FE21-5 | CECO con 0 ingreso en el mes ⇒ celda 0, tabla visible, sin NaN. |
| AC-FE21-6 | Exportación "Gastos variables (calculados)" refleja los montos por CECO nuevos. |
| AC-FE21-7 | npm run lint / format sin errores nuevos. |

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| El pivote de Ingresos solo incluye CECOs con ingreso; un CECO con gasto variable y sin ingreso no tendría fila. | Guard explícito: base ausente ⇒ 0 (no NaN, no crash, no fila). |
| Cash flow requiere AR por CECO que hoy se agrega global. | Verificar/componer por `id_cost_center` en la composición; es el mismo patrón del backend (02_24 §6.1.2). |
| Divergencia Ejecutiva vs backend si un CECO tiene ingreso NULL vs 0. | Tratamiento único por regla (BR-FE21-02 / BR-VE-02). |

---

## 10. Enmienda A-01 — resolución por (zona, línea)

> Fecha: 2026-10-20. Origen: hallazgo real en datos del escenario (acuerdo
> del usuario); enmienda del §4/§5.1/§5.2 tal como quedaron escritos.

### 10.1 Hallazgo

Los CECOs de ingreso ("Facturación…", códigos `000xxx`, ids 151–181) están
**desacoplados** de los CECOs de gasto variable ("Comisiones…" `210xxx`,
"Despacho…" `320xxx`). La implementación de REVISIÓN 5 buscaba la base con el
`id_cost_center` de la línea variable contra las filas de ingreso; como los
CECOs de gasto NO tienen filas de ingreso, la base salía ausente en todos los
meses ⇒ **TODOS los montos del pivote variable en 0**.

### 10.2 Decisión (A-01)

La base se resuelve por **(id_zone, id_line)** del CECO de la línea variable
contra los CECOs que tienen facturación (o recaudo):

1. **Propio CECO primero** (compatibilidad): si el CECO de la línea variable
   figura él mismo entre los CECOs con ingreso ⇒ base = su serie propia.
2. Si no: se toma la clave `(id_zone, id_line)` del catálogo
   (`store.costCenters`, schema `CostCenter`: `id_cost_center`, `id_zone`,
   `id_line`) del CECO de la línea y se buscan los CECOs candidatos con la
   MISMA (zona, línea) que TENGAN ingreso.
3. **Exactamente 1 candidato** ⇒ ese CECO generador aporta su serie
   `months[12]`. **0 o múltiples** ⇒ `null` ⇒ base 0.

**Sin fallback**: una zona+línea sin facturación ⇒ montos en 0 — jamás se usa
el total global del mes ni otra zona/línea.

### 10.3 Implementación (`fixedIncomeCausationByVariableCeco(lines, costCenters)`)

Helper ÚNICO en `planningFormat.js` (resolución a (zona, línea) vía
`resolveVariableBaseCeco`, 1 resolución por CECO — Map de caché dentro del
builder, no por render): devuelve `Map<cecoVariableLine, months[12]>` con la
serie del generador copiada. Consumidores:

- `executivePivot.buildVariableExpensePivot(variableExpenseLines, incomeRows,
  costCenterLabel, costCenters)` — 4º parámetro nuevo (catálogo del store);
  resolución por línea con caché por CECO.
- `cashFlowPivot.js` — nuevo computed `baseVariablePorCeco`
  (`fixedIncomeCausationByVariableCeco`) alimenta `variablesPivot`;
  `baseIngresosCausadosPorCeco` (keyed por CECO GENERADOR) se conserva como
  referencia/compatibilidad.
- `CecoDetailView.vue` — `fixedIncomeByMonth` resuelve primero por el Map de
  gasto variable (CECO de gasto ⇒ serie del generador) con fallback a la
  serie propia por CECO (CECOs de ingreso/resto, cuadre 1:1 AC-FE21-4).

Sin cambios en `planningExportSheets.js` (heredan el pivote corregido),
`RatesDataTable` ni `LineFormModal`.

### 10.4 Gaps y reglas

- **AR / recaudo**: la resolución A-01 aplica a la componente **I** (ingreso
  presupuestado, B1c), la única que existe en el frontend de planning de
  planeación HOY. La componente AR (`R_c(m) = I_c(m) + AR_c(m)` del backend,
  B2c) sigue sin componerse por CECO — gap pendiente de data, documentado igual que en §5.2.
  Cuando llegue, usará el MISMO CECO generador resuelto por (zona, línea).
- **AC-FE21-8** — el match por (zona, línea) es CORRECTO: exactamente un CECO
  de facturación por (id_zone, id_line); ambigüedad ⇒ 0 (fail-closed).
- **AC-FE21-9** — zona+línea sin facturación ⇒ 0 SIN fallback (ni global, ni
  otros CECOs, ni log silencioso de montos).
- CECO sin catálogo (`id_zone`/`id_line` ausentes o catálogo caído) ⇒ `null`
  ⇒ 0 (degradación honesta, mismo espíritu BR-FE21-02).
- Fechas/meses: la posición temporal NO cambia (`monthIndexOf(budget_date)`).

---

## 11. Enmienda A-02 — base de recaudo = ENTRADAS del flujo

> Fecha: 2026-10-21. Decisión del usuario: «Como es un presupuesto, el
> recaudo debe estar basado en las ENTRADAS que están en el flujo, que sí
> tienen CECO.» Enmienda del §4/§5.1/§5.2 y de la nota compartida
> (VARIABLE_PIVOT_NOTE).

### 11.1 Problema

La base del pivote para `variable_receivables` era idéntica a la de
`variable_sales` (Σ ingresos fijos por `budget_date` del CECO resuelto A-01).
En datos reales (573) esa serie degenera sin AR: el recaudo presupuestado
real vive en el bloque **Entradas** de la Vista Flujo (Σ cobros por su mes de
pago), que SÍ tiene CECO — el pivote de recaudo ignoraba esa fuente.

### 11.2 Decisión (A-02)

La base de `variable_receivables` pasa a ser la serie de **ENTRADAS del
Flujo** del CECO GENERADOR resuelto (A-01: propio CECO primero, luego única
resolución por (id_zone, id_line), SIN fallback):

```
variable_receivables: amount_cm += rate_v × R_b(m)
  R_b(m) = Σ projected_amount de líneas income + fixed con
           cfMonth(l) = m,   cfMonth(l) = payment_date ?? budget_date,
           del CECO generador b resuelto por (zona, línea)
```

### 11.3 Lectura NETA (D-FE14-7)

La base NUNCA lleva el gross-up ×1.19 del modo IVA. El modo ON de las líneas
INCOME (D-S10-5) afecta SOLO a la presentación del bloque "Entradas" del
Flujo (buildFlowPivot con amountOf: grossLineAmount); la base de comisiones
es la serie NETA (`projected_amount` crudo). Por eso entradasCausacionByCeco
es una variante EXPLÍCITA y NETA — no se reutiliza el pivote presentado.

### 11.4 Contraste facturado vs recaudo (mismo bloque)

En las tres superficies (Ejecutiva, Flujo, drill-down) un mismo bloque de
"Gastos variables (calculados)" mezcla líneas con bases distintas:

| Comportamiento | Base | Mes de la base | Serie fuente (FE) |
|---|---|---|---|
| `variable_sales` | I (facturación) | causación (`budget_date`) | `fixedIncomeCausationByCeco` |
| `variable_receivables` | R (cobro) | pago (`cfMonth`) | `entradasCausacionByCeco` |

La **causación del monto** en la celda sigue siendo el MES de budget_date
de la LÍNEA variable en ambas vistas (la celda del mes m muestra la comisión
del mes m); lo que cambia es QUÉ base se multiplica: para recaudo,
base(m) = cobros cuyo **mes de cobro = m** (no la facturación de m).

### 11.5 Implementación

- `planningFormat.js`:
  - `cfMonthOf(line)` — única definición del mes de cobro (mismo `cfMonth`
    del Flujo).
  - `entradasCausacionByCeco(lines)` → `Map<cecoId, months[12]>`: Σ NETO de
    ingresos fijos por MES DE PAGO.
  - `entradasCausacionByVariableCeco(lines, costCenters)` →
    `Map<cecoVariable, months[12]>`: resolución A-01 sobre la serie de cobro.
  - `VARIABLE_PIVOT_NOTE` actualizada (facturado ⇒ I por budget_date;
    recaudo ⇒ entradas por cfMonth del CECO resuelto).
- `executivePivot.js`: `buildVariableExpensePivot(..., costCenters, entradasRows)`
  — 5º parámetro (filas `{ id, months[12] }` de la base de cobro). El
  composable pasa `entradasRows` computada LOCAL con
  `entradasCausacionByCeco(lines.value)` (menos invasiva que consumir el
  factory del Flujo: la Ejecutiva no tiene ese shape de pivote y la base NETA
  no puede salir del pivote presentado con gross-up — misma definición de
  serie vía el helper compartido, RF-7.4).
- `cashFlowPivot.js`: `buildVariableFlowPivot(source, baseByCecoSales,
  baseByCecoRecaudo, costCenterLabel, ivaActive)` — nuevo computed
  `baseVariableRecaudoPorCeco` alimentado por
  `entradasCausacionByVariableCeco(lines, store.costCenters)`;
  `baseVariablePorCeco` queda para `variable_sales`.
- `CecoDetailView.vue` + `cecoMovements.js`: `fixedIncomeByMonth` ahora es el
  PAR `{ sales, receivables }` (ambas series resueltas para el CECO del
  detalle); `movementAmountReconciled` elige la serie por `behavior_type`
  (backward-compatible: una serie plana legada actúa como base de todos los
  comportamientos). `planningExportSheets.js` NO cambia: recibe el par vía el
  mismo parámetro y hereda la selección.
- NO cambian catálogos (`LineFormModal`, `RatesDataTable`).

### 11.6 Criterios de aceptación

| ID | Criterio |
|---|---|
| AC-FE21-10 | Recaudo de CECO resuelto: la base de comisiones `variable_receivables` del mes m son los COBROS con cfMonth = m (no la facturación de m). Ejemplo: facturación de dic con cobro en ene ⇒ la comisión de DIC usa el recaudo de DIC; la facturación desplazada NO entra a la base. Espejo: cobros de ene alimentan las comisiones de ene aunque provengan de facturación de dic (payments desplazados vs facturados). |
| AC-FE21-11 | CECO generador resuelto sin cobros (o zona+línea sin resolución) ⇒ base 0 en todos los meses ⇒ montos 0, SIN fallback a facturación ni al total global. |
| AC-FE21-10b | Cuadre 1:1 mantenido: Ejecutiva = Flujo = drill-down para cada línea variable, con su base por comportamiento. |

### 11.7 Reglas añadidas

- **BR-FE21-06** — la base de recaudo es neta SIEMPRE (`projected_amount`
  crudo); ningún multiplicador 1.19 entra a la base, sea cual sea el modo IVA.
- **BR-FE21-07** — solo las líneas `income` + `fixed` del escenario componen
  las ENTRADAS de base (los inflows de financiación/desembolsos NO son
  recaudo del CECO).
- **BR-FE21-08** — el AR vencido por CECO sigue sin componerse (gap de data,
  §10.4): la base R de A-02 es la componente de COBRO presupuestada del
  flujo; cuando llegue data de AR usará el mismo generador resuelto A-01.

## 12. ENMIENDA A-03 — buckets fuera de año (Antes/Después) del bloque variable en el Flujo

**Fecha:** 2026-10-21 · **Estado:** implementado · **Base:** reporte del
usuario (Vista Flujo, bloque "Salidas — Gastos variables (calculados)").

### 12.1 Problema

- `buildVariableFlowPivot` (cashFlowPivot.js) hardcodeaba
  `beforeTotal: 0, afterTotal: 0, beforeAfterRowCount: 0, undatedTotal: 0` y
  descartaba en silencio (`if (month < 0) continue` + ausencia de lógica de
  bucket) las líneas variables cuyo `budget_date` cae fuera del año N del
  escenario. El resto de las tablas del Flujo (`buildFlowPivot`,
  `buildDerivedPivot`, liquidación de IVA, impuestos) sí llenan
  `row.before`/`row.after` y los sumatorios (FE-S8 / spec frontend.03_11).
- El resumen ooy del factory (`buildOoyBucketSeries`) no incluía el pivote de
  variables ⇒ aunque las variables tuvieran before/after, los sumatorios
  Antes/Después del resumen no los verían si SOLO las variables tenían
  montos fuera de año.

### 12.2 Convención de referencia (implícito ya existente)

La EXTENSIÓN Antes/Después es 100% de presentación del frontend: el backend
(`project_cash_flow`, 12 meses) nunca produjo movimientos fuera de año para
ningún bloque. Por tanto NO es requisito cuadrar before/after con el backend;
SÍ es requisito cuadrarlos con la MISMA fórmula derivada del bloque
(tasa × base — D-FE14, A-02: base NETA por comportamiento).

### 12.3 Implementación

- `planningFormat.js` — helpers NUEVOS (los existentes de 12 meses quedan
  intactos; Ejecutiva y drill-down dependen de su shape):
  - `monthBucketIndexOf(dateISO, scenarioYear)`: bucket de una fecha — `-1`
    antes del año N, `0..11` mes del año, `12` después, `-99` fecha
    ilegible ⇒ el llamador degrada. Réplica EXACTA de la regla de año de
    `outOfYearBucketOf` (comparación del año por regex del string ISO, nunca
    `Date` para el bucket) + AK de `monthIndexOf` para el mes. Con
    `scenarioYear` no entero: bucket = índice de mes cuando es legible
    (misma degradación del resto de los pivotes). NO se importa desde
    `cashFlowPivot.js` (ese módulo importa planningFormat — ciclo prohibido).
  - `fixedIncomeBucketByCeco(lines, scenarioYear)`:
    `Map<cecoId, { before: number, months: number[12], after: number }>` —
    Σ ingresos fijos por MES DE CAUSACIÓN (`budget_date`) con bucket
    extendido (un cobro/facturación de 2025 ⇒ `before`; 2027 ⇒ `after`).
  - `entradasBucketByCeco(lines, scenarioYear)`: variante por MES DE COBRO
    (`cfMonthOf`) SIN filtro de año (el bucket ES el filtro aquí: cobros de
    dic-2026 vencidos en ene-2027 ⇒ `after`).
  - `fixedIncomeBucketByVariableCeco(lines, costCenters, scenarioYear)` y
    `entradasBucketByVariableCeco(lines, costCenters, scenarioYear)` — MISMA
    resolución A-01 (propio CECO primero, única (zona, línea), sin fallback)
    sobre las series de buckets; bucket-maps copiados del generador.
- `cashFlowPivot.js`:
  - `buildVariableFlowPivot(source, baseByCecoSales, baseByCecoRecaudo,
    costCenterLabel, ivaActive, scenarioYear)` — 6º parámetro NUEVO y los
    DOS maps de base cambian de `number[12]` a BUCKETS
    `{ before, months[12], after }` (los llamadores: el factory interno y los
    tests; firma interna, puede romper callers que pasaban series planas).
    Bucket del monto = `monthBucketIndexOf(line.budget_date, scenarioYear)`;
    base del bucket: `months[bucket]` / `before` / `after` del generador;
    sin base ⇒ 0 (BR-FE21-02). Monto = tasa × base, gross-up del DERIVADO
    según flag efectivo (D-FE14). `-99` ⇒ no posiciona (contribute 0, misma
    política del `month < 0` original). `undatedTotal` queda 0 por
    construcción (el monto es derivado: sin periodo legible no hay base y el
    aporte es 0) — la clave se mantiene por shape homogéneo.
  - Retorno homogéneo con `buildFlowPivot`: `beforeTotal/afterTotal/
    beforeAfterRowCount` REALES; la serie `months[12]`/`columnTotals` sigue
    conteniendo SOLO el año N ⇒ el P&G de la Ejecutiva y el resumen de
    liquidez no cambian (los buckets NO entran al P&L).
  - `buildOoyBucketSeries({ ..., variables })` — parámetro NUEVO: suma
    `variables.beforeTotal/afterTotal` a Σ Salidas y
    `variables.beforeAfterRowCount` a la bandera `any`. Los llamadores
    (`CashFlowPivotTable.vue` y `planningExportSheets.js`) pasan
    `variablesPivot.value`.
  - Factory: computeds NUEVOS `baseVariableBucketPorCeco` /
    `baseVariableRecaudoBucketPorCeco` (bucket-maps) alimentan el pivote de
    flujo con `scenarioYear.value`; los maps de 12 meses (A-01/A-02) se
    CONSERVAN exportados por compatibilidad/referencia (Ejecutiva y
    drill-down no dependen de ellos pero su shape se usa como referencia).
- `CashFlowPivotTable.vue` — el bloque variables pasa de `ooy: false` a
  `ooy: true` (el pivote ya es shape-completo; sin cambios de template: las
  columnas Antes/Después de bloques usan el mismo camino genérico).
- `planningExportSheets.js` — espejo de la bandera: bloque variables
  `ooy: true`; `buildOoyBucketSeries` con `variables:`. La hoja del pivote
  de flujo ya hereda Antes/Después vía `matrixSheet(ooy)`.

### 12.4 Criterios de aceptación

| ID | Criterio |
|---|---|
| AC-FE21-12 | Línea variable con `budget_date` en dic-(N−1) ⇒ comisión en bucket Antes con la base `before` del generador; jamás en Ene-N. Con `budget_date` en ene-(N+1) ⇒ bucket Después. |
| AC-FE21-13 | Recaudo: la base `before`/`after` sale de `entradasBucketByCeco` SIN filtro de año (el bucket es el filtro); NETA sin gross-up. |
| AC-FE21-14 | SOLO variables fuera de año ⇒ columnas Antes/Después del Flujo visibles (`any` de `buildOoyBucketSeries` > 0 vía el aporte de variables) y toggle funciona. |
| AC-FE21-15 | P&G de la Ejecutiva y resumen de liquidez 12-meses byte-iguales (las series mensuales no incluyen buckets — contra-regla). |
| AC-FE21-16 | Exportación (hoja del Flujo) del bloque variables hereda Antes/Después vía `matrixSheet` (`ooy: true`). |

### 12.5 Reglas añadidas

- **BR-FE21-09** — el monto posicionado en Antes/Después usa la MISMA fórmula
  derivada del bloque; no hay fuentes nuevas de monto (tasa × base del
  bucket del generador resuelto).
- **BR-FE21-10** — los buckets fuera de año NUNCA entran a series mensuales
  del P&G/resumen (contra-regla, AC-FE21-15).
- **BR-FE21-11** — sin cambios en backend, Ejecutiva, drill-down y helpers de
  12 meses (scope de la enmienda: pivote de flujo de variables + agregación
  ooy + banderas de render/export).

---

## 13. ENMIENDA A-04 — el Flujo posiciona la comisión de recaudo CUANDO SE COBRA (buckets Antes/Meses/Después)

**Fecha:** 2026-10-21 · **Estado:** implementado · **Base:** reporte del
usuario (Vista Flujo `/budget/planning/573`: el bloque "Salidas — Gastos
variables (calculados)" seguía mostrando Antes/Después en 0) · **Decisión
del usuario (textual):** «La comisión de los cobros desplazados» — el bloque
variable del Flujo replica la distribución temporal del RECAUDO: para las
líneas `variable_receivables` la comisión se posiciona en la columna/bucket
donde entra el COBRO que la genera (Mes del año, Antes, Después), NO en el
mes de `budget_date` de la línea.

### 13.1 Problema

Tras A-03, TODAS las líneas variables del 573 tienen `budget_date` dentro de
2026 ⇒ el rellenado por `monthBucketIndexOf(line.budget_date, N)` caía
siempre en `months[0..11]` ⇒ Antes/Después en 0. Causa real: el RECAUDO que
genera la comisión cruza el año — hay cobros de 2025 ("antes") y
facturación de nov/dic-2026 cobrada en 2027 ("después"); el bloque Entradas
y el resto de tablas sí muestran esos importes desplazados.

### 13.2 Fórmula EXACTA (A-04, determinista)

Para cada LÍNEA VARIABLE `v` (gasto, ceco_v, behavior, rate_v, budget_date
mes `m`):

* **`variable_sales` (facturado)** — SIN CAMBIO respecto a A-02③:
  `amount_m = rate_v × I_resolved(m)` posicionado en el bucket de
  `monthBucketIndexOf(v.budget_date, N)` (A-03).
* **`variable_receivables` (recaudo)** — NUEVA distribución por COBRO:
  1. El concepto `v` fija la TASA de las ventas FACTURADAS en el mes `m`
     (mes de `v.budget_date`) del CECO RESUELTO (A-01).
  2. Para cada LÍNEA DE INGRESO `k` del CECO resuelto cuya FACTURACIÓN cae
     en el mes `m` y con `cfMonthOf(k)` en bucket `b` (`-1` antes, `0..11`,
     `12` después): v aporta `rate_v × projected_amount(k)` al bucket `b`
     del CECO de la LÍNEA `v`.
  3. Cobros del generador cuyo mes de FACTURACIÓN no tiene línea concepto
     (sin rate para ese `m`) ⇒ NO generan comisión ese mes (rate ausente ⇒
     0) — sin fallback.
  4. La comisión de bucket de A-03 (`rate_v × R(antes/after)`) se
     REEMPLAZA: antes/after pasan a la suma de las contribuciones (2)
     dirigidas al bucket — la comisión anticipada/pospuesta de verdad,
     trazable a los bills que la generan. Los 12 meses TAMBIÉN cambian de
     composición: mes `b` del año = Σ contribuciones (2) con bucket `b`.

Presentación: `grossDerived` (D-FE14) y NETA de base (`projected_amount`
crudo, D-FE14-7) con `lineChargesIva` — idénticos a la maquinaria actual.

**Alineación del año de facturación:** month match por MES (1–12), sin
filtro de año de facturación. Las facturaciones de dic-2026 cobradas en
2027 usan el rate de la línea dic-2026 ⇒ caen al AFTER. Los cobros Antes/
Después reales del 573 — κ Σ por (ceco, mes):
`ANTES={(151,12):1.689.160, (158,12):884.580, (165,12):467.880,
(172,12):3.706.220, (179,12):1.250.080}`;
`DESPUÉS={(151,1):32.792.290, (151,3):5.320.540, (152,1):17.483.830,
(158,1):17.172.500, (158,3):2.786.240, (159,1):9.155.860,
(165,1):9.083.110, (165,3):1.473.740, (166,1):4.842.880,
(172,1):71.950.520, (172,3):11.673.960, (173,1):38.361.750,
(179,1):24.268.180, (179,3):3.937.520, (180,1):12.939.010}` — son la
source-of-truth de los tests (suite `cecoVariableA04CollectionDistribution`).
Ejemplos verificados: CECO 151 (000101, z1 Kyly) 1.689.160 cobrado dic-2025
⇒ comisión 8% = **135.132,80** en Antes; CECO 151 ene-2027 = 32.792.290 ⇒
**2.623.383,20** en Después; CECO 172 ene-2027 = 71.950.520 ⇒ rates Kyly Z4.
Facturaciones del año N−1: si hubiera bills 2025, el rate de dic-2025 no
existe en la línea concepto ⇒ 0 — documentado (deuda, sin fallback).

### 13.3 Implementación

1. **`planningFormat.js`** — builder puro NUEVO
   `variableCollectionDistribution(varReceivablesLines, incomeLines,
   costCenters, scenarioYear)` → `Map<id_budget_line, buckets>` con
   `buckets = { before: n, months: number[12], after: n, unplaced: n }`:
   una pasada indexa los importes NETOS de la facturación por
   `(ceco, mes de facturación)` con su bucket DE COBRO
   (`monthBucketIndexOf(payment_date ?? budget_date, N)` — sin filtro de
   año, el bucket filtra como `entradasBucketByCeco`), y por cada línea
   `variable_receivables` (orden determinista por `id_budget_line`) resuelve
   el generador A-01, matchea el mes de su `budget_date` y acumula
   `rate_v × importes`. Cobro ILEGIBLE (bucket −99) ⇒ contribución OMITIDA
   de las celdas y contada en `unplaced` — 4º campo INVISIBLE en la hoja
   (telemetría). Concepto sin mes legible o sin rate ⇒ sin entrada.
   Exporta `VARIABLE_COLLECTION_DISTRIBUTION_NOTE` (texto A-04 para la UI/
   tooltips; sin consumo obligatorio en plantillas).
2. **`cashFlowPivot.js`** —
   * `buildVariableFlowPivot(..., scenarioYear, collectionDistribution)` —
     7º parámetro OPCIONAL: las líneas `variable_receivables` consumen su
     entrada del map (key = `id_budget_line`); sin entrada en el map ⇒
     aporte 0 (sin fallback); parámetro OMITIDO (callers legacy/tests
     previos) ⇒ se conserva el path line-based A-03 con
     `baseByCecoRecaudo`. Gross-up ×1.19 del DERIVADO por línea (D-FE14).
     Guard `anyDistribution` auxiliar; se conservan `before/after/months/
     total`, `beforeAfterRowCount`, `undatedTotal` (0 por construcción) y la
     misma degradación con shapes.
   * Factory: computeds NUEVOS `variableReceivablesLines` +
     `variableCollectionDistributionByLine` alimentan `variablesPivot` (7º
     parámetro con `store.costCenters` + `scenarioYear.value`); el map se
     expone en el retorno del modelo. Los maps de base bucket
     (`baseVariableBucketPorCeco` / `baseVariableRecaudoBucketPorCeco`) se
     CONSERVAN (path legacy `variable_sales` y compatibilidad).
3. **Ejecutiva / drill-down — SIN cambios (por diseño):**
   `executivePivot.js` y `CecoDetailView.vue`/`cecoMovements.js` permanecen
   EXACTOS (A-02). Divergencia DOCUMENTADA POR DISEÑO:
   * Ejecutiva = **devengo** (comisión del mes `m` ubicada en `m` sobre el
     recaudo del mes `m` — AC-FE21-10).
   * Flujo = **caja** (la comisión cae cuando entra el cobro; los importes
     de 2027 aparecen en Después).
   ⇒ El cuadre 1:1 (AC-FE21-10b, BR-FE21-04/AC-FE21-11b) DEJA de ser
   requisito para el bloque variable del FLUJO (el resto del cuadre
   Ejecutiva vs salaries/drill-down se mantiene). Los "Gastos variables"
   del drill-down siguen devengo: sus montos difieren del Flujo por diseño.
4. **Exports (`planningExportSheets.js`)** — la hoja del pivote de flujo y
   el resumen de liquidez heredan el shape por la factory (sin cambios de
   código): el pivote que reciben trae los before/after reales.
5. **NO tocar:** backend (cero cambios), catálogos (`LineFormModal`,
   `RatesDataTable`), mezclas usadas por la Ejecutiva/Témas
   (`fixedIncomeCausation*`, `entradasCausacionBy*` — shapes intactos).

### 13.4 Criterios de aceptación

| ID | Criterio |
|---|---|
| AC-FE21-17 | Bill facturado dic-N cobrado en (N+1) ⇒ comisión en AFTER col la de la tasa dic-N; jamás en dic-N ni en Ene-N. Espejo 573: 32.792.290 × 8% = 2.623.383,20 en Después. |
| AC-FE21-18 | Cobro Antes (bill facturado en el año con cobro < N) ⇒ before. Espejo 573: 1.689.160 × 8% = 135.132,80 en Antes. |
| AC-FE21-19 | Caso regular (facturado y cobrado en su mes) ⇒ meses iguales que A-02 (no rompe). |
| AC-FE21-20 | Mes de facturación sin línea concepto ⇒ 0 en todos los buckets (sin fallback), incluso si hay línea concepto en OTRO mes. |
| AC-FE21-21 | Cobro ilegible ⇒ contribución en `unplaced` únicamente; nunca en celdas ni totales. |
| AC-FE21-22 | Ejecutiva/drill-down byte-invariantes (devengo A-02); la divergencia Ejecutiva vs Flujo del bloque variable es intencional y documentada. |
| AC-FE21-23 | P&G de la Ejecutiva y resumen de liquidez 12-meses sin cambios (los buckets siguen sin entrar a series mensuales — BR-FE21-10). |
| AC-FE21-24 | `npm run lint` / `npx vitest run` limpios (72 tests: 60 baseline + 12 de la suite A-04). |

### 13.5 Reglas añadidas

* **BR-FE21-12** — el Flujo posiciona la comisión de `variable_receivables`
  en el bucket DEL COBRO (caja); la tasa es la de la línea concepto del MES
  DE FACTURACIÓN del cobro; base NETA (`projected_amount` crudo, D-FE14-7).
* **BR-FE21-13** — sin fallback jamás: sin línea concepto para el mes de
  facturación ⇒ 0; sin generador resuelto ⇒ 0; sin entrada del map ⇒ 0.
* **BR-FE21-14** — `unplaced` es telemetría invisible: suma contribuciones
  omitidas (cobro ilegible) y nunca entra a celdas, totales ni guard del
  pivote.
* **BR-FE21-15** — la divergencia devengo (Ejecutiva) vs caja (Flujo) del
  bloque variable es DE DISEÑO; el requisito de cuadre 1:1 queda derogado
  SOLO para ese bloque en la Vista Flujo (AC-FE21-10b se acota).

## 14. ENMIENDA A-05 â€” Total del aÃ±o en el Flujo: 'Total' = solo los 12 meses; nueva columna 'Total General' despuÃ©s de 'DespuÃ©s de {N}' = 12 meses + Antes + DespuÃ©s

Fecha: 2026-10-21. Alcance: SOLO Vista Flujo y sus hojas exportables; backend y Vista Ejecutiva sin cambios.

### 14.1 DecisiÃ³n del usuario

En la Vista Flujo (`/budget/planning/:id`) la columna **Total** mostraba `Î£ meses + Antes + DespuÃ©s` (todo-inclusive). Nuevo comportamiento:

1. **Total** = SOLO la suma de los 12 meses del aÃ±o (`Î£ months`), igual para TODAS las tablas del flujo (Entradas, Desembolso de financiaciÃ³n, Compras, Pago a proveedores, InternaciÃ³n, Capital, Gastos fijos, Gastos variables, LiquidaciÃ³n, Impuestos, el Resumen de liquidez y cualquier pivote con columnas ooy) y sus hojas exportables.
2. Nueva columna **Total General** posicionada DESPUÃ‰S de `DespuÃ©s de {N}`: `Î£ months + Antes + DespuÃ©s`.

Orden de columnas resultante (con fuera-de-aÃ±o visible): `Eneâ€¦Dic | Antes de {N} | DespuÃ©s de {N} | Total | Total General`. Sin fuera-de-aÃ±o: `Eneâ€¦Dic | Total` (sin columna nueva).

### 14.2 Shape elegido (menos churn)

Los builders (`buildFlowPivot`, `buildDerivedPivot`, `buildVariableFlowPivot` y los pivotes inline de liquidaciÃ³n/impuestos) CAMBIAN el significado de los acumulados existentes y agregan un campo nuevo:

- `row.total` / `columnTotals` / `grandTotal` â‡’ ahora SOLO los 12 meses (BR-FE21-16). Los montos Antes/DespuÃ©s dejan de sumar aquÃ­.
- NUEVO `row.generalTotal` / `grandGeneralTotal` â‡’ 12 meses + Antes + DespuÃ©s (+ `undatedTotal`: los montos con fecha ilegible, que ya no entran al `grandTotal` â€” antes sÃ­ sumaban al todo-inclusive).
- `buildCashFlowResumen` agrega `entradasGeneralTotal / salidasGeneralTotal / netoGeneralTotal` (desde `grandGeneralTotal` de los pivotes); `entradasTotal / salidasTotal / netoTotal` pasan a ser 12 meses. *Flujo acumulado* (ooy = `â€”`) y *Bodega* â‡’ General = Total.
- Pivotes SIN fuera-de-aÃ±o real (Compras, arrastre y tablas con before=after=0): `generalTotal === total` (igualdad trivial, BR-FE21-19).

### 14.3 Gate de render/export de 'Total General' (BR-FE21-17)

- Vista Flujo, bloques: gate = `block.ooy && showOutOfYear && block.pivot.beforeAfterRowCount > 0` (la tabla "en serio" tiene Antes/DespuÃ©s). Vista Flujo, Resumen: gate = `ooyColumns.visible` (mismas series ooy).
- ExportaciÃ³n (`matrixSheet`/`resumenSheet`): gate = el MISMO `ooy && beforeAfterRowCount > 0 && scenarioYear !== null` que ya controla las columnas Antes/DespuÃ©s â€” y el orden de columnas exportadas es el de Â§14.1.
- BR-FE21-18: los montos de celdas, `before`/`after` y los bloques derivados (neto, acumulado, bodega, bases A-01~A-04) NO cambian; solo los sumatorios de columnas de balance y su orden.
- NO tocar: backend (cero), `executivePivot.js` (Ejecutiva), drill-down (`CecoDetailView`/`cecoMovements.js`), catÃ¡logos.

### 14.4 Criterios de aceptaciÃ³n

| ID | Criterio |
|---|---|
| AC-FE21-25 | Pivote con beforeâ‰ 0/afterâ‰ 0 â‡’ `row.total` = solo meses (0 si todo fuera de aÃ±o), `row.generalTotal` = total + before + after; `grandTotal` = Î£ columnTotals; `grandGeneralTotal` todo-inclusive. |
| AC-FE21-26 | Pivote sin ooy (before=after=0) â‡’ general === total; en la vista/export no aparece la columna 'Total General'. |
| AC-FE21-27 | Orden visual en Flujo: Antes/DespuÃ©s ANTES de la col Total, y 'Total General' al final, solo con ooy activo. |
| AC-FE21-28 | Hojas exportables del Flujo con las mismas columnas y gate. |
| AC-FE21-29 | `npm run lint` / `npx vitest run` limpios (72 baseline + suite A-05). |

### 14.5 Nota de fecha ilegible (hallazgo 5)

Actualizada: Â«El bloque incluye {X} con fecha ilegible: no aparece en ningÃºn mes ni en las columnas Antes/DespuÃ©s; solo suma al Total General.Â» (El `total` del bloque ya no la incluye.)

### 14.6 Reglas aÃ±adidas

* **BR-FE21-16** â€” `Total` = Î£ de los 12 meses; IGNORA Antes/DespuÃ©s (cambio semÃ¡ntico: antes incluÃ­a las 3 partes).
* **BR-FE21-17** â€” `Total General` = months + before + after; SOLO se renderiza (y exporta) cuando la tabla tiene ooy activo (mismo gate que las columnas Antes/DespuÃ©s del bloque).
* **BR-FE21-18** â€” los montos de cada celda y los bloques derivados (neto, acumulado, etc.) NO cambian; solo el posicionamiento/sumatorio de columnas de balance.
* **BR-FE21-19** â€” con ooy=false, las tablas NO llevan la columna nueva "Total General" (evita columna ruidosa cuando before=after=0).

### 14.7 Ajuste puntual GUI/NFR — fondo SÓLIDO de los encabezados Antes/Después/Total en las tablas del pivote de flujo (2026-10-21)

**Problema:** en `/budget/planning/573` (Vista Flujo), los `th` de las columnas **Antes de {N}** y **Después de {N}** se veían con fondo TRANSPARENTE en tema oscuro — al hacer scroll se ve el contenido desplazado detrás. Causa: la regla dark de `th.pt-col-extra` en `PivotMonthTable.vue` usaba un fondo translúcido (`rgba(255, 255, 255, 0.05)`) sobre `th` sticky-top dentro del wrapper `overflow: auto`.

**Patrón aplicado (réplica del fix previo de fondo sólido en tema oscuro de los totales del pivote — clase `pt-col-total`/`pt-col-total-inner` y tfoot `pt-cell-total`):** fondo SÓLIDO con la variable vigente del tema, jamás un color inventado ni un rgba translúcido:

* `:root[data-theme='dark'] .pt-table thead th.pt-col-extra { background-color: var(--color-surface, #0f1d2e); }` (antes: `rgba(255, 255, 255, 0.05)`).
* Tema claro: `th.pt-col-extra` mantiene `var(--color-surface, #f9f9f9)` — sólido (fallback alineado al valor real de base.css).
* Los `th` de Total / Total General (`pt-col-total` sticky-right y `pt-col-total-inner` estático) conservan su fondo opaco `var(--dark-color)` preexistente — mismo fondo que el resto de cabeceras de la tabla.

**NFR/GUI:** cualquier columna sticky o header sticky-top dentro de un contenedor scrollable debe tener fondo completamente OPACO en ambos temas (claro y oscuro); los fondos translúcidos solo son permitidos en elementos no anclados al scroll.

**Alcance:** solo CSS de `crm_frontend/src/components/budget/planning/PivotMonthTable.vue`; cero cambios de markup, datos ni backend. Verificación: `npm run lint` + `npx vitest run` limpios (baseline 79).

**Ampliación §14.7 — ambas columnas de totales pinned right (2026-10-21):** con `generalColumn` presente, la col **Total** interna recupera el anclaje sticky-right que la Enmienda A-05 le había quitado: ancla en `right: var(--pt-total-general-w)` — offset igual al ancho de la col Total General (116px, `COL_TOTAL_WIDTH`) — y la col **Total General** permanece pinned en `right: 0`. El tratamiento se aplica a los tres planos (thead `th.pt-col-total-inner`, tbody `td.pt-cell-total-inner`, tfoot la Sigma `td.pt-cell-total-inner`), z-index coherente con el patrón vigente (thead 4, esquinas/Σ 3, celdas 2), y fondo SÓLIDO en ambos temas (NFR §14.7: nada translúcido en columnas ancladas). Sin `generalColumn` el DOM/CSS no cambia (comportamiento sticky-right único heredado). Motivación: bug reportado — el header de la columna Total se desplazaba con el scroll horizontal del Flujo.
