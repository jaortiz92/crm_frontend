<script setup>
import { toRefs } from 'vue'
import { formatters } from '@/plugins/formatters.js'

const props = defineProps({
  invoice: Object
})
const { invoice } = toRefs(props)
</script>

<template>
  <div class="template-container">
    <h2>Factura No {{ invoice.invoice_number }}</h2>
    <div class="details-wrapper">
      <div class="detail-column">
        <div class="detail-row">
          <p><strong>ID Factura:</strong></p>
          <p>{{ invoice.id_invoice }}-{{ invoice.key }}</p>
        </div>
        <div class="detail-row">
          <p><strong>Order:</strong></p>
          <router-link :to="{ name: 'OrderDetail', params: { id: invoice.id_order } }">
            <p>{{ invoice.id_order }}</p>
          </router-link>
        </div>
        <div class="detail-row">
          <p><strong>ID Viaje del cliente:</strong></p>
          <router-link
            :to="{ name: 'CustomerTripDetail', params: { id: invoice.order.id_customer_trip } }"
          >
            <p>{{ invoice.order.id_customer_trip }}</p>
          </router-link>
        </div>
        <div class="detail-row">
          <p><strong>Cliente:</strong></p>
          <p>{{ invoice.order.customer_trip.customer.company_name }}</p>
        </div>
        <div class="detail-row">
          <p><strong>Documento:</strong></p>
          <p>{{ invoice.order.customer_trip.customer.document }}</p>
        </div>
        <div class="detail-row">
          <p><strong>Ciudad:</strong></p>
          <p>{{ invoice.order.customer_trip.customer.city.city_name }}</p>
        </div>
        <div class="detail-row">
          <p><strong>Departamento:</strong></p>
          <p>{{ invoice.order.customer_trip.customer.city.department.department_name }}</p>
        </div>
      </div>
      <div class="detail-column">
        <div class="detail-row">
          <p><strong>Colección:</strong></p>
          <p>{{ invoice.order.customer_trip.collection.short_collection_name }}</p>
        </div>
        <div class="detail-row">
          <p><strong>Prendas:</strong></p>
          <p>{{ invoice.total_quantities }}</p>
        </div>
        <div class="detail-row">
          <p>
            <strong>Valor Sin IVA:</strong>
          </p>
          <p>
            {{ formatters.formatterGeneralNumber(invoice.total_without_tax) }}
          </p>
        </div>
        <div class="detail-row">
          <p>
            <strong>Descuento:</strong>
          </p>
          <p>
            {{ formatters.formatterGeneralNumber(invoice.total_discount) }}
          </p>
        </div>
        <div class="detail-row">
          <p>
            <strong>Valor Total:</strong>
          </p>
          <p>
            {{ formatters.formatterGeneralNumber(invoice.total_with_tax) }}
          </p>
        </div>
        <div class="detail-row">
          <p><strong>Fecha:</strong></p>
          <p>{{ invoice.invoice_date }}</p>
        </div>
        <div class="detail-row">
          <p>
            <strong>Asesor:</strong>
          </p>
          <p>{{ invoice.order.seller.first_name }} {{ invoice.order.seller.last_name }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.template-container {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--gray-binvoice);
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

.detail-column {
  flex: 1 1 45%;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.detail-column:first-child {
  border-right: 1px solid var(--gray-binvoice);
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
