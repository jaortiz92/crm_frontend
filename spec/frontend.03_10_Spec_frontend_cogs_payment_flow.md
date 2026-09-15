# Spec Frontend: Bloque "Pago a Proveedores (costo de ventas)" en Vista Flujo

| Campo | Valor |
|---|---|
| **ID de feature** | `FE-S7-COGS-PAYFLOW` |
| **Versión** | 1.0 — 2026-09-14 |
| **Base** | ENMIENDA a FE-S5 (`frontend.03_08`) y FE-S6 (`frontend.03_09`). MODIFICA `CashFlowPivotTable.vue`, `ExecutivePivotTable.vue` (extracción del resolvedor de tasa, SIN cambio de comportamiento), `stores/budgetPlanningStore.js`, `services/budgetPlanningService.js`, `components/budget/rates/PayableTermsPanel.vue` (copy), `components/budget/planning/LineFormModal.vue` (retira `siblings` del emit). |
| **Contrato** | Autoridad `backend.02_17_Spec_Backend_cogs_payment_flow.md` (BE-S7 §2/§4). |
| **Dependencias** | Cero nuevas. |
| **Origen** | Validación del stakeholder con #125: diferir el pago al proveedor generado por el costo (60 % de $10 M Kyly), gastos intactos; filas por CECO ("usan el mismo CECO que de ingreso, pero restan"). |

## 1. Objetivo

Nuevo bloque derivado en la Vista Flujo — **"Salidas — Pago a proveedores (costo de ventas)"** — con filas por **CECO de ingreso** × mes de PAGO, calculado por línea de ingreso fija: `costo = monto × cogs_pct/100` (misma tasa que resuelve Ejecutiva) y desdoble de fechas por `line_payable_terms` de la Línea del CECO (`payment_date = budget_date + days`, `amount = costo × payment_pct`; sin términos ⇒ 100 % el día de la ancla). Con #125: 2027-07 $2.04 M, 2027-08 $1.98 M, 2027-09 $1.98 M en el CECO 000101. Reacciona EN VIVO al PUT de celda (edita el ingreso y el pago al proveedor se recalcula sin refetch).

## 2. Alcance

**Incluye:** bloque + resumen (salidas/neto/acumulado lo incluyen) + columnas fuera-de-año (este bloque LAS necesita: términos −60 con ingreso de enero) + resolvedor compartido extraído de Ejecutiva + catálogo de términos en el store planning + aviso degradado + copy nuevo del panel de términos + retirada del manejo de `siblings` en el modal. **Excluye:** materializar algo (D-S7-2), tocar P&G/Ejecutiva/Editor (el gasto ya no se trocea — BE-S7 rollback), IVA.

## 3. Store — `budgetPlanningStore.js` / service

- `budgetPlanningService.js`: `fetchPayableTerms: () => axiosInstance.get('/budget/line-payable-term/')`.
- `ensureCatalogs()`: añade el job de términos (igual de silencioso): `payableTerms` (state nuevo), `payableTermsLoaded`, `payableTermsError` — MISMO patrón que `lineCostRates`.
- Getter `payableTermsByLine: Map<number, term[]>` memoizado (orden `payment_days asc, id asc`).
- `createScenarioLine`: elimina el loop de `expanded_siblings` y devuelve `{ ok, line }` (el BE ya no los envía; AC-FD-3/4 sin regresión). `LineFormModal`: `emit('saved', line)`; `BudgetLineGrid.onLineSaved(line)`: solo el toast FE-S4D (borra el de desdoble).

## 4. Resolvedor compartido (anti-divergencia)

Extraer de `ExecutivePivotTable.vue` (líneas ~212-260, cero cambio de comportamiento, mismitos tests AC-PYG-1..12) a `planningFormat.js`:

```js
resolveCogsPctByLine(rates, lineId, monthEndISO)   // pool activo, DESC por id, month-end ∈ rango; null = sin tasa
```

`CashFlowPivotTable` lo consume con el month-end del `budget_date` de cada ingreso — Ejecutiva y Flujo comparten SIEMPRE la misma tasa/mes.

## 5. UI — `CashFlowPivotTable.vue`

