<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { alertService } from '@/services/alertService'
import { ratingService } from '@/services/ratingService'

import RatingTable from '@/components/customer/rating/RatingTable.vue'
import { useRatingStore } from '@/stores/ratingStore'
import { useCustomerStore } from '@/stores/customerStore'
import { customerService } from '@/services/customerService'

const route = useRoute()
const customer = ref(null)
const ratings = ref([])
const ratingStore = useRatingStore()
const customerStore = useCustomerStore()
const router = useRouter()

onMounted(async () => {
  const idCustomer = route.params.id
  if (customerStore.isThereCustomer()) {
    customer.value = customerStore.getCustomer()
  } else {
    customer.value = (await customerService.getCustomerFull(idCustomer)).data
  }
  ratings.value = (await ratingService.getRatingsByCustomer(idCustomer)).data
})

const edit = async (rating) => {
  const responseUser = await alertService.editElement(rating.id_rating, 'Evaluación')
  if (responseUser.isConfirmed) {
    ratingStore.setRating(rating)
    router.push('/ratingForm')
  }
}

const createRating = async () => {
  const responseUser = await alertService.createElement('Evaluación')
  if (responseUser.isConfirmed) {
    ratingStore.clearRating()
    router.push('/ratingForm')
  }
}
</script>

<template>
  <div class="ratings" v-if="ratings && customer">
    <h2>Evaluaciones del cliente {{ customer.company_name }}</h2>
    <p>{{ customer.document }}</p>
    <div class="ratings-detail">
      <RatingTable :ratings="ratings" @edit="edit"></RatingTable>
    </div>
  </div>
  <div v-else>
    <p>Cargando detalles...</p>
  </div>
  <div class="button-edit">
    <button @click="createRating">Crear Evaluación</button>
  </div>
</template>

<style scoped>
.button-edit button {
  margin: 2px;
}

.ratings_additional {
  flex-grow: 1;
}
</style>
