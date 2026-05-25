<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const selected = ref('')

const options = [
  {
    label: 'Validador de Clientes (Existencia en BD)',
    id: 'ClientValidator',
    route: 'ClientValidatorQuery'
  }
]

const goToQuery = () => {
  if (selected.value) {
    const selectedOption = options.find((opt) => opt.id === selected.value)
    router.push({
      name: selectedOption.route
    })
  }
}
</script>

<template>
  <div class="menu-container">
    <h2>Seleccione el tipo de consulta</h2>
    <div class="form-group">
      <select v-model="selected">
        <option value="" disabled>Seleccione una opción</option>
        <option v-for="opt in options" :key="opt.id" :value="opt.id">
          {{ opt.label }}
        </option>
      </select>
    </div>
    <button @click="goToQuery" :disabled="!selected" class="action-btn">Continuar</button>
  </div>
</template>

<style scoped>
.menu-container {
  max-width: 600px;
  margin: 40px auto;
  padding: 30px;
  border: 1px solid var(--gray-border);
  border-radius: 12px;
  background-color: var(--background-white);
  box-shadow: 0 8px 24px var(--shadow);
  text-align: center;
  transition: all 0.3s ease;
}
.menu-container:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 30px var(--shadow);
}
h2 {
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--dark-color-opposite-two);
  margin-bottom: 24px;
}
.form-group {
  margin-bottom: 24px;
}
select {
  width: 100%;
  padding: 12px;
  font-size: 1rem;
  border: 2px solid var(--background-light);
  border-radius: 8px;
  background-color: var(--text-white);
  color: var(--text-black);
  outline: none;
  transition: border-color 0.2s ease;
  max-width: 100%;
}
select:focus {
  border-color: var(--dark-color);
}
.action-btn {
  width: 100%;
  padding: 12px;
  font-size: 1rem;
  font-weight: 600;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--dark-color) 0%, var(--dark-color-opposite-two) 100%);
  color: var(--text-white);
  cursor: pointer;
  border: none;
  box-shadow: 0 4px 12px rgba(10, 32, 152, 0.25);
  transition: all 0.2s ease;
}
.action-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, var(--light-color) 0%, var(--light-color-opposite-two) 100%);
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(10, 32, 152, 0.4);
}
.action-btn:disabled {
  background: var(--background-light);
  color: var(--text-gray);
  box-shadow: none;
  cursor: not-allowed;
}
</style>
