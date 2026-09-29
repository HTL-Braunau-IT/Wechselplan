'use client'

import { useTranslation } from 'react-i18next'
import { Copy, ExternalLink, Link2, Link2Off, Pencil, RefreshCw, Star, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { GradingCriteriaTemplate } from '@/types/grading-criteria'

/** Public, view-only URL of a template's share link. */
export function shareUrl(token: string, origin: string): string {
  return `${origin}/kriterien/${token}`
}

/** One template in the list: where it applies, its share link and actions. */
export function TemplateCard({
  template,
  sharing,
  onEdit,
  onDelete,
  onShare,
}: {
  template: GradingCriteriaTemplate
  sharing: boolean
  onEdit: () => void
  onDelete: () => void
  onShare: (enabled: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  // Cards only render once the client-side query has data, so window exists.
  const origin = typeof window === 'undefined' ? '' : window.location.origin

  const url = template.shareToken ? shareUrl(template.shareToken, origin) : null
  const used = template.isDefault || template.classes.length > 0
  const sectionCount = template.content.sections.length

  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t('gradingCriteria.share.copied'))
    } catch {
      toast.error(url)
    }
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="space-y-2 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{template.title}</CardTitle>
            {template.subtitle ? (
              <p className="text-muted-foreground truncate text-sm">{template.subtitle}</p>
            ) : null}
          </div>
          {template.isDefault ? (
            <Badge variant="soft-success" className="shrink-0 gap-1">
              <Star className="h-3 w-3" />
              {t('gradingCriteria.card.default')}
            </Badge>
          ) : null}
        </div>
        <p className="text-muted-foreground text-xs">
          {sectionCount} {t('gradingCriteria.editor.sections')} ·{' '}
          {t('gradingCriteria.card.updated', {
            date: new Date(template.updatedAt).toLocaleDateString(
              i18n.language === 'en' ? 'en-GB' : 'de-AT',
            ),
          })}
        </p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="space-y-1.5 text-sm">
          {template.isDefault ? (
            <p className="text-muted-foreground">{t('gradingCriteria.card.appliesToAll')}</p>
          ) : null}
          {template.classes.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground text-xs">
                {t('gradingCriteria.card.classes')}:
              </span>
              {template.classes.map(c => (
                <Badge key={c.id} variant="outline">
                  {c.name}
                </Badge>
              ))}
            </div>
          ) : null}
          {!used ? (
            <p className="text-warning-foreground bg-warning/15 rounded-md px-2 py-1.5 text-xs">
              {t('gradingCriteria.card.notUsed')}
            </p>
          ) : null}
        </div>

        <div className="mt-auto space-y-2 border-t pt-3">
          {url ? (
            <>
              <p className="text-success flex items-center gap-1.5 text-xs font-medium">
                <Link2 className="h-3.5 w-3.5" />
                {t('gradingCriteria.share.active')}
              </p>
              <div className="flex gap-1.5">
                <Input
                  readOnly
                  value={url}
                  className="h-8 font-mono text-xs"
                  onFocus={e => e.currentTarget.select()}
                />
                <Button size="sm" variant="outline" className="h-8" onClick={() => void copy()}>
                  <Copy className="h-3.5 w-3.5" />
                  <span className="sr-only sm:not-sr-only sm:ml-1.5">
                    {t('gradingCriteria.share.copy')}
                  </span>
                </Button>
                <Button size="sm" variant="outline" className="h-8" asChild>
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span className="sr-only">{t('gradingCriteria.share.open')}</span>
                  </a>
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  disabled={sharing}
                  title={t('gradingCriteria.share.regenerateConfirm')}
                  onClick={() => onShare(true)}
                >
                  <RefreshCw className="mr-1 h-3.5 w-3.5" />
                  {t('gradingCriteria.share.regenerate')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  disabled={sharing}
                  onClick={() => onShare(false)}
                >
                  <Link2Off className="mr-1 h-3.5 w-3.5" />
                  {t('gradingCriteria.share.revoke')}
                </Button>
              </div>
            </>
          ) : (
            <Button size="sm" variant="outline" disabled={sharing} onClick={() => onShare(true)}>
              <Link2 className="mr-1.5 h-4 w-4" />
              {t('gradingCriteria.share.enable')}
            </Button>
          )}
        </div>

        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={onDelete}>
            <Trash2 className="text-destructive mr-1.5 h-4 w-4" />
            {t('gradingCriteria.card.delete')}
          </Button>
          <Button size="sm" onClick={onEdit}>
            <Pencil className="mr-1.5 h-4 w-4" />
            {t('gradingCriteria.card.edit')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
