import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { EASE } from '../lib/motion'

interface RevealProps {
  children: ReactNode
  className?: string
  delay?: number
  y?: number
}

/**
 * A small, purposeful section reveal. Only opacity and a short vertical
 * translation are animated, and MotionConfig reduces the latter when the user
 * asks for less motion.
 */
export function Reveal({ children, className, delay = 0, y = 18 }: RevealProps) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-72px' }}
      transition={{ duration: 0.54, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

interface MotionPageProps {
  children: ReactNode
  className?: string
}

export function MotionPage({ children, className }: MotionPageProps) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 7 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}
