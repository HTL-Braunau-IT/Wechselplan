import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import Backend from 'i18next-http-backend'

i18n
  .use(Backend)
  .use(initReactI18next)
  .init({
    fallbackLng: 'de',
    debug: false,
    // Only `common` is preloaded; `schedule` is lazy-loaded by the components
    // that call useTranslation('schedule').
    //
    // There is deliberately no `admin` namespace. The admin area is
    // German-only: it is used by a handful of staff at one school, and the
    // strings it needs (schema field labels, sync terminology) have no useful
    // English audience. public/locales/*/admin.json existed but nothing ever
    // requested that namespace, so it was 270 lines of translations the app
    // could not reach. The keys the admin UI does translate live under
    // `admin.*` inside common.json.
    ns: ['common'],
    defaultNS: 'common',
    supportedLngs: ['en', 'de'],
    load: 'languageOnly',
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
      requestOptions: {
        cache: 'no-store',
      },
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
