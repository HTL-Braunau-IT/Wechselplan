import { getApiErrorMessage, parseJsonSafe, unwrapData } from '@/lib/api-client'

export async function adminGet<T>(url: string): Promise<T> {
  const response = await fetch(url)
  const payload = await parseJsonSafe(response)
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, 'Request failed'))
  }
  return unwrapData<T>(payload)
}

export async function adminWrite<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const payload = await parseJsonSafe(response)
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, 'Request failed'))
  }
  return unwrapData<T>(payload)
}
