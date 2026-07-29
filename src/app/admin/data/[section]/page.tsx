'use client'

import { notFound, useParams } from 'next/navigation'
import { CalendarDays } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { useSchoolYear } from '@/contexts/school-year-context'
import { useEntitlements } from '@/contexts/entitlements-context'
import { adminDataSections, getAdminDataSectionContent } from '../_components/data-sections'

export default function AdminDataSectionPage() {
  const { selectedYear } = useSchoolYear()
  const { isFeatureEnabled } = useEntitlements()
  const params = useParams<{ section: string }>()

  const section = adminDataSections.find(item => item.slug === params.section)
  if (!section) {
    notFound()
  }

  if (section.requiresFeature && !isFeatureEnabled(section.requiresFeature)) {
    notFound()
  }

  const content = getAdminDataSectionContent(section.slug)
  if (!content) {
    notFound()
  }

  return (
    <PageContainer size="wide" className="space-y-6">
      {/* The title and description used to be repeated immediately below in a
          card header; one heading is enough. */}
      <PageHeader
        icon={section.icon}
        title={section.label}
        description={section.description}
        actions={
          selectedYear != null ? (
            <Badge variant="outline" className="gap-1.5 font-normal">
              <CalendarDays className="h-3.5 w-3.5" />
              Schuljahr {selectedYear.label}
            </Badge>
          ) : null
        }
      />

      <Card>
        <CardContent className="pt-6">{content}</CardContent>
      </Card>
    </PageContainer>
  )
}
