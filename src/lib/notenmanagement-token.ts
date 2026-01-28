/**
 * Utility functions for managing Notenmanagement API tokens in localStorage
 */

const TOKEN_STORAGE_KEY = 'notenmanagement_token'
const TOKEN_EXPIRY_KEY = 'notenmanagement_token_expiry'
const TOKEN_USERNAME_KEY = 'notenmanagement_token_username'

export interface TokenData {
  token: string
  expiresAt: number // Unix timestamp in milliseconds
  username: string
}

/**
 * Store token in localStorage
 */
export function storeToken(token: string, expiresIn: number, username: string): void {
  if (typeof window === 'undefined') return

  const expiresAt = Date.now() + expiresIn * 1000 // expiresIn is in seconds
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
  localStorage.setItem(TOKEN_EXPIRY_KEY, String(expiresAt))
  localStorage.setItem(TOKEN_USERNAME_KEY, username)
}

/**
 * Get stored token if it exists and is not expired
 */
export function getStoredToken(): TokenData | null {
  if (typeof window === 'undefined') return null

  try {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY)
    const expiryStr = localStorage.getItem(TOKEN_EXPIRY_KEY)
    const username = localStorage.getItem(TOKEN_USERNAME_KEY)

    if (!token || !expiryStr || !username) {
      return null
    }

    const expiresAt = parseInt(expiryStr, 10)
    const now = Date.now()

    // Check if token is expired (with 5 minute buffer)
    if (now >= expiresAt - 5 * 60 * 1000) {
      clearToken()
      return null
    }

    return { token, expiresAt, username }
  } catch (error) {
    console.error('Error reading token from localStorage:', error)
    return null
  }
}

/**
 * Clear stored token
 */
export function clearToken(): void {
  if (typeof window === 'undefined') return

  localStorage.removeItem(TOKEN_STORAGE_KEY)
  localStorage.removeItem(TOKEN_EXPIRY_KEY)
  localStorage.removeItem(TOKEN_USERNAME_KEY)
}

/**
 * Check if a token exists for a specific username
 */
export function hasTokenForUsername(username: string): boolean {
  const tokenData = getStoredToken()
  return tokenData !== null && tokenData.username === username
}

