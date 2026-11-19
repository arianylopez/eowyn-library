#!/usr/bin/env node
/**
 * Genera un reporte HTML autocontenido a partir de los resúmenes de k6
 * (--summary-export) y de los CSV de recursos generados por monitor.sh.
 *
 * Uso:
 *   node performance/scripts/generate-report.js
 *   node performance/scripts/generate-report.js <dir-resumenes> <salida.html>
 *
 * Salida por defecto:
 *   report.html dentro de la ejecución k6 más reciente
 */
'use strict';

const fs = require('fs');
const path = require('path');

function latestResults() {
  const root = path.join(__dirname, '..', 'results');
  const legacy = path.join(root, 'k6');
  if (!fs.existsSync(root)) return legacy;
  const candidates = [legacy, ...fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory()).map(entry => path.join(root, entry.name, 'k6'))];
  return candidates.filter(dir => fs.existsSync(dir) && fs.readdirSync(dir).some(name => name.endsWith('-summary.json')))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || legacy;
}

const RESULTS_DIR = path.resolve(process.argv[2] || latestResults());
const OUT_FILE = path.resolve(
  process.argv[3] || path.join(RESULTS_DIR, 'report.html')
);

const LABELS = {
  '00-smoke': 'S0 · Smoke',
  '01-auth-load': 'S1 · Carga de login',
  '02-catalog-load': 'S2 · Lectura de catálogo',
  '03-mixed-crud': 'S3 · Carga mixta',
  '04-loan-contention': 'S4 · Contención de préstamos',
  '05-stress': 'S5 · Estrés',
  '06-spike': 'S6 · Pico',
  '07-soak': 'S7 · Resistencia',
};

const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const num = (value, digits = 2) =>
  Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—';

