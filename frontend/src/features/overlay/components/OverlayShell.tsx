import React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import GradientText from "@/components/GradientText";
import { pickRecordingMimeType } from "@/features/voice/voice-recorder";
import { Mic, Square } from "lucide-react";

type PanelState = "compact" | "input" | "expanded";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

type RouterGraphStep = {
  id: string;
  tool: string;
  input: string;
  depends_on: string[];
};

type RouterPlan = {
  intent: string;
  tool_graph: RouterGraphStep[];
};

type UploadedScreenshot = {
  id: string;
  url: string;
};

export function OverlayShell() {
  const screenshotSettingKey = "aura.screenshotEnabled";
  const [panelState, setPanelState] = React.useState<PanelState>("compact");
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const [command, setCommand] = React.useState("");
  const [streamText, setStreamText] = React.useState("");
  const [finalResult, setFinalResult] = React.useState<unknown>(null);
  const [asrText, setAsrText] = React.useState("");
  const [similarity, setSimilarity] = React.useState<any>(null);
  const [runError, setRunError] = React.useState<string | null>(null);
  const [isRunning, setIsRunning] = React.useState(false);
  const [isRecording, setIsRecording] = React.useState(false);
  const [recordingStatus, setRecordingStatus] = React.useState<
    "idle" | "recording" | "uploading"
  >("idle");
  const [screenshotCaptured, setScreenshotCaptured] = React.useState<
    boolean | null
  >(null);
  const [planPreview, setPlanPreview] = React.useState<RouterPlan | null>(null);

  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<BlobPart[]>([]);
  const streamRef = React.useRef<MediaStream | null>(null);
  const stopTimerRef = React.useRef<number | null>(null);
  const blobTypeRef = React.useRef<string>("audio/webm");

  const backendBaseUrl =
    import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8000";

  const runVoiceFlow = React.useCallback(
    async (voiceText: string) => {
      const text = voiceText.trim();
      if (!text) return;

      setIsRunning(true);
      setRunError(null);
      setStreamText("");
      setFinalResult(null);
      setSimilarity(null);
      setPlanPreview(null);
      setPanelState("expanded");

      try {
        const sessionId =
          typeof crypto !== "undefined" &&
          typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `session-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
        const screenshotAllowed =
          localStorage.getItem(screenshotSettingKey) !== "0";
        const [clipboardText, clipboardImageBase64, screenshotBase64] =
          await Promise.all([
            window.overlay.getClipboardText(),
            window.overlay.getClipboardImageBase64(),
            screenshotAllowed
              ? window.overlay.captureScreenshotBase64()
              : Promise.resolve(null),
          ]);
        let uploadedScreenshot: UploadedScreenshot | null = null;
        if (screenshotBase64?.trim()) {
          try {
            const uploadRes = await fetch(
              `${backendBaseUrl}/screenshots/upload-base64`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  screenshot_base64: screenshotBase64,
                  source: "overlay",
                  session_id: sessionId,
                }),
              },
            );
            if (uploadRes.ok) {
              uploadedScreenshot =
                (await uploadRes.json()) as UploadedScreenshot;
            }
          } catch {
            // Keep the voice flow running even if screenshot upload fails.
          }
        }
        setScreenshotCaptured(
          Boolean(screenshotBase64 && screenshotBase64.trim()),
        );
        const planRes = await fetch(`${backendBaseUrl}/router/plan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            voice: text,
            clipboard: clipboardText?.trim() ? clipboardText : null,
            screenshot_analysis: null,
            screenshot_base64: screenshotBase64,
            clipboard_image_base64: clipboardImageBase64,
            metadata: {
              source: ["voice", "clipboard", "screen"],
              screenshot_id: uploadedScreenshot?.id || null,
              screenshot_url: uploadedScreenshot?.url || null,
              session_id: sessionId,
            },
          }),
        });

        if (!planRes.ok) {
          throw new Error(`Planner HTTP ${planRes.status}`);
        }

        const plan = (await planRes.json()) as RouterPlan;
        setPlanPreview(plan);

        const res = await fetch(`${backendBaseUrl}/execute/graph`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            intent: plan.intent,
            tool_graph: plan.tool_graph,
            payload: {
              text,
              clipboard: clipboardText?.trim() ? clipboardText : "",
              screenshot_base64: screenshotBase64 || "",
              clipboard_image_base64: clipboardImageBase64 || "",
              screenshot_url: uploadedScreenshot?.url || "",
              session_id: sessionId,
              source_type: "overlay",
            },
          }),
        });

        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          while (true) {
            const idx = buffer.indexOf("\n\n");
            if (idx === -1) break;
            const chunk = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);

            const line = chunk
              .split("\n")
              .map((l) => l.trim())
              .find((l) => l.startsWith("data:"));

            if (!line) continue;
            const jsonText = line.slice("data:".length).trim();
            if (!jsonText) continue;

            let evt: unknown;
            try {
              evt = JSON.parse(jsonText) as unknown;
            } catch {
              continue;
            }

            if (!isRecord(evt) || typeof evt.type !== "string") continue;

            if (evt.type === "delta") {
              const delta = typeof evt.delta === "string" ? evt.delta : "";
              if (delta) setStreamText((t) => t + delta);
            } else if (evt.type === "clipboard_write") {
              const text = typeof evt.text === "string" ? evt.text : "";
              if (text.trim()) {
                await window.overlay.setClipboardText(text);
              }
            } else if (evt.type === "clipboard_image_write") {
              const imageBase64 =
                typeof evt.image_base64 === "string" ? evt.image_base64 : "";
              if (imageBase64.trim()) {
                await window.overlay.setClipboardImageBase64(imageBase64);
              }
            } else if (evt.type === "final") {
              const result = isRecord(evt.result) ? evt.result : null;
              if (result && "final_output" in result)
                setFinalResult(result.final_output);
              setSimilarity(
                result && "similarity" in result ? result.similarity : null,
              );
            } else if (evt.type === "error") {
              const detail =
                typeof evt.detail === "string" ? evt.detail : "Execution error";
              setRunError(detail);
            }
          }
        }
      } catch (e: unknown) {
        setRunError(e instanceof Error ? e.message : String(e));
      } finally {
        setIsRunning(false);
      }
    },
    [backendBaseUrl],
  );

  const runExecute = React.useCallback(async () => {
    await runVoiceFlow(command);
  }, [command, runVoiceFlow]);

  const clearRecordingResources = React.useCallback(() => {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const uploadAndRun = React.useCallback(
    async (audioBlob: Blob, blobType: string) => {
      setRecordingStatus("uploading");
      setRunError(null);
      try {
        const form = new FormData();
        const filename = blobType.includes("wav") ? "voice.wav" : "voice.webm";
        form.append("file", audioBlob, filename);

        const res = await fetch(`${backendBaseUrl}/asr/transcribe`, {
          method: "POST",
          body: form,
        });
        const payload = (await res.json()) as {
          text?: string;
          detail?: string;
        };
        if (!res.ok) {
          throw new Error(payload.detail || `HTTP ${res.status}`);
        }

        const transcript = (payload.text || "").trim();
        setAsrText(transcript);
        setCommand(transcript);
        if (transcript) {
          await runVoiceFlow(transcript);
        }
      } catch (e: unknown) {
        setRunError(e instanceof Error ? e.message : String(e));
      } finally {
        setRecordingStatus("idle");
      }
    },
    [backendBaseUrl, runVoiceFlow],
  );

  const startRecording = React.useCallback(async () => {
    if (isRecording || recordingStatus === "uploading") return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setRunError("Audio recording is not supported in this environment.");
      return;
    }

    setRunError(null);
    setCommand("");
    setAsrText("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const { mediaRecorderMimeType, blobType } = pickRecordingMimeType();
      const options = mediaRecorderMimeType
        ? { mimeType: mediaRecorderMimeType }
        : undefined;
      const recorder = new MediaRecorder(stream, options);
      recorderRef.current = recorder;
      blobTypeRef.current = blobType;
      chunksRef.current = [];

      recorder.addEventListener("dataavailable", (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      });

      recorder.start(250);
      setIsRecording(true);
      setRecordingStatus("recording");

      stopTimerRef.current = window.setTimeout(() => {
        void stopRecording();
      }, 60_000);
    } catch (e: unknown) {
      setRunError(e instanceof Error ? e.message : String(e));
      setIsRecording(false);
      setRecordingStatus("idle");
      clearRecordingResources();
    }
  }, [clearRecordingResources, isRecording, recordingStatus]);

  const stopRecording = React.useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      clearRecordingResources();
      setIsRecording(false);
      setRecordingStatus("idle");
      return;
    }

    await new Promise<void>((resolve) => {
      recorder.addEventListener(
        "stop",
        () => {
          resolve();
        },
        { once: true },
      );
      recorder.stop();
    });

    setIsRecording(false);
    const audioBlob = new Blob(chunksRef.current, {
      type: blobTypeRef.current,
    });
    clearRecordingResources();

    if (audioBlob.size < 1024) {
      setRunError(
        "No audio captured. Hold the key a bit longer, then try again.",
      );
      setRecordingStatus("idle");
      return;
    }

    await uploadAndRun(audioBlob, blobTypeRef.current);
  }, [clearRecordingResources, uploadAndRun]);

  React.useEffect(() => {
    return () => {
      clearRecordingResources();
    };
  }, [clearRecordingResources]);

  // Sync panel size with main process
  React.useEffect(() => {
    window.overlay.setPanelState(panelState);
  }, [panelState]);

  // Focus input when panel opens
  React.useEffect(() => {
    if (panelState === "input" || panelState === "expanded") {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [panelState]);

  // Keyboard shortcuts
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        window.overlay.hide();
        return;
      }
      if (e.key === "Enter") {
        if (panelState === "input") setPanelState("expanded");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [panelState]);

  // Toggle recording when triggered by global shortcut via main process
  React.useEffect(() => {
    const unsubscribe = window.overlay.onStartRecording(() => {
      if (isRunning) return;
      if (recordingStatus === "uploading") return;
      if (isRecording) {
        void stopRecording();
        return;
      }
      void startRecording();
    });
    return unsubscribe;
  }, [isRecording, isRunning, recordingStatus, startRecording, stopRecording]);

  return (
    <div className="h-content-fit w-full overflow-hidden">
      <Card className="overlay-glass relative h-content-fit w-full overflow-hidden bg-card/45 backdrop-blur-xl [-webkit-app-region:no-drag]">
        <header className="relative flex h-[40px] items-center justify-between px-4 [-webkit-app-region:drag]">
          <button
            type="button"
            className="flex  items-center gap-2 [-webkit-app-region:no-drag]"
            onClick={() =>
              setPanelState(panelState === "compact" ? "input" : "compact")
            }>
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.18)]" />
            <GradientText
              colors={["#5227FF", "#FF9FFC", "#B497CF"]}
              animationSpeed={8}
              showBorder={false}
              className="custom-class">
              <h1 className=" font-semibold text-2xl tracking-tight">AURA</h1>
            </GradientText>
          </button>

          <Badge variant="outline" className="h-6 [-webkit-app-region:no-drag]">
            Shift+Space
          </Badge>
        </header>

        <Separator />

        <section className="relative h-[calc(100%-61px)] px-4 pb-4">
          <div
            className={
              "transition-all duration-200 ease-out " +
              (panelState === "compact"
                ? "opacity-0 -translate-y-1 pointer-events-none h-0"
                : "opacity-100 translate-y-0")
            }>
            <div className="my-3 flex items-center justify-center gap-3">
              <Button
                type="button"
                size="lg"
                variant="secondary"
                onClick={() => void startRecording()}
                disabled={
                  isRunning || isRecording || recordingStatus === "uploading"
                }>
                <Mic
                  className={
                    isRunning
                      ? "mr-1 h-4 w-4 text-muted-foreground/50"
                      : "mr-1 h-4 w-4 text-muted-foreground"
                  }
                />
                Record
              </Button>
              <Button
                type="button"
                size="lg"
                variant="destructive"
                onClick={() => void stopRecording()}
                disabled={!isRecording}>
                <Square className="mr-1 h-4 w-4 text-white/80" />
                Stop
              </Button>
            </div>

            <div className="pb-3">
              <div className="flex items-center justify-center gap-2">
                <div className="text-xs font-medium text-muted-foreground">
                  Ask
                </div>
                <div className="flex-1 ">
                  <Input
                    ref={inputRef}
                    className="h-10 bg-background/40"
                    placeholder="Type a command or question..."
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    onFocus={() =>
                      setPanelState((s) => (s === "compact" ? "input" : s))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void runExecute();
                      }
                    }}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPanelState(
                      panelState === "expanded" ? "input" : "expanded",
                    )
                  }>
                  {panelState === "expanded" ? "Collapse" : "Expand"}
                </Button>
                <Button
                  size="sm"
                  onClick={() => void runExecute()}
                  disabled={isRunning || !command.trim()}>
                  {isRunning ? "Running..." : "Run"}
                </Button>
              </div>

              <div className="mt-2 text-xs leading-4 text-muted-foreground">
                Enter expands. Esc collapses; Esc again hides.
              </div>
            </div>
          </div>

          <div
            className={
              "transition-all duration-200 ease-out " +
              (panelState === "expanded"
                ? "opacity-100 translate-y-0"
                : "opacity-0 -translate-y-1 pointer-events-none h-0 overflow-hidden")
            }>
            <Card className="bg-muted/30">
              <CardHeader className=" pt-2">
                <CardTitle className="text-md">Result</CardTitle>
              </CardHeader>
              <CardContent className="max-h-[360px] space-y-3 overflow-y-auto pt-0 pr-1">
                {runError ? (
                  <div className="text-sm text-destructive">{runError}</div>
                ) : null}
                <div className="rounded-lg border bg-background/40 p-3 text-xs text-muted-foreground">
                  screenshot captured:{" "}
                  {screenshotCaptured === null
                    ? "unknown"
                    : screenshotCaptured
                      ? "yes"
                      : "no"}
                </div>
                {planPreview ? (
                  <div className="rounded-lg border bg-background/40 p-3">
                    <div className="text-sm font-medium">Planned Graph</div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      {planPreview.intent}
                    </div>
                    {planPreview.tool_graph.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {planPreview.tool_graph.map((step, index) => (
                          <div
                            key={step.id}
                            className="rounded-md border bg-background/60 p-2 text-xs text-muted-foreground">
                            <div className="font-medium text-foreground">
                              {index + 1}. {step.tool}
                            </div>
                            {step.depends_on.length > 0 ? (
                              <div className="mt-1">
                                depends on: {step.depends_on.join(", ")}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="rounded-lg border bg-background/40 p-3">
                  <div className="text-sm font-medium">Result</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {(typeof finalResult === "string" && finalResult.trim()
                      ? finalResult
                      : streamText) || "No output yet."}
                  </p>
                </div>
                {/* {finalResult ? (
                  <div className="rounded-lg border bg-background/40 p-3">
                    <div className="text-sm font-medium">Final</div>
                    <pre className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                      {typeof finalResult === "string"
                        ? finalResult
                        : JSON.stringify(finalResult, null, 2)}
                    </pre>
                  </div>
                ) : null} */}
                {similarity ? (
                  <div className="rounded-lg border bg-background/40 p-3">
                    <div className="text-sm font-medium">Related memory</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      score: {(similarity as any).score}
                    </div>
                    <div className="mt-2 text-sm">
                      {(similarity as any).excerpt}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <div
            className={
              "transition-all duration-200 ease-out " +
              (panelState === "compact"
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-1 pointer-events-none h-0 overflow-hidden")
            }>
            <Card className="mt-2 border bg-background/50">
              <CardContent className="space-y-3 p-3">
                <div className="my-3 flex items-center justify-center gap-3">
                  <Button
                    type="button"
                    size="lg"
                    variant="secondary"
                    onClick={() => void startRecording()}
                    disabled={
                      isRunning ||
                      isRecording ||
                      recordingStatus === "uploading"
                    }>
                    <Mic
                      className={
                        isRunning
                          ? "mr-1 h-4 w-4 text-muted-foreground/50"
                          : "mr-1 h-4 w-4 text-muted-foreground"
                      }
                    />
                    Record
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    variant="destructive"
                    onClick={() => void stopRecording()}
                    disabled={!isRecording}>
                    <Square className="mr-1 h-4 w-4 text-white/80" />
                    Stop
                  </Button>
                </div>
                <Input
                  ref={inputRef}
                  className="h-10 bg-background/40"
                  placeholder="Ask..."
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void runExecute();
                    }
                  }}
                />
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="text-sm font-medium">Transcript</div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                    {asrText || "No transcript yet. Record then transcribe."}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </Card>
    </div>
  );
}
