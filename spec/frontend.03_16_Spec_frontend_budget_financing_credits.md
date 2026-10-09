# Spec Frontend: Créditos de financiación empresarial — alta, calendario y presupuesto

| Campo | Valor |
|---|---|
| **ID de feature** | `FE-S16-FINANCING-CREDITS` |
| **Spec counterpart** | BE: `backend.02_22` (`BE-S12-FINANCING-CREDITS`) — fuente única de fórmulas y contratos (§9 de esa spec; espejo en §5 de esta) |
| **Bases** | `frontend.03_02` (Reglas de presupuesto), `03_03`/`03_04`/`03_05` (escenario, flujo, P&L), `03_06` (line manager), `03_15` (patrón de motor proyectado y trazable) |
| **Componentes propuestos** | `FinancingCreditsView.vue`, `FinancingCreditFormModal.vue`, `FinancingCreditScheduleModal.vue`, `FinancingCreditSummaryCards.vue`, `BudgetGridEditor.vue`, `budgetFinancingCreditService.js` |
| **Convenciones** | Vue 3 Composition API `<script setup>`, JavaScript únicamente (sin TypeScript), Vue Router, Axios `@/plugins/axios` (JWT automático), alias `@`, format COP `es-CO`; la simulación what-if de presupuesto se cachea en el `budgetPlanningStore` existente, sin crear Pinia store nuevo |
| **Fecha** | 2026-10-09 |

---

## 1. Objetivo y separación de dominios

Dar de alta, consultar y proyectar **financiación que la empresa debe**. Es una obligación distinta de los créditos actuales asociados a facturas: la UI no llama ni extiende `credits`, no reutiliza sus endpoints y etiqueta siempre este módulo como **Financiación empresarial**.

El backend calcula el calendario. El frontend captura condiciones y presenta valores servidos por BE; **no calcula amortización, interés, cuota, seguros ni fechas de cuotas en JavaScript**.

Reglas visibles al usuario:

- Capital es una **salida de financiación**: se ve en schedule y cash flow; jamás se clasifica como gasto P&L ni como expense de `budget_lines`.
- Interés y seguro son **gastos presupuestales**, aparecen en P&L y cash flow una vez cada uno.
- El calendario muestra cada componente y su propia fecha de pago/vencimiento.
- El endpoint de cash flow obtiene capital, interés y seguro del calendario activo de financiación, por sus respectivas fechas. El FE solo presenta la respuesta del endpoint; nunca suma el schedule encima ni recompone el cash flow desde líneas budget.

## 2. Alcance y pendientes visibles

**Incluye v1:** ruta/nav de financiación; listado/filtros; alta manual new y legacy; selector excluyente francés/alemán; preview de calendario del BE; detalle de cuotas futuras; desglose principal/interés/seguro y vencimientos; regeneración desde el motor; lectura clara de CECO de costo; indicadores de materialización presupuestaria y warnings.

**Fuera de alcance v1:** importación masiva de históricos (propuesta provisional manual; import fuera hasta confirmación), captura o conciliación de pagos reales, conexión automática a `payment_ledger` o ledgers, abonos anticipados, gracia, tasa variable, reestructuración y monedas distintas de COP.

Panel de decisiones abiertas siempre accesible en alta/detalle (no presentarlas como aprobadas): seguro fijo por cuota/configurable pendiente; calendario mensual y días inhábiles pendientes; pagos reales frente a solo calendario proyectado pendiente; importación masiva pendiente; abonos anticipados, gracia, tasas variables y reestructuración fuera de v1. La frecuencia mensual y `monthly_periodic` son defaults del sistema confirmados para v1; la convención nominal/efectiva de tasa se elige explícitamente.

## 3. Decisiones de frontend

