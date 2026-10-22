# Spec Frontend: Seleccion de Saldo Inicial (Efectivo y Bodega) al Crear/Editar un Presupuesto de Planificacion

| Campo | Valor |
|---|---|
| **ID de feature** | `FE-S7-INITBAL` |
| **Version** | 1.1 -- 2026-10-22 |
| **Base** | FE-S4 (`frontend.03_03_Spec_frontend_budget_planning.md` + `frontend.03_04` vista flujo), FE-S6 (`frontend.03_09_Spec_frontend_planning_carryover.md`) y FE bodega (`frontend.03_12_Spec_frontend_budget_planning_purchases_bodega.md`). |
| **Contrato** | Consume el contrato de `crm_backend/spec/backend.02_25_Spec_Backend_budgets_planning_initial_balance.md` (BE-S7-INITBAL). Verificar contra el codigo BACKEND final, no solo el spec, ante cualquier desviacion puntual. |
| **Componentes** | MODIFICAN `src/components/budget/planning/BudgetIngestionModal.vue` (seccion saldos), `src/views/budget/planning/BudgetGridEditor.vue` (entrada de config + modal de saldo inicial), `src/services/budgetPlanningService.js` (3 llamadas nuevas), `src/stores/budgetPlanningStore.js` (estado). NUEVO `src/components/budget/planning/InitialBalanceModal.vue` (opcional, o dibujado inline en el editor si es mas simple). |
| **Dependencias** | BE-S7 implementado (o endpoints presentes). Sin librerias nuevas (JS puro + Composition API, sin TypeScript). |

---

> **ENMIENDA v1.1 (2026-10-22) — SD7-FE-1..4:** consume el contrato v1.1 del BE (`backend.02_25` SD7-10): el GET de initial-balance resuelve `carryover_source` SIEMPRE (independiente de los modos). Fix del falso aviso del escenario 126; defaults de creación en `carryover` (mejora aprobada A); acople del pill de arrastre con los saldos nunca configurados (mejora aprobada B); tooltip de ceco en las tablas de arrastre (bug). Detalle en el Decision Log (§8.1) y en RF-FE-01/05/09.

## 1. Objetivo

Que el usuario, al crear un presupuesto (`/budget/planning/`, modal "Presupuesto Base" de `BudgetIngestionModal.vue`) y a posteriori con el presupuesto ya creado (`/budget/planning/:idBudget/`, `BudgetGridEditor.vue`), pueda definir **por separado** para el saldo inicial de efectivo y para el saldo inicial de bodega:

1. **Continuar con el saldo del presupuesto meta del ano anterior** (modo `carryover`), o
2. **Agregar el saldo manualmente** (modo `manual`).

El BE persiste la eleccion y los valores manuales. El FE deriva el valor efectivo por arrastre usando su propio motor (single source of truth de las formulas).

## 2. Reglas funcionales

- **RF-FE-01 (creacion):** el modal de ingestion muestra una seccion "Saldos iniciales" con dos bloques independientes: "Saldo inicial de efectivo" y "Saldo inicial de bodega". Cada bloque ofrece 2 opciones exclusivas (radios):
  - "Continuar con el presupuesto meta del ano anterior" => `mode: carryover`,
  - "Agregar manualmente" => `mode: manual` + input numerico HABILITADO.
  Si el modo es `carryover`, el input manual va deshabilitado (y viceversa). **ENMIENDA v1.1 (SD7-FE-2, mejora aprobada A):** defaults del form = `carryover` en AMBOS saldos (la degradacion a manual no es bloqueo: si el ano N−1 no tiene fuente, el saldo podra ingresarse manualmente despues desde el editor — RF-FE-05), con nota/subtexto visible literal: "Tomara el saldo de cierre (enero Diciembre) del presupuesto meta del ano anterior; si no existe, podra ingresarlo manualmente despues."
