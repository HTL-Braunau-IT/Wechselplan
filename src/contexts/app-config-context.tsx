'use client'

import { createContext, useContext, type ReactNode } from 'react'

/**
 * Deployment configuration the client needs, resolved on the server by the root
 * layout and handed down as a prop — so it reflects the running container's env,
 * not whatever was set at image build time (one image serves every school).
 */
export interface AppConfig {
  /** A Notenmanagement base URL is configured; show the NM transfer actions. */
  notenmanagementEnabled: boolean
}

const AppConfigContext = createContext<AppConfig>({ notenmanagementEnabled: false })

export function AppConfigProvider({ value, children }: { value: AppConfig; children: ReactNode }) {
  return <AppConfigContext.Provider value={value}>{children}</AppConfigContext.Provider>
}

export function useAppConfig(): AppConfig {
  return useContext(AppConfigContext)
}
