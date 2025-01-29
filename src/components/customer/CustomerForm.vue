<script setup>
import { defineProps, defineEmits, toRefs, ref, onMounted } from 'vue'
import { basicModels } from '@/plugins/basicModels'
import { cityService } from '@/services/cityService'
import { formatters } from '@/plugins/formatters'

const props = defineProps({
  initialCustomer: {
    type: Object,
    default: () => basicModels.customer
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

const { initialCustomer, options, isEdit } = toRefs(props)

const customer = ref({ ...initialCustomer.value })
if (customer.value.brands) {
  customer.value.brand_ids = customer.value.brands.map((brand) => brand.id_brand)
}

const idDepartment = ref(null)

const emit = defineEmits(['save'])
const save = () => {
  emit('save', customer.value)
}

const updateCity = async () => {
  options.value.cities = (await cityService.getCitiesByDepartment(idDepartment.value)).data
}

const generateDepartment = async () => {
  if (isEdit.value) {
    return (await cityService.getCityById(initialCustomer.value.id_city)).data.id_department
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
  <form @submit.prevent="save" class="form-customer">
    <div class="fields">
      <div class="detail-column">
        <div class="field-input">
          <label>Nombre Compañia</label>
          <input v-model="customer.company_name" type="text" minlength="5" required />
        </div>
        <div class="field-input">
          <label>Documento</label>
          <input
            v-model="customer.document"
            type="number"
            min="10000000"
            max="3000000000"
            required
          />
        </div>
        <div class="field-input">
          <label>Correo</label>
          <input v-model="customer.email" type="email" required />
        </div>
        <div class="field-input">
          <label>Celular(Telefono)</label>
          <div class="input-number">
            <input
              v-model="customer.phone"
              type="number"
              min="1000000000"
              max="10000000000"
              required
            />
            <p>{{ formatters.formatterPhoneNumber(customer.phone) }}</p>
          </div>
        </div>
        <div class="field-input">
          <label>Tipo de tienda</label>
          <select v-model="customer.id_store_type" required>
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
          <label>Vendedor</label>
          <select v-model="customer.id_seller" required>
            <option v-for="option in options.users" :key="option.id_user" :value="option.id_user">
              {{ option.first_name }} {{ option.last_name }}
            </option>
          </select>
        </div>
        <div class="field-input">
          <label>Detalles relevantes</label>
          <textarea v-model="customer.relevant_details"></textarea>
        </div>
      </div>
      <div class="detail-column">
        <div class="field-input">
          <label>Numero de tiendas</label>
          <input v-model="customer.stores" type="number" min="1" max="1000" required />
        </div>
        <div class="field-input">
          <label>Dirección</label>
          <input v-model="customer.address" type="text" minlength="10" required />
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
          <select v-model="customer.id_city" required>
            <option v-for="option in options.cities" :key="option.id_city" :value="option.id_city">
              {{ option.city_name }}
            </option>
          </select>
        </div>
        <div class="field-input">
          <label>¿Activo? </label
          ><input v-model="customer.active" type="checkbox" class="checkbox" />
        </div>
        <div class="field-input">
          <label>Limite de credito</label>
          <div class="input-number">
            <input v-model="customer.credit_limit" type="number" required />
            <p>{{ formatters.formatterGeneralNumber(customer.credit_limit) }}</p>
          </div>
        </div>
        <div class="field-input">
          <label>¿Con documentos? </label
          ><input v-model="customer.with_documents" type="checkbox" class="checkbox" />
        </div>
        <div class="field-input">
          <label>Marca</label>
          <select multiple v-model="customer.brand_ids" required>
            <option
              v-for="option in options.brands"
              :key="option.id_brand"
              :value="option.id_brand"
            >
              {{ option.brand_name }}
            </option>
          </select>
        </div>
        <div class="field-input"></div>
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
.form-customer {
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
  .form-customer {
    padding: 10px;
  }

  button {
    font-size: 14px;
  }
}
</style>
