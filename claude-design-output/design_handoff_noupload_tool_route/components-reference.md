# Component reference — NoUpload

Source of the design-system components, inlined here so the handoff bundle is self-contained.
**Reference only.** Rebuild these in the target codebase using its own patterns (Astro islands + React,
Tailwind classes bound to the token custom properties, copy-in shadcn/ui + Radix per `07`).
The `.d.ts` block under each component is the props contract to mirror in TypeScript.

Styling here is injected via a tiny helper (`css.js`) purely so each prototype file stays standalone —
do not carry that pattern into production.

```js
// css.js — injects a <style> once per component id
const seen=new Set();
export function css(id,text){
  if(typeof document==='undefined'||seen.has(id))return;
  seen.add(id);
  const el=document.createElement('style');el.setAttribute('data-nu',id);el.textContent=text;
  document.head.appendChild(el);
}
```

---

## primitives

### Icon

Props contract — `components/primitives/Icon.d.ts`:

```ts
import * as React from 'react';
export interface IconProps extends React.HTMLAttributes<HTMLSpanElement>{
  /** Lucide icon name, kebab-case. */
  name?: string;
  size?: number;
}
/** Decorative Lucide glyph (aria-hidden). System rule: never render one without an adjacent text label. */
export declare function Icon(props: IconProps): JSX.Element;
```

Reference implementation — `components/primitives/Icon.jsx`:

```jsx
import React from 'react';
const BASE='https://cdn.jsdelivr.net/npm/lucide-static@0.544.0/icons/';
export function Icon({name='file',size=16,style,...rest}){
  const url=`url("${BASE}${name}.svg")`;
  return <span aria-hidden="true" {...rest} style={{display:'inline-block',flex:'0 0 auto',width:size,height:size,background:'currentColor',WebkitMaskImage:url,maskImage:url,WebkitMaskRepeat:'no-repeat',maskRepeat:'no-repeat',WebkitMaskPosition:'center',maskPosition:'center',WebkitMaskSize:'contain',maskSize:'contain',...style}}/>;
}
```

### Button

Props contract — `components/primitives/Button.d.ts`:

```ts
import * as React from 'react';
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>{
  variant?: 'primary'|'secondary'|'ghost'|'danger';
  size?: 'sm'|'md'|'lg';
  /** Lucide name; the button must still carry a text label. */
  icon?: string;
  block?: boolean;
}
/** Action control. Accent fill is reserved for the one primary action per view. Min target 32px (sm) / 40 / 48. */
export declare function Button(props: ButtonProps): JSX.Element;
```

Reference implementation — `components/primitives/Button.jsx`:

```jsx
import React from 'react';
import {css} from '../css.js';
import {Icon} from './Icon.jsx';
css('btn',`
.nu-btn{display:inline-flex;align-items:center;justify-content:center;gap:var(--space-2);font-family:var(--font-sans);font-weight:var(--weight-medium);border:1px solid transparent;border-radius:var(--radius-md);cursor:pointer;white-space:nowrap;transition:background var(--duration-fast) var(--ease-out),border-color var(--duration-fast) var(--ease-out),color var(--duration-fast) var(--ease-out)}
.nu-btn:disabled{opacity:.5;cursor:not-allowed}
.nu-btn--sm{min-height:32px;padding:0 var(--space-3);font-size:var(--text-sm)}
.nu-btn--md{min-height:40px;padding:0 var(--space-4);font-size:var(--text-sm)}
.nu-btn--lg{min-height:48px;padding:0 var(--space-5);font-size:var(--text-base)}
.nu-btn--primary{background:var(--color-accent);color:var(--color-accent-text)}
.nu-btn--primary:hover:not(:disabled){background:var(--color-accent-hover)}
.nu-btn--primary:active:not(:disabled){background:var(--color-accent-active)}
.nu-btn--secondary{background:var(--color-surface);color:var(--color-text);border-color:var(--color-border-strong)}
.nu-btn--secondary:hover:not(:disabled){background:var(--color-bg-subtle)}
.nu-btn--ghost{background:transparent;color:var(--color-text-muted)}
.nu-btn--ghost:hover:not(:disabled){background:var(--color-bg-muted);color:var(--color-text)}
.nu-btn--danger{background:var(--color-surface);color:var(--color-danger);border-color:var(--color-danger)}
.nu-btn--danger:hover:not(:disabled){background:var(--color-danger-subtle)}
.nu-btn--block{width:100%}
`);
export function Button({variant='secondary',size='md',icon,block=false,children,className='',...rest}){
  return <button className={`nu-btn nu-btn--${variant} nu-btn--${size}${block?' nu-btn--block':''} ${className}`} {...rest}>{icon&&<Icon name={icon} size={size==='lg'?18:16}/>}{children}</button>;
}
```

### Select

Props contract — `components/primitives/Select.d.ts`:

```ts
import * as React from 'react';
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement>{
  options?: Array<string|{value:string;label:string}>;
}
/** Native select styled to the token set. Always paired with a visible field label. */
export declare function Select(props: SelectProps): JSX.Element;
```

Reference implementation — `components/primitives/Select.jsx`:

```jsx
import React from 'react';
import {css} from '../css.js';
import {Icon} from './Icon.jsx';
css('select',`
.nu-select{position:relative;display:flex;align-items:center;width:100%}
.nu-select__el{appearance:none;width:100%;min-height:40px;padding:0 var(--space-7) 0 var(--space-3);background:var(--color-surface);border:1px solid var(--color-border-strong);border-radius:var(--radius-md);font-family:var(--font-sans);font-size:var(--text-sm);color:var(--color-text);cursor:pointer}
.nu-select__el:hover{border-color:var(--color-text-subtle)}
.nu-select__chev{position:absolute;right:var(--space-3);color:var(--color-text-muted);pointer-events:none}
`);
export function Select({options=[],className='',...rest}){
  return (
    <span className={`nu-select ${className}`}>
      <select className="nu-select__el" {...rest}>
        {options.map(o=>{const v=typeof o==='string'?o:o.value,l=typeof o==='string'?o:o.label;return <option key={v} value={v}>{l}</option>;})}
      </select>
      <Icon className="nu-select__chev" name="chevron-down" size={16}/>
    </span>
  );
}
```

### FieldLabel

Props contract — `components/primitives/FieldLabel.d.ts`:

```ts
import * as React from 'react';
export interface FieldLabelProps extends React.HTMLAttributes<HTMLDivElement>{
  label?: React.ReactNode;
  hint?: React.ReactNode;
  /** Replaces the hint and renders in warning colour. */
  warning?: React.ReactNode;
}
/** Settings-rail field wrapper: small uppercase label, control, optional hint or warning line. */
export declare function FieldLabel(props: FieldLabelProps): JSX.Element;
```

Reference implementation — `components/primitives/FieldLabel.jsx`:

```jsx
import React from 'react';
import {css} from '../css.js';
css('fieldlabel',`
.nu-fl{display:flex;flex-direction:column;gap:var(--space-2)}
.nu-fl__label{font-size:var(--text-xs);line-height:var(--leading-xs);font-weight:var(--weight-semibold);letter-spacing:0.02em;text-transform:uppercase;color:var(--color-text-muted)}
.nu-fl__hint{font-size:var(--text-xs);line-height:var(--leading-xs);color:var(--color-text-subtle)}
.nu-fl__warn{font-size:var(--text-xs);line-height:var(--leading-xs);color:var(--color-warning)}
`);
export function FieldLabel({label,hint,warning,children,className='',...rest}){
  return (
    <div className={`nu-fl ${className}`} {...rest}>
      {label&&<span className="nu-fl__label">{label}</span>}
      {children}
      {warning?<span className="nu-fl__warn">{warning}</span>:hint?<span className="nu-fl__hint">{hint}</span>:null}
    </div>
  );
}
```

### Chip

Props contract — `components/primitives/Chip.d.ts`:

```ts
import * as React from 'react';
export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement>{
  selected?: boolean;
}
/** Preset toggle used by PresetPicker (20/50/100/200/500KB/1MB). Mono tabular label, 32px min height / 44px min width. */
export declare function Chip(props: ChipProps): JSX.Element;
```

