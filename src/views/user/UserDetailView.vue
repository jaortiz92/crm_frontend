<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

import { alertService } from '@/services/alertService'
import { userService } from '@/services/userService'

import UserInfo from '@/components/user/UserInfo.vue'
import { useUserStore } from '@/stores/userStore'

const user = ref(null)
const idUser = ref(null)
const userStore = useUserStore()
const router = useRouter()

onMounted(async () => {
  idUser.value = userStore.user.id_user
  user.value = (await userService.getUser(idUser.value)).data
})

const edit = async () => {
  const responseUser = await alertService.editElementCustomized(
    user.value.username,
    'Username',
    'Usuario'
  )
  if (responseUser.isConfirmed) {
    router.push('/userForm/edit-create/me')
  }
}

const createUser = async () => {
  const responseUser = await alertService.createElement('Usuario')
  if (responseUser.isConfirmed) {
    router.push('/userForm/edit-create/create')
  }
}

const updatePassword = async () => {
  const responseUser = await alertService.generalQuestion(
    `¿Quiere cambiar la contraseña del usuario ${user.value.username}?`
  )
  if (responseUser.isConfirmed) {
    router.push('/updatePassword')
  }
}
</script>

<template>
  <div class="user" v-if="user">
    <div class="user-detail">
      <UserInfo :user="user"></UserInfo>
    </div>
  </div>
  <div v-else>
    <p>Cargando detalles...</p>
  </div>
  <div class="user_summary"></div>
  <div class="button-edit">
    <button @click="edit">Editar</button>
    <button @click="createUser">Crear Usuario</button>
    <button @click="updatePassword">Cambiar contraseña</button>
  </div>
</template>

<style scoped>
.user {
  display: flex;
  justify-content: center;
  align-items: center;
}
.user-detail {
  max-width: 600px;
  min-width: 500px;
  margin: 10px;
  padding: 10px;
  background-color: var(--light-border);
  border-radius: var(--border-radius-size);
  box-shadow: 0 2px 10px var(--shadow);
}

.button-edit button {
  margin: 2px;
}

.user_additional {
  flex-grow: 1;
}
</style>
