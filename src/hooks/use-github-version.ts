'use client'

import { useState, useEffect, useCallback } from 'react'

interface GitHubRelease {
  tag_name: string
  body: string
  published_at: string
  html_url: string
  name: string
}

interface CachedVersion {
  version: string
  lastChecked: number
}

const STORAGE_KEY = 'app_version'
const CACHE_DURATION = 60 * 60 * 1000 // 1 hour in milliseconds

/**
 * Custom hook to manage GitHub release version fetching, caching, and change detection.
 * 
 * Fetches the latest release from the GitHub API, caches it in localStorage,
 * and detects when a new version is available. Automatically triggers a callback
 * when a version change is detected.
 * 
 * @param onVersionChange - Optional callback function that is called when a new version is detected.
 * @returns An object containing the current version, release data, loading state, error state, and a function to manually check for updates.
 */
export function useGitHubVersion(onVersionChange?: (release: GitHubRelease) => void) {
  const [version, setVersion] = useState<string>('0.0.0')
  const [release, setRelease] = useState<GitHubRelease | null>(null)
  const [allReleases, setAllReleases] = useState<GitHubRelease[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasNewVersion, setHasNewVersion] = useState(false)

  /**
   * Gets the cached version from localStorage.
   */
  const getCachedVersion = useCallback((): CachedVersion | null => {
    if (typeof window === 'undefined') return null

    try {
      const cached = localStorage.getItem(STORAGE_KEY)
      if (!cached) return null

      return JSON.parse(cached) as CachedVersion
    } catch {
      return null
    }
  }, [])

  /**
   * Saves the version to localStorage.
   */
  const setCachedVersion = useCallback((version: string) => {
    if (typeof window === 'undefined') return

    try {
      const cached: CachedVersion = {
        version,
        lastChecked: Date.now(),
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cached))
    } catch {
      // localStorage might not be available, ignore
    }
  }, [])

  /**
   * Fetches the latest release from the API.
   */
  const fetchLatestRelease = useCallback(async (): Promise<GitHubRelease | null> => {
    try {
      const response = await fetch('/api/github/releases')

      if (!response.ok) {
        if (response.status === 404) {
          setError('No releases found')
          return null
        }
        if (response.status === 429) {
          setError('Rate limit exceeded. Please try again later.')
          return null
        }
        throw new Error(`Failed to fetch release: ${response.statusText}`)
      }

      const data = await response.json() as GitHubRelease
      return data
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch release information'
      setError(errorMessage)
      return null
    }
  }, [])

  /**
   * Fetches all releases from the API.
   */
  const fetchAllReleases = useCallback(async (): Promise<GitHubRelease[]> => {
    try {
      const response = await fetch('/api/github/releases?all=true')

      if (!response.ok) {
        if (response.status === 404) {
          setError('No releases found')
          return []
        }
        if (response.status === 429) {
          setError('Rate limit exceeded. Please try again later.')
          return []
        }
        throw new Error(`Failed to fetch releases: ${response.statusText}`)
      }

      const data = await response.json() as GitHubRelease[]
      // Sort by published_at descending (newest first)
      const sorted = data.sort((a, b) => 
        new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
      )
      return sorted
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch release information'
      setError(errorMessage)
      return []
    }
  }, [])

  /**
   * Checks for version updates.
   */
  const checkForUpdates = useCallback(async (showModalOnChange = true) => {
    setLoading(true)
    setError(null)

    // Get cached version
    const cached = getCachedVersion()
    const cachedVersion = cached?.version

    // Fetch latest release
    const latestRelease = await fetchLatestRelease()

    if (!latestRelease) {
      // If fetch failed but we have a cached version, use it
      if (cachedVersion) {
        setVersion(cachedVersion)
        setLoading(false)
        return
      }
      setLoading(false)
      return
    }

    // Update state with latest release
    setVersion(latestRelease.tag_name)
    setRelease(latestRelease)
    
    // Also fetch all releases for the changelog dialog
    const releases = await fetchAllReleases()
    setAllReleases(releases)

    // Check if version has changed
    if (cachedVersion && cachedVersion !== latestRelease.tag_name) {
      setHasNewVersion(true)
      // Update cache with new version
      setCachedVersion(latestRelease.tag_name)
      
      // Always trigger callback when version changes, regardless of showModalOnChange flag
      if (onVersionChange) {
        onVersionChange(latestRelease)
      }
    } else if (!cachedVersion) {
      // First time loading, just cache it
      setCachedVersion(latestRelease.tag_name)
    } else {
      // Same version, just update the cache timestamp
      setCachedVersion(latestRelease.tag_name)
    }

    setLoading(false)
  }, [getCachedVersion, setCachedVersion, fetchLatestRelease, fetchAllReleases, onVersionChange])

  /**
   * Initial load: check cache first, then fetch if needed.
   */
  useEffect(() => {
    const initialize = async () => {
      const cached = getCachedVersion()
      
      if (cached) {
        // Use cached version immediately
        setVersion(cached.version)
        
        // Check if cache is stale (older than 1 hour)
        const isStale = Date.now() - cached.lastChecked > CACHE_DURATION
        
        if (isStale) {
          // Fetch in background without showing modal
          await checkForUpdates(false)
        } else {
          // Cache is fresh, but still fetch to check for updates (silently)
          await checkForUpdates(false)
        }
      } else {
        // No cache, fetch and show modal if version changes
        await checkForUpdates(true)
      }
    }

    void initialize()
  }, []) // Only run on mount

  return {
    version,
    release,
    allReleases,
    loading,
    error,
    hasNewVersion,
    checkForUpdates: () => checkForUpdates(true),
  }
}

