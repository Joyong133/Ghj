// arena.ai를 브라우저 없이 독립된 창으로 여는 데스크톱 앱
const { app, BrowserWindow, Menu, shell, session, ipcMain, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');

const HOME_URL = 'https://arena.ai/';

// 앱 창 안에서 그대로 여는 도메인 (사이트 자체 + 로그인 화면)
const IN_APP_HOSTS = [
  'arena.ai',
  'lmarena.ai',
  'accounts.google.com',
  'appleid.apple.com',
  'github.com',
  'login.microsoftonline.com',
  'challenges.cloudflare.com',
];

function isInAppUrl(url) {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'https:' && protocol !== 'http:') return false;
    return IN_APP_HOSTS.some((h) => hostname === h || hostname.endsWith('.' + h));
  } catch {
    return false;
  }
}

function openExternal(url) {
  try {
    const { protocol } = new URL(url);
    if (protocol === 'https:' || protocol === 'http:' || protocol === 'mailto:') {
      shell.openExternal(url);
    }
  } catch {
    /* 잘못된 주소는 무시 */
  }
}

// ---- 앱 데이터 저장 (프롬프트, 스르륵 위치, 설정) ----
const dataFile = () => path.join(app.getPath('userData'), 'arena-data.json');
let data = null;
let saveTimer = null;

function loadData() {
  if (data) return data;
  try {
    data = JSON.parse(fs.readFileSync(dataFile(), 'utf8'));
  } catch {
    data = {};
  }
  return data;
}

function saveDataSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDataNow, 300);
}

function saveDataNow() {
  clearTimeout(saveTimer);
  if (!data) return;
  try {
    const tmp = dataFile() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, dataFile());
  } catch {
    /* 저장 실패는 무시 */
  }
}

ipcMain.on('store-get', (event, key) => {
  event.returnValue = loadData()[key] ?? null;
});
ipcMain.on('store-set', (event, key, value) => {
  loadData()[key] = value;
  saveDataSoon();
  event.returnValue = true;
});
ipcMain.on('copy-text', (_event, text) => clipboard.writeText(String(text)));

// ---- 창 크기·위치 기억 ----
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
  } catch {
    return { width: 1280, height: 860 };
  }
}

function saveWindowState(win) {
  try {
    const bounds = win.getNormalBounds();
    fs.writeFileSync(
      stateFile(),
      JSON.stringify({ ...bounds, maximized: win.isMaximized() })
    );
  } catch {
    /* 저장 실패는 무시 */
  }
}

// ---- 메뉴 ----
function buildMenu(getWin) {
  const isMac = process.platform === 'darwin';
  const wc = () => getWin()?.webContents;

  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: '이동',
      submenu: [
        { label: '홈', accelerator: 'CmdOrCtrl+H', click: () => wc()?.loadURL(HOME_URL) },
        {
          label: '뒤로',
          accelerator: isMac ? 'Cmd+[' : 'Alt+Left',
          click: () => wc()?.navigationHistory.canGoBack() && wc().navigationHistory.goBack(),
        },
        {
          label: '앞으로',
          accelerator: isMac ? 'Cmd+]' : 'Alt+Right',
          click: () => wc()?.navigationHistory.canGoForward() && wc().navigationHistory.goForward(),
        },
        { type: 'separator' },
        { label: '새로고침', accelerator: 'CmdOrCtrl+R', click: () => wc()?.reload() },
        { label: '강력 새로고침', accelerator: 'CmdOrCtrl+Shift+R', click: () => wc()?.reloadIgnoringCache() },
        { type: 'separator' },
        { label: '현재 페이지를 브라우저로 열기', click: () => wc() && openExternal(wc().getURL()) },
        ...(isMac ? [] : [{ type: 'separator' }, { label: '종료', role: 'quit' }]),
      ],
    },
    {
      label: '도구',
      submenu: [
        { label: '저장한 프롬프트', accelerator: 'CmdOrCtrl+P', click: () => uiAction('prompts') },
        { label: '답변 분량 정하기', click: () => uiAction('length') },
        { label: '스르륵 (답변 다시 보기)', accelerator: 'CmdOrCtrl+J', click: () => uiAction('srr') },
        { label: '고정 모드', accelerator: 'CmdOrCtrl+L', click: () => uiAction('lock') },
      ],
    },
    {
      label: '편집',
      submenu: [
        { label: '실행 취소', role: 'undo' },
        { label: '다시 실행', role: 'redo' },
        { type: 'separator' },
        { label: '잘라내기', role: 'cut' },
        { label: '복사', role: 'copy' },
        { label: '붙여넣기', role: 'paste' },
        { label: '모두 선택', role: 'selectAll' },
      ],
    },
    {
      label: '보기',
      submenu: [
        { label: '확대', role: 'zoomIn', accelerator: 'CmdOrCtrl+=' },
        { label: '축소', role: 'zoomOut' },
        { label: '원래 크기', role: 'resetZoom' },
        { type: 'separator' },
        { label: '전체 화면', role: 'togglefullscreen' },
        { label: '개발자 도구', role: 'toggleDevTools' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  function uiAction(name) {
    const w = mainWindow;
    if (w) w.webContents.send('ui-action', name);
  }
}

// ---- 창 만들기 ----
let mainWindow = null;

function createWindow() {
  const state = loadWindowState();

  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width || 1280,
    height: state.height || 860,
    minWidth: 400,
    minHeight: 500,
    title: 'Arena',
    backgroundColor: '#ffffff',
    autoHideMenuBar: true, // Alt 키를 누르면 메뉴가 보입니다
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      // preload.js가 arena.ai 위에 앱 기능을 얹음 (페이지와 분리된 공간에서 실행)
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true,
    },
  });

  if (state.maximized) mainWindow.maximize();

  const wc = mainWindow.webContents;

  // 새 창 요청: 로그인 팝업은 앱 안에서, 그 밖의 링크는 기본 브라우저로
  wc.setWindowOpenHandler(({ url }) => {
    if (isInAppUrl(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 720,
          parent: mainWindow,
          autoHideMenuBar: true,
          webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
        },
      };
    }
    openExternal(url);
    return { action: 'deny' };
  });

  // 같은 창에서 다른 사이트로 이동하려 하면 기본 브라우저로 넘김
  wc.on('will-navigate', (event, url) => {
    if (!isInAppUrl(url)) {
      event.preventDefault();
      openExternal(url);
    }
  });

  // 인터넷이 끊겼을 때 안내 화면
  wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 /* 사용자가 취소 */) return;
    mainWindow.loadFile(path.join(__dirname, 'offline.html'), {
      query: { url: url || HOME_URL, reason: desc },
    });
  });

  mainWindow.on('close', () => saveWindowState(mainWindow));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadURL(HOME_URL);
}

// 앱을 두 번 실행하면 이미 열린 창을 앞으로 가져옴
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // 일부 로그인(구글 등)은 Electron 표시가 있는 브라우저를 막으므로 일반 Chrome처럼 보이게 함
    const ua = session.defaultSession
      .getUserAgent()
      .replace(/\s?Electron\/\S+/, '')
      .replace(/\s?arena-app\/\S+/i, '')
      .replace(/\s?Arena\/\S+/, '');
    session.defaultSession.setUserAgent(ua);
    app.userAgentFallback = ua;

    buildMenu(() => BrowserWindow.getFocusedWindow() || mainWindow);
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('before-quit', saveDataNow);

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
