<script setup>
import { defineProps, defineEmits, toRefs, ref, onMounted } from 'vue'
import { basicModels } from '@/plugins/basicModels'
import { cityService } from '@/services/cityService'
import FormattedNumberInput from '@/components/form/FormattedNumberInput.vue'

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
      cities: [],
      originTypes: []
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
  <form @submit.prevent="save" class="form-card">
    <div class="form-grid">
      <div class="form-column">
        <div class="form-section">
          <h3 class="form-section-title">Información de contacto</h3>
          <div class="field-input">
            <label>Nombre Compañia</label>
            <input v-model="customer.company_name" type="text" minlength="5" required />
          </div>
          <div class="field-input">
            <label>Documento</label>
            <FormattedNumberInput
              v-model="customer.document"
              :min="1000000"
              :max="3000000000"
              :required="true"
            />
          </div>
          <div class="field-input">
            <label>Correo</label>
            <input v-model="customer.email" type="email" />
          </div>
          <div class="field-input">
            <label>Celular(Telefono)</label>
            <FormattedNumberInput
              v-model="customer.phone"
              format="phone"
              :min="1000000000"
              :max="10000000000"
              :required="true"
            />
          </div>
        </div>

        <div class="form-section">
          <h3 class="form-section-title">Ubicación</h3>
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

        <div class="form-section">
          <h3 class="form-section-title">Configuración de tienda</h3>
          <div class="field-input">
            <label>Numero de tiendas</label>
            <FormattedNumberInput v-model="customer.stores" :min="1" :max="1000" :required="true" />
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
            <label>Marca</label>
            <select class="brands-input" multiple v-model="customer.brand_ids" required>
              <option
                v-for="option in options.brands"
                :key="option.id_brand"
                :value="option.id_brand"
              >
                {{ option.brand_name }}
              </option>
            </select>
          </div>
        </div>
      </div>

      <div class="form-column">
        <div class="form-section">
          <h3 class="form-section-title">Asignación</h3>
          <div class="field-input">
            <label>Asesor</label>
            <select v-model="customer.id_seller" required>
              <option v-for="option in options.users" :key="option.id_user" :value="option.id_user">
                {{ option.first_name }} {{ option.last_name }}
              </option>
            </select>
          </div>
          <div class="field-input">
            <label>Asesor Inicial</label>
            <select v-model="customer.id_seller_origin" required>
              <option v-for="option in options.users" :key="option.id_user" :value="option.id_user">
                {{ option.first_name }} {{ option.last_name }}
              </option>
            </select>
          </div>
          <div class="field-input">
            <label>Tipo de origen</label>
            <select v-model="customer.id_origin_type" required>
              <option
                v-for="option in options.originTypes"
                :key="option.id_origin_type"
                :value="option.id_origin_type"
              >
                {{ option.origin_type }} = "{{ option.description }}"
              </option>
            </select>
          </div>
          <div class="field-input">
            <label>Fecha de primer contacto</label>
            <input v-model="customer.date_started_buying" type="date" />
          </div>
        </div>

        <div class="form-section">
          <h3 class="form-section-title">Configuración financiera</h3>
          <div class="field-input">
            <label>Limite de credito</label>
            <FormattedNumberInput v-model="customer.credit_limit" :required="true" />
          </div>
        </div>

        <div class="form-section">
          <h3 class="form-section-title">Estados</h3>
          <div class="field-input">
            <label>¿Con documentos? </label
            ><input v-model="customer.with_documents" type="checkbox" class="checkbox" />
          </div>
          <div class="field-input">
            <label>¿Activo? </label
            ><input v-model="customer.active" type="checkbox" class="checkbox" />
          </div>
          <div class="field-input">
            <label>¿Cliente de consignación? </label
            ><input v-model="customer.is_consignation" type="checkbox" class="checkbox" />
          </div>
        </div>

        <div class="form-section">
          <h3 class="form-section-title">Información adicional</h3>
          <div class="field-input">
            <label>Redes Sociales</label>
            <textarea v-model="customer.social_media"></textarea>
          </div>
          <div class="field-input">
            <label>Detalles relevantes</label>
            <textarea v-model="customer.relevant_details"></textarea>
          </div>
        </div>
      </div>
    </div>
    <div class="button-group">
      <button type="submit" class="btn btn-primary">
        {{ isEdit ? `Actualizar Cliente` : 'Crear Cliente' }}
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

.brands-input {
  min-height: 80px;
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
