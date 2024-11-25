<script setup>
import { ref, onMounted } from 'vue'
import { useUserStore } from '@/stores/userStore.js'

import TaskFrom from '@/components/task/TaskFrom.vue'

import { customerService } from '@/services/customerService'
import { userService } from '@/services/userService'

const options = ref({
  customers: [],
  users: []
})
const userStore = useUserStore()

onMounted(async () => {
  options.value.customers = (await customerService.getCustomers(0, 1000)).data
  options.value.users = (await userService.getUsers(0, 1000)).data
})

const save = (task) => {
  task.value.id_creator = userStore.user.id_user
  task.value.creation_date = new Date().toISOString().split('T')[0]
  console.log('Formulario enviado con:', task.value)
}
</script>

<template>
  <div>
    <h2>Crear o Editar Actividad</h2>
    <TaskFrom :options="options" @save="save"></TaskFrom>
  </div>
</template>
