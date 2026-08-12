<script setup>
import { toRefs } from 'vue'
import { formatters } from '@/plugins/formatters.js'

const props = defineProps({
  customerTrip: Object
})
const { customerTrip } = toRefs(props)
</script>

<template>
  <div class="detail-card">
    <router-link
      :to="{ name: 'CustomerDetail', params: { id: customerTrip.id_customer } }"
      class="customer-name"
    >
      {{ customerTrip.customer.company_name }}
    </router-link>

    <dl class="detail-grid">
      <div class="detail-group">
        <dt>ID Viaje:</dt>
        <dd>{{ customerTrip.id_customer_trip }}</dd>
      </div>

      <div class="detail-group">
        <dt>Línea:</dt>
        <dd>{{ customerTrip.collection.line.line_name }}</dd>
      </div>

      <div class="detail-group">
        <dt>Colección:</dt>
        <dd>
          {{ customerTrip.collection.collection_name }} -
          {{ customerTrip.collection.short_collection_name }} - Q{{
            customerTrip.collection.quarter
          }}
        </dd>
      </div>

      <div class="detail-divider" style="grid-column: 1 / -1"></div>

      <template v-if="!customerTrip.with_budget">
        <div class="detail-group detail-pair--full">
          <dt>Presupuesto:</dt>
          <dd><span class="badge badge--warning">Sin Presupuestar</span></dd>
        </div>
      </template>
      <template v-else>
        <div class="detail-group">
          <dt>Presupuesto Valor:</dt>
          <dd>{{ formatters.formatterGeneralNumber(customerTrip.budget) }}</dd>
        </div>
        <div class="detail-group">
          <dt>Presupuesto Prendas:</dt>
          <dd>{{ formatters.formatterGeneralNumber(customerTrip.budget_quantities) }}</dd>
        </div>
        <div></div>
      </template>

      <div class="detail-divider" style="grid-column: 1 / -1"></div>

      <div class="detail-group">
        <dt>Asesor:</dt>
        <dd>
          {{ customerTrip.seller.first_name }}
          {{ customerTrip.seller.last_name }}
        </dd>
      </div>

      <div class="detail-group">
        <dt>Departamento:</dt>
        <dd>{{ customerTrip.customer.city.department.department_name }}</dd>
      </div>

      <div class="detail-group">
        <dt>Ciudad:</dt>
        <dd>{{ customerTrip.customer.city.city_name }}</dd>
      </div>

      <div class="detail-divider" style="grid-column: 1 / -1"></div>

      <div class="detail-group detail-pair--status">
        <dt>Cerrado:</dt>
        <dd>
          <span
            :class="{
              'badge badge--success': customerTrip.closed,
              'badge badge--muted': !customerTrip.closed
            }"
          >
            {{ customerTrip.closed ? 'Sí' : 'No' }}
          </span>
        </dd>
      </div>

      <div class="detail-group detail-pair--full">
        <dt>Comentarios:</dt>
        <dd v-if="customerTrip.comment" class="comment">{{ customerTrip.comment }}</dd>
        <dd v-else class="muted">Sin comentarios</dd>
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

.customer-name {
  display: block;
  font-size: 28px;
  font-weight: 600;
  color: var(--color-text-primary, #070707);
  margin: 0 0 24px 0;
  text-align: left;
  text-decoration: none;
}

.customer-name:hover {
  color: var(--color-brand, #03658c);
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

.detail-pair--full dd {
  grid-column: 1 / -1;
}

.detail-divider {
  height: 1px;
  background: var(--color-border, rgba(97, 97, 97, 0.15));
  width: 100%;
  margin: 4px 0;
}

.detail-pair--status .badge {
  font-size: 11px;
  padding: 4px 8px;
  text-transform: uppercase;
  letter-spacing: 0.25px;
}

.badge {
  display: inline-block;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

.badge--success {
  background: rgba(73, 154, 103, 0.15);
  color: var(--color-success, #499a67);
}

.badge--warning {
  background: rgba(226, 165, 13, 0.15);
  color: var(--color-warning, #e2a50d);
}

.badge--muted {
  background: rgba(97, 97, 97, 0.1);
  color: var(--color-text-tertiary, rgba(97, 97, 97, 0.5));
}

.comment {
  text-align: left;
  line-height: 1.5;
}

.muted {
  color: var(--color-text-tertiary, rgba(97, 97, 97, 0.5));
}

@media (max-width: 768px) {
  .detail-card {
    padding: 20px;
  }

  .customer-name {
    font-size: 22px;
  }

  .detail-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }
}
</style>
