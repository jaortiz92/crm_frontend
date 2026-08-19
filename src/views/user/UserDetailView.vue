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
  <div v-if="user" class="user-page">
    <div class="user-card-wrapper">
      <UserInfo :user="user"></UserInfo>
    </div>

    <div class="actions-bar">
      <button class="btn btn-primary" @click="edit">Editar</button>
      <button class="btn btn-secondary" @click="createUser">Crear Usuario</button>
      <button class="btn btn-outline" @click="updatePassword">Cambiar contraseña</button>
    </div>
  </div>

  <div v-else class="loading">
    <p>Cargando detalles...</p>
  </div>
</template>

<style scoped>
.user-page {
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
  padding: 24px;
}

.user-card-wrapper {
  width: 100%;
  margin-bottom: 24px;
}

.actions-bar {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 0;
}

.loading {
  padding: 24px;
  text-align: center;
  color: var(--color-text-secondary, #616161);
}

@media (max-width: 768px) {
  .user-page {
    padding: 20px;
  }

  .actions-bar {
    flex-wrap: wrap;
  }
}
</style>
