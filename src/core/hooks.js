const { Before, After, AfterStep, BeforeStep, setDefaultTimeout } = require('@cucumber/cucumber');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const axeSource = require('axe-core').source;
const TestDataLoader = require('../utils/TestDataLoader');
const ScenarioContext = require('../utils/ScenarioContext');
const config = require('../utils/ConfigManager');
const screenshotManager = require('../utils/ScreenshotManager');
const { PerformanceMonitor } = require('../utils/PerformanceUtility');

// Frontend performance capture (FCP/LCP/CLS/long tasks/resources per visited page).
// On by default; PERF_METRICS=false or config performance.enabled=false turns it off.
// A budget breach only FAILS a scenario when PERF_ENFORCE_BUDGET=true (or config
// performance.enforceBudget) — otherwise it is recorded in the sidecar only.
const perfConfig = config.get('performance', {}) || {};
const PERF_ENABLED = process.env.PERF_METRICS
  ? process.env.PERF_METRICS.toLowerCase() !== 'false'
  : perfConfig.enabled !== false;
const PERF_ENFORCE_BUDGET = process.env.PERF_ENFORCE_BUDGET
  ? process.env.PERF_ENFORCE_BUDGET.toLowerCase() === 'true'
  : perfConfig.enforceBudget === true;
// Unused JS/CSS. On by default and automatic — it runs AFTER the scenario, on a fresh load
// of each visited page in a separate browser context, so it never slows or distorts the
// scenario's own TBT/LCP numbers. PERF_COVERAGE=false (or performance.coverage=false)
// turns it off; it costs roughly one extra page load per distinct page visited.
const PERF_COVERAGE = process.env.PERF_COVERAGE
  ? process.env.PERF_COVERAGE.toLowerCase() !== 'false'
  : perfConfig.coverage !== false;

setDefaultTimeout(config.getStepTimeout());
console.log(`[Config] Environment: ${config.getEnv()} | baseURL: ${config.getBaseURL()}`);

// ── Page-error capture (docs/plans/page-error-capture-plan.md, Phase 1) ────
// Playwright already observes JS runtime errors, console errors, and failed/
// 4xx-5xx requests natively via page.on(...) — this just captures and dedupes
// them per scenario, the same way HAR/axe already write their own sidecar
// files above. Capped and deduped here (not after the fact) so a runaway
// console-logging loop can't produce an unbounded file.
const MAX_PAGE_ERRORS = 50;

function makeErrorKey(entry) {
  if (entry.type === 'api_error' || entry.type === 'request_failed') {
    return `${entry.type}:${entry.url}:${entry.status || ''}`;
  }
  return `${entry.type}:${entry.message}:${entry.stack || ''}`;
}

function recordPageError(worldThis, entry) {
  if (!worldThis._pageErrors || worldThis._pageErrors.length >= MAX_PAGE_ERRORS) return;
  const key = makeErrorKey(entry);
  const existing = worldThis._pageErrorIndex.get(key);
  if (existing) {
    existing.occurrence_count += 1;
    return;
  }
  entry.occurrence_count = 1;
  worldThis._pageErrors.push(entry);
  worldThis._pageErrorIndex.set(key, entry);
}

/**
 * Before Hook - Initialize ScenarioContext for each scenario
 */
