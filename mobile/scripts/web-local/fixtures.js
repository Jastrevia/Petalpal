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
  const day = offset => { const d = new Date(); d.setDate(d.getDate() - offset); return d.toISOString().slice(0, 10); };
  const journals = [[3, 'A slow morning with tea and the window open.'], [12, 'Walked home the long way.'], [35, 'Started a new notebook.']]
    .map(([offset, content], i) => ({ id: 'c' + i, localDate: day(offset), createdAt: day(offset) + 'T18:00:00.000Z',
      journal: { id: 'j' + i, content }, emotionResult: null, flower: null }));
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
        if (request.email !== email || request.password !== password) return json({ error: { code: 400, message: 'INVALID_LOGIN_CREDENTIALS' } }, 400);
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
      if (method !== 'GET') return json({ ok: true });
      if (p === '/session') return json({ user, garden: { owner: { id: uid } }, fairyState: { onboardingStep: 'COMPLETED', onboardingCompleted: true, unlockedFeatures: [] }, todayCheckIn: null, hasCheckedInToday: false, dailyGrowLimitEnabled: true });
      if (p === `/users/${uid}/garden`) return json({ owner: { id: uid }, flowers: [] });
      if (p === `/users/${uid}/journals`) return json({ journals, nextCursor: null });
      if (p === `/users/${uid}/friends`) return json(blocked ? [] : [{ id: friend, name: 'Friend Preview', avatar: '🌼', allowGardenVisits: true, online: true }]);
      if (p === `/friends/requests/${uid}`) return json({ incoming: [], outgoing: [] });
      if (p === '/users/me/blocks') return json({ users: blocked ? [{ id: friend, name: 'Friend Preview' }] : [], nextCursor: null });
      if (p === `/users/${uid}/ai-consent`) return json({ aiProcessing: false, personalization: false, memoryEnabled: false });
      if (p === '/api/fairy/runtime') return json({ currentState: 'IDLE', nextTransitionAt: null });
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