| ID | Decisión / supuesto de presentación |
|---|---|
| D-FE16-1 | El BE es fuente de verdad de toda aritmética y schedule. FE valida formato básico/obligatorios, sin cálculo financiero ni estimación local. |
| D-FE16-2 | Crédito antiguo solicita saldo pendiente observado y fecha de corte; UI informa que el sistema proyectará solo cuotas posteriores y no reconstruirá cuotas previas. |
| D-FE16-3 | Crédito nuevo solicita principal/fecha de desembolso y condiciones; el BE deriva la primera fecha un mes después del desembolso. Preview muestra `conditions.first_due_date` normalizada que retorna BE; FE no calcula fechas. |
| D-FE16-11 | Frecuencia `monthly` y convención `monthly_periodic` se envían automáticamente como defaults del sistema para v1. La convención de tasa continúa siendo una elección explícita. |
| D-FE16-4 | Selector de método obligatorio, labels claros: “Cuota fija (francés)” y “Capital fijo (alemán)”; explicar que en alemán la cuota financiera disminuye normalmente. |
| D-FE16-5 | La vista de cuota separa Capital (financiación), Interés (gasto) y Seguro (gasto), y evita un único monto etiquetado como gasto. |
| D-FE16-6 | CECO capturado al alta es el destino de interés y seguro; preview y schedule lo muestran sin opción de CECO por cuota en v1. |
| D-FE16-7 | Preview y persistencia llegan por endpoints BE; el FE no simula resultados mientras carga ni muestra cifras aproximadas. |
| D-FE16-8 | Vistas/lista son paginadas por BE; datos económicos se mantienen en estado local y no se guardan en `localStorage`. |
| D-FE16-9 | No Pinia store nuevo por defecto: dominio consumido por la vista dedicada; crear solo si un requerimiento concreto necesita compartir estado entre rutas. |
| D-FE16-10 | La UI conserva warnings de schedule y materialización; no declara conciliado/pagado un valor que solo tiene status proyectado. |
| D-FE16-12 | En presupuesto no activo, `BudgetGridEditor` muestra vía `scenarioView` las líneas what-if de interés y seguro devueltas por BE; se excluye principal. Al marcar Meta Activa el BE materializa los gastos, y el FE refresca el detalle para sustituir simulación por líneas reales. Presupuestos activos nunca piden ni mezclan simulación. |
| D-FE16-13 | En la Vista Flujo del presupuesto, el principal se obtiene aparte por `GET /budget/planning/{id_budget}/financing-principal-flow` para escenarios active, draft y closed. Sus líneas no se fusionan en `scenarioView` ni en `budget_lines`; se muestran en un pivot independiente de caja por CECO y fecha de pago, con buckets fuera de año y sin alterar Ejecutiva/P&L. |

## 4. Componentes, ruta y navegación

```text
src/views/budget/FinancingCreditsView.vue                   NUEVO — listado y acciones
  ├─ toolbar: búsqueda, CECO, estado, origen new/legacy, [Nuevo crédito]
  ├─ tabla/paginación: nombre/acreedor, origen, método, CECO, saldo, próximas fechas,
  │                    interés/seguro proyectados, estado y [Ver calendario]
  ├─ <FinancingCreditFormModal />                            alta/edición controlada
  └─ <FinancingCreditScheduleModal />                        detalle por componente

src/views/budget/components/FinancingCreditFormModal.vue     NUEVO
src/views/budget/components/FinancingCreditScheduleModal.vue NUEVO
src/views/budget/components/FinancingCreditSummaryCards.vue  NUEVO, opcional si no cabe
src/services/budgetFinancingCreditService.js                 NUEVO, Axios centralizado
src/views/budget/planning/BudgetGridEditor.vue                EXISTENTE — simulación de financiación en borradores
src/stores/budgetPlanningStore.js                             EXISTENTE — caché de simulación, sin store nuevo
src/router/index.js                                          NUEVO route /budget/financing-credits
menú Presupuesto                                             ítem “Financiación empresarial”
```

Revisar router y menú existentes para usar su patrón/ruta de layout; no crear store por conveniencia ni añadir dependencia. Ruta con nombre `financing-credits`, breadcrumb Presupuesto → Financiación empresarial. El acceso al módulo no debe confundirse con clientes/cuentas por cobrar.

## 5. Formularios y contrato consumido

### 5.1 Campos comunes

Nombre/referencia del crédito, acreedor, CECO requerido, método requerido, moneda fijada COP, tasa anual, convención de tasa elegida explícitamente, cantidad de cuotas restantes y seguro conforme al contrato activo. Frecuencia mensual y day-count `monthly_periodic` se envían como defaults automáticos de v1; mostrar una nota informativa de solo lectura. La UI no debe inventar default de tasa ni mostrar formato `18` ambiguo: presentar porcentaje legible, enviar la representación acordada de API y explicar si la tasa ingresada es nominal o efectiva.

Al editar un crédito existente de origen `legacy`, conservar y mostrar `first_due_date` como próxima fecha de vencimiento; el preview y el detalle siguen mostrando la fecha que responde BE. En créditos de origen `new`, no mostrar ni validar ni enviar `first_due_date` en el formulario de edición: al omitirlo del payload, BE conserva el dato existente. Para una creación nueva de origen `new`, la fecha inicial es derivada por BE y no es un control de captura.

