# Spec Frontend: Internación en Vista Flujo (bloque + desglose) + panel "Internación" en Reglas

| Campo | Valor |
|---|---|
| **ID de feature** | `FE-S10-INTERNMENT-SPLIT` |
| **Depende de** | `BE-S9-INTERNMENT-SPLIT` (`backend.02_19`) — catálogos `/budget/line-internment-rate/` y `/budget/line-internment-term/`, `origin:"internment"` en carryover |
| **Base** | FE-S9 (`frontend.03_12`), FE-S7 (`frontend.03_10`), FE-S8 (`frontend.03_11`), panel FE-S5 (`frontend.03_08`) |
| **Componente núcleo** | `CashFlowPivotTable.vue`; además `BudgetRulesView.vue`, `components/budget/rates/InternmentPanel.vue` (nuevo), `budgetRulesStore.js`, `budgetPlanningStore.js`, `budgetRulesService.js`, `budgetPlanningService.js`, `LineFormModal.vue`, `BudgetIngestionModal.vue` (solo copy) |
| **Prohibido tocar** | `ExecutivePivotTable.vue`, bloque "Compras del mes", fila Bodega (FE-S9 §2.6), forma del payload de `LineFormModal` (guards BR-PUR-02/04), motor de presupuesto |
| **Convenciones** | `<script setup>` JS-only, alias `@`, cero deps nuevas, i18n es-CO hard-coded como el resto del módulo, CSS solo `cf-*` / clases del panel |

---

## 1. Concepto

