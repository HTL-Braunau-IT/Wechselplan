'use client'

import { useEffect, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import type {Teacher, Class} from '@/types/types.ts'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const NONE_VALUE = 'none'

interface ErrorResponse {
    error: string
}

function LoadingScreen() {
    const { t } = useTranslation()
    return (
        <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-lg text-muted-foreground">{t('classSettings.loading')}</p>
        </div>
    )
}

export default function ClassSettingsPage() {
    const { t } = useTranslation()
    const [classes, setClasses] = useState<Class[]>([])
    const [teachers, setTeachers] = useState<Teacher[]>([])
    const [loading, setLoading] = useState(true)
    const [updatingClassId, setUpdatingClassId] = useState<number | null>(null)
    const [updatingField, setUpdatingField] = useState<'head' | 'lead' | null>(null)

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Start both requests simultaneously
                const [classesPromise, teachersPromise] = [
                    fetch('/api/classes'),
                    fetch('/api/teachers')
                ]

                // Wait for both requests to complete, regardless of success/failure
                const [classesResult, teachersResult] = await Promise.allSettled([
                    classesPromise,
                    teachersPromise
                ])

                // Handle classes result
                if (classesResult.status === 'fulfilled' && classesResult.value.ok) {
                    const classesData = await classesResult.value.json()
                    setClasses(classesData as Class[])
                } else {
                    throw new Error('Failed to fetch classes')
                }

                // Handle teachers result
                if (teachersResult.status === 'fulfilled' && teachersResult.value.ok) {
                    const teachersData = await teachersResult.value.json()
                    setTeachers(teachersData as Teacher[])
                } else {
                    throw new Error('Failed to fetch teachers')
                }
            } catch (error) {
                toast.error(t('classSettings.error.load'))
                console.error(error)
            } finally {
                setLoading(false)
            }
        }

        void fetchData()
    }, [t])

    const handleTeacherChange = async (classId: number, teacherId: number | null, type: 'head' | 'lead') => {
        if (updatingClassId !== null) {
            return // Prevent multiple simultaneous updates
        }

        setUpdatingClassId(classId)
        setUpdatingField(type)
        
        try {
            const response = await fetch(`/api/classes/${classId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    [type === 'head' ? 'classHeadId' : 'classLeadId']: teacherId
                })
            })

            if (!response.ok) {
                const errorData = await response.json() as ErrorResponse
                throw new Error(errorData.error ?? t('classSettings.error.update'))
            }

            const updatedClass = await response.json() as Class
            setClasses(prevClasses => 
                prevClasses.map(c => 
                    c.id === classId ? updatedClass : c
                )
            )

            toast.success(t('classSettings.success'))
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t('classSettings.error.update'))
            console.error(error)
        } finally {
            setUpdatingClassId(null)
            setUpdatingField(null)
        }
    }

    if (loading) {
        return <LoadingScreen />
    }

    return (
        <div className="container mx-auto py-8">
            <h1 className="text-2xl font-bold mb-6">{t('classSettings.title')}</h1>
            <div className="grid gap-6">
                {classes.map((cls) => (
                    <Card key={cls.id}>
                        <CardHeader>
                            <CardTitle>{cls.name}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-2">
                                        {t('classSettings.classHead')}
                                    </label>
                                    <div className="relative">
                                        <Select
                                            value={cls.classHeadId ? cls.classHeadId.toString() : NONE_VALUE}
                                            onValueChange={(value) => 
                                                handleTeacherChange(
                                                    cls.id, 
                                                    value === NONE_VALUE ? null : parseInt(value), 
                                                    'head'
                                                )
                                            }
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder={t('classSettings.selectClassHead')} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value={NONE_VALUE}>{t('classSettings.none')}</SelectItem>
                                                {teachers.map((teacher) => (
                                                    <SelectItem 
                                                        key={teacher.id} 
                                                        value={teacher.id.toString()}
                                                    >
                                                        {teacher.firstName} {teacher.lastName}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {updatingClassId === cls.id && updatingField === 'head' && (
                                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2 text-sm text-muted-foreground">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                <span>{t('classSettings.updating')}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-2">
                                        {t('classSettings.classLead')}
                                    </label>
                                    <div className="relative">
                                        <Select
                                            value={cls.classLeadId ? cls.classLeadId.toString() : NONE_VALUE}
                                            onValueChange={(value) => 
                                                handleTeacherChange(
                                                    cls.id, 
                                                    value === NONE_VALUE ? null : parseInt(value), 
                                                    'lead'
                                                )
                                            }
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder={t('classSettings.selectClassLead')} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value={NONE_VALUE}>{t('classSettings.none')}</SelectItem>
                                                {teachers.map((teacher) => (
                                                    <SelectItem 
                                                        key={teacher.id} 
                                                        value={teacher.id.toString()}
                                                    >
                                                        {teacher.firstName} {teacher.lastName}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {updatingClassId === cls.id && updatingField === 'lead' && (
                                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2 text-sm text-muted-foreground">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                <span>{t('classSettings.updating')}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    )
}
