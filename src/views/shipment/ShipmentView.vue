<script setup>
import { ref } from 'vue'
import { useUserStore } from '@/stores/userStore.js'

import ShipmentTable from '@/components/shipment/ShipmentTable.vue'

import { alertService } from '@/services/alertService'
import { shipmentService } from '@/services/shipmentService'

const userStore = useUserStore()
const id_user = ref('')
const shipments = ref([])

const addShipments = async () => {
  try {
    const response = await shipmentService.getShipments(id_user.value)
    shipments.value = response.data
  } catch (error) {
    alertService.generalError('Los envios no se pudieron cargar')
  }
}

const addDataUser = async () => {
  id_user.value = await userStore.user.id_user
  if (id_user.value) {
    addShipments()
  }
}

addDataUser()
</script>

<template>
  <main>
    <div>
      <h3>Envios</h3>
      <ShipmentTable :shipments="shipments" :additionalInfo="true"></ShipmentTable>
    </div>
  </main>
</template>
