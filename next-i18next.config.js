/** @type {import('next-i18next').UserConfig} */
const config = {
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'de'],
  },
  defaultNS: 'common',
  localePath: './public/locales',
}

export const i18n = config.i18n
export default config 