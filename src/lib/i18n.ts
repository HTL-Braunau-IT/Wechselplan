import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import Backend from 'i18next-http-backend'

i18n
  .use(Backend)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    debug: false,
    ns: ['common'],
    defaultNS: 'common',
    supportedLngs: ['en', 'de'],
    load: 'languageOnly',
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
      requestOptions: {
        cache: 'no-store'
      }
    },
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  })
  .catch(err => {
    console.error('Failed to initialize i18n:', err)
  })

export default i18n 