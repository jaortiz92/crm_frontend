<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { queryService } from '@/services/queryService'
import { alertService } from '@/services/alertService'

const router = useRouter()
const file = ref(null)
const isLoading = ref(false)
const results = ref([])
const hasQueried = ref(false)
const searchQuery = ref('')

const handleFileUpload = (event) => {
  file.value = event.target.files[0]

  const validTypes = ['xlsx', 'xlsm']
  const extension = file.value.name.split('.').pop().toLowerCase()

  if (!validTypes.includes(extension)) {
    alertService.generalError('Solo se permiten archivos xlsx o xlsm')
    file.value = null
  }
}

const uploadFile = async () => {
  if (!file.value) {
    alertService.generalError('Debe seleccionar un archivo.')
    return
  }

  isLoading.value = true
  hasQueried.value = false
  results.value = []

  try {
    const formData = new FormData()
    formData.append('file', file.value)

    const response = await queryService.validateCustomers(formData)
    results.value = response.data
    hasQueried.value = true
    alertService.generalSucces('Archivo validado correctamente.')
  } catch (err) {
    alertService.generalError(
      err.response?.data?.message?.error ||
        err.response?.data?.detail ||
        'Error al validar el archivo.'
    )
  } finally {
    isLoading.value = false
  }
}

const clearResults = () => {
  file.value = null
  results.value = []
  hasQueried.value = false
  searchQuery.value = ''
  // Clear file input
  const fileInput = document.getElementById('queryFile')
  if (fileInput) fileInput.value = ''
}

// Summary Metrics
const totalCount = computed(() => results.value.length)
const foundCount = computed(() => results.value.filter((r) => r.exists).length)
const notFoundCount = computed(() => results.value.filter((r) => !r.exists).length)

const foundPercent = computed(() => {
  if (totalCount.value === 0) return 0
  return Math.round((foundCount.value / totalCount.value) * 100)
})

// Real-time Search / Filtered Results
const filteredResults = computed(() => {
  if (!searchQuery.value.trim()) return results.value

  const query = searchQuery.value.toLowerCase().trim()
  return results.value.filter((r) => {
    const docStr = formatDoc(r.document).toLowerCase()
    const nameStr = (r.company_name || '').toLowerCase()
    const sellerStr = (r.seller || '').toLowerCase()
    const emailStr = (r.email || '').toLowerCase()
    return (
      docStr.includes(query) ||
      nameStr.includes(query) ||
      sellerStr.includes(query) ||
      emailStr.includes(query)
    )
  })
})

const formatDoc = (doc) => {
  if (doc === null || doc === undefined) return '—'
  return Math.floor(doc).toString()
}

// CSV Export
const exportToCSV = () => {
  if (results.value.length === 0) return

  let csvContent = '\uFEFF' // UTF-8 BOM
  csvContent += 'Documento,Existe en BD,Compañía,Correo,Teléfono,Vendedor,Activo\n'

  results.value.forEach((r) => {
    const doc = formatDoc(r.document)
    const exists = r.exists ? 'SÍ' : 'NO'
    const name = r.company_name ? `"${r.company_name.replace(/"/g, '""')}"` : ''
    const email = r.email ? `"${r.email}"` : ''
    const phone = r.phone ? `"${r.phone}"` : ''
    const seller = r.seller ? `"${r.seller.replace(/"/g, '""')}"` : ''
    const active = r.active !== null ? (r.active ? 'ACTIVO' : 'INACTIVO') : ''

    csvContent += `${doc},${exists},${name},${email},${phone},${seller},${active}\n`
  })

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', `validacion_clientes_${new Date().toISOString().slice(0, 10)}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

const goBack = () => {
  router.push({ name: 'Queries' })
}
</script>

<template>
  <div v-if="isLoading" class="global-loading-overlay">
    <p>Validando documentos, por favor espere...</p>
    <div class="spinner"></div>
  </div>

  <div class="validator-container">
    <div class="header-section">
      <button @click="goBack" class="back-btn">← Volver</button>
      <h2>Validador de Clientes</h2>
    </div>

    <!-- Upload Box -->
    <div class="upload-card">
      <p class="description">
        Suba un archivo Excel (.xlsx o .xlsm). Buscaremos automáticamente la columna de documento y
        validaremos si los clientes ya están registrados en el CRM.
      </p>
      <div class="upload-controls">
        <input
          type="file"
          id="queryFile"
          @change="handleFileUpload"
          accept=".xlsx,.xlsm"
          class="file-input"
          required
        />
        <div class="btn-group">
          <button @click="uploadFile" :disabled="isLoading || !file" class="submit-btn">
            Validar Clientes
          </button>
          <button v-if="hasQueried" @click="clearResults" class="clear-btn">Limpiar</button>
        </div>
      </div>
    </div>

    <!-- Results Dashboard -->
    <div v-if="hasQueried" class="results-dashboard">
      <!-- Stats Cards -->
      <div class="stats-grid">
        <div class="stat-card total">
          <div class="stat-icon">📊</div>
          <div class="stat-info">
            <span class="stat-value">{{ totalCount }}</span>
            <span class="stat-label">Total Validados</span>
          </div>
        </div>

        <div class="stat-card found">
          <div class="stat-icon">✅</div>
          <div class="stat-info">
            <span class="stat-value">{{ foundCount }}</span>
            <span class="stat-label">Encontrados ({{ foundPercent }}%)</span>
          </div>
        </div>

        <div class="stat-card not-found">
          <div class="stat-icon">❌</div>
          <div class="stat-info">
            <span class="stat-value">{{ notFoundCount }}</span>
            <span class="stat-label">No Registrados</span>
          </div>
        </div>
      </div>

      <!-- Action Panel & Search -->
      <div class="action-panel">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Buscar por documento, compañía, vendedor o correo..."
            class="search-input"
          />
        </div>
        <button @click="exportToCSV" class="export-btn">📥 Exportar a CSV</button>
      </div>

      <!-- Table Section -->
      <div class="table-container">
        <div v-if="filteredResults.length === 0" class="no-results">
          No se encontraron registros que coincidan con la búsqueda.
        </div>
        <table v-else class="results-table">
          <thead>
            <tr>
              <th>Documento</th>
              <th>Estado</th>
              <th>Compañía</th>
              <th>Vendedor</th>
              <th>Correo</th>
              <th>Teléfono</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="res in filteredResults"
              :key="res.document"
              :class="{ 'row-exists': res.exists, 'row-absent': !res.exists }"
            >
              <td class="doc-cell font-mono">{{ formatDoc(res.document) }}</td>
              <td>
                <span :class="['status-badge', res.exists ? 'badge-exists' : 'badge-absent']">
                  {{ res.exists ? 'Registrado' : 'No Encontrado' }}
                </span>
              </td>
              <td>{{ res.company_name || '—' }}</td>
              <td>{{ res.seller || '—' }}</td>
              <td>{{ res.email || '—' }}</td>
              <td>{{ res.phone || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.validator-container {
  max-width: 1100px;
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

.upload-card {
  background-color: var(--background-white);
  border: 1px solid var(--light-border);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 4px 16px rgba(0, 16, 62, 0.05);
  margin-bottom: 30px;
}

.description {
  color: var(--text-gray);
  font-size: 1rem;
  line-height: 1.5;
  margin-bottom: 20px;
  text-align: left;
}

.upload-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
}

.file-input {
  flex-grow: 1;
  max-width: 100%;
  padding: 10px;
  background-color: var(--background-light);
  border: 2px dashed var(--gray-border);
  border-radius: 8px;
  cursor: pointer;
  margin: 0;
}

.btn-group {
  display: flex;
  gap: 10px;
}

.submit-btn {
  background: linear-gradient(135deg, var(--dark-color) 0%, var(--dark-color-opposite-two) 100%);
  box-shadow: 0 4px 12px rgba(10, 32, 152, 0.2);
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  border: none;
}

.submit-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, var(--light-color) 0%, var(--light-color-opposite-two) 100%);
  transform: translateY(-1px);
}

.submit-btn:disabled {
  background: var(--background-light);
  color: var(--text-gray);
  cursor: not-allowed;
  box-shadow: none;
}

.clear-btn {
  background-color: var(--red-color);
  padding: 12px 20px;
  border-radius: 8px;
  font-weight: 600;
  border: none;
}

.clear-btn:hover {
  background-color: #e03232;
}

/* Stats Cards */
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
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
}

