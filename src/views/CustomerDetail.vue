<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'

import { customerService } from '@/services/customerService'
import { customerTripService } from '@/services/customerTripService'

import ContactTable from '@/components/customer/contact/ContactTable.vue'
import CustomerInfo from '@/components/customer/CustomerInfo.vue'
import CustomerTripTable from '@/components/customer/customerTrip/CustomerTripTable.vue'

const route = useRoute()
const customer = ref(null)
const contacts = ref([])
const customerTrips = ref([])

onMounted(async () => {
  const idCustomer = route.params.id
  customer.value = (await customerService.getCustomerFull(idCustomer)).data
  contacts.value = (await customerService.getContactsByCustomer(idCustomer)).data
  customerTrips.value = (await customerTripService.getCustomerTripsByCustomer(idCustomer)).data
})
</script>

<template>
  <div class="customer" v-if="customer">
    <div class="customer-detail">
      <CustomerInfo :customer="customer"></CustomerInfo>
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

.customer_additional {
  flex-grow: 1;
}
</style>
