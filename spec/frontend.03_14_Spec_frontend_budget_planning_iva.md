# Spec Frontend: IVA en planeación — flag por fila, modo bruto en cuadrícula/flujo y vista de Liquidación

| Campo | Valor |
|---|---|
| **ID de feature** | `FE-S14-IVA` |
| **Spec counterpart** | BE: `backend.02_20` (BE-S10-IVA) — consume sus contratos (§4.6, §6) |
| **Bases** | `03_03/03_04/03_05` (cuadrícula, flujo, ejecutiva), `03_06` (line manager), `03_08/03_13` (tabs de reglas y catálogo internación — espejos de forma), `03_12` (compras/bodega) |
| **Componentes nuevos** | `IvaSettlementPanel.vue`, `IvaCalendarPanel.vue` |
| **Convenciones** | `<script setup>` JS-only, alias `@`, derivaciones memoizadas client-side (patrón FE-S7: los montos IVA NUNCA se piden por línea — se derivan en vivo), sin TypeScript |
| **Fecha** | 2026-09-22 |

---

## 1. Problema y objetivo

Hoy la planeación habla en netos ("Montos netos, sin IVA" — nota D-4 del bloque Entradas):
un ingreso de 10.000.000 muestra recaudo de 10.000.000 cuando en caja entran 11.900.000,
los gastos con IVA se muestran sin su sobretasa, las compras no reflejan el IVA de
importación (pago único al momento de la compra) ni el de internación (embutido por cuota),
y no existe la liquidación bimestral con vencimientos y arrastre de saldos. Objetivo:
mostrar el mundo real (bruto con IVA) en la Vista Flujo —la única donde el IVA
genera efecto— bajo un interruptor de modo, permitir marcar el flag `Con IVA` por
renglón, y dar de alta el calendario y la liquidación por escenario. La Vista
Ejecutiva (P&G por causación) y los Σ de cabecera NUNCA muestran IVA (enmienda
D-FE14-7).

## 2. Alcance

**Incluye:** (1) interruptor global de modo de visualización "Neto / Con IVA" persistido
por escenario (afecta SOLO al Flujo y a las columnas informativas de la Cuadrícula —
D-FE14-7); (2) columnas IVA/Bruto en `BudgetLineGrid` y bloques brutos en
`CashFlowPivotTable` con los nuevos eventos E1–E6 (backend.02_20 §4.2/§4.3, fórmulas
espejo en §4.1 de esta spec); (3) checkbox `Con IVA` en `LineFormModal`
(create/edit); (4) panel **Liquidación IVA** (`GET /budget/iva/settlement/{id}`) dentro de
BudgetGridEditor; (5) tab **Calendario IVA** en `BudgetRulesView` (CRUD `iva_periods`);
(6) textos de ayuda de ingesta sobre la columna `Con IVA`.

**Excluye (v1):** edición del monto de IVA a mano (es derivado); liquidación de arrastres
N−1 y de datos reales (PQ BE); tasas distintas de 19 %; columnas nuevas en plantillas de
ingresos/compras.

## 3. Registro de decisiones (sesión stakeholder 2026-09-22)

