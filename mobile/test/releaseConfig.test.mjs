import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
const {validateStoreEnvironment}=createRequire(import.meta.url)('../release-config.cjs');
const fixture={PETALPAL_IOS_BUNDLE_ID:'org.petalpal.fixture',PETALPAL_ANDROID_PACKAGE:'org.petalpal.fixture',PETALPAL_IOS_BUILD_NUMBER:'1',PETALPAL_ANDROID_VERSION_CODE:'1',EXPO_PUBLIC_API_BASE_URL:'https://api.test.invalid',EXPO_PUBLIC_PRIVACY_POLICY_URL:'https://policy.test.invalid/privacy',EXPO_PUBLIC_TERMS_URL:'https://policy.test.invalid/terms',EXPO_PUBLIC_DELETION_URL:'https://policy.test.invalid/deletion',EXPO_PUBLIC_SUPPORT_URL:'https://policy.test.invalid/support',EXPO_PUBLIC_FIREBASE_API_KEY:'fixture',EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN:'fixture.invalid',EXPO_PUBLIC_FIREBASE_PROJECT_ID:'fixture',EXPO_PUBLIC_FIREBASE_APP_ID:'fixture'};
test('store configuration fails closed for missing, insecure or placeholder metadata',()=>{
 assert.throws(()=>validateStoreEnvironment({}),/owner-verified/);
 assert.throws(()=>validateStoreEnvironment(fixture),/HTTPS/);
 const valid={...fixture};for(const k of Object.keys(valid).filter(k=>k.endsWith('_URL')))valid[k]=valid[k].replace('test.invalid','petalpal.test');
 assert.throws(()=>validateStoreEnvironment(valid),/production API/);
 Object.assign(valid,{EXPO_PUBLIC_API_BASE_URL:'https://petalpal-v2.onrender.com',EXPO_PUBLIC_FIREBASE_PROJECT_ID:'petalpal-b212c',EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN:'petalpal-b212c.firebaseapp.com'});
 assert.doesNotThrow(()=>validateStoreEnvironment(valid));
 for(const url of ['http://petalpal.test','https://127.0.0.1','https://user:secret@petalpal.test','https://petalpal.test/?token=fixture'])assert.throws(()=>validateStoreEnvironment({...valid,EXPO_PUBLIC_API_BASE_URL:url}));
 assert.throws(()=>validateStoreEnvironment({...valid,EXPO_PUBLIC_NATIVE_SECURITY_TEST:'1'}));
});
test('store builds refuse every backend but production (TEST Render, TEST Firebase, look-alike hosts)',()=>{
 const prod={...fixture,EXPO_PUBLIC_PRIVACY_POLICY_URL:'https://policy.petalpal.test/privacy',EXPO_PUBLIC_TERMS_URL:'https://policy.petalpal.test/terms',EXPO_PUBLIC_DELETION_URL:'https://policy.petalpal.test/deletion',EXPO_PUBLIC_SUPPORT_URL:'https://policy.petalpal.test/support',
  EXPO_PUBLIC_API_BASE_URL:'https://petalpal-v2.onrender.com',EXPO_PUBLIC_FIREBASE_PROJECT_ID:'petalpal-b212c',EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN:'petalpal-b212c.firebaseapp.com'};
 assert.doesNotThrow(()=>validateStoreEnvironment(prod));
 assert.doesNotThrow(()=>validateStoreEnvironment({...prod,EXPO_PUBLIC_API_BASE_URL:'https://petalpal-v2.onrender.com/'}));
 for(const url of ['https://petalpal-backend-test.onrender.com','https://petalpal-v2.onrender.com.evil.test','https://staging.petalpal-v2.onrender.com','https://petalpal-v2.onrender.com:8443','https://petalpal-v2.onrender.com/api'])
  assert.throws(()=>validateStoreEnvironment({...prod,EXPO_PUBLIC_API_BASE_URL:url}),/production API/,url);
 assert.throws(()=>validateStoreEnvironment({...prod,EXPO_PUBLIC_FIREBASE_PROJECT_ID:'petalpal-integration-test'}),/production Firebase/);
 assert.throws(()=>validateStoreEnvironment({...prod,EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN:'petalpal-integration-test.firebaseapp.com'}),/production Firebase/);
});
