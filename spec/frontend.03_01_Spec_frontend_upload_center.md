# Spec Frontend: Centro de Ingesta (`/budget/upload`)

**ID de funcionalidad:** FE-S3-UPLOAD-CENTER
**Version:** 1.0 · **Fecha:** 2026-09-07
**Documento padre:** `03_Spec_frontend_budgets.md` §3.1 (esta vista: el punto de entrada de los ETL)
**Dependencia backend:** `crm_backend/test/04_Spec_Backend_upload_status.md` (BE-S3-UPLOAD-STATUS). El frontend DEBE poder entregarse antes: modo degradado segun §7.4.
**Convenciones obligatorias:** AGENTS.md — Vue 3 `<script setup>` (JS, sin TypeScript), Pinia, alias `@`, Axios instance global con JWT auto-inyectado.

---

## 1. Objetivo

Crear la interfaz centralizada donde el equipo contable actualiza los 4 pilares de datos (Costos, Gastos, Recibos y Cartera) mediante carga de archivos Excel. Debe ser intuitiva (drag-and-drop), con estados de carga que impidan doble envio, fecha de ultima carga visible por tarjeta y manejo elegante de los errores estructurados 400 del backend (fail-fast con JSON detallado).

## 2. Alcance

**Incluye:** vista de ruta + 3 componentes + store Pinia + service Axios + rama de router/menu `/budget/upload`.
**Excluye:** vistas de Reglas y Analitica (otras specs), endpoints ETL nuevos, auditoria de usuarios upload, export/historial de cargas.

## 3. Routing y navegacion

| Elemento | Definicion |
|---|---|
| Ruta | `/budget` (rama padre, layout con menu) → `/budget/upload` (hija, default: `BudgetUploadsView.vue`) |
| Carga | Lazy: `component: () => import('@/views/budget/BudgetUploadsView.vue')` |
| Menu lateral | Nuevo grupo **Modulo Presupuestal** (`/budget`) con item **Centro de Ingesta** (`/budget/upload`). Resto de items de la rama (reglas, analitica) se registran en sus propias specs |
| Proteccion por roles | Solo gerencia/contabilidad. Reutilizar el mecanismo de gateo existente del router (`meta` + guard que ya usa `userStore`). **Pendiente (PQ-1):** verificar el guard real en `src/router/index.js` y el valor exacto de los roles; si el mecanismo no existe, mostrar/ocultar el item de menu segun el rol del `userStore` y redirigir acceso directo no autorizado a la vista Home |

## 4. Arquitectura de componentes (arbol de archivos)

Nomenclatura aprobada: la del Centro de Ingesta (no `FileUploaderCard`/`ErrorFeedbackTable` de la spec madre).

```
src/
  views/budget/
    BudgetUploadsView.vue                 # Vista de ruta: encabezado + UploadDashboard
  components/budget/upload/
    UploadDashboard.vue                   # Grid de 4 tarjetas ETL + integracion de status
    FileDropZone.vue                      # Componente reutilizable de arrastrar/soltar
    UploadFeedbackModal.vue               # Modal unico de exito/error para las 4 tarjetas
  stores/budgetUploadStore.js             # Pinia: status, isUploading, feedback, acciones
  services/budgetUploadService.js         # Axios: 4 uploads + GET status
```

- **BudgetUploadsView.vue:** pagina title "Centro de Ingesta", descripcion breve para contables, y monta el dashboard. Sin logica de negocio.
- **UploadDashboard.vue:** define el arreglo de configuracion declarativa `ETL_CARDS` (una entrada por pilar con: clave de dataset, titulo, icono/emoji, archivo esperado, endpoint, extras de formulario) e itera las tarjetas. Cada tarjeta contiene: titulo + archivo esperado (`CostosFinal.xlsx`, `LibroAuxiliarCECO.xlsx`, `Recibos.xlsx`, `EstadoCuenta306090.xlsx` como *placeholder* de ayuda, NO como validacion de nombre), linea de status de ultima carga (§7), extras (§9), `<FileDropZone/>` y boton **Cargar**.
- **FileDropZone.vue:** ver §8.
- **UploadFeedbackModal.vue:** ver §10. Una sola instancia controlada por el store.

