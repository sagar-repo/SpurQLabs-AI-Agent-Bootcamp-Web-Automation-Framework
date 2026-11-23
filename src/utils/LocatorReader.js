const fs = require('fs');
const path = require('path');

const LOCATORS_DIR = path.join(__dirname, '..', 'locators');

/**
 * LocatorReader
 * Central utility for loading and caching page locator JSON files.
 *
 * Naming convention enforced:
 *   Page class name  →  locators/<ClassName>.json
 *   e.g.  LoginPage  →  locators/LoginPage.json
 *
 * Usage:
 *   const locatorReader = require('../utils/LocatorReader');
 *   const all   = locatorReader.getLocators('LoginPage');
 *   const value = locatorReader.getLocator('LoginPage', 'usernameField');
 */
class LocatorReader {
  constructor() {
    /** @type {Map<string, Object>} in-memory cache to avoid repeated file reads */
    this._cache = new Map();
  }

  /**
   * Load and return all locators for a page.
   * Results are cached after the first load.
   *
   * @param {string} pageName - Page class name, e.g. 'LoginPage'
   * @returns {Object} - Key/value locator map
   * @throws {Error} if the matching JSON file does not exist
   */
  getLocators(pageName) {
    if (this._cache.has(pageName)) {
      return this._cache.get(pageName);
    }

    const filePath = path.join(LOCATORS_DIR, `${pageName}.json`);

    if (!fs.existsSync(filePath)) {
      throw new Error(
        `[LocatorReader] Locator file not found: locators/${pageName}.json\n` +
        `Ensure the file name matches the page class name exactly.\n` +
        `Available files: ${this._listAvailableFiles()}`
      );
    }

    let locators;
    try {
      locators = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      throw new Error(`[LocatorReader] Failed to parse locators/${pageName}.json: ${err.message}`);
    }

    this._cache.set(pageName, locators);
    return locators;
  }

  /**
   * Get a single locator value by page name and key.
   *
   * @param {string} pageName - Page class name, e.g. 'LoginPage'
   * @param {string} key      - Locator key, e.g. 'usernameField'
   * @returns {string} - CSS / XPath selector
   * @throws {Error} if the key is not found in the locator file
   */
  getLocator(pageName, key) {
    const locators = this.getLocators(pageName);

    if (!(key in locators)) {
      throw new Error(
        `[LocatorReader] Key '${key}' not found in locators/${pageName}.json\n` +
        `Available keys: ${Object.keys(locators).join(', ')}`
      );
    }

    return locators[key];
  }

  /**
   * Check whether a locator file exists for a given page name.
   *
   * @param {string} pageName
   * @returns {boolean}
   */
  hasLocatorFile(pageName) {
    return fs.existsSync(path.join(LOCATORS_DIR, `${pageName}.json`));
  }

  /**
   * Invalidate the cache for a specific page (or all pages).
   * Useful in tests or dynamic reload scenarios.
   *
   * @param {string} [pageName] - Omit to clear entire cache
   */
  clearCache(pageName) {
    if (pageName) {
      this._cache.delete(pageName);
    } else {
      this._cache.clear();
    }
  }

  // ---------------------------------------------------------------------------

  /** @private */
  _listAvailableFiles() {
    if (!fs.existsSync(LOCATORS_DIR)) return '(locators directory not found)';
    return fs.readdirSync(LOCATORS_DIR)
      .filter(f => f.endsWith('.json'))
      .join(', ') || '(none)';
  }
}

// Export as a singleton so the cache is shared across the entire test run
module.exports = new LocatorReader();
