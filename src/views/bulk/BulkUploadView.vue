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
  },
  {
    label: 'Crear Viaje de Clientes',
    id: 'BulkCreateCustomerTrip',
    route: 'BulkUploadCustomerTrip',
    params: { type: 'create' }
  },
  {
    label: 'Actualizar Viaje de Clientes',
    id: 'BulkUpdateCustomerTrip',
    route: 'BulkUploadCustomerTrip',
    params: { type: 'update' }
  },
  {
    label: 'Carga Masiva Detalle de Facturas',
    id: 'BulkUploadInvoiceDetails',
    route: 'BulkUploadInvoiceDetails',
    params: {}
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
  <div class="bulk-page">
    <div class="bulk-card">
      <div class="section-header">
        <div class="section-accent"></div>
        <h2 class="section-title">Seleccione el tipo de carga masiva</h2>
      </div>
      <select v-model="selected">
        <option value="" disabled>Seleccione una opción</option>
        <option v-for="opt in options" :key="opt.id" :value="opt.id">
          {{ opt.label }}
        </option>
      </select>
      <div class="actions-bar">
        <button class="btn btn-primary" @click="goToUpload" :disabled="!selected">Continuar</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bulk-page {
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
  padding: 24px;
}

.bulk-card {
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
  background: var(--color-surface-card, #ffffff);
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: var(--border-radius-size, 8px);
  padding: 24px;
}

.actions-bar {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 0 0 0;
}

@media (max-width: 768px) {
  .bulk-page {
    padding: 20px;
  }
}
</style>
