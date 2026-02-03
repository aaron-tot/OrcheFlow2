export const foo: string = "42"
export const bar: number = 123

export function dummyFunction(): void {
  console.log("This is a dummy function")
}

export function randomHelper(): boolean {
  return Math.random() > 0.5
}

// Simple NamedError implementation for backend compatibility
import z from 'zod'

export class NamedError extends Error {
  public readonly errorName: string
  public readonly details: any
  public static readonly Schema: any

  constructor(name: string, message: string, details?: any) {
    super(message)
    this.name = 'NamedError'
    this.errorName = name
    this.details = details
  }

  toObject() {
    return {
      name: this.errorName,
      data: this.details || {}
    }
  }

  static create(name: string, dataSchema?: z.ZodObject<any>) {
    // Create the full schema with name as literal discriminator
    const fullSchema = z.object({
      name: z.literal(name),
      data: dataSchema || z.object({})
    })
    
    const ErrorClass = class extends NamedError {
      static readonly Schema = fullSchema
      static readonly isInstance = (e: any): e is NamedError => e?.name === name
      
      constructor(details?: any, options?: { cause?: unknown }) {
        super(name, name, details)
        if (options?.cause) {
          this.cause = options.cause
        }
      }
    }
    
    return ErrorClass
  }

  // Common Unknown error type
  static Unknown = (() => {
    const name = "Unknown"
    const dataSchema = z.object({ message: z.string() })
    const fullSchema = z.object({
      name: z.literal(name),
      data: dataSchema
    })
    
    return class UnknownError extends NamedError {
      static readonly Schema = fullSchema
      static readonly isInstance = (e: any): e is NamedError => e?.name === name
      
      constructor(details?: { message: string }, options?: { cause?: unknown }) {
        super(name, details?.message || 'An unknown error occurred', details)
        if (options?.cause) {
          this.cause = options.cause
        }
      }
    }
  })()
}
