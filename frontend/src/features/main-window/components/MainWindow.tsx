import React from 'react'
import { Search, Sparkles } from 'lucide-react'

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
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { pickRecordingMimeType } from '@/features/voice/voice-recorder'

type TimelineItem = {
  id: string
  title: string
  created_at: string
  source_type: string
  topic_tags: string[]
}

type Citation = {
  title: string
  capture_date: string
  source_type: string
  topic_tags: string[]
}

type SearchMode = 'search' | 'ask-ai'

const TAG_STYLES = [
  'bg-sky-500/20 text-sky-200 border-sky-400/40',
  'bg-emerald-500/20 text-emerald-200 border-emerald-400/40',
  'bg-amber-500/20 text-amber-200 border-amber-400/40',
  'bg-rose-500/20 text-rose-200 border-rose-400/40',
  'bg-violet-500/20 text-violet-200 border-violet-400/40',
]

function prettyDate(value: string): string {
  if (!value.trim()) return 'unknown time'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

export function MainWindow() {
  const [health, setHealth] = React.useState<string>('loading')
  const [error, setError] = React.useState<string | null>(null)

  const [isRecording, setIsRecording] = React.useState(false)
  const [asrError, setAsrError] = React.useState<string | null>(null)
  const [asrStatus, setAsrStatus] = React.useState<'idle' | 'recording' | 'uploading'>('idle')

  const [mode, setMode] = React.useState<SearchMode>('ask-ai')
  const [query, setQuery] = React.useState('')
  const [ragLoading, setRagLoading] = React.useState(false)
  const [ragError, setRagError] = React.useState<string | null>(null)
  const [ragAnswer, setRagAnswer] = React.useState('')
  const [citations, setCitations] = React.useState<Citation[]>([])
  const [contextSnippet, setContextSnippet] = React.useState('')

  const [timeline, setTimeline] = React.useState<TimelineItem[]>([])
  const [timelineLoading, setTimelineLoading] = React.useState(false)

  const recorderRef = React.useRef<MediaRecorder | null>(null)
  const chunksRef = React.useRef<BlobPart[]>([])
  const streamRef = React.useRef<MediaStream | null>(null)
  const stopTimerRef = React.useRef<number | null>(null)
  const holdToTalkActiveRef = React.useRef(false)
  const blobTypeRef = React.useRef('audio/webm')

  const backendBaseUrl = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000'

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

  const runAskAi = React.useCallback(
    async (text: string) => {
      const normalized = text.trim()
      if (!normalized) return

      setRagLoading(true)
      setRagError(null)
      setRagAnswer('')
      setCitations([])
      setContextSnippet('')

      try {
        const recallRes = await fetch(`${backendBaseUrl}/memory/recall`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: normalized }),
        })
        const recallPayload = (await recallRes.json()) as {
          answer?: string
          citations?: Citation[]
          detail?: string
        }
        if (!recallRes.ok) {
          throw new Error(recallPayload.detail || `HTTP ${recallRes.status}`)
        }

        setRagAnswer((recallPayload.answer || '').trim())
        setCitations(Array.isArray(recallPayload.citations) ? recallPayload.citations : [])

        const simRes = await fetch(`${backendBaseUrl}/memory/similarity`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: normalized }),
        })
        const simPayload = (await simRes.json()) as {
          match?: { excerpt?: string } | null
        }
        if (simRes.ok && simPayload.match?.excerpt) {
          setContextSnippet(simPayload.match.excerpt)
        }
      } catch (e: unknown) {
        setRagError(e instanceof Error ? e.message : String(e))
      } finally {
        setRagLoading(false)
      }
    },
    [backendBaseUrl],
  )

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

        const text = (payload.text || '').trim()
        setQuery(text)
        if (text) {
          void runAskAi(text)
        }
      } catch (e: unknown) {
        setAsrError(e instanceof Error ? e.message : String(e))
      } finally {
        setAsrStatus('idle')
      }
    },
    [backendBaseUrl, runAskAi],
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
    const audioBlob = new Blob(chunksRef.current, { type: blobTypeRef.current })
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
    } catch (e: unknown) {
      setAsrError(e instanceof Error ? e.message : String(e))
      setAsrStatus('idle')
      clearRecorderResources()
    }
  }, [asrStatus, clearRecorderResources, isRecording, stopRecording])

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

  React.useEffect(() => {
    setTimelineLoading(true)
    fetch(`${backendBaseUrl}/memory/timeline?limit=30&offset=0`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<{ items?: TimelineItem[] }>
      })
      .then((json) => {
        setTimeline(Array.isArray(json.items) ? json.items : [])
      })
      .catch(() => {
        setTimeline([])
      })
      .finally(() => {
        setTimelineLoading(false)
      })
  }, [backendBaseUrl])

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

  const suggestedQueries = React.useMemo(() => {
    const fromTitles = timeline
      .map((item) => item.title)
      .filter((title) => typeof title === 'string' && title.trim().length > 0)
      .slice(0, 6)
    return Array.from(new Set(fromTitles))
  }, [timeline])

  const filteredTimeline = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return timeline
    return timeline.filter((item) => {
      const hay = `${item.title} ${item.source_type} ${(item.topic_tags || []).join(' ')}`.toLowerCase()
      return hay.includes(q)
    })
  }, [query, timeline])

  const handleSubmit = React.useCallback(async () => {
    if (mode === 'ask-ai') {
      await runAskAi(query)
      return
    }

    if (!query.trim()) {
      setContextSnippet('')
      return
    }

    setRagLoading(true)
    setRagError(null)
    setRagAnswer('')
    setCitations([])
    try {
      const simRes = await fetch(`${backendBaseUrl}/memory/similarity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: query.trim() }),
      })
      const payload = (await simRes.json()) as { match?: { excerpt?: string } | null; detail?: string }
      if (!simRes.ok) {
        throw new Error(payload.detail || `HTTP ${simRes.status}`)
      }
      setContextSnippet(payload.match?.excerpt?.trim() || '')
    } catch (e: unknown) {
      setRagError(e instanceof Error ? e.message : String(e))
    } finally {
      setRagLoading(false)
    }
  }, [backendBaseUrl, mode, query, runAskAi])

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-6">
        <header className="sticky top-0 z-10 rounded-lg border border-border bg-secondary/80 p-4 backdrop-blur">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Sparkles className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-11 bg-background pl-9 pr-9"
                value={query}
                placeholder="Ask your database..."
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void handleSubmit()
                  }
                }}
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={mode === 'search' ? 'secondary' : 'outline'}
                onClick={() => setMode('search')}
              >
                Search
              </Button>
              <Button
                variant={mode === 'ask-ai' ? 'secondary' : 'outline'}
                onClick={() => setMode('ask-ai')}
              >
                Ask AI
              </Button>
              <Button
                variant={isRecording ? 'destructive' : 'default'}
                onClick={() => (isRecording ? void stopRecording() : void startRecording())}
                disabled={asrStatus === 'uploading'}
              >
                {isRecording ? 'Stop & Transcribe' : 'Start Recording'}
              </Button>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant={health === 'ok' ? 'default' : 'outline'}>{health}</Badge>
            <Badge variant={asrStatus === 'recording' ? 'destructive' : 'outline'}>{asrStatus}</Badge>
            <span>Shortcut: Shift+Space</span>
            {error ? <span className="text-destructive">{error}</span> : null}
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{mode === 'ask-ai' ? 'RAG Answer' : 'Search Results'}</CardTitle>
              <CardDescription>
                {mode === 'ask-ai'
                  ? 'Answer synthesized from your indexed memory with sources.'
                  : 'Filter your indexed recordings and inspect best matching context.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {ragError ? <div className="text-sm text-destructive">{ragError}</div> : null}
              {asrError ? <div className="text-sm text-destructive">{asrError}</div> : null}
              {ragLoading ? <div className="text-sm text-muted-foreground">Thinking...</div> : null}

              {mode === 'ask-ai' ? (
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <div className="text-sm font-medium">Answer</div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                    {ragAnswer || 'Ask a question to get an answer from your memory database.'}
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <div className="text-sm font-medium">Best matching context</div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {contextSnippet || 'Run Search to retrieve the most relevant snippet.'}
                  </p>
                </div>
              )}

              {mode === 'ask-ai' && citations.length > 0 ? (
                <div className="rounded-lg border border-border bg-background/40 p-3">
                  <div className="text-sm font-medium">Sources</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {citations.slice(0, 4).map((source, index) => (
                      <Badge key={`${source.title}-${source.capture_date}-${index}`} variant="secondary">
                        {source.title || 'Memory'}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Suggested Queries</CardTitle>
              <CardDescription>Recent recordings are turned into quick prompts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {suggestedQueries.length === 0 ? (
                <div className="text-sm text-muted-foreground">No suggestions yet. Record something first.</div>
              ) : (
                suggestedQueries.map((title) => (
                  <Button
                    key={title}
                    variant="outline"
                    className="w-full justify-start overflow-hidden text-left"
                    onClick={() => {
                      setQuery(title)
                      void runAskAi(title)
                    }}
                  >
                    <span className="block w-full truncate">{title}</span>
                  </Button>
                ))
              )}
            </CardContent>
            <CardFooter>
              <Button variant="outline" className="w-full" onClick={() => window.overlay.show()}>
                Open Overlay
              </Button>
            </CardFooter>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recordings Feed</CardTitle>
            <CardDescription>Memory timeline from your indexed captures.</CardDescription>
          </CardHeader>
          <Separator />
          <CardContent className="max-h-[460px] space-y-3 overflow-y-auto pt-4">
            {timelineLoading ? <div className="text-sm text-muted-foreground">Loading recordings...</div> : null}
            {!timelineLoading && filteredTimeline.length === 0 ? (
              <div className="text-sm text-muted-foreground">No recordings match your query.</div>
            ) : null}
            {filteredTimeline.map((item) => (
              <Card key={item.id} className="border border-border">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{item.title || 'Untitled recording'}</CardTitle>
                    <Badge variant="secondary">{item.source_type || 'unknown'}</Badge>
                  </div>
                  <CardDescription className="text-muted-foreground">{prettyDate(item.created_at)}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-2">
                    {(item.topic_tags || []).slice(0, 5).map((tag, index) => (
                      <Badge
                        key={`${item.id}-${tag}`}
                        variant="outline"
                        className={TAG_STYLES[index % TAG_STYLES.length]}
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