| ID | Decisión |
|---|---|
| D-FE14-1 | El modo `Con IVA` por defecto es **ACTIVO** (mundo real). El toggle existe para no romper la lectura de quienes prefieran neto; la nota D-4 del bloque Entradas se re-semantiza: en modo Con IVA dice "Recaudo bruto = neto × (1 + 19 %)" |
| D-FE14-2 | El flag `Con IVA` es por RENGLÓN (viene de la columna `Con IVA` del archivo de gastos; NULL se renderiza como marcado — decisión BE D-S10-3). NO se ofrece clasificación por CECO ni por Línea |
| D-FE14-3 | En Flujo, el IVA de importación NO crea bloque nuevo: es una fila más del bloque "Pago a proveedores" en la fecha de compra; el IVA de internación embellece cada cuota del bloque "Pago de internación" (× 1,19) |
| D-FE14-4 | El pago de la liquidación (períodos con `payment > 0`) se dibuja en el Flujo como bloque nuevo **"Pago de liquidación de IVA"** en el mes de `payment_due_date`, con fuente `GET /budget/iva/settlement/{id}` (único dato IVA que SÍ viaja del BE: la recurrencia con arrastre no se recalcula en FE para evitar divergencia) |
| D-FE14-5 | El calendario se administra en BudgetRulesView (tab nuevo, espejo del patrón InternmentPanel: live-sync de catálogo, validaciones amables) — es dato de compañía, no de escenario |
| D-FE14-6 | La tasa se lee de `tax_rate_used` del settlement cuando hay respuesta; los cálculos locales usan la constante espejo `IVA_RATE = 0.19` en `planningFormat.js` (cero hardcodes sueltos) |
| D-FE14-7 | **ENMIENDA stakeholder 2026-09-23 (corrige §4.1/D-FE14-1):** la Vista Ejecutiva (P&G por causación) y los Σ de cabecera NUNCA muestran información de IVA — siempre netos, byte-idénticos a FE-S4C con el modo ON u OFF. El modo "Con IVA" solo genera efecto en la **Vista Flujo** (y en las columnas informativas `IVA`/`Total` + checkbox `Con IVA` de la Cuadrícula, que son UI de marcado de datos, no totales). El par "Ejecutiva: Entradas × 1.19 / Gastos × 1.19" del §4.1 original fue un error de spec: se retira |

## 4. Fórmulas derivadas (espejo BE backend.02_20 §4 — misma fuente de verdad)

### 4.1 Presentación (modo Con IVA)

| Superficie | Neto | Bruto mostrado |
|---|---|---|
| Cuadrícula Ingresos (por fila) | `projected_amount` | +col `IVA` = × 0.19, +col `Total` |
| Cuadrícula Gastos/Variables | idem | IVA solo si flag efectivo (True/NULL); False ⇒ IVA "—" |
| Cuadrícula Compras | Total | IVA esperado = prov×0.19 + Σ cuotas_int×0.19 (tooltip desglosado) |
| Ejecutiva (TODAS las secciones: Entradas, Gastos, Costo, P&G, Acumulado, %) | Σ ingresos/gastos mes | **SIN CAMBIO — siempre NETOS (D-FE14-7):** la Ejecutiva es el P&G y nunca lleva información de IVA; con el modo ON u OFF sus cifras son byte-idénticas a FE-S4C |
| Cabecera (Σ Ingresos / Σ Gastos del editor) | netos | **SIN CAMBIO — siempre NETOS (D-FE14-7)** |
| Flujo: Pago a proveedores | cuotas prov | + 1 evento `ancla: prov×0.19` (D-FE14-3) |
| Flujo: Pago de internación | cuotas int | cada cuota × 1.19 |
| Flujo: Salidas gastos | fijos/variables | × 1.19 según flag |
| Flujo: nuevo bloque | — | `payment_due_date` de períodos con `payment > 0` (D-FE14-4) |
| Arrastre (carryover) | como hoy | SIN cambio v1 (PQ-S10-2): si el modo está activo, nota al pie "Los arrastres se muestran netos (v1)" |

### 4.2 Reactividad
Todas las derivaciones cuelgan de `budgetLines` (cache `currentScenario`), del resultado
`settlement` y del modo; un `PUT /cell` o un toggle de flag re-pivota en vivo (AC-FE14-2).
El `settlement` se pide: al abrir el escenario, tras cualquier mutación de líneas
(debounce, same pattern del refresh de carryover) y con botón "Recalcular".

## 5. Cambios por archivo

