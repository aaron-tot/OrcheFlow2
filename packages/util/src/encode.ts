/**
 * Encoding Utilities
 * Handles base64 encoding and checksum operations
 */

export function base64Encode(data: string | ArrayBuffer | Uint8Array): string {
  if (typeof data === 'string') {
    return btoa(data)
  }
  
  const uint8Array = data instanceof ArrayBuffer 
    ? new Uint8Array(data) 
    : data
    
  let binary = ''
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i])
  }
  return btoa(binary)
}

export function base64Decode(encoded: string): string {
  return atob(encoded)
}

export async function checksum(data: string | ArrayBuffer | Uint8Array): Promise<string> {
  const encoder = new TextEncoder()
  const dataBytes = typeof data === 'string' 
    ? encoder.encode(data)
    : data instanceof ArrayBuffer 
      ? new Uint8Array(data)
      : data

  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBytes)
  const hashArray = new Uint8Array(hashBuffer)
  const hashHex = Array.from(hashArray)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  
  return hashHex
}

export function hexEncode(data: Uint8Array): string {
  return Array.from(data)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export function hexDecode(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  return bytes
}