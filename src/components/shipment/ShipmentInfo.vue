<script setup>
import { toRefs } from 'vue'
import { formatters } from '@/plugins/formatters.js'

const props = defineProps({
  shipment: Object
})
const { shipment } = toRefs(props)
</script>

<template>
  <div class="template-container">
    <h2>ID Envio {{ shipment.id_shipment }}</h2>
    <div class="details-wrapper">
      <div class="detail-column">
        <div class="detail-row">
          <p><strong>Factura:</strong></p>
          <router-link
            :to="{
              name: 'InvoiceDetail',
              params: { id: shipment.id_invoice }
            }"
          >
            <p>{{ shipment.invoice.invoice_number }}-{{ shipment.invoice.key }}</p>
          </router-link>
        </div>
        <div class="detail-row">
          <p>
            <strong>Fecha Factura:</strong>
          </p>
          <p>
            {{ shipment.invoice.invoice_date }}
          </p>
        </div>
        <div class="detail-row">
          <p>
            <strong>Fecha Envio:</strong>
          </p>
          <p>
            {{ shipment.shipment_date }}
          </p>
        </div>
        <div class="detail-row">
          <p><strong>Costo:</strong></p>
          <p>{{ formatters.formatterGeneralNumber(shipment.shipment_cost) }}</p>
        </div>
        <div class="detail-row">
          <p>
            <strong>Transportadora:</strong>
          </p>
          <p>
            {{ shipment.carrier }}
          </p>
        </div>
      </div>
      <div class="detail-column">
        <div class="detail-row">
          <p><strong>N° Guia:</strong></p>
          <p>{{ shipment.tracking_number }}</p>
        </div>
        <div class="detail-row">
          <p>
            <strong>Fecha Estimada de Entrega:</strong>
          </p>
          <p>{{ shipment.estimated_delivery_date }}</p>
        </div>
        <div class="detail-row">
          <p>
            <strong>Fecha de Entrega:</strong>
          </p>
          <p v-if="shipment.received_date">{{ shipment.received_date }}</p>
          <p v-else>Sin Entregar</p>
        </div>
        <div class="detail-row">
          <p><strong>Entregado:</strong></p>
          <p>
            <span :class="{ checkbox: true, checked: shipment.received }"></span>
          </p>
        </div>
      </div>
    </div>
    <div class="text-row">
      <p>
        <strong>Comentarios: </strong>
      </p>
      <p class="space-for-text" v-if="shipment.details">{{ shipment.details }}</p>
      <p class="space-for-text" v-else>Sin Comentarios</p>
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

.text-row {
  display: flex;
  flex-wrap: wrap;
  border-top: 1px solid var(--gray-border);
  margin-top: 15px;
  padding-top: 15px;
}
.space-for-text {
  text-align: justify;
}
</style>
