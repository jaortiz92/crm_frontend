<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const selected = ref('')

const options = [
  {
    label: 'Crear Clientes',
    id: 'BulkCreateCustomer',
    route: 'BulkUploadCustomer',
    params: { type: 'create' }
  },
  {
    label: 'Actualizar Clientes',
    id: 'BulkUpdateCustomer',
    route: 'BulkUploadCustomer',
    params: { type: 'update' }
  }
]

const goToUpload = () => {
  if (selected.value) {
    const selectedOption = options.find((opt) => opt.id === selected.value)

    router.push({
      name: selectedOption.route,
      params: selectedOption.params
    })
  }
}
</script>

<template>
  <div class="menu-container">
    <h2>Seleccione el tipo de carga masiva</h2>
    <select v-model="selected">
      <option value="" disabled>Seleccione una opción</option>
      <option v-for="opt in options" :key="opt.id" :value="opt.id">
        {{ opt.label }}
      </option>
    </select>
    <button @click="goToUpload" :disabled="!selected">Continuar</button>
  </div>
</template>

<style scoped>
.menu-container {
  max-width: 400px;
  margin: auto;
  padding: 2rem;
}
select,
button {
  width: 100%;
  padding: 0.5rem;
  margin-top: 1rem;
}
</style>
