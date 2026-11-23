const fs = require('fs');
const path = require('path');
const locatorReader = require('./LocatorReader');
const highlighter = require('./ElementHighlighter');
const config = require('./ConfigManager');

// Auto-discover all page classes from pages/ folder (excluding BasePage)
const pagesDir = path.resolve(__dirname, '../pages');
const pageClassRegistry = {};
fs.readdirSync(pagesDir)
  .filter(f => f.endsWith('.js') && f !== 'BasePage.js')
  .forEach(f => {
    const className = f.replace('.js', '');                    // e.g. 'HomePage'
    const camelName = className[0].toLowerCase() + className.slice(1); // e.g. 'homePage'
    pageClassRegistry[camelName] = require(path.join(pagesDir, f));
  });

/**
 * ScenarioContext - Central context manager for test execution
 * Manages browser instances, page objects, test data, and scenario-scoped context data.
 */
class ScenarioContext {
  constructor() {
    // Internal Map for browser/page session objects
    this.context = new Map();
    // Flat object for scenario-scoped custom key-value data
    this.contextData = {};

  }

  // ==================== LOW-LEVEL MAP ACCESSORS ====================

  set(key, value) {
    this.context.set(key, value);
  }

  get(key) {
    return this.context.get(key);
  }

  has(key) {
    return this.context.has(key);
  }

  delete(key) {
    this.context.delete(key);
  }

  clear() {
    this.context.clear();
  }

  // ==================== BROWSER / PAGE METHODS ====================

  /**
   * Store browser, browser context, and page instances.
   * @param {Object} browser - Playwright Browser
   * @param {Object} context - Playwright BrowserContext
   * @param {Object} page    - Playwright Page
   */
  setBrowser(browser, context, page) {
    this.set('browser', browser);
    this.set('context', context);
    this.set('page', page);
  }

  getBrowser() { return this.get('browser'); }
  getContext()  { return this.get('context'); }
  getPage()     { return this.get('page'); }

  // ==================== PAGE OBJECT METHODS ====================

  /**
   * Retrieve a page object by name. Created lazily on first access.
   * Auto-discovers page classes from the pages/ folder — no registration needed.
   * Just add a new file (e.g. DashboardPage.js) and call getPageObject('dashboardPage').
   * @param {string} pageName - camelCase name, e.g. 'homePage', 'loginPage'
   * @returns {Object}
   */
  getPageObject(pageName) {
    // Return cached instance if already created
    const pageObjects = this.get('pageObjects') || {};
    if (pageObjects[pageName]) {
      return pageObjects[pageName];
    }

    // Lazy-create from auto-discovered class
    const PageClass = pageClassRegistry[pageName];
    if (!PageClass) {
      throw new Error(`No page class found for '${pageName}'. Add ${pageName.charAt(0).toUpperCase() + pageName.slice(1)}.js to src/pages/`);
    }

    const instance = new PageClass(this.getPage());
    pageObjects[pageName] = instance;
    this.set('pageObjects', pageObjects);
    return instance;
  }

  /**
   * Store a map of page objects (e.g. { homePage, loginPage }).
   * @param {Object} pageObjects
   */
  setPageObjects(pageObjects) {
    this.set('pageObjects', pageObjects);
  }

  // ==================== SCENARIO METHODS ====================

  /**
   * Store Cucumber scenario info.
   * Stores both the raw name (for test-data lookup) and the underscored name (legacy).
   * @param {Object} scenario - Cucumber scenario object
   */
  setScenario(scenario) {
    this.set('scenario', scenario);
    this.set('scenarioRawName', scenario.pickle.name);
    this.set('scenarioName', scenario.pickle.name.replace(/ /g, '_'));
  }

  /**
   * Get scenario name with spaces replaced by underscores (legacy format).
   * @returns {string}
   */
  getScenarioName() {
    return this.get('scenarioName');
  }

  /**
   * Get the current scenario name exactly as written in the feature file.
   * @returns {string}
   */
  getCurrentScenarioName() {
    return this.get('scenarioRawName');
  }

  // ==================== TEST DATA METHODS ====================

