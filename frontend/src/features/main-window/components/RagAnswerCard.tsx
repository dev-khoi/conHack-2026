import React from 'react';
import { Sparkles } from 'lucide-react';

import GradientText from '@/components/GradientText';
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
  const hasAnswer = ragAnswer.trim().length > 0;

  return (
    <Card className='border-border/70 bg-card/75 shadow-xl backdrop-blur-xl'>
      <CardHeader className='space-y-3 text-center'>
        <GradientText
          colors={['#5227FF', '#FF9FFC', '#B497CF']}
          animationSpeed={20}
          showBorder={false}
          className='custom-class'>
          <h1 className='text-5xl font-extrabold tracking-tight sm:text-7xl'>AURA</h1>
        </GradientText>
        <CardTitle className='text-lg font-semibold tracking-tight'>Ask Aurora</CardTitle>
        <CardDescription>Chat with your sessions and get grounded answers with sources.</CardDescription>
      </CardHeader>
      <CardContent className='space-y-5'>
        <section className='rounded-2xl border border-border/60 bg-muted/30 p-4'>
          <div className='mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground'>Aurora Answer</div>
          <div className='rounded-2xl bg-background/80 p-4 text-sm leading-6 text-foreground shadow-inner'>
            {ragLoading ? (
              <span className='text-muted-foreground'>Thinking...</span>
            ) : (
              <p className='whitespace-pre-wrap'>{hasAnswer ? ragAnswer : 'Ask a question and Aurora will answer from your memory database.'}</p>
            )}
          </div>
        </section>

        <div className='relative rounded-2xl border border-border/70 bg-background/70 p-3'>
          <Sparkles className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            className='h-12 border-border/70 bg-background pl-9 pr-24 focus-visible:ring-primary/30'
            value={query}
            placeholder='Ask your sessions...'
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
