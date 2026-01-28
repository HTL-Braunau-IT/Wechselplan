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
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Renders a dialog displaying GitHub release information and changelog.
 * 
 * Shows the release version, publication date, and changelog body.
 * Provides a link to view the full release on GitHub.
 */
export function ChangelogDialog({ release, open, onOpenChange }: ChangelogDialogProps) {
  

  if (!release) {
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
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            {release.name || release.tag_name}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>Published on {formatDate(release.published_at)}</span>
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
            {formatChangelog(release.body)}
          </div>
          
          {release.html_url && (
            <div className="flex justify-end pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => window.open(release.html_url, '_blank', 'noopener,noreferrer')}
                className="flex items-center gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                View on GitHub
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

