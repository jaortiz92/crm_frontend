# frontend.03_07 — Eliminacion de escenarios borrador en PlanningDashboard

**Modulo**: Planeacion y Escenarios (FE-S4)
**Depende de**: frontend.03_03 (planning dashboard), frontend.03_06 (line manager)
**Autoridad backend**: `crm_backend/spec/backend.02_14_Spec_Backend_budgets_delete_draft.md`
**Fecha**: 2026-09-14 — **Estado**: Aprobada

## 1. Historia

> Como usuario quiero que en `PlanningDashboard.vue` se permitan eliminar los
> presupuestos que son borrador y que nunca han sido utilizados como meta activa.

## 2. Decisiones confirmadas

| ID | Decision |
|----|----------|
| FD-1 | Unicidad con el backend: la FE llama al `DELETE /budget/{id_budget}` LEGACY ya existente (decision D-3 del spec backend). No existe ruta `/budget/planning/{id}` DELETE; no inventar ninguna. |
| FD-2 | Boton "Eliminar" visible SOLO en filas con `row.status === 'draft'`. El backend es la autoridad (400 si el estado cambio en vuelo). |
| FD-3 | Confirmacion obligatoria en modal (nombre, ano, n. de lineas, aviso de irreversibilidad). No se escribe el nombre para confirmar. |
| FD-4 | Los clones del borrador sobreviven: el modal lo aclara al usuario ("Los escenarios clonados a partir de este se conservaran."). |
| FD-5 | Eliminar es irreversible y sin auditoria (D-2 backend). Se elimina de uno en uno (sin checkbox masivo). |

## 3. Archivos a tocar (convenciones FE-S4 vigentes: A13 servicios puros,
`<script setup>`, Pinia dueno del estado, sin re-ordenar listas, Spanish UX)

1. `src/services/budgetPlanningService.js` — nuevo metodo PUREO de transporte:
   `deleteScenario(idBudget)` → `axiosInstance.delete('/budget/' + idBudget)`
   (ruta unitaria: SIN slash final, misma forma que `/budget/planning/line/{id}`).
   Documentar en el header del archivo con las demas rutas.
2. `src/stores/budgetPlanningStore.js`
   - state: `deleting: false` (flag anti-doble-submit, NFR-F4/AC-FE-8).
   - getter `isSubmitting` pasa a `uploading || cloning || settingTarget || deleting`
     (todas las acciones de la tabla se bloquean durante el borrado, igual que hoy).
   - accion `async deleteScenario(idBudget)`:
     - guard de reentrada: `if (this.deleting) return { ok:false, kind:'busy' }`.
     - exito 200: `this.scenarios = this.scenarios.filter(r => r.id_budget !== idBudget)`
       (la fila desaparece al instante, ASM-7; NO refetch manual obligatorio),
       `this.scenariosStale = true`; si `currentScenario?.id_budget === idBudget` limpiar
       `currentScenario = null; currentScenarioId = null`.
     - error: `classifyPlanningError(err)` (ya existe) + `handleAuth`; mapa:
       - `conflict` (400 "Only draft budgets can be deleted") → refresco forzado del
         listado (`fetchScenarios({ year: this.scenariosYear, force: true })`), propagar
         `{ ok:false, kind:'conflict', message }` con mensaje ES:
         "El escenario ya no esta en estado Borrador: solo pueden eliminarse borradores."
       - `notfound` (404) → mismo refresco forzado + `{ ok:false, kind:'notfound', message }` ES:
         "El escenario ya no existe. La lista se actualizo."
       - `forbidden` → toast `generalError('No tiene permiso para realizar esta operacion.')`
         + `refreshRolesSilently()` (patron defensivo del store) y propagar.
       - `network` / `server` / resto → propagar sin refresco (el modal decide el texto).
     - `finally { this.deleting = false }`.
3. `src/components/budget/planning/ScenarioTable.vue`
   - `defineEmits(['view','set-target','clone','request-delete'])`.
   - en `.row-actions`, despues de "Clonar":
     `<button v-if="row.status === 'draft'" class="btn btn-danger btn-sm" :disabled="busy" @click="emit('request-delete', row)">Eliminar</button>`
     (si `btn-danger` no existe globalmente, crearlo scoped en el componente con los
     tonos rojos ya usados en `pd-load-error` + variante `:root[data-theme='dark']`).
