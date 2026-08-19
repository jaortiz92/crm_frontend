<script setup>
import { defineProps, defineEmits, toRefs, ref } from 'vue'
import { basicModels } from '@/plugins/basicModels'

const props = defineProps({
  initialPhoto: {
    type: Object,
    default: () => basicModels.photo
  },
  options: {
    type: Object,
    default: () => ({
      customers: []
    })
  },
  isEdit: {
    type: Boolean,
    default: false
  }
})

const { initialPhoto, options, isEdit } = toRefs(props)

const photo = ref({ ...initialPhoto.value })

const emit = defineEmits(['save'])
const save = () => {
  emit('save', photo.value)
}
</script>

<template>
  <form @submit.prevent="save" class="form-card">
    <div class="form-section">
      <h3 class="form-section-title">Información de la foto</h3>
      <div class="field-input">
        <label>Cliente</label>
        <select v-model="photo.id_customer" required>
          <option
            v-for="option in options.customers"
            :key="option.id_customer"
            :value="option.id_customer"
          >
            {{ option.company_name }}
          </option>
        </select>
      </div>
      <div class="field-input">
        <label>URL</label>
        <input type="url" v-model="photo.url_photo" required />
      </div>
    </div>
    <div class="button-group">
      <button type="submit" class="btn btn-primary">
        {{ isEdit ? `Actualizar Foto` : 'Crear Foto' }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.form-card {
  width: 85%;
  max-width: 600px;
  margin: 0 auto;
  background: var(--color-surface-card, #ffffff);
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: var(--border-radius-size, 8px);
  padding: 24px;
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
.field-input select {
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
.field-input select:focus {
  outline: none;
  border-color: var(--color-brand, #03658c);
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
}
</style>
