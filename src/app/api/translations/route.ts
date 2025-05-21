import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url)
	const lang = searchParams.get('lang') || 'en'

	try {
		const filePath = path.join(process.cwd(), 'public', 'locales', lang, 'common.json')
		const fileContents = await fs.readFile(filePath, 'utf8')
		const translations = JSON.parse(fileContents)

		return NextResponse.json(translations)
	} catch (error) {
		console.error('Error loading translations:', error)
		return NextResponse.json({ error: 'Failed to load translations' }, { status: 500 })
	}
} 