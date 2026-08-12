<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { queryService } from '@/services/queryService'
import { alertService } from '@/services/alertService'

const router = useRouter()
const route = useRoute()
const isLoading = ref(false)
const trips = ref([])
const searchQuery = ref('')
const selectedLine = ref('')
const selectedCollection = ref('')

const isClosedTrip = computed(() => route.params.isClosed === 'true')

const titleHeader = computed(() => {
  return isClosedTrip.value
    ? 'Viajes sin Órdenes (Viajes Cerrados)'
    : 'Viajes sin Órdenes (Viajes Activos)'
})

const fetchCustomerTripsWithoutOrders = async () => {
  isLoading.value = true
  try {
    const response = await queryService.getCustomerTripsWithoutOrders(isClosedTrip.value)
    trips.value = response.data
  } catch (err) {
    alertService.generalError(
      err.response?.data?.message?.error ||
        err.response?.data?.detail ||
        'Error al obtener los viajes sin órdenes.'
    )
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  fetchCustomerTripsWithoutOrders()
})

const uniqueLines = computed(() => {
  const lines = trips.value.map((t) => t.line_name).filter(Boolean)
  return [...new Set(lines)].sort()
})

const uniqueCollections = computed(() => {
  const collections = trips.value.map((t) => t.collection_name).filter(Boolean)
  return [...new Set(collections)].sort()
})

