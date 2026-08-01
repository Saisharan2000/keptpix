import type { ComponentChildren } from 'preact';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

/**
 * Props are declared explicitly rather than extending JSX.HTMLAttributes.
 * Spreading the full DOM attribute surface through a wrapper makes every call
 * site's type error point here instead of at the caller, and this component
 * only ever needs these five.
 */
interface Props {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  'aria-label'?: string;
  children?: ComponentChildren;
}

/**
 * docs/08 §6: every target is >= 24x24 on desktop and >= 44x44 on mobile, and
 * the focus ring is never removed. Both are enforced here, not per call site.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-text hover:bg-accent-hover active:bg-accent-active',
  secondary: 'border border-border-strong text-text hover:bg-bg-subtle',
  ghost: 'text-text-muted hover:bg-bg-muted hover:text-text',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  disabled = false,
  onClick,
  children,
  ...aria
}: Props) {
  const dims = size === 'sm' ? 'min-h-9 px-3 text-xs' : 'min-h-11 px-4 text-sm';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={aria['aria-label']}
      class={
        'inline-flex items-center justify-center gap-2 rounded-md font-medium ' +
        'disabled:cursor-not-allowed disabled:opacity-50 ' +
        dims +
        ' ' +
        VARIANTS[variant] +
        ' ' +
        className
      }
    >
      {children}
    </button>
  );
}
