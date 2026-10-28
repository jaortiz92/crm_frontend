import { useBudgetScenarioStore } from '@/stores/budgetScenarioStore.js'
import { useBudgetSimulationStore } from '@/stores/budgetSimulationStore.js'
import { useBudgetIvaStore } from '@/stores/budgetIvaStore.js'

/**
 * PUENTE de la FASE 2 (split del `budgetPlanningStore`): las factories de
 * modelos de presentación (`cashFlowPivot.js`, `executivePivot.js`,
 * `planningExportSheets.js`) reciben UN objeto `store` y leen miembros de
 * varios dominios (p. ej. `store.ivaMode`/`store.settlement` del dominio IVA
 * junto a los catálogos A5 del dominio escenario). Antes de la división ese
 * objeto era el store monolítico; ahora se construye esta VISTA de solo
 * lectura que delega cada miembro al sub-store dueño.
 *
 * Reactividad: cada miembro es un accessor `get` que lee el proxy reactivo
 * del sub-store EN EL MOMENTO de la lectura — los `computed` de las factories
 * rastrean la dependencia igual que con el monolito (cero cambio de
 * comportamiento). Las acciones se reenvían tal cual (las acciones de Pinia
 * son seguras de llamar fuera del store). Solo lectura: las factories nunca
 * escriben el store (verificado en el split).
 *
 * Miembros por sub-store (dominios disjuntos; el orden garantiza que la
 * primera aparición gane si algún día se solaparan):
 *  - `budgetScenarioStore` → escenario, catálogos, carryover, saldo inicial, tax.
 *  - `budgetSimulationStore` → payrollSim/financingSim/financingPrincipalFlow.
 *  - `budgetIvaStore` → ivaMode/ivaModeBudgetId/settlement.
 *
 * @returns {object} vista compuesta con el mismo contrato de lectura que el
 *   antiguo `budgetPlanningStore`.
 */
export function createPlanningStoresView() {
  const stores = [useBudgetScenarioStore(), useBudgetSimulationStore(), useBudgetIvaStore()]
  const view = {}
  for (const store of stores) {
    for (const key of Object.keys(store)) {
      // Omitir las propiedades internas de Pinia ($id, $state, $patch, _hmr…).
      if (key.startsWith('$') || key.startsWith('_')) continue
      if (key in view) continue
      if (typeof store[key] === 'function') {
        view[key] = (...args) => store[key](...args)
      } else {
        Object.defineProperty(view, key, {
          get: () => store[key],
          enumerable: true
        })
      }
    }
  }
  return view
}
