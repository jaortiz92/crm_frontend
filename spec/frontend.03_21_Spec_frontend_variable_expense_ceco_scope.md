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
