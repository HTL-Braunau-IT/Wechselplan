'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, ClipboardList } from 'lucide-react'

export type OpenTask = {
  key: string
  tone: 'success' | 'warning' | 'destructive'
  title: string
  detail: string
  href: string
}

function Dot({ tone }: { tone: OpenTask['tone'] }) {
  const color =
    tone === 'success'
      ? 'var(--success)'
      : tone === 'destructive'
        ? 'var(--destructive)'
        : 'var(--warning)'
  return (
    <span
      className="mt-[5px] h-2 w-2 shrink-0 rounded-full"
      style={{ background: color }}
      aria-hidden
    />
  )
}

function Row({ task }: { task: OpenTask }) {
  const inner: ReactNode = (
    <>
      <Dot tone={task.tone} />
      <span className="min-w-0 flex-1">
        <span className="text-foreground block text-sm font-medium">{task.title}</span>
        <span className="text-muted-foreground block text-xs">{task.detail}</span>
      </span>
    </>
  )
  return (
    <Link
      href={task.href}
      className="border-border hover:bg-muted/50 flex items-start gap-3 border-t px-4 py-3 no-underline first:border-t-0"
    >
      {inner}
    </Link>
  )
}

export function OffenCard({ tasks }: { tasks: OpenTask[] }) {
  const { t } = useTranslation('common')
  const openCount = tasks.filter(task => task.tone !== 'success').length

  return (
    <section
      data-screen-label="Offen"
      className="border-border bg-card min-w-[min(100%,280px)] flex-1 overflow-hidden rounded-lg border shadow-sm"
    >
      <div className="border-border flex items-center gap-2 border-b px-4 py-3">
        <ClipboardList className="text-muted-foreground h-4 w-4" aria-hidden />
        <h3 className="text-base font-semibold">
          {t('dashboard.open', { defaultValue: 'Offen' })}
        </h3>
        <span className="bg-muted text-muted-foreground ml-auto inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums">
          {openCount}
        </span>
      </div>
      {tasks.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-2 px-4 py-8 text-center text-sm">
          <CheckCircle2 className="text-success h-6 w-6" aria-hidden />
          {t('dashboard.allDone', { defaultValue: 'Nichts offen — alles erledigt.' })}
        </div>
      ) : (
        tasks.map(task => <Row key={task.key} task={task} />)
      )}
    </section>
  )
}
