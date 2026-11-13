# SPEC frontend.03_25 — Gasto variable por salidas de dinero (`variable_outflows`)

> Estado: APROBADA (implementar)
> Fecha: 2026-11-11
> Módulos afectados: `src/components/budget/planning/` — `planningLabels.js`, `LineFormModal.vue`, `lineFormValidation.js` (verificar), `cashFlowPivot.js`, `CashFlowPivotTable.vue`, `executivePivot.js`, `cecoMovements.js`, `planningCausation.js`, `views/budget/planning/CecoDetailView.vue`
> Specs relacionadas: frontend.03_21 (alcance CECO de gastos variables — espejo backend.02_24), frontend.03_04 (Vista Flujo), frontend.03_18 (pivotes), frontend.03_19 (drilldown CECO), frontend.03_17 (planeación tributaria), frontend.03_16 (financiación). Spec madre: `spec/04_Spec_Gasto_variable_por_salidas.md`. Espejo backend: `crm_backend/spec/backend.02_28_Spec_Backend_variable_expense_outflows.md`.

---

## 1. Contexto

El backend agrega un tercer comportamiento de gasto variable: **`variable_outflows`
("Variable por Salidas")**, cuya base son las **salidas de dinero del flujo del
presupuesto en el mes de causación** (no un ingreso). El frontend debe (a) permitir
ingresar/editar el comportamiento, (b) calcular y desplegar el gasto en los pivotes con la
base correcta, y (c) mantener la identidad del usuario:

```
Salidas(m) = Salidas Inicial(m) + tasa × Salidas Inicial(m)
```

### Ejemplo de referencia (presupuesto 576)

| Concepto | Ene | Feb |
|---|---:|---:|
| Salidas Inicial (base) | 72.375.235,31 | 81.152.462,31 |
| Gasto 0,4 % | 289.500,94 | 324.609,85 |
| Salidas (total) | 72.664.736,25 | 81.477.072,16 |

## 2. Historia de usuario

> En la plantilla de gastos quiero una tercera opción de gasto variable: relacionado con
> las salidas de dinero. Si en enero las salidas del flujo suman 1.000.000 y el gasto
> variable es 0,4 %, el gasto suma 4.000 y la salida total queda en 1.004.000; el gasto se
> muestra según el CECO en el que se ingresó.

## 3. Reglas de negocio (lens frontend)

| ID | Regla |
|---|---|
| BR-VS-F1 | **Base(m)** = suma por mes de TODAS las filas de salida del pivot de Flujo del presupuesto — gastos fijos + gastos variables calculados (facturación y recaudo) + pago a proveedores (costo de ventas) + capital de financiación (principal por fecha de pago del BE) + impuestos (liquidación de IVA y planeación tributaria) — **EXCLUYENDO** la fila nueva de gastos variables por salidas. |
| BR-VS-F2 | Cada línea `variable_outflows` aporta `tasa × Base(mes de causación)` (mes de `budget_date`, NO `cfMonth`/payment). N líneas ⇒ aportes independientes que se acumulan. |
| BR-VS-F3 | El aporte se despliega en la fila del **CECO propio** de la línea (`id_cost_center`), sin resolución de cubeta ni reatribución (difiere de frontend.03_21). |
| BR-VS-F4 | El gasto por salidas NO es deducible en IVA (backend.02_28 §5.4): el bloque de impuestos de la Vista Flujo NO cambia por su presencia ⇒ la identidad BR-VS-F6 es exacta. |
| BR-VS-F5 | Validaciones: comportamiento "Variable por Salidas" ⇒ tasa obligatoria y monto deshabilitado (mismo patrón `!== 'fixed'` que hoy). |
| BR-VS-F6 | Identidad: el total de salidas del resumen = Base(m) + Σ aportes, exacta a 2 decimales en presentación. |

## 4. Cambios por archivo

### 4.1 `planningLabels.js` (L45-49)
```js
BEHAVIOR_LABELS = {
  fixed: 'Fijo',
  variable_sales: 'Variable por Facturación',
  variable_receivables: 'Variable por Recaudo',
  variable_outflows: 'Variable por Salidas',   // NUEVO
}
```
Fuente única de verdad: el `<select>` de comportamiento (`LineFormModal.vue` L239 + L859)
y los chips se propagan solos. Actualizar `VARIABLE_PIVOT_NOTE` (L35-42) para mencionar la
tercera base (salidas del flujo del mes de causación, CECO propio).

### 4.2 `LineFormModal.vue` + `lineFormValidation.js` — VERIFICAR (sin cambio esperado)
* `isVariable` (L130, L158) y las validaciones (L98-118) son `!== 'fixed'`: genéricas, el
  nuevo valor hereda "tasa requerida / monto deshabilitado".
* Confirmar con test que el select muestra la opción nueva y que el payload envía
  `behavior_type: 'variable_outflows'` + `variable_rate` (sin `projectedAmount`).

