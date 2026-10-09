<script setup>
/**
 * CollaboratorsView — maestro de colaboradores (nómina Colombia)
 * (FE-S15-COLLAB; ruta `/budget/collaborators`, hermana de upload/rules/
 * planning bajo el gate `canAccessBudgetUpload` del router — PQ-1).
 *
 * §5: toolbar (buscador por nombre/documento con debounce, filtro CECO con
 * el catálogo del proyecto, filtro estado, botones [Importar plantilla]
 * [Nuevo colaborador] [Recalcular…] SOLO con permiso de edición), tabla con
 * paginación SERVIDOR (patrón `GET /budget/collaborator?page=&size=`, 25
 * por página — NFR-FE-1) y acciones por fila [Desglose] [Provisiones]
 * [Editar] [Terminar]. El importador vive COLAPSABLE aquí (D-FE15-2), no en
 * el Centro de Ingesta.
 *
 * D-FE15-1: la vista NO calcula nada de nómina — solo presenta cifras del
 * motor. D-FE15-5 (masking binario por rol, BE D-S11-7): con
 * `salary_masked:true` el salario se muestra "— (restringido)" y Desglose/
 * Provisiones/Importar quedan DESHABILITADOS con tooltip (el 403 del BE es
 * la autoridad reforzada).
 *
 * Terminar (D-FE15-8): única acción irreversible del feature en UI ⇒ modal
 * con fecha + PREVIEW de liquidación (GET breakdown del mes del término,
 * que ya trae los asientos LIQ) antes del POST terminate.
 *
 * Recalcular (D-FE15-9): modal pequeño de scope (todo / CECO / colaborador)
 * + mes ⇒ POST recalculate ⇒ toast `{replaced_lines}`; refresca el desglose
 * abierto vía `breakdownToken` (§6). Tras import/terminate/recalculate la
 * lista se re-consulta (los asientos cambian).
 *
 * NFR-FE-2: cero caché de salarios en localStorage/stores — los datos viven
 * en refs locales y mueren con la vista. NFR-FE-3: badges con TEXTO además
 * del color, `scope` en cabeceras.
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useUserStore } from '@/stores/userStore.js'
import { canManageCollaborators } from '@/router/index.js'
import {
  budgetCollaboratorService,
  classifyCollaboratorError
} from '@/services/budgetCollaboratorService.js'
import { costCenterService } from '@/services/costCenterService.js'
import { collectionService } from '@/services/collectionService.js'
import { alertService } from '@/services/alertService.js'
import {
  buildYearOptions,
  formatCOP,
  formatDateEs,
  MONTH_LABELS,
  formatCount
} from '@/components/budget/planning/planningFormat.js'
import {
  collabStatusBadge,
  contractTypeLabel,
  componentLabel,
  layerMeta
} from '@/components/budget/collaborator/componentLabels.js'
import CollaboratorFormModal from '@/components/budget/collaborator/CollaboratorFormModal.vue'
import CollaboratorImportPanel from '@/components/budget/collaborator/CollaboratorImportPanel.vue'
import CollaboratorBreakdownModal from '@/components/budget/collaborator/CollaboratorBreakdownModal.vue'
import CollaboratorProvisionsPanel from '@/components/budget/collaborator/CollaboratorProvisionsPanel.vue'

const PAGE_SIZE = 25

const userStore = useUserStore()

/* ───────────────────────────── permisos (UI; el BE manda) ───────────────────────────── */

const canEdit = ref(false)

/* ───────────────────────────── catálogos (selectores existentes) ───────────────────────────── */

const costCenters = ref([])
const collections = ref([])

const sortedCostCenters = computed(() =>
  [...costCenters.value].sort((a, b) =>
    String(a.cost_center_code ?? '').localeCompare(String(b.cost_center_code ?? ''), 'es')
  )
)

function cecoLabel(item) {
  if (item?.cost_center_code) return `${item.cost_center_code} — ${item.cost_center_name ?? ''}`
  const found = costCenters.value.find((cc) => cc.id_cost_center === item?.id_cost_center)
  if (!found) return item?.id_cost_center != null ? `CECO #${item.id_cost_center}` : '—'
  return `${found.cost_center_code ?? ''} — ${found.cost_center_name ?? ''}`.trim()
}

function seasonLabel(item) {
  if (item?.id_collection == null) return '—'
  const found = collections.value.find((c) => c.id_collection === item.id_collection)
  return found?.short_collection_name ?? `#${item.id_collection}`
}

/* ───────────────────────────── listado (paginación servidor) ───────────────────────────── */

