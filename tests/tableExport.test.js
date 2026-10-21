/**
 * FE-S20 (spec `frontend.03_20`) — test unitario del plugin compartido de
 * exportación de tablas (§Verificación 3: CSV con BOM + escaping).
 *
 * Solo cubre la serialización PURA (`sheetsToCsvText`): la descarga real
 * (`exportSheets` → Blob/XLSX.writeFile) y el workbook xlsx requiren DOM/
 * navegador; la clave exportable aquí es que el texto CSV quede con el
 * `\uFEFF` inicial (RNF-2/CA-7), los campos escapados al estilo
 * `csvExport.js` y las hojas apiladas con fila en blanco (§7).
 */
import { describe, it, expect } from 'vitest'
import { sheetsToCsvText, buildExportFilename, localDateStamp } from '@/plugins/tableExport.js'

describe('FE-S20: tableExport — CSV', () => {
  it('antepone BOM UTF-8 y escapa comas, comillas y saltos de línea', () => {
    const sheets = [
      {
        name: 'Causado',
        columns: [
          { key: 'concepto', label: 'Concepto, único' },
          { key: 'monto', label: 'Monto' }
        ],
        rows: [
          { concepto: 'Presupuesto "activo"', monto: 1250000 },
          { concepto: 'Dos\nlíneas', monto: null }
        ]
      }
    ]
    const text = sheetsToCsvText(sheets)
    // RNF-2/CA-7: BOM para que Excel lea acentos con doble clic en Windows.
    expect(text.charCodeAt(0)).toBe(0xfeff)
    // Encabezado escapado (coma dentro de la etiqueta).
    expect(text).toContain('"Concepto, único",Monto')
    // RF-5/CA-3: monto CRUDO, sin separadores ni símbolo.
    expect(text).toContain('Presupuesto ""activo""')
    expect(text).toContain('1250000')
    // Saltos de línea dentro del valor: campo entrecomicado íntegro.
    expect(text).toContain('"Dos\nlíneas",')
  })

  it('apila varias hojas separadas por una fila en blanco (multi-hoja, §7)', () => {
    const text = sheetsToCsvText([
      {
        name: 'Resumen',
        columns: [{ key: 'c', label: 'Concepto' }],
        rows: [{ c: 'Σ Entradas' }]
      },
      {
        name: 'Entradas',
        columns: [{ key: 'c', label: 'CECO' }],
        rows: [{ c: '310100' }]
      }
    ])
    const body = text.slice(1) // sin el BOM
    expect(body).toBe('Concepto\nΣ Entradas\n\nCECO\n310100')
  })

  it('buildExportFilename usa fecha LOCAL YYYY-MM-DD y extensión según formato (RF-6)', () => {
    // 20 de octubre de 2026 (hora local) — evita `toISOString` por el
    // corrimiento UTC (patrón del módulo de Planeación).
    const date = new Date(2026, 9, 20, 23, 30)
    expect(localDateStamp(date)).toBe('2026-10-20')
    expect(buildExportFilename('presupuesto-127_vista-ejecutiva', 'xlsx', date)).toBe(
      'presupuesto-127_vista-ejecutiva_2026-10-20.xlsx'
    )
    expect(buildExportFilename('ceco-510100-causado', 'csv', date)).toBe(
      'ceco-510100-causado_2026-10-20.csv'
    )
  })
})
