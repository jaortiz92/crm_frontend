# Spec Frontend: Gestión de Reglas Financieras (`/budget/rules`)

| Campo | Valor |
|---|---|
| ID de feature | `FE-S3-RULES` |
| Fecha | 2026-09-09 |
| Fuente | Historia "HSpec Frontend: Gestión de Reglas Financieras (Budget Rules)" |
| Deps backend | Spec `02_09` (motor P&L, `line_cost_rates`), Spec `02_11` (motor comisiones, `commission_rates`) — **ya implementadas** |
| Deps frontend | Patrón de `frontend.03_01` (Centro de Ingesta): vista hija bajo `/budget`, service + store, gate de roles |
| Estado de supuestos | A1-A15 aprobados por el stakeholder (ver §14) |

---

## 1. Objetivo

Vista de administración donde Gerencia/Finanzas puede **visualizar, crear, editar y archivar** las
tasas que alimentan el motor financiero:

* **Pilar 1 — Tasas de Costo de Ventas** (`line_cost_rates`, campo `cogs_pct`).
* **Pilar 3 — Tasas de Comisión Comercial** (`commission_rates`, campo `commission_pct`).

La vista protege la integridad histórica: nunca borra físicamente (regla de oro financiero:
*la historia no se borra, se inactiva*), previene solapamientos de vigencia desde el cliente y
mantiene las reglas auditables (nombre de tasa, vigencia explícita, estado).

## 2. Alcance

**En alcance (v1):**

* `BudgetRulesView.vue` con 2 pestañas custom (*Costos por Línea* / *Comisiones de Venta*).
* `RatesDataTable.vue` reutilizable (columnas, filtros por línea, toggle "solo activas", acciones
  Editar / Archivar / Reactivar).
* `RateEditorModal.vue` (crear/editar, validación frontal completa, manejo de E-CR-1/E-CR-2).
* `budgetRulesService.js` (capa Axios) y `budgetRulesStore.js` (Pinia: catálogo de líneas + caché
  de ambos sets de tasas).
* Ruta `/budget/rules` con gate de roles e ítem de navegación "Reglas Financieras".

**Fuera de alcance:** ver §16.

## 3. Routing y navegación

### 3.1 Ruta (en `src/router/index.js`, grupo `/budget` ya existente)

```js
{
  path: 'rules',
  name: 'BudgetRules',
  component: () => import('@/views/budget/BudgetRulesView.vue'),
  meta: { requiresAuth: true },
  beforeEnter: (to, from, next) => {
    next(canAccessBudgetUpload() ? undefined : '/')
  }
}
```

* Se **reutiliza** el gate existente `canAccessBudgetUpload()` =
  `userStore.hasPermission('high')` **o** `userStore.hasRole(['Gerente', 'Financiero'])` (PQ-1).
* El acceso directo no autorizado redirige a Home (`/`), igual que `/budget/upload`.
* `/budget` ya tiene redirect hijo `'' => BudgetUpload`; no se cambia (la vista de reglas es
  hermana, no reemplaza al Centro de Ingesta).

### 3.2 NavBar (`src/components/NavBar.vue`)

Nuevo ítem en el grupo `budget` ("Modulo Presupuestal"):

```js
{ label: 'Reglas Financieras', to: '/budget/rules', permission: 'high', roles: BUDGET_UPLOAD_ROLES }
```

* Se reutiliza la constante exportada `BUDGET_UPLOAD_ROLES = ['Gerente', 'Financiero']`
  (renombrarla sería un refactor cosmético; **no** bloquea esta feature).

## 4. Arquitectura de componentes (árbol de archivos)