  /**
   * Set the test data object for the current scenario.
   * Called by hooks.js after loading data via TestDataLoader.
   * @param {Object} testData
   */
  setTestData(testData) {
    this.set('testData', testData);
  }

  /**
   * Return the full test data object for the current scenario.
   * @returns {Object}
   */
  getTestData() {
    return this.get('testData') || {};
  }

  /**
   * Get a single test data field value by key.
   * Alias kept for backward compatibility with existing step definitions.
   * @param {string} key
   * @returns {*}
   */
  getTestDataValue(key) {
    const testData = this.getTestData();
    return testData ? testData[key] : null;
  }

  /**
   * Unified accessor for any test data field (mirrors attached ScenarioContext design).
   * Falls back gracefully with a clear error when the field is missing.
   * @param {string} fieldName - e.g. 'username', 'password', 'welcomeUser'
   * @returns {*}
   */
  getData(fieldName) {
    const testData = this.getTestData();
    if (testData && fieldName in testData) {
      return testData[fieldName];
    }
    const scenarioName = this.getCurrentScenarioName() || this.getScenarioName();
    throw new Error(
      `Field '${fieldName}' not found in test data for scenario: ${scenarioName}`
    );
  }

  /**
   * Check whether a field exists in the current scenario's test data.
   * @param {string} fieldName
   * @returns {boolean}
   */
  hasData(fieldName) {
    const testData = this.getTestData();
    return testData != null && fieldName in testData;
  }

  /**
   * Return all test data fields for the current scenario.
   * @returns {Object}
   */
  getAllTestData() {
    const testData = this.getTestData();
    if (!testData || Object.keys(testData).length === 0) {
      const scenarioName = this.getCurrentScenarioName() || this.getScenarioName();
      throw new Error(`No test data available for scenario: ${scenarioName}`);
    }
    return testData;
  }

  // ==================== LOCATOR METHODS ====================

  /**
   * Get all locators for a page directly from the JSON file via LocatorReader.
   * Mirrors the same naming convention: pageName must match the JSON file name exactly.
   *
   * @param {string} pageName - e.g. 'LoginPage', 'HomePage'
   * @returns {Object} - Full locator map
   *
   * @example
   *   const locators = this.scenarioContext.getLocators('LoginPage');
   *   await page.click(locators.loginButton);
   */
  getLocators(pageName) {
    return locatorReader.getLocators(pageName);
  }

  /**
   * Get a single locator selector.
   *
   * Two call signatures:
   *   getLocator(key)              – 1 arg: searches across all registered page-object
   *                                  locators (backward-compatible legacy behaviour).
   *   getLocator(pageName, key)    – 2 args: direct LocatorReader lookup by page name
   *                                  and key (preferred, explicit).
   *
   * @param {string} pageNameOrKey - Page name (2-arg form) OR locator key (1-arg form)
   * @param {string} [key]         - Locator key (2-arg form only)
   * @returns {string|null}
   *
   * @example
   *   // Preferred — explicit page + key
   *   const sel = this.scenarioContext.getLocator('LoginPage', 'usernameField');
   *
   *   // Legacy — cross-page search (still works)
   *   const sel = this.scenarioContext.getLocator('usernameField');
   */
  getLocator(pageNameOrKey, key) {
    // ── 2-arg form: getLocator(pageName, key) ──────────────────────────────
    if (key !== undefined) {
      return locatorReader.getLocator(pageNameOrKey, key);
    }

    // ── 1-arg form: getLocator(key) — search across all locator JSON files ──
    for (const [camelName, PageClass] of Object.entries(pageClassRegistry)) {
      const pageName = camelName.charAt(0).toUpperCase() + camelName.slice(1); // e.g. 'HomePage'
      try {
        const locators = locatorReader.getLocators(pageName);
        if (locators && locators[pageNameOrKey]) {
          return locators[pageNameOrKey];
        }
      } catch (_) {
        // No locator file for this page — skip
      }
    }
    return null;
  }

  // ==================== CONTEXT DATA METHODS ====================
  // Scenario-scoped key-value store for runtime values (e.g. captured text, flags).

