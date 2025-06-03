import { useEffect } from "react"
import { useSession } from "next-auth/react"



export function TeacherOverview() {
    const { data: session } = useSession()

    const fetchData = async () => {
        const response = await fetch('/api/classes?teacher=${session?.user?.name')
        const data = await response.json()
        console.log(data)
    }

    useEffect(() => {
        if (session?.user?.role === 'teacher') {
            void fetchData()
            console.log(session?.user?.name)
        }
    }, [session?.user?.role])

    return (
        <p>Teacher</p>
    )
}

