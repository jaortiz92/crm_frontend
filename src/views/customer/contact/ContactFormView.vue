<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useContactStore } from '@/stores/contactStore'
import { useCustomerStore } from '@/stores/customerStore'

import { basicModels } from '@/plugins/basicModels'
import { alertService } from '@/services/alertService'

import ContactFrom from '@/components/customer/contact/ContactForm.vue'

import { customerService } from '@/services/customerService'
import { departmentService } from '@/services/departmentService'
import { roleService } from '@/services/roleService'

const options = ref({
  roles: [],
  departments: [],
  cities: []
})
const contact = ref({})
const customer = ref({})
const isEdit = ref(false)
const router = useRouter()
const contactStore = useContactStore()
const customerStore = useCustomerStore()

if (contactStore.isThereContact()) {
  contact.value = contactStore.getContact()
  isEdit.value = true
} else {
  contact.value = basicModels.contact
}

if (customerStore.isThereCustomer()) {
  customer.value = customerStore.getCustomer()
} else {
  customer.value.id_customer = null
}

onMounted(async () => {
  options.value.departments = (await departmentService.getDepartments()).data
  options.value.roles = (await roleService.getRoles()).data
})

const save = async (contact) => {
  if (!contact.id_customer) {
    contact.id_customer = (
      await alertService.generalInput(
        'Inserta ID',
        'Ingresa el ID de la compañia al cual desea agregar el contacto',
        'number',
        'Es obligatorio agregar el ID'
      )
    ).value
  }

  const validate = 'Validar numero de documento'
  contact.phone = contact.phone.toString()
  if (!isEdit.value) {
    const responseUser = await alertService.createElement('Contacto')
    if (responseUser.isConfirmed) {
      try {
        const response = await customerService.createContact(contact)
        const id = response.data.id_contact
        alertService.generalSucces(`El Contacto fue creado exitosamente con el ID ${id}`)
        router.push(`customer/${contact.id_customer}`)
      } catch {
        alertService.generalError(`El Contacto no pudo ser creado. ${validate}`)
      }
    }
  } else {
    const responseUser = await alertService.updateElement(contact.id_contact, 'Contacto')
    if (responseUser.isConfirmed) {
      try {
        await customerService.updateContact(contact.id_contact, contact)
        alertService.generalSucces(
          `El Contacto con ID ${contact.id_contact}, fue actualizada exitosamente`
        )
        router.push(`customer/${contact.id_customer}`)
      } catch {
        alertService.generalError(
          `El Contacto con ID ${contact.id_contact}, no pudo ser actualizada. ${validate}`
        )
      }
    }
  }
}
</script>

<template>
  <div>
    <h2>
      {{ isEdit ? `Actualizar Contacto: ID ${contact.id_contact}` : 'Crear Contacto' }}
    </h2>
    <h2 v-if="customer.id_customer">
      {{ `A la compañia: ${customer.company_name}` }}
    </h2>
    <ContactFrom
      :initialContact="contact"
      :options="options"
      :isEdit="isEdit"
      :customer="customer"
      @save="save"
    ></ContactFrom>
  </div>
</template>
