# Spec Frontend: Colaboradores (nómina Colombia) — maestro, importador de plantilla nómina, desglose de costo y parámetros laborales

| Campo | Valor |
|---|---|
| **ID de feature** | `FE-S15-COLLAB` |
| **Spec counterpart** | BE: `backend.02_21` (BE-S11-COLLABORATORS) — consume sus contratos (§9 de esa spec; espejo en §4 de esta) |
| **Bases** | `03_01` (upload center — patrón de ingesta/errores estructurados), `03_02` (`BudgetRulesView` — tab nuevo espejo "Calendario IVA"/`03_14` D-FE14-5), `03_06` (line manager — patrón de modales de formulario), `03_12` (compras — tabla `invalid_rows`), `03_03/03_04` (cuadrícula/flujo: las líneas del motor YA fluyen por ahí sin cambios) |
| **Componentes nuevos** | `CollaboratorsView.vue`, `CollaboratorFormModal.vue`, `CollaboratorImportPanel.vue`, `CollaboratorBreakdownModal.vue`, `CollaboratorProvisionsPanel.vue`, `LaborParamsPanel.vue` (tab en BudgetRulesView) |
| **Convenciones** | `<script setup>` JS-only (sin TypeScript), alias `@`, Axios `@/plugins/axios` (JWT auto), refs/composables locales — **sin store Pinia nuevo** (v1, el dominio no es compartido entre vistas), formato COP `Intl` `es-CO` |
| **Fecha** | 2026-09-23 |

---

## 1. Problema y objetivo

Hoy el usuario de presupuesto digita **a mano** el costo total de los colaboradores dentro de la plantilla/vista de gastos, y ese número aplasta la realidad laboral colombiana (salario + auxilios + seguridad social + parafiscales que se pagan ya, y prima/cesantías/intereses que se causan hoy y se pagan después). El backend (BE-S11) ya calcula todo; el objetivo FE es: **administrar el maestro de colaboradores, importar la plantilla separada de nómina, y hacer visible el desglose** (capa CAJA vs. PROVISIÓN, fechas legales de pago, saldos provisionados) para que quien revise el presupuesto entienda de dónde sale cada línea — sin que nadie vuelva a escribir un costo total.

Principio rector (**D-FE15-1**): a diferencia del IVA (FE-S14, derivación client-side), el FE **NUNCA calcula nada de nómina** — solo presenta cifras que llegan del motor, para que la fuente de verdad tarifaria sea única (BE §5).

## 2. Alcance

**Incluye:** (1) vista `Colaboradores` (listado con búsqueda/filtros, alta/edición manual, cambio salarial con vigencia, terminar contrato con preview de liquidación); (2) panel importador de la plantilla "Solicitud Presupuesto Nómina/Colaboradores" con reporte de filas inválidas y resumen de upsert; (3) modal de desglose por mes (CAJA/PROVISIÓN + fecha de pago proyectada + vigencia de parámetros usada); (4) panel de provisiones (saldos prima/cesantías/intereses); (5) acción "recalcular mes" con scope colaborador/CECO; (6) tab **Parámetros laborales** en `BudgetRulesView` (selector de vigencia + edición de claves/tarifas/ARL/fechas).
**Excluye (v1):** vista analítica "costo anual por centro de costo" (OQ-02, sprint 2); edición de catálogo `cost_components` (solo lectura de activos, BE §9); descarga auto-generada de la plantilla (sigue siendo archivo entregado por email — mismo PQ pendiente de compras, registrar PQ-FE-1); máscaras parciales de salario por campo (el masking es binario por rol, D-S11-7); edición de líneas `budget_lines` que provienen del motor (ver D-FE15-7: se muestran bloqueadas con candado).

## 3. Registro de decisiones