Reference implementation — `components/primitives/Chip.jsx`:

```jsx
import React from 'react';
import {css} from '../css.js';
css('chip',`
.nu-chip{min-height:32px;min-width:44px;padding:0 var(--space-3);display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--color-border-strong);border-radius:var(--radius-full);background:var(--color-surface);color:var(--color-text);font-family:var(--font-mono);font-variant-numeric:tabular-nums;font-size:var(--text-xs);cursor:pointer;transition:background var(--duration-fast) var(--ease-out),border-color var(--duration-fast) var(--ease-out),color var(--duration-fast) var(--ease-out)}
.nu-chip:hover{background:var(--color-bg-subtle)}
.nu-chip--selected{background:var(--color-accent);border-color:var(--color-accent);color:var(--color-accent-text)}
`);
export function Chip({selected=false,children,className='',...rest}){
  return <button type="button" aria-pressed={selected} className={`nu-chip${selected?' nu-chip--selected':''} ${className}`} {...rest}>{children}</button>;
}
```

### Toggle

Props contract — `components/primitives/Toggle.d.ts`:

```ts
import * as React from 'react';
export interface ToggleProps extends React.InputHTMLAttributes<HTMLInputElement>{
  /** `checkbox` for independent options, `radio` for mode selection. */
  type?: 'checkbox'|'radio';
  label?: React.ReactNode;
  hint?: React.ReactNode;
}
/** Checkbox / radio control for the settings rail (metadata options, mode selection). */
export declare function Toggle(props: ToggleProps): JSX.Element;
```

Reference implementation — `components/primitives/Toggle.jsx`:

```jsx
import React from 'react';
import {css} from '../css.js';
css('toggle',`
.nu-tg{display:flex;align-items:flex-start;gap:var(--space-2);min-height:24px;cursor:pointer;font-size:var(--text-sm);line-height:var(--leading-sm);color:var(--color-text)}
.nu-tg input{position:absolute;opacity:0;width:0;height:0}
.nu-tg__box{position:relative;flex:0 0 auto;width:18px;height:18px;margin-top:2px;border:1px solid var(--color-border-strong);border-radius:var(--radius-sm);background:var(--color-surface)}
.nu-tg--radio .nu-tg__box{border-radius:var(--radius-full)}
.nu-tg input:checked+.nu-tg__box{background:var(--color-accent);border-color:var(--color-accent)}
.nu-tg--radio input:checked+.nu-tg__box{background:var(--color-surface);border-width:5px}
.nu-tg input:focus-visible+.nu-tg__box{outline:var(--focus-ring-width) solid var(--color-focus-ring);outline-offset:var(--focus-ring-offset)}
.nu-tg__box::after{content:"";position:absolute;left:5px;top:1.5px;width:5px;height:9px;border:solid var(--color-accent-text);border-width:0 2px 2px 0;transform:rotate(45deg) scale(0)}
.nu-tg input:checked+.nu-tg__box::after{transform:rotate(45deg) scale(1)}
.nu-tg--radio .nu-tg__box::after{display:none}
.nu-tg__hint{display:block;font-size:var(--text-xs);line-height:var(--leading-xs);color:var(--color-text-subtle)}
`);
export function Toggle({type='checkbox',label,hint,className='',...rest}){
  return (
    <label className={`nu-tg${type==='radio'?' nu-tg--radio':''} ${className}`}>
      <input type={type} {...rest}/>
      <span className="nu-tg__box"/>
      <span>{label}{hint&&<span className="nu-tg__hint">{hint}</span>}</span>
    </label>
  );
}
```

---

## tool

### Dropzone

Props contract — `components/tool/Dropzone.d.ts`:

```ts
import * as React from 'react';
export interface DropzoneProps extends React.HTMLAttributes<HTMLDivElement>{
  /** `idle` · `dragover` · `error`. Loading/hasFiles are handled by the shell. */
  state?: 'idle'|'dragover'|'error';
  /** Source format from the route slug, e.g. "HEIC". */
  format?: string;
  constraints?: string;
  /** Collapsed "+ Add more files" bar shown once files exist. */
  slim?: boolean;
}
/** The product's largest, highest-contrast element on an idle tool route. Accepts drop, click, paste and folder drop. */
export declare function Dropzone(props: DropzoneProps): JSX.Element;
```

Reference implementation — `components/tool/Dropzone.jsx`:

```jsx
import React from 'react';
import {css} from '../css.js';
import {Icon} from '../primitives/Icon.jsx';
css('dropzone',`
.nu-dz{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:var(--space-2);min-height:280px;padding:var(--space-6);border:2px dashed var(--color-border-strong);border-radius:var(--radius-lg);background:var(--color-bg-subtle);cursor:pointer;text-align:center;transition:border-color var(--duration-fast) var(--ease-out),background var(--duration-fast) var(--ease-out),transform var(--duration-fast) var(--ease-out)}
.nu-dz:hover{border-color:var(--color-text-subtle)}
.nu-dz--dragover{border-color:var(--color-accent);background:var(--color-accent-subtle);transform:scale(1.005)}
.nu-dz--error{border-color:var(--color-danger);background:var(--color-danger-subtle)}
.nu-dz__icon{color:var(--color-text-muted)}
.nu-dz--dragover .nu-dz__icon{color:var(--color-accent)}
.nu-dz__title{font-size:var(--text-xl);line-height:var(--leading-xl);font-weight:var(--weight-semibold);letter-spacing:var(--tracking-tight);color:var(--color-text)}
.nu-dz__sub{font-size:var(--text-sm);line-height:var(--leading-sm);color:var(--color-text-muted)}
.nu-dz__constraints{margin-top:var(--space-3);font-size:var(--text-sm);line-height:var(--leading-sm);color:var(--color-text-subtle)}
.nu-dz--slim{flex-direction:row;justify-content:flex-start;gap:var(--space-2);min-height:44px;padding:0 var(--space-4);border-width:1px;border-radius:var(--radius-md);text-align:left;font-size:var(--text-sm);font-weight:var(--weight-medium);color:var(--color-text-muted)}
`);
export function Dropzone({state='idle',format='HEIC',constraints='No file size limit · No sign-up · No upload',slim=false,onClick,...rest}){
  if(slim) return <div role="button" tabIndex={0} aria-label="Add more images" onClick={onClick} className="nu-dz nu-dz--slim" {...rest}><Icon name="plus" size={16}/>Add more files</div>;
  return (
    <div role="button" tabIndex={0} aria-label="Choose images to convert" aria-describedby="nu-dz-constraints"
      onClick={onClick} className={`nu-dz${state==='dragover'?' nu-dz--dragover':''}${state==='error'?' nu-dz--error':''}`} {...rest}>
      <Icon className="nu-dz__icon" name="upload" size={32}/>
      <span className="nu-dz__title">{state==='dragover'?`Release to add ${format} files`:`Drop ${format} files here`}</span>
      <span className="nu-dz__sub">or click to browse · or paste from clipboard</span>
      <span id="nu-dz-constraints" className="nu-dz__constraints">{constraints}</span>
    </div>
  );
}
```

### FileGrid

Props contract — `components/tool/FileGrid.d.ts`:

```ts
import * as React from 'react';
import type {FileCardProps} from './FileCard';
export interface FileGridProps extends React.HTMLAttributes<HTMLElement>{
  files?: FileCardProps[];
  title?: string;
  onAdd?: () => void;
}
/** Centre pane: responsive grid of FileCards with the collapsed add-more bar in the header. */
export declare function FileGrid(props: FileGridProps): JSX.Element;
```

Reference implementation — `components/tool/FileGrid.jsx`:

