# Spec Frontend: Planeación y Escenarios (`/budget/planning`)

| Campo | Valor |
|---|---|
| **Documento** | Spec Frontend — Planning Dashboard, Ingestion Modal, Grid Editor |
| **ID de feature** | `FE-S4-BUDGET-PLANNING` |
| **Versión** | 1.0 |
| **Fecha** | 2026-09-10 |
| **Fuente** | HSpec "Módulo de Planeación y Escenarios" (gerencia) + sesión spec-definer 2026-09-10. **Decisión ASM-10 (vinculante): la ingesta usa los 2 formatos SIIGO *Solicitud de Presupuesto* (Ingresos + Gastos) — no existe plantilla matricial de importación; la vista matricial Ene–Dic es SOLO lectura en el editor.** |
| **Deps backend** | `crm_backend/spec/backend.02_12_Spec_Backend_budgets_planning.md` (BE-S4-BUDGET-PLANNING) — endpoints `/budget/planning/*` (sección 5 de la spec backend). **Pendiente al momento de escribir esta spec:** puede desarrollarse en paralelo contra los contratos §5; sin backend disponible, probar con mocks (ver §10.4). |
| **Deps frontend** | Reusar patrones de `frontend.03_01` (Centro de Ingesta: `FileDropZone.vue`, modal de feedback, service+store) y `frontend.03_02` (Reglas: `beforeEnter` con `canAccessBudgetUpload`, gate de roles). |
| **Convenciones obligatorias** | `AGENTS.md`: Vue 3 `<script setup>` **solo JS** (sin TypeScript), alias `@` → `src/`, Axios instance global (`@/plugins/axios.js`, JWT auto-inyectado), ESLint `vue3-essential` + Prettier limpios, **cero dependencias npm nuevas** (grid/DnD implementados a mano, como en `RatesDataTable.vue` y `FileDropZone.vue`). |

---

## 1. Objetivo

Entorno dedicado de planeación (`/budget/planning`), en pestaña separada del Centro de Ingesta, donde Gerencia:

1. Crea el **Presupuesto Base** anual subiendo los dos Excel SIIGO (Ingresos requerido, Gastos opcional) con nombre del escenario.
2. Ve todos los escenarios (históricos y actuales), y por fila: **Ver Detalles**, **Marcar como Meta Activa**, **Clonar Escenario** (con % de ajuste).
3. Ajusta metas *on the fly* en un grid editable: doble clic en la celda de monto → edición inline → `PUT` puntual de esa línea (sin re-subir el Excel). El presupuesto "no es un bloque de hielo".

## 2. Alcance

**Incluye:** 2 rutas nuevas bajo `/budget` (dashboard + editor), 3 componentes principales de la HSpec + modales auxiliares, servicio Axios, store Pinia, ítems de navegación.
**Excluye:** eliminar escenarios, edición de tasas/fechas/tipos de línea (solo `projected_amount`/descripción por celda), carga de un solo Excel matricial (resuelto en ASM-10), export/historial de cargas, gráficos de varianza (otra spec), cambios al Centro de Ingesta existente.

## 3. Routing y navegación

### 3.1 Rutas (añadir como **nietas** de la rama `/budget` en `src/router/index.js`, tras `rules`)

```js
{
  path: 'planning',
  name: 'BudgetPlanning',
  component: () => import('@/views/budget/planning/PlanningDashboard.vue'),
  meta: { requiresAuth: true },
  beforeEnter: (to, from, next) => {
    next(canAccessBudgetUpload() ? undefined : '/')
  }
},
{
  path: 'planning/:idBudget',
  name: 'BudgetPlanningGrid',
  component: () => import('@/views/budget/planning/BudgetGridEditor.vue'),
  meta: { requiresAuth: true },
  beforeEnter: (to, from, next) => {
    next(canAccessBudgetUpload() ? undefined : '/')
  }
}
```

- `:idBudget` = `id_budget` del escenario (param numérico; NaN → redirigir a `BudgetPlanning` con toast).
- Navegación entre vista y editor solo por `router.push({ name: ... })` con params.

