/**
 * planningIva — ÚNICA fuente local de la fórmula del IVA (FE-S14-IVA §5).
 *
 * Movido VERBATIM de `planningFormat.js` (FASE 1, split por dominio). Tasa
 * espejo del `TAX_RATE` del backend (D-FE14-6): CERO hardcodes de 0.19 fuera
 * de este módulo.
 */

/* ─────────── FE-S14-IVA §5: ÚNICA fuente local de la fórmula del IVA ─────────── */

/**
 * Tasa espejo del `TAX_RATE` del backend (D-FE14-6): CERO hardcodes de 0.19
 * fuera de este módulo. La liquidación usa `tax_rate_used` de la respuesta
 * del BE cuando existe (auditoría); las derivaciones de presentación usan
 * esta constante.
 */
export const IVA_RATE = 0.19

/**
 * Flag EFECTIVO de una línea (D-FE14-2 / BE D-S10-3): `NULL ≡ True` — sin
 * dato se asume gravado. Solo `false` literal excluye el IVA.
 * @param {boolean|null|undefined} flag `has_iva` crudo de la línea
 * @returns {boolean}
 */
export function ivaFlagEffective(flag) {
  return flag !== false
}

/**
 * Neto → bruto con IVA según el flag efectivo (NULL≡True). NO finitos
 * devuelven 0 (mismo contrato que los acumuladores de los pivotes).
 * @param {number|string|null|undefined} neto
 * @param {boolean|null|undefined} flag `has_iva` (o `true` para ingresos,
 *   que siempre generan IVA — D-S10-5)
 * @returns {number} `neto × (1 + IVA_RATE)` si está gravado; `neto` si no.
 */
export function withIva(neto, flag) {
  const num = Number(neto)
  if (!Number.isFinite(num)) return 0
  return ivaFlagEffective(flag) ? num * (1 + IVA_RATE) : num
}

/**
 * Cuota de IVA de un neto (el monto de la columna `IVA`). NO finitos ⇒ 0.
 * @param {number|string|null|undefined} neto
 * @param {boolean|null|undefined} flag `has_iva` efectivo (NULL≡True)
 * @returns {number} `neto × IVA_RATE` si está gravado; `0` si no.
 */
export function ivaOf(neto, flag) {
  const num = Number(neto)
  if (!Number.isFinite(num)) return 0
  return ivaFlagEffective(flag) ? num * IVA_RATE : 0
}

/**
 * Bandera efectiva de una `BudgetLine` para las derivaciones de caja:
 * INCOME/PURCHASE siempre gravadas (D-S10-5: el flag se ignora); EXPENSE con
 * `has_iva` NULL≡True (D-FE14-2).
 * @param {object|null|undefined} line
 * @returns {boolean}
 */
export function lineChargesIva(line) {
  if (!line || line.line_type === 'expense') return ivaFlagEffective(line?.has_iva)
  return true
}
