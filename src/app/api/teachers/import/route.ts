export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import * as ldap from 'ldapjs'

// Debug logging for environment variables
console.log('LDAP Configuration:', {
  NODE_ENV: process.env.NODE_ENV,
  LDAP_URL: process.env.LDAP_URL,
  LDAP_BASE_DN: process.env.LDAP_BASE_DN,
  LDAP_USERNAME: process.env.LDAP_USERNAME,
  LDAP_PASSWORD: Boolean(process.env.LDAP_PASSWORD),
  LDAP_TEACHERS_OU: process.env.LDAP_TEACHERS_OU
});

// Add runtime check
if (process.env.NEXT_RUNTIME !== 'nodejs') {
  console.error('Warning: LDAP route is not running in Node.js runtime!')
}

interface LDAPConfig {
  url: string
  baseDN: string
  username: string
  password: string
  teachersOU: string
}

// LDAP Configuration with runtime validation
const getLDAPConfig = (): LDAPConfig => {
  const config = {
    url: process.env.LDAP_URL,
    baseDN: process.env.LDAP_BASE_DN,
    username: process.env.LDAP_USERNAME,
    password: process.env.LDAP_PASSWORD,
    teachersOU: process.env.LDAP_TEACHERS_OU
  }

  // Validate required environment variables
  const missingVars = Object.entries(config)
    .filter(([_, value]) => !value)
    .map(([key]) => key)

  if (missingVars.length > 0) {
    throw new Error(`Missing required LDAP environment variables: ${missingVars.join(', ')}`)
  }

  return config as LDAPConfig
}

// Log configuration (without sensitive data)
const logConfig = (config: LDAPConfig) => {
  console.log('LDAP Configuration:', {
    url: config.url,
    baseDN: config.baseDN,
    teachersOU: config.teachersOU,
    hasUsername: !!config.username,
    hasPassword: !!config.password
  })
}

interface LDAPAttribute {
  type: string
  values: string[]
}

interface LDAPEntry {
  attributes: LDAPAttribute[]
}

interface LDAPTeacher {
  givenName: string
  sn: string
  sAMAccountName: string
}

interface LDAPSearchResponse {
  on(event: 'searchEntry', callback: (entry: LDAPEntry) => void): void
  on(event: 'page', callback: (result: unknown) => void): void
  on(event: 'end', callback: (result: unknown) => void): void
  on(event: 'error', callback: (err: Error) => void): void
}

interface ImportData {
  teachers: {
    firstName: string
    lastName: string
    username: string
  }[]
}

export async function POST() {
  if (!prisma) {
    return NextResponse.json({ error: 'Database not initialized' }, { status: 500 })
  }

  try {
    const client = ldap.createClient({
      url: process.env.LDAP_URL ?? 'ldap://localhost:389',
      timeout: 5000,
      connectTimeout: 10000,
      idleTimeout: 5000,
      reconnect: true,
      strictDN: false,
      tlsOptions: {
        rejectUnauthorized: false
      }
    })

    const teachers: LDAPTeacher[] = []

    return new Promise((resolve, reject) => {
      client.bind(process.env.LDAP_USERNAME ?? '', process.env.LDAP_PASSWORD ?? '', (err) => {
        if (err) {
          console.error('LDAP bind error:', err)
          client.unbind()
          reject(new Error('LDAP bind failed'))
          return
        }

        const searchOptions: ldap.SearchOptions = {
          filter: '(objectClass=user)',
          scope: 'sub' as const,
          attributes: ['givenName', 'sn', 'sAMAccountName'],
          paged: true,
          sizeLimit: 1000
        }

        client.search(process.env.LDAP_TEACHERS_OU ?? '', searchOptions, (err, res) => {
          if (err) {
            console.error('LDAP search error:', err)
            client.unbind()
            reject(new Error('LDAP search failed'))
            return
          }

          res.on('searchEntry', (entry: LDAPEntry) => {
            const givenName = entry.attributes.find((attr: LDAPAttribute) => attr.type === 'givenName')?.values[0]
            const sn = entry.attributes.find((attr: LDAPAttribute) => attr.type === 'sn')?.values[0]
            const username = entry.attributes.find((attr: LDAPAttribute) => attr.type === 'sAMAccountName')?.values[0]
            if (givenName && sn && username) {
              teachers.push({ givenName, sn, sAMAccountName: username })
            }
          })

          res.on('error', (err: Error) => {
            console.error('LDAP search error:', err)
            client.unbind()
            reject(new Error('LDAP search failed'))
          })

          res.on('end', () => {
            client.unbind()
            resolve(NextResponse.json({
              teachers: teachers.map(teacher => ({
                firstName: teacher.givenName,
                lastName: teacher.sn,
                username: teacher.sAMAccountName
              }))
            }))
          })
        })
      })
    })
  } catch (error) {
    console.error('Error importing teachers:', error)
    return NextResponse.json({ error: 'Failed to import teachers' }, { status: 500 })
  }
} 