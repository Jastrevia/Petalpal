// Local preview only (npm run web:local). Served by scripts/web-local/start.mjs before the app loads;
// never bundled into the app. Sign-in and every API answer are synthetic: nothing here reaches
// Firebase, the PetalPal servers or real people. Sign in with preview@example.invalid / preview-only.
(function () {
  const API = 'https://api.synthetic.invalid';
  const nativeFetch = window.fetch.bind(window);
  const uid = 'local-preview-owner', email = 'preview@example.invalid', password = 'preview-only';
  const user = { id: uid, name: 'Local Preview', avatar: '🦋', email, timezone: 'America/Vancouver', preferredLocale: 'en', aiConsent: true };
  // People to find and friend requests, so every state of Friends → Requests can be tried.
  const ago = days => new Date(Date.now() - days * 86400e3).toISOString();
  const people = [
    { id: 'p-jeanc', name: 'JeanC', accountId: 'PP29240943', avatar: '🌷' }, { id: 'p-jeanchou', name: 'JeanChou', accountId: 'PP20731856', avatar: '🪻' },
    { id: 'p-jeanflower', name: 'JeanC_Flower', accountId: 'PP33671204', avatar: '🌸' }, { id: 'p-jeanclover', name: 'JeanClover', accountId: 'PP29840122', avatar: '🍀' },
    { id: 'p-jeanc1212', name: 'JeanC1212', accountId: 'PP44122788', avatar: '🌼' }];
  let incomingRequests = [{ id: 'r-star', senderId: 'p-star', receiverId: uid, status: 'pending', createdAt: ago(1),
    sender: { id: 'p-star', name: 'Star Night', accountId: 'PP55667788', avatar: '🌙' } }];
  const outgoingRequests = [
    { id: 'r-jeanclover', senderId: uid, receiverId: 'p-jeanclover', status: 'pending', createdAt: ago(1), receiver: people[3] },
    { id: 'r-jeanchou', senderId: uid, receiverId: 'p-jeanchou', status: 'pending', createdAt: ago(2), receiver: people[1] }];
  const json = (data, status = 200, delay = 0) => new Promise(resolve => setTimeout(() => resolve(new Response(JSON.stringify(data),
    { status, headers: { 'Content-Type': 'application/json' } })), delay));
  const token = () => {
    const now = Math.floor(Date.now() / 1000);
    const encode = v => btoa(JSON.stringify(v)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: uid, user_id: uid, aud: 'petalpal-synthetic',
      iss: 'https://securetoken.google.com/petalpal-synthetic', email, email_verified: true, iat: now, auth_time: now,
      exp: now + 3600, firebase: { sign_in_provider: 'password' } })}.synthetic`;
  };
  const day = offset => { const d = new Date(); d.setDate(d.getDate() - offset); return d.toISOString().slice(0, 10); };
  let petalDrawn = null;
  const petalTopics = [['FORTUNE', 'Today’s fortune'], ['DIRECTION', 'The way ahead'], ['LOVE', 'Love'], ['WORK', 'Work & study'],
    ['PEOPLE', 'People around you']].map(([id, label]) => ({ id, label }));
  let redemptions = [];
  const journals = [[3, 'A slow morning with tea and the window open.'], [12, 'Walked home the long way.'], [35, 'Started a new notebook.']]
    .map(([offset, content], i) => ({ id: 'c' + i, localDate: day(offset), createdAt: day(offset) + 'T18:00:00.000Z',
      journal: { id: 'j' + i, content }, emotionResult: null, flower: null }));
  const report = (id, type, periodKey) => ({ id, type, periodKey, periodStartUtc: '', periodEndUtc: '', createdAt: '', status: 'COMPLETE' });
  const reports = [report('w1', 'weekly', '2026-10-12'), report('w2', 'weekly', '2026-10-19'), report('m9', 'monthly', '2026-09')];
  const detail = id => ({ id, summary: 'A gentle week of small routines and quiet walks.', eventCount: 3,
    topTopics: [{ topic: 'garden', count: 2 }], narrativeSections: [], trendSignals: {} });
  const friend = 'local-friend';
  const friendFlower = { id: 'ff1', userId: friend, name: 'Sunflower', speciesCode: 'SUNFLOWER', mood: 'SUNNY_BLOOM', img: 'sunflower.png', worldX: 607, worldY: 1081, regionId: `Land${day(6).slice(5, 7)}`,
    createdAt: day(6) + 'T18:00:00.000Z', supportCount: 1, sourceType: 'EVENT', sourceEventId: 'fe1',
    supportState: { supportedToday: false, canSupport: true }, messages: [] };
  let signedIn = false, blocked = false, checkedInToday = false;
  // Events saved in this preview: each grows a flower; AI "reads" it a few seconds later.
  const ownFlowers = [], events = new Map();
  // Flowers already planted in every land (small 1-3, 5, 6; medium 4, 7-9; large 10-12), at spots
  // the app's own validator accepts. Their spot lives on the "server" and never moves.
  const title = code => code.toLowerCase().split('_').map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
  for (const [i, [month, code, x, y]] of [[1,"TULIP",1268,510],[1,"HYDRANGEA",1040,510],[1,"SUNFLOWER",1230,510],[2,"LAVENDER",1054,799],[2,"POPPY",1054,867],[3,"DAISY",1402,707],[3,"BLUEBELL",1402,775],[3,"ANEMONE",1345,792],[4,"GERBERA_DAISY",1415,134],[4,"SNOWDROP",1358,151],[4,"PETUNIA",1358,219],[4,"WHITE_ROSE",1301,168],[5,"YELLOW_DAFFODIL",1596,255],[5,"CHAMOMILE",1539,272],[6,"ASTER",1861,349],[6,"GENTIAN",2070,349],[6,"COREOPSIS",2070,417],[7,"HEATHER",2265,646],[7,"BIRD_OF_PARADISE",2265,714],[7,"OLIVE",2208,663],[7,"DANDELION",2208,731],[8,"CHINESE_VIOLET_CRESS",2167,1312],[8,"YELLOW_RAPESEED_FLOWER",2167,1380],[8,"TULIP",2110,1261],[9,"HYDRANGEA",1320,1167],[9,"SUNFLOWER",1320,1235],[9,"LAVENDER",1263,1116],[9,"POPPY",1263,1184],[10,"DAISY",607,945],[10,"BLUEBELL",607,1081],[10,"ANEMONE",607,1149],[10,"GERBERA_DAISY",550,1098],[10,"SNOWDROP",550,1166],[11,"PETUNIA",466,785],[11,"WHITE_ROSE",466,853],[11,"YELLOW_DAFFODIL",409,802],[11,"CHAMOMILE",409,870],[12,"ASTER",275,515],[12,"GENTIAN",275,583],[12,"COREOPSIS",218,668]].entries()) {
    const mm = String(month).padStart(2, '0');
    ownFlowers.push({ id: 'g' + i, userId: uid, name: title(code), speciesCode: code, mood: 'PEACEFUL_BLOOM', img: '',
      createdAt: `2026-${mm}-15T18:00:00.000Z`, meaning: 'A preview flower', supportCount: i % 3, worldX: x, worldY: y, regionId: `Land${mm}` });
  }
  // Today's plantings: deleting a flower never gives one back.
  let plantedToday = 0;
  let consent = { aiProcessing: false, personalization: false, memoryEnabled: false, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' };
  const EMOTIONS = { en: ['calm', 'grateful', 'a little tired'], zh: ['平静', '感激', '有点累'] };
  window.fetch = async (input, options = {}) => {
    const url = new URL(input instanceof Request ? input.url : input, location.href);
    const method = (options.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const body = options.body || (input instanceof Request ? await input.clone().text() : '');
    let request = {}; try { request = JSON.parse(body); } catch { /* Not JSON. */ }
    if (url.origin === location.origin) return nativeFetch(input, options);
    if (url.origin === 'https://identitytoolkit.googleapis.com') {
      if (url.pathname === '/v1/accounts:signInWithPassword') {
        // Like Firebase, the email ignores case and stray spaces (phones capitalise the first letter).
        if (String(request.email || '').trim().toLowerCase() !== email || String(request.password || '').trim() !== password) return json({ error: { code: 400, message: 'INVALID_LOGIN_CREDENTIALS' } }, 400);
        signedIn = true;
        return json({ localId: uid, email, displayName: user.name, registered: true, idToken: token(), refreshToken: 'local-preview-refresh', expiresIn: '3600' });
      }
      if (url.pathname === '/v1/accounts:lookup') { signedIn = true; return json({ users: [{ localId: uid, email, emailVerified: true, displayName: user.name, providerUserInfo: [{ providerId: 'password', rawId: email, email }] }] }); }
      if (url.pathname === '/v1/accounts:sendOobCode') return json({ email: request.email });
      return json({ error: { code: 400, message: 'OPERATION_NOT_ALLOWED' } }, 400);
    }
    if (url.origin === 'https://securetoken.googleapis.com') {
      signedIn = true;
      return json({ access_token: token(), id_token: token(), refresh_token: 'local-preview-refresh', expires_in: '3600', token_type: 'Bearer', user_id: uid, project_id: 'petalpal-synthetic' });
    }
    if (url.origin === API) {
      const p = url.pathname;
      if (!signedIn) return json({ error: 'Sign in to the local preview first' }, 401);
      if (p === '/auth/session') return json({ user });
      if (p === '/ai/reports/weekly/trigger' || p === '/ai/reports/monthly/trigger') return json({ error: 'Reflections are not written in the local preview' }, 409);
      if (p === `/users/${friend}/flowers/ff1/support` && method === 'POST') { friendFlower.supportCount++; friendFlower.supportState = { supportedToday: true, canSupport: false }; return json(friendFlower); }
      if (p === `/users/${friend}/flowers/ff1/message` && method === 'POST') { friendFlower.messages.push({ id: 'm' + friendFlower.messages.length, text: request.text, userId: uid, authorUserId: uid, author: user.name }); return json(friendFlower); }
      if (p === `/users/me/blocks/${friend}`) { blocked = method === 'PUT'; return json({ success: true }); }
      if (p === '/friends/request' && method === 'POST') {
        const sent = { id: 'r-' + request.receiverId, senderId: uid, receiverId: request.receiverId, status: 'pending', createdAt: new Date().toISOString(),
          receiver: people.find(person => person.id === request.receiverId) };
        outgoingRequests.unshift(sent); return json({ request: sent, message: 'Friend request sent' }, 201, 500);
      }
      const answer = p.match(/^\/friends\/requests\/([^/]+)\/(accept|reject)$/);
      if (answer && method === 'POST') { incomingRequests = incomingRequests.filter(item => item.id !== answer[1]); return json({ message: 'Done' }, 200, 400); }
      // Our Bond and today's petal card, so the calendar check-in and the petal ring can be tried.
      const localDate = new Date().toISOString().slice(0, 10);
      // Today's draw asks a topic first; the preview card lies reversed so the upside-down art can be checked.
      if (p === '/api/petal-cards/draw' && method === 'POST') {
        const label = petalTopics.find(topic => topic.id === request.topic)?.label;
        if (!label) return json({ error: 'topic must be one of the petal card topics' }, 400);
        petalDrawn = { id: 'local-draw', position: request.position, drawnAt: new Date().toISOString(), topic: request.topic, topicLabel: label,
          card: { id: 'major-01', name: 'The Magician', line: 'What’s at hand is enough to begin.', text: 'A preview card: in the real app this is today\'s card from your deck.',
            reversed: true, keywords: ['scattered focus', 'holding back', 'misdirected effort'], disclaimer: 'For reflection only.' },
          reading: { available: true, needsConsent: false, locked: false, freeLeft: 3, status: 'NONE' } };
        return json({ created: true, locale: 'en', localDate, ...petalDrawn });
      }
      // The reading: a canned one after a short wait (the real one is written by the model on the server).
      if (p === '/api/petal-cards/reading' && method === 'POST') {
        if (!petalDrawn) return json({ error: 'Not found' }, 404);
        petalDrawn.reading = { available: true, needsConsent: false, locked: false, freeLeft: 2, status: 'READY', paragraphs: [
          'The Magician reversed speaks of power that is there but scattered: the tools are on the table, yet your hands keep moving between them.',
          `For ${petalDrawn.topicLabel.toLowerCase()} today, the card suggests gathering yourself before you begin. Your quiet days this week may be helping you hear what matters.`,
          'Pick one small thing within reach and give it your whole attention for a while.'] };
        return json(petalDrawn.reading, 200, 1500);
      }
      // Redemption codes: any well-formed code works once here (the real codes live on the server).
      if (p === '/api/redeem' && method === 'POST') {
        if (String(request.code || '').replace(/[\s-]/g, '').length !== 20) return json({ error: 'Invalid code', code: 'INVALID_CODE' }, 400, 300);
        if (redemptions.length) return json({ error: 'Already redeemed', code: 'ALREADY_REDEEMED' }, 409, 300);
        redemptions = [{ batch: 'beta-gift-2026-10', reward: 'beta-gift', status: 'pending', redeemedAt: new Date().toISOString() }];
        return json({ created: true, ...redemptions[0] }, 200, 300);
      }
      if (p === '/api/redeem') return json({ redemptions });
      if (p === '/api/fairy/check-in' && method === 'POST') {
        const created = !checkedInToday; checkedInToday = true;
        return json({ created, checkIn: { localDate: day(0), streak: 4, graceUsed: false }, keepsakes: [], points: created ? 2 : 0 });
      }
      if (p === '/events' && method === 'POST') {
        const id = 'e' + (events.size + 1), now = new Date().toISOString();
        const event = { id, content: request.content, occurredAt: now, localDate: day(0), primaryGardenMood: request.primaryGardenMood,
          secondaryEmotions: [], emotionStatus: consent.aiProcessing ? 'RUNNING' : 'SKIPPED', memoryProcessingAllowed: consent.memoryEnabled, readyAt: Date.now() + 4000 };
        events.set(id, event);
        const flower = { id: 'f' + id, userId: uid, sourceEventId: id, name: 'Lavender', speciesCode: 'LAVENDER', mood: request.primaryGardenMood,
          img: 'lavender.png', createdAt: now, event: '', supportCount: 0, sourceEvent: { secondaryEmotions: [] } };
        ownFlowers.unshift(flower); plantedToday++;
        return json({ event, flower, emotion: { status: event.emotionStatus, labels: [] }, memoryJob: null, dailyFlowers: { limit: 2, planted: plantedToday, limitReached: false } }, 201, 900);
      }
      const eventRead = p.match(/^\/events\/(.+)$/);
      if (eventRead && events.has(eventRead[1])) {
        const event = events.get(eventRead[1]);
        if (event.emotionStatus === 'RUNNING' && Date.now() >= event.readyAt) {
          event.emotionStatus = 'SUCCESS';
          event.secondaryEmotions = /[\u4e00-\u9fff]/.test(event.content) ? EMOTIONS.zh : EMOTIONS.en;
          ownFlowers.forEach(flower => { if (flower.sourceEventId === event.id) flower.sourceEvent = { secondaryEmotions: event.secondaryEmotions }; });
        }
        return json(event);
      }
      if (p === `/users/${uid}/ai-consent` && method === 'PUT') {
        consent = { ...consent, aiProcessing: !!request.aiProcessing, personalization: !!request.personalization, memoryEnabled: !!request.memoryEnabled, updatedAt: new Date().toISOString() };
        return json(consent);
      }
      if (p === `/users/${uid}/profile` && method === 'PUT') { user.preferredLocale = request.preferredLocale; return json({ user }); }
      const journalEdit = p.match(new RegExp(`^/users/${uid}/journals/([^/]+)$`));
      if (journalEdit && method === 'PUT') {
        const entry = journals.find(item => item.journal.id === journalEdit[1]);
        if (!entry) return json({ error: 'Journal not found' }, 404);
        entry.journal.content = String(request.content || '').trim();
        return json({ id: entry.journal.id, content: entry.journal.content });
      }
      // Planting is written once, like lib/flower-placement.js: another spot is refused.
      const placement = p.match(new RegExp(`^/users/${uid}/flowers/([^/]+)/placement$`));
      if (placement && method === 'POST') {
        const flower = ownFlowers.find(item => item.id === placement[1]);
        if (!flower) return json({ error: 'Flower not found' }, 404);
        if (flower.worldX != null && (flower.worldX !== request.worldX || flower.worldY !== request.worldY)) {
          return json({ error: 'This flower is already planted. Its spot can’t change.', code: 'PLACEMENT_LOCKED' }, 409);
        }
        const created = flower.worldX == null;
        Object.assign(flower, { worldX: request.worldX, worldY: request.worldY, regionId: request.landId });
        return json({ flowerId: flower.id, worldX: flower.worldX, worldY: flower.worldY, landId: flower.regionId, placedAt: new Date().toISOString() }, created ? 201 : 200, 500);
      }
      const ownFlower = p.match(new RegExp(`^/users/${uid}/flowers/([^/]+)$`));
      if (ownFlower && method === 'DELETE') {
        const index = ownFlowers.findIndex(item => item.id === ownFlower[1]);
        if (index < 0) return json({ error: 'Flower not found' }, 404);
        const [deletedFlower] = ownFlowers.splice(index, 1);
        return json({ success: true, message: 'Flower deleted successfully', deletedFlower }, 200, 500);
      }
      if (ownFlower && method === 'GET') {
        const flower = ownFlowers.find(item => item.id === ownFlower[1]);
        return flower ? json({ ...flower, messages: [], supportState: { isOwner: true, canSupport: false, supportedToday: false } }) : json({ error: 'Flower not found' }, 404);
      }
      if (method !== 'GET') return json({ ok: true });
      if (p === '/session') return json({ user, garden: { owner: { id: uid } }, fairyState: { onboardingStep: 'COMPLETED', onboardingCompleted: true, unlockedFeatures: [] }, todayCheckIn: null, hasCheckedInToday: false, dailyGrowLimitEnabled: true });
      if (p === '/api/flowers/today') return json({ localDate: day(0), limit: 2, planted: plantedToday, remaining: Math.max(0, 2 - plantedToday) });
      if (p === '/ai/disclosure') return json({ version: 'ai-2026-10-15', features: [{ feature: 'Event emotion labels', processor: 'Cloudflare Workers AI', configured: true }],
        explanation: 'AI Processing permits sending Event text and selected mood for emotion suggestions.', retention: 'Processing may occur outside your country.' });
      if (p === `/users/${uid}/garden`) return json({ owner: { id: uid }, flowers: ownFlowers, visitRecords: [
        { id: 'v3', visitorId: friend, visitorName: 'Friend Preview', visitorAvatar: '🌼', action: 'message', createdAt: new Date(Date.now() - 20 * 60e3).toISOString() },
        { id: 'v2', visitorId: friend, visitorName: 'Friend Preview', visitorAvatar: '🌼', action: 'support', createdAt: new Date(Date.now() - 22 * 60e3).toISOString() },
        { id: 'v1', visitorId: friend, visitorName: 'Friend Preview', visitorAvatar: '🌼', action: 'started visiting your garden', createdAt: new Date(Date.now() - 25 * 60e3).toISOString() },
        { id: 'v0', visitorId: friend, visitorName: 'Friend Preview', visitorAvatar: '🌼', action: 'started visiting your garden', createdAt: new Date(Date.now() - 26 * 3600e3).toISOString() }] });
      if (p === `/users/${uid}/journals`) return json({ journals, nextCursor: null });
      if (p === `/users/${uid}/friends`) return json(blocked ? [] : [{ id: friend, name: 'Friend Preview', avatar: '🌼', allowGardenVisits: true, online: true }]);
      if (p === `/friends/requests/${uid}`) return json({ incoming: incomingRequests, outgoing: outgoingRequests });
      if (p === '/users/search') { const q = (url.searchParams.get('name') || '').toLowerCase().replace(/^@/, '');
        return json(people.filter(person => `${person.name} ${person.accountId}`.toLowerCase().includes(q)), 200, 400); }
      if (p === '/users/me/blocks') return json({ users: blocked ? [{ id: friend, name: 'Friend Preview' }] : [], nextCursor: null });
      if (p === `/users/${uid}/ai-consent`) return json(consent);
      if (p === '/api/fairy/runtime') return json({ currentState: 'IDLE', nextTransitionAt: null, gardenSchedule: true });
      if (p === '/api/fairy/closeness') return json({ locale: 'en', localDate, level: 2, title: 'New friends', total: 30, pointsIntoLevel: 10, pointsForNextLevel: 40,
        nextTitle: { level: 3, title: 'Close friends' }, maxed: false, greeting: 'Hello again!', daysTogether: 5, today: [],
        checkIn: { checkedInToday, streak: checkedInToday ? 4 : 3, cycleDay: checkedInToday ? 4 : 3, graceAvailable: true, checkInsToStreakReward: 4 }, monthly: null,
        collection: { owned: 1, received: 1, total: 20 }, unlocks: [] });
      if (p === '/api/petal-cards/today') return json({ locale: 'en', localDate, deckSize: url.searchParams.get('deck') === 'full' ? 78 : 69, back: 'lilac', topics: petalTopics, drawn: petalDrawn });
      if (p === `/users/${friend}/garden-access`) return json({ canVisit: true });
      if (p === `/users/${friend}/garden`) return json({ owner: { id: friend }, flowers: [friendFlower] });
      if (p === `/users/${friend}/flowers/ff1`) return json(friendFlower);
      if (p === '/ai/reports') return json({ reports, nextCursor: null });
      const reflection = p.match(/^\/ai\/reports\/(weekly|monthly)\/(.+)$/); if (reflection) return json(detail(reflection[2]));
      return json({ error: 'Not available in the local preview' }, 403);
    }
    // Anything else would leave this computer: refuse it.
    throw new TypeError('Network requests outside the local preview are disabled');
  };
  document.addEventListener('DOMContentLoaded', () => {
    const notice = document.createElement('aside');
    notice.setAttribute('role', 'note');
    notice.textContent = 'LOCAL PREVIEW · preview@example.invalid / preview-only · fake data, nothing is sent anywhere';
    notice.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#fff4cfcc;color:#352b11;padding:3px;text-align:center;font:11px sans-serif;pointer-events:none';
    document.body.append(notice);
  }, { once: true });
})();
