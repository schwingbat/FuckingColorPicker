const tinycolor = require('tinycolor2');
const screenshot = require('user-media-screenshot');
const { desktopCapturer } = require('electron');
const fs = require('fs');
const path = require('path');

let DEBUG = process.env.DEBUG || false;

const c = {
    log(...messages) { if (DEBUG) console.log(...messages); },
    warn(...messages) { if (DEBUG) console.warn(...messages); },
    error(...messages) { if (DEBUG) console.error(...messages); }
}

const el = {
    app: document.querySelector('#app'),
    loader: document.querySelector('#loader'),

    pickButton: document.querySelector('#pick-button'),
    previewCanvas: document.querySelector('#color-preview'),
    cacheCanvas: document.createElement('canvas'),
    pointCanvas: document.createElement('canvas'),
    renderer: document.querySelector('#screenshot-renderer'),

    RGB: document.querySelector('#rgb'),
    HSL: document.querySelector('#hsl'),
    HEX: document.querySelector('#hex'),

    notif: document.querySelector('#notif'),
    textArea: document.querySelector('#secret-copy-thing'),

    swatchGrid: document.querySelector('#swatch-grid'),
};

// Load swatches from localStorage.
try {
    let sw = localStorage.getItem('swatches').split(' ');
    c.log('loading', sw);
    for (let i = 0; i < sw.length; i++) {
        addSwatch( tinycolor(sw[i]) );
    }
} catch (err) {
    c.error(err);
}

const preview = el.previewCanvas.getContext('2d');
const cache = el.cacheCanvas.getContext('2d');
const point = el.pointCanvas.getContext('2d');

// document.body.appendChild(el.pointCanvas);

el.pointCanvas.width = 1;
el.pointCanvas.height = 1;

desktopCapturer.getSources({ types: ['screen'] }, (err, sources) => {
    if (err) throw err;

    for (let i = 0; i < sources.length; i++) {
        if (sources[i].name === 'Entire screen') {
            navigator.webkitGetUserMedia({
                audio: false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: sources[i].id,
                        minWidth: screen.width,
                        minHeight: screen.height,
                        maxWidth: screen.width,
                        maxHeight: screen.height,
                    }
                }
            }, handleStreamLoad, handleStreamError);
        }
    }
    
    return;
});

// Load loading messages
(function() {
    let messages = fs.readFileSync(path.join(__dirname, 'loadmessages.txt'), 'utf-8').split('\n');
    let msg = messages[ Math.trunc(Math.random() * messages.length) ] || 'Loading';

    el.loader.querySelector('#loader-message').textContent = msg;
})();

let loadDots = document.querySelectorAll('#loader-dots span');
let loadDotIndex = loadDots.length;
let loadAnimInterval = setInterval(() => {
    if (loadDotIndex >= loadDots.length) {
        loadDots.forEach(d => {
            d.style.visibility = 'hidden';
        });
        loadDotIndex = 0;
        return;
    }

    c.log(loadDotIndex, loadDots);
    loadDots[loadDotIndex].style.visibility = 'visible';
    loadDotIndex++;
}, 300);

function handleStreamLoad(stream) {
    el.renderer.src = URL.createObjectURL(stream);
    //setInterval(() => c.log(el.renderer.readyState),100);
    let loadInterval = setInterval(() => {
        if (el.renderer.readyState === 4) {
            c.log('Video stream loaded!');

            // Do stuff.

            el.app.classList.remove('disabled');
            el.loader.classList.add('disabled');
            clearInterval(loadAnimInterval);
            clearInterval(loadInterval);
        }
    }, 100);
}

function handleStreamError(err) {
    c.error(err);
}

const sliceSize = 17; // pixels
const tileSize = 160;
const mouse = {
    x: 0,
    y: 0,
};

el.previewCanvas.width = sliceSize;
el.previewCanvas.height = sliceSize;
el.previewCanvas.imageSmoothingEnabled = false;

let dragging = false;
let mouseOutsideWindow = false;

let lastClick = 0;
let doubleClickTimeout = 300;

function crosshair() {
    const halfSlice = sliceSize / 2;

    // Draw crosshair
    preview.strokeStyle = 'rgba(255, 255, 255, 0.5)';

    preview.beginPath();
    preview.moveTo(halfSlice, 0);
    preview.lineTo(halfSlice, halfSlice - 1);
    preview.moveTo(halfSlice, halfSlice + 1);
    preview.lineTo(halfSlice, sliceSize);
    preview.moveTo(0, halfSlice);
    preview.lineTo(halfSlice - 1, halfSlice);
    preview.moveTo(halfSlice + 1, halfSlice);
    preview.lineTo(sliceSize, halfSlice);
    preview.stroke();
}