| Archivo | Cambio |
|---|---|
| `src/components/budget/planning/BudgetLineGrid.vue` | modo `ivaMode` prop; columnas `IVA`/`Total` (Ingresos y Gastos); checkbox `Con IVA` en la fila (solo EXPENSE) → `PUT /budget/planning/line/{id}` parcial `{has_iva}`; badge "sin dato de IVA" si la columna llega NULL (se renderiza marcado con tooltip "Asumido con IVA — edítalo si no") |
| `src/components/budget/planning/LineFormModal.vue` | checkbox `Con IVA` (default: create ⇒ true; edit ⇒ valor persistido; income/purchase ⇒ oculto con nota "los ingresos y las compras siempre generan/pagan IVA (v1)") |
| `src/components/budget/planning/CashFlowPivotTable.vue` | aplicar §4.1 a bloques prov/int/gastos/entradas; bloque nuevo "Pago de liquidación de IVA" (fuente `settlementCache`); re-semantizar nota D-4; cero cambios en la derivación de arrastre (neto siempre) |
| `src/components/budget/planning/ExecutivePivotTable.vue` | **SIN cambios de IVA (D-FE14-7):** la vista lee siempre los pivotes NETOS; el modo no altera ninguna de sus cifras (P&G por causación, nunca IVA) |
| `src/views/budget/planning/BudgetGridEditor.vue` | switch "Neto/Con IVA" en la barra (persistente `localStorage` por `idBudget`; SOLO altera el Flujo); Σ de cabecera SIEMPRE netos (D-FE14-7); chip "Modo caja con IVA" con título aclaratorio; solapa/pestaña nueva **Liquidación** que monta `IvaSettlementPanel` |
| `src/components/budget/planning/IvaSettlementPanel.vue` | **NUEVO**: tabla por período (generado | desglose descontable 4 conceptos | saldo anterior | base | pago | arrastre), fila Totales, bucket `unassigned` con aviso, warning "sin calendario" con CTA al tab de reglas, chip `Proyectado (base caja)`, monto a pagar destacado en `payment_due_date` |
| `src/views/budget/BudgetRulesView.vue` + `src/components/budget/rules/IvaCalendarPanel.vue` | **NUEVO tab** "Calendario IVA": selector de año, tabla CRUD de períodos (`period_no`, `range`, `vencimiento`, `descripción`), validaciones espejo (rango inválido, duplicado 400 amable), botón "generar bimestres" (client-side: 6 POSTs con `date_from/to` del año y vencimiento editable antes de enviar — patrón default UI de internación A-4) |
| `src/components/budget/planning/BudgetIngestionModal.vue` | nota en la zona Gastos: "El archivo debe incluir la columna `Con IVA` (Si/No) en la fila de encabezados. Archivos sin la columna: todos los gastos se asumen CON IVA (ajustable renglón a renglón)" |
| `src/services/budgetPlanningService.js` | `getIvaSettlement(idBudget, year?)`; `updatePlanningLine` ya parcial ⇒ acepta `has_iva` |
| `src/services/budgetRulesService.js` | CRUD `iva-period` (GET/POST/PUT/DELETE), espejo de los helpers de internment |
| `src/stores/budgetPlanningStore.js` | `ivaMode` por escenario + `settlementCache` + invalidación tras mutación de líneas (D-FE14-7: sin getter de totales brutos — cabecera y Ejecutiva siempre netas; el gross-up solo lo calcula el Flujo) |
| `src/stores/budgetRulesStore.js` | catálogo `ivaPeriods` live-sync (patrón payable/internment terms) |
| `src/components/budget/planning/planningFormat.js` | `IVA_RATE = 0.19`, helpers `withIva(neto, flag)` y `ivaOf(...)` — ÚNICA fuente local de la fórmula |
## 6. Criterios de aceptación (FE)

- **AC-FE14-1 (modo por defecto):** abrir `/budget/planning/126` con una sola línea de
  ingreso fijo 10.000.000 muestra en Cuadrícula IVA 1.900.000 y Total 11.900.000; al
  apagar el modo todo vuelve a los netos actuales byte-a-byte (cero regresión visual).
- **AC-FE14-2 (reactividad):** editar celda a 20.000.000 (PUT cell) o desmarcar `Con IVA`
  en un gasto (PUT line) ⇒ columnas, pivotes y panel Liquidación se recalculan sin
  recargar; el settlement se refetea (≤ 1 request nuevo, debounce 400 ms).
