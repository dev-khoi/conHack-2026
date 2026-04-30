import * as React from 'react'

import { cn } from '@/lib/utils'

type ToggleProps = React.ComponentProps<'button'> & {
  pressed?: boolean
}

function Toggle({ className, pressed = false, ...props }: ToggleProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      data-state={pressed ? 'on' : 'off'}
      className={cn(
        'inline-flex h-8 items-center justify-center rounded-md border border-border px-2.5 text-xs font-medium transition-colors',
        'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=off]:bg-background data-[state=off]:text-muted-foreground hover:data-[state=off]:bg-muted',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Toggle }