## 5. Contrato con el backend (verificado contra `app/api/budget/upload.py`)

### 5.1 Peticiones

| Tarjeta | Metodo/Ruta | Campos `FormData` |
|---|---|---|
| Costos Reales | `POST /budget/upload/actual-costs` | `file`***, `excel_total_cost`*** (number como string) |
| Gastos Operativos | `POST /budget/upload/actual-expenses` | `file`* |
| Libro de Pagos | `POST /budget/upload/payment-ledger` | `file`*, `include_initial_balances` ("true"/"false", default false) |
| Estado de Cartera | `POST /budget/upload/accounts-receivable` | `file`*, `force` ("true"/"false", default false) |
| Status (BE nuevo) | `GET /budget/upload/status` | — |

`*` obligatorio. Booleanos FastAPI `Form`: enviar SIEMPRE como cadena `"true"`/`"false"` via `FormData.append`.

### 5.2 Respuestas 200 (campos que consume el modal de exito)

| Dataset | Campos a renderizar |
|---|---|
| `actual-costs` | `records_inserted`, `records_deleted` + flag `replaced`, `total_amount` (dinero), `source_file` |
| `actual-expenses` | `records_inserted`, `records_replaced`, `details.total_rows_processed`, `details.rows_filtered`, `details.valid_expenses` |
| `payment-ledger` | `records_inserted`, `records_replaced`, `details.total_cash_in`, `details.total_cash_out`, `details.net_liquidity` (dinero) |
| `accounts-receivable` | `records_inserted`, `records_replaced`, `records_closed`, `statement_date`, `forced` (badge), `details.total_outstanding_balance` (dinero) |

### 5.3 Formatos de error 400 reales (el parser del modal debe cubrirlos)

`error.response.data.detail` puede venir como **string** o **objeto** (y el objeto en 4 variantes verificadas):

| Kind | Detonante (prueba sobre `detail`) | Seccion UI |
|---|---|---|
| `string_detail` | `typeof detail === 'string'` (ej. "Only .xlsx files are supported", "N records have invalid dates", "References not found in catalog: [...]") | §10.4 |
| `missing_customers` | objeto con `missing_identifications` (solo Cartera) | §10.2 (Escenario A) |
| `stale_cutoff` | objeto con `file_cutoff` + `stored_cutoff` (solo Cartera) | §10.3 (Escenario B) |
| `total_mismatch` | objeto con `excel_total` + `calculated_total` (solo Costos) | §10.4 |
| `generic_examples` | objeto con `examples` (Costos: centros de costo no resueltos) | §10.4 |

### 5.4 Reglas de peticion Axios (service)

1. Usar la instance global `@/plugins/axios` (el interceptor ya inyecta `Authorization: Bearer <token>`; NO agregar headers de auth a mano).
2. Seguir el patron multipart existente de `src/services/bulkUploadService.js`: `axiosInstance.post(url, formData, { headers: { 'Content-Type': 'multipart/form-data' } })`. **PROHIBIDO fijar `boundary` a mano**: el navegador reescribe el Content-Type con el boundary real al enviar `FormData`; fijarlo manualmente rompe el parseo de FastAPI.
3. Timeout por peticion de subida: `timeout: 120000` (los ETL pueden tardar). **Pendiente (PQ-2):** verificar el timeout global de la instance; si ya es >= 120 s, no sobreescribir.
4. Documentar las formas de respuesta con `@typedef` JSDoc en el service (decision: sin TypeScript).

## 6. Estado — `budgetUploadStore.js` (Pinia)

