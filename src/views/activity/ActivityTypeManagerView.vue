<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import draggable from 'vuedraggable'
import { activityService } from '@/services/activityService'
import { alertService } from '@/services/alertService'

const activityTypes = ref([])
const mandatoryActivitiesList = ref([])
const editingId = ref(null)
const newActivity = ref({
  activity: '',
  mandatory: false,
  category: 'General',
  activity_order: 0
})
const categories = ref(['General', 'Comercial', 'Mercadeo', 'Logistica', 'Financiera', 'Tesoreria'])

const optionalActivities = computed(() => activityTypes.value.filter((a) => !a.mandatory))

const loadData = async () => {
  try {
    const response = await activityService.getActivityTypes()
    activityTypes.value = response.data
    mandatoryActivitiesList.value = response.data
      .filter((a) => a.mandatory)
      .sort((a, b) => a.activity_order - b.activity_order)
  } catch (error) {
    alertService.generalError('Error al cargar los tipos de actividad')
  }
}

watch(
  () => activityTypes.value,
  (newVal) => {
    mandatoryActivitiesList.value = newVal
      .filter((a) => a.mandatory)
      .sort((a, b) => a.activity_order - b.activity_order)
  },
  { deep: true }
)

const startEdit = (id) => {
  editingId.value = id
}

const cancelEdit = () => {
  editingId.value = null
}

const onDragEnd = async () => {
  try {
    const reorderData = mandatoryActivitiesList.value.map((activity, index) => ({
      id_activity_type: activity.id_activity_type,
      activity_order: index + 1
    }))

    await activityService.reorderMandatoryActivities(reorderData)
    await loadData()
    alertService.generalSucces('Orden actualizado correctamente')
  } catch (error) {
    alertService.generalError(error.response?.data?.detail || error.message)
    await loadData()
  }
}

const deleteActivityType = async (id) => {
  try {
    const activityToDelete = activityTypes.value.find((a) => a.id_activity_type === id)
    if (!activityToDelete) return

    const responseUser = await alertService.deleteElement(
      activityToDelete.id_activity_type,
      'Tipo de actividad'
    )
    if (responseUser.isConfirmed !== true) return

    await activityService.deleteActivityType(id)
    await loadData()
    alertService.generalSucces('Actividad eliminada correctamente')
  } catch (error) {
    alertService.generalError(error.response?.data?.detail || error.message)
  }
}

const saveChanges = async (id) => {
  try {
    const activityToUpdate = activityTypes.value.find((a) => a.id_activity_type === id)
    if (!activityToUpdate) return

    const responseUser = await alertService.editElement(id, 'Tipo de actividad')
    if (responseUser.isConfirmed !== true) return

    if (activityToUpdate.mandatory && activityToUpdate.activity_order === 0) {
      activityToUpdate.activity_order = mandatoryActivitiesList.value.length + 1
    }

    if (!activityToUpdate.mandatory) {
      activityToUpdate.activity_order = 0
    }

    await activityService.updateActivityType(id, {
      activity: activityToUpdate.activity,
      mandatory: activityToUpdate.mandatory,
      category: activityToUpdate.category,
      activity_order: activityToUpdate.activity_order
    })

    editingId.value = null
    alertService.generalSucces('Actividad actualizada correctamente')
    await loadData()
  } catch (error) {
    alertService.generalError(error.response?.data?.detail || error.message)
  }
}

const addNewActivity = async () => {
  try {
    if (!newActivity.value.activity) {
      throw new Error('El nombre de la actividad es requerido')
    }

    if (newActivity.value.mandatory) {
      newActivity.value.activity_order = mandatoryActivitiesList.value.length + 1
    } else {
      newActivity.value.activity_order = 0
    }

    await activityService.createActivityType(newActivity.value)
    alertService.generalSucces('Actividad creada correctamente')

    newActivity.value = {
      activity: '',
      mandatory: false,
      category: 'General',
      activity_order: 0
    }
    await loadData()
  } catch (error) {
    alertService.generalError(error.response?.data?.detail || error.message)
  }
}

onMounted(() => {
  loadData()
})
</script>