| ID | Decisión |
|---|---|
| D-FE15-1 | **FE sin fórmulas de nómina**: todos los importes, prorrateos y fechas vienen del BE. Única constante espejo permitida: etiquetas de componentes (`componentLabels.js`) — cosmética, no aritmética |
| D-FE15-2 | Importador **dentro de CollaboratorsView** (panel colapsable propio), NO en el upload center de planning (03_01): la plantilla nómina es flujo de maestro+proyección, no de cargue de escenario mensual; se reutiliza solo el patrón visual de resultados/`invalid_rows` |
| D-FE15-3 | El desglose se presenta como **tabla por componente con badge de capa**: CAJA (pago este mes) y PROVISION (se paga el {fecha legal}) — hace tangible el concepto que motivó el feature (A-04) |
| D-FE15-4 | Parámetros laborales = **tab en BudgetRulesView** (dato de compañía, no de escenario — espejo de D-FE14-5). Con selector de vigencia; si la vigencia no existe, botón "duplicar año anterior" (GET params año prev → PUT año nuevo, edición antes de guardar) |
| D-FE15-5 | **Masking binario por rol** (BE D-S11-7): con `salary_masked:true` el FE oculta salario, desglose y provisiones (textos "— (restringido)") y deshabilita el importador (403 en BE lo refuerza). No hay modo "ver detalle parcial" |
| D-FE15-6 | Cambio salarial SIEMPRE como evento "nuevo plan con vigencia" (POST salary-plan): el modal maestro muestra el campo salario como "salario vigente (actual)" + botón "Registrar aumento" con fecha — nunca edición en línea del histórico (BR-COLLAB-02) |
| D-FE15-7 | Las líneas del motor conviven en la Cuadrícula/Flujo normales (03_03/03_04) pero se marcan con chip "Nómina": al abrirlas en el line manager, `id_collaborator` poblado ⇒ formulario en modo lectura con nota "generada por el motor — se regenera con el import/recálculo" (edición manual sería pisada por R-13). **Implementación: revisión puntual en `LineFormModal`/grid existente (badge + readonly); sin cambios de contrato** |
| D-FE15-8 | Terminar contrato: modal de confirmación muestra **preview de liquidación** (GET breakdown mes del término ya la incluye como LIQ); el botón dispara POST terminate y luego refresa |
| D-FE15-9 | Ventana de proyección del motor (D-S11-8) es invisible: el usuario controla meses con "Recalcular" por CECO; el import siempre regenera ventana completa del colaborador (resumen lo informa) |

## 4. Contrato consumido (espejo BE-S11 §9; ruta base vía Axios)

| Uso UI | Petición | Nota |
|---|---|---|
| Listado | `GET /budget/collaborator?q=&id_cost_center=&status=&page=&size=` | items con `salary_masked` |
| Alta/edición maestro | `POST/PUT /budget/collaborator[/{id}]` | 409 doc duplicado → inline error |
| Aumento salarial | `POST /budget/collaborator/{id}/salary-plan` | cierra plan anterior (BE) |
| Terminar | `POST /budget/collaborator/{id}/terminate {termination_date}` | preview vía breakdown |
| Import | `POST /budget/collaborator/import` (multipart) | 200 resumen / 400 `invalid_rows[]` |
| Desglose mes | `GET /budget/collaborator/{id}/breakdown?month=` | `{components[], total_caja, total_provision, params_vigencia}` |
| Provisiones | `GET /budget/collaborator/{id}/provisions` | `{balances[]}` |
| Recalcular | `POST /budget/collaborator/recalculate` | `{replaced_lines}` → toast |
| Parámetros | `GET/PUT /budget/labor-params?vigencia=` | solo admin (D-FE15-4) |
| Catálogo | `GET /budget/cost-components` | nombres/badges; oculta `is_active=false` |

## 5. Componentes y archivos nuevos/cambiados

```
src/views/budget/CollaboratorsView.vue        NUEVO — página maestro
  ├─ toolbar: buscador, filtro CECO (select existente), filtro estado, botón [Importar plantilla],
  │           botón [Nuevo colaborador] (si role ∈ edit), [Recalcular…]
  ├─ tabla: documento | nombre | contrato | CECO | temporada | estado (badge ACTIVO/TERMINADO) |
  │         salario vigente (o "restringido") | [Desglose] [Provisiones] [Editar] [Terminar]
  ├─ <CollaboratorImportPanel/> (colapsable, D-FE15-2)
  └─ paginación servidor (patrón listado existing de budget)
src/views/budget/components/CollaboratorFormModal.vue       NUEVO — create/edit + "Registrar aumento"
src/views/budget/components/CollaboratorImportPanel.vue     NUEVO — file input .xlsx → POST import;
  │   estados: subiendo | 400: tabla "Fila Excel / Motivo" (copia patrón invalid_rows de compras 03_12)
  └       200: resumen chips {created, updated, no_change, generated_lines} + botón [Ir al escenario]
src/views/budget/components/CollaboratorBreakdownModal.vue  NUEVO — selector mes (12 meses del año de
  │   escenario) → tabla componentes: badge CAJA/PROVISION, monto (Intl COP), fecha pago proyectada;
  └   filas totales Σ CAJA · Σ PROVISIÓN · costo total del mes; pie: "parámetros vigencia {n}"
src/views/budget/components/CollaboratorProvisionsPanel.vue NUEVO — 3 cards PRIMA/CESANTIAS/INTERESES
  │   con accrued/paid/saldo y próxima fecha legal; vacío elegante si servicio/terminado
  └──
src/views/budget/LaborParamsPanel.vue                       NUEVO — tab en BudgetRulesView (D-FE15-4):
      selector vigencia (año) → grid editable de claves (§4.3 BE: SMLV, auxilio, %, fechas, parafiscales
      enum, dia_pago), tabla ARL I–V, botón [Guardar] (PUT), [Duplicar año anterior]; banner rojo si
      GET 404 vigencia inexistente → "Créela antes de importar/recalcular" (cierra R-05 en UX)
src/router (ruta /budget/collaborators, nombre `collaborators`) + menú lateral sección Presupuesto:
  ítem "Colaboradores" (visible igual que reglas/costos)
src/views/budget/components/LineFormModal.vue   CAMBIO MÍNIMO — chip "Nómina" + readonly si
                                                `id_collaborator` != null (D-FE15-7)
src/utils/planningFormat.js                     suma (si no existe ya) helper `formatCOP(v)`
                                                `new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:2})`
```

