import { create } from 'zustand'
import { loadCourseSettings, saveCourseSettings, type CourseRings } from './courseSettings'

const storage = (): Storage | undefined =>
  typeof window === 'undefined' ? undefined : window.localStorage

interface CourseSettingsStore {
  courseRings: CourseRings
  toggleCourseRings: () => void
}

export const useCourseSettingsStore = create<CourseSettingsStore>((set, get) => ({
  ...loadCourseSettings(storage(), typeof window === 'undefined' ? '' : window.location.search),
  toggleCourseRings: () => {
    const courseRings = get().courseRings === 'next3' ? 'all' : 'next3'
    saveCourseSettings(storage(), { courseRings })
    set({ courseRings })
  },
}))
