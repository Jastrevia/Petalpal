# PetalPal 上架清单（中文可执行版）

> 本文件是"当前可执行"的精简清单，和现状对齐。更详细的英文记录见
> [STORE_SUBMISSION_CHECKLIST.md](STORE_SUBMISSION_CHECKLIST.md)。
> 没人能"保证"过审（苹果审核有主观性），但照这个走通过率会很高。
> 最后更新：2026-10-25。

## 现状速览

| 项目 | 状态 |
|---|---|
| EAS 构建管线（preview APK / production AAB） | ✅ 有 |
| store 构建环境校验（`mobile/release-config.cjs`） | ✅ 有 |
| 法律页：隐私 / 条款 / 删除账号 | ✅ 在线（app.jastrevia.com/legal/） |
| app 内"删除账号"功能 | ✅ 有（苹果强制项） |
| 权限用途说明（相册/麦克风） | ✅ app.json 里写了 |
| **app 图标** | ✅ 已换成 PetalPal 书本美术（iOS 完整书本；安卓圆形只露花+头） |
| **support 页** | ✅ 已加 `mobile/public/legal/support.html`（下次 web 部署后生效） |
| **iOS 隐私清单** | ✅ 已加到 `app.json`（UserDefaults CA92.1；数据类型在 App Store Connect 里填） |
| dev 路由/测试钩子不进生产 | ✅ 已验证（routePolicy 默认拒绝 + `__DEV__` 门 + release-config 挡 test env） |
| bundle id / 包名 / 构建号 | ⚠️ 走 env 变量，需你填真实值（构建时传，不进仓库） |
| EAS submit 配置 | ⚠️ 没配，`eas submit` 或手动上传 |
| splash 启动图 | ⚠️ 还是旧的蓝底小 logo，和新图标不搭（不卡上架，建议之后统一） |
| 安卓自适应图标 | ⚠️ 现为近似版（书本被圆形裁掉）；想保留书本需单独设计一版 |

## 阶段 0：账号（你本人做，花钱 + 等审核）

| # | 事项 | 说明 |
|---|---|---|
| 0.1 | 苹果开发者账号 | $99/年。先定法律主体（Jastrevia / JX Technology 用哪个） |
| 0.2 | Google Play 开发者账号 | $25 一次性。新账号要做身份验证，可能等几天 |
| 0.3 | 确认 bundle id / 包名 | `jeanc66` 这个 Expo 项目和 slug 是历史设置，要确认账号归属和 auth 回调不冲突 |

## 阶段 1：代码/资源侧（我已做完的）

| # | 事项 | 状态 |
|---|---|---|
| 1.1 | 换 app 图标（icon + iOS + 安卓自适应 + favicon） | ✅ 已做（splash 待统一） |
| 1.2 | 做 support 页 | ✅ 已做（待 web 部署生效） |
| 1.3 | 加 iOS 隐私清单 | ✅ 已做 |
| 1.4 | 填 env 真实值：bundle id、包名、构建号、API URL、4 个法律 URL、4 个 Firebase 公钥字段 | ⚠️ **值你给**，构建时传入 |
| 1.5 | 确认构建里没有 dev 路由/测试钩子 | ✅ 已验证 |

> 1.4 的 `EXPO_PUBLIC_SUPPORT_URL` 填 `https://app.jastrevia.com/legal/support.html`
> （web 部署后才可访问）。

## 阶段 2：构建（要 Mac + Xcode，或 EAS 云构建）

| # | 事项 |
|---|---|
| 2.1 | iOS：`eas build --platform ios --profile production`（苹果要 Xcode 26 / iOS 26 SDK） |
| 2.2 | 安卓：`eas build --platform android --profile production`（Google 要 target API 36+） |
| 2.3 | 真机过 `STORE_SUBMISSION_CHECKLIST.md` 里的 native acceptance matrix：启动/登录、删除账号、权限拒绝、离线、无障碍 |

## 阶段 3：商店资料（最容易卡）

| # | 事项 | 注意 |
|---|---|---|
| 3.1 | 截图 | 用签名包真机截，别用 Expo Go 截图 |
| 3.2 | App 隐私问卷 / Data Safety | 如实填：日记文字、照片、语音、邮箱；AI 声明 Cloudflare |
| 3.3 | 年龄分级问卷 | 按实际内容填（成人向，19+） |
| 3.4 | 隐私政策 URL + support URL | 公开 HTTPS，审核会点 |
| 3.5 | 加密导出合规问题 | 标准 HTTPS，一般选"豁免" |
| 3.6 | 分类、语言、上线地区 | — |

## 阶段 4：提交 + 审核备注（决定能否一把过）

| # | 事项 | 为什么关键 |
|---|---|---|
| 4.1 | 给审核员专用测试账号 | 填 App Store Connect，别放代码/文档；账号里不能有真实私人日记 |
| 4.2 | **Cloudflare Access 要让审核员进得去** | 整个 app 在 Access 后面，审核员打不开直接拒。审核期开放或把审核员邮箱加进 Access |
| 4.3 | 审核备注写清楚 | AI 默认关、怎么开；麦克风可跳过；社交怎么举报/拉黑；删除账号在哪 |
| 4.4 | 后端稳定可访问 | 审核期间 Render 别挂 |

## 两个"隐形杀手"

1. ~~图标还是模板~~ → 已换。
2. **Cloudflare Access 挡审核员** → 上架前必须解决审核员访问，否则必拒。
