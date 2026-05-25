<script setup>
import { ref, computed } from 'vue'
import { customerTripService } from '@/services/customerTripService'
import { orderService } from '@/services/orderService'
import { invoiceService } from '@/services/invoiceService'
import { alertService } from '@/services/alertService'

const selectedEntityType = ref('')
const targetId = ref('')
const confirmText = ref('')
const isDeepDelete = ref(false)
const isLoading = ref(false)

const deletableEntities = [
  {
    id: 'customer_trip',
    label: 'Viajes de Cliente',
    service: customerTripService,
    deleteMethod: 'deleteCustomerTrip',
    hasDeepDelete: false,
    warningText:
      'Al eliminar un Viaje de Cliente, se eliminarán sus actividades asociadas. No se puede eliminar si posee órdenes asociadas (borrado suave).'
  },
  {
    id: 'order',
    label: 'Ordenes',
    service: orderService,
    deleteMethod: 'deleteOrder',
    hasDeepDelete: true,
    warningText:
      'Al eliminar una Orden, sus detalles se borrarán. Si elige Eliminación Profunda, se forzará el borrado incluso si posee detalles registrados. Pero si tiene facuras asociadas no se podra borrar.'
  },
  {
    id: 'invoice',
    label: 'Facturas',
    service: invoiceService,
    deleteMethod: 'deleteInvoice',
    hasDeepDelete: true,
    warningText:
      'Al eliminar una Factura, sus detalles asociados se borrarán. Si elige Eliminación Profunda, se forzará el borrado de sus detalles de forma recursiva. Pero si tiene envios o creditos asociados no se podra borrar.'
  }
]

const selectedEntityConfig = computed(() => {
  return deletableEntities.find((e) => e.id === selectedEntityType.value)
})

const hasId = computed(() => {
  return targetId.value !== '' && targetId.value !== null && targetId.value !== undefined
})

const isConfirmed = computed(() => {
  return confirmText.value.trim().toUpperCase() === 'ELIMINAR'
})

const canDelete = computed(() => {
  const idStr =
    targetId.value !== null && targetId.value !== undefined ? targetId.value.toString().trim() : ''
  return selectedEntityType.value && idStr !== '' && isConfirmed.value
})

const handleEntityChange = () => {
  targetId.value = ''
  confirmText.value = ''
  isDeepDelete.value = false
}