- **RF-FE-02 (envio):** al submit del modal, agregar al multipart de `uploadScenario()` los 4 campos: `initial_cash_mode`, `initial_cash_manual`, `initial_warehouse_mode`, `initial_warehouse_manual`.
- **RF-FE-03 (config posterior):** `BudgetGridEditor.vue` ofrece una entrada visible (chip "Saldo inicial" en la cabecera, junto al control de arrastre existente) que abre un modal de configuracion con la misma forma RF-FE-01 (2 bloques co-editables) precargada via `GET /budget/planning/{id}/initial-balance`. Al guardar => `PUT .../initial-balance` con el body completo de la seccion 5.1 del BE => toast de exito => refetch del flujo/bodega para re-seed.
- **RF-FE-04 (derivacion carryover, FE es la autoridad):** si el modo efectivo de un saldo es `carryover` y `carryover_source` tiene valor:
  - Efectivo: valor inicial = acumulado/saldo de cierre de diciembre (anio N-1) del escenario fuente, calculado con el mismo motor del flujo de caja (`cashFlowPivot`) corrido sobre los datos del escenario fuente.
  - Bodega: valor inicial = `bodega[dic N-1]` del escenario fuente con la MISMA formula del motor (`bodega[m] = bodega[m-1] + compras[m] - costoCausado[m]`), corrida sobre compras y costo causado del escenario fuente.
  - Los datos del escenario fuente se obtienen por los endpoints existentes (los mismos que poblaron la grilla de ese escenario); NO se agregan endpoints nuevos en FE (de no existir una ruta re-usable, reutilizar la que ya usa la app para cargar un escenario por su id; documentar en codigo).
  - El valor derivado NO se persiste (dinamico, igual que las lineas de arrastre de FE-S6).
- **RF-FE-05 (degradacion sin fuente):** **ENMIENDA v1.1 (SD7-FE-1, fix 126):** la UNICA senal de indisponibilidad es `unavailable_reason === "no_source"` (el GET v1.1 del BE resuelve `carryover_source` SIEMPRE, incluso con ambos modos manual — `carryover_source === null` ya NO es, por si sola, degradacion). Si el modo de un saldo es `carryover` y el GET fresco dice `no_source`: NO bloquea; muestra para ese saldo una nota/chip de tipo warning: "Sin presupuesto meta del ano anterior con saldo calculable. Registre el saldo manualmente." y el valor efectivo sera el del input manual (habilitado temporalmente). Visualmente diferenciado (tono warning). El warning real conserva fire-once y NUNCA gasta consultas de derivacion; con fuente resuelta en el GET nunca aparece.
- **RF-FE-09 (acope pildora→saldos, SD7-FE-3 — mejora aprobada B):** cuando el usuario ACTIVA el toggle `include_carryover` de la cabecera y AMBOS modos de saldo inicial son `manual` con `manual_value === 0` (nunca configurados, verificado contra un GET FRESCO), el FE auto-guarda la config como ambos `carryover` via el PUT existente de initial-balance (`setInitialBalance`, mismo flujo que `saveInitialBalance`) + toast "Saldos iniciales sincronizados con el presupuesto meta del ano anterior." Con config expresa (manual no-cero o carryover) NO se toca nada; al DESACTIVAR el pildo no se toca nunca. Ortogonalidad conservada (RF-FE-08): el acople es solo-disparo-al-activar, ida sin vuelta.
- **RF-FE-06 (seeding):** el valor efectivo inicial de efectivo siembra el acumulado del flujo de N desde el primer mes; el de bodega siembra `bodega[0]` (antes de compras/costo de enero): `bodega[1] = valorInicialDisponible + compras[1] - costoCausado[1]`, preservando la formula existente para los meses siguientes. Con modos `manual`/`0` el resultado es identico al comportamiento previo.
- **RF-FE-07 (validaciones):** bodega manual exige valor `>= 0` (bloquea input submit y muestra error inline); efectivo manual permite negativos; campos numericos finitos. Espejar la validacion del BE para que el error aparezca temprano en la UI, y ademas manejar el 422 del backend con mensaje textual.
- **RF-FE-08 (ortogonalidad):** la config de saldo inicial es independiente del toggle de arrastre (`include_carryover`) existente en la cabecera: coexisten, ninguno altera al otro en la UI ni en la logica.

