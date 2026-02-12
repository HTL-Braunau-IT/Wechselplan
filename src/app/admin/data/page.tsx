'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useSchoolYear } from '@/contexts/school-year-context'
import { useEntitlements } from '@/contexts/entitlements-context'
import { Database, Users, GraduationCap, Building, Calendar, Clock, BookOpen, Home, FileText, RotateCcw, Shield, MessageSquare, Image } from 'lucide-react'

// Import individual model components
import { StudentTab } from './_components/student-tab'
import { TeacherTab } from './_components/teacher-tab'
import { ClassTab } from './_components/class-tab'
import { ScheduleTab } from './_components/schedule-tab'
import { GroupAssignmentTab } from './_components/group-assignment-tab'
import { TeacherAssignmentTab } from './_components/teacher-assignment-tab'
import { RoomTab } from './_components/room-tab'
import { SubjectTab } from './_components/subject-tab'
import { LearningContentTab } from './_components/learning-content-tab'
import { SchoolHolidayTab } from './_components/school-holiday-tab'
import { SchoolYearTab } from './_components/school-year-tab'
import { ScheduleTimeTab } from './_components/schedule-time-tab'
import { BreakTimeTab } from './_components/break-time-tab'
import { SchedulePDFTab } from './_components/schedule-pdf-tab'
import { TeacherRotationTab } from './_components/teacher-rotation-tab'
import { RoleTab } from './_components/role-tab'
import { UserRoleTab } from './_components/user-role-tab'
import { SupportMessageTab } from './_components/support-message-tab'
import { StudentPhotosUpload } from './_components/student-photos-upload'

const modelTabs = [
  {
    value: 'students',
    label: 'Students',
    icon: Users,
    description: 'Manage student records and class assignments'
  },
  {
    value: 'teachers',
    label: 'Teachers',
    icon: GraduationCap,
    description: 'Manage teacher records and assignments'
  },
  {
    value: 'classes',
    label: 'Classes',
    icon: Building,
    description: 'Manage class information and relationships'
  },
  {
    value: 'schedules',
    label: 'Schedules',
    icon: Calendar,
    description: 'Manage schedule configurations'
  },
  {
    value: 'groupAssignments',
    label: 'Group Assignments',
    icon: Users,
    description: 'Manage group assignments for classes'
  },
  {
    value: 'teacherAssignments',
    label: 'Teacher Assignments',
    icon: BookOpen,
    description: 'Manage teacher assignments to classes and subjects'
  },
  {
    value: 'rooms',
    label: 'Rooms',
    icon: Home,
    description: 'Manage room information and capacity'
  },
  {
    value: 'subjects',
    label: 'Subjects',
    icon: BookOpen,
    description: 'Manage subject information'
  },
  {
    value: 'learningContents',
    label: 'Learning Contents',
    icon: FileText,
    description: 'Manage learning content definitions'
  },
  {
    value: 'schoolHolidays',
    label: 'School Holidays',
    icon: Calendar,
    description: 'Manage school holiday periods'
  },
  {
    value: 'schoolYears',
    label: 'School Years',
    icon: Calendar,
    description: 'Manage school years and semester dates'
  },
  {
    value: 'scheduleTimes',
    label: 'Schedule Times',
    icon: Clock,
    description: 'Manage schedule time periods'
  },
  {
    value: 'breakTimes',
    label: 'Break Times',
    icon: Clock,
    description: 'Manage break time periods'
  },
  {
    value: 'schedulePDFs',
    label: 'Schedule PDFs',
    icon: FileText,
    description: 'Manage generated schedule PDFs'
  },
  {
    value: 'teacherRotations',
    label: 'Teacher Rotations',
    icon: RotateCcw,
    description: 'Manage teacher rotation schedules'
  },
  {
    value: 'roles',
    label: 'Roles',
    icon: Shield,
    description: 'Manage user roles and permissions'
  },
  {
    value: 'userRoles',
    label: 'User Roles',
    icon: Shield,
    description: 'Manage user role assignments'
  },
  {
    value: 'supportMessages',
    label: 'Support Messages',
    icon: MessageSquare,
    description: 'Manage support messages and feedback'
  },
  {
    value: 'studentPhotos',
    label: 'Student Photos',
    icon: Image,
    description: 'Upload student photos by class (LastName_FirstName.jpg)'
  }
]

export default function AdminDataPage() {
  const [activeTab, setActiveTab] = useState('students')
  const { selectedYear } = useSchoolYear()
  const { isFeatureEnabled } = useEntitlements()
  const visibleTabs = modelTabs.filter(
    (tab) => tab.value !== 'studentPhotos' || isFeatureEnabled('student_photos')
  )
  const activeTabVisible = visibleTabs.some((t) => t.value === activeTab)
  const effectiveActiveTab = activeTabVisible ? activeTab : (visibleTabs[0]?.value ?? 'students')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center space-x-2">
          <Database className="h-8 w-8" />
          <div>
            <h1 className="text-3xl font-bold">Data Management</h1>
            <p className="text-muted-foreground">
              Manage all data in your application database
            </p>
          </div>
        </div>
        {selectedYear != null && (
          <p className="text-sm text-muted-foreground">
            School year: <span className="font-medium text-foreground">{selectedYear.label}</span>
          </p>
        )}
      </div>

      <Tabs value={effectiveActiveTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-1 h-auto p-1">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon
              return (
                <TabsTrigger 
                  key={tab.value} 
                  value={tab.value} 
                  className="flex flex-col items-center space-y-1 p-3 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-xs text-center leading-tight">{tab.label}</span>
                </TabsTrigger>
              )
            })}
          </TabsList>
        </div>

        {visibleTabs.map((tab) => {
          const Icon = tab.icon
          return (
            <TabsContent key={tab.value} value={tab.value} className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Icon className="h-5 w-5" />
                    <span>{tab.label}</span>
                  </CardTitle>
                  <CardDescription>{tab.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  {renderTabContent(tab.value)}
                </CardContent>
              </Card>
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}

function renderTabContent(tabValue: string) {
  switch (tabValue) {
    case 'students':
      return <StudentTab />
    case 'teachers':
      return <TeacherTab />
    case 'classes':
      return <ClassTab />
    case 'schedules':
      return <ScheduleTab />
    case 'groupAssignments':
      return <GroupAssignmentTab />
    case 'teacherAssignments':
      return <TeacherAssignmentTab />
    case 'rooms':
      return <RoomTab />
    case 'subjects':
      return <SubjectTab />
    case 'learningContents':
      return <LearningContentTab />
    case 'schoolHolidays':
      return <SchoolHolidayTab />
    case 'schoolYears':
      return <SchoolYearTab />
    case 'scheduleTimes':
      return <ScheduleTimeTab />
    case 'breakTimes':
      return <BreakTimeTab />
    case 'schedulePDFs':
      return <SchedulePDFTab />
    case 'teacherRotations':
      return <TeacherRotationTab />
    case 'roles':
      return <RoleTab />
    case 'userRoles':
      return <UserRoleTab />
    case 'supportMessages':
      return <SupportMessageTab />
    case 'studentPhotos':
      return <StudentPhotosUpload />
    default:
      return <div>Tab content not implemented yet</div>
  }
}