- **AC-FE14-3 (compras):** fixture compra 10.000.000 %int 10 términos int `+15 @ .6 /
  +45 @ .4`: bloque Pago a proveedores muestra las 2 cuotas NETAS del proveedor + 1 fila
  "IVA de importación" 1.727.272,73 en la fecha de compra; bloque Pago de internación
  muestra 649.090,91 y 432.727,27 (cuota + IVA). Σ salidas = 11.900.000,00 ± redondeo.
- **AC-FE14-4 (gastos):** gasto fijo "Despacho" flag No ⇒ fila con IVA "—" y su cuota no
  se gross-uppea; gasto con flag NULL ⇒ tratado como Con IVA (checkbox marcado con badge).
- **AC-FE14-5 (liquidación):** escenario 2027 con fixture de backend AC-BE10-4 ⇒ el panel
  muestra P1 pago 1.900.000 (venc. 21-may), P2 arrastre 2.500.000, P3 arrastre 500.000,
  P4 pago 3.000.000; el bloque del Flujo "Pago de liquidación de IVA" dibuja 1.900.000 en
  mayo y 3.000.000 en su mes; sin `iva_periods` ⇒ panel con aviso + CTA y Flujo sin bloque
  (no colapsa).
- **AC-FE14-6 (calendario):** alta de 6 bimestres con vencimientos; duplicado ⇒ 400
  message amable inline; edición en vivo visible en Liquidación al refetch; borrado ⇒
  settlement vuelve al estado "sin calendario" con warning.
- **AC-FE14-7 (ingesta):** subir archivo de gastos con columna `Con IVA` ⇒ los checkboxes
  salen fielmente en la cuadrícula; subir uno SIN columna ⇒ todos marcados con badge
  "asumido" y el flujo de creación no cambia.
- **AC-FE14-8 (Ejecutiva invariante, D-FE14-7):** alternar el modo "Neto / Con IVA" no
  cambia NI UNA cifra de la Vista Ejecutiva (bloques Ingresos, Costo de ventas, Gastos
  fijos, Gastos variables, P&G, Acumulado y todos los %) ni los Σ de cabecera: DOM y
  cifras byte-idénticos a FE-S4C con modo ON u OFF. El efecto IVA solo se observa en la
  Vista Flujo (y en las columnas informativas `IVA`/`Total` de la Cuadrícula).

## 7. NFR

| ID | Requisito |
|---|---|
| NFR-FE14-1 | Cero mutaciones: las cifras de IVA se derivan client-side (excepto la recurrencia de liquidación, que viene del BE); nada de re-fetch por celda |
| NFR-FE14-2 | Memoización O(#líneas) de las derivaciones por modo (AC-S7-FE-2 extendido); `settlement` cacheado e invalidado solo por mutaciones de líneas/calendario |
| NFR-FE14-3 | Degradación: error de red en settlement ⇒ bloque del Flujo y panel con nota "sin dato de liquidación" y botón reintento; nunca pantalla rota |
| NFR-FE14-4 | Accesibilidad y formato: checkbox etiquetado `Con IVA`, columnas monetarias con `formatMoney`, chips de warning con contraste AA; ESLint+Prettier limpios; dark mode |
| NFR-FE14-5 | Un solo release coordinado BE 02_20 + FE 03_14 (campo `has_iva` es aditivo; el panel exige el endpoint) |

## 8. Riesgos

| ID | Ítem |
|---|---|
| R-FE14-1 | Divergencia fórmula FE (presentación) vs BE (liquidación): mitigado con §4.1 espejo + `IVA_RATE` único + AC numéricos idénticos a backend.02_20 §9 |
| R-FE14-2 | El modo bruto puede confundir con el P&L real contable: el chip "Modo caja con IVA (proyectado)" y la nota re-semantizada D-4 lo aclaran; TODA la Vista Ejecutiva sigue sobre netos (D-FE14-7) |
| R-FE14-3 | Escenarios con cientos de líneas: el gross-up es O(n) memoizado; el único costo server es 1 request de settlement |
| R-FE14-4 | PQ abiertos heredados de backend.02_20 §8 (arrastres netos en modo bruto, reales vs proyectado) — UI los anticipa con el badge "v1" |