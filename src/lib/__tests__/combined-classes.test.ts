import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveMemberClassIds, isCombinedClass, resolveGradeClassIds } from '../combined-classes'
import { prisma } from '@/lib/prisma'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    class: { findUnique: vi.fn() },
    classMembership: { findMany: vi.fn() },
  },
}))

const classFindUnique = vi.mocked(prisma.class.findUnique)
const membershipFindMany = vi.mocked(prisma.classMembership.findMany)

describe('combined-classes resolver', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('resolveMemberClassIds', () => {
    it('returns [classId] for a normal class', async () => {
      classFindUnique.mockResolvedValue({ isCombined: false, combinedMembers: [] } as never)
      await expect(resolveMemberClassIds(5)).resolves.toEqual([5])
    })

    it('returns the member class ids for a combined class', async () => {
      classFindUnique.mockResolvedValue({
        isCombined: true,
        combinedMembers: [{ memberClassId: 11 }, { memberClassId: 12 }],
      } as never)
      await expect(resolveMemberClassIds(99)).resolves.toEqual([11, 12])
    })

    it('falls back to [classId] when the class does not exist', async () => {
      classFindUnique.mockResolvedValue(null as never)
      await expect(resolveMemberClassIds(7)).resolves.toEqual([7])
    })
  })

  describe('isCombinedClass', () => {
    it('reflects the flag', async () => {
      classFindUnique.mockResolvedValue({ isCombined: true } as never)
      await expect(isCombinedClass(1)).resolves.toBe(true)
      classFindUnique.mockResolvedValue({ isCombined: false } as never)
      await expect(isCombinedClass(1)).resolves.toBe(false)
    })
  })

  describe('resolveGradeClassIds', () => {
    it('maps every student to the selected class for a normal class', async () => {
      classFindUnique.mockResolvedValue({ isCombined: false, combinedMembers: [] } as never)
      const map = await resolveGradeClassIds(5, 2026, [100, 101])
      expect(map.get(100)).toBe(5)
      expect(map.get(101)).toBe(5)
      // A normal class must not need a membership lookup.
      expect(membershipFindMany).not.toHaveBeenCalled()
    })

    it('maps each student to its own member class for a combined class', async () => {
      classFindUnique.mockResolvedValue({
        isCombined: true,
        combinedMembers: [{ memberClassId: 11 }, { memberClassId: 12 }],
      } as never)
      membershipFindMany.mockResolvedValue([
        { studentId: 100, classId: 11 },
        { studentId: 101, classId: 12 },
      ] as never)
      const map = await resolveGradeClassIds(99, 2026, [100, 101, 102])
      expect(map.get(100)).toBe(11)
      expect(map.get(101)).toBe(12)
      // A student with no membership among the member classes is omitted, so the
      // caller skips it rather than filing a grade under the combined lens.
      expect(map.has(102)).toBe(false)
      expect(membershipFindMany).toHaveBeenCalledWith({
        where: { studentId: { in: [100, 101, 102] }, classId: { in: [11, 12] }, schoolYearId: 2026 },
        select: { studentId: true, classId: true },
      })
    })
  })
})
