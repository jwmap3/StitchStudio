// Stitch Studio desktop: a window around web/pc.html (the shared editor + PC shell)
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1500, height: 920, minWidth: 1000, minHeight: 640,
    backgroundColor: '#14161b', title: 'Stitch Studio', autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, spellcheck: false },
  });
  win.removeMenu();
  win.maximize();
  win.loadFile(path.join(__dirname, 'web', 'pc.html'));
  // worksheet opens in its own window; outside links open in the browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank' || url === '') return { action: 'allow', overrideBrowserWindowOptions: { width: 1000, height: 1100, autoHideMenuBar: true } };
    shell.openExternal(url); return { action: 'deny' };
  });
  // exports: always ask where to save
  win.webContents.session.on('will-download', (e, item) => { item.setSaveDialogOptions({ title: 'Save ' + item.getFilename(), defaultPath: item.getFilename() }); });
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
