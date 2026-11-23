# Bootcamp-Demoblaze-AI-Automation-Framework

## Cucumber + Playwright + JavaScript

A production-ready BDD test automation framework for the Demoblaze application, built with Cucumber, Playwright, and Node.js. Features centralized configuration, auto-mapped locators, step-level screenshots with element highlighting, and SpurQuality report integration.

---

## Project Structure

```
Bootcamp-Demoblaze-AI-Automation-Framework/
├── runner.js                      # Test runner with SpurQuality upload
├── cucumber.js                    # Cucumber configuration
├── playwright.config.js           # Playwright configuration
├── package.json
├── src/
│   ├── config/
│   │   ├── QA.json                # Environment config (timeouts, browser, flags)
│   │   ├── SpurQualityConfig.json # SpurQuality user/project settings
│   │   └── executionConfig.json   # SpurQuality execution metadata
│   ├── core/
│   │   └── hooks.js               # Before / AfterStep / After Cucumber hooks
│   ├── features/
│   │   └── Login.feature
│   ├── locators/                  # Page-wise locator JSON files (auto-mapped)
│   │   ├── LoginPage.json
│   │   └── HomePage.json
│   ├── pages/                     # Page Object Model classes
│   │   ├── BasePage.js            # Base class with all shared interactions
│   │   ├── HomePage.js
│   │   └── LoginPage.js
│   ├── step_definitions/
│   │   └── LoginSteps.js
│   ├── testdata/
│   │   └── Login.json             # Scenario-wise test data
│   └── utils/
│       ├── AssertionHelper.js     # Playwright expect wrappers
│       ├── ConfigManager.js       # Central config singleton
│       ├── ElementHighlighter.js  # Live element highlighting
│       ├── LocatorReader.js       # Cached locator loader
│       ├── ReportGenerator.js     # SpurQuality upload utility
│       ├── ScenarioContext.js     # Per-scenario context manager
│       ├── ScreenshotManager.js   # Step-level screenshot capture
│       ├── TestDataLoader.js      # Scenario-wise test data loader
│       └── reporter.js            # Enhanced HTML report generator
└── reports/
    ├── cucumber-report.html
    ├── cucumber-report.json
    ├── cucumber-report.xml
    └── screenshots/
        └── <scenario-name>/       # Per-scenario step screenshots
            ├── 001_step-name.png
            ├── 002_step-name.png
            └── ...
```

---

## Key Features

- **BDD with Cucumber** — Feature files, step definitions, Background, tags
- **Page Object Model** — `BasePage` with shared interactions; subclasses for each page
- **Auto-mapped Locators** — `LocatorReader` loads `locators/<ClassName>.json` automatically by class name; no manual `loadLocators()` needed
- **Centralized Config** — All timeouts, browser settings, URLs in `src/config/QA.json` via `ConfigManager` singleton
- **Scenario-wise Test Data** — `TestDataLoader` maps data by scenario name from feature-named JSON files
- **ScenarioContext** — Shared context manager across hooks and steps: browser, page objects, test data, locators, runtime data
- **Playwright `expect` Assertions** — Auto-retrying assertions via `AssertionHelper` (`verifyVisible`, `verifyText`, `verifyURL`, etc.)
- **Live Element Highlighting** — Red outline + yellow background injected before every click/fill so the interacting element is visible during execution
- **Step-level Screenshots** — `AfterStep` hook captures a screenshot after every step, highlights the last interacted element, embeds it as base64 in `cucumber-report.json`
- **Multiple Reports** — HTML, JSON, JUnit XML; enhanced HTML via `npm run report`
- **SpurQuality Integration** — Uploads Cucumber JSON + screenshots to SpurQuality after the full run completes
- **Tag-based Execution** — Dedicated npm scripts for each tag group

---

## Prerequisites

- Node.js v16+
- npm v8+

---

## Installation

```bash
npm install
npx playwright install
```

---

## Running Tests

### Without SpurQuality upload

```bash
# All tests
npm test

# By tag
npm run test:smoke
npm run test:regression
npm run test:negative
npm run test:valid-login

# Any custom tag
npx cucumber-js --tags "@YourTag"

# Parallel
npm run test:parallel
```

### With SpurQuality upload (runs tests then auto-uploads)

```bash
# By tag
npm run test:smoke:sq
npm run test:regression:sq
npm run test:negative:sq
npm run test:valid-login:sq

# All tests
npm run test:all:sq

# Custom tag via runner
node runner.js --tags "@YourTag"
```

### Upload last run's report manually

```bash
npm run spurquality
```

### Generate enhanced HTML report

```bash
npm run report
```

---

## Configuration

All settings live in `src/config/QA.json`:

