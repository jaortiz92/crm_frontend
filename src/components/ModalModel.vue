<script setup>
import { defineEmits, defineProps, toRefs } from 'vue'

const props = defineProps({
  isVisible: Boolean
})
const { isVisible } = toRefs(props)

const emit = defineEmits(['close', 'edit'])
const close = () => {
  emit('close')
}

const edit = () => {
  emit('edit')
}
</script>

<template>
  <div class="modal-overlay" v-if="isVisible">
    <div class="modal-wrapper">
      <div class="modal-container">
        <div class="modal-header">
          <slot name="header">
            <h3>Default Title</h3>
          </slot>
        </div>

        <div class="modal-body">
          <slot name="body"> Default content goes here. </slot>
        </div>

        <div class="modal-footer">
          <slot name="footer"> </slot>
          <button @click="close">Cerrar</button>
          <button @click="edit">Editar</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: var(--background-transparency);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

/* Contenedor del modal */
.modal-container {
  background-color: var(--text-white);
  padding: 20px;
  border-radius: 10px;
  max-width: 600px;
  width: 90%;
  position: relative;
  animation: fadeIn 0.3s ease-in-out;
}

.modal-footer button {
  margin: 2px;
}

/* Animación para mostrar el modal */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