El valor de una compra ES el costo total (proveedor + internación, A-1'). El FE deriva en vivo la misma fórmula §4 de `backend.02_19` (cero escrituras, filosofía D-S7-2):

```
pct      = internmentRateByLine.get(lineId) ?? 0        # fracción 0-1, recargo sobre proveedor
provBase = amount / (1 + pct)                           # lo que se paga al proveedor
intBase  = amount - provBase                            # lo que se paga de internación
cuotas prov: provBase × payment_pct  en ancla + payment_days   (términos vigentes FE-S7/FE-S9)
cuotas int :  intBase × payment_pct  en ancla + payment_days   (NUEVO catálogo, orden D-7)
Línea sin pct ⇒ provBase = amount ⇒ DOM idéntico a hoy (NFR-FE10-3)
```

El pago de internación se muestra como bloque de salida PROPIO (D-FE10-2: destinatario y plazos distintos ⇒ nunca mezclarse con "Pago a proveedores").

## 2. Cambios

### 2.1 Servicios (`src/services/`)

- `budgetRulesService.js` += verbos delgados espejo de `fetchPayableTerms` (l.86): `fetchInternmentRates()` (`GET /budget/line-internment-rate/`), `createInternmentRate/updateInternmentRate/deleteInternmentRate`, `fetchInternmentTerms()` (`GET /budget/line-internment-term/`), `createInternmentTerm/updateInternmentTerm/deleteInternmentTerm`. Errores: rejilla `{ detail, reason? }` existente (los 400 de "already has an internment rate" se muestran con el `detail` literal).
- `budgetPlanningService.js` += `fetchInternmentRates` y `fetchInternmentTerms` (patrón l.281) para el `ensureCatalogs` del planning.

### 2.2 Stores

**`budgetRulesStore.js`:**
- State: `internmentRates: []`, `internmentTerms: []`, `loading.internment: false`, `loadError.internment: null`.
- `fetchInternmentCatalogs(force)`: `Promise.all` de ambos GETs con UNA sola bandera de error — la derivación es todo-o-nada (sin el % no se puede partir la base ⇒ D-FE10-3). Actions CRUD locales (`create/update/delete` de rate y term) con el mismo patch optimista in-place de payable terms (l.311/344/377).

**`budgetPlanningStore.js`:**
- State espejo + flag `internmentCatalogError`; loader en `ensureCatalogs` (no bloquea el resto de catálogos).
- Getter `internmentRateByLine()` → `Map(id_line → internment_pct)` (last-wins imposible: unicidad BE; null-safe en `Array.isArray`).
- Getter `internmentTermsByLine()` → `Map(id_line → terms)` reconstruido SOLO cuando mutan los catálogos (NFR-S7-FE-1 pattern, espejo `payableTermsByLine` l.324-341) con orden `payment_days asc, id asc` (D-7).

### 2.3 `BudgetRulesView.vue` — 4.ª pestaña "Internación" (`components/budget/rates/InternmentPanel.vue`, nuevo)

Por Línea seleccionada:
- **(a) % de internación:** input único 0–100, convertido a fracción (`Number(v/100)` con `toFixed(6)`, espejo PayableTermsPanel l.198). Vacío ⇒ sin tasa (si existía ⇒ DELETE). Guard local: `0 < v ≤ 100`; fuera ⇒ bloqueo inline citando el 422. Helper literal: `Recargo sobre el costo del proveedor: CostoTotal = Proveedor × (1 + %). El valor capturado en las compras es el CostoTotal (ya lo incluye).`
- **(b) Cuotas de internación:** editor renglón `pct % | días` idéntico en forma al de términos proveedores (reusa `formatPct`/`formatDays` — con "0 → el día de la importación"); botón **"Patrón típico (60 % a 15 d · 40 % a 45 d)"** visible solo con lista vacía, que precarga las dos filas (default de UI; el backend NO seedea — A-4/D-FE10-4).
- **(c) Aviso de Σ:** badge bajo la lista: `Σ {x %} ≠ 100 %` ámbar si <100, rojo si >100 — INFORMATIVO, nunca bloquea (A-9/R-S9-1).

### 2.4 `CashFlowPivotTable.vue` — split en `costPaymentRows` (sección compras, l.605-627)

1. `const pctInt = Number(internmentRateByLine.get(lineId) ?? 0)`; si `!Number.isFinite(pctInt) || pctInt < 0` ⇒ tratar 0 (guard defensivo espejo de "pct no finito ⇒ skip").
2. `const provBase = amount / (1 + pctInt)`; `const intBase = amount - provBase`.
3. **Stream proveedor:** mecanismo INTACTO (términos `payableTermsByLine`, cuota única D-S7-4 sin términos) pero base `provBase` en lugar de `amount`.
4. **`internmentPaymentRows` (computed nuevo, mismo shape `{idCostCenter, amount, effectiveDate}`):** solo compras con `intBase > 0.005` (épsilon COP float crudo); CON `internmentTermsByLine.get(lineId)` ⇒ una cuota `{intBase × paymentPct, addDaysISO(budget_date, payment_days) ?? budget_date}` por término (mismos guards FE-S7: pct no finito ⇒ skip; addDays null ⇒ ancla); SIN términos ⇒ cuota única `{intBase, budget_date}` (BR-INT-04). `pct == 0` ⇒ cero filas.
5. **Degradación:** `internmentCatalogError` ⇒ cortocircuitar AMBOS streams de compras (no se puede partir la base) con aviso; la ruta `cogs` (ingresos no compradores) NO usa rates ⇒ sigue intacta (A-8). `costTermsDegraded` (FE-S9 §2.5-3) se extiende a "produciría filas" también sobre los streams nuevos.
6. **Ruta `cogs` sobre ingresos:** cero cambios (ni `pctInt` ni términos int se aplican ahí — D-4'/FE-S7 quedan byte-idénticos).

### 2.5 `CashFlowPivotTable.vue` — bloque nuevo "Pago de internación"

- Inserción aditiva en `blocks`: `[Entradas, Compras del mes, Pago a proveedores, Pago de internación, Gastos fijos, Gastos variables]`; se renderiza SOLO si `internmentPaymentRows.length > 0` ∨ hay filas carryover `internment` ⇒ DOM idéntico a hoy sin configuración (NFR-FE10-3).
- Pivote por `buildPivotFrom(internmentPaymentRows)` (reuso puro del shape — precedente D-FE9-4); cuotas fuera de año viven solo en Antes/Después (regla FE-S8 intacta).
- aria-label: `Pago de internación del escenario por centro de costo y mes de vencimiento`.
- Nota literal del bloque: `Desglose del valor importado: costo de internación = total − total/(1 + % internación de la Línea), pagado según sus propios términos. Informativo en caja: no altera el P&L (causación).`
- Neto / salidas / acumulado lo incorporan automáticamente vía la agregación de bloques existente (verificar que la suma de bloques de salida no use lista hard-coded de IDs).

### 2.6 `CashFlowPivotTable.vue` — arrastre `origin:"internment"` (extiende FE-S9 §2.7)

- Normalización: `const origin = ['cogs', 'purchase', 'internment'].includes(line.origin) ? line.origin : 'line'`.
- Fila `internment`: prefijo `⌁ Internación {N−1} · {label}` + tooltip `Cuota de internación derivada del escenario {name} ({year}); no es una línea del escenario.` (comparte resolvedor de year/nombre con `carryCogsRowTitle`).
- Orden de desempate de grupos: `line < cogs < purchase < internment` (espejo rank BE §5.4-3).

### 2.7 `LineFormModal.vue` (modo Compra) — claridad, cero cambios de payload

- Hint reemplazado (sustituye el de FE-S9 §6.1): `El valor es el costo total (proveedor + internación). Las cuotas al proveedor se derivan del costo del proveedor (total ÷ (1 + % de internación de la Línea)) y las de internación de sus propios términos, ambas sobre la fecha de importación. La temporada es informativa: no genera cuotas.`
- Fila informativa SOLO lectura (no campo, no payload) cuando el CECO resuelve Línea con `pct > 0` y el monto es numérico: `Desglose estimado: proveedor {formatMoney(amount / (1 + pct))} + internación {formatMoney(amount - amount / (1 + pct))}` — reactiva a monto/CECO/temporada sin refetch.
- CREATE/UPDATE de compra: payload y guards idónticos a hoy (BR-PUR-02/03/04).

### 2.8 `BudgetIngestionModal.vue` — solo copy

Helper del archivo de importaciones (l.425 aprox.): a "Una fila = una importación…" se agrega `; el valor es el costo total de la importación (proveedor + internación)`. El resultado de upload no gana claves nuevas (NFR-BE9-3) ⇒ feedback sin cambios.

## 3. NFR

| ID | Requisito |
|---|---|
| NFR-FE10-1 | O(L): el split agrega ≤2 pasadas constantes sobre `budget_lines` dentro del loop ya existente; cero loops anidados por término fuera de la generación de cuotas |
| NFR-FE10-2 | Reactividad viva (AC-VF-2 extendido): editar monto/fecha de una compra, la tasa o los términos de internación recalcula ambos bloques + arrastre sin refetch (misma caché de stores) |
| NFR-FE10-3 | Escenario cuyas Líneas no tienen %int (estado actual de producción): DOM de la Vista Flujo idéntico a FE-S9; pestaña Internación con tasa vacía y lista vacía |
| NFR-FE10-4 | `npm run lint` verde; sin TS; sin deps; CSS solo `cf-*`/panel |

## 4. Criterios de aceptación (QA manual en dev, backend BE-S9 desplegado)

Preparación no destructiva: `POST /budget/planning/clone` sobre el escenario 266 ("QA Internación"), trabajar sobre el clon, borrarlo al final (delete-draft).

- **AC-FE10-1 (desglose exacto):** Línea del CECO con rate 20 % + botón "Patrón típico"; términos proveedor 30/60 @ .5/.5; compra 120M con importación 15/03 ⇒ "Pago a proveedores": 50M (14/04) + 50M (14/05) — suma 100M; bloque NUEVO "Pago de internación": 12M (30/03) + 8M (29/04) — suma 20M; "Compras del mes" intacto en 120M; Σ de ambos bloques de salida = 120M exactos (flotantes: tolerancia 0.01).
- **AC-FE10-2 (cero-regresión):** Línea sin rate ⇒ "Pago a proveedores" con 100 % del valor (igual a hoy) y NINGÚN bloque "Pago de internación" en el DOM (NFR-FE10-3); cuota única D-S7-4 para Línea con rate pero sin términos proveedor sigue existiendo sobre `provBase`.
- **AC-FE10-3 (cogs intacto):** CECOs de Líneas no compradoras con `cogs_pct`: sus filas derivadas no cambian ni un centavo aunque OTRA Línea configure rates (A-8).
- **AC-FE10-4 (arrastre):** escenario N con flag ON cuya fuente N−1 tiene la compra del AC-BE9-3 (120M, importación 15/12/N−1) ⇒ tablas de arrastre muestran `⌁ Compra {N−1}` (50M 14/01 + 50M 13/02) y `⌁ Internación {N−1}` (8M 29/01); la cuota de 12M (30/12) NO aparece (BR-CO-09); tooltips correctos.
- **AC-FE10-5 (degradación):** forzar 500 en `GET /budget/line-internment-rate/` (DevTools block) ⇒ Vista Flujo: streams de COMPRAS cortocircuitados con aviso, filas `cogs`/gastos/entradas funcionando; al retirar el bloqueo y reentrar, todo se restaura (D-FE10-3).
- **AC-FE10-6 (panel):** crear/update/delete de rate y términos recalcula en vivo el Flujo abierto (NFR-FE10-2); "Patrón típico" solo aparece con lista vacía; tasa 105 % ⇒ bloqueo local (no llega request); badge Σ ámbar con términos que suman 90 %.
- **AC-FE10-7 (modal):** el hint nuevo y la fila "Desglose estimado" solo en modo compra con rate > 0; payloads CREATE/UPDATE idénticos a FE-S9 §6.1 (pestaña Network; AC-FE9-4 sigue).
- **AC-FE10-8 (regresión):** AC-FE9-1..8 y AC-OY-* de FE-S8 siguen pasando (cuotas int fuera de año → Antes/Después); Vista Ejecutiva byte-idéntica; `npm run lint` verde.

## 5. Trazabilidad

| ID | Decisión | Origen |
|---|---|---|
| D-FE10-1 | Fórmula §4 BE replicada cliente, cero escrituras de cuotas | Filosofía D-S7-2 + supuesto A-6 aprobado |
| D-FE10-2 | Bloque propio "Pago de internación" (no fila dentro del bloque proveedor) | Supuesto A-6 — destinatario distinto |
| D-FE10-3 | Fail-closed de los streams de compra si el catálogo de rates falla; ruta cogs independiente | Riesgo de base indecomponible (§2.4-5) |
| D-FE10-4 | Patrón 60/15 + 40/45 solo como botón de UI; backend no seedea | Supuesto A-4 aprobado |
| D-FE10-5 | Epsilon 0.05→0.005 COP para suprimir filas de internación por float crudo | Convención "raw float, cero redondeo intermedio" (BE-S8 §4) |