```json
{
  "environment": "QA",
  "baseURL": "https://www.demoblaze.com",
  "timeout": 30000,
  "shortTimeout": 5000,
  "stepTimeout": 60000,
  "retryCount": 1,
  "browser": "chromium",
  "headless": false,
  "slowMo": 500,
  "viewport": { "width": 1280, "height": 720 },
  "screenshot": { "onFailure": true, "fullPage": true },
  "video": { "enabled": true, "onFailure": true },
  "spurQualityEnabled": true
}
```

Override `spurQualityEnabled` without editing the file:
```bash
SPURQUALITY_ENABLED=true npx cucumber-js
```

---

## SpurQuality Integration

Configure in `src/config/SpurQualityConfig.json`:
```json
{
  "email": "your@email.com",
  "userName": "Your Name",
  "projectName": "DemoBlaze",
  "tool": "Spur Validator",
  "organizationName": "YourOrg",
  "designation": "SDET",
  "report": "PostExecution",
  "templateName": "Default Template",
  "testExecutionAssignee": "Your Name",
  "testCaseExecutedBy": "Your Name",
  "testType": "manual",
  "userSecretKey": "<your-secret-key>"
}
```

Execution metadata in `src/config/executionConfig.json`:
```json
{
  "testExecutionDescription": "Execution description",
  "testExecutionSummary": "Test Execution Summary",
  "fixVersion": "V 0.0.1"
}
```

The upload sends `cucumber-report.json` (with inline base64 screenshots per step) + both config files as a multipart POST to the SpurQuality API.

---

## Writing Tests

### 1. Add a Locator File

Create `src/locators/MyPage.json`:
```json
{
  "submitButton": "#submit",
  "emailField": "#email"
}
```

### 2. Create a Page Object

`src/pages/MyPage.js` — locators are auto-loaded from `MyPage.json`:
```javascript
const BasePage = require('./BasePage');

class MyPage extends BasePage {
  constructor(page) {
    super(page); // locators/MyPage.json auto-loaded here
  }

  async clickSubmit() {
    await this.click(this.locators.submitButton);
  }
}

module.exports = MyPage;
```

### 3. Add Test Data

`src/testdata/MyFeature.json`:
```json
{
  "scenarios": [
    {
      "scenarioName": "My scenario name",
      "testData": {
        "email": "test@example.com"
      }
    }
  ]
}
```

### 4. Write a Feature File

`src/features/MyFeature.feature`:
```gherkin
@Regression
Feature: My Feature

  @Smoke
  Scenario: My scenario name
    Given User navigates to Demoblaze application
    When User enters "email" field value
    Then User should see "confirmationMsg" element with username
```

### 5. Write Step Definitions

`src/step_definitions/MySteps.js`:
```javascript
const { When, Then } = require('@cucumber/cucumber');
const assertions = require('../utils/AssertionHelper');
const highlighter = require('../utils/ElementHighlighter');

When('User does something with {string}', async function (key) {
  const page = this.scenarioContext.getPage();
  const locator = this.scenarioContext.getLocator(key);
  await highlighter.highlight(page, locator);
  await page.click(locator);
  this.scenarioContext.setLastElement(locator);
  await highlighter.removeHighlight(page, locator).catch(() => {});
});
```

---

## Utility Reference

| Utility | Purpose |
|---|---|
| `ConfigManager` | `config.getBaseURL()`, `config.getTimeout()`, `config.isHeadless()`, `config.get(key, default)` |
| `LocatorReader` | `locatorReader.getLocators('PageName')`, `locatorReader.getLocator('PageName', 'key')` |
| `ScenarioContext` | `getPage()`, `getLocator(key)`, `getTestDataValue(key)`, `setContextData/getContextData`, `setLastElement/getLastElement` |
| `TestDataLoader` | `TestDataLoader.getTestData('FeatureName', 'Scenario Name')` |
| `AssertionHelper` | `assertions.verifyVisible(page, sel)`, `assertions.verifyText(page, sel, text)`, `assertions.verifyURL(page, url)` |
| `ElementHighlighter` | `highlighter.highlight(page, sel)`, `highlighter.removeHighlight(page, sel)`, `highlighter.highlightAndScreenshot(page, sel, path)` |
| `ScreenshotManager` | `screenshotManager.captureStepScreenshot(page, stepName, scenarioName, selector)` |
| `ReportGenerator` | `reportGenerator.generate()` — uploads to SpurQuality |

---

## Tags Reference

| Tag | Scenarios |
|---|---|
| `@Regression` | All login scenarios (feature-level) |
| `@Smoke` | Successful login with valid credentials |
| `@ValidLogin` | Successful login with valid credentials |
| `@NegativeTest` | Login with invalid credentials, Login with empty credentials |
| `@Login` | All login scenarios |