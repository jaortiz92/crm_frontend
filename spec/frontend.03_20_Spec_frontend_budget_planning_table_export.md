# Especificación FE — Exportación de tablas a Excel/CSV en Planeación de Presupuesto

**Vistas afectadas:** `/budget/planning/:idBudget` → `BudgetGridEditor.vue` (tabs "Vista Ejecutiva", "Vista Flujo", "Editor de Celdas", "Liquidación") · `/budget/planning/:idBudget/ceco/:costCenterCode` → `CecoDetailView.vue` (tabs "Causado", "Flujo")
**Ámbito:** 100 % frontend. Cero cambios a backend, modelos, servicios ni endpoints. Se reutiliza la caché del store (convención ASM-10: la matriz es presentación, no ingesta). Cero dependencias nuevas (`xlsx@0.18.5` ya está en `package.json`).
**Fecha:** 2026-10-20 · **Estado:** Aprobado (supuestos 1-8 confirmados por el usuario)
**Componentes base:** `BudgetGridEditor.vue`, `CecoDetailView.vue`, `ExecutivePivotTable.vue`, `CashFlowPivotTable.vue`, `BudgetLineGrid.vue`, `IvaSettlementPanel.vue`, `CecoMovementTable.vue`, `plugins/csvExport.js`, `planningFormat.js`, `budgetPlanningStore.js`

---

## 1. Visión general

Hoy las tablas del detalle de escenario y del detalle de CECO son de solo lectura y **no tienen exportación**: el usuario que quiere analizar o compartir los datos debe copiar/pegar manualmente. Esta especificación define un control de **"Exportar"** en ambas vistas que descarga en un clic los datos de la tabla del tab activo en formato **Excel (.xlsx)** o **CSV**, generados íntegramente en el navegador.

## 2. Alcance

**In-scope** (archivos):
- ➕ Nuevo: `crm_frontend/src/plugins/tableExport.js` — servicio compartido de exportación (CSV + XLSX, multi-hoja).
- ✏️ Modificar: `crm_frontend/src/views/budget/planning/BudgetGridEditor.vue` — botón "Exportar" + menú formato + `buildExportSheet()` por tab.
- ✏️ Modificar: `crm_frontend/src/views/budget/planning/CecoDetailView.vue` — ídem para tabs Causado/Flujo.
- 🔧 Opcional: helper de ensamble de hojas si la duplicación entre tabs lo justifica.

**Fuera de alcance:**
- ❌ Dashboard de Planeación (`PlanningDashboard`), `ScenarioTable`, ni cualquier otra tabla del CRM.
- ❌ Endpoints backend nuevos ni cambios en `crm_backend/**`.
- ❌ Exportación PDF. ❌ Permisos nuevos (aplica el gate de rol existente de cada ruta).
- ❌ Refetch de datos al exportar (se exporta lo ya cacheado en el store).

## 3. Terminología

| Término | Definición |
|---|---|
| **Tab activo** | Pestaña visible al momento de exportar; define qué tabla(s) se descargan (RF-3). |
| **Hoja (sheet)** | Bloque tabular `{ name, columns:[{key,label}], rows:[…] }` que alimenta al plugin. |
| **Valores crudos** | Números sin símbolo ni separadores de miles (`1250000`), para operarlos en Excel. |
| **ivaMode** | Toggle Neto/Con IVA del store (`budgetPlanningStore.setIvaMode`); afecta solo al tab Flujo del editor. |

## 4. Requisitos funcionales

| ID | Requisito |
|---|---|
| RF-1 | Cada vista muestra un botón **"Exportar"** (icono de descarga, estilo consistente con el módulo) junto a la barra de tabs, visible en todo tab. |
| RF-2 | Al pulsarlo se despliega un menú con dos opciones: **"Excel (.xlsx)"** y **"CSV"**. |
| RF-3 | Se exporta **solo el contenido del tab activo** (ver §5). |
| RF-4 | La exportación respeta **filtros activos** y el **modo Neto/Con IVA** según aplique al tab (CA-2/CA-4). |
| RF-5 | Los montos se exportan como **valores numéricos crudos** (sin `$`, sin separadores); encabezados legibles en español, en el orden visual de las columnas. |
| RF-6 | Nombre de archivo: `presupuesto-{idBudget}_{tab}_{fecha}.ext` — ej. `presupuesto-127_vista-ejecutiva_2026-10-20.xlsx`. Fecha local `YYYY-MM-DD`. Slugs de tab: `vista-ejecutiva`, `vista-flujo`, `editor-celdas`, `liquidacion`, `ceco-{code}-causado`, `ceco-{code}-flujo`. |
| RF-7 | Con tabla vacía o datos cargando, el botón aparece deshabilitado con `title` explicativo; no genera archivo. |
| RF-8 | Puede exportar cualquier usuario que ya pase el gate de rol de la vista (sin permisos adicionales). |
| RF-9 | La exportación **no dispara ninguna petición HTTP** (todo sale de la caché del store). |
| RF-10 | Errores inesperados se notifican con `alertService` (patrón del módulo); nunca silenciosos. |

