'use strict';

/**
 * runner.js — Cucumber test runner.
 *
 * Runs cucumber-js, waits for all reporters to finish writing output files,
 * then combines accessibility results. Using a runner script (instead of
 * AfterAll) avoids the race condition where AfterAll fires before the JSON
 * reporter has finished writing cucumber-report.json to disk.
 *
 * Usage:
 *   node src/config/runner.js [cucumber-js args...]
 *
 * Examples:
 *   node src/config/runner.js --tags @ValidLogin
 *   node src/config/runner.js --tags @Smoke
 *   node src/config/runner.js                        (runs all scenarios)
 */

const { spawnSync } = require('child_process');
const reportGenerator = require('../utils/ReportGenerator');

const rawArgs    = process.argv.slice(2);
const extraArgs  = rawArgs.filter(a => a !== '--a11y-only');

// Snapshot time before cucumber starts — combineAxeResults() uses this
// to pick up ONLY files written during THIS run (not old ones).
const runStartedAt = Date.now();

console.log(`\n🥒 Starting Cucumber run${extraArgs.length ? ': ' + extraArgs.join(' ') : ''}...\n`);

// spawnSync with shell:true rebuilds the command line by joining the args
// array with spaces, WITHOUT re-quoting them — so an arg like a multi-word
// tag expression ("@A or @B") gets split back into separate tokens by the
// shell. Re-quote any arg containing whitespace so it survives the rebuild.
const shellSafeArgs = extraArgs.map(a => (/\s/.test(a) ? `"${a}"` : a));

const result = spawnSync(
  'npx',
  ['cucumber-js', '--config', 'src/config/cucumber.config.js', ...shellSafeArgs],
  { stdio: 'inherit', shell: true }
);

// cucumber-js fully exited — reporters have flushed all files.
// ConfigManager is required HERE (lazy) so it loads AFTER cucumber writes
// its output, avoiding any config-not-found crash at startup.
async function postRun() {
  const config = require('../utils/ConfigManager');

  // Combine this run's axe sidecars into reports/axe.json.
  // The accessibility HTML report itself is generated on demand via the
  // qa_accessibility MCP tool (e.g. from Claude Code), not automatically
  // here — the test run shouldn't depend on that server being up.
  if (config.get('a11yEnabled', false)) {
    reportGenerator.combineAxeResults(runStartedAt);
  }
}

postRun()
  .catch((err) => {
    console.error('[runner] Post-run error:', err.message);
  })
  .finally(() => {
    process.exit(result.status ?? 0);
  });
