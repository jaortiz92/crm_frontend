<script setup>
import { ref } from 'vue'
import { useRoute } from 'vue-router'

import { bulkUploadService } from '@/services/bulkUploadService'
import { alertService } from '@/services/alertService'

const file = ref(null)
const uploading = ref(false)
const route = useRoute()
const type = ref(route.params.type)
const isLoading = ref(false)

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

  try {
    const formData = new FormData()
    formData.append('file', file.value)
    let response = null

    if (type.value === 'create') {
      response = await bulkUploadService.CreateCustomerTrips(formData)
    } else if (type.value === 'update') {
      response = await bulkUploadService.UpdateCustomerTrips(formData)
    }

    if (response.data.message.error) {
      alertService.generalError(response.data.message.error)
    } else {
      alertService.generalSucces('Viajes de Cliente creados correctamente.')
    }

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
  <div v-if="isLoading" class="global-loading-overlay">
    <p>Procesando, por favor espere...</p>
    <div class="spinner"></div>
  </div>

  <div class="form-upload-customers">
    <h2 v-if="type === 'create'">Carga Masiva - <strong>Crear</strong> Viajes de Cliente</h2>
    <h2 v-else-if="type === 'update'">
      Carga Masiva - <strong>Actualizar</strong> Viajes de Cliente
    </h2>

    <input type="file" id="document" @change="handleFileUpload" accept=".xlsx,.xlsm" required />
    <div>
      <button @click="uploadFile" :disabled="uploading || !file">Subir Archivo</button>
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
</style>