const filters = reactive({ q: '', idCostCenter: '', status: '' })
const rows = ref([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const listError = ref('')

const lastPage = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))

/** Salario vigente: el BE manda el scalar en variantes de nombre ⇒ cadena defensiva. */
function salaryOf(item) {
  if (item?.salary_masked) return { masked: true, text: '— (restringido)' }
  const raw =
    item?.current_salary ??
    item?.salary ??
    item?.current_plan?.salary ??
    item?.salary_plan?.salary ??
    null
  if (raw === null || raw === undefined || raw === '') return { masked: false, text: '—' }
  return { masked: false, text: formatCOP(raw) }
}

async function fetchList() {
  if (!userStore.token) return
  loading.value = true
  listError.value = ''
  try {
    const response = await budgetCollaboratorService.fetchCollaborators({
      q: filters.q,
      idCostCenter: filters.idCostCenter ? Number(filters.idCostCenter) : null,
      status: filters.status,
      page: page.value,
      size: PAGE_SIZE
    })
    const data = response?.data ?? {}
    rows.value = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : []
    total.value = Number.isFinite(Number(data.total)) ? Number(data.total) : rows.value.length
  } catch (err) {
    const result = classifyCollaboratorError(err)
    rows.value = []
    total.value = 0
    if (result.kind === 'forbidden') {
      listError.value =
        result.message || 'No tiene permiso para consultar el maestro de colaboradores.'
    } else if (result.kind === 'network') {
      listError.value = 'Sin conexión con el servidor. Reintente.'
    } else {
      listError.value = result.message || 'No se pudo cargar el listado de colaboradores.'
    }
  } finally {
    loading.value = false
  }
}

/* búsqueda con debounce (§8: el Enter also dispara inmediato) */
let searchTimer = null
function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    void fetchList()
  }, 350)
}

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer)
})

function onSearchKeydown(event) {
  if (event.key === 'Enter') {
    if (searchTimer) clearTimeout(searchTimer)
    page.value = 1
    void fetchList()
  }
}

function onFilterChange() {
  page.value = 1
  void fetchList()
}

function goPage(delta) {
  const next = page.value + delta
  if (next < 1 || next > lastPage.value) return
  page.value = next
  void fetchList()
}

const isEmpty = computed(() => !loading.value && !listError.value && rows.value.length === 0)

/* ───────────────────────────── estado de masking global (D-FE15-5) ───────────────────────────── */

/** Cualquier fila marcada ⇒ el usuario NO ve salarios: import/recalc se bloquean. */
const salaryRestricted = computed(
  () => rows.value.length > 0 && rows.value.every((item) => item.salary_masked)
)

/* ───────────────────────────── panel de importación (D-FE15-2) ───────────────────────────── */

const importOpen = ref(false)

function toggleImport() {
  importOpen.value = !importOpen.value
}

function onImported() {
  void fetchList()
}

/* ───────────────────────────── modal maestro ───────────────────────────── */

const formOpen = ref(false)
const formTarget = ref(null)

function openCreate() {
  if (salaryRestricted.value) return
  formTarget.value = null
  formOpen.value = true
}

function openEdit(item) {
  formTarget.value = item
  formOpen.value = true
}

function closeForm() {
  formOpen.value = false
  formTarget.value = null
}

/* ───────────────────────────── desglose / provisiones ───────────────────────────── */

/** Sube tras terminate/recalculate para re-consultar modales abiertos (§6). */
const breakdownToken = ref(0)
const breakdownOpen = ref(false)
const breakdownTarget = ref(null)
const provisionsOpen = ref(false)
const provisionsTarget = ref(null)

function openBreakdown(item) {
  if (item?.salary_masked) return
  breakdownTarget.value = item
  breakdownOpen.value = true
}

function closeBreakdown() {
  breakdownOpen.value = false
  breakdownTarget.value = null
}

function openProvisions(item) {
  if (item?.salary_masked) return
  provisionsTarget.value = item
  provisionsOpen.value = true
}

function closeProvisions() {
  provisionsOpen.value = false
  provisionsTarget.value = null
}

/* ───────────────────── terminar contrato (D-FE15-8) ───────────────────── */

const terminateTarget = ref(null)
const terminateDate = ref('')
const terminateBusy = ref(false)
const terminateError = ref('')
/** @type {null | {month, components}} preview del breakdown del mes del término */
const terminatePreview = ref(null)
const previewLoading = ref(false)
let previewTimer = null

function todayISO() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function openTerminate(item) {
  terminateTarget.value = item
  terminateDate.value = todayISO()
  terminateError.value = ''
  void loadPreview()
}

