import { useCallback, useEffect, useRef, useState } from 'react';
import { filesFromClipboard } from '../../state/queue';

interface Props {
  /** e.g. "HEIC" — the route's source format, for the headline copy. */
  fromLabel: string;
  compact: boolean;
  onFiles: (files: File[]) => void;
  /**
   * A manifest entry's `accept` list, joined. Defaults to the value the image
   * routes have always used, so every existing call site — and the e2e
   * selectors targeting `input[accept="image/*"]` — behave exactly as before.
   */
  accept?: string;
  multiple?: boolean;
  /** Verb in the file input's accessible name: "Choose PDF files to merge". */
  actionLabel?: string;
  /**
   * Accessible name of the drop target itself. Defaults to the exact string it
   * has always had — a11y.spec.ts targets it by name, and silently renaming a
   * control a suite locates by accessible name is how that assertion rots.
   */
  zoneLabel?: string;
}

/** Recursively walk a dropped directory (docs/08 §5 folder drop). */
async function readEntry(entry: FileSystemEntry, out: File[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File | null>((resolve) => {
      (entry as FileSystemFileEntry).file(resolve, () => resolve(null));
    });
    if (file !== null) out.push(file);
    return;
  }
  if (!entry.isDirectory) return;

  const reader = (entry as FileSystemDirectoryEntry).createReader();
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve) => {
      reader.readEntries(resolve, () => resolve([]));
    });
    if (batch.length === 0) return;
    for (const child of batch) await readEntry(child, out);
  }
}

async function filesFromDrop(transfer: DataTransfer): Promise<File[]> {
  const entries: FileSystemEntry[] = [];
  for (const item of transfer.items) {
    const entry = item.webkitGetAsEntry?.();
    if (entry !== null && entry !== undefined) entries.push(entry);
  }
  // No entry API (or a plain file drop): fall back to the flat file list.
  if (entries.length === 0) return [...transfer.files];

  const out: File[] = [];
  for (const entry of entries) await readEntry(entry, out);
  return out;
}

export function Dropzone({
  fromLabel,
  compact,
  onFiles,
  accept = 'image/*',
  multiple = true,
  actionLabel = 'convert',
  zoneLabel = 'Choose images to convert',
}: Props) {
  const [dragover, setDragover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = useCallback(() => inputRef.current?.click(), []);

  // Clipboard paste — screenshot-to-convert is a genuinely common path.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent): void => {
      const files = filesFromClipboard(event);
      if (files.length > 0) onFiles(files);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [onFiles]);

  const handleDrop = (event: DragEvent): void => {
    event.preventDefault();
    setDragover(false);
    if (event.dataTransfer === null) return;
    void filesFromDrop(event.dataTransfer).then((files) => {
      if (files.length > 0) onFiles(files);
    });
  };

  const hidden = (
    <input
      ref={inputRef}
      type="file"
      multiple={multiple}
      accept={accept}
      // Visually hidden but still in the accessibility tree, so it needs its
      // own name — sr-only is not aria-hidden. Without this, axe reports a
      // "form element has no label" violation on every tool route.
      aria-label={'Choose ' + fromLabel + ' files to ' + actionLabel}
      class="sr-only"
      onChange={(event) => {
        const list = event.currentTarget.files;
        if (list !== null && list.length > 0) onFiles([...list]);
        event.currentTarget.value = '';
      }}
    />
  );

  if (compact) {
    return (
      <>
        {hidden}
        <button
          type="button"
          onClick={openPicker}
          class="min-h-11 w-full rounded-md border border-dashed border-border-strong px-4 text-sm text-text-muted hover:bg-bg-subtle hover:text-text"
        >
          + Add more files
        </button>
      </>
    );
  }

  return (
    <>
      {hidden}
      <div
        role="button"
        tabIndex={0}
        aria-label={zoneLabel}
        aria-describedby="dropzone-constraints"
        onClick={openPicker}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openPicker();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragover(true);
        }}
        onDragLeave={() => setDragover(false)}
        onDrop={handleDrop}
        class={
          'flex min-h-[280px] cursor-pointer flex-col items-center justify-center gap-2 ' +
          'rounded-lg border-2 border-dashed px-6 py-12 text-center ' +
          'transition-[background-color,border-color,transform] duration-[var(--duration-fast)] ' +
          /*
           * Accent-tinted AT REST, not only while dragging.
           *
           * It used to sit in neutral grey until a drag started, which made the
           * one thing you are meant to do look like a disabled panel. On a tool
           * page this is the target; it should read as the target before you
           * touch anything.
           */
          (dragover
            ? 'scale-[1.005] border-accent bg-accent-subtle'
            : 'border-accent bg-accent-subtle hover:bg-accent-subtle')
        }
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="text-accent"
          aria-hidden="true"
        >
          <path d="M12 16V4m0 0L7 9m5-5l5 5" />
          <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
        </svg>
        <p class="m-0 text-xl font-semibold text-text">
          {dragover ? 'Release to add files' : 'Drop ' + fromLabel + ' files here'}
        </p>
        {/*
          A SPAN styled as a button, deliberately not a <button>.
          
          The affordance matters — people look for something to press, and
          "or click to browse" in muted grey is not it. But this whole zone is
          already `role="button"` with its own accessible name, and nesting a
          real control inside would give one action two tab stops and two names.
          A span inherits the parent's click and keyboard handling and adds
          nothing to the accessibility tree.
        */}
        <span
          aria-hidden="true"
          class="mt-1 inline-flex min-h-11 items-center rounded-md bg-accent px-5 text-sm font-semibold text-accent-text"
        >
          Choose {fromLabel} files
        </span>
        <p class="m-0 text-sm text-text-muted">
          or drop them anywhere here · or paste from clipboard
        </p>
        <p id="dropzone-constraints" class="mt-3 mb-0 text-sm text-text-muted">
          No upload caps · No sign-up · No watermarks
        </p>
      </div>
    </>
  );
}