```
state:
  status:        { actual_costs: {last_upload}, actual_expenses: {...}, payment_ledger: {...}, accounts_receivable: {...} } | null
  statusLoading: bool
  statusFailed:  bool                 # solo afecta lineas de status, nunca las subidas
  uploading:     { actualCosts, actualExpenses, paymentLedger, accountsReceivable }  # flags por tarjeta
  feedback:      { open: bool, dataset: str, kind: 'success'|'error', payload: object }
actions:
  fetchStatus()                       # GET status; catch -> statusFailed=true (silencioso)
  upload(datasetKey, { file, extra }) # guarda file en memoria por dataset (retry), bloquea uploading[key],
                                      # llama service, normaliza exito/error, abre feedback;
                                      # SIEMPRE fetchStatus() tras 200; finally libera flag
  retryWithForce(datasetKey)          # reusa FormData en memoria con force=true (§10.3)
  retrySame(datasetKey)               # reintento de red (§10.4)
  closeFeedback()
getters:
  isBusy(datasetKey)
```

**Anti-doble-envio (NFR):** guard de reentrada en `upload()` (`if (uploading[key]) return`) + UI deshabilitada (§8/§9).
**Normalizacion de errores:** la accion `upload` delega en `classifyError(err)` que produce el `kind` de §5.3; los 401/403 **no** abren modal (el interceptor global redirige a login). 422 (validacion FastAPI de campos Form) se mapea a `string_detail` con mensaje amigable.

## 7. Fecha de ultima carga por tarjeta (decision: endpoint, NO localStorage)

1. **Fuente:** `GET /budget/upload/status` (BE-S3-UPLOAD-STATUS). Contrato: objeto por dataset con unico campo `last_upload: datetime | null`.
2. **Ciclo de vida:** `fetchStatus()` en `onMounted` de `BudgetUploadsView.vue` (una sola peticion para las 4 tarjetas) y nuevamente tras cada subida con 200 (refresco silencioso, sin skeleton).
3. **Renderizado por tarjeta:**
   - `last_upload` presente -> `Ultima carga: 5/09/2026, 2:32 p. m.` (formato `Intl.DateTimeFormat('es-CO')` + tiempo relativo "hace N días/semanas").
   - `null` -> `Sin cargas registradas` (estilo tenue).
   - `statusLoading` -> esqueleto/em-dash.
   - `statusFailed` -> `Fecha de ultima carga no disponible` + icono de reintentar (llama `fetchStatus()`).
4. **Modo degradado (dependencia):** si el endpoint BE aun no existe (404 o fallo de red), las tarjetas de subida siguen 100 % funcionales. El status es decorativo y nunca bloquea una carga.
5. El fallo del batch completo NUNCA muestra toast/modal: degradado inline discreto.

## 8. `FileDropZone.vue` — especificacion detallada

**Props:** `datasetKey: string`, `modelValue: File|null` (v-model del archivo), `disabled: boolean` (true mientras `uploading`), `maxMb: number = 25`, `hintFile: string` (nombre de archivo esperado, solo ayuda visual).
**Emits:** `update:modelValue` (File o null), `reject` (motivo: `extension` | `size` | `multiple`).

| Aspecto | Comportamiento |
|---|---|
| Visual | Area con borde punteado, icono nube + texto "Arrastra tu archivo .xlsx aqui o haz click para seleccionar". Estados: `idle`, `dragover` (borde/contorno resaltado), `disabled` (opacidad 0.5, `cursor: not-allowed`), `selected` (muestra chip con nombre + tamano formateado KB/MB + boton "Quitar") |
| Seleccion | Click o tecla Enter/Space sobre la zona (que es un `div role="button" tabindex="0"`) abre `input[type=file]` oculto con `accept=".xlsx"` |
| Drag & drop | HTML5 nativo: `dragenter`/`dragover` (preventDefault + estado), `dragleave`, `drop`. **Sin dependencias npm nuevas** |
| Validacion frontal | (1) Solo 1 archivo: si `dataTransfer.files.length > 1` -> tomar el primero + `reject('multiple')`. (2) Extension `.xlsx` case-insensitive (`name.toLowerCase().endsWith('.xlsx')`). (3) Tamano <= `maxMb`. Error inline rojo bajo la zona; el archivo invalido **no** se emite ni se guarda |
| Nota de alcance | La validacion de extension no valida contenido del Excel; el backend revalida y responde 400 si aplica |
| Accesibilidad | `aria-disabled`, textos de error con `aria-live="polite"`, foco visible |

