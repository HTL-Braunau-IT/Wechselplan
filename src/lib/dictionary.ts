import 'server-only'

type Dictionary = {
  common: {
    welcome: string
    settings: string
    language: string
    theme: string
    dark: string
    light: string
    system: string
    schoolYear: string
  }
  navigation: {
    home: string
    dashboard: string
    profile: string
    logout: string
    schedules: string
    students: string
    menu: string
    closeMenu: string
  }
  auth: {
    login: string
    register: string
    email: string
    password: string
    forgotPassword: string
    rememberMe: string
  }
  errors: {
    required: string
    invalidEmail: string
    passwordTooShort: string
    somethingWentWrong: string
  }
}

const dictionaries = {
  en: () => import('../../public/locales/en/common.json').then((module) => module.default as Dictionary),
  de: () => import('../../public/locales/de/common.json').then((module) => module.default as Dictionary),
}

export const getDictionary = async (locale: string): Promise<Dictionary> => {
  if (!(locale in dictionaries)) {
    throw new Error(`Locale ${locale} is not supported`)
  }
  return dictionaries[locale as keyof typeof dictionaries]()
} 