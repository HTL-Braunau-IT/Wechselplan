export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
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
  teachers: {
    firstName: string
    lastName: string
  }[]
}

export async function POST() {
  console.log('Starting teachers import...')
  
  let LDAP_CONFIG: LDAPConfig
  try {
    LDAP_CONFIG = getLDAPConfig()
  } catch (error) {
    console.error('LDAP configuration error:', error)
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

  try {
    // Connect to LDAP
    try {
      await new Promise<void>((resolve, reject) => {
        client.bind(LDAP_CONFIG.username, LDAP_CONFIG.password, (err: Error | null) => {
          if (err) {
            console.error('Error binding to LDAP:', err)
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
      console.error('LDAP connection failed:', error)
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
            teachersOU: LDAP_CONFIG.teachersOU
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
          console.error('LDAP search timed out after 5 seconds');
          reject(new Error('LDAP search timed out'));
        }, 5000);
        
        client.search(LDAP_CONFIG.baseDN, searchOptions, (err: Error | null, res: LDAPSearchResponse) => {
          if (err) {
            clearTimeout(timeout);
            console.error('Search error:', err);
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
            console.error('Search error event:', err);
            reject(err);
          })
        })
      })
    } catch (error) {
      console.error('Simple search failed:', error)
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
    const teachersOUExists = await new Promise<boolean>((resolve) => {
      client.search(LDAP_CONFIG.baseDN, {
        filter: '(objectClass=organizationalUnit)',
        scope: 'sub',
        attributes: ['ou', 'distinguishedName']
      }, (err: Error | null, res: LDAPSearchResponse) => {
        if (err) {
          console.error('Error listing OUs:', err)
          resolve(false)
          return
        }

        let found = false

        res.on('searchEntry', (entry: LDAPEntry) => {
          const ou = entry.attributes.find((attr: LDAPAttribute) => attr.type === 'ou')?.values[0]
          const dn = entry.objectName
          
          if (!LDAP_CONFIG.teachersOU) {
            console.error('Teachers OU is not configured')
            resolve(false)
            return
          }

          // Normalize both OUs for comparison
          const teachersOU = LDAP_CONFIG.teachersOU
          // @ts-expect-error - teachersOU is guaranteed to be string at this point
          const searchOU = teachersOU.split(',')[0].replace('OU=', '').trim().toLowerCase()
          const entryOU = (ou ?? '').trim().toLowerCase()
          
          if (entryOU === searchOU) {
            found = true
          }
        })

        res.on('end', () => {
          resolve(found)
        })

        res.on('error', (err: Error) => {
          console.error('Search error:', err)
          resolve(false)
        })
      })
    })

    if (!teachersOUExists) {
      console.error(`Teachers OU not found: ${LDAP_CONFIG.teachersOU}`)
      return NextResponse.json(
        { 
          error: 'Teachers OU not found',
          details: `Could not find OU at path: ${LDAP_CONFIG.teachersOU}`,
          config: {
            baseDN: LDAP_CONFIG.baseDN,
            teachersOU: LDAP_CONFIG.teachersOU
          }
        },
        { status: 404 }
      )
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

        let hasError = false;

        res.on('searchEntry', (entry: LDAPEntry) => {
          const givenName = entry.attributes.find((attr: LDAPAttribute) => attr.type === 'givenName')?.values[0]
          const sn = entry.attributes.find((attr: LDAPAttribute) => attr.type === 'sn')?.values[0]
          if (givenName && sn) {
            teachers.push({ givenName, sn })
          }
        })

        res.on('end', () => {
          console.log(`Found ${teachers.length} teachers`);
          if (!hasError) {
            resolve(teachers)
          }
        })

        res.on('error', (err: Error) => {
          hasError = true;
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

    // Sort teachers by last name, then first name
    importData.teachers.sort((a, b) => {
      const lastNameCompare = a.lastName.localeCompare(b.lastName)
      if (lastNameCompare !== 0) return lastNameCompare
      return a.firstName.localeCompare(b.firstName)
    })

    return NextResponse.json(importData)
  } catch (error) {
    console.error('Unhandled error in teachers import:', error)
    return NextResponse.json(
      { 
        error: 'Failed to fetch teachers from Active Directory',
        details: error instanceof Error ? error.message : 'Unknown error',
        userMessage: 'An unexpected error occurred while fetching teachers. Please try again later.',
        config: {
          url: LDAP_CONFIG.url,
          baseDN: LDAP_CONFIG.baseDN,
          teachersOU: LDAP_CONFIG.teachersOU
        }
      },
      { status: 500 }
    )
  } finally {
    try {
      client.unbind()
    } catch (error) {
      console.error('Error unbinding LDAP client:', error)
    }
  }
} 