crosshair();

function paintSolid(color) {
    preview.fillStyle = color;
    preview.fillRect(0, 0, tileSize, tileSize);
}

// Render to canvas
(function loop() {
    if (dragging) {
        const halfSlice = sliceSize / 2;

        const mouseRect = {
            t: mouse.y - halfSlice,
            r: mouse.x + sliceSize,
            b: mouse.y + halfSlice,
            l: mouse.x
        };

        preview.drawImage(
            el.renderer,
            mouseRect.l,
            mouseRect.t,
            sliceSize,
            sliceSize,
            0,
            0,
            sliceSize,
            sliceSize
        );

        setActiveColor( tinycolor(getCenterPixel()) );

        // Draw crosshair
        crosshair();
    }
    requestAnimationFrame(loop);
})();

function getCenterPixel() {
    let img = preview.getImageData(0, 0, tileSize, tileSize);
    point.putImageData(img, sliceSize * -0.5, sliceSize * -0.5);

    let p = point.getImageData(0, 0, 1, 1);
    
    return {
        r: p.data[0],
        g: p.data[1],
        b: p.data[2],
        a: p.data[3]
    };
}

function setActiveColor(color) {
    requestAnimationFrame(() => {
        document.body.style.setProperty('--active', color.toHexString());
        document.body.style.setProperty('--active-text', color.isDark() ? '#eee' : '#222');

        el.HEX.textContent = color.toHexString();
        el.RGB.textContent = color.toRgbString();
        el.HSL.textContent = color.toHslString();
    });
}

function addSwatch(color) {
    let grid = el.swatchGrid;

    requestAnimationFrame(() => {
        c.log('Adding swatch to', grid);

        let elem = document.createElement('article');
        elem.classList.add('swatch');
        elem.setAttribute('data-color', color.toHexString());
        elem.style.backgroundColor = color.toHexString();
        grid.insertBefore(elem, grid.children[0]);

        let children = grid.querySelectorAll('article[data-color]');

        while (grid.children.length > 12) {
            grid.removeChild(grid.lastChild);
        }

        try {
            let sw = '';
            for (let i = 0; i < children.length; i++) {
                sw += children[i].getAttribute('data-color');

                if (i + 1 < children.length) {
                    sw += ' ';
                }
            }
            c.log('saving', sw);
            localStorage.setItem('swatches', sw);
        } catch (err) {}
    });
}

let clear;

function notify(message) {
    el.notif.textContent = message;

    if (clear) {
        clearTimeout(clear);
    }

    clear = setTimeout(() => {
        el.notif.textContent = '';
    }, 5000);
}

/*
    Events
*/

window.addEventListener('resize', () => {
    c.log(`${window.innerWidth}*${window.innerHeight}`);
});

window.addEventListener('mousedown', e => {
    if (e.target.classList.contains('copy-button')) {
        let kind = e.target.parentNode.parentNode.querySelector('.label').textContent;
        let val = e.target.parentNode.parentNode.querySelector('.color').textContent;
        
        el.textArea.value = val;
        el.textArea.select();
        document.execCommand('copy');

        notify(`${ kind } value copied...`);
    }
});

window.addEventListener('mousemove', e => {
    mouse.x = e.screenX;
    mouse.y = e.screenY;

    if (!dragging) return false;

    // Do it in the loop.
    //setActiveColor( tinycolor(getCenterPixel()) );
});

window.addEventListener('mouseout', e => {
    c.log('Mouse left window');
    mouseOutsideWindow = true;
});

el.pickButton.addEventListener('mousedown', e => {
    e.preventDefault();
    dragging = true;
    c.log('Mousedown');
});

el.swatchGrid.addEventListener('mousedown', e => {
    if (e.target.classList.contains('swatch')) {
        let c = tinycolor(e.target.getAttribute('data-color'))
        setActiveColor(c);
        paintSolid(c.toHexString());
    }
});

window.addEventListener('mouseup', e => {
    mouse.x = e.screenX;
    mouse.y = e.screenY;
    
    if (dragging) {
        //setActiveColor( tinycolor(getCenterPixel()) );
        let color = tinycolor(getCenterPixel());
        addSwatch(color);
        paintSolid(color.toHexString());
        //setActiveColor(color);
    }

    if (mouseOutsideWindow) {
        e.preventDefault();
        mouseOutsideWindow = false;
    }

    dragging = false;
});

window.addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && e.altKey && e.key === 'I') {
        require('remote').getCurrentWindow().toggleDevTools();
    }
});