4. `src/components/budget/planning/DeleteScenarioConfirmModal.vue` — NUEVO, clon de
   patron/estructura de `SetTargetConfirmModal.vue` (leerla primero: open/close por props
   y emits, teleport/backdrop, focus, aria):
   - props: `open: Boolean`, `scenario: Object|null` (fila cruda del listado).
   - contenido: titulo "Eliminar escenario"; nombre en negrita; chips de ano y de
     `formatCount(scenario.lines_count)` lineas; parrafo de advertencia en tono peligro:
     "Esta accion es irreversible: el escenario y todas sus lineas se eliminaran
     permanentemente. Los escenarios clonados a partir de este se conservaran.";
     zona de error inline (texto rojo, `role="alert"`) para conflict/network/server.
   - botones: "Cancelar" (secundario, cierra con `@close`, disabled si `deleting`) y
     "Si, eliminar" (peligro, `:disabled="deleting || !scenario"`, spinner/texto
     "Eliminando..." mientras `deleting`).
   - flujo: confirmar → `await budgetPlanningStore.deleteScenario(scenario.id_budget)`;
     `ok` → emitir `deleted` y cerrar; `conflict` → mostrar mensaje ES inline (la tabla
     ya se auto-refresco via store y el boton desaparecera al re-render); `notfound` →
     mensaje ES y cerrar emitiendo `deleted` (la lista ya se refresco); `network`/
     `server` → mensaje inline "No se pudo conectar con el servidor. Intentalo de nuevo."
     / el del generic unexpected, modal permanece abierto.
   - accesibilidad: `role="alertdialog"`, `aria-labelledby` al titulo, foco inicial en
     Cancelar, Escape/outer-click cierran SOLO si no hay peticion en vuelo.
5. `src/views/budget/planning/PlanningDashboard.vue`
   - `const deleteOpen = ref(false)`; reutilizar `actionRow` como hoy.
   - `function onRequestDelete(row) { actionRow.value = row; deleteOpen.value = true }`.
   - `<ScenarioTable ... @request-delete="onRequestDelete" />`.
   - montar `<DeleteScenarioConfirmModal :open="deleteOpen" :scenario="actionRow" @deleted="onTargetDone-like" @close="deleteOpen = false" />`
     con handler `onDeleted()` → `loadScenarios(true)` (refresco suave de reconciliacion
     igual que tras meta-activa; la caché del store ya quito la fila, no hay flicker).
   - actualizar el docstring de la vista (menciona eliminacion de borradores).

## 4. Matriz de error de presentacion (extension del mapa FE-S4 9)

| kind backend.02_14 | Vista del usuario |
|--------------------|-------------------|
| 400 conflict (ya no es draft) | mensaje ES inline en el modal + listado refrescado (boton desaparece en esa fila) |
| 404 notfound | mensaje ES + cierre del modal + listado refrescado |
| 403 forbidden | toast generalError + refresco de roles (defensivo; hoy no hay gate de rol) |
| network | inline rojo "No se pudo conectar..." + reintento posible (modal abierto) |
| 5xx server | inline generico `GENERIC_UNEXPECTED_MESSAGE` (modal abierto) |
| busy | segundo clic es no-op (flags), sin toast |

## 5. Criterios de aceptacion

- AC-FE-DEL-1: filas `draft` muestran boton "Eliminar"; filas `active`/`closed` JAMAS.
- AC-FE-DEL-2: clic abre el modal con nombre/ano/lineas correctos; Cancelar no dispara request.
- AC-FE-DEL-3: confirmacion exitosa → la fila desaparece sin perder el filtro de ano;
  reconciliacion suave con el servidor; el chip de conteo de la ultima carga ya no cuenta la fila.
- AC-FE-DEL-4: durante la peticion todas las acciones de la tabla quedan deshabilitadas
  (`isSubmitting` incluye `deleting`) y spam de clics no duplica requests.
- AC-FE-DEL-5: 400/404 concurrente (otro usuario marco meta / borro) → mensaje claro en
  espanol, lista refrescada, sin estado visual imposible (boton que muere al re-cargar).
- AC-FE-DEL-6: tras borrar el ultimo escenario del filtro, se ve el estado vacio con CTA
  "Nuevo Escenario" (codigo existente, verificar que no rompe).
- AC-FE-DEL-7: `npm run lint` pasa; sin TypeScript; composicion `<script setup>`;
  componentes no importan axios directamente (todo via service + store, A13).
