import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parse } from 'csv-parse/sync'
import { type Prisma } from '@prisma/client'
import { captureError } from '@/lib/sentry'

interface ImportRequest {
	type: 'room' | 'subject' | 'learningContent'
	data: string // CSV data
}

interface ImportData {
	name: string
	capacity?: number | null
	description?: string | null
}

export async function POST(request: Request) {
	const rawBody = await request.text() // Cache the raw body first
	try {
		const body = JSON.parse(rawBody) as ImportRequest
		const { type, data } = body

		// Parse CSV data
		const records = parse(data, {
			columns: true,
			skip_empty_lines: true,
			trim: true
		}) as Record<string, string>[]

		// Validate and transform data based on type
		const transformedData: ImportData[] = records.map((record: Record<string, string>) => {
			if (!record.name) {
				throw new Error('Name is required for all records')
			}

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
		let result: { count: number }
		switch (type) {
			case 'room': {
				const existing = await (prisma as unknown as { room: { findMany: (args: Prisma.RoomFindManyArgs) => Promise<{ name: string }[]> } }).room.findMany({ 
					select: { name: true } 
				})
				const existingNames = new Set(existing.map(r => r.name))
				const filteredData = transformedData.filter(item => !existingNames.has(item.name))
				result = await (prisma as unknown as { room: { createMany: (args: Prisma.RoomCreateManyArgs) => Promise<{ count: number }> } }).room.createMany({
					data: filteredData
				})
				break
			}
			case 'subject': {
				const existing = await (prisma as unknown as { subject: { findMany: (args: Prisma.SubjectFindManyArgs) => Promise<{ name: string }[]> } }).subject.findMany({ 
					select: { name: true } 
				})
				const existingNames = new Set(existing.map(s => s.name))
				const filteredData = transformedData.filter(item => !existingNames.has(item.name))
				result = await (prisma as unknown as { subject: { createMany: (args: Prisma.SubjectCreateManyArgs) => Promise<{ count: number }> } }).subject.createMany({
					data: filteredData
				})
				break
			}
			case 'learningContent': {
				const existing = await (prisma as unknown as { learningContent: { findMany: (args: Prisma.LearningContentFindManyArgs) => Promise<{ name: string }[]> } }).learningContent.findMany({ 
					select: { name: true } 
				})
				const existingNames = new Set(existing.map(lc => lc.name))
				const filteredData = transformedData.filter(item => !existingNames.has(item.name))
				result = await (prisma as unknown as { learningContent: { createMany: (args: Prisma.LearningContentCreateManyArgs) => Promise<{ count: number }> } }).learningContent.createMany({
					data: filteredData
				})
				break
			}
		}

		return NextResponse.json({ count: result.count })
	} catch (error: unknown) {
		console.error('Error importing data:', error)
		captureError(error, {
			location: 'api/admin/settings/import',
			type: 'data-import',
			extra: { requestBody: rawBody }
		})
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