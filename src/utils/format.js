/**
 * Formatting helpers for Telegram messages (MarkdownV2-safe where needed).
 */

export function escapeMd(text) {
  if (text === undefined || text === null) return '';
  return String(text).replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

export function shortAddress(address, head = 6, tail = 4) {
  if (!address) return '?';
  if (address.length <= head + tail + 3) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

export function formatUsd(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  if (Math.abs(n) >= 1000) {
    return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `$${n.toFixed(2)}`;
}

export function formatAmount(value, { maxDecimals = 6, trim = true } = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  let n = Number(value);
  let s = n.toFixed(maxDecimals);
  if (trim) s = s.replace(/\.?0+$/, '');
  return s;
}

export function formatCents(cents) {
  return formatUsd(Number(cents) / 100);
}

export function formatTimestamp(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDuration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function pluralize(count, singular, plural) {
  const n = Number(count);
  return `${n} ${n === 1 ? singular : plural || `${singular}s`}`;
}

/** A sparkline from an array of numbers. */
export function sparkline(values, { width = 24, blocks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] } = {}) {
  if (!Array.isArray(values) || values.length === 0) return '';
  const nums = values.map(Number).filter((n) => Number.isFinite(n));
  if (nums.length === 0) return '';
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;

  // Bucket the series to `width` points.
  const bucketSize = Math.ceil(nums.length / width);
  const points = [];
  for (let i = 0; i < nums.length; i += bucketSize) {
    const slice = nums.slice(i, i + bucketSize);
    points.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }

  return points
    .map((v) => {
      const idx = Math.round(((v - min) / span) * (blocks.length - 1));
      return blocks[idx];
    })
    .join('');
}

/** Render a price-chart with axes labels. */
export function renderChart(values, { label = '', width = 24 } = {}) {
  const nums = values.map(Number).filter((n) => Number.isFinite(n));
  if (nums.length < 2) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const last = nums[nums.length - 1];
  const first = nums[0];
  const change = ((last - first) / (first || 1)) * 100;

  const lines = [];
  lines.push(`\`${sparkline(nums, { width })}\``);
  lines.push(`${label ? `${label}\n` : ''}last: ${last.toFixed(4)}  |  high: ${max.toFixed(4)}  |  low: ${min.toFixed(4)}`);
  lines.push(`7d change: ${change >= 0 ? '+' : ''}${change.toFixed(2)}% ${change >= 0 ? '📈' : '📉'}`);
  return lines.join('\n');
}
