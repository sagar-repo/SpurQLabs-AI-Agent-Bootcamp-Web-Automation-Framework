/**
 * ReportGenerator.js
 *
 * JavaScript equivalent of ReportGenerator.java.
 * Uploads the Cucumber JSON report + SpurQuality config files to the
 * SpurQuality execution API as a multipart/form-data POST request.
 *
 * Enable via QA.json:  "spurQualityEnabled": true
 * (or set env var SPURQUALITY_ENABLED=true)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const https = require('https');
const FormData = require('form-data');

const API_HOSTNAME = 'api-spurqlabs.spurquality.com';
const API_PATH     = '/api/public/framework-report/v2/execute';

const CUCUMBER_JSON    = path.join(process.cwd(), 'reports', 'cucumber-report.json');
const SPUR_CONFIG      = path.join(process.cwd(), 'src', 'config', 'SpurQualityConfig.json');
const EXECUTION_CONFIG = path.join(process.cwd(), 'src', 'config', 'executionConfig.json');

/**
 * Check if SpurQuality upload is enabled.
 * Reads from env var first, then falls back to QA.json.
 * @returns {boolean}
 */
function isEnabled() {
  if (process.env.SPURQUALITY_ENABLED !== undefined) {
    return process.env.SPURQUALITY_ENABLED === 'true';
  }
  try {
    const config = require('./ConfigManager');
    return config.get('spurQualityEnabled', false) === true;
  } catch {
    return false;
  }
}

/**
 * Send a multipart POST to the SpurQuality API.
 * @param {FormData} form
 * @returns {Promise<{status: number, message: string, body: string}>}
 */
function postForm(form) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_HOSTNAME,
      path: API_PATH,
      method: 'POST',
      headers: form.getHeaders()
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          message: res.headers['x-execution-message'] || 'N/A',
          body: body || '(empty)'
        });
      });
    });

    req.on('error', reject);
    form.pipe(req);
  });
}

/**
 * Upload the Cucumber execution report to SpurQuality.
 * Mirror of ReportGenerator.generate() in Java.
 *
 * Call this at the end of a test run (e.g. from hooks After or a reporter script).
 * @returns {Promise<void>}
 */
async function generate() {
  if (!isEnabled()) {
    console.log('[SpurQuality] Report upload is disabled. Set "spurQualityEnabled": true in QA.json (or SPURQUALITY_ENABLED=true) to enable.');
    return;
  }

  if (!fs.existsSync(CUCUMBER_JSON)) {
    console.warn(`[SpurQuality] cucumber-report.json not found at: ${CUCUMBER_JSON}. Skipping upload.`);
    return;
  }

  if (!fs.existsSync(SPUR_CONFIG)) {
    console.warn(`[SpurQuality] SpurQualityConfig.json not found at: ${SPUR_CONFIG}. Skipping upload.`);
    return;
  }

  if (!fs.existsSync(EXECUTION_CONFIG)) {
    console.warn(`[SpurQuality] executionConfig.json not found at: ${EXECUTION_CONFIG}. Skipping upload.`);
    return;
  }

  console.log('[SpurQuality] Uploading execution report...');

  // The API validates top-level form fields — it doesn't open the uploaded
  // SpurQualityConfig.json to read projectName out of it. So send it (and
  // the other identity fields) as plain fields too, not just inside the file.
  const spurConfigJson = JSON.parse(fs.readFileSync(SPUR_CONFIG, 'utf8'));

  const form = new FormData();
  form.append('cucumberFile',      fs.createReadStream(CUCUMBER_JSON),    { contentType: 'application/json', filename: path.basename(CUCUMBER_JSON) });
  form.append('SpurQualityConfig', fs.createReadStream(SPUR_CONFIG),      { contentType: 'application/json', filename: path.basename(SPUR_CONFIG) });
  form.append('executionConfig',   fs.createReadStream(EXECUTION_CONFIG), { contentType: 'application/json', filename: path.basename(EXECUTION_CONFIG) });
  form.append('projectName',       spurConfigJson.projectName || '');

  try {
    const { status, message, body } = await postForm(form);

    console.log(`[SpurQuality] Response Status  : ${status}`);
    console.log(`[SpurQuality] Execution Message: ${message}`);
    console.log(`[SpurQuality] Response Body    :\n${body}`);

    if (status >= 200 && status < 300) {
      console.log('[SpurQuality] Report uploaded successfully.');
    } else {
      console.error(`[SpurQuality] Upload failed with status: ${status}`);
    }
  } catch (err) {
    console.error(`[SpurQuality] Failed to upload report: ${err.message}`);
  }
}

