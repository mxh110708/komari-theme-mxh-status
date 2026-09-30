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
Installation checks accept both node arrays and UUID-keyed node maps, as well as
flat and UUID-grouped load history, matching the theme's runtime compatibility.

The default order can be changed in the managed theme setting
`homeDefaultNodeOrder` with a comma-separated list of node-name keywords.

Use Komari's built-in local favicon uploader from the managed theme page for a
self-hosted icon. The optional `siteIconUrl` setting accepts an HTTPS image URL
or a site-relative path beginning with `/`; when set it overrides the locally
uploaded icon. Leave it empty to use `/favicon.ico`, with the bundled theme icon
as the final fallback.

## Path-relative latency ratings (2.2.2-mxh.6)

Latency remains the actual measured value. In the default adaptive mode, every
node and probe task has an independent reference; this separates carriers,
IPv4/IPv6, and different destinations without guessing from a visitor IP or a
country flag. The display uses the path's P10 over up to seven days of successful
records. At least 30 valid observations spanning six hours are required. Until
then, successful samples are neutral and marked as learning; failed samples
remain red. Packet/probe failure rates keep their existing independent scale.

For reference B, the four rating limits are B + max(15 ms, 10% B),
B + max(35 ms, 25% B), B + max(65 ms, 50% B), and B + max(100 ms, 100% B).
These are theme display heuristics, not an industry standard or estimates of
physical distance. A stable detour can still have good relative stability;
compare the unchanged millisecond values to assess absolute responsiveness.

Each browser keeps a validated path-specific reference that can decrease but
does not automatically rise with congestion. Cached references expire after
30 days without fresh qualifying observations. If a route or destination
permanently changes, increase the managed `networkLatencyBaselineVersion` value
to explicitly relearn. No credentials or raw historical records are stored in
this additional cache. The `networkLatencyRatingMode` setting can restore the
legacy fixed thresholds. Card and list views both use path-specific references;
list colors report the worst path grade within each displayed time bucket.

The long-window request is shared across nodes and refreshed every 30 minutes;
the existing recent-history refresh remains once per minute. Existing metrics,
theme preferences, ordering, icons, transport selection, and proxy settings are
not changed by the grading mode.

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