const filteredTrips = computed(() => {
  let result = trips.value

  if (selectedLine.value) {
    result = result.filter((t) => t.line_name === selectedLine.value)
  }

  if (selectedCollection.value) {
    result = result.filter((t) => t.collection_name === selectedCollection.value)
  }

  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase().trim()
    result = result.filter((t) => {
      const idStr = String(t.id_customer_trip).toLowerCase()
      const customerStr = (t.company_name || '').toLowerCase()
      const sellerStr = (t.seller_name || '').toLowerCase()
      const collectionStr = (t.collection_name || '').toLowerCase()

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

const totalTrips = computed(() => filteredTrips.value.length)

const uniqueCustomersCount = computed(() => {
  const customers = filteredTrips.value.map((trip) => trip.company_name)
  return new Set(customers).size
})

const totalBudget = computed(() => {
  return filteredTrips.value.reduce((sum, trip) => sum + (trip.budget || 0), 0)
})

const clearFilters = () => {
  searchQuery.value = ''
  selectedLine.value = ''
  selectedCollection.value = ''
}

const hasActiveFilters = computed(() => {
  return (
    searchQuery.value.trim() !== '' || selectedLine.value !== '' || selectedCollection.value !== ''
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

const exportToCSV = () => {
  if (trips.value.length === 0) return

  let csvContent = '\uFEFF'
  csvContent +=
    'ID Viaje,Cliente,Vendedor,Colección,Línea,Estado,Presupuesto,Cantidades Presupuesto\n'

  trips.value.forEach((t) => {
    const id = t.id_customer_trip
    const company = t.company_name ? `"${t.company_name.replace(/"/g, '""')}"` : ''
    const seller = t.seller_name ? `"${t.seller_name.replace(/"/g, '""')}"` : ''
    const collection = t.collection_name ? `"${t.collection_name.replace(/"/g, '""')}"` : ''
    const line = t.line_name ? `"${t.line_name.replace(/"/g, '""')}"` : ''
    const closed = t.closed ? 'Cerrado' : 'Abierto'
    const budget = t.budget || 0
    const budgetQuantities = t.budget_quantities || 0

    csvContent += `${id},${company},${seller},${collection},${line},${closed},${budget},${budgetQuantities}\n`
  })

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', `viajes_sin_ordenes_${new Date().toISOString().slice(0, 10)}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
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
      <p>Cargando viajes sin órdenes, por favor espere...</p>
      <div class="spinner"></div>
    </div>

    <div class="query-container">
      <div class="header-section">
        <button @click="goBack" class="back-btn">← Volver</button>
        <h2>{{ titleHeader }}</h2>
      </div>

      <!-- Summary Metrics Dashboard -->
      <div class="stats-grid">
        <div class="stat-card total">
          <div class="stat-icon">✈️</div>
          <div class="stat-info">
            <span class="stat-value">{{ totalTrips }}</span>
            <span class="stat-label">Viajes sin Órdenes</span>
          </div>
        </div>

        <div class="stat-card clients">
          <div class="stat-icon">🏢</div>
          <div class="stat-info">
            <span class="stat-value">{{ uniqueCustomersCount }}</span>
            <span class="stat-label">Clientes Afectados</span>
          </div>
        </div>

        <div class="stat-card value">
          <div class="stat-icon">💰</div>
          <div class="stat-info">
            <span class="stat-value">{{ formatCurrency(totalBudget) }}</span>
            <span class="stat-label">Presupuesto Total</span>
          </div>
        </div>
      </div>

      <!-- Action Panel & Filters -->
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
            <label for="collection-select">Filtrar por Colección</label>
            <select id="collection-select" v-model="selectedCollection" class="filter-select">
              <option value="">Todas las colecciones</option>
              <option v-for="col in uniqueCollections" :key="col" :value="col">
                {{ col }}
              </option>
            </select>
          </div>
        </div>

        <div class="filter-actions">
          <button @click="clearFilters" class="clear-filters-btn" :disabled="!hasActiveFilters">
            🧹 Limpiar Filtros
          </button>
          <button @click="exportToCSV" :disabled="filteredTrips.length === 0" class="export-btn">
            📥 Exportar a CSV
          </button>
        </div>
      </div>

      <!-- Results Table -->
      <div class="table-container">
        <div v-if="filteredTrips.length === 0" class="no-results">
          No se encontraron viajes sin órdenes o ningún registro coincide con la búsqueda.
        </div>
        <table v-else class="results-table">
          <thead>
            <tr>
              <th>ID Viaje</th>
              <th>Cliente</th>
              <th>Vendedor</th>
              <th>Línea</th>
              <th>Colección</th>
              <th>Estado</th>
              <th class="num-cell">Presupuesto</th>
              <th class="num-cell">Cant. Presupuesto</th>
              <th class="actions-cell">Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="trip in filteredTrips" :key="trip.id_customer_trip">
              <td class="font-mono">
                <a @click.prevent="viewCustomerTripDetail(trip.id_customer_trip)" class="link-btn">
                  #{{ trip.id_customer_trip }}
                </a>
              </td>
              <td class="text-semibold">{{ trip.company_name }}</td>
              <td>{{ trip.seller_name }}</td>
              <td>{{ trip.line_name }}</td>
              <td>{{ trip.collection_name }}</td>
              <td>
                <span :class="trip.closed ? 'badge-closed' : 'badge-open'">
                  {{ trip.closed ? 'Cerrado' : 'Abierto' }}
                </span>
              </td>
              <td class="num-cell font-mono text-semibold text-primary">
                {{ formatCurrency(trip.budget) }}
              </td>
              <td class="num-cell font-mono">{{ trip.budget_quantities }}</td>
              <td class="actions-cell">
                <button
                  @click="viewCustomerTripDetail(trip.id_customer_trip)"
                  class="btn-trip"
                  title="Ver Viaje"
                >
                  ✈️ Ver Viaje
                </button>
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
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
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
.filter-select:focus {
  border-color: var(--dark-color);
  box-shadow: 0 0 0 3px rgba(10, 32, 152, 0.1);
}

.filter-select {
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
  width: 150px;
}

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
  margin: 0 auto;
  background-color: rgba(212, 163, 89, 0.12);
  color: #a07810;
}

.btn-trip:hover {
  background-color: #a07810;
  color: var(--text-white);
}

.badge-closed {
  background-color: rgba(220, 53, 69, 0.1);
  color: #dc3545;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 600;
}

.badge-open {
  background-color: rgba(40, 167, 69, 0.1);
  color: #28a745;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 600;
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
