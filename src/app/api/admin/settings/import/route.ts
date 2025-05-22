import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parse } from 'csv-parse/sync'

interface ImportRequest {
	type: 'room' | 'subject' | 'learningContent'
	data: string // CSV data
}

interface ImportData {
	name: string
	description?: string | null
	capacity?: number | null
}

export async function POST(request: Request) {
	try {
		const body = await request.json() as ImportRequest
		const { type, data } = body

		// Parse CSV data
		const records = parse(data, {
			columns: true,
			skip_empty_lines: true,
			trim: true
		})

		// Validate and transform data based on type
		const transformedData: ImportData[] = records.map((record: Record<string, string>) => {
			switch (type) {
				case 'room':
					return {
						name: record.name,
						capacity: record.capacity ? parseInt(record.capacity) : null,
						description: record.description ?? null
					}
				case 'subject':
					return {
						name: record.name,
						description: record.description ?? null
					}
				case 'learningContent':
					return {
						name: record.name,
						description: record.description ?? null
					}
				default:
					throw new Error('Invalid import type')
			}
		})

		// Import data using Prisma
		let result
		switch (type) {
			case 'room': {
				const existing = await prisma.room.findMany({ select: { name: true } })
				const existingNames = new Set(existing.map((r: { name: string }) => r.name))
				const filteredData = transformedData.filter((item) => !existingNames.has(item.name))
				result = await prisma.room.createMany({
					data: filteredData
				})
				break
			}
			case 'subject': {
				const existing = await prisma.subject.findMany({ select: { name: true } })
				const existingNames = new Set(existing.map((s: { name: string }) => s.name))
				const filteredData = transformedData.filter((item) => !existingNames.has(item.name))
				result = await prisma.subject.createMany({
					data: filteredData
				})
				break
			}
			case 'learningContent': {
				const existing = await prisma.learningContent.findMany({ select: { name: true } })
				const existingNames = new Set(existing.map((lc: { name: string }) => lc.name))
				const filteredData = transformedData.filter((item) => !existingNames.has(item.name))
				result = await prisma.learningContent.createMany({
					data: filteredData
				})
				break
			}
		}

		return NextResponse.json({
			success: true,
			imported: result.count
		})
	} catch (error: unknown) {
		console.error('Error importing data:', error)
		return NextResponse.json(
			{ error: 'Failed to import data', message: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		)
	}
}

// GET endpoint to fetch existing data
export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const type = searchParams.get('type')

		if (!type || !['room', 'subject', 'learningContent'].includes(type)) {
			return NextResponse.json(
				{ error: 'Invalid type parameter' },
				{ status: 400 }
			)
		}

		let data
		switch (type) {
			case 'room':
				data = await prisma.room.findMany({
					orderBy: { name: 'asc' }
				})
				break
			case 'subject':
				data = await prisma.subject.findMany({
					orderBy: { name: 'asc' }
				})
				break
			case 'learningContent':
				data = await prisma.learningContent.findMany({
					orderBy: { name: 'asc' }
				})
				break
		}

		return NextResponse.json({ data })
	} catch (error: unknown) {
		console.error('Error fetching data:', error)
		return NextResponse.json(
			{ error: 'Failed to fetch data', message: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		)
	}
} 