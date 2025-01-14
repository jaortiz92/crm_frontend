<script setup>
import { defineProps, defineEmits, toRefs, ref, onMounted } from 'vue'
import { basicModels } from '@/plugins/basicModels'
import { useCityService } from '@/services/cityService'

const props = defineProps({
  initialContact: {
    type: Object,
    default: () => basicModels.contact
  },
  options: {
    type: Object,
    default: () => ({
      id_customer: null,
      roles: [],
      departments: [],
      cities: []
    })
  },
  isEdit: {
    type: Boolean,
    default: false
  },
  customer: {
    type: Object,
    default: () => basicModels.customer
  }
})

const { initialContact, options, isEdit, customer } = toRefs(props)

const contact = ref({ ...initialContact.value })
const idDepartment = ref(null)

if (customer.value.id_customer) {
  contact.value.id_customer = customer.value.id_customer
}

const emit = defineEmits(['save'])
const save = () => {
  emit('save', contact.value)
}

const updateCity = async () => {
  options.value.cities = (await useCityService.getCitiesByDepartment(idDepartment.value)).data
}

const generateDepartment = async () => {
  if (isEdit.value) {
    return (await useCityService.getCityById(initialContact.value.id_city)).data.id_department
  } else {
    return null
  }
}

onMounted(async () => {
  idDepartment.value = await generateDepartment()
  updateCity()
})
</script>

<template>
  <form @submit.prevent="save" class="form-contact">
    <div class="fields">
      <div class="detail-column">
        <div class="field-input">
          <label>Nombres</label>
          <input v-model="contact.first_name" type="text" minlength="5" required />
        </div>
        <div class="field-input">
          <label>Apellidos</label>
          <input v-model="contact.last_name" type="text" minlength="5" required />
        </div>
        <div class="field-input">
          <label>Documento</label>
          <input
            v-model="contact.document"
            type="number"
            min="10000000"
            max="3000000000"
            required
          />
        </div>
        <div class="field-input">
          <label>Genero</label>
          <select v-model="contact.gender" required>
            <option value="0">Sin definir</option>
            <option value="1">Masculino</option>
            <option value="2">Femenino</option>
          </select>
        </div>
        <div class="field-input">
          <label>Correo</label>
          <input v-model="contact.email" type="email" required />
        </div>
        <div class="field-input">
          <label>Telefono</label>
          <input
            v-model="contact.phone"
            type="number"
            min="1000000000"
            max="10000000000"
            required
          />
        </div>
      </div>
      <div class="detail-column">
        <div class="field-input">
          <label>Fechas de nacimiento</label>
          <input v-model="contact.birth_date" type="date" max="2010-01-01" required />
        </div>
        <div class="field-input">
          <label>Rol</label>
          <select v-model="contact.id_role" required>
            <option v-for="option in options.roles" :key="option.id_role" :value="option.id_role">
              {{ option.role_name }}
            </option>
          </select>
        </div>
        <div class="field-input">
          <label>Despartamento</label>
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
          <select v-model="contact.id_city" required>
            <option v-for="option in options.cities" :key="option.id_city" :value="option.id_city">
              {{ option.city_name }}
            </option>
          </select>
        </div>
        <div class="field-input">
          <label>¿Activo? </label
          ><input v-model="contact.active" type="checkbox" class="checkbox" />
        </div>
      </div>
    </div>
    <div class="button-group">
      <button type="submit">
        {{ isEdit ? `Actualizar Contacto` : 'Crear Contacto' }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.form-contact {
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

.company-name {
  text-align: left;
  margin: 5px;
  padding: 5px;
  border: 1px solid var(--gray-border);
  color: var(--gray-border);
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
  .form-contact {
    padding: 10px;
  }

  button {
    font-size: 14px;
  }
}
</style>
