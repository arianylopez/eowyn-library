'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const generator = path.resolve(__dirname, '../scripts/generate-report.js');

function render(t, metric, extraFiles = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eowyn-report-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, '00-smoke-summary.json'), JSON.stringify({ metrics: metric }));
  for (const [name, data] of Object.entries(extraFiles)) fs.writeFileSync(path.join(dir, name), data);
  const result = spawnSync(process.execPath, [generator, dir, path.join(dir, 'report.html')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return fs.readFileSync(path.join(dir, 'report.html'), 'utf8');
}

test('a failed real threshold is not replaced by dashboard generic limits', t => {
  const html = render(t, { http_req_duration: { 'p(95)': 900, thresholds: { 'p(95)<800': true } } });
  assert.match(html, /badge warn">Revisar/);
});
test('legacy false threshold means passed', t => {
  assert.match(render(t, { http_req_duration: { thresholds: { 'p(95)<1500': false } } }), /badge ok">Dentro de umbral/);
});
test('modern summary and failed HTTP rate use correct values', t => {
  const html = render(t, { http_req_failed: { values: { rate: 0.25 }, thresholds: { 'rate<0.01': { ok: false } } } });
  assert.match(html, /25\.00 %/);
  assert.match(html, /badge warn">Revisar/);
});
test('missing thresholds do not certify success', t => {
  assert.match(render(t, {}), /Sin umbrales evaluados/);
});
test('missing resource samples remain missing rather than zero', t => {
  const html = render(t, {}, { '00-smoke-resources.csv': '\uFEFFtimestamp,app_cpu_pct,app_rss_mb\na,,10\nb,,20\n' });
  assert.doesNotMatch(html, /CPU API \(prom\.\)/);
  assert.match(html, /15\.0 MB/);
});
test('an aborted run cannot be shown as passed', t => {
  const html = render(t, { checks: { thresholds: { 'rate>0.99': false } } }, {
    'execution.json': JSON.stringify({ runs: [{ name: '00-smoke', exitCode: 1 }] }),
  });
  assert.match(html, /badge warn">Revisar/);
});
