const path = require('path');
const { spawn } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const npmCmd = 'npm';
const port = Number(process.env.VITE_DEV_SERVER_PORT || 5180);
const devServerUrl = process.env.VITE_DEV_SERVER_URL || `http://localhost:${port}`;

let rendererProcess = null;
let electronProcess = null;
let startedRendererLocally = false;
let isShuttingDown = false;

function log(message) {
  process.stdout.write(`${message}\n`);
}

function logError(message) {
  process.stderr.write(`${message}\n`);
}

function quoteForCmd(value) {
  const text = String(value);
  if (!/[ \t"&()^[\]]/.test(text)) {
    return text;
  }

  return `"${text.replace(/(["^])/g, '^$1')}"`;
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

function looksLikeProjectVite(payload) {
  return payload.includes('/@vite/client') && payload.includes('/src/main');
}

async function inspectRendererServer() {
  try {
    const response = await fetchWithTimeout(devServerUrl, 1500);
    const body = await response.text();

    if (response.ok && looksLikeProjectVite(body)) {
      return { kind: 'project-vite' };
    }

    return {
      kind: 'unexpected-service',
      status: response.status,
      bodyPreview: body.slice(0, 180),
    };
  } catch (error) {
    const message = error && typeof error === 'object' && 'message' in error
      ? String(error.message)
      : String(error);

    if (
      message.includes('ECONNREFUSED') ||
      message.includes('fetch failed') ||
      message.includes('connect ECONNREFUSED')
    ) {
      return { kind: 'missing' };
    }

    return {
      kind: 'unreachable',
      error: message,
    };
  }
}

function spawnChild(command, args) {
  if (process.platform === 'win32') {
    const cmd = process.env.ComSpec || 'cmd.exe';
    const commandLine = [command, ...args].map(quoteForCmd).join(' ');

    return spawn(cmd, ['/d', '/s', '/c', commandLine], {
      cwd: projectRoot,
      stdio: 'inherit',
      env: process.env,
      windowsHide: false,
    });
  }

  return spawn(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env,
  });
}

function killChild(child) {
  if (!child || child.killed) {
    return;
  }

  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }

  child.kill('SIGTERM');
}

async function waitForRendererReady(timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const inspection = await inspectRendererServer();
    if (inspection.kind === 'project-vite') {
      return;
    }

    if (inspection.kind === 'unexpected-service') {
      throw new Error(
        `Port ${port} is responding, but it does not look like this project's Vite server (status ${inspection.status}).`
      );
    }

    if (inspection.kind === 'unreachable') {
      throw new Error(`Port ${port} is occupied but not serving a usable dev page: ${inspection.error}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for Vite dev server on ${devServerUrl}.`);
}

function shutdown(code) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  if (electronProcess) {
    killChild(electronProcess);
  }

  if (startedRendererLocally && rendererProcess) {
    killChild(rendererProcess);
  }

  setTimeout(() => process.exit(code), 100);
}

async function main() {
  const existingRenderer = await inspectRendererServer();

  if (existingRenderer.kind === 'project-vite') {
    log(`[app:dev] Reusing existing Vite dev server at ${devServerUrl}`);
  } else if (existingRenderer.kind === 'missing') {
    log(`[app:dev] Starting renderer dev server on ${devServerUrl}`);
    startedRendererLocally = true;
    rendererProcess = spawnChild(npmCmd, ['run', 'dev:renderer']);

    rendererProcess.on('exit', (code) => {
      if (isShuttingDown) {
        return;
      }

      logError(`[app:dev] Renderer dev server exited early with code ${code ?? 0}`);
      shutdown(code ?? 1);
    });

    await waitForRendererReady(30000);
  } else if (existingRenderer.kind === 'unexpected-service') {
    logError(
      `[app:dev] Port ${port} is already in use by something that is not this project's Vite dev server.`
    );
    logError(`[app:dev] Response preview: ${existingRenderer.bodyPreview}`);
    process.exit(1);
  } else {
    logError(`[app:dev] Unable to reuse renderer on ${devServerUrl}: ${existingRenderer.error}`);
    process.exit(1);
  }

  log('[app:dev] Starting Electron');
  electronProcess = spawnChild(npmCmd, ['run', 'electron:dev']);

  electronProcess.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    shutdown(code ?? 0);
  });
}

process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));

main().catch((error) => {
  logError(`[app:dev] ${error instanceof Error ? error.message : String(error)}`);
  shutdown(1);
});
