import Swal from 'sweetalert2'

export const alertService = {
  generalError: function (text) {
    Swal.fire({
      icon: 'error',
      title: 'Oops...',
      text: `ERROR: ${text}`,
      confirmButtonColor: '#141e28'
    })
  }
}
