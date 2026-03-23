const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const tempRoot = path.join(projectRoot, '.electron-dev');
const sessionDir = path.join(tempRoot, `${Date.now()}-${process.pid}`);
const mainEntry = path.join(sessionDir, 'main.js');
const packageEntry = path.join(sessionDir, 'package.json');
const tscBin = require.resolve('typescript/bin/tsc');
const electronBin = require('electron');
const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5180';

fs.mkdirSync(sessionDir, { recursive: true });
fs.writeFileSync(
  packageEntry,
  JSON.stringify(
    {
      name: 'natively',
      productName: 'Natively',
      version: '0.0.0-dev',
      main: 'main.js',
    },
    null,
    2
  )
);

const compile = spawnSync(
  process.execPath,
  [tscBin, '-p', 'electron/tsconfig.json', '--outDir', sessionDir],
  {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env,
  }
);

if (compile.status !== 0) {
  process.exit(compile.status || 1);
}

const child = spawn(
  electronBin,
  [sessionDir],
  {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      VITE_DEV_SERVER_URL: devServerUrl,
      NATIVELY_USER_DATA_NAME: 'natively',
    },
  }
);

const forwardSignal = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on('SIGINT', () => forwardSignal('SIGINT'));
process.on('SIGTERM', () => forwardSignal('SIGTERM'));

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code || 0);
});