## 3. Contracto de servicio (`budgetPlanningService.js`)

```js
// GET /budget/planning/{id}/initial-balance
getInitialBalance(idBudget) -> {
  cash: { mode, manual_value },
  warehouse: { mode, manual_value },
  carryover_source: { id_budget, budget_name, budget_year, status } | null,
  unavailable_reason: "no_source" | null
}
// PUT /budget/planning/{id}/initial-balance  body => { cash: {mode, manual_value}, warehouse: {mode, manual_value} }
setInitialBalance(idBudget, payload)
// + extension de uploadScenario() con los 4 campos multipart (RF-FE-02)
```

- Nombres respetando el contrato exacto del BE (verificar contra el backend implementado). Sin slash final. El manejo de 404/422 usa el patron de deteccion de errores ya existente del modulo (axios/Exceptions).

## 4. Estado (`budgetPlanningStore.js`)

- `initialBalance: null` (objeto del GET cuando cargado), `initialBalanceLoading`, `savingInitialBalance` y errores equivalentes. El modal del editor lee/escribe via store; el flujo de derivacion (RF-FE-04) accede via store o props: definir al implementar sin inventar stores nuevos.

## 5. UX resumida

- La seccion del modal de creacion vive despues del bloque "presupuesto base" y antes de los archivos Excel; estilo igual a los controles del modal.
- En `BudgetGridEditor.vue`: chip "Saldo inicial" con icono de dinero, junto al pill de arrastre existente (RF-FE-08); indicadores: `(manual)` / `(N-1)` y toast cuando `no_source`.
- El modal de config pone el valor efectivo resultante como valor solo-lectura ("Tomara este valor: X (derivado de Presupuesto 2025 | manual)") para evitar confusiones del usuario (riesgo R-S7-2 del BE).
- Cambiar el modo a `manual` requiere confirmacion en la UI (ya que lo derivado ha de re-encajarse con valor manual).

## 6. Criterios de aceptacion (smoke FE)

- **AC-S7-FE-1 (v1.1):** en la creacion: ambos saldos por defecto son "carryover" (nota visible literal); elegir manual => viaja el valor del input; el submit envia siempre los 4 multipart (el `manual_value` viaja tambien en modo carryover — BR-IB-01 del BE) y el flujo/bodega de N arrancan con la config elegida (RF-FE-06).
- **AC-S7-FE-2:** en `/budget/planning/:idBudget/`: el chip "Saldo inicial" muestra la config vigente; abrir modal => GET, cambiar y guardar => PUT + refetch (persistente reload a reload).
- **AC-S7-FE-3:** modo carryover con fuente => el flujo usa el cierre de dic N-1 del escenario fuente como saldo de enero, y bodega igual con su formula (RF-FE-04/06).
- **AC-S7-FE-4 (v1.1):** con `unavailable_reason === "no_source"` => claves/contenido warning de RF-FE-05, flujo usa el manual y sigue operable; con fuente resuelta en el GET (v1.1: incluso con ambos manual) => NUNCA aparece el falso aviso (escenario 126).
- **AC-S7-FE-5:** bodega manual negativa => bloqueada (AC BE mirror), efectivo negativo => operable.
- **AC-S7-FE-6:** togglear arrastre (`include_carryover`) no altera la config de saldo inicial y viceversa, salvo el auto-acope RF-FE-09 (activar pildo con saldos manual/0).
- **AC-S7-FE-7:** con ambos en manual explícito no-cero el comportamiento del flujo/bodega es byte-identico al configurado (el seeding aplica igual con el manual persistido).
- **AC-S7-FE-8 (v1.1, SD7-FE-1):** activar el saldo inicial en modo carryover sobre el planing 126 (fuente = 576 active) NO muestra el warning falso y el preview "Tomara este valor" recobra el derivado "X (derivado de {budget_name})" del cierre de dic 2026 (o "Derivando…" hasta que termine); `unavailable_reason === "no_source"` es la unica via de degradacion.
- **AC-S7-FE-9 (v1.1, SD7-FE-2):** al abrir el modal de creacion ambos radios arrancan en "Continuar con el presupuesto meta del ano anterior" con los inputs deshabilitados y la nota approvebida; elegir manual habilita el input.
- **AC-S7-FE-10 (v1.1, SD7-FE-3):** activar el pill `include_carryover` con saldos manual/0 => auto-guardados ambos `carryover` + toast literal; con config expresa (manual no-cero o carryover ya) nada cambia; desactivar el pill no toca los saldos.
- **AC-S7-FE-11 (v1.1, SD7-FE-4):** en las filas de arrastre de la Vista Flujo (materiales `← N-1` y derivadas `cogs`/`compras`/`internacion`), el tooltip del rotulo muestra el nombre completo del ceco (cseguido de la nota de origen), igual que los bloques propios.

