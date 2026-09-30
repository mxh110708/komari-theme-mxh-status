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

## Geographical latency ratings (2.2.2-mxh.7)

The default `地理距离` mode replaces the per-server historical baselines from
2.2.2-mxh.6. All nodes, carriers, and protocols use the same distance formula.
CN2 GIA, 163 and other routes between the same cities receive identical limits:
better routing can score better, while sustained detours cannot redefine normal.
Measured millisecond values and the independent probe-failure scale do not change.

For great-circle distance d in kilometres, the approximate fibre propagation
round-trip lower bound T is d / 100 milliseconds (200 km/ms fibre speed).
The four inclusive grade limits are rounded to whole milliseconds:

| Grade | Upper limit                               |
| ----- | ----------------------------------------- |
| 优秀  | 1.5 T + 15 ms                             |
| 良好  | 1.8 T + 25 ms                             |
| 一般  | 2.2 T + 35 ms                             |
| 较差  | 2.8 T + 45 ms                             |
| 差    | Above the fourth limit, or a failed probe |

This is one explicit theme display policy, not an industry standard. T is a
physical reference, not measured one-way latency or the actual cable length.
The multipliers and fixed margins are universal; no carrier or historical RTT
can change them. The fibre-speed approximation is consistent with the
[Duke explanation of propagation in silica fibre](https://www.today.duke.edu/2022/04/web-surfing-feels-instantaneous).

City names and unambiguous city tokens in node/task names identify locations.
Built-in reference points currently cover Los Angeles (LA/LAX), San Jose (SJC),
Frankfurt (FRA), and Guangdong/Guangzhou. Guangdong probes use Guangzhou as a
clearly labelled regional reference, not an assertion of their exact rack site.
Coordinates are based on Wikidata [Q65](https://www.wikidata.org/wiki/Q65),
[Q16553](https://www.wikidata.org/wiki/Q16553),
[Q1794](https://www.wikidata.org/wiki/Q1794) and
[Q16572](https://www.wikidata.org/wiki/Q16572).
No country centroid, visitor location, IP-geolocation query, RTT history, or
route-brand matching is used to derive rating limits.

`networkLatencyNodeLocations` and `networkLatencyTaskLocations` accept optional
JSON arrays of `{match, label, latitude, longitude}`. A case-insensitive name
substring selects a coordinate override; it does not define a private threshold.
Coordinates must be finite and in valid ranges. Invalid configuration, unknown
locations or conflicting matching coordinates leave successful probes neutral
with a configuration hint; failures remain red. A known country flag contradicting
an inferred city also prevents automatic grading. Explicit coordinates take
precedence. Do not put addresses, node UUIDs or credentials in public examples.

Card tooltips expose both regions, approximate distance and all actual limits.
List colors report the worst individual geographical path grade per time bucket.
The legacy `固定阈值` option remains available. Installation migrates saved
`路径自适应` choices to `地理距离`, preserving all unrelated preferences.
Old baseline caches and `networkLatencyBaselineVersion` are no longer read;
there is no learning period or extra seven-day history query. Existing recent
history continues to refresh once per minute through shared requests.

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
