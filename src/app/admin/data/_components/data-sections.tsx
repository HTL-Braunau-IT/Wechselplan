'use client'

import {
  BookOpen,
  Building,
  Calendar,
  Clock,
  FileText,
  GraduationCap,
  Home,
  Image,
  MessageSquare,
  RotateCcw,
  Shield,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { ReactElement } from 'react'
import { StudentTab } from './student-tab'
import { TeacherTab } from './teacher-tab'
import { ClassTab } from './class-tab'
import { ScheduleTab } from './schedule-tab'
import { TeacherAssignmentTab } from './teacher-assignment-tab'
import { UserRoleTab } from './user-role-tab'
import { StudentPhotosUpload } from './student-photos-upload'
import { ModelTab } from './model-tab'
import { getModelConfig } from './model-configs'

export type AdminDataSectionGroupId = 'coreData' | 'scheduling' | 'access' | 'support'

export type AdminDataSection = {
  slug: string
  label: string
  icon: LucideIcon
  description: string
  group: AdminDataSectionGroupId
  requiresFeature?: 'student_photos'
}

export const adminDataSectionGroups: Record<AdminDataSectionGroupId, string> = {
  coreData: 'Stammdaten',
  scheduling: 'Planung',
  access: 'Zugriff',
  support: 'Support',
}

export const adminDataSections: AdminDataSection[] = [
  { slug: 'students', label: 'Schüler', icon: Users, description: 'Schülerdaten und Klassenzuordnungen verwalten', group: 'coreData' },
  { slug: 'teachers', label: 'Lehrkräfte', icon: GraduationCap, description: 'Lehrkräftedaten und Zuweisungen verwalten', group: 'coreData' },
  { slug: 'classes', label: 'Klassen', icon: Building, description: 'Klasseninformationen und Beziehungen verwalten', group: 'coreData' },
  { slug: 'subjects', label: 'Fächer', icon: BookOpen, description: 'Fachinformationen verwalten', group: 'coreData' },
  { slug: 'rooms', label: 'Räume', icon: Home, description: 'Rauminformationen und Kapazitäten verwalten', group: 'coreData' },
  { slug: 'learning-contents', label: 'Lehrinhalte', icon: FileText, description: 'Definitionen für Lehrinhalte verwalten', group: 'coreData' },
  { slug: 'group-assignments', label: 'Gruppenzuordnungen', icon: Users, description: 'Gruppenzuordnungen für Klassen verwalten', group: 'scheduling' },
  { slug: 'teacher-assignments', label: 'Lehrkraftzuordnungen', icon: BookOpen, description: 'Lehrkraftzuordnungen zu Klassen und Fächern verwalten', group: 'scheduling' },
  { slug: 'schedules', label: 'Stundenpläne', icon: Calendar, description: 'Stundenplan-Konfigurationen verwalten', group: 'scheduling' },
  { slug: 'schedule-times', label: 'Unterrichtszeiten', icon: Clock, description: 'Unterrichtszeitfenster verwalten', group: 'scheduling' },
  { slug: 'break-times', label: 'Pausenzeiten', icon: Clock, description: 'Pausenzeitfenster verwalten', group: 'scheduling' },
  { slug: 'school-holidays', label: 'Schulferien', icon: Calendar, description: 'Ferienzeiträume verwalten', group: 'scheduling' },
  { slug: 'school-years', label: 'Schuljahre', icon: Calendar, description: 'Schuljahre und Semestertermine verwalten', group: 'scheduling' },
  { slug: 'teacher-rotations', label: 'Lehrkraftrotationen', icon: RotateCcw, description: 'Rotationspläne der Lehrkräfte verwalten', group: 'scheduling' },
  { slug: 'schedule-pdfs', label: 'Stundenplan-PDFs', icon: FileText, description: 'Erzeugte Stundenplan-PDFs verwalten', group: 'scheduling' },
  { slug: 'roles', label: 'Rollen', icon: Shield, description: 'Benutzerrollen und Berechtigungen verwalten', group: 'access' },
  { slug: 'user-roles', label: 'Benutzerrollen', icon: Shield, description: 'Rollenzuweisungen für Benutzer verwalten', group: 'access' },
  { slug: 'support-messages', label: 'Support-Nachrichten', icon: MessageSquare, description: 'Support-Nachrichten und Feedback verwalten', group: 'support' },
  { slug: 'student-photos', label: 'Schülerfotos', icon: Image, description: 'Schülerfotos klassenweise hochladen (Nachname_Vorname.jpg)', group: 'support', requiresFeature: 'student_photos' },
]

export function getAdminDataSectionContent(slug: string): ReactElement | null {
  // Tabs with extra UI of their own (sync buttons, photo upload, status
  // badges) stay bespoke; everything else is a standard CRUD table described
  // by MODEL_CONFIGS.
  switch (slug) {
    case 'students':
      return <StudentTab />
    case 'teachers':
      return <TeacherTab />
    case 'classes':
      return <ClassTab />
    case 'schedules':
      return <ScheduleTab />
    case 'teacher-assignments':
      return <TeacherAssignmentTab />
    case 'user-roles':
      return <UserRoleTab />
    case 'student-photos':
      return <StudentPhotosUpload />
  }

  const config = getModelConfig(slug)
  if (!config) return null

  return <ModelTab model={config.model} label={config.label} columns={config.columns} />
}
