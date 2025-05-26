'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

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
      toast.success('Holiday added successfully')
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
      toast.success('Holiday deleted successfully')
    } catch  {
      toast.error('Failed to delete holiday')
    }
  }

  const handleScrape = async () => {
    if (!scrapeUrl) {
      toast.error('Please enter a URL')
      return
    }

    setIsScraping(true)
    try {
      const response = await fetch('/api/settings/holidays/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url: scrapeUrl })
      })

      if (!response.ok) throw new Error('Failed to scrape holidays')

      const data = await response.json() as ScrapedHoliday[]
      if (data.length === 0) {
        toast.error('No holidays found on the page')
        return
      }
      
      setScrapedHolidays(data)
      toast.success(`Found ${data.length} holidays`)
    } catch  {
      toast.error('Failed to scrape holidays')
    } finally {
      setIsScraping(false)
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
      toast.success('Holidays saved successfully')
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
      <Tabs defaultValue="manual" className="space-y-4">
        <TabsList>
          <TabsTrigger value="manual">Manual Entry</TabsTrigger>
          <TabsTrigger value="scrape">Scrape Holidays</TabsTrigger>
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
                      onChange={(e) => setNewHoliday({ ...newHoliday, startDate: e.target.value })}
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
                      required
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

        <TabsContent value="scrape">
          <Card>
            <CardHeader>
              <CardTitle>Scrape Holidays</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <Label htmlFor="scrapeUrl">URL</Label>
                    <Input
                      id="scrapeUrl"
                      value={scrapeUrl}
                      onChange={(e) => setScrapeUrl(e.target.value)}
                      placeholder="Enter URL to scrape holidays from"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button 
                      onClick={handleScrape}
                      disabled={isScraping}
                    >
                      {isScraping ? 'Scraping...' : 'Scrape'}
                    </Button>
                  </div>
                </div>

                {scrapedHolidays.length > 0 && (
                  <>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Start Date</TableHead>
                            <TableHead>End Date</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {scrapedHolidays.map((holiday, index) => (
                            <TableRow key={index}>
                              <TableCell>
                                <Input
                                  value={holiday.name}
                                  onChange={(e) => handleEditScraped(index, 'name', e.target.value)}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="date"
                                  value={holiday.startDate}
                                  onChange={(e) => handleEditScraped(index, 'startDate', e.target.value)}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="date"
                                  value={holiday.endDate}
                                  onChange={(e) => handleEditScraped(index, 'endDate', e.target.value)}
                                />
                              </TableCell>
                              <TableCell>
                                {holiday.isValid ? (
                                  <span className="text-green-500 dark:text-green-400">Valid</span>
                                ) : (
                                  <span className="text-red-500 dark:text-red-400">Invalid</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleRemoveScraped(index)}
                                >
                                  Remove
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="flex justify-end">
                      <Button onClick={handleSaveScraped}>
                        Save Holidays
                      </Button>
                    </div>
                  </>
                )}

                <div className="mt-8">
                  <h3 className="text-lg font-semibold mb-4">Existing Holidays</h3>
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
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
} 