/**
 * Path Utilities
 * Handles file path operations
 */

export function getFilename(path: string): string {
  if (!path) return ''
  const normalized = path.replace(/\\/g, '/')
  const lastSlash = normalized.lastIndexOf('/')
  return lastSlash === -1 ? path : normalized.substring(lastSlash + 1)
}

export function getDirectory(path: string): string {
  if (!path) return ''
  const normalized = path.replace(/\\/g, '/')
  const lastSlash = normalized.lastIndexOf('/')
  return lastSlash === -1 ? '' : normalized.substring(0, lastSlash)
}

export function getFilenameTruncated(path: string, maxLength: number = 20): string {
  const filename = getFilename(path)
  if (filename.length <= maxLength) return filename
  
  const dotIndex = filename.lastIndexOf('.')
  if (dotIndex === -1) {
    return filename.substring(0, maxLength - 3) + '...'
  }
  
  const extension = filename.substring(dotIndex)
  const name = filename.substring(0, dotIndex)
  const availableLength = maxLength - extension.length - 3
  
  if (availableLength <= 0) {
    return filename.substring(0, maxLength - 3) + '...'
  }
  
  return name.substring(0, availableLength) + '...' + extension
}

export function joinPath(...parts: string[]): string {
  return parts
    .map(part => part.replace(/\\/g, '/'))
    .map(part => part.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/')
}

export function getExtension(path: string): string {
  const filename = getFilename(path)
  const dotIndex = filename.lastIndexOf('.')
  return dotIndex === -1 ? '' : filename.substring(dotIndex + 1)
}