.stat-icon {
  font-size: 2.5rem;
  background-color: var(--background-light);
  width: 60px;
  height: 60px;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 50%;
}

.stat-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.stat-value {
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--text-black);
}

.stat-label {
  color: var(--text-gray);
  font-size: 0.9rem;
}

.stat-card.found .stat-icon {
  background-color: rgba(73, 154, 103, 0.15);
}
.stat-card.found .stat-value {
  color: var(--dark-color-opposite-one);
}

.stat-card.not-found .stat-icon {
  background-color: rgba(194, 26, 26, 0.15);
}
.stat-card.not-found .stat-value {
  color: var(--red-color);
}

/* Action Panel */
.action-panel {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.search-box {
  display: flex;
  align-items: center;
  background-color: var(--background-white);
  border: 1px solid var(--gray-border);
  border-radius: 8px;
  padding: 8px 12px;
  flex-grow: 1;
  max-width: 500px;
}

.search-icon {
  margin-right: 8px;
}

.search-input {
  border: none;
  padding: 0;
  margin: 0;
  max-width: 100%;
  font-size: 0.95rem;
  background: transparent;
  color: var(--text-black);
}

.search-input:focus {
  outline: none;
}

.export-btn {
  background-color: var(--dark-color);
  padding: 10px 20px;
  border-radius: 8px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
}

.export-btn:hover {
  background-color: var(--light-color);
}

/* Table */
.table-container {
  background-color: var(--background-white);
  border: 1px solid var(--light-border);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0, 16, 62, 0.05);
}

.no-results {
  padding: 30px;
  text-align: center;
  color: var(--text-gray);
  font-style: italic;
}

.results-table {
  border: none;
}

.results-table th {
  background-color: var(--dark-color-opposite-two);
  text-align: left;
  padding: 14px 18px;
}

.results-table td {
  padding: 12px 18px;
  text-align: left;
  border-bottom: 1px solid var(--light-border);
}

.results-table tbody tr:last-child td {
  border-bottom: none;
}

.font-mono {
  font-family: 'Courier New', Courier, monospace;
  font-weight: bold;
}

/* Row Styling */
.row-exists {
  background-color: rgba(73, 154, 103, 0.02) !important;
}

.row-exists:hover {
  background-color: rgba(73, 154, 103, 0.08) !important;
}

.row-absent {
  background-color: rgba(194, 26, 26, 0.02) !important;
}

.row-absent:hover {
  background-color: rgba(194, 26, 26, 0.08) !important;
}

/* Badges */
.status-badge {
  display: inline-block;
  padding: 4px 10px;
  font-size: 0.8rem;
  font-weight: 600;
  border-radius: 20px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.badge-exists {
  background-color: rgba(73, 154, 103, 0.15);
  color: var(--dark-color-opposite-one);
  border: 1px solid var(--dark-color-opposite-one);
}

.badge-absent {
  background-color: rgba(194, 26, 26, 0.15);
  color: var(--red-color);
  border: 1px solid var(--red-color);
}
</style>
