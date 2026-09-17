# Spec Frontend: Compras (importaciones) + Pago a proveedores por compra + Bodega estimada en Vista Flujo

| Campo | Valor |
|---|---|
| **ID de feature** | `FE-S9-PURCHASES-BODEGA` |
| **Depende de** | `BE-S8-BUDGET-PURCHASES` (`backend.02_18`) — enum `purchase`, guards del line manager, `origin:"purchase"` en carryover, `file_compras` en upload |
| **Base** | FE-S4B (`frontend.03_04`), FE-S6 (`frontend.03_09`), FE-S7 (`frontend.03_10`), FE-S8 (`frontend.03_11`) |
| **Componente núcleo** | `CashFlowPivotTable.vue`; además `planningFormat.js`, `LineFormModal.vue`, `BudgetLineGrid.vue`, `BudgetIngestionModal.vue`, servicio/store de upload |
| **Prohibido tocar** | `ExecutivePivotTable.vue`, `BudgetLineGrid` no cambia de semántica (solo se verifica compat del label), backend |
| **Convenciones** | `<script setup>` JS-only, alias `@`, cero deps nuevas, i18n es-CO hard-coded como el resto del módulo |

---

## 1. Concepto

El escenario puede contener **líneas de compra** (`line_type:"purchase"`: monto de importación + `budget_date` = fecha de importación; `payment_date` siempre null). En caja, el proveedor se paga por **compras** con los términos de su Línea; el P&L/Ejecutiva no se entera (seguir ingresos×cogs_pct). CECO **comprador** = tiene ≥1 línea de compra en el escenario (regla de fuente única D-4, VINCULANTE).

## 2. Cambios

### 2.1 `planningFormat.js`

`LINE_TYPE_LABELS` += `purchase: 'Compra'`. Nada más (monthIndexOf/formatMoney intactos).

### 2.2 `LineFormModal.vue`

- El selector de tipo ofrece tres opciones: Ingreso / Gasto / **Compra**.
- Con tipo Compra: `behavior_type` fijo a `fixed` (ocultar el selector de comportamiento), ocultar **Fecha de Pago** y **Colección/temporada** (el payload no los envía; `payment_date` nunca se manda: si el backend la fuerza a NULL igual, no depende de eso).
- Hint literal (bajo el tipo): `Las cuotas de pago al proveedor se derivan automáticamente de los términos de la Línea sobre la fecha de importación; no se captura fecha de pago.`
- Label de la fecha `budget_date` en modo compra: `Fecha de importación` (placeholder/help; el payload sigue enviando `budget_date`).
- Validación pre-red de año: la vigente de `budget_date` contra el año del escenario (AC-FD-8) aplica igual.

### 2.3 `BudgetLineGrid.vue`

Verificar (y adaptar solo si está hard-coded) que el chip/etiqueta de tipo y los filtros usen `LINE_TYPE_LABELS[line.line_type]` — una fila compra debe verse como `Compra` con sus fechas (`Fecha Proyectada` = importación; `Fecha de Pago` = `—`). Cero cambios de edición: PUT cell / PUT-DELETE línea ya son agnósticos de tipo.

### 2.4 `CashFlowPivotTable.vue` — bloque nuevo "Compras del mes"

- `comprasPivot = buildPivot(line => line.line_type === 'purchase', line => monthIndexOf(line.budget_date))` (causación de importación; `bucket` siempre 0 por validación BE ⇒ **`ooy: false`**, sin columnas extra ni chip).
- Inserción **aditiva mínima** en `blocks`: `[Entradas, Compras del mes, Pago a proveedores, Gastos fijos, Gastos variables]` (el orden relativo actual se conserva; el bloque nuevo entra justo antes de Pago a proveedores y solo si el escenario tiene compras — sin compras: DOM idéntico a hoy).
- aria-label: `Compras de importación del escenario por centro de costo y mes de importación`.
- Nota literal: `Valor de la mercancía importada por fecha de importación. El pago al proveedor se muestra, por términos de la Línea, en “Salidas — Pago a proveedores”.`

