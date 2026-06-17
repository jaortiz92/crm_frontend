<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { queryService } from '@/services/queryService'
import { alertService } from '@/services/alertService'

const router = useRouter()
const isLoading = ref(false)
const orders = ref([])
const searchQuery = ref('')
const selectedLine = ref('')
const limitDate = ref('')
const startDate = ref('')

const titleHeader = 'Órdenes sin Detalles'

const fetchOrdersWithoutDetails = async () => {
  isLoading.value = true
  try {
    const response = await queryService.getOrdersWithoutDetails()
    orders.value = response.data
  } catch (err) {
    alertService.generalError(
      err.response?.data?.message?.error ||
        err.response?.data?.detail ||
        'Error al obtener las órdenes sin detalles.'
    )
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  fetchOrdersWithoutDetails()
})

const uniqueLines = computed(() => {
  const lines = orders.value.map((o) => o.line_name).filter(Boolean)
  return [...new Set(lines)].sort()
})

const filteredOrders = computed(() => {
  let result = orders.value

  if (selectedLine.value) {
    result = result.filter((o) => o.line_name === selectedLine.value)
  }

  if (startDate.value) {
    result = result.filter((o) => {
      if (!o.delivery_date) return false
      return o.delivery_date >= startDate.value
    })
  }

  if (limitDate.value) {
    result = result.filter((o) => {
      if (!o.delivery_date) return false
      return o.delivery_date <= limitDate.value
    })
  }

  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase().trim()
    result = result.filter((o) => {
      const idStr = String(o.id_order).toLowerCase()
      const customerStr = (o.company_name || '').toLowerCase()
      const sellerStr = (o.seller_name || '').toLowerCase()
      const collectionStr = (o.collection_name || '').toLowerCase()

      return (
        idStr.includes(query) ||
        customerStr.includes(query) ||
        sellerStr.includes(query) ||
        collectionStr.includes(query)
      )
    })
  }

  return result
})

const totalOrders = computed(() => filteredOrders.value.length)

const totalAmount = computed(() => {
  return filteredOrders.value.reduce((sum, order) => sum + (order.total_with_tax || 0), 0)
})

const uniqueCustomersCount = computed(() => {
  const customers = filteredOrders.value.map((order) => order.company_name)
  return new Set(customers).size
})

const clearFilters = () => {
  searchQuery.value = ''
  selectedLine.value = ''
  startDate.value = ''
  limitDate.value = ''
}

const hasActiveFilters = computed(() => {
  return (
    searchQuery.value.trim() !== '' ||
    selectedLine.value !== '' ||
    startDate.value !== '' ||
    limitDate.value !== ''
  )
})

const formatCurrency = (value) => {
  if (value === null || value === undefined) return '$0'
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0
  }).format(value)
}