```
crm_frontend/src/
├── views/budget/
│   └── BudgetRulesView.vue          # Vista principal: cabecera + tabs + slots de tabla
├── components/budget/rates/
│   ├── RatesDataTable.vue           # Tabla reutilizable (prop kind)
│   ├── RateEditorModal.vue          # Modal crear/editar
│   └── ratesConfig.js               # Mapa de configuración por 'kind' (única fuente)
├── services/
│   └── budgetRulesService.js        # Axios puro (sin lógica de negocio)
└── stores/
    └── budgetRulesStore.js          # Pinia: líneas + caché de tasas + mutaciones
```

* **No se añade ninguna dependencia npm** (sin Vuetify: los `<v-tabs>` de la historia se resuelven
  con tabs HTML/CSS propios del proyecto — A2).
* Todo el código: `<script setup>` JS (sin TypeScript), alineado con `BudgetUploadsView.vue`.

### 4.1 Flujo de datos (unidireccional)

```
BudgetRulesView ──kind──▶ RatesDataTable ──edit/archive/restore──▶ RateEditorModal / Store
      │                        ▲                                          │
      └─ onMounted: store.fetchLinesOnce() + store.fetchRates(tab)        │
                ▼                                                         ▼
        budgetRulesStore (state: rates[kind], lines) ◀── POST/PUT ── budgetRulesService ── axios
```

* Los componentes **nunca** importan axios: store → service → `@/plugins/axios` (A13).
* Tras cada mutación exitosa, el store hace **refetch del `kind` afectado** (fuente de verdad =
  servidor; se ignoran las respuestas optimistas locales).

## 5. Contrato con el backend (verificado contra `app/api/budget/{lineCostRate,commissionRate}.py`, `app/crud/budget/*` y `app/api/__init__.py`)

### 5.1 Endpoints reales (⚠️ A1: el API de costos se monta en **singular**)

| Operación | Costos (Pilar 1) | Comisiones (Pilar 3) |
|---|---|---|
| Listar | `GET /budget/line-cost-rate/` | `GET /budget/commission-rates/` |
| Leer uno | `GET /budget/line-cost-rate/{id_line_cost_rate}` | `GET /budget/commission-rates/{id_commission_rate}` |
| Crear | `POST /budget/line-cost-rate/` | `POST /budget/commission-rates/` |
| Editar/Archivar | `PUT /budget/line-cost-rate/{id}` | `PUT /budget/commission-rates/{id}` |
| ~~Físico~~ `DELETE` | **PROHIBIDO en esta UI** (existe en el backend, no se consume) | idem |

* **Slash final obligatorio en rutas de colección** (`/budget/line-cost-rate/`): las rutas raíz están
  definidas como `@router.get("/")`; sin slash el servidor responde 307.
* Catálogo de líneas: `GET /line/?skip=0&limit=500` → `[{ id_line, line_name }]`.
  **Trampa verificada:** el `limit` por defecto de `/line/` es **10** → el servicio SIEMPRE envía
  `limit=500` (A6). Sin JWT (endpoint legacy), pero el axios global adjunta el token igualmente; inofensivo.
* Base URL desde `VITE_API_URL` (dev `http://127.0.0.1:8003`); el backend **no** usa prefijo `/api`.

### 5.2 Parámetros de `GET` lista (no se usan en v1, referencia)

`id_line`, `active_only`, `date`, `skip`, `limit(default 100)`.
La UI NO usa `id_line` del servidor porque su semántica de igualdad **no puede** expresar
"solo filas globales (NULL)" (documentado en el CRUD). Los filtros son **client-side sobre la
caché** del store (A4/A5): se solicita una vez `?skip=0&limit=500` por pestaña.

### 5.3 Payloads (camel/snake: el API es 100 % snake_case, sin transformación)

**POST** (crear) — ambos pilares, cambiando solo el campo numérico:

```json
{
  "id_line": 3,            // null ⇒ tasa global (fallback). POST SÍ acepta null explícito.
  "rate_name": "COGS 2026",// opcional, máx 120 chars; null permitido
  "cogs_pct": 42.5,        // OBLIGATORIO, 0-100 (commission_pct en el pilar 3)
  "date_from": "2026-01-01",
  "date_to": "2026-12-31",
  "is_active": true
}
```

