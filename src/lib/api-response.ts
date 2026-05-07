import { NextResponse } from 'next/server'

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNPROCESSABLE'
  | 'INTERNAL_ERROR'

interface ApiErrorBody {
  code: ApiErrorCode
  message: string
  details?: unknown
}

interface SuccessBody<T> {
  data: T
  message?: string
}

function json<T>(body: T, status = 200) {
  return NextResponse.json(body, { status })
}

export function ok<T>(data: T, message?: string) {
  const body: SuccessBody<T> = message ? { data, message } : { data }
  return json(body, 200)
}

export function created<T>(data: T, message?: string) {
  const body: SuccessBody<T> = message ? { data, message } : { data }
  return json(body, 201)
}

export function badRequest(message: string, details?: unknown) {
  return error('BAD_REQUEST', message, 400, details)
}

export function notFound(message: string, details?: unknown) {
  return error('NOT_FOUND', message, 404, details)
}

export function unauthorized(message = 'Unauthorized', details?: unknown) {
  return error('UNAUTHORIZED', message, 401, details)
}

export function forbidden(message = 'Forbidden', details?: unknown) {
  return error('FORBIDDEN', message, 403, details)
}

export function conflict(message: string, details?: unknown) {
  return error('CONFLICT', message, 409, details)
}

export function unprocessable(message: string, details?: unknown) {
  return error('UNPROCESSABLE', message, 422, details)
}

export function serverError(message = 'Internal server error', details?: unknown) {
  return error('INTERNAL_ERROR', message, 500, details)
}

function error(code: ApiErrorCode, message: string, status: number, details?: unknown) {
  const errorBody: ApiErrorBody = details ? { code, message, details } : { code, message }
  return json({ error: errorBody }, status)
}
