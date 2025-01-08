<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { alertService } from '@/services/alertService'

import { customerService } from '@/services/customerService'
import { customerTripService } from '@/services/customerTripService'
import { ratingService } from '@/services/ratingService'
import { activityService } from '@/services/activityService'
import { taskService } from '@/services/taskService'

import ContactTable from '@/components/customer/contact/ContactTable.vue'
import CustomerInfo from '@/components/customer/CustomerInfo.vue'
import CustomerTripTable from '@/components/customer/customerTrip/CustomerTripTable.vue'
import ActivityTable from '@/components/activity/ActivityTable.vue'
import TaskTable from '@/components/task/TaskTable.vue'
import CustomerSummaryTable from '@/components/customer/CustomerSummaryTable.vue'
import { useCustomerStore } from '@/stores/customerStore'
import { useContactStore } from '@/stores/contactStore'

const route = useRoute()
const idCustomer = route.params.id
const customer = ref(null)
const contacts = ref([])
const customerTrips = ref([])
const customerSummary = ref([])
const lastRating = ref(null)
const customerStore = useCustomerStore()
const contactStore = useContactStore()
const router = useRouter()
const showAll = ref(false)
const activities = ref([])
const tasks = ref([])

onMounted(async () => {
  lastRating.value = (await ratingService.getLastRatingByCustomer(idCustomer)).data
  customer.value = (await customerService.getCustomerFull(idCustomer)).data
  contacts.value = (await customerService.getContactsByCustomer(idCustomer)).data
  customerTrips.value = (await customerTripService.getCustomerTripsByCustomer(idCustomer)).data
  customerStore.setCustomer(customer.value)
  customerSummary.value = (await customerService.getCustomerSummary(idCustomer)).data
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
    contactStore.clearContact()
    router.push('/contactForm')
  }
}

const activateShowAll = async () => {
  activities.value = (await activityService.getActivitiesByCustomer(idCustomer)).data
  tasks.value = (await taskService.getTasksByCustomer(idCustomer)).data
  showAll.value = true
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
  <div class="customer_summary">
    <h2>Resumen</h2>
    <CustomerSummaryTable :customerSummary="customerSummary"></CustomerSummaryTable>
  </div>
  <div class="button-edit">
    <button v-if="!showAll" @click="activateShowAll">Mostrar MasInformación</button>
    <button @click="edit">Editar</button>
    <button @click="createContact">Crear Contacto</button>
  </div>
  <div class="more-information" v-if="showAll">
    <h2>Actividades</h2>
    <ActivityTable :activities="activities" :additionalInfo="true" :itemsScale="10"></ActivityTable>
    <h2>Tareas</h2>
    <TaskTable :tasks="tasks" :additionalInfo="true" :itemsScale="10"></TaskTable>
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
