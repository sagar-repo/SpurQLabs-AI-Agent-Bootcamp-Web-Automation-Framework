const fs = require('fs');
const path = require('path');

class TestDataLoader {
  /**
   * Load raw JSON file content for a feature.
   * Supports both the new scenario-array format and the legacy flat-key format.
   * @param {string} featureName - Feature file name (e.g., 'Login', 'Signup')
   * @returns {Object} - Parsed JSON object
   */
  static loadTestData(featureName) {
    const testDataPath = path.join(__dirname, '..', 'testdata', `${featureName}.json`);

    if (!fs.existsSync(testDataPath)) {
      console.warn(`Test data file not found: ${testDataPath}`);
      return {};
    }

    return JSON.parse(fs.readFileSync(testDataPath, 'utf8'));
  }

  /**
   * Get test data for a specific scenario by name.
   * Supports the new scenario-array format:
   *   { "scenarios": [{ "scenarioName": "...", "testData": { ... } }] }
   * Also falls back to the legacy flat-key format for backward compatibility.
   * @param {string} featureName - Feature file name (e.g., 'Login')
   * @param {string} scenarioName - Exact scenario name as written in the feature file
   * @returns {Object} - testData object for the matched scenario, or {}
   */
  static getTestData(featureName, scenarioName) {
    const raw = this.loadTestData(featureName);

    // --- New scenario-array format ---
    if (Array.isArray(raw.scenarios)) {
      const match = raw.scenarios.find(
        (entry) => entry.scenarioName === scenarioName
      );
      if (!match) {
        console.warn(`[TestDataLoader] No scenario entry found for: "${scenarioName}"`);
        return {};
      }
      return match.testData || {};
    }

    // --- Legacy flat-key format (backward compatibility) ---
    const normalizedName = scenarioName.replace(/ /g, '_');
    if (raw[normalizedName]) {
      return raw[normalizedName];
    }

    console.warn(`[TestDataLoader] Scenario data not found for: "${scenarioName}"`);
    return {};
  }

  /**
   * Get scenario-specific test data (legacy method — kept for backward compatibility).
   * Prefer getTestData() for new code.
   * @param {string} featureName - Feature file name
   * @param {string} scenarioName - Scenario name
   * @returns {Object} - Scenario test data
   */
  static getScenarioData(featureName, scenarioName) {
    return this.getTestData(featureName, scenarioName);
  }

  /**
   * Load environment-specific configuration
   * @param {string} environment - Environment name (QA, UAT, PROD)
   * @returns {Object} - Environment configuration
   */
  static loadEnvironmentConfig(environment = 'QA') {
    const configPath = path.join(__dirname, '..', 'config', `${environment}.json`);
    
    if (!fs.existsSync(configPath)) {
      console.warn(`Environment config not found: ${configPath}. Using default.`);
      return {
        baseURL: 'https://www.demoblaze.com',
        timeout: 30000
      };
    }
    
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
}

module.exports = TestDataLoader;
