import { createContext, useContext } from 'react'

export type MotionPreference = 'system' | 'reduced'

export interface MotionPreferenceContextValue {
  preference: MotionPreference
  setPreference: (preference: MotionPreference) => void
}

export const STORAGE_KEY = 'lablens.motion-preference'

export const MotionPreferenceContext =
  createContext<MotionPreferenceContextValue | null>(null)

export function useMotionPreference(): MotionPreferenceContextValue {
  const context = useContext(MotionPreferenceContext)
  if (!context) {
    throw new Error(
      'useMotionPreference must be used inside MotionPreferenceProvider',
    )
  }
  return context
}
