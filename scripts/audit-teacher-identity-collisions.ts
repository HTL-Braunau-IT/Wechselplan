/**
 * Read-only audit script to detect teacher identity collisions across LDAP/O365.
 *
 * Run with:
 *   npx tsx scripts/audit-teacher-identity-collisions.ts
 *
 * Output:
 * - prints JSON to stdout with collision clusters
 * - each cluster includes dependency counts to estimate merge impact
 */
import { PrismaClient, type Teacher } from '@prisma/client'
import { normalizeUsername } from '../src/lib/username'

type TeacherWithKeys = Pick<Teacher, 'id' | 'firstName' | 'lastName' | 'username' | 'email' | 'externalId' | 'externalSource' | 'createdAt'>

interface DependencyCounts {
  teacherAssignments: number
  teacherRotations: number
  grades: number
  notenWeightConfigs: number
  lehrstoffPerDay: number
  notenEntries: number
  classHeadLinks: number
  classLeadLinks: number
}

interface ClusterMember {
  teacher: TeacherWithKeys
  keys: string[]
  dependencies: DependencyCounts
  dependencyScore: number
}

interface CollisionCluster {
  clusterId: number
  sharedKeys: string[]
  canonicalTeacherId: number
  members: ClusterMember[]
}

const prisma = new PrismaClient()

function normalizeEmailKey(email: string | null): string | null {
  if (!email) return null
  const normalized = normalizeUsername(email)
  return normalized || null
}

function identityKeys(teacher: TeacherWithKeys): string[] {
  const keys = new Set<string>()

  const username = normalizeUsername(teacher.username)
  if (username) keys.add(`username:${username}`)

  const emailLocal = normalizeEmailKey(teacher.email)
  if (emailLocal) keys.add(`emailLocal:${emailLocal}`)

  if (teacher.externalId) keys.add(`externalId:${teacher.externalId}`)

  return [...keys]
}

async function dependencyCounts(teacherId: number): Promise<DependencyCounts> {
  const [
    teacherAssignments,
    teacherRotations,
    grades,
    notenWeightConfigs,
    lehrstoffPerDay,
    notenEntries,
    classHeadLinks,
    classLeadLinks,
  ] = await Promise.all([
    prisma.teacherAssignment.count({ where: { teacherId } }),
    prisma.teacherRotation.count({ where: { teacherId } }),
    prisma.grade.count({ where: { teacherId } }),
    prisma.notenWeightConfig.count({ where: { teacherId } }),
    prisma.lehrstoffPerDay.count({ where: { teacherId } }),
    prisma.notenEntry.count({ where: { teacherId } }),
    prisma.class.count({ where: { classHeadId: teacherId } }),
    prisma.class.count({ where: { classLeadId: teacherId } }),
  ])

  return {
    teacherAssignments,
    teacherRotations,
    grades,
    notenWeightConfigs,
    lehrstoffPerDay,
    notenEntries,
    classHeadLinks,
    classLeadLinks,
  }
}

function dependencyScore(counts: DependencyCounts): number {
  return Object.values(counts).reduce((sum, n) => sum + n, 0)
}

function chooseCanonical(members: ClusterMember[]): number {
  if (members.length === 0) {
    throw new Error('Cannot choose canonical teacher from empty cluster')
  }
  const sorted = [...members].sort((a, b) => {
    const scoreDiff = b.dependencyScore - a.dependencyScore
    if (scoreDiff !== 0) return scoreDiff

    // Prefer the row that is already Entra-bound when usage is equal.
    const aIsEntra = Number(Boolean(a.teacher.externalId && a.teacher.externalSource === 'entra'))
    const bIsEntra = Number(Boolean(b.teacher.externalId && b.teacher.externalSource === 'entra'))
    const entraDiff = bIsEntra - aIsEntra
    if (entraDiff !== 0) return entraDiff

    return a.teacher.createdAt.getTime() - b.teacher.createdAt.getTime()
  })

  const first = sorted[0]
  if (!first) {
    throw new Error('Unable to resolve canonical teacher')
  }
  return first.teacher.id
}

function buildClusters(teachers: TeacherWithKeys[]): TeacherWithKeys[][] {
  const byId = new Map<number, TeacherWithKeys>()
  const keyToIds = new Map<string, Set<number>>()
  const adjacency = new Map<number, Set<number>>()

  for (const teacher of teachers) {
    byId.set(teacher.id, teacher)
    adjacency.set(teacher.id, new Set<number>())
    for (const key of identityKeys(teacher)) {
      const set = keyToIds.get(key) ?? new Set<number>()
      set.add(teacher.id)
      keyToIds.set(key, set)
    }
  }

  for (const ids of keyToIds.values()) {
    const list = [...ids]
    if (list.length < 2) continue
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const left = list[i]
        const right = list[j]
        if (left == null || right == null) continue
        adjacency.get(left)?.add(right)
        adjacency.get(right)?.add(left)
      }
    }
  }

  const visited = new Set<number>()
  const clusters: TeacherWithKeys[][] = []
  for (const teacher of teachers) {
    if (visited.has(teacher.id)) continue
    const stack = [teacher.id]
    const component: TeacherWithKeys[] = []
    while (stack.length > 0) {
      const current = stack.pop()
      if (current == null || visited.has(current)) continue
      visited.add(current)
      const row = byId.get(current)
      if (row) component.push(row)
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!visited.has(neighbor)) stack.push(neighbor)
      }
    }
    if (component.length > 1) {
      clusters.push(component)
    }
  }

  return clusters
}

async function main() {
  const teachers = await prisma.teacher.findMany({
    select: {
      id: true,
      firstName: true,
      lastName: true,
      username: true,
      email: true,
      externalId: true,
      externalSource: true,
      createdAt: true,
    },
    orderBy: { id: 'asc' },
  })

  const clusters = buildClusters(teachers)
  const output: CollisionCluster[] = []

  for (const [index, cluster] of clusters.entries()) {
    const members: ClusterMember[] = []
    const sharedKeys = new Set<string>()
    const keyCounts = new Map<string, number>()

    for (const teacher of cluster) {
      const keys = identityKeys(teacher)
      for (const key of keys) {
        keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1)
      }
      const dependencies = await dependencyCounts(teacher.id)
      members.push({
        teacher,
        keys,
        dependencies,
        dependencyScore: dependencyScore(dependencies),
      })
    }

    for (const [key, count] of keyCounts) {
      if (count > 1) sharedKeys.add(key)
    }

    output.push({
      clusterId: index + 1,
      sharedKeys: [...sharedKeys].sort(),
      canonicalTeacherId: chooseCanonical(members),
      members: members.sort((a, b) => b.dependencyScore - a.dependencyScore),
    })
  }

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        teacherCount: teachers.length,
        collisionClusterCount: output.length,
        clusters: output,
      },
      null,
      2,
    ),
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
