<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useUserStore } from '@/stores/userStore.js'
import { canManageFinancingCredits } from '@/router/index.js'
import { budgetFinancingCreditService, classifyFinancingCreditError } from '@/services/budgetFinancingCreditService.js'
import { costCenterService } from '@/services/costCenterService.js'
import FinancingCreditFormModal from '@/views/budget/components/FinancingCreditFormModal.vue'
import FinancingCreditScheduleModal from '@/views/budget/components/FinancingCreditScheduleModal.vue'

const PAGE_SIZE = 25
const userStore = useUserStore()
const canEdit = ref(false)
const costCenters = ref([])
const costCenterError = ref('')
const filters = reactive({ q: '', idCostCenter: '', status: '', originType: '' })
const cashFlowRange = reactive({ dateFrom: '', dateTo: '' })
const rows = ref([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const listError = ref('')
const formOpen = ref(false)
const formTarget = ref(null)
const openingEditId = ref(null)
const deletingCreditId = ref(null)
const actionMessage = ref('')
const cashFlowData = ref(null)
const cashFlowLoading = ref(false)
const cashFlowError = ref('')
const scheduleOpen = ref(false)
const scheduleTarget = ref(null)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
const sortedCostCenters = computed(() =>
  [...costCenters.value].sort((a, b) =>
    String(a.cost_center_code ?? '').localeCompare(String(b.cost_center_code ?? ''), 'es')
  )
)
const empty = computed(() => !loading.value && !listError.value && rows.value.length === 0)

function money(value) {
  if (value === null || value === undefined || value === '') return '—'
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)
}

function invalidateCashFlow() {
  cashFlowData.value = null
  cashFlowError.value = ''
}

async function loadCashFlow() {
  if (cashFlowLoading.value) return
  cashFlowError.value = ''
  cashFlowData.value = null
  if (!cashFlowRange.dateFrom || !cashFlowRange.dateTo) {
    cashFlowError.value = 'Seleccione las dos fechas de la ventana de consulta.'
    return
  }
  if (cashFlowRange.dateFrom > cashFlowRange.dateTo) {
    cashFlowError.value = 'La fecha inicial debe ser anterior o igual a la fecha final.'
    return
  }
  cashFlowLoading.value = true
  try {
    const response = await budgetFinancingCreditService.fetchBudgetCashFlow(cashFlowRange)
    cashFlowData.value = response?.data ?? null
  } catch (error) {
    cashFlowError.value = classifyFinancingCreditError(error).message
  } finally {
    cashFlowLoading.value = false
  }
}

const cashFlowWarnings = computed(() =>
  Array.isArray(cashFlowData.value?.meta?.warnings) ? cashFlowData.value.meta.warnings : []
)

function dateLabel(value) {
  if (!value) return '—'
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('es-CO').format(date)
}

function cecoLabel(item) {
  if (item?.cost_center_code || item?.cost_center_name)
    return `${item.cost_center_code ?? ''} — ${item.cost_center_name ?? ''}`.trim()
  const center = costCenters.value.find(
    (entry) => String(entry.id_cost_center) === String(item?.id_cost_center)
  )
  return center
    ? `${center.cost_center_code ?? ''} — ${center.cost_center_name ?? ''}`.trim()
    : item?.id_cost_center != null
      ? `CECO #${item.id_cost_center}`
      : '—'
}

function methodLabel(method) {
  if (method === 'french_fixed_payment') return 'Cuota fija (francés)'
  if (method === 'german_fixed_principal') return 'Capital fijo (alemán)'
  return '—'
}

function originLabel(origin) {
  return origin === 'legacy' ? 'Antiguo — desde corte' : origin === 'new' ? 'Nuevo' : '—'
}

function getCreditId(item) {
  return item?.id_financing_credit ?? item?.id
}

function materializationWarnings(item) {
  const warnings = item?.warnings ?? item?.materialization_warnings
  return Array.isArray(warnings) ? warnings : []
}

async function fetchList() {
  if (!userStore.token) return
  loading.value = true
  listError.value = ''
  try {
    const response = await budgetFinancingCreditService.listFinancingCredits({
      q: filters.q,
      idCostCenter: filters.idCostCenter,
      status: filters.status,
      originType: filters.originType,
      page: page.value,
      size: PAGE_SIZE
    })
    const data = response?.data ?? {}
    rows.value = Array.isArray(data.items) ? data.items : []
    total.value = Number.isFinite(Number(data.total)) ? Number(data.total) : rows.value.length
  } catch (error) {
    const result = classifyFinancingCreditError(error)
    rows.value = []
    total.value = 0
    listError.value = result.message
  } finally {
    loading.value = false
  }
}

let searchTimer = null
function searchChanged() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    void fetchList()
  }, 350)
}

