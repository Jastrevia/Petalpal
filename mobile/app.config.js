const {appVariant,devBundleId,validateStoreEnvironment}=require('./release-config.cjs');
module.exports=({config})=>{
 const env=process.env;
 if(env.EAS_BUILD_PROFILE==='production'||env.PETALPAL_STORE_BUILD==='1')validateStoreEnvironment(env);
 // The dev variant (free Personal Team, docs/usability-testing.md) has its own name, scheme and bundle ID, so it installs beside the store app.
 const dev=appVariant(env)==='dev';
 // OTA hotfixes (EAS Update) reach store builds only; the dev variant never asks the update service.
 const updates=dev?{...config.updates,enabled:false}:config.updates;
 // iOS 27 needs the scene life cycle at launch (plugins/withIosSceneLifecycle.js).
 return {...config,updates,plugins:[...(config.plugins||[]),'./plugins/withIosSceneLifecycle.js'],name:dev?'PetalPal Dev':'PetalPal',...(dev?{scheme:'petalpal-dev'}:{}),
  ios:{...config.ios,...(dev?{bundleIdentifier:devBundleId(env)}:env.PETALPAL_IOS_BUNDLE_ID?{bundleIdentifier:env.PETALPAL_IOS_BUNDLE_ID}:{}),...(env.PETALPAL_IOS_BUILD_NUMBER?{buildNumber:env.PETALPAL_IOS_BUILD_NUMBER}:{}),supportsTablet:true},
  android:{...config.android,...(env.PETALPAL_ANDROID_PACKAGE?{package:env.PETALPAL_ANDROID_PACKAGE}:{}),...(env.PETALPAL_ANDROID_VERSION_CODE?{versionCode:Number(env.PETALPAL_ANDROID_VERSION_CODE)}:{})},
 };
};
