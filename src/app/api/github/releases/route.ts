import { env } from '~/env'
import { captureError } from '@/lib/sentry'
import { badRequest, notFound, ok, serverError } from '@/lib/api-response'

interface GitHubRelease {
  tag_name: string
  body: string
  published_at: string
  html_url: string
  name: string
}

/**
 * Fetches releases from the GitHub repository.
 * 
 * Uses the GitHub API to retrieve release information for the private repository.
 * Requires GITHUB_TOKEN to be set in environment variables for authentication.
 * 
 * Query parameters:
 * - all: if true, returns all releases; otherwise returns only the latest release
 * 
 * @returns A JSON response containing release information (tag_name, body, published_at, html_url),
 *          or an error response if the request fails.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const fetchAll = searchParams.get('all') === 'true'
  try {
    const token = env.GITHUB_TOKEN

    if (!token) {
      return serverError('GitHub token not configured')
    }

    // Helper function to fetch with authentication
    const fetchWithAuth = async (url: string) => {
      let response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Wechselplan-App',
        },
        next: { revalidate: 600 },
      })
      
      // If Bearer fails with 401, try token format (for older tokens)
      if (response.status === 401) {
        response = await fetch(url, {
          headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Wechselplan-App',
          },
          next: { revalidate: 600 },
        })
      }
      
      return response
    }

    // If fetching all releases, use the releases endpoint
    if (fetchAll) {
      const response = await fetchWithAuth(
        'https://api.github.com/repos/HTL-Braunau-IT/Wechselplan/releases'
      )

      if (!response.ok) {
        if (response.status === 404) {
          return notFound('Repository not found or no releases available')
        }

        if (response.status === 401 || response.status === 403) {
          const errorBody = await response.text().catch(() => 'Unknown error')
          captureError(new Error(`GitHub API authentication failed: ${errorBody}`), {
            location: 'api/github/releases',
            type: 'github-auth-error',
            extra: {
              status: response.status,
              statusText: response.statusText,
              errorBody,
              hasToken: !!token,
              tokenLength: token?.length ?? 0,
            }
          })
          return serverError(
            'GitHub authentication failed',
            response.status === 401
              ? 'Invalid or expired token. Please check your GITHUB_TOKEN.'
              : 'Token does not have permission to access this repository. Ensure the token has the "repo" scope for private repositories.'
          )
        }

        const errorText = await response.text().catch(() => 'Unknown error')
        captureError(new Error(`GitHub API error: ${errorText}`), {
          location: 'api/github/releases',
          type: 'github-api-error',
          extra: {
            status: response.status,
            statusText: response.statusText,
          }
        })

        return serverError('Failed to fetch release information', { status: response.status, statusText: response.statusText })
      }

      const allReleases = await response.json() as GitHubRelease[]
      
      // Sort by published_at descending (newest first) and format
      const formattedReleases = allReleases
        .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
        .map(release => ({
          tag_name: release.tag_name,
          body: release.body,
          published_at: release.published_at,
          html_url: release.html_url,
          name: release.name || release.tag_name,
        }))

      return ok(formattedReleases)
    }

    // Otherwise, fetch only the latest release
    // Try to fetch the latest release
    const response = await fetchWithAuth(
      'https://api.github.com/repos/HTL-Braunau-IT/Wechselplan/releases/latest'
    )

    // If latest returns 404, try fetching all releases to see if any exist
    if (response.status === 404) {
      const allReleasesResponse = await fetchWithAuth(
        'https://api.github.com/repos/HTL-Braunau-IT/Wechselplan/releases'
      )

      if (allReleasesResponse.ok) {
        const allReleases = await allReleasesResponse.json() as GitHubRelease[]
        if (allReleases.length === 0) {
          // No releases exist yet - return a helpful message
          return ok(
            { 
              error: 'No releases found',
              message: 'The repository exists but has no releases yet. Please create a release on GitHub.',
              tag_name: '0.0.0',
              body: '',
              published_at: '',
              html_url: 'https://github.com/HTL-Braunau-IT/Wechselplan/releases',
              name: 'No releases available'
            },
          )
        }
        // If releases exist but /latest returned 404, use the first one (most recent)
        // Sort by published_at descending to get the newest first
        const sortedReleases = allReleases.sort((a, b) => 
          new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
        )
        const latestRelease = sortedReleases[0]
        if (latestRelease) {
          return ok({
            tag_name: latestRelease.tag_name,
            body: latestRelease.body,
            published_at: latestRelease.published_at,
            html_url: latestRelease.html_url,
            name: latestRelease.name || latestRelease.tag_name,
          })
        }
      } else if (allReleasesResponse.status === 404) {
        // Repository not found or no access
        return notFound('Repository not found or access denied. Please check the repository name and token permissions.')
      }
    }

    if (!response.ok) {
      if (response.status === 404) {
        return notFound('Repository not found or no releases available')
      }

      if (response.status === 401 || response.status === 403) {
        const errorBody = await response.text().catch(() => 'Unknown error')
        captureError(new Error(`GitHub API authentication failed: ${errorBody}`), {
          location: 'api/github/releases',
          type: 'github-auth-error',
          extra: {
            status: response.status,
            statusText: response.statusText,
            errorBody,
            hasToken: !!token,
            tokenLength: token?.length ?? 0,
          }
        })
        return serverError(
          'GitHub authentication failed',
          response.status === 401
            ? 'Invalid or expired token. Please check your GITHUB_TOKEN.'
            : 'Token does not have permission to access this repository. Ensure the token has the "repo" scope for private repositories.'
        )
      }

      // Handle rate limiting
      if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
        captureError(new Error('GitHub API rate limit exceeded'), {
          location: 'api/github/releases',
          type: 'github-rate-limit',
        })
        return badRequest('GitHub API rate limit exceeded. Please try again later.')
      }

      const errorText = await response.text().catch(() => 'Unknown error')
      captureError(new Error(`GitHub API error: ${errorText}`), {
        location: 'api/github/releases',
        type: 'github-api-error',
        extra: {
          status: response.status,
          statusText: response.statusText,
        }
      })

      return serverError('Failed to fetch release information', { status: response.status, statusText: response.statusText })
    }

    const release: GitHubRelease = await response.json()

    return ok({
      tag_name: release.tag_name,
      body: release.body,
      published_at: release.published_at,
      html_url: release.html_url,
      name: release.name || release.tag_name,
    })
  } catch (error) {
    captureError(error, {
      location: 'api/github/releases',
      type: 'github-fetch-error',
    })

    return serverError('Failed to fetch release information')
  }
}

