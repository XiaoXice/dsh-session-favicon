# Changelog

## 1.1.0 — 2026-11-11

- **按标签页取会话状态**：客户端通过在 `conversation.composer.dock`（`scope: 'session'`）注册的
  空渲染座席读取 `props.sessionId`，只从宿主快照里取 `sessions[sessionId]` 这一行。
  修掉多开标签页时所有图标同步刷新（都读了 `aggregate`）的问题。
- **明暗模式**：合成时保留 `link` 上的 `media`，两套 favicon（黑鲸鱼 / 白鲸鱼）各自用各自的底图
  叠加；徽标按明暗分别上底板与描边，白鲸鱼身上与暗色标签栏里都清晰。
- 自检句柄 `window.__DSH_SESSION_FAVICON__` 增加 `schemes` / `preferredScheme`。
- 插件行图标改为中间调，明暗主题下都可见。

## 1.0.0 — 2026-11-11

- 首个版本：宿主半边订阅 `agent/status`、`agent/error`、`api-session/error`、`api-session/status`、
  `approval/request`、`user-questions/request`，维护每会话 `idle / running / asking / done / error`
  状态机，并用同源 JSON 路由 `/dsh-session-favicon.json` 暴露快照。
- 客户端半边把页面原 favicon 抓进 canvas，在右下角 3/5 区域叠加徽标（转圈 / 绿点 / 橙黄点 / 红点），
  `idle` 时原样还原。
