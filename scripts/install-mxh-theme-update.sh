#!/bin/sh
set -eu

ZIP_PATH="${1:-}"
EXPECTED_SHA256="${2:-}"
THEME_SHORT="GlassmorphismEnhanced"
THEME_VERSION="${3:-}"
DEFAULT_NODE_ORDER="DMIT,VMISS,YUNYOO,BreadCloud"
DATA_DIR="/var/lib/komari/data"
THEME_ROOT="${DATA_DIR}/theme"
THEME_DIR="${THEME_ROOT}/${THEME_SHORT}"
DB_PATH="${DATA_DIR}/komari.db"
BACKUP_ROOT="/var/backups/komari"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR=must_run_as_root" >&2
  exit 1
fi

if [ -z "$ZIP_PATH" ] || [ -z "$EXPECTED_SHA256" ] || [ -z "$THEME_VERSION" ]; then
  echo "ERROR=usage:<zip-path>:<sha256>:<version>" >&2
  exit 1
fi
if [ "${#EXPECTED_SHA256}" -ne 64 ]; then
  echo "ERROR=invalid_sha256" >&2
  exit 1
fi
case "$EXPECTED_SHA256" in
  *[!0-9A-Fa-f]*)
    echo "ERROR=invalid_sha256" >&2
    exit 1
    ;;
esac

for command in python3 sha256sum systemctl tar curl install mktemp find cp mv; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "ERROR=missing_command:${command}" >&2
    exit 1
  fi
done

if [ ! -f "$ZIP_PATH" ]; then
  echo "ERROR=theme_archive_missing" >&2
  exit 1
fi
if [ ! -f "$DB_PATH" ]; then
  echo "ERROR=komari_database_missing" >&2
  exit 1
fi
if ! systemctl is-active --quiet komari.service; then
  echo "ERROR=komari_not_active" >&2
  exit 1
fi

printf '%s  %s\n' "$EXPECTED_SHA256" "$ZIP_PATH" | sha256sum --check --status

install -d -o root -g root -m 0700 "$BACKUP_ROOT"
stage_dir="$(mktemp -d /tmp/komari-theme-stage.XXXXXX)"
stamp="$(date -u +%Y%m%d-%H%M%S)"
backup_path="${BACKUP_ROOT}/komari-before-theme-${stamp}.tar.gz"
db_snapshot="${BACKUP_ROOT}/komari-before-theme-${stamp}.db"
old_theme_backup="${BACKUP_ROOT}/${THEME_SHORT}-before-${stamp}"
mutation_started=0
committed=0

