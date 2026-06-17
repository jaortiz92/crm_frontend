<script setup>
import { ref } from 'vue'
import { bulkUploadService } from '@/services/bulkUploadService'
import { alertService } from '@/services/alertService'

const file = ref(null)
const uploading = ref(false)
const isLoading = ref(false)
const results = ref(null)

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
  uploading.value = true
  results.value = null

  try {
    const formData = new FormData()
    formData.append('details', file.value)

    const response = await bulkUploadService.UploadInvoiceDetails(formData)

    results.value = response.data.summary
    alertService.generalSucces('Carga masiva completada.')
    file.value = null
  } catch (err) {
    alertService.generalError(
      err.response?.data?.message?.error ||
        err.response?.data?.detail ||
        'Error al subir el archivo.'
    )
  } finally {
    uploading.value = false
    isLoading.value = false
  }
}
</script>

<template>
  <div>
    <div v-if="isLoading" class="global-loading-overlay">
      <p>Procesando, por favor espere...</p>
      <div class="spinner"></div>
    </div>

    <div class="form-upload-customers">
      <h2>Carga Masiva - <strong>Detalle de Facturas</strong></h2>

      <input type="file" id="document" @change="handleFileUpload" accept=".xlsx,.xlsm" required />
      <div>
        <button @click="uploadFile" :disabled="uploading || !file">Subir Archivo</button>
      </div>

      <div v-if="results" class="results-container">
        <h3>Resultados del Procesamiento</h3>
        <div class="summary-grid">
          <div class="summary-item">
            <span>Total procesados:</span>
            <strong>{{ results.total_processed }}</strong>
          </div>
          <div class="summary-item">
            <span>Exitosos:</span>
            <strong class="success">{{ results.success.length }}</strong>
          </div>
          <div v-if="results.manual_load.length > 0" class="summary-item">
            <span>Para cargue manual:</span>
            <strong class="error">{{ results.manual_load.length }}</strong>
          </div>
          <div class="summary-item">
            <span>Errores:</span>
            <strong class="error">{{ results.failed.length }}</strong>
          </div>
        </div>

        <div v-if="results.manual_load && results.manual_load.length > 0" class="errors-list">
          <h4>Errores para cargue manual:</h4>
          <ul>
            <li v-for="(error, index) in results.manual_load" :key="index">
              {{ error }}
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.form-upload-customers {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
  border: 1px solid var(--gray-border);
  border-radius: 8px;
  background-color: var(--background-light);
  box-shadow: 0 4px 8px var(--shadow);
}

.results-container {
  margin-top: 2rem;
  padding-top: 1rem;
  border-top: 2px solid var(--gray-border);
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-bottom: 1rem;
  text-align: center;
}

.summary-item {
  display: flex;
  flex-direction: column;
  padding: 10px;
  background: var(--background-white);
  border-radius: 4px;
  border: 1px solid var(--gray-border);
}

.success {
  color: green;
}

.error {
  color: red;
}

.errors-list {
  margin-top: 1rem;
  max-height: 300px;
  overflow-y: auto;
  background: #fff5f5;
  padding: 10px;
  border-radius: 4px;
  border: 1px solid #feb2b2;
}

.errors-list ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.errors-list li {
  font-size: 0.85rem;
  color: #c53030;
  margin-bottom: 5px;
  border-bottom: 1px solid #fed7d7;
  padding-bottom: 2px;
}
</style>
