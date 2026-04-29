import React from 'react'

export type RecorderStatus = 'idle' | 'recording' | 'uploading'

export type VoiceRecorderContextValue = {
  isRecording: boolean
  status: RecorderStatus
  error: string | null
  transcript: string
  transcriptSeq: number
  start: () => Promise<void>
  stop: () => Promise<void>
  toggle: () => Promise<void>
  clearError: () => void
  clearTranscript: () => void
}

export const VoiceRecorderContext = React.createContext<VoiceRecorderContextValue | null>(null)
