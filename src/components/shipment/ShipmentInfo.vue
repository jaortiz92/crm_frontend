<script setup>
import { toRefs } from 'vue'
import { formatters } from '@/plugins/formatters.js'

const props = defineProps({
  shipment: Object
})
const { shipment } = toRefs(props)
</script>

<template>
  <div class="detail-card">
    <h1 class="shipment-name">Envío #{{ shipment.id_shipment }}</h1>

    <dl class="detail-grid">
      <div class="detail-group">
        <dt>Factura:</dt>
        <dd>
          <router-link
            :to="{
              name: 'InvoiceDetail',
              params: { id: shipment.id_invoice }
            }"
          >
            {{ shipment.invoice.invoice_number }}-{{ shipment.invoice.key }}
          </router-link>
        </dd>
      </div>

      <div class="detail-group">
        <dt>Fecha Factura:</dt>
        <dd>{{ shipment.invoice.invoice_date }}</dd>
      </div>

      <div class="detail-group">
        <dt>Fecha Envío:</dt>
        <dd>{{ shipment.shipment_date }}</dd>
      </div>

      <div class="detail-group">
        <dt>Costo:</dt>
        <dd>{{ formatters.formatterGeneralNumber(shipment.shipment_cost) }}</dd>
      </div>

      <div class="detail-group">
        <dt>Transportadora:</dt>
        <dd>{{ shipment.carrier }}</dd>
      </div>

      <div class="detail-group">
        <dt>N° Guía:</dt>
        <dd>{{ shipment.tracking_number }}</dd>
      </div>

      <div class="detail-group">
        <dt>Fecha Estimada de Entrega:</dt>
        <dd>{{ shipment.estimated_delivery_date }}</dd>
      </div>

      <div class="detail-group">
        <dt>Fecha de Entrega:</dt>
        <dd v-if="shipment.received_date">{{ shipment.received_date }}</dd>
        <dd v-else class="muted">Sin Entregar</dd>
      </div>

      <div class="detail-group">
        <dt>Entregado:</dt>
        <dd>
          <span
            :class="{
              'badge badge--success': shipment.received,
              'badge badge--muted': !shipment.received
            }"
          >
            {{ shipment.received ? 'Sí' : 'No' }}
          </span>
        </dd>
      </div>

      <div class="detail-divider" style="grid-column: 1 / -1"></div>

      <div class="detail-group detail-pair--full">
        <dt>Comentarios:</dt>
        <dd class="text-value" v-if="shipment.details">{{ shipment.details }}</dd>
        <dd class="text-value muted" v-else>Sin Comentarios</dd>
      </div>
    </dl>
  </div>
</template>

<style scoped>
.detail-card {
  width: 100%;
  background: var(--color-surface-card, #ffffff);
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: var(--border-radius-size, 8px);
  padding: 20px;
}

.shipment-name {
  font-size: 28px;
  font-weight: 600;
  color: var(--color-text-primary, #070707);
  margin: 0 0 24px 0;
  text-align: left;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px 20px;
  width: 100%;
}

.detail-group {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 12px;
  align-items: center;
}

.detail-group dt {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary, #616161);
  text-align: left;
}

.detail-group dd {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary, #070707);
  margin: 0;
  text-align: left;
  word-break: break-word;
}

.detail-group dd a {
  color: var(--color-brand, #03658c);
  text-decoration: none;
  font-weight: 600;
}

.detail-group dd a:hover {
  color: var(--color-brand-hover, #05c7f2);
  text-decoration: underline;
}

.detail-pair--full {
  grid-column: 1 / -1;
}

.detail-pair--full dd {
  grid-column: 1 / -1;
}

.text-value {
  font-weight: 400 !important;
  line-height: 1.5;
}

.detail-divider {
  height: 1px;
  background: var(--color-border, rgba(97, 97, 97, 0.15));
  width: 100%;
  margin: 4px 0;
}

.muted {
  color: var(--color-text-tertiary, rgba(97, 97, 97, 0.5));
}

.badge {
  display: inline-block;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.25px;
  border-radius: 4px;
}

.badge--success {
  background: rgba(73, 154, 103, 0.15);
  color: var(--color-success, #499a67);
}

.badge--muted {
  background: rgba(97, 97, 97, 0.1);
  color: var(--color-text-tertiary, rgba(97, 97, 97, 0.5));
}

@media (max-width: 768px) {
  .detail-card {
    padding: 20px;
  }

  .shipment-name {
    font-size: 22px;
  }

  .detail-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }
}
</style>