### 2.5 `CashFlowPivotTable.vue` — switch de fuente en "Pago a proveedores"

`compradorCecos = new Set(lines.filter(l => l.line_type === 'purchase').map(l => l.id_cost_center))` (computed).

En `costPaymentRows`:
1. **Ingresos (FE-S7 actual):** se recorre solo `!compradorCecos.has(line.id_cost_center)` (las compras ya pagan ese CECO — nunca doble cuenta).
2. **Compras (nuevo, mismo shape `{idCostCenter, amount, effectiveDate}`):** por cada línea compra con `Number(projected_amount)` finito y ≠ 0: `terms = lineId ? payableTermsByLine.get(lineId) : undefined`; CON términos ⇒ una cuota `{cost × payment_pct, addDaysISO(budget_date, payment_days) ?? budget_date}` por término (mismos guards: pct no finito ⇒ skip; addDays null ⇒ ancla); SIN términos (o CECO sin id_line) ⇒ cuota única 100 % en `budget_date` (D-S7-4).
3. El cortocircuito por catálogo caído (`payableTermsError`) y `costTermsDegraded` siguen igual — con el matiz: `costTermsDegraded` debe computar "produciría filas" sobre ingresos NO compradores **y** compras (las compras sin catálogo tampoco pueden derivarse).
4. `buildPivotFrom` (cuotas) intacto: una cuota de compra que cae fuera de N (ej. importación de diciembre con +60 días) vive solo en Antes/Después con toggle ON — regla FE-S8/AC-OY-9 vigente.
5. Nota del bloque reemplaza el texto actual por: `Derivado: compras del escenario × términos de pago de la Línea; CECO sin plan de compras: % costo de ventas vigente × ingreso causado. No altera el P&L (causación).`

### 2.6 `CashFlowPivotTable.vue` — fila "Bodega estimada" en el Resumen

- Nuevos computeds: `comprasPorMes = comprasPivot.columnTotals` (zeros si no hay compras) y `costoCausadoPorMes[m] = Σ (Number(projected_amount) × pct / 100)` sobre **ingresos fijos** con `monthIndexOf(budget_date) === m`, con `pct = resolveCogsPctByLine(lineCostRates, lineIdForCostCenter(cc), monthEndOf(budget_date))` (`null` ⇒ contribuye 0; NO depende de `payableTermsByLine` — la bodega funciona aunque el catálogo de términos esté caído).
- `bodega[m] = bodega[m-1] + comprasPorMes[m] − costoCausadoPorMes[m]`, `bodega[−1] = 0`.
- Fila extra en `resumenRows` (después de Flujo acumulado, marcada como informativa):
  - Label: `Bodega estimada (cierre)`; meses con `resumenCell`; **Total** = `bodega[11]` con `totalTitle`: `Σ compras − Σ costo de ventas causado, acumulado mes a mes (arranca en 0 en enero). Estimación: el costo de lo vendido se valúa a cogs_pct; no es efectivo y no suma al neto.`
  - NO entra en entradas/salidas/neto/acumulado (es informativa; el resumen de caja cuadra igual).
  - Columnas Antes/Después del toggle FE-S8: `—` (la bodega es por mes ∈ N).
  - Negativos: clase nueva `.cf-bodega-negative` (ámbar, NO rojo de caja): light `#b7791f`, dark `#f6e05e`. Si algún mes < 0, nota bajo la tabla: `La bodega estimada quedó negativa: se está vendiendo costo de períodos previos al escenario o la tasa de costo está sub-calibrada.`
  - Se renderiza SIEMPRE (aun sin compras: bodega = −Σ costos causados, igual de informativa que hoy que ese costo no se veía).

### 2.7 `CashFlowPivotTable.vue` — arrastre `origin:"purchase"`

