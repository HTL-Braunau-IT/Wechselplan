'use client'

import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiFetch, apiSend, errorMessageOf } from '@/lib/api-client'

/**
 * The preview -> select -> apply state machine shared by the directory sync
 * dialogs.
 *
 * Both dialogs had grown their own copy of this: the same stage union, the same
 * `Record<id, boolean>` selection buckets, the same two fetches, the same toast
 * and the same "which tab should open first" heuristic. Only the tables in the
 * middle actually differ.
 *
 * Built on React Query rather than useEffect. The stage is derived from the
 * query and mutation state, and the selection is derived from the diff with an
 * overlay of the user's clicks, so nothing has to be copied into state when the
 * data arrives.
 */

export type SyncStage = 'loading' | 'preview' | 'applying' | 'done' | 'error'

/** One selectable bucket, keyed by whatever identifies a row in it. */
export type SelectionBucket = Record<string, boolean>

export type SelectionState<TKeys extends string> = Record<TKeys, SelectionBucket>

export interface UseSyncPreviewOptions<TDiff, TSummary, TKeys extends string> {
  /** Distinguishes this dialog's cached preview from the other one's. */
  queryKey: string
  previewUrl: string
  applyUrl: string
  /** Everything is selected by default; this describes what "everything" is. */
  buildSelection: (diff: TDiff) => SelectionState<TKeys>
  /** Turns the current selection into the apply request body. */
  buildPayload: (selection: SelectionState<TKeys>, diff: TDiff) => unknown
  /** Human summary for the success toast. */
  describeSummary: (summary: TSummary) => string
  /** Called after a successful apply, e.g. to invalidate queries. */
  onCompleted?: () => void
  /** Load the preview when this becomes true. */
  open: boolean
}

export interface SyncPreviewController<TDiff, TSummary, TKeys extends string> {
  stage: SyncStage
  diff: TDiff | null
  summary: TSummary | null
  error: string | null
  selection: SelectionState<TKeys>
  /** Toggle a single row. */
  toggle: (bucket: TKeys, key: string | number, checked: boolean) => void
  /** Select or clear a whole bucket at once. */
  setBucket: (bucket: TKeys, keys: Array<string | number>, checked: boolean) => void
  /** True when every key in the bucket is selected. */
  isBucketFull: (bucket: TKeys, keys: Array<string | number>) => boolean
  selectedCount: number
  reload: () => void
  apply: () => void
  /** Blocks closing mid-apply. */
  canClose: boolean
}

export function useSyncPreview<TDiff, TSummary, TKeys extends string>(
  options: UseSyncPreviewOptions<TDiff, TSummary, TKeys>,
): SyncPreviewController<TDiff, TSummary, TKeys> {
  const {
    queryKey,
    previewUrl,
    applyUrl,
    buildSelection,
    buildPayload,
    describeSummary,
    onCompleted,
    open,
  } = options

  // Only the user's explicit clicks live in state; the defaults come from the
  // diff, so there is nothing to synchronise when a fresh preview arrives.
  const [overrides, setOverrides] = useState<Partial<SelectionState<TKeys>>>({})

  const preview = useQuery({
    queryKey: ['sync-preview', queryKey],
    enabled: open,
    // A preview is a point-in-time snapshot of the directory; refetching it
    // behind the user's back would change the diff they are reviewing.
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: () =>
      apiFetch<TDiff>(previewUrl, { method: 'POST', errorMessage: 'Vorschau fehlgeschlagen' }),
  })

  const diff = preview.data ?? null

  const defaults = useMemo(
    () => (diff ? buildSelection(diff) : ({} as SelectionState<TKeys>)),
    [diff, buildSelection],
  )

  const selection = useMemo(() => {
    const merged = {} as SelectionState<TKeys>
    for (const bucket of Object.keys(defaults) as TKeys[]) {
      merged[bucket] = { ...defaults[bucket], ...overrides[bucket] }
    }
    return merged
  }, [defaults, overrides])

  const applyMutation = useMutation({
    mutationFn: () => {
      if (!diff) throw new Error('Keine Vorschau geladen')
      return apiSend<TSummary>(applyUrl, 'POST', buildPayload(selection, diff), {
        errorMessage: 'Anwenden fehlgeschlagen',
      })
    },
    onSuccess: result => {
      toast.success(describeSummary(result))
      onCompleted?.()
    },
    onError: error => {
      toast.error(errorMessageOf(error, 'Anwenden fehlgeschlagen'))
    },
  })

  const stage: SyncStage = applyMutation.isPending
    ? 'applying'
    : applyMutation.isSuccess
      ? 'done'
      : applyMutation.isError || preview.isError
        ? 'error'
        : preview.isPending
          ? 'loading'
          : 'preview'

  const error = applyMutation.error
    ? errorMessageOf(applyMutation.error, 'Anwenden fehlgeschlagen')
    : preview.error
      ? errorMessageOf(preview.error, 'Vorschau fehlgeschlagen')
      : null

  const toggle = useCallback((bucket: TKeys, key: string | number, checked: boolean) => {
    setOverrides(prev => ({
      ...prev,
      [bucket]: { ...prev[bucket], [String(key)]: checked },
    }))
  }, [])

  const setBucket = useCallback((bucket: TKeys, keys: Array<string | number>, checked: boolean) => {
    setOverrides(prev => ({
      ...prev,
      [bucket]: {
        ...prev[bucket],
        ...Object.fromEntries(keys.map(key => [String(key), checked])),
      },
    }))
  }, [])

  const isBucketFull = useCallback(
    (bucket: TKeys, keys: Array<string | number>) =>
      keys.length > 0 && keys.every(key => selection[bucket]?.[String(key)] !== false),
    [selection],
  )

  const selectedCount = useMemo(
    () =>
      Object.values<SelectionBucket>(selection).reduce(
        (total, bucket) => total + Object.values(bucket).filter(Boolean).length,
        0,
      ),
    [selection],
  )

  const reload = useCallback(() => {
    setOverrides({})
    applyMutation.reset()
    void preview.refetch()
  }, [applyMutation, preview])

  return {
    stage,
    diff,
    summary: applyMutation.data ?? null,
    error,
    selection,
    toggle,
    setBucket,
    isBucketFull,
    selectedCount,
    reload,
    apply: () => applyMutation.mutate(),
    canClose: !applyMutation.isPending,
  }
}

/** Marks every row in a bucket as selected. */
export function selectAll<T>(rows: T[], key: (row: T) => string | number): SelectionBucket {
  return Object.fromEntries(rows.map(row => [String(key(row)), true]))
}

/** Extracts the checked keys of a bucket, for the apply payload. */
export function checkedKeys(bucket: SelectionBucket | undefined): string[] {
  return Object.entries(bucket ?? {})
    .filter(([, checked]) => checked)
    .map(([key]) => key)
}

/** Same as {@link checkedKeys}, for buckets keyed by a numeric row id. */
export function checkedNumericKeys(bucket: SelectionBucket | undefined): number[] {
  return checkedKeys(bucket).map(Number)
}
