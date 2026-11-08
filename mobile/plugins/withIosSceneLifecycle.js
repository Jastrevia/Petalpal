// iOS 27 stops an app at launch unless it uses the scene-based life cycle. Expo SDK 57 ships the
// scene delegate (ExpoAppSceneDelegate, expo >= 57.0.31) but its app template still starts React
// Native from the app delegate, so the generated ios/ project is adjusted here on every prebuild:
//   - AppDelegate provides its React Native factory (ExpoReactNativeFactoryProvider) and no longer
//     makes the window itself; SceneDelegate (an ExpoAppSceneDelegate) makes it from the scene.
//   - Info.plist declares that one-window scene.
// The scene life cycle exists since iOS 13, so the app's iOS 16.4 minimum is unaffected.
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const WINDOW_START = /\n#if os\(iOS\) \|\| os\(tvOS\)\n {4}window = UIWindow\(frame: UIScreen\.main\.bounds\)\n {4}factory\.startReactNative\(\n {6}withModuleName: "main",\n {6}in: window,\n {6}launchOptions: launchOptions\)\n#endif\n/;
const SCENE_DELEGATE = `
// iOS 27: the window and React Native start from the scene (plugins/withIosSceneLifecycle.js).
class SceneDelegate: ExpoAppSceneDelegate {}
`;

function adoptSceneLifecycle(source) {
  if (source.includes('class SceneDelegate: ExpoAppSceneDelegate')) return source;
  if (!/class AppDelegate: ExpoAppDelegate \{/.test(source) || !WINDOW_START.test(source)) {
    throw new Error('withIosSceneLifecycle: the generated AppDelegate.swift changed; update the plugin before building for iOS 27.');
  }
  return source
    .replace('class AppDelegate: ExpoAppDelegate {', 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {')
    .replace(WINDOW_START, '\n    // The window is made by SceneDelegate when the scene connects.\n')
    + SCENE_DELEGATE;
}

const SCENE_MANIFEST = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [{
      UISceneConfigurationName: 'Default Configuration',
      UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
    }],
  },
};

module.exports = function withIosSceneLifecycle(config) {
  config = withAppDelegate(config, mod => {
    if (mod.modResults.language !== 'swift') throw new Error('withIosSceneLifecycle expects a Swift AppDelegate.');
    mod.modResults.contents = adoptSceneLifecycle(mod.modResults.contents);
    return mod;
  });
  return withInfoPlist(config, mod => {
    mod.modResults.UIApplicationSceneManifest = SCENE_MANIFEST;
    return mod;
  });
};
module.exports.adoptSceneLifecycle = adoptSceneLifecycle;
module.exports.SCENE_MANIFEST = SCENE_MANIFEST;