**PUT** (editar) — merge parcial: **solo se envían campos no-null** y **nunca `id_line`** (ver §10.2, A6/A7):

```json
{ "rate_name": "COGS 2026", "cogs_pct": 43.0, "date_from": "…", "date_to": "…", "is_active": false }
```

**Respuesta 200 (list/detalle):** fila completa con `id_line_cost_rate` / `id_commission_rate`,
`created_at`, `updated_at`. La UI muestra nombre de línea resolviendo `id_line` contra el catálogo
del store (la API **no** devuelve `line_name`): desconocida ⇒ `Línea #<id> (eliminada)`; `null` ⇒ badge **Global**.

### 5.4 Errores reales del servidor (strings verificados en `app/crud/budget/lineCostRate.py`)

| HTTP | `detail` (inglés, literal) | Cód. spec | Clasificación UI |
|---|---|---|---|
| 400 | `date_to must be on or after date_from` | E-CR-1/BR-12 | `period` (bloqueado ya client-side) |
| 400 | `Overlapping active rate for this line (or global) period; deactivate or adjust dates first` | E-CR-2/BR-13 | `overlap` |
| 422 | esquema FastAPI (pct fuera de 0-100, `rate_name` > 120, fecha inválida) | — | `validation` |
| 404 | `Exceptions.register_not_found(...)` | — | `notfound` |
| 500+ | — | — | `server` |
| 401/403 | — | — | **sin modal**: comportamiento global del interceptor (sesión + redirect Login), igual que `frontend.03_01 §10.4` |

El store centraliza un `classifyRateError(err)` en el patrón de `classifyError()` del Centro de
Ingesta, devolviendo `{ kind }` (§6.3).

### 5.5 Reglas de petición Axios (service)

* Instancia compartida `axiosInstance` de `@/plugins/axios` (JWT auto-inyectado; `timeout` global 20 s, suficiente — sin overrides).
* Sin reintentos; sin caché HTTP adicional (la caché vive en Pinia).

## 6. Estado compartido — `src/stores/budgetRulesStore.js` (A13/A15)

### 6.1 Shape

```js
state: () => ({
  lines: [],                     // catálogo { id_line, line_name } (A5)
  linesLoaded: false,
  rates: { cost: null, commission: null },   // null = NUNCA cargada | [] = cargada (A15)
  loading: { lines: false, cost: false, commission: false },
  loadError: { cost: null, commission: null }, // true ⇒ banner con retry (A11)
  saving: false                  // flag global de POST/PUT en vuelo
})
```

### 6.2 Acciones

| Acción | Comportamiento |
|---|---|
| `fetchLinesOnce()` | Si `linesLoaded` ⇒ no-op (cache total de la SPA). Si no, `GET /line/?skip=0&limit=500`; marca `linesLoaded` solo en éxito. |
| `fetchRates(kind, force=false)` | Si ya cargada y `!force` ⇒ **no-op** (A15: no refetch al cambiar tab). Else `GET {listEndpoint}?skip=0&limit=500` (A14). Guarda lista cruda sin ordenar. |
| `createRate(kind, payload)` | `POST {listEndpoint}` → éxito: refetch del kind → `{ ok:true, data }`. |
| `updateRate(kind, id, payload)` | `PUT {itemEndpoint}` (payload sin `id_line`) → éxito: refetch → `{ ok:true, data }`. |
| `setActive(kind, id, value)` | `PUT { is_active: value }` → éxito: refetch → `{ ok:true }`; `value:false` ⇒ **Archivar** (regla de oro), `value:true` ⇒ Reactivar. |

Todas las acciones **atrapan** errores y devuelven `{ ok:false, kind }` clasificado (§6.3) —
nunca lanzan el objeto axios crudo al componente.

### 6.3 Matriz de clasificación de errores (store)

