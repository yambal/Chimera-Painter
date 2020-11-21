const CANVAS_SIZE = window.innerWidth > 512 ? 512 : 256;
let pxBrush;
let canvas;
let ctx;

// Active selections.
let currentColor;
let currentBrush;

// Event handlers.
document.querySelector('.palette').addEventListener('click', changeColor);
document.querySelector('.brushes').addEventListener('click', changeBrushSize);
document.querySelector('#btnStyle').addEventListener('click', makeRequest);
document.querySelector('#btnOk').addEventListener('click', () => {
  document.querySelector('.splash').hidden = true;
  document.querySelector('.main-wrapper').hidden = false;
});

init();

function init() {
  // Paint the body part buttons.
  const buttons = document.querySelectorAll('.palette button');
  for (let i = 0; i < buttons.length; i++) {
    const div = document.createElement('div');
    div.classList.add('button-color');
    div.style.background = buttons[i].dataset.color;
    buttons[i].appendChild(div);
  }

  canvas = document.querySelector('canvas');
  pxBrush = new window['pxBrush'](canvas);

  // Make sure we're _not_ using retina, since we're trying to fight
  // antialiasing so hard.
  canvas.width = canvas.height = CANVAS_SIZE;
  ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // Activate pencil, first color.
  buttons[0].click();
  document.querySelector('.tools button.pencil').click();
  document.querySelector('.brushes button.m').click();
  document.querySelector('.presets button').click();
}

function loadPreset(src) {
  const preset = new Image();
  preset.onload = () => {
    ctx.drawImage(preset, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
    makeRequest();
    setUpCanvas(canvas);
  };
  preset.src = src;
}

function loadPresetFile(event) {
  const el = event.target;
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    loadPreset(reader.result);
    el.value = null;
  });
  reader.readAsDataURL(el.files[0]);
}

function paint(event) {
  activate(event.target, '.tools');
  const btn = document.querySelector('.palette button.active');
  currentColor = btn.dataset.color;
}

function eraser(event) {
  currentColor = '#000';
  activate(event.target, '.tools');
}

function clearDrawing(event) {
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  activate(event.target, '.tools');
}

function changeColor(event) {
  // If the eraser is selected, switch to the pencil.
  if (document.querySelector('button.eraser').classList.contains('active')) {
    document.querySelector('.tools button.pencil').click();
  }
  currentColor = event.target.dataset.color;
  activate(event.target, '.palette');
}

function changeBrushSize(event) {
  const maybeNewBrush = parseInt(event.target.dataset.size, 10);
  // Don't activate invalid brushes.
  if (maybeNewBrush) {
    currentBrush = maybeNewBrush;
    activate(event.target, '.brushes');
  }
}

function activate(btn, parent) {
  const prevActive = document.querySelector(parent + ' .active');
  if (prevActive) prevActive.classList.remove('active');
  btn.classList.add('active');
}

function setUpCanvas(canvas) {
  let mouseDown = false;
  let startPosition;

  canvas.addEventListener('mousedown', down);
  canvas.addEventListener('mouseup', up);
  canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mouseleave', leave);

  canvas.addEventListener('touchstart', down);
  canvas.addEventListener('touchend', up);
  canvas.addEventListener('touchmove', move);
  canvas.addEventListener('touchcancel', leave);

  function getMousePosition(canvas, event) {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.scrollWidth / canvas.width || 1;
    const sy = canvas.scrollHeight / canvas.height || 1;

    // Handle both mouse and touch events.
    const clientX = event.clientX || event.touches[0].clientX;
    const clientY = event.clientY || event.touches[0].clientY;

    return {
      x: (clientX - rect.left) / sx,
      y: (clientY - rect.top) / sy,
    };
  }

  function down(event) {
    event.preventDefault();
    startPosition = getMousePosition(canvas, event);

    if (event.altKey) {
      const color = ctx.getImageData(startPosition.x, startPosition.y, 1, 1).data;
      console.log(color);
      // Find this button.
      const btn = document.querySelector(
          `button.square[data-color="rgb(${color[0]}, ${color[1]}, ${color[2]})"]`);
      if (btn) {
        btn.click();
      }
    } else {
      mouseDown = true;
      pxBrush.draw({from: startPosition, to: startPosition,
                    size: currentBrush, color: currentColor});
    }
  }

  function up() {
    event.preventDefault();
    mouseDown = false;
  }

  function move(event) {
    if (!mouseDown) {
      return;
    }
    event.preventDefault();
    const newPosition = getMousePosition(canvas, event);
    pxBrush.draw({from: startPosition, to: newPosition,
                  size: currentBrush, color: currentColor});
    startPosition = newPosition;
  }

  function leave(event) {
    if (!mouseDown) {
      return;
    }
    event.preventDefault();
    mouseDown = false;
  }
}

/*
 * Server things.
 * TODO(noms): clean this up
 */
