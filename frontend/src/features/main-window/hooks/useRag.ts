import React from 'react';

import type { Citation } from '@/features/main-window/types';

type UseRagResult = {
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  ragLoading: boolean;
  ragError: string | null;
  ragAnswer: string;
  citations: Citation[];
  runAskAi: (text: string) => Promise<void>;
  handleSubmit: () => Promise<void>;
};

export function useRag(backendBaseUrl: string, screenshotEnabled: boolean): UseRagResult {
  const [query, setQuery] = React.useState('');
  const [ragLoading, setRagLoading] = React.useState(false);
  const [ragError, setRagError] = React.useState<string | null>(null);
  const [ragAnswer, setRagAnswer] = React.useState('');
  const [citations, setCitations] = React.useState<Citation[]>([]);

  const runAskAi = React.useCallback(
    async (text: string) => {
      const normalized = text.trim();
      if (!normalized) return;

      setRagLoading(true);
      setRagError(null);
      setRagAnswer('');
      setCitations([]);

      try {
        if (screenshotEnabled) {
          const screenshotBase64 = (await window.overlay.captureScreenshotBase64()) || '';
          if (screenshotBase64.trim()) {
            const sessionId =
              typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                ? crypto.randomUUID()
                : `session-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
            await fetch(`${backendBaseUrl}/screenshots/upload-base64`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                screenshot_base64: screenshotBase64,
                source: 'main_window',
                session_id: sessionId,
              }),
            });
          }
        }

        const recallRes = await fetch(`${backendBaseUrl}/memory/recall`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: normalized }),
        });
        const recallPayload = (await recallRes.json()) as {
          answer?: string;
          citations?: Citation[];
          detail?: string;
        };
        if (!recallRes.ok) {
          throw new Error(recallPayload.detail || `HTTP ${recallRes.status}`);
        }

        setRagAnswer((recallPayload.answer || '').trim());
        setCitations(Array.isArray(recallPayload.citations) ? recallPayload.citations : []);
      } catch (error: unknown) {
        setRagError(error instanceof Error ? error.message : String(error));
      } finally {
        setRagLoading(false);
      }
    },
    [backendBaseUrl, screenshotEnabled],
  );

  const handleSubmit = React.useCallback(async () => {
    await runAskAi(query);
  }, [query, runAskAi]);

  return {
    query,
    setQuery,
    ragLoading,
    ragError,
    ragAnswer,
    citations,
    runAskAi,
    handleSubmit,
  };
}
