/*
 * Human-readable metadata for every attribute the collector gathers.
 * entropy: rough identifying power of the attribute on its own.
 *   high   – splits the population into many small groups; a core tracker signal
 *   medium – meaningful when combined with others
 *   low    – mostly shared by everyone on the same browser/OS, but still a bit or two
 */
const FP_SECTIONS = {
  navigator: {
    title: 'Navigator & User Agent',
    blurb: 'Properties every script can read off window.navigator, plus Chrome\'s User-Agent Client Hints.',
  },
  screen: {
    title: 'Screen & Window',
    blurb: 'Display geometry. Monitor resolution, scaling and taskbar/dock size combine into a surprisingly specific value.',
  },
  locale: {
    title: 'Locale & Time',
    blurb: 'Where you appear to be and how your OS formats dates and numbers.',
  },
  graphics: {
    title: 'Canvas, WebGL & WebGPU',
    blurb: 'Rendering fingerprints: identical drawing commands produce slightly different pixels depending on GPU, driver, OS and font rasterizer.',
  },
  audio: {
    title: 'Audio',
    blurb: 'Audio-stack fingerprints, computed silently with an OfflineAudioContext. Nothing is played.',
  },
  fonts: {
    title: 'Fonts',
    blurb: 'Installed fonts, detected by measuring text without any permission prompt.',
  },
  media: {
    title: 'Media, Preferences & Devices',
    blurb: 'CSS media features, codec support, attached media devices and text-to-speech voices.',
  },
  environment: {
    title: 'Storage, Permissions & Environment',
    blurb: 'Capability probes, permission states, math-library quirks and network hints.',
  },
};

