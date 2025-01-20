<script setup>
import { ref, computed, defineProps, toRefs } from 'vue'
import { formatters } from '@/plugins/formatters.js'
import { useRouter } from 'vue-router'

import { alertService } from '@/services/alertService'
import { useContactStore } from '@/stores/contactStore'
import { customerService } from '@/services/customerService'

import ContactInfo from '@/components/customer/contact/ContactInfo.vue'

const contactStore = useContactStore()
const router = useRouter()
const itemsScale = ref(20)
const itemsToShow = ref(itemsScale.value)
const props = defineProps({
  contacts: Array
})

const { contacts } = toRefs(props)
const limitedItems = computed(() => {
  return contacts.value.slice(0, itemsToShow.value)
})

const showMore = () => {
  itemsToShow.value += itemsScale.value
}
const showLess = () => {
  itemsToShow.value -= itemsScale.value
}
const showAll = () => {
  itemsToShow.value = contacts.value.length
}

const contact = ref(null)
const isModalContactVisible = ref(false)

const showContactDetails = async (idContact) => {
  contact.value = (await customerService.getContactsById(idContact)).data

  isModalContactVisible.value = true
}

const edit = async (contact) => {
  const responseUser = await alertService.editElement(contact.value.id_contact, 'Contacto')
  if (responseUser.isConfirmed) {
    contactStore.setContact(contact.value)
    router.push('/contactForm')
  }
}
</script>

<template>
  <div v-if="contacts.length > 0">
    <table class="table-contacts">
      <thead>
        <tr>
          <th>ID Contacto</th>
          <th>Nombre Cliente</th>
          <th>Documento</th>
          <th>Celular(Telefono)</th>
          <th>Cargo</th>
          <th>Detalles</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in limitedItems" :key="item.id_contact">
          <td>{{ item.id_contact }}</td>
          <td>{{ item.first_name }} {{ item.last_name }}</td>
          <td>{{ item.document }}</td>
          <td>{{ formatters.formatterPhoneNumber(item.phone) }}</td>
          <td>{{ item.role.role_name }}</td>
          <td>
            <div class="contact-detail" @click="showContactDetails(item.id_contact)">
              Más detalles
            </div>
          </td>
        </tr>
      </tbody>
    </table>
    <div class="buttons-to-show">
      <button class="button-all" v-if="itemsToShow < contacts.length" @click="showAll">
        Mostrar Todo
      </button>
      <button class="button-less" v-if="itemsToShow > itemsScale" @click="showLess">
        Mostrar menos
      </button>
      <button class="button-more" v-if="itemsToShow < contacts.length" @click="showMore">
        Mostrar más
      </button>
    </div>
    <div>
      <div>
        <ContactInfo
          :contact="contact"
          :isModalContactVisible="isModalContactVisible"
          @close="isModalContactVisible = close"
          @edit="edit"
        ></ContactInfo>
      </div>
    </div>
  </div>
  <div v-else>
    <h4>El Usuario no cuenta con clientes asignados</h4>
  </div>
</template>

<style scoped>
.table-contacts {
  width: 95%;
  margin-right: auto;
  margin-left: auto;
  display: table;
  min-width: 400px;
}

.contact-detail:hover {
  cursor: pointer;
}
</style>
