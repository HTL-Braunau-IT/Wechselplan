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
  LDAP_STUDENTS_OU: process.env.LDAP_STUDENTS_OU
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
  console.log('Starting students import...')
  
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
    const studentsOUExists = await new Promise<boolean>((resolve) => {
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

          
          if (!LDAP_CONFIG.studentsOU) {
            console.error('Students OU is not configured')
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

        res.on('error', (err: Error) => {
          console.error('Search error:', err)
          resolve(false)
        })
      })
    })

    if (!studentsOUExists) {
      console.error(`Students OU not found: ${LDAP_CONFIG.studentsOU}`)
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
          console.error('Error searching for class OUs:', err)
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
          console.error('Search error:', err)
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
            console.error(`Error searching for students in ${studentsOU}:`, err)
            reject(err)
            return
          }

          res.on('searchEntry', (entry: LDAPEntry) => {
            const givenName = entry.attributes.find((attr: LDAPAttribute) => attr.type === 'givenName')?.values[0]
            const sn = entry.attributes.find((attr: LDAPAttribute) => attr.type === 'sn')?.values[0]
            const username = entry.attributes.find((attr: LDAPAttribute) => attr.type === 'sAMAccountName')?.values[0]
            if (givenName && sn && username) {
              students.push({ givenName, sn, sAMAccountName: username })
            }
          })

          res.on('end', () => {
            console.log(`Found ${students.length} students in class ${className}`);
            resolve(students)
          })

          res.on('error', (err: Error) => {
            console.error('Search error:', err)
            reject(err)
          })
        })
      })

      // Only add the class if it has students
      if (students.length > 0) {
        importData.classes.push({
          name: className,
          students: students.map(student => ({
            firstName: student.givenName,
            lastName: student.sn,
            username: student.sAMAccountName
          }))
        })
      }
    }

    // Sort classes by name
    importData.classes.sort((a, b) => a.name.localeCompare(b.name))

    // Sort students within each class by last name, then first name
    importData.classes.forEach(classData => {
      classData.students.sort((a, b) => {
        const lastNameCompare = a.lastName.localeCompare(b.lastName)
        if (lastNameCompare !== 0) return lastNameCompare
        return a.firstName.localeCompare(b.firstName)
      })
    })

    return NextResponse.json(importData)
  } catch (error) {
    console.error('Unhandled error in students import:', error)
    return NextResponse.json(
      { 
        error: 'Failed to fetch students from Active Directory',
        details: error instanceof Error ? error.message : 'Unknown error',
        userMessage: 'An unexpected error occurred while fetching students. Please try again later.',
        config: {
          url: LDAP_CONFIG.url,
          baseDN: LDAP_CONFIG.baseDN,
          studentsOU: LDAP_CONFIG.studentsOU
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