```
!err.response                → 'network'
401|403                      → 'auth'      (el interceptor ya redirige; UI calla)
404                          → 'notfound'
400 + detail ~ /Overlap/i    → 'overlap'   (E-CR-2)
400 + detail ~ /on or after/ → 'period'    (E-CR-1)
422                          → 'validation'
5xx                          → 'server'
otro                         → 'unknown'
```

### 6.4 Getters

```js
getters: {
  lineNameById: (s) => (id) =>
    id === null ? 'Global'
      : (s.lines.find(l => l.id_line === id)?.line_name ?? `Línea #${id} (eliminada)`)
}
```

## 7. Configuración por pilar — `components/budget/rates/ratesConfig.js` (única fuente de divergencias)

```js
export const RATE_KINDS = {
  cost: {
    idField: 'id_line_cost_rate',
    pctField: 'cogs_pct',
    listUrl: '/budget/line-cost-rate/',
    itemUrl: (id) => `/budget/line-cost-rate/${id}`,
    tabLabel: 'Costos por Línea',
    pctLabel: 'Costo de Ventas (%)',
    entityLabel: 'tasa de costo'
  },
  commission: {
    idField: 'id_commission_rate',
    pctField: 'commission_pct',
    listUrl: '/budget/commission-rates/',
    itemUrl: (id) => `/budget/commission-rates/${id}`,
    tabLabel: 'Comisiones de Venta',
    pctLabel: 'Comisión (%)',
    entityLabel: 'tasa de comisión'
  }
}
```

* Cualquier texto/columna que dependa del pilar se lee **exclusivamente** de este mapa (A4).

## 8. `BudgetRulesView.vue` (vista principal)

### 8.1 Estructura

* Cabecera: `<h2 class="section-title">Reglas Financieras</h2>` + subtítulo del propósito.
* **Tabs custom** (A2): barra de botones tipo "pill" accesible (`role="tablist"`, `aria-selected`,
  flechas ←/→), dos paneles: `cost` (defecto) y `commission`. Mismo lenguaje visual que las tarjetas
  del Centro de Ingesta (clases propias, sin framework CSS).
* Cada panel contiene: barra de filtros (§8.3) + `RatesDataTable` + botón `+ Nueva regla` y
  botón `Actualizar` (refetch forzado del kind).

### 8.2 Ciclo de vida

* `onMounted` (guard `userStore.token` como en vistas hermanas): `await Promise.all([
  fetchLinesOnce(), fetchRates('cost') ])`.
* Al activar la tab `commission` por primera vez: `fetchRates('commission')` (lazy, sin refetch
  posterior — A15).

### 8.3 Filtros (client-side sobre la caché — A4/A10)

Estado **de la vista** (NO del store; no se comparten entre pilares):

| Control | Valores | Lógica |
|---|---|---|
| `lineFilter` (select) | `'all'` (defecto) · `'global'` · `id_line:numeric` | `all` pasa todo; `global` ⇒ `row.id_line === null`; numérico ⇒ igualdad estricta. |
| `activeOnly` (toggle) | default **ON** (A10) | `is_active === true` (NO excluye vencidas — §9.2). |
| `search` (input, opcional v1) | texto | contiene-insensible sobre `rate_name`. |

### 8.4 Botón "+ Nueva regla"

Abre `RateEditorModal` en modo creación con el `kind` de la tab activa.

### 8.5 Estado de carga/transporte de cada panel

* `loading[kind]` ⇒ bloque "Cargando reglas…".
* `loadError[kind]` ⇒ banner rojo + botón "Reintentar" (`fetchRates(kind, true)`).
* Lista vacía ⇒ mensajes de §9.5.

## 9. `RatesDataTable.vue` (reutilizable)

### 9.1 Interface

```
props: { kind: 'cost'|'commission' }
// lee rows crudos del store; filtra/ordena con props de filtro:
props: { lineFilter, activeOnly, search }
emits: ['edit', 'archive', 'restore']   // payload: la fila completa
```

### 9.2 Columnas

| # | Columna | Contenido |
|---|---|---|
| 1 | Nombre | `rate_name` o `—` (A3) |
| 2 | Línea | `line_name` vía getter, o chip **Global** (`null`) |
| 3 | `{pctLabel}` | `row[cfg.pctField].toFixed(2)` + `%` (A9) |
| 4 | Vigencia Desde | ISO-date legible `dd/mm/aaaa` |
| 5 | Vigencia Hasta | idem |
| 6 | Estado | chip de 3 estados (§9.3) (A8) |
| 7 | Acciones | Editar (always) · Archivar (si `is_active`) · Reactivar (si `!is_active`) |

* Orden por defecto (A15): `date_from` **desc** (reciente primero) → `id_line` asc → id asc.
* Tabla con scroll (`max-height: 60vh`) y sticky header; responsive mínimo 1280 px.

### 9.3 Chip de estado (computado client-side)

```js
statusOf(row, todayLocal):  // todayLocal = helper localToday() (§11.4)
  !row.is_active          → 'Archivada' (gris)
  row.date_to < todayLocal → 'Vencida'  (ámbar)   // sigue is_active=true
  else                     → 'Activo'   (verde)
