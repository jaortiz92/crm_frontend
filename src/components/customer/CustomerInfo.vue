<script setup>
import { toRefs, ref } from 'vue'
import { useRouter } from 'vue-router'
import { formatters } from '@/plugins/formatters.js'

import RatingInfo from './rating/RatingInfo.vue'

const props = defineProps({
  customer: Object,
  lastRating: Object
})
const { customer } = toRefs(props)
const router = useRouter()

const isModalRatingVisible = ref(false)

const showRatingDetails = async () => {
  isModalRatingVisible.value = true
}

const editRating = async () => {
  router.push(`/rating/${customer.value.id_customer}`)
}

const formatValue = (value) => {
  return value || 'Sin información'
}
</script>

<template>
  <div class="detail-card">
    <h1 class="customer-name">{{ customer.company_name }}</h1>

    <dl class="detail-grid">
      <div class="detail-group">
        <dt>Documento:</dt>
        <dd>{{ formatValue(customer.document) }}</dd>
      </div>

      <div class="detail-group">
        <dt>Correo:</dt>
        <dd>{{ formatValue(customer.email) }}</dd>
      </div>

      <div class="detail-group">
        <dt>Celular (Teléfono):</dt>
        <dd>
          {{ customer.phone ? formatters.formatterPhoneNumber(customer.phone) : 'Sin información' }}
        </dd>
      </div>

      <div class="detail-group detail-pair--full">
        <dt>Dirección:</dt>
        <dd>{{ formatValue(customer.address) }}</dd>
      </div>

      <div class="detail-group">
        <dt>Departamento:</dt>
        <dd>{{ customer.city?.department?.department_name || 'Sin información' }}</dd>
      </div>

      <div class="detail-group">
        <dt>Ciudad:</dt>
        <dd>{{ customer.city?.city_name || 'Sin información' }}</dd>
      </div>

      <div class="detail-divider" style="grid-column: 1 / -1"></div>

      <div class="detail-group">
        <dt>Asesor:</dt>
        <dd>
          {{
            customer.seller
              ? `${customer.seller.first_name} ${customer.seller.last_name}`
              : 'Sin información'
          }}
        </dd>
      </div>
      <div class="detail-group">
        <dt>Tipo de tienda:</dt>
        <dd>{{ customer.store_type?.store_type || 'Sin información' }}</dd>
      </div>
      <div class="detail-group">
        <dt>Tiendas:</dt>
        <dd>{{ formatValue(customer.stores) }}</dd>
      </div>

      <div class="detail-divider" style="grid-column: 1 / -1"></div>

      <div class="detail-group">
        <dt>Tipo de origen:</dt>
        <dd>{{ customer.origin_type?.origin_type || 'Sin información' }}</dd>
      </div>

      <div class="detail-group">
        <dt>Fecha primer contacto:</dt>
        <dd>{{ formatValue(customer.date_started_buying) }}</dd>
      </div>

      <div class="detail-group">
        <dt>Asesor inicial:</dt>
        <dd>
          <span v-if="customer.seller_origin">
            {{ customer.seller_origin.first_name }} {{ customer.seller_origin.last_name }}
          </span>
          <span v-else>Sin información</span>
        </dd>
      </div>

      <div class="detail-group">
        <dt>Categoría:</dt>
        <dd>
          <span class="rating-label" @click="showRatingDetails()">
            ({{ lastRating?.rating_category?.level || 'Sin categoría' }})
            <strong>{{ lastRating?.rating_category?.rating_category || 'Sin categoría' }}</strong>
          </span>
        </dd>
      </div>

      <div class="detail-divider" style="grid-column: 1 / -1"></div>

      <div class="detail-group detail-pair--status">
        <dt>Cliente de consignación:</dt>
        <dd>
          <span
            :class="{
              'badge badge--warning': customer.is_consignation,
              'badge badge--muted': !customer.is_consignation
            }"
          >
            {{ customer.is_consignation ? 'Sí' : 'No' }}
          </span>
        </dd>
      </div>

      <div class="detail-group detail-pair--status">
        <dt>Activo:</dt>
        <dd>
          <span
            :class="{
              'badge badge--success': customer.active,
              'badge badge--muted': !customer.active
            }"
          >
            {{ customer.active ? 'Sí' : 'No' }}
          </span>
        </dd>
      </div>

      <div class="detail-group detail-pair--status">
        <dt>Con documentos:</dt>
        <dd>
          <span
            :class="{
              'badge badge--success': customer.with_documents,
              'badge badge--muted': !customer.with_documents
            }"
          >
            {{ customer.with_documents ? 'Sí' : 'No' }}
          </span>
        </dd>
      </div>

      <div class="detail-divider" style="grid-column: 1 / -1"></div>

      <div class="detail-group detail-pair--full">
        <dt>Marcas:</dt>
        <dd>
          <span v-if="customer.brands && customer.brands.length > 0">
            <span class="tag" v-for="brand in customer.brands" :key="brand.brand_name">
              {{ brand.brand_name }}: {{ brand.line.line_name }}
            </span>
          </span>
          <span v-else class="muted">Sin marcas</span>
        </dd>
      </div>

      <div class="detail-group detail-pair--full">
        <dt>Redes sociales:</dt>
        <dd>{{ formatValue(customer.social_media) }}</dd>
      </div>

      <div class="detail-group detail-pair--full">
        <dt>Detalles relevantes:</dt>
        <dd>{{ formatValue(customer.relevant_details) }}</dd>
      </div>
    </dl>

    <div class="rating-section">
      <RatingInfo
        :rating="lastRating"
        :isModalRatingVisible="isModalRatingVisible"
        @close="isModalRatingVisible = false"
        @edit="editRating"
      ></RatingInfo>
    </div>
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

.tag {
  display: inline-block;
  padding: 2px 8px;
  margin: 2px 4px 2px 0;
  font-size: 13px;
  border-radius: 4px;
  background: var(--color-brand-light, #d0ebda);
  color: var(--color-text-primary, #070707);
}

.muted {
  color: var(--color-text-tertiary, rgba(97, 97, 97, 0.5));
}

.rating-label {
  color: var(--color-brand, #03658c);
  cursor: pointer;
  text-decoration: underline;
  font-size: 14px;
  font-weight: 600;
}

.rating-label:hover {
  color: var(--color-brand-hover, #05c7f2);
}

.rating-section {
  margin-top: 24px;
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