Ruta y navegación: colaborador **no** es entidad de escenario; la vista vive bajo el área de presupuesto para que el acceso a CECO/temporada reutilice selectores existentes. Los badges de la Cuadrícula no añaden columnas (el `description` ya trae "{Componente} — {Nombre}").

## 6. Estados y flujos

- **Loading:** skeleton en tabla y modal desglose; import con spinner + bloqueo de doble submit (`uploading` flag).
- **Vacío:** sin colaboradores → CTA "Importe la plantilla de nómina o cree el primero".
- **400 invalid_rows:** el panel mantiene el archivo y muestra la tabla; mensaje "No se importó NADA (todo-o-nada). Corrija y vuelva a subir." (coherente con BR-04).
- **403 / salary_masked:** columna salario → "restringido"; acciones edit terminan deshabilitadas con tooltip (D-FE15-5).
- **404 vigencia:** banner del tab parámetros; import/recalc que la disparen muestran el `detail.message` del BE (BR-03) sin inventar texto propio.
- **Después de import/terminate/recalculate:** refrescar listado y, si había desglose abierto, re-consultar (los asientos cambian).
- **Confirmaciones destructivas:** terminar contrato (única acción irreversible del feature en UI) → doble confirmación con fecha y preview LIQ (D-FE15-8).

## 7. Reglas de presentación

1. Montos: `formatCOP` 2 decimales; totales Σ del desglose en negrita. Fechas `dd/mm/aaaa`.
2. Capa: `CAJA` azul (etiqueta "paga este mes"), `PROVISION` ámbar (etiqueta "paga {fecha_legal}") — la palabra "provisión" se define en tooltip: "causada hoy, pagada en fecha legal".
3. Estados del maestro: `active` verde / `terminated` gris.
4. Préstamo cero en UI: textos de ayuda del importador dicen explícitamente **"Capture solo el salario; el sistema calcula auxilio, seguridad social, parafiscales y provisiones"** (refuerzo de A-01/R-08).
5. Idiario de la plantilla: los selectores de `Tipo de Contrato` del formulario replican las 4 opciones mapeadas por el BE (tabla §6 de 02_21) para que UI y plantilla nunca diverjan; etiquetas en español, valores enviados = enum BE.

## 8. NFR (lado FE)

| ID | Requisito |
|---|---|
| NFR-FE-1 | Listado < 500 ms percibidos (paginado servidor, página 25); desglose < 150 ms de requests + render sin cálculos locales (D-FE15-1) |
| NFR-FE-2 | LGPD (NFR-02 BE): el FE no cachea salarios en `localStorage`/stores; sin PDF/export masivo en v1 |
| NFR-FE-3 | Accesibilidad básica de tablas: headers `scope`, badges con texto (no solo color) |
| NFR-FE-4 | `npm run lint` + `npm run format` limpios (plugin vue3-essential + prettier) |

## 9. Criterios de aceptación (QA manual, dev :5173 ↔ :8003)

