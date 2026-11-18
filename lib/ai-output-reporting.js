import { notifyStaff } from './staff-notify.js';
import { withSocialLocks, SocialAccessError } from './garden-access.js';
const types = {event:'event',emotion:'emotionResult',weekly:'weeklyReport',monthly:'monthlyReport',yearly:'yearlyReport'};
export function installAiOutputReporting(app,db) {
 app.post('/ai-output-reports',async(req,res)=>{
  const {kind,outputId,category}=req.body;
  if(!Object.hasOwn(types,kind) || typeof outputId!=='string' || !/^[A-Za-z0-9_-]{1,128}$/.test(outputId) || !['HARASSMENT','HATE_SPEECH','SELF_HARM','PRIVACY','OTHER'].includes(category) || Object.keys(req.body).some(k=>!['kind','outputId','category'].includes(k))) return res.status(400).json({error:'Select an AI output and reason; do not include private text'});
  let created=false;
  await withSocialLocks(db,[req.auth.userId],async tx=>{
   const ownerField=kind==='emotion'?'userId':'ownerId';
   if(!await tx[types[kind]].findFirst({where:{id:outputId,[ownerField]:req.auth.userId},select:{id:true}})) throw new SocialAccessError('Output not found',404);
   const where={reporterId:req.auth.userId,aiOutputKind:kind,aiOutputId:outputId,category};
   if(await tx.report.findFirst({where:{...where,status:{in:['PENDING','REVIEWING']}},select:{id:true}}))return;
   if(await tx.report.count({where:{reporterId:req.auth.userId,createdAt:{gte:new Date(Date.now()-86400000)}}})>=20)throw new SocialAccessError('Report limit reached. Try again later.',429);
   await tx.report.create({data:where});created=true;
  });if(created)void notifyStaff('AI_REPORT',category);res.status(202).json({accepted:true});
 });
}
