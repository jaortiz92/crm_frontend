<script setup>
import { defineProps, defineEmits, toRefs, ref, onMounted, computed } from 'vue'
import { basicModels } from '@/plugins/basicModels'
import { cityService } from '@/services/cityService'
import { validatePassword } from '@/plugins/validatePassword'

const props = defineProps({
  initialUser: {
    type: Object,
    default: () => basicModels.user
  },
  options: {
    type: Object,
    default: () => ({
      departments: [],
      cities: []
    })
  },
  isEdit: {
    type: Boolean,
    default: false
  }
})

const { initialUser, options, isEdit } = toRefs(props)

const user = ref({ ...initialUser.value })

const emit = defineEmits(['save'])
const save = () => {
  emit('save', user.value)
}

const idDepartment = ref(null)
const updateCity = async () => {
  options.value.cities = (await cityService.getCitiesByDepartment(idDepartment.value)).data
}

const generateDepartment = async () => {
  if (isEdit.value) {
    return (await cityService.getCityById(initialUser.value.id_city)).data.id_department
  } else {
    return null
  }
}

const statusPassword = computed(() =>
  user.value.password
    ? validatePassword.validatePassword(user.value.password)
    : { isValid: false, errors: [] }
)

onMounted(async () => {
  idDepartment.value = await generateDepartment()
  if (idDepartment.value) {
    updateCity()
  }
})
</script>

<template>
  <form @submit.prevent="save" class="form-user">
    <div class="fields">
      <div class="detail-column">
        <div v-if="!isEdit" class="field-input">
          <label>Username</label>
          <input v-model="user.username" type="text" minlength="3" required />
        </div>
        <div v-if="!isEdit" class="field-input">
          <label>Contraseña</label>
          <input v-model="user.password" type="password" minlength="6" required />
          <ul if v-if="!statusPassword.isValid" class="password-requirements">
            <li v-for="error in statusPassword.errors" :key="error" class="error">{{ error }}</li>
          </ul>
        </div>
        <div class="field-input">
          <label>Nombres</label>
          <input v-model="user.first_name" type="text" minlength="2" required />
        </div>
        <div class="field-input">
          <label>Apellidos</label>
          <input v-model="user.last_name" type="text" minlength="2" required />
        </div>
        <div class="field-input">
          <label>Documento</label>
          <input v-model="user.document" type="number" min="10000000" max="3000000000" required />
        </div>
        <div class="field-input">
          <label>Fecha de nacimiento</label>
          <input v-model="user.birth_date" type="date" required />
        </div>
      </div>
      <div class="detail-column">
        <div class="field-input">
          <label>Genero</label>
          <select v-model="user.gender" required>
            <option value="0">Sin definir</option>
            <option value="1">Masculino</option>
            <option value="2">Femenino</option>
          </select>
        </div>
        <div class="field-input">
          <label>Email</label>
          <input v-model="user.email" type="email" required />
        </div>
        <div class="field-input">
          <label>Celular</label>
          <input v-model="user.phone" type="text" minlength="10" maxlength="15" required />
        </div>
        <div class="field-input">
          <label>Departamento</label>
          <select @change="updateCity" v-model="idDepartment" required>
            <option
              v-for="option in options.departments"
              :key="option.id_department"
              :value="option.id_department"
            >
              {{ option.department_name }}
            </option>
          </select>
        </div>
        <div class="field-input">
          <label>Ciudad</label>
          <select v-model="user.id_city" required>
            <option v-for="option in options.cities" :key="option.id_city" :value="option.id_city">
              {{ option.city_name }}
            </option>
          </select>
        </div>
      </div>
    </div>
    <div class="button-group">
      <button type="submit">
        {{ isEdit ? 'Actualizar Usuario' : 'Crear Usuario' }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.form-user {
  max-width: 800px;
  margin: 0 auto;
  border: 1px solid var(--gray-border);
  border-radius: 8px;
  background-color: var(--background-light);
  box-shadow: 0 4px 8px var(--shadow);
}

.fields {
  display: flex;
}

.detail-column {
  flex: 1 1 45%;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.checkbox {
  width: auto;
}

.button-group {
  display: flex;
  gap: 10px;
  justify-content: center;
  align-items: center;
}

button {
  min-width: 150px;
}

@media (max-width: 480px) {
  .form-customer {
    padding: 10px;
  }

  button {
    font-size: 14px;
  }
}

.password-requirements {
  font-size: 80%;
  color: var(--red-color);
  margin: 10px;
}

.password-requirements li {
  text-align: left;
}
</style>
