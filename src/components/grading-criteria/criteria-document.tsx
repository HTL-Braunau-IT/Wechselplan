import { Fragment } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GradingCriteriaContent } from '@/types/grading-criteria'

const URL_RE = /(https?:\/\/[^\s]+)/g

/** Free text with line breaks kept and bare URLs turned into links. */
function RichText({ text, className }: { text: string; className?: string }) {
  if (!text) return null
  return (
    <p className={cn('text-sm leading-relaxed whitespace-pre-line', className)}>
      {text.split(URL_RE).map((part, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary break-all underline-offset-2 hover:underline"
          >
            {part}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </p>
  )
}

/**
 * A Beurteilungskriterien sheet, laid out like the paper version teachers used
 * to hand out: title, intro, underlined section headings, bold criteria and
 * ticked points. Hook-free so the public share page can render it on the server.
 */
export function CriteriaDocument({
  title,
  subtitle,
  content,
  className,
}: {
  title: string
  subtitle?: string | null
  content: GradingCriteriaContent
  className?: string
}) {
  const isEmpty = !content.intro && content.sections.length === 0 && !content.closing

  return (
    <article className={cn('space-y-6', className)}>
      <header className="space-y-1 text-center">
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{title || '—'}</h2>
        {subtitle ? <p className="text-muted-foreground font-medium">{subtitle}</p> : null}
      </header>

      <RichText text={content.intro} />

      {content.sections.map((section, si) => (
        <section key={si} className="space-y-2">
          {section.title ? (
            <h3 className="decoration-primary/60 text-base font-semibold underline decoration-2 underline-offset-4">
              {section.title}
            </h3>
          ) : null}
          <ul className="space-y-2">
            {section.criteria.map((criterion, ci) => (
              <li key={ci}>
                {criterion.title ? (
                  <p className="flex gap-2 text-sm font-semibold">
                    <span aria-hidden className="text-primary">
                      •
                    </span>
                    {criterion.title}
                  </p>
                ) : null}
                {criterion.points.length > 0 ? (
                  <ul className={cn('mt-1 space-y-1', criterion.title && 'pl-5')}>
                    {criterion.points.map((point, pi) => (
                      <li key={pi} className="flex gap-2 text-sm leading-relaxed">
                        <Check className="text-success mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <RichText text={content.closing} className="border-t pt-4" />

      {isEmpty ? (
        <p className="text-muted-foreground text-center text-sm italic">Noch keine Kriterien.</p>
      ) : null}
    </article>
  )
}
