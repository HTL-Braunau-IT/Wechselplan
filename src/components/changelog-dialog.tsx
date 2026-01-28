'use client'

import { ExternalLink, Calendar } from 'lucide-react'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '~/components/ui/dialog'

interface GitHubRelease {
  tag_name: string
  body: string
  published_at: string
  html_url: string
  name: string
}

interface ChangelogDialogProps {
  release: GitHubRelease | null
  allReleases?: GitHubRelease[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Renders a dialog displaying GitHub release information and changelog.
 * 
 * Shows all releases with their version, publication date, and changelog body.
 * Provides links to view the full releases on GitHub.
 */
export function ChangelogDialog({ release, allReleases = [], open, onOpenChange }: ChangelogDialogProps) {
  // Use allReleases if available, otherwise fall back to single release
  const releases = allReleases.length > 0 ? allReleases : (release ? [release] : [])

  if (releases.length === 0) {
    return null
  }

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('de-DE', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    } catch {
      return dateString
    }
  }

  // Format changelog body - preserve line breaks and basic markdown-like formatting
  const formatChangelog = (body: string) => {
    if (!body) return <p>No changelog available.</p>
    
    // Split by lines and process
    const lines = body.split('\n')
    const formatted: React.ReactNode[] = []
    let currentList: React.ReactNode[] = []
    let listKey = 0
    
    lines.forEach((line, index) => {
      const trimmed = line.trim()
      
      // Headers (## or ###)
      if (trimmed.startsWith('### ')) {
        // Close any open list
        if (currentList.length > 0) {
          formatted.push(<ul key={`ul-${listKey++}`} className="list-disc ml-6 mb-2">{currentList}</ul>)
          currentList = []
        }
        formatted.push(
          <h3 key={index} className="text-lg font-semibold mt-4 mb-2">
            {trimmed.replace(/^### /, '')}
          </h3>
        )
        return
      }
      
      if (trimmed.startsWith('## ')) {
        // Close any open list
        if (currentList.length > 0) {
          formatted.push(<ul key={`ul-${listKey++}`} className="list-disc ml-6 mb-2">{currentList}</ul>)
          currentList = []
        }
        formatted.push(
          <h2 key={index} className="text-xl font-bold mt-6 mb-3">
            {trimmed.replace(/^## /, '')}
          </h2>
        )
        return
      }
      
      // Bullet points
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        currentList.push(
          <li key={index} className="mb-1">
            {trimmed.replace(/^[-*] /, '')}
          </li>
        )
        return
      }
      
      // Close list if we hit a non-list item
      if (currentList.length > 0) {
        formatted.push(<ul key={`ul-${listKey++}`} className="list-disc ml-6 mb-2">{currentList}</ul>)
        currentList = []
      }
      
      // Skip empty lines
      if (!trimmed) {
        formatted.push(<br key={`br-${index}`} />)
        return
      }
      
      // Regular paragraph
      formatted.push(
        <p key={index} className="mb-2">
          {trimmed}
        </p>
      )
    })
    
    // Close any remaining list
    if (currentList.length > 0) {
      formatted.push(<ul key={`ul-${listKey++}`} className="list-disc ml-6 mb-2">{currentList}</ul>)
    }
    
    return formatted.length > 0 ? <>{formatted}</> : <p>{body}</p>
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            Changelog
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            All release notes and updates
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto pr-2 space-y-6">
          {releases.map((releaseItem, index) => (
            <div key={releaseItem.tag_name} className="space-y-3 pb-6 border-b last:border-b-0">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="text-xl font-semibold mb-1">
                    {releaseItem.name || releaseItem.tag_name}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>Published on {formatDate(releaseItem.published_at)}</span>
                  </div>
                </div>
                {releaseItem.html_url && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(releaseItem.html_url, '_blank', 'noopener,noreferrer')}
                    className="flex items-center gap-2 shrink-0"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View
                  </Button>
                )}
              </div>
              
              <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
                {formatChangelog(releaseItem.body)}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

