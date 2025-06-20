import Swal from 'sweetalert2'

const colors = {
  basicColor: '#141E28',
  errorColor: '#EA4C89',
  succesColor: '#2EA44F',
  cancelColor: '#AAAAAA',
  confirmColor: '#141E28',
  infoColor: '#4BA6EC'
}

export const alertService = {
  async generalError(text) {
    Swal.fire({
      icon: 'error',
      title: 'Oops...',
      text: `ERROR: ${text}`,
      confirmButtonColor: colors.errorColor
    })
  },
  async generalSucces(text) {
    Swal.fire({
      icon: 'success',
      title: 'Completado Exitosamente',
      text: `${text}`,
      confirmButtonColor: colors.succesColor
    })
  },
  async generalInformation(textTitle, text) {
    Swal.fire({
      icon: 'info',
      title: textTitle,
      text: `${text}`,
      confirmButtonColor: colors.succesColor
    })
  },
  async generalWarning(textTitle, text) {
    Swal.fire({
      icon: 'warning',
      title: textTitle,
      text: `${text}`,
      confirmButtonColor: colors.succesColor
    })
  },
  async generalQuestion(textTitle, text) {
    const response = await Swal.fire({
      title: textTitle,
      html: text,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: colors.confirmColor,
      cancelButtonColor: colors.cancelColor,
      confirmButtonText: 'Si'
    })
    return response
  },
  async generalQuestionThree(textTitle, text) {
    const response = await Swal.fire({
      title: textTitle,
      html: text,
      icon: 'question',
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonColor: colors.confirmColor,
      cancelButtonColor: colors.infoColor,
      confirmButtonText: 'Si',
      cancelButtonText: 'Cancelar y completar actividad'
    })
    return response
  },
  async generalInput(textTitle, text, type, messageToDoesAnswer) {
    const response = await Swal.fire({
      title: textTitle,
      html: text,
      input: type,
      icon: 'question',
      inputValidator: (value) => {
        if (!value) {
          return messageToDoesAnswer
        }
      }
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
