import { NextResponse } from 'next/server'
import { env } from '@/env'

/**
 * Whether this deployment talks to a Notenmanagement system at all.
 *
 * `NOTENMANAGEMENT_BASE_URL` is optional: a school without the HTL
 * Notenmanagement leaves it unset, and every NM-backed route answers 503 while
 * the UI hides the transfer actions (`useAppConfig().notenmanagementEnabled`).
 */
export function isNotenmanagementConfigured(): boolean {
  return Boolean(env.NOTENMANAGEMENT_BASE_URL)
}

/** The response every NM-backed route returns when no base URL is configured. */
export function notenmanagementNotConfigured(): NextResponse {
  return NextResponse.json({ error: 'Notenmanagement ist nicht konfiguriert' }, { status: 503 })
}