const executeDelete = async () => {
  if (!canDelete.value) return

  const config = selectedEntityConfig.value
  const idStr =
    targetId.value !== null && targetId.value !== undefined ? targetId.value.toString().trim() : ''
  const id = parseInt(idStr)

  if (isNaN(id)) {
    alertService.generalError('El ID ingresado debe ser un número entero válido.')
    return
  }

  isLoading.value = true

  try {
    let response
    if (config.hasDeepDelete) {
      response = await config.service[config.deleteMethod](id, isDeepDelete.value)
    } else {
      response = await config.service[config.deleteMethod](id)
    }

    alertService.generalSucces(`${config.label} con ID ${id} eliminado correctamente.`)
    // Reset fields on success
    targetId.value = ''
    confirmText.value = ''
    isDeepDelete.value = false
  } catch (err) {
    alertService.generalError(
      err.response?.data?.message?.error ||
        err.response?.data?.detail ||
        `Error al eliminar el registro: ${config.label.toLowerCase()}.`
    )
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div v-if="isLoading" class="global-loading-overlay">
    <p>Eliminando registro, por favor espere...</p>
    <div class="spinner"></div>
  </div>

  <div class="deletions-container">
    <h2>Consola de Eliminación Segura</h2>
    <p class="subtitle">
      Esta sección le permite eliminar documentos del sistema de forma definitiva. Solo disponible
      para usuarios con privilegios Administrativos/Alta Dirección.
    </p>

    <div class="card form-card">
      <!-- Entity Selection -->
      <div class="form-group">
        <label for="entitySelect">1. Seleccione el Tipo de Documento</label>
        <select
          id="entitySelect"
          v-model="selectedEntityType"
          @change="handleEntityChange"
          class="custom-select"
        >
          <option value="" disabled>Seleccione una opción</option>
          <option v-for="entity in deletableEntities" :key="entity.id" :value="entity.id">
            {{ entity.label }}
          </option>
        </select>
      </div>

      <!-- ID Input -->
      <div v-if="selectedEntityType" class="form-group fade-in">
        <label for="idInput">2. Ingrese el ID del Registro</label>
        <input
          id="idInput"
          v-model="targetId"
          type="number"
          placeholder="Ej: 1024"
          class="custom-input"
        />
      </div>

      <!-- Warning Alert -->
      <div v-if="selectedEntityType && hasId" class="warning-alert fade-in">
        <span class="warning-icon">⚠️</span>
        <div class="warning-details">
          <strong>Advertencia sobre {{ selectedEntityConfig.label }}:</strong>
          <p>{{ selectedEntityConfig.warningText }}</p>
        </div>
      </div>

      <!-- Double Confirmation Keyword -->
      <div v-if="selectedEntityType && hasId" class="form-group fade-in">
        <label for="confirmInput">
          3. Escriba <strong>ELIMINAR</strong> para confirmar la acción
        </label>
        <input
          id="confirmInput"
          v-model="confirmText"
          type="text"
          placeholder="Escriba aquí..."
          :class="['custom-input', { 'confirmed-border': isConfirmed }]"
        />
      </div>

      <!-- Deep Delete Checkbox -->
      <div
        v-if="selectedEntityType && hasId && selectedEntityConfig.hasDeepDelete"
        class="form-group checkbox-group fade-in"
      >
        <label class="checkbox-label" :class="{ 'label-disabled': !isConfirmed }">
          <input
            type="checkbox"
            v-model="isDeepDelete"
            :disabled="!isConfirmed"
            class="custom-checkbox"
          />
          <span class="checkbox-text">
            <strong>¿Activar Eliminación Profunda?</strong> (Forzar eliminación en cascada de
            detalles y relaciones)
          </span>
        </label>
      </div>

      <!-- Submit Action Button -->
      <button
        v-if="selectedEntityType && hasId"
        @click="executeDelete"
        :disabled="!canDelete || isLoading"
        class="delete-action-btn fade-in"
      >
        💥 Confirmar y Eliminar Registro
      </button>
    </div>
  </div>
</template>

<style scoped>
.deletions-container {
  max-width: 700px;
  margin: 40px auto;
  padding: 0 20px;
}

h2 {
  font-size: 2rem;
  font-weight: 700;
  color: var(--red-color);
  margin-bottom: 8px;
  text-align: center;
}

.subtitle {
  color: var(--text-gray);
  font-size: 0.95rem;
  text-align: center;
  margin-bottom: 30px;
  line-height: 1.5;
}

.card {
  background-color: var(--background-white);
  border: 1px solid var(--light-border);
  border-radius: 12px;
  padding: 30px;
  box-shadow: 0 8px 24px var(--shadow);
}

.form-card {
  transition: all 0.3s ease;
}

.form-group {
  margin-bottom: 24px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

label {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-black);
  margin-bottom: 8px;
}

.custom-select,
.custom-input {
  width: 100%;
  max-width: 100%;
  padding: 12px;
  font-size: 1rem;
  border: 2px solid var(--background-light);
  border-radius: 8px;
  outline: none;
  background-color: var(--text-white);
  color: var(--text-black);
  box-sizing: border-box;
  margin: 0;
  transition: all 0.2s ease;
}

.custom-select:focus,
.custom-input:focus {
  border-color: var(--red-color);
  box-shadow: 0 0 0 3px rgba(194, 26, 26, 0.15);
}

.confirmed-border {
  border-color: var(--dark-color-opposite-one) !important;
  background-color: rgba(73, 154, 103, 0.05) !important;
}

/* Warnings */
.warning-alert {
  background-color: rgba(194, 26, 26, 0.08);
  border-left: 4px solid var(--red-color);
  border-radius: 6px;
  padding: 16px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 24px;
  text-align: left;
}

.warning-icon {
  font-size: 1.5rem;
}

.warning-details strong {
  color: var(--red-color);
  font-size: 0.95rem;
  display: block;
  margin-bottom: 4px;
}

.warning-details p {
  color: var(--text-gray);
  font-size: 0.88rem;
  line-height: 1.4;
  margin: 0;
}

/* Checkbox */
.checkbox-group {
  flex-direction: row;
  align-items: center;
  padding: 12px;
  background-color: var(--background-white);
  border: 1px solid var(--background-light);
  border-radius: 8px;
  transition: all 0.2s ease;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  width: 100%;
}

.label-disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.custom-checkbox {
  width: 20px;
  height: 20px;
  margin: 0;
  cursor: inherit;
}

.checkbox-text {
  font-size: 0.9rem;
  color: var(--text-gray);
  text-align: left;
}

.checkbox-text strong {
  color: var(--text-black);
}

/* Button */
.delete-action-btn {
  width: 100%;
  padding: 14px;
  font-size: 1.05rem;
  font-weight: 700;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--red-color) 0%, #a81212 100%);
  color: var(--text-white);
  cursor: pointer;
  border: none;
  box-shadow: 0 4px 14px rgba(194, 26, 26, 0.25);
  transition: all 0.2s ease;
}

.delete-action-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #e03232 0%, var(--red-color) 100%);
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(194, 26, 26, 0.4);
}

.delete-action-btn:disabled {
  background: var(--background-light) !important;
  color: var(--text-gray) !important;
  box-shadow: none;
  cursor: not-allowed;
}

/* Fade in animations */
.fade-in {
  animation: fadeIn 0.3s ease forwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
