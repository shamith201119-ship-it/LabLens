import { useEffect, useRef, type RefObject } from 'react'

/**
 * Shared dialog plumbing for the verification overlays.
 *
 * Owns: initial focus, focus containment, Escape-to-close, body scroll lock
 * and focus restoration to the control that opened the dialog. Dialogs are
 * mounted while open and unmounted to close, so this runs exactly once per
 * opening.
 */
export function useDialogBehavior<T extends HTMLElement>(
  containerRef: RefObject<T | null>,
  onClose: () => void,
  restoreSelector?: string,
): void {
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  const restoreSelectorRef = useRef(restoreSelector)
  useEffect(() => {
    restoreSelectorRef.current = restoreSelector
  }, [restoreSelector])

  useEffect(() => {
    const container = containerRef.current
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    if (!container?.contains(document.activeElement)) {
      container?.focus({ preventScroll: true })
    }

    const getFocusable = () => {
      if (!container) return [] as HTMLElement[]
      return Array.from(
        container.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getClientRects().length > 0)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !container) return
      const focusable = getFocusable()
      if (focusable.length === 0) {
        event.preventDefault()
        container.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey) {
        if (document.activeElement === first || document.activeElement === container) {
          event.preventDefault()
          last.focus()
        }
      } else if (document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousBodyOverflow
      window.setTimeout(() => {
        if (previouslyFocused && previouslyFocused !== document.body && previouslyFocused.isConnected) {
          previouslyFocused.focus({ preventScroll: true })
          return
        }
        const selector = restoreSelectorRef.current
        if (selector) {
          document.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true })
        }
      }, 0)
    }
    // Mount-only by design: see the doc comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
