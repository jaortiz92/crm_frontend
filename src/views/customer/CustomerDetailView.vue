<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { alertService } from '@/services/alertService'

import { customerService } from '@/services/customerService'
import { customerTripService } from '@/services/customerTripService'
import { ratingService } from '@/services/ratingService'

import ContactTable from '@/components/customer/contact/ContactTable.vue'
import CustomerInfo from '@/components/customer/CustomerInfo.vue'
import CustomerTripTable from '@/components/customer/customerTrip/CustomerTripTable.vue'
import { useCustomerStore } from '@/stores/customerStore'

const route = useRoute()
const customer = ref(null)
const contacts = ref([])
const customerTrips = ref([])
const lastRating = ref(null)
const customerStore = useCustomerStore()
const router = useRouter()

onMounted(async () => {
  const idCustomer = route.params.id
  lastRating.value = (await ratingService.getLastRatingByCustomer(idCustomer)).data
  customer.value = (await customerService.getCustomerFull(idCustomer)).data
  contacts.value = (await customerService.getContactsByCustomer(idCustomer)).data
  customerTrips.value = (await customerTripService.getCustomerTripsByCustomer(idCustomer)).data
  customerStore.setCustomer(customer.value)
})

const edit = async () => {
  const responseUser = await alertService.editElement(customer.value.id_customer, 'Cliente')
  if (responseUser.isConfirmed) {
    router.push('/customerForm')
  }
}

const createContact = async () => {
  const responseUser = await alertService.createElement('Contacto')
  if (responseUser.isConfirmed) {
    router.push('/contactForm')
  }
}
</script>

<template>
  <div class="customer" v-if="customer && lastRating">
    <div class="customer-detail">
      <CustomerInfo :customer="customer" :lastRating="lastRating"></CustomerInfo>
    </div>
    <div class="customer_additional">
      <div class="contacts">
        <h2>Contactos</h2>
        <ContactTable :contacts="contacts"></ContactTable>
      </div>
      <div class="customer_trips">
        <h2>Viajes del cliente</h2>
        <CustomerTripTable :customerTrips="customerTrips"></CustomerTripTable>
      </div>
    </div>
  </div>
  <div v-else>
    <p>Cargando detalles...</p>
  </div>
  <div class="button-edit">
    <button @click="edit">Editar</button>
    <button @click="createContact">Crear Contacto</button>
  </div>
</template>

<style scoped>
.customer {
  display: flex;
}
.customer-detail {
  max-width: 600px;
  min-width: 500px;
  margin: 10px;
  padding: 10px;
  background-color: var(--light-border);
  border-radius: var(--border-radius-size);
  box-shadow: 0 2px 10px var(--shadow);
}

.button-edit button {
  margin: 2px;
}

.customer_additional {
  flex-grow: 1;
}
</style>
