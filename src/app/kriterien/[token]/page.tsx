import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Eye } from 'lucide-react'
import { PageContainer } from '@/components/ui/page-container'
import { CriteriaDocument } from '@/components/grading-criteria/criteria-document'
import { sharedCriteria } from '@/lib/grading-criteria'

type Props = { params: Promise<{ token: string }> }

// Always read the current version; a revoked link must stop working at once.
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const doc = await sharedCriteria((await params).token)
  return {
    title: doc ? `${doc.title} · ${doc.teacherName}` : 'Beurteilungskriterien',
    robots: { index: false, follow: false },
  }
}

/**
 * Public, view-only Beurteilungskriterien behind a teacher's share link. No
 * sign-in: the unguessable token is the credential, and revoking or
 * regenerating it on /beurteilungskriterien turns this page into a 404.
 */
export default async function SharedCriteriaPage({ params }: Props) {
  const doc = await sharedCriteria((await params).token)
  if (!doc) notFound()

  return (
    <PageContainer size="default" className="py-6">
      <div className="bg-card mx-auto max-w-3xl rounded-2xl border p-6 shadow-sm sm:p-10">
        <CriteriaDocument title={doc.title} subtitle={doc.subtitle} content={doc.content} />
        <p className="text-muted-foreground mt-8 flex items-center justify-center gap-1.5 border-t pt-4 text-xs">
          <Eye className="h-3.5 w-3.5" />
          {doc.teacherName} · Stand {new Date(doc.updatedAt).toLocaleDateString('de-AT')} · nur
          Ansicht
        </p>
      </div>
    </PageContainer>
  )
}
