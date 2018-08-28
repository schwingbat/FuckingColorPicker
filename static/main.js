const tinycolor = require('tinycolor2');
const { desktopCapturer } = require('electron');
const fs = require('fs');
const path = require('path');
const open = require('open');

let DEBUG = process.env.DEBUG || false;
let options = {
    hexHash: true,
    colorStyle: 'css',
    rgbScale: 'int255'
}

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

    optionsMenu: document.querySelector('#options-menu'),
    optionsForm: document.querySelector('#options-form'),
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

// Apply options
(function() {
    try {
        options = JSON.parse( localStorage.getItem('options') );
        let activeColor = localStorage.getItem('swatches');
        if (activeColor) {
            activeColor = activeColor.split(' ').pop();
        } else {
            activeColor = '#000000';
        }
        setActiveColor( tinycolor(activeColor) );
        applyOptions(options);
    } catch (err) {
        console.warn('Unable to load settings', err);
    }
})();

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

function fmt(color) {
    const colors = {};

    options = options || {};

    let rgb = color.toRgb();
    let hex = color.toHexString();
    let hsl = color.toHsl();

    switch (options.rgbStyle) {
    case 'float':
        colors.rgb = (rgb.r / 255).toFixed(3) + ', ' + (rgb.g / 255).toFixed(3) + ', ' +(rgb.b / 255).toFixed(3);
        break;
    case 'color32':
        colors.rgb = Math.round(rgb.r) + ', ' + Math.round(rgb.g) + ', ' + Math.round(rgb.b);
        break;
    case 'css': // Default
    default:
        colors.rgb = color.toRgbString();
        break;
    }

    colors.hsl = color.toHslString();
    colors.hex = options.hexHash ? hex : hex.slice(1);

    return colors;
}

function setActiveColor(color) {
    requestAnimationFrame(() => {
        document.body.style.setProperty('--active', color.toHexString());
        document.body.style.setProperty('--active-text', color.isDark() ? '#eee' : '#222');

        let col = fmt(color);

        c.log(c);

        el.HEX.textContent = col.hex;
        el.RGB.textContent = col.rgb;
        el.HSL.textContent = col.hsl;
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

        if (grid.children.length >= 12) {
            grid.classList.add('full');
        } else {
            grid.classList.remove('full');
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

function readOptions() {
    const form = el.optionsForm;

    return {
        hexHash: !!form.elements['hexHash'].checked,
        showOrbit: !!form.elements['showOrbit'].checked,
        rgbStyle: form.elements['rgbStyle'].value,
    }
}

function applyOptions(options) {
    const form = el.optionsForm;

    if (options.hexHash) {
        form.elements['hexHash'].setAttribute('checked', 'checked');
    } else {
        form.elements['hexHash'].removeAttribute('checked');
    }

    if (options.showOrbit) {
        form.elements['showOrbit'].setAttribute('checked', 'checked');
    } else {
        form.elements['showOrbit'].removeAttribute('checked');
    }

    form.elements['rgbStyle'].value = options.rgbStyle || 'css';

    document.querySelector('#orbit-open').classList[ options.showOrbit ? 'remove' : 'add' ]('disabled');
}

/*
    Events
*/

el.optionsMenu.addEventListener('submit', e => {
    e.preventDefault();
    options = readOptions();
    c.log(options);

    // Refresh to update color labels.
    setActiveColor( tinycolor(getCenterPixel()) );
    applyOptions(options);

    localStorage.setItem('options', JSON.stringify(options));

    el.optionsMenu.classList.add('disabled');
});

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
    } else if (e.target.id === 'orbit-open') {
        try {
            let hex = document.querySelector('#hex').textContent;
            if (hex[0] !== '#') { hex = '#' + hex; }
            open(`https://orbit.tonymccoy.me/${ hex }`);
        } catch (err) {
            e.error(err);
            notify(`Well... that didn't work.`)
        }
    } else if (e.target.id === 'options-open') {
        el.optionsMenu.classList.remove('disabled');
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