Before(async function (scenario) {
  this.scenarioContext = new ScenarioContext();
  this.scenarioContext.setScenario(scenario);

  // Fixed --window-size (instead of --start-maximized) keeps the launched window's
  // size deterministic across machines/CI runners. viewport stays null so Playwright
  // never resizes the window a second time after launch — that second resize was
  // the source of the flicker; a fixed launch size avoids it while still being stable.
  const { width: windowWidth, height: windowHeight } = config.getViewport();

  const browser = await chromium.launch({
    headless: config.isHeadless(),
    slowMo: config.get('slowMo', 0),
    args: [`--window-size=${windowWidth},${windowHeight}`, '--window-position=0,0']
  });

  const scenarioSlug = scenario.pickle.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const harDir = path.join(process.cwd(), 'reports', 'har');
  fs.mkdirSync(harDir, { recursive: true });
  const harPath = path.join(harDir, `${scenarioSlug}.har`);

  const context = await browser.newContext({
    baseURL: config.getBaseURL(),
    viewport: null,
    recordHar: { path: harPath, mode: 'full' }
  });

  const page = await context.newPage();

  // Must run before ANY navigation: LCP/CLS/long-task observers have to exist
  // before the page does its work. Failure here must never fail the scenario.
  this._perf = null;
  if (PERF_ENABLED) {
    try {
      this._perf = await PerformanceMonitor.attach(page, { budget: perfConfig.budget, coverage: PERF_COVERAGE });
    } catch (err) {
      console.warn(`⏱️  performance monitoring disabled for this scenario: ${err.message}`);
    }
  }

  this._axeResults   = [];
  this._scenarioSlug = scenarioSlug;
  this._wcagStandard = config.get('wcagStandard', 'wcag21aa');

  // Page-error capture state for this scenario.
  this._pageErrors      = [];
  this._pageErrorIndex  = new Map();
  this._currentStep     = null;

  let appOrigin = null;
  try {
    appOrigin = new URL(config.getBaseURL()).origin;
  } catch (_) {
    // Unparseable base URL — the api_error listener below skips the origin
    // check entirely rather than guessing.
  }

  page.on('pageerror', (err) => {
    recordPageError(this, {
      type: 'pageerror',
      step: this._currentStep,
      timestamp: new Date().toISOString(),
      message: err.message,
      stack: err.stack || ''
    });
  });

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    recordPageError(this, {
      type: 'console_error',
      step: this._currentStep,
      timestamp: new Date().toISOString(),
      message: msg.text()
    });
  });

  page.on('requestfailed', (req) => {
    if (appOrigin) {
      try {
        if (new URL(req.url()).origin !== appOrigin) return;
      } catch (_) {
        return;
      }
    }
    const failure = req.failure();
    recordPageError(this, {
      type: 'request_failed',
      step: this._currentStep,
      timestamp: new Date().toISOString(),
      message: failure ? failure.errorText : 'request failed',
      url: req.url(),
      method: req.method()
    });
  });

  page.on('response', (res) => {
    if (res.status() < 400) return;
    if (!appOrigin) return;
    try {
      if (new URL(res.url()).origin !== appOrigin) return;
    } catch (_) {
      return;
    }
    recordPageError(this, {
      type: 'api_error',
      step: this._currentStep,
      timestamp: new Date().toISOString(),
      message: `${res.status()} ${res.statusText()}`,
      url: res.url(),
      method: res.request().method(),
      status: res.status()
    });
  });

  page.on('crash', () => {
    recordPageError(this, {
      type: 'crash',
      step: this._currentStep,
      timestamp: new Date().toISOString(),
      message: 'Page crashed'
    });
  });

  this.scenarioContext.setBrowser(browser, context, page);

  screenshotManager.resetCounters(scenario.pickle.name);

  // Derive feature name from the feature file (e.g. AddEmployee.feature → AddEmployee)
  const scenarioName = scenario.pickle.name;
  const featureName  = path.basename(scenario.gherkinDocument.uri, '.feature');
  const currentScenarioData = TestDataLoader.getTestData(featureName, scenarioName);
  this.scenarioContext.setTestData(currentScenarioData);

  console.log(`\n🚀 Starting scenario: ${scenarioName}`);
  console.log(`📊 Test data loaded for: ${scenarioName} (feature: ${featureName})`);
});

/**
 * BeforeStep Hook - Track current step name for page-error attribution
 */
BeforeStep(async function (step) {
  this._currentStep = step.pickleStep.text;
});

/**
 * AfterStep Hook - Screenshot after every step
 */
AfterStep(async function (step) {
  const page = this.scenarioContext.getPage();
  if (!page) return;

  // A full-page navigation destroys the old document and its metrics, so every page
  // the scenario visits is snapshotted at a step boundary while it is still alive.
  // Same page again → the newer snapshot replaces the older (LCP/CLS keep improving).
  if (this._perf) await this._perf.snapshot();

  const scenarioName = this.scenarioContext.getScenarioName();
  const stepName     = step.pickleStep.text;
  const lastSelector = this.scenarioContext.getLastElement();

  const filePath = await screenshotManager.captureStepScreenshot(
    page, stepName, scenarioName, lastSelector
  );

  if (filePath && fs.existsSync(filePath)) {
    const base64 = fs.readFileSync(filePath).toString('base64');
    await this.attach(base64, 'base64:image/png');
  }
});

/**
 * After Hook - axe scan + cleanup
 */
