<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { alertService } from '@/services/alertService'

import { useUserStore } from '@/stores/userStore.js'
import { useShipmentStore } from '@/stores/shipmentStore'

import { shipmentService } from '@/services/shipmentService'
import ShipmentInfo from '@/components/shipment/ShipmentInfo.vue'

const route = useRoute()
const shipment = ref(null)
const router = useRouter()
const userStore = useUserStore()
const shipmentStore = useShipmentStore()

onMounted(async () => {
  const idShipment = route.params.id
  shipment.value = (await shipmentService.getShipmentById(idShipment)).data
})

const edit = async () => {
  const responseUser = await alertService.editElement(shipment.value.id_shipment, 'Envio')
  if (responseUser.isConfirmed) {
    shipmentStore.setShipment(shipment.value)
    router.push('/shipmentForm')
  }
}
</script>

<template>
  <div v-if="shipment">
    <div class="shipment">
      <div class="shipment-header">
        <ShipmentInfo :shipment="shipment"></ShipmentInfo>
      </div>
      <div
        v-if="userStore.hasPermission('mediumHigh') | userStore.hasRole('Logistica')"
        class="button-edit"
      >
        <button @click="edit">Editar</button>
      </div>
    </div>
  </div>
  <div v-else>
    <p>Cargando detalles...</p>
  </div>
</template>

<style scoped>
.shipment-header {
  max-width: 1800px;
  min-width: 500px;
  margin: 10px;
  padding: 10px;
  background-color: var(--light-border);
  border-radius: var(--border-radius-size);
  box-shadow: 0 2px 10px var(--shadow);
}
</style>
