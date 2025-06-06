import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { captureError } from '@/lib/sentry'

const envFilePath = path.join(process.cwd(), '.env')

interface LDAPConfig {
	serverUrl: string
	baseDN: string
	bindDN: string
	bindPassword: string
	userSearchBase: string
	userSearchFilter: string
	enabled: boolean
	studentGroups: string[]
	teacherGroups: string[]
}

export async function GET() {
	try {
		return NextResponse.json({
			serverUrl: process.env.LDAP_URL,
			baseDN: process.env.LDAP_BASE_DN,
			bindDN: process.env.LDAP_USERNAME,
			bindPassword: process.env.LDAP_PASSWORD,
			userSearchBase: process.env.LDAP_BASE_DN,
			userSearchFilter: '(sAMAccountName={0})',
			enabled: true,
			studentGroups: process.env.LDAP_STUDENT_GROUPS?.split(',') ?? [],
			teacherGroups: process.env.LDAP_TEACHER_GROUPS?.split(',') ?? [],
		})
	} catch (error) {
		console.error('Error fetching LDAP config:', error)
		captureError(error, {
			location: 'api/auth/ldap-config',
			type: 'fetch-config'
		})
		return NextResponse.json(
			{ error: 'Failed to fetch LDAP configuration' },
			{ status: 500 }
		)
	}
}

export async function POST(request: Request) {
	try {
		const config = await request.json() as LDAPConfig

		// Read existing .env file
		let envContent = ''
		try {
			envContent = fs.readFileSync(envFilePath, 'utf-8')
		} catch {
			// File doesn't exist yet, that's okay
		}

		// Update or add LDAP configuration
		const envLines = envContent.split('\n')
		const newEnvLines: string[] = []
		const configKeys = [
			{ envKey: 'LDAP_URL', value: config.serverUrl },
			{ envKey: 'LDAP_BASE_DN', value: config.baseDN },
			{ envKey: 'LDAP_USERNAME', value: config.bindDN },
			{ envKey: 'LDAP_PASSWORD', value: config.bindPassword },
			{ envKey: 'LDAP_STUDENT_GROUPS', value: config.studentGroups?.join(',') },
			{ envKey: 'LDAP_TEACHER_GROUPS', value: config.teacherGroups?.join(',') },
		]

		// Create a map of existing LDAP variables
		const existingVars = new Map<string, string>()
		for (const line of envLines) {
			const [key, value] = line.split('=')
			if (key) {
				existingVars.set(key, value ?? '')
			}
		}

		// Update or add new variables
		for (const { envKey, value } of configKeys) {
			if (value) {
				existingVars.set(envKey, value)
			}
		}

		// Convert back to env file format
		for (const [key, value] of existingVars) {
			newEnvLines.push(`${key}=${value}`)
		}

		// Write back to .env file
		fs.writeFileSync(envFilePath, newEnvLines.join('\n'))

		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('Error updating LDAP config:', error)
		captureError(error, {
			location: 'api/auth/ldap-config',
			type: 'update-config',
			extra: {
				requestBody: await request.text()
			}
		})
		return NextResponse.json(
			{ error: 'Failed to update LDAP configuration' },
			{ status: 500 }
		)
	}
} 