## 5. Contenido exportado por tab

| Vista | Tab | Filas | Columnas |
|---|---|---|---|
| Editor escenario | Vista Ejecutiva | Matriz pivote visible, incl. totales por fila/columna y bloque P&G/Acumulado | CECO, Nombre, Ene…Dic, Fuera de año (si visible), Total |
| Editor escenario | Vista Flujo | Matriz de liquidez visible (bloques + resumen neto/acumulado), según ivaMode | Fecha/Bloque, Ene…Dic, Fuera de año, Total |
| Editor escenario | Editor de Celdas | Líneas del grid visibles (modo IVA aplicado) | Columnas del grid en su orden |
| Editor escenario | Liquidación | Bloques del panel de settlement tal como se renderizan | Tal como se renderizan |
| Detalle CECO | Causado / Flujo | Movimientos de `CecoMovementTable` **con los filtros RF-8.x aplicados** | Columnas de la tabla (origen, tipo, mes, monto, …) |

Los pivotes se exportan en su **forma de matriz** (una fila por CECO/bloque), no en forma de líneas planas — es lo que el usuario ve.

## 6. Requisitos no funcionales

- **RNF-1 Performance:** exportación de hasta ~10.000 celdas en < 2 s; generación síncrona aceptable.
- **RNF-2 Compatibilidad:** .xlsx abre en Excel 2016+ y LibreOffice; CSV en **UTF-8 con BOM** (`\uFEFF`) para acentos correctos al doble clic en Windows.
- **RNF-3 Consistencia visual:** mismo estilo de botón/menú del módulo (scoped CSS existente); errores vía `sweetAlert`/`alertService`. Sin librerías de UI nuevas.
- **RNF-4 Cero dependencias nuevas:** `xlsx@0.18.5` ya instalada.

## 7. Arquitectura técnica

1. **Nuevo plugin** `src/plugins/tableExport.js`:
   - API: `exportSheets({ format, filename, sheets })` con `format: 'csv' | 'xlsx'` y `sheets: [{ name, columns, rows }]`.
   - `csv` → reutiliza/extiende la lógica de `csvExport.js` (escaping + BOM); si hay varias hojas se apilan en un solo archivo separadas por fila en blanco (o se exporta solo la primera hoja si el tab produce una sola).
   - `xlsx` → `XLSX.utils.book_new` + `XLSX.utils.json_to_sheet`/`aoa_to_sheet` por hoja + `XLSX.writeFile(book, filename)`; columnas numéricas tipadas como números (no strings), `!cols` con anchos razonables.
   - Sin lógica de negocio del dominio presupuesto: solo serialización.
2. **Vistas**: cada vista expone un `buildExportSheets()` (computed/function) que transforma el estado del store al contrato de §5. La transformación vive en la vista o helper del módulo — los componentes pivote no conocen la exportación. Para no duplicar la agregación de pivotes, puede reusar las mismas funciones de cómputo que alimentan `ExecutivePivotTable`/`CashFlowPivotTable`/`CecoMovementTable` (extraer a helper compartido si es necesario).
3. **No hay cambios de backend** ni de rutas ni de gates.

## 8. Criterios de aceptación

- **CA-1** En `/budget/planning/127/`, tab Vista Ejecutiva, "Exportar → Excel" descarga `presupuesto-127_vista-ejecutiva_2026-10-20.xlsx` que al abrirlo muestra la matriz CECO×meses idéntica a la pantalla.
- **CA-2** En `/budget/planning/127/ceco/510100`, con filtro "Tipo de línea" activo, el CSV descargado contiene **solo** los movimientos filtrados.
- **CA-3** Un monto de `1.250.000` aparece en el archivo como `1250000` (numérico, sin formato).
- **CA-4** Con el modo "Con IVA" activo, la exportación del tab Flujo refleja los valores con IVA.
- **CA-5** Tab Liquidación exporta correctamente en ambos formatos.
- **CA-6** Con 0 movimientos el botón aparece deshabilitado y no genera archivo.
- **CA-7** El CSV abre en Excel mostrando correctamente acentos (BOM UTF-8).
- **CA-8** La exportación no dispara ninguna petición HTTP nueva (verificable en Network).

## 9. Supuestos y dependencias

- Los datos del tab ya están cargados en el store al exportar (si hay carga en curso aplica RF-7).
- SheetJS (`xlsx`) es la librería de exportación — ya es dependencia del proyecto.
- Los totales se exportan como **valores calculados**, no fórmulas de Excel.

## 10. Trazabilidad

Historia de usuario (descarga sencilla de tablas de Planeación) → Supuestos 1-8 confirmados → RF-1…RF-10 → CA-1…CA-8.