  /**
   * Store a runtime value in the scenario context.
   * @param {string} key
   * @param {*} value
   */
  setContextData(key, value) {
    this.contextData[key] = value;
  }

  /**
   * Retrieve a runtime value from the scenario context.
   * @param {string} key
   * @returns {*}
   */
  getContextData(key) {
    if (!(key in this.contextData)) {
      throw new Error(`Context data key '${key}' not found`);
    }
    return this.contextData[key];
  }

  /**
   * Check if a key exists in the context data store.
   * @param {string} key
   * @returns {boolean}
   */
  hasContextData(key) {
    return key in this.contextData;
  }

  /**
   * Remove a single key from the context data store.
   * @param {string} key
   */
  removeContextData(key) {
    delete this.contextData[key];
  }

  /**
   * Clear all context data (does not affect browser/page state).
   */
  clearContextData() {
    this.contextData = {};
  }

  /**
   * Return a shallow copy of all context data.
   * @returns {Object}
   */
  getAllContextData() {
    return { ...this.contextData };
  }

  // ==================== LAST INTERACTED ELEMENT ====================

  /**
   * Store the CSS selector of the most recently interacted element.
   * Called by step definitions after every click / fill action.
   * Used by the AfterStep hook to highlight the element in step screenshots.
   * @param {string|null} selector
   */
  setLastElement(selector) {
    this.contextData['__lastElement__'] = selector || null;
  }

  /**
   * Return the selector stored by setLastElement(), or null if none.
   * @returns {string|null}
   */
  getLastElement() {
    return this.contextData['__lastElement__'] || null;
  }

  // ==================== CUSTOM DATA (LEGACY ALIAS) ====================
  // Kept for backward compatibility. Prefer setContextData / getContextData.

  setCustomData(key, value) {
    this.setContextData(key, value);
  }

  getCustomData(key) {
    return this.hasContextData(key) ? this.getContextData(key) : null;
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Return a summary of the current context state (useful for debugging).
   * @returns {Object}
   */
  getSummary() {
    const testData = this.getTestData();
    return {
      scenarioName: this.getCurrentScenarioName(),
      hasTestData: testData != null && Object.keys(testData).length > 0,
      testDataKeys: testData ? Object.keys(testData) : [],
      contextDataKeys: Object.keys(this.contextData)
    };
  }

  /**
   * Reset scenario-level state (test data + context data) without closing the browser.
   * Useful when re-using a context across scenarios.
   */
  reset() {
    this.delete('testData');
    this.delete('scenarioRawName');
    this.delete('scenarioName');
    this.delete('scenario');
    this.contextData = {};
  }

  /**
   * Close all browser resources and clear the entire context.
   */
  async cleanup() {
    const page    = this.getPage();
    const context = this.getContext();
    const browser = this.getBrowser();

    // Let in-flight network settle before closing the context — closing right
    // after the last action can cut recordHar off mid-flight and drop trailing
    // requests (lazy images, XHR, analytics beacons). Frontend Performance
    // Testing consumes this HAR, so it needs the full, stable page-load trace.
    if (page) {
      const { networkIdleTimeout } = config.getScreenshotStability();
      await page.waitForLoadState('networkidle', { timeout: networkIdleTimeout }).catch(() => {});
    }

    if (page)    await page.close().catch(err => console.error('Error closing page:', err));
    if (context) await context.close().catch(err => console.error('Error closing context:', err));
    if (browser) await browser.close().catch(err => console.error('Error closing browser:', err));

    this.clear();
    this.contextData = {};
  }

  /**
   * Capture a full-page screenshot, optionally highlighting element(s) first.
   * The highlight is removed from the DOM immediately after capture.
   *
   * @param {string} filename             - File name saved under reports/
   * @param {string|string[]} [selectors] - CSS selector(s) to highlight before capture.
   */
  async takeScreenshot(filename = 'screenshot.png', selectors) {
    const page = this.getPage();
    if (!page) return;

    const screenshotPath = `reports/${filename}`;

    if (selectors) {
      await highlighter.highlightAndScreenshot(page, selectors, screenshotPath);
    } else {
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`Screenshot saved: ${screenshotPath}`);
    }
  }
}

module.exports = ScenarioContext;
