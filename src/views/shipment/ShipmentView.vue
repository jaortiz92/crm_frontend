<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/userStore.js'
import { useShipmentStore } from '@/stores/shipmentStore'

import ShipmentTable from '@/components/shipment/ShipmentTable.vue'
import FilterForm from '@/components/FilterForm.vue'

import { alertService } from '@/services/alertService'
import { shipmentService } from '@/services/shipmentService'

import { filterFormat } from '@/plugins/filterFormat'

const userStore = useUserStore()
const id_user = ref('')
const shipments = ref([])
const filteredShipments = ref([])
const shipmentStore = useShipmentStore()
const router = useRouter()

const addShipments = async () => {
  try {
    const response = await shipmentService.getShipments(id_user.value)
    shipments.value = response.data
    filteredShipments.value = [...shipments.value]
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

const shipmentFilterFields = [
  filterFormat.noInvoice,
  filterFormat.carrier,
  filterFormat.trackingNumber,
  filterFormat.costFrom,
  filterFormat.costUntil,
  filterFormat.completed,
  filterFormat.creationDateFrom,
  filterFormat.creationDateUntil,
  filterFormat.estimatedDateFrom,
  filterFormat.estimatedDateUntil,
  filterFormat.completedDateFrom,
  filterFormat.completedDateUntil
]

const filter = (filterValues, checkboxTouched) => {
  filteredShipments.value = shipments.value.filter(
    (shipment) =>
      (!filterValues.creationDateFrom || shipment.shipment_date >= filterValues.creationDateFrom) &&
      (!filterValues.creationDateUntil ||
        shipment.shipment_date <= filterValues.creationDateUntil) &&
      (!filterValues.estimatedDateFrom ||
        shipment.estimated_delivery_date >= filterValues.estimatedDateFrom) &&
      (!filterValues.estimatedDateUntil ||
        shipment.estimated_delivery_date <= filterValues.estimatedDateUntil) &&
      (!filterValues.completedDateFrom ||
        shipment.received_date >= filterValues.completedDateFrom) &&
      (!filterValues.completedDateUntil ||
        shipment.received_date <= filterValues.completedDateUntil) &&
      (!checkboxTouched.completed || shipment.received === filterValues.completed) &&
      (!filterValues.noInvoice ||
        shipment.invoice.invoice_number
          .toLowerCase()
          .includes(filterValues.noInvoice.toLowerCase())) &&
      (!filterValues.carrier ||
        shipment.carrier.toLowerCase().includes(filterValues.carrier.toLowerCase())) &&
      (!filterValues.trackingNumber ||
        shipment.tracking_number
          .toLowerCase()
          .includes(filterValues.trackingNumber.toLowerCase())) &&
      (!filterValues.costFrom || shipment.shipment_cost >= filterValues.costFrom) &&
      (!filterValues.costUntil || shipment.shipment_cost <= filterValues.costUntil)
  )
}

const create = () => {
  shipmentStore.clearShipment()
  router.push('/shipmentForm')
}

addDataUser()
</script>

<template>
  <div
    v-if="userStore.hasPermission('mediumHigh') | userStore.hasRole('Logistica')"
    class="button-create"
  >
    <button @click="create">Crear</button>
  </div>
  <main>
    <div>
      <h3>Envios</h3>
      <FilterForm :filterFields="shipmentFilterFields" @filter="filter" />
      <ShipmentTable :shipments="filteredShipments" :additionalInfo="true"></ShipmentTable>
    </div>
  </main>
  {{ shipments }}
</template>
