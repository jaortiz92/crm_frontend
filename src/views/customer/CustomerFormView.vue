<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCustomerStore } from '@/stores/customerStore'
import { storeTypeService } from '@/services/storeTypeService'
import { brandService } from '@/services/brandService'

import { basicModels } from '@/plugins/basicModels'
import { alertService } from '@/services/alertService'

import CustomerFrom from '@/components/customer/CustomerForm.vue'

import { customerService } from '@/services/customerService'
import { userService } from '@/services/userService'
import { departmentService } from '@/services/departmentService'

const options = ref({
  users: [],
  storeTypes: [],
  brands: [],
  departments: [],
  cities: []
})
const customer = ref({})
const isEdit = ref(false)
const router = useRouter()
const customerStore = useCustomerStore()

if (customerStore.isThereCustomer()) {
  customer.value = customerStore.getCustomer()
  isEdit.value = true
} else {
  customer.value = basicModels.customer
}

onMounted(async () => {
  options.value.users = (await userService.getUsers(0, 1000)).data
  options.value.storeTypes = (await storeTypeService.getStoreTypes()).data
  options.value.brands = (await brandService.getBrands()).data
  options.value.departments = (await departmentService.getDepartments()).data
})

const save = async (customer) => {
  const validate = 'Validar numero de documento'
  customer.phone = customer.phone.toString()
  if (!isEdit.value) {
    const responseUser = await alertService.createElement('Cliente')
    if (responseUser.isConfirmed) {
      try {
        const response = await customerService.createCustomer(customer)
        const id = response.data.id_customer
        alertService.generalSucces(`El Cliente fue creado exitosamente con el ID ${id}`)
        router.push(`customer/${id}`)
      } catch {
        alertService.generalError(`El Cliente no pudo ser creado. ${validate}`)
      }
    }
  } else {
    const responseUser = await alertService.updateElement(customer.id_customer, 'Cliente')
    if (responseUser.isConfirmed) {
      try {
        await customerService.updateCustomer(customer.id_customer, customer)
        alertService.generalSucces(
          `El Cliente con ID ${customer.id_customer}, fue actualizada exitosamente`
        )
        router.push(`customer/${customer.id_customer}`)
      } catch {
        alertService.generalError(
          `El Cliente con ID ${customer.id_customer}, no pudo ser actualizada. ${validate}`
        )
      }
    }
  }
}
</script>

<template>
  <div>
    <h2>
      {{ isEdit ? `Actualizar Cliente: ID ${customer.id_customer}` : 'Crear Cliente' }}
    </h2>
    <CustomerFrom
      :initialCustomer="customer"
      :options="options"
      :isEdit="isEdit"
      @save="save"
    ></CustomerFrom>
  </div>
</template>
