const path = require('path');
const fs = require('fs');
const config = require('./ConfigManager');
const highlighter = require('./ElementHighlighter');

/**
 * ScreenshotManager - Captures step-level screenshots with optional element highlighting.
 *
 * Used by the AfterStep Cucumber hook to produce a per-step visual trail that is
 * embedded directly into the Cucumber HTML report via `this.attach()`.
 *
 * Folder layout:
 *   reports/screenshots/<sanitised-scenario-name>/<step-index>_<sanitised-step-name>.png
 */
class ScreenshotManager {
  constructor() {
    // Tracks step index per scenario so files sort correctly in the file system.
    this._stepCounters = new Map();
  }

  /**
   * Sanitise a string so it can be used safely as a file/folder name.
   * Strips characters that are invalid on Windows/Linux/macOS.
   * @param {string} text
   * @returns {string}
   */
  _sanitise(text) {
    return (text || 'unknown')
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .substring(0, 80)
      .replace(/[._]+$/, '');
  }

  /**
   * Build the output directory for a scenario, creating it if needed.
   * @param {string} scenarioName
   * @returns {string} Absolute directory path
   */
  _ensureDir(scenarioName) {
    const dir = path.join(
      process.cwd(),
      'reports', 'screenshots',
      this._sanitise(scenarioName)
    );
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  /**
   * Wait for the page to reach a stable state before capturing a screenshot.
   * Three signals are checked in order; each failure is swallowed so a flaky
   * network or animation never blocks the overall test run.
   *
   * 1. domcontentloaded  — HTML parsed, synchronous scripts done
   * 2. networkidle       — no in-flight XHR/fetch for 500 ms (short timeout)
   * 3. animations        — no CSS animations/transitions currently running
   *
   * @param {import('playwright').Page} page
   */
  async _waitForStablePage(page) {
    const { domContentLoadedTimeout, networkIdleTimeout, animationsTimeout } =
      config.getScreenshotStability();

    try {
      await page.waitForLoadState('domcontentloaded', { timeout: domContentLoadedTimeout });
    } catch (_) {}

    try {
      await page.waitForLoadState('networkidle', { timeout: networkIdleTimeout });
    } catch (_) {}

    try {
      await page.waitForFunction(
        () => document.getAnimations().every(a => a.playState !== 'running'),
        { timeout: animationsTimeout }
      );
    } catch (_) {}
  }

  /**
   * Capture a screenshot after a Cucumber step.
   *
   * @param {import('playwright').Page} page            - Active Playwright page
   * @param {string}                   stepName         - Cucumber step text
   * @param {string}                   scenarioName     - Scenario name (used for folder)
   * @param {string|null}              [lastSelector]   - CSS selector of last interacted element;
   *                                                      highlighted in gold before capture
   * @returns {Promise<string|null>} Absolute path to the saved PNG, or null on error
   */
  async captureStepScreenshot(page, stepName, scenarioName, lastSelector = null) {
    try {
      if (!page) return null;

      await this._waitForStablePage(page);

      // Maintain a per-scenario step counter for ordered filenames.
      const key = this._sanitise(scenarioName);
      const stepIndex = (this._stepCounters.get(key) ?? 0) + 1;
      this._stepCounters.set(key, stepIndex);

      const dir = this._ensureDir(scenarioName);
      const filename = `${String(stepIndex).padStart(3, '0')}_${this._sanitise(stepName)}.png`;
      const filePath = path.join(dir, filename);

      if (lastSelector) {
        // Highlight → screenshot → remove highlight (cleanup runs even on error).
        await highlighter.highlightAndScreenshot(page, lastSelector, filePath, { fullPage: true });
      } else {
        await page.screenshot({ path: filePath, fullPage: false });
      }

      return filePath;
    } catch (err) {
      // Never let screenshot errors fail the step itself.
      console.warn(`[ScreenshotManager] Could not capture step screenshot: ${err.message}`);
      return null;
    }
  }

  /**
   * Reset the step counters for a scenario (call at scenario start if reusing the singleton).
   * @param {string} scenarioName
   */
  resetCounters(scenarioName) {
    this._stepCounters.delete(this._sanitise(scenarioName));
  }
}

module.exports = new ScreenshotManager();
