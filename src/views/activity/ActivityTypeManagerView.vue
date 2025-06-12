<script setup>
import { ref, onMounted } from 'vue'
import { activityService } from '@/services/activityService'
import { alertService } from '@/services/alertService'

const activityTypes = ref([])
const editingId = ref(null)
const newActivity = ref({
  activity: '',
  mandatory: false,
  category: 'General',
  activity_order: 0
})

const loadData = async () => {
  try {
    const response = await activityService.getActivityTypes()
    activityTypes.value = response.data
  } catch (error) {
    alertService.generalError('Error al cargar los tipos de actividad')
  }
}

const startEdit = (id) => {
  editingId.value = id
}

const cancelEdit = () => {
  editingId.value = null
}

const deleteActivityType = async (id) => {
  try {
    const activityToDelete = activityTypes.value.find((a) => a.id_activity_type === id)
    if (!activityToDelete) return

    const responseUser = await alertService.editElement(
      activityToDelete.id_activity_type,
      'Actividad'
    )

    if (!responseUser) return

    await activityService.deleteActivityType(id)
    editingId.value = null
    await loadData()
  } catch (error) {
    alertService.generalError(error.response?.data?.detail || error.message)
  }
}

const saveChanges = async (id) => {
  try {
    const activityToUpdate = activityTypes.value.find((a) => a.id_activity_type === id)
    if (!activityToUpdate) return

    // Validate order
    if (activityToUpdate.mandatory) {
      const mandatoryActivities = activityTypes.value
        .filter((a) => a.mandatory)
        .sort((a, b) => a.activity_order - b.activity_order)

      const currentIndex = mandatoryActivities.findIndex((a) => a.id_activity_type === id)
      const prevOrder = currentIndex > 0 ? mandatoryActivities[currentIndex - 1].activity_order : 0
      const nextOrder =
        currentIndex < mandatoryActivities.length - 1
          ? mandatoryActivities[currentIndex + 1].activity_order
          : Infinity

      if (
        activityToUpdate.activity_order <= prevOrder ||
        activityToUpdate.activity_order >= nextOrder
      ) {
        throw new Error('El orden debe ser consecutivo para actividades obligatorias')
      }

      if (
        activityToUpdate.activity_order !== currentIndex + 1 &&
        activityToUpdate.activity_order !== currentIndex + 2
      ) {
        throw new Error('El orden debe ser consecutivo para actividades obligatorias')
      }
    } else {
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
      newActivity.value.activity_order =
        activityTypes.value.reduce(
          (max, obj) => (obj.activity_order > max ? obj.activity_order : max),
          -Infinity
        ) + 1
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

const categories = ref(['General', 'Comercial', 'Mercadeo', 'Logistica'])

onMounted(() => {
  loadData()
})
</script>

<template>
  <div class="activity-type-manager">
    <h2>Gestión de Tipos de Actividad</h2>
    <div class="activity-table">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Actividad</th>
            <th>Obligatoria</th>
            <th>Orden</th>
            <th>Categoría</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="activity in activityTypes" :key="activity.id_activity_type">
            <td>{{ activity.id_activity_type }}</td>

            <td>
              <span v-if="editingId !== activity.id_activity_type">
                {{ activity.activity }}
              </span>
              <input
                v-else
                v-model="activity.activity"
                @keyup.enter="saveChanges(activity.id_activity_type)"
              />
            </td>

            <td>
              <span v-if="editingId !== activity.id_activity_type">
                {{ activity.mandatory ? 'Si' : 'No' }}
              </span>
              <input v-else type="checkbox" v-model="activity.mandatory" />
            </td>

            <td>
              <span v-if="editingId !== activity.id_activity_type">
                {{ activity.activity_order }}
              </span>
              <input
                v-else
                type="number"
                v-model.number="activity.activity_order"
                min="0"
                :disabled="!activity.mandatory"
              />
            </td>

            <td>
              <span v-if="editingId !== activity.id_activity_type">
                {{ activity.category }}
              </span>
              <select v-else v-model="activity.category">
                <option v-for="category in categories" :key="category" :value="category">
                  {{ category }}
                </option>
              </select>
            </td>

            <td>
              <template v-if="editingId === activity.id_activity_type">
                <button @click="saveChanges(activity.id_activity_type)">Guardar</button>
                <button @click="cancelEdit">Cancelar</button>
                <button @click="deleteActivityType(activity.id_activity_type)">Eliminar</button>
              </template>
              <button
                v-else
                @click="startEdit(activity.id_activity_type)"
                :disabled="editingId !== null"
              >
                Editar
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <form class="add-activity-form">
      <h3>Agregar Nueva Actividad</h3>
      <div class="form-grid">
        <div>
          <label>Nombre:</label>
          <input v-model="newActivity.activity" placeholder="Nombre de la actividad" />
        </div>

        <div>
          <label>Categoría:</label>
          <select v-model="newActivity.category">
            <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
          </select>
        </div>

        <div>
          <label> Obligatoria </label>
          <input type="checkbox" v-model="newActivity.mandatory" />
        </div>

        <div>
          <button @click="addNewActivity" :disabled="!newActivity.activity">Agregar</button>
        </div>
      </div>
    </form>
  </div>
</template>

<style scoped>
.add-activity-form {
  max-width: 800px;
  margin-top: 5%;
  margin-bottom: 5%;
  border: 1px solid var(--gray-border);
  border-radius: 8px;
  background-color: var(--background-light);
  box-shadow: 0 4px 8px var(--shadow);
}

.activity-type-manager {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.activity-table {
  overflow-x: auto;
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
  margin-right: 5px;
}
</style>