El control de seguro se rotula “Seguro por cuota (COP)” solo si OQ-03 provisional quedó habilitada por BE; si el negocio exige otra fórmula, renderizar el control definido por el contrato, sin convertir a porcentaje en el cliente. Si no existe configuración confirmada, permitir cero únicamente cuando BE lo permita y mostrar la decisión pendiente.

### 5.2 Crédito nuevo

Campos obligatorios: fecha de desembolso, principal desembolsado, método, tasa y convención, plazo, CECO y datos del acreedor. No pedir manualmente la primera fecha: el backend la deriva un mes después del desembolso y la devuelve normalizada en `conditions.first_due_date` del preview. Mostrar ese valor servido por BE antes de guardar. Omitir `first_due_date` tanto en preview como en alta para crédito nuevo; no calcular ni alterar la fecha en FE. Microcopy: “Se proyectan las cuotas futuras desde el desembolso; la primera fecha la determina el sistema y no se registran pagos reales automáticamente”.

Validaciones FE de formato: principal positivo, cuotas entero positivo, COP, fechas parseables y campos requeridos. No validar la cuota ni decidir si tasa es económicamente válida; el BE devuelve validaciones definitivas.

### 5.3 Crédito antiguo

Campos obligatorios: **saldo de capital pendiente** (etiqueta literal), fecha de corte, cuotas restantes, **Próxima fecha de vencimiento**, tasa/convenio, método elegido, CECO, acreedor y seguro. Esta fecha sigue siendo manual para legacy: el saldo y el corte no determinan cuál es el próximo vencimiento. Mostrar alerta antes de preview:

> “El saldo ingresado corresponde a la fecha de corte. El calendario comienza después de esa fecha; no se reconstruyen cuotas anteriores ni se enlaza con un libro de pagos.”

Rechazar visualmente envío si la próxima fecha de vencimiento es anterior o igual al corte, y mostrar error del BE si hay discrepancia. Enviar esta fecha en el payload legacy. Nunca pedir al usuario que cargue cuotas ya pagadas para ajustar el calendario de v1.

### 5.4 Métodos

El formulario requiere elegir exactamente una opción:

- **Cuota fija (francés):** importe financiero mensual (capital + interés) normalmente estable; último pago puede ajustarse por centavos. El seguro se presenta aparte.
- **Capital fijo (alemán):** abono a capital fijo, interés decrece con saldo y la cuota financiera suele decrecer. El seguro se presenta aparte.

Texto “normalmente/suele” refleja que fechas, interés, redondeo y seguro dependen del contrato acordado, no una promesa del FE. No calcular ni previsualizar cuotas usando estas descripciones.

### 5.5 Contrato HTTP

Base a través del Axios JWT: `/budget/financing-credit`; coincide con `backend.02_22` §9.

| Uso UI | Petición | Respuesta/acción |
|---|---|---|
| Listado | `GET /budget/financing-credit?q=&id_cost_center=&status=&origin_type=&page=&size=` | `{total, items[]}`; tabla server-paged. |
| Preview | `POST /budget/financing-credit/preview` | `FinancingSchedulePreview` de BE, sin persistir; mostrar únicamente lo retornado. |
| Alta | `POST /budget/financing-credit` | Maestro + schedule + materialización atómicos; resultado incluye schedule revision y warnings. |
| Detalle | `GET /budget/financing-credit/{id}` | Maestro y resumen de schedule activo. |
| Calendario | `GET /budget/financing-credit/{id}/schedule?date_from=&date_to=&page=&size=` | Installments con componentes, estados y fechas por componente. |
| Edición | `PUT /budget/financing-credit/{id}` | BE regenera artifacts solo de ese crédito; refrescar listado y detalle. |
| Regenerar | `POST /budget/financing-credit/{id}/recalculate` | Contadores reemplazados/creados y warnings; solo motor afectado. |
| Cierre | `POST /budget/financing-credit/{id}/close` | Cierre administrativo; no etiquetar como pagado/conciliado; conserva el registro. |
| Eliminación definitiva | `DELETE /budget/financing-credit/{id_financing_credit}` | Elimina el crédito, su calendario, entradas de financiación futura y solo líneas generadas de interés/seguro; no modifica créditos de facturas ni líneas manuales. Requiere confirmación irreversible. |
| What-if del presupuesto | `GET /budget/planning/{id_budget}/financing-simulation` | `{id_budget,budget_year,financing_credits_count,total_interest,total_insurance,total_annual_expenses,lines:[{month,budget_date,payment_date,id_cost_center,cost_component_code,component_name,description,amount,id_financing_credit,id_financing_credit_installment}]}`. Solo intereses/seguros; solo lectura; para presupuesto activo responde 400 porque sus gastos ya están materializados. |
| Principal en flujo del presupuesto | `GET /budget/planning/{id_budget}/financing-principal-flow` | `{id_budget,budget_year,total_principal,lines:[{month,payment_date,id_cost_center,amount,id_financing_credit,installment_number,description}]}`. Solo lectura; devuelve vencimientos del schedule activo. El FE lo cachea por presupuesto y lo presenta en un pivot separado de caja, sin incorporarlo a `budget_lines`/P&L. |
| Activación de meta | `PUT /budget/planning/{id_budget}/set-target` | BE materializa los gastos de interés/seguro; resultado puede incluir `financing_lines_created` y `financing_warnings`. FE los añade al toast junto al conteo de nómina sin reemplazarlo. |

