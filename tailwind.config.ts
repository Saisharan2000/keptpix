import type { Config } from 'tailwindcss';

/**
 * Tailwind 4 is CSS-first: the theme lives in `src/styles/global.css` as an
 * `@theme inline` block that maps the design tokens from `src/styles/tokens.css`
 * (docs/08 §2) onto Tailwind's utility namespaces.
 *
 * This file carries the explicit source globs and is wired in via the `@config`
 * directive in global.css. Do not move theme values here — tokens.css is the
 * single source of truth for token VALUES, and docs/08 §2 is the source of
 * truth for tokens.css.
 */
export default {
  content: [
    './src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}',
    './public/**/*.html',
  ],
  darkMode: ['selector', '[data-theme="dark"]'],
} satisfies Config;
