# frontend.03_24 — Spec Frontend: Nómina — Flag "Cotiza pensión" y política fiscal de parafiscales

**Módulo:** budget / colaboradores + parámetros de nómina · **Fecha:** 2026-11-10 · **v1.0**
**Spec par:** `crm_backend/spec/backend.02_27_Spec_Backend_budgets_nomina_flag_pension_parafiscales.md`

## 1. Resumen

1. Nuevo control **"Cotiza pensión"** en el formulario de colaborador (`CollaboratorFormModal.vue`), vinculado al campo `pays_pension` (default true) que expone el backend (ver spec par: schemas `CollaboratorCreate/Update/Out`).
2. Nuevos controles **"Liquidar SENA / ICBF / CAJA"** en `LaborParamsPanel.vue`, visibles cuando `aplicacion_parafiscales == "custom"`, mapeando los parámetros anuales `liquidar_sena`, `liquidar_icbf`, `liquidar_caja` (valores `"1"`/`"0"` en `labor_cost_parameters`).

## 2. Alcance

**In:** `src/components/budget/collaborator/CollaboratorFormModal.vue`; `src/components/budget/rules/LaborParamsPanel.vue`; passthrough de campos en `src/services/budgetCollaboratorService.js` y payloads de parámetros.
**Out:** `CollaboratorImportPanel.vue` (opcional: texto/ayuda de la nueva columna); cualquier lógica ajena a colaboradores/parámetros.

## 3. Requerimientos

**FR-F1 — Formulario de colaborador:**
- Switch "Cotiza pensión" en `CollaboratorFormModal.vue`, sección de datos laborales; default `true`.
- Estado inicial tomado del `CollaboratorOut` (si el backend aún no envía el campo, usar `true`).
- Se envía en crear/editar colaborador (`budgetCollaboratorService.js`) como `pays_pension: boolean`.
- Ayuda contextual: "Si se desactiva, el motor no liquida el aporte patronal de pensión (C_PENSION); salud, ARL, caja y provisiones no cambian".

**FR-F2 — Parámetros de nómina (`LaborParamsPanel.vue`):**
- El select `aplicacion_parafiscales` debe incluir la opción `custom` (si hoy no está listada, agregarla).
- Modo = `custom` => mostrar 3 toggles: "Liquidar SENA", "Liquidar ICBF", "Liquidar CAJA", ligados a `liquidar_sena` / `liquidar_icbf` / `liquidar_caja` de la vigencia activa; persisten vía los upserts de parámetros existentes (`LaborParameterUpsert`).
- OFF => `"0"`; ON => `"1"`. Modo distinto de custom => ocultar los toggles SIN tocar sus valores guardados.
- Ayuda contextual: "Solo aplica con modo custom; los otros modos ignoran estos valores" + "exonerated_lt100 exonera SENA/ICBF para IBC < 10 SMLV (Ley 1780/2016); CAJA siempre se liquida".

**FR-F3 — Importador (opcional):**
- En `CollaboratorImportPanel.vue`, si se enumeran columnas de la plantilla, agregar "Cotiza pension" como opcional (vacía => SÍ). No es bloqueante.

**FR-F4 — Tope de exoneración (enmienda 2026-11-10):**
- En `LaborParamsPanel.vue`, cuando `aplicacion_parafiscales == "exonerated_lt100"`, mostrar campo editable "Tope de exoneración (SMLV)" ligado a la clave anual `parafiscales_tope_exoneracion_smlv` de `labor_cost_parameters`.
- Default `"10"` cuando el BE aún no guarda la clave (valor legal actual, Ley 1780/2016); así el save siempre puede completarla (el BE exige la clave con el guard R-05 / `MissingLaborParametersError` en este modo).
- Persistencia vía el upsert existente (`LaborParameterUpsert`, PUT `/budget/labor-params`): texto decimal normalizado (trim, coma→punto), ej. `"10"`; el motor lo parsea con `_param_dec`.
- Validación pre-red (patrón `gridInvalid`/error inline): en modo exonerado la clave es obligatoria y debe ser numérica > 0; un draft inválido bloquea el Guardar y no se envía.
- Modo distinto de exonerated_lt100 ⇒ el campo se oculta y la clave se OMITE del payload (no toca el valor guardado, mismo patrón que `liquidar_*` en FR-F2).
- Ayuda contextual: "SENA e ICBF se liquidan únicamente si el IBC del mes es ≥ este tope × SMLV de la vigencia (ej. 10). CAJA se liquida siempre."
- El flujo "Duplicar año anterior" hereda la clave si el BE la responde para la vigencia previa (`hydrate` la toma); si no, queda el default "10".

## 4. Validación

- `npm run lint` sin errores nuevos.
- `npm test` (Vitest) sin regresiones.
- Verificación manual sugerida: crear/editar colaborador con toggle OFF => en el breakdown no aparece C_PENSION; modo custom con "Liquidar SENA" OFF => no aparece C_SENA en los asientos del año.

## 5. Notas

- Vue 3 Composition API (`<script setup>`), sin TypeScript; alias `@` de `src/`; Axios desde `src/plugins/axios.js`.
- El backend no recalcula por sí solo al cambiar parámetros desde la UI: el recálculo sigue disparándose por importado/botón de recálculo (comportamiento vigente).