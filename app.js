const { app, BrowserWindow } = require('electron');
const path = require('path');
const url = require('url');
const fs = require('fs');

const DEBUG = process.env.DEBUG || process.argv.includes('--debug') || process.argv.includes('-d') || false;

// Keep a global reference of the window object, so it doesn't get
// garbage collected.
let win;

function createWindow() {
    let state;

    try {
        state = JSON.parse(fs.readFileSync(path.join(__dirname, 'window-state'), 'utf-8'));
    } catch (err) {
        state = {};
    }

    let width = 370;
    let height = 230;

    if (state.width) {
        width = state.width;
    }

    if (state.height) {
        height = state.height;
    }

    win = new BrowserWindow({
        x: state.x,
        y: state.y,
        width: width,
        height: height,
        icon: path.join(__dirname, 'static', 'logo.png'),
        title: 'Fucking Color Picker',
        backgroundColor: '#222222',
        show: false,
    });

    win.setMenu(null);
    win.loadURL(url.format({
        pathname: path.join(__dirname, 'static/index.html'),
        protocol: 'file:',
        slashes: true
    }));

    if (DEBUG) win.webContents.openDevTools();

    win.on('close', (e) => {
        // Save window state to restore from next time.
        fs.writeFile('window-state', JSON.stringify(win.getBounds()), (err) => {
            if (err) { console.log(err); }
        });
    });

    win.on('closed', (w) => {
        win = null;
    });

    win.once('ready-to-show', () => {
        win.show();
    });
}

app.on('ready', createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (win === null) {
        createWindow();
    }
});