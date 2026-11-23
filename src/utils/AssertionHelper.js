const { expect } = require('@playwright/test');
const config = require('./ConfigManager');

/**
 * AssertionHelper
 * Centralised Playwright assertion helpers built on expect(locator.*).
 *
 * Why expect(locator) over manual waitForSelector + textContent + expect?
 *   - Auto-retries until the condition is met or the timeout expires
 *   - Produces rich, readable failure messages out of the box
 *   - No manual waitForSelector guard needed before asserting
 *
 * All methods accept a Playwright Page and a CSS/XPath selector string.
 * The helper converts the selector to a Playwright Locator internally so
 * callers never need to manage Locator objects themselves.
 *
 * Usage in a step definition:
 *   const assertions = require('../utils/AssertionHelper');
 *   await assertions.verifyVisible(page, locator);
 *   await assertions.verifyText(page, locator, 'Welcome testuser123');
 *
 * Usage in a page object (via BasePage helpers that delegate here):
 *   await this.verifyVisible(this.locators.welcomeUser);
 *   await this.verifyText(this.locators.welcomeUser, expectedText);
 */
class AssertionHelper {
  // ── Visibility ─────────────────────────────────────────────────────────────

  /**
   * Assert that an element is visible in the viewport.
   * Auto-retries until visible or timeout expires.
   *
   * @param {import('playwright').Page} page
   * @param {string} selector
   * @param {number} [timeout] - Defaults to config timeout
   */
  async verifyVisible(page, selector, timeout) {
    await expect(page.locator(selector).first()).toBeVisible({
      timeout: timeout ?? config.getTimeout()
    });
  }

  /**
   * Assert that an element is NOT visible (hidden or absent).
   *
   * @param {import('playwright').Page} page
   * @param {string} selector
   * @param {number} [timeout]
   */
  async verifyNotVisible(page, selector, timeout) {
    await expect(page.locator(selector).first()).toBeHidden({
      timeout: timeout ?? config.getTimeout()
    });
  }

  // ── Text ───────────────────────────────────────────────────────────────────

  /**
   * Assert that an element's text contains the expected string (partial match).
   * Auto-retries — no manual getText() call needed.
   *
   * @param {import('playwright').Page} page
   * @param {string} selector
   * @param {string} expectedText
   * @param {number} [timeout]
   */
  async verifyText(page, selector, expectedText, timeout) {
    await expect(page.locator(selector).first()).toContainText(expectedText, {
      timeout: timeout ?? config.getTimeout()
    });
  }

  /**
   * Assert that an element's full text exactly equals the expected string.
   *
   * @param {import('playwright').Page} page
   * @param {string} selector
   * @param {string} expectedText
   * @param {number} [timeout]
   */
  async verifyExactText(page, selector, expectedText, timeout) {
    await expect(page.locator(selector).first()).toHaveText(expectedText, {
      timeout: timeout ?? config.getTimeout()
    });
  }

  // ── Input values ───────────────────────────────────────────────────────────

  /**
   * Assert that an input field has the given value.
   *
   * @param {import('playwright').Page} page
   * @param {string} selector
   * @param {string} expectedValue
   * @param {number} [timeout]
   */
  async verifyInputValue(page, selector, expectedValue, timeout) {
    await expect(page.locator(selector).first()).toHaveValue(expectedValue, {
      timeout: timeout ?? config.getTimeout()
    });
  }

  // ── Enabled / disabled ────────────────────────────────────────────────────

  /**
   * Assert that an element is enabled (not disabled).
   *
   * @param {import('playwright').Page} page
   * @param {string} selector
   * @param {number} [timeout]
   */
  async verifyEnabled(page, selector, timeout) {
    await expect(page.locator(selector).first()).toBeEnabled({
      timeout: timeout ?? config.getTimeout()
    });
  }

  /**
   * Assert that an element is disabled.
   *
   * @param {import('playwright').Page} page
   * @param {string} selector
   * @param {number} [timeout]
   */
  async verifyDisabled(page, selector, timeout) {
    await expect(page.locator(selector).first()).toBeDisabled({
      timeout: timeout ?? config.getTimeout()
    });
  }

  // ── Count ──────────────────────────────────────────────────────────────────

  /**
   * Assert the number of elements matching the selector.
   *
   * @param {import('playwright').Page} page
   * @param {string} selector
   * @param {number} expectedCount
   * @param {number} [timeout]
   */
  async verifyCount(page, selector, expectedCount, timeout) {
    await expect(page.locator(selector)).toHaveCount(expectedCount, {
      timeout: timeout ?? config.getTimeout()
    });
  }

  // ── URL / title ────────────────────────────────────────────────────────────

  /**
   * Assert that the current page URL contains the given substring.
   *
   * @param {import('playwright').Page} page
   * @param {string} urlSubstring
   * @param {number} [timeout]
   */
  async verifyURL(page, urlSubstring, timeout) {
    await expect(page).toHaveURL(new RegExp(urlSubstring), {
      timeout: timeout ?? config.getTimeout()
    });
  }

  /**
   * Assert the page title contains the expected string.
   *
   * @param {import('playwright').Page} page
   * @param {string} expectedTitle
   * @param {number} [timeout]
   */
  async verifyTitle(page, expectedTitle, timeout) {
    await expect(page).toHaveTitle(new RegExp(expectedTitle), {
      timeout: timeout ?? config.getTimeout()
    });
  }
}

module.exports = new AssertionHelper();
