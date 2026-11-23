const report = require('multiple-cucumber-html-reporter');
const path = require('path');

report.generate({
  jsonDir: './reports',
  reportPath: './reports/html-report',
  metadata: {
    browser: {
      name: 'chromium',
      version: '120'
    },
    device: 'Local test machine',
    platform: {
      name: 'Windows',
      version: '11'
    }
  },
  customData: {
    title: 'Test Execution Info',
    data: [
      { label: 'Project', value: 'Demoblaze Automation Framework' },
      { label: 'Release', value: '1.0.0' },
      { label: 'Test Environment', value: 'QA' },
      { label: 'Execution Date', value: new Date().toLocaleString() }
    ]
  }
});

console.log('HTML Report generated successfully!');
