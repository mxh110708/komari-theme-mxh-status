# MXH personal build

This private archive tracks the personal Komari theme derived from
`jianmomo/komari-theme-Glassmorphism-Enhanced`.

## Personal changes

- Load historical node metrics through Komari RPC2 with a REST compatibility fallback.
- Normalize Komari 1.3.x RPC2 load records from UUID-grouped objects to chart-ready arrays.
- Default node order: DMIT, VMISS, YUNYOO, BreadCloud.
- Keep unmatched nodes in their original Komari `weight` order.
- Add a seven-day preset to the ping history chart when the server retention window allows it.
- Use the managed `siteIconUrl` setting for both the browser favicon and header icon, with the bundled favicon as fallback.
- Link the managed theme page to Komari's built-in local favicon uploader, while retaining an optional external URL override.
- Present managed settings with section summaries, concise help text, collapsible advanced references, and consistently formatted option labels.
- Use Chinese for ordinary interface labels, choices, and help text. Retain protocol names, standard units, and product names; do not use pinyin as a display label.
- Accept Chinese managed choices and custom metric names while preserving compatibility with existing English configuration values.

## Chinese interface update (2.2.2-mxh.5)

Managed choices now use Chinese labels, including automatic/light/dark mode,
card/list view, card size, globe style, shortcuts, and background type. Automatic
mode still switches at 07:00 and 19:00 Beijing time; this is not OS theme detection.
HTTP and WebSocket retain their protocol names.

Custom overview metrics and shortcut lists accept the Chinese names shown in the
managed settings, separated by either Chinese or ASCII commas. Existing field
keys and English choices remain valid at runtime. Existing node names, provider
names, credentials, API keys, and stored preferences are not translated.

The installation script maps only recognized saved choices to their Chinese
equivalents. It preserves all other fields, including custom node ordering, and
checks them against the pre-install database snapshot. Unknown saved choices
fail the installation rather than silently selecting a different mode.

The default order can be changed in the managed theme setting
`homeDefaultNodeOrder` with a comma-separated list of node-name keywords.

Use Komari's built-in local favicon uploader from the managed theme page for a
self-hosted icon. The optional `siteIconUrl` setting accepts an HTTPS image URL
or a site-relative path beginning with `/`; when set it overrides the locally
uploaded icon. Leave it empty to use `/favicon.ico`, with the bundled theme icon
as the final fallback.

## Build

```powershell
bun install --no-save
bun run lint
bun run build
```

The build produces `komari-theme-Glassmorphism-build-<commit>.zip` for import in
the Komari theme manager.

This repository must not contain Komari databases, backups, administrator
credentials, Cloudflare Tunnel tokens, VPS archives, or private keys.