const GAME_SESSION_URL = 'https://behavioralrl-pa.googleapis.com/v1/game';
const API_PARAMS = '?key=AIzaSyBPnNbTmMmYnxQOQeRecTbsmjZ7lE6Lal4&alt=json';
async function getSessionId() {
  const session = {
    'game_name': 'ChimeraArtPainter (Google)',
    'version': '0.0.0',
    'user_id': 'test',
    'client_timestamp': Date.now() * 1000
  };

  const params = {
    'method': 'POST',
    'cache': 'no-cache',
    'body': JSON.stringify(session)
  };

  const sessionId = await (
      await fetch(GAME_SESSION_URL + API_PARAMS, params)).json();
  return sessionId['id'];
}

function randomLatentVec() {
  let vec = [];
  for (let i = 0; i < 256; ++i) {
    vec.push(0.0);
  }
  return vec;
}

// Taken from https://developer.mozilla.org/en-US/docs/Web/API/WindowBase64/Base64_encoding_and_decoding#Solution_3_%E2%80%93_JavaScript's_UTF-16_%3E_binary_string_%3E_base64
function b64ToUint6 (nChr) {
  return nChr > 64 && nChr < 91 ? nChr - 65
    : nChr > 96 && nChr < 123 ? nChr - 71
    : nChr > 47 && nChr < 58 ? nChr + 4
    : nChr === 43 ? 62
    : nChr === 47 ? 63
    : 0;
}

function base64DecToArr(sBase64, nBlockSize) {
  var sB64Enc = sBase64.replace(/[^A-Za-z0-9\+\/]/g, ''), nInLen = sB64Enc.length,
    nOutLen = nBlockSize ? Math.ceil((nInLen * 3 + 1 >>> 2) / nBlockSize) * nBlockSize : nInLen * 3 + 1 >>> 2, aBytes = new Uint8Array(nOutLen);

  for (var nMod3, nMod4, nUint24 = 0, nOutIdx = 0, nInIdx = 0; nInIdx < nInLen; nInIdx++) {
    nMod4 = nInIdx & 3;
    nUint24 |= b64ToUint6(sB64Enc.charCodeAt(nInIdx)) << 18 - 6 * nMod4;
    if (nMod4 === 3 || nInLen - nInIdx === 1) {
      for (nMod3 = 0; nMod3 < 3 && nOutIdx < nOutLen; nMod3++, nOutIdx++) {
        aBytes[nOutIdx] = nUint24 >>> (16 >>> nMod3 & 24) & 255;
      }
      nUint24 = 0;
    }
  }
  return aBytes;
}

async function makeRequest() {
  const spinner = document.getElementById('spinner');
  spinner.removeAttribute('hidden');
  document.querySelector('#btnStyle').disabled = true;

  // Hide the current image.
  document.querySelector('.output > img').style.opacity = 0;

  const json = {
    'resource_name': 'RecreateFromSources',
    'mime_type': 'image/jpeg',
    'desired_attributes': [
        {'key': 'LatentVectorList', 'value': {
          'dtype': 1,
          'tensor_shape': {'dim':[{'size': 1}, {size: 256}]},
          'float_val': randomLatentVec()
        }},
        {'key': 'SegmentationMask', 'value': {
          'dtype': 7,
          'tensor_shape': {'dim':[{'size': 1}]},
          'string_val': await inputToImageDomElement()
        }},
        {'key': 'ImageModelName', 'value': {
          'dtype': 7,
          'tensor_shape': {'dim':[{'size': 1}]},
          'string_val': [btoa('SpadeModel')]
        }},
        {'key': 'JpegCompressionQuality', 'value': {
          'dtype': 3,
          'tensor_shape': {'dim':[{'size': 1}]},
          'int_val': 80
        }},
    ]};

  const sessionId = await getSessionId();
  const start = performance.now();
  const requestUrl = `${GAME_SESSION_URL}/${sessionId}/asset`;
  const params = {
    'method': 'POST',
    'cache': 'no-cache',
    'body': `{'assets': [${JSON.stringify(json)}]}`
  };

  const response = await (await fetch(requestUrl + API_PARAMS, params)).json();

  spinner.setAttribute('hidden', true);
  document.querySelector('#btnStyle').disabled = false;
  if (response.error) {
    console.error(response.error);
  } else {
    console.log('request took', performance.now() - start);
    insertResultImage(response);
    return response;
  }
}

async function inputToImageDomElement() {
  const canvas = document.querySelector('canvas');
  console.log(canvas.width, canvas.height, window.devicePixelRatio);

  const url = await canvas.toDataURL('image/png');
  const blob = await (await fetch(url)).blob();
  const buffer = await blob.arrayBuffer();
  const result = String.fromCharCode.apply(null, new Uint8Array(buffer));
  return String(btoa(result));
}

function insertResultImage(response) {
  const img = document.querySelector('.output > img');
  img.style.opacity = 1;
  img.src = 'data:image/jpeg;base64,' + response.assets[0].binaryData;
}
