import React from 'react';
import { Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { Citation } from '@/features/main-window/types';

type RagAnswerCardProps = {
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  suggestedQueries: string[];
  ragError: string | null;
  asrError: string | null;
  ragLoading: boolean;
  ragAnswer: string;
  citations: Citation[];
  runAskAi: (text: string) => Promise<void>;
  onSubmit: () => Promise<void>;
};

export function RagAnswerCard({
  query,
  setQuery,
  suggestedQueries,
  ragError,
  asrError,
  ragLoading,
  ragAnswer,
  citations,
  runAskAi,
  onSubmit,
}: RagAnswerCardProps) {
  return (
    <Card className='border-border bg-card/80'>
      <CardHeader>
        <CardTitle className='text-xl font-semibold tracking-tight'>RAG Answer</CardTitle>
        <CardDescription>Ask your sessions and get a concise answer with sources.</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='relative'>
          <Sparkles className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            className='h-11 border-border bg-background/70 pl-9 pr-24 focus-visible:ring-primary/30'
            value={query}
            placeholder='Ask your database...'
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void onSubmit();
              }
            }}
          />
          <Button
            size='sm'
            className='absolute right-1.5 top-1/2 -translate-y-1/2'
            onClick={() => void onSubmit()}>
            Ask
          </Button>
        </div>

        <div className='rounded-lg border border-border bg-muted/25 p-3'>
          <div className='text-xs font-medium text-muted-foreground'>Suggested</div>
          <div className='mt-2 flex flex-wrap gap-2'>
            {suggestedQueries.length === 0 ? (
              <span className='text-xs text-muted-foreground'>No suggestions yet.</span>
            ) : (
              suggestedQueries.map((title) => (
                <Button
                  key={title}
                  variant='outline'
                  size='sm'
                  className='max-w-full overflow-hidden'
                  onClick={() => {
                    setQuery(title);
                    void runAskAi(title);
                  }}>
                  <span className='truncate'>{title}</span>
                </Button>
              ))
            )}
          </div>
        </div>

        {ragError ? <div className='text-sm text-destructive'>{ragError}</div> : null}
        {asrError ? <div className='text-sm text-destructive'>{asrError}</div> : null}
        {ragLoading ? <div className='text-sm text-muted-foreground'>Thinking...</div> : null}

        <div className='rounded-lg border border-border bg-muted/20 p-4'>
          <div className='text-sm font-medium'>Answer</div>
          <p className='mt-2 whitespace-pre-wrap text-sm text-muted-foreground'>
            {ragAnswer || 'Ask a question to get an answer from your memory database.'}
          </p>
        </div>

        {citations.length > 0 ? (
          <div className='rounded-lg border border-border bg-background/40 p-3'>
            <div className='text-sm font-medium'>Sources</div>
            <div className='mt-2 flex flex-wrap gap-2'>
              {citations.slice(0, 4).map((source, index) => (
                <Badge key={`${source.title}-${source.capture_date}-${index}`} variant='secondary'>
                  {source.title || 'Memory'}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