### 4.3 `cashFlowPivot.js` + `CashFlowPivotTable.vue` — NÚCLEO DE LA SPEC
1. **Nueva serie derivada** "Salidas — Gastos variables por salidas":
   * filas por CECO propio de cada línea `variable_outflows` y mes de `budget_date`
     (NO `cfMonth`: la causación manda, igual que el bloque variable usa causación);
   * valor de celda = `tasa × Base(mes)`.
2. **Cálculo de `Base(m)` en el front** (debe coincidir 1:1 con backend.02_28 §5.5):
   componer, por mes, la suma de las series de salida YA derivadas del pivot:
   salidas fijas (L827+) + salidas variables calculadas (L938+) + pago a proveedores
   (L1157+) + capital de financiación (`financingPrincipalPivot`, L1166-1177) +
   impuestos (`settlement` IVA del store L1192+ y planeación tributaria).
   **Orden de composición:** calcular la Base ANTES de agregar la serie nueva (garantiza
   la exclusión de BR-VS-F1). Cualquier fila de salida que se agregue al pivot en el
   futuro debe sumar a la Base (nota de mantenimiento en el comentario).
3. La fila nueva entra a `salidasSeries` (L583-612) y al resumen
   (entradas/salidas/neto/acumulado L621-728) en el mismo punto que el bloque variable.
4. **Tercera rama** en los condicionales hoy binarios `variable_receivables` vs
   `variable_sales` (L261-263, L419, L444, L859-926): el nuevo comportamiento usa la base
   de salidas, NUNCA la de facturación.
5. `CashFlowPivotTable.vue`: bloque/fila nueva con `title` "Salidas — Gastos variables por
   salidas" y `aria` análoga (L628-631 como patrón), incluida en el resumen de salidas.

### 4.4 `executivePivot.js` (L148-229, L388-421)
Tercera rama para el nuevo comportamiento con base de salidas (misma fórmula BR-VS-F1/F2);
hoy caería en la rama de facturación por defecto.

### 4.5 `cecoMovements.js` (L31-32, L162-187)
Tercera rama en la derivación por CECO: el movimiento `variable_outflows` del CECO c en el
mes m = `tasa × Base(m)` (base GLOBAL, no del CECO), posicionado por mes de causación.

### 4.6 `planningCausation.js` (L182, L229, L258, L400-452)
Extender la causal de gastos variables con la tercera base; el evento se causa en el mes
de `budget_date` sobre el CECO propio.

### 4.7 `CecoDetailView.vue` (L563-564)
La nota/etiqueta de bases del drilldown debe reconocer la tercera opción.

## 5. Fuera de alcance
* Backend, plantilla Excel e ingesta (backend.02_28).
* Cambios a los otros dos comportamientos o a la resolución por cubeta (frontend.03_21 intacta).
* Export de tablas (frontend.03_20 hereda la fila nueva si es genérico; solo verificar).

## 6. Criterios de aceptación (frontend)

| ID | Criterio |
|---|---|
| AC-FE-VS-1 | El select "Comportamiento" muestra "Variable por Salidas"; al elegirlo, monto queda deshabilitado y la tasa es obligatoria (BR-VS-F5). |
| AC-FE-VS-2 | La Vista Flujo muestra la fila "Salidas — Gastos variables por salidas" con filas por CECO/mes; con Base(Ene)=72.375.235,31 y 0,4 % ⇒ celda Ene = 289.500,94 y Salidas(Ene) = 72.664.736,25 (±0,01). |
| AC-FE-VS-3 | Dos líneas (CECO A y CECO B, 0,4 % c/u) ⇒ cada fila de CECO muestra 4.000 y el total de salidas sube 8.000 con Base=1.000.000. |
| AC-FE-VS-4 | La línea de febrero usa la Base de febrero (mes de causación, no de pago). |
| AC-FE-VS-5 | El bloque de impuestos de la Vista Flujo es idéntico con y sin líneas `variable_outflows` (BR-VS-F4) y la identidad BR-VS-F6 se cumple en todos los meses. |
| AC-FE-VS-6 | Pivote Ejecutivo, movimientos CECO, causación y drilldown muestran el aporte con base de salidas (no de facturación). |
| AC-FE-VS-7 | Presupuestos sin líneas `variable_outflows` quedan visualmente idénticos (regresión 0). |

## 7. Plan de pruebas (Vitest, `crm_frontend/tests/`)
1. Unit: composición de `Base(m)` — casos con AP+fijos+variables+financiación+impuestos y
   con una o varias líneas `variable_outflows` (identidad BR-VS-F6; números del §1).
2. Unit: derivación por CECO propio y mes de causación (BR-VS-F2/F3).
3. Unit: validaciones del formulario (tasa obligatoria, monto deshabilitado).
4. Regresión: presupuesto sin el nuevo tipo — snapshots de pivotes sin cambios (AC-FE-VS-7).
5. `npm test` y `npm run lint` en verde.