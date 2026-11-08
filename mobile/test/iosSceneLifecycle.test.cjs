const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { adoptSceneLifecycle, SCENE_MANIFEST } = require('../plugins/withIosSceneLifecycle.js');

// plugins/withIosSceneLifecycle.js: iOS 27 needs the scene life cycle at launch. The generated
// AppDelegate keeps its factory but no longer makes the window; SceneDelegate does, from the scene.
const TEMPLATE = `internal import Expo
import React

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let factory = ExpoReactNativeFactory(delegate: delegate)
    reactNativeFactory = factory

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
`;

test('the app delegate keeps its factory, the scene delegate makes the window', () => {
  const out = adoptSceneLifecycle(TEMPLATE);
  assert.match(out, /class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider \{/);
  assert.doesNotMatch(out, /UIWindow\(frame: UIScreen\.main\.bounds\)/);
  assert.doesNotMatch(out, /startReactNative/);
  assert.match(out, /reactNativeFactory = factory/);
  assert.match(out, /class SceneDelegate: ExpoAppSceneDelegate \{\}/);
  assert.equal(adoptSceneLifecycle(out), out, 'a second prebuild changes nothing');
});

test('a changed Expo template stops the build instead of shipping an app that crashes on iOS 27', () => {
  assert.throws(() => adoptSceneLifecycle(TEMPLATE.replace('window = UIWindow(frame: UIScreen.main.bounds)', 'window = makeWindow()')),
    /update the plugin/);
});

test('Info.plist declares one window scene handled by SceneDelegate', () => {
  assert.equal(SCENE_MANIFEST.UIApplicationSupportsMultipleScenes, false);
  assert.deepEqual(SCENE_MANIFEST.UISceneConfigurations.UIWindowSceneSessionRoleApplication,
    [{ UISceneConfigurationName: 'Default Configuration', UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate' }]);
});

test('the installed Expo provides the scene delegate this relies on', () => {
  const expo = require('expo/package.json').version.split('.').map(Number);
  assert.ok(expo[0] > 57 || (expo[0] === 57 && expo[2] >= 31), `expo ${expo.join('.')} has ExpoAppSceneDelegate`);
  assert.ok(fs.existsSync(path.join(path.dirname(require.resolve('expo/package.json')), 'ios/AppDelegates/ExpoAppSceneDelegate.swift')));
});
