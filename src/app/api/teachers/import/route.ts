export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import ldap from 'ldapjs'
import { captureError } from '@/lib/sentry'


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
  mail?: string
}


/**
 * Handles a POST request to import teacher data from an LDAP server.
 *
 * Connects to the configured LDAP server, searches for user entries under the teachers organizational unit, and extracts teacher information. Returns a JSON response containing a list of teachers with their first name, last name, username, and email. Responds with an error message and HTTP 500 status if the LDAP connection, bind, or search fails.
 *
 * @returns A JSON response with an array of imported teachers or an error message on failure.
 */
export async function POST(): Promise<Response> {

  try {
    const config = getLDAPConfig()
    const client = ldap.createClient({
      url: config.url,
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

    return new Promise<Response>((resolve) => {
      client.bind(config.username, config.password, (err) => {
        if (err) {

          captureError(err, {
            location: 'api/teachers/import',
            type: 'ldap-bind',
            extra: {
              config: {
                url: config.url,
                baseDN: config.baseDN,
                teachersOU: config.teachersOU
              }
            }
          })
          client.unbind()
          resolve(NextResponse.json({ error: 'LDAP bind failed' }, { status: 500 }))
          return
        }

        const searchOptions: ldap.SearchOptions = {
          filter: '(objectClass=user)',
          scope: 'sub' as const,
          attributes: ['givenName', 'sn', 'sAMAccountName', 'mail'],
          paged: true,
          sizeLimit: 1000
        }

        client.search(config.teachersOU, searchOptions, (err, res) => {
          if (err) {

            captureError(err, {
              location: 'api/teachers/import',
              type: 'ldap-search',
              extra: {
                config: {
                  url: config.url,
                  baseDN: config.baseDN,
                  teachersOU: config.teachersOU
                }
              }
            })
            client.unbind()
            resolve(NextResponse.json({ error: 'LDAP search failed' }, { status: 500 }))
            return
          }

          res.on('searchEntry', (entry: LDAPEntry) => {
            const givenName = entry.attributes.find((attr: LDAPAttribute) => attr.type === 'givenName')?.values[0]
            const sn = entry.attributes.find((attr: LDAPAttribute) => attr.type === 'sn')?.values[0]
            const username = entry.attributes.find((attr: LDAPAttribute) => attr.type === 'sAMAccountName')?.values[0]
            const email = entry.attributes.find((attr: LDAPAttribute) => attr.type === 'mail')?.values[0]
            if (givenName && sn && username) {
              teachers.push({ givenName, sn, sAMAccountName: username, mail: email })
            }
          })

          res.on('error', (err: Error) => {

            captureError(err, {
              location: 'api/teachers/import',
              type: 'ldap-search-event',
              extra: {
                config: {
                  url: config.url,
                  baseDN: config.baseDN,
                  teachersOU: config.teachersOU
                }
              }
            })
            client.unbind()
            resolve(NextResponse.json({ error: 'LDAP search failed' }, { status: 500 }))
          })

          res.on('end', () => {
            client.unbind()
            resolve(NextResponse.json({
              teachers: teachers.map(teacher => ({
                firstName: teacher.givenName,
                lastName: teacher.sn,
                username: teacher.sAMAccountName,
                email: teacher.mail
              }))
            }))
          })
        })
      })
    })
  } catch (error) {

    captureError(error, {
      location: 'api/teachers/import',
      type: 'import-teachers',
      extra: {
        runtime: process.env.NEXT_RUNTIME,
        nodeEnv: process.env.NODE_ENV
      }
    })
    return NextResponse.json({ error: 'Failed to import teachers' }, { status: 500 })
  }
} 