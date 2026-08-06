const CHROME = '/snap/bin/chromium';
const PORT = 9226;
const APP_URL = 'http://127.0.0.1:4173';
const { spawn } = require('child_process');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getJson(path) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`);
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json();
}

async function openPage() {
  await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(APP_URL)}`, { method: 'PUT' })
    .catch(() => fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(APP_URL)}`));
  const pages = await getJson('/json');
  const page = pages.find(p => p.type === 'page' && p.url.includes('127.0.0.1:4173')) || pages[0];
  if (!page?.webSocketDebuggerUrl) throw new Error('No debuggable page found');
  return page.webSocketDebuggerUrl;
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let id = 0;
  const pending = new Map();

  ws.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  };

  const send = (method, params = {}) => {
    const msgId = ++id;
    ws.send(JSON.stringify({ id: msgId, method, params }));
    return new Promise((resolve, reject) => pending.set(msgId, { resolve, reject }));
  };

  return { ws, send };
}

async function waitFor(send, expression, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result?.result?.value) return true;
    await sleep(250);
  }
  throw new Error(`Timeout waiting for: ${expression}`);
}

(async () => {
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=/tmp/kelani-open-ended-append-${Date.now()}`,
    APP_URL,
  ], { stdio: 'ignore' });

  try {
    await sleep(1500);
    const { ws, send } = await connect(await openPage());

    await send('Runtime.enable');
    await waitFor(send, `typeof window.__kelaniSmartResetToW1 === 'function'`);
    await send('Runtime.evaluate', {
      expression: `window.__kelaniSmartResetToW1()`,
      returnByValue: true,
      awaitPromise: true,
    });

    await sleep(2500);

    await send('Runtime.evaluate', {
      expression: `(() => {
        const key = 'kel-powerlifting-user-data-v1';
        const data = JSON.parse(localStorage.getItem(key) || '{}');

        data.trainingModel = 'smart';
        data.currentCycle = 2;
        data.inProgress = data.inProgress || {};
        data.inProgress.currentCycle = 2;
        data.inProgress.currentIndex = 28;
        data.inProgress.selectedIndex = 28;
        data.inProgress.workouts = (data.inProgress.workouts || []).slice(0, 28);

        localStorage.setItem('trainingModel', 'smart');
        localStorage.setItem(key, JSON.stringify(data));
        window.location.reload();
        return true;
      })()`,
      returnByValue: true,
      awaitPromise: true,
    });

    await sleep(3000);

    let result = null;
    for (let i = 0; i < 40; i += 1) {
      const out = await send('Runtime.evaluate', {
        expression: `(() => {
          const key = 'kel-powerlifting-user-data-v1';
          const data = JSON.parse(localStorage.getItem(key) || '{}');
          const workouts = data.inProgress?.workouts || [];
          const w29 = workouts[28] || null;
          return {
            currentIndex: data.inProgress?.currentIndex,
            selectedIndex: data.inProgress?.selectedIndex,
            workoutCount: workouts.length,
            workout29: w29 ? {
              number: w29.number,
              type: w29.type,
              smartDayType: w29.smartDayType,
              smartVisible: w29.smartVisible,
              smartSelectable: w29.smartSelectable,
              completed: w29.completed,
            } : null,
          };
        })()`,
        returnByValue: true,
        awaitPromise: true,
      });

      result = out.result.value;
      if (result.workoutCount >= 29 && result.workout29) break;
      await sleep(250);
    }

    console.log(JSON.stringify(result, null, 2));
    ws.close();
  } finally {
    chrome.kill('SIGTERM');
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
