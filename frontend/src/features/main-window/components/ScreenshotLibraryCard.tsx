import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ScreenshotItem } from '@/features/main-window/types';
import { prettyDate } from '@/features/main-window/utils';

type ScreenshotLibraryCardProps = {
  screenshots: ScreenshotItem[];
  screenshotsLoading: boolean;
};

export function ScreenshotLibraryCard({
  screenshots,
  screenshotsLoading,
}: ScreenshotLibraryCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-xl font-semibold tracking-tight'>Screenshot Library</CardTitle>
        <CardDescription>Latest screenshots uploaded to S3 from your capture flow.</CardDescription>
      </CardHeader>
      <CardContent className='space-y-3'>
        {screenshotsLoading ? (
          <div className='text-sm text-muted-foreground'>Loading screenshots...</div>
        ) : null}
        {!screenshotsLoading && screenshots.length === 0 ? (
          <div className='text-sm text-muted-foreground'>
            No screenshots yet. Capture from overlay to store in S3.
          </div>
        ) : null}
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6'>
          {screenshots.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target='_blank'
              rel='noreferrer'
              className='group overflow-hidden rounded-md border border-border bg-background'>
              <img
                src={item.url}
                alt={`Screenshot ${item.id}`}
                className='h-24 w-full object-cover transition group-hover:scale-[1.02]'
                loading='lazy'
              />
              <div className='px-2 py-1 text-[11px] text-muted-foreground'>
                {prettyDate(item.created_at)}
              </div>
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
