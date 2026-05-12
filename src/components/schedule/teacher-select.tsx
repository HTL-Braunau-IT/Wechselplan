import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Teacher {
	id: number
	firstName: string
	lastName: string
}

interface TeacherSelectProps {
	value: number | undefined
	onChange: (value: number) => void
	teachers: Teacher[]
}

export function TeacherSelect({ value, onChange, teachers }: TeacherSelectProps) {
	return (
		<Select
			value={value?.toString() ?? ''}
			onValueChange={(value) => onChange(Number(value))}
		>
			<SelectTrigger className="w-full">
				<SelectValue placeholder="Lehrer auswählen" />
			</SelectTrigger>
			<SelectContent>
				{teachers.map((teacher) => (
					<SelectItem key={teacher.id} value={teacher.id.toString()}>
						{`${teacher.lastName}, ${teacher.firstName}`}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	)
}
