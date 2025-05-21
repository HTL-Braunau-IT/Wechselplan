'use client'

import type { PropsWithChildren } from 'react'
import { I18nextProvider } from 'react-i18next'
import { appWithTranslation } from 'next-i18next'
import type { AppProps } from 'next/app'
import i18n from 'i18next'

function I18nProvider({ children }: PropsWithChildren) {
  return (
    <I18nextProvider i18n={i18n}>
      {children}
    </I18nextProvider>
  )
}

export default appWithTranslation(I18nProvider as React.ComponentType<AppProps>) 