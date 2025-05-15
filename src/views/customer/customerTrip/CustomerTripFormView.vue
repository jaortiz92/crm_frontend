<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCustomerTripStore } from '@/stores/customerTripStore'

import { basicModels } from '@/plugins/basicModels'
import { alertService } from '@/services/alertService'

import CustomerTripFrom from '@/components/customer/customerTrip/CustomerTripForm.vue'

import { customerTripService } from '@/services/customerTripService'
import { customerService } from '@/services/customerService'
import { userService } from '@/services/userService'
import { collectionService } from '@/services/collectionService'

const options = ref({
  customers: [],
  users: []
})
const customerTrip = ref({})
const isEdit = ref(false)
const router = useRouter()
const customerTripStore = useCustomerTripStore()

if (customerTripStore.isThereCustomerTrip()) {
  customerTrip.value = customerTripStore.getCustomerTrip()
  isEdit.value = true
} else if (customerTripStore.isThereCustomer()) {
  customerTrip.value = customerTripStore.getCustomerTrip()
} else {
  customerTrip.value = basicModels.customerTrip
}

onMounted(async () => {
  options.value.customers = (await customerService.getCustomers(0, 1000)).data
  options.value.users = (await userService.getUsers(0, 1000)).data
  options.value.collections = (await collectionService.getCollections()).data
})

const save = async (customerTrip) => {
  if (!isEdit.value) {
    const responseUser = await alertService.createElement('Viaje del cliente')
    if (responseUser.isConfirmed) {
      try {
        const response = await customerTripService.createCustomerTrip(customerTrip)
        const id = response.data.id_customer_trip
        alertService.generalSucces(`El Viaje del cliente fue creado exitosamente con el ID ${id}`)
        router.push(`customerTrip/${id}`)
      } catch {
        alertService.generalError(`El Viaje del cliente no pudo ser creado.`)
      }
    }
  } else {
    const responseUser = await alertService.updateElement(
      customerTrip.id_customer_trip,
      'Viaje del cliente'
    )
    if (responseUser.isConfirmed) {
      try {
        await customerTripService.updateCustomerTrip(customerTrip.id_customer_trip, customerTrip)
        alertService.generalSucces(
          `El Viaje del cliente con ID ${customerTrip.id_customer_trip}, fue actualizada exitosamente`
        )
        router.push(`customerTrip/${customerTrip.id_customer_trip}`)
      } catch {
        alertService.generalError(
          `El Viaje del cliente con ID ${customerTrip.id_customer_trip}, no pudo ser actualizada`
        )
      }
    }
  }
}
</script>

<template>
  <div>
    <h2>
      {{
        isEdit
          ? `Actualizar Viaje del cliente: ID ${customerTrip.id_customer_trip}`
          : 'Crear Viaje del cliente'
      }}
    </h2>
    <CustomerTripFrom
      :initialCustomerTrip="customerTrip"
      :options="options"
      :isEdit="isEdit"
      @save="save"
    ></CustomerTripFrom>
  </div>
</template>
