/**
 * Binary Utility
 * Handles binary data operations and binary search
 */

export class Binary {
  constructor(private data: ArrayBuffer | Uint8Array) {}

  /**
   * Performs binary search on a sorted array
   * @param array - Sorted array to search
   * @param target - Value to search for
   * @param getter - Function to extract comparable value from array item
   * @returns Object with found boolean and index
   */
  static search<T>(
    array: T[],
    target: string,
    getter: (item: T) => string
  ): { found: boolean; index: number } {
    let left = 0
    let right = array.length - 1

    while (left <= right) {
      const mid = Math.floor((left + right) / 2)
      const midValue = getter(array[mid])

      if (midValue === target) {
        return { found: true, index: mid }
      } else if (midValue < target) {
        left = mid + 1
      } else {
        right = mid - 1
      }
    }

    // Return insertion point when not found
    return { found: false, index: left }
  }

  static fromArrayBuffer(buffer: ArrayBuffer): Binary {
    return new Binary(buffer)
  }

  static fromUint8Array(array: Uint8Array): Binary {
    return new Binary(array)
  }

  static fromString(str: string): Binary {
    const encoder = new TextEncoder()
    return new Binary(encoder.encode(str))
  }

  toArrayBuffer(): ArrayBuffer {
    if (this.data instanceof ArrayBuffer) {
      return this.data
    }
    return this.data.buffer.slice(this.data.byteOffset, this.data.byteOffset + this.data.byteLength)
  }

  toUint8Array(): Uint8Array {
    if (this.data instanceof Uint8Array) {
      return this.data
    }
    return new Uint8Array(this.data)
  }

  toString(): string {
    const decoder = new TextDecoder()
    return decoder.decode(this.toUint8Array())
  }

  get size(): number {
    return this.data instanceof ArrayBuffer ? this.data.byteLength : this.data.length
  }
}