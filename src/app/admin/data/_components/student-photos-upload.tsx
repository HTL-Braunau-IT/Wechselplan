'use client'

import { useState, useEffect } from 'react'
import { useSchoolYear } from '@/contexts/school-year-context'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import { Upload, CheckCircle, XCircle, FolderOpen, Loader2 } from 'lucide-react'

type UploadResultItem = { filename: string; success: boolean; studentId?: number; error?: string }

function parseFileNameToStudentName(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '').trim()
  const parts = base.split('_')
  if (parts.length < 2) return filename
  const lastName = parts[0]!.trim()
  const firstName = parts.slice(1).join('_').trim()
  return `${lastName}, ${firstName}`
}

export function StudentPhotosUpload() {
  const { selectedYear } = useSchoolYear()
  const schoolYearId = selectedYear?.id
  const [classes, setClasses] = useState<Array<{ id: number; name: string }>>([])
  const [selectedClassId, setSelectedClassId] = useState<string>('')
  const [files, setFiles] = useState<FileList | null>(null)
  const [allClassesFiles, setAllClassesFiles] = useState<FileList | null>(null)
  const [allClassesFolderName, setAllClassesFolderName] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const setAllClassesFromFolder = (fileList: FileList | null) => {
    setAllClassesFiles(fileList)
    if (fileList && fileList.length > 0) {
      const first = fileList[0]
      const path = first
        ? (first as File & { webkitRelativePath?: string }).webkitRelativePath ?? first.name
        : ''
      setAllClassesFolderName(path.split('/')[0] ?? null)
    } else {
      setAllClassesFolderName(null)
    }
  }
  const setAllClassesFromFiles = (fileList: FileList | null) => {
    setAllClassesFiles(fileList)
    setAllClassesFolderName(null)
  }
  const [results, setResults] = useState<UploadResultItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [progressOpen, setProgressOpen] = useState(false)
  const [progressCurrent, setProgressCurrent] = useState(0)
  const [progressTotal, setProgressTotal] = useState(0)
  const [progressFileName, setProgressFileName] = useState<string | null>(null)
  const [progressDone, setProgressDone] = useState(false)

  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const url =
          schoolYearId != null
            ? `/api/classes?schoolYearId=${schoolYearId}`
            : '/api/admin/data?model=class'
        const response = await fetch(url, schoolYearId != null ? { cache: 'no-store' } : undefined)
        if (response.ok) {
          const data = (await response.json()) as Array<{ id: number; name: string }>
          setClasses(data.map((c) => ({ id: c.id, name: c.name })))
          if (data.length > 0 && !selectedClassId) {
            setSelectedClassId(String(data[0]!.id))
          }
        }
      } catch (err) {
        console.error('Error fetching classes:', err)
      }
    }
    void fetchClasses()
  }, [schoolYearId])

  const handleUpload = async (forAllClasses: boolean) => {
    const filesToUse = forAllClasses ? allClassesFiles : files
    if (!forAllClasses && !selectedClassId) {
      setError('Select a class and at least one file.')
      return
    }
    if (!filesToUse || filesToUse.length === 0) {
      setError(forAllClasses ? 'Select at least one file.' : 'Select a class and at least one file.')
      return
    }
    setError(null)
    setUploading(true)
    setResults([])
    setProgressDone(false)
    setProgressTotal(filesToUse.length)
    setProgressOpen(true)

    const collectedResults: UploadResultItem[] = []

    try {
      for (let i = 0; i < filesToUse.length; i++) {
        const file = filesToUse[i]!
        setProgressCurrent(i + 1)
        setProgressFileName(file.name)

        const formData = new FormData()
        if (forAllClasses) {
          formData.set('mode', 'all')
        } else {
          formData.set('classId', selectedClassId!)
        }
        formData.append('files', file)

        const response = await fetch('/api/admin/student-photos/upload', {
          method: 'POST',
          body: formData
        })
        const data = (await response.json()) as { results?: UploadResultItem[]; error?: string }
        if (response.ok && data.results?.length) {
          collectedResults.push(data.results[0]!)
        } else {
          collectedResults.push({
            filename: file.name,
            success: false,
            error: data.error ?? 'Upload failed'
          })
        }
        setResults([...collectedResults])
      }
      setFiles(null)
      setAllClassesFiles(null)
      setAllClassesFolderName(null)
    } catch (err) {
      console.error('Upload error:', err)
      setError('Upload failed')
    } finally {
      setUploading(false)
      setProgressDone(true)
      setProgressFileName(null)
    }
  }

  const closeProgressModal = () => {
    setProgressOpen(false)
    setProgressCurrent(0)
    setProgressTotal(0)
    setProgressFileName(null)
    setProgressDone(false)
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        File names must be <strong>LastName_FirstName</strong> (e.g. Mustermann_Max.jpg). Photos are
        stored one per student and overwritten on re-upload.
      </p>

      <div className="space-y-4">
        <h4 className="text-sm font-medium">Upload for one class</h4>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label htmlFor="photo-class">Class</Label>
            <Select value={selectedClassId} onValueChange={setSelectedClassId}>
              <SelectTrigger id="photo-class" className="w-[200px]">
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="photo-files">Files</Label>
            <input
              id="photo-files"
              type="file"
              accept="image/jpeg,image/png,image/jpg"
              multiple
              className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-primary-foreground file:text-sm"
              onChange={(e) => setFiles(e.target.files ?? null)}
            />
          </div>
          <Button
            onClick={() => handleUpload(false)}
            disabled={uploading || !selectedClassId || !files?.length}
          >
            <Upload className="mr-2 h-4 w-4" />
            {uploading ? 'Uploading…' : 'Upload'}
          </Button>
        </div>
      </div>

      <div className="space-y-4 border-t pt-4">
        <h4 className="text-sm font-medium">Import for all classes at once</h4>
        <p className="text-sm text-muted-foreground">
          Select a folder or multiple files; each image is matched to a student by name across all
          classes. If exactly one student has that first and last name, the photo is saved. If none
          or several match, the file is skipped and reported.
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label htmlFor="photo-files-all">Files</Label>
            <input
              id="photo-files-all"
              type="file"
              accept="image/jpeg,image/png,image/jpg"
              multiple
              className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-primary-foreground file:text-sm"
              onChange={(e) => setAllClassesFromFiles(e.target.files ?? null)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="photo-folder-all" className="flex items-center gap-1.5">
              <FolderOpen className="h-4 w-4" />
              Or select folder
            </Label>
            <input
              id="photo-folder-all"
              type="file"
              accept="image/jpeg,image/png,image/jpg"
              multiple
              className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-primary-foreground file:text-sm"
              onChange={(e) => setAllClassesFromFolder(e.target.files ?? null)}
              {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
            />
          </div>
          <Button
            onClick={() => handleUpload(true)}
            disabled={uploading || !allClassesFiles?.length}
          >
            <Upload className="mr-2 h-4 w-4" />
            {uploading ? 'Uploading…' : 'Import all'}
          </Button>
        </div>
        {allClassesFolderName != null && allClassesFiles != null && allClassesFiles.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Folder “{allClassesFolderName}”: {allClassesFiles.length} file(s) selected.
          </p>
        )}
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {results.length > 0 && !progressOpen && (
        <div className="space-y-2">
          <Label>Last upload</Label>
          <ul className="max-h-48 overflow-y-auto rounded-md border p-2 text-sm">
            {results.map((r, i) => (
              <li key={i} className="flex items-center gap-2 py-1">
                {r.success ? (
                  <CheckCircle className="h-4 w-4 shrink-0 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                )}
                <span className="truncate">{r.filename}</span>
                {r.success && r.studentId != null && (
                  <span className="text-muted-foreground">(ID {r.studentId})</span>
                )}
                {!r.success && r.error && (
                  <span className="text-destructive">{r.error}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={progressOpen} onOpenChange={(open) => !uploading && open === false && closeProgressModal()}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => uploading && e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>
              {progressDone ? 'Upload complete' : 'Uploading student photos'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {!progressDone ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Processing {progressCurrent} of {progressTotal}
                </p>
                {progressFileName != null && (
                  <>
                    <p className="text-sm font-medium">{parseFileNameToStudentName(progressFileName)}</p>
                    <p className="text-xs text-muted-foreground truncate" title={progressFileName}>
                      {progressFileName}
                    </p>
                  </>
                )}
                <div className="flex justify-center py-2">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {results.filter((r) => r.success).length} succeeded, {results.filter((r) => !r.success).length} failed.
                </p>
              </>
            )}
          </div>
          <DialogFooter>
            <Button onClick={closeProgressModal} disabled={!progressDone}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