### 3.2 Navegación (menú)
En el grupo **Módulo Presupuestal** existente: nuevo ítem **"Planeación y Escenarios"** → `BudgetPlanning`. No altera `Centro de Ingesta` ni `Reglas Financieras`.

### 3.3 Gateo por rol
- **Acceso a rutas:** `canAccessBudgetUpload()` (`hasPermission('high') || hasRole(['Gerente','Financiero'])` — patrón verificado en `src/router/index.js:56-61`).
- **"Marcar como Meta Activa":** visible/habilitado solo si `canSetBudgetTarget()` := `userStore.hasPermission('high') || userStore.hasRole(['Gerente'])` (define `BUDGET_TARGET_ROLES = ['Gerente']` junto a `BUDGET_UPLOAD_ROLES`). Para `Financiero`: botón oculto (el backend responde 403 en el intento burdo; el backend es la autoridad). Ver PQ-F4.

## 4. Arquitectura de componentes (árbol de archivos)

```
src/
  views/budget/planning/
    PlanningDashboard.vue          # Ruta BudgetPlanning: tabla de escenarios + orquestación de acciones
    BudgetGridEditor.vue           # Ruta BudgetPlanningGrid: cabecera + tabs (pivote ejecutivo | editor de celdas)
  components/budget/planning/
    BudgetIngestionModal.vue       # HSpec: creación inicial (2 drop-zones + campos de escenario)
    CloneScenarioModal.vue         # HSpec: clonar (nombre nuevo + modifier_pct con preview)
    SetTargetConfirmModal.vue      # Confirmación de meta activa (muestra qué escenario será desactivado)
    ScenarioTable.vue              # Tabla del dashboard (columnas §6.1) — extraída si la vista crece
    ExecutivePivotTable.vue        # Pivote read-only CECO × Ene–Dic (agregación cliente de budget_lines)
    BudgetLineGrid.vue             # Grid editable a nivel de línea con edición inline por doble clic
  services/budgetPlanningService.js    # Axios: los 6 endpoints /budget/planning/*
  stores/budgetPlanningStore.js        # Pinia: escenarios, escenario actual+líneas, flags de operación
```

- `BudgetIngestionModal.vue` usa el **`FileDropZone.vue` existente** (`@/components/budget/upload/FileDropZone.vue`) con `v-model` de `File`, `:disabled`, `:maxMb=10`, `:hintFile`, `datasetKey` distinto por zona (`'planning-ingresos'`, `'planning-gastos'`). **No duplicar la drop-zone** (PQ-F1).
- Modal de feedback de éxito/error: **reutilizar el patrón** de `UploadFeedbackModal.vue` (lista estructurada de errores 400); fork local solo si su API no permite renderizar los detalles de planning (§9).

## 5. Contrato con el backend (consumo; la autoridad del contrato es `backend.02_12` §5)

| Acción UI | Método/Ruta | Payload | Éxito |
|---|---|---|---|
| Listar escenarios | `GET /budget/planning/?budget_year=` | — | 200 array §5.4 backend |
| Abrir escenario (dashboard/editor) | `GET /budget/planning/{id}/detail` | — | 200 `BudgetFull`+`parent_budget_name` |
| Crear Base (modal ingesta) | `POST /budget/planning/upload` | FormData: `scenario_name`*, `budget_year`*, `budget_period` (default `"ANUAL"`), `id_department`?, `file_ingresos`*, `file_gastos`? | 201 `PlanningUploadResult` |
| Clonar (modal) | `POST /budget/planning/clone` | `{ id_budget, nuevo_nombre, modifier_pct? }` | 201 `Budget` |
| Editar celda (grid) | `PUT /budget/planning/cell/{idBudgetLine}` | `{ projected_amount }` (+`description`?) | 200 `BudgetLine` |
| Marcar Meta Activa | `PUT /budget/planning/{id}/set-target` | — | 200 `{ id_budget, budget_year, demoted_budget_id }` |

Todo vía el axios instance global (JWT automático). Service plano que devuelve `response.data`; errores propagados al store/callers (patrón `budgetRulesService`).