`buildCarryPivot`: normalizar origen a `'line' | 'cogs' | 'purchase'` (hoy colapsa todo lo no-cogs a 'line' — FIX obligatorio: `const origin = ['cogs','purchase'].includes(line.origin) ? line.origin : 'line'`). Fila `purchase`: prefijo `⌁ Compra {N−1} · {label}` + tooltip `Cuota de compra derivada del escenario {name} ({year}); no es una línea del escenario.` (compartir el resolvedor de year/nombre con `carryCogsRowTitle`). Orden del desempate de grupos: `line` < `cogs` < `purchase`.

### 2.8 Upload — tercer archivo

- `BudgetIngestionModal.vue`: input opcional nuevo `Plan de importaciones (opcional)` + helper literal: `Hoja “Importaciones” con columnas: Centro de Costo | Fecha Importacion | Valor | Descripcion (una fila = una importación del mes).`
- Servicio/store: añadir parámetro `fileCompras` (null-safe, solo `formData.append('file_compras', ...)` si está); firma compatible (parámetro opcional al final — no romper llamantes).
- Feedback del resultado: mostrar `Líneas de compra: {lines_purchase} · Total: {formatMoney(total_purchase)}` solo si `lines_purchase > 0` (claves con default en la respuesta vieja).

## 3. NFR

| ID | Requisito |
|---|---|
| NFR-FE9-1 | O(L) — el switch de fuente y la bodega no añaden recorridos extra sobre `budget_lines` más que 2 pasadas constantes (compradorCecos, comprasPivot ya computado) |
| NFR-FE9-2 | Reactividad viva: editar una compra/cuota/income desde el Editor recalcula bloques, resumen y bodega sin refetch (misma caché — AC-VF-2) |
| NFR-FE9-3 | Escenario sin compras: DOM de Flujo idéntico a FE-S8 hoy (sin bloque Compras, derivación FE-S7 intacta; ÚNICA diferencia visible: la fila Bodega — ver nota 2.6) |
| NFR-FE9-4 | `npm run lint` verde; sin TS; sin deps; CSS solo `cf-*` |

## 4. Criterios de aceptación (QA manual en dev, backend BE-S8 desplegado + ALTER aplicado)

Preparación no destructiva: `POST /budget/planning/clone` sobre el escenario 69 (p. ej. "QA Compras"), trabajar contra el clon, eliminarlo al final con el endpoint de delete-draft.

* **AC-FE9-1:** Crear compra 000101: `Fecha de importación 15/12/2025`, valor 100M (Línea del CECO con términos 30/60 @ .5/.5): bloque Compras muestra Dic=100M; Pago a proveedores muestra `Después de 2025` (15/01 y 13/02) y **nada** en Ene–Dic con toggle ON|OFF; Total anual del bloque 100M.
* **AC-FE9-2:** El mismo CECO comprador: su ingreso de dic-2025 (línea 768: 30M, cobro feb-2026) ya NO genera cuota COGS (switch D-4); un CECO distinto sin compras sigue generando su cuota FE-S7.
* **AC-FE9-3:** Bodega: con compras 100M dic y costos causados del escenario, `bodega[m]` es acumulado exacto; enero–noviembre = −Σ costos causados (ámbar); diciembre refleja +100M; Total = valor de diciembre; neto/acumulado de caja INALTERADOS por la fila bodega.
* **AC-FE9-4:** Editor: la fila compra se etiqueta `Compra`, `Fecha de Pago` = `—`; el formulario de compra oculta fecha de pago/colección/comportamiento y envía solo `{line_type:'purchase', budget_date, projected_amount, description?}` (verificar en Network).
* **AC-FE9-5:** Arrastre: escenario N con flag ON cuya fuente N−1 tiene compra con cuota ∈ N ⇒ tabla "Pagos de arrastre" gana fila `⌁ Compra {N−1}` con tooltip; payloads viejos sin origin purchase se ven idénticos a hoy.
* **AC-FE9-6:** Upload con 3er archivo: escenario nuevo con `file_compras` válido crea las compras (feedback muestra líneas/total de compra); CECO inexistente en el archivo ⇒ 400 con missing_cost_centers y el modal lo lista (patrón vigente); sin el 3er archivo el flujo es idéntico a hoy.
* **AC-FE9-7:** Editar en el Editor el monto de una compra ⇒ bloques, resumen y bodega se recalculan sin recargar (NFR-FE9-2).
* **AC-FE9-8:** Regresión: AC-OY-* de FE-S8 siguen pasando (cuotas de compra cruzan el borde de año ⇒ solo Antes/Después); Vista Ejecutiva byte-idéntica; `npm run lint` verde.

