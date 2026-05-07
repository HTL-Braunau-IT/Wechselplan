import { prisma } from '@/lib/prisma'
import { parse } from 'csv-parse/sync'
import { LookupKind } from '@prisma/client'
import { captureError } from '@/lib/sentry'
import { badRequest, created, ok, serverError } from '@/lib/api-response'

interface ImportRequest {
	type: 'room' | 'subject' | 'learningContent'
	data: string
}

interface ImportData {
	name: string
	capacity?: number | null
	description?: string | null
}

const TYPE_TO_KIND: Record<ImportRequest['type'], LookupKind> = {
	room: LookupKind.ROOM,
	subject: LookupKind.SUBJECT,
	learningContent: LookupKind.LEARNING_CONTENT
}

/**
 * Imports CSV data for rooms, subjects, or learning content based on the specified type.
 *
 * Expects a JSON request body with a `type` field (`room`, `subject`, or `learningContent`) and a `data` field containing CSV records. Validates and transforms the records, filters out entries with names already present in the database, and inserts only new records.
 *
 * @returns A JSON response with the count of newly created records, or an error message if the import fails.
 *
 * @throws {Error} If the CSV data is invalid, required fields are missing, or the import type is not recognized.
 * @remark Duplicate entries by name are ignored; only records with unique names are imported.
 */
export async function POST(request: Request) {
	const rawBody = await request.text()
	try {
		const body = JSON.parse(rawBody) as ImportRequest
		const { type, data } = body
		if (!type || !data) {
			return badRequest('Missing required fields: type and data')
		}

		const records = parse(data, {
			columns: true,
			skip_empty_lines: true,
			trim: true
		}) as Record<string, string>[]

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
				case 'learningContent':
					return {
						name: record.name,
						description: record.description ?? null
					}
				default:
					throw new Error('Invalid import type')
			}
		})

		const kind = TYPE_TO_KIND[type]
		if (!kind) {
			return badRequest('Invalid import type')
		}

		const existing = await prisma.lookupValue.findMany({
			where: { kind },
			select: { name: true }
		})
		const existingNames = new Set(existing.map(r => r.name))
		const filteredData = transformedData.filter(item => !existingNames.has(item.name))

		let result: { count: number } = { count: 0 }
		if (filteredData.length > 0) {
			result = await prisma.lookupValue.createMany({
				data: filteredData.map(item => ({
					kind,
					name: item.name,
					description: item.description ?? null,
					capacity: type === 'room' ? (item.capacity ?? null) : null,
					isCustom: false
				}))
			})
		}

		return created({ count: result.count })
	} catch (error: unknown) {
		captureError(error, {
			location: 'api/admin/settings/import',
			type: 'data-import',
			extra: { requestBody: rawBody }
		})
		return serverError('Failed to import data', error instanceof Error ? { message: error.message } : undefined)
	}
}

/**
 * Handles HTTP GET requests to retrieve all records of a specified type (`room`, `subject`, or `learningContent`).
 *
 * Returns a JSON response containing the requested data, ordered by name. Responds with a 400 error if the `type` parameter is missing or invalid.
 *
 * @param request - The incoming HTTP request, expected to include a `type` query parameter.
 * @returns A JSON response with the retrieved data or an error message.
 */
export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const type = searchParams.get('type') as ImportRequest['type'] | null

		if (!type || !(type in TYPE_TO_KIND)) {
			return badRequest('Invalid type parameter')
		}

		const kind = TYPE_TO_KIND[type]
		const rows = await prisma.lookupValue.findMany({
			where: { kind },
			orderBy: { name: 'asc' }
		})

		const data = rows.map(({ kind: _kind, capacity, ...rest }) => {
			if (type === 'room') {
				return { ...rest, capacity }
			}
			return rest
		})

		return ok(data)
	} catch (error: unknown) {
		captureError(error, {
			location: 'api/admin/settings/import',
			type: 'data-import'
		})
		return serverError('Failed to fetch data', error instanceof Error ? { message: error.message } : undefined)
	}
}