const ms = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${n.toFixed(0)} ms`;
};

function readSummary(file) {
  const summary = JSON.parse(fs.readFileSync(file, 'utf8'));
  const metrics = Object.fromEntries(Object.entries(summary.metrics || {}).map(([key, metric]) => [key, metric.values ? { ...metric.values, value: metric.values.rate, thresholds: metric.thresholds } : metric]));
  const base = path.basename(file, '-summary.json');
  const duration = metrics['http_req_duration'] || {};
  const failed = metrics['http_req_failed'] || {};
  const checks = metrics.checks || {};
  const reqs = metrics.http_reqs || {};
  const iterations = metrics.iterations || {};
  const vus = metrics.vus_max || metrics.vus || {};

  let errorRate = Number(failed.value);
  if (!Number.isFinite(errorRate)) {
    const total = (Number(failed.passes) || 0) + (Number(failed.fails) || 0);
    errorRate = total ? (Number(failed.passes) || 0) / total : NaN;
  }

  const endpoints = Object.keys(metrics)
    .map((key) => {
      const match = key.match(/^http_req_duration\{endpoint:(.+)\}$/);
      if (!match) return null;
      return { name: match[1], data: metrics[key] };
    })
    .filter(Boolean);

  const resourcesFile = path.join(RESULTS_DIR, `${base}-resources.csv`);
  const resources = fs.existsSync(resourcesFile)
    ? readResources(resourcesFile)
    : null;

  const checkTotal = (Number(checks.passes) || 0) + (Number(checks.fails) || 0);
  const checkRate = checks.value == null ? (checkTotal ? Number(checks.passes) / checkTotal : NaN) : Number(checks.value);
  // Legacy --summary-export booleans mean "failed"; handleSummary uses {ok}.
  const thresholds = Object.values(metrics).flatMap(metric => Object.values(metric.thresholds || {}));
  let status = thresholds.length ? thresholds.every(result => typeof result === 'boolean' ? !result : result.ok === true) : null;
  const executionFile = path.join(RESULTS_DIR, 'execution.json');
  if (fs.existsSync(executionFile)) {
    const execution = JSON.parse(fs.readFileSync(executionFile, 'utf8'));
    const run = (execution.runs || []).find(run => run.name === base);
    if (run && run.exitCode !== 0) status = false;
  }

  return {
    base,
    label: LABELS[base] || base,
    file,
    date: fs.statSync(file).mtime,
    requests: Number(reqs.count) || 0,
    rps: Number(reqs.rate) || 0,
    iterations: Number(iterations.count) || 0,
    errorRate: Number.isFinite(errorRate) ? errorRate : null,
    checkRate: Number.isFinite(checkRate) ? checkRate : null,
    duration,
    endpoints,
    vus: Number(vus.max) || Number(vus.value) || 0,
    resources,
    status,
  };
}

function readResources(file) {
  const lines = fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean);
  if (lines.length < 2) return null;
  const header = lines[0].replace(/^\uFEFF/, '').split(',');
  const rows = lines.slice(1).map((line) => line.split(','));

  const stats = {};
  header.slice(1).forEach((column, index) => {
    const values = rows
      .map((row) => row[index + 1]?.trim() ? Number(row[index + 1]) : NaN)
      .filter((value) => Number.isFinite(value));
    if (!values.length) return;
    stats[column] = {
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      max: Math.max(...values),
    };
  });
  return stats;
}

function kpi(label, value, hint) {
  return `
    <div class="kpi">
      <span class="kpi-label">${esc(label)}</span>
      <strong>${esc(value)}</strong>
      ${hint ? `<span class="kpi-hint">${esc(hint)}</span>` : ''}
    </div>`;
}

function scenarioCard(run) {
  const errorPct = run.errorRate == null ? null : run.errorRate * 100;
  const badge = run.status === null
    ? '<span class="badge warn">Sin umbrales evaluados</span>'
    : run.status
    ? '<span class="badge ok">Dentro de umbral</span>'
    : '<span class="badge warn">Revisar</span>';

  const endpointRows = run.endpoints
    .map(
      (endpoint) => `
      <tr>
        <td><code>${esc(endpoint.name)}</code></td>
        <td>${ms(endpoint.data.avg)}</td>
        <td>${ms(endpoint.data['p(90)'])}</td>
        <td class="strong">${ms(endpoint.data['p(95)'])}</td>
        <td>${ms(endpoint.data['p(99)'])}</td>
        <td>${ms(endpoint.data.max)}</td>
      </tr>`
    )
    .join('');

  let resourceBlock = '';
  if (run.resources) {
    const r = run.resources;
    const cards = [
      ['CPU API (prom.)', r.app_cpu_pct && `${num(r.app_cpu_pct.avg, 1)} %`],
      ['CPU API (máx.)', r.app_cpu_pct && `${num(r.app_cpu_pct.max, 1)} %`],
      ['RAM API (prom.)', r.app_rss_mb && `${num(r.app_rss_mb.avg, 1)} MB`],
      ['RAM API (máx.)', r.app_rss_mb && `${num(r.app_rss_mb.max, 1)} MB`],
      ['CPU PostgreSQL (máx.)', r.db_cpu_pct && `${num(r.db_cpu_pct.max, 1)} %`],
      ['RAM PostgreSQL (máx.)', r.db_mem_mb && `${num(r.db_mem_mb.max, 1)} MB`],
    ].filter(([, value]) => value);

    if (cards.length) {
      resourceBlock = `
      <h3>Recursos</h3>
      <div class="kpis resources">
        ${cards.map(([label, value]) => kpi(label, value)).join('')}
      </div>`;
    }
  }

  return `
  <section class="card">
    <header class="card-head">
      <div>
        <h2>${esc(run.label)}</h2>
        <p class="muted">${esc(run.base)} · ${esc(run.date.toLocaleString('es-BO'))}</p>
      </div>
      ${badge}
    </header>

    <div class="kpis">
      ${kpi('Solicitudes', run.requests.toLocaleString('es-BO'))}
      ${kpi('Rendimiento', `${num(run.rps, 1)} req/s`)}
      ${kpi('Errores HTTP', errorPct == null ? '—' : `${num(errorPct, 2)} %`)}
      ${kpi('Checks OK', run.checkRate == null ? '—' : `${num(run.checkRate * 100, 1)} %`)}
      ${kpi('p95', ms(run.duration['p(95)']))}
      ${kpi('p99', ms(run.duration['p(99)']))}
      ${kpi('Máximo', ms(run.duration.max))}
      ${kpi('VUs máx.', run.vus || '—')}
    </div>

    ${
      run.endpoints.length
        ? `<h3>Detalle por endpoint</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Endpoint</th><th>Promedio</th><th>p90</th>
              <th>p95</th><th>p99</th><th>Máximo</th>
            </tr>
          </thead>
          <tbody>${endpointRows}</tbody>
        </table>
      </div>`
        : ''
    }
    ${resourceBlock}
  </section>`;
}

function gatlingReports() {
  const dir = path.resolve(__dirname, '..', 'gatling', 'target', 'gatling');
  if (!fs.existsSync(dir)) return '';
  const reports = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const index = path.join(dir, entry.name, 'index.html');
      return fs.existsSync(index)
        ? { name: entry.name, index, date: fs.statSync(index).mtime }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.date - a.date);

  if (!reports.length) return '';

  const items = reports
    .map((report) => {
      const href = path
        .relative(path.dirname(OUT_FILE), report.index)
        .split(path.sep)
        .join('/');
      return `<li><a href="${esc(href)}">${esc(report.name)}</a>
        <span class="muted">${esc(report.date.toLocaleString('es-BO'))}</span></li>`;
    })
    .join('');

  return `
  <section class="card">
    <h2>Reportes de Gatling</h2>
    <p class="muted">Reportes HTML nativos generados por Gatling.</p>
    <ul class="reports">${items}</ul>
  </section>`;
}

function main() {
  if (!fs.existsSync(RESULTS_DIR)) {
    console.error(`No existe el directorio de resultados: ${RESULTS_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(RESULTS_DIR)
    .filter((file) => file.endsWith('-summary.json'))
    .map((file) => path.join(RESULTS_DIR, file))
    .sort((a, b) => fs.statSync(b).mtime - fs.statSync(a).mtime);

  if (!files.length) {
    console.error(
      'No se encontraron archivos *-summary.json. Ejecuta un escenario k6 primero.'
    );
    process.exit(1);
  }

  const runs = files.map(readSummary);
  const totalRequests = runs.reduce((sum, run) => sum + run.requests, 0);
  const allOk = runs.every((run) => run.status);

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reporte de rendimiento · eowyn-library</title>
<style>
  :root {
    --bg: #0b1020;
    --panel: #141b2e;
    --panel-2: #1b243b;
    --text: #e8ecf7;
    --muted: #94a0ba;
    --line: #263149;
    --accent: #6ea8fe;
    --ok: #34d399;
    --warn: #fbbf24;
    --bad: #f87171;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px;
    background: radial-gradient(1200px 600px at 20% -10%, #1b2a4d 0%, var(--bg) 55%);
    color: var(--text);
    font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
  }
  .wrap { max-width: 1150px; margin: 0 auto; }
  h1 { margin: 0 0 4px; font-size: 30px; letter-spacing: -0.02em; }
  h2 { margin: 0; font-size: 19px; letter-spacing: -0.01em; }
  h3 { margin: 22px 0 10px; font-size: 13px; text-transform: uppercase;
       letter-spacing: 0.08em; color: var(--muted); font-weight: 600; }
  .lead { color: var(--muted); margin: 0 0 22px; }
  .summary {
    display: flex; flex-wrap: wrap; gap: 14px; align-items: center;
    margin: 22px 0 26px;
  }
  .pill {
    padding: 7px 12px; border-radius: 999px; font-size: 13px;
    background: var(--panel-2); border: 1px solid var(--line);
  }
  .pill strong { color: var(--accent); }
  .card {
    background: linear-gradient(180deg, var(--panel) 0%, #111829 100%);
    border: 1px solid var(--line); border-radius: 16px;
    padding: 22px; margin-bottom: 20px;
    box-shadow: 0 12px 30px rgba(0,0,0,0.18);
  }
  .card-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
  .card-head p { margin: 4px 0 0; font-size: 12px; }
  .badge { padding: 6px 10px; border-radius: 8px; font-size: 12px; font-weight: 700; white-space: nowrap; }
  .badge.ok { background: rgba(52,211,153,.12); color: var(--ok); border: 1px solid rgba(52,211,153,.35); }
  .badge.warn { background: rgba(251,191,36,.12); color: var(--warn); border: 1px solid rgba(251,191,36,.35); }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-top: 18px; }
  .kpi { background: var(--panel-2); border: 1px solid var(--line); border-radius: 11px; padding: 11px 13px; }
  .kpi-label { display: block; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
  .kpi strong { display: block; margin-top: 3px; font-size: 19px; font-variant-numeric: tabular-nums; }
  .kpi-hint { color: var(--muted); font-size: 11px; }
  .resources { grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
  .table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 10px 12px; text-align: right; border-bottom: 1px solid var(--line); }
  th:first-child, td:first-child { text-align: left; }
  thead th { background: var(--panel-2); color: var(--muted); font-size: 11px;
             text-transform: uppercase; letter-spacing: .06em; }
  tbody tr:last-child td { border-bottom: 0; }
  td.strong { color: var(--accent); font-weight: 700; }
  code { background: rgba(110,168,254,.10); color: #b9d2ff; padding: 2px 6px; border-radius: 6px; font-size: 12px; }
  .muted { color: var(--muted); }
  .reports { margin: 14px 0 0; padding: 0; list-style: none; }
  .reports li { padding: 10px 0; border-bottom: 1px solid var(--line); display: flex;
                justify-content: space-between; gap: 12px; }
  .reports li:last-child { border-bottom: 0; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  footer { color: var(--muted); font-size: 12px; margin: 28px 0 8px; }
  @media (max-width: 640px) { body { padding: 18px; } h1 { font-size: 24px; } }
</style>
</head>
<body>
<div class="wrap">
  <h1>Reporte de rendimiento</h1>
  <p class="lead">eowyn-library · API Express + PostgreSQL · entorno local de QA</p>

  <div class="summary">
    <span class="pill">Escenarios: <strong>${runs.length}</strong></span>
    <span class="pill">Solicitudes: <strong>${totalRequests.toLocaleString('es-BO')}</strong></span>
    <span class="pill">Estado global:
      <strong style="color:${allOk ? 'var(--ok)' : 'var(--warn)'}">
        ${allOk ? 'Dentro de umbral' : 'Revisar'}
      </strong>
    </span>
    <span class="pill">Generado: <strong>${new Date().toLocaleString('es-BO')}</strong></span>
  </div>

  ${runs.map(scenarioCard).join('')}
  ${gatlingReports()}

  <footer>
    p95/p99: percentil de tiempo de respuesta. El estado usa los umbrales reales de cada escenario.
    Los errores HTTP excluyen los estados esperados declarados en las pruebas (por ejemplo, 401 o rechazos de negocio).
    Los recursos se muestrean con <code>performance/scripts/monitor.ps1</code> en Windows.
    Comando: <code>npm run perf:report</code>.
  </footer>
</div>
</body>
</html>`;

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, html);
  console.log(`Reporte generado: ${path.relative(process.cwd(), OUT_FILE)}`);
  console.log(`Escenarios incluidos: ${runs.length}`);
}

main();
