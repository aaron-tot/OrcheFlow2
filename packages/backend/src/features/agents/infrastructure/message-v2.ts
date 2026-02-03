/**
 * MessageV2
 * Purpose: Main message orchestration and public API
 */
import { BusEvent } from "../../../core/bus/bus-event"
import z from "zod"
import { MessageValidator } from "./message-validator"
import { MessageBuilder } from "./message-builder"
import { MessageParser } from "./message-parser"

export namespace MessageV2 {
  // Re-export all types from MessageValidator
  export import OutputLengthError = MessageValidator.OutputLengthError
  export import AbortedError = MessageValidator.AbortedError
  export import AuthError = MessageValidator.AuthError
  export import APIError = MessageValidator.APIError
  export type APIError = MessageValidator.APIError

  export import SnapshotPart = MessageValidator.SnapshotPart
  export type SnapshotPart = MessageValidator.SnapshotPart

  export import PatchPart = MessageValidator.PatchPart
  export type PatchPart = MessageValidator.PatchPart

  export import TextPart = MessageValidator.TextPart
  export type TextPart = MessageValidator.TextPart

  export import ReasoningPart = MessageValidator.ReasoningPart
  export type ReasoningPart = MessageValidator.ReasoningPart

  export import FileSource = MessageValidator.FileSource
  export import SymbolSource = MessageValidator.SymbolSource
  export import ResourceSource = MessageValidator.ResourceSource
  export import FilePartSource = MessageValidator.FilePartSource

  export import FilePart = MessageValidator.FilePart
  export type FilePart = MessageValidator.FilePart

  export import AgentPart = MessageValidator.AgentPart
  export type AgentPart = MessageValidator.AgentPart

  export import CompactionPart = MessageValidator.CompactionPart
  export type CompactionPart = MessageValidator.CompactionPart

  export import SubtaskPart = MessageValidator.SubtaskPart
  export type SubtaskPart = MessageValidator.SubtaskPart

  export import RetryPart = MessageValidator.RetryPart
  export type RetryPart = MessageValidator.RetryPart

  export import StepStartPart = MessageValidator.StepStartPart
  export type StepStartPart = MessageValidator.StepStartPart

  export import StepFinishPart = MessageValidator.StepFinishPart
  export type StepFinishPart = MessageValidator.StepFinishPart

  export import ToolStatePending = MessageValidator.ToolStatePending
  export type ToolStatePending = MessageValidator.ToolStatePending

  export import ToolStateRunning = MessageValidator.ToolStateRunning
  export type ToolStateRunning = MessageValidator.ToolStateRunning

  export import ToolStateCompleted = MessageValidator.ToolStateCompleted
  export type ToolStateCompleted = MessageValidator.ToolStateCompleted

  export import ToolStateError = MessageValidator.ToolStateError
  export type ToolStateError = MessageValidator.ToolStateError

  export import ToolState = MessageValidator.ToolState

  export import ToolPart = MessageValidator.ToolPart
  export type ToolPart = MessageValidator.ToolPart

  export import User = MessageValidator.User
  export type User = MessageValidator.User

  export import Part = MessageValidator.Part
  export type Part = MessageValidator.Part

  export import Assistant = MessageValidator.Assistant
  export type Assistant = MessageValidator.Assistant

  export import Info = MessageValidator.Info
  export type Info = MessageValidator.Info

  export import WithParts = MessageValidator.WithParts
  export type WithParts = MessageValidator.WithParts

  // Bus Events
  export const Event = {
    Updated: BusEvent.define(
      "message.updated",
      z.object({
        info: MessageValidator.Info,
      }),
    ),
    Removed: BusEvent.define(
      "message.removed",
      z.object({
        sessionID: z.string(),
        messageID: z.string(),
      }),
    ),
    PartUpdated: BusEvent.define(
      "message.part.updated",
      z.object({
        part: MessageValidator.Part,
        delta: z.string().optional(),
      }),
    ),
    PartRemoved: BusEvent.define(
      "message.part.removed",
      z.object({
        sessionID: z.string(),
        messageID: z.string(),
        partID: z.string(),
      }),
    ),
  }

  // Re-export functions from MessageBuilder
  export const toModelMessages = MessageBuilder.toModelMessages
  export const filterCompacted = MessageBuilder.filterCompacted

  // Re-export functions from MessageParser
  export const stream = MessageParser.stream
  export const parts = MessageParser.parts
  export const get = MessageParser.get
  export const fromError = MessageParser.fromError
}
