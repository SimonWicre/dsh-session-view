import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PAGE_SIZE,
  STATUSES,
  deriveRows,
  filterRows,
  metadataMatches,
  normalizeQuery,
  pageRows,
  pathTail,
  sortRows,
  statusCounts,
  statusOf,
  workspaceChoices,
} from '../src/model.js';

// Entirely synthetic catalog data: no Harness service, user directory, or UI is accessed.
const labels = Object.freeze({
  newSession: 'New synthetic session',
  untitled: 'Untitled synthetic session',
  ungrouped: 'Synthetic ungrouped',
});

function freeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function summary(overrides = {}) {
  return {
    title: 'Synthetic session',
    cwd: 'Q:\\synthetic\\unassigned',
    updatedAt: 100,
    running: false,
    blank: false,
    origin: 'user',
    ...overrides,
  };
}

function row(id, overrides = {}) {
  return {
    id,
    title: 'Synthetic session',
    cwd: 'Q:\\synthetic\\unassigned',
    parentId: '',
    workspaceId: null,
    workspaceLabel: labels.ungrouped,
    workspacePath: 'Q:\\synthetic\\unassigned',
    updatedAt: 0,
    status: 'idle',
    archived: false,
    pinned: false,
    blank: false,
    ...overrides,
  };
}

function filters(overrides = {}) {
  return { query: '', archive: 'all', workspace: 'all', pinnedOnly: false, status: 'all', ...overrides };
}

const ids = rows => rows.map(item => item.id);

test('deriveRows treats catalog.ids as the sole authority, deduplicates, and excludes subagents', () => {
  const byId = Object.assign(Object.create({ 'syn-inherited': summary() }), {
    'syn-visible': summary({ id: 'syn-summary-id-is-not-authoritative' }),
    'syn-retained-only': summary(),
    'syn-subagent': summary({ origin: 'subagent' }),
    'syn-public-parented': summary({ parentId: 'syn-parent', origin: 'user' }),
    'syn-null-summary': null,
  });
  const catalog = freeze({
    ids: ['syn-visible', 'syn-subagent', 'syn-visible', 'syn-missing', 'syn-inherited', 'syn-public-parented', 'syn-null-summary'],
    byId,
  });
  const beforeIds = [...catalog.ids];
  const beforeKeys = Object.keys(byId);
  const rows = deriveRows(catalog, undefined, new Map(), labels);

  assert.deepEqual(ids(rows), ['syn-visible', 'syn-public-parented']);
  assert.equal(rows[1].parentId, 'syn-parent', 'parentId alone must not be guessed to mean subagent');
  assert.deepEqual(catalog.ids, beforeIds);
  assert.deepEqual(Object.keys(byId), beforeKeys);
});

test('deriveRows never falls back to retained byId values when ids are absent or empty', () => {
  const byId = freeze({ 'syn-retained': summary() });
  for (const catalog of [undefined, null, { byId }, { ids: [], byId }, { ids: null, byId }]) {
    assert.deepEqual(deriveRows(catalog, undefined, undefined, labels), []);
  }
  assert.deepEqual(deriveRows({ ids: ['syn-missing'], byId: undefined }, undefined, undefined, labels), []);
});

test('deriveRows uses distinct untitled and blank fallbacks while preserving explicit titles', () => {
  const cases = [
    { id: 'syn-untitled-missing', title: undefined, blank: false, expected: labels.untitled },
    { id: 'syn-untitled-empty', title: '', blank: false, expected: labels.untitled },
    { id: 'syn-untitled-space', title: ' \t\n ', blank: false, expected: labels.untitled },
    { id: 'syn-untitled-number', title: 17, blank: false, expected: labels.untitled },
    { id: 'syn-blank-missing', title: undefined, blank: true, expected: labels.newSession },
    { id: 'syn-blank-space', title: '\u3000 \t', blank: true, expected: labels.newSession },
    { id: 'syn-blank-null', title: null, blank: true, expected: labels.newSession },
    { id: 'syn-explicit', title: '  Explicit synthetic title  ', blank: false, expected: '  Explicit synthetic title  ' },
    { id: 'syn-blank-explicit', title: 'Named synthetic blank', blank: true, expected: 'Named synthetic blank' },
  ];
  const catalog = freeze({
    ids: cases.map(item => item.id),
    byId: Object.fromEntries(cases.map(item => [item.id, summary({ title: item.title, blank: item.blank })])),
  });
  const rows = deriveRows(catalog, undefined, undefined, labels);
  assert.deepEqual(rows.map(item => item.title), cases.map(item => item.expected));
  assert.deepEqual(rows.map(item => item.blank), cases.map(item => item.blank));
});

