import { STATUSES, isWorkspaceReady, deriveRows, workspaceChoices, filterRows, sortRows, statusCounts, pageRows, normalizeQuery, contentSearch } from './model.js';

export function createUi(React) {
  const h = React.createElement;
  const { useState, useMemo, useEffect, useRef, useId } = React;
  const emptyHits = new Map();
  const defaults = Object.freeze({ query: '', workspace: 'all', archive: 'active', status: 'all', pinnedOnly: false, sort: 'recent' });

  function Icon({ kind = 'ledger', size = 18, className = '' }) {
    const paths = {
      ledger: 'M5 4v16M5 5h14M5 12h14M5 19h14M10 5v0M10 12v0',
      search: 'M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
      arrow: 'M5 12h14M14 7l5 5-5 5',
      back: 'M19 12H5M10 7l-5 5 5 5',
      refresh: 'M20 7v5h-5M19 12a7 7 0 1 0-2 5M20 7l-3-3',
      close: 'M6 6l12 12M18 6L6 18',
      chevron: 'M8 5l7 7-7 7',
      pin: 'M9 4h6l-1 6 3 3H7l3-3-1-6M12 13v7',
      folder: 'M3 7V5h7l2 3h9v11H3V7',
    };
    return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.65, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, className }, h('path', { d: paths[kind] || paths.ledger }));
  }

  function PanelIcon({ size = 20 }) {
    return h(Icon, { size });
  }

  function Select({ label, value, onChange, children, className = '' }) {
    const id = useId();
    return h('label', { className: `dsv-field ${className}`, htmlFor: id },
      h('span', { className: 'dsv-label' }, label),
      h('select', { id, value, onChange: event => onChange(event.target.value) }, children));
  }

  function Notice({ children, tone = 'info', role = 'status' }) {
    return h('div', { className: 'dsv-notice', 'data-tone': tone, role }, children);
  }

  function activity(time, language, fallback) {
    if (!time || !Number.isFinite(time)) return { label: fallback, iso: undefined };
    const date = new Date(time);
    if (!Number.isFinite(date.getTime())) return { label: fallback, iso: undefined };
    const options = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', year: 'numeric' };
    let formatter;
    try { formatter = new Intl.DateTimeFormat(language, options); }
    catch { formatter = new Intl.DateTimeFormat('en', options); }
    return { label: formatter.format(date), iso: date.toISOString() };
  }

  function SessionRow({ row, t, language, useSessionAccess, onOpen, expanded, onToggle, workspaceReady, snippet }) {
    const canOpen = useSessionAccess(row.id, 'session/follow');
    const detailId = useId();
    const date = activity(row.updatedAt, language, t('dateUnknown'));
    const disabledReason = row.archived ? t('archivedHint') : !canOpen ? t('openDenied') : !workspaceReady ? t('workspaceLoading') : '';
    const open = () => { if (!disabledReason) onOpen(row.id); };
    return h('li', { className: 'dsv-session', 'data-status': row.status, 'data-archived': row.archived || undefined },
      h('div', { className: 'dsv-row' },
        h('div', { className: 'dsv-conversation' },
          h('div', { className: 'dsv-titleline' },
            row.pinned && h(React.Fragment, null, h(Icon, { kind: 'pin', size: 14, className: 'dsv-pin' }), h('span', { className: 'dsv-visuallyhidden' }, t('pinned'))),
            h('button', { type: 'button', className: 'dsv-title', onClick: open, disabled: !!disabledReason, title: disabledReason || row.title, 'aria-label': t('openSession', { title: row.title }) }, row.title),
            row.archived && h('span', { className: 'dsv-tag' }, t('archived')),
            row.parentId && h('span', { className: 'dsv-tag' }, t('forked'))),
          h('div', { className: 'dsv-subline' },
            h('span', { className: 'dsv-state', 'data-status': row.status }, h('i', { 'aria-hidden': true }), t(row.status)),
            h('span', { className: 'dsv-dir', title: row.cwd }, row.cwd || t('noDirectory'))),
          snippet && h('p', { className: 'dsv-snippet' }, h('span', null, t('searchResult')), ' ', snippet)),
        h('div', { className: 'dsv-workspace', title: row.workspacePath }, h(Icon, { kind: 'folder', size: 14 }), h('span', null, row.workspaceLabel)),
        h('time', { className: 'dsv-activity', dateTime: date.iso, title: date.iso }, date.label),
        h('div', { className: 'dsv-rowactions' },
          h('button', { type: 'button', className: 'dsv-open dsv-button', onClick: open, disabled: !!disabledReason, title: disabledReason || t('openSession', { title: row.title }), 'aria-label': t('openSession', { title: row.title }) }, t('open'), h(Icon, { kind: 'arrow', size: 14 })),
          h('button', { type: 'button', className: 'dsv-expand dsv-iconbutton', onClick: onToggle, 'aria-expanded': expanded, 'aria-controls': detailId, 'aria-label': t(expanded ? 'collapse' : 'expand', { title: row.title }) }, h(Icon, { kind: 'chevron', size: 14 })))),
      h('div', { id: detailId, className: 'dsv-detail', hidden: !expanded },
        h('dl', null,
          h('dt', null, t('sessionId')), h('dd', null, h('code', null, row.id)),
          h('dt', null, t('directory')), h('dd', null, h('code', null, row.cwd || t('notSet'))),
          row.parentId && h(React.Fragment, null, h('dt', null, t('parent')), h('dd', null, h('code', null, row.parentId)))),
        disabledReason && h('p', { className: 'dsv-detailnote' }, disabledReason)));
  }

  function SessionOverview(props) {
    const { t, searchContent, refreshList, openSession, returnToChat, getLanguage, searchResultLimit } = props;
    const ids = props.useSessions(state => state.ids);
    const byId = props.useSessions(state => state.byId);
    const phase = props.useSessions(state => state.phase);
    const workspaceItems = props.useWorkspaces(state => state.items);
    const archivedIds = props.useWorkspaces(state => state.archivedSessionIds);
    const pinnedIds = props.useWorkspaces(state => state.pinnedSessionIds);
    const workspacePhase = props.useWorkspaces(state => state.phase);
    const workspaceError = props.useWorkspaces(state => state.error);
    const workspaceState = props.useWorkspaces(state => state.state);
    const statuses = props.useSessionStatus(state => state);
    const canList = props.useRemoteAccess('session/list');
    const canSearch = props.useRemoteAccess('session/search');
    const [filters, setFilters] = useState(defaults);
    const [mode, setMode] = useState('metadata');
    const [page, setPage] = useState(1);
    const [expanded, setExpanded] = useState(null);
    const [composing, setComposing] = useState(false);
    const [content, setContent] = useState({ query: '', state: 'idle', hits: emptyHits, hasMore: false });
    const [retry, setRetry] = useState(0);
    const [refreshState, setRefreshState] = useState('idle');
    const [openError, setOpenError] = useState('');
    const alive = useRef(true);
    const inputRef = useRef(null);
    const searchId = useId();
    const language = getLanguage();
    const normalized = normalizeQuery(filters.query);
    const searchEnabled = mode === 'content' && canSearch && canList && !!normalized;
    const contentCurrent = searchEnabled && content.query === filters.query.trim();
    const hits = contentCurrent && content.state === 'ready' ? content.hits : emptyHits;
    const searching = searchEnabled && (!contentCurrent || content.state === 'pending');
    const workspaceReady = isWorkspaceReady({ phase: workspacePhase, state: workspaceState, error: workspaceError });
    const catalog = useMemo(() => ({ ids, byId, phase }), [ids, byId, phase]);
    const workspaces = useMemo(() => ({ items: workspaceItems, archivedSessionIds: archivedIds, pinnedSessionIds: pinnedIds }), [workspaceItems, archivedIds, pinnedIds]);
    const labels = { newSession: t('newSession'), untitled: t('untitled'), ungrouped: t('ungrouped') };
    const allRows = useMemo(() => deriveRows(catalog, workspaces, statuses, labels), [catalog, workspaces, statuses, language, t]);
    const choices = useMemo(() => workspaceChoices(workspaceItems, labels), [workspaceItems, language, t]);
    const scopedRows = useMemo(() => filterRows(allRows, { ...filters, status: 'all' }, hits), [allRows, filters, hits]);
    const counts = useMemo(() => statusCounts(scopedRows), [scopedRows]);
    const filtered = useMemo(() => sortRows(filterRows(scopedRows, { status: filters.status }), filters.sort, language), [scopedRows, filters.status, filters.sort, language]);
    const pagination = pageRows(filtered, page);
    const update = (key, value) => { setFilters(current => ({ ...current, [key]: value })); setPage(1); setOpenError(''); };
    const reset = () => { setFilters(defaults); setMode('metadata'); setPage(1); setExpanded(null); setOpenError(''); inputRef.current?.focus(); };

    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    useEffect(() => {
      if (!searchEnabled || composing) return;
      const controller = new AbortController();
      const query = filters.query.trim();
      setContent({ query, state: 'pending', hits: emptyHits, hasMore: false });
      const timer = setTimeout(() => {
        void contentSearch(searchContent, query, controller.signal, result => setContent({ query, ...result }));
      }, 250);
      return () => { clearTimeout(timer); controller.abort(); };
    }, [filters.query, mode, canSearch, canList, composing, retry, searchContent]);
    useEffect(() => { if (page !== pagination.page) setPage(pagination.page); }, [page, pagination.page]);
    useEffect(() => {
      if (filters.workspace !== 'all' && filters.workspace !== 'ungrouped' && !choices.some(choice => choice.id === filters.workspace) && workspacePhase === 'ready') update('workspace', 'all');
    }, [choices, filters.workspace, workspacePhase]);

    const refresh = async () => {
      if (refreshState === 'pending') return;
      setRefreshState('pending');
      try { await refreshList(); if (alive.current) { setRefreshState('complete'); setRetry(value => value + 1); } }
      catch { if (alive.current) setRefreshState('error'); }
    };
    const open = id => {
      setOpenError('');
      try { openSession(id); }
      catch (error) { setOpenError(error instanceof Error ? error.message : String(error)); }
    };

    return h('section', { className: 'dsv-page', 'aria-label': t('panel') },
      h('header', { className: 'dsv-head' },
        h('div', { className: 'dsv-heading' }, h('p', { className: 'dsv-eyebrow' }, t('eyebrow')), h('h1', null, t('panel')), h('p', { className: 'dsv-subtitle' }, t('subtitle'))),
        h('div', { className: 'dsv-headtools' },
          h('button', { type: 'button', className: 'dsv-button', onClick: returnToChat }, h(Icon, { kind: 'back', size: 15 }), t('back')),
          h('button', { type: 'button', className: 'dsv-button', onClick: refresh, disabled: !canList || refreshState === 'pending', 'aria-busy': refreshState === 'pending' }, h(Icon, { kind: 'refresh', size: 15, className: refreshState === 'pending' ? 'dsv-spin' : '' }), t(refreshState === 'pending' ? 'refreshing' : 'refresh')))),
      h('div', { className: 'dsv-body' },
        !canList ? h(Notice, null, t('noAccess')) : h(React.Fragment, null,
          h('div', { className: 'dsv-filters' },
            h('div', { className: 'dsv-searchrow' },
              h('div', { className: 'dsv-searchfield' },
                h('label', { className: 'dsv-visuallyhidden', htmlFor: searchId }, t('search')),
                h(Icon, { kind: 'search', size: 18 }),
                h('input', { ref: inputRef, id: searchId, type: 'search', autoComplete: 'off', value: filters.query, placeholder: t('searchPlaceholder'), onChange: event => update('query', event.target.value), onCompositionStart: () => setComposing(true), onCompositionEnd: () => setComposing(false) }),
                filters.query && h('button', { type: 'button', className: 'dsv-iconbutton', 'aria-label': t('clearSearch'), onClick: () => { update('query', ''); inputRef.current?.focus(); } }, h(Icon, { kind: 'close', size: 15 }))),
              h(Select, { label: t('searchMode'), value: mode, onChange: value => { setMode(value); setPage(1); }, className: 'dsv-mode' },
                h('option', { value: 'metadata' }, t('metadata')), h('option', { value: 'content', disabled: !canSearch }, t('content')))),
            h('div', { className: 'dsv-filterrow' },
              h(Select, { label: t('workspace'), value: filters.workspace, onChange: value => update('workspace', value), className: 'dsv-workspacefilter' },
                h('option', { value: 'all' }, t('allWorkspaces')), h('option', { value: 'ungrouped' }, t('ungrouped')), choices.map(choice => h('option', { key: choice.id, value: choice.id }, choice.label))),
              h(Select, { label: t('archiveScope'), value: filters.archive, onChange: value => update('archive', value) }, h('option', { value: 'active' }, t('activeOnly')), h('option', { value: 'all' }, t('includeArchived')), h('option', { value: 'archived' }, t('archivedOnly'))),
              h(Select, { label: t('sort'), value: filters.sort, onChange: value => update('sort', value) }, h('option', { value: 'recent' }, t('recent')), h('option', { value: 'oldest' }, t('oldest')), h('option', { value: 'title' }, t('titleSort'))),
              h('label', { className: 'dsv-check' }, h('input', { type: 'checkbox', checked: filters.pinnedOnly, onChange: event => update('pinnedOnly', event.target.checked) }), t('pinnedOnly')))),
          h('nav', { className: 'dsv-statusbar', 'aria-label': t('statusFilter') }, STATUSES.map(status => h('button', { key: status, type: 'button', className: 'dsv-statusbutton', 'data-status': status, 'aria-pressed': filters.status === status, onClick: () => update('status', status) }, h('span', null, t(status)), h('strong', null, counts[status])))),
          h('div', { className: 'dsv-live', 'aria-live': 'polite', 'aria-atomic': true },
            refreshState === 'complete' && h('span', { className: 'dsv-confirm' }, t('refreshCompleted')),
            searching && h('span', null, t('searching')),
            phase === 'ready' && workspaceReady && !searching && h('span', null, pagination.total ? t('range', pagination) : t(allRows.length ? 'noMatches' : 'empty'))),
          refreshState === 'error' && h(Notice, { tone: 'error', role: 'alert' }, t('refreshFailed')),
          mode === 'content' && !canSearch && h(Notice, { tone: 'warn' }, t('contentUnavailable')),
          contentCurrent && content.state === 'error' && h(Notice, { tone: 'error', role: 'alert' }, h('span', null, t('searchFailed')), h('button', { type: 'button', className: 'dsv-textbutton', onClick: () => setRetry(value => value + 1) }, t('retry'))),
          contentCurrent && content.hasMore && h(Notice, { tone: 'warn' }, t('bounded', { limit: searchResultLimit })),
          !workspaceReady && h(Notice, { tone: workspaceState === 'error' ? 'warn' : 'info' }, t(workspaceState === 'error' ? 'workspaceFailed' : 'workspaceLoading')),
          openError && h(Notice, { tone: 'error', role: 'alert' }, h('span', null, t('openFailed')), h('code', null, openError)),
          phase === 'pending' ? h('div', { className: 'dsv-empty', role: 'status' }, h(Icon, { size: 34 }), h('p', null, t('loading')))
            : !pagination.total && searching ? h('div', { className: 'dsv-empty', role: 'status' }, h(Icon, { kind: 'search', size: 34 }), h('p', null, t('searching')))
            : !pagination.total ? h('div', { className: 'dsv-empty' }, h(Icon, { size: 34 }), h('h2', null, t(allRows.length ? 'noMatches' : 'empty')), h('p', null, t(allRows.length ? 'noMatchesHelp' : 'emptyHelp')), h('button', { type: 'button', className: 'dsv-button', onClick: allRows.length ? reset : returnToChat }, t(allRows.length ? 'reset' : 'back')))
              : h('div', { className: 'dsv-ledger', 'aria-busy': searching },
                h('div', { className: 'dsv-columns', 'aria-hidden': true }, h('span', null, t('session')), h('span', null, t('location')), h('span', { title: t('updatedNote') }, t('activity')), h('span')),
                h('ul', { className: 'dsv-list', 'aria-label': t('results', { count: pagination.total }) }, pagination.items.map(row => h(SessionRow, { key: row.id, row, t, language, useSessionAccess: props.useSessionAccess, workspaceReady, expanded: expanded === row.id, onToggle: () => setExpanded(value => value === row.id ? null : row.id), onOpen: open, snippet: hits.get(row.id) }))),
                h('footer', { className: 'dsv-pagination' },
                  h('span', null, t('range', pagination)),
                  h('div', { className: 'dsv-pagenav' }, h('span', { className: 'dsv-pagelabel' }, t('page', pagination)),
                    h('button', { type: 'button', className: 'dsv-iconbutton', onClick: () => setPage(pagination.page - 1), disabled: pagination.page === 1, 'aria-label': t('previous') }, h(Icon, { kind: 'back', size: 16 })),
                    h('button', { type: 'button', className: 'dsv-iconbutton', onClick: () => setPage(pagination.page + 1), disabled: pagination.page === pagination.pages, 'aria-label': t('next') }, h(Icon, { kind: 'arrow', size: 16 }))))),
          h('p', { className: 'dsv-footnote' }, h('span', null, t('readOnly')), h('span', null, t('pinOrder'))))));
  }

  return { SessionOverview, PanelIcon };
}
