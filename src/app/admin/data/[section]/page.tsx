'use client'

import { notFound } from 'next/navigation'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useSchoolYear } from '@/contexts/school-year-context'
import { useEntitlements } from '@/contexts/entitlements-context'
import {
  adminDataSections,
  getAdminDataSectionContent,
} from '../_components/data-sections'

export default function AdminDataSectionPage() {
  const { selectedYear } = useSchoolYear()
  const { isFeatureEnabled } = useEntitlements()
  const params = useParams<{ section: string }>()

  const sectionSlug = params.section
  const section = adminDataSections.find((item) => item.slug === sectionSlug)
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

  const Icon = section.icon

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center space-x-2">
          <Icon className="h-8 w-8" />
          <div>
            <h1 className="text-3xl font-bold">{section.label}</h1>
            <p className="text-muted-foreground">{section.description}</p>
          </div>
        </div>
        {selectedYear != null && (
          <p className="text-sm text-muted-foreground">
            Schuljahr: <span className="font-medium text-foreground">{selectedYear.label}</span>
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Icon className="h-5 w-5" />
            <span>{section.label}</span>
          </CardTitle>
          <CardDescription>{section.description}</CardDescription>
        </CardHeader>
        <CardContent>{content}</CardContent>
      </Card>
    </div>
  )
}
