export function renderMetricCard(safe, title, value, meta = "") {
  return `<div class="metric metric-rich"><h3>${safe(title)}</h3><p>${safe(value)}</p>${meta ? `<span class="metric-meta">${safe(meta)}</span>` : ""}</div>`;
}