## 7. Checklist de implementacion

1. `budgetPlanningService.js`: getInitialBalance / setInitialBalance / uploadScenario extendido.
2. Store: estado de initial-balance.
3. `BudgetIngestionModal.vue`: seccion saldos iniciales (RF-FE-01/02).
4. `BudgetGridEditor.vue` (+ componente de modal si aplica): config post-creacion, derivacion carryover (RF-FE-03..05) y seeding del flujo/bodega (RF-FE-06).
5. Lint/format (`npm run lint`) + smoke AC-S7-FE-1..7 contra BE-S7 operativo.

---

## 8. Decision Log FE (enmienda v1.1, sesion 2026-10-22)

| ID | Decision | Origen (suposicion aprobada) |
|---|---|---|
| SD7-FE-1 | El criterio de disponibilidad "sin fuente" es SOLO `unavailable_reason === "no_source"` (el GET v1.1 resuelve `carryover_source` siempre); al cambiar un radio a `carryover` dentro del modal, se re-pide el GET forzado y, con fuente, se deriva inmediatamente (`refreshInitialBalanceAvailability` → `ensureInitialBalanceDerived`); el resultado queda cacheado y el preview recobra "X (derivado de {budget_name})", "Derivando…" mientras. El warning real es fire-once y no gasta derivación. | Enmienda v1.1 del BE (SD7-10) + reporte UX del presupuesto 126 (falsa advertencia con ambos manual + fuente 576 active) |
| SD7-FE-2 | Defaults de CREACION en `carryover` para ambos saldos (input manual deshabilitado hasta elegir manual) + nota/subtexto literal aprobado: "Tomara el saldo de cierre (enero Diciembre) del presupuesto meta del ano anterior; si no existe, podra ingresarlo manualmente despues." | Mejora aprobada por el stakeholder (mejora A, 2026-10-22) |
| SD7-FE-3 | Acople pildora→saldos: ACTIVAR `include_carryover` con ambos saldos `manual`/`0` (GET fresco) auto-guarda la config ambos `carryover` via el PUT existente + toast literal; con config expresa no se toca; DESACTIVAR no toca nada. | Mejora aprobada por el stakeholder (mejora B, 2026-10-22) |
| SD7-FE-4 | Fix tooltip ceco: en las tablas de arrastre N−1 de la Vista Flujo el `title` del rotulo encabeza SIEMPRE con el nombre completo del ceco (`row.label` ya resuelto por el catálogo A5 en `buildCarryPivot`), con la nota de origen detras — sin lookups nuevos (usaba solo la nota de origen y ocultaba el nombre). | Bug reportado por el stakeholder (2026-10-22) |



