<script setup>
import { defineProps, toRefs, computed, ref, defineEmits } from 'vue'

const props = defineProps({
  photos: {
    type: Array,
    default: () => []
  }
})

const { photos } = toRefs(props)
const currentIndex = ref(0)
const currentPhoto = computed(() => props.photos[currentIndex.value])

const emit = defineEmits(['editPhoto', 'createPhoto'])
const edit = (photo) => {
  emit('editPhoto', photo)
}

const createPhoto = () => {
  emit('createPhoto')
}

function nextPhoto() {
  if (currentIndex.value < props.photos.length - 1) {
    currentIndex.value++
  }
}

function prevPhoto() {
  if (currentIndex.value > 0) {
    currentIndex.value--
  }
}
</script>

<template>
  <div v-if="photos.length > 0">
    <div class="slider">
      <div class="image-container">
        <img :src="currentPhoto.url_photo" :alt="'Photo_' + currentPhoto.id_photo" />
      </div>
      <div class="controls">
        <button @click="prevPhoto" :disabled="currentIndex === 0">Anterior</button>
        <span class="counter"
          ><b>{{ currentIndex + 1 }}</b
          >/{{ photos.length }}
        </span>
        <button @click="nextPhoto" :disabled="currentIndex === photos.length - 1">Siguiente</button>
      </div>
    </div>
  </div>
  <div v-else>
    <p>Cliente no tiene fotos disponibles</p>
  </div>
  <div class="button-edit">
    <button v-if="photos.length > 0" @click="edit(currentPhoto)">Editar</button>
    <button @click="createPhoto">Agregar Foto</button>
  </div>
</template>

<style scoped>
.slider {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.image-container {
  width: 100%;
  max-width: 1066px;
  height: 600px;
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--background-light);
  overflow: hidden;
  margin-bottom: 1rem;
}

.image-container img {
  max-width: 100%;
  max-height: 100%;
  object-fit: cover;
}

.controls {
  display: flex;
  gap: 1rem;
}

.button-edit button {
  margin: 2px;
}

.counter {
  font-size: 125%;
  align-items: center;
  display: inline-flex;
}
</style>
