import {
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CircleAlert, CloudUpload } from 'lucide-react'
import { FILE_INPUT_ACCEPT, MAX_FILE_SIZE_LABEL } from '../lib/product'
import { cx } from '../lib/cx'

interface FileDropzoneProps {
  onFilesSelected: (files: File[]) => void
  error?: string | null
}

export function FileDropzone({
  onFilesSelected,
  error,
}: FileDropzoneProps) {
  const inputId = useId()
  const helpId = useId()
  const errorId = useId()
  const [isDragging, setIsDragging] = useState(false)
  const dragDepth = useRef(0)

  const resetDragState = () => {
    dragDepth.current = 0
    setIsDragging(false)
  }

  const handleDragEnter = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    dragDepth.current += 1
    if (event.dataTransfer.types.includes('Files')) {
      setIsDragging(true)
    }
  }

  const handleDragOver = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const handleDragLeave = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) {
      setIsDragging(false)
    }
  }

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    resetDragState()
    const files = Array.from(event.dataTransfer.files)
    onFilesSelected(files)
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    onFilesSelected(files)
    // Allow the same file to be picked again after a validation error.
    event.target.value = ''
  }

  return (
    <div className="dropzone-wrap">
      <label
        htmlFor={inputId}
        className={cx(
          'dropzone',
          isDragging && 'is-dragging',
          error && !isDragging && 'is-invalid',
        )}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          id={inputId}
          type="file"
          accept={FILE_INPUT_ACCEPT}
          className="dropzone__input"
          onChange={handleChange}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : helpId}
        />
        <span className="dropzone__icon" aria-hidden="true">
          <CloudUpload size={24} strokeWidth={1.8} />
        </span>
        <span className="dropzone__title">
          {isDragging ? 'Drop your report here' : 'Add a lab report'}
        </span>
        <span className="dropzone__sub">
          Drag and drop a file, or{' '}
          <span className="dropzone__browse">browse files</span>
        </span>
        <span className="dropzone__types" aria-hidden="true">
          <span className="dropzone__type">PDF</span>
          <span className="dropzone__type">JPG</span>
          <span className="dropzone__type">JPEG</span>
          <span className="dropzone__type">PNG</span>
        </span>
        <span className="dropzone__max">
          One file at a time · maximum {MAX_FILE_SIZE_LABEL}
        </span>
        <span id={helpId} className="sr-only">
          Accepted formats: PDF, JPG, JPEG and PNG. Maximum file size{' '}
          {MAX_FILE_SIZE_LABEL}. Select one file at a time.
        </span>
      </label>

      <AnimatePresence initial={false}>
        {error ? (
          <motion.div
            key="file-error"
            id={errorId}
            className="inline-alert"
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.2 }}
          >
            <CircleAlert size={14} strokeWidth={2} aria-hidden="true" />
            <span>{error}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
