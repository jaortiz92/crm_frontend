<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useOrderStore } from '@/stores/orderStore'

import { basicModels } from '@/plugins/basicModels'
import { alertService } from '@/services/alertService'

import AdvanceFrom from '@/components/advance/AdvanceForm.vue'

import { advanceService } from '@/services/advanceService'
import { orderService } from '@/services/orderService'

const route = useRoute()
const isEdit = ref(false)
const router = useRouter()
const orderStore = useOrderStore()
const advance = ref({})
const order = ref(basicModels.order)
const loading = ref(true)

async function generateData() {
  const idAdvance = route.params.id || null
  if (idAdvance) {
    advance.value = (await advanceService.getAdvanceById(idAdvance)).data
    isEdit.value = true
  } else {
    advance.value = basicModels.advance
  }

  if (orderStore.isThereOrder()) {
    order.value = orderStore.getOrder()
  } else {
    if (advance.value.id_order === null) {
      order.value = (await orderService.getOrderById(route.params.idOrder)).data
    } else {
      order.value = (await orderService.getOrderById(advance.value.id_order)).data
    }
  }
  loading.value = false
}

const save = async (advance) => {
  if (!isEdit.value) {
    const responseUser = await alertService.createElement('Anticipo')
    if (responseUser.isConfirmed) {
      try {
        const response = await advanceService.createAdvance(advance)
        const id = response.data.id_advance
        alertService.generalSucces(`El Anticipo fue creado exitosamente con el ID ${id}`)
        router.push(`/order/${advance.id_order}`)
      } catch {
        alertService.generalError(`El Anticipo no pudo ser creado.`)
      }
    }
  } else {
    const responseUser = await alertService.updateElement(advance.id_advance, 'Anticipo')
    if (responseUser.isConfirmed) {
      try {
        await advanceService.updateAdvance(advance.id_advance, advance)
        alertService.generalSucces(
          `El Anticipo con ID ${advance.id_advance}, fue actualizado exitosamente`
        )
        router.push(`/order/${advance.id_order}`)
      } catch {
        alertService.generalError(
          `El Anticipo con ID ${advance.id_advance}, no pudo ser actualizado`
        )
      }
    }
  }
}

generateData()
</script>

<template>
  <div>
    <h2>
      {{ isEdit ? `Actualizar Anticipo: ID ${advance.id_advance}` : 'Crear Anticipo' }}
    </h2>
    <div v-if="loading"><p>Cargando...</p></div>
    <AdvanceFrom
      v-else
      :initialAdvance="advance"
      :order="order"
      :isEdit="isEdit"
      @save="save"
    ></AdvanceFrom>
  </div>
</template>