Nombres finales de campos deben espejar Pydantic BE; no normalizar/derivar cálculos en service FE. Los importes se formatean con `Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:2,maximumFractionDigits:2})`; fechas como `dd/mm/aaaa`, al enviar ISO `YYYY-MM-DD`.

## 6. Preview, calendario y vistas

### 6.1 Preview de BE

Tras captura, botón **“Previsualizar calendario”** llama preview. Mostrar skeleton/bloqueo mientras espera; ninguna cuota aparece hasta response 200. La respuesta es `{conditions, schedule, totals, warnings}`; para crédito nuevo, presentar `conditions.first_due_date` (normalizada por BE) antes de guardar. Preview incluye método, frecuencia/convención, fecha de corte o desembolso, CECO, revisión/hash si la API la define, lista de cuotas y totales por componente. CTA **“Crear crédito y guardar proyección”** confirma las condiciones resumidas; enviar al alta el mismo payload de condiciones que se usó en preview, sin incluir la fecha derivada de new ni recalcular antes de POST. Si el backend exige preview versionado, enviar identificador/hash original para evitar preview y commit divergentes.

Tabla responsive accesible:

| Cuota | Vencimiento capital | Capital (financiación) | Vencimiento interés | Interés (gasto) | Vencimiento seguro | Seguro (gasto) | Saldo después |
|---|---|---:|---|---:|---|---:|---:|

En pantallas estrechas, permitir scroll horizontal o detalle por cuota; no ocultar clase contable ni fechas de los componentes. Totales BE al pie: capital futuro, intereses futuros, seguro futuro y desembolso total de caja. Rotular suma total como **“Salida total proyectada de caja”**, nunca “gasto” o “P&L”.

### 6.2 Listado y detalle

Listado resume deuda sin mezclar montos:

- saldo/capital pendiente del principal en una columna llamada “Saldo de capital”;
- interés y seguro futuro como costos presupuestarios separados;
- método, moneda COP, estado, CECO, origen nuevo/antiguo;
- fecha de corte visible en créditos legacy;
- próxima fecha por componente si fechas difieren;
- insignia “Proyectado” por defecto.

Detalle tiene secciones **Condiciones**, **Calendario futuro**, **Tratamiento en presupuesto** y **Trazabilidad** (revisión/origen/corte). Advertencia visible: “Calendario proyectado; no es constancia de pago real”. Para crédito legacy señalar explícitamente “No se muestran cuotas previas al corte”.

### 6.3 Colocación en Presupuesto / P&L / flujo

El módulo no inventa filas frontend paralelas a `budget_lines`. Interés y seguro llegan materializados desde BE a líneas expense existentes para budget/P&L; deben verse en P&L como gastos con etiquetas de componente/origen y bloqueadas como líneas de motor. **En presupuestos no activos**, `BudgetGridEditor` consume `GET /budget/planning/{id_budget}/financing-simulation` y fusiona las `lines[]` del BE a `scenarioView` como `expense` fijo, simulado y no persistido (`id_budget_line: null`, `source_engine: 'financing_credit_sim'`). Ejecutiva, Flujo del escenario y editor leen esa vista; la cuadrícula aplica el mismo gate readonly de las demás líneas simuladas. El aviso indica conteo/totales de interés y seguro y que son what-if/no materializados hasta activar la meta. Error recuperable incluye reintento. Al activar la meta el backend materializa las líneas; el toast presenta `financing_lines_created`/`financing_warnings` si llegan y el editor recarga el detalle. Presupuestos activos no consultan ni agregan simulación (el endpoint responde 400 porque ya hay líneas reales).

