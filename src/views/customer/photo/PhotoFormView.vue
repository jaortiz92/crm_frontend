<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePhotoStore } from '@/stores/photoStore'
import { useCustomerStore } from '@/stores/customerStore'

import { basicModels } from '@/plugins/basicModels'
import { alertService } from '@/services/alertService'

import PhotoFrom from '@/components/customer/photo/PhotoForm.vue'

import { photoService } from '@/services/photoService'
import { customerService } from '@/services/customerService'

const options = ref({
  customers: []
})
const photo = ref({})
const isEdit = ref(false)
const router = useRouter()
const customer = ref(null)

const photoStore = usePhotoStore()
const customerStore = useCustomerStore()

if (photoStore.isTherePhoto()) {
  photo.value = photoStore.getPhoto()
  isEdit.value = true
} else {
  photo.value = basicModels.photo
  if (customerStore.isThereCustomer()) {
    customer.value = customerStore.getCustomer()
    photo.value.id_customer = customer.value.id_customer
  }
}

onMounted(async () => {
  options.value.customers = (await customerService.getCustomers(0, 1000)).data
})

const save = async (photo) => {
  if (!isEdit.value) {
    const responseUser = await alertService.createElement('Foto')
    if (responseUser.isConfirmed) {
      try {
        const response = await photoService.createPhoto(photo)
        const id = response.data.id_photo
        const id_customer = response.data.id_customer
        alertService.generalSucces(`La Foto fue creadá exitosamente con el ID ${id}`)
        router.push(`customer/${id_customer}`)
      } catch {
        alertService.generalError(`La Foto no pudo ser creada.`)
      }
    }
  } else {
    const responseUser = await alertService.updateElement(photo.id_photo, 'Foto')
    if (responseUser.isConfirmed) {
      try {
        await photoService.updatePhoto(photo.id_photo, photo)
        alertService.generalSucces(`La Foto con ID ${photo.id_photo}, fue actualizada exitosamente`)
        router.push(`customer/${photo.id_customer}`)
      } catch {
        alertService.generalError(`La Foto con ID ${photo.id_photo}, no pudo ser actualizada`)
      }
    }
  }
}
</script>

<template>
  <div class="form-page">
    <div class="section-header">
      <div class="section-accent"></div>
      <h2 class="section-title">
        {{ isEdit ? `Actualizar Foto: ID ${photo.id_photo}` : 'Crear Foto' }}
      </h2>
    </div>
    <PhotoFrom :initialPhoto="photo" :options="options" :isEdit="isEdit" @save="save"></PhotoFrom>
  </div>
</template>

<style scoped>
.form-page {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
}

@media (max-width: 768px) {
  .form-page {
    padding: 20px;
  }
}
</style>
