# Especificación Frontend: Mejora en Gestión de Actividades Obligatorias

> Spec derivado de `spec/00_Update_ActivityTypeManager.md` — Capa: Frontend (`crm_frontend/`)

## Contexto

El componente `ActivityTypeManagerView.vue` actual presenta problemas de usabilidad:

1. **Validación confusa**: La lógica de validación de orden (líneas 61-88) es compleja y puede fallar en casos edge
2. **Solo edición manual**: Solo se puede cambiar el orden escribiendo un número en un input
3. **Sin separación visual**: Todas las actividades (obligatorias y opcionales) se muestran en la misma tabla
4. **Sin feedback de reordenamiento**: No hay indicación visual del nuevo orden al arrastrar

### Estado actual del código

| Archivo | Estado actual |
|---------|---------------|
| `src/services/activityService.js` | Métodos CRUD básicos para activity types |
| `src/views/activity/ActivityTypeManagerView.vue` | Tabla única con edición inline, validación compleja |

### Dependencias actuales (`package.json`)

```json
{
  "dependencies": {
    "axios": "^1.7.7",
    "pinia": "^2.1.7",
    "sweetalert2": "^11.14.3",
    "vue": "^3.4.29",
    "vue-router": "^4.3.3",
    "xlsx": "^0.18.5"
  }
}
```

**Nota:** No incluye librería de drag-and-drop actualmente.

---

## Cambios Requeridos

### 1. Instalar dependencia de drag-and-drop

**Comando:**
```bash
npm install vuedraggable@next
```

**Justificación:** `vuedraggable@next` es la versión compatible con Vue 3. Proporciona un componente `<draggable>` que envuelve listas y permite reordenar mediante arrastrar y soltar.

**Uso básico:**
```vue
<script setup>
import draggable from 'vuedraggable'
</script>

<template>
  <draggable v-model="list" item-key="id">
    <template #item="{ element }">
      <div>{{ element.name }}</div>
    </template>
  </draggable>
</template>
```

---

### 2. Actualizar `activityService.js`

**Archivo:** `src/services/activityService.js`

**Agregar nuevo método:**

```javascript
reorderMandatoryActivities(activities) {
  return axiosInstance.put('/activity_type/reorder/', {
    activities: activities
  })
}
```

**Ubicación:** Después del método `deleteActivityType` (línea 38)

**Propósito:** Consumir el nuevo endpoint `PUT /activity_type/reorder/` del backend para reordenar actividades obligatorias de forma atómica.

**Request body que envía:**
```json
{
  "activities": [
    {"id_activity_type": 1, "activity_order": 3},
    {"id_activity_type": 2, "activity_order": 1},
    {"id_activity_type": 3, "activity_order": 2}
  ]
}
```

---

### 3. Reescribir `ActivityTypeManagerView.vue`

**Archivo:** `src/views/activity/ActivityTypeManagerView.vue`

#### 3.1. Estructura del componente

**Separación en dos secciones:**

```
┌─────────────────────────────────────────────────────────────┐
│  Gestión de Tipos de Actividad                              │
├─────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────┐  │
│  │ ACTIVIDADES OBLIGATORIAS (Drag & Drop)                │  │
│  │ ┌─────────────────────────────────────────────────┐   │  │
│  │ │ ☰ 1. Invitación a Lanzamiento    [Editar][🗑]   │   │  │
│  │ │ ☰ 2. Lanzamiento de Colección    [Editar][🗑]   │   │  │
│  │ │ ☰ 3. Evaluación de Lanzamiento   [Editar][🗑]   │   │  │
│  │ │ ☰ 4. Invitación a ShowRoom       [Editar][🗑]   │   │  │
│  │ └─────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ ACTIVIDADES OPCIONALES                                │  │
│  │ ┌─────────────────────────────────────────────────┐   │  │
│  │ │ • Llamada                        [Editar][🗑]   │   │  │
│  │ │ • Correo                         [Editar][🗑]   │   │  │
│  │ │ • Visita presencial              [Editar][🗑]   │   │  │
│  │ └─────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ AGREGAR NUEVA ACTIVIDAD                               │  │
│  │ Nombre: [____________] Categoría: [v] [ ] Obligatoria │  │
│  │                                          [Agregar]    │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

#### 3.2. Lógica del script (`<script setup>`)

**Imports:**
```javascript
import { ref, computed, onMounted } from 'vue'
import draggable from 'vuedraggable'
import { activityService } from '@/services/activityService'
import { alertService } from '@/services/alertService'
```

**Estado reactivo:**
```javascript
const activityTypes = ref([])
const editingId = ref(null)
const newActivity = ref({
  activity: '',
  mandatory: false,
  category: 'General',
  activity_order: 0
})
const categories = ref(['General', 'Comercial', 'Mercadeo', 'Logistica', 'Financiera', 'Tesoreria'])
```

**Computed properties (separación de actividades):**
```javascript
const mandatoryActivities = computed(() => 
  activityTypes.value
    .filter(a => a.mandatory)
    .sort((a, b) => a.activity_order - b.activity_order)
)