En la **Vista Flujo del presupuesto**, `BudgetGridEditor` consulta además `GET /budget/planning/{id_budget}/financing-principal-flow` para presupuestos active, draft y closed. La caché de esta respuesta es independiente y las `lines[]` se pasan como prop independiente `financingPrincipalLines` a `CashFlowPivotTable`; no se transforman en filas `expense` ni se anexan a `scenarioView.budget_lines`. El bloque condicional **“Salidas — Capital de financiación”** se pivota por `id_cost_center` y `payment_date`, muestra la nota “Pago de capital: salida de financiación, no gasto P&L” e integra sus meses, total anual, neto/acumulado y buckets fuera de año. Solo presenta el capital del schedule activo una vez; no recalcula calendario ni suma intereses/seguros, que continúan por sus rutas actuales. El endpoint global de cash flow existente no se cambia ni se suma de nuevo desde el schedule. Un error del endpoint presupuestario mantiene disponible el resto de la Vista Flujo y permite reintento.

Si BudgetLine grid o detail manager expone líneas fuente, añadir chip “Financiación” para `source_engine='financing_credit'` y lectura bloqueada; campos de componente muestran “Interés”/“Seguro”. No permitir editar/borrar una línea del motor desde line manager: acción de corregir es editar condiciones/regenerar el crédito. No alterar el contrato de líneas ajenas.

El FE no vuelve a sumar schedule a cash flow: consume el endpoint de cash flow existente. Si presenta totales de resumen en su detalle, los totales por componente son solo presentación y no alimentan el endpoint ni el P&L.

## 7. Estados, errores y permisos

- **Loading listado:** skeleton; proteger contra doble submit/preview con flags `loading`, `previewing`, `saving`, `recalculating`.
- **Vacío:** “Aún no hay créditos de financiación registrados” + CTA crear.
- **Preview inválido 400:** mostrar `detail.message` en banner y `field` junto al control cuando exista; mantener inputs, borrar preview anterior para no mostrar datos obsoletos.
- **Convención de tasa:** requiere selección explícita; mostrar error estructurado del BE y no suplir la elección con un default local. Frecuencia y day-count se envían como defaults explícitos `monthly` y `monthly_periodic` de v1.
- **Conflicto 409:** conservar datos, informar que condiciones/schedule cambiaron, recargar y solicitar nueva preview; no reintentar POST automáticamente.
- **401/403:** usar patrón global de sesión/permisos; ocultar controles de edición si el rol no puede modificar, mantener error explícito si backend responde 403.
- **404:** indicar crédito/CECO/presupuesto destino no encontrado; permitir volver al listado.
- **422:** mensaje de validación por campo si viene estructurado; nunca reemplazar por “error inesperado” genérico.
- **500/red:** mensaje recuperable; no comunicar éxito ni afirmar que schedule fue guardado.
- **Warnings de materialización:** crédito y schedule pueden persistir aunque algunos expenses carezcan de presupuesto destino según BE; mostrar banner con año/conteo y enlace a escenario/presupuesto si viene ID. No declarar que el presupuesto está actualizado hasta confirmación BE.
- **Simulación presupuestaria:** un fallo del GET financing-simulation deja disponibles el escenario y sus otras líneas, muestra estado de error y retry. No llamar ese GET para un escenario `active`; en borrador mostrar solo las filas de gasto entregadas por BE, nunca estimar calendario en frontend.
- **Estado real:** dado el supuesto provisional de calendario solamente, etiquetas “Proyectado”; sin checkbox de pagado, pago parcial ni conciliación en FE.
- **Cerrar crédito:** confirm modal informa que cierre no equivale a pago real; respetar contrato BE y no borrar historial.
- **Eliminar definitivamente:** la acción solo se muestra a usuarios con permiso de edición, tanto en listado como en detalle. Preguntar explícitamente por una eliminación irreversible y distinguirla del cierre: cerrar con saldo real cero conserva el registro. Confirmar que se eliminan calendario, entradas de financiación futura y SOLO líneas generadas de interés/seguro; no se modifican créditos de facturas ni líneas manuales. No retirar/ocultar localmente el crédito ni refrescar datos antes de una respuesta exitosa del DELETE. Bloquear solicitudes duplicadas; mostrar errores de permisos (403), no encontrado (404) y red, y tras éxito cerrar el detalle si aplica, refrescar listado y el cash flow que estaba consultado.

