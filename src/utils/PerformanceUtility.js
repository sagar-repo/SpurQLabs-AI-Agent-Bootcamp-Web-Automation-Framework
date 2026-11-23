const fs = require('fs');
const path = require('path');

/**
 * PerformanceUtility — per-scenario frontend performance capture.
 *
 * Why this exists: a HAR has byte sizes and network timing, but it cannot contain
 * browser-side metrics (FCP, LCP, CLS, long tasks, DOM size, interaction latency,
 * SPA route timing). Those only exist inside the live page, so they have to be
 * collected here, in the framework, next to the Playwright `page`.
 *
 * Scenario-driven, multi-page capture
 * -----------------------------------
 * A full-page navigation destroys the old document and every metric with it, so a
 * single snapshot at the end of a scenario would only describe the LAST page.
 * Instead:
 *   - every document gets its own `docId` (set by the init script);
 *   - hooks.js calls `snapshot()` after every step, and each snapshot is stored
 *     under that `docId` (a newer snapshot of the same page REPLACES the older one,
 *     so LCP/CLS/long-task values keep improving until the page is left);
 *   - a `pagehide` binding is a best-effort safety net for a page that is loaded
 *     and left inside one single step;
 *   - `finalSnapshot()` (called from the After hook) waits briefly so LCP/CLS settle.
 * The result is one entry per page the scenario actually visited, in visit order.
 *
 * Output: reports/perf/<scenarioSlug>_perf.json   (see SCHEMA_VERSION below).
 * That file is a cross-repo contract with the MCP server's frontend report — never
 * drop/rename a field without bumping SCHEMA_VERSION.
 *
 * Nothing here ever throws into a scenario: a metrics failure must not fail a test.
 * The only exception is the opt-in budget enforcement (`PERF_ENFORCE_BUDGET=true`
 * or config `performance.enforceBudget`), which is returned to the caller so the
 * After hook can raise it AFTER cleanup.
 */

// v2 (additive over v1): longTasks.tbt, resources.renderBlocking, per-page coverage
// (opt-in), report-level tags/tcIds. A v1 consumer keeps working; a consumer that
// reads a v2 field from a v1 file must treat it as "not measured", never as 0.
const SCHEMA_VERSION = 2;

const DEFAULT_BUDGET = {
  pageLoadTime: 3000,
  ttfb: 800,
  fcp: 1800,
  lcp: 2500,
  cls: 0.1,
  tbt: 200,
  maxRequests: 100,
  maxTransferSize: 10 * 1024 * 1024,
  maxLongTasks: 10,
  maxDOMNodes: 15000,
  maxJavaScriptSize: 5 * 1024 * 1024,
  maxImageSize: 5 * 1024 * 1024
};

const EVALUATE_TIMEOUT_MS = 4000;
const MAX_COVERAGE_FILES = 20;

// URLs the coverage pass must never re-visit: loading one could perform the action it names.
const ACTION_URL_PATTERN = /(log-?out|sign-?out|delete|remove|destroy|unsubscribe|cancel|reset)/i;

// Matches the framework's own TC tag convention, e.g. @AIPL-TC-069 / @DEMO-TC-101.
const TC_TAG_PATTERN = /^@([A-Za-z0-9]+-TC-\d+)$/i;
// ...and the "Automated - <TC-ID>: <title>" scenario naming qa_automate generates.
const TC_NAME_PATTERN = /Automated - ([A-Za-z0-9]+-TC-\d+)/i;

/** Test-case ids for a scenario, from its tags and (as a fallback) its name. Deduped, order kept. */
function extractTcIds(tags = [], scenarioName = '') {
  const ids = [];
  const add = (id) => { const up = id.toUpperCase(); if (!ids.includes(up)) ids.push(up); };
  for (const tag of tags) {
    const m = TC_TAG_PATTERN.exec(String(tag).trim());
    if (m) add(m[1]);
  }
  const named = TC_NAME_PATTERN.exec(scenarioName || '');
  if (named) add(named[1]);
  return ids;
}

/**
 * Unused bytes of one script from V8 precise coverage. Ranges are nested (a function
 * inside a function, blocks inside both), so paint outer-first and let inner ranges
 * override: sort by start asc, end desc. Units are UTF-16 code units of the source,
 * which equals bytes for the (overwhelmingly ASCII) minified bundles this is used on.
 */