const formatDate = (dateString) => {
  if (!dateString) return '—'
  const date = new Date(dateString)
  const userTimezoneOffset = date.getTimezoneOffset() * 60000
  const localDate = new Date(date.getTime() + userTimezoneOffset)
  return localDate.toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

const exportToCSV = () => {
  if (orders.value.length === 0) return

  let csvContent = '\uFEFF'
  csvContent += 'ID Orden,Fecha Orden,Fecha Entrega,Cliente,Vendedor,Colección,Cantidades,Total con IVA\n'

  orders.value.forEach((o) => {
    const id = o.id_order
    const dateOrder = o.date_order || ''
    const deliveryDate = o.delivery_date || ''
    const company = o.company_name ? `"${o.company_name.replace(/"/g, '""')}"` : ''
    const seller = o.seller_name ? `"${o.seller_name.replace(/"/g, '""')}"` : ''
    const collection = o.collection_name ? `"${o.collection_name.replace(/"/g, '""')}"` : ''
    const quantities = o.total_quantities || 0
    const total = o.total_with_tax || 0

    csvContent += `${id},${dateOrder},${deliveryDate},${company},${seller},${collection},${quantities},${total}\n`
  })

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', `ordenes_sin_detalles_${new Date().toISOString().slice(0, 10)}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

const viewOrderDetail = (idOrder) => {
  router.push({ name: 'OrderDetail', params: { id: idOrder } })
}

const viewCustomerTripDetail = (idTrip) => {
  router.push({ name: 'CustomerTripDetail', params: { id: idTrip } })
}

const goBack = () => {
  router.push({ name: 'Queries' })
}
</script>

<template>
  <div>
    <div v-if="isLoading" class="global-loading-overlay">
      <p>Cargando órdenes sin detalles, por favor espere...</p>
      <div class="spinner"></div>
    </div>

    <div class="query-container">
      <div class="header-section">
        <button @click="goBack" class="back-btn">← Volver</button>
        <h2>{{ titleHeader }}</h2>
      </div>

      <div class="stats-grid">
        <div class="stat-card total">
          <div class="stat-icon">📦</div>
          <div class="stat-info">
            <span class="stat-value">{{ totalOrders }}</span>
            <span class="stat-label">Órdenes sin Detalles</span>
          </div>
        </div>

        <div class="stat-card value">
          <div class="stat-icon">💰</div>
          <div class="stat-info">
            <span class="stat-value">{{ formatCurrency(totalAmount) }}</span>
            <span class="stat-label">Valor Total Estimado</span>
          </div>
        </div>

        <div class="stat-card clients">
          <div class="stat-icon">🏢</div>
          <div class="stat-info">
            <span class="stat-value">{{ uniqueCustomersCount }}</span>
            <span class="stat-label">Clientes Afectados</span>
          </div>
        </div>
      </div>

      <div class="filters-card">
        <div class="filters-grid">
          <div class="filter-group search-box">
            <label for="search">Búsqueda General</label>
            <div class="input-wrapper">
              <span class="search-icon">🔍</span>
              <input
                id="search"
                v-model="searchQuery"
                type="text"
                placeholder="Buscar por ID, cliente, vendedor o colección..."
                class="search-input"
              />
            </div>
          </div>

          <div class="filter-group">
            <label for="line-select">Filtrar por Línea</label>
            <select id="line-select" v-model="selectedLine" class="filter-select">
              <option value="">Todas las líneas</option>
              <option v-for="line in uniqueLines" :key="line" :value="line">
                {{ line }}
              </option>
            </select>
          </div>

          <div class="filter-group">
            <label for="date-start">Desde la Fecha (Fecha Entrega)</label>
            <input id="date-start" v-model="startDate" type="date" class="filter-date" />
          </div>

          <div class="filter-group">
            <label for="date-limit">Hasta la Fecha (Fecha Entrega)</label>
            <input id="date-limit" v-model="limitDate" type="date" class="filter-date" />
          </div>
        </div>

        <div class="filter-actions">
          <button @click="clearFilters" class="clear-filters-btn" :disabled="!hasActiveFilters">
            🧹 Limpiar Filtros
          </button>
          <button @click="exportToCSV" :disabled="filteredOrders.length === 0" class="export-btn">
            📥 Exportar a CSV
          </button>
        </div>
      </div>

      <div class="table-container">
        <div v-if="filteredOrders.length === 0" class="no-results">
          No se encontraron órdenes sin detalles o ningún registro coincide con la búsqueda.
        </div>
        <table v-else class="results-table">
          <thead>
            <tr>
              <th>ID Orden</th>
              <th>Fecha Orden</th>
              <th>Fecha Entrega</th>
              <th>Cliente</th>
              <th>Vendedor</th>
              <th>Linea</th>
              <th>Colección</th>
              <th class="num-cell">Cantidades</th>
              <th class="num-cell">Total con IVA</th>
              <th class="actions-cell">Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="order in filteredOrders" :key="order.id_order">
              <td class="font-mono">
                <a @click.prevent="viewOrderDetail(order.id_order)" class="link-btn">
                  #{{ order.id_order }}
                </a>
              </td>
              <td>{{ formatDate(order.date_order) }}</td>
              <td>{{ formatDate(order.delivery_date) }}</td>
              <td class="text-semibold">{{ order.company_name }}</td>
              <td>{{ order.seller_name }}</td>
              <td>{{ order.line_name }}</td>
              <td>{{ order.collection_name }}</td>
              <td class="num-cell font-mono">{{ order.total_quantities }}</td>
              <td class="num-cell font-mono text-semibold text-primary">
                {{ formatCurrency(order.total_with_tax) }}
              </td>
              <td class="actions-cell">
                <div class="action-buttons">
                  <button
                    @click="viewOrderDetail(order.id_order)"
                    class="btn-detail"
                    title="Ver Pedido"
                  >
                    👁️ Pedido
                  </button>
                  <button
                    @click="viewCustomerTripDetail(order.id_customer_trip)"
                    class="btn-trip"
                    title="Ver Viaje"
                  >
                    ✈️ Viaje
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.query-container {
  max-width: 1200px;
  margin: 30px auto;
  padding: 0 20px;
}

.header-section {
  display: flex;
  align-items: center;
  margin-bottom: 24px;
  position: relative;
}

.back-btn {
  background-color: var(--background-light);
  color: var(--text-gray);
  padding: 8px 16px;
  font-size: 0.9rem;
  border-radius: 6px;
  position: absolute;
  left: 0;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

.back-btn:hover {
  background-color: var(--light-color-opposite-two);
  color: var(--text-white);
}

h2 {
  flex-grow: 1;
  text-align: center;
  margin: 0;
  font-size: 2rem;
  font-weight: 700;
  color: var(--dark-color-opposite-two);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.stat-card {
  background-color: var(--background-white);
  border: 1px solid var(--light-border);
  border-radius: 12px;
  padding: 20px 24px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 4px 16px rgba(0, 16, 62, 0.04);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 16, 62, 0.08);
}

.stat-icon {
  font-size: 2.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  background-color: var(--background-light);
  border-radius: 50px;
}

.stat-info {
  display: flex;
  flex-direction: column;
  text-align: left;
}

.stat-value {
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--text-black);
  line-height: 1.2;
}

.stat-label {
  font-size: 0.85rem;
  color: var(--text-gray);
  margin-top: 4px;
}

.filters-card {
  background-color: var(--background-white);
  border: 1px solid var(--light-border);
  border-radius: 12px;
  padding: 20px 24px;
  box-shadow: 0 4px 16px rgba(0, 16, 62, 0.04);
  margin-bottom: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.filters-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-end;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  text-align: left;
}

.filter-group.search-box {
  flex: 2 1 300px;
}

.filter-group:not(.search-box) {
  flex: 1 1 180px;
}

.filter-group label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-gray);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 2px;
}