<template>
  <div class="activity-type-manager">
    <h2>Gestión de Tipos de Actividad</h2>

    <div class="section mandatory-section">
      <h3>Actividades Obligatorias</h3>
      <p class="section-help">Arrastra para reordenar</p>

      <draggable
        v-model="mandatoryActivitiesList"
        item-key="id_activity_type"
        handle=".drag-handle"
        @end="onDragEnd"
        class="activity-list"
        ghost-class="ghost"
        chosen-class="chosen"
      >
        <template #item="{ element }">
          <div class="activity-item mandatory">
            <span class="drag-handle">☰</span>
            <span class="order-badge">{{ element.activity_order }}</span>

            <template v-if="editingId !== element.id_activity_type">
              <span class="activity-name">{{ element.activity }}</span>
              <span class="category-badge">{{ element.category }}</span>
              <div class="actions">
                <button @click="startEdit(element.id_activity_type)">Editar</button>
                <button
                  class="delete-button"
                  @click="deleteActivityType(element.id_activity_type)"
                >
                  Eliminar
                </button>
              </div>
            </template>

            <template v-else>
              <input
                v-model="element.activity"
                @keyup.enter="saveChanges(element.id_activity_type)"
              />
              <select v-model="element.category">
                <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
              </select>
              <label class="mandatory-toggle">
                <input type="checkbox" v-model="element.mandatory" />
                Obligatoria
              </label>
              <button @click="saveChanges(element.id_activity_type)">Guardar</button>
              <button @click="cancelEdit">Cancelar</button>
            </template>
          </div>
        </template>
      </draggable>
    </div>

    <div class="section optional-section">
      <h3>Actividades Opcionales</h3>

      <div class="activity-list">
        <div
          v-for="activity in optionalActivities"
          :key="activity.id_activity_type"
          class="activity-item optional"
        >
          <span class="order-badge">—</span>

          <template v-if="editingId !== activity.id_activity_type">
            <span class="activity-name">{{ activity.activity }}</span>
            <span class="category-badge">{{ activity.category }}</span>
            <div class="actions">
              <button @click="startEdit(activity.id_activity_type)">Editar</button>
              <button
                class="delete-button"
                @click="deleteActivityType(activity.id_activity_type)"
              >
                Eliminar
              </button>
            </div>
          </template>

          <template v-else>
            <input
              v-model="activity.activity"
              @keyup.enter="saveChanges(activity.id_activity_type)"
            />
            <select v-model="activity.category">
              <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
            </select>
            <label class="mandatory-toggle">
              <input type="checkbox" v-model="activity.mandatory" />
              Obligatoria
            </label>
            <button @click="saveChanges(activity.id_activity_type)">Guardar</button>
            <button @click="cancelEdit">Cancelar</button>
          </template>
        </div>
      </div>
    </div>

    <form class="add-activity-form" @submit.prevent="addNewActivity">
      <h3>Agregar Nueva Actividad</h3>
      <div class="form-grid">
        <div>
          <label>Nombre:</label>
          <input v-model="newActivity.activity" placeholder="Nombre de la actividad" required />
        </div>

        <div>
          <label>Categoría:</label>
          <select v-model="newActivity.category">
            <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
          </select>
        </div>

        <div>
          <label class="mandatory-toggle">
            <input type="checkbox" v-model="newActivity.mandatory" />
            Obligatoria
          </label>
        </div>

        <div>
          <button type="submit" :disabled="!newActivity.activity">Agregar</button>
        </div>
      </div>
    </form>
  </div>
</template>

<style scoped>
.activity-type-manager {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.section {
  margin-bottom: 30px;
  padding: 20px;
  border: 1px solid var(--gray-border);
  border-radius: 8px;
  background-color: var(--background-light);
}

.section-help {
  color: var(--text-muted);
  font-size: 0.9em;
  margin-bottom: 15px;
}

.activity-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.activity-item {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 12px 15px;
  border: 1px solid var(--gray-border);
  border-radius: 6px;
  background-color: white;
  transition: box-shadow 0.2s;
}

.activity-item:hover {
  box-shadow: 0 2px 8px var(--shadow);
}

.activity-item.mandatory {
  cursor: grab;
}

.activity-item.mandatory:active {
  cursor: grabbing;
}

.drag-handle {
  cursor: grab;
  color: var(--text-muted);
  font-size: 1.2em;
  user-select: none;
}

.drag-handle:active {
  cursor: grabbing;
}

.order-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background-color: var(--primary-color);
  color: white;
  font-weight: bold;
  font-size: 0.9em;
}

.optional .order-badge {
  background-color: var(--gray-border);
  color: var(--text-muted);
}

.activity-name {
  flex: 1;
}

.category-badge {
  padding: 4px 10px;
  border-radius: 12px;
  background-color: var(--background-light);
  font-size: 0.85em;
  color: var(--text-secondary);
}

.actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}

.actions button {
  padding: 6px 12px;
  margin: 0;
}

:deep(.ghost) {
  opacity: 0.5;
  background: var(--background-light);
}

:deep(.chosen) {
  box-shadow: 0 4px 12px var(--shadow);
}

.add-activity-form {
  max-width: 800px;
  margin-top: 30px;
  padding: 20px;
  border: 1px solid var(--gray-border);
  border-radius: 8px;
  background-color: var(--background-light);
  box-shadow: 0 4px 8px var(--shadow);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
  align-items: end;
}

.form-grid div {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.mandatory-toggle {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

input[type='text'],
input[type='number'],
select {
  width: 100%;
  padding: 8px;
  box-sizing: border-box;
}

button {
  padding: 6px 12px;
}

.delete-button {
  background-color: var(--error-color, #dc3545);
  color: white;
}
</style>
