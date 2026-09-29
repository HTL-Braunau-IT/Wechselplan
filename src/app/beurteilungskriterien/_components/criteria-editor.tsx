'use client'

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, Eye, Plus, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { CriteriaDocument } from '@/components/grading-criteria/criteria-document'
import {
  compactGradingCriteriaContent,
  type GradingCriteriaContent,
  type GradingCriteriaInput,
  type GradingCriteriaTemplate,
} from '@/types/grading-criteria'

export interface CriteriaDraft {
  id: number | null
  title: string
  subtitle: string
  content: GradingCriteriaContent
  isDefault: boolean
  classIds: number[]
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item!)
  return next
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 shrink-0"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

/**
 * Structured editor for one template, with the student view rendered live
 * beside it (below it on small screens).
 */
export function CriteriaEditor({
  initial,
  templates,
  classes,
  saving,
  onSave,
  onCancel,
}: {
  initial: CriteriaDraft
  templates: GradingCriteriaTemplate[]
  classes: { id: number; name: string }[]
  saving: boolean
  onSave: (id: number | null, input: GradingCriteriaInput) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<CriteriaDraft>(initial)
  const { content } = draft

  const setContent = (next: GradingCriteriaContent) => setDraft(d => ({ ...d, content: next }))
  const setSections = (sections: GradingCriteriaContent['sections']) =>
    setContent({ ...content, sections })
  const updateSection = (si: number, patch: Partial<GradingCriteriaContent['sections'][number]>) =>
    setSections(content.sections.map((s, i) => (i === si ? { ...s, ...patch } : s)))

  // This year's classes, plus any this template already holds from earlier years.
  const classOptions = useMemo(() => {
    const own = templates.find(tpl => tpl.id === initial.id)?.classes ?? []
    const byId = new Map([...classes, ...own].map(c => [c.id, c]))
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'))
  }, [classes, templates, initial.id])

  const takenBy = useMemo(() => {
    const map = new Map<number, string>()
    for (const tpl of templates) {
      if (tpl.id === initial.id) continue
      for (const c of tpl.classes) map.set(c.id, tpl.title)
    }
    return map
  }, [templates, initial.id])

  const toggleClass = (id: number, checked: boolean) =>
    setDraft(d => ({
      ...d,
      classIds: checked ? [...d.classIds, id] : d.classIds.filter(c => c !== id),
    }))

  const submit = () => {
    if (!draft.title.trim()) {
      toast.error(t('gradingCriteria.editor.titleRequired'))
      return
    }
    onSave(draft.id, {
      title: draft.title.trim(),
      subtitle: draft.subtitle.trim() || null,
      content: compactGradingCriteriaContent(draft.content),
      isDefault: draft.isDefault,
      classIds: draft.classIds,
    })
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="space-y-6">
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-1.5">
              <Label htmlFor="gc-title">{t('gradingCriteria.editor.name')}</Label>
              <Input
                id="gc-title"
                value={draft.title}
                maxLength={200}
                placeholder={t('gradingCriteria.editor.namePlaceholder')}
                onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gc-subtitle">{t('gradingCriteria.editor.subtitle')}</Label>
              <Input
                id="gc-subtitle"
                value={draft.subtitle}
                maxLength={200}
                placeholder={t('gradingCriteria.editor.subtitlePlaceholder')}
                onChange={e => setDraft(d => ({ ...d, subtitle: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gc-intro">{t('gradingCriteria.editor.intro')}</Label>
              <Textarea
                id="gc-intro"
                rows={3}
                value={content.intro}
                maxLength={4000}
                placeholder={t('gradingCriteria.editor.introPlaceholder')}
                onChange={e => setContent({ ...content, intro: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold">{t('gradingCriteria.editor.sections')}</h2>
          {content.sections.map((section, si) => (
            <Card key={si}>
              <CardContent className="space-y-4 pt-6">
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor={`gc-s${si}`}>
                      {t('gradingCriteria.editor.section')} {si + 1}
                    </Label>
                    <Input
                      id={`gc-s${si}`}
                      value={section.title}
                      maxLength={200}
                      placeholder={t('gradingCriteria.editor.sectionPlaceholder')}
                      onChange={e => updateSection(si, { title: e.target.value })}
                    />
                  </div>
                  <IconButton
                    label={t('gradingCriteria.editor.moveUp')}
                    disabled={si === 0}
                    onClick={() => setSections(move(content.sections, si, si - 1))}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    label={t('gradingCriteria.editor.moveDown')}
                    disabled={si === content.sections.length - 1}
                    onClick={() => setSections(move(content.sections, si, si + 1))}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    label={t('gradingCriteria.editor.remove')}
                    onClick={() => setSections(content.sections.filter((_, i) => i !== si))}
                  >
                    <Trash2 className="text-destructive h-4 w-4" />
                  </IconButton>
                </div>

                <div className="space-y-3 border-l-2 pl-4">
                  {section.criteria.map((criterion, ci) => {
                    const setCriteria = (criteria: typeof section.criteria) =>
                      updateSection(si, { criteria })
                    const updateCriterion = (patch: Partial<typeof criterion>) =>
                      setCriteria(
                        section.criteria.map((c, i) => (i === ci ? { ...c, ...patch } : c)),
                      )
                    return (
                      <div key={ci} className="bg-muted/30 space-y-2 rounded-lg border p-3">
                        <div className="flex items-center gap-2">
                          <Input
                            aria-label={t('gradingCriteria.editor.criterion')}
                            value={criterion.title}
                            maxLength={200}
                            className="font-medium"
                            placeholder={t('gradingCriteria.editor.criterionPlaceholder')}
                            onChange={e => updateCriterion({ title: e.target.value })}
                          />
                          <IconButton
                            label={t('gradingCriteria.editor.moveUp')}
                            disabled={ci === 0}
                            onClick={() => setCriteria(move(section.criteria, ci, ci - 1))}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </IconButton>
                          <IconButton
                            label={t('gradingCriteria.editor.moveDown')}
                            disabled={ci === section.criteria.length - 1}
                            onClick={() => setCriteria(move(section.criteria, ci, ci + 1))}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </IconButton>
                          <IconButton
                            label={t('gradingCriteria.editor.remove')}
                            onClick={() => setCriteria(section.criteria.filter((_, i) => i !== ci))}
                          >
                            <Trash2 className="text-destructive h-4 w-4" />
                          </IconButton>
                        </div>
                        <Textarea
                          aria-label={t('gradingCriteria.editor.points')}
                          rows={Math.max(2, criterion.points.length)}
                          value={criterion.points.join('\n')}
                          placeholder={t('gradingCriteria.editor.pointsPlaceholder')}
                          onChange={e => updateCriterion({ points: e.target.value.split('\n') })}
                        />
                        <p className="text-muted-foreground text-xs">
                          {t('gradingCriteria.editor.points')}
                        </p>
                      </div>
                    )
                  })}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      updateSection(si, {
                        criteria: [...section.criteria, { title: '', points: [''] }],
                      })
                    }
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    {t('gradingCriteria.editor.addCriterion')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setSections([
                ...content.sections,
                { title: '', criteria: [{ title: '', points: [''] }] },
              ])
            }
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {t('gradingCriteria.editor.addSection')}
          </Button>
        </div>

        <Card>
          <CardContent className="space-y-1.5 pt-6">
            <Label htmlFor="gc-closing">{t('gradingCriteria.editor.closing')}</Label>
            <Textarea
              id="gc-closing"
              rows={3}
              value={content.closing}
              maxLength={4000}
              placeholder={t('gradingCriteria.editor.closingPlaceholder')}
              onChange={e => setContent({ ...content, closing: e.target.value })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('gradingCriteria.editor.usage')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="gc-default">{t('gradingCriteria.editor.isDefault')}</Label>
                <p className="text-muted-foreground mt-1 text-xs">
                  {t('gradingCriteria.editor.isDefaultHint')}
                </p>
              </div>
              <Switch
                id="gc-default"
                checked={draft.isDefault}
                onCheckedChange={checked => setDraft(d => ({ ...d, isDefault: checked }))}
              />
            </div>
            <div>
              <Label>{t('gradingCriteria.editor.classes')}</Label>
              <p className="text-muted-foreground mt-1 text-xs">
                {t('gradingCriteria.editor.classesHint')}
              </p>
              {classOptions.length === 0 ? (
                <p className="text-muted-foreground mt-3 text-sm italic">
                  {t('gradingCriteria.editor.noClasses')}
                </p>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {classOptions.map(c => {
                    const checked = draft.classIds.includes(c.id)
                    const other = takenBy.get(c.id)
                    return (
                      <label
                        key={c.id}
                        className="hover:bg-muted/50 flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={v => toggleClass(c.id, v === true)}
                          className="mt-0.5"
                        />
                        <span className="min-w-0">
                          <span className="font-medium">{c.name}</span>
                          {other && !checked ? (
                            <span className="text-muted-foreground block truncate text-xs">
                              {t('gradingCriteria.editor.classTaken', { title: other })}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="bg-background/95 sticky bottom-0 z-10 -mx-1 flex justify-end gap-2 border-t px-1 py-3 backdrop-blur">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            {t('gradingCriteria.editor.cancel')}
          </Button>
          <Button type="button" onClick={submit} disabled={saving}>
            <Save className="mr-1.5 h-4 w-4" />
            {t('gradingCriteria.editor.save')}
          </Button>
        </div>
      </div>

      <div className="xl:sticky xl:top-20 xl:self-start">
        <Card className="overflow-hidden">
          <CardHeader className="bg-muted/40 border-b">
            <CardTitle className="flex items-center gap-2 text-base">
              <Eye className="h-4 w-4" />
              {t('gradingCriteria.editor.preview')}
            </CardTitle>
            <CardDescription>{t('gradingCriteria.editor.previewHint')}</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[calc(100vh-12rem)] overflow-y-auto pt-6">
            <CriteriaDocument
              title={draft.title}
              subtitle={draft.subtitle}
              content={compactGradingCriteriaContent(content)}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
