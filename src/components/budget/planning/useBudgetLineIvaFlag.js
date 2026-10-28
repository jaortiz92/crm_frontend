/**
 * useBudgetLineIvaFlag — toggle del flag `Con IVA` de una fila EXPENSE del
 * "Editor de Celdas" (FE-S14-IVA §5).
 *
 * FASE 3: extraído VERBATIM desde `BudgetLineGrid.vue`. La lógica es
 * autocontenida: UN solo `PUT /budget/planning/line/{id}` PARCIAL
 * `{ has_iva }` vía la acción `updateScenarioLine` del store INYECTADO (dueño
 * del flag `lineSaving` y del cache-in-place: la respuesta reemplaza la
 * línea, las columnas IVA/Total re-pivotan por reactividad y el settlement
 * llega debounced desde el store — AC-FE14-2, ≤ 1 request nuevo). El
 * checkbox es ONE-WAY (`:checked`): si el request falla vuelve a leer la
 * caché (jamás queda marcado lo que el servidor no aceptó). 404 de línea: el
 * store ya resincronizó el detalle (`lineGone`); otros fallos ⇒ toast simple.
 *
 * `isSimulated` se inyecta porque es dominio de la rejilla (compartido con
 * chips/acciones/edición de celda): una línea what-if no persiste, así que
 * el flag está cerrado para ella.
 */
import { alertService } from '@/services/alertService.js'

/**
 * @param {object} deps
 * @param {object} deps.store `budgetScenarioStore` (llama `updateScenarioLine`)
 * @param {(line: object) => boolean} deps.isSimulated `true` en proyecciones what-if
 */
export function useBudgetLineIvaFlag({ store, isSimulated }) {
  /**
   * FE-S14-IVA §5: toggle del flag `Con IVA` de una fila EXPENSE ⇒ PUT PARCIAL
   * `{ has_iva }` sobre `/budget/planning/line/{id}` (dueño del flag
   * `lineSaving` y del cache-inplace: la respuesta reemplaza la línea, las
   * columnas IVA/Total re-pivotan por reactividad y el settlement llega
   * debounced desde el store — AC-FE14-2, ≤ 1 request nuevo). El checkbox es
   * ONE-WAY (`:checked`): si el request falla vuelve a leer la caché (jamás
   * queda marcado lo que el servidor no aceptó). 404 de línea: el store ya
   * resincronizó el detalle (`lineGone`); otros fallos ⇒ toast simple.
   * @param {object} line
   * @param {Event} event
   */
  async function onIvaFlagChange(line, event) {
    if (isSimulated(line)) return
    const next = event.target.checked
    const result = await store.updateScenarioLine(line.id_budget_line, {
      has_iva: next
    })
    if (result.ok || result.kind === 'auth' || result.kind === 'busy') return
    alertService.generalError(result.message || 'No se pudo guardar el flag de IVA. Reintenta.')
  }

  return { onIvaFlagChange }
}