## 6. `PlanningDashboard.vue`

### 6.1 Tabla de escenarios
Columnas: **Nombre** · **Año** · **Tipo** (`Base` si `!is_scenario` / `Escenario`; con `↳ de {parent_budget_name}` en tooltip) · **Líneas** · **Σ Ingresos** · **Σ Gastos** (moneda COP con `Intl.NumberFormat('es-CO')`) · **Estado** (chips: `🎯 Meta Activa` `active`, `Borrador` `draft`, `Cerrado` `closed`) · **Creado** (fecha dd/mm/aaaa) · **Acciones**.
Fuente: store `fetchScenarios()`; orden = el del backend (no re-ordenar en cliente). Selector de filtro por año (default: todos; rango años-2..años+5) + botón refresco.

### 6.2 Acciones por fila
- **Ver Detalles** → `router.push('BudgetPlanningGrid', { idBudget })`.
- **Marcar como Meta Activa** → visible solo si `status !== 'active'` **y** `canSetBudgetTarget()`; abre `SetTargetConfirmModal`: texto "Al activar **{nombre}** como meta {año}, el escenario **{nombre del activo actual del mismo año, si existe}** pasará a estado Cerrado." → confirma → `setTarget(id)` → toast + refresco (el backend desactiva al anterior en la misma operación).
- **Clonar Escenario** → `CloneScenarioModal`: campos *Nuevo nombre* (requerido, ≤120) y *Ajuste % (opcional)*; preview en vivo: `Σ Ingresos clonado ≈ total_income × (1 + pct/100)` (calculado del row actual; nota fija: "Las tasas variables se copian sin escalar"). Submit → `clone({id_budget, nuevo_nombre, modifier_pct})` → toast + refresco; **no** navega automáticamente.
- Cabecera de página: botón primario **"Nuevo Escenario (Carga Anual)"** → `BudgetIngestionModal`.

### 6.3 Estados
Cargando (skeleton/spinner), vacío (mensaje + CTA a crear), error de red (reintentar). Nunca doble submit: `isSubmitting` bloquea acciones mientras hay operación en vuelo.

## 7. `BudgetIngestionModal.vue`

- **Dos `FileDropZone`**: "Solicitud de **Ingresos**" (`Formato Solicitud Presupuesto Ingresos.xlsx`, requerido) y "Solicitud de **Gastos**" (`Formato Solicitud Presupuesto Gastos.xlsx`, opcional, con leyenda "Sin este archivo el escenario se crea solo con ingresos").
- Campos: **Nombre del escenario** (requerido, ≤120), **Año** (select, default año siguiente), **Período** (texto, default `"ANUAL"`), **Departamento** (select opcional desde el catálogo de departments ya consumido por el CRM).
- Bloque de ayuda de formato: "Estructura requerida: hoja con encabezado en la **fila 8**; columnas según el formato SIIGO de Solicitud de Presupuesto (Centro de Costo, Fecha Proyectada, Temporada, Monto/Tasa, Comportamiento…)", con enlace/descarga de los formatos de referencia si el backend expone estáticos; **si no hay endpoint de descarga, solo texto** (no romper alcance).
- Validación frontal: nombre no vacío; ingresos requerido; tamaños ≤10 MB (el propio `FileDropZone` rechaza); sin validación de contenido (el backend revalida).
- Submit: FormData al §5.1 → **201**: toast "Escenario **{nombre}** creado: {lines_income} líneas de ingreso, {lines_expense} de gasto", cerrar, emitir `created` (el dashboard refresca). **400**: quedarse abierto y renderizar estructuradamente (§9). Botón "Cargar" con spinner; el modal no se cierra con submit en vuelo.

## 8. `BudgetGridEditor.vue`

### 8.1 Cabecera
Nombre del escenario + chip de estado (igual §6.1) + año + `↳ Clonado de {parent_budget_name}` si aplica + acción **"Marcar Meta Activa"** (misma regla §3.3/§6.2) + botón volver al dashboard.

