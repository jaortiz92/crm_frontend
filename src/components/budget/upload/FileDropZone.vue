<script setup>
/**
 * FileDropZone — zona reutilizable de arrastrar/soltar para el Centro de
 * Ingesta (spec §8). DnD HTML5 nativo, sin dependencias npm (NFR-1).
 *
 * Valida en cliente antes de red (NFR-4): un solo archivo, extensión .xlsx
 * (case-insensitive) y tamaño <= `maxMb`. Un archivo inválido NO se emite.
 * La extensión no valida contenido: el backend revalida y responde 400.
 */
import { computed, ref } from 'vue'

const props = defineProps({
  /** Clave del dataset de la tarjeta (identificador para a11y/testing). */
  datasetKey: { type: String, required: true },
  /** Archivo seleccionado (v-model). */
  modelValue: { type: Object, default: null },
  /** Bloquea la interacción mientras hay una subida en curso. */
  disabled: { type: Boolean, default: false },
  /** Tamaño máximo en megabytes (NFR-4: 25 MB). */
  maxMb: { type: Number, default: 25 },
  /** Nombre de archivo esperado; solo ayuda visual, NO validación. */
  hintFile: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue', 'reject'])

const inputRef = ref(null)
const isDragOver = ref(false)
const errorMessage = ref('')

const hasFile = computed(() => props.modelValue instanceof File)

const ariaErrorId = computed(() => `dropzone-error-${props.datasetKey}`)

/**
 * Formatea bytes en KB/MB con unadecimal legible para chips.
 * @param {number} bytes
 * @returns {string}
 */
function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const fileSizeLabel = computed(() => (hasFile.value ? formatFileSize(props.modelValue.size) : ''))

function openFilePicker() {
  if (props.disabled) return
  inputRef.value?.click()
}

function showError(message, reason) {
  errorMessage.value = message
  emit('reject', reason)
}

/**
 * Pipeline de validación frontal (§8). Recibe la FileList del input o del
 * `dataTransfer`; si hay varios archivos se toma el primero y se avisa con
 * `reject('multiple')` (la advertencia queda visible junto al archivo).
 * @param {FileList|File[]} fileList
 */
function acceptFiles(fileList) {
  if (props.disabled || !fileList || fileList.length === 0) return

  const files = Array.from(fileList)
  const multiple = files.length > 1
  const candidate = files[0]

  if (!candidate.name.toLowerCase().endsWith('.xlsx')) {
    showError(
      `«${candidate.name}» no es un archivo .xlsx. Seleccione un Excel válido.`,
      'extension'
    )
    return
  }

  if (candidate.size > props.maxMb * 1024 * 1024) {
    showError(
      `«${candidate.name}» supera el límite de ${props.maxMb} MB (${formatFileSize(candidate.size)}).`,
      'size'
    )
    return
  }

  if (multiple) {
    showError('Se seleccionaron varios archivos: se tomará solo el primero.', 'multiple')
  } else {
    errorMessage.value = ''
  }
  emit('update:modelValue', candidate)
}

function onInputChange(event) {
  acceptFiles(event.target.files)
  // Permite volver a seleccionar el mismo archivo tras "Quitar".
  event.target.value = ''
}

function onDrop(event) {
  isDragOver.value = false
  if (props.disabled) return
  acceptFiles(event.dataTransfer?.files)
}

function onDragOver() {
  if (!props.disabled) {
    isDragOver.value = true
  }
}

function onDragLeave(event) {
  if (!props.disabled && !event.currentTarget.contains(event.relatedTarget)) {
    isDragOver.value = false
  }
}

function onKeyDown(event) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    openFilePicker()
  }
}

function removeFile() {
  if (props.disabled) return
  errorMessage.value = ''
  emit('update:modelValue', null)
}
</script>

