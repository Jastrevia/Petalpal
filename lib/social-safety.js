import { canVisitGarden, withSocialLocks, requireSocialPair, SocialAccessError, hiddenSocialIds } from './garden-access.js';
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const categories = new Set(['HARASSMENT', 'HATE_SPEECH', 'SELF_HARM', 'SPAM', 'PRIVACY', 'OTHER']);
const publicUser = { id: true, name: true, avatar: true, accountId: true };
export function installSocialSafety(app, { db, realtime, clearVisitors }) {
  app.get('/users/me/blocks', async (req, res) => {
    const after = req.query.after;
    if (after !== undefined && !validId(after)) return res.status(400).json({error:'Invalid page cursor'});
    const rows = await db.userBlock.findMany({ where: { blockerId: req.auth.userId, ...(after ? {blockedId:{gt:after}} : {}) }, include: { blocked: { select: publicUser } }, orderBy: { blockedId: 'asc' }, take: 101 });
    res.json({users:rows.slice(0,100).map(row => row.blocked),nextCursor:rows.length>100?rows[99].blockedId:null});
  });
  app.put('/users/me/blocks/:targetId', async (req, res) => {
    const a = req.auth.userId, b = req.params.targetId;
    if (!validId(b) || a === b) return res.status(400).json({ error: 'Invalid block target' });
    await realtime.withRevocation({ friends: [a,b] }, () => withSocialLocks(db, [a,b], async tx => {
      if (!await tx.user.findUnique({ where: { id: b }, select: { id: true } })) throw new SocialAccessError('User not found', 404);
      await tx.userBlock.upsert({ where: { blockerId_blockedId: { blockerId: a, blockedId: b } }, create: { blockerId: a, blockedId: b }, update: {} });
      await tx.friendship.deleteMany({ where: { OR: [{ userId: a, friendId: b }, { userId: b, friendId: a }] } });
      await tx.friendRequest.deleteMany({ where: { OR: [{ senderId: a, receiverId: b }, { senderId: b, receiverId: a }] } });
      await clearVisitors(tx, a, b);
    }));
    res.json({ success: true });
  });
  app.delete('/users/me/blocks/:targetId', async (req, res) => {
    const a = req.auth.userId, b = req.params.targetId;
    if (!validId(b)) return res.status(400).json({ error: 'Invalid block target' });
    await withSocialLocks(db, [a,b], tx => tx.userBlock.deleteMany({ where: { blockerId: a, blockedId: b } }));
    res.json({ success: true });
  });
  app.post('/reports', async (req, res) => {
    const { reportedUserId, messageId, category } = req.body;
    // Structured references only. Never copy private Journal/Event text to reports.
    if (Object.keys(req.body).some(k => !['reportedUserId','messageId','category'].includes(k)) ||
        !categories.has(category) || (!reportedUserId && !messageId) ||
        (reportedUserId !== undefined && !validId(reportedUserId)) || (messageId !== undefined && !validId(messageId))) {
      return res.status(400).json({ error: 'Choose a user or message and a report reason. Do not include private entries.' });
    }
    const actor = req.auth.userId;
    await withSocialLocks(db, [actor], async tx => {
      let target = reportedUserId || null;
      if (messageId) {
        const message = await tx.message.findUnique({ where: { id: messageId }, select: { userId: true, flower: { select: { userId: true } } } });
        const owner = message && await tx.user.findUnique({ where: { id: message.flower.userId }, select: { id: true, allowGardenVisits: true } });
        if (!message || !await canVisitGarden(tx, owner, actor) || (target && target !== message.userId)) throw new SocialAccessError('Reported content is unavailable', 404);
        target = message.userId;
      }
      if (target === actor || !await tx.user.findUnique({ where: { id: target }, select: { id: true } })) throw new SocialAccessError('Reported content is unavailable', 404);
      const where = { reporterId: actor, reportedUserId: target, messageId: messageId || null, category };
      if (await tx.report.findFirst({ where: { ...where, status: { in: ['PENDING','REVIEWING'] } }, select: { id: true } })) return;
      if (await tx.report.count({ where: { reporterId: actor, createdAt: { gte: new Date(Date.now() - 86400000) } } }) >= 20) throw new SocialAccessError('Report limit reached. Try again later.', 429);
      await tx.report.create({ data: where });
    });
    res.status(202).json({ accepted: true });
  });
  // Who liked what on Garden messages: only messages in Gardens this person may visit.
  const visibleMessages = async (tx, actor, ids) => {
    const messages = await tx.message.findMany({ where: { id: { in: ids } }, select: { id: true, userId: true, flower: { select: { userId: true } } } });
    const owners = new Map();
    for (const ownerId of new Set(messages.map(message => message.flower.userId))) {
      const owner = await tx.user.findUnique({ where: { id: ownerId }, select: { id: true, allowGardenVisits: true } });
      owners.set(ownerId, Boolean(owner) && await canVisitGarden(tx, owner, actor));
    }
    return messages.filter(message => owners.get(message.flower.userId));
  };
  const reactionSummary = async (tx, actor, ids) => {
    const [likes, mine] = await Promise.all([
      tx.messageReaction.groupBy({ by: ['messageId'], where: { messageId: { in: ids }, kind: 'LIKE' }, _count: { _all: true } }),
      tx.messageReaction.findMany({ where: { messageId: { in: ids }, userId: actor }, select: { messageId: true, kind: true } }),
    ]);
    const counts = new Map(likes.map(row => [row.messageId, row._count._all]));
    const own = new Map(mine.map(row => [row.messageId, row.kind]));
    return Object.fromEntries(ids.map(id => [id, { likes: counts.get(id) ?? 0, mine: own.get(id) ?? null }]));
  };
  app.get('/messages/reactions', async (req, res) => {
    const ids = typeof req.query.ids === 'string' ? [...new Set(req.query.ids.split(','))] : [];
    if (!ids.length || ids.length > 50 || !ids.every(validId)) return res.status(400).json({ error: 'Unsupported request' });
    const visible = await visibleMessages(db, req.auth.userId, ids);
    res.json({ reactions: await reactionSummary(db, req.auth.userId, visible.map(message => message.id)) });
  });
  app.put('/messages/:messageId/reaction', async (req, res) => {
    const { messageId } = req.params, actor = req.auth.userId, { kind } = req.body ?? {};
    if (!validId(messageId) || Object.keys(req.body ?? {}).some(key => key !== 'kind') || !['LIKE', 'DISLIKE'].includes(kind)) return res.status(400).json({ error: 'Unsupported request' });
    const reaction = await withSocialLocks(db, [actor], async tx => {
      const [message] = await visibleMessages(tx, actor, [messageId]);
      // Not your own message, and the first reaction stands.
      if (!message || message.userId === actor) throw new SocialAccessError('Message is unavailable', 404);
      await tx.messageReaction.upsert({ where: { messageId_userId: { messageId, userId: actor } }, create: { messageId, userId: actor, kind }, update: {} });
      return (await reactionSummary(tx, actor, [messageId]))[messageId];
    });
    res.json(reaction);
  });
  app.post('/friends/request', async (req, res) => {
    const a = req.auth.userId, b = req.body.receiverId;
    if (!validId(b) || a === b) return res.status(400).json({ error: 'Invalid receiver' });
    const request = await withSocialLocks(db, [a,b], async tx => {
      await requireSocialPair(tx,a,b);
      if (!await tx.user.findUnique({ where: { id:b }, select: { id:true } })) throw new SocialAccessError('User not found',404);
      if (await tx.friendship.findFirst({ where: { OR: [{userId:a,friendId:b},{userId:b,friendId:a}] } })) throw new SocialAccessError('You are already friends',409);
      if (await tx.friendRequest.findFirst({ where: { OR: [{senderId:a,receiverId:b},{senderId:b,receiverId:a}], status:'pending' } })) throw new SocialAccessError('Friend request already pending',409);
      return tx.friendRequest.upsert({ where: { senderId_receiverId: { senderId:a,receiverId:b } }, create: { senderId:a,receiverId:b,status:'pending' }, update: { status:'pending' }, include: { sender:{select:publicUser},receiver:{select:publicUser} } });
    });
    await realtime.to(`user:${a}`).to(`user:${b}`).emit('friendRequestUpdated',{type:'request-sent',request,senderId:a,receiverId:b});
    res.status(201).json({success:true,message:'Friend request sent',request});
  });
  // No public moderator registration. Operator-managed Firebase UID allowlist.
  app.use('/moderation', (req,res,next) => {
    const allowed = (process.env.MODERATOR_FIREBASE_UIDS || '').split(',').map(v => v.trim()).filter(Boolean);
    if (!allowed.includes(req.auth.firebaseUid)) return res.status(403).json({error:'Moderator access required'});
    res.set('Cache-Control','no-store'); next();
  });
  app.get('/moderation/reports', async (req,res) => {
    const reports = await db.report.findMany({where:{status:{in:['PENDING','REVIEWING']}},orderBy:{createdAt:'asc'},take:50,
      select:{id:true,aiOutputKind:true,aiOutputId:true,reportedUserId:true,messageId:true,category:true,status:true,createdAt:true,
        message:{select:{id:true,text:true,author:true}},reportedUser:{select:publicUser}}});
    res.json(reports); // Deliberately excludes reporter identity and private text.
  });
  app.post('/moderation/reports/:reportId', async (req,res) => {
    const {action} = req.body;
    if (!['dismiss','review-ai','remove-message','restrict-user','restore-user'].includes(action)) return res.status(400).json({error:'Invalid moderation action'});
    const report = await db.report.findUnique({where:{id:req.params.reportId}});
    if (!report) return res.status(404).json({error:'Report not found'});
    if (report.aiOutputKind && ['review-ai','dismiss'].includes(action)) {
      await db.report.update({where:{id:report.id},data:{status:action==='dismiss'?'DISMISSED':'RESOLVED',reviewedAt:new Date(),resolutionNote:action}});
      return res.json({success:true});
    }
    const target = report.reportedUserId;
    if (!target) return res.status(409).json({error:'Target no longer exists'});
    await realtime.withRevocation({userId:target}, () => withSocialLocks(db,[target], async tx => {
      if (action === 'remove-message') {
        if (!report.messageId) throw new SocialAccessError('No message remains',409);
        await tx.message.deleteMany({where:{id:report.messageId,userId:target}});
      }
      if (action === 'restrict-user' || action === 'restore-user') await tx.user.update({where:{id:target},data:{socialRestricted:action==='restrict-user'}});
      await tx.report.update({where:{id:report.id},data:{status:action==='dismiss'?'DISMISSED':'RESOLVED',reviewedAt:new Date(),resolutionNote:action}});
    }));
    res.json({success:true});
  });
}
