<script setup>
import { defineProps, defineEmits, toRefs, ref, onMounted, computed } from 'vue'
import { basicModels } from '@/plugins/basicModels'
import { cityService } from '@/services/cityService'
import { validatePassword } from '@/plugins/validatePassword'
import FormattedNumberInput from '@/components/form/FormattedNumberInput.vue'

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
  <form @submit.prevent="save" class="form-card">
    <div class="form-grid">
      <div class="form-column">
        <div class="form-section">
          <h3 class="form-section-title">Credenciales</h3>
          <div v-if="!isEdit" class="field-input">
            <label>Username</label>
            <input v-model="user.username" type="text" minlength="3" required />
          </div>
          <div v-if="!isEdit" class="field-input">
            <label>Contraseña</label>
            <input v-model="user.password" type="password" minlength="6" required />
            <ul v-if="!statusPassword.isValid" class="password-requirements">
              <li v-for="error in statusPassword.errors" :key="error" class="error">{{ error }}</li>
            </ul>
          </div>
        </div>

        <div class="form-section">
          <h3 class="form-section-title">Información personal</h3>
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
            <FormattedNumberInput
              v-model="user.document"
              :min="10000000"
              :max="3000000000"
              :required="true"
            />
          </div>
          <div class="field-input">
            <label>Fecha de nacimiento</label>
            <input v-model="user.birth_date" type="date" required />
          </div>
        </div>
      </div>

      <div class="form-column">
        <div class="form-section">
          <h3 class="form-section-title">Contacto y ubicación</h3>
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
            <FormattedNumberInput
              v-model="user.phone"
              format="phone"
              :min="1000000000"
              :max="10000000000"
            />

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
              <option
                v-for="option in options.cities"
                :key="option.id_city"
                :value="option.id_city"
              >
                {{ option.city_name }}
              </option>
            </select>
          </div>
        </div>
      </div>
    </div>
    <div class="button-group">
      <button type="submit" class="btn btn-primary">
        {{ isEdit ? 'Actualizar Usuario' : 'Crear Usuario' }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.form-card {
  width: 85%;
  background: var(--color-surface-card, #ffffff);
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: var(--border-radius-size, 8px);
  padding: 24px;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
}

.form-column {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary, #070707);
  margin: 0 0 8px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
}

.field-input {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-input label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary, #616161);
}

.field-input input,
.field-input select,
.field-input textarea {
  width: 100%;
  max-width: none;
  padding: 8px 12px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 6px;
  font-size: 14px;
  color: var(--color-text-primary, #070707);
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.field-input input:focus,
.field-input select:focus,
.field-input textarea:focus {
  outline: none;
  border-color: var(--color-brand, #03658c);
}

.field-input textarea {
  min-height: 80px;
  resize: vertical;
}

.button-group {
  display: flex;
  justify-content: center;
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
}

.password-requirements {
  font-size: 12px;
  color: var(--color-danger, #c21a1a);
  margin: 4px 0 0 0;
  padding-left: 16px;
}

.password-requirements li {
  text-align: left;
}

@media (max-width: 768px) {
  .form-card {
    padding: 20px;
  }

  .form-grid {
    grid-template-columns: 1fr;
    gap: 24px;
  }
}
</style>