After(async function (scenario) {
  const scenarioStatus = scenario.result.status.toUpperCase();
  console.log(`\n✨ Scenario completed: ${scenario.pickle.name} - Status: ${scenarioStatus}`);

  // Failure screenshot
  if (scenario.result.status === 'FAILED') {
    const page = this.scenarioContext.getPage();
    if (page) {
      const filePath = await screenshotManager.captureStepScreenshot(
        page, 'FAILED_scenario', this.scenarioContext.getScenarioName(), null
      );
      if (filePath && fs.existsSync(filePath)) {
        const base64 = fs.readFileSync(filePath).toString('base64');
        await this.attach(base64, 'base64:image/png');
      }
      console.log(`📸 Failure screenshot captured`);
    }
  }

  // Final performance snapshot — BEFORE the axe scan, which injects a script and
  // could itself perturb DOM size / layout. Waits briefly so LCP/CLS settle.
  if (this._perf) {
    await this._perf.finalSnapshot();
    // Unused JS/CSS on a fresh load in a separate context — after the scenario's own
    // metrics are final, so it cannot affect them. Never throws.
    await this._perf.collectLoadCoverage();
  }

  // axe-core scan — runs once per scenario on the final page state
  const page = this.scenarioContext.getPage();
  const url  = page ? page.url() : null;
  if (page && url && url !== 'about:blank') {
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
      await page.evaluate(axeSource);
      const allStandards = ['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'section508', 'best-practice'];
      const results = await page.evaluate((stds) => {
        return window.axe.run({ runOnly: { type: 'tag', values: stds } });
      }, allStandards);
      this._axeResults.push({
        url,
        standard: this._wcagStandard,
        violations: results.violations,
        passes: results.passes,
        incomplete: results.incomplete,
        inapplicable: results.inapplicable,
        testEngine: results.testEngine,
        testEnvironment: results.testEnvironment
      });
      console.log(`♿ axe-core: ${results.violations.length} violation(s) on ${url}`);
    } catch (err) {
      console.warn(`♿ axe-core scan skipped for ${url}: ${err.message}`);
    }
  }

  // Write axe sidecar before cleanup (cleanup closes the context).
  // Each entry is tagged with its scenario name so that when ReportGenerator's
  // combineAxeResults() later merges every scenario's sidecar into one
  // reports/axe.json, the report can still tell which scenario each
  // violation came from.
  if (this._axeResults && this._axeResults.length > 0) {
    const axeDir = path.join(process.cwd(), 'reports', 'axe');
    fs.mkdirSync(axeDir, { recursive: true });
    const axePath = path.join(axeDir, `${this._scenarioSlug}_axe.json`);
    const taggedResults = this._axeResults.map(r => ({ scenario: scenario.pickle.name, ...r }));
    fs.writeFileSync(axePath, JSON.stringify(taggedResults, null, 2));
    const totalViolations = taggedResults.reduce((n, r) => n + r.violations.length, 0);
    console.log(`♿ axe results: ${axePath} (${totalViolations} violation(s) across ${taggedResults.length} page(s))`);
  }

  // Write page-errors sidecar before cleanup (cleanup closes the page/context).
  // Only written when there's something to report — a missing file means a
  // clean scenario, not an error (mirrors the axe sidecar's own guard above).
  if (this._pageErrors && this._pageErrors.length > 0) {
    const pageErrorsDir = path.join(process.cwd(), 'reports', 'page-errors');
    fs.mkdirSync(pageErrorsDir, { recursive: true });
    const pageErrorsPath = path.join(pageErrorsDir, `${this._scenarioSlug}.json`);
    fs.writeFileSync(pageErrorsPath, JSON.stringify(this._pageErrors, null, 2));
    console.log(`⚠️  page errors: ${pageErrorsPath} (${this._pageErrors.length} event(s))`);
  }

  // Write performance sidecar before cleanup (cleanup closes the page/context).
  // One entry per page the scenario visited; no file = nothing measurable was visited.
  let perfBudgetFailure = null;
  if (this._perf) {
    try {
      const written = await this._perf.writeReport({
        scenarioName: scenario.pickle.name,
        scenarioSlug: this._scenarioSlug,
        // pickle.tags already includes feature-level tags — that is where @AIPL-TC-xxx usually lives.
        tags: (scenario.pickle.tags || []).map((t) => t.name)
      });
      if (written) {
        const { summary } = written.report;
        console.log(`⏱️  performance: ${written.path} (${summary.pageCount} page(s), ${summary.failureCount} budget failure(s), ${summary.warningCount} warning(s))`);
        if (PERF_ENFORCE_BUDGET && summary.failureCount > 0) {
          perfBudgetFailure = `Performance budget failed: ${JSON.stringify(summary.failures)}`;
        }
      }
    } catch (err) {
      console.warn(`⏱️  performance report skipped: ${err.message}`);
    }
  }

  await this.scenarioContext.cleanup();
  console.log(`🧹 Cleanup completed\n`);

  // Raised only AFTER cleanup so a budget breach never leaks a browser.
  if (perfBudgetFailure) throw new Error(perfBudgetFailure);
});
