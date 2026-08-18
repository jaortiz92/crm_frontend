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
  <div class="activity-manager">
    <header class="page-header">
      <h1 class="page-title">Gestión de Tipos de Actividad</h1>
      <p class="page-subtitle">Configura el workflow de actividades obligatorias y opcionales</p>
    </header>

    <section class="panel mandatory-panel">
      <div class="panel-header">
        <div class="panel-title-group">
          <div class="panel-accent"></div>
          <h2 class="panel-title">Actividades Obligatorias</h2>
        </div>
        <span class="panel-hint">Arrastra para reordenar el flujo</span>
      </div>

      <draggable
        v-model="mandatoryActivitiesList"
        item-key="id_activity_type"
        handle=".drag-handle"
        @end="onDragEnd"
        class="activity-list"
        ghost-class="ghost"
        chosen-class="chosen"
        drag-class="drag"
      >
        <template #item="{ element }">
          <div class="activity-card mandatory-card">
            <div class="card-drag-zone">
              <span class="drag-handle" title="Arrastrar para reordenar">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <circle cx="5" cy="3" r="1.5" />
                  <circle cx="11" cy="3" r="1.5" />
                  <circle cx="5" cy="8" r="1.5" />
                  <circle cx="11" cy="8" r="1.5" />
                  <circle cx="5" cy="13" r="1.5" />
                  <circle cx="11" cy="13" r="1.5" />
                </svg>
              </span>
              <span class="order-badge">{{ element.activity_order }}</span>
            </div>

            <template v-if="editingId !== element.id_activity_type">
              <div class="card-content">
                <span class="activity-name">{{ element.activity }}</span>
                <span class="category-tag">{{ element.category }}</span>
              </div>
              <div class="card-actions">
                <button class="btn btn-sm btn-secondary" @click="startEdit(element.id_activity_type)">
                  Editar
                </button>
                <button
                  class="btn btn-sm btn-danger"
                  @click="deleteActivityType(element.id_activity_type)"
                >
                  Eliminar
                </button>
              </div>
            </template>

            <template v-else>
              <div class="card-edit">
                <input
                  v-model="element.activity"
                  @keyup.enter="saveChanges(element.id_activity_type)"
                  @keyup.escape="cancelEdit"
                  class="edit-input"
                  placeholder="Nombre de la actividad"
                />
                <select v-model="element.category" class="edit-select">
                  <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
                </select>
                <label class="toggle-label">
                  <input type="checkbox" v-model="element.mandatory" />
                  <span>Obligatoria</span>
                </label>
              </div>
              <div class="card-actions edit-actions">
                <button class="btn btn-sm btn-primary" @click="saveChanges(element.id_activity_type)">
                  Guardar
                </button>
                <button class="btn btn-sm btn-secondary" @click="cancelEdit">
                  Cancelar
                </button>
              </div>
            </template>
          </div>
        </template>
      </draggable>

      <div v-if="mandatoryActivitiesList.length === 0" class="empty-state">
        <p>No hay actividades obligatorias configuradas</p>
      </div>
    </section>

    <section class="panel optional-panel">
      <div class="panel-header">
        <div class="panel-title-group">
          <div class="panel-accent optional"></div>
          <h2 class="panel-title">Actividades Opcionales</h2>
        </div>
        <span class="panel-count">{{ optionalActivities.length }} actividades</span>
      </div>

      <div class="activity-list">
        <div
          v-for="activity in optionalActivities"
          :key="activity.id_activity_type"
          class="activity-card optional-card"
        >
          <div class="card-drag-zone optional">
            <span class="order-badge muted">—</span>
          </div>

          <template v-if="editingId !== activity.id_activity_type">
            <div class="card-content">
              <span class="activity-name">{{ activity.activity }}</span>
              <span class="category-tag">{{ activity.category }}</span>
            </div>
            <div class="card-actions">
              <button class="btn btn-sm btn-secondary" @click="startEdit(activity.id_activity_type)">
                Editar
              </button>
              <button
                class="btn btn-sm btn-danger"
                @click="deleteActivityType(activity.id_activity_type)"
              >
                Eliminar
              </button>
            </div>
          </template>

          <template v-else>
            <div class="card-edit">
              <input
                v-model="activity.activity"
                @keyup.enter="saveChanges(activity.id_activity_type)"
                @keyup.escape="cancelEdit"
                class="edit-input"
                placeholder="Nombre de la actividad"
              />
              <select v-model="activity.category" class="edit-select">
                <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
              </select>
              <label class="toggle-label">
                <input type="checkbox" v-model="activity.mandatory" />
                <span>Obligatoria</span>
              </label>
            </div>
            <div class="card-actions edit-actions">
              <button class="btn btn-sm btn-primary" @click="saveChanges(activity.id_activity_type)">
                Guardar
              </button>
              <button class="btn btn-sm btn-secondary" @click="cancelEdit">
                Cancelar
              </button>
            </div>
          </template>
        </div>
      </div>

      <div v-if="optionalActivities.length === 0" class="empty-state">
        <p>No hay actividades opcionales configuradas</p>
      </div>
    </section>

    <section class="panel add-panel">
      <div class="panel-header">
        <div class="panel-title-group">
          <div class="panel-accent add"></div>
          <h2 class="panel-title">Agregar Nueva Actividad</h2>
        </div>
      </div>

      <form class="add-form" @submit.prevent="addNewActivity">
        <div class="form-row">
          <div class="form-field name-field">
            <label class="field-label">Nombre</label>
            <input
              v-model="newActivity.activity"
              class="field-input"
              placeholder="Ej: Invitación a lanzamiento"
              required
            />
          </div>

          <div class="form-field">
            <label class="field-label">Categoría</label>
            <select v-model="newActivity.category" class="field-input">
              <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
            </select>
          </div>

          <div class="form-field checkbox-field">
            <label class="toggle-label">
              <input type="checkbox" v-model="newActivity.mandatory" />
              <span>Obligatoria</span>
            </label>
          </div>

          <div class="form-field submit-field">
            <button type="submit" class="btn btn-primary" :disabled="!newActivity.activity">
              Agregar Actividad
            </button>
          </div>
        </div>
      </form>
    </section>
  </div>
