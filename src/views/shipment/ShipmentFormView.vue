<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/userStore.js'
import { useShipmentStore } from '@/stores/shipmentStore'

import { basicModels } from '@/plugins/basicModels'
import { alertService } from '@/services/alertService'

import ShipmentFrom from '@/components/shipment/ShipmentForm.vue'

import { customerService } from '@/services/customerService'
import { userService } from '@/services/userService'
import { shipmentService } from '@/services/shipmentService'

const options = ref({
  customers: [],
  users: []
})
const shipment = ref({})
const isEdit = ref(false)
const router = useRouter()

const userStore = useUserStore()
const shipmentStore = useShipmentStore()

if (shipmentStore.isThereShipment()) {
  shipment.value = shipmentStore.getShipment()
  isEdit.value = true
} else {
  shipment.value = basicModels.shipment
}

onMounted(async () => {
  options.value.customers = (await customerService.getCustomers(0, 1000)).data
  options.value.users = (await userService.getUsers(0, 1000)).data
})

const save = async (shipment) => {
  if (!shipment.completed) {
    shipment.execution_date = null
  }

  if (!isEdit.value) {
    const responseUser = await alertService.createElement('Envio')
    if (responseUser.isConfirmed) {
      try {
        shipment.id_creator = userStore.user.id_user
        shipment.creation_date = new Date().toISOString().split('T')[0]
        const response = await shipmentService.createShipment(shipment)
        const id = response.data.id_shipment
        alertService.generalSucces(`La Envio fue creadá exitosamente con el ID ${id}`)
        router.push(`shipment/${id}`)
      } catch {
        alertService.generalError(`La Envio no pudo ser creada.`)
      }
    }
  } else {
    const responseUser = await alertService.updateElement(shipment.id_shipment, 'Envio')
    if (responseUser.isConfirmed) {
      try {
        await shipmentService.updateShipment(shipment.id_shipment, shipment)
        alertService.generalSucces(
          `La Envio con ID ${shipment.id_shipment}, fue actualizada exitosamente`
        )
        router.push(`shipment/${shipment.id_shipment}`)
      } catch {
        alertService.generalError(
          `La Envio con ID ${shipment.id_shipment}, no pudo ser actualizada`
        )
      }
    }
  }
}
</script>

<template>
  <div>
    <h2>{{ isEdit ? `Actualizar Envio: ID ${shipment.id_shipment}` : 'Crear Envio' }}</h2>
    <ShipmentFrom
      :initialShipment="shipment"
      :options="options"
      :isEdit="isEdit"
      @save="save"
    ></ShipmentFrom>
  </div>
</template>
