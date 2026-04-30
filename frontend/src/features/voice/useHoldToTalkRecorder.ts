import React from 'react'

import { pickRecordingMimeType } from '@/features/voice/voice-recorder'

type AsrStatus = 'idle' | 'recording' | 'uploading'

type UseHoldToTalkRecorderArgs = {
  backendBaseUrl: string
  onTranscription: (text: string) => void
}

type UseHoldToTalkRecorderResult = {
  isRecording: boolean
  asrError: string | null
  asrStatus: AsrStatus
}

export function useHoldToTalkRecorder({
  backendBaseUrl,
  onTranscription,
}: UseHoldToTalkRecorderArgs): UseHoldToTalkRecorderResult {
  const [isRecording, setIsRecording] = React.useState(false)
  const [asrError, setAsrError] = React.useState<string | null>(null)
  const [asrStatus, setAsrStatus] = React.useState<AsrStatus>('idle')

  const recorderRef = React.useRef<MediaRecorder | null>(null)
  const chunksRef = React.useRef<BlobPart[]>([])
  const streamRef = React.useRef<MediaStream | null>(null)
  const stopTimerRef = React.useRef<number | null>(null)
  const holdToTalkActiveRef = React.useRef(false)
  const blobTypeRef = React.useRef('audio/webm')

  const clearRecorderResources = React.useCallback(() => {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current)
      stopTimerRef.current = null
    }

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop()
      }
      streamRef.current = null
    }

    recorderRef.current = null
    chunksRef.current = []
  }, [])

  const uploadAudioBlob = React.useCallback(
    async (blob: Blob, filename: string) => {
      setAsrStatus('uploading')
      setAsrError(null)

      try {
        const form = new FormData()
        form.append('file', blob, filename)

        const res = await fetch(`${backendBaseUrl}/asr/transcribe`, {
          method: 'POST',
          body: form,
        })

        const payload = (await res.json()) as {
          text?: string
          detail?: string
        }
        if (!res.ok) {
          throw new Error(payload.detail || `HTTP ${res.status}`)
        }

        const text = (payload.text || '').trim()
        if (text) {
          onTranscription(text)
        }
      } catch (error: unknown) {
        setAsrError(error instanceof Error ? error.message : String(error))
      } finally {
        setAsrStatus('idle')
      }
    },
    [backendBaseUrl, onTranscription],
  )

  const stopRecording = React.useCallback(async () => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      clearRecorderResources()
      setIsRecording(false)
      setAsrStatus('idle')
      return
    }

    await new Promise<void>((resolve) => {
      recorder.addEventListener('stop', () => resolve(), { once: true })
      recorder.stop()
    })

    setIsRecording(false)
    const audioBlob = new Blob(chunksRef.current, {
      type: blobTypeRef.current,
    })
    clearRecorderResources()

    if (audioBlob.size < 1024) {
      setAsrError('No audio captured. Hold the key a bit longer, then try again.')
      return
    }

    const filename = blobTypeRef.current.includes('wav') ? 'voice.wav' : 'voice.webm'
    await uploadAudioBlob(audioBlob, filename)
  }, [clearRecorderResources, uploadAudioBlob])

  const startRecording = React.useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setAsrError('Audio recording is not supported in this environment.')
      return
    }
    if (isRecording || asrStatus === 'uploading') return

    try {
      setAsrError(null)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const { mediaRecorderMimeType, blobType } = pickRecordingMimeType()
      const recorder = new MediaRecorder(
        stream,
        mediaRecorderMimeType ? { mimeType: mediaRecorderMimeType } : undefined,
      )
      recorderRef.current = recorder
      blobTypeRef.current = blobType
      chunksRef.current = []

      recorder.addEventListener('dataavailable', (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      })

      recorder.start(250)
      setIsRecording(true)
      setAsrStatus('recording')

      stopTimerRef.current = window.setTimeout(() => {
        void stopRecording()
      }, 60_000)
    } catch (error: unknown) {
      setAsrError(error instanceof Error ? error.message : String(error))
      setAsrStatus('idle')
      clearRecorderResources()
    }
  }, [asrStatus, clearRecorderResources, isRecording, stopRecording])

  React.useEffect(() => {
    return () => {
      clearRecorderResources()
    }
  }, [clearRecorderResources])

  React.useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      if (!(event.shiftKey && event.code === 'Space')) return
      if (isTypingTarget(event.target)) return
      if (holdToTalkActiveRef.current) return

      event.preventDefault()
      holdToTalkActiveRef.current = true
      void startRecording()
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      if (!holdToTalkActiveRef.current) return

      event.preventDefault()
      holdToTalkActiveRef.current = false
      void stopRecording()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [startRecording, stopRecording])

  return { isRecording, asrError, asrStatus }
}