test('deriveRows associates workspaces only through sessionIds, never title or cwd guesses', () => {
  const workspaces = freeze({
    items: [
      { workspaceId: 'syn-workspace-west', title: 'Synthetic shared name', path: 'Q:\\synthetic\\west\\repo', sessionIds: ['syn-linked-west', 'syn-linked-twice'] },
      { workspaceId: 'syn-workspace-east', title: 'Synthetic shared name', path: 'Q:\\synthetic\\east\\repo', sessionIds: ['syn-linked-east', 'syn-linked-twice'] },
    ],
    archivedSessionIds: ['syn-linked-east', 'syn-retained-archive'],
    pinnedSessionIds: ['syn-linked-west', 'syn-retained-pin'],
  });
  const catalog = freeze({
    ids: ['syn-linked-west', 'syn-unlinked-same-name-cwd', 'syn-linked-east', 'syn-linked-twice'],
    byId: {
      'syn-linked-west': summary({ cwd: 'Q:\\synthetic\\east\\repo' }),
      'syn-unlinked-same-name-cwd': summary({ title: 'Synthetic shared name', cwd: 'Q:\\synthetic\\west\\repo' }),
      'syn-linked-east': summary({ cwd: '/synthetic/unrelated/location' }),
      'syn-linked-twice': summary(),
    },
  });
  const statuses = new Map([['syn-linked-west', freeze({ running: true })]]);
  const beforeStatuses = [...statuses];
  const rows = deriveRows(catalog, workspaces, statuses, labels);

  assert.deepEqual(rows.map(item => item.workspaceId), ['syn-workspace-west', null, 'syn-workspace-east', 'syn-workspace-west']);
  assert.equal(rows[0].workspacePath, 'Q:\\synthetic\\west\\repo');
  assert.equal(rows[0].cwd, 'Q:\\synthetic\\east\\repo');
  assert.equal(rows[0].workspaceLabel, 'Synthetic shared name · west/repo');
  assert.equal(rows[1].workspaceLabel, labels.ungrouped);
  assert.equal(rows[1].workspacePath, rows[1].cwd);
  assert.equal(rows[2].workspaceLabel, 'Synthetic shared name · east/repo');
  assert.deepEqual(rows.map(item => item.archived), [false, false, true, false]);
  assert.deepEqual(rows.map(item => item.pinned), [true, false, false, false]);
  assert.equal(rows[0].status, 'running');
  assert.deepEqual([...statuses], beforeStatuses);
});

test('deriveRows sanitizes timestamps and retains only public projection fields without mutation', () => {
  const timestamps = [0, 12.5, -1, NaN, Infinity, '120', null, undefined];
  const catalog = freeze({
    ids: timestamps.map((_, index) => `syn-time-${index}`),
    byId: Object.fromEntries(timestamps.map((updatedAt, index) => [`syn-time-${index}`, summary({
      updatedAt, cwd: 42, parentId: null, formatStatus: 'synthetic-format', messages: ['synthetic-private-history'],
    })])),
  });
  const rows = deriveRows(catalog, undefined, undefined, labels);
  assert.deepEqual(rows.map(item => item.updatedAt), [0, 12.5, 0, 0, 0, 0, 0, 0]);
  for (const item of rows) {
    assert.equal(item.cwd, '');
    assert.equal(item.parentId, '');
    assert.equal(item.formatStatus, 'synthetic-format');
    assert.equal(Object.hasOwn(item, 'messages'), false);
  }
});

test('pathTail handles synthetic Windows/POSIX paths and empty inputs', () => {
  assert.equal(pathTail('Q:\\synthetic\\region\\repo\\'), 'region/repo');
  assert.equal(pathTail('/synthetic//region/repo/'), 'region/repo');
  assert.equal(pathTail('Q:\\synthetic\\region\\repo', 1), 'repo');
  assert.equal(pathTail('/synthetic/region/repo', 3), 'synthetic/region/repo');
  assert.equal(pathTail(''), '');
  assert.equal(pathTail(undefined), '');
  assert.equal(pathTail(23), '');
});

