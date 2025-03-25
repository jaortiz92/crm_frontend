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
</script>

<template>
  <h2>{{ customer.company_name }}</h2>
  <div class="detail-row">
    <p><strong>Documento:</strong></p>
    <p>{{ customer.document }}</p>
  </div>
  <div class="detail-row">
    <p><strong>Correo:</strong></p>
    <p>{{ customer.email }}</p>
  </div>
  <div class="detail-row">
    <p><strong>Celular(Telefono):</strong></p>
    <p>{{ formatters.formatterPhoneNumber(customer.phone) }}</p>
  </div>
  <div class="detail-row">
    <p><strong>Dirección:</strong></p>
    <p>{{ customer.address }}</p>
  </div>
  <div class="detail-row">
    <p><strong>Tiendas:</strong></p>
    <p>{{ customer.stores }}</p>
  </div>
  <div class="detail-row">
    <p><strong>Tipo de tienda:</strong></p>
    <p>{{ customer.store_type.store_type }}</p>
  </div>
  <div class="detail-row">
    <p>
      <strong>Asesor:</strong>
    </p>
    <p>
      {{ customer.seller.first_name }}
      {{ customer.seller.last_name }}
    </p>
  </div>
  <div class="detail-row">
    <p><strong>Departamento:</strong></p>
    <p>{{ customer.city.department.department_name }}</p>
  </div>
  <div class="detail-row">
    <p><strong>Ciudad:</strong></p>
    <p>{{ customer.city.city_name }}</p>
  </div>
  <div class="detail-row">
    <p><strong>Categoria:</strong></p>
    <p class="rating-detail" @click="showRatingDetails()">
      ({{ lastRating.rating_category.level }})
      <strong>{{ lastRating.rating_category.rating_category }}</strong>
    </p>
  </div>
  <div class="detail-row">
    <p>
      <strong>Activo:</strong>
    </p>
    <p>
      <span :class="{ checkbox: true, checked: customer.active }"></span>
    </p>
  </div>
  <div class="detail-column">
    <p><strong>Marcas:</strong></p>

    <div v-if="customer.brands.length == 0">
      <p class="space-for-text">Sin Marcas</p>
    </div>
    <div v-else>
      <p class="space-for-text" v-for="brand in customer.brands" :key="brand.brand_name">
        - {{ brand.brand_name }}: {{ brand.line.line_name }}
      </p>
    </div>
  </div>
  <div class="detail-column">
    <p>
      <strong>Redes Sociales:</strong>
    </p>
    <p class="space-for-text" v-if="customer.social_media">
      {{ customer.social_media }}
    </p>
    <p class="space-for-text" v-else>Sin Redes</p>
  </div>
  <div class="detail-column">
    <p>
      <strong>Detalles relevantes:</strong>
    </p>
    <p class="space-for-text" v-if="customer.relevant_details">
      {{ customer.relevant_details }}
    </p>
    <p class="space-for-text" v-else>Sin Detalles</p>
  </div>
  <div>
    <RatingInfo
      :rating="lastRating"
      :isModalRatingVisible="isModalRatingVisible"
      @close="isModalRatingVisible = close"
      @edit="editRating"
    ></RatingInfo>
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

.rating-detail:hover {
  cursor: pointer;
}

.space-for-text {
  text-align: justify;
  white-space: pre-wrap;
  margin: 1px;
}
</style>
