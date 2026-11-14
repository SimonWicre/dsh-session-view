import test from 'node:test';
import assert from 'node:assert/strict';
import { contentSearch, decodeSearchResult } from '../src/model.js';

// Controlled promises exercise the real public search functions and native AbortSignal.
// Fixtures contain only synthetic IDs and literal strings; no React/DOM or live services.
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function ok(items = [], hasMore = false) {
  return { ok: true, value: { items, hasMore } };
}

function freeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

const literalSnippet = '<script>syntheticOnly()</script> <em>ＳＹＮ</em> &amp; .*+? [x] \\n\nsecond synthetic line';

test('decodeSearchResult requires RemoteResult.ok === true and preserves literal snippets', () => {
  const response = freeze(ok([
    { sessionId: 'syn-hit-first', snippet: literalSnippet, extra: 'synthetic-extra-field' },
    { sessionId: 'syn-hit-first', snippet: 'synthetic duplicate must not replace the first hit' },
    { sessionId: 'syn-hit-number-snippet', snippet: 42 },
    { sessionId: 'syn-hit-null-snippet', snippet: null },
    { sessionId: 42, snippet: 'synthetic invalid ID' },
    { snippet: 'synthetic missing ID' },
  ], true));
  const decoded = decodeSearchResult(response);
  assert.ok(decoded.hits instanceof Map);
  assert.deepEqual([...decoded.hits], [
    ['syn-hit-first', literalSnippet],
    ['syn-hit-number-snippet', ''],
    ['syn-hit-null-snippet', ''],
  ]);
  assert.equal(decoded.hasMore, true);
  assert.deepEqual(Object.keys(decoded).sort(), ['hasMore', 'hits']);
  assert.equal(response.value.items[0].snippet, literalSnippet);
  assert.equal(response.value.items.length, 6);
});

test('decodeSearchResult preserves the first duplicate even when its snippet is empty', () => {
  const decoded = decodeSearchResult(ok([
    { sessionId: 'syn-first-empty', snippet: '' },
    { sessionId: 'syn-first-empty', snippet: 'synthetic later text' },
    { sessionId: 'syn-first-missing' },
    { sessionId: 'syn-first-missing', snippet: 'synthetic later text' },
  ]));
  assert.deepEqual([...decoded.hits], [['syn-first-empty', ''], ['syn-first-missing', '']]);
});

test('decodeSearchResult handles empty success payloads and only boolean true means hasMore', () => {
  for (const response of [{ ok: true }, { ok: true, value: null }, { ok: true, value: {} }, ok()]) {
    assert.deepEqual(decodeSearchResult(response), { hits: new Map(), hasMore: false });
  }
  for (const hasMore of [undefined, false, null, 'true', 1]) {
    assert.equal(decodeSearchResult(ok([], hasMore)).hasMore, false);
  }
  assert.equal(decodeSearchResult(ok([], true)).hasMore, true);
});

const invalidResponses = [
  { name: 'undefined response', response: undefined, message: 'Invalid search response' },
  { name: 'null response', response: null, message: 'Invalid search response' },
  { name: 'missing ok', response: { value: { items: [] } }, message: 'Invalid search response' },
  { name: 'truthy numeric ok is not success', response: { ok: 1, value: { items: [] } }, message: 'Invalid search response' },
  { name: 'truthy string ok is not success', response: { ok: 'true', value: { items: [] } }, message: 'Invalid search response' },
  { name: 'code and message', response: { ok: false, error: { code: 'SYN_SEARCH_DENIED', message: 'synthetic denied' } }, message: 'SYN_SEARCH_DENIED: synthetic denied' },
  { name: 'message only', response: { ok: false, error: { message: 'synthetic network unavailable' } }, message: 'synthetic network unavailable' },
  { name: 'code only', response: { ok: false, error: { code: 'SYN_SEARCH_FAILED' } }, message: 'SYN_SEARCH_FAILED' },
  { name: 'missing error text', response: { ok: false, error: {} }, message: 'Invalid search response' },
  { name: 'non-string error fields', response: { ok: false, error: { code: 17, message: null } }, message: 'Invalid search response' },
];
for (const item of invalidResponses) {
  test(`decodeSearchResult rejects ${item.name}`, () => {
    assert.throws(() => decodeSearchResult(freeze(item.response)), error => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, item.message);
      return true;
    });
  });
}