function cancelTerminate() {
  if (terminateBusy.value) return
  terminateTarget.value = null
  terminatePreview.value = null
  terminateDate.value = ''
}

async function loadPreview() {
  const item = terminateTarget.value
  const date = terminateDate.value
  if (!item || !date || date.length < 7) return
  previewLoading.value = true
  terminatePreview.value = null
  try {
    const month = date.slice(0, 7)
    const response = await budgetCollaboratorService.fetchBreakdown(item.id_collaborator, month)
    terminatePreview.value = { month, data: response?.data ?? null }
  } catch (err) {
    const result = classifyCollaboratorError(err)
    terminatePreview.value = {
      month: date.slice(0, 7),
      data: null,
      error:
        result.message ||
        (result.kind === 'forbidden'
          ? 'No tiene permiso para previsualizar la liquidación.'
          : 'No se pudo obtener la previsualización del mes.')
    }
  } finally {
    previewLoading.value = false
  }
}

function onTerminateDateInput() {
  if (previewTimer) clearTimeout(previewTimer)
  previewTimer = setTimeout(() => void loadPreview(), 300)
}

const previewRows = computed(() => {
  const list = terminatePreview.value?.data?.components
  return Array.isArray(list) ? list : []
})

async function confirmTerminate() {
  const item = terminateTarget.value
  if (!item || terminateBusy.value) return
  if (!terminateDate.value) {
    terminateError.value = 'La fecha de término es obligatoria.'
    return
  }
  terminateBusy.value = true
  terminateError.value = ''
  try {
    await budgetCollaboratorService.terminateCollaborator(item.id_collaborator, terminateDate.value)
    alertService.generalSucces(
      'Contrato terminado: la liquidación quedó causada en el mes del término.'
    )
    terminateTarget.value = null
    terminatePreview.value = null
    breakdownToken.value += 1
    await fetchList()
  } catch (err) {
    const result = classifyCollaboratorError(err)
    if (result.kind === 'forbidden') {
      terminateError.value = result.message || 'No tiene permiso para terminar contratos.'
    } else if (result.kind === 'network') {
      terminateError.value = 'Sin conexión con el servidor. Reintente.'
    } else {
      // R-11/R-05 y reglas del BE: se pinta el message estructurado del BE.
      terminateError.value = result.message || 'No se pudo terminar el contrato.'
    }
  } finally {
    terminateBusy.value = false
  }
}

/* ─────────────────────── recalcular mes (D-FE15-9) ─────────────────────── */

const recalcOpen = ref(false)
const recalcBusy = ref(false)
const recalcError = ref('')
const recalc = reactive({
  scope: 'all',
  idCostCenter: '',
  idCollaborator: '',
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1
})
const recalcYearOptions = buildYearOptions()

const collaboratorOptions = computed(() =>
  rows.value.map((item) => ({
    value: item.id_collaborator,
    label: `${item.full_name ?? '—'} (${item.doc_value ?? '—'})`
  }))
)

function openRecalculate() {
  if (salaryRestricted.value) return
  recalcError.value = ''
  recalcOpen.value = true
}

function closeRecalculate() {
  if (recalcBusy.value) return
  recalcOpen.value = false
}

async function confirmRecalculate() {
  if (recalcBusy.value) return
  recalcError.value = ''
  if (recalc.scope === 'cost_center' && !recalc.idCostCenter) {
    recalcError.value = 'Seleccione el centro de costo a recalcular.'
    return
  }
  if (recalc.scope === 'collaborator' && !recalc.idCollaborator) {
    recalcError.value = 'Seleccione el colaborador a recalcular.'
    return
  }
  const month = `${recalc.year}-${String(recalc.month).padStart(2, '0')}`
  const payload = { month }
  if (recalc.scope === 'cost_center') payload.id_cost_center = Number(recalc.idCostCenter)
  if (recalc.scope === 'collaborator') payload.id_collaborator = Number(recalc.idCollaborator)
  recalcBusy.value = true
  try {
    const response = await budgetCollaboratorService.recalculate(payload)
    const replaced = Number(response?.data?.replaced_lines ?? 0)
    alertService.generalSucces(
      `Mes ${month} recalculado: ${formatCount(replaced)} líneas regeneradas.`
    )
    recalcOpen.value = false
    breakdownToken.value += 1
    await fetchList()
  } catch (err) {
    const result = classifyCollaboratorError(err)
    if (result.kind === 'forbidden') {
      recalcError.value = result.message || 'No tiene permiso para recalcular.'
    } else if (result.kind === 'network') {
      recalcError.value = 'Sin conexión con el servidor. Reintente.'
    } else {
      // R-05: vigencia sin parámetros ⇒ el BE manda el detalle (AC-FE-8).
      recalcError.value = result.message || 'No se pudo recalcular el mes.'
    }
  } finally {
    recalcBusy.value = false
  }
}

