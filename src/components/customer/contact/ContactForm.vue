<script setup>
import { defineProps, defineEmits, toRefs, ref, onMounted } from 'vue'
import { basicModels } from '@/plugins/basicModels'
import { cityService } from '@/services/cityService'
import FormattedNumberInput from '@/components/form/FormattedNumberInput.vue'

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
  options.value.cities = (await cityService.getCitiesByDepartment(idDepartment.value)).data
}

const generateDepartment = async () => {
  if (isEdit.value) {
    return (await cityService.getCityById(initialContact.value.id_city)).data.id_department
  } else {
    return null
  }
}

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
          <h3 class="form-section-title">Información personal</h3>
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
            <FormattedNumberInput
              v-model="contact.document"
              :min="10000000"
              :max="3000000000"
              :required="true"
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
            <input v-model="contact.email" type="email" />
          </div>
          <div class="field-input">
            <label>Celular(Telefono)</label>
            <FormattedNumberInput
              v-model="contact.phone"
              format="phone"
              :min="1000000000"
              :max="10000000000"
            />
          </div>
        </div>
      </div>

      <div class="form-column">
        <div class="form-section">
          <h3 class="form-section-title">Información adicional</h3>
          <div class="field-input">
            <label>Fecha de nacimiento</label>
            <input v-model="contact.birth_date" type="date" max="2015-01-01" />
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
            <select v-model="contact.id_city" required>
              <option
                v-for="option in options.cities"
                :key="option.id_city"
                :value="option.id_city"
              >
                {{ option.city_name }}
              </option>
            </select>
          </div>
          <div class="field-input">
            <label>Detalles relevantes</label>
            <textarea v-model="contact.relevant_details"></textarea>
          </div>
          <div class="field-input">
            <label>¿Activo? </label>
            <input v-model="contact.active" type="checkbox" class="checkbox" />
          </div>
        </div>
      </div>
    </div>
    <div class="button-group">
      <button type="submit" class="btn btn-primary">
        {{ isEdit ? `Actualizar Contacto` : 'Crear Contacto' }}
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

.field-input .checkbox {
  width: auto;
  margin: 0;
}

.button-group {
  display: flex;
  justify-content: center;
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
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