function unusedInScript(source, functions) {
  const length = source.length;
  const covered = new Uint8Array(length);
  const ranges = [];
  for (const fn of functions || []) {
    for (const r of fn.ranges || []) ranges.push(r);
  }
  ranges.sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
  for (const r of ranges) {
    covered.fill(r.count > 0 ? 1 : 0, Math.max(0, r.startOffset), Math.min(length, r.endOffset));
  }
  let used = 0;
  for (let i = 0; i < length; i++) used += covered[i];
  return { total: length, unused: length - used };
}

function unusedInStylesheet(text, ranges) {
  // CSS coverage reports USED ranges; merge overlaps before summing.
  const sorted = (ranges || []).slice().sort((a, b) => a.start - b.start);
  let used = 0;
  let cursor = 0;
  for (const r of sorted) {
    const start = Math.max(r.start, cursor);
    if (r.end > start) { used += r.end - start; cursor = r.end; }
  }
  return { total: text.length, unused: Math.max(0, text.length - used) };
}

function summarizeCoverage(perFile) {
  const total = perFile.reduce((s, f) => s + f.total, 0);
  const unused = perFile.reduce((s, f) => s + f.unused, 0);
  return {
    files: perFile.length,
    totalBytes: total,
    unusedBytes: unused,
    unusedPct: total ? Math.round((unused / total) * 1000) / 10 : 0,
    top: perFile
      .filter((f) => f.unused > 0)
      .sort((a, b) => b.unused - a.unused)
      .slice(0, MAX_COVERAGE_FILES)
      .map((f) => ({ url: f.url, totalBytes: f.total, unusedBytes: f.unused,
        unusedPct: f.total ? Math.round((f.unused / f.total) * 1000) / 10 : 0 }))
  };
}

/**
 * Runs in the browser on EVERY new document, before any page script.
 * Everything it needs must live inside this function (it is serialized).
 */
