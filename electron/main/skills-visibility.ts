export type ListedSkillEntry = {
  name: string
  source: string
}

export function extractSkillEntriesFromPayload(
  payload: Record<string, unknown> | null
): ListedSkillEntry[] {
  const rawSkills = Array.isArray(payload?.skills) ? payload.skills : []
  return rawSkills
    .map((skill) => {
      if (!skill || typeof skill !== 'object') return ''
      const name = typeof (skill as { name?: unknown }).name === 'string'
        ? (skill as { name: string }).name.trim()
        : ''
      const source = typeof (skill as { source?: unknown }).source === 'string'
        ? (skill as { source: string }).source.trim()
        : ''
      if (!name) return ''
      return { name, source }
    })
    .filter((entry): entry is ListedSkillEntry => Boolean(entry))
}

export function buildManagedSkillNameSet(
  payload: Record<string, unknown> | null
): Set<string> {
  return new Set(
    extractSkillEntriesFromPayload(payload)
      .filter((entry) => entry.source === 'openclaw-managed')
      .map((entry) => entry.name.toLowerCase())
  )
}

export function findVisibleInstalledSkillName(params: {
  slug: string
  beforeManagedSkillNames: Set<string>
  allowDiffDetection: boolean
  payload: Record<string, unknown> | null
}): string | null {
  const entries = extractSkillEntriesFromPayload(params.payload)
  const slugKey = params.slug.toLowerCase()

  for (const entry of entries) {
    if (entry.source === 'openclaw-managed' && entry.name.toLowerCase() === slugKey) {
      return entry.name
    }
  }

  if (params.allowDiffDetection) {
    for (const entry of entries) {
      if (entry.source !== 'openclaw-managed') continue
      if (!params.beforeManagedSkillNames.has(entry.name.toLowerCase())) {
        return entry.name
      }
    }
  }

  return null
}

export function resolveInstalledSkillVerificationState(params: {
  hasBeforePayload: boolean
  visibility:
    | {
        visibleName: string
        payload: Record<string, unknown> | null
      }
    | null
}): 'visible' | 'invisible-reliable' | 'uncertain' {
  if (params.visibility?.visibleName) {
    return 'visible'
  }

  if (params.hasBeforePayload && Boolean(params.visibility?.payload)) {
    return 'invisible-reliable'
  }

  return 'uncertain'
}
