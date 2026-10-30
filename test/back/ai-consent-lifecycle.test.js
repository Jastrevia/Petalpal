import assert from 'node:assert/strict';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { updateAiConsent } from '../../lib/ai-consent.js';
import { PrismaMemoryRepository } from '../../lib/event-memory.js';
import { GroundedReportPersistenceService, PrivateReportRepository } from '../../lib/report-foundation.js';
import { PrismaEventEmbeddingRepository } from '../../lib/semantic-retrieval.js';
import { getEmbeddingProfile, LOCAL_EMBEDDING_PROFILE_KEY } from '../../lib/embedding-profiles.js';
import { createProductionAiWorker } from '../../lib/ai-worker.js';
import { PrismaAiCostGate } from '../../lib/ai-cost-gate.js';

const identity={userId:'alice'};
async function fixture(t){
 const db=new PGlite({parsers:{1114:value=>new Date(`${value}Z`)}});t.after(()=>db.close());
 await db.exec(`
 CREATE TYPE "AIJobType" AS ENUM ('WEEKLY_REPORT','MONTHLY_REPORT','MEMORY_EXTRACTION');
 CREATE TABLE "AiConsent" ("userId" text PRIMARY KEY,"termsVersion" text,"aiProcessing" boolean,"personalization" boolean,"memoryEnabled" boolean,"grantedAt" timestamp,"revokedAt" timestamp,"updatedAt" timestamp(3));
 CREATE TABLE "Event" ("id" text,"ownerId" text,"memoryProcessingAllowed" boolean,PRIMARY KEY("id","ownerId"));
 CREATE TABLE "EventMemory" ("id" text,"ownerId" text,"sourceEventId" text,"summary" text,"topics" json,"eventDate" timestamp,"memoryType" text,"embedding" text,PRIMARY KEY("id","ownerId"),FOREIGN KEY("sourceEventId","ownerId") REFERENCES "Event" ON DELETE CASCADE);
 CREATE TABLE "EventMemoryEmbedding" ("eventMemoryId" text,"ownerId" text,"embedding" text,FOREIGN KEY("eventMemoryId","ownerId") REFERENCES "EventMemory" ON DELETE CASCADE);
 CREATE TABLE "WeeklyReport" ("id" text,"ownerId" text,"summary" text,PRIMARY KEY("id","ownerId"));
 CREATE TABLE "MonthlyReport" (LIKE "WeeklyReport" INCLUDING ALL);CREATE TABLE "YearlyReport" (LIKE "WeeklyReport" INCLUDING ALL);
 CREATE TABLE "EventInsightExtraction" ("id" text PRIMARY KEY,"ownerId" text,"sourceEventId" text,"spans" json,FOREIGN KEY("sourceEventId","ownerId") REFERENCES "Event" ON DELETE CASCADE);
 CREATE TABLE "InsightThread" ("id" text PRIMARY KEY,"ownerId" text,"word" text);
 CREATE TABLE "AIEvidence" ("id" text,"ownerId" text,"sourceMemoryId" text,FOREIGN KEY("sourceMemoryId","ownerId") REFERENCES "EventMemory" ON DELETE CASCADE);
 CREATE TABLE "AIJob" ("id" text PRIMARY KEY,"ownerId" text,"jobType" "AIJobType","resourceId" text,"eventId" text,"idempotencyKey" text,"status" text,"attemptCount" integer,"lockedAt" timestamp(3),"lockedBy" text,"leaseExpiresAt" timestamp,"completedAt" timestamp,"lastError" text);
 CREATE TABLE "AuditEvent" ("id" text PRIMARY KEY);
 INSERT INTO "AuditEvent" VALUES ('paid-attempt-tombstone');
 `);
 for(const owner of ['alice','bob']){
  await db.query(`INSERT INTO "AiConsent" VALUES ($1,'v1',true,true,true,NULL,NULL,'2000-01-01')`,[owner]);
  await db.query('INSERT INTO "Event" VALUES ($1,$2,true)',['event-'+owner,owner]);
  await db.query(`INSERT INTO "EventMemory" VALUES ($1,$2,$3,'synthetic memory','[]','2026-09-15','EVENT','synthetic vector')`,['memory-'+owner,owner,'event-'+owner]);
  await db.query(`INSERT INTO "EventMemoryEmbedding" VALUES ($1,$2,'synthetic vector')`,['memory-'+owner,owner]);
  for(const table of ['WeeklyReport','MonthlyReport','YearlyReport'])await db.query(`INSERT INTO "${table}" VALUES ($1,$2,'synthetic report')`,['report-'+owner,owner]);
  await db.query('INSERT INTO "AIEvidence" VALUES ($1,$2,$3)',['evidence-'+owner,owner,'memory-'+owner]);
  await db.query(`INSERT INTO "EventInsightExtraction" VALUES ($1,$2,$3,'[]')`,['extraction-'+owner,owner,'event-'+owner]);
  await db.query(`INSERT INTO "InsightThread" VALUES ($1,$2,'synthetic')`,['thread-'+owner,owner]);
  await db.query(`INSERT INTO "AIJob" VALUES ($1,$2,'WEEKLY_REPORT','2026-09-14',NULL,'WEEKLY_REPORT:2026-09-14:v1','RUNNING',1,'2000-01-02','old-worker','2099-01-01',NULL,NULL)`,['job-'+owner,owner]);
 }
 let fail=null;
 const tx={$queryRawUnsafe:async(sql,...args)=>(await db.query(sql,args)).rows,
 aiConsent:{async upsert({where,update}){const row=(await db.query(`UPDATE "AiConsent" SET "termsVersion"=$2,"aiProcessing"=$3,"personalization"=$4,"memoryEnabled"=$5,"grantedAt"=$6,"revokedAt"=$7,"updatedAt"=$8 WHERE "userId"=$1 RETURNING *`,[where.userId,update.termsVersion,update.aiProcessing,update.personalization,update.memoryEnabled,update.grantedAt,update.revokedAt,update.updatedAt])).rows[0];return row;}},
 aiJob:{async updateMany({where,data}){return {count:(await db.query(`UPDATE "AIJob" SET "status"=$2,"completedAt"=$3,"lockedAt"=NULL,"lockedBy"=NULL,"leaseExpiresAt"=NULL,"lastError"=$4 WHERE "ownerId"=$1 AND "status" IN ('PENDING','RUNNING') RETURNING "id"`,[where.ownerId,data.status,data.completedAt,data.lastError])).rows.length};}},
 event:{async findFirst({where}){return (await db.query('SELECT * FROM "Event" WHERE "id"=$1 AND "ownerId"=$2',[where.id,where.ownerId])).rows[0]||null;}}};
 for(const [model,table] of Object.entries({weeklyReport:'WeeklyReport',monthlyReport:'MonthlyReport',yearlyReport:'YearlyReport',aiEvidence:'AIEvidence',eventMemory:'EventMemory',eventInsightExtraction:'EventInsightExtraction',insightThread:'InsightThread'})){
  tx[model]={async deleteMany({where}){if(fail===model)throw new Error('synthetic cleanup failure');return {count:(await db.query(`DELETE FROM "${table}" WHERE "ownerId"=$1 RETURNING *`,[where.ownerId])).rows.length};},
   async findFirst({where}){return (await db.query(`SELECT * FROM "${table}" WHERE "ownerId"=$1 AND "id"=$2`,[where.ownerId,where.id])).rows[0]||null;},
   async findMany({where}){return (await db.query(`SELECT * FROM "${table}" WHERE "ownerId"=$1`,[where.ownerId])).rows;}};
 }
 tx.eventMemory.create=async({data})=>(await db.query(`INSERT INTO "EventMemory" ("id","ownerId","sourceEventId","summary","topics","eventDate","memoryType") VALUES ('fresh-memory',$1,$2,$3,$4,$5,$6) RETURNING *`,[data.ownerId,data.sourceEventId,data.summary,JSON.stringify(data.topics),data.eventDate,data.memoryType])).rows[0];
 const prisma={...tx,async $transaction(fn){await db.exec('BEGIN');try{const result=await fn(tx);await db.exec('COMMIT');return result;}catch(e){await db.exec('ROLLBACK');throw e;}}};
 const set=enabled=>updateAiConsent(prisma,{identity,termsVersion:'v1',aiProcessing:enabled,personalization:enabled,memoryEnabled:enabled});
 const count=async(table,owner='alice')=>(await db.query(`SELECT count(*)::int AS n FROM "${table}" WHERE "ownerId"=$1`,[owner])).rows[0].n;
 return {db,prisma,set,count,fail:value=>fail=value};
}
const forbidden=error=>error.code==='AI_FORBIDDEN';
test('revoke gates every memory/report read even when legacy derived rows remain',async t=>{
 const f=await fixture(t);await f.db.exec(`UPDATE "AiConsent" SET "memoryEnabled"=false WHERE "userId"='alice'`);
 const memory=new PrismaMemoryRepository(f.prisma),reports=new PrivateReportRepository(f.prisma);
 for(const read of [()=>memory.getMemoryById({identity,memoryId:'memory-alice'}),()=>memory.listMemoriesForUser({identity}),()=>memory.searchMemoriesForUser({identity,query:'synthetic'}),()=>reports.listSavedReports({identity}),...['Weekly','Monthly','Yearly'].map(type=>()=>reports['get'+type+'ReportById']({identity,reportId:'report-alice'}))])await assert.rejects(read(),forbidden);
 assert.equal(await f.count('EventMemory'),1);
});
test('transactional revoke removes all derived rows, preserves sources/other owner/tombstones, and is idempotent',async t=>{
 const f=await fixture(t);await f.set(false);await f.set(false);
 for(const table of ['EventMemory','EventMemoryEmbedding','AIEvidence','WeeklyReport','MonthlyReport','YearlyReport','EventInsightExtraction','InsightThread']){assert.equal(await f.count(table),0);assert.equal(await f.count(table,'bob'),1);}
 assert.equal(await f.count('Event'),1);assert.equal(await f.count('Event','bob'),1);
 const rows=(await f.db.query('SELECT * FROM "AIJob" ORDER BY "ownerId"')).rows;assert.equal(rows[0].status,'CANCELLED');assert.equal(rows[1].status,'RUNNING');
 assert.equal((await f.db.query('SELECT * FROM "AuditEvent"')).rows.length,1);
 assert((await new PrismaMemoryRepository(f.prisma).getMemoryById({identity:{userId:'bob'},memoryId:'memory-bob'})));
});
test('every cleanup-stage failure rolls consent/job/deletions back together',async t=>{
 for(const model of ['weeklyReport','monthlyReport','yearlyReport','aiEvidence','eventMemory','eventInsightExtraction','insightThread']){
  const f=await fixture(t);f.fail(model);await assert.rejects(f.set(false),/synthetic cleanup failure/);
  assert.equal((await f.db.query(`SELECT * FROM "AiConsent" WHERE "userId"='alice'`)).rows[0].memoryEnabled,true);
  assert.equal((await f.db.query(`SELECT * FROM "AIJob" WHERE "ownerId"='alice'`)).rows[0].status,'RUNNING');
  for(const table of ['EventMemory','EventMemoryEmbedding','AIEvidence','WeeklyReport','MonthlyReport','YearlyReport','EventInsightExtraction','InsightThread'])assert.equal(await f.count(table),1);
 }
});
test('regrant exposes no old state, fresh eligible memory may be regenerated',async t=>{
 const f=await fixture(t);await f.set(false);await f.set(true);const memory=new PrismaMemoryRepository(f.prisma);
 assert.equal(await memory.getMemoryById({identity,memoryId:'memory-alice'}),null);
 for(const type of ['Weekly','Monthly','Yearly'])assert.equal(await new PrivateReportRepository(f.prisma)['get'+type+'ReportById']({identity,reportId:'report-alice'}),null);
 const fresh=await memory.saveMemory({identity,memory:{sourceEventId:'event-alice',summary:'fresh synthetic',eventDate:new Date('2026-09-15')}});assert.equal(fresh.id,'fresh-memory');
 assert.equal((await f.db.query('SELECT * FROM "AuditEvent"')).rows.length,1);
});
test('paused report result cannot recreate data after revoke or revoke/regrant',async t=>{
 for(const regrant of [false,true]){
  const f=await fixture(t),job=(await f.db.query(`SELECT * FROM "AIJob" WHERE "id"='job-alice'`)).rows[0];
  const reportInput={ownerId:'alice',reportType:'WEEKLY',period:{periodKey:'2026-09-14'},aggregates:{ownerId:'alice'},sourceFence:{consentUpdatedAt:new Date('2000-01-01')},evidenceSelection:{ownerId:'alice',evidence:[]}};
  const narrativeResult={ownerId:'alice',reportType:'WEEKLY',periodKey:'2026-09-14',status:'INSUFFICIENT_EVIDENCE',narrative:null,sections:[]};
  await f.set(false);if(regrant)await f.set(true);
  await assert.rejects(new GroundedReportPersistenceService(f.prisma).persist({identity,reportInput,narrativeResult,generationVersion:'v1',job,workerId:'old-worker'}),e=>['AI_FORBIDDEN','AI_JOB_LEASE_LOST','REPORT_SOURCE_STALE'].includes(e.code));assert.equal(await f.count('WeeklyReport'),0);assert.equal(await f.count('AIEvidence'),0);
 }
});
test('late embedding cannot repopulate deleted memory before or after regrant',async t=>{
 const f=await fixture(t),repo=new PrismaEventEmbeddingRepository(f.prisma,LOCAL_EMBEDDING_PROFILE_KEY);await f.set(false);
 const args={identity,memoryId:'memory-alice',inputRevision:1,vector:[1,...Array(383).fill(0)],consentUpdatedAt:new Date('2000-01-01')};
 await assert.rejects(repo.store(args),forbidden);await f.set(true);await assert.rejects(repo.store(args),forbidden);assert.equal(await f.count('EventMemory'),0);assert.equal(await f.count('EventMemoryEmbedding'),0);
});
test('old extraction claim cannot resurrect memory after revoke/regrant',async t=>{
 const f=await fixture(t);const old=(await f.db.query(`SELECT * FROM "AIJob" WHERE "id"='job-alice'`)).rows[0];await f.set(false);await f.set(true);
 f.prisma.event.findFirst=async()=>({id:'event-alice',ownerId:'alice',memoryProcessingAllowed:true,content:'synthetic',processingReady:true});
 const worker=createProductionAiWorker({prisma:f.prisma,embeddingProvider:{describeProfile(){return getEmbeddingProfile(LOCAL_EMBEDDING_PROFILE_KEY);}}});
 await assert.rejects(worker.handlers.MEMORY_EXTRACTION({...old,jobType:'MEMORY_EXTRACTION',eventId:'event-alice'},{workerId:'old-worker'}),e=>e.code==='AI_JOB_LEASE_LOST');assert.equal(await f.count('EventMemory'),0);
});

