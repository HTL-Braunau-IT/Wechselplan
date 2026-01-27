import { NextResponse } from 'next/server'
import { env } from '~/env'
import { captureError } from '@/lib/sentry'

interface GitHubRelease {
  tag_name: string
  body: string
  published_at: string
  html_url: string
  name: string
}

/**
 * Fetches the latest release from the GitHub repository.
 * 
 * Uses the GitHub API to retrieve the latest release information for the private repository.
 * Requires GITHUB_TOKEN to be set in environment variables for authentication.
 * 
 * @returns A JSON response containing the latest release information (tag_name, body, published_at, html_url),
 *          or an error response if the request fails.
 */
export async function GET() {
  try {
    const token = env.GITHUB_TOKEN

    if (!token) {
      return NextResponse.json(
        { error: 'GitHub token not configured' },
        { status: 500 }
      )
    }

    // Try to fetch the latest release
    // For private repos, we need proper authentication
    // Try Bearer format first (preferred), fallback to token format
    let response = await fetch(
      'https://api.github.com/repos/HTL-Braunau-IT/Wechselplan/releases/latest',
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Wechselplan-App',
        },
        // Cache for 5 minutes to reduce API calls
        next: { revalidate: 600 },
      }
    )
    
    // If Bearer fails with 401, try token format (for older tokens)
    if (response.status === 401) {
      response = await fetch(
        'https://api.github.com/repos/HTL-Braunau-IT/Wechselplan/releases/latest',
        {
          headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Wechselplan-App',
          },
          next: { revalidate: 600 },
        }
      )
    }

    // If latest returns 404, try fetching all releases to see if any exist
    if (response.status === 404) {
      const allReleasesResponse = await fetch(
        'https://api.github.com/repos/HTL-Braunau-IT/Wechselplan/releases',
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Wechselplan-App',
          },
          next: { revalidate: 600 },
        }
      )

      if (allReleasesResponse.ok) {
        const allReleases = await allReleasesResponse.json() as GitHubRelease[]
        if (allReleases.length === 0) {
          // No releases exist yet - return a helpful message
          return NextResponse.json(
            { 
              error: 'No releases found',
              message: 'The repository exists but has no releases yet. Please create a release on GitHub.',
              tag_name: '0.0.0',
              body: '',
              published_at: '',
              html_url: 'https://github.com/HTL-Braunau-IT/Wechselplan/releases',
              name: 'No releases available'
            },
            { status: 200 } // Return 200 with a default version so the app doesn't break
          )
        }
        // If releases exist but /latest returned 404, use the first one (most recent)
        const latestRelease = allReleases[0]
        if (latestRelease) {
          return NextResponse.json({
            tag_name: latestRelease.tag_name,
            body: latestRelease.body,
            published_at: latestRelease.published_at,
            html_url: latestRelease.html_url,
            name: latestRelease.name || latestRelease.tag_name,
          })
        }
      } else if (allReleasesResponse.status === 404) {
        // Repository not found or no access
        return NextResponse.json(
          { error: 'Repository not found or access denied. Please check the repository name and token permissions.' },
          { status: 404 }
        )
      }
    }

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: 'Repository not found or no releases available' },
          { status: 404 }
        )
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
        return NextResponse.json(
          { 
            error: 'GitHub authentication failed',
            message: response.status === 401 
              ? 'Invalid or expired token. Please check your GITHUB_TOKEN.'
              : 'Token does not have permission to access this repository. Ensure the token has the "repo" scope for private repositories.',
            status: response.status
          },
          { status: 500 }
        )
      }

      // Handle rate limiting
      if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
        captureError(new Error('GitHub API rate limit exceeded'), {
          location: 'api/github/releases',
          type: 'github-rate-limit',
        })
        return NextResponse.json(
          { error: 'GitHub API rate limit exceeded. Please try again later.' },
          { status: 429 }
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

      return NextResponse.json(
        { error: 'Failed to fetch release information' },
        { status: response.status }
      )
    }

    const release: GitHubRelease = await response.json()

    return NextResponse.json({
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

    return NextResponse.json(
      { error: 'Failed to fetch release information' },
      { status: 500 }
    )
  }
}

