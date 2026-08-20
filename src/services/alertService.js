import Swal from 'sweetalert2'

const getColors = () => {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'

  if (isDark) {
    return {
      basicColor: '#1e293b',
      errorColor: '#e04545',
      succesColor: '#5aad7a',
      cancelColor: '#4a5568',
      confirmColor: '#1a8abf',
      infoColor: '#22b8e8',
      background: '#132238',
      color: '#f0f4f8',
      borderColor: '#2a3a4e'
    }
  }

  return {
    basicColor: '#141E28',
    errorColor: '#EA4C89',
    succesColor: '#2EA44F',
    cancelColor: '#AAAAAA',
    confirmColor: '#141E28',
    infoColor: '#4BA6EC',
    background: '#ffffff',
    color: '#070707',
    borderColor: '#dddddd'
  }
}

const applyDarkModeStyles = (isDark) => {
  if (!isDark) return
  const popup = Swal.getPopup()
  if (popup) {
    popup.style.backgroundColor = '#132238'
    popup.style.color = '#f0f4f8'
  }
  const title = document.querySelector('.swal2-title')
  if (title) title.style.color = '#f0f4f8'
  const htmlContainer = document.querySelector('.swal2-html-container')
  if (htmlContainer) htmlContainer.style.color = '#c8d4e0'
}

export const alertService = {
  async generalError(text) {
    const colors = getColors()
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
    Swal.fire({
      icon: 'error',
      title: 'Oops...',
      text: `ERROR: ${text}`,
      confirmButtonColor: colors.errorColor,
      backgroundColor: colors.background,
      color: colors.color,
      didOpen: () => applyDarkModeStyles(isDark)
    })
  },
  async generalSucces(text) {
    const colors = getColors()
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
    Swal.fire({
      icon: 'success',
      title: 'Completado Exitosamente',
      text: `${text}`,
      confirmButtonColor: colors.succesColor,
      backgroundColor: colors.background,
      color: colors.color,
      didOpen: () => applyDarkModeStyles(isDark)
    })
  },
  async generalInformation(textTitle, text) {
    const colors = getColors()
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
    Swal.fire({
      icon: 'info',
      title: textTitle,
      text: `${text}`,
      confirmButtonColor: colors.succesColor,
      backgroundColor: colors.background,
      color: colors.color,
      didOpen: () => applyDarkModeStyles(isDark)
    })
  },
  async generalWarning(textTitle, text) {
    const colors = getColors()
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
    Swal.fire({
      icon: 'warning',
      title: textTitle,
      text: `${text}`,
      confirmButtonColor: colors.succesColor,
      backgroundColor: colors.background,
      color: colors.color,
      didOpen: () => applyDarkModeStyles(isDark)
    })
  },
  async generalQuestion(textTitle, text) {
    const colors = getColors()
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
    const response = await Swal.fire({
      title: textTitle,
      html: text,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: colors.confirmColor,
      cancelButtonColor: colors.cancelColor,
      confirmButtonText: 'Si',
      backgroundColor: colors.background,
      color: colors.color,
      didOpen: () => applyDarkModeStyles(isDark)
    })
    return response
  },
  async generalQuestionThree(textTitle, text) {
    const colors = getColors()
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
    const response = await Swal.fire({
      title: textTitle,
      html: text,
      icon: 'question',
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonColor: colors.confirmColor,
      cancelButtonColor: colors.infoColor,
      confirmButtonText: 'Si',
      cancelButtonText: 'Cancelar y completar actividad',
      backgroundColor: colors.background,
      color: colors.color,
      didOpen: () => applyDarkModeStyles(isDark)
    })
    return response
  },
  async generalInput(textTitle, text, type, messageToDoesAnswer) {
    const colors = getColors()
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
    const response = await Swal.fire({
      title: textTitle,
      html: text,
      input: type,
      icon: 'question',
      inputValidator: (value) => {
        if (!value) {
          return messageToDoesAnswer
        }
      },
      backgroundColor: colors.background,
      color: colors.color,
      didOpen: () => applyDarkModeStyles(isDark)
    })
    return response
  },
  async editElement(id, element) {
    return await this.generalQuestion(
      `¿Quiere editar el/la ${element}?`,
      `Editará el/la ${element} con ID: <strong>${id}</strong>`
    )
  },
  async editElementCustomized(value, typeElement, element) {
    return await this.generalQuestion(
      `¿Quiere editar el/la ${element}?`,
      `Editará el/la ${element} con ${typeElement}: <strong>${value}</strong>`
    )
  },
  async createElement(element) {
    return await this.generalQuestion(
      `¿Quiere Crear el/la ${element}?`,
      `Se creará el/la ${element}`
    )
  },
  async updateElement(id, element) {
    return await this.generalQuestion(
      `¿Quiere actualizar el/la ${element}?`,
      `Actualizará ${element} con ID: <strong>${id}</strong>`
    )
  },
  async deleteElement(id, element) {
    return await this.generalQuestion(
      `¿Quiere eliminar el/la ${element}?`,
      `Eliminará el/la ${element} con ID: <strong>${id}</strong>`
    )
  }
}