## 9. Comportamiento por tarjeta

### 9.1 Costos Reales — campo obligatorio adicional

El backend exige `excel_total_cost` (number). La tarjeta incluye input numerico **"Total de costo segun el Excel"** con:
- Help text: "Suma de la columna de costos del archivo. Sin separadores de miles; decimal con punto. El servidor valida con tolerancia de 100."
- Validacion client-side para habilitar **Cargar**: numero > 0 y parseable (`Number.isFinite`).
- Se envia como string en FormData. Error `total_mismatch` del servidor -> §10.4.

### 9.2 Gastos Operativos
Solo archivo. Sin extras.

### 9.3 Libro de Pagos (Liquidez)
Checkbox opcional **"Incluir saldos iniciales"** (`include_initial_balances`, default desmarcado) con tooltip: "Suma los registros de saldos iniciales del archivo al flujo de caja."

### 9.4 Estado de Cartera
Checkbox opcional **"Forzar carga (omitir guardia de corte antiguo)"** (`force`, default desmarcado) con tooltip: "Use solo si esta seguro de que el archivo corresponde a un corte anterior valido; marcar documentos como pagados podria generar cierres falsos." Ademas, el boton de fuerza reactivo del Escenario B (§10.3) es la via principal.

### 9.5 Boton Cargar (comun a las 4)

Habilitado solo si: hay archivo valido Y (no hay uploading) Y extras obligatorios completos (solo 9.1). Al hacer click: `store.upload(...)`. Durante uploading: boton en estado spinner con texto "Procesando...", drop zone deshabilitada (§8).

## 10. `UploadFeedbackModal.vue`

Modal centrado con overlay, controlado por `store.feedback`. Cerrable con Esc/click-fuera (salvo durante uploading). Renderiza segun `kind`:

