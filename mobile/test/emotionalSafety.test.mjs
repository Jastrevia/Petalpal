import assert from 'node:assert/strict';
import test from 'node:test';
import {loadPlantingModules} from './loadPlantingModules.mjs';
const {immediateSupportHint,GENERAL_SUPPORT}=loadPlantingModules()('../../../services/emotionalSafety');
test('immediate-danger hints are supportive, local and do not block saving or claim emergency monitoring',()=>{
 for(const text of ['I am going to hurt myself tonight','I cannot keep myself safe','我今晚要自杀','我刚服药过量'])assert.ok(immediateSupportHint(text));
 assert.match(immediateSupportHint('I will kill myself now'),/still save/);
 assert.match(GENERAL_SUPPORT,/local emergency/);
});
test('ordinary distress, trauma disclosure, past/negated risk and figurative language remain ordinary writing',()=>{
 for(const text of ['I feel sad and anxious','I need help after abuse','I am not going to kill myself tonight','I used to hurt myself','I will kill time now','我很难过，想找人说话','我不想伤害自己','I am worried about a friend'])assert.equal(immediateSupportHint(text),null,text);
});
const {safetyConcern,supportLines}=loadPlantingModules()('../../../services/emotionalSafety');
test('words of suicide or self-harm bring the caring window, in English and Chinese',()=>{
 for(const text of ['I want to die','i wanna die','I just want to kill myself','Thinking about suicide again','I feel suicidal','I wish I were dead','everyone would be better off without me','I want to end my life','there is no reason to live','I don’t want to wake up','I can\'t go on','I took an overdose','I keep cutting myself','thinking of jumping off the bridge','I cannot keep myself safe',
  '我想死','好想死','我真的想死了','我不想活了','活不下去了','活着没意思','我想自杀','轻生的念头','我想结束自己的生命','想跳楼','我又割腕了','吃了一瓶安眠药','我想伤害自己','一了百了','撑不下去了','我今晚要自杀','我刚服药过量','我想自殺','不想活'])
  assert.equal(safetyConcern(text),'self_harm',text);
});
test('words of killing or hurting someone say to call the police',()=>{
 for(const text of ['I killed someone','I just killed my husband','I murdered him','I stabbed her','I want to kill him','I am going to shoot them','I will hurt someone','how to poison someone',
  '我杀人了','我杀了人','我把他杀了','我想杀了他','我要杀人','我打死了他','我捅了她','报复社会','我今天杀了我老公','我殺人了'])
  assert.equal(safetyConcern(text),'harm_others',text);
});
test('being hurt or in danger gets the safety window',()=>{
 for(const text of ['my husband hits me','he raped me','I was sexually assaulted','someone is following me','I am in danger','I don\'t feel safe','我被家暴了','老公打我','我被强奸了','有人跟踪我','有人要杀我','救救我','我被打了'])
  assert.equal(safetyConcern(text),'being_harmed',text);
});
test('everyday figures of speech stay ordinary writing',()=>{
 for(const text of ['','I feel sad and anxious','I killed it at the presentation','I will kill time now','killing time before class','this is to die for','I am dying of laughter','I shot him a text','I hurt myself at the gym','I cut myself shaving','we watched Suicide Squad','what a suicide mission',
  '笑死我了','累死了','热死了','气死我了','想死你了','想死我了','我很难过，想找人说话','我不想死','不想活动','杀毒软件','杀青了','跳楼价','我被打动了','看了一部杀人案的电影','玩杀人游戏','剧本杀','打疫苗','今天打卡'])
  assert.equal(safetyConcern(text),null,text);
});
test('the numbers offered follow the device time zone, and never invent one',()=>{
 assert.equal(supportLines('Asia/Shanghai').crisis.number,'12356');assert.equal(supportLines('Asia/Shanghai').emergency,'110');
 assert.equal(supportLines('America/Vancouver').crisis.number,'988');assert.equal(supportLines('America/Vancouver').emergency,'911');
 assert.equal(supportLines('Europe/London').crisis.number,'116123');assert.equal(supportLines('Australia/Sydney').emergency,'000');
 for(const zone of ['Africa/Lagos','America/Sao_Paulo']){assert.equal(supportLines(zone).emergency,null);assert.equal(supportLines(zone).crisis,null);}
});