- `costPaymentRows` (computed, corto-circuito si `payableTermsError` o sin ingresos): por cada ingreso `fixed`: `pct = resolveCogsPctByLine(...)`; si `null` ⇒ sin filas (degradación `—`); costo = monto × pct/100; términos de la Línea del CECO (`payableTermsByLine`); sin términos ⇒ 1 cuota 100 % en `budget_date`; filas `{ idCostCenter, amount, effectiveDate }` con effectiveDate = `budget_date + days` (suma ISO de días sobre string — helper local sin `new Date`, patrón monthIndexOf; puede cruzar año).
- Bloque `list.push` DESPUÉS de "Gastos variables (calculados)": título **"Salidas — Pago a proveedores (costo de ventas)"**, pivote por CECO (etiquetas del propio CECO de ingreso), **`ooy: true`** (chips/columnas fuera-de-año heredan S6), nota al pie: "Derivado: % costo de ventas vigente × ingreso causado, por los términos de pago de la Línea. No altera el P&G (causación)."
- **Resumen:** `salidas[m] += costPivot.columnTotals[m]` junto al arrastre (mismo punto de integración, ANTES de neto/acumulado); acumulado sigue arrancando en 0.
- **Arrastre:** las filas `origin:"cogs"` del payload BE-S7 §4 entran a las tablas de arrastre existentes (buildCarryPivot las agrupa igual — `id_budget_line:null` es inocuo); título de fila con prefijo "⌁ Costo {N−1}" y tooltip "Cuota de costo derivada del escenario {nombre} ({N−1}); no es una línea del escenario."
- Si `payableTermsError` y hay ingresos con tasa: bloque NO se renderiza + nota bajo el resumen: "No fue posible calcular el pago a proveedores (catálogo de términos no disponible)."

## 6. Copy — `PayableTermsPanel.vue` (Reglas Financieras)

- Título/semántica: "Términos de pago al proveedor del costo de ventas de la Línea (desfase temporal en la Vista Flujo; no trocea los gastos del escenario)."
- Confirmación de borrado: "El pago del costo de esta Línea dejará de diferirse en la Vista Flujo (se verá como un solo pago el día de la causación). No se modifica ninguna línea del escenario."
- Columna días: hints不变 (negativo = antes de la causación/importación).

## 7. NFR / AC

| ID | Requisito |
|---|---|
| NFR-S7-FE-1 | Derivación memoizada O(#ingresos × #términos); con flag/catálogo vacío ⇒ cero coste; reactiva a `budget_lines` (PUT celda) y a `payableTerms`. |
| NFR-S7-FE-2 | `npm run lint` + `npm run build` verdes; diff SOLO en los 6 archivos de §"Componentes"; Ejecutiva/P&G/Editor byte-comportamiento idéntico (solo refactor interno del resolvedor). |

- **AC-S7-FE-1:** #125 (ingreso 10 M Kyly 30-may, cogs 60, términos 34/60·33/90·33/120): bloque muestra 000101: jul 2.04 M, ago 1.98 M, sep 1.98 M; Total anual 6 M; Σ salidas del resumen +6 M repartidos; neto/acumulado reflejan; P&G y Ejecutiva idénticos a antes (causación 10 M/mayo; costo sigue siendo "Costo de ventas" en Ejecutiva).
- **AC-S7-FE-2:** doble-clic sobre el ingreso → 12 M ⇒ sin recargar, el bloque paga 7.2 M en las mismas fechas; editar el ingreso a 0 ⇒ bloque desaparece.
- **AC-S7-FE-3:** CECO con tasa pero Línea sin términos ⇒ una cuota 100 % en la fecha del ingreso (bloque lo muestra; el arrastre N−1 también lo hace vía BE).
- **AC-S7-FE-4:** ingreso 2027-01-15 con término −60 ⇒ monto SOLO en columna "Antes de 2027" con toggle ON (chip cuando OFF); total anual lo incluye.
- **AC-S7-FE-5:** un gasto fijo nuevo (POST manual) queda ENTONCES en una sola línea con su fecha de pago (rollback BE validado desde la UI); el toast de desdoble ya no existe.
- **AC-S7-FE-6:** arrastre ON con fuente que tenga ingresos cogs+términos ⇒ tabla "Pagos de arrastre" muestra filas ⌁ con los montos derivados y tooltip §5; el material (`origin:"line"`) convive igual.
- **AC-S7-FE-7:** cortar el catálogo (simular 5xx) ⇒ nota de degradación, resto del Flujo intacto.
- **AC-S7-FE-8:** regresión: AC-VF-*, AC-PYG-*, AC-FD-*, AC-S6-FE-6 (con bloque derivado vacío el DOM sigue idéntico a FE-S4B).

## 8. Riesgos / PQs

- **R-S7-FE-1:** divergencia FE↔BE get_pnl mitigada por resolvedor compartido (§4) — PQ: single-source con endpoint server si Ejecutiva migra a server-side.
- **R-S7-FE-2:** el usuario puede sumar "Pago a proveedores" + "Gastos variables" y confundir costo vs gasto — mitigado por títulos + notas.
- **PQ:** drill-down de cuotas al pasar el cursor (mostrar términos), columna por Línea además de CECO.

## 9. Checklist

1. Store/service (catálogo + getter) + limpieza siblings/modal. 2. Extracción `resolveCogsPctByLine` (Ejecutiva la consume; verify AC-PYG). 3. Bloque + resumen + arrastre origin. 4. Copy panel. 5. Lint/build + QA AC-S7-FE-1..8 con #125 real.