### 10.1 Exito (HTTP 200)
Check verde + titulo `message` del backend + **resumen segun mapeo de §5.2**: filas insertadas/reemplazadas (y cerradas/borradas segun apliquen) en tipografia numerica destacada + **sumatoria de dinero** en tarjeta secundaria con formato COP (`Intl.NumberFormat('es-CO', { style:'currency', currency:'COP', maximumFractionDigits:0 })`). Si `forced === true` (Cartera): badge naranja **"Carga forzada"`. Acciones: "Cerrar" (limpia archivo y formulario de la tarjeta) y "Cargar otro archivo" (conservando extras como `excel_total_cost`).

### 10.2 Escenario A — Clientes fantasma (`missing_customers`)
1. Encabezado rojo con el `message` del backend.
2. Mensaje local destacado: **"No pudimos procesar el archivo porque estos clientes no estan registrados en el CRM."**
3. Tabla HTML estandar (`<table>` estilizado con CSS propio del proyecto, sin Vuetify) iterando `examples` (max 20 por payload del backend): columnas `NIT/identificacion` | `Nombre` | `Documentos` (array unido por comas). Celda de identificacion con boton de copiado por fila.
4. **Boton "Copiar todos los NITs"**: copia `missing_identifications.join(',')` via `navigator.clipboard.writeText` (fallback `execCommand('copy')` en HTTP/inseguro); feedback transitorio "Copiado ✓".
5. Si `missing_count > examples.length`: nota "Mostrando los primeros {examples.length} de {missing_count} clientes faltantes; la lista completa para copiado esta disponible con el boton anterior." (el botón copia la lista completa).
6. Pie modal: nota de transaccion — "No se guardo ningun cambio en el CRM."

### 10.3 Escenario B — Archivo obsoleto (`stale_cutoff`)
1. Alerta ambar: `detail.message` formateando `file_cutoff` vs `stored_cutoff` como fechas locales.
2. Acciones: **"Cancelar"** y **"Forzar Carga de Corte Antiguo"** (boton primario de alerta).
3. Flujo del boton: `store.retryWithForce('accountsReceivable')` -> reconstruye FormData con el archivo **conservado en memoria** (sin abrir de nuevo el explorador, decision A11) + `force='true'`, cierra el modal y muestra el spinner de la tarjeta. Resultado -> modal de exito normal (con badge "Carga forzada") o modal de error del nuevo intento.
4. Si ademas el checkbox §9.4 estaba activo, el backend no deberia devolver este error (informativo para QA).

### 10.4 Resto de errores

| Kind | UI |
|---|---|
| `total_mismatch` | Tabla comparativa: Total declarado en UI (`excel_total`) vs Suma calculada (`calculated_total`) vs Diferencia vs Tolerancia. Mensaje: "El total digitado no cuadra con la suma de los costos del archivo (±100 COP). Revisa y vuelve a intentar." |
| `generic_examples` | Tabla genérica renderizando dinamicamente las claves de `examples[0]` como columnas (documento, codigo, motivo). Encabezado con `detail.message` |
| `string_detail` | Parrafo con el texto legible (preservar saltos de linea). Si parece lista (ej. "References not found in catalog: [ ... ]"), parsear corchetes y renderizar chips copiables |
| `server` (500) | Mensaje amigable: "El servidor no pudo procesar el archivo y no se guardo ningun cambio. Verifica que sea el Excel correcto o contacta soporte." + bloque `<details>` tecnico con `detail` crudo |
| `network` (sin `err.response`) | "Sin conexion con el servidor o la carga excedio el tiempo de espera." + boton **"Reintentar"** (`retrySame`: mismo FormData en memoria) |
| 401/403 | No abre modal: interceptor global redirige a login |
| 422 | `string_detail` con mensaje genérico "La solicitud fue rechazada por validacion de datos. Reintenta o contacta soporte." |

## 11. Requisitos no funcionales

| ID | Requisito |
|---|---|
| NFR-1 | **Cero dependencias npm nuevas**: DnD HTML5 nativo, modal y tablas con CSS propio del proyecto (el repo NO usa Vuetify: nada de `v-data-table`/`v-alert`/`v-expansion-panels`) |
| NFR-2 | JS puro `<script setup>` + JSDoc (sin TypeScript, convencion del repo). Formateadores existentes de `src/plugins/formatters.js` reutilizar si aplican |
| NFR-3 | Anti doble-envio: guard del store + UI bloqueada (§8/§9.5) |
| NFR-4 | Unico archivo, .xlsx, <= **25 MB** validado en cliente antes de red |
| NFR-5 | Responsive: grid 4 columnas (>=1280px), 2 (>=768px), 1 (movil). Sin DnD en touch: flujo click/explorador |
| NFR-6 | a11y: zona foco-ble, `aria-live` en errores y status, roles semanticos en modal (`dialog`, `aria-modal`), contraste de estados rojo/verde |
| NFR-7 | Fechas/moneda locales es-CO via `Intl` (nunca hardcodear formato) |
| NFR-8 | Timeout de subida 120 s (§5.4) |
| NFR-9 | Todos los textos de UI en espanol |

## 12. Criterios de aceptacion (verificacion manual/QA)

1. Con `GET /budget/upload/status` implementado, la vista muestra la fecha por tarjeta y "Sin cargas registradas" cuando `last_upload` es null.
2. Con el endpoint status AUN no implementado (404), las 4 tarjetas suben archivos con normalidad y solo el renglon de fecha degrada con "no disponible" + reintentar.
3. Arrastrar un `.csv` o un .xlsx > 25 MB produce error inline y **no** dispara peticion HTTP.
4. Seleccionado valido muestra nombre + tamano antes de pulsar Cargar.
5. Tarjeta Costos: boton Cargar deshabilitado hasta tener archivo Y `excel_total_cost` > 0; el POST incluye ambos campos FormData.
6. Durante la promesa: drop zone deshabilitada, spinner en boton, segundo click no genera una segunda peticion (verificar en Network).
7. 200 `actual-costs`: modal con filas insertadas/eliminadas + `total_amount` en formato COP.
8. 400 `detail` string: se renderiza como parrafo, sin tabla rota ni `[object Object]`.
9. 400 `missing_identifications` (Cartera): tabla <= 20 ejemplos + "Copiar todos los NITs" funcional (portapapeles verificado).
10. 400 `stale_cutoff`: boton "Forzar Carga de Corte Antiguo" reenvia MISMO archivo (sin re-seleccionar) con `force=true`; exito muestra badge "Carga forzada".
11. 500 del ETL: mensaje amigable + detalle tecnico colapsable + nota "No se guardo ningun cambio".
12. Caer la red a mitad de subida -> modal `network` con "Reintentar" que reenvia el archivo en memoria.
13. Token expirado (401) -> redireccion a login del interceptor, sin modal.
14. 422 por un valor no numérico en `excel_total_cost` forzado via DevTools -> mensaje generico, UI no rompe.
15. Tras una subida exitosa, la linea "Ultima carga" de la tarjeta se actualiza sin recargar la pagina (F5 no requerido).

## 13. Trazabilidad de decisiones de la sesion

| Supuesto/Decicion | Resolucion en esta spec |
|---|---|
| A1 Nomenclatura de componentes | Aprobada: `BudgetUploadsView` / `UploadDashboard` / `FileDropZone` / `UploadFeedbackModal` (§4) |
| A2 Fecha ultima carga | **REVISADO**: no localStorage. Endpoint `GET /budget/upload/status` — ver spec BE `crm_backend/test/04_Spec_Backend_upload_status.md` (§7) |
| A3 `excel_total_cost` obligatorio | §9.1 |
| A4 Sin Vuetify (HTML/CSS propio) | NFR-1, §10.2 |
| A5 Sin TypeScript (JSDoc) | NFR-2, §5.4 |
| A6 `include_initial_balances` checkbox | §9.3 |
| A7 Multipart en Axios | §5.4 (patrón `bulkUploadService.js`, boundary gestionado por navegador) |
| A8 Escenario A aplica solo a Cartera; otros 400 tienen otros formatos | §5.3 matriz completa + §10.4 |
| A9 Limite 25 MB | NFR-4, §8 |
| A10 Gateo de roles existente | §3 + PQ-1 |
| A11 Reintento force sin re-seleccion | §10.3 |
| A12 Boton copiar lista de NITs | §10.2.4 |
| Q1 Forma del endpoint | Agregado `GET /budget/upload/status`, respuesta minima |
| Q2 Fuente del dato | Derivado `MAX(created_at)` sin tabla audit (v2 en backlog BE §8) |

## 14. Pendientes para implementacion (PQ)

1. **PQ-1 (roles):** confirmar el mecanismo real de gateo por rol del router/`userStore` del CRM y los nombres exactos de roles gerencia/contabilidad.
2. **PQ-2 (timeout):** verificar `timeout` actual de `src/plugins/axios.js` y decidir si se sobrescribe por peticion (§5.4.3).
3. **PQ-3 (entrega):** el frontend se entrega con modo degradado (§7.4) hasta que BE-S3-UPLOAD-STATUS este en `develop`; QA de AC-1 queda bloqueada hasta entonces.

## 15. Fuera de alcance

- Subida de presupuestos base (`budget-plan-income/expense`) y cost-centers: otros endpoints, otra tarjeta/fase.
- Historial de cargas, usuario que subio, reintentos en cola.
- Componentes de analitica P&L / liquidez / comisiones.
- Validaciones client-side del CONTENIDO del Excel (el diseno es fail-fast en backend; el frontend muestra, no pre-valida filas).