AC-FE-1: importar plantilla válida 5 filas → resumen `{created:5, generated_lines:≥5×12}` y las líneas aparecen filtrables en la Cuadrícula con chip "Nómina" (D-FE15-7). AC-FE-2: plantilla con 1 fila sin CECO → tabla fila/motivo, resumen inexistente, listado intacto (400). AC-FE-3: clic en [Desglose] de un colaborador dependiente → tabla muestra C1..C8 con montos y fecha de pago del mes, PRIMA/CESANTÍAS/INTERESES SOLO en meses con fecha legal (ene/jun/feb… con badge ámbar y fecha legal) y Σ calzan con AC-INT-2 del BE. AC-FE-4: colaborador de prestación de servicios → desglose con único renglón "Honorarios". AC-FE-5: cambio salarial vía "Registrar aumento" → breakdown de mes anterior al aumento conserva el salario viejo (vigencias, BR-02). AC-FE-6: [Terminar] → preview LIQ, confirmar, estado TERMINADO, breakdown de mes siguiente = vacío. AC-FE-7: usuario sin permiso → salario "restringido", breakdown 403 → modal con mensaje, importador oculto. AC-FE-8: vigencia sin parámetros → banner rojo en tab y error al recalcular con `detail.message` visible. AC-FE-9: reimportar mismo archivo → resumen `no_change` y cero líneas duplicadas (verificado en Cuadrícula). AC-FE-10: `npm run lint` pasa; sin TS en componentes nuevos.

**Estrategia:** QA manual sobre plantilla real + casos AC (no hay suite FE); el cuadre numérico se valida en BE (pytest de motor). Se recomienda registrar screenshots de desglose/liquidación para el taller con contabilidad.

## 10. Fuera de alcance / futuros

OQ-02: vista analítica "costo nómina por CECO/mes" en Analytics (dependería de `id_collaborator`+`cost_component_code` ya poblados ⇒ sin DDL extra). PQ-FE-1: descarga auto-generada de la plantilla de nómina desde la UI. Edición de componentes extralegales (activar PRE_EXTRALEGAL/VAC_COMPENSATORIO) desde UI. Reconceptualización del masking con permisos finos cuando exista RBAC granular (OQ-BE-2).

## 11. Trazabilidad

D-FE15-1→BE §5 (fuente única); D-FE15-2→A-13 (plantilla separada); D-FE15-3→A-04; D-FE15-4→A-02/A-11; D-FE15-5→A-01/NFR-02; D-FE15-6→BR-02; D-FE15-7→A-08/R-13; D-FE15-8→BE §5.5. Componentes→sección BE consumida: §4 de esta spec. Contraparte: `backend.02_21_Spec_Backend_budgets_collaborators_nomina.md`.

---

## 12. ENMIENDA 2026-09-28 (Opción C + A) — descubribilidad del flujo de nómina

Respuesta al hallazgo stakeholder "al cargar un presupuesto no está la plantilla de
colaboradores": el import NO se mueve al upload center (A-13/D-FE15-2 se mantiene —
la nómina es maestro global, no requisición de borrador); se añaden tres superficies
de puente contra la enmienda BE backend.02_21 §15 (D-S11-10/11/12):

| ID | Decisión |
|---|---|
| D-FE15-10 | `BudgetIngestionModal` (creación del presupuesto base): nota fija bajo la 3.ª zona de drop — "La nómina de colaboradores no se carga aquí: se importa en [Colaboradores] y el sistema la proyecta en este escenario automáticamente" con `RouterLink` a `BudgetCollaborators`. Sin cuarto dropzone. |
| D-FE15-11 | `BudgetGridEditor`: banner ámbar (post-`</header>`, `role="status"`) alimentado por `GET /budget/collaborator/materialization-status?year=` (auth simple; solo conteos — sin `salary_masked`). Aparece SOLO si escenario `active` + `needs_materialization`; texto con `collaborators_with_open_plan`; acción [Proyectar nómina ahora] → `POST recalculate {month: `${year}-01`}` (ancla enero = ventana completa del año; R-13) → toast con `created_lines` + `warnings[0]` si los hay → `load(true)`. Consulta silenciosa en `load()` exitoso; 403/red no banner (degrada invisible). |
| D-FE15-12 | `SetTargetConfirmModal`: el toast de éxito se extiende con el campo BE `payroll_lines_created` ("Nómina proyectada automáticamente: N líneas.") — el `data` ya viajaba del store (`setTarget → {ok, data}`); None/backend viejo = sin nota. |

Service: `fetchMaterializationStatus(year)` en `budgetCollaboratorService.js`.
Estados nuevos: banner solo activo+needs; tras proyectar, re-check implícito por
`load(true)→checkPayrollStatus()`. AC nuevos: AC-FE-11 (nota visible en modal de
ingesta con deep-link funcional); AC-FE-12 (import nómina → crear escenario 2027 →
marcar meta → sin banner (materializado) y toast con conteo; AC-FE-13 (borrar las
líneas del motor en BD → reabrir escenario → banner → [Proyectar] → 0 líneas →
banner desaparece). Lint/build verificados 2026-09-28 (prettier: bloques propios
limpios; el bloque preexistente FE-S14 del modal de ingesta queda dirty como en HEAD).