const FP_META = {
  // ---------------------------------------------------------------- navigator
  userAgent: {
    label: 'User-Agent string',
    entropy: 'medium',
    why: 'The classic fingerprint signal: browser, version, OS and CPU family in one string, sent with every HTTP request as well. Chrome now "reduces" it (frozen OS version and minor version numbers), which lowered its entropy, but it still separates browser/OS/major-version cohorts.',
  },
  uaClientHints: {
    label: 'UA Client Hints (low entropy)',
    entropy: 'low',
    why: 'navigator.userAgentData: the structured replacement for the UA string. Brands, mobile flag and platform are given to every site by default and are deliberately coarse.',
  },
  uaHighEntropy: {
    label: 'UA Client Hints (high entropy)',
    entropy: 'high',
    why: 'getHighEntropyValues() exposes exactly what Chrome stripped from the UA string: full browser build, exact OS version, CPU architecture/bitness and device model. Any script can request it without a prompt; servers can also ask for it with the Accept-CH header.',
  },
  platform: {
    label: 'navigator.platform',
    entropy: 'low',
    why: 'Legacy OS identifier (e.g. "MacIntel", "Win32", "Linux x86_64"). Cheap, and useful for catching spoofed User-Agents when the two disagree.',
  },
  vendor: {
    label: 'navigator.vendor',
    entropy: 'low',
    why: '"Google Inc." for Chromium browsers, "Apple Computer, Inc." for Safari, empty for Firefox. Used to verify the claimed browser engine.',
  },
  languages: {
    label: 'Preferred languages',
    entropy: 'medium',
    why: 'Your ordered language list (also sent as the Accept-Language header). Default lists like ["en-US", "en"] are common; any customization or multilingual setup is quite distinctive.',
  },
  hardwareConcurrency: {
    label: 'CPU logical cores',
    entropy: 'medium',
    why: 'Number of logical processors. Values range from 2 to 32+ and correlate strongly with device model; Apple Silicon variants are especially recognizable.',
  },
  deviceMemory: {
    label: 'Device memory (GB)',
    entropy: 'low',
    why: 'Approximate RAM, rounded to a power of two and capped to limit entropy (the cap was 8 GB for years; newer Chrome versions report higher values). Still splits phones from desktops and low-end from high-end devices.',
  },
  privacySignals: {
    label: 'Privacy signals (DNT / GPC / cookies)',
    entropy: 'low',
    why: 'Ironically, turning on Do Not Track or Global Privacy Control makes you rarer, so it adds identifying bits. Chrome does not support GPC natively, so a value here usually means an extension set it.',
  },
  webdriver: {
    label: 'navigator.webdriver',
    entropy: 'low',
    why: 'true when the browser is driven by automation (Selenium, Puppeteer, Playwright). Bot-detection vendors check it first. It should be false for a normal browser.',
  },
  pdfViewerEnabled: {
    label: 'Built-in PDF viewer',
    entropy: 'low',
    why: 'Whether the browser renders PDFs inline. Only differs when the user or an enterprise policy has disabled it.',
  },
  plugins: {
    label: 'Plugins',
    entropy: 'low',
    why: 'Plugin lists were once among the most identifying signals (Flash, Java, Silverlight versions). Modern browsers return a fixed, hard-coded list of PDF viewers, so today a mismatch mainly reveals spoofing or headless browsers (which return an empty list).',
  },
  mimeTypes: {
    label: 'MIME types',
    entropy: 'low',
    why: 'Companion to navigator.plugins. Now hard-coded to the PDF types, so it mostly acts as a consistency check.',
  },
  connection: {
    label: 'Network information',
    entropy: 'low',
    why: 'Effective connection type, round-trip time and downlink estimate. Values are rounded and change constantly, so they are a weak short-term signal. Volatile: excluded from the combined ID.',
  },

  // ---------------------------------------------------------------- screen
  screenResolution: {
    label: 'Screen resolution',
    entropy: 'medium',
    why: 'Logical screen size in CSS pixels. Common laptop sizes are shared by many people; external monitors, unusual scaling and multi-monitor setups are rarer.',
  },
  availableScreen: {
    label: 'Available screen area',
    entropy: 'medium',
    why: 'Screen size minus the space taken by the OS taskbar, dock or menu bar. Dock size, position and auto-hide settings vary from user to user, which makes this more specific than resolution alone.',
  },
  colorDepth: {
    label: 'Color depth',
    entropy: 'low',
    why: 'Bits per pixel, almost always 24 (sometimes 30 on HDR/wide-gamut displays). Low entropy, but it is still collected by every fingerprinting script.',
  },
  devicePixelRatio: {
    label: 'Device pixel ratio',
    entropy: 'medium',
    why: 'Physical pixels per CSS pixel. Reflects Retina/HiDPI hardware and the OS display-scaling setting. Note: browser zoom also changes it.',
  },
  orientation: {
    label: 'Screen orientation',
    entropy: 'low',
    why: 'landscape/portrait plus rotation angle. Mostly useful on mobile and for detecting rotated monitors.',
  },
  multiScreen: {
    label: 'Multiple screens (screen.isExtended)',
    entropy: 'low',
    why: 'Whether the desktop spans more than one display. Exposed without permission as a boolean; the full Window Management API asks first.',
  },
  windowSize: {
    label: 'Window size & position',
    entropy: 'medium',
    why: 'Inner/outer window dimensions and position. Highly distinctive at any moment but changes whenever you resize, so it is excluded from the combined ID. Trackers use it for short-term linking (this is why Tor Browser "letterboxes" windows).',
  },

  // ---------------------------------------------------------------- locale
  timezone: {
    label: 'Time zone',
    entropy: 'medium',
    why: 'IANA time zone name from Intl. Gives your rough location and catches VPN users whose IP country disagrees with their system clock.',
  },
  timezoneOffset: {
    label: 'UTC offset (now / Jan / Jul)',
    entropy: 'low',
    why: 'Minutes from UTC. Comparing January and July shows whether your zone observes daylight saving time, an older way to narrow down a region.',
  },
  intlSettings: {
    label: 'Intl resolved options',
    entropy: 'medium',
    why: 'The locale, calendar, numbering system and 12/24-hour clock the Intl API settles on. Regional-format overrides in your OS settings show up here.',
  },
  localeFormatting: {
    label: 'Locale formatting samples',
    entropy: 'medium',
    why: 'How a fixed date, number and currency get rendered. Mixed setups (e.g. English UI with German number formats) stand out.',
  },

  // ---------------------------------------------------------------- graphics
  canvas2d: {
    label: 'Canvas 2D fingerprint',
    entropy: 'high',
    why: 'The best-known technique: draw text, emoji, blends and curves to a hidden canvas and hash the pixels. Anti-aliasing, sub-pixel font rendering, emoji fonts and GPU compositing differ slightly between machines. If "stableAcrossRenders" is false, something (Brave, an extension, or a hardened browser) is adding random noise to defeat it.',
  },
  webglInfo: {
    label: 'WebGL version & renderer',
    entropy: 'medium',
    why: 'The standard WebGL strings. In Chrome the RENDERER/VENDOR here are usually generic ("WebKit WebGL"), but the version strings and WebGL2 support still distinguish browsers.',
  },
  webglUnmasked: {
    label: 'WebGL unmasked GPU',
    entropy: 'high',
    why: 'WEBGL_debug_renderer_info reveals your actual GPU and driver path (e.g. "ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, …)"). One of the highest-entropy single values, since it often pins the exact hardware model.',
  },
  webglParams: {
    label: 'WebGL capability limits',
    entropy: 'medium',
    why: 'Max texture sizes, uniform/varying limits, line widths, anisotropy and shader precision. Each GPU/driver combination reports a characteristic set of limits.',
  },
  webglExtensions: {
    label: 'WebGL extensions',
    entropy: 'medium',
    why: 'Supported WebGL extensions. The list depends on GPU, driver and browser version, and its hash is a common component in commercial fingerprinting libraries.',
  },
  webglImage: {
    label: 'WebGL render fingerprint',
    entropy: 'high',
    why: 'A shader-drawn image read back with readPixels and hashed. Floating-point shader math and rasterization differ subtly across GPUs and drivers, which makes this the 3D counterpart of the canvas fingerprint.',
  },
  webgpu: {
    label: 'WebGPU adapter',
    entropy: 'high',
    why: 'The newer WebGPU API exposes adapter vendor and architecture (e.g. "apple" / "metal-3") along with dozens of hardware limits and features. It is an emerging alternative to the WebGL unmasked renderer. Unavailable on insecure (http) pages.',
  },

  // ---------------------------------------------------------------- audio
  audioFingerprint: {
    label: 'AudioContext fingerprint',
    entropy: 'medium',
    why: 'A triangle-wave oscillator is fed through a dynamics compressor in an OfflineAudioContext, and the resulting samples are summed and hashed. Floating-point differences in the audio stack (CPU, OS, browser build) change the low digits. "stableAcrossRenders: false" means audio noise injection is active.',
  },
  audioContext: {
    label: 'Audio hardware properties',
    entropy: 'low',
    why: 'Output sample rate (44.1 kHz vs 48 kHz), latency and max channel count reveal your audio hardware and OS mixer settings.',
  },

  // ---------------------------------------------------------------- fonts
  fonts: {
    label: 'Installed fonts',
    entropy: 'high',
    why: 'Each candidate font is rendered next to the generic monospace/serif/sans-serif fallbacks. If the measured width or height changes, the font is installed. Fonts that ship with Office, Adobe CC, developer tools or language packs make the set highly individual. Real trackers test hundreds to thousands of names.',
  },

  // ---------------------------------------------------------------- media
  mediaQueries: {
    label: 'CSS media features',
    entropy: 'medium',
    why: 'Dark mode, reduced motion, contrast, forced colors, color gamut, HDR, pointer type and hover. These accessibility and display preferences are readable through matchMedia (or pure CSS, with no JavaScript at all).',
  },
  codecs: {
    label: 'Codec support',
    entropy: 'low',
    why: 'canPlayType() answers for common audio/video formats. Shows OS media frameworks and licensed codecs (HEVC, AAC), which differ between Chrome, Chromium, Edge and OS versions.',
  },
  mediaDevices: {
    label: 'Media devices',
    entropy: 'medium',
    why: 'Number of microphones, speakers and cameras. Labels and IDs stay hidden until you grant camera/mic permission, but the counts are visible to any page.',
  },
  speechVoices: {
    label: 'Speech synthesis voices',
    entropy: 'high',
    why: 'The text-to-speech voices list mirrors installed OS voices and language packs, and often includes downloaded premium voices. It is long, varied and needs no permission.',
  },

  // ---------------------------------------------------------------- environment
  storageAPIs: {
    label: 'Storage availability',
    entropy: 'low',
    why: 'Whether localStorage, sessionStorage, IndexedDB and Cache Storage work. Blocked storage marks hardened or unusual configurations. These are also where trackers store regular cookies-style IDs.',
  },
  storageQuota: {
    label: 'Storage quota',
    entropy: 'medium',
    why: 'The quota from navigator.storage.estimate() is derived from free disk space, so it leaks disk size. Incognito windows used to report a much smaller quota, a classic private-mode detector. Volatile: excluded from the combined ID.',
  },
  permissions: {
    label: 'Permission states',
    entropy: 'medium',
    why: 'granted/denied/prompt for camera, mic, notifications, geolocation, etc. Querying is silent. Permissions are per-site, so the extension-page view differs from a website\'s view. Volatile: excluded from the combined ID.',
  },
  touchSupport: {
    label: 'Touch support',
    entropy: 'low',
    why: 'Max touch points and touch-event support separate phones, tablets, touchscreen laptops and desktops. A mismatch with the User-Agent indicates spoofing or emulation.',
  },
  battery: {
    label: 'Battery status',
    entropy: 'low',
    why: 'Charge level and estimated (dis)charge times. Researchers showed in 2015 that these fine-grained values could re-link users across sites over short windows. Firefox and Safari removed the API, but Chrome still exposes it. Volatile: excluded from the combined ID.',
  },
  mathPrecision: {
    label: 'Math library precision',
    entropy: 'low',
    why: 'Transcendental functions (tan, acosh, expm1…) at extreme inputs return slightly different last digits depending on the JS engine and the CPU/OS math library. This identifies engine and platform even under a spoofed User-Agent.',
  },
  jsEngine: {
    label: 'JavaScript engine quirks',
    entropy: 'low',
    why: 'eval.toString() length (33 = V8, 37 = SpiderMonkey/JSC), error message wording, presence of window.chrome and stack-trace limits. Used to verify that the claimed browser matches the real engine.',
  },
  apiSurface: {
    label: 'Web API surface',
    entropy: 'medium',
    why: 'Which newer APIs exist (WebUSB, WebHID, WebGPU, Topics, Shared Storage, built-in AI…). The pattern pins browser family, exact version range, origin trials and enterprise policies.',
  },
  webrtc: {
    label: 'WebRTC ICE candidates',
    entropy: 'medium',
    why: 'WebRTC used to leak your local LAN IP (and your real IP behind a VPN). Chrome now hides host IPs behind random mDNS names (xxxx.local), so seeing raw IPs here means that protection is off. This probe uses no STUN server, so it never reveals your public IP. Volatile: excluded from the combined ID.',
  },
};

// Signals trackers use that page JavaScript (and thus this extension) cannot read.
const FP_INVISIBLE = [
  ['IP address & ASN', 'Your IP address, ISP and rough geolocation, seen by every server you connect to.'],
  ['TLS fingerprint (JA3 / JA4)', 'The cipher suites, extensions and their order in your TLS ClientHello identify the browser/OS TLS stack.'],
  ['HTTP/2 & header fingerprint', 'HTTP/2 SETTINGS frames, pseudo-header order and the exact header ordering and casing in requests.'],
  ['Accept-* headers', 'Accept, Accept-Language and Accept-Encoding header values sent with every request.'],
  ['TCP/IP stack (p0f)', 'Initial TTL, window size and TCP options reveal the underlying OS.'],
  ['Behavioral signals', 'Typing cadence, mouse movement and scroll patterns, used heavily by bot detection.'],
  ['Persistent identifiers', 'Cookies, localStorage, ETags, HSTS and cache "supercookies". These are stored rather than derived, so they are not fingerprints, but they are often combined with them.'],
];