### 8.2 Tabs
> ⚠️ Tabs redefinidos en FE-S4B (`frontend.03_04`): Ejecutiva → Flujo → Editor; default Ejecutiva.
> ⚠️ Secciones extendidas en FE-S4C (`frontend.03_05`): Costo de ventas, Resultado (P&G) y Acumulado.

1. **"Vista Ejecutiva"** (`ExecutivePivotTable.vue`, **read-only**): dos bloques (Ingresos / Gastos fijos); filas = CECO (agrupa todas sus líneas), columnas = Ene…Dic del `budget_year`; celda = Σ `projected_amount` del mes (`new Date(budget_date).getMonth()`); totales por fila/columna. Esto **reemplaza** la idea de matriz importable (ASM-10): la matriz es presentación. Filas `variable_sales/variable_receivables` del bloque Gastos se listan debajo como tabla de tasas (read-only: "Tasa {variable_rate}%").
2. **"Editor de Celdas"** (`BudgetLineGrid.vue`, principal): tabla 1 fila = 1 `budget_line` (columnas: CECO, Fecha, Concepto, Tipo línea, Temporada, **Monto**, descripción). Solo la celda **Monto** es editable:
   - **Doble clic** → input numérico inline (autofocus, valor actual) → `Enter`/blur dispara `PUT /cell/{idBudgetLine}` → micro-estados en la celda: `guardando…` → `✓` verde fugaz (~1.5 s) → normal; error → **rollback visual al valor anterior** + tooltip/título con el mensaje.
   - Validación pre-red: numérico, `>= 0`, finito; inválido → borde rojo, **no** dispara PUT.
   - Filas con `behavior_type != 'fixed'`: celda de monto read-only con tooltip "línea variable: edítela recargando el escenario" (BR-CEL-01 backend también lo impediría).
   - Tras guardar con éxito: el store actualiza esa línea en su caché (respuesta del PUT es la línea completa) y la Vista Ejecutiva se recalcula desde la caché (no queda stale).
- No se introduce librería de data-grid: tabla HTML + estado de edición local (patrón del repo). Paginación virtual no requerida (escenarios de cientos de líneas; scroll nativo con encabezado sticky).

## 9. Manejo de errores del backend (mapeo)
| Código | Renderizado |
|---|---|
| 400 upload `{missing_cost_centers:[...]}` | Modal de ingesta abierto + lista "Centros de costo no encontrados: N" (máx. 20 chips) + instrucción "corrija el archivo y reintente". |
| 400 upload `{message:"Rows outside declared budget_year", found_years:[...]}` | "Las fechas del archivo no pertenecen al año {budget_year} declarado (encontrado: {years})." |
| 400 nombre duplicado | Inline bajo el campo Nombre: "Ya existe un escenario con ese nombre para {año}." |
| 403 (set-target u otra) | Toast "No tiene permiso para designar la meta activa" + refresco de roles silencioso (por si cambió el rol). |
| 404 en editor | Toast + `router.replace` al dashboard. |
| 422 (celda/clon/rangos) | Inline en el campo ofensor (el grid muestra el mensaje del backend bajo la celda). |
| 5xx / red | Toast genérico + celda/estado revertido; botón reintentar en acciones de modal. |

## 10. Requisitos No Funcionales (frontend)
1. **NFR-F1:** `npm run lint` y `npm run build` limpios. **Cero deps npm nuevas.**
2. **NFR-F2:** PUT de celda dispara ≤1 vez por edición (debounce no aplicable — evento blur/Enter); feedback visual ≤100 ms tras el disparo; p95 end-to-end percibido < 1 s (coherente con NFR-2 backend).
3. **NFR-F3:** El dashboard muestra el 🎯 en exactamente un escenario por año (dato, no cálculo cliente).
4. **NFR-F4:** Modo paralelo/mocks: si `/budget/planning/*` no responde aún, el desarrollo se valida con fixtures JSON que respeten §5 (forma de respuesta idéntica), sin commitear mocks en `src/` (usar datos locales del store bajo flag de dev).
5. **NFR-F5:** Accesibilidad básica en el grid: la celda editable recibe `tabindex=0`, `Enter` abre edición igual que doble clic, `aria-label` por fila/col; formato monetario `Intl.NumberFormat('es-CO', {style:'currency', currency:'COP'})` en Σ y montos (edición en número crudo).