test('contentSearch forwards a trimmed, still literal query and the exact native signal', async () => {
  const controller = new AbortController();
  const published = [];
  const calls = [];
  const search = async (query, signal) => {
    calls.push({ query, signal });
    return freeze(ok([{ sessionId: 'syn-search-literal', snippet: literalSnippet }], true));
  };
  const result = await contentSearch(search, ' \tＳＹＮ Query .*+? [X]\n ', controller.signal, value => published.push(value));

  assert.equal(result, undefined);
  assert.deepEqual(calls, [{ query: 'ＳＹＮ Query .*+? [X]', signal: controller.signal }]);
  assert.deepEqual(published, [{ state: 'ready', hits: new Map([['syn-search-literal', literalSnippet]]), hasMore: true }]);
});

const emptyQueries = [
  { name: 'empty string', value: '' },
  { name: 'ASCII whitespace', value: ' \t\r\n ' },
  { name: 'Unicode whitespace', value: '\u3000\u00a0' },
  { name: 'undefined', value: undefined },
  { name: 'null', value: null },
  { name: 'number', value: 23 },
  { name: 'object', value: {} },
];
for (const item of emptyQueries) {
  test(`contentSearch does not call search or publish for ${item.name}`, async () => {
    const controller = new AbortController();
    let calls = 0;
    const published = [];
    await contentSearch(() => { calls++; return ok(); }, item.value, controller.signal, value => published.push(value));
    assert.equal(calls, 0);
    assert.deepEqual(published, []);
  });
}

test('contentSearch does nothing when its signal was already aborted', async () => {
  const controller = new AbortController();
  controller.abort('synthetic pre-abort');
  let calls = 0;
  const published = [];
  await contentSearch(() => { calls++; return ok(); }, 'synthetic query', controller.signal, value => published.push(value));
  assert.equal(calls, 0);
  assert.deepEqual(published, []);
});

test('contentSearch publishes exactly once only after an un-aborted delayed result completes', async () => {
  const source = deferred();
  const controller = new AbortController();
  const published = [];
  const task = contentSearch(() => source.promise, 'synthetic delayed query', controller.signal, value => published.push(value));
  await Promise.resolve();
  assert.deepEqual(published, [], 'an unresolved search must not publish a ready state');
  source.resolve(ok([{ sessionId: 'syn-delayed-current', snippet: 'synthetic delayed snippet' }]));
  await task;
  assert.deepEqual(published, [{ state: 'ready', hits: new Map([['syn-delayed-current', 'synthetic delayed snippet']]), hasMore: false }]);
});

const lateOutcomes = [
  { name: 'successful response', settle: source => source.resolve(ok([{ sessionId: 'syn-stale-success', snippet: 'synthetic stale snippet' }], true)) },
  { name: 'RemoteResult error', settle: source => source.resolve({ ok: false, error: { code: 'SYN_STALE_FAILURE', message: 'synthetic stale failure' } }) },
  { name: 'rejected promise', settle: source => source.reject(new Error('synthetic late rejection')) },
];
for (const item of lateOutcomes) {
  test(`contentSearch ignores a delayed ${item.name} after cancellation`, async () => {
    const source = deferred();
    const controller = new AbortController();
    const published = [];
    let suppliedSignal;
    const task = contentSearch((query, signal) => { suppliedSignal = signal; return source.promise; }, 'synthetic canceled query', controller.signal, value => published.push(value));
    assert.equal(suppliedSignal, controller.signal);
    controller.abort('synthetic cancellation');
    await Promise.resolve();
    assert.deepEqual(published, []);
    item.settle(source);
    await task;
    assert.deepEqual(published, []);
  });

  test(`contentSearch replacement result survives an older canceled ${item.name}`, async () => {
    const older = deferred();
    const newer = deferred();
    const oldController = new AbortController();
    const newController = new AbortController();
    const published = [];
    const calls = [];
    const search = (query, signal) => {
      calls.push({ query, signal });
      return query === 'synthetic old' ? older.promise : newer.promise;
    };
    const publish = value => published.push(value);
    const oldTask = contentSearch(search, 'synthetic old', oldController.signal, publish);
    oldController.abort('synthetic query replacement');
    const newTask = contentSearch(search, 'synthetic new', newController.signal, publish);
    newer.resolve(ok([{ sessionId: 'syn-current-hit', snippet: 'synthetic current snippet' }]));
    await newTask;
    const expected = [{ state: 'ready', hits: new Map([['syn-current-hit', 'synthetic current snippet']]), hasMore: false }];
    assert.deepEqual(published, expected);
    item.settle(older);
    await oldTask;
    assert.deepEqual(published, expected, 'an old completion must not overwrite a current result or publish an error');
    assert.deepEqual(calls, [
      { query: 'synthetic old', signal: oldController.signal },
      { query: 'synthetic new', signal: newController.signal },
    ]);
  });
}

