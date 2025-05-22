import { NextResponse } from 'next/server'
import * as ldap from 'ldapjs'

// LDAP Configuration
const LDAP_CONFIG = {
  url: process.env.LDAP_URL ?? 'ldap://your-domain-controller',
  baseDN: process.env.LDAP_BASE_DN ?? 'DC=your,DC=domain,DC=com',
  username: process.env.LDAP_USERNAME ?? '',
  password: process.env.LDAP_PASSWORD ?? '',
  teachersOU: process.env.LDAP_TEACHERS_OU ?? 'OU=Teachers,DC=your,DC=domain,DC=com'
}

interface LDAPTeacher {
  givenName: string
  sn: string
}

interface LDAPAttribute {
  type: string
  values: string[]
}

interface LDAPEntry {
  attributes: LDAPAttribute[]
}

interface LDAPSearchResponse {
  on(event: 'searchEntry', callback: (entry: LDAPEntry) => void): void
  on(event: 'error', callback: (err: Error) => void): void
  on(event: 'end', callback: () => void): void
}

interface ImportData {
  teachers: {
    firstName: string
    lastName: string
  }[]
}

export async function POST() {
  if (!LDAP_CONFIG.username || !LDAP_CONFIG.password) {
    return NextResponse.json(
      { error: 'LDAP credentials are not configured' },
      { status: 500 }
    )
  }

  const client = ldap.createClient({
    url: LDAP_CONFIG.url,
  })

  try {
    // Connect to LDAP
    await new Promise<void>((resolve, reject) => {
      client.bind(LDAP_CONFIG.username, LDAP_CONFIG.password, (err: Error | null) => {
        if (err) reject(err)
        else resolve()
      })
    })

    console.log('Connected to LDAP server')
    console.log('Searching in:', LDAP_CONFIG.teachersOU)

    // First, verify the teachers OU exists
    const teachersOUExists = await new Promise<boolean>((resolve) => {
      client.search(LDAP_CONFIG.teachersOU, {
        filter: '(objectClass=*)',
        scope: 'base',
        attributes: ['ou']
      }, (err: Error | null, res: LDAPSearchResponse) => {
        if (err) {
          console.error('Error checking Teachers OU:', err)
          resolve(false)
          return
        }

        let found = false
        res.on('searchEntry', () => {
          found = true
        })
        res.on('end', () => resolve(found))
        res.on('error', (err: Error) => {
          console.error('Search error:', err)
          resolve(false)
        })
      })
    })

    if (!teachersOUExists) {
      throw new Error(`Teachers OU not found: ${LDAP_CONFIG.teachersOU}`)
    }

    const teachers = await new Promise<LDAPTeacher[]>((resolve, reject) => {
      const teachers: LDAPTeacher[] = []
      const searchOptions: ldap.SearchOptions = {
        filter: '(objectClass=user)',
        scope: 'sub' as const,
        attributes: ['givenName', 'sn'],
        paged: true,
        sizeLimit: 1000
      }

      client.search(LDAP_CONFIG.teachersOU, searchOptions, (err: Error | null, res: LDAPSearchResponse) => {
        if (err) {
          console.error(`Error searching for teachers in ${LDAP_CONFIG.teachersOU}:`, err)
          reject(err)
          return
        }

        res.on('searchEntry', (entry: LDAPEntry) => {
          const givenName = entry.attributes.find((attr: LDAPAttribute) => attr.type === 'givenName')?.values[0]
          const sn = entry.attributes.find((attr: LDAPAttribute) => attr.type === 'sn')?.values[0]
          if (givenName && sn) {
            teachers.push({ givenName, sn })
          }
        })

        res.on('end', () => resolve(teachers))
        res.on('error', (err: Error) => {
          console.error('Search error:', err)
          reject(err)
        })
      })
    })

    const importData: ImportData = {
      teachers: teachers.map(teacher => ({
        firstName: teacher.givenName,
        lastName: teacher.sn
      }))
    }

    return NextResponse.json(importData)
  } catch (error) {
    console.error('Error fetching teachers:', error)
    return NextResponse.json(
      { error: 'Failed to fetch teachers from Active Directory' },
      { status: 500 }
    )
  } finally {
    client.unbind()
  }
} 