const optionalActivities = computed(() => 
  activityTypes.value.filter(a => !a.mandatory)
)
```

**Función de reordenamiento (drag-and-drop):**
```javascript
const onDragEnd = async () => {
  try {
    const reorderData = mandatoryActivities.value.map((activity, index) => ({
      id_activity_type: activity.id_activity_type,
      activity_order: index + 1
    }))
    
    await activityService.reorderMandatoryActivities(reorderData)
    await loadData()
    alertService.generalSucces('Orden actualizado correctamente')
  } catch (error) {
    alertService.generalError(error.response?.data?.detail || error.message)
    await loadData() // Revertir cambios visuales si falla
  }
}
```

**Función de eliminación (sin validación de orden):**
```javascript
const deleteActivityType = async (id) => {
  try {
    const activityToDelete = activityTypes.value.find(a => a.id_activity_type === id)
    if (!activityToDelete) return

    const responseUser = await alertService.deleteElement(
      activityToDelete.id_activity_type,
      'Tipo de actividad'
    )
    if (responseUser.isConfirmed !== true) return

    await activityService.deleteActivityType(id)
    // El backend se encarga de renumerar automáticamente
    await loadData()
    alertService.generalSucces('Actividad eliminada correctamente')
  } catch (error) {
    alertService.generalError(error.response?.data?.detail || error.message)
  }
}
```

**Función de edición (simplificada):**
```javascript
const saveChanges = async (id) => {
  try {
    const activityToUpdate = activityTypes.value.find(a => a.id_activity_type === id)
    if (!activityToUpdate) return

    const responseUser = await alertService.editElement(id, 'Tipo de actividad')
    if (responseUser.isConfirmed !== true) return

    // Si cambió a obligatoria, asignar el siguiente orden disponible
    if (activityToUpdate.mandatory && activityToUpdate.activity_order === 0) {
      activityToUpdate.activity_order = mandatoryActivities.value.length + 1
    }
    
    // Si cambió a opcional, resetear orden
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
```

**Función de creación (auto-asignación de orden):**
```javascript
const addNewActivity = async () => {
  try {
    if (!newActivity.value.activity) {
      throw new Error('El nombre de la actividad es requerido')
    }

    // Auto-asignar orden si es obligatoria
    if (newActivity.value.mandatory) {
      newActivity.value.activity_order = mandatoryActivities.value.length + 1
    } else {
      newActivity.value.activity_order = 0
    }

    await activityService.createActivityType(newActivity.value)
    alertService.generalSucces('Actividad creada correctamente')
    
    // Resetear formulario
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
```

#### 3.3. Estructura del template

**Sección de actividades obligatorias con drag-and-drop:**
```vue
<div class="section mandatory-section">
  <h3>Actividades Obligatorias</h3>
  <p class="section-help">Arrastra para reordenar</p>
  
  <draggable
    v-model="activityTypes"
    item-key="id_activity_type"
    handle=".drag-handle"
    @end="onDragEnd"
    class="activity-list"
  >
    <template #item="{ element }">
      <div v-if="element.mandatory" class="activity-item mandatory">
        <span class="drag-handle">☰</span>
        <span class="order-badge">{{ element.activity_order }}</span>
        
        <template v-if="editingId !== element.id_activity_type">
          <span class="activity-name">{{ element.activity }}</span>
          <span class="category-badge">{{ element.category }}</span>
          <div class="actions">
            <button @click="startEdit(element.id_activity_type)">Editar</button>
            <button class="delete-button" @click="deleteActivityType(element.id_activity_type)">
              Eliminar
            </button>
          </div>
        </template>
        
        <template v-else>
          <input v-model="element.activity" @keyup.enter="saveChanges(element.id_activity_type)" />
          <select v-model="element.category">
            <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
          </select>
          <button @click="saveChanges(element.id_activity_type)">Guardar</button>
          <button @click="cancelEdit">Cancelar</button>
        </template>
      </div>
    </template>
  </draggable>
</div>
```

**Sección de actividades opcionales:**
```vue
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
          <button class="delete-button" @click="deleteActivityType(activity.id_activity_type)">
            Eliminar
          </button>
        </div>
      </template>
      
      <template v-else>
        <input v-model="activity.activity" @keyup.enter="saveChanges(activity.id_activity_type)" />
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
```

**Formulario de nueva actividad:**
```vue
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
```

#### 3.4. Estilos CSS

**Variables y estructura base:**
```css
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
```

**Elementos visuales:**
```css
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
```

**Estado de arrastre (ghost class de vuedraggable):**
```css
:deep(.ghost) {
  opacity: 0.5;
  background: var(--background-light);
}

:deep(.chosen) {
  box-shadow: 0 4px 12px var(--shadow);
}
```

---

## Pasos de Implementación

### Paso 1: Instalar dependencia

```bash
cd crm_frontend
npm install vuedraggable@next
```

**Verificar:** Revisar que `package.json` ahora incluya:
```json
"vuedraggable": "^4.1.0"
```

### Paso 2: Actualizar `activityService.js`

**Archivo:** `src/services/activityService.js`

Agregar método después de `deleteActivityType` (línea 38):
```javascript
reorderMandatoryActivities(activities) {
  return axiosInstance.put('/activity_type/reorder/', {
    activities: activities
  })
}
```

### Paso 3: Reescribir `ActivityTypeManagerView.vue`

**Archivo:** `src/views/activity/ActivityTypeManagerView.vue`

Reemplazar completamente el contenido del archivo con la nueva estructura:
1. Importar `draggable` de `vuedraggable`
2. Agregar `computed` para separar actividades
3. Implementar `onDragEnd` para guardar el nuevo orden
4. Simplificar `saveChanges` (sin validación compleja de orden)
5. Actualizar `addNewActivity` para auto-asignar orden
6. Separar template en dos secciones (obligatorias con drag, opcionales sin drag)
7. Agregar estilos para drag-and-drop y badges

### Paso 4: Ejecutar lint

```bash
npm run lint
```

**Corregir** cualquier error de ESLint/Prettier.

### Paso 5: Pruebas manuales

1. **Carga inicial:** Verificar que las actividades se muestran separadas en dos secciones
2. **Drag-and-drop:** Arrastrar una actividad obligatoria y soltarla en otra posición
   - Verificar que el orden se actualiza visualmente
   - Verificar que el backend responde con 200
   - Verificar que el mensaje de éxito aparece
3. **Eliminar obligatoria:** Eliminar una actividad obligatoria
   - Verificar que las actividades siguientes renumeran automáticamente
   - Verificar que el orden queda consecutivo
4. **Crear obligatoria:** Crear una nueva actividad marcando "Obligatoria"
   - Verificar que se asigna automáticamente el siguiente orden disponible
5. **Cambiar tipo:** Editar una actividad y cambiar de opcional a obligatoria
   - Verificar que se asigna el siguiente orden disponible
6. **Error handling:** Simular error de red y verificar que se muestra mensaje de error

---

## Archivos a Modificar

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `package.json` | Modificar | Agregar `vuedraggable@next` |
| `src/services/activityService.js` | Modificar | Agregar método `reorderMandatoryActivities` |
| `src/views/activity/ActivityTypeManagerView.vue` | Reescribir | Nueva estructura con drag-and-drop |

---

## Dependencias

- **Backend:** Requiere que el endpoint `PUT /activity_type/reorder/` esté implementado
- **Base de datos:** Requiere que la migración `crm_db/migrations/XX_fix_activity_order.sql` haya sido ejecutada

---

## Riesgos y Consideraciones

1. **v-model con array filtrado:** `vuedraggable` requiere un array completo para funcionar. No se puede usar directamente con `mandatoryActivities` (computed filtrado). La solución es usar `v-model="activityTypes"` y filtrar dentro del template con `v-if="element.mandatory"`.

2. **Actualización optimista:** El componente actualiza visualmente el orden al soltar, pero si el backend falla, se recarga la lista para revertir los cambios. Esto puede causar un "salto" visual.

3. **Edición inline limitada:** Solo se puede editar una actividad a la vez (`editingId`). Esto se mantiene del componente original.

4. **Categorías hardcodeadas:** La lista de categorías está hardcodeada en el componente. Si se necesita dinamismo, se debería crear una tabla separada.

5. **Accesibilidad:** El drag-and-drop nativo de HTML5 tiene limitaciones de accesibilidad. Para producción, considerar agregar botones de "mover arriba/abajo" como alternativa.

6. **Performance:** Si hay muchas actividades (>100), el drag-and-drop puede volverse lento. Actualmente hay ~14 actividades obligatorias, por lo que no es un problema.
