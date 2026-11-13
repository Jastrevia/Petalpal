const DEV_BUNDLE_ID='com.jastrevia.petalpal.dev';
const BUNDLE_ID=/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
// Unset is the store app; 'dev' is the free-signing build. Anything else stops the build rather than guessing.
function appVariant(env) {
 const variant=env.EXPO_PUBLIC_APP_VARIANT;
 if(variant===undefined||variant==='')return 'store';
 if(variant!=='dev')throw new Error('EXPO_PUBLIC_APP_VARIANT must be unset or "dev"');
 return 'dev';
}
// A bundle ID belongs to the first Apple ID that registers it, so a second person signing needs their own (PETALPAL_IOS_DEV_BUNDLE_ID).
function devBundleId(env) {
 const id=env.PETALPAL_IOS_DEV_BUNDLE_ID||DEV_BUNDLE_ID;
 if(!BUNDLE_ID.test(id))throw new Error('Invalid PETALPAL_IOS_DEV_BUNDLE_ID');
 return id;
}
// The one backend a store build may talk to: PetalPal production (Render PetalPal_v2 and its Firebase project).
// A store app on the TEST backend or any other host would ship real people's accounts to the wrong place,
// so anything else stops the build. The same names guard the other way in scripts/ios-device.mjs.
const PRODUCTION_API_HOST='petalpal-v2.onrender.com';
const PRODUCTION_FIREBASE_PROJECT='petalpal-b212c';
function validateStoreEnvironment(env) {
 if(appVariant(env)==='dev')throw new Error('The dev variant cannot be a store build');
 const missing=[];
 const required=['PETALPAL_IOS_BUNDLE_ID','PETALPAL_ANDROID_PACKAGE','PETALPAL_IOS_BUILD_NUMBER','PETALPAL_ANDROID_VERSION_CODE','EXPO_PUBLIC_API_BASE_URL','EXPO_PUBLIC_PRIVACY_POLICY_URL','EXPO_PUBLIC_TERMS_URL','EXPO_PUBLIC_DELETION_URL','EXPO_PUBLIC_SUPPORT_URL','EXPO_PUBLIC_FIREBASE_API_KEY','EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN','EXPO_PUBLIC_FIREBASE_PROJECT_ID','EXPO_PUBLIC_FIREBASE_APP_ID'];
 for(const key of required)if(!env[key])missing.push(key);
 if(missing.length)throw new Error(`Store build needs owner-verified configuration: ${missing.join(', ')}`);
 for(const key of required.filter(k=>k.endsWith('_URL'))){let url;try{url=new URL(env[key]);}catch{}if(!url||url.protocol!=='https:'||url.username||url.password||url.search||url.hash||/localhost|127\.0\.0\.1|\.example(?:$|\.)|\.invalid$/i.test(url.hostname))throw new Error(`Store build requires an approved HTTPS URL: ${key}`);}
 for(const [key,pattern] of [['PETALPAL_IOS_BUNDLE_ID',/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/],['PETALPAL_ANDROID_PACKAGE',/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/]])if(!pattern.test(env[key])||env[key].startsWith('com.example.'))throw new Error(`Invalid approved identifier: ${key}`);
 if(!/^\d+(?:\.\d+){0,2}$/.test(env.PETALPAL_IOS_BUILD_NUMBER)||!/^\d+$/.test(env.PETALPAL_ANDROID_VERSION_CODE)||Number(env.PETALPAL_ANDROID_VERSION_CODE)<1||Number(env.PETALPAL_ANDROID_VERSION_CODE)>2100000000)throw new Error('Invalid store build number');
 if(env.EXPO_PUBLIC_NATIVE_SECURITY_TEST==='1'||env.EXPO_PUBLIC_ENABLE_DEV_TOOLS==='1')throw new Error('Test tools cannot be enabled in store builds');
 const api=new URL(env.EXPO_PUBLIC_API_BASE_URL);
 if(api.hostname!==PRODUCTION_API_HOST||api.port||(api.pathname!=='/'&&api.pathname!==''))throw new Error(`Store builds must use the production API https://${PRODUCTION_API_HOST}`);
 if(env.EXPO_PUBLIC_FIREBASE_PROJECT_ID!==PRODUCTION_FIREBASE_PROJECT||env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN!==`${PRODUCTION_FIREBASE_PROJECT}.firebaseapp.com`)throw new Error(`Store builds must use the production Firebase project ${PRODUCTION_FIREBASE_PROJECT}`);
}
module.exports={appVariant,devBundleId,DEV_BUNDLE_ID,PRODUCTION_API_HOST,PRODUCTION_FIREBASE_PROJECT,validateStoreEnvironment};
