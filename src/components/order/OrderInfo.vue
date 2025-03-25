<script setup>
import { toRefs } from 'vue'
import { formatters } from '@/plugins/formatters.js'

const props = defineProps({
  order: Object
})
const { order } = toRefs(props)
</script>

<template>
  <div class="template-container">
    <h2>ID Orden {{ order.id_order }}</h2>
    <div class="details-wrapper">
      <div class="detail-column">
        <div class="detail-row">
          <p><strong>ID Viaje del cliente:</strong></p>
          <router-link :to="{ name: 'CustomerTripDetail', params: { id: order.id_customer_trip } }">
            <p>{{ order.id_customer_trip }}</p>
          </router-link>
        </div>
        <div class="detail-row">
          <p><strong>Cliente:</strong></p>
          <p>{{ order.customer_trip.customer.company_name }}</p>
        </div>
        <div class="detail-row">
          <p><strong>Documento:</strong></p>
          <p>{{ order.customer_trip.customer.document }}</p>
        </div>
        <div class="detail-row">
          <p><strong>Ciudad:</strong></p>
          <p>{{ order.customer_trip.customer.city.city_name }}</p>
        </div>
        <div class="detail-row">
          <p><strong>Departamento:</strong></p>
          <p>{{ order.customer_trip.customer.city.department.department_name }}</p>
        </div>
        <div class="detail-row">
          <p>
            <strong>Asesor:</strong>
          </p>
          <p>{{ order.seller.first_name }} {{ order.seller.last_name }}</p>
        </div>
        <div class="detail-row">
          <p><strong>Colección:</strong></p>
          <p>{{ order.customer_trip.collection.short_collection_name }}</p>
        </div>
      </div>
      <div class="detail-column">
        <div class="detail-row">
          <p><strong>N° Prendas:</strong></p>
          <p>{{ order.total_quantities }}</p>
        </div>
        <div class="detail-row">
          <p><strong>N° Prendas Cargadas:</strong></p>
          <p>{{ order.system_quantities }}</p>
        </div>
        <div class="detail-row">
          <p>
            <strong>Valor Sin IVA:</strong>
          </p>
          <p>
            {{ formatters.formatterGeneralNumber(order.total_without_tax) }}
          </p>
        </div>
        <div class="detail-row">
          <p>
            <strong>Valor Total:</strong>
          </p>
          <p>
            {{ formatters.formatterGeneralNumber(order.total_with_tax) }}
          </p>
        </div>
        <div class="detail-row">
          <p><strong>Fecha:</strong></p>
          <p>{{ order.date_order }}</p>
        </div>
        <div class="detail-row">
          <p><strong>Fecha de Entrega acordada:</strong></p>
          <p>{{ order.delivery_date }}</p>
        </div>
        <div class="detail-row">
          <p><strong>Forma de pago acordada:</strong></p>
          <p>{{ order.payment_method.payment_method_name }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.template-container {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--gray-border);
  border-radius: 8px;
  padding: 20px;
  max-width: 100%;
  background-color: var(--background-light);
}

.details-wrapper {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.detail-column:first-child {
  border-right: 1px solid var(--gray-border);
  padding-right: 15px;
  margin-right: 15px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  padding: 5px 0;
}

.detail-row p {
  margin: 0;
  font-size: 1rem;
}

.detail-row p:first-child {
  font-weight: bold;
}

.detail-row p:last-child {
  text-align: right;
}
</style>
