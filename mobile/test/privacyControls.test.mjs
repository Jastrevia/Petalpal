import assert from 'node:assert/strict';
import test from 'node:test';
import {hookHarness} from './hookHarness.mjs';
import {loadPlantingModules} from './loadPlantingModules.mjs';
const nodes=t=>Array.isArray(t)?t.flatMap(nodes):t&&typeof t==='object'?[t,...nodes(t.props?.children)]:[];
function fixture(component, handler, auth={session:{user:{id:'owner'}}}){
 const hooks=hookHarness(),calls=[];
 const load=loadPlantingModules(undefined,hooks.react,null,false,{
  'react-native':{View:'View',Text:'Text',Switch:'Switch'},'./FeatureUI':{FeatureActionButton:'Action',ui:{}},
  '../../services/auth':{useAuth:()=>auth},
  '../../services/locale':{useAppLocale:()=>auth.experience?.user?.preferredLocale==='zh-Hans'?'zh-Hans':'en'},
  '../../services/api':{apiRequest:async(path,method,body)=>{calls.push({path,method,body});return handler(path,method,body);}},
 });
 const [file,name]=component; let tree=hooks.mount(()=>load('../../features/'+file)[name]());
 return {calls,all:()=>nodes(tree),async flush(){tree=await hooks.flush();},async press(title){const b=nodes(tree).find(n=>n.props?.title===title);assert.ok(b,title);assert.ok(!b.props.disabled,title);await b.props.onPress();tree=await hooks.flush();}};
}
const off={aiProcessing:false,personalization:false,memoryEnabled:false};
const disclosure={version:'ai-2026-10-15',explanation:'Synthetic disclosure',retention:'No retention guarantee',features:[]};
test('AI choices start off, require an explicit save and include the disclosed version',async()=>{
 const f=fixture(['AiPrivacySettings','AiPrivacySettings'],async(path,method,body)=>method==='PUT'?body:path==='/ai/disclosure'?disclosure:off);
 await f.flush();assert.equal(f.calls.filter(c=>c.method==='PUT').length,0);
 const switches=f.all().filter(n=>n.type==='Switch');assert.ok(switches.every(n=>n.props.value===false));
 switches[0].props.onValueChange(true);await f.flush();assert.equal(f.calls.length,2);
 await f.press('Save my AI choices');assert.deepEqual(JSON.parse(JSON.stringify(f.calls.at(-1).body)),{...off,aiProcessing:true,disclosureVersion:disclosure.version});
 await f.press('Withdraw all AI consent');assert.deepEqual(JSON.parse(JSON.stringify(f.calls.at(-1).body)),{...off,disclosureVersion:disclosure.version});
});
test('saves send only the three flags even though the API returns the whole consent record',async()=>{
 // Real GET/PUT responses include id, userId, termsVersion and timestamps; PUT rejects any of them (HTTP 400).
 const record=c=>({id:'consent-1',userId:'owner',termsVersion:'ai-2026-10-15',...c,grantedAt:null,revokedAt:null,createdAt:'2026-10-16T00:00:00.000Z',updatedAt:'2026-10-16T00:00:00.000Z'});
 const f=fixture(['AiPrivacySettings','AiPrivacySettings'],async(path,method,body)=>method==='PUT'?record({aiProcessing:body.aiProcessing,personalization:body.personalization,memoryEnabled:body.memoryEnabled}):path==='/ai/disclosure'?disclosure:record(off));
 await f.flush();
 for(const index of [0,1,2]){f.all().filter(n=>n.type==='Switch')[index].props.onValueChange(true);await f.flush();}
 const all={aiProcessing:true,personalization:true,memoryEnabled:true};
 await f.press('Save my AI choices');assert.deepEqual(JSON.parse(JSON.stringify(f.calls.at(-1).body)),{...all,disclosureVersion:disclosure.version});
 await f.press('Save my AI choices');assert.deepEqual(JSON.parse(JSON.stringify(f.calls.at(-1).body)),{...all,disclosureVersion:disclosure.version});
 assert.ok(f.all().filter(n=>n.type==='Switch').every(n=>n.props.value===true));
});
test('disclosure failure prevents a grant but never prevents withdrawal',async()=>{
 const f=fixture(['AiPrivacySettings','AiPrivacySettings'],async(path,method,body)=>{if(method==='PUT')return body;if(path==='/ai/disclosure')throw Error('Temporarily unavailable');return off;});
 await f.flush();assert.equal(f.all().find(n=>n.props?.title==='Save my AI choices').props.disabled,true);
 await f.press('Withdraw all AI consent');assert.deepEqual(JSON.parse(JSON.stringify(f.calls.at(-1).body)),off);
});
test('community acceptance is an explicit versioned request with recoverable error',async()=>{
 let fail=true;const f=fixture(['CommunityGuidelines','CommunityGuidelines'],async(_path,method,body)=>{if(method!=='PUT')return {accepted:false};if(fail)throw Error('Offline');return body;});
 await f.flush();assert.equal(f.calls.length,1);await f.press('I accept the Community Guidelines');
 assert.ok(f.all().some(n=>n.props?.children==='Offline'));fail=false;await f.press('I accept the Community Guidelines');
 assert.equal(f.calls.at(-1).body.accepted,true);assert.equal(f.calls.at(-1).body.version,'petalpal-community-2026-10-15');
 assert.ok(f.all().some(n=>n.props?.children==='Accepted'));
});
test('account deletion requires confirmation; cancellation and retry are operable',async()=>{
 let count=0;const f=fixture(['DeleteAccountSettings','DeleteAccountSettings'],async()=>{}, {deleteAccount:async()=>{count++;throw Error('Sign in again');}});
 assert.equal(count,0);await f.press('Delete Account');await f.press('Cancel deletion');assert.equal(count,0);
 assert.ok(!f.all().some(n=>n.props?.title==='Permanently delete my account'));
 await f.press('Delete Account');await f.press('Permanently delete my account');assert.equal(count,1);
 assert.ok(f.all().some(n=>n.props?.children==='Sign in again'));await f.press('Permanently delete my account');assert.equal(count,2);
});
test('the language follows the account and switches the whole app through updateLocale',async()=>{
 const saved=[];const auth={session:{user:{id:'owner'}},experience:{user:{preferredLocale:'en'}},
  updateLocale:async locale=>{saved.push(locale);auth.experience.user.preferredLocale=locale;}};
 const f=fixture(['ReportLanguageSettings','ReportLanguageSettings'],async()=>{throw Error('No direct API call');},auth);
 await f.flush();
 const button=title=>f.all().find(n=>n.props?.title===title);
 assert.equal(button('✓ English').props.disabled,true);
 await f.press('简体中文');
 assert.deepEqual(saved,['zh-Hans']);assert.equal(f.calls.length,0);
 assert.equal(button('✓ 简体中文').props.disabled,true);
 await f.press('English');assert.deepEqual(saved,['zh-Hans','en']);
});
test('a language that fails to save says so once and is not retried',async()=>{
 let tries=0;const auth={session:{user:{id:'owner'}},experience:{user:{preferredLocale:'en'}},updateLocale:async()=>{tries++;throw Error('Profile update failed');}};
 const f=fixture(['ReportLanguageSettings','ReportLanguageSettings'],async()=>({}),auth);
 await f.flush();
 const text=()=>f.all().filter(n=>n.type==='Text').map(n=>[].concat(n.props.children).join('')).join(' | ');
 await f.press('简体中文');
 assert.match(text(),/The language was not saved/);assert.equal(tries,1);
 assert.ok(f.all().find(n=>n.props?.title==='✓ English'));
});