```jsx
import React from 'react';
import {css} from '../css.js';
import {FileCard} from './FileCard.jsx';
import {Dropzone} from './Dropzone.jsx';
css('filegrid',`
.nu-fg{display:flex;flex-direction:column;gap:var(--space-3);min-height:0}
.nu-fg__head{display:flex;align-items:center;gap:var(--space-3)}
.nu-fg__title{font-size:var(--text-sm);line-height:var(--leading-sm);font-weight:var(--weight-semibold);letter-spacing:0.02em;text-transform:uppercase;color:var(--color-text-muted)}
.nu-fg__grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:var(--space-3);overflow:auto;padding-right:var(--space-1)}
`);
export function FileGrid({files=[],title='Files',onAdd,className='',...rest}){
  return (
    <section className={`nu-fg ${className}`} aria-label="Converted files" {...rest}>
      <div className="nu-fg__head">
        <h2 className="nu-fg__title">{title} ({files.length})</h2>
        <span style={{marginLeft:'auto',minWidth:160}}><Dropzone slim onClick={onAdd}/></span>
      </div>
      <div className="nu-fg__grid">{files.map((f,i)=><FileCard key={f.name+i} {...f}/>)}</div>
    </section>
  );
}
```

### FileCard

Props contract — `components/tool/FileCard.d.ts`:

```ts
import * as React from 'react';
export interface FileCardProps extends React.HTMLAttributes<HTMLDivElement>{
  name?: string;
  state?: 'queued'|'processing'|'done'|'warning'|'failed';
  /** Original size, e.g. "4.2 MB". */
  from?: string;
  /** Output size, e.g. "98 KB". */
  to?: string;
  /** e.g. "76% ↓". */
  savings?: string;
  /** Trailing mono detail, e.g. "quality 71 · 3024×4032". */
  meta?: string;
  /** Plain-language cause; pair with `errorCode`. */
  error?: React.ReactNode;
  /** e.g. "E_TARGET_UNREACHABLE". */
  errorCode?: string;
  /** Label for the one-tap fix on a warning card. */
  action?: string;
  pass?: number;
  passTotal?: number;
  /** Current achieved size during the search, e.g. "112 KB". */
  current?: string;
}
/** Fixed 212px-tall job card — height must not change between states or the grid reflows under the cursor. */
export declare function FileCard(props: FileCardProps): JSX.Element;
```

Reference implementation — `components/tool/FileCard.jsx`:

```jsx
import React from 'react';
import {css} from '../css.js';
import {Icon} from '../primitives/Icon.jsx';
import {Button} from '../primitives/Button.jsx';
import {StatusBadge} from './StatusBadge.jsx';
import {ProgressBar} from './ProgressBar.jsx';
css('filecard',`
.nu-fc{position:relative;display:flex;flex-direction:column;height:212px;border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);overflow:hidden}
.nu-fc--warning{border-color:var(--color-warning)}
.nu-fc--failed{border-color:var(--color-danger)}
.nu-fc__thumb{position:relative;height:104px;flex:0 0 auto;background:var(--color-bg-muted);display:flex;align-items:center;justify-content:center;color:var(--color-text-subtle)}
.nu-fc--queued .nu-fc__thumb{opacity:.55}
.nu-fc__badge{position:absolute;top:var(--space-2);left:var(--space-2)}
.nu-fc__body{flex:1;display:flex;flex-direction:column;gap:var(--space-1);padding:var(--space-3);min-height:0}
.nu-fc__name{font-size:var(--text-xs);line-height:var(--leading-xs);color:var(--color-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;direction:rtl;text-align:left}
.nu-fc__sizes{font-family:var(--font-mono);font-variant-numeric:tabular-nums;font-size:var(--text-sm);line-height:var(--leading-sm);color:var(--color-text)}
.nu-fc__meta{font-family:var(--font-mono);font-variant-numeric:tabular-nums;font-size:var(--text-xs);line-height:var(--leading-xs);color:var(--color-text-muted)}
.nu-fc__saving{color:var(--color-success)}
.nu-fc__error{font-size:var(--text-xs);line-height:var(--leading-xs);color:var(--color-text-muted)}
.nu-fc__actions{display:flex;gap:var(--space-1);margin-top:auto}
`);
export function FileCard({name='IMG_0001.HEIC',state='queued',from,to,savings,meta,error,errorCode,action,pass,passTotal=8,current,className='',...rest}){
  return (
    <div className={`nu-fc nu-fc--${state} ${className}`} {...rest}>
      <div className="nu-fc__thumb"><Icon name="image" size={26}/><span className="nu-fc__badge"><StatusBadge state={state}/></span></div>
      <div className="nu-fc__body">
        <span className="nu-fc__name" title={name}>{name}</span>
        {state==='processing'&&<ProgressBar value={pass} max={passTotal} caption={`pass ${pass}/${passTotal} · ${current}`}/>}
        {(state==='done'||state==='warning')&&<><span className="nu-fc__sizes">{from} → {to}</span><span className="nu-fc__meta"><span className="nu-fc__saving">{savings}</span>{meta?' · '+meta:''}</span></>}
        {state==='queued'&&<span className="nu-fc__meta">{from}</span>}
        {(state==='failed'||state==='warning')&&<span className="nu-fc__error">{errorCode?<b>{errorCode}: </b>:null}{error}</span>}
        <div className="nu-fc__actions">
          {state==='done'&&<><Button size="sm" variant="ghost" icon="download">Save</Button><Button size="sm" variant="ghost" icon="columns-2">Compare</Button></>}
          {state==='warning'&&<Button size="sm" variant="secondary" icon="maximize-2">{action||'Allow resizing'}</Button>}
          {state==='failed'&&<><Button size="sm" variant="secondary" icon="rotate-ccw">Retry</Button><Button size="sm" variant="ghost" icon="trash-2">Remove</Button></>}
        </div>
      </div>
    </div>
  );
}
```

### StatusBadge

Props contract — `components/tool/StatusBadge.d.ts`:

```ts
import * as React from 'react';
export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement>{
  state?: 'queued'|'processing'|'done'|'warning'|'failed';
  /** Overrides the default text. State is never conveyed by colour alone. */
  label?: React.ReactNode;
}
/** Icon + text job state. Text is mandatory — WCAG 1.4.1. */
export declare function StatusBadge(props: StatusBadgeProps): JSX.Element;
```

Reference implementation — `components/tool/StatusBadge.jsx`:

```jsx
import React from 'react';
import {css} from '../css.js';
import {Icon} from '../primitives/Icon.jsx';
css('statusbadge',`
.nu-sb{display:inline-flex;align-items:center;gap:var(--space-1);padding:2px var(--space-2);border-radius:var(--radius-full);font-size:var(--text-xs);line-height:var(--leading-xs);font-weight:var(--weight-medium)}
.nu-sb--queued{background:var(--color-bg-muted);color:var(--color-text-muted)}
.nu-sb--processing{background:var(--color-info-subtle);color:var(--color-info)}
.nu-sb--done{background:var(--color-success-subtle);color:var(--color-success)}
.nu-sb--warning{background:var(--color-warning-subtle);color:var(--color-warning)}
.nu-sb--failed{background:var(--color-danger-subtle);color:var(--color-danger)}
`);
const CFG={queued:['clock','Queued'],processing:['loader','Processing'],done:['check','Done'],warning:['alert-triangle','Warning'],failed:['x','Failed']};
export function StatusBadge({state='queued',label,className='',...rest}){
  const [icon,fallback]=CFG[state]||CFG.queued;
  return <span className={`nu-sb nu-sb--${state} ${className}`} {...rest}><Icon name={icon} size={12}/>{label||fallback}</span>;
}
```

### ProgressBar

Props contract — `components/tool/ProgressBar.d.ts`:

```ts
import * as React from 'react';
export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement>{
  value?: number;
  max?: number;
  /** Only legitimate during codec download — never for encode passes. */
  indeterminate?: boolean;
  /** Honest caption, e.g. "pass 4/8 · 112 KB". Mono, tabular. */
  caption?: React.ReactNode;
  label?: string;
}
/** Determinate progress with a real pass counter. Never a fake bar (§1.4). */
export declare function ProgressBar(props: ProgressBarProps): JSX.Element;
```

Reference implementation — `components/tool/ProgressBar.jsx`:

```jsx
import React from 'react';
import {css} from '../css.js';
css('progressbar',`
.nu-pb{width:100%}
.nu-pb__track{height:4px;border-radius:var(--radius-full);background:var(--color-bg-muted);overflow:hidden}
.nu-pb__fill{height:100%;border-radius:var(--radius-full);background:var(--color-accent);transition:width var(--duration-base) var(--ease-out)}
.nu-pb__indeterminate{width:40%;animation:nu-pb-slide 1.1s var(--ease-out) infinite}
@keyframes nu-pb-slide{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}
.nu-pb__caption{margin-top:var(--space-1);font-family:var(--font-mono);font-variant-numeric:tabular-nums;font-size:var(--text-xs);line-height:var(--leading-xs);color:var(--color-text-muted)}
`);
export function ProgressBar({value=0,max=100,indeterminate=false,caption,label='Conversion progress',className='',...rest}){
  const pct=Math.max(0,Math.min(100,(value/max)*100));
  return (
    <div className={`nu-pb ${className}`} {...rest}>
      <div className="nu-pb__track" role="progressbar" aria-label={label} aria-valuenow={indeterminate?undefined:Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className={`nu-pb__fill${indeterminate?' nu-pb__indeterminate':''}`} style={indeterminate?undefined:{width:pct+'%'}}/>
      </div>
      {caption&&<div className="nu-pb__caption">{caption}</div>}
    </div>
  );
}
```

### BatchSummary

Props contract — `components/tool/BatchSummary.d.ts`:

```ts
import * as React from 'react';
export interface BatchSummaryProps extends React.HTMLAttributes<HTMLDivElement>{
  done?: number; running?: number; failed?: number;
  /** Batch input total, e.g. "46.1 MB". */
  from?: string;
  /** Batch output total, e.g. "1.1 MB". */
  to?: string;
  /** e.g. "97.6%". */
  saved?: string;
  onClear?: () => void;
  onDownload?: () => void;
}
/** Sticky bottom bar: honest counts, savings stat, and the single primary action of the screen. */
export declare function BatchSummary(props: BatchSummaryProps): JSX.Element;
```

Reference implementation — `components/tool/BatchSummary.jsx`:

```jsx
import React from 'react';
import {css} from '../css.js';
import {Button} from '../primitives/Button.jsx';
css('batchsummary',`
.nu-bs{display:flex;align-items:center;gap:var(--space-4);padding:var(--space-3) var(--space-4);border-top:1px solid var(--color-border);background:var(--color-surface)}
.nu-bs__counts{font-size:var(--text-sm);line-height:var(--leading-sm);color:var(--color-text-muted)}
.nu-bs__stat{font-family:var(--font-mono);font-variant-numeric:tabular-nums;font-size:var(--text-sm);line-height:var(--leading-sm);color:var(--color-text)}
.nu-bs__saved{color:var(--color-success)}
.nu-bs__actions{margin-left:auto;display:flex;gap:var(--space-2)}
`);
export function BatchSummary({done=0,running=0,failed=0,from,to,saved,onClear,onDownload,className='',...rest}){
  return (
    <div className={`nu-bs ${className}`} role="status" aria-live="polite" {...rest}>
      <div>
        <div className="nu-bs__counts">{done} done · {running} running · {failed} failed</div>
        <div className="nu-bs__stat">{from} → {to} <span className="nu-bs__saved">saved {saved}</span></div>
      </div>
      <div className="nu-bs__actions">
        <Button variant="ghost" onClick={onClear}>Clear</Button>
        <Button variant="primary" icon="download" onClick={onDownload}>Download all (ZIP)</Button>
      </div>
    </div>
  );
}
```

### PreviewPane

Props contract — `components/tool/PreviewPane.d.ts`:

```ts
import * as React from 'react';
export interface PreviewPaneProps extends React.HTMLAttributes<HTMLElement>{
  /** Selected file name. */
  name?: string;
  /** Label/value pairs, e.g. [["Size","4.2 MB → 98 KB"],["Quality","71"]]. Values render mono + tabular. */
  rows?: Array<[string,string]>;
  onCompare?: () => void;
}
/** Right pane (~320px): split original/output stage plus the numeric readout for the selected file. */
export declare function PreviewPane(props: PreviewPaneProps): JSX.Element;
```

Reference implementation — `components/tool/PreviewPane.jsx`:

```jsx
import React from 'react';
import {css} from '../css.js';
import {Button} from '../primitives/Button.jsx';
css('preview',`
.nu-pv{display:flex;flex-direction:column;gap:var(--space-3);padding:var(--space-4);border-left:1px solid var(--color-border);background:var(--color-bg-subtle);overflow:auto}
.nu-pv__title{font-size:var(--text-sm);line-height:var(--leading-sm);font-weight:var(--weight-semibold);letter-spacing:0.02em;text-transform:uppercase;color:var(--color-text-muted)}
.nu-pv__stage{position:relative;height:212px;border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-bg-muted);overflow:hidden;display:flex}
.nu-pv__half{flex:1;display:flex;align-items:center;justify-content:center;font-size:var(--text-xs);color:var(--color-text-subtle)}
.nu-pv__half+.nu-pv__half{border-left:2px solid var(--color-border-strong)}
.nu-pv__handle{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:24px;height:24px;border-radius:var(--radius-full);background:var(--color-surface);border:1px solid var(--color-border-strong);display:flex;align-items:center;justify-content:center;font-size:var(--text-xs);color:var(--color-text-muted)}
.nu-pv__rows{display:flex;flex-direction:column;gap:var(--space-2)}
.nu-pv__row{display:flex;justify-content:space-between;gap:var(--space-3);font-size:var(--text-xs);line-height:var(--leading-xs);color:var(--color-text-muted)}
.nu-pv__val{font-family:var(--font-mono);font-variant-numeric:tabular-nums;color:var(--color-text)}
`);
export function PreviewPane({name,rows=[],onCompare,className='',...rest}){
  return (
    <aside className={`nu-pv ${className}`} aria-label="Preview" {...rest}>
      <h2 className="nu-pv__title">Preview</h2>
      <div className="nu-pv__stage">
        <div className="nu-pv__half">original</div>
        <div className="nu-pv__half">output</div>
        <span className="nu-pv__handle">⇄</span>
      </div>
      {name&&<div className="nu-pv__row"><span>File</span><span className="nu-pv__val">{name}</span></div>}
      <div className="nu-pv__rows">
        {rows.map(([k,v])=><div className="nu-pv__row" key={k}><span>{k}</span><span className="nu-pv__val">{v}</span></div>)}
      </div>
      <Button variant="secondary" icon="maximize-2" block onClick={onCompare}>Compare full size</Button>
    </aside>
  );
}
```

### PrivacyIndicator

Props contract — `components/tool/PrivacyIndicator.d.ts`:

```ts
import * as React from 'react';
export interface PrivacyIndicatorProps extends React.HTMLAttributes<HTMLDivElement>{
  /** Live counter appended during processing, e.g. "7 of 12 processed on this device". */
  progress?: string;
  /** Drop the strip background/border when it sits inside another surface. */
  bare?: boolean;
  href?: string;
}
/** Deliberately understated privacy line. Never a badge, shield graphic or trust seal. */
export declare function PrivacyIndicator(props: PrivacyIndicatorProps): JSX.Element;
```

Reference implementation — `components/tool/PrivacyIndicator.jsx`:

```jsx
import React from 'react';
import {css} from '../css.js';
import {Icon} from '../primitives/Icon.jsx';
css('privacyindicator',`
.nu-pi{display:flex;align-items:center;gap:var(--space-2);padding:var(--space-2) var(--space-4);font-size:var(--text-xs);line-height:var(--leading-xs);color:var(--color-text-muted);background:var(--color-bg-subtle);border-top:1px solid var(--color-border)}
.nu-pi--bare{background:transparent;border-top:0;padding-left:0;padding-right:0}
.nu-pi__link{margin-left:auto;color:var(--color-accent)}
`);
export function PrivacyIndicator({progress,bare=false,href='/how-it-works',className='',...rest}){
  return (
    <div className={`nu-pi${bare?' nu-pi--bare':''} ${className}`} {...rest}>
      <Icon name="lock" size={13}/>
      <span>Processing locally · 0 bytes sent{progress?` · ${progress}`:''}</span>
      <a className="nu-pi__link" href={href}>How to verify this →</a>
    </div>
  );
}
```