function searchKeydown(event) {
  if (event.key !== 'Enter') return
  if (searchTimer) clearTimeout(searchTimer)
  page.value = 1
  void fetchList()
}

function filterChanged() {
  page.value = 1
  void fetchList()
}

function goPage(delta) {
  const next = page.value + delta
  if (loading.value || next < 1 || next > pageCount.value) return
  page.value = next
  void fetchList()
}

function openCreate() {
  if (!costCenters.value.length) {
    costCenterError.value = costCenterError.value || 'Cargue el catálogo de centros de costo antes de crear un crédito.'
    return
  }
  formTarget.value = null
  formOpen.value = true
}

async function openEdit(item) {
  if (openingEditId.value) return
  const id = getCreditId(item)
  openingEditId.value = id
  listError.value = ''
  try {
    const response = await budgetFinancingCreditService.getFinancingCredit(id)
    formTarget.value = response?.data ?? item
    formOpen.value = true
  } catch (error) {
    listError.value = classifyFinancingCreditError(error).message
  } finally {
    openingEditId.value = null
  }
}

function openSchedule(item) {
  scheduleTarget.value = item
  scheduleOpen.value = true
}

function editFromSchedule(item) {
  scheduleOpen.value = false
  scheduleTarget.value = null
  formTarget.value = item
  formOpen.value = true
}

function closeSchedule() {
  scheduleOpen.value = false
  scheduleTarget.value = null
}

function onChanged() {
  void fetchList()
}

function confirmDelete(item) {
  const name = item?.name ?? item?.lender_name ?? `#${getCreditId(item)}`
  return window.confirm(
    `¿Eliminar DEFINITIVAMENTE el crédito de financiación “${name}”? Esta acción es irreversible.\n\n` +
      'Se eliminarán su calendario, las entradas de financiación futura y SOLO las líneas generadas de interés/seguro. ' +
      'No modifica créditos de facturas ni líneas manuales.\n\n' +
      'Esto NO es “Cerrar”: cerrar con saldo real cero conserva el registro. ¿Desea eliminarlo definitivamente?'
  )
}

async function deleteCredit(item) {
  if (!canEdit.value || deletingCreditId.value !== null) return
  const id = getCreditId(item)
  if (id === undefined || id === null || !confirmDelete(item)) return

  deletingCreditId.value = String(id)
  listError.value = ''
  actionMessage.value = ''
  const refreshCashFlow = Boolean(cashFlowData.value)
  try {
    const response = await budgetFinancingCreditService.deleteFinancingCredit(id)
    const result = response?.data ?? {}
    actionMessage.value = result.message || `El crédito “${item?.name ?? item?.lender_name ?? id}” se eliminó definitivamente.`
    invalidateCashFlow()
    await fetchList()
    if (refreshCashFlow) await loadCashFlow()
  } catch (error) {
    listError.value = classifyFinancingCreditError(error).message
  } finally {
    deletingCreditId.value = null
  }
}

async function onCreditDeleted(result = {}) {
  closeSchedule()
  actionMessage.value = result.message || 'El crédito se eliminó definitivamente.'
  const refreshCashFlow = Boolean(cashFlowData.value)
  invalidateCashFlow()
  await fetchList()
  if (refreshCashFlow) await loadCashFlow()
}