/* ───────────────────────────── arranque ───────────────────────────── */

onMounted(async () => {
  if (!userStore.token) return
  canEdit.value = canManageCollaborators()
  const [ccResult, colResult] = await Promise.allSettled([
    costCenterService.getCostCenters(),
    collectionService.getCollections()
  ])
  if (ccResult.status === 'fulfilled') {
    costCenters.value = Array.isArray(ccResult.value?.data) ? ccResult.value.data : []
  }
  if (colResult.status === 'fulfilled') {
    collections.value = Array.isArray(colResult.value?.data) ? colResult.value.data : []
  }
  await fetchList()
})

const maskedTooltip = 'Información salarial restringida para su rol (Ley 1581/2012).'
</script>

<template>
  <div class="collab-page">
    <div class="section-header">
      <div class="section-accent"></div>
      <h2 class="section-title">Colaboradores</h2>
    </div>

    <p class="page-description">
      Maestro de nómina: capture solo identificaciones y salarios — el sistema calcula auxilio,
      seguridad social, parafiscales y provisiones, y materializa las líneas del escenario con su
      capa CAJA/PROVISIÓN. Importe la plantilla «Solicitud Presupuesto Nómina/Colaboradores» o cree
      colaboradores uno a uno.
    </p>

    <!-- Toolbar (§5) -->
    <div class="collab-toolbar">
      <label class="filter-field">
        <span class="filter-label">Buscar por nombre o documento</span>
        <input
          v-model="filters.q"
          class="filter-input"
          type="search"
          placeholder="Nombre o documento…"
          @input="onSearchInput"
          @keydown="onSearchKeydown"
        />
      </label>

      <label class="filter-field">
        <span class="filter-label">Centro de costo</span>
        <select v-model="filters.idCostCenter" class="filter-input" @change="onFilterChange">
          <option value="">Todos los CECO</option>
          <option
            v-for="center in sortedCostCenters"
            :key="center.id_cost_center"
            :value="String(center.id_cost_center)"
          >
            {{ center.cost_center_code }} — {{ center.cost_center_name }}
          </option>
        </select>
      </label>

      <label class="filter-field">
        <span class="filter-label">Estado</span>
        <select v-model="filters.status" class="filter-input" @change="onFilterChange">
          <option value="">Todos</option>
          <option value="active">Activos</option>
          <option value="terminated">Terminados</option>
        </select>
      </label>

      <div class="toolbar-actions">
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="loading"
          @click="fetchList()"
        >
          Actualizar
        </button>
        <template v-if="canEdit">
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            :class="{ 'is-pressed': importOpen }"
            :disabled="salaryRestricted"
            :title="salaryRestricted ? maskedTooltip : 'Importar la plantilla de nómina (Excel)'"
            @click="toggleImport"
          >
            {{ importOpen ? 'Ocultar importador' : 'Importar plantilla' }}
          </button>
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            :disabled="salaryRestricted"
            :title="salaryRestricted ? maskedTooltip : 'Recalcular un mes del motor (D-FE15-9)'"
            @click="openRecalculate"
          >
            Recalcular…
          </button>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="salaryRestricted"
            :title="salaryRestricted ? maskedTooltip : ''"
            @click="openCreate"
          >
            + Nuevo colaborador
          </button>
        </template>
      </div>
    </div>

    <!-- Importador colapsable (D-FE15-2) -->
    <CollaboratorImportPanel v-if="canEdit && importOpen" @imported="onImported" />

    <!-- Error de carga -->
    <div v-if="listError" class="load-error" role="alert" aria-live="polite">
      <span>{{ listError }}</span>
      <button type="button" class="btn btn-secondary btn-sm" @click="fetchList()">
        Reintentar
      </button>
    </div>

    <!-- Tabla (paginación servidor) -->
    <div v-else class="collab-table-zone">
      <div v-if="loading" class="collab-loading" aria-live="polite">
        <span class="collab-spinner" aria-hidden="true"></span>
        Cargando colaboradores…
      </div>

      <template v-else-if="!isEmpty">
        <table class="collab-table" aria-label="Colaboradores de nómina">
          <thead>
            <tr>
              <th scope="col">Documento</th>
              <th scope="col">Nombre</th>
              <th scope="col">Contrato</th>
              <th scope="col">CECO</th>
              <th scope="col">Temporada</th>
              <th scope="col">Estado</th>
              <th scope="col">Salario vigente</th>
              <th scope="col">Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in rows" :key="item.id_collaborator">
              <td class="cell-doc">
                <span class="cell-doc-type">{{ item.doc_type || 'CC' }}</span>
                {{ item.doc_value ?? '—' }}
              </td>
              <td class="cell-name" :title="item.full_name || ''">{{ item.full_name || '—' }}</td>
              <td>{{ contractTypeLabel(item.contract_type) }}</td>
              <td class="cell-ceco">{{ cecoLabel(item) }}</td>
              <td>{{ seasonLabel(item) }}</td>
              <td>
                <span class="collab-badge" :class="`is-${collabStatusBadge(item.status).tone}`">
                  {{ collabStatusBadge(item.status).label }}
                </span>
              </td>
              <td class="cell-salary" :class="{ 'is-masked': salaryOf(item).masked }">
                {{ salaryOf(item).text }}
              </td>
              <td>
                <div class="row-actions">
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    :disabled="Boolean(item.salary_masked)"
                    :title="item.salary_masked ? maskedTooltip : 'Desglose CAJA/PROVISIÓN del mes'"
                    @click="openBreakdown(item)"
                  >
                    Desglose
                  </button>
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    :disabled="Boolean(item.salary_masked)"
                    :title="
                      item.salary_masked ? maskedTooltip : 'Saldos de prima, cesantías e intereses'
                    "
                    @click="openProvisions(item)"
                  >
                    Provisiones
                  </button>
                  <button
                    v-if="canEdit"
                    type="button"
                    class="btn btn-secondary btn-sm"
                    @click="openEdit(item)"
                  >
                    Editar
                  </button>
                  <button
                    v-if="canEdit && item.status !== 'terminated'"
                    type="button"
                    class="btn btn-danger btn-sm"
                    @click="openTerminate(item)"
                  >
                    Terminar
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <div class="collab-pagination">
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            :disabled="loading || page <= 1"
            @click="goPage(-1)"
          >
            ← Anterior
          </button>
          <span class="pagination-info" aria-live="polite">
            Página {{ page }} de {{ lastPage }} · {{ formatCount(total) }} colaboradores
          </span>
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            :disabled="loading || page >= lastPage"
            @click="goPage(1)"
          >
            Siguiente →
          </button>
        </div>
      </template>

      <!-- Vacío (§6): CTA -->
      <div v-else class="collab-empty">
        <p class="collab-empty-title">Aún no hay colaboradores registrados</p>
        <p class="collab-empty-text">
          Importe la plantilla de nómina o cree el primero. El motor generará el costo total
          (salario + auxilios + seguridad social + parafiscales + provisiones) mes a mes.
        </p>
        <div v-if="canEdit" class="collab-empty-actions">
          <button type="button" class="btn btn-primary btn-sm" @click="importOpen = true">
            Importar plantilla
          </button>
          <button type="button" class="btn btn-secondary btn-sm" @click="openCreate">
            + Nuevo colaborador
          </button>
        </div>
      </div>
    </div>

    <!-- ══════════════════ modales ══════════════════ -->

    <CollaboratorFormModal
      :open="formOpen"
      :collaborator="formTarget"
      :cost-centers="costCenters"
      :collections="collections"
      @saved="fetchList()"
      @close="closeForm"
    />

    <CollaboratorBreakdownModal
      :open="breakdownOpen"
      :collaborator="breakdownTarget"
      :refresh-token="breakdownToken"
      @close="closeBreakdown"
    />

    <CollaboratorProvisionsPanel
      :open="provisionsOpen"
      :collaborator="provisionsTarget"
      :refresh-token="breakdownToken"
      @close="closeProvisions"
    />

    <!-- Terminar contrato (D-FE15-8): fecha + preview LIQ antes de confirmar -->
    <div
      v-if="terminateTarget"
      class="collab-overlay"
      @mousedown="
        (event) => {
          if (event.target === event.currentTarget) cancelTerminate()
        }
      "
    >
      <div class="collab-dialog" role="dialog" aria-modal="true" aria-labelledby="terminate-title">
        <header class="collab-modal-header">
          <div>
            <h3 id="terminate-title" class="collab-modal-title">Terminar contrato</h3>
            <p class="collab-modal-sub">
              {{ terminateTarget.full_name }} ({{ terminateTarget.doc_value }}) · única acción
              irreversible de este módulo: revise la previsualización.
            </p>
          </div>
          <button
            type="button"
            class="collab-x"
            :disabled="terminateBusy"
            aria-label="Cerrar ventana"
            @click="cancelTerminate"
          >
            ✕
          </button>
        </header>

        <div class="collab-modal-body">
          <label class="filter-field">
            <span class="filter-label">Fecha de terminación *</span>
            <input
              v-model="terminateDate"
              class="filter-input"
              type="date"
              :disabled="terminateBusy"
              @input="onTerminateDateInput"
            />
          </label>

          <div class="preview-zone" aria-live="polite">
            <p class="preview-title">
              Previsualización del mes del término (asientos LIQ del motor)
            </p>
            <div v-if="previewLoading" class="preview-loading">
              <span class="collab-spinner" aria-hidden="true"></span> Calculando preview…
            </div>
            <p v-else-if="terminatePreview?.error" class="preview-error">
              {{ terminatePreview.error }}
            </p>
            <table v-else-if="previewRows.length" class="preview-table">
              <thead>
                <tr>
                  <th scope="col">Componente</th>
                  <th scope="col">Capa</th>
                  <th scope="col">Monto</th>
                  <th scope="col">Pago</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, index) in previewRows" :key="`${row.code}-${index}`">
                  <td class="cell-name">{{ componentLabel(row.code, row.name) }}</td>
                  <td>
                    <span class="collab-badge" :class="`is-${layerMeta(row.layer).tone}`">
                      {{ layerMeta(row.layer).label }}
                    </span>
                  </td>
                  <td class="cell-salary">{{ formatCOP(row.amount) }}</td>
                  <td>{{ formatDateEs(row.payment_date) }}</td>
                </tr>
              </tbody>
            </table>
            <p v-else class="preview-empty">
              El mes {{ terminatePreview?.month || '—' }} quedó sin asientos: verifique la fecha.
            </p>
          </div>

          <p v-if="terminateError" class="collab-banner" role="alert">{{ terminateError }}</p>
        </div>

        <footer class="collab-modal-footer">
          <button
            type="button"
            class="btn btn-secondary"
            :disabled="terminateBusy"
            @click="cancelTerminate"
          >
            Cancelar
          </button>
          <button
            type="button"
            class="btn btn-danger"
            :disabled="terminateBusy || !terminateDate"
            @click="confirmTerminate"
          >
            <span v-if="terminateBusy" class="collab-spinner" aria-hidden="true"></span>
            {{ terminateBusy ? 'Terminando…' : 'Terminar y liquidar' }}
          </button>
        </footer>
      </div>
    </div>

    <!-- Recalcular mes (D-FE15-9) -->
    <div
      v-if="recalcOpen"
      class="collab-overlay"
      @mousedown="
        (event) => {
          if (event.target === event.currentTarget) closeRecalculate()
        }
      "
    >
      <div
        class="collab-dialog collab-dialog-narrow"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recalc-title"
      >
        <header class="collab-modal-header">
          <h3 id="recalc-title" class="collab-modal-title">Recalcular mes del motor</h3>
          <button
            type="button"
            class="collab-x"
            :disabled="recalcBusy"
            aria-label="Cerrar ventana"
            @click="closeRecalculate"
          >
            ✕
          </button>
        </header>

        <div class="collab-modal-body">
          <label class="filter-field">
            <span class="filter-label">Alcance</span>
            <select v-model="recalc.scope" class="filter-input" :disabled="recalcBusy">
              <option value="all">Todos los colaboradores</option>
              <option value="cost_center">Por centro de costo (CECO)</option>
              <option value="collaborator">Un colaborador</option>
            </select>
          </label>

          <label v-if="recalc.scope === 'cost_center'" class="filter-field">
            <span class="filter-label">CECO *</span>
            <select v-model="recalc.idCostCenter" class="filter-input" :disabled="recalcBusy">
              <option value="">Seleccione…</option>
              <option
                v-for="center in sortedCostCenters"
                :key="center.id_cost_center"
                :value="String(center.id_cost_center)"
              >
                {{ center.cost_center_code }} — {{ center.cost_center_name }}
              </option>
            </select>
          </label>

          <label v-if="recalc.scope === 'collaborator'" class="filter-field">
            <span class="filter-label">Colaborador * (de la página actual)</span>
            <select v-model="recalc.idCollaborator" class="filter-input" :disabled="recalcBusy">
              <option value="">Seleccione…</option>
              <option
                v-for="option in collaboratorOptions"
                :key="option.value"
                :value="String(option.value)"
              >
                {{ option.label }}
              </option>
            </select>
          </label>

          <div class="recalc-month">
            <label class="filter-field">
              <span class="filter-label">Año</span>
              <select v-model.number="recalc.year" class="filter-input" :disabled="recalcBusy">
                <option v-for="year in recalcYearOptions" :key="year" :value="year">
                  {{ year }}
                </option>
              </select>
            </label>
            <label class="filter-field">
              <span class="filter-label">Mes</span>
              <select v-model.number="recalc.month" class="filter-input" :disabled="recalcBusy">
                <option v-for="(label, index) in MONTH_LABELS" :key="label" :value="index + 1">
                  {{ label }}
                </option>
              </select>
            </label>
          </div>

          <p class="recalc-note">
            Solo se reescriben líneas del motor <code>collaborator_*</code> del mes (R-13): las
            líneas manuales y de otras plantillas quedan intactas.
          </p>

          <p v-if="recalcError" class="collab-banner" role="alert">{{ recalcError }}</p>
        </div>

        <footer class="collab-modal-footer">
          <button
            type="button"
            class="btn btn-secondary"
            :disabled="recalcBusy"
            @click="closeRecalculate"
          >
            Cancelar
          </button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="recalcBusy"
            @click="confirmRecalculate"
          >
            <span v-if="recalcBusy" class="collab-spinner" aria-hidden="true"></span>
            {{ recalcBusy ? 'Recalculando…' : 'Recalcular' }}
          </button>
        </footer>
      </div>
    </div>
  </div>
