# PetalPal 出事处理手册

出事时照着做，不用现想。上面是一次性准备，中间是每天检查，下面是按情况处理。

---

## 一、一次性准备（上线前做完）

| 要做的事 | 在哪里 | 做法 |
|---|---|---|
| 闪退/报错监控 | sentry.io | 注册（免费档够用），建两个项目：`petalpal-app`（React Native）和 `petalpal-backend`（Node）。手机装 Sentry App，打开推送。 |
| App 的 DSN | expo.dev → petalpal → Environment variables → production | 加 `EXPO_PUBLIC_SENTRY_DSN` = petalpal-app 的 DSN（Plain text 即可，DSN 不是密钥）。 |
| 后端的 DSN | Render → PetalPal_v2 和 petalpal-backend-test → Environment | 加 `SENTRY_DSN` = petalpal-backend 的 DSN。 |
| Sentry 提醒规则 | Sentry → Alerts | 新问题第一次出现就推送；某个问题 1 小时内超过 10 次就推送。 |
| 后端在线监控 | uptimerobot.com 或 betterstack.com | 监控 `https://petalpal-v2.onrender.com/healthz`，每分钟一次，挂了推送到手机。它连数据库一起检查，返回 503 就是数据库或后端出了问题。 |
| App Store 隐私标签 | App Store Connect → App 隐私 | 加上「崩溃数据」和「其他诊断数据」：不与身份关联、不用于追踪、用途是 App 功能。 |
| 手动发布 | App Store Connect → 版本 → 发布方式 | 选「手动发布」，挑一个接下来半天有空的工作日上午再点。 |

DSN 没填时，监控自动关闭，App 照常运行。

---

## 二、上线第一周，每天早晚各看一次

1. **Sentry**：崩溃率（Crash-free sessions，目标 ≥ 99.5%）、有没有新问题。
2. **Render**：PetalPal_v2 的 Metrics，看 5xx 报错、响应时间、内存。
3. **App Store Connect**：TestFlight 和 App Analytics 里的崩溃数。
4. **数据**：新注册数正常吗？AI 花费有没有暴涨？
5. **评论**：App Store 评论、用户反馈。

---

## 三、先判断有多严重

- **P0 马上处理**：大面积闪退、没法登录或注册、数据丢失或错乱、后端挂了、出现安全问题。
- **P1 当天处理**：某个功能坏了，但 App 能用。
- **P2 排进下一版**：小 bug、样式问题。

---

## 四、按情况处理

### 1. 后端挂了 / 5xx 暴涨（P0）
1. Render → PetalPal_v2 → Events，找到上一次正常的部署，点 **Rollback**。
2. 打开 `https://petalpal-v2.onrender.com/healthz`，看到 `{"ok":true}` 就恢复了。
3. 如果是数据库出问题（healthz 返回 503，回滚也没用），看 Render 的 Postgres 状态页。**不要**手动跑删除或修改数据的 SQL。
4. 恢复后在 Sentry 里查原因，修好再部署。

### 2. App 有 bug，是 JS 层面的（P0 / P1，最常见）
不用重新审核，几分钟就能推到所有人手机上：
1. 修好，开 PR，合进 main。
2. 在 `mobile/` 里运行：
   ```bash
   npm run hotfix -- "修了什么，一句话"
   ```
   这个命令固定使用 production 配置，并检查必须连 production 后端，连错了会直接停下。
3. 用户下次打开 App 时下载修复，再下一次打开时生效。在 Sentry 里按 `update` 标签可以看到新版本的报错有没有消失。

**热更新修不了的**：新装带原生代码的包、改 `app.json` 的插件或权限、改图标。这些只能走第 5 条。

### 3. 热更新推错了
马上退回：
```bash
cd mobile && npx eas-cli@27.9.0 update:roll-back-to-embedded --channel production
```
这会让所有人回到 App Store 版本里自带的代码。或者用 `update:republish` 重新发布上一个正常的更新组。

### 4. 某个功能出问题，先关掉它（P0 / P1）
例如塔罗出错，或者朋友留言被人用来骚扰：
1. Render → PetalPal_v2 → Environment，设置 `APP_PAUSED_FEATURES`，值为 `petalTarot`、`friendMessages`，或者 `petalTarot,friendMessages`。
2. 保存后 Render 会自动重启（约 1 分钟）。App 会在下次打开或切回前台时（最多 5 分钟）隐藏这个功能，后端也会拒绝新的请求，旧版本 App 同样生效。
3. 修好后删掉这个变量就恢复了。

### 5. 必须发新版本（原生问题）
1. `mobile/app.json` 里把 `version` 加一（例如 1.0.1 → 1.0.2）。**带原生改动的版本一定要升版本号**，不然热更新会推到不兼容的旧版本上。
2. expo.dev 上把 `PETALPAL_IOS_BUILD_NUMBER` 加一。
3. 打包、提交：
   ```bash
   npx eas-cli@27.9.0 build --platform ios --profile production
   npx eas-cli@27.9.0 submit --platform ios --profile production --latest
   ```
4. 严重问题可以在 App Store Connect 申请**加急审核**（Expedited Review）。
5. 新版上架后，如果旧版本有严重问题，在 Render 设置 `APP_MIN_VERSION_IOS=1.0.2`，旧版本打开后会要求用户更新。

### 6. 要停机维护 / 发公告
Render → PetalPal_v2 → Environment：
- `APP_MAINTENANCE_ZH` 和 `APP_MAINTENANCE_EN`：公告内容。只设置其中一个也行，两种语言都会显示它。
- 默认显示为顶部的小横幅，可以关闭；加上 `APP_MAINTENANCE_BLOCKING=1` 会整屏挡住 App，只适合计划内停机。
- 维护结束后删掉这几个变量。

### 7. 网页版坏了
按 `INTEGRATION_DEPLOYMENT.md` 回滚 Cloudflare Worker 到上一个版本（记录在 release 记忆里）。这个工作流需要你逐步批准。

### 8. 数据出了问题
- 先备份：`pg_dump -Fc` 导出 production 库，存在本机。
- 不要直接删数据。先查清楚影响了哪些账号，写好带检查的 SQL，确认后再执行。
- 涉及用户数据泄露的，按 `SECURITY.md` 处理并通知受影响的用户。

---

## 五、几条铁律

- **热更新只用 `npm run hotfix`**，不要自己手打 `eas update`，否则可能把 TEST 配置推给所有用户。
- **带原生改动必须升版本号**（runtime 跟着 `version` 走）。
- **出事先止血**（回滚、关功能、发公告），再查原因。
- **任何删除操作前先备份、先确认**。
