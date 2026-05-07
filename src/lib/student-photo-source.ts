import fs from 'fs'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { getDirectorySyncSettings } from '@/lib/directory-sync-settings'
import { getUserPhoto } from '@/lib/graph'
import { captureError } from '@/lib/sentry'

const MANUAL_PHOTO_DIR = path.join(process.cwd(), 'data', 'student-photos')
const O365_CACHE_DIR = path.join(process.cwd(), 'data', 'student-photos-o365')
const ALLOWED_MANUAL_EXTENSIONS = ['.jpg', '.jpeg', '.png'] as const
const FALLBACK_CONTENT_TYPE = 'application/octet-stream'
const DEFAULT_CACHE_TTL_HOURS = 24

type StudentPhotoSource = 'manual' | 'o365'

interface CachedPhotoMetadata {
  fetchedAt: string
  checkedAt: string
  hasPhoto: boolean
  contentType: string | null
}

export interface ResolvedStudentPhoto {
  source: StudentPhotoSource
  bytes: Buffer
  contentType: string
  etag: string
}

function getCacheTtlMs(): number {
  const hours = Number.parseInt(process.env.ENTRA_STUDENT_PHOTO_CACHE_TTL_HOURS ?? '', 10)
  const normalized = Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_CACHE_TTL_HOURS
  return normalized * 60 * 60 * 1000
}

function ensureCacheDir(): void {
  fs.mkdirSync(O365_CACHE_DIR, { recursive: true })
}

function buildEtag(stat: fs.Stats): string {
  return `"${stat.mtimeMs}-${stat.size}"`
}

function getCacheImagePath(studentId: number): string {
  return path.join(O365_CACHE_DIR, `${studentId}.bin`)
}

function getCacheMetadataPath(studentId: number): string {
  return path.join(O365_CACHE_DIR, `${studentId}.json`)
}

function isFresh(isoDate: string, ttlMs: number): boolean {
  const timestamp = Date.parse(isoDate)
  if (Number.isNaN(timestamp)) return false
  return Date.now() - timestamp <= ttlMs
}

function readCacheMetadata(studentId: number): CachedPhotoMetadata | null {
  const metaPath = getCacheMetadataPath(studentId)
  try {
    if (!fs.existsSync(metaPath)) return null
    const raw = fs.readFileSync(metaPath, 'utf8')
    const parsed = JSON.parse(raw) as CachedPhotoMetadata
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

function writeCacheMetadata(studentId: number, metadata: CachedPhotoMetadata): void {
  ensureCacheDir()
  fs.writeFileSync(getCacheMetadataPath(studentId), JSON.stringify(metadata), 'utf8')
}

function readManualPhoto(studentId: number): ResolvedStudentPhoto | null {
  for (const ext of ALLOWED_MANUAL_EXTENSIONS) {
    const filePath = path.join(MANUAL_PHOTO_DIR, `${studentId}${ext}`)
    if (!path.resolve(filePath).startsWith(path.resolve(MANUAL_PHOTO_DIR))) continue
    try {
      if (!fs.existsSync(filePath)) continue
      const stat = fs.statSync(filePath)
      const bytes = fs.readFileSync(filePath)
      return {
        source: 'manual',
        bytes,
        contentType: ext === '.png' ? 'image/png' : 'image/jpeg',
        etag: buildEtag(stat),
      }
    } catch {
      // try next extension
    }
  }
  return null
}

function readCachedO365Photo(studentId: number, metadata: CachedPhotoMetadata): ResolvedStudentPhoto | null {
  if (!metadata.hasPhoto) return null
  const imagePath = getCacheImagePath(studentId)
  try {
    if (!fs.existsSync(imagePath)) return null
    const stat = fs.statSync(imagePath)
    const bytes = fs.readFileSync(imagePath)
    return {
      source: 'o365',
      bytes,
      contentType: metadata.contentType ?? FALLBACK_CONTENT_TYPE,
      etag: buildEtag(stat),
    }
  } catch {
    return null
  }
}

async function fetchAndCacheO365Photo(studentId: number, externalId: string): Promise<ResolvedStudentPhoto | null> {
  const fetched = await getUserPhoto(externalId)
  const nowIso = new Date().toISOString()

  if (!fetched) {
    writeCacheMetadata(studentId, {
      fetchedAt: nowIso,
      checkedAt: nowIso,
      hasPhoto: false,
      contentType: null,
    })
    return null
  }

  ensureCacheDir()
  const imagePath = getCacheImagePath(studentId)
  fs.writeFileSync(imagePath, fetched.bytes)
  writeCacheMetadata(studentId, {
    fetchedAt: nowIso,
    checkedAt: nowIso,
    hasPhoto: true,
    contentType: fetched.contentType,
  })

  const stat = fs.statSync(imagePath)
  return {
    source: 'o365',
    bytes: fetched.bytes,
    contentType: fetched.contentType || FALLBACK_CONTENT_TYPE,
    etag: buildEtag(stat),
  }
}

async function resolveO365Photo(
  studentId: number,
  options: { allowNetworkFetch: boolean },
): Promise<ResolvedStudentPhoto | null> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { externalId: true, externalSource: true },
  })
  if (!student?.externalId) {
    return null
  }

  const ttlMs = getCacheTtlMs()
  const metadata = readCacheMetadata(studentId)
  const cachedPhoto = metadata ? readCachedO365Photo(studentId, metadata) : null

  if (metadata?.checkedAt && isFresh(metadata.checkedAt, ttlMs)) {
    return cachedPhoto
  }

  if (!options.allowNetworkFetch) {
    return cachedPhoto
  }

  try {
    return await fetchAndCacheO365Photo(studentId, student.externalId)
  } catch (error) {
    captureError(error, {
      location: 'lib/student-photo-source',
      type: 'fetch_o365_photo_error',
      extra: { studentId },
    })
    return cachedPhoto
  }
}

export async function resolveStudentPhoto(
  studentId: number,
  options: { allowNetworkFetch?: boolean } = {},
): Promise<ResolvedStudentPhoto | null> {
  const settings = await getDirectorySyncSettings()
  const allowNetworkFetch = options.allowNetworkFetch ?? true
  const sourceOrder =
    settings.studentPhotoSourcePriority === 'o365_first'
      ? (['o365', 'manual'] as const)
      : (['manual', 'o365'] as const)

  for (const source of sourceOrder) {
    if (source === 'manual') {
      const manual = readManualPhoto(studentId)
      if (manual) return manual
      continue
    }

    const o365 = await resolveO365Photo(studentId, { allowNetworkFetch })
    if (o365) return o365
  }

  return null
}

export async function hasEffectiveStudentPhoto(studentId: number): Promise<boolean> {
  const photo = await resolveStudentPhoto(studentId, { allowNetworkFetch: false })
  return photo !== null
}

export async function refreshStudentO365PhotoCache(studentId: number): Promise<boolean> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { externalId: true, externalSource: true },
  })
  if (!student?.externalId) return false

  try {
    const photo = await fetchAndCacheO365Photo(studentId, student.externalId)
    return photo !== null
  } catch (error) {
    captureError(error, {
      location: 'lib/student-photo-source',
      type: 'refresh_o365_photo_error',
      extra: { studentId },
    })
    return false
  }
}
