/** Read-only projections of the public Client catalog. Never retains or folds Session history. */
export const PAGE_SIZE = 30;
export const STATUSES = Object.freeze(['all', 'running', 'waiting', 'unread', 'idle', 'blank']);
const own = (record, key) => record != null && Object.hasOwn(record, key) ? record[key] : undefined;
const text = value => typeof value === 'string' ? value : '';

export function isWorkspaceReady(snapshot = {}) {
  return snapshot?.phase === 'ready' && snapshot.state === 'idle' && !snapshot.error;
}

export function normalizeQuery(value) {
  return text(value).trim().normalize('NFKC').toLowerCase();
}

export function statusOf(summary, status) {
  if (status?.pendingInteraction) return 'waiting';
  if ((status?.running ?? summary.running) === true) return 'running';
  if (status?.completionUnread === true) return 'unread';
  return summary.blank === true ? 'blank' : 'idle';
}

export function pathTail(value, count = 2) {
  const segments = text(value).split(/[\\/]+/).filter(Boolean);
  return segments.slice(-count).join('/');
}

export function workspaceChoices(items, labels) {
  const groups = new Map();
  for (const item of items ?? []) {
    const title = text(item.title) || pathTail(item.path, 1) || labels.ungrouped;
    const list = groups.get(title) ?? [];
    list.push(item);
    groups.set(title, list);
  }
  return (items ?? []).map(item => {
    const title = text(item.title) || pathTail(item.path, 1) || labels.ungrouped;
    const siblings = groups.get(title);
    if (siblings.length < 2) return { id: item.workspaceId, title, label: title, path: text(item.path) };
    let depth = 1;
    while (depth < 20 && siblings.some(other => other !== item && pathTail(other.path, depth) === pathTail(item.path, depth))) depth++;
    const tail = pathTail(item.path, depth);
    const ambiguous = siblings.some(other => other !== item && pathTail(other.path, depth) === tail);
    const suffix = tail ? (ambiguous ? `${tail} · ${item.workspaceId}` : tail) : item.workspaceId;
    return { id: item.workspaceId, title, label: `${title} · ${suffix}`, path: text(item.path) };
  });
}

export function deriveRows(catalog, workspaces, statuses, labels) {
  const archived = new Set(workspaces?.archivedSessionIds ?? []);
  const pinned = new Set(workspaces?.pinnedSessionIds ?? []);
  const choices = workspaceChoices(workspaces?.items ?? [], labels);
  const choicesById = new Map(choices.map(choice => [choice.id, choice]));
  const membership = new Map();
  for (const workspace of workspaces?.items ?? []) {
    for (const id of workspace.sessionIds ?? []) if (!membership.has(id)) membership.set(id, workspace.workspaceId);
  }
  const seen = new Set();
  const rows = [];
  for (const id of catalog?.ids ?? []) {
    if (seen.has(id)) continue;
    seen.add(id);
    const summary = own(catalog.byId, id);
    if (!summary || summary.origin === 'subagent') continue;
    const workspaceId = membership.get(id) ?? null;
    const workspace = choicesById.get(workspaceId);
    const title = text(summary.title).trim() ? summary.title : summary.blank ? labels.newSession : labels.untitled;
    const cwd = text(summary.cwd);
    rows.push({
      id,
      title,
      cwd,
      parentId: text(summary.parentId),
      workspaceId,
      workspaceLabel: workspace?.label ?? labels.ungrouped,
      workspacePath: workspace?.path ?? cwd,
      updatedAt: Number.isFinite(summary.updatedAt) && summary.updatedAt >= 0 ? summary.updatedAt : 0,
      status: statusOf(summary, statuses?.get(id)),
      archived: archived.has(id),
      pinned: pinned.has(id),
      blank: summary.blank === true,
      formatStatus: summary.formatStatus,
    });
  }
  return rows;
}

export function metadataMatches(row, query) {
  const needle = normalizeQuery(query);
  if (!needle) return true;
  return [row.title, row.id, row.cwd, row.workspaceLabel, row.workspacePath].some(value => normalizeQuery(value).includes(needle));
}

export function filterRows(rows, filters, contentHits = new Map()) {
  const needle = normalizeQuery(filters.query);
  return rows.filter(row => {
    if (filters.archive === 'active' && row.archived) return false;
    if (filters.archive === 'archived' && !row.archived) return false;
    if (filters.workspace === 'ungrouped' && row.workspaceId !== null) return false;
    if (filters.workspace && filters.workspace !== 'all' && filters.workspace !== 'ungrouped' && row.workspaceId !== filters.workspace) return false;
    if (filters.pinnedOnly && !row.pinned) return false;
    if (filters.status && filters.status !== 'all' && row.status !== filters.status) return false;
    return !needle || metadataMatches(row, needle) || contentHits.has(row.id);
  });
}

export function sortRows(rows, sort = 'recent', locale = 'en') {
  let collator;
  try { collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' }); }
  catch { collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' }); }
  return [...rows].sort((left, right) => {
    const pinned = Number(right.pinned) - Number(left.pinned);
    if (pinned) return pinned;
    const primary = sort === 'title' ? collator.compare(left.title, right.title)
      : sort === 'oldest' ? left.updatedAt - right.updatedAt : right.updatedAt - left.updatedAt;
    return primary || collator.compare(left.title, right.title) || left.id.localeCompare(right.id);
  });
}

export function statusCounts(rows) {
  const counts = { all: rows.length, running: 0, waiting: 0, unread: 0, idle: 0, blank: 0 };
  for (const row of rows) if (Object.hasOwn(counts, row.status)) counts[row.status]++;
  return counts;
}

export function pageRows(rows, requestedPage = 1, size = PAGE_SIZE) {
  const pageSize = Number.isSafeInteger(size) && size > 0 ? size : PAGE_SIZE;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Number.isFinite(requestedPage) ? Math.min(pages, Math.max(1, Math.trunc(requestedPage))) : 1;
  const start = (page - 1) * pageSize;
  return { items: rows.slice(start, start + pageSize), page, pages, total: rows.length, from: rows.length ? start + 1 : 0, to: Math.min(rows.length, start + pageSize) };
}

export function decodeSearchResult(result) {
  if (result?.ok !== true) {
    const error = result?.error;
    throw new Error([text(error?.code), text(error?.message)].filter(Boolean).join(': ') || 'Invalid search response');
  }
  const hits = new Map();
  for (const item of result.value?.items ?? []) {
    if (typeof item.sessionId === 'string' && !hits.has(item.sessionId)) hits.set(item.sessionId, text(item.snippet));
  }
  return { hits, hasMore: result.value?.hasMore === true };
}

/** The caller owns cancellation; stale/aborted completions never publish. */
export async function contentSearch(search, query, signal, publish) {
  if (signal.aborted || !normalizeQuery(query)) return;
  try {
    const result = await search(query.trim(), signal);
    if (signal.aborted) return;
    const decoded = decodeSearchResult(result);
    publish({ state: 'ready', ...decoded });
  } catch (error) {
    if (signal.aborted) return;
    publish({ state: 'error', hits: new Map(), hasMore: false, error: error instanceof Error ? error.message : String(error) });
  }
}
