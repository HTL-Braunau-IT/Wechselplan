'use client'

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  ClipboardCheck,
  Eye,
  Info,
  Link2,
  Plus,
  School,
  Sparkles,
  Star,
} from 'lucide-react'
import { useSchoolYear } from '@/contexts/school-year-context'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { Spinner } from '@/components/ui/spinner'
import { errorMessageOf } from '@/lib/api-client'
import {
  emptyGradingCriteriaContent,
  exampleGradingCriteriaContent,
  type GradingCriteriaTemplate,
} from '@/types/grading-criteria'
import { useGradingCriteria, useGradingCriteriaMutations } from './_hooks/use-grading-criteria'
import { CriteriaEditor, type CriteriaDraft } from './_components/criteria-editor'
import { TemplateCard } from './_components/template-card'

type Confirm =
  | { kind: 'delete'; template: GradingCriteriaTemplate }
  | { kind: 'regenerate'; template: GradingCriteriaTemplate }

/**
 * Beurteilungskriterien — each teacher maintains their own grading-criteria
 * templates: one default for all their classes, plus overrides per class. Their
 * students see the applicable one on their home page (StudentGradingCriteria).
 */
export default function GradingCriteriaPage() {
  const { t } = useTranslation()
  const { selectedYear } = useSchoolYear()
  const { data, isLoading, error } = useGradingCriteria(selectedYear?.id)
  const { save, remove, share } = useGradingCriteriaMutations()
  const [draft, setDraft] = useState<CriteriaDraft | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)

  const templates = useMemo(() => data?.templates ?? [], [data?.templates])

  const startNew = (example: boolean) =>
    setDraft({
      id: null,
      title: example ? 'Kriterien zur Leistungsbeurteilung' : '',
      subtitle: example && data?.teacherName ? data.teacherName : '',
      content: example ? exampleGradingCriteriaContent() : emptyGradingCriteriaContent(),
      // The first template becomes the default so students see something at once.
      isDefault: templates.length === 0,
      classIds: [],
    })

  const edit = (tpl: GradingCriteriaTemplate) =>
    setDraft({
      id: tpl.id,
      title: tpl.title,
      subtitle: tpl.subtitle ?? '',
      content: tpl.content,
      isDefault: tpl.isDefault,
      classIds: tpl.classes.map(c => c.id),
    })

  // Which template each of this year's classes resolves to (same rule as the server).
  const coverage = useMemo(() => {
    const fallback = templates.find(tpl => tpl.isDefault) ?? null
    return (data?.classes ?? []).map(c => {
      const explicit = templates.find(tpl => tpl.classes.some(tc => tc.id === c.id))
      return { cls: c, template: explicit ?? fallback, explicit: Boolean(explicit) }
    })
  }, [data?.classes, templates])

  if (draft) {
    return (
      <PageContainer size="wide" className="space-y-6">
        <PageHeader
          icon={ClipboardCheck}
          title={
            draft.id == null
              ? t('gradingCriteria.editor.createTitle')
              : t('gradingCriteria.editor.editTitle')
          }
          description={t('gradingCriteria.title')}
        />
        <CriteriaEditor
          initial={draft}
          templates={templates}
          classes={data?.classes ?? []}
          saving={save.isPending}
          onCancel={() => setDraft(null)}
          onSave={(id, input) => save.mutate({ id, input }, { onSuccess: () => setDraft(null) })}
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer size="wide" className="space-y-6">
      <PageHeader
        icon={ClipboardCheck}
        title={t('gradingCriteria.title')}
        description={t('gradingCriteria.description')}
        actions={
          templates.length > 0 ? (
            <>
              <Button variant="outline" onClick={() => startNew(true)}>
                <Sparkles className="mr-1.5 h-4 w-4" />
                {t('gradingCriteria.newExample')}
              </Button>
              <Button onClick={() => startNew(false)}>
                <Plus className="mr-1.5 h-4 w-4" />
                {t('gradingCriteria.new')}
              </Button>
            </>
          ) : null
        }
      />

      <HowItWorks />

      {isLoading ? (
        <div className="flex justify-center p-8">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {errorMessageOf(error, t('gradingCriteria.error.load'))}
          </AlertDescription>
        </Alert>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={t('gradingCriteria.empty.title')}
          description={t('gradingCriteria.empty.description')}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => startNew(true)}>
                <Sparkles className="mr-1.5 h-4 w-4" />
                {t('gradingCriteria.newExample')}
              </Button>
              <Button variant="outline" onClick={() => startNew(false)}>
                <Plus className="mr-1.5 h-4 w-4" />
                {t('gradingCriteria.new')}
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {templates.map(tpl => (
              <TemplateCard
                key={tpl.id}
                template={tpl}
                sharing={share.isPending && share.variables?.id === tpl.id}
                onEdit={() => edit(tpl)}
                onDelete={() => setConfirm({ kind: 'delete', template: tpl })}
                onShare={enabled =>
                  enabled && tpl.shareToken
                    ? setConfirm({ kind: 'regenerate', template: tpl })
                    : share.mutate({ id: tpl.id, enabled })
                }
              />
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <School className="h-4 w-4" />
                {t('gradingCriteria.coverage.title')}
              </CardTitle>
              <CardDescription>{t('gradingCriteria.coverage.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              {coverage.length === 0 ? (
                <p className="text-muted-foreground text-sm italic">
                  {t('gradingCriteria.coverage.noClasses')}
                </p>
              ) : (
                <ul className="divide-y">
                  {coverage.map(({ cls, template, explicit }) => (
                    <li key={cls.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="font-medium">{cls.name}</span>
                      {template ? (
                        <span className="flex min-w-0 items-center gap-2 text-sm">
                          <span className="truncate">{template.title}</span>
                          <Badge variant={explicit ? 'outline' : 'soft-success'}>
                            {explicit
                              ? t('gradingCriteria.coverage.viaClass')
                              : t('gradingCriteria.coverage.viaDefault')}
                          </Badge>
                        </span>
                      ) : (
                        <Badge variant="soft-destructive">
                          {t('gradingCriteria.coverage.none')}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <AlertDialog open={confirm != null} onOpenChange={open => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === 'regenerate'
                ? t('gradingCriteria.share.regenerate')
                : t('gradingCriteria.deleteDialog.title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === 'regenerate'
                ? t('gradingCriteria.share.regenerateConfirm')
                : t('gradingCriteria.deleteDialog.description', {
                    title: confirm?.template.title ?? '',
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('gradingCriteria.editor.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirm) return
                if (confirm.kind === 'delete') remove.mutate(confirm.template.id)
                else share.mutate({ id: confirm.template.id, enabled: true })
                setConfirm(null)
              }}
            >
              {confirm?.kind === 'regenerate'
                ? t('gradingCriteria.share.regenerate')
                : t('gradingCriteria.deleteDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  )
}

/** The four rules of the feature, always visible at the top of the page. */
function HowItWorks() {
  const { t } = useTranslation()
  const items = [
    { icon: Star, title: 'defaultTitle', body: 'default' },
    { icon: School, title: 'overrideTitle', body: 'override' },
    { icon: Eye, title: 'studentTitle', body: 'student' },
    { icon: Link2, title: 'shareTitle', body: 'share' },
  ] as const
  return (
    <Card className="bg-muted/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Info className="h-4 w-4" />
          {t('gradingCriteria.howItWorks.title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {items.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex gap-3">
              <span className="bg-background text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border">
                <Icon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold">{t(`gradingCriteria.howItWorks.${title}`)}</p>
                <p className="text-muted-foreground mt-0.5 text-sm">
                  {t(`gradingCriteria.howItWorks.${body}`)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