test('workspaceChoices disambiguates equal titles using the shortest distinguishing path suffix', () => {
  const items = freeze([
    { workspaceId: 'syn-ws-west', title: 'Synthetic Lab', path: '/synthetic/west/team/repo' },
    { workspaceId: 'syn-ws-east', title: 'Synthetic Lab', path: 'Q:\\synthetic\\east\\team\\repo' },
    { workspaceId: 'syn-ws-fallback', title: '', path: '/synthetic/solo/fallback-name' },
    { workspaceId: 'syn-ws-empty', path: '' },
  ]);
  assert.deepEqual(workspaceChoices(items, labels), [
    { id: 'syn-ws-west', title: 'Synthetic Lab', label: 'Synthetic Lab · west/team/repo', path: '/synthetic/west/team/repo' },
    { id: 'syn-ws-east', title: 'Synthetic Lab', label: 'Synthetic Lab · east/team/repo', path: 'Q:\\synthetic\\east\\team\\repo' },
    { id: 'syn-ws-fallback', title: 'fallback-name', label: 'fallback-name', path: '/synthetic/solo/fallback-name' },
    { id: 'syn-ws-empty', title: labels.ungrouped, label: labels.ungrouped, path: '' },
  ]);
  assert.deepEqual(workspaceChoices(undefined, labels), []);
});

test('workspaceChoices uses synthetic workspace IDs when same-title paths are empty', () => {
  const items = freeze([
    { workspaceId: 'syn-empty-a', title: 'Synthetic empty', path: '' },
    { workspaceId: 'syn-empty-b', title: 'Synthetic empty', path: null },
  ]);
  assert.deepEqual(workspaceChoices(items, labels).map(item => item.label), [
    'Synthetic empty · syn-empty-a', 'Synthetic empty · syn-empty-b',
  ]);
});

const statusCases = [
  { name: 'pending beats running, unread, and blank', summary: { running: true, blank: true }, status: { pendingInteraction: { kind: 'synthetic-confirm' }, running: true, completionUnread: true }, expected: 'waiting' },
  { name: 'pending beats unread and blank without running', summary: { blank: true }, status: { pendingInteraction: true, running: false, completionUnread: true }, expected: 'waiting' },
  { name: 'running beats unread and blank', summary: { blank: true }, status: { running: true, completionUnread: true }, expected: 'running' },
  { name: 'unread beats blank', summary: { blank: true }, status: { running: false, completionUnread: true }, expected: 'unread' },
  { name: 'blank remains blank otherwise', summary: { blank: true }, status: {}, expected: 'blank' },
  { name: 'idle is the final fallback', summary: {}, status: { pendingInteraction: null, running: false, completionUnread: false }, expected: 'idle' },
  { name: 'missing live status falls back to summary.running', summary: { running: true }, status: undefined, expected: 'running' },
  { name: 'not-yet-established running falls back to summary.running', summary: { running: true, blank: true }, status: { completionUnread: true }, expected: 'running' },
  { name: 'undefined running falls back to summary.running', summary: { running: true }, status: { running: undefined }, expected: 'running' },
  { name: 'null running falls back to summary.running', summary: { running: true }, status: { running: null }, expected: 'running' },
  { name: 'explicit false live running overrides a true summary', summary: { running: true, blank: true }, status: { running: false }, expected: 'blank' },
  { name: 'explicit true live running overrides a false summary', summary: { running: false }, status: { running: true }, expected: 'running' },
];
for (const item of statusCases) {
  test(`statusOf: ${item.name}`, () => {
    assert.equal(statusOf(freeze(summary(item.summary)), freeze(item.status)), item.expected);
  });
}

