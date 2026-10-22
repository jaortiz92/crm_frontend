/** Stubs del repro. */
export const budgetRulesService = { fetchRates: async () => ({ data: [] }) }
export const costCenterService = { getCostCenters: async () => ({ data: [] }) }
export const collectionService = { getCollections: async () => ({ data: [] }) }
export const alertService = {
  generalError: () => {},
  generalSucces: () => {},
  generalWarning: () => {},
  generalQuestion: () => {}
}
export default {}
