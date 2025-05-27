import { NextResponse } from 'next/server'
import * as ldap from 'ldapjs'

// LDAP Configuration
const LDAP_CONFIG = {
  url: process.env.LDAP_URL ?? 'ldap://your-domain-controller',
  baseDN: process.env.LDAP_BASE_DN ?? 'DC=your,DC=domain,DC=com',
  username: process.env.LDAP_USERNAME ?? '',
  password: process.env.LDAP_PASSWORD ?? '',
  studentsOU: process.env.LDAP_STUDENTS_OU ?? 'OU=Students,DC=your,DC=domain,DC=com'
}

interface LDAPClass {
  ou: string
  distinguishedName?: string
}

interface LDAPStudent {
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
    }[]
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
      console.log('Attempting to connect to LDAP server:', LDAP_CONFIG.url)
      console.log('Using credentials:', {
        username: LDAP_CONFIG.username,
        baseDN: LDAP_CONFIG.baseDN
      })
      
      client.bind(LDAP_CONFIG.username, LDAP_CONFIG.password, (err: Error | null) => {
        if (err) {
          console.error('Error binding to LDAP:', err)
          reject(err)
          return
        }
        console.log('Successfully bound to LDAP server')
        resolve()
      })
    })

    // Verify connection by searching the base DN
    await new Promise<void>((resolve, reject) => {
      console.log('Verifying connection by searching base DN:', LDAP_CONFIG.baseDN)
      client.search(LDAP_CONFIG.baseDN, {
        filter: '(objectClass=*)',
        scope: 'base',
        attributes: ['*']
      }, (err: Error | null, res: LDAPSearchResponse) => {
        if (err) {
          console.error('Error verifying connection:', err)
          reject(err)
          return
        }

        res.on('searchEntry', (entry: LDAPEntry) => {
          console.log('Successfully found base DN entry:', entry.dn)
        })

        res.on('end', () => {
          console.log('Base DN search completed successfully')
          resolve()
        })

        res.on('error', (err: Error) => {
          console.error('Search error during verification:', err)
          reject(err)
        })
      })
    })

    console.log('Connected to LDAP server')
    console.log('Searching in:', LDAP_CONFIG.studentsOU)

    // First, verify the Students OU exists
    const studentsOUExists = await new Promise<boolean>((resolve) => {
      console.log('Searching for Students OU:', LDAP_CONFIG.studentsOU)
      // First try to list all OUs under the base DN to debug
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

        console.log('Available OUs in directory:')
        res.on('searchEntry', (entry: LDAPEntry) => {
          const ou = entry.attributes.find((attr: LDAPAttribute) => attr.type === 'ou')?.values[0]
          const dn = entry.attributes.find((attr: LDAPAttribute) => attr.type === 'distinguishedName')?.values[0]
          console.log(`Found OU: ${ou} (${dn})`)
        })

        res.on('end', () => {
          // Now try to find the specific Students OU
          client.search(LDAP_CONFIG.studentsOU, {
            filter: '(objectClass=organizationalUnit)',
            scope: 'sub',
            attributes: ['ou']
          }, (err: Error | null, res: LDAPSearchResponse) => {
            if (err) {
              console.error('Error checking Students OU:', err)
              resolve(false)
              return
            }

            let found = false
            res.on('searchEntry', () => {
              found = true
            })
            res.on('end', () => {
              console.log(`Students OU ${found ? 'found' : 'not found'} at path: ${LDAP_CONFIG.studentsOU}`)
              resolve(found)
            })
            res.on('error', (err: Error) => {
              console.error('Search error:', err)
              resolve(false)
            })
          })
        })
      })
    })

    if (!studentsOUExists) {
      throw new Error(`Students OU not found: ${LDAP_CONFIG.studentsOU}`)
    }

    // Search for class OUs under the Students OU
    const classOUs = await new Promise<LDAPClass[]>((resolve, reject) => {
      client.search(LDAP_CONFIG.studentsOU, {
        filter: '(objectClass=organizationalUnit)',
        scope: 'sub', // Changed from 'one' to 'sub' to search recursively
        attributes: ['ou', 'distinguishedName']
      }, (err: Error | null, res: LDAPSearchResponse) => {
        if (err) {
          console.error('Error searching for class OUs:', err)
          reject(err)
          return
        }

        const classes: LDAPClass[] = []
        res.on('searchEntry', (entry: LDAPEntry) => {
          const ou = entry.attributes.find((attr: LDAPAttribute) => attr.type === 'ou')?.values[0]
          const dn = entry.attributes.find((attr: LDAPAttribute) => attr.type === 'distinguishedName')?.values[0]
          console.log('Found class OU:', { ou, dn })
          // Only include OUs that are direct children of the Students OU and start with a number
          if (dn && dn.includes(LDAP_CONFIG.studentsOU) && /^\d/.test(ou ?? '')) {
            classes.push({ ou: ou ?? '', distinguishedName: dn ?? '' })
          }
        })
        res.on('end', () => {
          console.log('Found classes:', classes)
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
        console.error(`No distinguishedName found for class ${className}`)
        continue
      }
      const studentsOU = classOU.distinguishedName
      console.log('Searching for students in:', studentsOU)

      const students = await new Promise<LDAPStudent[]>((resolve, reject) => {
        const students: LDAPStudent[] = []
        const searchOptions: ldap.SearchOptions = {
          filter: '(objectClass=user)',
          scope: 'sub' as const,
          attributes: ['givenName', 'sn'],
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
            if (givenName && sn) {
              students.push({ givenName, sn })
            }
          })

          res.on('page', () => {
            console.log(`Received page of results for ${className}`)
          })

          res.on('end', () => {
            console.log(`Found ${students.length} students in class ${className}`)
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
            lastName: student.sn
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
    console.error('Error fetching students:', error)
    return NextResponse.json(
      { error: 'Failed to fetch students from Active Directory' },
      { status: 500 }
    )
  } finally {
    client.unbind()
  }
} 