import { FileText, Image as ImageIcon, X } from 'lucide-react'
import { formatFileSize, getFileKind } from '../lib/files'
import { IconButton } from './Button'

interface FilePreviewProps {
  file: File
  onRemove: () => void
}

export function FilePreview({ file, onRemove }: FilePreviewProps) {
  const kind = getFileKind(file)
  const isPdf = kind === 'pdf'
  const Icon = isPdf ? FileText : ImageIcon
  const kindLabel = isPdf ? 'PDF document' : 'Image report'

  return (
    <div className="file-preview">
      <div className="file-preview__icon" aria-hidden="true">
        <Icon size={21} strokeWidth={1.7} />
      </div>
      <div className="file-preview__meta">
        <p className="file-preview__name" title={file.name}>
          {file.name}
        </p>
        <div className="file-preview__sub">
          <span>{formatFileSize(file.size)}</span>
          <span>{kindLabel}</span>
        </div>
      </div>
      <div className="file-preview__actions">
        <span className="file-preview__badge">Not uploaded</span>
        <IconButton
          label={`Remove ${file.name}`}
          tooltip="Remove file"
          size="sm"
          onClick={onRemove}
        >
          <X size={14} aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  )
}