test('deriveRows applies summary.running fallback when a status map entry is absent or incomplete', () => {
  const catalog = freeze({
    ids: ['syn-status-missing', 'syn-status-incomplete', 'syn-status-explicit-false'],
    byId: {
      'syn-status-missing': summary({ running: true }),
      'syn-status-incomplete': summary({ running: true, blank: true }),
      'syn-status-explicit-false': summary({ running: true }),
    },
  });
  const statuses = new Map([
    ['syn-status-incomplete', freeze({ completionUnread: true })],
    ['syn-status-explicit-false', freeze({ running: false })],
  ]);
  assert.deepEqual(deriveRows(catalog, undefined, statuses, labels).map(item => item.status), ['running', 'running', 'idle']);
});

const filterFixture = freeze([
  row('syn-active-pinned', { pinned: true, workspaceId: 'syn-ws-a', status: 'waiting' }),
  row('syn-active-plain', { workspaceId: 'syn-ws-a', status: 'running' }),
  row('syn-archived-pinned', { archived: true, pinned: true, status: 'unread' }),
  row('syn-archived-plain', { archived: true, workspaceId: 'syn-ws-b', status: 'blank' }),
  row('syn-active-ungrouped', { status: 'idle' }),
]);
const filterCases = [
  { name: 'active excludes archived', filters: { archive: 'active' }, expected: ['syn-active-pinned', 'syn-active-plain', 'syn-active-ungrouped'] },
  { name: 'archived excludes active', filters: { archive: 'archived' }, expected: ['syn-archived-pinned', 'syn-archived-plain'] },
  { name: 'all includes both archive states', filters: {}, expected: ids(filterFixture) },
  { name: 'pinnedOnly includes active and archived pins', filters: { pinnedOnly: true }, expected: ['syn-active-pinned', 'syn-archived-pinned'] },
  { name: 'active and pinned compose', filters: { archive: 'active', pinnedOnly: true }, expected: ['syn-active-pinned'] },
  { name: 'archived and pinned compose', filters: { archive: 'archived', pinnedOnly: true }, expected: ['syn-archived-pinned'] },
  { name: 'specific workspace matches IDs', filters: { workspace: 'syn-ws-a' }, expected: ['syn-active-pinned', 'syn-active-plain'] },
  { name: 'ungrouped means a null workspaceId', filters: { workspace: 'ungrouped' }, expected: ['syn-archived-pinned', 'syn-active-ungrouped'] },
  { name: 'status composes with other filters', filters: { workspace: 'syn-ws-a', status: 'running', archive: 'active' }, expected: ['syn-active-plain'] },
  { name: 'unknown workspace produces no rows', filters: { workspace: 'syn-ws-missing' }, expected: [] },
];
for (const item of filterCases) {
  test(`filterRows: ${item.name}`, () => {
    const inputFilters = freeze(filters(item.filters));
    assert.deepEqual(ids(filterRows(filterFixture, inputFilters)), item.expected);
  });
}

test('normalizeQuery performs trim, case folding, and NFKC, but never interprets regex syntax', () => {
  assert.equal(normalizeQuery(' \tＳＹＮＴＨＥＴＩＣ　① K ﬁ\n'), 'synthetic 1 k fi');
  assert.equal(normalizeQuery('  SYN .*+? [X]  '), 'syn .*+? [x]');
  for (const value of [undefined, null, 19, {}, '', ' \t\n\u3000']) assert.equal(normalizeQuery(value), '');
});

for (const field of ['title', 'id', 'cwd', 'workspaceLabel', 'workspacePath']) {
  test(`metadataMatches uses case/NFKC-normalized literal matching on ${field}`, () => {
    const item = freeze(row('syn-no-match', {
      title: '', cwd: '', workspaceLabel: '', workspacePath: '',
      [field]: 'syn-prefix-ＳＹＮＴＨＥＴＩＣ－ＮＥＥＤＬＥ-suffix',
    }));
    assert.equal(metadataMatches(item, '  SYNTHETIC-NEEDLE '), true);
    assert.equal(metadataMatches(item, 'synthetic-absent'), false);
  });
}

test('metadataMatches treats metacharacters literally and blank queries as unrestricted', () => {
  const item = freeze(row('syn-literal', { title: 'Synthetic literal .*+? [x]', parentId: 'syn-parent-only-needle' }));
  assert.equal(metadataMatches(item, '.*+? [X]'), true);
  assert.equal(metadataMatches(row('syn-nonliteral', { title: 'Synthetic ordinary title' }), '.*'), false);
  assert.equal(metadataMatches(item, 'syn-parent-only-needle'), false);
  assert.equal(metadataMatches(item, ' \t\u3000'), true);
});

