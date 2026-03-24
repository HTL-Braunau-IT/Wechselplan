/**
 * Untis WebUntis API Client
 * Custom implementation using JSON-RPC 2.0 protocol
 * 
 * Authenticates with username/password and fetches absence data
 */

import { env } from '@/env'

export interface UntisAbsence {
  id: number
  startDate: number
  endDate: number
  startTime: number
  endTime: number
  createDate: number
  lastUpdate: number
  studentName: string
  createdUser: string
  updatedUser: string
  reason: string
  reasonId: number
  excuseStatus: string
  text: string
  isExcused: boolean
  canEdit: boolean
  interruptions: unknown[]
}

export interface UntisSessionInfo {
  sessionId: string
  personType: number
  personId: number
  klasseId: number
}

interface JsonRpcRequest {
  jsonrpc: '2.0'
  method: string
  params: Record<string, unknown>
  id: number
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0'
  result?: T
  error?: {
    code: number
    message: string
  }
  id: number
}

export class UntisClient {
  private school: string
  private baseUrl: string
  private username: string
  private password: string
  private sessionId: string | null = null
  private requestId = 0

  constructor() {
    this.school = env.UNTIS_SCHOOL
    this.baseUrl = `https://${env.UNTIS_BASE_URL}`
    this.username = env.UNTIS_USERNAME
    this.password = env.UNTIS_PASSWORD
  }

  /**
   * Make a JSON-RPC 2.0 request to Untis API
   */
  private async request<T>(
    method: string,
    params: Record<string, unknown> = {}
  ): Promise<T> {
    const payload: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id: ++this.requestId,
    }

    const url = new URL('/WebUntis/jsonrpc.do', this.baseUrl)

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.sessionId && { Cookie: `JSESSIONID=${this.sessionId}` }),
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(`Untis API error: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as JsonRpcResponse<T>

    if (data.error) {
      throw new Error(`Untis RPC error: ${data.error.message} (code: ${data.error.code})`)
    }

    if (data.result === undefined) {
      throw new Error('Untis RPC: No result in response')
    }

    return data.result
  }

  /**
   * Authenticate with Untis using username/password
   */
  async login(): Promise<UntisSessionInfo> {
    const sessionInfo = await this.request<UntisSessionInfo>('authenticate', {
      user: this.username,
      password: this.password,
      client: 'WechselplanClient/1.0',
    })

    this.sessionId = sessionInfo.sessionId
    return sessionInfo
  }

  /**
   * Logout from Untis session
   */
  async logout(): Promise<void> {
    if (!this.sessionId) return

    try {
      await this.request('logout', {})
    } finally {
      this.sessionId = null
    }
  }

  /**
   * Fetch absences for a given date
   * Uses the classreg API endpoint (not JSON-RPC)
   * @param date ISO date string (YYYY-MM-DD)
   * @returns Array of absence records
   */
  async getAbsences(date: string): Promise<UntisAbsence[]> {
    if (!this.sessionId) {
      throw new Error('Not authenticated. Call login() first.')
    }

    // Format date as YYYYMMDD for Untis API
    const dateStr = date.replace(/-/g, '')

    console.log('[Untis Client] Fetching absences from classreg API', {
      date: dateStr,
      endpoint: '/WebUntis/api/classreg/absences/students'
    })

    const url = new URL('/WebUntis/api/classreg/absences/students', this.baseUrl)
    url.searchParams.set('startDate', dateStr)
    url.searchParams.set('endDate', dateStr)

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `JSESSIONID=${this.sessionId}`,
      },
    })

    if (!response.ok) {
      const text = await response.text()
      console.error('[Untis Client] API error:', {
        status: response.status,
        statusText: response.statusText,
        body: text
      })
      throw new Error(`Untis API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json() as { data?: { absences: UntisAbsence[] } }

    if (!data.data?.absences) {
      console.log('[Untis Client] No absence data in response', data)
      return []
    }

    console.log(`[Untis Client] Received ${data.data.absences.length} absences from API`)
    return data.data.absences
  }

  /**
   * Get current school year
   */
  async getLatestSchoolyear(): Promise<{ id: number; name: string; startDate: number; endDate: number }> {
    if (!this.sessionId) {
      throw new Error('Not authenticated. Call login() first.')
    }

    return this.request('getLatestSchoolyear', {})
  }

  /**
   * Create a managed session: login, execute fn, then logout
   */
  static async withSession<T>(fn: (client: UntisClient) => Promise<T>): Promise<T> {
    const client = new UntisClient()
    try {
      await client.login()
      return await fn(client)
    } finally {
      await client.logout()
    }
  }
}
