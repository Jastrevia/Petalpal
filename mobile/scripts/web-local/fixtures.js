// Local preview only (npm run web:local). Served by scripts/web-local/start.mjs before the app loads;
// never bundled into the app. Sign-in and every API answer are synthetic: nothing here reaches
// Firebase, the PetalPal servers or real people. Sign in with preview@example.invalid / preview-only.
(function () {
  const API = 'https://api.synthetic.invalid';
  const nativeFetch = window.fetch.bind(window);
  const uid = 'local-preview-owner', email = 'preview@example.invalid', password = 'preview-only';
  const user = { id: uid, name: 'Local Preview', avatar: '🦋', email, timezone: 'America/Vancouver', preferredLocale: 'en', aiConsent: true };
  const json = (data, status = 200, delay = 0) => new Promise(resolve => setTimeout(() => resolve(new Response(JSON.stringify(data),
    { status, headers: { 'Content-Type': 'application/json' } })), delay));
  const token = () => {
    const now = Math.floor(Date.now() / 1000);
    const encode = v => btoa(JSON.stringify(v)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: uid, user_id: uid, aud: 'petalpal-synthetic',
      iss: 'https://securetoken.google.com/petalpal-synthetic', email, email_verified: true, iat: now, auth_time: now,
      exp: now + 3600, firebase: { sign_in_provider: 'password' } })}.synthetic`;
  };
  // Calendar days in the preview account's own timezone, as the server stores localDate.
  const day = offset => { const d = new Date(Date.now() - offset * 864e5); return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); };
  let petalDrawn = null;
  const journals = [[3, 'A slow morning with tea and the window open.'], [12, 'Walked home the long way.'], [35, 'Started a new notebook.'],
    [5, 'Rainy thoughts\n\nThe rain kept tapping on the window all afternoon, so I made a pot of jasmine tea and sat with the old sketchbook. '
      + 'Nothing in particular happened, and that was the nice part. I drew the teacup three times and liked the second one best.\n\n'
      + 'Later the clouds broke and the street smelled of wet leaves. I want to remember that small, quiet light before dinner.'],
    [9, 'Planted something for a hard day.', true], [400, 'A note from last autumn.']]
    .map(([offset, content, grown], i) => ({ id: 'c' + i, localDate: day(offset), createdAt: day(offset) + 'T18:00:00.000Z',
      journal: { id: 'j' + i, content, locked: !!grown }, emotionResult: grown ? { label: 'QUIET_BLOOM', secondaryEmotions: ['tender', 'hopeful'] } : null,
      flower: grown ? { id: 'grown-flower', name: 'Bluebell', speciesCode: 'BLUEBELL', img: '🔔', mood: 'QUIET_BLOOM', meaning: 'Gentle constancy', createdAt: day(9) + 'T18:00:00.000Z' } : null }));
  // Daily Grow check-ins (one with a journal, one without) and Events, for the journal's left pages.
  const checkIns = [
    { id: 'c4', localDate: day(9), journal: { id: 'j4', content: 'Planted something for a hard day.' }, emotionResult: journals[4].emotionResult, flower: journals[4].flower },
    { id: 'dg7', localDate: day(7), journal: null, emotionResult: { label: 'SUNNY_BLOOM', secondaryEmotions: ['grateful', 'calm'] },
      flower: { id: 'dg-flower', name: 'Sunflower', speciesCode: 'SUNFLOWER', img: '🌻', mood: 'SUNNY_BLOOM', meaning: 'Warmth and loyalty', createdAt: day(7) + 'T17:00:00.000Z' } }];
  const events = [
    { id: 'e5', localDate: day(5), occurredAt: day(5) + 'T20:00:00.000Z', content: 'Spent the afternoon sketching by the window while it rained.',
      primaryGardenMood: 'PEACEFUL_BLOOM', secondaryEmotions: ['content'], emotionStatus: 'SUCCEEDED',
      flower: { id: 'ev-flower', name: 'Lavender', speciesCode: 'LAVENDER', img: '💜', mood: 'PEACEFUL_BLOOM', meaning: 'Calm and devotion', createdAt: day(5) + 'T20:00:00.000Z' } },
    { id: 'e7', localDate: day(7), occurredAt: day(7) + 'T15:00:00.000Z', content: 'Planted a new marigold in the garden.',
      primaryGardenMood: 'SUNNY_BLOOM', secondaryEmotions: ['hopeful'], emotionStatus: 'SUCCEEDED', flower: null }];
  const report = (id, type, periodKey) => ({ id, type, periodKey, periodStartUtc: '', periodEndUtc: '', createdAt: '', status: 'COMPLETE' });
  const reports = [report('w1', 'weekly', '2026-10-12'), report('w2', 'weekly', '2026-10-19'), report('m9', 'monthly', '2026-09')];
  const detail = id => ({ id, summary: 'A gentle week of small routines and quiet walks.', eventCount: 3,
    topTopics: [{ topic: 'garden', count: 2 }], narrativeSections: [], trendSignals: {} });
  const friend = 'local-friend';
  const friendFlower = { id: 'ff1', userId: friend, name: 'Sunflower', speciesCode: 'SUNFLOWER', mood: 'SUNNY_BLOOM', img: 'sunflower.png',
    createdAt: day(6) + 'T18:00:00.000Z', supportCount: 1, sourceType: 'EVENT', sourceEventId: 'fe1',
    supportState: { supportedToday: false, canSupport: true }, messages: [] };
  let signedIn = false, blocked = false;
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
      // Our Bond and today's petal card, so the calendar check-in and the petal ring can be tried.
      const localDate = new Date().toISOString().slice(0, 10);
      if (p === '/api/petal-cards/draw' && method === 'POST') { petalDrawn = { position: request.position, drawnAt: new Date().toISOString(), card: { id: 'major-01', name: 'The Magician', line: 'You already hold what you need.', text: 'A preview card: in the real app this is today\'s card from your deck.', disclaimer: 'For reflection only.' } }; return json({ created: true, locale: 'en', localDate, ...petalDrawn }); }
      // Private journals: create, edit and delete against the fake shelf (Daily Grow ones stay locked, like the server).
      // A journal containing "[fail]" is refused, so the failed-save path (draft kept, Retry) can be tried.
      if (p.startsWith(`/users/${uid}/journals`) && (method === 'POST' || method === 'PATCH') && String(request.content || '').includes('[fail]')) {
        return json({ error: 'The preview refused this save on purpose.' }, 503, 600);
      }
      if (p === `/users/${uid}/journals` && method === 'POST') {
        const entry = { id: 'c' + journals.length + Date.now(), localDate: day(0), createdAt: new Date().toISOString(),
          journal: { id: 'j' + Date.now(), content: String(request.content || '').trim(), locked: false }, emotionResult: null, flower: null };
        journals.unshift(entry); return json(entry.journal, 201, 500);
      }
      if (/^\/users\/[^/]+\/journals\/[^/]+\/cover$/.test(p)) return json({ coverImage: method === 'PUT' ? request.coverImage ?? null : null });
      const ownJournal = p.match(new RegExp(`^/users/${uid}/journals/([^/]+)$`));
      if (ownJournal && (method === 'PATCH' || method === 'DELETE')) {
        const index = journals.findIndex(entry => entry.journal.id === decodeURIComponent(ownJournal[1]));
        if (index < 0) return json({ error: 'Journal not found' }, 404);
        if (journals[index].journal.locked) return json({ error: "This journal belongs to a flower in your Flower History, so it can't be changed here.", code: 'JOURNAL_LOCKED' }, 409);
        if (method === 'DELETE') { journals.splice(index, 1); return json({ success: true, id: ownJournal[1] }); }
        journals[index].journal.content = String(request.content || '').trim();
        return json({ id: ownJournal[1], content: journals[index].journal.content }, 200, 500);
      }
      if (method !== 'GET') return json({ ok: true });
      if (p === '/session') return json({ user, garden: { owner: { id: uid } }, fairyState: { onboardingStep: 'COMPLETED', onboardingCompleted: true, unlockedFeatures: [] }, todayCheckIn: null, hasCheckedInToday: false, dailyGrowLimitEnabled: true });
      if (p === `/users/${uid}/garden`) return json({ owner: { id: uid }, flowers: [], visitRecords: [
        { id: 'v3', visitorId: friend, visitorName: 'Friend Preview', visitorAvatar: '🌼', action: 'message', createdAt: new Date(Date.now() - 20 * 60e3).toISOString() },
        { id: 'v2', visitorId: friend, visitorName: 'Friend Preview', visitorAvatar: '🌼', action: 'support', createdAt: new Date(Date.now() - 22 * 60e3).toISOString() },
        { id: 'v1', visitorId: friend, visitorName: 'Friend Preview', visitorAvatar: '🌼', action: 'started visiting your garden', createdAt: new Date(Date.now() - 25 * 60e3).toISOString() },
        { id: 'v0', visitorId: friend, visitorName: 'Friend Preview', visitorAvatar: '🌼', action: 'started visiting your garden', createdAt: new Date(Date.now() - 26 * 3600e3).toISOString() }] });
      if (p === `/users/${uid}/journals`) return json({ journals, nextCursor: null });
      if (p === `/users/${uid}/check-ins`) return json(checkIns);
      if (p === `/users/${uid}/events`) { const month = url.searchParams.get('month') || ''; return json({ events: events.filter(e => e.localDate.startsWith(month + '-')) }); }
      if (p === `/users/${uid}/friends`) return json(blocked ? [] : [{ id: friend, name: 'Friend Preview', avatar: '🌼', allowGardenVisits: true, online: true }]);
      if (p === `/friends/requests/${uid}`) return json({ incoming: [], outgoing: [] });
      if (p === '/users/me/blocks') return json({ users: blocked ? [{ id: friend, name: 'Friend Preview' }] : [], nextCursor: null });
      if (p === `/users/${uid}/ai-consent`) return json({ aiProcessing: false, personalization: false, memoryEnabled: false });
      if (p === '/api/fairy/runtime') return json({ currentState: 'IDLE', nextTransitionAt: null });
      if (p === '/api/fairy/closeness') return json({ locale: 'en', localDate, level: 2, title: 'New friends', total: 30, pointsIntoLevel: 10, pointsForNextLevel: 40,
        nextTitle: { level: 3, title: 'Close friends' }, maxed: false, greeting: 'Hello again!', daysTogether: 5, today: [],
        checkIn: { checkedInToday: true, streak: 3, cycleDay: 3, graceAvailable: true, checkInsToStreakReward: 4 }, monthly: null,
        collection: { owned: 1, received: 1, total: 20 }, unlocks: [] });
      if (p === '/api/petal-cards/today') return json({ locale: 'en', localDate, deckSize: 69, back: 'lilac', drawn: petalDrawn });
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