<template>
  <div class="file-drop-zone" :data-dataset="datasetKey">
    <div
      class="dropzone"
      :class="{
        'is-dragover': isDragOver,
        'is-disabled': disabled,
        'is-selected': hasFile
      }"
      role="button"
      tabindex="0"
      :aria-disabled="disabled ? 'true' : 'false'"
      :aria-describedby="ariaErrorId"
      @click="openFilePicker"
      @keydown="onKeyDown"
      @dragenter.prevent
      @dragover.prevent="onDragOver"
      @dragleave="onDragLeave"
      @drop.prevent="onDrop"
    >
      <input
        ref="inputRef"
        class="dropzone-input"
        type="file"
        accept=".xlsx"
        :disabled="disabled"
        :aria-label="`Seleccionar archivo Excel para ${datasetKey}`"
        tabindex="-1"
        @change="onInputChange"
      />

      <template v-if="!hasFile">
        <svg
          class="dropzone-icon"
          xmlns="http://www.w3.org/2000/svg"
          width="30"
          height="30"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25" />
          <path d="M8 16h8" />
          <path d="M12 12v8" />
        </svg>
        <p class="dropzone-main">Arrastra tu archivo .xlsx aquí o haz click para seleccionar</p>
        <p v-if="hintFile" class="dropzone-hint">Esperado: {{ hintFile }}</p>
      </template>

      <div v-else class="file-chip" :title="modelValue.name">
        <span class="chip-icon" aria-hidden="true">📄</span>
        <span class="chip-name">{{ modelValue.name }}</span>
        <span class="chip-size">{{ fileSizeLabel }}</span>
        <button
          type="button"
          class="chip-remove"
          :disabled="disabled"
          aria-label="Quitar archivo seleccionado"
          @click.stop="removeFile"
        >
          Quitar
        </button>
      </div>

      <span v-if="disabled" class="dropzone-lock" aria-hidden="true">Procesando…</span>
    </div>

    <p :id="ariaErrorId" class="dropzone-error" aria-live="polite">
      {{ errorMessage }}
    </p>
  </div>
</template>

<style scoped>
.file-drop-zone {
  width: 100%;
}

.dropzone {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 122px;
  padding: 14px 12px;
  border: 2px dashed var(--color-border-strong, rgba(97, 97, 97, 0.3));
  border-radius: var(--border-radius-size, 8px);
  background-color: var(--color-surface-card, #ffffff);
  color: var(--color-text-secondary, #555555);
  text-align: center;
  cursor: pointer;
  transition:
    border-color 0.18s cubic-bezier(0.23, 1, 0.32, 1),
    background-color 0.18s cubic-bezier(0.23, 1, 0.32, 1);
}

.dropzone:hover:not(.is-disabled) {
  border-color: var(--color-brand, #03658c);
}

.dropzone:focus-visible {
  outline: 2px solid var(--color-brand, #03658c);
  outline-offset: 2px;
}

.dropzone.is-dragover {
  border-color: var(--color-brand, #03658c);
  border-style: solid;
  background-color: var(--color-brand-light, #d0ebda);
}

:root[data-theme='dark'] .dropzone.is-dragover {
  background-color: rgba(20, 161, 217, 0.08);
}

.dropzone.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dropzone.is-selected {
  border-style: solid;
  cursor: default;
}

.dropzone-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.dropzone-icon {
  color: var(--color-text-muted, #8a8a8a);
}

.dropzone-main {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--color-text-primary, #070707);
}

.dropzone-hint {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-text-muted, #8a8a8a);
}

.file-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 6px;
  background-color: var(--color-surface, #f7f7f7);
}

:root[data-theme='dark'] .file-chip {
  background-color: rgba(255, 255, 255, 0.05);
}

.chip-icon {
  flex-shrink: 0;
}

.chip-name {
  overflow: hidden;
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--color-text-primary, #070707);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip-size {
  flex-shrink: 0;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-muted, #8a8a8a);
}

.chip-remove {
  flex-shrink: 0;
  padding: 4px 8px;
  border: 1px solid var(--color-border, rgba(97, 97, 97, 0.15));
  border-radius: 5px;
  background: none;
  font-size: 0.72rem;
  color: var(--color-text-secondary, #555555);
  cursor: pointer;
  transition:
    background-color 0.18s cubic-bezier(0.23, 1, 0.32, 1),
    color 0.18s cubic-bezier(0.23, 1, 0.32, 1);
}

.chip-remove:hover:not(:disabled) {
  background-color: rgba(224, 69, 69, 0.1);
  color: #b02a2a;
}

.chip-remove:disabled {
  cursor: not-allowed;
}

.dropzone-lock {
  position: absolute;
  right: 10px;
  bottom: 8px;
  font-size: 0.7rem;
  color: var(--color-text-muted, #8a8a8a);
}

.dropzone-error {
  min-height: 1.1rem;
  margin: 6px 2px 0;
  font-size: 0.78rem;
  font-weight: 500;
  color: #c53030;
}

:root[data-theme='dark'] .dropzone-error {
  color: #ff8f8f;
}
</style>
