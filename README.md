# Fingerprint Inspector

A Chrome (Manifest V3) extension that shows the browser-fingerprinting attributes tracking scripts collect, along with an explanation of each one and how much it helps identify you.

## Install

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select this directory

## Use

Open any website and click the toolbar icon. A report opens in a new tab and collects the fingerprint **from inside that website's page**, in the page's own JavaScript world, so you see exactly what a tracker on that site sees. The **Collect from** menu switches to the extension page's own view.

Chrome blocks scripts on `chrome://` pages, the Web Store and the PDF viewer, so the report falls back to the extension page there.

## What it collects (48 attributes)

| Group | Attributes |
|---|---|
| Navigator | User-Agent, UA Client Hints (low + high entropy), platform, vendor, languages, CPU cores, device memory, DNT/GPC, webdriver, plugins, MIME types, network info |
| Screen | resolution, available area, color depth, pixel ratio, orientation, multi-screen, window size |
| Locale | time zone, UTC/DST offsets, Intl settings, formatting samples |
| Graphics | canvas 2D hash (+ image), WebGL vendor/renderer, unmasked GPU, limits, extensions, WebGL render hash (+ image), WebGPU adapter |
| Audio | OfflineAudioContext fingerprint, audio hardware properties |
| Fonts | ~110 fonts detected by text measurement |
| Media | CSS media features, codec support, media device counts, speech voices |
| Environment | storage APIs, storage quota, permission states, touch, battery, math precision, JS engine quirks, API surface, WebRTC ICE candidates |

Each attribute gets a **high / medium / low** rating for identifying power. Attributes marked **volatile** change between visits and are left out of the combined fingerprint ID. Canvas, WebGL and audio are each rendered twice. If the two results differ, the report flags the attribute as **randomized**, which means anti-fingerprinting noise is active (Brave, extensions, etc.).

The report also lists signals that trackers use but JavaScript can't see: IP address, TLS (JA3/JA4), HTTP/2 and header order, and TCP stack.

## Privacy

Everything runs locally and nothing is sent anywhere. The WebRTC probe uses no STUN server, so it never contacts the network. The only permissions are `activeTab` and `scripting`, and the extension can only touch the tab where you clicked the icon.

## Files

- `manifest.json`, `background.js`: clicking the icon opens the report
- `collector.js`: self-contained probe code, also injected into pages
- `explanations.js`: labels, entropy ratings and explanations
- `report.html`, `report.css`, `report.js`: the report UI