async function loadCostCenters() {
  costCenterError.value = ''
  try {
    const response = await costCenterService.getCostCenters()
    costCenters.value = Array.isArray(response?.data) ? response.data : []
    if (!costCenters.value.length) costCenterError.value = 'El catálogo de centros de costo no devolvió opciones.'
  } catch (error) {
    costCenterError.value = classifyFinancingCreditError(error).message
  }
}

onMounted(async () => {
  if (!userStore.token) return
  canEdit.value = canManageFinancingCredits()
  await loadCostCenters()
  await fetchList()
})

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer)
})
</script>

<template>
  <main class="fin-page">
    <nav class="fin-breadcrumb" aria-label="Ruta de navegación"><RouterLink to="/budget/planning">Presupuesto</RouterLink><span aria-hidden="true">›</span><span aria-current="page">Financiación empresarial</span></nav>
    <div class="section-header"><div class="section-accent"></div><h1 class="section-title">Financiación empresarial</h1></div>
    <p class="fin-intro">Obligaciones de financiación de la empresa, separadas de los créditos de facturas/cartera. El calendario proyectado lo genera el backend. Capital se muestra como salida de financiación; interés y seguro como gastos presupuestarios, sin reconstruir el flujo de caja en frontend.</p>

    <section class="fin-toolbar" aria-label="Filtros de financiación empresarial">
      <label class="fin-filter"><span>Buscar por nombre o acreedor</span><input v-model="filters.q" type="search" placeholder="Nombre o entidad…" @input="searchChanged" @keydown="searchKeydown" /></label>
      <label class="fin-filter"><span>Centro de costo</span><select v-model="filters.idCostCenter" @change="filterChanged"><option value="">Todos los CECO</option><option v-for="center in sortedCostCenters" :key="center.id_cost_center" :value="String(center.id_cost_center)">{{ center.cost_center_code }} — {{ center.cost_center_name }}</option></select></label>
      <label class="fin-filter"><span>Estado</span><select v-model="filters.status" @change="filterChanged"><option value="">Todos</option><option value="active">Activos</option><option value="closed">Cerrados</option></select></label>
      <label class="fin-filter"><span>Origen</span><select v-model="filters.originType" @change="filterChanged"><option value="">Todos</option><option value="new">Nuevo</option><option value="legacy">Antiguo — desde corte</option></select></label>
      <div class="fin-actions"><button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="fetchList">Actualizar</button><button v-if="canEdit" type="button" class="btn btn-primary btn-sm" :disabled="!costCenters.length" :title="!costCenters.length ? 'Se requiere cargar un CECO' : ''" @click="openCreate">+ Nuevo crédito</button></div>
    </section>

    <div v-if="costCenterError" class="fin-error" role="alert" aria-live="polite"><span>No se pudo cargar el catálogo CECO: {{ costCenterError }}</span><button type="button" class="btn btn-secondary btn-sm" @click="loadCostCenters">Reintentar CECO</button></div>

    <div v-if="listError" class="fin-error" role="alert" aria-live="polite"><span>{{ listError }}</span><button type="button" class="btn btn-secondary btn-sm" @click="fetchList">Reintentar</button></div>
    <div v-if="actionMessage" class="fin-success" role="status" aria-live="polite">{{ actionMessage }}</div>
    <section v-else class="fin-table-zone">
      <div v-if="loading" class="fin-loading" aria-live="polite"><span class="fin-spinner" aria-hidden="true"></span>Cargando financiación empresarial…</div>
      <template v-else-if="!empty">
        <div class="fin-table-scroll"><table aria-label="Créditos de financiación empresarial">
           <thead><tr><th scope="col">Nombre / acreedor</th><th scope="col">Origen</th><th scope="col">Método</th><th scope="col">Moneda</th><th scope="col">CECO</th><th scope="col">Saldo registrado</th><th scope="col">Primera fecha de cuota</th><th scope="col">Interés futuro · gasto</th><th scope="col">Seguro futuro · gasto</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead>
          <tbody><tr v-for="item in rows" :key="getCreditId(item)">
            <td class="fin-name"><strong>{{ item.name ?? '—' }}</strong><small>{{ item.lender_name ?? '—' }}</small></td>
            <td><span class="fin-chip">{{ originLabel(item.origin_type) }}</span><small v-if="item.origin_type === 'legacy'">Corte: {{ dateLabel(item.cutoff_date) }}</small></td>
            <td>{{ methodLabel(item.method) }}</td><td>{{ item.currency ?? 'COP' }}</td><td>{{ cecoLabel(item) }}</td>
             <td class="fin-money"><span class="fin-chip">Saldo registrado · no pagos reales</span><br />{{ money(item.opening_balance) }}</td>
             <td>{{ dateLabel(item.first_due_date) }}</td>
             <td class="fin-money"><span class="fin-chip fin-chip-expense">Gasto</span><br />{{ money(item.totals?.interest) }}</td>
             <td class="fin-money"><span class="fin-chip fin-chip-expense">Gasto</span><br />{{ money(item.totals?.insurance) }}</td>
            <td><span class="fin-chip" :class="{ 'is-closed': item.status === 'closed' }">{{ item.status === 'closed' ? 'Cerrado' : 'Activo · Proyectado' }}</span><small v-if="materializationWarnings(item).length">Advertencia presupuestaria · {{ materializationWarnings(item).length }}</small></td>
             <td><div class="fin-row-actions"><button type="button" class="btn btn-secondary btn-sm" @click="openSchedule(item)">Ver calendario</button><button v-if="canEdit && item.status !== 'closed'" type="button" class="btn btn-secondary btn-sm" :disabled="openingEditId !== null || deletingCreditId !== null" @click="openEdit(item)">{{ String(openingEditId) === String(getCreditId(item)) ? 'Cargando…' : 'Editar' }}</button><button v-if="canEdit" type="button" class="btn btn-danger btn-sm" :disabled="deletingCreditId !== null" @click="deleteCredit(item)">{{ String(deletingCreditId) === String(getCreditId(item)) ? 'Eliminando…' : 'Eliminar definitivamente' }}</button></div></td>
          </tr></tbody>
        </table></div>
        <div class="fin-pagination"><button type="button" class="btn btn-secondary btn-sm" :disabled="page <= 1 || loading" @click="goPage(-1)">← Anterior</button><span aria-live="polite">Página {{ page }} de {{ pageCount }} · {{ total }} créditos</span><button type="button" class="btn btn-secondary btn-sm" :disabled="page >= pageCount || loading" @click="goPage(1)">Siguiente →</button></div>
      </template>
      <div v-else class="fin-empty"><h2>Aún no hay créditos de financiación registrados</h2><p>La financiación empresarial se administra aquí y no modifica los créditos asociados a facturas.</p><button v-if="canEdit" type="button" class="btn btn-primary btn-sm" @click="openCreate">+ Nuevo crédito</button></div>
    </section>

    <section class="fin-cashflow" aria-labelledby="fin-cashflow-title">
      <div class="fin-cashflow-heading"><div><h2 id="fin-cashflow-title">Flujo de caja · respuesta del backend</h2><p>Consulta global de liquidez. Se muestra el endpoint existente tal cual; no se suman calendarios, líneas presupuestarias ni componentes en frontend.</p></div></div>
      <div class="fin-cashflow-filters">
        <label class="fin-filter"><span>Desde *</span><input v-model="cashFlowRange.dateFrom" type="date" @input="invalidateCashFlow" /></label>
        <label class="fin-filter"><span>Hasta *</span><input v-model="cashFlowRange.dateTo" type="date" @input="invalidateCashFlow" /></label>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="cashFlowLoading" @click="loadCashFlow">{{ cashFlowLoading ? 'Consultando…' : 'Consultar flujo' }}</button>
      </div>
      <div v-if="cashFlowLoading" class="fin-loading" role="status" aria-live="polite">Consultando el flujo de caja en el backend…</div>
      <div v-else-if="cashFlowError" class="fin-error" role="alert" aria-live="polite"><span>{{ cashFlowError }}</span><button v-if="cashFlowRange.dateFrom && cashFlowRange.dateTo" type="button" class="btn btn-secondary btn-sm" @click="loadCashFlow">Reintentar</button></div>
      <template v-else-if="cashFlowData">
        <dl class="fin-cashflow-summary">
          <div><dt>Saldo inicial</dt><dd>{{ money(cashFlowData.summary?.starting_balance) }}</dd></div>
          <div><dt>Flujo neto</dt><dd>{{ money(cashFlowData.summary?.net_flow) }}</dd></div>
          <div><dt>Saldo final</dt><dd>{{ money(cashFlowData.summary?.ending_balance) }}</dd></div>
          <div><dt>Fuente de salidas informada por BE</dt><dd>{{ cashFlowData.meta?.outflow_source ?? '—' }}</dd></div>
        </dl>
        <div class="fin-table-scroll"><table aria-label="Flujo de caja mensual devuelto por el backend"><thead><tr><th scope="col">Período</th><th scope="col">Estado</th><th scope="col">Entradas</th><th scope="col">Salidas</th><th scope="col">Flujo neto</th><th scope="col">Saldo acumulado</th></tr></thead><tbody><tr v-for="(bucket, index) in cashFlowData.time_series ?? []" :key="`${bucket.period}-${index}`"><td>{{ dateLabel(bucket.period) }}</td><td>{{ bucket.status === 'actual' ? 'Real' : bucket.status === 'projected' ? 'Proyectado' : bucket.status ?? '—' }}</td><td>{{ money(bucket.inflows) }}</td><td>{{ money(bucket.outflows) }}</td><td>{{ money(bucket.net_flow) }}</td><td>{{ money(bucket.accumulated_balance) }}</td></tr></tbody></table></div>
        <ul v-if="cashFlowWarnings.length" class="fin-flow-warnings" aria-label="Advertencias de flujo de caja"><li v-for="(warning, index) in cashFlowWarnings" :key="index">{{ typeof warning === 'string' ? warning : warning.message ?? JSON.stringify(warning) }}</li></ul>
      </template>
    </section>

    <FinancingCreditFormModal :open="formOpen" :credit="formTarget" :cost-centers="costCenters" :can-edit="canEdit" @close="formOpen = false" @saved="fetchList" />
    <FinancingCreditScheduleModal :open="scheduleOpen" :credit="scheduleTarget" :cost-centers="costCenters" :can-edit="canEdit" @close="closeSchedule" @edit="editFromSchedule" @changed="onChanged" @deleted="onCreditDeleted" />
  </main>
