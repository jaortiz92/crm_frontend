<script setup>
import { toRefs } from 'vue'
import { formatters } from '@/plugins/formatters.js'

const props = defineProps({
  customerTrip: Object
})
const { customerTrip } = toRefs(props)
</script>

<template>
  <router-link :to="{ name: 'CustomerDetail', params: { id: customerTrip.id_customer } }">
    <h2>{{ customerTrip.customer.company_name }}</h2>
  </router-link>
  <div class="detail-row">
    <p><strong>ID Viaje de Cliente:</strong></p>
    <p>{{ customerTrip.id_customer_trip }}</p>
  </div>
  <div class="detail-row">
    <p><strong>Linea:</strong></p>
    <p>{{ customerTrip.collection.line.line_name }}</p>
  </div>
  <div class="detail-row">
    <p><strong>Colección:</strong></p>
    <p>
      {{ customerTrip.collection.collection_name }} -
      {{ customerTrip.collection.short_collection_name }} - Q{{ customerTrip.collection.quarter }}
    </p>
  </div>
  <div class="detail-row">
    <p><strong>Presupuesto Valor:</strong></p>
    <p>{{ formatters.formatterGeneralNumber(customerTrip.budget) }}</p>
  </div>
  <div class="detail-row">
    <p><strong>Presupuesto Prendas:</strong></p>
    <p>{{ formatters.formatterGeneralNumber(customerTrip.budget_quantities) }}</p>
  </div>
  <div class="detail-row">
    <p>
      <strong>Asesor:</strong>
    </p>
    <p>
      {{ customerTrip.seller.first_name }}
      {{ customerTrip.seller.last_name }}
    </p>
  </div>
  <div class="detail-row">
    <p><strong>Departamento:</strong></p>
    <p>{{ customerTrip.customer.city.department.department_name }}</p>
  </div>
  <div class="detail-row">
    <p><strong>Ciudad:</strong></p>
    <p>{{ customerTrip.customer.city.city_name }}</p>
  </div>
  <div class="detail-row">
    <p>
      <strong>Ordenó:</strong>
    </p>
    <p>
      <span :class="{ checkbox: true, checked: customerTrip.ordered }"></span>
    </p>
  </div>
  <div class="detail-row">
    <p><strong>Comentarios:</strong></p>
    <p v-if="customerTrip.comment">{{ customerTrip.comment }}</p>
    <p v-else>Sin Comentarios</p>
  </div>
</template>

<style scoped>
.detail-row {
  display: flex;
  margin: 1%;
  justify-content: space-between;
  padding: 5px 0;
  border-bottom: 1px solid var(--gray-border);
}

.detail-row p {
  font-size: 100%;
  margin: 3px;
}

.detail-row:last-child {
  border-bottom: none;
}

@media (max-width: 600px) {
  .detail-row {
    flex-direction: column;
    text-align: left;
  }

  .detail-row p:last-child {
    text-align: left;
    margin-top: 5px;
  }
}

.checkbox {
  margin: 0;
}
</style>
