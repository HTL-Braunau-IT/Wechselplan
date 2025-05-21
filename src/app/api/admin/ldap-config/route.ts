import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const envFilePath = path.join(process.cwd(), '.env')

// GET /api/admin/ldap-config - Get current LDAP configuration
export async function GET() {
  try {
    const envContent = fs.readFileSync(envFilePath, 'utf-8')
    const config = {
      url: process.env.LDAP_URL || '',
      baseDN: process.env.LDAP_BASE_DN || '',
      username: process.env.LDAP_USERNAME || '',
      password: process.env.LDAP_PASSWORD || '',
      studentsOU: process.env.LDAP_STUDENTS_OU || ''
    }
    return NextResponse.json(config)
  } catch (error) {
    console.error('Error reading LDAP configuration:', error)
    return NextResponse.json(
      { error: 'Failed to read LDAP configuration' },
      { status: 500 }
    )
  }
}

// POST /api/admin/ldap-config - Update LDAP configuration
export async function POST(request: Request) {
  try {
    const config = await request.json()
    
    // Read current .env file
    let envContent = fs.readFileSync(envFilePath, 'utf-8')
    
    // Update or add LDAP configuration
    const updates = {
      'LDAP_URL': config.url,
      'LDAP_BASE_DN': config.baseDN,
      'LDAP_USERNAME': config.username,
      'LDAP_PASSWORD': config.password,
      'LDAP_STUDENTS_OU': config.studentsOU
    }

    // Update each environment variable
    for (const [key, value] of Object.entries(updates)) {
      const regex = new RegExp(`^${key}=.*$`, 'm')
      const newLine = `${key}=${value}`
      
      if (envContent.match(regex)) {
        // Replace existing line
        envContent = envContent.replace(regex, newLine)
      } else {
        // Add new line
        envContent += `\n${newLine}`
      }
    }

    // Write back to .env file
    fs.writeFileSync(envFilePath, envContent)

    return NextResponse.json({ message: 'LDAP configuration updated successfully' })
  } catch (error) {
    console.error('Error updating LDAP configuration:', error)
    return NextResponse.json(
      { error: 'Failed to update LDAP configuration' },
      { status: 500 }
    )
  }
} 