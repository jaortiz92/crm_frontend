<script setup>
import { ref } from 'vue'
import { useRoute } from 'vue-router'

import { bulkUploadService } from '@/services/bulkUploadService'
import { alertService } from '@/services/alertService'

const file = ref(null)
const uploading = ref(false)
const message = ref('')
const error = ref('')
const route = useRoute()
const type = ref(route.params.type)
console.log(type.value)

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
    error.value = 'Debe seleccionar un archivo.'
    return
  }

  uploading.value = true
  error.value = ''
  message.value = ''

  try {
    const formData = new FormData()
    formData.append('file', file.value)
    let response = null

    if (type.value === 'create') {
      response = await bulkUploadService.CreateCustomers(formData)
    } else if (type.value === 'update') {
      response = await bulkUploadService.UpdateCustomers(formData)
    }

    if (response.data.message.error) {
      error.value = response.data.message.error
    } else {
      message.value = 'Clientes creados correctamente.'
    }

    file.value = null
  } catch (err) {
    error.value =
      err.response?.data?.message?.error ||
      err.response?.data?.detail ||
      'Error al subir el archivo.'
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <div class="form-upload-customers">
    <h2 v-if="type === 'create'">Carga Masiva - <strong>Crear</strong> Clientes</h2>
    <h2 v-else-if="type === 'update'">Carga Masiva - <strong>Actualizar</strong> Clientes</h2>

    <input type="file" id="document" @change="handleFileUpload" accept=".xlsx,.xlsm" required />
    <button @click="uploadFile" :disabled="uploading || !file">Subir Archivo</button>
    <div class="message success" v-if="message">{{ message }}</div>
    <div class="message error" v-if="error">{{ error }}</div>
  </div>
</template>

<style scoped>
.form-upload-customers {
  max-width: 600px;
  margin: 0 auto;
  border: 1px solid var(--gray-border);
  border-radius: 8px;
  background-color: var(--background-light);
  box-shadow: 0 4px 8px var(--shadow);
}

button:disabled {
  background-color: #aaa;
  cursor: not-allowed;
}

.message {
  margin-top: 1rem;
  font-weight: bold;
}

.success {
  color: green;
}

.error {
  color: red;
}
</style>