### CompareView

Props contract — `components/tool/CompareView.d.ts`:

```ts
import * as React from 'react';
export interface CompareViewProps extends React.HTMLAttributes<HTMLDivElement>{
  open?: boolean;
  name?: string;
  /** Divider position, 0–100. Also operable from the keyboard via the range input. */
  position?: number;
  /** Mono readout for the original, e.g. "4.2 MB · 3024×4032". */
  left?: string;
  /** Mono readout for the output. */
  right?: string;
  onClose?: () => void;
}
/** Modal original-vs-output comparison with a draggable divider and a keyboard-operable equivalent (WCAG 2.5.7). */
export declare function CompareView(props: CompareViewProps): JSX.Element;
```

Reference implementation — `components/tool/CompareView.jsx`:

```jsx
import React from 'react';
import {css} from '../css.js';
import {Button} from '../primitives/Button.jsx';
css('compare',`
.nu-cv__scrim{position:fixed;inset:0;z-index:60;background:rgb(16 22 28 / .55);display:flex;align-items:center;justify-content:center;padding:var(--space-6)}
.nu-cv{width:min(1040px,100%);background:var(--color-surface);border-radius:var(--radius-lg);box-shadow:var(--shadow-lg);display:flex;flex-direction:column;overflow:hidden}
.nu-cv__head{display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3) var(--space-4);border-bottom:1px solid var(--color-border)}
.nu-cv__name{font-size:var(--text-sm);font-weight:var(--weight-semibold);color:var(--color-text)}
.nu-cv__stage{position:relative;height:420px;background:var(--color-bg-muted);overflow:hidden;display:flex}
.nu-cv__side{display:flex;align-items:center;justify-content:center;color:var(--color-text-subtle);font-size:var(--text-sm)}
.nu-cv__divider{position:absolute;top:0;bottom:0;width:2px;background:var(--color-border-strong);cursor:col-resize}
.nu-cv__knob{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:32px;height:32px;border-radius:var(--radius-full);background:var(--color-surface);border:1px solid var(--color-border-strong);display:flex;align-items:center;justify-content:center;color:var(--color-text-muted);font-size:var(--text-sm)}
.nu-cv__foot{display:flex;align-items:center;gap:var(--space-5);padding:var(--space-3) var(--space-4);border-top:1px solid var(--color-border)}
.nu-cv__stat{font-family:var(--font-mono);font-variant-numeric:tabular-nums;font-size:var(--text-sm);color:var(--color-text)}
.nu-cv__label{font-size:var(--text-xs);color:var(--color-text-muted)}
`);
export function CompareView({open=true,name='IMG_20260714_183042.HEIC',position=52,left='4.2 MB · 3024×4032',right='98 KB · 3024×4032 · quality 71',onClose,className='',...rest}){
  const [pos,setPos]=React.useState(position);
  if(!open)return null;
  return (
    <div className="nu-cv__scrim" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Compare ${name}`} className={`nu-cv ${className}`} onClick={e=>e.stopPropagation()} {...rest}>
        <div className="nu-cv__head">
          <span className="nu-cv__name">{name}</span>
          <span style={{marginLeft:'auto',display:'flex',gap:'var(--space-2)'}}>
            <Button size="sm" variant="ghost" icon="download">Save output</Button>
            <Button size="sm" variant="ghost" icon="x" onClick={onClose}>Close</Button>
          </span>
        </div>
        <div className="nu-cv__stage">
          <div className="nu-cv__side" style={{width:pos+'%',background:'var(--color-bg-muted)'}}>original</div>
          <div className="nu-cv__side" style={{flex:1,background:'var(--color-bg-subtle)'}}>output</div>
          <div className="nu-cv__divider" style={{left:pos+'%'}}><span className="nu-cv__knob">⇄</span></div>
        </div>
        <div style={{padding:'var(--space-3) var(--space-4)'}}>
          <input type="range" min={0} max={100} value={pos} aria-label="Comparison divider position" onChange={e=>setPos(Number(e.target.value))} style={{width:'100%',accentColor:'var(--color-accent)',height:24}}/>
        </div>
        <div className="nu-cv__foot">
          <div><div className="nu-cv__label">Original</div><div className="nu-cv__stat">{left}</div></div>
          <div><div className="nu-cv__label">Output</div><div className="nu-cv__stat">{right}</div></div>
        </div>
      </div>
    </div>
  );
}
```

### MetadataPanel

Props contract — `components/tool/MetadataPanel.d.ts`:

```ts
import * as React from 'react';
export interface MetadataPanelProps extends React.HTMLAttributes<HTMLElement>{
  open?: boolean;
  name?: string;
  /** [key, value, stripped?] triples. Stripped rows render struck-through with "· removed". */
  rows?: Array<[string,string,boolean?]>;
  onClose?: () => void;
}
/** Right drawer listing EXIF/GPS fields and what stripping will remove. */
export declare function MetadataPanel(props: MetadataPanelProps): JSX.Element;
```

Reference implementation — `components/tool/MetadataPanel.jsx`:

```jsx
import React from 'react';
import {css} from '../css.js';
import {Button} from '../primitives/Button.jsx';
css('metadatapanel',`
.nu-md{position:fixed;top:0;right:0;bottom:0;z-index:55;width:min(420px,100%);display:flex;flex-direction:column;background:var(--color-surface);border-left:1px solid var(--color-border);box-shadow:var(--shadow-lg)}
.nu-md__head{display:flex;align-items:center;gap:var(--space-3);padding:var(--space-4);border-bottom:1px solid var(--color-border)}
.nu-md__title{font-size:var(--text-base);font-weight:var(--weight-semibold);color:var(--color-text)}
.nu-md__body{flex:1;overflow:auto;padding:var(--space-4);display:flex;flex-direction:column;gap:var(--space-2)}
.nu-md__row{display:grid;grid-template-columns:132px 1fr;gap:var(--space-3);padding:var(--space-2) 0;border-bottom:1px solid var(--color-border);font-size:var(--text-xs);line-height:var(--leading-xs)}
.nu-md__k{color:var(--color-text-muted)}
.nu-md__v{font-family:var(--font-mono);font-variant-numeric:tabular-nums;color:var(--color-text);word-break:break-word}
.nu-md__v--stripped{color:var(--color-text-subtle);text-decoration:line-through}
.nu-md__foot{padding:var(--space-4);border-top:1px solid var(--color-border);display:flex;gap:var(--space-2)}
`);
export function MetadataPanel({open=true,name='IMG_20260714_183042.HEIC',rows=[],onClose,className='',...rest}){
  if(!open)return null;
  return (
    <aside role="dialog" aria-label={`Metadata for ${name}`} className={`nu-md ${className}`} {...rest}>
      <div className="nu-md__head">
        <span className="nu-md__title">Metadata</span>
        <span style={{marginLeft:'auto'}}><Button size="sm" variant="ghost" icon="x" onClick={onClose}>Close</Button></span>
      </div>
      <div className="nu-md__body">
        <div style={{fontSize:'var(--text-xs)',color:'var(--color-text-muted)'}}>{name}</div>
        {rows.map(([k,v,stripped])=>(
          <div className="nu-md__row" key={k}>
            <span className="nu-md__k">{k}</span>
            <span className={`nu-md__v${stripped?' nu-md__v--stripped':''}`}>{v}{stripped?' · removed':''}</span>
          </div>))}
      </div>
      <div className="nu-md__foot">
        <Button variant="secondary" block icon="eraser">Strip all metadata</Button>
        <Button variant="ghost" icon="copy">Copy</Button>
      </div>
    </aside>
  );
}
```

---

## config

### ConfigPanel

Props contract — `components/config/ConfigPanel.d.ts`:

```ts
import * as React from 'react';
export interface ConfigPanelProps extends React.HTMLAttributes<HTMLElement>{
  format?: string;
  mode?: 'target'|'quality';
  target?: number|string;
  unit?: 'KB'|'MB';
  preset?: string;
  quality?: number;
  resize?: string;
  strip?: boolean;
  keepRotation?: boolean;
  /** Preset chip columns: 3 in the desktop rail, 4 on mobile. */
  columns?: number;
  /** Called as (key, value) for every control in the rail. */
  onChange?: (key:string, value:any) => void;
}
/** Left settings rail (~260px): output, mode, target/quality, resize, metadata, advanced. Secondary to the dropzone and collapsible on mobile. */
export declare function ConfigPanel(props: ConfigPanelProps): JSX.Element;
```

Reference implementation — `components/config/ConfigPanel.jsx`:

```jsx
import React from 'react';
import {css} from '../css.js';
import {Icon} from '../primitives/Icon.jsx';
import {FormatSelect} from './FormatSelect.jsx';
import {ModeToggle} from './ModeToggle.jsx';
import {TargetSizeControl} from './TargetSizeControl.jsx';
import {QualityControl} from './QualityControl.jsx';
import {ResizeControl} from './ResizeControl.jsx';
import {MetadataToggle} from './MetadataToggle.jsx';
css('configpanel',`
.nu-cfg{display:flex;flex-direction:column;gap:var(--space-5);padding:var(--space-4);border-right:1px solid var(--color-border);background:var(--color-bg-subtle);overflow:auto}
.nu-cfg__title{font-size:var(--text-sm);line-height:var(--leading-sm);font-weight:var(--weight-semibold);letter-spacing:0.02em;text-transform:uppercase;color:var(--color-text-muted)}
.nu-cfg__adv{display:flex;align-items:center;gap:var(--space-2);min-height:32px;margin-top:auto;padding:0;border:0;background:none;cursor:pointer;font-family:var(--font-sans);font-size:var(--text-sm);color:var(--color-text-muted)}
.nu-cfg__adv:hover{color:var(--color-text)}
`);
export function ConfigPanel({format='JPG',mode='target',target=100,unit='KB',preset='100 KB',quality=71,resize='None',strip=true,keepRotation=true,columns=3,onChange=()=>{},className='',...rest}){
  const set=(k)=>(v)=>onChange(k,v);
  return (
    <aside className={`nu-cfg ${className}`} aria-label="Conversion settings" {...rest}>
      <h2 className="nu-cfg__title">Settings</h2>
      <FormatSelect value={format} onChange={set('format')}/>
      <ModeToggle value={mode} onChange={set('mode')}/>
      {mode==='target'
        ? <TargetSizeControl value={target} unit={unit} preset={preset} columns={columns} onChange={set('target')} onUnitChange={set('unit')} onPreset={set('preset')}/>
        : <QualityControl value={quality} onChange={set('quality')} estimate="first file ≈ 214 KB"/>}
      <ResizeControl value={resize} onChange={set('resize')} note="Applied only when the target can't be reached otherwise."/>
      <MetadataToggle strip={strip} keepRotation={keepRotation} onStrip={set('strip')} onKeepRotation={set('keepRotation')}/>
      <button type="button" className="nu-cfg__adv">Advanced<Icon name="chevron-right" size={14}/></button>
    </aside>
  );
}
```

### FormatSelect

Props contract — `components/config/FormatSelect.d.ts`:

```ts
import * as React from 'react';
export interface FormatSelectProps{
  value?: string;
  options?: string[];
  onChange?: (value:string) => void;
  label?: string;
}
/** Output-format field. Prefilled from the route slug — the user should never need to touch it. */
export declare function FormatSelect(props: FormatSelectProps): JSX.Element;
```

Reference implementation — `components/config/FormatSelect.jsx`:

```jsx
import React from 'react';
import {FieldLabel} from '../primitives/FieldLabel.jsx';
import {Select} from '../primitives/Select.jsx';
export function FormatSelect({value='JPG',options=['JPG','PNG','WebP','AVIF'],onChange,label='Output'}){
  return <FieldLabel label={label}><Select value={value} aria-label="Output format" onChange={e=>onChange&&onChange(e.target.value)} options={options}/></FieldLabel>;
}
```

### ModeToggle

Props contract — `components/config/ModeToggle.d.ts`:

```ts
import * as React from 'react';
export interface ModeToggleProps{
  value?: 'target'|'quality';
  onChange?: (value:'target'|'quality') => void;
  name?: string;
}
/** Chooses between target-size mode (M-07, the wedge feature) and manual quality. */
export declare function ModeToggle(props: ModeToggleProps): JSX.Element;
```

Reference implementation — `components/config/ModeToggle.jsx`:

```jsx
import React from 'react';
import {Toggle} from '../primitives/Toggle.jsx';
import {FieldLabel} from '../primitives/FieldLabel.jsx';
export function ModeToggle({value='target',onChange,name='nu-mode'}){
  return (
    <FieldLabel label="Mode">
      <div style={{display:'flex',flexDirection:'column',gap:'var(--space-2)'}}>
        <Toggle type="radio" name={name} checked={value==='target'} onChange={()=>onChange&&onChange('target')} label="Target size"/>
        <Toggle type="radio" name={name} checked={value==='quality'} onChange={()=>onChange&&onChange('quality')} label="Quality"/>
      </div>
    </FieldLabel>
  );
}
```

### QualityControl

Props contract — `components/config/QualityControl.d.ts`:

```ts
import * as React from 'react';
export interface QualityControlProps{
  value?: number;
  /** Codec floor — below 20 output is visibly bad. */
  min?: number;
  /** Codec ceiling — above 95 the size gain is negligible. */
  max?: number;
  /** Live size readout for the previewed file, e.g. "first file ≈ 214 KB". */
  estimate?: string;
  onChange?: (value:number) => void;
}
/** Manual quality slider with a live size readout. Shown when ModeToggle is set to quality. */
export declare function QualityControl(props: QualityControlProps): JSX.Element;
```

Reference implementation — `components/config/QualityControl.jsx`:

```jsx
import React from 'react';
import {css} from '../css.js';
import {FieldLabel} from '../primitives/FieldLabel.jsx';
css('quality',`
.nu-q__row{display:flex;align-items:center;gap:var(--space-3)}
.nu-q__range{flex:1;min-width:0;accent-color:var(--color-accent);height:24px}
.nu-q__val{font-family:var(--font-mono);font-variant-numeric:tabular-nums;font-size:var(--text-sm);color:var(--color-text);width:28px;text-align:right}
.nu-q__est{font-family:var(--font-mono);font-variant-numeric:tabular-nums;font-size:var(--text-xs);color:var(--color-text-muted)}
`);
export function QualityControl({value=71,min=20,max=95,estimate,onChange}){
  return (
    <FieldLabel label="Quality" hint={`Search bounds ${min}–${max}`}>
      <div className="nu-q__row">
        <input className="nu-q__range" type="range" min={min} max={max} value={value} aria-label="Encode quality" onChange={e=>onChange&&onChange(Number(e.target.value))}/>
        <span className="nu-q__val">{value}</span>
      </div>
      {estimate&&<span className="nu-q__est">{estimate}</span>}
    </FieldLabel>
  );
}
```

### TargetSizeControl

Props contract — `components/config/TargetSizeControl.d.ts`:

```ts
import * as React from 'react';
export interface TargetSizeControlProps{
  value?: number|string;
  unit?: 'KB'|'MB';
  /** Currently selected preset chip label. */
  preset?: string;
  /** Post-run readout, e.g. "98 KB / 100 KB ✓". */
  achieved?: string;
  /** Overrides the built-in sub-5 KB warning. */
  warning?: React.ReactNode;
  onChange?: (value:string) => void;
  onUnitChange?: (unit:string) => void;
  onPreset?: (preset:string) => void;
  columns?: number;
}
/** Numeric input + unit select + six preset chips. Drives M-07 target-size mode. */
export declare function TargetSizeControl(props: TargetSizeControlProps): JSX.Element;
```

Reference implementation — `components/config/TargetSizeControl.jsx`:

```jsx
import React from 'react';
import {css} from '../css.js';
import {FieldLabel} from '../primitives/FieldLabel.jsx';
import {Select} from '../primitives/Select.jsx';
import {PresetPicker} from './PresetPicker.jsx';
css('targetsize',`
.nu-ts__row{display:flex;gap:var(--space-2)}
.nu-ts__num{flex:1;min-width:0;min-height:40px;padding:0 var(--space-3);border:1px solid var(--color-border-strong);border-radius:var(--radius-md);background:var(--color-surface);color:var(--color-text);font-family:var(--font-mono);font-variant-numeric:tabular-nums;font-size:var(--text-sm)}
.nu-ts__unit{width:88px}
.nu-ts__achieved{font-family:var(--font-mono);font-variant-numeric:tabular-nums;font-size:var(--text-xs);color:var(--color-success)}
`);
export function TargetSizeControl({value=100,unit='KB',preset='100 KB',achieved,warning,onChange,onUnitChange,onPreset,columns=3}){
  const low=Number(value)<5&&unit==='KB';
  return (
    <FieldLabel label="Target size" warning={warning||(low?'Below 5 KB, output quality will suffer badly.':undefined)}
      hint={achieved?undefined:'Never exceeded — the search stops at or under this size.'}>
      <div className="nu-ts__row">
        <input className="nu-ts__num" type="number" inputMode="numeric" aria-label="Target size value" value={value} onChange={e=>onChange&&onChange(e.target.value)}/>
        <span className="nu-ts__unit"><Select aria-label="Target size unit" value={unit} onChange={e=>onUnitChange&&onUnitChange(e.target.value)} options={['KB','MB']}/></span>
      </div>
      <PresetPicker value={preset} onChange={onPreset} columns={columns}/>
      {achieved&&<span className="nu-ts__achieved">{achieved}</span>}
    </FieldLabel>
  );
}
```

### PresetPicker

Props contract — `components/config/PresetPicker.d.ts`:

```ts
import * as React from 'react';
export interface PresetPickerProps{
  /** Defaults to the six canonical presets: 20/50/100/200/500 KB and 1 MB. */
  presets?: string[];
  value?: string;
  onChange?: (value:string) => void;
  /** 3 on desktop rail, 4 on mobile. */
  columns?: number;
}
/** Six preset chips beneath TargetSizeControl. */
export declare function PresetPicker(props: PresetPickerProps): JSX.Element;
```

Reference implementation — `components/config/PresetPicker.jsx`:

```jsx
import React from 'react';
import {Chip} from '../primitives/Chip.jsx';
const DEFAULTS=['20 KB','50 KB','100 KB','200 KB','500 KB','1 MB'];
export function PresetPicker({presets=DEFAULTS,value='100 KB',onChange,columns=3}){
  return (
    <div role="group" aria-label="Target size presets" style={{display:'grid',gridTemplateColumns:`repeat(${columns},1fr)`,gap:'var(--space-2)'}}>
      {presets.map(p=><Chip key={p} selected={p===value} onClick={()=>onChange&&onChange(p)}>{p}</Chip>)}
    </div>
  );
}
```

### ResizeControl

Props contract — `components/config/ResizeControl.d.ts`:

```ts
import * as React from 'react';
export interface ResizeControlProps{
  value?: string;
  options?: string[];
  onChange?: (value:string) => void;
  /** Hint line, e.g. "Applied only when the target can't be reached otherwise." */
  note?: React.ReactNode;
}
/** Optional downscale rule; also the fix offered on E_TARGET_UNREACHABLE. */
export declare function ResizeControl(props: ResizeControlProps): JSX.Element;
```

Reference implementation — `components/config/ResizeControl.jsx`:

```jsx
import React from 'react';
import {FieldLabel} from '../primitives/FieldLabel.jsx';
import {Select} from '../primitives/Select.jsx';
export function ResizeControl({value='None',options=['None','Max width 1600','Max width 2400','Max width 3200','Custom'],onChange,note}){
  return (
    <FieldLabel label="Resize" hint={note}>
      <Select value={value} aria-label="Resize rule" onChange={e=>onChange&&onChange(e.target.value)} options={options}/>
    </FieldLabel>
  );
}
```

### MetadataToggle

Props contract — `components/config/MetadataToggle.d.ts`:

```ts
import * as React from 'react';
export interface MetadataToggleProps{
  strip?: boolean;
  keepRotation?: boolean;
  onStrip?: (v:boolean) => void;
  onKeepRotation?: (v:boolean) => void;
}
/** EXIF/GPS handling. Stripping is the default — this is a privacy product. */
export declare function MetadataToggle(props: MetadataToggleProps): JSX.Element;
```

Reference implementation — `components/config/MetadataToggle.jsx`:

```jsx
import React from 'react';
import {FieldLabel} from '../primitives/FieldLabel.jsx';
import {Toggle} from '../primitives/Toggle.jsx';
export function MetadataToggle({strip=true,keepRotation=true,onStrip,onKeepRotation}){
  return (
    <FieldLabel label="Metadata">
      <div style={{display:'flex',flexDirection:'column',gap:'var(--space-2)'}}>
        <Toggle checked={strip} onChange={e=>onStrip&&onStrip(e.target.checked)} label="Strip EXIF & GPS" hint="Removes camera, date and location data."/>
        <Toggle checked={keepRotation} onChange={e=>onKeepRotation&&onKeepRotation(e.target.checked)} label="Keep rotation" hint="Bakes orientation into pixels."/>
      </div>
    </FieldLabel>
  );
}
```

---

## content

### FormatSpecTable

Props contract — `components/content/FormatSpecTable.d.ts`:

```ts
import * as React from 'react';
export interface FormatSpecTableProps extends React.TableHTMLAttributes<HTMLTableElement>{
  from?: string;
  to?: string;
  /** Five rows: Compression, Support, Transparency, Metadata, Typical size — real values, never filler. */
  rows?: Array<[string,string,string]>;
  caption?: string;
}
/** Static below-the-fold comparison table required on every /convert/[pair] route. Ships zero JS. */
export declare function FormatSpecTable(props: FormatSpecTableProps): JSX.Element;
```

Reference implementation — `components/content/FormatSpecTable.jsx`:

```jsx
import React from 'react';
import {css} from '../css.js';
css('spectable',`
.nu-st{width:100%;border-collapse:collapse;font-size:var(--text-sm);line-height:var(--leading-sm)}
.nu-st caption{text-align:left;font-weight:var(--weight-semibold);color:var(--color-text);padding-bottom:var(--space-3)}
.nu-st th,.nu-st td{text-align:left;padding:var(--space-3);border-bottom:1px solid var(--color-border);vertical-align:top}
.nu-st thead th{font-size:var(--text-xs);text-transform:uppercase;letter-spacing:0.02em;color:var(--color-text-muted);background:var(--color-bg-subtle)}
.nu-st tbody th{font-weight:var(--weight-medium);color:var(--color-text-muted);width:148px}
.nu-st td{color:var(--color-text)}
`);
export function FormatSpecTable({from='HEIC',to='JPG',rows=[],caption='Format comparison',className='',...rest}){
  return (
    <table className={`nu-st ${className}`} {...rest}>
      <caption>{caption}</caption>
      <thead><tr><th scope="col">Property</th><th scope="col">{from}</th><th scope="col">{to}</th></tr></thead>
      <tbody>{rows.map(([k,a,b])=><tr key={k}><th scope="row">{k}</th><td>{a}</td><td>{b}</td></tr>)}</tbody>
    </table>
  );
}
```

### FaqSection

Props contract — `components/content/FaqSection.d.ts`:

```ts
import * as React from 'react';
export interface FaqSectionProps extends React.HTMLAttributes<HTMLElement>{
  heading?: string;
  /** ≥ 4 pair-specific [question, answer] pairs; emitted with FAQPage JSON-LD in production. */
  items?: Array<[string,string]>;
}
/** Static FAQ block. Answers must be pair-specific — generic answers fail the content policy (09 §3). */
export declare function FaqSection(props: FaqSectionProps): JSX.Element;
```

Reference implementation — `components/content/FaqSection.jsx`:

```jsx
import React from 'react';
import {css} from '../css.js';
css('faq',`
.nu-faq{display:flex;flex-direction:column;gap:var(--space-2)}
.nu-faq__h{font-size:var(--text-xl);line-height:var(--leading-xl);font-weight:var(--weight-semibold);letter-spacing:var(--tracking-tight);color:var(--color-text);margin-bottom:var(--space-2)}
.nu-faq details{border-bottom:1px solid var(--color-border)}
.nu-faq summary{cursor:pointer;padding:var(--space-3) 0;min-height:44px;display:flex;align-items:center;font-size:var(--text-base);color:var(--color-text)}
.nu-faq p{padding:0 0 var(--space-3);font-size:var(--text-sm);line-height:var(--leading-sm);color:var(--color-text-muted);max-width:68ch}
`);
export function FaqSection({heading='Frequently asked questions',items=[],className='',...rest}){
  return (
    <section className={`nu-faq ${className}`} aria-label={heading} {...rest}>
      <h2 className="nu-faq__h">{heading}</h2>
      {items.map(([q,a],i)=><details key={q} open={i===0}><summary>{q}</summary><p>{a}</p></details>)}
    </section>
  );
}
```

### RelatedTools

Props contract — `components/content/RelatedTools.d.ts`:

```ts
import * as React from 'react';
export interface RelatedToolsProps extends React.HTMLAttributes<HTMLElement>{
  heading?: string;
  /** 4–6 genuinely related [label, href] routes. */
  items?: Array<[string,string?]>;
}
/** Static internal-link block closing every tool route. */
export declare function RelatedTools(props: RelatedToolsProps): JSX.Element;
```

Reference implementation — `components/content/RelatedTools.jsx`:

```jsx
import React from 'react';
import {css} from '../css.js';
css('related',`
.nu-rt{display:flex;flex-direction:column;gap:var(--space-3)}
.nu-rt__h{font-size:var(--text-sm);text-transform:uppercase;letter-spacing:0.02em;font-weight:var(--weight-semibold);color:var(--color-text-muted)}
.nu-rt__list{display:flex;flex-wrap:wrap;gap:var(--space-2)}
.nu-rt__item{min-height:36px;display:inline-flex;align-items:center;padding:0 var(--space-3);border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);color:var(--color-text);font-size:var(--text-sm);text-decoration:none}
.nu-rt__item:hover{border-color:var(--color-border-strong);background:var(--color-bg-subtle);color:var(--color-text);text-decoration:none}
`);
export function RelatedTools({heading='Related tools',items=[],className='',...rest}){
  return (
    <nav className={`nu-rt ${className}`} aria-label={heading} {...rest}>
      <h2 className="nu-rt__h">{heading}</h2>
      <div className="nu-rt__list">{items.map(([label,href])=><a className="nu-rt__item" key={label} href={href||'#'}>{label}</a>)}</div>
    </nav>
  );
}
```

### PrivacyBanner

Props contract — `components/content/PrivacyBanner.d.ts`:

```ts
import * as React from 'react';
export interface PrivacyBannerProps extends React.HTMLAttributes<HTMLElement>{
  claim?: React.ReactNode;
  href?: string;
}
/** Static below-the-fold privacy claim + verification link. A sentence, not a trust badge. */
export declare function PrivacyBanner(props: PrivacyBannerProps): JSX.Element;
```

Reference implementation — `components/content/PrivacyBanner.jsx`:

```jsx
import React from 'react';
import {css} from '../css.js';
css('privacybanner',`
.nu-pbn{display:flex;flex-direction:column;gap:var(--space-2);padding:var(--space-4);border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-bg-subtle)}
.nu-pbn__claim{font-size:var(--text-sm);line-height:var(--leading-sm);color:var(--color-text);max-width:68ch}
.nu-pbn__link{font-size:var(--text-sm);color:var(--color-accent)}
`);
export function PrivacyBanner({claim='Every conversion runs inside this browser tab. No image data is sent to a server — you can confirm it yourself in the DevTools Network tab.',href='/how-it-works',className='',...rest}){
  return (
    <section className={`nu-pbn ${className}`} aria-label="Privacy" {...rest}>
      <p className="nu-pbn__claim">{claim}</p>
      <a className="nu-pbn__link" href={href}>How to verify this →</a>
    </section>
  );
}
```

---

## chrome

### Header

Props contract — `components/chrome/Header.d.ts`:

```ts
import * as React from 'react';
export interface HeaderProps extends React.HTMLAttributes<HTMLElement>{
  active?: string;
  theme?: 'light'|'dark';
  onToggleTheme?: () => void;
  items?: string[];
}
/** Site header: wordmark set in the system stack (no logo asset exists), tool nav, labelled theme toggle. */
export declare function Header(props: HeaderProps): JSX.Element;
```

Reference implementation — `components/chrome/Header.jsx`:

```jsx
import React from 'react';
import {css} from '../css.js';
import {Icon} from '../primitives/Icon.jsx';
css('header',`
.nu-hd{display:flex;align-items:center;gap:var(--space-5);height:56px;padding:0 var(--space-4);border-bottom:1px solid var(--color-border);background:var(--color-surface)}
.nu-hd__mark{font-size:var(--text-base);font-weight:var(--weight-bold);letter-spacing:var(--tracking-tight);color:var(--color-text)}
.nu-hd__nav{display:flex;gap:var(--space-4)}
.nu-hd__link{min-height:36px;display:inline-flex;align-items:center;font-size:var(--text-sm);color:var(--color-text-muted);text-decoration:none}
.nu-hd__link:hover{color:var(--color-text);text-decoration:none}
.nu-hd__link--active{color:var(--color-text);font-weight:var(--weight-medium)}
.nu-hd__theme{margin-left:auto;display:inline-flex;align-items:center;gap:var(--space-2);min-height:36px;padding:0 var(--space-3);border:1px solid var(--color-border-strong);border-radius:var(--radius-md);background:var(--color-surface);color:var(--color-text-muted);font-size:var(--text-sm);cursor:pointer}
.nu-hd__theme:hover{color:var(--color-text)}
`);
export function Header({active='Convert',theme='light',onToggleTheme,items=['Convert','Compress','Resize','Metadata'],className='',...rest}){
  return (
    <header className={`nu-hd ${className}`} {...rest}>
      <a className="nu-hd__mark" href="/">NoUpload</a>
      <nav className="nu-hd__nav" aria-label="Tools">
        {items.map(i=><a key={i} href="#" aria-current={i===active?'page':undefined} className={`nu-hd__link${i===active?' nu-hd__link--active':''}`}>{i}</a>)}
      </nav>
      <button type="button" className="nu-hd__theme" onClick={onToggleTheme}>
        <Icon name={theme==='dark'?'sun':'moon'} size={15}/>{theme==='dark'?'Light':'Dark'}
      </button>
    </header>
  );
}
```

### Footer

Props contract — `components/chrome/Footer.d.ts`:

```ts
import * as React from 'react';
export interface FooterProps extends React.HTMLAttributes<HTMLElement>{
  links?: Array<[string,string]>;
  note?: string;
}
/** Static site footer. Zero JS, present in the prerendered HTML. */
export declare function Footer(props: FooterProps): JSX.Element;
```

Reference implementation — `components/chrome/Footer.jsx`:

```jsx
import React from 'react';
import {css} from '../css.js';
css('footer',`
.nu-ft{display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-4);padding:var(--space-5) var(--space-4);border-top:1px solid var(--color-border);background:var(--color-bg-subtle);font-size:var(--text-xs);line-height:var(--leading-xs);color:var(--color-text-muted)}
.nu-ft__link{color:var(--color-text-muted);text-decoration:none}
.nu-ft__link:hover{color:var(--color-text);text-decoration:underline}
`);
export function Footer({links=[['How it works','/how-it-works'],['Privacy','/privacy'],['Supported formats','/formats'],['Source','/source']],note='Everything runs on your device. No accounts, no quotas, no uploads.',className='',...rest}){
  return (
    <footer className={`nu-ft ${className}`} {...rest}>
      <span>NoUpload</span>
      <span>{note}</span>
      <span style={{marginLeft:'auto',display:'flex',gap:'var(--space-4)'}}>{links.map(([l,h])=><a className="nu-ft__link" key={l} href={h}>{l}</a>)}</span>
    </footer>
  );
}
```
