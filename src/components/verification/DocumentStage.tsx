import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'

export interface RenderedImageSize {
  pageNumber: number
  width: number
  height: number
}

interface DocumentStageProps {
  imageSrc: string | null
  alt: string
  highlightStyle: CSSProperties | null
  onImageLoad: (size: RenderedImageSize) => void
  activePage: number
  children?: ReactNode
}

const ZOOM_MIN = 0.5 // 50% of fit scale
const ZOOM_MAX = 3 // 300% of fit scale
const ZOOM_STEP = 1.25

/**
 * Interactive document stage.
 * Owns zoom, pan and fit-to-page geometry for rendered pages and photographs,
 * keeping the source frame and its highlight overlay perfectly aligned.
 */
export function DocumentStage({
  imageSrc,
  alt,
  highlightStyle,
  onImageLoad,
  activePage,
  children,
}: DocumentStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const [naturalSize, setNaturalSize] = useState<RenderedImageSize | null>(null)
  const [fit, setFit] = useState(1)
  const [zoomFactor, setZoomFactor] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragOrigin = useRef({ x: 0, y: 0 })
  const panOrigin = useRef({ x: 0, y: 0 })

  const reportImageLoad = useCallback(
    (size: RenderedImageSize) => {
      setNaturalSize(size)
      setZoomFactor(1)
      setPan({ x: 0, y: 0 })
      if (
        containerSize.width > 0 &&
        containerSize.height > 0 &&
        size.width > 0 &&
        size.height > 0
      ) {
        const nextFit = Math.min(
          (containerSize.width - 28) / size.width,
          (containerSize.height - 28) / size.height,
          1,
        )
        setFit(Math.abs(nextFit - 1) > 0.0001 ? nextFit : 1)
      }
      onImageLoad({ ...size, pageNumber: activePage })
    },
    [onImageLoad, activePage, containerSize.width, containerSize.height],
  )

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect) {
        setContainerSize({ width: rect.width, height: rect.height })
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  if (
    containerSize.width > 0 &&
    containerSize.height > 0 &&
    naturalSize &&
    naturalSize.width > 0 &&
    naturalSize.height > 0
  ) {
    const nextFit = Math.min(
      (containerSize.width - 28) / naturalSize.width,
      (containerSize.height - 28) / naturalSize.height,
      1,
    )
    if (Math.abs(fit - nextFit) > 0.0001) {
      setFit(nextFit)
    }
  }

  const zoom = fit * zoomFactor
  const frameWidth = naturalSize ? naturalSize.width * zoom : 0
  const frameHeight = naturalSize ? naturalSize.height * zoom : 0

  const clampPan = useCallback(
    (next: { x: number; y: number }, nextZoom: number) => {
      if (!naturalSize) return { x: 0, y: 0 }
      const frameW = naturalSize.width * (fit * nextZoom)
      const frameH = naturalSize.height * (fit * nextZoom)
      const maxX = Math.max(0, (frameW - containerSize.width) / 2) + 24
      const maxY = Math.max(0, (frameH - containerSize.height) / 2) + 24
      return {
        x: Math.min(maxX, Math.max(-maxX, next.x)),
        y: Math.min(maxY, Math.max(-maxY, next.y)),
      }
    },
    [containerSize.width, containerSize.height, naturalSize, fit],
  )

  const applyZoom = useCallback(
    (factor: number) => {
      setZoomFactor((current) => {
        const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, current * factor))
        setPan((panNow) => clampPan(panNow, next))
        return next
      })
    },
    [clampPan],
  )

  const resetView = useCallback(() => {
    setZoomFactor(1)
    setPan({ x: 0, y: 0 })
  }, [])

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      applyZoom(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [applyZoom])

  const [lastImageSrc, setLastImageSrc] = useState(imageSrc)
  if (lastImageSrc !== imageSrc) {
    setLastImageSrc(imageSrc)
    setZoomFactor(1)
    setPan({ x: 0, y: 0 })
  }

  const zoomLabel = naturalSize ? `${Math.round(zoom * 100)}%` : '—'
  const canPan = frameWidth > containerSize.width + 2 || frameHeight > containerSize.height + 2

  return (
    <div className="ve-stage">
      <div
        ref={containerRef}
        className={`ve-stage__viewport${dragging ? ' is-dragging' : ''}`}
        onPointerDown={(event) => {
          if (!canPan) return
          setDragging(true)
          dragOrigin.current = { x: event.clientX, y: event.clientY }
          panOrigin.current = { ...pan }
          ;(event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          if (!dragging) return
          const dx = event.clientX - dragOrigin.current.x
          const dy = event.clientY - dragOrigin.current.y
          setPan(clampPan({ x: panOrigin.current.x + dx, y: panOrigin.current.y + dy }, zoomFactor))
        }}
        onPointerUp={(event) => {
          setDragging(false)
          ;(event.currentTarget as HTMLDivElement).releasePointerCapture(event.pointerId)
        }}
        onDoubleClick={resetView}
        role="application"
        aria-label="Zoomable document preview. Use Control and scroll to zoom."
      >
        {imageSrc ? (
          <div
            className="ve-stage__frame"
            style={{
              width: frameWidth || undefined,
              height: frameHeight || undefined,
              transform: `translate(${pan.x}px, ${pan.y}px)`,
            }}
          >
            <img
              src={imageSrc}
              alt={alt}
              className="ve-stage__image"
              draggable={false}
              onLoad={(event) => {
                const { naturalWidth, naturalHeight } = event.currentTarget
                if (naturalWidth > 0 && naturalHeight > 0) {
                  reportImageLoad({ pageNumber: activePage, width: naturalWidth, height: naturalHeight })
                }
              }}
            />
            {highlightStyle ? (
              <div
                className="ve-stage__highlight"
                data-testid="measurement-highlight"
                style={highlightStyle}
                aria-hidden="true"
              />
            ) : null}
            {children}
          </div>
        ) : (
          <p className="ve-stage__missing">No renderable page for this source.</p>
        )}
      </div>

      <div className="ve-stage__toolbar">
        <button
          type="button"
          className="ve-icon-btn ve-icon-btn--small"
          onClick={() => applyZoom(1 / ZOOM_STEP)}
          aria-label="Zoom out"
          disabled={zoomFactor <= ZOOM_MIN + 0.001}
        >
          <ZoomOut size={14} aria-hidden="true" />
        </button>
        <span className="ve-stage__zoom">{zoomLabel}</span>
        <button
          type="button"
          className="ve-icon-btn ve-icon-btn--small"
          onClick={() => applyZoom(ZOOM_STEP)}
          aria-label="Zoom in"
          disabled={zoomFactor >= ZOOM_MAX - 0.001}
        >
          <ZoomIn size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="ve-icon-btn ve-icon-btn--small"
          onClick={resetView}
          aria-label="Reset zoom to fit page"
          title="Fit page"
        >
          <RotateCcw size={13} aria-hidden="true" />
        </button>
        {naturalSize ? (
          <span className="ve-stage__natural">
            {naturalSize.width}×{naturalSize.height}px
          </span>
        ) : null}
      </div>
    </div>
  )
}
