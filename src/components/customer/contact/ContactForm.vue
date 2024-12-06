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
      users: [],
      storeTypes: [],
      brands: [],
      departments: [],
      cities: []
    })
  },
  isEdit: {
    type: Boolean,
    default: false
  }
})

const { initialContact, options, isEdit } = toRefs(props)

const contact = ref({ ...initialContact.value })
const idDepartment = ref(null)

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
console.log(idDepartment.value)
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
            min="100000000"
            max="3000000000"
            required
          />
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
        <div class="field-input">
          <label>Tipo de tienda</label>
          <select v-model="contact.id_store_type" required>
            <option
              v-for="option in options.storeTypes"
              :key="option.id_store_type"
              :value="option.id_store_type"
            >
              {{ option.store_type }}
            </option>
          </select>
        </div>
        <div class="field-input">
          <label>Marca</label>
          <select v-model="contact.id_brand" required>
            <option
              v-for="option in options.brands"
              :key="option.id_brand"
              :value="option.id_brand"
            >
              {{ option.brand_name }}
            </option>
          </select>
        </div>
        <div class="field-input">
          <label>Vendedor</label>
          <select v-model="contact.id_seller" required>
            <option v-for="option in options.users" :key="option.id_user" :value="option.id_user">
              {{ option.first_name }} {{ option.last_name }}
            </option>
          </select>
        </div>
      </div>
      <div class="detail-column">
        <div class="field-input">
          <label>Numero de tiendas</label>
          <input v-model="contact.stores" type="number" min="1" max="1000" required />
        </div>
        <div class="field-input">
          <label>Dirección</label>
          <input v-model="contact.address" type="text" minlength="10" required />
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
        <div class="field-input">
          <label>Limite de credito</label>
          <input v-model="contact.credit_limit" type="number" required />
        </div>
        <div class="field-input">
          <label>¿Con documentos? </label
          ><input v-model="contact.with_documents" type="checkbox" class="checkbox" />
        </div>
      </div>
    </div>
    <div class="button-group">
      <button type="submit">
        {{ isEdit ? `Actualizar Viaje del cliente` : 'Crear Viaje del cliente' }}
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
