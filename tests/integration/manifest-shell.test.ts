/**
 * docs/kepttools/03-engines-contracts.md §6 — "Manifest completeness: every
 * ToolManifestEntry renders through the shell".
 *
 * This is the executable form of the M0 acceptance criterion and of standing
 * rule 1 in docs/kepttools/05 ("a new tool that needs shell surgery is a design
 * failure"). If someone adds a tool whose config the shell cannot express, this
 * suite fails on the new entry alone — before a route or an engine exists.
 *
 * Real browser rather than jsdom, for the same reason as every other suite
 * here: the thing under test renders DOM, and a faithful fake of that is more
 * work than using the real one.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'preact';
import { h } from 'preact';
import { toolManifest, type ToolManifestEntry } from '../../src/core/tools';
import { ManifestToolShell } from '../../src/components/react/ManifestToolShell';

let host: HTMLDivElement | null = null;

function mount(tool: ToolManifestEntry): HTMLDivElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  render(h(ManifestToolShell, { tool }), host);
  return host;
}

afterEach(() => {
  if (host !== null) {
    render(null, host);
    host.remove();
    host = null;
  }
});

/** What every entry will look like once its milestone flips the gate. */
function asSupported(tool: ToolManifestEntry): ToolManifestEntry {
  return { ...tool, supported: true };
}

describe('the shell renders every manifest entry', () => {
  for (const tool of toolManifest) {
    describe(tool.id, () => {
      it('renders a control for every declared config field', () => {
        const el = mount(asSupported(tool));

        for (const field of tool.configFields) {
          const control = el.querySelector('#tool-field-' + field.id);

          if (field.kind === 'targetSize') {
            // TargetSizeControl owns its own ids, so assert on what it renders
            // rather than on the manifest's field id.
            expect(
              el.querySelector('#target-size'),
              tool.id + ' target size control',
            ).not.toBeNull();
            continue;
          }

          expect(control, tool.id + '.' + field.id).not.toBeNull();
        }
      });

      it('gives every rendered control an accessible name', () => {
        const el = mount(asSupported(tool));
        const controls = el.querySelectorAll('input, select, textarea');

        for (const control of controls) {
          const id = control.getAttribute('id');
          const labelled =
            control.getAttribute('aria-label') !== null ||
            (id !== null && el.querySelector('label[for="' + id + '"]') !== null);
          expect(labelled, tool.id + ' control ' + (id ?? '(no id)')).toBe(true);
        }
      });

      it('renders a dropzone only when the tool takes files', () => {
        const el = mount(asSupported(tool));
        const fileInput = el.querySelector('input[type="file"]');

        if (tool.accept.length === 0) {
          // QR builds its payload from typed fields; a dropzone would be a
          // control that cannot do anything.
          expect(fileInput, tool.id).toBeNull();
          return;
        }

        expect(fileInput, tool.id).not.toBeNull();
        expect(fileInput?.getAttribute('accept'), tool.id).toBe(tool.accept.join(','));
        expect(fileInput?.hasAttribute('multiple'), tool.id + ' multiFile').toBe(tool.multiFile);
      });

      it('matches its own gate — notice while unsupported, tool once built', () => {
        // The real entry, gate untouched.
        const el = mount(tool);

        if (tool.supported) {
          // Once an engine exists the notice must be gone, or a working tool
          // is telling people it does not work.
          expect(el.textContent, tool.id).not.toContain('isn’t ready yet');
          expect(el.querySelector('input[type="file"]'), tool.id).not.toBeNull();
          return;
        }

        // The D-55 pattern: say it cannot run rather than offer a button that
        // fails on click.
        expect(el.textContent).toContain('isn’t ready yet');
        expect(el.querySelector('button'), tool.id).toBeNull();
        expect(el.querySelector('input[type="file"]'), tool.id).toBeNull();
      });
    });
  }
});

/**
 * Drops a file on the tool the way a user does — through the real file input,
 * with a real File. The action button is deliberately absent until there is
 * something to act on, so nothing about the output mode is observable before
 * this happens.
 */
async function dropFile(el: HTMLDivElement, name: string): Promise<void> {
  const input = el.querySelector<HTMLInputElement>('input[type="file"]');
  expect(input, 'tool should have a file input').not.toBeNull();

  const transfer = new DataTransfer();
  transfer.items.add(new File([new Uint8Array([1, 2, 3])], name));
  input!.files = transfer.files;

  // Both events: preact/compat rewrites `onChange` to the `input` event for
  // some control types, and dispatching only one leaves the handler unfired
  // depending on which side of that mapping a file input lands.
  input!.dispatchEvent(new Event('input', { bubbles: true }));
  input!.dispatchEvent(new Event('change', { bubbles: true }));

  // Preact batches re-renders onto a microtask, so the DOM is still the
  // pre-drop tree until the queue flushes.
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('output mode reaches the UI', () => {
  it('names ZIP delivery on the action button for zip-output tools', async () => {
    const zipTool = toolManifest.find((t) => t.output === 'zip');
    expect(zipTool, 'the manifest should still declare a zip-output tool').toBeDefined();

    const el = mount(asSupported(zipTool!));
    await dropFile(el, 'sample.pdf');

    expect(el.textContent).toContain('ZIP');
  });

  it('does not mention ZIP for single-output tools', async () => {
    const single = toolManifest.find((t) => t.output === 'single' && t.accept.length > 0);
    expect(single).toBeDefined();

    const el = mount(asSupported(single!));
    await dropFile(el, 'sample.pdf');

    expect(el.textContent).not.toContain('ZIP');
  });

  it('offers no action button until there is something to act on', () => {
    const tool = toolManifest.find((t) => t.accept.length > 0);
    const el = mount(asSupported(tool!));
    expect(el.querySelector('button[class*="bg-accent"]')).toBeNull();
  });

  it('keeps only the newest file for a single-file tool', async () => {
    const single = toolManifest.find((t) => !t.multiFile && t.accept.length > 0);
    const el = mount(asSupported(single!));

    await dropFile(el, 'first.pdf');
    await dropFile(el, 'second.pdf');

    expect(el.textContent).toContain('second.pdf');
    expect(el.textContent).not.toContain('first.pdf');
  });

  it('accumulates files for a multi-file tool', async () => {
    const multi = toolManifest.find((t) => t.multiFile);
    const el = mount(asSupported(multi!));

    await dropFile(el, 'first.pdf');
    await dropFile(el, 'second.pdf');

    expect(el.textContent).toContain('first.pdf');
    expect(el.textContent).toContain('second.pdf');
  });
});