// ─── Accessibility helpers ────────────────────────────────────────────────────

const REPORTS_DIR  = path.join(process.cwd(), 'reports');
const A11Y_SERVER  = 'http://localhost:8081';

const c = {
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
};
const a11yLog  = (msg) => console.log(c.green(`[A11y] ${msg}`));
const a11yInfo = (msg) => console.log(`[A11y] ${msg}`);
const a11yWarn = (msg) => console.warn(c.yellow(`[A11y] ${msg}`));

/**
 * Scan reports/axe/ for *_axe.json sidecars written during the current run
 * (i.e. modified after runStartedAt) and merge them into reports/axe.json,
 * returning its absolute path. Old files from previous runs are ignored.
 * Returns null when no matching sidecar files are found.
 *
 * Always writes the same reports/axe.json path — whether the run had 1
 * scenario or 50 — the same way cucumber-report.json is always one file
 * regardless of how many scenarios ran. Downstream consumers (the
 * accessibility report) never need to branch on how many scenarios executed.
 *
 * Each sidecar's entries carry a "scenario" field (set by hooks.js), so the
 * merged file holds results from every scenario in the run and the report
 * can still group violations by scenario.
 *
 * The per-scenario sidecars are scratch files that only exist to survive
 * parallel scenario execution without a shared-file race (see hooks.js) —
 * once merged, they've served their purpose, so they're deleted here.
 *
 * @param {number} runStartedAt - Date.now() value recorded before cucumber launched
 */
function combineAxeResults(runStartedAt = 0) {
  const axeDir = path.join(REPORTS_DIR, 'axe');
  if (!fs.existsSync(axeDir)) return null;

  const files = fs.readdirSync(axeDir)
    .filter(f => f.endsWith('_axe.json'))
    .filter(f => {
      const mtime = fs.statSync(path.join(axeDir, f)).mtimeMs;
      return mtime >= runStartedAt;
    });

  if (files.length === 0) {
    a11yWarn('No _axe.json sidecar files found for this run — skipping combine.');
    return null;
  }

  const combined = files.flatMap(f => {
    try {
      return JSON.parse(fs.readFileSync(path.join(axeDir, f), 'utf8'));
    } catch (e) {
      a11yWarn(`Could not parse ${f}: ${e.message}`);
      return [];
    }
  });

  const outPath = path.join(REPORTS_DIR, 'axe.json');
  fs.writeFileSync(outPath, JSON.stringify(combined, null, 2));
  a11yInfo(`Combined ${files.length} sidecar file(s) across ${new Set(combined.map(r => r.scenario)).size} scenario(s) → ${outPath}`);

  for (const f of files) {
    try {
      fs.unlinkSync(path.join(axeDir, f));
    } catch (e) {
      a11yWarn(`Could not remove temp sidecar ${f}: ${e.message}`);
    }
  }

  return outPath;
}

/**
 * Low-level HTTP POST to the qa-accessibility MCP server.
 */