function browserInit() {
  // Only the top frame is a "page" — iframes get their own init-script run too.
  if (window !== window.top) return;

  const docId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  window.__perfDocId = docId;

  const metrics = { lcp: 0, cls: 0, longTasks: [], interactions: [] };
  window.__perfMetrics = metrics;

  try {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      if (entries.length) metrics.lcp = entries[entries.length - 1].startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (_) { /* observer type unsupported */ }

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) metrics.cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch (_) { /* observer type unsupported */ }

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        metrics.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch (_) { /* observer type unsupported */ }

  // Not a replacement for field INP — useful for slow interactions inside a test run.
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'event' && entry.duration) {
          metrics.interactions.push({
            name: entry.name, startTime: entry.startTime, duration: entry.duration
          });
        }
      }
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
  } catch (_) { /* Event Timing API unavailable */ }

  // Optional hook for the application: window.markPageReady()
  window.markPageReady = function () { performance.mark('page-ready'); };

  window.__perfCollect = function () {
    const nav = performance.getEntriesByType('navigation')[0] || null;
    const sum = (items, key) => items.reduce((total, item) => total + (item[key] || 0), 0);

    // ── Navigation ────────────────────────────────────────────────────────
    const navigation = nav ? {
      startTime: nav.startTime,
      duration: nav.loadEventEnd > 0 ? nav.duration : null,
      redirectTime: nav.redirectEnd - nav.redirectStart,
      dns: nav.domainLookupEnd - nav.domainLookupStart,
      tcp: nav.connectEnd - nav.connectStart,
      tls: nav.secureConnectionStart > 0 ? nav.connectEnd - nav.secureConnectionStart : 0,
      requestTime: nav.responseStart - nav.requestStart,
      responseTime: nav.responseEnd - nav.responseStart,
      // Standard TTFB: navigation start -> first response byte (includes redirect/DNS/TCP/TLS).
      ttfb: nav.responseStart - nav.startTime,
      domInteractive: nav.domInteractive,
      domContentLoaded: nav.domContentLoadedEventEnd,
      domComplete: nav.domComplete,
      loadEventEnd: nav.loadEventEnd,
      transferSize: nav.transferSize,
      encodedBodySize: nav.encodedBodySize,
      decodedBodySize: nav.decodedBodySize,
      type: nav.type,
      nextHopProtocol: nav.nextHopProtocol,
      redirectCount: nav.redirectCount
    } : null;

    // ── Paint ─────────────────────────────────────────────────────────────
    const paintByName = {};
    for (const entry of performance.getEntriesByType('paint')) paintByName[entry.name] = entry.startTime;
    const paint = {
      fcp: paintByName['first-contentful-paint'] ?? null,
      fp: paintByName['first-paint'] ?? null
    };

    // ── Long tasks / interactions ─────────────────────────────────────────
    const tasks = metrics.longTasks;

    // Total Blocking Time: for every long task, the part beyond 50ms, counted only
    // after FCP. Lighthouse ends the window at Time To Interactive, which is
    // deprecated and not exposed by any browser API. This window runs from FCP to the
    // moment of the snapshot instead — the same lifetime longTasks.count/total use, and
    // it deliberately includes post-load work (framework hydration) that a load-end
    // cutoff would silently miss. Because a later snapshot of the same page replaces an
    // earlier one, the final value covers the whole time the scenario stayed on the page,
    // INCLUDING long tasks caused by the test's own interactions. So it will not match
    // Lighthouse's number exactly — it is a comparable lab figure and the report labels
    // it that way. null (not 0) when FCP is unknown.
    const fcpStart = paintByName['first-contentful-paint'];
    const windowEnd = performance.now();
    let tbt = null;
    if (fcpStart !== undefined) {
      tbt = 0;
      for (const task of tasks) {
        const start = Math.max(task.startTime, fcpStart);
        const end = Math.min(task.startTime + task.duration, windowEnd);
        if (end - start > 50) tbt += (end - start) - 50;
      }
    }
    const longTasks = {
      count: tasks.length,
      totalDuration: sum(tasks, 'duration'),
      maxDuration: tasks.length ? Math.max(...tasks.map((t) => t.duration)) : 0,
      tbt,
      tbtWindow: 'fcp-to-snapshot',
      tasks: tasks.slice(0, 20)
    };
    const inter = metrics.interactions;
    const interactions = {
      count: inter.length,
      maxDuration: inter.length ? Math.max(...inter.map((i) => i.duration)) : 0,
      averageDuration: inter.length ? sum(inter, 'duration') / inter.length : 0,
      slowest: inter.slice().sort((a, b) => b.duration - a.duration).slice(0, 10)
    };

    // ── Resources ─────────────────────────────────────────────────────────
    const origin = location.origin;
    const categories = { javascript: [], css: [], images: [], fonts: [], api: [], other: [] };
    const all = performance.getEntriesByType('resource').map((r) => {
      let thirdParty = false;
      try { thirdParty = new URL(r.name).origin !== origin; } catch (_) { /* data: URLs etc. */ }
      return {
        name: r.name,
        initiatorType: r.initiatorType,
        nextHopProtocol: r.nextHopProtocol,
        // Chromium 107+; undefined elsewhere, which stays "unknown" rather than false.
        renderBlocking: r.renderBlockingStatus === undefined ? null : r.renderBlockingStatus === 'blocking',
        thirdParty,
        startTime: r.startTime,
        duration: r.duration,
        transferSize: r.transferSize || 0,
        encodedBodySize: r.encodedBodySize || 0,
        decodedBodySize: r.decodedBodySize || 0
      };
    });
    for (const r of all) {
      const name = r.name.toLowerCase();
      if (r.initiatorType === 'fetch' || r.initiatorType === 'xmlhttprequest') categories.api.push(r);
      else if (/\.js(\?|$)/.test(name) || r.initiatorType === 'script') categories.javascript.push(r);
      else if (/\.css(\?|$)/.test(name)) categories.css.push(r);
      else if (/\.(png|jpe?g|gif|webp|svg|avif|ico)(\?|$)/.test(name)) categories.images.push(r);
      else if (/\.(woff2?|ttf|otf)(\?|$)/.test(name)) categories.fonts.push(r);
      else categories.other.push(r);
    }
    const summarize = (items, cap) => ({
      requests: items.length,
      transferSize: sum(items, 'transferSize'),
      encodedBodySize: sum(items, 'encodedBodySize'),
      decodedBodySize: sum(items, 'decodedBodySize'),
      slowest: items.length ? Math.max(...items.map((i) => i.duration)) : 0,
      thirdPartyRequests: items.filter((i) => i.thirdParty).length,
      truncated: items.length > cap,
      items: items.slice(0, cap)
    });
    const CAP = 200;
    const resources = {
      javascript: summarize(categories.javascript, CAP),
      css: summarize(categories.css, CAP),
      images: summarize(categories.images, CAP),
      fonts: summarize(categories.fonts, CAP),
      api: summarize(categories.api, CAP),
      other: summarize(categories.other, CAP)
    };
    const blocking = all.filter((r) => r.renderBlocking === true);
    const renderBlocking = {
      supported: all.some((r) => r.renderBlocking !== null),
      count: blocking.length,
      totalDuration: sum(blocking, 'duration'),
      totalTransferSize: sum(blocking, 'transferSize'),
      items: blocking
        .slice()
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 30)
        .map((r) => ({ name: r.name, initiatorType: r.initiatorType, duration: r.duration,
          transferSize: r.transferSize, thirdParty: r.thirdParty }))
    };
    const network = {
      totalRequests: all.length,
      totalTransferSize: sum(all, 'transferSize'),
      totalEncodedSize: sum(all, 'encodedBodySize'),
      totalDecodedSize: sum(all, 'decodedBodySize'),
      thirdPartyRequests: all.filter((r) => r.thirdParty).length,
      // transferSize 0 + encodedBodySize 0 = served from cache OR a cross-origin resource
      // without Timing-Allow-Origin. Sizes are under-counted by this many requests.
      zeroSizeResources: all.filter((r) => r.transferSize === 0 && r.encodedBodySize === 0).length
    };

    // ── Marks / measures / page-ready ─────────────────────────────────────
    const marks = performance.getEntriesByType('mark').map((e) => ({ name: e.name, startTime: e.startTime }));
    const measures = performance.getEntriesByType('measure')
      .map((e) => ({ name: e.name, startTime: e.startTime, duration: e.duration }));
    const readyMark = performance.getEntriesByName('page-ready').pop();
    const pageReady = readyMark
      ? { available: true, pageReady: readyMark.startTime, fromNavigationStart: readyMark.startTime - (nav ? nav.startTime : 0) }
      : { available: false };

    return {
      docId: window.__perfDocId,
      url: location.href,
      title: document.title,
      readyState: document.readyState,
      collectedAtMs: performance.now(),
      navigation,
      paint,
      webVitals: { lcp: metrics.lcp || null, cls: metrics.cls || 0 },
      pageReady,
      longTasks,
      interactions,
      network,
      resources,
      renderBlocking,
      dom: {
        nodeCount: document.querySelectorAll('*').length,
        bodyChildren: document.body ? document.body.children.length : 0,
        images: document.images.length,
        scripts: document.scripts.length,
        stylesheets: document.styleSheets.length
      },
      memory: performance.memory
        ? {
            supported: true,
            usedJSHeapSize: performance.memory.usedJSHeapSize,
            totalJSHeapSize: performance.memory.totalJSHeapSize,
            jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
          }
        : { supported: false },
      custom: { marks, measures }
    };
  };

  // Safety net: a page loaded AND left inside a single step never sees a step boundary.
  // Binding calls made while unloading are best-effort — this supplements, not replaces,
  // the per-step snapshots.
  window.addEventListener('pagehide', () => {
    try {
      if (typeof window.__perfPageHide === 'function' && document.readyState === 'complete') {
        window.__perfPageHide(JSON.stringify(window.__perfCollect()));
      }
    } catch (_) { /* never break page unload */ }
  });
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('perf evaluate timeout')), ms); })
  ]).finally(() => clearTimeout(timer));
}

