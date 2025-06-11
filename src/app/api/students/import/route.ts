export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import * as ldap from 'ldapjs'
import { captureError } from '@/lib/sentry'

// Add runtime check


interface LDAPConfig {
  url: string
  baseDN: string
  username: string
  password: string
  studentsOU: string
}

// LDAP Configuration with runtime validation
const getLDAPConfig = (): LDAPConfig => {
  const config = {
    url: process.env.LDAP_URL,
    baseDN: process.env.LDAP_BASE_DN,
    username: process.env.LDAP_USERNAME,
    password: process.env.LDAP_PASSWORD,
    studentsOU: process.env.LDAP_STUDENTS_OU
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


interface LDAPClass {
  ou: string
  distinguishedName?: string
}

interface LDAPStudent {
  givenName: string
  sn: string
  sAMAccountName: string
}

interface LDAPAttribute {
  type: string
  values: string[]
}

interface LDAPEntry {
  attributes: LDAPAttribute[]
  dn: string
  objectName: string
}

interface LDAPSearchResponse {
  on(event: 'searchEntry', callback: (entry: LDAPEntry) => void): void
  on(event: 'page', callback: (result: unknown) => void): void
  on(event: 'end', callback: (result: unknown) => void): void
  on(event: 'error', callback: (err: Error) => void): void
}

interface ImportData {
  classes: {
    name: string
    students: {
      firstName: string
      lastName: string
      username: string
    }[]
  }[]
}

export async function POST() {
  try {
    let LDAP_CONFIG: LDAPConfig
    try {
      LDAP_CONFIG = getLDAPConfig()
    } catch (error) {
    
      captureError(error, {
        location: 'api/students/import',
        type: 'ldap-config',
        extra: {
          runtime: process.env.NEXT_RUNTIME,
          nodeEnv: process.env.NODE_ENV
        }
      })
      return NextResponse.json(
        { 
          error: 'LDAP configuration error',
          details: error instanceof Error ? error.message : 'Unknown error',
          userMessage: 'LDAP configuration is incomplete. Please check your environment variables.',
          runtime: process.env.NEXT_RUNTIME,
          nodeEnv: process.env.NODE_ENV
        },
        { status: 500 }
      )
    }

    const client = ldap.createClient({
      url: LDAP_CONFIG.url,
      timeout: 5000,
      connectTimeout: 10000,
      idleTimeout: 5000,
      reconnect: true,
      strictDN: false,
      tlsOptions: {
        rejectUnauthorized: false
      }
    })

    // Connect to LDAP
    try {
      await new Promise<void>((resolve, reject) => {
        client.bind(LDAP_CONFIG.username, LDAP_CONFIG.password, (err: Error | null) => {
          if (err) {
            
            const errorMessage = err.message.toLowerCase()
            if (
              errorMessage.includes('invalid credentials') || 
              errorMessage.includes('80090308') ||
              errorMessage.includes('authentication failed') ||
              errorMessage.includes('invalid dn') ||
              errorMessage.includes('invalid password')
            ) {
              reject(new Error('Invalid LDAP credentials. Please check your username and password.'))
            } else {
              reject(err)
            }
            return
          }
          resolve()
        })
      })
    } catch (error) {
      
      captureError(error, {
        location: 'api/students/import',
        type: 'ldap-connection',
        extra: {
          config: {
            url: LDAP_CONFIG.url,
            baseDN: LDAP_CONFIG.baseDN,
            studentsOU: LDAP_CONFIG.studentsOU
          }
        }
      })
      const errorMessage = error instanceof Error ? error.message.toLowerCase() : 'unknown error'
      const isAuthError = 
        errorMessage.includes('invalid ldap credentials') ||
        errorMessage.includes('invalid credentials') ||
        errorMessage.includes('authentication failed') ||
        errorMessage.includes('invalid dn') ||
        errorMessage.includes('invalid password')
      
      return NextResponse.json(
        { 
          error: isAuthError ? 'Authentication failed' : 'Failed to connect to LDAP server',
          details: error instanceof Error ? error.message : 'Unknown error',
          userMessage: isAuthError 
            ? 'Invalid LDAP credentials. Please check your username and password.'
            : 'Failed to connect to LDAP server. Please try again later.',
          config: {
            url: LDAP_CONFIG.url,
            baseDN: LDAP_CONFIG.baseDN,
            studentsOU: LDAP_CONFIG.studentsOU
          }
        },
        { status: isAuthError ? 401 : 503 }
      )
    }

    // First, try a simple search to verify permissions
    try {
      await new Promise<void>((resolve, reject) => {
        const searchOptions = {
          filter: '(|(objectClass=organizationalUnit)(objectClass=container))',
          scope: 'sub' as const,
          attributes: ['ou', 'distinguishedName', 'objectClass'],
          sizeLimit: 100000,
          timeLimit: 10
        }

        let timedOut = false;
        const timeout = setTimeout(() => {
          timedOut = true;
          
          reject(new Error('LDAP search timed out'));
        }, 5000);
        
        client.search(LDAP_CONFIG.baseDN, searchOptions, (err: Error | null, res: LDAPSearchResponse) => {
          if (err) {
            clearTimeout(timeout);
            
            reject(err);
            return;
          }

          let hasError = false;

          res.on('searchEntry', () => {
            if (timedOut) return;
            clearTimeout(timeout);
          })

          res.on('end', () => {
            clearTimeout(timeout);
            if (!hasError) {
              resolve();
            }
          })

          res.on('error', (err: Error) => {
            clearTimeout(timeout);
            hasError = true;
            
            reject(err);
          })
        })
      })
    } catch (error) {
      
      captureError(error, {
        location: 'api/students/import',
        type: 'ldap-simple-search',
        extra: {
          config: {
            url: LDAP_CONFIG.url,
            baseDN: LDAP_CONFIG.baseDN,
            studentsOU: LDAP_CONFIG.studentsOU
          }
        }
      })
      return NextResponse.json(
        { 
          error: 'Failed to perform basic LDAP search',
          details: error instanceof Error ? error.message : 'Unknown error',
          userMessage: 'Failed to perform basic LDAP search. Please check LDAP permissions.',
          runtime: process.env.NEXT_RUNTIME,
          nodeEnv: process.env.NODE_ENV
        },
        { status: 503 }
      )
    }

    // Now try the OU search
    const studentsOUExists = await new Promise<boolean>((resolve) => {
      client.search(LDAP_CONFIG.baseDN, {
        filter: '(objectClass=organizationalUnit)',
        scope: 'sub',
        attributes: ['ou', 'distinguishedName']
      }, (err: Error | null, res: LDAPSearchResponse) => {
        if (err) {
          
          captureError(err, {
            location: 'api/students/import',
            type: 'ldap-ou-search',
            extra: {
              config: {
                url: LDAP_CONFIG.url,
                baseDN: LDAP_CONFIG.baseDN,
                studentsOU: LDAP_CONFIG.studentsOU
              }
            }
          })
          resolve(false)
          return
        }

        let found = false

        res.on('searchEntry', (entry: LDAPEntry) => {
          const ou = entry.attributes.find((attr: LDAPAttribute) => attr.type === 'ou')?.values[0]

          
          if (!LDAP_CONFIG.studentsOU) {
           
            resolve(false)
            return
          }

          // Normalize both OUs for comparison
          const studentsOU = LDAP_CONFIG.studentsOU
          // @ts-expect-error - studentsOU is guaranteed to be string at this point
          const searchOU = studentsOU.split(',')[0].replace('OU=', '').trim().toLowerCase()
          const entryOU = (ou ?? '').trim().toLowerCase()
          
          if (entryOU === searchOU) {
            found = true
          }
        })

        res.on('end', () => {
          resolve(found)
        })

        res.on('error', () => {
          
          resolve(false)
        })
      })
    })

    if (!studentsOUExists) {
      captureError(new Error('Students OU not found'), {
        location: 'api/students/import',
        type: 'students-ou-not-found'
      })
      return NextResponse.json(
        { 
          error: 'Students OU not found',
          details: `Could not find OU at path: ${LDAP_CONFIG.studentsOU}`,
          config: {
            baseDN: LDAP_CONFIG.baseDN,
            studentsOU: LDAP_CONFIG.studentsOU
          }
        },
        { status: 404 }
      )
    }

    // Search for class OUs under the Students OU
    const classOUs = await new Promise<LDAPClass[]>((resolve, reject) => {
      const classes: LDAPClass[] = []
      client.search(LDAP_CONFIG.studentsOU, {
        filter: '(objectClass=organizationalUnit)',
        scope: 'one',
        attributes: ['ou', 'distinguishedName']
      }, (err: Error | null, res: LDAPSearchResponse) => {
        if (err) {
          captureError(err, {
            location: 'api/students/import',
            type: 'ldap-class-search'
          })
          reject(err)
          return
        }

        res.on('searchEntry', (entry: LDAPEntry) => {
          const ou = entry.attributes.find((attr: LDAPAttribute) => attr.type === 'ou')?.values[0]
          const dn = String(entry.objectName)
          
          // Only include OUs that are direct children of the Students OU
          const normalizedDN = dn.toLowerCase()
          const normalizedStudentsOU = LDAP_CONFIG.studentsOU.toLowerCase()
          if (normalizedDN.includes(normalizedStudentsOU) && 
              !normalizedDN.includes('ou=klassen') && 
              !normalizedDN.includes('ou=dummy')) {
            classes.push({ ou: ou ?? '', distinguishedName: dn })
          }
        })

        res.on('end', () => {
          resolve(classes)
        })

        res.on('error', (err: Error) => {
          captureError(err, {
            location: 'api/students/import',
            type: 'ldap-class-search-error'
          })
          reject(err)
        })
      })
    })

    const importData: ImportData = {
      classes: []
    }

    // For each class OU, get all students
    for (const classOU of classOUs) {
      const className = classOU.ou
      if (!classOU.distinguishedName) {
        continue
      }
      const studentsOU = classOU.distinguishedName

      const students = await new Promise<LDAPStudent[]>((resolve, reject) => {
        const students: LDAPStudent[] = []
        const searchOptions: ldap.SearchOptions = {
          filter: '(objectClass=user)',
          scope: 'sub' as const,
          attributes: ['givenName', 'sn', 'sAMAccountName'],
          paged: true,
          sizeLimit: 1000
        }

        client.search(studentsOU, searchOptions, (err: Error | null, res: LDAPSearchResponse) => {
          if (err) {
            captureError(err, {
              location: 'api/students/import',
              type: 'ldap-student-search-error'
            })
            reject(err)
            return
          }

          res.on('searchEntry', (entry: LDAPEntry) => {
            const givenName = entry.attributes.find((attr: LDAPAttribute) => attr.type === 'givenName')?.values[0]
            const sn = entry.attributes.find((attr: LDAPAttribute) => attr.type === 'sn')?.values[0]
            const sAMAccountName = entry.attributes.find((attr: LDAPAttribute) => attr.type === 'sAMAccountName')?.values[0]

            if (givenName && sn && sAMAccountName) {
              students.push({
                givenName,
                sn,
                sAMAccountName
              })
            }
          })

          res.on('end', () => {
            resolve(students)
          })

          res.on('error', (err: Error) => {
           captureError(err, {
            location: 'api/students/import',
            type: 'ldap-student-search-error'
           })
            reject(err)
          })
        })
      })

      importData.classes.push({
        name: className,
        students: students.map(student => ({
          firstName: student.givenName,
          lastName: student.sn,
          username: student.sAMAccountName
        }))
      })
    }

    // Clean up
    client.unbind()

    return NextResponse.json(importData, { status: 200 })
  } catch (error) {
    
    captureError(error, {
      location: 'api/students/import',
      type: 'unexpected-error',
      extra: {
        runtime: process.env.NEXT_RUNTIME,
        nodeEnv: process.env.NODE_ENV
      }
    })
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
        userMessage: 'An unexpected error occurred. Please try again later.',
        runtime: process.env.NEXT_RUNTIME,
        nodeEnv: process.env.NODE_ENV
      },
      { status: 500 }
    )
  }
} 