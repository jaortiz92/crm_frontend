export const validatePassword = {
  passwordRules: function () {
    return [
      { regex: /.{8,}/, message: 'Menos de 8 caracteres' },
      { regex: /[A-Z]/, message: 'No contiene mayusculas' },
      { regex: /[a-z]/, message: 'No contiene minusculas' },
      { regex: /\d/, message: 'No contiene numeros' },
      { regex: /[\W_]/, message: 'No contiene caracter especial' }
    ]
  },
  passwordErrors: function (password) {
    return this.passwordRules()
      .filter((rule) => !rule.regex.test(password))
      .map((rule) => rule.message)
  },
  isPasswordValid: function (errors) {
    return errors.length === 0
  },
  validatePassword: function (password) {
    // Fixes 2 (SECU): never log the password or its derivative state
    // (console output leaks credentials on Login/Reset/Update/UserForm).
    const errors = this.passwordErrors(password)
    const isValid = this.isPasswordValid(errors)
    return {
      isValid: isValid,
      errors: errors
    }
  }
}