test('HTTP revoke removes/gates memory and report lists/details, preserves Event and another owner',async t=>{
 const f=await fixture(t);
 const {default:prisma}=await import('../../lib/prisma.js');const {app}=await import('../../server.js');
 const {setFirebaseTokenVerifierForTests}=await import('../../lib/auth.js');
 const originalTransaction=prisma.$transaction,originalUser=prisma.user.findUnique,originalEvent=prisma.event.findFirst;
 prisma.$transaction=fn=>f.prisma.$transaction(fn);prisma.user.findUnique=async()=>({id:'alice'});prisma.event.findFirst=args=>f.prisma.event.findFirst(args);
 setFirebaseTokenVerifierForTests(async()=>({uid:'synthetic-alice',email_verified:true}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(async()=>{prisma.$transaction=originalTransaction;prisma.user.findUnique=originalUser;prisma.event.findFirst=originalEvent;setFirebaseTokenVerifierForTests();await new Promise(r=>server.close(r));});
 const base=`http://127.0.0.1:${server.address().port}`;
 const request=(path,flags)=>fetch(base+path,{method:flags?'PUT':'GET',headers:{Authorization:'Bearer synthetic',...(flags?{'Content-Type':'application/json'}:{})},...(flags?{body:JSON.stringify(flags)}:{})});
 assert.equal((await request('/ai/memories/memory-alice')).status,200);
 assert.equal((await request('/ai/reports/weekly/report-alice')).status,200);
 assert.equal((await request('/users/alice/ai-consent',{aiProcessing:false,personalization:false,memoryEnabled:false})).status,200);
 for(const path of ['/ai/memories/memory-alice','/ai/reports','/ai/reports/weekly/report-alice','/ai/reports/monthly/report-alice']){const response=await request(path);assert.equal(response.status,403);assert.equal((await response.text()).includes('synthetic report'),false);}
 assert.equal((await request('/events/event-alice')).status,200);assert.equal(await f.count('EventMemory','bob'),1);
});

test('any disabled memory prerequisite cleans derived state and direct memory writes fail closed',async t=>{
 for(const field of ['aiProcessing','personalization','memoryEnabled']){
  const f=await fixture(t);await updateAiConsent(f.prisma,{identity,termsVersion:'v1',aiProcessing:true,personalization:true,memoryEnabled:true,[field]:false});
  await assert.rejects(new PrismaMemoryRepository(f.prisma).saveMemory({identity,memory:{sourceEventId:'event-alice',summary:'late',eventDate:new Date()}}),forbidden);
  assert.equal(await f.count('EventMemory'),0);assert.equal(await f.count('Event'),1);
 }
});
test('same-millisecond revoke/regrant advances the consent epoch deterministically',async t=>{
 const f=await fixture(t),now=new Date('2000-01-01');
 const revoke=await updateAiConsent(f.prisma,{identity,termsVersion:'v1',aiProcessing:false,now});
 const grant=await updateAiConsent(f.prisma,{identity,termsVersion:'v1',aiProcessing:true,personalization:true,memoryEnabled:true,now});
 assert(grant.updatedAt>revoke.updatedAt);assert.equal(await f.count('EventMemory'),0);
});
