import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  CircleAlert,
  CircleCheck,
  Info,
  X,
  type LucideIcon,
} from 'lucide-react'
import {
  ToastContext,
  type ToastInput,
  type ToastVariant,
} from './toast'

interface ToastItem extends Required<Omit<ToastInput, 'description'>> {
  id: number
  description?: string
}

const ICONS: Record<ToastVariant, LucideIcon> = {
  success: CircleCheck,
  info: Info,
  error: CircleAlert,
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)
  const timeoutsRef = useRef(new Map<number, number>())

  const dismiss = useCallback((id: number) => {
    const timeout = timeoutsRef.current.get(id)
    if (timeout) {
      window.clearTimeout(timeout)
      timeoutsRef.current.delete(id)
    }
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const toast = useCallback(
    (input: ToastInput) => {
      const id = idRef.current + 1
      idRef.current = id
      const item: ToastItem = {
        id,
        title: input.title,
        description: input.description,
        variant: input.variant ?? 'info',
      }

      setToasts((current) => [...current.slice(-2), item])

      const timeout = window.setTimeout(() => dismiss(id), 4200)
      timeoutsRef.current.set(id, timeout)
    },
    [dismiss],
  )

  useEffect(() => {
    const timeouts = timeoutsRef.current
    return () => {
      timeouts.forEach((timeout) => window.clearTimeout(timeout))
      timeouts.clear()
    }
  }, [])

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="toast-region"
        role="status"
        aria-live="polite"
        aria-atomic="false"
      >
        <AnimatePresence initial={false}>
          {toasts.map((item) => {
            const Icon = ICONS[item.variant]
            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 10, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.985 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                className={`toast toast--${item.variant}`}
              >
                <Icon
                  className="toast__icon"
                  size={17}
                  strokeWidth={1.9}
                  aria-hidden="true"
                />
                <div className="toast__body">
                  <p className="toast__title">{item.title}</p>
                  {item.description ? (
                    <p className="toast__description">{item.description}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="toast__close"
                  onClick={() => dismiss(item.id)}
                  aria-label="Dismiss notification"
                >
                  <X size={13} aria-hidden="true" />
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
