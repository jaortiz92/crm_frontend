<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useRatingStore } from '@/stores/ratingStore'
import { useCustomerStore } from '@/stores/customerStore'
import { useUserStore } from '@/stores/userStore.js'

import { basicModels } from '@/plugins/basicModels'
import { alertService } from '@/services/alertService'

import RatingFrom from '@/components/customer/rating/RatingForm.vue'

import { ratingService } from '@/services/ratingService'

const options = ref({
  ratingCategories: []
})
const rating = ref({})
const customer = ref(null)
const isEdit = ref(false)
const router = useRouter()

const customerStore = useCustomerStore()
const ratingStore = useRatingStore()
const userStore = useUserStore()

if (ratingStore.isThereRating()) {
  rating.value = ratingStore.getRating()
  isEdit.value = true
} else {
  rating.value = basicModels.rating
}

if (customerStore.isThereCustomer()) {
  customer.value = customerStore.getCustomer()
}

onMounted(async () => {
  options.value.ratingCategories = (await ratingService.getRatingCategories()).data
})

const save = async (rating) => {
  if (customer.value) {
    rating.id_customer = customer.value.id_customer
  } else {
    rating.id_customer = (
      await alertService.generalInput(
        'Inserta ID',
        'Ingresa el ID de la compañia al cual desea agregar el contacto',
        'number',
        'Es obligatorio agregar el ID'
      )
    ).value
  }

  rating.id_creator = userStore.user.id_user
  if (!isEdit.value) {
    const responseUser = await alertService.createElement('Evaluación')
    if (responseUser.isConfirmed) {
      try {
        const response = await ratingService.createRating(rating)
        const id = response.data.id_rating
        const id_customer = response.data.id_customer
        alertService.generalSucces(`La Evaluación fue creadá exitosamente con el ID ${id}`)
        router.push(`rating/${id_customer}`)
      } catch {
        alertService.generalError(`La Evaluación no pudo ser creada.`)
      }
    }
  } else {
    const responseUser = await alertService.updateElement(rating.id_rating, 'Evaluación')
    if (responseUser.isConfirmed) {
      try {
        await ratingService.updateRating(rating.id_rating, rating)
        alertService.generalSucces(
          `La Evaluación con ID ${rating.id_rating}, fue actualizada exitosamente`
        )
        router.push(`rating/${customer.value.id_customer}`)
      } catch {
        alertService.generalError(
          `La Evaluación con ID ${rating.id_rating}, no pudo ser actualizada`
        )
      }
    }
  }
}
</script>

<template>
  <div>
    <h2>{{ isEdit ? `Actualizar Evaluación: ID ${rating.id_rating}` : 'Crear Evaluación' }}</h2>
    <h4 v-if="customer">{{ customer.company_name }}</h4>
    <RatingFrom
      :initialRating="rating"
      :options="options"
      :isEdit="isEdit"
      @save="save"
    ></RatingFrom>
  </div>
</template>
