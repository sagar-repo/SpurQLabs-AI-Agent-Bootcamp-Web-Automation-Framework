/**
 * ElementHighlighter
 * Uses page.evaluate() to inject a temporary CSS highlight onto a DOM element
 * before a screenshot is taken, then cleans it up immediately after.
 *
 * The highlight is a vivid red outline + semi-transparent yellow background
 * applied as an inline style so it never conflicts with the page's own CSS.
 *
 * Usage (standalone):
 *   const highlighter = require('../utils/ElementHighlighter');
 *   await highlighter.highlight(page, '#loginusername');
 *   await page.screenshot({ path: 'reports/screenshot.png', fullPage: true });
 *   await highlighter.removeHighlight(page, '#loginusername');
 *
 * Usage (all-in-one):
 *   await highlighter.highlightAndScreenshot(page, '#loginusername', 'reports/login.png');
 */

const HIGHLIGHT_STYLE = [
  'outline: 3px solid red',
  'outline-offset: 2px',
  'background-color: rgba(255, 255, 0, 0.35)',
  'transition: none'
].join('; ');

const DATA_ATTR = 'data-pw-highlight';

class ElementHighlighter {
  /**
   * Apply a visible highlight to every DOM element matching the selector.
   * The original inline style is stored in a data attribute so it can be
   * restored exactly when removeHighlight() is called.
   *
   * Safe to call on selectors that match zero elements — no error is thrown.
   *
   * @param {import('playwright').Page} page
   * @param {string} selector - CSS selector of the element(s) to highlight
   */
  async highlight(page, selector) {
    await page.evaluate(
      ({ sel, style, attr }) => {
        const getElements = (s) => {
          if (s.startsWith('xpath=')) {
            const xpr = document.evaluate(s.slice(6), document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            return Array.from({ length: xpr.snapshotLength }, (_, i) => xpr.snapshotItem(i));
          }
          const clean = s.startsWith('css=') ? s.slice(4) : s;
          try { return Array.from(document.querySelectorAll(clean)); } catch { return []; }
        };
        getElements(sel).forEach((el) => {
          el.setAttribute(attr, el.style.cssText || '');
          el.style.cssText += '; ' + style;
        });
      },
      { sel: selector, style: HIGHLIGHT_STYLE, attr: DATA_ATTR }
    );
  }

  /**
   * Remove the highlight from every element that was previously highlighted
   * by this utility, restoring the original inline style exactly.
   *
   * @param {import('playwright').Page} page
   * @param {string} selector - Same CSS selector used in highlight()
   */
  async removeHighlight(page, selector) {
    await page.evaluate(
      ({ sel, attr }) => {
        const getElements = (s) => {
          if (s.startsWith('xpath=')) {
            const xpr = document.evaluate(s.slice(6), document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            return Array.from({ length: xpr.snapshotLength }, (_, i) => xpr.snapshotItem(i));
          }
          const clean = s.startsWith('css=') ? s.slice(4) : s;
          try { return Array.from(document.querySelectorAll(clean)); } catch { return []; }
        };
        getElements(sel).forEach((el) => {
          const original = el.getAttribute(attr);
          if (original !== null) {
            el.style.cssText = original;
            el.removeAttribute(attr);
          }
        });
      },
      { sel: selector, attr: DATA_ATTR }
    );
  }

  /**
   * Highlight one or more elements, take a full-page screenshot, then
   * remove the highlight — all in one call.
   *
   * @param {import('playwright').Page} page
   * @param {string|string[]} selectors - Selector or array of selectors to highlight
   * @param {string} screenshotPath     - Absolute or relative path for the PNG file
   * @param {Object} [screenshotOptions] - Extra options passed to page.screenshot()
   */
  async highlightAndScreenshot(page, selectors, screenshotPath, screenshotOptions = {}) {
    const list = Array.isArray(selectors) ? selectors : [selectors];

    // Apply highlights
    for (const sel of list) {
      await this.highlight(page, sel);
    }

    // Capture screenshot with highlights visible
    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
      ...screenshotOptions
    });

    // Always restore the DOM — even if screenshot throws
    for (const sel of list) {
      await this.removeHighlight(page, sel).catch(() => {});
    }

    console.log(`[ElementHighlighter] Screenshot saved: ${screenshotPath}`);
  }
}

module.exports = new ElementHighlighter();