</template>

<style scoped>
.activity-manager {
  max-width: 960px;
  margin: 0 auto;
  padding: 32px 24px;
}

.page-header {
  margin-bottom: 32px;
}

.page-title {
  font-size: 28px;
  font-weight: 600;
  color: var(--color-text-primary, #070707);
  margin: 0 0 8px 0;
  letter-spacing: -0.02em;
}

.page-subtitle {
  font-size: 15px;
  color: var(--color-text-secondary, #616161);
  margin: 0;
}

.panel {
  background: var(--color-surface-card, #ffffff);
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--color-border, rgba(97, 97, 97, 0.1));
}

.panel-title-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.panel-accent {
  width: 4px;
  height: 24px;
  background: var(--color-brand, #03658c);
  border-radius: 2px;
}

.panel-accent.optional {
  background: var(--color-text-tertiary, rgba(97, 97, 97, 0.5));
}

.panel-accent.add {
  background: var(--color-success, #499a67);
}

.panel-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary, #070707);
  margin: 0;
}

.panel-hint {
  font-size: 13px;
  color: var(--color-text-tertiary, rgba(97, 97, 97, 0.6));
  font-style: italic;
}

.panel-count {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary, #616161);
  background: var(--color-surface, #f9f9f9);
  padding: 4px 12px;
  border-radius: 16px;
}

.activity-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.activity-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  background: var(--color-surface-card, #ffffff);
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.12));
  border-radius: 8px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}

.activity-card:hover {
  border-color: var(--color-border-strong, rgba(97, 97, 97, 0.25));
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.mandatory-card {
  cursor: default;
}

.mandatory-card:hover {
  border-color: var(--color-brand, #03658c);
}

.card-drag-zone {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.card-drag-zone.optional {
  width: 28px;
  justify-content: center;
}

.drag-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: var(--color-text-tertiary, rgba(97, 97, 97, 0.5));
  cursor: grab;
  border-radius: 4px;
  transition: color 0.15s ease, background 0.15s ease;
}

.drag-handle:hover {
  color: var(--color-brand, #03658c);
  background: rgba(3, 101, 140, 0.08);
}

.drag-handle:active {
  cursor: grabbing;
  color: var(--color-brand, #03658c);
}

.order-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--color-brand, #03658c);
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.order-badge.muted {
  background: var(--color-surface, #f0f0f0);
  color: var(--color-text-tertiary, rgba(97, 97, 97, 0.5));
}

.card-content {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.activity-name {
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text-primary, #070707);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.category-tag {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-brand, #03658c);
  background: rgba(3, 101, 140, 0.08);
  padding: 3px 10px;
  border-radius: 4px;
  white-space: nowrap;
  flex-shrink: 0;
}

.card-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  margin-left: auto;
}

.edit-actions {
  padding-left: 8px;
  border-left: 1px solid var(--color-border, rgba(97, 97, 97, 0.1));
}

.card-edit {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.edit-input,
.edit-select {
  padding: 8px 12px;
  font-size: 14px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: 6px;
  background: var(--color-surface-card, #ffffff);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.edit-input {
  flex: 1;
  min-width: 180px;
}

.edit-input:focus,
.edit-select:focus {
  outline: none;
  border-color: var(--color-brand, #03658c);
  box-shadow: 0 0 0 3px rgba(3, 101, 140, 0.12);
}

.toggle-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--color-text-secondary, #616161);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

.toggle-label input[type='checkbox'] {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--color-brand, #03658c);
  cursor: pointer;
}

.add-panel {
  background: linear-gradient(
    to bottom,
    var(--color-surface-card, #ffffff),
    var(--color-surface, #fafafa)
  );
}

.add-form {
  width: 100%;
  padding: 0;
  margin: 0;
  border: none;
  border-radius: 0;
}

.form-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.name-field {
  flex: 1;
  min-width: 200px;
}

.checkbox-field {
  padding-top: 22px;
}

.submit-field {
  padding-top: 22px;
}

.field-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary, #616161);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.field-input {
  padding: 10px 14px;
  font-size: 14px;
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.25));
  border-radius: 6px;
  background: var(--color-surface-card, #ffffff);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.field-input:focus {
  outline: none;
  border-color: var(--color-brand, #03658c);
  box-shadow: 0 0 0 3px rgba(3, 101, 140, 0.12);
}

.field-input::placeholder {
  color: var(--color-text-tertiary, rgba(97, 97, 97, 0.4));
}

.empty-state {
  text-align: center;
  padding: 32px 16px;
  color: var(--color-text-tertiary, rgba(97, 97, 97, 0.6));
  font-size: 14px;
}

:deep(.ghost) {
  opacity: 0.4;
  background: var(--color-surface, #f5f5f5);
  border-style: dashed;
}

:deep(.chosen) {
  box-shadow: 0 4px 16px rgba(3, 101, 140, 0.15);
  border-color: var(--color-brand, #03658c);
  transform: scale(1.01);
}

:deep(.drag) {
  opacity: 0.9;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s ease, opacity 0.15s ease, transform 0.1s ease;
  white-space: nowrap;
}

.btn:active {
  transform: scale(0.97);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 13px;
}

.btn-primary {
  background: var(--color-brand, #03658c);
  color: #ffffff;
}

.btn-primary:hover:not(:disabled) {
  background: var(--color-brand-hover, #14a1d9);
}

.btn-secondary {
  background: var(--color-surface, #f5f5f5);
  color: var(--color-text-primary, #070707);
  border: 1px solid var(--color-border-strong, rgba(97, 97, 97, 0.2));
}

.btn-secondary:hover:not(:disabled) {
  background: var(--color-border, rgba(97, 97, 97, 0.1));
}

.btn-danger {
  background: transparent;
  color: var(--color-danger, #c21a1a);
  border: 1px solid rgba(194, 26, 26, 0.3);
}

.btn-danger:hover:not(:disabled) {
  background: rgba(194, 26, 26, 0.08);
}

@media (max-width: 768px) {
  .activity-manager {
    padding: 20px 16px;
  }

  .panel {
    padding: 16px;
  }

  .activity-card {
    flex-wrap: wrap;
    gap: 12px;
  }

  .card-content {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .card-actions {
    width: 100%;
    justify-content: flex-end;
    margin-left: 0;
    padding-top: 8px;
    border-top: 1px solid var(--color-border, rgba(97, 97, 97, 0.1));
  }

  .form-row {
    flex-direction: column;
    align-items: stretch;
  }

  .form-field {
    width: 100%;
  }

  .name-field {
    min-width: auto;
  }
}
</style>