## 11. Criterios de Aceptación (frontend)
- **AC-FE-1:** Con 3 escenarios (1 activo) de 2027: la tabla lista los 3 con Σ correctos, chip 🎯 solo en el activo, y las 3 acciones por fila presentes/ocultas según rol (sesiones Gerente vs Financiero).
- **AC-FE-2:** Flujo completo de ingesta: subir par válido → modal cierra, dashboard refresca y aparece el nuevo Base en `Borrador`. Subir par con CECO inexistente → modal permanece abierto con lista de códigos del 400 y **no** aparece escenario fantasma (coherente con AC-UP-2 backend).
- **AC-FE-3:** Clonar con +10% → fila nueva "… +10%" con Σ Ingresos = 1.10× (mostrada por el backend-agregado; el preview del modal coincide ±1 redondeo visual).
- **AC-FE-4:** Grid: doble clic en monto, cambiar valor, Enter → celda confirma `✓`, recarga de página sigue mostrando el valor nuevo (persistencia real); PUT fallido (cortar red) revierte visualmente.
- **AC-FE-5:** "Marcar como Meta Activa" con confirmación que nombra al escenario desactivado; tras aceptar: el otro fila pasa a `Cerrado` y el nuevo a `🎯` sin refresco manual.
- **AC-FE-6:** Vista Ejecutiva: pivote cc×mes cuadra con la sumatoria del editor (misma fuente `budget_lines`); líneas variables aparecen en la tabla de tasas, no en el pivote de montos.
- **AC-FE-7:** Rutas protegidas: `Financiero` ve el ítem de menú y puede cargar/clonar/editar, **no** ve "Marcar Meta Activa"; usuario sin rol de budget es redirigido a `/` (patrón `canAccessBudgetUpload`).
- **AC-FE-8:** No hay doble-submit: spam de clics en cargar/clonar/PUT no genera requests paralelos (flag en store).

## 12. Decisiones y trazabilidad (registro)
| # | Decisión | Origen |
|---|---|---|
| ASM-7 | Sin indicator de "quién editó celda": UI muestra solo estados de guardado. | Aprobado |
| ASM-9 | Gate de meta activa = `Gerente` (+ escala `high`); carga/clone/grid = autenticados con acceso al módulo. | Aprobado + PQ-F4 |
| ASM-10 | **Sin matriz importable**; ingesta = 2 SIIGO; matriz solo lectura (§8.2 tab 1). | Stakeholder eligió Opción 1 (2026-09-10) |
| ASM-12 | Edición de celda: numérico `>= 0` validado en cliente antes del PUT; sin fórmulas. | Aprobado |
| Nomenclatura | `PlanningDashboard.vue`, `BudgetIngestionModal.vue`, `BudgetGridEditor.vue` = nombres contractuales de la HSpec; auxiliares nuevos bajo `components/budget/planning/`. | HSpec §3 |

## 13. Preguntas abiertas (no bloquean el MVP)
- **PQ-F1** — Confirmar que `FileDropZone.vue` se exporta con la API descrita (§4); si el Centro de Ingesta lo mantiene privado, importar por ruta directa.
- **PQ-F2** — Catálogo de departamentos para el select: reusar el endpoint GET de departments ya usado en vistas de usuario/zonas.
- **PQ-F3** — Enlace de descarga de "formatos de referencia": existe solo si backend expone estáticos; por defecto **no** implementar (texto de ayuda basta).
- **PQ-F4** — Verificar el mapeo real de `hasPermission('high')` vs rol `Administrador` en `userStore` (comentario en `router/index.js:50-56` lo afirma; confirmar con una sesión real de prueba).
- **PQ-F5** — Límite de filas renderizadas en el editor: si un escenario supera ~1500 líneas, simple slice "Mostrar 500 más" (no virtualización completa en MVP).