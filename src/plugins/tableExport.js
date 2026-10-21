/**
 * tableExport — servicio compartido de exportación de tablas a Excel (.xlsx)
 * y CSV (FE-S20 / spec `frontend.03_20` §7).
 *
 * Serialización PURA de hojas: recibe un contrato `{ format, filename,
 * sheets }` donde cada hoja es `{ name, columns: [{key, label}], rows }`
 * (una fila = objeto clave→valor). NO conoce el dominio de presupuesto:
 * la construcción de hojas vive en el módulo que exporta
 * (`components/budget/planning/planningExportSheets.js`).
 *
 *  - `csv`  → UTF-8 con BOM (`\uFEFF`, RNF-2/CA-7) y el MISMO escaping de
 *    comas/comillas/saltos del plugin hermano `csvExport.js` (que se conserva
 *    intacto para `ActivityKanban.vue`). Varias hojas se APILAN en un solo
 *    archivo separadas por una fila en blanco (§7).
 *  - `xlsx` → SheetJS (`xlsx@0.18.5`, ya dependencia — RNF-4): un libro con
 *    una hoja por elemento de `sheets`; los montos llegan como números JS
 *    reales y `aoa_to_sheet` los escribe como celdas numéricas (`t: 'n'`,
 *    CA-3: `1250000`, nunca `"1.250.000"` ni `"$"`); `!cols` calcula anchos
 *    razonables a partir del contenido; descarga con `XLSX.writeFile`.
 *
 * Sin llamadas HTTP y sin lógica de negocio (RF-9).
 */
import * as XLSX from 'xlsx'

/**
 * Escaping CSV — MISMO enfoque que `csvExport.js` (fuente única del
 * comportamiento; copia documentada para no acoplar las APIs: la de aquel
 * plugin no cambia para sus consumidores actuales).
 * @param {unknown} value
 * @returns {string}
 */
