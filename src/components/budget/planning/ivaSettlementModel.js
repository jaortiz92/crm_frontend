/**
 * ivaSettlementModel — modelo de la "Liquidación IVA" (FE-S20 / spec
 * `frontend.03_20` §7.2).
 *
 * Extracción VERBATIM de las derivaciones que vivían inline en
 * `IvaSettlementPanel.vue` (FE-S14-IVA §5; contrato `backend.02_20` §4.6),
 * para que la exportación del tab "Liquidación" reuse EXACTAMENTE las mismas
 * filas que pinta el panel (§5: "tal como se renderizan"). El componente
 * consume `buildIvaSettlementViewModel` y conserva su presentación
 * (formateo `$`, chips, tooltips); el comportamiento visual NO cambia.
 *
 * OJO de contrato: la clave descontable de `totals` llega grafiada
 * `deductable` (sic §4.6); jamás inventar `deductible` para la fila Totales.
 */

/** Desglose descontable de 4 conceptos (backend.02_20 §4.5). */
export const DEDUCTIBLE_KEYS = [
  { key: 'fixed_expenses', label: 'Gastos fijos (E2)' },
  { key: 'variable_expenses', label: 'Gastos variables (E3/E4)' },
  { key: 'import_vat', label: 'IVA de importación (E5)' },
  { key: 'nationalization_vat', label: 'IVA de internación (E6)' }
]

/** Σ de un dict concepto→monto (`generated` solo trae `ventas` hoy). */
export function sumBreakdown(bucket) {
  if (!bucket || typeof bucket !== 'object') return 0
  let total = 0
  for (const value of Object.values(bucket)) {
    const num = Number(value)
    if (Number.isFinite(num)) total += num
  }
  return total
}

/**
 * Tooltip desglosado `concepto: monto` por línea (evita comas de miles).
 * El formatador (`formatMoney`) lo inyecta el llamador: aquí solo se arma el
 * texto con los montos crudos ya formateados por el consumidor.
 * @param {object|null|undefined} bucket
 * @param {Array<{key: string, label: string}>} entries
 * @param {(value: number) => string} formatMoney
 * @returns {string}
 */
export function breakdownTitle(bucket, entries, formatMoney) {
  if (!bucket || typeof bucket !== 'object') return ''
  return entries
    .map((entry) => `${entry.label}: ${formatMoney(Number(bucket[entry.key]) || 0)}`)
    .join(' · ')
}

/**
 * Modelo de la tabla de liquidación a partir del payload del BE
 * (`budgetPlanningStore.settlement.data`).
 *  - `periodRows`: una fila por período del Calendario IVA (con el desglose
 *    descontable por concepto y la meta de tooltips para el panel).
 *  - `totals`: fila Totales con el objeto `totals` del BE (clave
 *    `deductable`); `null` si la respuesta no lo trae.
 *  - `unassigned`: bucket de eventos fuera de todo rango (§4.4) o `null`.
 *  - `warnings`: strings literales de `meta.warnings` (§4.6).
 * (Movido verbatim de los computeds `periodRows`/`totals`/`unassigned`/
 * `warnings` del panel.)
 * @param {object|null|undefined} data
 */
export function buildIvaSettlementViewModel(data) {
  const periods = Array.isArray(data?.periods) ? data.periods : []
  const periodRows = periods.map((period) => {
    const generated = sumBreakdown(period?.generated)
    const deductible = sumBreakdown(period?.deductible)
    const payment = Number(period?.payment)
    const carry = Number(period?.carry_balance)
    return {
      id: `${period?.period_no ?? 'p'}-${period?.date_from ?? ''}`,
      periodNo: period?.period_no ?? null,
      dateFrom: period?.date_from ?? null,
      dateTo: period?.date_to ?? null,
      dueDate: period?.payment_due_date ?? null,
      description: period?.description ?? '',
      generated,
      // Buckets CRUDOS para que el panel reconstruya sus tooltips desglosados
      // con su propio formatador (presentación); la exportación los ignora.
      generatedBucket: period?.generated ?? null,
      deductibleBucket: period?.deductible ?? null,
      deductible,
      deductibleParts: DEDUCTIBLE_KEYS.map((entry) => ({
        ...entry,
        value: Number(period?.deductible?.[entry.key]) || 0
      })),
      priorBalance: Number(period?.prior_balance) || 0,
      taxBase: Number(period?.tax_base) || 0,
      payment: Number.isFinite(payment) ? payment : 0,
      carryBalance: Number.isFinite(carry) ? carry : 0,
      eventsCount: Number(period?.events_count) || 0
    }
  })

  /** Fila Totales: los objetos `totals`/`unassigned` del BE mandan (§4.6). */
  const rawTotals = data?.totals
  const totals =
    rawTotals && typeof rawTotals === 'object'
      ? {
          generated: Number(rawTotals.generated) || 0,
          // CLAVE LITERAL DEL CONTRATO: `deductable` (sic backend.02_20 §4.6).
          deductable: Number(rawTotals.deductable) || 0,
          payments: Number(rawTotals.payments) || 0,
          finalBalance: Number(rawTotals.final_balance) || 0
        }
      : null

  /** Bucket `unassigned` con datos (aviso aparte; NO entra a la recurrencia). */
  const rawUnassigned = data?.unassigned
  let unassigned = null
  if (rawUnassigned && typeof rawUnassigned === 'object') {
    const generated = Number(rawUnassigned.generated) || 0
    const deductible = Number(rawUnassigned.deductible) || 0
    const eventsCount = Number(rawUnassigned.events_count) || 0
    if (eventsCount || generated || deductible) {
      unassigned = { generated, deductible, eventsCount }
    }
  }

  /** `meta.warnings` (array de strings literales del BE, §4.6). */
  const rawWarnings = data?.meta?.warnings
  const warnings = Array.isArray(rawWarnings)
    ? rawWarnings.filter((item) => typeof item === 'string' && item)
    : []

  return { periodRows, totals, unassigned, warnings }
}
