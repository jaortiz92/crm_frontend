# Spec `frontend.03_22` — Desagregación por Cuenta/Categoría en el pivote de movimientos por CECO

**Fecha:** 2026-10-26
**Componente:** `crm_frontend/src/components/budget/planning/CecoMovementPivot.vue`
**Helpers:** `crm_frontend/src/components/budget/planning/cecoMovements.js`
**Vista anfitriona:** `CecoDetailView.vue` (ruta `BudgetCecoDetail`, `/budget/planning/:idBudget/ceco/:costCenterCode`)
**Tabs afectados:** Causado (`caused`) y Flujo (`flow`) — comparten componente.
**Estado:** READ-ONLY — sin cambios de datos, sin backend, sin dependencias nuevas.

---

## 1. Problema y objetivo

Hoy el pivote de movimientos consolida todas las líneas en filas de grupo
**"Origen · Tipo"** (8 grupos: Presupuesto→Ingresos/Gastos/Compras, Nómina,
Financiación, Capital, Desembolsos, Arrastre — `GROUP_ROW_ORDER`). El usuario no
puede ver de dónde vienen los movimientos dentro de cada grupo.

**Objetivo:** añadir un segundo nivel de desagregación por
**Cuenta/Categoría** (`cost_component_code`) debajo de cada grupo, sin que
NINGUNA cifra cambie.

## 2. Alcance

### En alcance
- Pivote de ambos tabs del detalle por CECO.
- Jerarquía: *(1) grupo Origen·Tipo* → *(2) sub-filas por cuenta/categoría*.
- Expandir/colapsar por grupo y botones "Expandir todo" / "Contraer todo".

### Fuera de alcance
- `CecoMovementTable.vue` (RF-5.1 ya muestra Cuenta/Categoría por fila).
- `ExecutivePivotTable` / `CashFlowPivotTable`, backend, exportaciones, edición.

## 3. Requisitos funcionales

- **RF-22.1** Cada grupo renderiza sub-filas, una por cuenta/categoría distinta
  (`movement.cost_component_code`; vacío/`null` → bucket "— Sin cuenta/categoría —")
  presente en SUS movimientos, ordenadas alfabéticamente.
- **RF-22.2** La fila de cabecera "Origen · Tipo" conserva su subtotal = Σ de sus
  sub-filas (reusa la agregación vigente — no re-cálculo). `columnTotals` y
  `grandTotal` intactos.
- **RF-22.3** Expansión: por defecto TODO expandido. Chevron en la fila de
  cabecera ilumina/colapsa su grupo; botones "Expandir todo"/"Contraer todo"
  junto al label-header. Estado local (no persiste), reiniciado al cambiar
  `:idBudget`/`:costCenterCode`/tab.
- **RF-22.4** Al colapsar, las sub-filas se ocultan pero el subtotal del grupo
  SIGUE visible y sumando.
- **RF-22.5** Etiqueta de la primera columna: `Origen · Tipo · Cuenta/Categoría`.
  Sub-filas con sangría (`padding-left` + prefijo `└`); fila de grupo en negrita.
- **RF-22.6** Ambos tabs y el filtro "Tipo de línea" existente operan igual: la
  jerarquía se calcula SOBRE los movimientos ya filtrados por el estado vigente.
- **RF-22.9** Los buckets especiales ("Sin fecha de pago" del tab Flujo,
  Antes/Después de {N}, Total) se desagregan igual: cada sub-fila hereda su
  posicionamiento de `movementAmount`/`causedMonthOf`/`flowMonthOf` línea a línea.

## 4. Diseño visual

```
Origen · Tipo · Cuenta/Categoría   Ene Feb … Dic  Antes  Después  Total
▾ Presupuesto → Ingresos          [subtotal siempre visible]
   └ 51200 · Fletes                ·   45    …
   └ 51300 · Papelería             ·    7    …
▸ Nómina                          [subtotal]
```

## 5. Reglas de negocio

- **BR-22-1** `grandTotal`/`columnTotals` NO cambian en ningún estado (la
  jerarquía es presentación pura).
- **BR-22-2** Σ sub-filas de un grupo ≡ subtotal del grupo (byte-cuadre, Q4=4).
- **BR-22-3** El bucket "— Sin cuenta/categoría —" solo aparece si el grupo tiene
  movimientos sin `cost_component_code`.
- **BR-22-4** Si un grupo tiene UNA sola cuenta, la sub-fila igual se muestra.

## 6. No funcionales

- **NFR-22-1** Reactividad intacta: la jerarquía cuelga de los mismos `computed`
  del store — el PUT en vivo del Editor sigue actualizando sin refetch.
- **NFR-22-2** `<colgroup>` + `table-layout: fixed` (RF-1 de FE-S18) intactos:
  solo cambia el contenido de la primera celda, no el layout.
- **NFR-22-3** CSS nativo en `<style scoped>`; cero dependencias nuevas.

## 7. Criterios de aceptación

- **AC-1** `/budget/planning/576/ceco/510100?tab=flow` muestra sub-filas por
  Cuenta/Categoría bajo cada grupo, todas expandidas por defecto.
- **AC-2** Σ (sub-filas visibles u ocultas) = subtotal de grupo = cifra vigente
  pre-cambio (byte-idéntico).
- **AC-3** Chevron alterna visibilidad; el subtotal del grupo nunca desaparece.
- **AC-4** "Contraer todo" deja el DOM de filas exactamente igual al estado
  vigente (misma cantidad de `<tr>` que antes del cambio).
- **AC-5** Tab Causado recibe la misma jerarquía con los montos de causación.
- **AC-6** Tooltips `title` de las cifras funcionan también en sub-filas.
- **AC-7** Accesibilidad: chevron con `aria-expanded`, `Enter`/`Space` togglean.
- **AC-8** `npm run lint` pasa; archivos tocados: solo `CecoMovementPivot.vue`
  y `cecoMovements.js` (+ opcional `PivotMonthTable.vue` si el header del label
  vive allí).

## 8. Notas de implementación

- Punto único de lógica: añadir en `cecoMovements.js` un helper puro
  (p. ej. `movementAccountKeyOf(movement)`) que devuelve la clave de cuenta
  (`cost_component_code` normalizado, `''` para el bucket "Sin cuenta").
  La agrupación jerárquica la construye `CecoMovementPivot.vue` en su `grouped`
  computed existente, partiendo de los movimientos ya clasificados por
  `movementGroupOf`.
- El label-header actual es `label-header="Origen · Tipo"` — cambiarlo a
  `Origen · Tipo · Cuenta/Categoría` en el lugar donde se pasa a
  `PivotMonthTable`.