function postMcp(reqPath, body, sessionId) {
  const http = require('http');
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const headers = {
      'Content-Type':  'application/json',
      'Accept':        'application/json, text/event-stream',
      'Content-Length': Buffer.byteLength(data)
    };
    if (sessionId) headers['mcp-session-id'] = sessionId;

    const url = new URL(A11Y_SERVER + reqPath);
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST', headers },
      (res) => {
        const sid = res.headers['mcp-session-id'] || sessionId;
        let raw = '';
        res.on('data', chunk => { raw += chunk; });
        res.on('end', () => resolve({ body: raw, sessionId: sid }));
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * Parse SSE/newline-delimited JSON events from a raw response body.
 */
function parseMcpEvents(raw) {
  return raw.split('\n')
    .filter(l => l.startsWith('data:'))
    .map(l => { try { return JSON.parse(l.slice(5).trim()); } catch { return null; } })
    .filter(Boolean);
}

/**
 * Call the qa_accessibility MCP tool automatically after the test run.
 * Reads wcagStandard + a11yMinImpact from config; uses the axe.json
 * produced by combineAxeResults() and the existing cucumber-report.json.
 *
 * Silently skips if the MCP server is not reachable.
 */
async function generateAccessibilityReport(axePath) {
  try {
    const config = require('./ConfigManager');
    const standard  = config.get('wcagStandard',  'wcag21aa');
    const minImpact = config.get('a11yMinImpact', 'moderate');
    const appName   = config.get('appName', '');

    const reportPath  = CUCUMBER_JSON;
    const a11yDirRel  = config.get('a11yReportDir', 'reports/accessibility-reports');
    const outputDir   = path.resolve(process.cwd(), a11yDirRel);

    // Create directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      a11yInfo(`Created report directory → ${outputDir}`);
    }

    if (!fs.existsSync(axePath)) {
      a11yWarn(`axe file not found: ${axePath} — skipping report.`);
      return;
    }

    a11yLog(c.bold('Calling qa_accessibility MCP server...'));

    // 1. Initialize session
    const init = await postMcp('/mcp', {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        clientInfo: { name: 'demoblaze-runner', version: '1.0' },
        capabilities: { elicitation: {} }
      }
    });
    const sessionId = init.sessionId;

    // 2. Notify initialized
    await postMcp('/mcp', {
      jsonrpc: '2.0', method: 'notifications/initialized', params: {}
    }, sessionId);

    // 3. Call the tool — pass all params so elicitation is skipped
    const toolResp = await postMcp('/mcp', {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: {
        name: 'qa_accessibility',
        arguments: {
          report_path:       reportPath,
          axe_path:          axePath,
          app_name:          appName,
          standard:          standard,
          min_impact:        minImpact,
          include_incomplete: false,
          output_dir:        outputDir
        }
      }
    }, sessionId);

    const events = parseMcpEvents(toolResp.body);

    // 4. Handle elicitation if the server still prompts for missing params
    const elicitation = events.find(e => e.method === 'elicitation/create');
    let finalEvents = events;

    if (elicitation) {
      const elicitResp = await postMcp('/mcp', {
        jsonrpc: '2.0', id: elicitation.id,
        result: {
          action:  'accept',
          content: { standard, min_impact: minImpact, include_incomplete: false }
        }
      }, sessionId);
      finalEvents = parseMcpEvents(elicitResp.body);
    }

    // 5. Extract and log the result
    const resultEvent = finalEvents.find(e => e.id === 2 && e.result);
    if (resultEvent) {
      const raw = resultEvent.result?.content;
      const text = Array.isArray(raw)
        ? raw.map(c => c.text || JSON.stringify(c)).join('\n')
        : JSON.stringify(resultEvent.result, null, 2);

      try {
        const parsed = JSON.parse(text);
        a11yLog(c.bold(`Report generated → ${parsed.report_path || outputDir}`));
        a11yInfo(`Pages: ${parsed.pages_checked} | Violations: ${parsed.violation_count} (critical: ${parsed.by_impact?.critical ?? 0}, serious: ${parsed.by_impact?.serious ?? 0})`);
      } catch {
        a11yInfo(`Report generated (raw): ${text.slice(0, 300)}`);
      }
    } else {
      a11yWarn('Unexpected MCP response — check qa-accessibility server.');
    }
  } catch (err) {
    // Non-fatal — test results are not affected if the a11y server is down
    a11yWarn(`Accessibility report skipped: ${err.message}`);
  }
}

module.exports = { generate, combineAxeResults, generateAccessibilityReport };
