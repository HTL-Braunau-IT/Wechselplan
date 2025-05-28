import { NextResponse } from 'next/server'

export async function GET() {
	return NextResponse.json({
		serverUrl: process.env.LDAP_URL,
		baseDN: process.env.LDAP_BASE_DN,
		bindDN: process.env.LDAP_USERNAME,
		bindPassword: process.env.LDAP_PASSWORD,
		userSearchBase: process.env.LDAP_BASE_DN,
		userSearchFilter: '(sAMAccountName={0})',
		enabled: true,
	})
} 