test('filterRows combines local matches and content hit IDs without bypassing structural filters', () => {
  const rows = freeze([
    row('syn-local', { title: 'ＳＹＮＴＨＥＴＩＣ ＮＥＥＤＬＥ', pinned: true }),
    row('syn-content', { title: 'Synthetic other', pinned: true }),
    row('syn-no-hit', { title: 'Synthetic other' }),
    row('syn-hidden-archive', { archived: true, pinned: true }),
    row('syn-hidden-pin', { pinned: false }),
  ]);
  const hits = new Map([
    ['syn-content', '<em>literal synthetic snippet</em>'],
    ['syn-hidden-archive', 'synthetic needle'],
    ['syn-hidden-pin', 'synthetic needle'],
    ['syn-not-in-rows', 'synthetic needle'],
  ]);
  const before = [...hits];
  const result = filterRows(rows, freeze(filters({ query: '  Synthetic Needle ', archive: 'active', pinnedOnly: true })), hits);
  assert.deepEqual(ids(result), ['syn-local', 'syn-content']);
  assert.deepEqual([...hits], before);
  assert.deepEqual(ids(filterRows(rows, filters({ query: ' \t' }), hits)), ids(rows));
});

test('statusCounts returns all public counters, including zeros, without changing rows', () => {
  assert.deepEqual(STATUSES, ['all', 'running', 'waiting', 'unread', 'idle', 'blank']);
  assert.equal(Object.isFrozen(STATUSES), true);
  assert.deepEqual(statusCounts([]), { all: 0, running: 0, waiting: 0, unread: 0, idle: 0, blank: 0 });
  assert.deepEqual(statusCounts(filterFixture), { all: 5, running: 1, waiting: 1, unread: 1, idle: 1, blank: 1 });
  assert.deepEqual(statusCounts(freeze([row('syn-unknown-status', { status: 'synthetic-unknown' })])), { all: 1, running: 0, waiting: 0, unread: 0, idle: 0, blank: 0 });
});

const sortFixture = freeze([
  row('syn-unpinned-b', { title: 'Synthetic item 2', updatedAt: 20 }),
  row('syn-pinned-z', { title: 'Synthetic item 20', updatedAt: 1, pinned: true }),
  row('syn-unpinned-z', { title: 'Synthetic item 20', updatedAt: 20 }),
  row('syn-pinned-b', { title: 'Synthetic item 2', updatedAt: 5, pinned: true }),
  row('syn-unpinned-a', { title: 'synthetic ITEM 2', updatedAt: 20 }),
  row('syn-pinned-a', { title: 'synthetic ITEM 2', updatedAt: 5, pinned: true }),
  row('syn-unpinned-newest', { title: 'Synthetic alpha', updatedAt: 99 }),
  row('syn-unpinned-oldest', { title: 'Synthetic omega', updatedAt: 0 }),
]);
const sortCases = [
  { mode: 'recent', expected: ['syn-pinned-a', 'syn-pinned-b', 'syn-pinned-z', 'syn-unpinned-newest', 'syn-unpinned-a', 'syn-unpinned-b', 'syn-unpinned-z', 'syn-unpinned-oldest'] },
  { mode: 'oldest', expected: ['syn-pinned-z', 'syn-pinned-a', 'syn-pinned-b', 'syn-unpinned-oldest', 'syn-unpinned-a', 'syn-unpinned-b', 'syn-unpinned-z', 'syn-unpinned-newest'] },
  { mode: 'title', expected: ['syn-pinned-a', 'syn-pinned-b', 'syn-pinned-z', 'syn-unpinned-newest', 'syn-unpinned-a', 'syn-unpinned-b', 'syn-unpinned-z', 'syn-unpinned-oldest'] },
];
for (const item of sortCases) {
  test(`sortRows ${item.mode}: pins first, numeric/case-insensitive ties deterministic, inputs immutable`, () => {
    const before = sortFixture.map(value => ({ ...value }));
    for (const input of [sortFixture, freeze([...sortFixture].reverse()), freeze([...sortFixture.slice(3), ...sortFixture.slice(0, 3)])]) {
      const output = sortRows(input, item.mode, 'en');
      assert.deepEqual(ids(output), item.expected);
      assert.notEqual(output, input);
      assert.deepEqual(sortRows(input, item.mode, 'en'), output);
    }
    assert.deepEqual(sortFixture, before);
  });
}

