import type { DeviceProfile } from '../../core/types';
import type { JobView } from '../../state/selectors';

interface Props {
  device: DeviceProfile;
  views: readonly JobView[];
}

/** Dev-only. Never rendered in a production build. */
export function DiagnosticsPanel({ device, views }: Props) {
  return (
    <details class="border-t border-border px-4 py-2 text-xs text-text-muted">
      <summary class="min-h-11 cursor-pointer">Diagnostics (dev)</summary>
      <dl class="num m-0 grid grid-cols-2 gap-x-4">
        <dt>workers</dt>
        <dd class="m-0">{device.maxWorkers}</dd>
        <dt>deviceMemoryGb</dt>
        <dd class="m-0">{device.deviceMemoryGb}</dd>
        <dt>maxDecodedPixels</dt>
        <dd class="m-0">{device.maxDecodedPixels.toLocaleString()}</dd>
        <dt>jobs</dt>
        <dd class="m-0">{views.length}</dd>
      </dl>
      <ul class="num m-0 mt-2 list-none p-0">
        {views.map(({ job, source }) => (
          <li key={job.id}>
            {source.name} · {job.status} · {job.passesUsed}p
            {job.error !== null && ' · ' + job.error.code}
          </li>
        ))}
      </ul>
    </details>
  );
}
