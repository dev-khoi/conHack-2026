import React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

export function MainWindow() {
  const [health, setHealth] = React.useState<string>('loading')
  const [error, setError] = React.useState<string | null>(null)
  const [isRecording, setIsRecording] = React.useState(false)
  const [asrText, setAsrText] = React.useState('')
  const [asrError, setAsrError] = React.useState<string | null>(null)
  const [asrStatus, setAsrStatus] = React.useState<'idle' | 'recording' | 'uploading'>('idle')
  const recorderRef = React.useRef<MediaRecorder | null>(null)
  const chunksRef = React.useRef<BlobPart[]>([])
  const streamRef = React.useRef<MediaStream | null>(null)
  const stopTimerRef = React.useRef<number | null>(null)
  const holdToTalkActiveRef = React.useRef(false)
  const recordingMimeTypeRef = React.useRef<'audio/webm' | 'audio/wav'>('audio/webm')

  const backendBaseUrl = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000'

  React.useEffect(() => {
    fetch(`${backendBaseUrl}/health`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<{ status?: string }>
      })
      .then((json) => {
        setHealth(json.status ?? 'unknown')
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e))
        setHealth('error')
      })
  }, [backendBaseUrl])

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

        const payload = (await res.json()) as { text?: string; detail?: string }
        if (!res.ok) {
          throw new Error(payload.detail || `HTTP ${res.status}`)
        }

        setAsrText(payload.text || '')
      } catch (e: unknown) {
        setAsrError(e instanceof Error ? e.message : String(e))
      } finally {
        setAsrStatus('idle')
      }
    },
    [backendBaseUrl],
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
      recorder.addEventListener(
        'stop',
        () => {
          resolve()
        },
        { once: true },
      )
      recorder.stop()
    })

    setIsRecording(false)
    const mimeType = recordingMimeTypeRef.current
    const audioBlob = new Blob(chunksRef.current, { type: mimeType })
    clearRecorderResources()

    if (audioBlob.size > 0) {
      const filename = mimeType === 'audio/wav' ? 'voice.wav' : 'voice.webm'
      await uploadAudioBlob(audioBlob, filename)
    }
  }, [clearRecorderResources, uploadAudioBlob])

  const startRecording = React.useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setAsrError('Audio recording is not supported in this environment.')
      return
    }

    if (isRecording || asrStatus === 'uploading') return

    try {
      setAsrError(null)
      setAsrText('')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const supportedMimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/wav')
            ? 'audio/wav'
            : null

      if (!supportedMimeType) {
        throw new Error('No supported recording format found (need WebM or WAV).')
      }

      recordingMimeTypeRef.current = supportedMimeType.includes('wav') ? 'audio/wav' : 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType: supportedMimeType })
      recorderRef.current = recorder
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
    } catch (e: unknown) {
      setAsrError(e instanceof Error ? e.message : String(e))
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
      if (event.code !== 'Space') return
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

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-8 py-12">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h1 className="font-heading text-3xl font-semibold tracking-tight">AURA</h1>
              <Badge variant="secondary">desktop</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Main app window. Use <span className="font-medium text-foreground">Ctrl+Shift+Space</span> to toggle the overlay.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => window.overlay.toggle()}>
              Toggle overlay
            </Button>
          </div>
        </header>

        <Separator />

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Backend</CardTitle>
              <CardDescription>Health check status for the local API.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">/health</div>
                <Badge variant={health === 'ok' ? 'default' : 'outline'}>{health}</Badge>
              </div>
              {error ? <div className="text-sm text-destructive">{error}</div> : null}
              <div className="text-xs text-muted-foreground">
                Using VITE_BACKEND_URL={import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000'}
              </div>
            </CardContent>
            <CardFooter className="justify-end">
              <Button variant="secondary" onClick={() => window.location.reload()}>
                Refresh
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Overlay</CardTitle>
              <CardDescription>Always-on-top shell for quick actions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="text-sm font-medium">Shortcut</div>
                <div className="mt-1 text-sm text-muted-foreground">Ctrl+Shift+Space</div>
              </div>
              <div className="text-sm text-muted-foreground">
                Use the shortcut to show/hide the overlay while keeping this window open.
              </div>
            </CardContent>
            <CardFooter className="justify-end">
              <Button onClick={() => window.overlay.show()}>Show overlay</Button>
            </CardFooter>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>ASR Voice Command</CardTitle>
              <CardDescription>
                Siri-style push-to-talk: hold <span className="font-mono">Space</span> to record, release to transcribe via <span className="font-mono">POST /asr/transcribe</span>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={asrStatus === 'recording' ? 'default' : 'outline'}>{asrStatus}</Badge>
                <div className="text-xs text-muted-foreground">Max duration: 60 seconds</div>
              </div>

              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium">Hold Space to talk</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Works when you are not typing in an input field.
                    </div>
                  </div>
                  <div className="relative flex h-12 w-12 items-center justify-center">
                    <span
                      className={
                        'absolute h-12 w-12 rounded-full bg-primary/20 transition ' +
                        (asrStatus === 'recording' ? 'scale-110 animate-pulse' : 'scale-100')
                      }
                    />
                    <span className="relative h-6 w-6 rounded-full bg-primary" />
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={() => void startRecording()} disabled={isRecording || asrStatus === 'uploading'}>
                  Start recording
                </Button>
                <Button variant="outline" onClick={() => void stopRecording()} disabled={!isRecording}>
                  Stop and transcribe
                </Button>
              </div>

              {asrError ? <div className="text-sm text-destructive">{asrError}</div> : null}

              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="text-sm font-medium">Transcript</div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                  {asrText || 'No transcript yet. Record then transcribe.'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}
