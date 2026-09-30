# MXH Status

面向中文监控场景的 Komari 主题，由 [mxh110708](https://github.com/mxh110708) 维护。

MXH Status 延续毛玻璃界面，在此基础上完善中文文案、后台外观设置、历史数据兼容性与网络质量展示。重点是清晰呈现真实监控数据，而不是改变检测结果或掩盖线路问题。

## 主要功能

- **中文界面**：普通标签、选项和说明使用规范中文；保留 HTTP、WebSocket、IPv4、IPv6 等技术名称。
- **统一外观设置**：在 Komari 后台的「MXH Status 外观」入口配置主题模式、数据刷新、首页模块、节点卡片和背景。
- **可配置总览**：选择总览指标、排列顺序和快捷筛选项，支持卡片与列表视图及自定义节点顺序。
- **真实网络历史**：按运营商与 IP 协议展示延迟和探测失败比例；缺少记录时显示无数据，不补造样本。
- **地理距离评级**：同地区、同检测目标使用同一公式，不因某台服务器长期绕路而放宽标准。
- **历史数据兼容**：优先使用 Komari RPC2，兼容节点数组、节点映射及分组历史记录；必要时回退 REST 接口。
- **图标与背景**：支持 Komari 本地上传的站点图标，以及可选的外部图标、图片或视频背景。
- **节点详情**：查看负载、内存、流量和检测历史；保留 7 天检测图表选项，实际数据范围由主控保留策略决定。
- **地球与地图**：支持立体地球、点阵地球和平面地图，可独立调整相关显示选项。

## 网络评级如何计算

延迟数值始终是检测结果，不做除以二、历史归一化或其他显示修正。

默认采用「地理距离」模式：根据机房与检测目标的城市参考坐标计算大圆距离，并以光纤传播时间为参考，使用统一裕量划分等级。同城市路径的 CN2 GIA、163 等线路共用阈值，绕路或拥塞造成的高延迟仍会降低评价。

以广东（广州参考点）↔ 洛杉矶为例：优秀上限 170 ms，良好上限 195 ms，一般上限 240 ms，较差上限 295 ms；超过 295 ms 或检测失败显示为「差」。

这些阈值是主题的显示策略，不是行业标准，也不代表实际海缆长度。未知或有冲突的地理位置不会被猜测为某国中心点：成功样本保持中性显示，并提示补充坐标。后台也可选择旧版「固定阈值」模式。

「丢包」栏反映监控任务的探测失败比例，不能直接等同于所有实际业务流量的丢包率。地理距离评级不改变该比例。

算法、坐标覆盖范围及高级配置见 [实现说明](./MXH-CUSTOM.md#geographical-latency-ratings-222-mxh8)。

## 安装与更新

1. 从本仓库的 [Releases](https://github.com/mxh110708/komari-theme-mxh-status/releases) 下载 `komari-theme-mxh-status-build-*.zip`。
2. 登录 Komari 后台，进入「主题 → 主题管理」。
3. 首次安装时上传主题并设为当前主题；更新已有主题时使用更新入口上传新包。
4. 打开「MXH Status 外观」检查设置，刷新前台页面。

不要解压后重新打包，也不要将整个源码压缩包作为主题上传。发布包包含主题清单、预览图和构建后的前端文件。

原毛玻璃增强版的内部标识 `GlassmorphismEnhanced` 保持不变，以便沿用已保存的外观设置。项目名称、主题展示名称和发布包名称已改为 MXH Status。

仓库提供的 [维护安装脚本](./scripts/install-mxh-theme-update.sh) 适用于既有的 systemd 主控部署：校验包摘要、创建服务器本地备份、保留原设置，并为内置后台顶部标题添加兼容适配。它依赖特定部署路径，执行前应检查环境；不适用于直接复制到任意 Docker 部署中运行。

## 使用注意

- 自动外观模式按北京时间切换：07:00–18:59 使用浅色，其余时段使用深色，不是跟随操作系统外观。
- 默认使用 HTTP 获取数据。选择 WebSocket 前，应确认反向代理支持连接升级。
- 图标地址留空时使用主控已上传的站点图标；指定外部地址后优先使用该地址。
- 网络质量展示需要在主控创建检测任务。地理位置自动识别支持洛杉矶、圣何塞、法兰克福、广东／广州等明确名称，也可在后台配置坐标匹配规则。
- 地球位置展示与延迟等级判定是不同功能；延迟等级不使用访客出口位置或节点 IP 在线定位结果。
- 主题不会修改服务器路由、代理出口、系统代理或监控任务，也不能保证零丢包。

## 兼容性

当前维护版本已在 Komari `1.5.0-fix1` 上验证。历史版本的 RPC2／REST 兼容代码继续保留，但不代表所有旧版或未来版本均经过完整验证。

缺少权限、接口能力或历史记录时，界面显示对应的无数据状态，不伪造正常结果。Komari 客户端版本与主题版本独立管理。

## 本地开发

使用 Bun，项目固定工具版本为 `1.3.14`；Node.js 要求 `^20.19.0` 或 `>=22.12.0`。

```bash
bun install --no-save
bun run dev
```

提交前检查并构建：

```bash
bun run lint
bun run build
```

构建输出为 `dist/` 和 `komari-theme-mxh-status-build-<commit>.zip`。生产预览可使用 `bun run preview`。

技术栈：Vue 3、Vite、Pinia、reka-ui、Tailwind CSS v4、ECharts，以及 globe.gl／Three.js／COBE 地图组件。

## 反馈与安全

通过本仓库的 [Issues](https://github.com/mxh110708/komari-theme-mxh-status/issues) 提交问题。请说明主控与主题版本、浏览器、复现步骤，以及经过脱敏的截图。

不要提交节点 Token、管理员密码、私钥、数据库、备份、Cloudflare Tunnel Token 或完整私有配置。公开示例不应包含真实节点地址或标识。

## 上游来源与许可

MXH Status 是独立维护的衍生主题，不是 Komari 官方主题。感谢原项目的设计与实现：

- [Komari Monitor](https://github.com/komari-monitor/komari)
- [Glassmorphism Enhanced · jianmomo](https://github.com/jianmomo/komari-theme-Glassmorphism-Enhanced)
- [Glassmorphism · sanrokamlan](https://github.com/sanrokamlan-prog/komari-theme-Glassmorphism)
- Komari Emerald 原始主题，以及 [Komari Naive · Tony Liu](https://github.com/tonyliuzj/komari-naive)

本项目采用 [MIT 许可证](./LICENSE)，保留上游版权声明，并记录 MXH Status 的修改版权。
