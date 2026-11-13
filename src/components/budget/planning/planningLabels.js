/**
 * planningLabels — constantes de presentación (etiquetas y notas) del Módulo
 * de Planeación.
 *
 * Movido VERBATIM de `planningFormat.js` (FASE 1, split por dominio). No son
 * cifras ni comportamiento: texto de presentación compartido por las Vistas
 * Ejecutiva y Flujo.
 */

/**
 * FE-S18 RF-4.2 — NOTA ÚNICA del bloque "Gastos variables (calculados)",
 * compartida por las Vistas Ejecutiva y Flujo (antes definida DOS veces con
 * variantes: Ejecutiva «tasa × ingresos presupuestados del mes»; Flujo
 * «tasa × ingresos fijos presupuestados del mes de causación»). El texto
 * fusionado conserva la aclaración específica del Flujo (base por causación,
 * ingresos fijos) sin perder la del Ejecutivo. Ambas vistas la consumen como
 * tooltip ⓘ junto al subtítulo del bloque (RF-3.2). No son cifras ni
 * comportamiento: texto de presentación compartido.
 */
/**
 * Fe-S18 RF-4.2 / ENMIENDA A-02 (spec `frontend.03_21` §11, 2026-10-21) — NOTA
 * ÚNICA del bloque "Gastos variables (calculados)", compartida por las Vistas
 * Ejecutiva y Flujo. La base se resuelve POR CECO generador (A-01) y DIFIERE
 * por comportamiento de la línea (A-02):
 *  - variable_sales (facturado): tasa × ingresos fijos (I) del MES DE
 *    CAUSACIÓN (budget_date) del CECO resuelto.
 *  - variable_receivables (recaudo): tasa × ENTRADAS del Flujo (R, cobros por
 *    su MES DE PAGO) del CECO resuelto — base NETA (el modo IVA del Flujo
 *    solo afecta a la PRESENTACIÓN del bloque Entradas, nunca a la base de
 *    comisiones).
 * El monto NO se almacena en las líneas del escenario; se recalcula al ajustar
 * el presupuesto. El drill-down de movimientos por CECO muestra esta MISMA
 * cifra reconciliada por línea (REVISIÓN 5 / frontend.03_21 §5.3 + A-02 §11).
 *
 * frontend.03_25 (spec `04_Spec_Gasto_variable_por_salidas` §8.1, 2026-11-11):
 * TERCERA base `variable_outflows` ("Variable por Salidas") — tasa × SALIDAS
 * del Flujo del MES de CAUSACIÓN de la línea (budget_date, NO pago), compuesta
 * por TODAS las filas de salida del pivot (fijos + variables calculados +
 * pago a proveedores + capital de financiación + impuestos, EXCLUYENDO el
 * propio aporte por salidas — BR-VS-F1/F2). Base GLOBAL del presupuesto: el
 * aporte se contabiliza en el CECO PROPIO de la línea, SIN resolución por
 * cubeta (a diferencia de las dos primeras bases). Identidad presentada:
 * Salidas(m) = Base(m) + Σ aportes (BR-VS-F6).
 */
export const VARIABLE_PIVOT_NOTE =
  'Monto estimado según el comportamiento de la línea, con base por CECO ' +
  'resuelto (A-01): facturado = tasa × ingreso presupuestado del MES de ' +
  'causación; recaudo = tasa × ENTRADAS del Flujo del MES de cobro (base ' +
  'neta — specs backend.02_24 §5.2 / frontend.03_21 §4/§11); salidas = ' +
  'tasa × SALIDAS del Flujo del MES de causación del presupuesto (base ' +
  'GLOBAL, CECO propio — spec frontend.03_25 BR-VS-F1/F2). No se almacena ' +
  'en las líneas del escenario; se recalcula al ajustar el presupuesto. El ' +
  'drill-down de movimientos por CECO muestra esta MISMA cifra reconciliada ' +
  'por línea (REVISIÓN 5 / frontend.03_21 §5.3).'

/**
 * frontend.03_25 §4.1 — nota del bloque "Salidas — Gastos variables por
 * salidas" (Vista Flujo): describe la base BR-VS-F1/F2 y la identidad
 * BR-VS-F6 del usuario.
 */
export const VARIABLE_OUTFLOWS_PIVOT_NOTE =
  'Derivado: tasa × SALIDAS del Flujo del MES de causación (budget_date, ' +
  'NO pago) — salidas fijas + variables calculadas + pago a proveedores + ' +
  'capital de financiación + impuestos del presupuesto, EXCLUYENDO este ' +
  'aporte. Base GLOBAL del presupuesto: el gasto se contabiliza en el CECO ' +
  'PROPIO de la línea (sin resolución por cubeta — spec frontend.03_25). ' +
  'Identidad: Salidas(m) = Base(m) + Σ aportes, exacta en presentación.'

/** Etiquetas legibles de `behavior_type` (esquema `BehaviorTypeEnum`). */
export const BEHAVIOR_LABELS = {
  fixed: 'Fijo',
  variable_sales: 'Variable por Facturación',
  variable_receivables: 'Variable por Recaudo',
  variable_outflows: 'Variable por Salidas'
}

/** Etiquetas legibles de `line_type` (FE-S9 §2.1: += `purchase`). */
export const LINE_TYPE_LABELS = {
  income: 'Ingreso',
  expense: 'Gasto',
  purchase: 'Compra'
}

/** Etiquetas de chip de estado de escenario (§6.1). */
export const STATUS_LABELS = {
  active: '🎯 Meta Activa',
  draft: 'Borrador',
  closed: 'Cerrado'
}

/**
 * @param {string} status
 * @returns {{ label: string, tone: string }}
 */
export function statusChipOf(status) {
  if (status === 'active') return { label: STATUS_LABELS.active, tone: 'active' }
  if (status === 'closed') return { label: STATUS_LABELS.closed, tone: 'closed' }
  return { label: STATUS_LABELS.draft, tone: 'draft' }
}
