<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useContactStore } from '@/stores/contactStore'
import { useStoreTypeService } from '@/services/storeTypeService'
import { useBrandService } from '@/services/brandService'

import { basicModels } from '@/plugins/basicModels'
import { alertService } from '@/services/alertService'

import ContactFrom from '@/components/customer/contact/ContactForm.vue'

import { customerService } from '@/services/customerService'
import { userService } from '@/services/userService'
import { useDepartmentService } from '@/services/departmentService'

const options = ref({
  users: [],
  storeTypes: [],
  brands: [],
  departments: [],
  cities: []
})
const contact = ref({})
const isEdit = ref(false)
const router = useRouter()
const contactStore = useContactStore()

if (contactStore.isThereContact()) {
  contact.value = contactStore.getContact()
  isEdit.value = true
} else {
  contact.value = basicModels.contact
}

onMounted(async () => {
  options.value.users = (await userService.getUsers(0, 1000)).data
  options.value.storeTypes = (await useStoreTypeService.getStoreTypes()).data
  options.value.brands = (await useBrandService.getBrands()).data
  options.value.departments = (await useDepartmentService.getDepartments()).data
})

const save = async (contact) => {
  const validate = 'Validar numero de documento'
  contact.phone = contact.phone.toString()
  if (!isEdit.value) {
    const responseUser = await alertService.createElement('Contacto')
    if (responseUser.isConfirmed) {
      try {
        const response = await customerService.createContact(contact)
        const id = response.data.id_contact
        alertService.generalSucces(`El Contacto fue creado exitosamente con el ID ${id}`)
        router.push(`contact/${id}`)
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
        router.push(`contact/${contact.id_contact}`)
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
    <ContactFrom
      :initialContact="contact"
      :options="options"
      :isEdit="isEdit"
      @save="save"
    ></ContactFrom>
  </div>
</template>