```

* Helper compartido `ratesConfig.js`: `localToday()` — construye `YYYY-MM-DD` **desde fecha local**
  (prohibido `new Date().toISOString().slice(0,10)`: sesga en UTC−x).

### 9.4 Acciones (emit → vista)

| Acción | Comportamiento (implementado en la vista, §11) |
|---|---|
| Editar | abre modal en modo edición. |
| Archivar | SWAL confirmación → `PUT is_active:false`. Botón de "borrado" se llama **"Archivar"**, nunca "Eliminar". |
| Reactivar | SWAL confirmación → `PUT is_active:true` (sujeto a E-CR-2, §11.2). |

### 9.5 Estados vacíos

* Sin datos del kind: *"No hay reglas todavía. Crea la primera con '+ Nueva regla'."*
* Con filtros sin coincidencias: *"Sin coincidencias para los filtros aplicados."*

## 10. `RateEditorModal.vue` (crear / editar)

### 10.1 Interface

```
props: { open: Boolean, kind: String, rate: Object|null }  // null ⇒ modo CREACIÓN
emits: ['saved', 'close']   // 'saved' solo tras éxito; el padre refescó vía store
```

Modal overlay con foco atrapado, cierre con `Esc`/backdrop (solo si `!saving`).

### 10.2 Campos y modos

| Campo | Control | Crear | Editar |
|---|---|---|---|
| Línea de producto | `<select>`: "Aplica globalmente (sin línea)" + líneas del catálogo (`store.lines`, orden alfabético, `fetchLinesOnce()` al abrir) | editable | **DESHABILITADO + texto**: *"La línea no puede modificarse tras la creación. Para cambiar el alcance, archive la regla y cree una nueva."* (A7 — imposibilidad técnica real: `PUT` hace merge `exclude_none=True`, no puede enviar `id_line: null`; **no** exponer opción que el backend ignorará) |
| Nombre de la tasa | text, `maxlength=120`, opcional; hint: opcional pero recomendado para auditoría (A3) | editable | editable |
| Porcentaje | `<input type="number">` `min=0 max=100 step=0.01`, required, label `cfg.pctLabel` (A9) | editable | editable |
| Vigencia Desde | `<input type="date">` required; default **hoy** solo en creación | editable | editable |
| Vigencia Hasta | `<input type="date">` **required, sin opción "abierta"** (A8: `date_to` NOT NULL en backend) | editable | editable |
| Activa | toggle, default `true` en creación; refleja el valor actual en edición | editable | editable |

### 10.3 Badge de tasa global (condicional)

Si el selector de línea = "Aplica globalmente" ⇒ inline **info** bajo el select:
*"Esta será la tasa global por defecto si un producto no tiene línea asignada."*
Si además hay una regla global vigente del mismo kind superpuesta en el rango elegido ⇒ el warning
de solapamiento (§10.5) toma precedencia visual (rojo).

### 10.4 Validación client-side (reactiva; botones deshabilitados con errores)

| Regla | Trigger | Mensaje inline (debajo del campo/fechas) |
|---|---|---|
| pct requerido | vacío | "El porcentaje es obligatorio." |
| pct rango | `<0` o `>100` o NaN | "El porcentaje debe estar entre 0 y 100." |
| fechas requeridas | cualquiera vacío | "Ambas fechas de vigencia son obligatorias." |
| **vigencia invertida** | `date_to < date_from` (estricto; **igualdad** permite 1 día exacto — BR-12 solo rechaza `date_to < date_from`) | "La fecha de fin debe ser posterior a la de inicio" (texto literal de la historia) + **Guardar deshabilitado** (previene E-CR-1) |
| nombre | `len > 120` | bloqueado por `maxlength` |

**Pre-check de solapamiento (BR-13 frontal, A4):** con datos válidos, si `is_active === true` y
existe en la caché del kind alguna fila con `(id_line === form.id_line)` (comparación null-safe),
`is_active`, excluyendo la fila editada, con `date_from <= form.date_to && date_to >= form.date_from`
⇒ inline **rojo**: *"Precaución: se solapa con una regla activa existente en este rango para la
misma línea. Deberás archivarla o ajustar las fechas antes de poder guardar."* + deshabilitar
Guardar. (El servidor sigue siendo la autoridad; el pre-check evita 400s obvios con datos frescos
de caché, que se refresca tras cada mutación.)

### 10.5 Guardado y errores del servidor (A11)

Flujo: click Guardar → `store.createRate|updateRate` →

| Resultado | UI |
|---|---|
| `{ ok:true }` | toast SWAL éxito ("Regla guardada correctamente") → **modal se cierra** → emit `saved` → el padre ya fue refrescado por el store. |
| `overlap` | **El modal NO se cierra.** Banner rojo en el modal: *"Ya existe una regla activa para esta línea en este rango de fechas. Desactive la regla anterior antes de crear la nueva."* (texto literal de la historia; traduce E-CR-2). |
| `period` | Banner rojo: *"La fecha de fin debe ser posterior a la de inicio"* (debería ser imposible por §10.4; red de seguridad). |
| `validation` | Banner rojo: *"Revisa los datos del formulario."* |
| `network` / `server` / `unknown` | Banner rojo: *"No se pudo guardar. Inténtalo de nuevo o contacta soporte."* |
| `auth` | Sin banner (el interceptor redirige). |

`store.saving` deshabilita el botón y muestra spinner (anti doble-submit).

## 11. Archivar / Reactivar — protección de edición destructiva (A10/A11, regla de oro)

1. **Nunca** se emite `DELETE` desde esta UI (aunque el backend lo ofrece). La acción visible de
   "eliminar" es `Archivar` = `PUT { is_active: false }`.
2. **Archivar:** SWAL confirmación (`alertService`, patrón `editElement`): *"Archivar esta {entityLabel}?
   La historia se conserva; quedará inactiva y podrá reactivarse."* → `setActive(kind,id,false)` →
   toast "Regla archivada".
3. **Reactivar:** SWAL confirmación. Si el `PUT is_active:true` devuelve `overlap` ⇒
   SWAL error (no modal editor involucrado): *"No se puede reactivar: ya existe una regla activa que
   cubre este rango para la misma línea. Archívala o ajusta primero."*
4. `alertService` (sweetalert2) es el único canal de toasts/confirmaciones, como en el resto del CRM.
5. Helper de fecha **local** `localToday()` reutilizado en vista y tabla (§9.3).

## 12. Requisitos no funcionales (NFR)

| ID | Requisito |
|---|---|
| NFR-1 | Carga inicial de la vista < 2 s en LAN (1 GET `/line/` + 1 GET de la tab activa; el resto lazy). |
| NFR-2 | Cero refetch al cambiar de tab o al mover filtros (caché Pinia — A15). |
| NFR-3 | Sin nuevas dependencias npm; JS puro `<script setup>`; pasa `npm run lint` y `npm run format`. |
| NFR-4 | Accesible: labels en todos los inputs, roles ARIA en tabs, foco atrapado en modal, estados de error referenciados con `aria-live="polite"`. |
| NFR-5 | Todos los mensajes de cara al usuario en español; los strings en inglés del API jamás se muestran crudos. |
| NFR-6 | La UI funciona con hasta 500 filas por kind (§16 PQ-C para más). |

## 13. Criterios de aceptación (QA manual)

**Ruta y navegación**
* AC-01: Con rol `Gerente` (o `Financiero`, o `Administrador`), el NavBar muestra "Reglas Financieras" y `/budget/rules` abre la vista.
* AC-02: Con rol sin permiso (p. ej. vendedor), el ítem no aparece y el acceso directo redirige a `/`.
* AC-03: Con sesión expirada, cualquier GET dispara el flujo global de logout (sin modales de error nuevos).

**Tabs y filtros**
* AC-04: La tab activa por defecto es "Costos por Línea"; cambiar a "Comisiones de Venta" carga el dataset una sola vez (verificable en Network: no hay segundo `GET /budget/commission-rates/` al re-pulsear la tab).
* AC-05: El filtro por línea y el toggle "Mostrar solo activas" (ON por defecto) filtran sin petición HTTP.
* AC-06: El filtro "Global" muestra exactamente las filas con `id_line = null`.

**Tabla**
* AC-07: Columnas presentes: Nombre, Línea/Global-chip, Porcentaje (pctLabel correcto por tab), Vigencia Desde, Vigencia Hasta, Estado, Acciones.
* AC-08: Chip "Vencida" aparece para `is_active && date_to < hoy` y la fila sigue visible con el toggle "solo activas" ON.
* AC-09: Orden: vigencia desde más reciente primero.

**Crear**
* AC-10: Línea en blanco ⇒ badge de tasa global visible con el texto literal de la historia.
* AC-11: `date_to < date_from` ⇒ mensaje de vigencia invertida + botón Guardar deshabilitado (nunca llega E-CR-1 al servidor por esta vía).
* AC-12: pct fuera de 0-100 (o vacío) ⇒ error inline + Guardar deshabilitado.
* AC-13: Solapamiento con regla activa existente (misma línea o mismo global) ⇒ alerta de pre-check y Guardar bloqueado; si el usuario fuerza un escenario de caché sucia, la respuesta 400 E-CR-2 muestra el banner rojo en español **sin cerrar el modal**.
* AC-14: Creación exitosa ⇒ modal cierra, toast, la fila aparece en la tabla con el estado correcto, y el `GET` de refetch del kind se observa en Network.
* AC-15: La fecha de fin igual a la de inicio es válida (regla de 1 día) y guarda sin error.

**Editar / Archivar / Reactivar**
* AC-16: Al editar, el selector de línea aparece deshabilitado con el texto de alcance (A7).
* AC-17: "Archivar" pide confirmación SWAL, emite `PUT is_active:false`, **nunca** `DELETE`; la fila cambia a chip "Archivada".
* AC-18: Una archivada puede editarse (pct/fechas/nombre) y reactivarse; la reactivación con solapamiento muestra el error en español y la fila sigue archivada.
* AC-19: No existe ningún botón/acción que borre físicamente una regla.

**Qualité de código**
* AC-20: `npm run lint` sin errores; cero imports de `vuetify`; `budgetRulesStore` no referencia axios directamente (solo el service); todos los textos de UI en español.

## 14. Trazabilidad de decisiones de la sesión (supuestos aprobados)

| # | Supuesto aprobado | Afecta a |
|---|---|---|
| A1 | Endpoint de costos real es **`/budget/line-cost-rate`** (singular); comisiones `/budget/commission-rates` | §5.1 |
| A2 | Sin Vuetify ⇒ tabs HTML/CSS propios | §4, §8.1 |
| A3 | Se añade campo `rate_name` (input + columna) | §10.2, §9.2 |
| A4 | Filtros client-side sobre caché (límite 500); API `id_line`/`active_only` sin uso | §5.2, §8.3 |
| A5 | Catálogo de líneas cacheado por el store (`limit=500`) | §5.1, §6 |
| A6 | `localToday()` helper; vigencia inclusiva (igualdad válida) | §9.3, §10.4 |
| A7 | Línea inmutable al editar (PUT `exclude_none` no puede NULLificar) | §10.2 |
| A8 | Sin "vigencia abierta": `date_to` requerido | §10.2 |
| A9 | Step 0.01, display 2 decimales | §10.2 |
| A10 | Toggle "solo activas" ON por defecto | §8.3 |
| A11 | Tercer estado "Vencida"; clasificación de errores; banner en solapamiento | §9.3, §6.3, §10.5 |
| A12 | Confirmación SWAL antes de archivar; DELETE jamás | §11 |
| A13 | Service layer obligatoria (`budgetRulesService.js`) | §4, §5 |
| A14 | `fetchRates` con `skip=0&limit=500` | §5.2, §6.2 |
| A15 | Caché por kind + refetch post-mutación; orden `date_from` desc | §6, §9.2 |

## 15. Riesgos y notas de implementación

* **R-1 (baja):** Si un producto cambia de `id_line` en el maestro, las reglas archivadas de la
  línea vieja quedan como "Línea #id (eliminada)". Aceptado (auditable por ID).
* **R-2:** El gate de roles reutiliza `BUDGET_UPLOAD_ROLES`; si el producto exige un rol
  distinto para reglas, se cambia en un solo punto (§3.2).
* **R-3:** Reglas **vencidas** activas (`is_active=true`, `date_to < hoy`) siguen siendo "activas"
  para BR-13: no bloquean crear una nueva regla posterior, pero sí una que se solape. La UI lo
  comunica con el chip "Vencida".
* **R-4:** `limit=500` fijo. Validar contra el volumen real del maestro `lines`; si una tenant
  supera 500 tasas por pilar, implementar paginación (fuera de v1, PQ-C).

## 16. Fuera de alcance (v1)

* `DELETE` físico de tasas (aunque el API lo expone).
* Paginación/ordenamiento por columna en la tabla (solo el orden fijo A15).
* Reglas sin fecha fin ("abiertas").
* Editor del catálogo de líneas de producto (`/line/`) — solo lectura.
* Cost centers, escenarios, y demás reglas del presupuesto (otros sprints del Módulo Presupuestal).
* Log de auditoría con autor del cambio (la tabla no tiene `created_by`; ver spec 02_09 §4.1).
* Bult de tasas por Excel (candidate futuro: extender el Centro de Ingesta).
* Permisos granulares por botón (solo gate de vista por rol).
* TypeScript / Vuetify / nuevas dependencias.

## 17. Checklist de implementación (orden sugerido)

1. `ratesConfig.js` + `budgetRulesService.js` (test manual via curl/devtools contra los endpoints
   del §5.1 con slash final).
2. `budgetRulesStore.js` (+ `classifyRateError`).
3. `RatesDataTable.vue` + `BudgetRulesView.vue` (solo lectura, tabs, filtros, chip de estados).
4. `RateEditorModal.vue` (creación + validaciones §10.4).
5. Edición con línea bloqueada + Archivar/Reactivar con SWAL (§11).
6. Router + NavBar (§3).
7. Pasada de AC-01…AC-20 + `npm run lint`.