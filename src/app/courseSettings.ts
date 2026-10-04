export type CourseRings = 'next3' | 'all'

export interface CourseSettings {
  courseRings: CourseRings
}

export const DEFAULT_COURSE_SETTINGS: CourseSettings = { courseRings: 'next3' }
const STORAGE_KEY = 'driftwing.course.v1'

export function parseCourseSettings(raw: string | null): CourseSettings {
  if (!raw) return DEFAULT_COURSE_SETTINGS
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return DEFAULT_COURSE_SETTINGS
    return {
      courseRings: (value as Record<string, unknown>).courseRings === 'all' ? 'all' : 'next3',
    }
  } catch {
    return DEFAULT_COURSE_SETTINGS
  }
}

export function loadCourseSettings(
  storage: Pick<Storage, 'getItem'> | undefined,
  search = '',
): CourseSettings {
  let raw: string | null = null
  try {
    raw = storage?.getItem(STORAGE_KEY) ?? null
  } catch {
    // Storage can be unavailable in private browsing. The URL flag still applies.
  }
  const stored = parseCourseSettings(raw)
  return {
    courseRings: new URLSearchParams(search).get('rings') === 'all' ? 'all' : stored.courseRings,
  }
}

export function saveCourseSettings(
  storage: Pick<Storage, 'setItem'> | undefined,
  settings: CourseSettings,
): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Keep the setting in memory when storage is unavailable.
  }
}