Permisos de view/edit deben venir del patrón de roles backend. Frontend no es enforcement; esconder/deshabilitar acciones es UX y backend sigue autorizando.

## 8. Reglas visuales y accesibilidad

1. Chips semánticos con texto, no solo color: `Financiación` (capital), `Gasto` (interés/seguro), `Proyectado`, `Antiguo — desde corte`, `Nuevo`.
2. Capital tiene subtítulo/tooltip “salida de financiación; no es gasto P&L”. Interés y seguro: “gasto presupuestario; también incluido en flujo de caja”.
3. No usar un solo color/etiqueta de “cuota” para sumar y clasificar toda la fila como expense. Totales separados; total caja tiene rótulo expreso.
4. Tablas HTML con encabezados `scope`, `aria-label` en español, estado de loading `aria-live=polite`; controles con `<label>`/errores asociados; navegación de modal por teclado y focus trap consistente con modales del budget.
5. Tema light/dark vía tokens CSS del CRM. Estados/warnings conservan contraste AA razonable y descripción textual.
6. Formato COP consistente, precisión de 2 decimales; no `Number()` para cálculos ni `toFixed` para amortización. Conversión a string solo al renderizar response Decimal.
7. Diseño responsive: scroll de tabla aislado, no esconder vencimientos; fecha de corte presentada en primer plano para legacy.

## 9. Contrato de caja y no doble conteo

Esta sección gobierna componentes del feature en todas las vistas frontend:

| Concepto | Sección de UI | Tratamiento |
|---|---|---|
| Principal/capital | Schedule, detalle de financiación y cash flow | Proyección de salida de financiación desde el calendario activo; excluido de gasto/P&L y de expense budget lines. |
| Intereses | Schedule y budget/P&L; cash flow desde calendario activo | Gasto presupuestal y salida de caja; el endpoint los obtiene del calendario, no de expense lines. |
| Seguros | Schedule y budget/P&L; cash flow desde calendario activo | Gasto presupuestal y salida de caja; el endpoint los obtiene del calendario, no de expense lines. |
| Total caja | Detalle/schedule o endpoint de cash flow | Principal + interés + seguro, cada componente exactamente una vez. No es resultado operativo ni gasto P&L. |

El componente de calendario solo visualiza la respuesta por cuota. No recalcula series mensuales, no compone `budget_lines` localmente y no suma ninguno de los componentes del schedule sobre la respuesta del endpoint cash flow. Para un crédito de ejemplo con capital 900.000, interés 80.000, seguro 20.000, la salida de caja reportada por BE es 1.000.000; gasto P&L es 100.000.

## 10. Archivos y convenciones de servicio

`budgetFinancingCreditService.js` exporta funciones puras de transporte Axios (`listFinancingCredits`, `previewFinancingCredit`, `createFinancingCredit`, `getFinancingCredit`, `getFinancingSchedule`, `updateFinancingCredit`, `recalculateFinancingCredit`, `closeFinancingCredit`, `deleteFinancingCredit(id)`). Usa `@/plugins/axios`; no duplica base URL/JWT. Errores se propagan al componente en patrón de servicios budget existente. `budgetPlanningService.js` transporta financing-simulation y financing-principal-flow; `budgetPlanningStore.js` mantiene cachés independientes por `id_budget`, estado loading/error y retry, y las limpia al cargar otro escenario. `BudgetGridEditor.vue` no pide financiación simulada al escenario activo y fusiona solo líneas de gastos what-if a `scenarioView` para Ejecutivo/Flujo/editor; el principal se consulta en cualquier estado y solo se entrega como prop separada a `CashFlowPivotTable`. No se modifica el endpoint global de cash flow.

Componentes `.vue` usan `<script setup>` y JS simple. Mantener cálculos en `computed` para decidir presentación/filtrado del response solamente; prohibido computar tasas, cuotas, intereses, capital o proyecciones de fecha. Evitar Pinia; listado y crédito activo se mantienen localmente mientras la vista está montada. No cachear saldos/tasas/acreedores económicos en almacenamiento persistente local.

Cambios opcionales en el administrador de líneas existente se limitan al chip y modo readonly para `source_engine='financing_credit'`; no se modifica el comportamiento de `collaborator_*`, cargas SIIGO, manuales u otras fuentes.

## 11. Requisitos no funcionales FE

