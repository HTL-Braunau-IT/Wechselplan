import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { captureError } from '@/lib/sentry'

const envFilePath = path.join(process.cwd(), '.env')

interface LDAPConfig {
  url: string
  baseDN: string
  username: string
  password: string
  studentsOU: string
  teachersOU: string
}

/**
 * Handles GET requests to retrieve the current LDAP configuration from environment variables.
 *
 * @returns A JSON response containing the LDAP configuration object.
 */
export async function GET() {
  try {
    const config: LDAPConfig = {
      url: process.env.LDAP_URL ?? '',
      baseDN: process.env.LDAP_BASE_DN ?? '',
      username: process.env.LDAP_USERNAME ?? '',
      password: process.env.LDAP_PASSWORD ?? '',
      studentsOU: process.env.LDAP_STUDENTS_OU ?? '',
      teachersOU: process.env.LDAP_TEACHERS_OU ?? ''
    }
    return NextResponse.json(config)
  } catch (error) {

    captureError(error, {
      location: 'api/admin/ldap-config',
      type: 'ldap-config',
      extra: {
        runtime: process.env.NEXT_RUNTIME,
        nodeEnv: process.env.NODE_ENV
      }
    })
    return NextResponse.json(
      { error: 'Failed to load LDAP configuration' },
      { status: 500 }
    )
  }
}

/**
 * Handles POST requests to update the LDAP configuration by modifying LDAP-related environment variables in the `.env` file.
 *
 * Expects a JSON body containing LDAP configuration fields. Existing LDAP environment variables are replaced, and new ones are added as needed.
 *
 * @returns A JSON response indicating whether the update was successful.
 */
export async function POST(request: Request) {
  try {
    const config = await request.json() as LDAPConfig
    
    // Read existing .env file
    let envContent = ''
    try {
      envContent = fs.readFileSync(envFilePath, 'utf-8')
    } catch  {
      // File doesn't exist yet, that's okay
    }

    // Update or add LDAP configuration
    const envLines = envContent.split('\n')
    const newEnvLines: string[] = []
    const configKeys = Object.keys(config) as (keyof LDAPConfig)[]
    
    // Create a map of existing LDAP variables
    const existingVars = new Map<string, string>()
    for (const line of envLines) {
      const [key, value] = line.split('=')
      if (key?.startsWith('LDAP_')) {
        existingVars.set(key, value ?? '')
      }
    }

    // Process existing lines
    for (const line of envLines) {
      const [key] = line.split('=')
      if (!key?.startsWith('LDAP_')) {
        newEnvLines.push(line)
      }
    }

    // Add new configuration
    for (const key of configKeys) {
      if (config[key]) {
        let envKey = key.toUpperCase()
        // Add underscores for specific keys
        if (key === 'baseDN') envKey = 'BASE_DN'
        if (key === 'studentsOU') envKey = 'STUDENTS_OU'
        if (key === 'teachersOU') envKey = 'TEACHERS_OU'
        const fullKey = `LDAP_${envKey}`
        newEnvLines.push(`${fullKey}=${config[key]}`)
      }
    }

    // Write back to .env file
    fs.writeFileSync(envFilePath, newEnvLines.join('\n'))

    return NextResponse.json({ success: true })
  } catch (error) {
    captureError(error, {
      location: 'api/admin/ldap-config',
      type: 'ldap-config',
      extra: {
        runtime: process.env.NEXT_RUNTIME,
        nodeEnv: process.env.NODE_ENV
      }
    })
    return NextResponse.json(
      { error: 'Failed to save LDAP configuration' },
      { status: 500 }
    )
  }
} 