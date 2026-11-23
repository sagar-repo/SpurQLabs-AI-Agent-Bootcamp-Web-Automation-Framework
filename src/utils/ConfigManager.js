const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, '..', 'config');

/**
 * ConfigManager
 * Single source of truth for all environment configuration.
 *
 * Environment resolution order (highest to lowest priority):
 *   1. ENV environment variable  (e.g.  ENV=UAT npx cucumber-js)
 *   2. NODE_ENV environment variable
 *   3. Default: 'QA'
 *
 * Config file: src/config/<ENV>.json   (e.g. src/config/QA.json)
 *
 * Usage:
 *   const config = require('../utils/ConfigManager');
 *   config.get('baseURL')   // → 'https://www.demoblaze.com'
 *   config.getEnv()         // → 'QA'
 *   config.getTimeout()     // → 30000
 */
class ConfigManager {
  constructor() {
    this._env = this._resolveEnv();
    this._config = this._load(this._env);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Get any configuration value by key.
   * @param {string} key - Config key (e.g. 'baseURL', 'timeout')
   * @param {*} [defaultValue] - Returned when key is absent (instead of throwing)
   * @returns {*}
   */
  get(key, defaultValue) {
    if (key in this._config) {
      return this._config[key];
    }
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(
      `[ConfigManager] Key '${key}' not found in config/${this._env}.json.\n` +
      `Available keys: ${Object.keys(this._config).join(', ')}`
    );
  }

  /**
   * Get the active environment name.
   * @returns {string}  e.g. 'QA', 'UAT', 'PROD'
   */
  getEnv() {
    return this._env;
  }

  // ── Shortcut helpers (keeps call-sites concise) ───────────────────────────

  /** @returns {string} Application base URL */
  getBaseURL() { return this.get('baseURL'); }

  /** @returns {number} Default element-wait timeout in ms */
  getTimeout() { return this.get('timeout'); }

  /**
   * Short timeout used for quick visibility checks.
   * Falls back to 5000 ms if not defined in config.
   * @returns {number}
   */
  getShortTimeout() { return this.get('shortTimeout', 5000); }

  /** @returns {number} Cucumber step timeout in ms */
  getStepTimeout() { return this.get('stepTimeout', 60000); }

  /** @returns {number} Test retry count */
  getRetryCount() { return this.get('retryCount', 0); }

  /** @returns {boolean} Whether to run browser headless */
  isHeadless() { return this.get('headless', false); }

  /** @returns {Object} Viewport dimensions { width, height } */
  getViewport() { return this.get('viewport', { width: 1280, height: 720 }); }

  /**
   * Page-stability timeouts used by ScreenshotManager before every screenshot.
   * @returns {{ domContentLoadedTimeout: number, networkIdleTimeout: number, animationsTimeout: number }}
   */
  getScreenshotStability() {
    const s = this.get('screenshot', {});
    const defaults = { domContentLoadedTimeout: 5000, networkIdleTimeout: 3000, animationsTimeout: 2000 };
    return Object.assign({}, defaults, s.stability || {});
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  /** @private */
  _resolveEnv() {
    const raw = (process.env.ENV || process.env.NODE_ENV || 'QA').trim();
    // Normalise to title case so 'qa', 'QA', 'Qa' all resolve to QA.json
    return raw.toUpperCase();
  }

  /** @private */
  _load(env) {
    const filePath = path.join(CONFIG_DIR, `${env}.json`);

    if (!fs.existsSync(filePath)) {
      throw new Error(
        `[ConfigManager] Config file not found: config/${env}.json\n` +
        `Set the ENV environment variable to a valid environment name.\n` +
        `Available files: ${this._listAvailableConfigs()}`
      );
    }

    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      throw new Error(`[ConfigManager] Failed to parse config/${env}.json: ${err.message}`);
    }
  }

  /** @private */
  _listAvailableConfigs() {
    if (!fs.existsSync(CONFIG_DIR)) return '(config directory not found)';
    return fs.readdirSync(CONFIG_DIR)
      .filter(f => f.endsWith('.json'))
      .join(', ') || '(none)';
  }
}

// Export as a singleton — config is read once per process
module.exports = new ConfigManager();