| ID | Requisito |
|---|---|
| NFR-FE16-1 | Cero aritmética financiera client-side; preview y schedule son respuesta BE. |
| NFR-FE16-2 | Listado con paginación server-side, tamaño default razonable (25/50); schedule de largo plazo paginado o acotado por rango. |
| NFR-FE16-3 | No persistir datos de crédito/montos en `localStorage`, session storage ni un store global sin requerimiento. |
| NFR-FE16-4 | Diferenciar capital de expense en todos los componentes que muestran dinero. |
| NFR-FE16-5 | Comportamiento idempotente de UI: doble click no duplica requests; refrescar solo tras éxito del BE; preview obsoleto invalidado al cambiar inputs. |
| NFR-FE16-6 | No agregar dependencias; `<script setup>` JavaScript-only. |
| NFR-FE16-7 | `npm run lint` y `npm run build` limpios; probar light/dark y ancho móvil/tableta. |

## 12. Criterios de aceptación manuales

1. **AC-FE16-1 separar dominios:** menú “Financiación empresarial” abre nueva ruta; requests van a `/budget/financing-credit`; no se hacen llamadas al modelo/API `credits`.
2. **AC-FE16-2 método:** formulario requiere francés o alemán; labels/descripciones distinguen cuota fija de capital fijo; ningún método seleccionado impide preview/guardar.
3. **AC-FE16-3 crédito nuevo:** completar principal, desembolso, CECO y condiciones muestra loading; calendario solo aparece al recibir preview BE, muestra los campos/vencimientos recibidos y presenta `conditions.first_due_date` normalizada.
4. **AC-FE16-4 crédito antiguo:** saldo pendiente + corte; campo “Próxima fecha de vencimiento”; alerta indica que cuotas pre-corte no se reconstruyen; preview muestra primera fecha futura y ninguna fecha `<= cutoff`.
5. **AC-FE16-5 no cálculo FE:** con DevTools/source inspección, no hay fórmula de amortización ni generación mensual en frontend; cambiar tasa/plazo requiere pedir nueva preview BE.
6. **AC-FE16-6 redondeo/presentación:** montos COP se presentan con 2 decimales; los valores renderizados coinciden con respuesta BE; no hay error por convertir a Float en cálculos.
7. **AC-FE16-7 clasificación por cuota:** fila del ejemplo capital 900.000/interés 80.000/seguro 20.000 muestra capital como financiación, costos como gasto y total caja 1.000.000. P&L solo incluye 100.000.
8. **AC-FE16-8 cashflow:** el endpoint refleja total 1.000.000 una vez con capital, interés y seguro desde el calendario activo, independientemente de `outflow_source` y cambios de escenario; la UI presenta su respuesta sin sumar ni recomponer componentes desde el schedule o budget lines. Capital no aparece como gasto P&L.
9. **AC-FE16-9 centro de costo:** CECO elegido es visible en resumen/preview/detalle; costos de interés/seguro se identifican para ese CECO; capital se mantiene etiquetado aparte.
10. **AC-FE16-10 error transaccional:** error 400/409/500 no limpia formulario ni simula éxito; preview anterior queda invalidado cuando inputs cambian; un retry explícito permite continuar.
11. **AC-FE16-11 regeneración:** acción recalcular muestra resumen de líneas/cuotas reemplazadas/creadas del BE; al refrescar hay un schedule y líneas por componente sin duplicados; manuales/otras fuentes no se representan como editadas por esta acción.
12. **AC-FE16-12 estado proyectado:** lista y detalle expresan “Proyectado”; no existe marca de pagado/conciliado ni enlace automático a ledger en v1.
13. **AC-FE16-13 convenciones/pendientes:** payload lleva `frequency: 'monthly'` y `day_count_convention: 'monthly_periodic'` automáticamente y una nota explica que son defaults del sistema para v1; la convención de tasa siempre se elige explícitamente. El panel deja como pendientes la regla del seguro, pagos reales, importación masiva y features fuera de alcance, no frecuencia/day-count.
14. **AC-FE16-14 acceso:** 403 se presenta con texto de permisos; usuario sin edit no ve CTAs de modificación, y API sigue siendo autoridad.
15. **AC-FE16-15 accesibilidad:** navegación modal/teclado, labels y errores asociados; tabla con `aria-label`, `scope`, columnas de fecha legibles en ambos temas.
16. **AC-FE16-16 tooling:** sin TS ni dependencia nueva; `npm run lint` y `npm run build` pasan.
17. **AC-FE16-17 vencimientos por origen:** para new no se captura ni envía `first_due_date`; preview enseña `conditions.first_due_date` devuelto por BE y el alta usa exactamente las mismas condiciones/payload. Para legacy se exige “Próxima fecha de vencimiento”, posterior al corte, y se envía al backend. FE no calcula fechas.
18. **AC-FE16-18 simulación en borradores:** un escenario no activo consulta financing-simulation; sus líneas de interés/seguro y totales del BE aparecen en `scenarioView`, P&L Ejecutivo y Flujo del escenario, como simuladas y readonly. El principal no aparece como expense/P&L. Loading, error y retry son visibles; no se fabrican importes.
19. **AC-FE16-19 activación/materialización:** un escenario activo no pide ni agrega líneas simuladas. Tras set-target, el toast mantiene el resultado de nómina y añade conteo/warnings de financiación si el BE los devuelve; editor refresca detalle y presenta líneas reales materializadas. No se altera ni se duplica el endpoint de cash flow global, que ya obtiene capital/interés/seguro desde calendario BE.
20. **AC-FE16-20 eliminación irreversible:** un usuario con permiso de edición encuentra “Eliminar definitivamente” en listado y detalle. La confirmación nombra el carácter irreversible e informa calendario/entradas futuras/líneas generadas de interés-seguro afectadas, que créditos de facturas y líneas manuales no se modifican, y que “Cerrar” conserva el registro. Cancelar no hace petición; confirmar consume `DELETE /budget/financing-credit/{id_financing_credit}` mediante `deleteFinancingCredit(id)`. Mientras espera, los controles evitan doble solicitud y el crédito permanece visible; solo con éxito se cierra el modal, se actualizan listado y cash flow ya consultado y se informa el resultado. Respuestas 403/404 y errores de red son visibles y no simulan borrado ni refrescan como si hubiera éxito.
21. **AC-FE16-21 principal en flujo de presupuesto:** active, draft y closed consultan el endpoint `financing-principal-flow`. Si la respuesta trae vencimientos, la Vista Flujo muestra el bloque independiente “Salidas — Capital de financiación”, agrupado por `id_cost_center` y `payment_date`, y la nota de que el capital no es gasto P&L. Los montos de meses y fuera de año afectan salidas, neto/acumulado y totales una sola vez. Las líneas no aparecen en `scenarioView.budget_lines`, Ejecutiva, P&L ni editor, y no se duplican interest/insurance ni el cash flow global. Sin capital no aparece el bloque; un error permite reintentar sin ocultar el resto del flujo.