test('sortRows defaults to recent and safely falls back for an invalid locale', () => {
  assert.deepEqual(ids(sortRows(sortFixture)), sortCases[0].expected);
  assert.deepEqual(ids(sortRows(sortFixture, 'synthetic-unsupported-sort', 'en')), sortCases[0].expected);
  assert.deepEqual(ids(sortRows(sortFixture, 'title', 'synthetic_invalid_locale')), sortCases[2].expected);
  const empty = freeze([]);
  assert.deepEqual(sortRows(empty), []);
  assert.notEqual(sortRows(empty), empty);
});

const pageFixture = freeze(Array.from({ length: 67 }, (_, index) => row(`syn-page-${index + 1}`)));

test('pageRows defaults to PAGE_SIZE and returns correct totals and ranges without mutating inputs', () => {
  const before = [...pageFixture];
  const result = pageRows(pageFixture);
  assert.equal(PAGE_SIZE, 30);
  assert.deepEqual(result, { items: pageFixture.slice(0, 30), page: 1, pages: 3, total: 67, from: 1, to: 30 });
  assert.notEqual(result.items, pageFixture);
  assert.equal(result.items[0], pageFixture[0]);
  assert.deepEqual(pageFixture, before);
  assert.deepEqual(pageRows(pageFixture, 2), { items: pageFixture.slice(30, 60), page: 2, pages: 3, total: 67, from: 31, to: 60 });
});

test('pageRows keeps one empty page with zero range for an empty result set', () => {
  for (const requestedPage of [undefined, 1, 2, 999, -5, NaN]) {
    assert.deepEqual(pageRows(freeze([]), requestedPage, 4), { items: [], page: 1, pages: 1, total: 0, from: 0, to: 0 });
  }
});

test('pageRows clamps excessive pages, truncates fractional pages, and clamps nonpositive pages', () => {
  const last = { items: pageFixture.slice(60), page: 3, pages: 3, total: 67, from: 61, to: 67 };
  for (const requestedPage of [3, 4, 999, Number.MAX_SAFE_INTEGER]) assert.deepEqual(pageRows(pageFixture, requestedPage), last);
  assert.deepEqual(pageRows(pageFixture, 2.9), { items: pageFixture.slice(30, 60), page: 2, pages: 3, total: 67, from: 31, to: 60 });
  for (const requestedPage of [0, -1, -7.8, 0.9]) assert.deepEqual(pageRows(pageFixture, requestedPage), pageRows(pageFixture, 1));
});

test('pageRows resets invalid/nonfinite page values instead of coercing them', () => {
  for (const requestedPage of [NaN, Infinity, -Infinity, '2', null, {}, false, 2n, Symbol('syn-page')]) {
    assert.deepEqual(pageRows(pageFixture, requestedPage), pageRows(pageFixture, 1));
  }
});

test('pageRows falls back to PAGE_SIZE for invalid sizes and accepts valid small/large sizes', () => {
  for (const size of [0, -1, 1.5, NaN, Infinity, -Infinity, '2', null, undefined, {}, false, 2n, Symbol('syn-size'), Number.MAX_SAFE_INTEGER + 1]) {
    assert.deepEqual(pageRows(pageFixture, 2, size), pageRows(pageFixture, 2, PAGE_SIZE));
  }
  assert.deepEqual(pageRows(pageFixture, 3, 2), { items: pageFixture.slice(4, 6), page: 3, pages: 34, total: 67, from: 5, to: 6 });
  assert.deepEqual(pageRows(pageFixture, 99, 1), { items: [pageFixture[66]], page: 67, pages: 67, total: 67, from: 67, to: 67 });
  for (const size of [100, Number.MAX_SAFE_INTEGER]) {
    assert.deepEqual(pageRows(pageFixture, 2, size), { items: [...pageFixture], page: 1, pages: 1, total: 67, from: 1, to: 67 });
  }
});
