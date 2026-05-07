import { AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  className: string
  message?: string
}

export function ScheduleMissingStateCard({ className, message }: Props) {
  return (
    <Card className="m-4 border-destructive">
      <CardHeader className="pb-2">
        <CardTitle className="text-destructive flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          Kein Wechselplan für Klasse {className} gefunden!
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">
          {message ?? 'Keine Daten gefunden, bitte den Klassenleiter auffordner einen Wechselplan zu erstellen.'}
        </p>
      </CardContent>
    </Card>
  )
}