cleanup() {
  exit_code=$?
  trap - EXIT INT TERM

  if [ "$committed" -ne 1 ] && [ "$mutation_started" -eq 1 ]; then
    systemctl stop komari.service >/dev/null 2>&1 || true
    if [ -e "$THEME_DIR" ]; then
      rm -rf -- "$THEME_DIR"
    fi
    if [ -d "$old_theme_backup" ]; then
      install -d -o komari -g komari -m 0755 "$THEME_ROOT"
      mv "$old_theme_backup" "$THEME_DIR"
    fi
    if [ -f "$db_snapshot" ]; then
      cp -a "$db_snapshot" "$DB_PATH"
      chown komari:komari "$DB_PATH"
    fi
    systemctl start komari.service >/dev/null 2>&1 || true
    echo "ROLLBACK=attempted" >&2
  fi

  if [ -n "$stage_dir" ] && [ -d "$stage_dir" ]; then
    rm -rf -- "$stage_dir"
  fi
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

python3 - "$ZIP_PATH" "$stage_dir" "$THEME_SHORT" "$THEME_VERSION" <<'PY'
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import sys
import zipfile

archive_path, stage_path, expected_short, expected_version = sys.argv[1:]
stage = Path(stage_path)

with zipfile.ZipFile(archive_path) as archive:
    entries = archive.infolist()
    if len(entries) > 10_000:
        raise SystemExit("Theme archive contains too many entries")

    names = [entry.filename for entry in entries]
    if len(names) != len(set(names)):
        raise SystemExit("Theme archive contains duplicate paths")

    total_size = 0
    for entry in entries:
        path = PurePosixPath(entry.filename)
        mode = (entry.external_attr >> 16) & 0o170000
        if path.is_absolute() or ".." in path.parts or "\\" in entry.filename:
            raise SystemExit("Theme archive contains an unsafe path")
        if mode == stat.S_IFLNK:
            raise SystemExit("Symbolic links are not allowed")
        if entry.file_size > 128 << 20:
            raise SystemExit("Theme archive contains an oversized file")
        total_size += entry.file_size
        if total_size > 512 << 20:
            raise SystemExit("Theme archive expands beyond the size limit")

    try:
        manifest = json.loads(archive.read("komari-theme.json"))
    except KeyError as error:
        raise SystemExit("komari-theme.json is missing") from error

    short = manifest.get("short", "")
    version = manifest.get("version", "")
    if short != expected_short or not re.fullmatch(r"[A-Za-z0-9_-]+", short):
        raise SystemExit("Unexpected or invalid theme short name")
    if version != expected_version:
        raise SystemExit("Unexpected theme version")
    if "dist/index.html" not in names:
        raise SystemExit("Theme entry page is missing")

    configuration = manifest.get("configuration", {})
    items = configuration.get("data", [])
    if not isinstance(items, list):
        raise SystemExit("Managed theme configuration is invalid")

    textboxes = [
        item.get("name", "")
        for item in items
        if isinstance(item, dict) and item.get("type") == "textbox"
    ]
    if not any('/admin/settings/site' in text for text in textboxes):
        raise SystemExit("Local favicon upload link is missing")

    expected_choices = {
        "themeMode": ("自动", "自动,浅色,深色"),
        "rpcTransportMode": ("HTTP", "HTTP,WebSocket"),
        "defaultViewMode": ("卡片", "卡片,列表"),
        "nodeCardSize": ("紧凑", "紧凑,标准,大型"),
        "earthRenderer": ("立体地球", "立体地球,点阵地球,平面地图"),
        "homeQuickDefaultControl": (
            "默认",
            "默认,月费用,累计流量,上行,下行,峰值,离线,高负载,即将到期",
        ),
        "backgroundType": ("图片", "图片,视频"),
        "networkLatencyRatingMode": ("地理距离", "地理距离,固定阈值"),
    }
    items_by_key = {
        item.get("key"): item
        for item in items
        if isinstance(item, dict) and item.get("key")
    }
    for key, (default, options) in expected_choices.items():
        item = items_by_key.get(key)
        if not item or item.get("default") != default or item.get("options") != options:
            raise SystemExit(f"Managed option formatting is invalid: {key}")

    for entry in entries:
        relative = PurePosixPath(entry.filename)
        target = stage.joinpath(*relative.parts)
        if entry.is_dir():
            target.mkdir(parents=True, exist_ok=True)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        with archive.open(entry) as source, target.open("wb") as destination:
            shutil.copyfileobj(source, destination)
        target.chmod(0o644)
PY

systemctl stop komari.service
mutation_started=1
tar -C /var/lib/komari -czf "$backup_path" data
cp -a "$DB_PATH" "$db_snapshot"

if [ -e "$THEME_DIR" ]; then
  mv "$THEME_DIR" "$old_theme_backup"
fi

install -d -o komari -g komari -m 0755 "$THEME_ROOT"
mv "$stage_dir" "$THEME_DIR"
stage_dir=""
chown -R komari:komari "$THEME_DIR"
find "$THEME_DIR" -type d -exec chmod 0755 {} +
find "$THEME_DIR" -type f -exec chmod 0644 {} +

python3 - "$DB_PATH" "$THEME_SHORT" <<'PY'
import json
import sqlite3
import sys

database, theme = sys.argv[1:]
connection = sqlite3.connect(database)
try:
    connection.execute("BEGIN IMMEDIATE")
    row = connection.execute(
        "SELECT data FROM theme_configurations WHERE short = ?", (theme,)
    ).fetchone()
    if row and row[0]:
        settings = json.loads(row[0])
        if not isinstance(settings, dict):
            raise TypeError("Existing theme configuration is not an object")
    else:
        settings = {}
    def normalize_choice(value):
        if not isinstance(value, str):
            return ""
        return "".join(
            character
            for character in value.strip().casefold()
            if character not in " _-"
        )

    choice_migrations = {
        "networkLatencyRatingMode": ({
            "adaptive": "地理距离",
            "路径自适应": "地理距离",
            "geographic": "地理距离",
            "地理距离": "地理距离",
            "fixed": "固定阈值",
            "固定阈值": "固定阈值",
        }, "地理距离"),
        "themeMode": ({
            "beijing": "自动",
            "beijingtime": "自动",
            "自动": "自动",
            "light": "浅色",
            "浅色": "浅色",
            "dark": "深色",
            "深色": "深色",
        }, "自动"),
        "rpcTransportMode": ({
            "http": "HTTP",
            "websocket": "WebSocket",
        }, "HTTP"),
        "defaultViewMode": ({
            "card": "卡片",
            "卡片": "卡片",
            "list": "列表",
            "列表": "列表",
        }, "卡片"),
        "nodeCardSize": ({
            "compact": "紧凑",
            "紧凑": "紧凑",
            "comfortable": "标准",
            "标准": "标准",
            "large": "大型",
            "大型": "大型",
        }, "紧凑"),
        "earthRenderer": ({
            "realistic": "立体地球",
            "立体地球": "立体地球",
            "cobe": "点阵地球",
            "点阵地球": "点阵地球",
            "tiled": "平面地图",
            "平面地图": "平面地图",
        }, "立体地球"),
        "generalCardPreset": ({
            "basic": "基础",
            "基础": "基础",
            "ops": "运维",
            "运维": "运维",
            "finance": "财务",
            "财务": "财务",
            "traffic": "流量",
            "流量": "流量",
            "full": "完整",
            "完整": "完整",
            "custom": "自定义",
            "自定义": "自定义",
        }, "基础"),
        "homeQuickControlPreset": ({
            "basic": "基础",
            "基础": "基础",
            "traffic": "流量",
            "流量": "流量",
            "ops": "运维",
            "运维": "运维",
            "full": "完整",
            "完整": "完整",
            "custom": "自定义",
            "自定义": "自定义",
        }, "完整"),
        "homeQuickDefaultControl": ({
            "default": "默认",
            "默认": "默认",
            "monthlycost": "月费用",
            "月费用": "月费用",
            "totaltraffic": "累计流量",
            "累计流量": "累计流量",
            "upload": "上行",
            "上行": "上行",
            "download": "下行",
            "下行": "下行",
            "peak": "峰值",
            "峰值": "峰值",
            "offline": "离线",
            "离线": "离线",
            "highload": "高负载",
            "高负载": "高负载",
            "expiring": "即将到期",
            "即将到期": "即将到期",
        }, "默认"),
        "backgroundType": ({
            "image": "图片",
            "图片": "图片",
            "video": "视频",
            "视频": "视频",
        }, "图片"),
    }

    for key, (aliases, _) in choice_migrations.items():
        if key not in settings:
            continue
        normalized = normalize_choice(settings[key])
        if normalized not in aliases:
            raise ValueError(f"Unrecognized saved theme choice: {key}")
        settings[key] = aliases[normalized]

    connection.execute(
        "INSERT INTO configs(key, value) VALUES(?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        ("theme", json.dumps(theme)),
    )
    connection.execute(
        "INSERT INTO theme_configurations(short, data) VALUES(?, ?) "
        "ON CONFLICT(short) DO UPDATE SET data=excluded.data",
        (theme, json.dumps(settings, ensure_ascii=False, separators=(",", ":"))),
    )
    connection.commit()
except Exception:
    connection.rollback()
    raise
finally:
    connection.close()
PY

systemctl start komari.service
sleep 3
systemctl is-active --quiet komari.service
curl --fail --silent --show-error http://127.0.0.1:25774/ping >/dev/null

python3 - "$THEME_DIR" "$DB_PATH" "$THEME_SHORT" "$THEME_VERSION" "$DEFAULT_NODE_ORDER" "$db_snapshot" <<'PY'
import json
from pathlib import Path
import sqlite3
import sys
from urllib.error import HTTPError
from urllib.request import Request, urlopen

theme_dir = Path(sys.argv[1])
database, expected_short, expected_version, expected_order, snapshot_path = sys.argv[2:]

manifest = json.loads((theme_dir / "komari-theme.json").read_text(encoding="utf-8"))
if manifest.get("short") != expected_short or manifest.get("version") != expected_version:
    raise SystemExit("Installed manifest does not match the release")

javascript = "\n".join(
    path.read_text(encoding="utf-8", errors="ignore")
    for path in (theme_dir / "dist").rglob("*.js")
)
if "undefined/records/load" in javascript:
    raise SystemExit("Legacy broken history URL is still present")
if "common:getRecords" not in javascript:
    raise SystemExit("RPC2 history implementation is missing")
if "7 天" not in javascript:
    raise SystemExit("Seven-day ping history preset is missing")
if "siteIconUrl" not in javascript:
    raise SystemExit("Custom site icon implementation is missing")
if "按地理距离评级" not in javascript or "光纤传播 RTT 下限" not in javascript:
    raise SystemExit("Geographical latency rating implementation is missing")
if "komari-theme:latency-baseline:v1:" in javascript or "路径基线学习中" in javascript:
    raise SystemExit("Obsolete path-relative baseline implementation is still present")
configuration = manifest.get("configuration", {})
configuration_items = configuration.get("data", [])
textbox_markup = [
    item.get("name", "")
    for item in configuration_items
    if isinstance(item, dict) and item.get("type") == "textbox"
]
if not any('/admin/settings/site' in markup for markup in textbox_markup):
    raise SystemExit("Local favicon upload link is missing from the manifest")
order_item = next(
    (
        item
        for item in configuration_items
        if isinstance(item, dict) and item.get("key") == "homeDefaultNodeOrder"
    ),
    None,
)
if not order_item or order_item.get("default") != expected_order:
    raise SystemExit("Default node order is missing from the manifest")
icon_item = next(
    (
        item
        for item in configuration_items
        if isinstance(item, dict) and item.get("key") == "siteIconUrl"
    ),
    None,
)
if not icon_item or icon_item.get("default") != "":
    raise SystemExit("Custom site icon setting is missing from the manifest")

expected_saved_choices = {
    "networkLatencyRatingMode": {"地理距离", "固定阈值"},
    "themeMode": {"自动", "浅色", "深色"},
    "rpcTransportMode": {"HTTP", "WebSocket"},
    "defaultViewMode": {"卡片", "列表"},
    "nodeCardSize": {"紧凑", "标准", "大型"},
    "earthRenderer": {"立体地球", "点阵地球", "平面地图"},
    "generalCardPreset": {"基础", "运维", "财务", "流量", "完整", "自定义"},
    "homeQuickControlPreset": {"基础", "流量", "运维", "完整", "自定义"},
    "homeQuickDefaultControl": {
        "默认", "月费用", "累计流量", "上行", "下行",
        "峰值", "离线", "高负载", "即将到期",
    },
    "backgroundType": {"图片", "视频"},
}

connection = sqlite3.connect(database)
try:
    selected_row = connection.execute(
        "SELECT value FROM configs WHERE key = 'theme'"
    ).fetchone()
    config_row = connection.execute(
        "SELECT data FROM theme_configurations WHERE short = ?", (expected_short,)
    ).fetchone()
finally:
    connection.close()

if not selected_row or json.loads(selected_row[0]) != expected_short:
    raise SystemExit("Theme selection was not saved")
if not config_row:
    raise SystemExit("Theme configuration is missing")
settings = json.loads(config_row[0])
snapshot = sqlite3.connect(snapshot_path)
try:
    original_row = snapshot.execute(
        "SELECT data FROM theme_configurations WHERE short = ?", (expected_short,)
    ).fetchone()
finally:
    snapshot.close()
original_settings = json.loads(original_row[0]) if original_row and original_row[0] else {}
if set(settings) != set(original_settings):
    raise SystemExit("Saved theme configuration keys changed unexpectedly")
for key, value in original_settings.items():
    if key not in expected_saved_choices and settings[key] != value:
        raise SystemExit(f"Unrelated saved theme setting changed: {key}")
for key, allowed_values in expected_saved_choices.items():
    if key in settings and settings[key] not in allowed_values:
        raise SystemExit(f"Managed setting migration failed: {key}")

request_id = 0

def rpc(method, params=None):
    global request_id
    request_id += 1
    payload = {"jsonrpc": "2.0", "method": method, "id": request_id}
    if params is not None:
        payload["params"] = params
    request = Request(
        "http://127.0.0.1:25774/api/rpc2",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=10) as response:
        document = json.load(response)
    if "error" in document:
        raise RuntimeError("RPC2 returned an error")
    return document.get("result")

history_api_status = "ok"
try:
    nodes = rpc("common:getNodes")
    if isinstance(nodes, dict) and nodes:
        node_id, node = next(iter(nodes.items()))
        nodes_format = "map"
    elif isinstance(nodes, list) and nodes:
        node = nodes[0]
        node_id = node.get("uuid") if isinstance(node, dict) else None
        nodes_format = "list"
    else:
        raise SystemExit("RPC2 node list is unavailable")
    if not isinstance(node, dict) or not isinstance(node_id, str) or not node_id:
        raise SystemExit("RPC2 node identifier is unavailable")
    records = rpc(
        "common:getRecords",
        {"type": "load", "uuid": node_id, "hours": 4, "max_count": 600},
    )
    history = records.get("records") if isinstance(records, dict) else None
    if isinstance(history, dict):
        history = history.get(node_id)
    if not isinstance(history, list):
        raise SystemExit("RPC2 historical load response is invalid")
    print("NODES_API_FORMAT=" + nodes_format)
    print("NODE_COUNT=" + str(len(nodes)))
except HTTPError as error:
    if error.code != 401:
        raise
    history_api_status = "protected"

print("INSTALLED_VERSION=" + expected_version)
print("SAVED_PREFERENCES=preserved")
print("SEVEN_DAY_PRESET=ok")
print("CUSTOM_SITE_ICON=ok")
print("LOCAL_ICON_UPLOAD_LINK=ok")
print("MANAGED_UI_MIGRATION=ok")
print("GEOGRAPHIC_LATENCY_RATING=ok")
print("HISTORY_API=" + history_api_status)
PY

committed=1
echo "INSTALL=ok"
echo "BACKUP_CREATED=yes"