</template>

<style scoped>
.fin-page{width:100%;max-width:1680px;margin:0 auto;padding:24px}.fin-breadcrumb{display:flex;gap:8px;align-items:center;margin:0 0 12px;font-size:.74rem;color:var(--color-text-secondary,#555)}.fin-breadcrumb a{color:var(--color-brand,#03658c);text-decoration:none}.fin-breadcrumb a:hover{text-decoration:underline}.fin-intro{max-width:1000px;margin:10px 0 20px;font-size:.84rem;line-height:1.55;color:var(--color-text-secondary,#555)}.fin-toolbar{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;margin-bottom:14px;padding:14px;border:1px solid var(--color-border,rgba(97,97,97,.15));border-radius:8px;background:var(--color-surface-card,#fff)}.fin-filter{display:flex;flex-direction:column;gap:4px;min-width:155px}.fin-filter span{font-size:.72rem;font-weight:600;color:var(--color-text-secondary,#555)}.fin-filter input,.fin-filter select{min-width:165px;padding:7px 9px;border:1px solid var(--color-border-strong,rgba(97,97,97,.3));border-radius:6px;background:var(--color-surface,#f7f7f7);color:var(--color-text-primary,#111);font-size:.8rem}.fin-actions{display:flex;gap:8px;margin-left:auto}.fin-table-zone{overflow:hidden;border:1px solid var(--color-border,rgba(97,97,97,.15));border-radius:8px;background:var(--color-surface-card,#fff)}.fin-table-scroll{overflow:auto}.fin-table-scroll table{min-width:1430px;width:100%;font-size:.75rem}.fin-table-scroll th,.fin-table-scroll td{padding:8px;vertical-align:middle}.fin-name{min-width:160px}.fin-name strong,.fin-name small,.fin-table-scroll td small{display:block}.fin-name small,.fin-table-scroll td small{margin-top:3px;color:var(--color-text-secondary,#666);font-size:.68rem}.fin-money{font-variant-numeric:tabular-nums;white-space:nowrap}.fin-chip{display:inline-block;padding:2px 7px;border:1px solid rgba(3,101,140,.4);border-radius:999px;background:rgba(3,101,140,.08);color:var(--color-brand,#03658c);font-size:.65rem;font-weight:700;white-space:nowrap}.fin-chip-expense{border-color:rgba(183,121,31,.5);background:rgba(183,121,31,.09);color:#805500}.fin-chip.is-closed{border-color:#8888;background:#8881;color:var(--color-text-secondary,#555)}.fin-row-actions{display:flex;gap:5px;flex-wrap:wrap}.fin-loading,.fin-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:36px 16px;text-align:center;color:var(--color-text-secondary,#666);font-size:.82rem}.fin-empty h2{margin:0;font-size:1rem;color:var(--color-text-primary,#111)}.fin-empty p{margin:0}.fin-spinner{width:14px;height:14px;border:2px solid #8884;border-top-color:var(--color-brand,#03658c);border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.fin-error{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin:12px 0;padding:11px 13px;border:1px solid #c5303055;border-left:4px solid #c53030;border-radius:8px;background:#c530300d;color:#9b2222;font-size:.8rem}.fin-pagination{display:flex;gap:12px;align-items:center;justify-content:center;padding:12px;border-top:1px solid var(--color-border,rgba(97,97,97,.15));font-size:.76rem;color:var(--color-text-secondary,#555)}@media(max-width:760px){.fin-page{padding:18px 12px}.fin-actions{margin-left:0}.fin-filter{flex:1}.fin-filter input,.fin-filter select{width:100%;min-width:0}.fin-pagination{flex-wrap:wrap}}
.fin-success{margin:0 0 12px;padding:10px 12px;border-left:4px solid #218838;border-radius:6px;background:rgba(33,136,56,.09);color:#176b2b;font-size:.82rem;line-height:1.5;overflow-wrap:anywhere}
:global(:root[data-theme='dark']) .fin-chip-expense{color:#ffd27a}:global(:root[data-theme='dark']) .fin-error{color:#ffb3b3}:global(:root[data-theme='dark']) .fin-success{color:#9ce1ac}
.fin-cashflow{display:flex;flex-direction:column;gap:12px;margin-top:18px;padding:14px;border:1px solid var(--color-border,rgba(97,97,97,.15));border-radius:8px;background:var(--color-surface-card,#fff)}.fin-cashflow-heading h2{margin:0;font-size:.95rem}.fin-cashflow-heading p{max-width:900px;margin:5px 0 0;font-size:.76rem;line-height:1.5;color:var(--color-text-secondary,#555)}.fin-cashflow-filters{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}.fin-cashflow-filters .fin-filter{min-width:180px}.fin-cashflow-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:0}.fin-cashflow-summary div{padding:9px;border-radius:6px;background:var(--color-surface,#f7f7f7)}.fin-cashflow-summary dt{font-size:.69rem;color:var(--color-text-secondary,#555)}.fin-cashflow-summary dd{margin:4px 0 0;font-size:.82rem;font-weight:700}.fin-flow-warnings{margin:0;padding:10px 12px 10px 30px;border-left:4px solid #b7791f;border-radius:6px;background:rgba(183,121,31,.08);font-size:.76rem;line-height:1.5;color:var(--color-text-primary,#111)}@media(max-width:760px){.fin-cashflow-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.fin-cashflow-filters .fin-filter{flex:1}}
</style>
