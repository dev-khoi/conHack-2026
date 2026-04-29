import React from 'react'
import { pickRecordingMimeType } from '@/features/voice/voice-recorder'
import {
  VoiceRecorderContext,
  type VoiceRecorderContextValue,
} from '@/features/voice/voice-recorder-context'


type RecorderStatus = 'idle' | 'recording' | 'uploading'

export function VoiceRecorderProvider({ children }: { children: React.ReactNode }) {
  const backendBaseUrl = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000'

  const [isRecording, setIsRecording] = React.useState(false)
  const [status, setStatus] = React.useState<RecorderStatus>('idle')
  const [error, setError] = React.useState<string | null>(null)
  const [transcript, setTranscript] = React.useState('')
  const [transcriptSeq, setTranscriptSeq] = React.useState(0)

  const recorderRef = React.useRef<MediaRecorder | null>(null)
  const chunksRef = React.useRef<BlobPart[]>([])
  const streamRef = React.useRef<MediaStream | null>(null)
  const stopTimerRef = React.useRef<number | null>(null)
  const isRecordingRef = React.useRef(false)

  const clearResources = React.useCallback(() => {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current)
      stopTimerRef.current = null
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop()
      streamRef.current = null
    }
    recorderRef.current = null
    chunksRef.current = []
  }, [])

  const uploadAudioBlob = React.useCallback(
    async (blob: Blob, filename: string) => {
      setStatus('uploading')
      setError(null)

      try {
        const form = new FormData()
        form.append('file', blob, filename)

        const res = await fetch(`${backendBaseUrl}/asr/transcribe`, {
          method: 'POST',
          body: form,
        })

        const payload = (await res.json()) as { text?: string; detail?: string }
        if (!res.ok) throw new Error(payload.detail || `HTTP ${res.status}`)

        const text = (payload.text || '').trim()
        setTranscript(text)
        setTranscriptSeq((n) => n + 1)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setStatus('idle')
      }
    },
    [backendBaseUrl],
  )

  const stop = React.useCallback(async () => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      clearResources()
      isRecordingRef.current = false
      setIsRecording(false)
      setStatus('idle')
      return
    }

    await new Promise<void>((resolve) => {
      recorder.addEventListener(
        'stop',
        () => {
          resolve()
        },
        { once: true },
      )
      recorder.stop()
    })

    isRecordingRef.current = false
    setIsRecording(false)

    const blobType = (recorder as unknown as { __blobType?: string }).__blobType || 'audio/webm'
    const audioBlob = new Blob(chunksRef.current, { type: blobType })
    clearResources()

    if (audioBlob.size < 1024) {
      setError('No audio captured. Hold the key a bit longer, then try again.')
      return
    }

    const filename = blobType.includes('wav') ? 'voice.wav' : 'voice.webm'
    await uploadAudioBlob(audioBlob, filename)
  }, [clearResources, uploadAudioBlob])

  const start = React.useCallback(async () => {
    if (isRecordingRef.current) return
    if (status === 'uploading') return

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Audio recording is not supported in this environment.')
      return
    }

    setError(null)
    setTranscript('')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const { mediaRecorderMimeType, blobType } = pickRecordingMimeType()
      const options = mediaRecorderMimeType ? { mimeType: mediaRecorderMimeType } : undefined
      const recorder = new MediaRecorder(stream, options)
      recorderRef.current = recorder
      chunksRef.current = []

      recorder.addEventListener('dataavailable', (event: BlobEvent) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data)
      })

      recorder.start(250)
      isRecordingRef.current = true
      setIsRecording(true)
      setStatus('recording')

      stopTimerRef.current = window.setTimeout(() => {
        void stop()
      }, 60_000)

      // Remember the blob type for filename/type.
      ;(recorder as unknown as { __blobType?: string }).__blobType = blobType
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('idle')
      isRecordingRef.current = false
      setIsRecording(false)
      clearResources()
    }
  }, [clearResources, status, stop])

  const toggle = React.useCallback(async () => {
    if (isRecordingRef.current) {
      await stop()
      return
    }
    await start()
  }, [start, stop])

  React.useEffect(() => {
    return () => {
      clearResources()
    }
  }, [clearResources])

  const clearError = React.useCallback(() => setError(null), [])
  const clearTranscript = React.useCallback(() => setTranscript(''), [])

  const value: VoiceRecorderContextValue = {
    isRecording,
    status,
    error,
    transcript,
    transcriptSeq,
    start,
    stop,
    toggle,
    clearError,
    clearTranscript,
  }

  return <VoiceRecorderContext.Provider value={value}>{children}</VoiceRecorderContext.Provider>
}
