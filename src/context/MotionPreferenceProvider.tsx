import { useCallback, useEffect, useMemo, useState } from 'react'
import { MotionConfig } from 'motion/react'
import {
  MotionPreferenceContext,
  STORAGE_KEY,
  type MotionPreference,
} from './preferences'

function readStoredPreference(): MotionPreference {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'reduced'
      ? 'reduced'
      : 'system'
  } catch {
    return 'system'
  }
}

export function MotionPreferenceProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [preference, setPreferenceState] =
    useState<MotionPreference>(readStoredPreference)

  useEffect(() => {
    if (preference === 'reduced') {
      document.documentElement.dataset.motion = 'reduced'
    } else {
      delete document.documentElement.dataset.motion
    }

    try {
      if (preference === 'system') {
        window.localStorage.removeItem(STORAGE_KEY)
      } else {
        window.localStorage.setItem(STORAGE_KEY, preference)
      }
    } catch {
      // Preference persistence is optional; the interface still works.
    }
  }, [preference])

  const setPreference = useCallback((next: MotionPreference) => {
    setPreferenceState(next)
  }, [])

  const value = useMemo(
    () => ({ preference, setPreference }),
    [preference, setPreference],
  )

  return (
    <MotionPreferenceContext.Provider value={value}>
      <MotionConfig
        reducedMotion={preference === 'reduced' ? 'always' : 'user'}
      >
        {children}
      </MotionConfig>
    </MotionPreferenceContext.Provider>
  )
}