</template>

<style scoped>
.collab-page {
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
  padding: 24px;
}

.page-description {
  max-width: 860px;
  margin: 10px 0 22px;
  font-size: 0.86rem;
  line-height: 1.55;
  color: var(--color-text-secondary, #555555);
  text-wrap: pretty;
}

/* Toolbar (mismo lenguaje que BudgetRulesView) */

.collab-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: flex-end;
  margin-bottom: 14px;
  padding: 14px 16px;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 8px;
  background-color: var(--color-surface-card, #ffffff);
}

.filter-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filter-label {
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--color-text-secondary, #555555);
}

.filter-input {
  width: 230px;
  min-width: 150px;
  max-width: none;
  margin: 0;
  padding: 7px 10px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 6px;
  background-color: var(--color-surface, #f7f7f7);
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-primary, #070707);
  box-sizing: border-box;
}

.filter-input:focus {
  border-color: var(--color-brand, #03658c);
  outline: 2px solid rgba(3, 101, 140, 0.25);
  outline-offset: 0;
}

.toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-left: auto;
}

.toolbar-actions .is-pressed {
  border-color: var(--color-brand, #03658c);
  background-color: rgba(3, 101, 140, 0.08);
}

/* Tabla */

.collab-table-zone {
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 8px;
  background-color: var(--color-surface-card, #ffffff);
  overflow: auto;
}

.collab-table {
  min-width: 1180px;
  border: none;
  border-radius: 0;
  overflow: visible;
  box-shadow: none;
}

.cell-doc {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.cell-doc-type {
  margin-right: 4px;
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--color-text-muted, #8a8a8a);
}

.cell-name {
  max-width: 240px;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell-ceco {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell-salary {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.cell-salary.is-masked {
  font-weight: 400;
  font-style: italic;
  color: var(--color-text-muted, #8a8a8a);
}

.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
  white-space: nowrap;
}

/* Badges: TEXTO + color (NFR-FE-3, §7.3) */

.collab-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  white-space: nowrap;
}

.collab-badge.is-active {
  border: 1px solid rgba(34, 104, 58, 0.45);
  background-color: rgba(46, 164, 79, 0.12);
  color: #22683a;
}

:root[data-theme='dark'] .collab-badge.is-active {
  color: #7bd89a;
}

.collab-badge.is-terminated {
  border: 1px solid rgba(120, 120, 120, 0.4);
  background-color: rgba(120, 120, 120, 0.12);
  color: #555555;
}

:root[data-theme='dark'] .collab-badge.is-terminated {
  color: #b0b0b0;
}

.collab-badge.is-caja {
  border: 1px solid rgba(3, 101, 140, 0.45);
  background-color: rgba(3, 101, 140, 0.1);
  color: #03658c;
}

:root[data-theme='dark'] .collab-badge.is-caja {
  color: #7fd4f0;
}

.collab-badge.is-provision {
  border: 1px solid rgba(180, 83, 9, 0.5);
  background-color: rgba(217, 119, 6, 0.12);
  color: #92400e;
}

:root[data-theme='dark'] .collab-badge.is-provision {
  color: #fbbf24;
}

/* Estados */

.collab-loading,
.collab-empty {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
  font-size: 0.85rem;
  color: var(--color-text-muted, #8a8a8a);
  text-align: center;
}

.collab-loading {
  flex-direction: row;
}

.collab-empty-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text-primary, #070707);
}

.collab-empty-text {
  max-width: 560px;
  margin: 0;
  line-height: 1.55;
}

.collab-empty-actions {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}

.collab-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(120, 120, 120, 0.25);
  border-top-color: var(--color-brand, #03658c);
  border-radius: 50%;
  animation: collab-spin 0.8s linear infinite;
}

@keyframes collab-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .collab-spinner {
    animation-duration: 1.6s;
  }
}

.load-error {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  border: 1px solid rgba(197, 48, 48, 0.35);
  border-left: 4px solid #c53030;
  border-radius: 8px;
  background-color: rgba(197, 48, 48, 0.07);
  font-size: 0.84rem;
  line-height: 1.5;
  color: #9b2222;
}

:root[data-theme='dark'] .load-error {
  color: #ff9b9b;
}

/* Paginación */

.collab-pagination {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: center;
  padding: 12px;
  border-top: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
}

.pagination-info {
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-secondary, #555555);
}

/* Overlay de modales locales (terminar / recalcular) */

.collab-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background-color: var(--background-transparency, rgba(7, 7, 7, 0.55));
}

.collab-dialog {
  display: flex;
  flex-direction: column;
  width: min(640px, 96vw);
  max-height: min(88vh, 820px);
  overflow: hidden;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 10px;
  background-color: var(--color-surface-card, #ffffff);
  color: var(--color-text-primary, #070707);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
  animation: collab-pop 0.22s cubic-bezier(0.23, 1, 0.32, 1);
}

.collab-dialog-narrow {
  width: min(520px, 96vw);
}

@keyframes collab-pop {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(6px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .collab-dialog {
    animation: none;
  }
}

.collab-modal-header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
}

.collab-modal-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.collab-modal-sub {
  margin: 2px 0 0;
  font-size: 0.76rem;
  color: var(--color-text-muted, #8a8a8a);
}

.collab-x {
  flex-shrink: 0;
  padding: 6px 8px;
  border: none;
  border-radius: 6px;
  background: none;
  font-size: 0.95rem;
  color: var(--color-text-muted, #8a8a8a);
  cursor: pointer;
}

.collab-x:hover:not(:disabled) {
  background-color: rgba(120, 120, 120, 0.12);
  color: var(--color-text-primary, #070707);
}

.collab-modal-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  padding: 16px 20px;
}

.collab-modal-footer {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding: 12px 20px;
  border-top: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  background-color: var(--color-surface, #f7f7f7);
}

:root[data-theme='dark'] .collab-modal-footer {
  background-color: rgba(255, 255, 255, 0.03);
}

.collab-banner {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid rgba(197, 48, 48, 0.35);
  border-left: 4px solid #c53030;
  border-radius: 8px;
  background-color: rgba(197, 48, 48, 0.07);
  font-size: 0.82rem;
  line-height: 1.5;
  color: #9b2222;
  overflow-wrap: anywhere;
}

:root[data-theme='dark'] .collab-banner {
  color: #ff9b9b;
}

/* Preview de liquidación */

.preview-zone {
  padding: 12px 14px;
  border: 1px dashed var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 8px;
  background-color: var(--color-surface, #f7f7f7);
}

:root[data-theme='dark'] .preview-zone {
  background-color: rgba(255, 255, 255, 0.04);
}

.preview-title {
  margin: 0 0 8px;
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-secondary, #555555);
}

.preview-loading,
.preview-empty {
  margin: 0;
  font-size: 0.78rem;
  color: var(--color-text-muted, #8a8a8a);
}

.preview-loading {
  display: flex;
  gap: 8px;
  align-items: center;
}

.preview-error {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 500;
  color: #9b2222;
}

:root[data-theme='dark'] .preview-error {
  color: #ff9b9b;
}

.preview-table {
  width: 100%;
  font-size: 0.76rem;
}

.recalc-month {
  display: flex;
  gap: 12px;
}

.recalc-note {
  margin: 0;
  font-size: 0.74rem;
  line-height: 1.5;
  color: var(--color-text-muted, #8a8a8a);
}

.recalc-note code {
  padding: 1px 5px;
  border-radius: 4px;
  background-color: var(--color-surface, #f2f4f7);
  font-size: 0.7rem;
}

@media (max-width: 768px) {
  .collab-page {
    padding: 20px 16px;
  }

  .toolbar-actions {
    margin-left: 0;
  }
}
</style>