test('contentSearch checks cancellation after resolution but before its await continuation runs', async () => {
  const source = deferred();
  const controller = new AbortController();
  const published = [];
  const task = contentSearch(() => source.promise, 'synthetic resolution race', controller.signal, value => published.push(value));
  source.resolve(ok([{ sessionId: 'syn-resolved-but-aborted', snippet: 'synthetic ignored' }]));
  controller.abort('synthetic same-turn abort');
  await task;
  assert.deepEqual(published, []);
});

test('contentSearch checks cancellation after rejection but before its catch continuation runs', async () => {
  const source = deferred();
  const controller = new AbortController();
  const published = [];
  const task = contentSearch(() => source.promise, 'synthetic rejection race', controller.signal, value => published.push(value));
  source.reject(new Error('synthetic same-turn rejection'));
  controller.abort('synthetic same-turn abort');
  await task;
  assert.deepEqual(published, []);
});

test('contentSearch ignores a synchronous search result if search itself aborts the signal', async () => {
  const controller = new AbortController();
  const published = [];
  await contentSearch(() => {
    controller.abort('synthetic abort in search');
    return ok([{ sessionId: 'syn-sync-aborted', snippet: 'synthetic ignored' }]);
  }, 'synthetic synchronous race', controller.signal, value => published.push(value));
  assert.deepEqual(published, []);
});

const searchFailures = [
  { name: 'synchronous Error', search: () => { throw new Error('synthetic synchronous failure'); }, message: 'synthetic synchronous failure' },
  { name: 'asynchronous Error', search: async () => { throw new Error('synthetic asynchronous failure'); }, message: 'synthetic asynchronous failure' },
  { name: 'asynchronous string rejection', search: async () => { throw 'synthetic string failure'; }, message: 'synthetic string failure' },
  { name: 'asynchronous null rejection', search: async () => { throw null; }, message: 'null' },
  { name: 'RemoteResult failure', search: async () => ({ ok: false, error: { code: 'SYN_REMOTE_FAILED', message: 'synthetic remote failed' } }), message: 'SYN_REMOTE_FAILED: synthetic remote failed' },
  { name: 'invalid response', search: async () => ({ ok: 'true' }), message: 'Invalid search response' },
];
for (const item of searchFailures) {
  test(`contentSearch publishes a fresh empty error result for ${item.name}`, async () => {
    const controller = new AbortController();
    const published = [];
    await contentSearch(item.search, 'synthetic failing query', controller.signal, value => published.push(value));
    assert.deepEqual(published, [{ state: 'error', hits: new Map(), hasMore: false, error: item.message }]);
  });
}

test('contentSearch suppresses a synchronous thrown error when search has aborted its signal', async () => {
  const controller = new AbortController();
  const published = [];
  await contentSearch(() => {
    controller.abort('synthetic abort before throw');
    throw new Error('synthetic abort-related failure');
  }, 'synthetic canceled failure', controller.signal, value => published.push(value));
  assert.deepEqual(published, []);
});
