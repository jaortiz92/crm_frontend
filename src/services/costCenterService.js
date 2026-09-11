import axiosInstance from '@/plugins/axios'

/**
 * Servicio del catálogo de Centros de Costo (solo lectura).
 *
 * Necesario porque el schema `BudgetLine` que devuelve
 * `GET /budget/planning/{id}/detail` (wrapper de `/budget/full/{id}`) trae
 * `id_cost_center` SIN el objeto `cost_center`: el código/nombre se resuelve
 * en cliente contra este catálogo cacheado — mismo patrón A5 de
 * `budgetRulesStore.fetchLinesOnce()` (catálogo cacheado una vez por sesión,
 * con fallback de etiqueta `CECO #<id>` si el fetch falló).
 *
 * Slash final obligatorio en la ruta de colección (legado verificado en
 * `app/api/budget/costCenter.py`; sin él FastAPI responde 307). El `limit`
 * por defecto del endpoint es 50 → se pide 500 (patrón `/line/` A6).
 */
export const costCenterService = {
  /**
   * @returns {Promise<import('axios').AxiosResponse<Array<object>>>}
   */
  getCostCenters() {
    return axiosInstance.get('/budget/cost-center/?skip=0&limit=500')
  }
}
