import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '~/lib/sentry'
import * as ldap from 'ldapjs'

interface ImportRequest {
  classes: string[]
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

interface LDAPConfig {
  url: string
  baseDN: string
  username: string
  password: string
  studentsOU: string
}

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

// Function to fetch LDAP data
async function fetchLDAPData(): Promise<ImportData> {
  const LDAP_CONFIG = getLDAPConfig()

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
  await new Promise<void>((resolve, reject) => {
    client.bind(LDAP_CONFIG.username, LDAP_CONFIG.password, (err: Error | null) => {
      if (err) {
        reject(err)
        return
      }
      resolve()
    })
  })

  // Search for class OUs under the Students OU
  const classOUs = await new Promise<LDAPClass[]>((resolve, reject) => {
    const classes: LDAPClass[] = []
    client.search(LDAP_CONFIG.studentsOU, {
      filter: '(objectClass=organizationalUnit)',
      scope: 'one',
      attributes: ['ou', 'distinguishedName']
    }, (err: Error | null, res: LDAPSearchResponse) => {
      if (err) {
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

  return importData
}

/**
 * Handles importing student data for specified classes from an external source and updates the database accordingly.
 *
 * Parses the incoming request for class names, fetches corresponding student data, replaces existing students for each class, and returns a summary of the import operation.
 *
 * @returns A JSON response containing a success message and counts of imported students and updated classes, or an error message with status 500 if the import fails.
 */
export async function POST(request: Request) {
  try {
    const data = await request.json() as ImportRequest
    let importedCount = 0
    let updatedCount = 0

    // Get import data directly from LDAP
    const importData = await fetchLDAPData()

    // Import each selected class
    for (const className of data.classes) {
      const classData = importData.classes.find((c: { name: string }) => c.name === className)
      if (!classData) continue

      // Get or create the class
      const classRecord = await prisma.class.upsert({
        where: { name: className },
        update: {},
        create: { name: className }
      })

      // Note: We delete all students and recreate them to sync with LDAP.
      // This means groupId values are lost, but GroupAssignment records remain.
      // The GET endpoint for group assignments will auto-create missing GroupAssignment
      // records when students are later assigned to groups.

      // Delete existing students in this class
      await prisma.student.deleteMany({
        where: {
          classId: classRecord.id
        }
      })

      // Clean up orphaned GroupAssignment records (groups with no students)
      // These will be recreated automatically when students are assigned to groups
      await prisma.groupAssignment.deleteMany({
        where: {
          class: className
        }
      })

      // Import new students for this class
      for (const student of classData.students) {
        await prisma.student.create({
          data: {
            firstName: student.firstName,
            lastName: student.lastName,
            username: student.username,
            classId: classRecord.id
          }
        })
        importedCount++
      }
      updatedCount++
    }

    return NextResponse.json({
      message: 'Import completed successfully',
      students: importedCount,
      classes: updatedCount
    })  
  } catch (error) {
    console.error('Error in import save:', error)
    captureError(error, {
      location: 'api/students/import/save',
      type: 'import-students'
    })
    return NextResponse.json(
      { error: 'Failed to import students' },
      { status: 500 }
    )
  }
} 