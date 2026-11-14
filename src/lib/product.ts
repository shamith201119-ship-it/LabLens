/**
 * Product-phase flags.
 *
 * Phase 1 is a frontend foundation only. These flags keep the UI honest about
 * what is connected and give Phase 2 a single place to enable backend-backed
 * behaviour without redesigning screens.
 */
export const PRODUCT_PHASE = 2

/** Secure document upload, extraction and AI analysis are not built yet. */
export const PROCESSING_AVAILABLE = false

/** Report storage is connected to the local backend. */
export const REPORT_STORAGE_AVAILABLE = true

export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024
export const MAX_FILE_SIZE_LABEL = '20 MB'

export const ACCEPTED_FILE_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png'] as const
export const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
] as const

export const FILE_INPUT_ACCEPT =
  '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png'