## 5. Trazabilidad

| ID | Decisión | Origen |
|---|---|---|
| D-FE9-1 | Bloque Compras aditivo antes de Pago a proveedores (orden relativo actual intacto) | Minimizar churn de la aprobación §5.2 FE-S4B |
| D-FE9-2 | Bodega es fila informativa del resumen, no un bloque con pivote | Supuesto 3 aprobado (sesión 2026-09-15) |
| D-FE9-3 | Bodega arranca en 0 en enero (sin saldo inicial arrastrado) | Supuesto 7 (PQ-BE-1 diferido) |
| D-FE9-4 | Cuotas de compra con el mismo shape que FE-S7 → `buildPivotFrom` y FE-S8 sin cambios | Reuso, cero riesgo |

---

## 6. Enmienda A-01 (2026-09-16): Temporada visible en compra (espejo de BE-S8 A-01 / backend.02_18 §10)

**Contexto:** la plantilla real de importaciones (layout SIIGO, fila 8) incluye columna `Temporada`; el backend ahora ACEPTA `id_collection` en líneas de compra (guard BR-PUR-02/04 relajado; sigue prohibido `payment_date`/`variable_rate` en compras). Reemplaza §2.2/§2.8 en lo colisionante.

### 6.1 `LineFormModal.vue`

- **Mostrar el select "Temporada"** también en modo Compra (mismo `<select>`/catálogo `budgetPlanningStore.collections` — el `v-if="!isPurchase"` del campo colección pasa a `v-if="true"` para temporada; COMPORTAMIENTO, FECHA DE PAGO y tasa variable SIGUEN ocultos en compra).
- Payload CREATE de compra: `{ id_cost_center, line_type: 'purchase', budget_date, projected_amount, id_collection?, description? }` — `id_collection` solo si el usuario seleccionó temporada (no enviar `''` ni 0).
- Payload UPDATE de compra: el gate `!isPurchase` se estrecha — `id_collection` SÍ puede enviarse cuando cambió (patrón `if (collection !== original.id_collection)` vigente); `payment_date`/`behavior_type`/`variable_rate` siguen excluidos (BR-PUR-04).
- Hint literal reemplazado (§2.2): `Las cuotas de pago al proveedor se derivan automáticamente de los términos de la Línea sobre la fecha de importación. La temporada es informativa: no genera cuotas.`
- El manejo de errores mantiene tolerancia al shape `{"reason": ...}`; un 404 de colección usa el mensaje campo `collection` vigente.

### 6.2 `BudgetLineGrid.vue`

Verificar (sin cambio salvo que esté roto): la sección Compras ya renderiza la columna "Temporada" (genérica, l.86) y el filtro por temporada funciona para compras (`idCollection` ya es común). Si el chip o el stack de edición de compra omiten temporada, corregir mínimo.

### 6.3 `BudgetIngestionModal.vue` — helper del 3er input

Texto reemplazado por: `Formato SIIGO (hoja 1, encabezados en la fila 8): Centro de Costo · Fecha Importacion · Temporada · Monto · Descripción. Una fila = una importación; las cuotas al proveedor se derivan de los términos de la Línea.`

### 6.4 AC de la enmienda

