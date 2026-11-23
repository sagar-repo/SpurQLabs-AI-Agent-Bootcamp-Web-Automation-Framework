#!/usr/bin/env node
/**
 * Calls the qa-accessibility MCP server, handles the elicitation/create
 * prompt automatically (accepts all defaults), and prints the report.
 */

const http = require('http');

const SERVER = 'http://localhost:8081';
const REPORT_PATH  = 'd:/Frameworks/Demoblaze-AI-Automation-Javascript-Framework/reports/cucumber-report.json';
const AXE_PATH     = 'd:/Frameworks/Demoblaze-AI-Automation-Javascript-Framework/reports/successful_login_with_valid_credentials_axe.json';
const OUTPUT_DIR   = 'd:/Frameworks/Demoblaze-AI-Automation-Javascript-Framework/reports';

function post(path, body, sessionId) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'Content-Length': Buffer.byteLength(data),
    };
    if (sessionId) headers['mcp-session-id'] = sessionId;

    const url = new URL(SERVER + path);
    const req = http.request({ hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST', headers }, (res) => {
      const newSession = res.headers['mcp-session-id'] || sessionId;
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => resolve({ body: raw, sessionId: newSession }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function parseEvents(raw) {
  return raw.split('\n')
    .filter(l => l.startsWith('data:'))
    .map(l => { try { return JSON.parse(l.slice(5).trim()); } catch { return null; } })
    .filter(Boolean);
}

async function main() {
  // 1. Initialize session
  console.log('Initializing MCP session...');
  const init = await post('/mcp', {
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2024-11-05', clientInfo: { name: 'cli', version: '1.0' }, capabilities: { elicitation: {} } }
  });
  const sessionId = init.sessionId;
  console.log(`Session: ${sessionId}`);

  // 2. Send initialized notification
  await post('/mcp', { jsonrpc: '2.0', method: 'notifications/initialized', params: {} }, sessionId);

  // 3. Call the tool — server will respond with elicitation/create
  console.log('Calling qa_accessibility tool...');
  const toolResp = await post('/mcp', {
    jsonrpc: '2.0', id: 2, method: 'tools/call',
    params: {
      name: 'qa_accessibility',
      arguments: { report_path: REPORT_PATH, axe_path: AXE_PATH, output_dir: OUTPUT_DIR }
    }
  }, sessionId);

  const events = parseEvents(toolResp.body);
  const elicitation = events.find(e => e.method === 'elicitation/create');

  if (elicitation) {
    console.log('Elicitation received — accepting defaults...');
    // 4. Respond to elicitation with default values
    const elicitResp = await post('/mcp', {
      jsonrpc: '2.0', id: elicitation.id,
      result: {
        action: 'accept',
        content: { standard: 'wcag21aa', min_impact: 'moderate', include_incomplete: false }
      }
    }, sessionId);

    const finalEvents = parseEvents(elicitResp.body);
    const result = finalEvents.find(e => e.id === 2 && e.result);
    if (result) {
      console.log('\n=== ACCESSIBILITY REPORT ===\n');
      const content = result.result?.content;
      if (Array.isArray(content)) {
        content.forEach(c => console.log(c.text || JSON.stringify(c, null, 2)));
      } else {
        console.log(JSON.stringify(result.result, null, 2));
      }
    } else {
      console.log('Final response:', JSON.stringify(finalEvents, null, 2));
    }
  } else {
    // No elicitation — result came directly
    const result = events.find(e => e.id === 2 && e.result);
    if (result) {
      console.log('\n=== ACCESSIBILITY REPORT ===\n');
      const content = result.result?.content;
      if (Array.isArray(content)) {
        content.forEach(c => console.log(c.text || JSON.stringify(c, null, 2)));
      } else {
        console.log(JSON.stringify(result.result, null, 2));
      }
    } else {
      console.log('Unexpected response:', JSON.stringify(events, null, 2));
    }
  }
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
