import assert from 'node:assert/strict';
import test from 'node:test';
import {loadPlantingModules} from './loadPlantingModules.mjs';
import {hookHarness} from './flowerDetail.test.mjs';
const nodes=t=>Array.isArray(t)?t.flatMap(nodes):t&&typeof t==='object'?[t,...nodes(t.props?.children)]:[];
test('report UI chooses reason, sends reference only and acknowledges; block is separate',async()=>{
 const calls=[]; const hooks=hookHarness();
 const load=loadPlantingModules(undefined,hooks.react,{getItem:async()=>null},false,{
  fetch:async(url,options)=>{calls.push({url,body:options.body ? JSON.parse(options.body) : null});return {ok:true,status:202,json:async()=>({accepted:true})};},
  'react-native':{View:'View',Text:'Text',Modal:'Modal',Pressable:'Pressable',ScrollView:'ScrollView',ActivityIndicator:'Spinner',StyleSheet:{create:x=>x,absoluteFill:{},hairlineWidth:1}},'./FeatureUI':{FeatureActionButton:'Action',ui:{}},
  '../avatars/UserAvatar':{UserAvatar:'UserAvatar'},
  './PanelTheme':{usePanelTheme:()=>({theme:{surface:'#fff',gold:'#000',text:'#000'}})},
 });
 load('../../../services/api').configureApi({apiBaseUrl:'',getAccessToken:async()=>'fixture'});
 const {SafetyActions}=load('../../features/SafetyActions');
 let tree=hooks.mount(()=>SafetyActions({userId:'b',messageId:'m'}));
 async function press(title){const b=nodes(tree).find(n=>n.props?.title===title);assert.ok(b,title);b.props.onPress();tree=await hooks.flush();}
 await press('Report message');await press('HARASSMENT');
 assert.equal(calls[0].url,'/reports');assert.deepEqual(calls[0].body,{messageId:'m',category:'HARASSMENT'});
 // The acknowledgement stays in the sheet until Done; the row is refreshed only then.
 assert.ok(nodes(tree).some(n=>n.props?.children==='Report received. Thank you.'));
 await press('Report message');await press('Block user');assert.equal(calls.length,1,'blocking asks first');await press('Yes, block');assert.equal(calls[1].url,'/users/me/blocks/b');
 assert.ok(nodes(tree).some(n=>/^User blocked\./.test(n.props?.children)));
});
