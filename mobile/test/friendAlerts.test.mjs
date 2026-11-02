import assert from 'node:assert/strict';
import test from 'node:test';
import {loadPlantingModules} from './loadPlantingModules.mjs';
import {hookHarness} from './flowerDetail.test.mjs';

function setup(stored={}){
 const server={friends:[{id:'a'},{id:'b'}],incoming:[]},storage={...stored},listeners=[];
 const hooks=hookHarness();
 const load=loadPlantingModules(undefined,hooks.react,{getItem:async k=>storage[k]??null,setItem:async(k,v)=>{storage[k]=v;}},false,{
  './friends':{loadFriends:async()=>server.friends,loadFriendRequests:async()=>({incoming:server.incoming,outgoing:[]})},
  './userRealtime':{subscribeUserRealtime:l=>{listeners.push(l);return()=>{};}},
  'react-native':{AppState:{addEventListener:()=>({remove(){}})}},
 });
 const alerts=load('../../../services/friendAlerts');
 return {server,storage,alerts,listeners,hooks};
}
const settle=async alerts=>{for(let i=0;i<4;i++){await alerts.syncFriendAlerts();await new Promise(r=>setImmediate(r));}};
test('the people already here on a first run are not news; a new friend is, until Friends is left',async()=>{
 const {server,alerts,hooks}=setup();
 alerts.startFriendAlerts('owner');await settle(alerts);
 let tree=hooks.mount(()=>({value:alerts.useFriendAlerts()}));
 assert.deepEqual([...tree.value.newFriends],[]);assert.equal(tree.value.incoming,0);
 server.friends=[...server.friends,{id:'c'}];await settle(alerts);tree=await hooks.flush();
 assert.deepEqual([...tree.value.newFriends],['c']);
 alerts.markNewFriendsSeen();tree=await hooks.flush();
 assert.deepEqual([...tree.value.newFriends],[]);
 await settle(alerts);tree=await hooks.flush();
 assert.deepEqual([...tree.value.newFriends],[],'a later look does not bring the dot back');
 alerts.stopFriendAlerts();
});
test('a request keeps the dot until it is answered; someone accepted here is no news',async()=>{
 const {server,alerts,hooks}=setup();
 alerts.startFriendAlerts('owner');await settle(alerts);
 server.incoming=[{id:'r1',senderId:'d'}];await settle(alerts);
 let tree=hooks.mount(()=>({value:alerts.useFriendAlerts()}));
 assert.equal(tree.value.incoming,1);
 alerts.noteFriendAcceptedHere('d');server.incoming=[];server.friends=[...server.friends,{id:'d'}];await settle(alerts);tree=await hooks.flush();
 assert.equal(tree.value.incoming,0);assert.deepEqual([...tree.value.newFriends],[]);
 alerts.stopFriendAlerts();
});
test('a friend accepted while away counts on the next open, and each account keeps its own list',async()=>{
 const {alerts,hooks}=setup({'petalpal.friends.seen.v1.owner':JSON.stringify(['a'])});
 alerts.startFriendAlerts('owner');await settle(alerts);
 const tree=hooks.mount(()=>({value:alerts.useFriendAlerts()}));
 assert.deepEqual([...tree.value.newFriends],['b']);
 alerts.stopFriendAlerts();
});