function escapeCsvValue(value) {
  if (value == null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Normaliza el valor de una celda para CSV: los números se serializan CRUDOS
 * (`1250000` — sin separadores ni símbolo, CA-3); `null`/`undefined` → ''.
 * @param {unknown} value
 * @returns {string}
 */
function csvCellText(value) {
  if (value === null || value === undefined) return ''
  return escapeCsvValue(value)
}

/**
 * Convierte UNA hoja a líneas CSV (encabezado + filas).
 * @param {{ columns: Array<{key: string, label: string}>, rows: Array<object> }} sheet
 * @returns {string[]}
 */
function csvLinesOfSheet(sheet) {
  const header = sheet.columns.map((col) => escapeCsvValue(col.label)).join(',')
  const rows = sheet.rows.map((row) =>
    sheet.columns.map((col) => csvCellText(row[col.key])).join(',')
  )
  return [header, ...rows]
}

/**
 * Serializa las hojas a TEXTO CSV completo (con BOM). Función PURA expuesta
 * para pruebas unitarias (BOM + escaping — spec FE-S20 §Verificación 3).
 * @param {Array<{ name: string, columns: Array<{key: string, label: string}>, rows: Array<object> }>} sheets
 * @returns {string} contenido del archivo (`\uFEFF` + hojas apiladas).
 */
export function sheetsToCsvText(sheets) {
  const blocks = sheets.map((sheet) => csvLinesOfSheet(sheet).join('\n'))
  return `\uFEFF${blocks.join('\n\n')}`
}

/**
 * Ancho razonable de columna para `ws['!cols']`: máximo entre el largo del
 * encabezado y el de los valores (acotado a [8, 42] caracteres).
 * @param {{ key: string, label: string }} column
 * @param {Array<object>} rows
 * @returns {{ wch: number }}
 */
function columnWidthOf(column, rows) {
  let width = String(column.label ?? '').length
  for (const row of rows) {
    const value = row[column.key]
    if (value === null || value === undefined) continue
    const length = String(value).length
    if (length > width) width = length
  }
  return { wch: Math.min(42, Math.max(8, width + 2)) }
}

/**
 * Nombres de hoja válidos para Excel: sin `[]:*?/\` y máximo 31 caracteres;
 * los duplicados tras truncar se desempatan con sufijo numérico.
 * @param {string} name
 * @param {Set<string>} used
 * @returns {string}
 */
function uniqueSheetName(name, used) {
  const clean =
    String(name ?? 'Hoja')
      .replace(/[[\]:*?/\\]/g, ' ')
      .trim() || 'Hoja'
  let base = clean.slice(0, 31)
  let candidate = base
  let index = 2
  while (used.has(candidate)) {
    const suffix = ` (${index})`
    candidate = base.slice(0, 31 - suffix.length) + suffix
    index += 1
  }
  used.add(candidate)
  return candidate
}

/**
 * Construye el libro XLSX (función PURA aparte de la descarga para facilitar
 * el mantenimiento): una hoja por elemento de `sheets`, números JS reales en
 * celdas numéricas y `!cols` con anchos calculados.
 * @param {Array<{ name: string, columns: Array<{key: string, label: string}>, rows: Array<object> }>} sheets
 * @returns {object} libro SheetJS (`XLSX.utils.book_new`).
 */
export function buildWorkbook(sheets) {
  const book = XLSX.utils.book_new()
  const used = new Set()
  for (const sheet of sheets) {
    const aoa = [
      sheet.columns.map((col) => col.label),
      ...sheet.rows.map((row) => sheet.columns.map((col) => row[col.key] ?? null))
    ]
    const worksheet = XLSX.utils.aoa_to_sheet(aoa)
    worksheet['!cols'] = sheet.columns.map((col) => columnWidthOf(col, sheet.rows))
    XLSX.utils.book_append_sheet(book, worksheet, uniqueSheetName(sheet.name, used))
  }
  return book
}

/**
 * Descarga de archivo en el navegador — MISMO mecanismo que `csvExport.js`
 * (Blob + `<a download>` temporal).
 * @param {Blob} blob
 * @param {string} filename
 */
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Sello de fecha LOCAL `YYYY-MM-DD` (RF-6: sin `toISOString()` por el
 * corrimiento UTC — patrón del módulo de Planeación).
 * @param {Date} [date]
 * @returns {string}
 */
export function localDateStamp(date = new Date()) {
  const yyyy = String(date.getFullYear()).padStart(4, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Nombre de archivo de exportación: `{base}_{YYYY-MM-DD}.{ext}` con fecha
 * LOCAL (RF-6). Ej. `presupuesto-127_vista-ejecutiva_2026-10-20.xlsx`.
 * @param {string} base slug sin fecha ni extensión
 * @param {'csv'|'xlsx'} format
 * @param {Date} [date]
 * @returns {string}
 */
export function buildExportFilename(base, format, date = new Date()) {
  const extension = format === 'csv' ? 'csv' : 'xlsx'
  return `${base}_${localDateStamp(date)}.${extension}`
}

/**
 * API ÚNICA del plugin (FE-S20 §7): exporta las hojas al formato pedido.
 * NO dispara ninguna petición HTTP (RF-9) y NO conoce el dominio: si no hay
 * hojas o el formato es inválido LANZA (el llamador decide cómo notificar —
 * RF-10 con `alertService` en las vistas).
 * @param {{
 *   format: 'csv'|'xlsx',
 *   filename: string,
 *   sheets: Array<{ name: string, columns: Array<{key: string, label: string}>, rows: Array<object> }>
 * }} params
 * @returns {'csv'|'xlsx'} el formato con el que se exportó.
 */
export function exportSheets({ format, filename, sheets }) {
  if (!Array.isArray(sheets) || sheets.length === 0) {
    throw new Error('No hay hojas que exportar.')
  }
  if (format === 'csv') {
    triggerDownload(
      new Blob([sheetsToCsvText(sheets)], { type: 'text/csv;charset=utf-8;' }),
      filename
    )
    return 'csv'
  }
  if (format === 'xlsx') {
    XLSX.writeFile(buildWorkbook(sheets), filename)
    return 'xlsx'
  }
  throw new Error(`Formato de exportación no soportado: ${format}`)
}
