import React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

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

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export function OverlayShell() {
  const [panelState, setPanelState] = React.useState<PanelState>("compact");
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const [command, setCommand] = React.useState("");
  const [streamText, setStreamText] = React.useState("");
  const [finalResult, setFinalResult] = React.useState<unknown>(null);
  const [similarity, setSimilarity] = React.useState<any>(null);
  const [runError, setRunError] = React.useState<string | null>(null);
  const [isRunning, setIsRunning] = React.useState(false);
  const [isRecording, setIsRecording] = React.useState(false);
  const recorderRef = React.useRef<SpeechRecognitionLike | null>(null);

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
      setPanelState("expanded");

      try {
        const [clipboardText, screenshotBase64] = await Promise.all([
          window.overlay.getClipboardText(),
          window.overlay.captureScreenshotBase64(),
        ]);

        const planRes = await fetch(`${backendBaseUrl}/router/plan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            voice: text,
            clipboard: clipboardText?.trim() ? clipboardText : null,
            screenshot_analysis: null,
            screenshot_base64: screenshotBase64,
            metadata: {
              source: ["voice", "clipboard", "screen"],
            },
          }),
        });

        if (!planRes.ok) {
          throw new Error(`Planner HTTP ${planRes.status}`);
        }

        const plan = (await planRes.json()) as RouterPlan;

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

          // Parse SSE blocks separated by blank lines.
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
            } else if (evt.type === "final") {
              const result = isRecord(evt.result) ? evt.result : null;
              if (result && "final_output" in result)
                setFinalResult(result.final_output);
              // show similarity card if present
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

  const startRecording = React.useCallback(() => {
    const W = window as Window & {
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
      SpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!Ctor) {
      setRunError("SpeechRecognition is not available in this environment.");
      return;
    }

    setRunError(null);
    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";

    let transcript = "";
    rec.onresult = (evt: unknown) => {
      const e = evt as {
        results?: ArrayLike<ArrayLike<{ transcript?: string }>>;
      };
      const results = e.results;
      if (!results) return;
      const last = results[results.length - 1];
      if (!last || !last[0]) return;
      const piece = String(last[0].transcript || "");
      transcript = `${transcript} ${piece}`.trim();
      setCommand(transcript);
    };
    rec.onerror = () => {
      setRunError("Voice capture failed.");
      setIsRecording(false);
    };
    rec.onend = () => {
      setIsRecording(false);
      recorderRef.current = null;
      if (transcript.trim()) {
        void runVoiceFlow(transcript);
      }
    };

    recorderRef.current = rec;
    setIsRecording(true);
    rec.start();
  }, [runVoiceFlow]);

  const stopRecording = React.useCallback(() => {
    recorderRef.current?.stop();
  }, []);

  React.useEffect(() => {
    window.overlay.setPanelState(panelState);
  }, [panelState]);

  React.useEffect(() => {
    if (panelState === "input" || panelState === "expanded") {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [panelState]);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (panelState === "compact") {
          window.overlay.hide();
          return;
        }
        setPanelState("compact");
        return;
      }

      if (e.key === "Enter") {
        if (panelState === "input") setPanelState("expanded");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [panelState]);

  return (
    <div className="h-full w-full overflow-hidden">
      <Card className="overlay-glass relative h-full w-full overflow-hidden bg-card/60 backdrop-blur-xl [-webkit-app-region:no-drag]">
        <header className="relative flex h-[60px] items-center justify-between px-4 [-webkit-app-region:drag]">
          <button
            type="button"
            className="flex items-center gap-2 [-webkit-app-region:no-drag]"
            onClick={() =>
              setPanelState(panelState === "compact" ? "input" : "compact")
            }>
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.18)]" />
            <span className="font-heading text-[14px] font-semibold tracking-tight">
              AURA
            </span>
            <Badge variant="secondary" className="h-5">
              overlay
            </Badge>
          </button>

          <Badge variant="outline" className="h-6 [-webkit-app-region:no-drag]">
            Ctrl+Shift+Space
          </Badge>
        </header>

        <Separator />

        <section className="relative px-4 pb-4">
          <div
            className={
              "transition-all duration-200 ease-out " +
              (panelState === "compact"
                ? "opacity-0 -translate-y-1 pointer-events-none h-0"
                : "opacity-100 translate-y-0")
            }>
            <div className="pb-3">
              <div className="flex items-center gap-2">
                <div className="text-xs font-medium text-muted-foreground">
                  Ask
                </div>
                <div className="flex-1">
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
                <Button
                  size="sm"
                  variant={isRecording ? "destructive" : "secondary"}
                  onClick={() =>
                    isRecording ? stopRecording() : startRecording()
                  }
                  disabled={isRunning}>
                  {isRecording ? "Stop Voice" : "Voice"}
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
              <CardHeader className="py-4">
                <CardTitle className="text-sm">Result</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {runError ? (
                  <div className="text-sm text-destructive">{runError}</div>
                ) : null}
                <div className="rounded-lg border bg-background/40 p-3">
                  <div className="text-sm font-medium">Stream</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {streamText || "No output yet."}
                  </p>
                </div>
                {finalResult ? (
                  <div className="rounded-lg border bg-background/40 p-3">
                    <div className="text-sm font-medium">Final</div>
                    <pre className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                      {typeof finalResult === "string"
                        ? finalResult
                        : JSON.stringify(finalResult, null, 2)}
                    </pre>
                  </div>
                ) : null}
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
            <Button
              type="button"
              variant="outline"
              className="mt-2 w-full justify-start"
              onClick={() => setPanelState("input")}>
              <span className="font-medium">Search / Ask</span>
              <span className="ml-2 text-muted-foreground">Click to type</span>
            </Button>
          </div>
        </section>
      </Card>
    </div>
  );
}
