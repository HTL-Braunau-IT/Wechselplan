import { collectGroups } from '@/lib/graph'
import { getSyncedClassGroupIds } from '@/lib/directory-sync-settings'

/**
 * Auto-discovery of the Entra security groups that represent student classes.
 *
 * The school's class groups follow a fixed naming scheme: a year digit (1-5)
 * followed by a department code (e.g. `1AHITS`, `2AHELS`, `5HET`). Rather than
 * asking the admin to hand-pick these out of every Entra group, we enumerate all
 * groups and keep the ones whose (trimmed, upper-cased) display name matches the
 * pattern below. The result feeds the directory-sync class-group selection.
 */
export const CLASS_GROUP_NAME_PATTERN = /^[1-5](AHITS|AHELS|BHELS|CHELS|AHME|BHME|HETS?)$/

/** Whether a group display name is a student class group name. */
export function isClassGroupName(name: string): boolean {
  return CLASS_GROUP_NAME_PATTERN.test(name.trim().toUpperCase())
}

export interface DiscoveredClassGroup {
  id: string
  displayName: string
  /** Whether this group is already part of the persisted synced class-group set. */
  alreadySynced: boolean
}

/**
 * Enumerate Entra groups, keep the ones that look like a student class group,
 * and mark those already present in the persisted synced set. Sorted by name.
 */
export async function discoverClassGroups(): Promise<DiscoveredClassGroup[]> {
  const [groups, syncedIds] = await Promise.all([collectGroups(), getSyncedClassGroupIds()])
  const synced = new Set(syncedIds)

  return groups
    .filter(group => group.displayName && isClassGroupName(group.displayName))
    .map(group => ({
      id: group.id,
      displayName: group.displayName!,
      alreadySynced: synced.has(group.id),
    }))
    .sort((a, b) =>
      a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }),
    )
}
