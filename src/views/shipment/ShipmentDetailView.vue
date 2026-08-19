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
  <div v-if="shipment" class="shipment-page">
    <div class="shipment-card-wrapper">
      <ShipmentInfo :shipment="shipment"></ShipmentInfo>
    </div>

    <div class="actions-bar">
      <button
        v-if="userStore.hasPermission('mediumHigh') || userStore.hasRole('Logistica')"
        class="btn btn-primary"
        @click="edit"
      >
        Editar
      </button>
    </div>
  </div>

  <div v-else class="loading">
    <p>Cargando detalles...</p>
  </div>
</template>

<style scoped>
.shipment-page {
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
  padding: 24px;
}

.shipment-card-wrapper {
  width: 100%;
  margin-bottom: 24px;
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

@media (max-width: 768px) {
  .shipment-page {
    padding: 20px;
  }
}
</style>
