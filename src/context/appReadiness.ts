import { createContext, useContext } from 'react'

/**
 * Shared "app shell is usable" signal. Flips true once critical fonts have
 * settled (capped) and a minimum branded beat has elapsed. The loader lives in
 * main.tsx and unmounts when this flips; introduction animations must gate on
 * this rather than on mount-time timers.
 */
export const AppReadinessContext = createContext(false)

export function useAppReady(): boolean {
  return useContext(AppReadinessContext)
}
