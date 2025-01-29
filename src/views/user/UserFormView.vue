<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'

import { alertService } from '@/services/alertService'

import { userService } from '@/services/userService'

import { useUserStore } from '@/stores/userStore'
import { basicModels } from '@/plugins/basicModels'
import UserForm from '@/components/user/UserForm.vue'
import { departmentService } from '@/services/departmentService'

const options = ref({
  departments: [],
  cities: []
})
const user = ref({})
const isEdit = ref(false)

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

if (route.params.status === 'me') {
  user.value = userStore.user
  isEdit.value = true
} else if (route.params.status === 'create') {
  user.value = basicModels.user
}

onMounted(async () => {
  options.value.departments = (await departmentService.getDepartments()).data
})

const save = async (userData) => {
  const validate = 'Validate user data'
  if (!isEdit.value) {
    const responseUser = await alertService.createElement('Usuario')
    if (responseUser.isConfirmed) {
      try {
        const response = await userService.createUser(userData)
        const id = response.data.id_user
        alertService.generalSucces(`El Usuario fue creado exitosamente con el ID ${id}`)
        router.push(`/user/me`)
      } catch {
        alertService.generalError(`El Usuario no pudo ser creado. ${validate}`)
      }
    }
  } else {
    const responseUser = await alertService.updateElement(userData.id_user, 'Usuario')
    if (responseUser.isConfirmed) {
      try {
        await userService.updateUser(userData.id_user, userData)
        alertService.generalSucces(
          `El Contacto con ID ${userData.id_user}, fue actualizado exitosamente`
        )
        router.push(`/user/me`)
      } catch {
        alertService.generalError(
          `El Contacto con ID  ${userData.id_user}, no pudo ser actualizado. ${validate}`
        )
      }
    }
  }
}
</script>

<template>
  <div>
    <h2>
      {{ isEdit ? `Actualizar Usuario: ID ${user.id_user}` : 'Crear Usuario' }}
    </h2>
    <UserForm :initialUser="user" :options="options" :isEdit="isEdit" @save="save" />
  </div>
</template>
