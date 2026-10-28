/**
 * planningCogs — resolvedor compartido de tasa de costo (COGS) del FE.
 *
 * Movido VERBATIM de `planningFormat.js` (FASE 1, split por dominio — sección
 * FE-S7-COGS-PAYFLOW §4). Anti-divergencia: ES el único sitio del FE que
 * construye el pool; la Ejecutiva y la derivación de pagos de la Vista Flujo
 * (FE-S7) comparten SIEMPRE la misma tasa para el mismo mes.
 */

/* ─────────── FE-S7-COGS-PAYFLOW §4: resolvedor compartido de tasa de costo ─────────── */

/**
 * Pool de tasas `line_cost_rates` VIGENTE a una fecha ISO de referencia —
 * extracción VERBATIM del path inline que `ExecutivePivotTable` evaluaba mes
 * a mes (FE-S4C §3.1, réplica del Q6 de `budgetEngine.get_pnl`,
 * `crm_backend/app/services/budgetEngine.py:480-492`): solo
 * `is_active === true`, ventana `[date_from, date_to]` por comparación
 * LEXICOGRÁFICA de ISOs con padding (`date_from <= ref <= date_to`), orden
 * `id_line_cost_rate DESC` (mayor id = definición más reciente = gana).
 * Anti-divergencia: ES el único sitio del FE que construye el pool; la
 * Ejecutiva y la derivación de pagos de la Vista Flujo (FE-S7) comparten
 * SIEMPRE la misma tasa para el mismo mes.
 * @param {Array<object>|null|undefined} rates catálogo crudo (se filtra defensivamente)
 * @param {string} referenceISO p. ej. month-end `'YYYY-MM-DD'`
 * @returns {Array<object>} candidatos ordenados DESC (aún sin escanear)
 */
export function cogsRatePoolForDate(rates, referenceISO) {
  return (Array.isArray(rates) ? rates : [])
    .filter(
      (rate) =>
        rate &&
        rate.is_active === true &&
        typeof rate.date_from === 'string' &&
        typeof rate.date_to === 'string' &&
        rate.date_from <= referenceISO &&
        referenceISO <= rate.date_to
    )
    .sort((a, b) => Number(b.id_line_cost_rate ?? 0) - Number(a.id_line_cost_rate ?? 0))
}

/**
 * Escaneo canónico del pool de `cogsRatePoolForDate` a un month-end: primera
 * coincidencia por línea gana (semántica `setdefault` de `get_pnl` = mayor
 * id) y la PRIMERA coincidencia global (`id_line == null`) es el respaldo
 * (también mayor id). Tasas con `cogs_pct` no finito se ignoran (guard
 * preexistente de la Ejecutiva, conservado).
 * @param {Array<object>|null|undefined} rates
 * @param {string} referenceISO
 * @returns {{ byLine: Map<number, number>, globalPct: number|null }} pct en escala 0–100
 */
export function buildCogsRatePool(rates, referenceISO) {
  const byLine = new Map()
  let globalPct = null
  for (const rate of cogsRatePoolForDate(rates, referenceISO)) {
    const pct = Number(rate.cogs_pct)
    if (!Number.isFinite(pct)) continue
    if (rate.id_line === null || rate.id_line === undefined) {
      if (globalPct === null) globalPct = pct
    } else if (!byLine.has(rate.id_line)) {
      byLine.set(rate.id_line, pct)
    }
  }
  return { byLine, globalPct }
}

/**
 * Cadena D-2/BR-7 de `get_pnl` SOBRE UN POOL ya construido (evita re-filtrar
 * y re-ordenar el catálogo por cada celda cuando el llamador resuelve varios
 * meses/líneas en bucle — `ExecutivePivotTable.costPivot` resuelve las 12
 * celdas de cada fila contra los pools memoizados de `monthlyRates`): línea
 * propia → respaldo global → `null`.
 * @param {{ byLine: Map<number, number>, globalPct: number|null }} pool
 * @param {number|null|undefined} lineId
 * @returns {number|null} pct 0–100 o `null`.
 */
export function resolveCogsPctFromPool(pool, lineId) {
  if (!pool) return null
  if (lineId !== null && lineId !== undefined && pool.byLine.has(lineId)) {
    return pool.byLine.get(lineId)
  }
  return pool.globalPct
}

/**
 * EL resolvedor canónico FE de `cogs_pct` (escala 0–100) de una Línea para
 * un mes: cadena exacta que la Ejecutiva aplicaba inline (línea propia →
 * respaldo global → `null` = sin tasa ⇒ degradación `—`/exclusión, D-8) y
 * que la Vista Flujo (FE-S7) reutiliza con el month-end del `budget_date` de
 * cada ingreso. `lineId == null` (CECO sin línea o catálogo caído) cae
 * directo al respaldo global, espejo de `lineIdForCostCenter` + la regla
 * D-2/BR-7 de `get_pnl`.
 * @param {Array<object>|null|undefined} rates `lineCostRates` del store
 * @param {number|null|undefined} lineId
 * @param {string|null|undefined} monthEndISO referencia del mes; `null`/no
 *   parseable ⇒ pool vacío ⇒ `null` (comparaciones ISO con `null` nunca casan).
 * @returns {number|null} pct 0–100 o `null` si no hay tasa aplicable.
 */
export function resolveCogsPctByLine(rates, lineId, monthEndISO) {
  if (typeof monthEndISO !== 'string') return null
  return resolveCogsPctFromPool(buildCogsRatePool(rates, monthEndISO), lineId)
}
