<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { alertService } from '@/services/alertService'

import { customerService } from '@/services/customerService'
import { customerTripService } from '@/services/customerTripService'
import { ratingService } from '@/services/ratingService'
import { activityService } from '@/services/activityService'
import { taskService } from '@/services/taskService'
import { photoService } from '@/services/photoService'

import ContactTable from '@/components/customer/contact/ContactTable.vue'
import CustomerInfo from '@/components/customer/CustomerInfo.vue'
import CustomerTripTable from '@/components/customer/customerTrip/CustomerTripTable.vue'
import ActivityTable from '@/components/activity/ActivityTable.vue'
import TaskTable from '@/components/task/TaskTable.vue'
import CustomerSummaryTable from '@/components/customer/CustomerSummaryTable.vue'
import { useUserStore } from '@/stores/userStore.js'
import { useCustomerStore } from '@/stores/customerStore'
import { useContactStore } from '@/stores/contactStore'
import { usePhotoStore } from '@/stores/photoStore'
import { useCustomerTripStore } from '@/stores/customerTripStore'

import CustomerPhotos from '@/components/customer/photo/CustomerPhotos.vue'

const route = useRoute()
const idCustomer = route.params.id
const customer = ref(null)
const contacts = ref([])
const customerTrips = ref([])
const customerSummary = ref([])
const lastRating = ref(null)
const userStore = useUserStore()
const customerStore = useCustomerStore()
const contactStore = useContactStore()
const photoStore = usePhotoStore()
const customerTripStore = useCustomerTripStore()
const router = useRouter()
const showAll = ref(false)
const activities = ref([])
const tasks = ref([])
const photos = ref([])

const canEdit = () => userStore.hasPermission('mediumHigh') || userStore.hasRole('Asesor Comercial')

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

const editPhoto = async (photo) => {
  const responseUser = await alertService.editElement(photo.id_photo, 'Foto')
  if (responseUser.isConfirmed) {
    photoStore.setPhoto(photo)
    router.push('/photoForm')
  }
}

const createPhoto = async () => {
  const responseUser = await alertService.createElement('Foto')
  if (responseUser.isConfirmed) {
    photoStore.clearPhoto()
    router.push('/photoForm')
  }
}

const createContact = async () => {
  const responseUser = await alertService.createElement('Contacto')
  if (responseUser.isConfirmed) {
    contactStore.clearContact()
    router.push('/contactForm')
  }
}

const createCustomerTrip = () => {
  customerTripStore.crateCustomerTripWithId(idCustomer)
  router.push('/customerTripForm')
}

const activateShowAll = async () => {
  activities.value = (await activityService.getActivitiesByCustomer(idCustomer)).data
  tasks.value = (await taskService.getTasksByCustomer(idCustomer)).data
  photos.value = (await photoService.getPhotoByIdCustomer(idCustomer)).data
  showAll.value = true
}
</script>

<template>
  <div v-if="customer && lastRating" class="customer-page">
    <div class="customer-card-wrapper">
      <CustomerInfo :customer="customer" :lastRating="lastRating"></CustomerInfo>
    </div>

    <div class="summary-card">
      <div class="summary-header">
        <div class="section-header">
          <div class="section-accent"></div>
          <h2 class="section-title">Resumen</h2>
        </div>
        <div v-if="canEdit()" class="actions-bar">
          <button class="btn btn-primary" @click="edit">Editar Cliente</button>
          <button class="btn btn-secondary" @click="createContact">Crear Contacto</button>
          <button class="btn btn-primary" @click="createCustomerTrip">Crear Viaje del cliente</button>
        </div>
        <button v-if="!showAll" class="btn btn-outline" @click="activateShowAll">
          Mostrar más información
        </button>
      </div>
      <CustomerSummaryTable :customerSummary="customerSummary"></CustomerSummaryTable>
    </div>


    <section class="detail-section">
      <div class="section-header">
        <div class="section-accent"></div>
        <h2 class="section-title">Contactos</h2>
      </div>
      <ContactTable :contacts="contacts"></ContactTable>
    </section>

    <section class="detail-section">
      <div class="section-header">
        <div class="section-accent"></div>
        <h2 class="section-title">Viajes del cliente</h2>
      </div>
      <CustomerTripTable :customerTrips="customerTrips"></CustomerTripTable>
    </section>

    <div v-if="showAll" class="more-information">
      <div class="detail-section">
        <div class="section-header">
          <div class="section-accent"></div>
          <h3 class="section-title">Fotos</h3>
        </div>
        <CustomerPhotos
          :photos="photos"
          @editPhoto="editPhoto"
          @createPhoto="createPhoto"
        ></CustomerPhotos>
      </div>

      <div class="detail-section">
        <div class="section-header">
          <div class="section-accent"></div>
          <h3 class="section-title">Actividades</h3>
        </div>
        <ActivityTable
          :activities="activities"
          :additionalInfo="true"
          :itemsScale="10"
        ></ActivityTable>
      </div>

      <div class="detail-section">
        <div class="section-header">
          <div class="section-accent"></div>
          <h3 class="section-title">Tareas</h3>
        </div>
        <TaskTable :tasks="tasks" :additionalInfo="true" :itemsScale="10"></TaskTable>
      </div>
    </div>
  </div>

  <div v-else class="loading">
    <p>Cargando detalles...</p>
  </div>
</template>

<style scoped>
.customer-page {
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
  padding: 24px;
}

.customer-card-wrapper {
  width: 100%;
  margin-bottom: 24px;
}

.summary-card {
  width: 100%;
  margin-bottom: 24px;
}

.summary-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.detail-section {
  margin-bottom: 32px;
}

.actions-bar {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 0;
}

.loading {
  padding: 24px;
  text-align: center;
  color: var(--color-text-secondary, #616161);
}

.more-information {
  margin-top: 16px;
}

@media (max-width: 1024px) {
  .summary-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
}

@media (max-width: 768px) {
  .customer-page {
    padding: 20px;
  }

  .summary-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
}
</style>
