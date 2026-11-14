import {
  ACCEPTED_FILE_EXTENSIONS,
  ACCEPTED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_LABEL,
} from './product'

export type FileKind = 'pdf' | 'image' | 'unknown'

export function getFileExtension(fileName: string): string {
  const parts = fileName.toLowerCase().split('.')
  return parts.length > 1 ? parts[parts.length - 1] : ''
}

export function getFileKind(file: File): FileKind {
  const extension = getFileExtension(file.name)
  if (extension === 'pdf' || file.type === 'application/pdf') return 'pdf'
  if (
    ['jpg', 'jpeg', 'png'].includes(extension) ||
    ['image/jpeg', 'image/jpg', 'image/png'].includes(file.type)
  ) {
    return 'image'
  }
  return 'unknown'
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function validateFile(file: File): string | null {
  const extension = getFileExtension(file.name)
  const mimeType = file.type.toLowerCase()
  const extensionAllowed = ACCEPTED_FILE_EXTENSIONS.includes(
    extension as (typeof ACCEPTED_FILE_EXTENSIONS)[number],
  )
  const mimeAllowed =
    !mimeType ||
    mimeType === 'application/octet-stream' ||
    ACCEPTED_MIME_TYPES.includes(
      mimeType as (typeof ACCEPTED_MIME_TYPES)[number],
    )

  if (!file.size) {
    return 'That file appears to be empty. Choose a different document.'
  }

  if (!extensionAllowed || !mimeAllowed) {
    return `“${file.name}” is not a supported format. Choose a PDF, JPG, JPEG or PNG.`
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `“${file.name}” is ${formatFileSize(file.size)}. The maximum file size is ${MAX_FILE_SIZE_LABEL}.`
  }

  return null
}

export function validateFileSelection(files: File[]): string | null {
  if (files.length === 0) {
    return 'No file was selected. Try again or choose a different document.'
  }

  if (files.length > 1) {
    return 'Please select one report at a time.'
  }

  return validateFile(files[0])
}
