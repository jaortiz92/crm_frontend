/**
 * ratesConfig.js — Única fuente de divergencias por pilar financiero
 * (spec FE-S3-RULES §7, A1/A4/A9). Cualquier texto/columna/URL que dependa
 * del pilar se lee EXCLUSIVAMENTE de este mapa.
 *
 * ⚠️ A1 verificada contra `app/api/budget/{lineCostRate,commissionRate}.py`:
 * el API de costos se monta en SINGULAR (`/budget/line-cost-rate`) y el de
 * comisiones en plural (`/budget/commission-rates`). Las rutas raíz del
 * backend son `@router.get("/")`, por lo que las rutas de colección llevan
 * SLASH FINAL obligatorio (sin él el servidor responde 307).
 */

/** @typedef {'cost'|'commission'} RateKind */

export const RATE_KINDS = {
  cost: {
    idField: 'id_line_cost_rate',
    pctField: 'cogs_pct',
    listUrl: '/budget/line-cost-rate/',
    itemUrl: (id) => `/budget/line-cost-rate/${id}`,
    tabLabel: 'Costos por Línea',
    pctLabel: 'Costo de Ventas (%)',
    entityLabel: 'tasa de costo'
  },
  commission: {
    idField: 'id_commission_rate',
    pctField: 'commission_pct',
    listUrl: '/budget/commission-rates/',
    itemUrl: (id) => `/budget/commission-rates/${id}`,
    tabLabel: 'Comisiones de Venta',
    pctLabel: 'Comisión (%)',
    entityLabel: 'tasa de comisión'
  }
}

/**
 * Fecha local de hoy en formato `YYYY-MM-DD` (spec §9.3, A6).
 *
 * PROHIBIDO `new Date().toISOString().slice(0, 10)`: el ISO se serializa en
 * UTC y sesga el día en zonas UTC−x (comparar `date_to < hoy` contra un "hoy"
 * corrido marcaría vencidas antes de tiempo). Se arman los componentes
 * locales con padding manual.
 *
 * @returns {string} p. ej. '2026-09-09'
 */
export function localToday() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
