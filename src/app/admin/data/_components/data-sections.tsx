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
import { ClassYearStaffTab } from './class-year-staff-tab'
import { ScheduleTab } from './schedule-tab'
import { TeacherAssignmentTab } from './teacher-assignment-tab'
import { RoomTab } from './room-tab'
import { SubjectTab } from './subject-tab'
import { LearningContentTab } from './learning-content-tab'
import { SchoolHolidayTab } from './school-holiday-tab'
import { SchoolYearTab } from './school-year-tab'
import { ScheduleTimeTab } from './schedule-time-tab'
import { BreakTimeTab } from './break-time-tab'
import { TeacherRotationTab } from './teacher-rotation-tab'
import { RoleTab } from './role-tab'
import { UserRoleTab } from './user-role-tab'
import { SupportMessageTab } from './support-message-tab'
import { StudentPhotosUpload } from './student-photos-upload'

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
  { slug: 'class-year-staff', label: 'Klassenstaff (pro Schuljahr)', icon: Building, description: 'Klassenvorstand und Klassenleitung pro Schuljahr verwalten', group: 'coreData' },
  { slug: 'subjects', label: 'Fächer', icon: BookOpen, description: 'Fachinformationen verwalten', group: 'coreData' },
  { slug: 'rooms', label: 'Räume', icon: Home, description: 'Rauminformationen und Kapazitäten verwalten', group: 'coreData' },
  { slug: 'learning-contents', label: 'Lehrinhalte', icon: FileText, description: 'Definitionen für Lehrinhalte verwalten', group: 'coreData' },
  { slug: 'teacher-assignments', label: 'Lehrkraftzuordnungen', icon: BookOpen, description: 'Lehrkraftzuordnungen zu Klassen und Fächern verwalten', group: 'scheduling' },
  { slug: 'schedules', label: 'Stundenpläne', icon: Calendar, description: 'Stundenplan-Konfigurationen verwalten', group: 'scheduling' },
  { slug: 'schedule-times', label: 'Unterrichtszeiten', icon: Clock, description: 'Unterrichtszeitfenster verwalten', group: 'scheduling' },
  { slug: 'break-times', label: 'Pausenzeiten', icon: Clock, description: 'Pausenzeitfenster verwalten', group: 'scheduling' },
  { slug: 'school-holidays', label: 'Schulferien', icon: Calendar, description: 'Ferienzeiträume verwalten', group: 'scheduling' },
  { slug: 'school-years', label: 'Schuljahre', icon: Calendar, description: 'Schuljahre und Semestertermine verwalten', group: 'scheduling' },
  { slug: 'teacher-rotations', label: 'Lehrkraftrotationen', icon: RotateCcw, description: 'Rotationspläne der Lehrkräfte verwalten', group: 'scheduling' },
  { slug: 'roles', label: 'Rollen', icon: Shield, description: 'Benutzerrollen und Berechtigungen verwalten', group: 'access' },
  { slug: 'user-roles', label: 'Benutzerrollen', icon: Shield, description: 'Rollenzuweisungen für Benutzer verwalten', group: 'access' },
  { slug: 'support-messages', label: 'Support-Nachrichten', icon: MessageSquare, description: 'Support-Nachrichten und Feedback verwalten', group: 'support' },
  { slug: 'student-photos', label: 'Schülerfotos', icon: Image, description: 'Schülerfotos klassenweise hochladen (Nachname_Vorname.jpg)', group: 'support', requiresFeature: 'student_photos' },
]

export function getAdminDataSectionContent(slug: string): ReactElement | null {
  switch (slug) {
    case 'students':
      return <StudentTab />
    case 'teachers':
      return <TeacherTab />
    case 'classes':
      return <ClassTab />
    case 'class-year-staff':
      return <ClassYearStaffTab />
    case 'schedules':
      return <ScheduleTab />
    case 'teacher-assignments':
      return <TeacherAssignmentTab />
    case 'rooms':
      return <RoomTab />
    case 'subjects':
      return <SubjectTab />
    case 'learning-contents':
      return <LearningContentTab />
    case 'school-holidays':
      return <SchoolHolidayTab />
    case 'school-years':
      return <SchoolYearTab />
    case 'schedule-times':
      return <ScheduleTimeTab />
    case 'break-times':
      return <BreakTimeTab />
    case 'teacher-rotations':
      return <TeacherRotationTab />
    case 'roles':
      return <RoleTab />
    case 'user-roles':
      return <UserRoleTab />
    case 'support-messages':
      return <SupportMessageTab />
    case 'student-photos':
      return <StudentPhotosUpload />
    default:
      return null
  }
}