.input-wrapper {
  position: relative;
  width: 100%;
}

.search-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-gray);
  font-size: 1.1rem;
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 10px 16px 10px 42px;
  font-size: 0.95rem;
  border: 1.5px solid var(--gray-border);
  border-radius: 8px;
  background-color: var(--background-white);
  color: var(--text-black);
  outline: none;
  transition: all 0.2s ease;
  height: 42px;
  box-sizing: border-box;
}

.search-input:focus,
.filter-select:focus,
.filter-date:focus {
  border-color: var(--dark-color);
  box-shadow: 0 0 0 3px rgba(10, 32, 152, 0.1);
}

.filter-select,
.filter-date {
  width: 100%;
  padding: 10px 14px;
  font-size: 0.95rem;
  border: 1.5px solid var(--gray-border);
  border-radius: 8px;
  background-color: var(--background-white);
  color: var(--text-black);
  outline: none;
  transition: all 0.2s ease;
  height: 42px;
  box-sizing: border-box;
}

.filter-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  border-top: 1px solid var(--light-border);
  padding-top: 16px;
  margin-top: 4px;
}

.clear-filters-btn {
  background-color: var(--background-light);
  color: var(--text-gray);
  border: 1.5px solid var(--gray-border);
  padding: 0 20px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s ease;
  height: 42px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
}

.clear-filters-btn:hover:not(:disabled) {
  background-color: var(--light-color-opposite-two);
  color: var(--text-white);
  border-color: var(--light-color-opposite-two);
}

.clear-filters-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.export-btn {
  background-color: var(--background-white);
  color: var(--dark-color);
  border: 1.5px solid var(--dark-color);
  padding: 0 20px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s ease;
  height: 42px;
  box-sizing: border-box;
}

.export-btn:hover:not(:disabled) {
  background-color: var(--dark-color);
  color: var(--text-white);
}

.export-btn:disabled {
  border-color: var(--gray-border);
  color: var(--text-gray);
  cursor: not-allowed;
}

.table-container {
  background-color: var(--background-white);
  border: 1px solid var(--light-border);
  border-radius: 12px;
  overflow-x: auto;
  box-shadow: 0 4px 16px rgba(0, 16, 62, 0.03);
}

.no-results {
  padding: 40px;
  text-align: center;
  color: var(--text-gray);
  font-size: 1.1rem;
}

.results-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.95rem;
}

.results-table th {
  background-color: var(--background-light);
  color: var(--text-black);
  font-weight: 600;
  padding: 14px 18px;
  border-bottom: 1.5px solid var(--light-border);
  text-transform: uppercase;
  font-size: 0.8rem;
  letter-spacing: 0.5px;
}

.results-table td {
  padding: 14px 18px;
  border-bottom: 1px solid var(--light-border);
  color: var(--text-black);
}

.results-table tr:last-child td {
  border-bottom: none;
}

.results-table tr:hover td {
  background-color: rgba(244, 246, 255, 0.5);
}

.font-mono {
  font-family: monospace;
  font-size: 0.95rem;
}

.text-semibold {
  font-weight: 600;
}

.text-primary {
  color: var(--dark-color);
}

.num-cell {
  text-align: right;
}

.actions-cell {
  text-align: center;
  width: 200px;
}

.action-buttons {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.btn-detail,
.btn-trip {
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  gap: 4px;
}

.btn-detail {
  background-color: rgba(10, 32, 152, 0.08);
  color: var(--dark-color);
}

.btn-detail:hover {
  background-color: var(--dark-color);
  color: var(--text-white);
}

.btn-trip {
  background-color: rgba(212, 163, 89, 0.12);
  color: #a07810;
}

.btn-trip:hover {
  background-color: #a07810;
  color: var(--text-white);
}

.link-btn {
  color: var(--dark-color);
  text-decoration: underline;
  cursor: pointer;
  font-weight: 600;
}

.link-btn:hover {
  color: var(--light-color);
}

.global-loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(255, 255, 255, 0.8);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 5px solid var(--background-light);
  border-top-color: var(--dark-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-top: 16px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
