/// <reference types="astro/client" />

/**
 * File System Access API.
 *
 * TypeScript's DOM lib ships FileSystemFileHandle and FileSystemWritableFileStream
 * but not the `showSaveFilePicker` entry point, because it is Chromium-only
 * (~28% global). Every call site in src/platform/deliver.ts feature-detects
 * before reaching for it — this declaration makes the call typed, not assumed.
 */
interface ShowSaveFilePickerOptions {
  suggestedName?: string;
  excludeAcceptAllOption?: boolean;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
}

declare function showSaveFilePicker(
  options?: ShowSaveFilePickerOptions,
): Promise<FileSystemFileHandle>;
