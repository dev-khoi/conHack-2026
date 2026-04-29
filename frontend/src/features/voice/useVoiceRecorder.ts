import React from 'react'

import { VoiceRecorderContext } from '@/features/voice/voice-recorder-context'

export function useVoiceRecorder() {
  const ctx = React.useContext(VoiceRecorderContext)
  if (!ctx) throw new Error('useVoiceRecorder must be used within VoiceRecorderProvider')
  return ctx
}
