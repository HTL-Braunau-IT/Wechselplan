'use client'

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface Holiday {
  id: number
  name: string
  startDate: string
  endDate: string
}

interface ScrapedHoliday {
  name: string
  startDate: string
  endDate: string
  isValid: boolean
}

export default function HolidaysPage() {
  const { t } = useTranslation()
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [newHoliday, setNewHoliday] = useState<Omit<Holiday, 'id'>>({
    name: '',
    startDate: '',
    endDate: ''
  })
  const [isLoading, setIsLoading] = useState(true)
  const [scrapeUrl, setScrapeUrl] = useState('')
  const [scrapedHolidays, setScrapedHolidays] = useState<ScrapedHoliday[]>([])
  const [isScraping, setIsScraping] = useState(false)
  const [error, ] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    void fetchHolidays()
  }, [])

  const fetchHolidays = async () => {
    try {
      const response = await fetch('/api/settings/holidays')
      if (!response.ok) throw new Error('Failed to fetch holidays')
      const data = await response.json() as Holiday[]
      setHolidays(data)
    } catch  {
      toast.error('Failed to load holidays')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const response = await fetch('/api/settings/holidays', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newHoliday)
      })

      if (!response.ok) throw new Error('Failed to add holiday')

      await fetchHolidays()
      setNewHoliday({ name: '', startDate: '', endDate: '' })
      setSuccess('Holiday added successfully')
    } catch  {
      toast.error('Failed to add holiday')
    }
  }

  const handleDelete = async (id: number) => {
    try {
      const response = await fetch(`/api/settings/holidays/${id}`, {
        method: 'DELETE'
      })

      if (!response.ok) throw new Error('Failed to delete holiday')

      await fetchHolidays()
      setSuccess('Holiday deleted successfully')
    } catch  {
      toast.error('Failed to delete holiday')
    }
  }

  

  const handleSaveScraped = async () => {
    try {
      const validHolidays = scrapedHolidays.filter(h => h.isValid)
      if (validHolidays.length === 0) {
        toast.error('No valid holidays to save')
        return
      }

      const response = await fetch('/api/settings/holidays/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(validHolidays)
      })

      if (!response.ok) throw new Error('Failed to save holidays')

      await fetchHolidays()
      setScrapedHolidays([])
      setScrapeUrl('')
      setSuccess('Holidays saved successfully')
    } catch  {
      toast.error('Failed to save holidays')
    }
  }

  const handleEditScraped = (index: number, field: keyof Omit<ScrapedHoliday, 'isValid'>, value: string) => {
    setScrapedHolidays(prev => {
      const updated = [...prev]
      const holiday = { ...updated[index] } as ScrapedHoliday
      if (field === 'name') {
        holiday.name = value
      } else if (field === 'startDate') {
        holiday.startDate = value
      } else if (field === 'endDate') {
        holiday.endDate = value
      }
      holiday.isValid = true
      updated[index] = holiday
      return updated
    })
  }

  const handleRemoveScraped = (index: number) => {
    setScrapedHolidays(prev => prev.filter((_, i) => i !== index))
  }

  if (isLoading) return <div>Loading...</div>

  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('admin.settings.holidays.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="mb-4">
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          <Tabs defaultValue="manual" className="space-y-4">
            <TabsList className="bg-muted/50">
              <TabsTrigger value="manual" className="data-[state=active]:bg-background data-[state=active]:text-foreground">
                {t('admin.settings.holidays.manualEntry')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="manual">
              <Card>
                <CardHeader>
                  <CardTitle>School Holidays</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-4 mb-8">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div>
                        <Label htmlFor="name">Holiday Name</Label>
                        <Input
                          id="name"
                          value={newHoliday.name}
                          onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })}
                          placeholder="e.g., Christmas Break"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="startDate">Start Date</Label>
                        <Input
                          id="startDate"
                          type="date"
                          value={newHoliday.startDate}
                          onChange={(e) => {
                            const startDate = e.target.value;
                            setNewHoliday({ ...newHoliday, startDate, endDate: startDate });
                          }}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="endDate">End Date</Label>
                        <Input
                          id="endDate"
                          type="date"
                          value={newHoliday.endDate}
                          onChange={(e) => setNewHoliday({ ...newHoliday, endDate: e.target.value })}
                        />
                      </div>
                      <div className="flex items-end">
                        <Button type="submit" className="w-full">Add Holiday</Button>
                      </div>
                    </div>
                  </form>

                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Start Date</TableHead>
                          <TableHead>End Date</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {holidays.map((holiday) => (
                          <TableRow key={holiday.id}>
                            <TableCell>{holiday.name}</TableCell>
                            <TableCell>{format(new Date(holiday.startDate), 'dd.MM.yyyy')}</TableCell>
                            <TableCell>{format(new Date(holiday.endDate), 'dd.MM.yyyy')}</TableCell>
                            <TableCell>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDelete(holiday.id)}
                              >
                                Delete
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
} 