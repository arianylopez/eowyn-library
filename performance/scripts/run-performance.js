'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const root = path.resolve(__dirname, '../..');
const tool = process.argv[2];
const requested = process.argv[3] || (tool === 'k6' ? '00-smoke' : 'SmokeSimulation');
const k6Scenarios = fs.readdirSync(path.join(root, 'performance/k6/scenarios')).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3));
const simulations = ['SmokeSimulation', 'AuthLoadSimulation', 'CatalogLoadSimulation', 'MixedLoadSimulation', 'LoanCycleSimulation'];
if (!['k6', 'gatling'].includes(tool) || !(tool === 'k6' ? [...k6Scenarios, 'all'] : [...simulations, 'all']).includes(requested)) {
  console.error('Uso: npm run perf:k6 -- <escenario|all> / npm run perf:gatling -- <Simulation|all>');
  process.exit(1);
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.join(root, 'performance/results', stamp, tool);
fs.mkdirSync(output, { recursive: true });
const queue = requested === 'all' ? (tool === 'k6' ? k6Scenarios : simulations) : [requested];
const executable = tool === 'k6' ? 'k6' : (process.platform === 'win32' ? 'mvn.cmd' : 'mvn');
const version = spawnSync(executable, ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' && tool === 'gatling', timeout: 15000 });
if (version.error || version.status !== 0) {
  console.error(`No se pudo ejecutar ${executable}. Comprueba su instalación y PATH.`, version.error?.message || version.stderr);
  process.exit(1);
}
const metadata = { tool, startedAt: new Date().toISOString(), baseUrl: process.env.BASE_URL || 'http://localhost:3000', node: process.version, toolVersion: version.stdout, host: { os: `${os.type()} ${os.release()}`, cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, totalMemoryGB: os.totalmem() / 1024 ** 3 }, runs: [] };
console.log(`Evidencias: ${output}`);

async function run(name) {
  const summary = path.join(output, `${name}-summary.json`);
  const args = tool === 'k6'
    ? ['run', '--summary-export', summary, '--summary-trend-stats', 'avg,min,med,max,p(90),p(95),p(99)', '--out', `json=${path.join(output, `${name}-timeseries.json`)}`, path.join(root, 'performance/k6/scenarios', `${name}.js`)]
    : ['-B', 'gatling:test', `-Dgatling.simulationClass=eowyn.perf.${name}`];
  const startedAt = new Date().toISOString();
  const log = fs.createWriteStream(path.join(output, `${name}.log`));
  // Maven receives only fixed, validated arguments when Windows needs cmd.exe.
  const child = spawn(executable, args, { cwd: tool === 'k6' ? root : path.join(root, 'performance/gatling'), shell: tool === 'gatling' && process.platform === 'win32', env: process.env });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { process.stdout.write(chunk); log.write(chunk); });
  let monitor;
  if (process.platform === 'win32' && child.pid) {
    monitor = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'monitor.ps1'), '-OutFile', path.join(output, `${name}-resources.csv`), '-UntilProcessId', String(child.pid), '-ApiPort', String(new URL(metadata.baseUrl).port || 80)], { windowsHide: true, stdio: 'inherit' });
    monitor.on('error', error => console.warn(`Monitoreo no disponible: ${error.message}`));
  }
  const code = await new Promise(resolve => {
    child.on('error', error => { console.error(error.message); resolve(1); });
    child.on('close', exitCode => resolve(exitCode ?? 1));
  });
  log.end();
  if (monitor && monitor.exitCode === null) await new Promise(resolve => monitor.once('close', resolve));
  metadata.runs.push({ name, startedAt, finishedAt: new Date().toISOString(), exitCode: code });
  fs.writeFileSync(path.join(output, 'execution.json'), JSON.stringify(metadata, null, 2));
  return code;
}
(async () => {
  let failed = false;
  for (const name of queue) {
    const code = await run(name);
    if (code !== 0) failed = true;
    // Smoke is a prerequisite. Preserve failing evidence and stop this suite.
    if (code !== 0 && /smoke/i.test(name)) break;
  }
  if (tool === 'k6' && fs.readdirSync(output).some(f => f.endsWith('-summary.json'))) {
    spawnSync(process.execPath, [path.join(__dirname, 'generate-report.js'), output, path.join(output, 'report.html')], { stdio: 'inherit' });
  }
  console.log(`Evidencias guardadas en ${output}`);
  process.exitCode = failed ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
