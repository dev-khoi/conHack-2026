import * as React from 'react'

import { cn } from '@/lib/utils'

type SwitchProps = Omit<React.ComponentProps<'button'>, 'onChange'> & {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

function Switch({ checked = false, onCheckedChange, className, ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-state={checked ? 'checked' : 'unchecked'}
      className={cn(
        'peer inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent transition-colors',
        'bg-input data-[state=checked]:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      onClick={() => onCheckedChange?.(!checked)}
      {...props}
    >
      <span
        data-state={checked ? 'checked' : 'unchecked'}
        className={cn(
          'pointer-events-none block h-5 w-5 rounded-full bg-background shadow-sm ring-0 transition-transform',
          'translate-x-0.5 data-[state=checked]:translate-x-5',
        )}
      />
    </button>
  )
}

export { Switch }