function pageLabel(url, title) {
  try {
    const { pathname } = new URL(url);
    const base = pathname === '/' ? 'Home' : pathname.replace(/^\//, '');
    return title ? `${base} (${title})` : base;
  } catch (_) {
    return title || url;
  }
}

/** Budget check for ONE page entry. Timing/vitals breaches are failures; weight/count are warnings. */
function validatePerformanceBudget(entry, budget = DEFAULT_BUDGET) {
  const failures = [];
  const warnings = [];
  const over = (list, metric, actual, threshold) => {
    if (actual !== null && actual !== undefined && threshold !== undefined && actual > threshold) {
      list.push({ metric, actual, threshold });
    }
  };

  over(failures, 'Page Load Time', entry.navigation && entry.navigation.duration, budget.pageLoadTime);
  over(failures, 'TTFB', entry.navigation && entry.navigation.ttfb, budget.ttfb);
  over(failures, 'FCP', entry.paint && entry.paint.fcp, budget.fcp);
  over(failures, 'LCP', entry.webVitals && entry.webVitals.lcp, budget.lcp);
  over(failures, 'CLS', entry.webVitals && entry.webVitals.cls, budget.cls);
  over(failures, 'TBT', entry.longTasks && entry.longTasks.tbt, budget.tbt);

  over(warnings, 'Request Count', entry.network && entry.network.totalRequests, budget.maxRequests);
  over(warnings, 'Transfer Size', entry.network && entry.network.totalTransferSize, budget.maxTransferSize);
  over(warnings, 'Long Tasks', entry.longTasks && entry.longTasks.count, budget.maxLongTasks);
  over(warnings, 'DOM Nodes', entry.dom && entry.dom.nodeCount, budget.maxDOMNodes);
  over(warnings, 'JavaScript Transfer Size',
    entry.resources && entry.resources.javascript && entry.resources.javascript.transferSize, budget.maxJavaScriptSize);
  over(warnings, 'Image Transfer Size',
    entry.resources && entry.resources.images && entry.resources.images.transferSize, budget.maxImageSize);

  return { passed: failures.length === 0, failures, warnings };
}

class PerformanceMonitor {
  constructor(page, options = {}) {
    this.page = page;
    this.budget = { ...DEFAULT_BUDGET, ...(options.budget || {}) };
    this.pages = new Map();     // docId -> entry (Map keeps first-seen order)
    this.routes = [];           // SPA route timings
    this.interactionTimings = [];
    // Unused JS/CSS is measured AFTER the scenario, on a fresh load in a separate
    // browser context (see collectLoadCoverage) — never during it, because Chromium's
    // precise-coverage instrumentation makes JavaScript ~2x slower and would inflate the
    // TBT/LCP/long-task numbers this same report leads with. Chromium-only.
    this.coverageEnabled = options.coverage !== false;
    this.coverageNote = null;
  }

  /**
   * Call once, right after `context.newPage()` and BEFORE any navigation —
   * LCP/CLS/long-task observers must exist before the page does its work.
   */
  static async attach(page, options = {}) {
    const monitor = new PerformanceMonitor(page, options);
    // Binding must be registered before the init script that calls it.
    await page.exposeBinding('__perfPageHide', (_source, payload) => {
      try { monitor._ingest(JSON.parse(payload)); } catch (_) { /* best effort */ }
    });
    await page.addInitScript(browserInit);
    return monitor;
  }

  /**
   * Unused JS/CSS per visited page, measured on a FRESH LOAD of each URL after the scenario
   * has finished — so the scenario's own metrics are never perturbed by coverage
   * instrumentation, and no special run command is needed.
   *
   * Why a separate browser context rather than a new tab in the scenario's context:
   * the scenario context records the HAR, so re-loading pages there would add duplicate
   * requests to a file the performance design tool reads. A new context seeded with the
   * scenario's storageState (cookies + localStorage) keeps a cookie/localStorage login
   * working, records nothing, and starts with a cold cache — which is also the closest
   * match to Lighthouse's definition of "unused" (what a load never executed).
   *
   * Known limits, stated in the output rather than hidden: sessionStorage-only sessions
   * are not carried over (an unauthenticated load may redirect — recorded as
   * `redirected`), and a page that only exists as a result of a POST/UI state cannot be
   * reproduced by re-navigating to its URL. GET-ing a URL the scenario already visited is
   * normally side-effect free, but URLs that look like actions (logout/delete/...) are
   * skipped so this can never invoke one. Never throws.
   */
  async collectLoadCoverage({ timeoutMs = 20000, settleMs = 500 } = {}) {
    if (!this.coverageEnabled || this.pages.size === 0) return;
    let context = null;
    try {
      const browser = this.page.context().browser();
      if (!browser) { this.coverageNote = 'coverage unavailable: no browser handle'; return; }
      const storageState = await this.page.context().storageState();
      context = await browser.newContext({ storageState });

      const entriesByUrl = new Map();
      for (const entry of this.pages.values()) {
        if (!entriesByUrl.has(entry.url)) entriesByUrl.set(entry.url, []);
        entriesByUrl.get(entry.url).push(entry);
      }

      for (const [url, entries] of entriesByUrl) {
        const result = await this._coverageForUrl(context, url, timeoutMs, settleMs);
        for (const entry of entries) entry.coverage = result;
      }
    } catch (err) {
      this.coverageNote = `coverage unavailable: ${err.message}`;
    } finally {
      if (context) await context.close().catch(() => {});
    }
  }

  async _coverageForUrl(context, url, timeoutMs, settleMs) {
    if (!/^https?:/i.test(url)) return { available: false, reason: 'not an http(s) page' };
    if (ACTION_URL_PATTERN.test(url)) return { available: false, reason: 'skipped: URL looks like an action (logout/delete/...)' };

    let page = null;
    try {
      page = await context.newPage();
      await page.coverage.startJSCoverage();
      await page.coverage.startCSSCoverage();
      await page.goto(url, { waitUntil: 'load', timeout: timeoutMs });
      if (settleMs > 0) await page.waitForTimeout(settleMs);
      const [js, css] = await Promise.all([page.coverage.stopJSCoverage(), page.coverage.stopCSSCoverage()]);

      const jsFiles = js
        .filter((s) => s.url && /^https?:/.test(s.url) && typeof s.source === 'string')
        .map((s) => ({ url: s.url, ...unusedInScript(s.source, s.functions) }));
      const cssFiles = css
        .filter((s) => s.url && /^https?:/.test(s.url) && typeof s.text === 'string')
        .map((s) => ({ url: s.url, ...unusedInStylesheet(s.text, s.ranges) }));

      const loadedUrl = page.url();
      let redirected = false;
      try { redirected = new URL(loadedUrl).pathname !== new URL(url).pathname; } catch (_) { /* keep false */ }
      return {
        available: true,
        basis: 'fresh page load after the scenario, cold cache, separate browser context (load-time, not scenario-dependent)',
        unit: 'utf16-code-units',
        loadedUrl,
        redirected,
        javascript: summarizeCoverage(jsFiles),
        css: summarizeCoverage(cssFiles)
      };
    } catch (err) {
      return { available: false, reason: err.message };
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  _ingest(raw) {
    if (!raw || !raw.docId) return null;
    const previous = this.pages.get(raw.docId);
    const entry = {
      order: previous ? previous.order : this.pages.size + 1,
      firstSeenAt: previous ? previous.firstSeenAt : new Date().toISOString(),
      name: pageLabel(raw.url, raw.title),
      ...raw,
      loadComplete: raw.readyState === 'complete'
    };
    // Keep the richer snapshot: never let an earlier/emptier one overwrite a later one.
    if (previous && previous.collectedAtMs > raw.collectedAtMs) return previous;
    this.pages.set(raw.docId, entry);
    return entry;
  }

  /**
   * Snapshot the current document. Never throws. Returns null when there is nothing
   * useful to record (blank page, mid-navigation, not loaded yet).
   */
  async snapshot({ allowIncomplete = false } = {}) {
    try {
      const page = this.page;
      if (!page || page.isClosed()) return null;
      const url = page.url();
      if (!url || url === 'about:blank') return null;
      const raw = await withTimeout(
        page.evaluate(() => (window.__perfCollect ? window.__perfCollect() : null)),
        EVALUATE_TIMEOUT_MS
      );
      if (!raw) return null;
      if (raw.readyState !== 'complete' && !allowIncomplete) return null;
      return this._ingest(raw);
    } catch (_) {
      return null; // context destroyed by a navigation, page crashed, etc.
    }
  }

  /** Last snapshot of the scenario: give LCP/CLS/long-task observers a moment to settle first. */
  async finalSnapshot({ settleMs = 1000 } = {}) {
    try {
      if (!this.page || this.page.isClosed()) return null;
      if (settleMs > 0) await this.page.waitForTimeout(settleMs);
    } catch (_) { return null; }
    return this.snapshot({ allowIncomplete: true });
  }

  /** Time a user action (e.g. click -> dialog visible). Result is also stored in the report. */
  async measureInteraction(name, action) {
    const start = await this.page.evaluate(() => performance.now());
    await action();
    const end = await this.page.evaluate(() => performance.now());
    const result = { name, duration: end - start, url: this.page.url(), timestamp: new Date().toISOString() };
    this.interactionTimings.push(result);
    return result;
  }

  /**
   * Time an SPA route transition. `performance.getEntriesByType('navigation')` does NOT
   * see client-side route changes, so this brackets the action with marks instead.
   */
  async measureRoute(routeName, action, readySelector = null) {
    await this.page.evaluate(() => {
      performance.clearMarks('route-start');
      performance.clearMarks('route-ready');
      performance.clearMeasures('route-duration');
      performance.mark('route-start');
    });
    await action();
    if (readySelector) await this.page.locator(readySelector).waitFor({ state: 'visible' });
    const duration = await this.page.evaluate(() => {
      performance.mark('route-ready');
      performance.measure('route-duration', 'route-start', 'route-ready');
      const entry = performance.getEntriesByName('route-duration')[0];
      return entry ? entry.duration : null;
    });
    const result = { route: routeName, duration, url: this.page.url(), timestamp: new Date().toISOString() };
    this.routes.push(result);
    return result;
  }

  /** Assemble the sidecar document. Budget results are computed here, once per page. */
  buildReport({ scenarioName, scenarioSlug, browserInfo = null, tags = [] }) {
    const pages = Array.from(this.pages.values())
      .sort((a, b) => a.order - b.order)
      .map((entry) => ({ ...entry, budget: validatePerformanceBudget(entry, this.budget) }));

    const failures = pages.flatMap((p) => p.budget.failures.map((f) => ({ page: p.name, ...f })));
    const warnings = pages.flatMap((p) => p.budget.warnings.map((w) => ({ page: p.name, ...w })));

    return {
      schemaVersion: SCHEMA_VERSION,
      generator: 'demoblaze-framework/PerformanceUtility',
      generatedAt: new Date().toISOString(),
      scenario: scenarioName,
      scenarioSlug,
      // Test cases this run belongs to — how the server links the report to a test
      // case. Empty when the scenario carries no TC tag (never guessed).
      tcIds: extractTcIds(tags, scenarioName),
      tags,
      browser: browserInfo,
      coverage: { enabled: this.coverageEnabled, note: this.coverageNote },
      budget: this.budget,
      summary: {
        pageCount: pages.length,
        budgetPassed: failures.length === 0,
        failureCount: failures.length,
        warningCount: warnings.length,
        failures,
        warnings
      },
      pages,
      routes: this.routes,
      interactions: this.interactionTimings
    };
  }

  /** Browser info for the report header (best effort, never throws). */
  async browserInfo() {
    try {
      if (this.page.isClosed()) return null;
      return await withTimeout(this.page.evaluate(() => ({
        userAgent: navigator.userAgent,
        viewport: { width: window.innerWidth, height: window.innerHeight }
      })), EVALUATE_TIMEOUT_MS);
    } catch (_) {
      return null;
    }
  }

  /**
   * Write reports/perf/<slug>_perf.json. Returns { path, report } or null when the
   * scenario visited no measurable page (no file — a missing file means "nothing
   * measured", mirroring the axe / page-errors sidecars).
   */
  async writeReport({ scenarioName, scenarioSlug, tags = [], outputDir = path.join(process.cwd(), 'reports', 'perf') }) {
    if (this.pages.size === 0) return null;
    const report = this.buildReport({ scenarioName, scenarioSlug, tags, browserInfo: await this.browserInfo() });
    fs.mkdirSync(outputDir, { recursive: true });
    const outPath = path.join(outputDir, `${scenarioSlug}_perf.json`);
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    return { path: outPath, report };
  }
}

module.exports = { PerformanceMonitor, validatePerformanceBudget, extractTcIds, DEFAULT_BUDGET, SCHEMA_VERSION };