## 13. Trazabilidad, pendientes y counterpart

| Requisito backend | Presentación FE |
|---|---|
| BE §4.1–4.3 modelo COP/Decimal y revisiones | Form fields COP, responses BE como fuente única, vigencia/revisión en detalle; sin aritmética JS. |
| BE §4.4 y §6.4 separación P&L | Capital no es expense; `FIN_INTEREST` y `FIN_INSURANCE` son líneas expense; chips/readonly si se muestra line manager. |
| BE §6.1/6.2 new vs legacy | Formularios diferenciados y texto obligatorio de corte legacy. |
| BE §6.5 anti doble conteo cashflow | Capital/interés/seguro desde calendario activo por fecha; el BE excluye las líneas financing_credit de su query budget; FE solo presenta el endpoint y nunca suma schedule encima. |
| BE contrato financing-simulation / set-target | Simulación read-only solo en escenarios no activos, líneas expense únicamente para interés/seguro; readonly en `BudgetLineGrid`; refresh de detalle y toast de conteo/warnings al materializar en activación. |
| BE contrato financing-principal-flow | Fuente separada y read-only para el principal del flujo presupuestario en cualquier estado; nunca se transforma en expense/P&L, y los vencimientos usan `payment_date`/CECO/amount del payload. |
| BE §9 API | `budgetFinancingCreditService.js` consume rutas de §5.5 de esta spec. |
| BE §10 permisos/errores | Loading/errors/403 y permisos de acción de §7. |
| BE OQ-01..08 | Panel de pendientes visible en alta y detalle; no presentarlos como confirmados. |

Contraparte: `crm_backend/spec/backend.02_22_Spec_Backend_budgets_financing_credits.md`. Esta especificación no cambia decisiones abiertas del backend ni define una integración con payment ledger. QA final debe realizarse contra backend :8003 y frontend :5173 con un crédito new y uno legacy, y conciliar por separado: capital (financiación), interés/seguro (gastos P&L) y salida total de caja.
