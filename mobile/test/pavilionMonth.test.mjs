import assert from 'node:assert/strict';
import test from 'node:test';
import {loadPlantingModules} from './loadPlantingModules.mjs';
const {pavilionMonth:month,pavilionPages:pages,pavilionAutoOpen:autoOpen}=loadPlantingModules()('../../../services/pavilionMonth');
const plain=value=>JSON.parse(JSON.stringify(value));
const reports=[{id:'jan-old',type:'monthly',periodKey:'2025-01'},{id:'feb',type:'monthly',periodKey:'2026-02'},
 {id:'jan',type:'monthly',periodKey:'2026-01'},{id:'week',type:'weekly',periodKey:'2026-01-05'}];
test('every sign month selects only its existing monthly reports; empty means empty',()=>{
 for(let m=1;m<=12;m++){
  assert.equal(month(String(m)),m);
  const result=plain(pages(reports,'monthly',m));assert.ok(result.every(r=>Number(r.periodKey.slice(5,7))===m));
  if(m>2)assert.deepEqual(result,[]);
 }
 assert.deepEqual(plain(pages(reports,'monthly',1)).map(r=>r.id),['jan-old','jan']);
});
test('weekly subview and ordinary Pavilion entrance retain their existing pages',()=>{
 assert.deepEqual(plain(pages(reports,'weekly',1)).map(r=>r.id),['week']);
 assert.equal(pages(reports,'monthly',null).length,3);
 for(const value of [undefined,'','0','13','1.5','bad',['1']])assert.equal(month(value),null);
});
test('a month entrance auto-opens only once its assets are ready, and once per requested month',()=>{
 assert.equal(autoOpen(4,false,null),false,'cold start: spine textures still loading');
 assert.equal(autoOpen(4,true,null),true,'assets ready: open the requested month');
 assert.equal(autoOpen(4,true,4),false,'asset rebuild, re-render or a closed book never reopens it');
 assert.equal(autoOpen(4,false,4),false);
 assert.equal(autoOpen(9,true,4),true,'another month requested: open it');
 assert.equal(autoOpen(null,true,null),false,'ordinary Pavilion entrance never auto-opens');
});
