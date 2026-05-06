import fs from 'fs'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { getDirectorySyncSettings } from '@/lib/directory-sync-settings'
import { getUserPhoto } from '@/lib/graph'
import { captureError } from '@/lib/sentry'

const MANUAL_PHOTO_DIR = path.join(process.cwd(), 'data', 'teacher-photos')
const O365_CACHE_DIR = path.join(process.cwd(), 'data', 'teacher-photos-o365')
const ALLOWED_MANUAL_EXTENSIONS = ['.jpg', '.jpeg', '.png'] as const
const FALLBACK_CONTENT_TYPE = 'application/octet-stream'
const DEFAULT_CACHE_TTL_HOURS = 24

type TeacherPhotoSource = 'manual' | 'o365'

interface CachedPhotoMetadata {
  fetchedAt: string
  checkedAt: string
  hasPhoto: boolean
  contentType: string | null
}

export interface ResolvedTeacherPhoto {
  source: TeacherPhotoSource
  bytes: Buffer
  contentType: string
  etag: string
}

function getCacheTtlMs(): number {
  const hours = Number.parseInt(process.env.ENTRA_TEACHER_PHOTO_CACHE_TTL_HOURS ?? '', 10)
  const normalized = Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_CACHE_TTL_HOURS
  return normalized * 60 * 60 * 1000
}

function ensureCacheDir(): void {
  fs.mkdirSync(O365_CACHE_DIR, { recursive: true })
}

function buildEtag(stat: fs.Stats): string {
  return `"${stat.mtimeMs}-${stat.size}"`
}

function getCacheImagePath(teacherId: number): string {
  return path.join(O365_CACHE_DIR, `${teacherId}.bin`)
}

function getCacheMetadataPath(teacherId: number): string {
  return path.join(O365_CACHE_DIR, `${teacherId}.json`)
}

function isFresh(isoDate: string, ttlMs: number): boolean {
  const timestamp = Date.parse(isoDate)
  if (Number.isNaN(timestamp)) return false
  return Date.now() - timestamp <= ttlMs
}

function readCacheMetadata(teacherId: number): CachedPhotoMetadata | null {
  const metaPath = getCacheMetadataPath(teacherId)
  try {
    if (!fs.existsSync(metaPath)) return null
    return JSON.parse(fs.readFileSync(metaPath, 'utf8')) as CachedPhotoMetadata
  } catch {
    return null
  }
}

function writeCacheMetadata(teacherId: number, metadata: CachedPhotoMetadata): void {
  ensureCacheDir()
  fs.writeFileSync(getCacheMetadataPath(teacherId), JSON.stringify(metadata), 'utf8')
}

function readManualPhoto(teacherId: number): ResolvedTeacherPhoto | null {
  for (const ext of ALLOWED_MANUAL_EXTENSIONS) {
    const filePath = path.join(MANUAL_PHOTO_DIR, `${teacherId}${ext}`)
    if (!path.resolve(filePath).startsWith(path.resolve(MANUAL_PHOTO_DIR))) continue
    try {
      if (!fs.existsSync(filePath)) continue
      const stat = fs.statSync(filePath)
      return {
        source: 'manual',
        bytes: fs.readFileSync(filePath),
        contentType: ext === '.png' ? 'image/png' : 'image/jpeg',
        etag: buildEtag(stat),
      }
    } catch {
      // try next extension
    }
  }
  return null
}

function readCachedO365Photo(
  teacherId: number,
  metadata: CachedPhotoMetadata,
): ResolvedTeacherPhoto | null {
  if (!metadata.hasPhoto) return null
  const imagePath = getCacheImagePath(teacherId)
  try {
    if (!fs.existsSync(imagePath)) return null
    const stat = fs.statSync(imagePath)
    return {
      source: 'o365',
      bytes: fs.readFileSync(imagePath),
      contentType: metadata.contentType ?? FALLBACK_CONTENT_TYPE,
      etag: buildEtag(stat),
    }
  } catch {
    return null
  }
}

async function fetchAndCacheO365Photo(
  teacherId: number,
  externalId: string,
): Promise<ResolvedTeacherPhoto | null> {
  const fetched = await getUserPhoto(externalId)
  const nowIso = new Date().toISOString()

  if (!fetched) {
    writeCacheMetadata(teacherId, {
      fetchedAt: nowIso,
      checkedAt: nowIso,
      hasPhoto: false,
      contentType: null,
    })
    return null
  }

  ensureCacheDir()
  const imagePath = getCacheImagePath(teacherId)
  fs.writeFileSync(imagePath, fetched.bytes)
  writeCacheMetadata(teacherId, {
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
  teacherId: number,
  options: { allowNetworkFetch: boolean },
): Promise<ResolvedTeacherPhoto | null> {
  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: { externalId: true, externalSource: true },
  })
  if (!teacher?.externalId || teacher.externalSource !== 'entra') return null

  const ttlMs = getCacheTtlMs()
  const metadata = readCacheMetadata(teacherId)
  const cachedPhoto = metadata ? readCachedO365Photo(teacherId, metadata) : null

  if (metadata?.checkedAt && isFresh(metadata.checkedAt, ttlMs)) return cachedPhoto
  if (!options.allowNetworkFetch) return cachedPhoto

  try {
    return await fetchAndCacheO365Photo(teacherId, teacher.externalId)
  } catch (error) {
    captureError(error, {
      location: 'lib/teacher-photo-source',
      type: 'fetch_o365_teacher_photo_error',
      extra: { teacherId },
    })
    return cachedPhoto
  }
}

export async function resolveTeacherPhoto(
  teacherId: number,
  options: { allowNetworkFetch?: boolean } = {},
): Promise<ResolvedTeacherPhoto | null> {
  const settings = await getDirectorySyncSettings()
  const allowNetworkFetch = options.allowNetworkFetch ?? true
  const sourceOrder =
    settings.teacherPhotoSourcePriority === 'o365_first'
      ? (['o365', 'manual'] as const)
      : (['manual', 'o365'] as const)

  for (const source of sourceOrder) {
    if (source === 'manual') {
      const manual = readManualPhoto(teacherId)
      if (manual) return manual
      continue
    }
    const o365 = await resolveO365Photo(teacherId, { allowNetworkFetch })
    if (o365) return o365
  }
  return null
}

export async function hasEffectiveTeacherPhoto(teacherId: number): Promise<boolean> {
  return (await resolveTeacherPhoto(teacherId, { allowNetworkFetch: false })) !== null
}

export async function refreshTeacherO365PhotoCache(teacherId: number): Promise<boolean> {
  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: { externalId: true, externalSource: true },
  })
  if (!teacher?.externalId || teacher.externalSource !== 'entra') return false
  try {
    const photo = await fetchAndCacheO365Photo(teacherId, teacher.externalId)
    return photo !== null
  } catch (error) {
    captureError(error, {
      location: 'lib/teacher-photo-source',
      type: 'refresh_o365_teacher_photo_error',
      extra: { teacherId },
    })
    return false
  }
}
