# iPhone 内测（TestFlight）操作步骤

分支：`feat/ios-beta`（基于 `main` dd93ffa5，只改 App，不改后端，所以连现在的生产后端就能用）。
包含：游客模式（打开直接进花园）、周报花语卡分享、水面少画一层（画面不变）。
**没有**包含 `feat/weekly-insights-m2`（周报 M2–M5 需要先跑迁移、部署后端，之后再进 App）。

只有下面几步需要主人本人操作（账号、密码、付费、签名都只能本人做）。

## 一次性准备

1. 注册 Apple Developer Program（99 美元/年）：<https://developer.apple.com/programs/>，等苹果开通（有时几小时，有时一两天）。
2. 在 App Store Connect 新建 App：平台 iOS，名字 PetalPal，**Bundle ID 自己定一个**（例如 `com.jastrevia.petalpal`，之后不能改）。
3. Expo：项目属于 Expo 账号 `jeanc66`（`mobile/app.json` 的 `owner`）。用这个账号登录，或者让它把你加进项目。
4. 在 Expo 网站这个项目的 **Environment variables → production** 里填好（`mobile/release-config.cjs` 会检查，少一个就停）：
   `PETALPAL_IOS_BUNDLE_ID`（第 2 步的 Bundle ID）、`PETALPAL_IOS_BUILD_NUMBER`（从 `1` 开始，每次上传 +1）、
   `PETALPAL_ANDROID_PACKAGE`、`PETALPAL_ANDROID_VERSION_CODE`（安卓先随便填一个合法值，例如 `com.jastrevia.petalpal` / `1`）、
   `EXPO_PUBLIC_API_BASE_URL`（生产 Render 后端地址）、`EXPO_PUBLIC_PRIVACY_POLICY_URL`、`EXPO_PUBLIC_TERMS_URL`、
   `EXPO_PUBLIC_DELETION_URL`、`EXPO_PUBLIC_SUPPORT_URL`、四个 `EXPO_PUBLIC_FIREBASE_*`（和网页正式版一样的值）。
   这些值主人自己填，不要发给我。

## 每次打包上传（在你电脑终端里）

```bash
cd ~/dev/Petalpal/.claude/worktrees/ios-beta/mobile
```

```bash
npx eas-cli@latest login
```

```bash
npx eas-cli@latest build --platform ios --profile production --auto-submit
```

- 第一次会问 Apple 账号：选让 EAS 自动管理证书和描述文件，用你的 Apple ID 登录（这一步只能你做）。
- 云端打包大约 15–30 分钟；`--auto-submit` 打完自动上传到 App Store Connect。
- 上传后苹果还要“处理”大约 10–30 分钟，然后在 App Store Connect → TestFlight 里能看到这个版本。

## 发给内测用户

- **内部测试**（最快，不用审核）：TestFlight → Internal Testing → 加人（对方要先加进你的 App Store Connect 团队，最多 100 人）。
- **外部测试**（最多 1 万人，用邮箱或公开链接）：TestFlight → External Testing → 新建组 → 加这个版本 → 第一次要过一次测试审核（通常 1 天内）。
- 测试的人在 iPhone 上装 TestFlight App，点邀请就能装。App Store 上搜不到。

## 内测前请在真机上看一遍

（今晚这台 Mac 没有 Xcode，原生版没在 iPhone 上跑过；网页预览里看过游客模式和水面。）
- 打开直接是花园；点 Events / Friends / Me、信箱、回看亭都会弹出登录页，左上“回到花园”能回来。
- 花仙子走路、荡秋千、进树屋能看；树屋里写日记会要求登录。
- 登录后是自己的花园；退出登录回到游客花园。
- 周报花语卡下面的“分享”：出一张只有卡和周次的图，勾选后才带标题。
- 花园帧率和网页一样或更好（原生 Skia 比网页 WASM 快）；卡顿或闪退请记下手机型号和当时在做什么。
