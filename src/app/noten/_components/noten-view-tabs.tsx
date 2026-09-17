'use client'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

export type NotenTab = 'erfassen' | 'verlauf' | 'endnoten'

/**
 * The three views of the Noten screen. A thin wrapper over the shared Tabs
 * primitive so the page only deals with the tab value, not Radix internals —
 * the panels are rendered by the page, not as TabsContent, because each keeps
 * its own state and should unmount when it is not shown.
 */
export function NotenViewTabs({
  value,
  onValueChange,
  tabs,
}: {
  value: NotenTab
  onValueChange: (value: NotenTab) => void
  tabs: Array<{ value: NotenTab; label: string }>
}) {
  return (
    <Tabs value={value} onValueChange={v => onValueChange(v as NotenTab)}>
      <TabsList>
        {tabs.map(tab => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
