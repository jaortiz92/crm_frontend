<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useOrderStore } from '@/stores/orderStore'

import { basicModels } from '@/plugins/basicModels'
import { alertService } from '@/services/alertService'

import OrderFrom from '@/components/order/OrderForm.vue'

import { userService } from '@/services/userService'
import { orderService } from '@/services/orderService'
import { paymentMethodService } from '@/services/paymentMethodService'

const options = ref({
  users: [],
  paymentMethods: []
})
const order = ref({})
const isEdit = ref(false)
const router = useRouter()
const orderStore = useOrderStore()
const isLoading = ref(false)

if (orderStore.isThereOrder()) {
  order.value = orderStore.getOrder()
  isEdit.value = true
} else {
  order.value = basicModels.order
}

onMounted(async () => {
  options.value.users = (await userService.getUsers(0, 1000)).data
  options.value.paymentMethods = (await paymentMethodService.getPaymentMethodService()).data
})

const saveFile = async (id_order, file) => {
  const formData = new FormData()
  formData.append('details', file)
  return await orderService.createOrderDetails(id_order, formData)
}

const save = async (order, file) => {
  if (!order.completed) {
    order.execution_date = null
  }

  if (!isEdit.value) {
    const responseUser = await alertService.createElement('Orden')
    if (responseUser.isConfirmed) {
      isLoading.value = true
      try {
        const response = await orderService.createOrder(order)
        const id = response.data.id_order
        if (file) {
          await saveFile(id, file)
        }

        alertService.generalSucces(`La Orden fue creadá exitosamente con el ID ${id}`)
        router.push(`order/${id}`)
      } catch {
        alertService.generalError(`La Orden no pudo ser creada.`)
      }
    }
  } else {
    const responseUser = await alertService.updateElement(order.id_order, 'Orden')
    if (responseUser.isConfirmed) {
      isLoading.value = true
      try {
        await orderService.updateOrder(order.id_order, order)
        if (file) {
          await saveFile(order.id_order, file)
        }
        alertService.generalSucces(
          `La Orden con ID ${order.id_order}, fue actualizada exitosamente`
        )
        router.push(`order/${order.id_order}`)
      } catch {
        alertService.generalError(`La Orden con ID ${order.id_order}, no pudo ser actualizada`)
      }
    }
  }

  isLoading.value = false
}
</script>

<template>
  <div v-if="isLoading" class="global-loading-overlay">
    <p>Procesando, por favor espere...</p>
    <div class="spinner"></div>
  </div>
  <div>
    <h2>{{ isEdit ? `Actualizar Orden: ID ${order.id_order}` : 'Crear Orden' }}</h2>
    <OrderFrom
      :initialOrder="order"
      :options="options"
      :isEdit="isEdit"
      @save="save"
      @saveFile="saveFile"
    ></OrderFrom>
  </div>
</template>
