import { TeacherDashboard } from '@/components/dashboard/teacher-dashboard'

/**
 * Teacher/admin home. The screen itself lives in {@link TeacherDashboard}; this
 * thin wrapper preserves the historic import path used by the root route.
 */
export function TeacherOverview() {
  return <TeacherDashboard />
}