- **AC-FE9a-1:** crear compra con temporada desde el modal ⇒ 201, la grilla de Compras muestra la etiqueta de temporada en la fila; editar la compra y cambiar temporada ⇒ 200 sin tocar fecha de importación.
- **AC-FE9a-2:** subir la plantilla real vía el modal (con `Temporada` desconocida en alguna fila) ⇒ éxito con temporada `—` en esa fila (mismo comportamiento no bloqueante de ingresos).
- **AC-FE9a-3:** regresión FE-S9 íntegra: los AC-FE9-1..8 siguen; ningún pivote de caja consume temporada (compras/pagos/bodega inalterados).

---

## 7. Enmienda A-02 (2026-09-16): switch de fuente POR LÍNEA (espejo de backend.02_18 §11 / D-4')

**Defecto:** en escenarios donde la importación se registra en el CECO "Facturación {Línea}" (p. ej. 266: compras en `000001/000002`) y la venta en CECOS zonales de la MISMA Línea (`000101/000201/000202/000302`), el switch por-CECO de §2.5 nunca aplica ⇒ el bloque "Salidas — Pago a proveedores" suma compras + derivación-por-ingreso = doble cuenta (43M + 28.2M en 266).

### 7.1 Regla (reemplaza `compradorCecos` de §2.5)

Clave por CECO vía `lineIdForCostCenter` (catálogo `costCenters` del store — helper existente): `line:<id_line>` con línea; `cc:<id_cost_center>` sin línea. `purchasingKeys = Set` de claves de las filas purchase del escenario. La derivación FE-S7 por ingreso se saltea la fila ingreso si su clave ∈ `purchasingKeys` (antes: si su CECO ∈ cecos). Las cuotas de compra se generan igual que §2.5. Con catálogo `costCenters` caído: `lineIdForCostCenter` devuelve null ⇒ claves `cc:` ⇒ degradación al comportamiento por-CECO de A-01 (documentada, conservadora: no switcha de más).

### 7.2 Texto literal del bloque (reemplaza la nota de §2.5)

`Derivado: compras de la Línea × términos de pago; Línea sin plan de compras: % costo de ventas vigente × ingreso causado. No altera el P&L (causación).`

### 7.3 Intocados

Bloque "Compras del mes" (§2.4), fila Bodega (§2.6 — consume compras y costos causados, ajenos al switch), arrastre (§2.7 — el server aplica D-4'), FE-S8 (fuera-de-año), Ejecutiva.

### 7.4 AC de la enmienda

- **AC-FE9b-1 (266):** el bloque "Pago a proveedores" muestra SOLO las cuotas de compra: Mar 8.5M · Abr 8.25M · May 8.25M (Kyly 25M @ +60/+90/+120 d con pct .34/.33/.33) · Ago 18M (Tinta @ +90 d 100 %); grandTotal 43M; cero cuotas derivadas de los ingresos Kyly/Tinta; Σ salidas del resumen = 43M + gastos (sin el +28.2M viejo); Total anual del bloque = Σ compras = 43M exacto (Σ meses + antes + después = total).
- **AC-FE9b-2:** borrar/regresar una compra desde el Editor (reactividad): al quedar 0 compras de la Línea, su derivación FE-S7 reaparece al instante; al volver, desaparece — mutuamente excluyentes SIEMPRE.
- **AC-FE9b-3 (regresión 69/clon FE-S9):** CECOS con Líneas distintas (151 Kyly, 159 Tinta, 156 Lunelli) ⇒ el número de cuotas es idéntico al QA de §4 (por-CECO ≡ por-Línea cuando no hay co-Línea); un clon con compra en 000101 (Kyly) ahora SÍ apaga también la cuota de ingresos de 000201 (Kyly zonal) — aserción nueva del fix.
- **AC-FE9b-4:** escenario sin compras ⇒ DOM idéntico a hoy (NFR-FE9-3 intacto).
