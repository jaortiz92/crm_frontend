<script setup>
import { toRefs } from 'vue'
import { formatters } from '@/plugins/formatters.js'

const props = defineProps({
  order: Object
})
const { order } = toRefs(props)
</script>

<template>
  <div class="detail-card">
    <h1 class="order-name">Orden #{{ order.id_order }}</h1>

    <dl class="detail-grid">
      <div class="detail-group">
        <dt>ID Viaje del cliente:</dt>
        <dd>
          <router-link :to="{ name: 'CustomerTripDetail', params: { id: order.id_customer_trip } }">
            {{ order.id_customer_trip }}
          </router-link>
        </dd>
      </div>

      <div class="detail-group">
        <dt>Ciudad:</dt>
        <dd>{{ order.customer_trip.customer.city.city_name }}</dd>
      </div>

      <div class="detail-group">
        <dt>Departamento:</dt>
        <dd>{{ order.customer_trip.customer.city.department.department_name }}</dd>
      </div>

      <div class="detail-group">
        <dt>Cliente:</dt>
        <dd>{{ order.customer_trip.customer.company_name }}</dd>
      </div>

      <div class="detail-group">
        <dt>Documento:</dt>
        <dd>{{ order.customer_trip.customer.document }}</dd>
      </div>

      <div class="detail-group">
        <dt>Asesor:</dt>
        <dd>{{ order.seller.first_name }} {{ order.seller.last_name }}</dd>
      </div>

      <div class="detail-divider" style="grid-column: 1 / -1"></div>

      <div class="detail-group">
        <dt>Colección:</dt>
        <dd>{{ order.customer_trip.collection.short_collection_name }}</dd>
      </div>

      <div class="detail-group">
        <dt>Fecha:</dt>
        <dd>{{ order.date_order }}</dd>
      </div>

      <div class="detail-group">
        <dt>Fecha de Entrega acordada:</dt>
        <dd>{{ order.delivery_date }}</dd>
      </div>

      <div class="detail-group">
        <dt>Forma de pago acordada:</dt>
        <dd>{{ order.payment_method.payment_method_name }}</dd>
      </div>

      <div class="detail-divider" style="grid-column: 1 / -1"></div>

      <div class="detail-group">
        <dt>N° Prendas:</dt>
        <dd>{{ order.total_quantities }}</dd>
      </div>

      <div class="detail-group">
        <dt>N° Prendas Cargadas:</dt>
        <dd>{{ order.system_quantities }}</dd>
      </div>

      <div class="detail-group">
        <dt>Valor Total:</dt>
        <dd>{{ formatters.formatterGeneralNumber(order.total_with_tax) }}</dd>
      </div>

      <div class="detail-group">
        <dt>Valor Sin IVA:</dt>
        <dd>{{ formatters.formatterGeneralNumber(order.total_without_tax) }}</dd>
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

.order-name {
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

.detail-divider {
  height: 1px;
  background: var(--color-border, rgba(97, 97, 97, 0.15));
  width: 100%;
  margin: 4px 0;
}

@media (max-width: 768px) {
  .detail-card {
    padding: 20px;
  }

  .order-name {
    font-size: 22px;
  }

  .detail-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }
}
</style>
