/*
 * Fingerprint collector.
 *
 * Self-contained: this file is loaded directly by report.html (to fingerprint
 * the extension page) AND injected into a website's MAIN world via
 * chrome.scripting (to see exactly what a tracker on that site would see).
 * It must therefore not depend on any extension APIs.
 *
 * Exposes: globalThis.__fpCollect() -> Promise<Result>
 */
(() => {
  'use strict';

  // ---------------------------------------------------------------- helpers

  // cyrb53: small, fast, non-cryptographic 53-bit hash. Works in insecure
  // contexts (unlike crypto.subtle), which matters when injected into http pages.
  function hash(str, seed = 0) {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
  }

  function hashBytes(bytes) {
    let s = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return hash(s);
  }

  function withTimeout(promise, ms) {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
      }),
    ]).finally(() => clearTimeout(timer));
  }

  // Make values JSON / structured-clone safe.
  function normalize(v, depth = 0) {
    if (v === undefined) return null;
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number') return Number.isFinite(v) ? v : String(v);
    if (typeof v === 'bigint') return v.toString();
    if (typeof v === 'function') return '[function]';
    if (depth > 6) return '[…]';
    if (ArrayBuffer.isView(v)) return Array.from(v);
    if (Array.isArray(v)) return v.map((x) => normalize(x, depth + 1));
    if (typeof v === 'object') {
      const out = {};
      for (const k of Object.keys(v)) out[k] = normalize(v[k], depth + 1);
      return out;
    }
    return String(v);
  }

  const MB = 1024 * 1024;

  // ---------------------------------------------------------------- canvas

  function drawCanvas2d() {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 90;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    const text = 'Cwm fjordbank glyphs vext quiz 😃 ∑≈ç';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f60';
    ctx.fillRect(150, 4, 80, 26);
    ctx.fillStyle = '#069';
    ctx.font = '15px "Times New Roman", serif';
    ctx.fillText(text, 4, 24);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.font = 'bold 19px Arial, sans-serif';
    ctx.fillText(text, 6, 52);
    // Blending + anti-aliased curves amplify GPU / driver differences.
    ctx.globalCompositeOperation = 'multiply';
    const circles = [['#f2f', 40, 70], ['#2ff', 70, 70], ['#ff2', 55, 50]];
    for (const [color, x, y] of circles) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 22, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    const grad = ctx.createLinearGradient(200, 40, 320, 90);
    grad.addColorStop(0, 'rgba(255,0,128,0.8)');
    grad.addColorStop(1, 'rgba(0,128,255,0.3)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(200, 88);
    ctx.bezierCurveTo(230, 20, 280, 100, 318, 44);
    ctx.lineTo(318, 88);
    ctx.fill();
    ctx.shadowBlur = 6;
    ctx.shadowColor = '#333';
    ctx.strokeStyle = '#a0a';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(110, 60, 70, 24);
    return c.toDataURL('image/png');
  }

  // ---------------------------------------------------------------- webgl

  let glCache;
  function getGL() {
    if (glCache !== undefined) return glCache;
    try {
      const c = document.createElement('canvas');
      glCache = c.getContext('webgl') || c.getContext('experimental-webgl') || null;
    } catch {
      glCache = null;
    }
    return glCache;
  }

  function requireGL() {
    const gl = getGL();
    if (!gl) throw new Error('WebGL unavailable');
    return gl;
  }

  function renderWebGLImage() {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const gl = c.getContext('webgl', { preserveDrawingBuffer: true, antialias: true });
    if (!gl) throw new Error('WebGL unavailable');
    const vs = `attribute vec2 p; varying vec2 v;
      void main(){ v = p; gl_Position = vec4(p, 0.0, 1.0); }`;
    const fs = `precision mediump float; varying vec2 v;
      void main(){
        float n = fract(sin(dot(v, vec2(12.9898, 78.233))) * 43758.5453);
        gl_FragColor = vec4(sin(v.x * 9.0) * 0.5 + 0.5, cos(v.y * 7.0) * 0.5 + 0.5, n, 1.0);
      }`;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.9, -0.8, 0.85, -0.6, 0.1, 0.95, -0.7, 0.6]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.clearColor(0.05, 0.05, 0.1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const pixels = new Uint8Array(128 * 128 * 4);
    gl.readPixels(0, 0, 128, 128, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return { hash: hashBytes(pixels), dataUrl: c.toDataURL('image/png') };
  }

  // ---------------------------------------------------------------- audio

  async function audioFingerprintOnce() {
    const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx(1, 5000, 44100);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 10000;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -50;
    comp.knee.value = 40;
    comp.ratio.value = 12;
    comp.attack.value = 0;
    comp.release.value = 0.25;
    osc.connect(comp);
    comp.connect(ctx.destination);
    osc.start(0);
    const buffer = await ctx.startRendering();
    const data = buffer.getChannelData(0).subarray(4500, 5000);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += Math.abs(data[i]);
    return { sum, hash: hashBytes(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)) };
  }

  // ---------------------------------------------------------------- fonts

  const FONT_LIST = [
    // Windows
    'Arial', 'Arial Black', 'Bahnschrift', 'Calibri', 'Cambria', 'Cambria Math', 'Candara', 'Comic Sans MS',
    'Consolas', 'Constantia', 'Corbel', 'Courier New', 'Ebrima', 'Franklin Gothic Medium', 'Gabriola', 'Gadugi',
    'Georgia', 'Impact', 'Ink Free', 'Javanese Text', 'Leelawadee UI', 'Lucida Console', 'Lucida Sans Unicode',
    'Malgun Gothic', 'Marlett', 'Microsoft Himalaya', 'Microsoft JhengHei', 'Microsoft YaHei', 'MS Gothic',
    'MV Boli', 'Nirmala UI', 'Palatino Linotype', 'Segoe MDL2 Assets', 'Segoe Print', 'Segoe Script', 'Segoe UI',
    'Segoe UI Emoji', 'SimSun', 'Sitka Text', 'Sylfaen', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana',
    'Yu Gothic',
    // macOS / iOS
    'American Typewriter', 'Andale Mono', 'Apple Chancery', 'Apple Color Emoji', 'Apple SD Gothic Neo', 'Avenir',
    'Avenir Next', 'Baskerville', 'Big Caslon', 'Chalkboard', 'Charter', 'Cochin', 'Copperplate', 'Didot',
    'Futura', 'Geneva', 'Gill Sans', 'Helvetica', 'Helvetica Neue', 'Herculanum', 'Hiragino Sans',
    'Hoefler Text', 'Lucida Grande', 'Marker Felt', 'Menlo', 'Monaco', 'Optima', 'Papyrus', 'PingFang SC',
    'Rockwell', 'SF Mono', 'SF Pro', 'Skia', 'Snell Roundhand', 'Zapfino',
    // Linux
    'Cantarell', 'DejaVu Sans', 'DejaVu Sans Mono', 'DejaVu Serif', 'Droid Sans', 'FreeSans', 'Liberation Mono',
    'Liberation Sans', 'Liberation Serif', 'Noto Color Emoji', 'Noto Sans', 'Noto Serif', 'Ubuntu', 'Ubuntu Mono',
    // Commonly installed by apps / developers
    'Cascadia Code', 'Fira Code', 'Hack', 'Inconsolata', 'Iosevka', 'JetBrains Mono', 'Lato', 'MesloLGS NF',
    'Minion Pro', 'Montserrat', 'Myriad Pro', 'Open Sans', 'Roboto', 'Source Code Pro', 'Source Sans Pro',
  ];

  function detectFonts() {
    const root = document.body || document.documentElement;
    if (!root) throw new Error('no document to measure fonts in');
    const BASES = ['monospace', 'sans-serif', 'serif'];
    const TEST = 'mmmmmmmmmmlli1|WwQq@#ƒ';
    const box = document.createElement('div');
    box.setAttribute('aria-hidden', 'true');
    box.style.cssText = 'position:absolute!important;left:-9999px!important;top:0!important;visibility:hidden!important;';
    const span = (family) => {
      const s = document.createElement('span');
      s.style.cssText = 'position:absolute;font-size:72px;font-style:normal;font-weight:normal;letter-spacing:normal;line-height:normal;white-space:nowrap;';
      s.style.fontFamily = family;
      s.textContent = TEST;
      box.appendChild(s);
      return s;
    };
    const baseSpans = BASES.map((b) => span(b));
    const fontSpans = FONT_LIST.map((f) => BASES.map((b) => span(`"${f}",${b}`)));
    root.appendChild(box);
    try {
      const baseDims = baseSpans.map((s) => [s.offsetWidth, s.offsetHeight]);
      const detected = FONT_LIST.filter((_, i) =>
        fontSpans[i].some((s, j) => s.offsetWidth !== baseDims[j][0] || s.offsetHeight !== baseDims[j][1]),
      );
      return { tested: FONT_LIST.length, detectedCount: detected.length, detected };
    } finally {
      box.remove();
    }
  }

  // ---------------------------------------------------------------- probes

  const mq = (q) => window.matchMedia && window.matchMedia(q).matches;
  const firstMatch = (feature, values) => {
    for (const v of values) if (mq(`(${feature}: ${v})`)) return v;
    return null;
  };

  const VIDEO_TYPES = [
    'video/mp4; codecs="avc1.42E01E"', 'video/mp4; codecs="hev1.1.6.L93.B0"', 'video/mp4; codecs="av01.0.05M.08"',
    'video/webm; codecs="vp8"', 'video/webm; codecs="vp9"', 'video/webm; codecs="av1"', 'video/ogg; codecs="theora"',
    'application/vnd.apple.mpegurl', 'video/x-matroska',
  ];
  const AUDIO_TYPES = [
    'audio/mpeg', 'audio/mp4; codecs="mp4a.40.2"', 'audio/aac', 'audio/flac', 'audio/ogg; codecs="vorbis"',
    'audio/ogg; codecs="opus"', 'audio/webm; codecs="opus"', 'audio/wav; codecs="1"', 'audio/x-m4a',
  ];

  const FEATURE_APIS = {
    'Bluetooth': () => 'bluetooth' in navigator,
    'WebUSB': () => 'usb' in navigator,
    'WebHID': () => 'hid' in navigator,
    'Web Serial': () => 'serial' in navigator,
    'WebXR': () => 'xr' in navigator,
    'WebGPU': () => 'gpu' in navigator,
    'Web Share': () => 'share' in navigator,
    'Contacts Picker': () => 'contacts' in navigator,
    'Wake Lock': () => 'wakeLock' in navigator,
    'Web MIDI': () => 'requestMIDIAccess' in navigator,
    'Gamepad': () => 'getGamepads' in navigator,
    'Vibration': () => 'vibrate' in navigator,
    'Credential Mgmt': () => 'credentials' in navigator,
    'Payment Request': () => 'PaymentRequest' in window,
    'Presentation': () => 'presentation' in navigator,
    'Local Font Access': () => 'queryLocalFonts' in window,
    'File System Access': () => 'showOpenFilePicker' in window,
    'EyeDropper': () => 'EyeDropper' in window,
    'Topics API': () => 'browsingTopics' in document,
    'Protected Audience': () => 'joinAdInterestGroup' in navigator,
    'Shared Storage': () => 'sharedStorage' in window,
    'Storage Access': () => 'requestStorageAccess' in document,
    'Window Mgmt': () => 'getScreenDetails' in window,
    'Compute Pressure': () => 'PressureObserver' in window,
    'WebTransport': () => 'WebTransport' in window,
    'WebCodecs': () => 'VideoEncoder' in window,
    'Speech Recognition': () => 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window,
    'Translator (AI)': () => 'Translator' in window,
    'Prompt API (AI)': () => 'LanguageModel' in window,
  };

  const PERMISSIONS = [
    'geolocation', 'notifications', 'camera', 'microphone', 'clipboard-read', 'clipboard-write',
    'persistent-storage', 'midi', 'background-sync', 'accelerometer', 'gyroscope', 'magnetometer',
    'local-fonts', 'screen-wake-lock', 'storage-access', 'window-management', 'idle-detection',
  ];

  // Each probe: { section, key, run, volatile? }
  // volatile = changes between visits/sessions, so excluded from the combined ID.
  const PROBES = [
    // ---- Navigator / user agent
    { section: 'navigator', key: 'userAgent', run: () => navigator.userAgent },
    {
      section: 'navigator', key: 'uaClientHints',
      run: () => {
        const d = navigator.userAgentData;
        if (!d) return null;
        return { brands: d.brands.map((b) => `${b.brand} ${b.version}`), mobile: d.mobile, platform: d.platform };
      },
    },
    {
      section: 'navigator', key: 'uaHighEntropy',
      run: async () => {
        const d = navigator.userAgentData;
        if (!d || !d.getHighEntropyValues) return null;
        const v = await d.getHighEntropyValues([
          'architecture', 'bitness', 'formFactors', 'fullVersionList', 'model', 'platformVersion', 'wow64',
        ]);
        return {
          architecture: v.architecture,
          bitness: v.bitness,
          model: v.model || '(empty)',
          platformVersion: v.platformVersion,
          wow64: v.wow64,
          formFactors: v.formFactors,
          fullVersionList: (v.fullVersionList || []).map((b) => `${b.brand} ${b.version}`),
        };
      },
    },
    { section: 'navigator', key: 'platform', run: () => navigator.platform },
    { section: 'navigator', key: 'vendor', run: () => navigator.vendor },
    { section: 'navigator', key: 'languages', run: () => Array.from(navigator.languages || [navigator.language]) },
    { section: 'navigator', key: 'hardwareConcurrency', run: () => navigator.hardwareConcurrency },
    { section: 'navigator', key: 'deviceMemory', run: () => navigator.deviceMemory },
    {
      section: 'navigator', key: 'privacySignals',
      run: () => ({
        doNotTrack: navigator.doNotTrack ?? window.doNotTrack ?? null,
        globalPrivacyControl: navigator.globalPrivacyControl ?? null,
        cookieEnabled: navigator.cookieEnabled,
      }),
    },
    { section: 'navigator', key: 'webdriver', run: () => navigator.webdriver },
    { section: 'navigator', key: 'pdfViewerEnabled', run: () => navigator.pdfViewerEnabled },
    {
      section: 'navigator', key: 'plugins',
      run: () => Array.from(navigator.plugins || []).map((p) => `${p.name} — ${p.filename}`),
    },
    { section: 'navigator', key: 'mimeTypes', run: () => Array.from(navigator.mimeTypes || []).map((m) => m.type) },
    {
      section: 'navigator', key: 'connection', volatile: true,
      run: () => {
        const c = navigator.connection;
        if (!c) return null;
        return { effectiveType: c.effectiveType, rttMs: c.rtt, downlinkMbps: c.downlink, saveData: c.saveData, type: c.type };
      },
    },

    // ---- Screen & window
    { section: 'screen', key: 'screenResolution', run: () => `${screen.width} × ${screen.height}` },
    {
      section: 'screen', key: 'availableScreen',
      run: () => ({
        availWidth: screen.availWidth, availHeight: screen.availHeight,
        availLeft: screen.availLeft, availTop: screen.availTop,
        reservedForOS: `${screen.width - screen.availWidth} × ${screen.height - screen.availHeight}`,
      }),
    },
    { section: 'screen', key: 'colorDepth', run: () => ({ colorDepth: screen.colorDepth, pixelDepth: screen.pixelDepth }) },
    { section: 'screen', key: 'devicePixelRatio', run: () => window.devicePixelRatio },
    {
      section: 'screen', key: 'orientation',
      run: () => (screen.orientation ? { type: screen.orientation.type, angle: screen.orientation.angle } : null),
    },
    { section: 'screen', key: 'multiScreen', run: () => ('isExtended' in screen ? screen.isExtended : null) },
    {
      section: 'screen', key: 'windowSize', volatile: true,
      run: () => ({
        inner: `${window.innerWidth} × ${window.innerHeight}`,
        outer: `${window.outerWidth} × ${window.outerHeight}`,
        position: `${window.screenX}, ${window.screenY}`,
      }),
    },

    // ---- Locale & time
    { section: 'locale', key: 'timezone', run: () => Intl.DateTimeFormat().resolvedOptions().timeZone },
    {
      section: 'locale', key: 'timezoneOffset',
      run: () => {
        const y = new Date().getFullYear();
        return {
          nowMinutes: new Date().getTimezoneOffset(),
          january: new Date(y, 0, 1).getTimezoneOffset(),
          july: new Date(y, 6, 1).getTimezoneOffset(),
        };
      },
    },
    {
      section: 'locale', key: 'intlSettings',
      run: () => {
        const o = Intl.DateTimeFormat().resolvedOptions();
        const h = Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions();
        return { locale: o.locale, calendar: o.calendar, numberingSystem: o.numberingSystem, hourCycle: h.hourCycle };
      },
    },
    {
      section: 'locale', key: 'localeFormatting',
      run: () => ({
        date: new Date(Date.UTC(2020, 0, 2, 3, 4, 5)).toLocaleString(),
        number: (1234567.891).toLocaleString(),
        currency: new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(1234.5),
        list: Intl.ListFormat ? new Intl.ListFormat(undefined).format(['a', 'b', 'c']) : null,
      }),
    },

    // ---- Graphics
    {
      section: 'graphics', key: 'canvas2d',
      run: () => {
        const a = drawCanvas2d();
        if (!a) return null;
        const b = drawCanvas2d();
        return {
          __preview: a,
          value: { hash: hash(a), stableAcrossRenders: a === b, dataUrlLength: a.length },
        };
      },
    },
    {
      section: 'graphics', key: 'webglInfo',
      run: () => {
        const gl = requireGL();
        return {
          version: gl.getParameter(gl.VERSION),
          shadingLanguage: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
          vendor: gl.getParameter(gl.VENDOR),
          renderer: gl.getParameter(gl.RENDERER),
          webgl2: (() => {
            try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
          })(),
        };
      },
    },
    {
      section: 'graphics', key: 'webglUnmasked',
      run: () => {
        const gl = requireGL();
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (!ext) return null;
        return {
          vendor: gl.getParameter(ext.UNMASKED_VENDOR_WEBGL),
          renderer: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),
        };
      },
    },
    {
      section: 'graphics', key: 'webglParams',
      run: () => {
        const gl = requireGL();
        const names = [
          'MAX_TEXTURE_SIZE', 'MAX_CUBE_MAP_TEXTURE_SIZE', 'MAX_RENDERBUFFER_SIZE', 'MAX_VIEWPORT_DIMS',
          'MAX_VERTEX_ATTRIBS', 'MAX_VERTEX_UNIFORM_VECTORS', 'MAX_FRAGMENT_UNIFORM_VECTORS', 'MAX_VARYING_VECTORS',
          'MAX_TEXTURE_IMAGE_UNITS', 'MAX_VERTEX_TEXTURE_IMAGE_UNITS', 'MAX_COMBINED_TEXTURE_IMAGE_UNITS',
          'ALIASED_LINE_WIDTH_RANGE', 'ALIASED_POINT_SIZE_RANGE',
        ];
        const out = {};
        for (const n of names) {
          const v = gl.getParameter(gl[n]);
          out[n] = ArrayBuffer.isView(v) ? Array.from(v).join(' – ') : v;
        }
        const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
        if (aniso) out.MAX_TEXTURE_MAX_ANISOTROPY = gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
        const p = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
        if (p) out.FRAGMENT_HIGH_FLOAT = `range ${p.rangeMin}/${p.rangeMax}, precision ${p.precision}`;
        return out;
      },
    },
    {
      section: 'graphics', key: 'webglExtensions',
      run: () => {
        const list = requireGL().getSupportedExtensions() || [];
        return { count: list.length, hash: hash(list.join(',')), list };
      },
    },
    {
      section: 'graphics', key: 'webglImage',
      run: () => {
        const a = renderWebGLImage();
        const b = renderWebGLImage();
        return { __preview: a.dataUrl, value: { hash: a.hash, stableAcrossRenders: a.hash === b.hash } };
      },
    },
    {
      section: 'graphics', key: 'webgpu',
      run: async () => {
        if (!navigator.gpu) return null;
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) return 'navigator.gpu exists but no adapter was returned';
        const info = adapter.info || (adapter.requestAdapterInfo ? await adapter.requestAdapterInfo() : {});
        return {
          vendor: info.vendor || '(empty)',
          architecture: info.architecture || '(empty)',
          device: info.device || '(empty)',
          description: info.description || '(empty)',
          featureCount: adapter.features ? adapter.features.size : null,
          maxTextureDimension2D: adapter.limits?.maxTextureDimension2D,
          maxBufferSize: adapter.limits?.maxBufferSize,
          maxComputeWorkgroupStorageSize: adapter.limits?.maxComputeWorkgroupStorageSize,
        };
      },
    },

    // ---- Audio
    {
      section: 'audio', key: 'audioFingerprint',
      run: async () => {
        const a = await audioFingerprintOnce();
        if (!a) return null;
        const b = await audioFingerprintOnce();
        return { sum: a.sum.toString(), hash: a.hash, stableAcrossRenders: a.hash === b.hash };
      },
    },
    {
      section: 'audio', key: 'audioContext',
      run: async () => {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        const ctx = new Ctx();
        try {
          return {
            sampleRate: ctx.sampleRate,
            baseLatency: ctx.baseLatency,
            outputLatency: ctx.outputLatency,
            maxChannelCount: ctx.destination.maxChannelCount,
          };
        } finally {
          ctx.close().catch(() => {});
        }
      },
    },

    // ---- Fonts
    { section: 'fonts', key: 'fonts', run: detectFonts },

    // ---- Media & preferences
    {
      section: 'media', key: 'mediaQueries',
      run: () => ({
        'prefers-color-scheme': firstMatch('prefers-color-scheme', ['dark', 'light']),
        'prefers-reduced-motion': firstMatch('prefers-reduced-motion', ['reduce', 'no-preference']),
        'prefers-reduced-transparency': firstMatch('prefers-reduced-transparency', ['reduce', 'no-preference']),
        'prefers-contrast': firstMatch('prefers-contrast', ['more', 'less', 'custom', 'no-preference']),
        'forced-colors': firstMatch('forced-colors', ['active', 'none']),
        'inverted-colors': firstMatch('inverted-colors', ['inverted', 'none']),
        'color-gamut': firstMatch('color-gamut', ['rec2020', 'p3', 'srgb']),
        'dynamic-range': firstMatch('dynamic-range', ['high', 'standard']),
        monochrome: mq('(monochrome)'),
        pointer: firstMatch('pointer', ['fine', 'coarse', 'none']),
        'any-pointer': firstMatch('any-pointer', ['fine', 'coarse', 'none']),
        hover: firstMatch('hover', ['hover', 'none']),
        'any-hover': firstMatch('any-hover', ['hover', 'none']),
      }),
    },
    {
      section: 'media', key: 'codecs',
      run: () => {
        const v = document.createElement('video');
        const a = document.createElement('audio');
        const out = {};
        for (const t of VIDEO_TYPES) out[t] = v.canPlayType(t) || 'no';
        for (const t of AUDIO_TYPES) out[t] = a.canPlayType(t) || 'no';
        return out;
      },
    },
    {
      section: 'media', key: 'mediaDevices',
      run: async () => {
        if (!navigator.mediaDevices?.enumerateDevices) return null;
        const devices = await navigator.mediaDevices.enumerateDevices();
        const counts = { audioinput: 0, audiooutput: 0, videoinput: 0 };
        for (const d of devices) counts[d.kind] = (counts[d.kind] || 0) + 1;
        counts.labelsVisible = devices.some((d) => d.label);
        return counts;
      },
    },
    {
      section: 'media', key: 'speechVoices',
      run: async () => {
        if (!window.speechSynthesis) return null;
        let voices = speechSynthesis.getVoices();
        if (!voices.length) {
          await new Promise((resolve) => {
            const t = setTimeout(resolve, 1500);
            speechSynthesis.addEventListener('voiceschanged', () => { clearTimeout(t); resolve(); }, { once: true });
          });
          voices = speechSynthesis.getVoices();
        }
        const def = voices.find((v) => v.default);
        return {
          count: voices.length,
          default: def ? `${def.name} (${def.lang})` : null,
          voices: voices.map((v) => `${v.name} (${v.lang})${v.localService ? '' : ' [remote]'}`),
        };
      },
    },

    // ---- Environment & capabilities
    {
      section: 'environment', key: 'storageAPIs',
      run: () => {
        const test = (fn) => { try { return fn(); } catch { return false; } };
        return {
          localStorage: test(() => { localStorage.setItem('__fp', '1'); localStorage.removeItem('__fp'); return true; }),
          sessionStorage: test(() => { sessionStorage.setItem('__fp', '1'); sessionStorage.removeItem('__fp'); return true; }),
          indexedDB: test(() => !!window.indexedDB),
          cacheStorage: 'caches' in window,
          webSQL: typeof window.openDatabase === 'function',
          cookieEnabled: navigator.cookieEnabled,
        };
      },
    },
    {
      section: 'environment', key: 'storageQuota', volatile: true,
      run: async () => {
        if (!navigator.storage?.estimate) return null;
        const e = await navigator.storage.estimate();
        const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : null;
        return { quotaMB: Math.round(e.quota / MB), usageMB: +(e.usage / MB).toFixed(2), persisted };
      },
    },
    {
      section: 'environment', key: 'permissions', volatile: true,
      run: async () => {
        if (!navigator.permissions?.query) return null;
        const out = {};
        await Promise.all(PERMISSIONS.map(async (name) => {
          try { out[name] = (await navigator.permissions.query({ name })).state; } catch { out[name] = 'unsupported'; }
        }));
        if (window.Notification) out['Notification.permission'] = Notification.permission;
        return Object.fromEntries(Object.entries(out).sort());
      },
    },
    {
      section: 'environment', key: 'touchSupport',
      run: () => {
        let touchEvent = false;
        try { document.createEvent('TouchEvent'); touchEvent = true; } catch { /* not supported */ }
        return { maxTouchPoints: navigator.maxTouchPoints, touchEventCreatable: touchEvent, ontouchstart: 'ontouchstart' in window };
      },
    },
    {
      section: 'environment', key: 'battery', volatile: true,
      run: async () => {
        if (!navigator.getBattery) return null;
        const b = await navigator.getBattery();
        return {
          charging: b.charging,
          level: `${Math.round(b.level * 100)}%`,
          chargingTime: b.chargingTime,
          dischargingTime: b.dischargingTime,
        };
      },
    },
    {
      section: 'environment', key: 'mathPrecision',
      run: () => {
        const m = {
          'acos(0.123124234234234242)': Math.acos(0.123124234234234242),
          'acosh(1e308)': Math.acosh(1e308),
          'asinh(1)': Math.asinh(1),
          'atanh(0.5)': Math.atanh(0.5),
          'cbrt(100)': Math.cbrt(100),
          'cosh(1)': Math.cosh(1),
          'expm1(1)': Math.expm1(1),
          'log1p(10)': Math.log1p(10),
          'sinh(1)': Math.sinh(1),
          'tan(-1e300)': Math.tan(-1e300),
          'tanh(1)': Math.tanh(1),
          'pow(π, -100)': Math.pow(Math.PI, -100),
          'sin(-1e300)': Math.sin(-1e300),
          'exp(10)': Math.exp(10),
        };
        return { hash: hash(JSON.stringify(m)), ...m };
      },
    },
    {
      section: 'environment', key: 'jsEngine',
      run: () => {
        let errorMessage = null;
        try { null.x; } catch (e) { errorMessage = e.message; }
        return {
          evalToStringLength: eval.toString().length,
          nullPropertyError: errorMessage,
          windowChrome: typeof window.chrome,
          stackTraceLimit: Error.stackTraceLimit ?? null,
        };
      },
    },
    {
      section: 'environment', key: 'apiSurface',
      run: () => {
        const supported = [];
        const missing = [];
        for (const [name, test] of Object.entries(FEATURE_APIS)) {
          let ok = false;
          try { ok = !!test(); } catch { /* treat as missing */ }
          (ok ? supported : missing).push(name);
        }
        return { supported, missing };
      },
    },
    {
      section: 'environment', key: 'webrtc', volatile: true,
      run: async () => {
        if (!window.RTCPeerConnection) return null;
        // No STUN servers: only local (host) candidates, no network traffic.
        const pc = new RTCPeerConnection({ iceServers: [] });
        const candidates = new Set();
        try {
          pc.createDataChannel('fp');
          const done = new Promise((resolve) => {
            pc.onicecandidate = (e) => {
              if (!e.candidate) return resolve();
              const parts = e.candidate.candidate.split(' ');
              // candidate:<foundation> <component> <protocol> <priority> <address> <port> typ <type>
              if (parts.length > 7) candidates.add(`${parts[7]} ${parts[2].toLowerCase()} ${parts[4]}`);
            };
            setTimeout(resolve, 2000);
          });
          await pc.setLocalDescription(await pc.createOffer());
          await done;
        } finally {
          pc.close();
        }
        const list = [...candidates];
        return {
          candidates: list,
          localIPsExposed: list.some((c) => !c.split(' ')[2].endsWith('.local')),
        };
      },
    },
  ];

  // ---------------------------------------------------------------- main

  async function collect() {
    const started = performance.now();
    const items = await Promise.all(PROBES.map(async (p) => {
      const base = { section: p.section, key: p.key, volatile: !!p.volatile };
      try {
        let out = await withTimeout(Promise.resolve().then(p.run), 5000);
        let preview = null;
        if (out && typeof out === 'object' && '__preview' in out) {
          preview = out.__preview;
          out = out.value;
        }
        return { ...base, value: normalize(out), preview };
      } catch (e) {
        return { ...base, value: null, error: String((e && e.message) || e) };
      }
    }));

    for (const it of items) it.hash = it.error ? null : hash(JSON.stringify(it.value));

    const stable = items
      .filter((it) => !it.volatile && !it.error)
      .map((it) => `${it.key}=${it.hash}`)
      .sort()
      .join('|');

    return {
      collectedAt: new Date().toISOString(),
      durationMs: Math.round(performance.now() - started),
      context: {
        href: location.href,
        origin: location.origin,
        isSecureContext: window.isSecureContext,
        topLevel: window.top === window,
      },
      fingerprintId: hash(stable),
      stableComponentCount: stable ? stable.split('|').length : 0,
      items,
    };
  }

  globalThis.__fpCollect = collect;
})();
