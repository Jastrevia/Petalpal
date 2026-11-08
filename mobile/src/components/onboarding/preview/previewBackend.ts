import { ApiError } from '../../../services/api';
import type { SessionUser } from '../../../services/sessionExperience';
import type { OnboardingProgress } from '../../../services/onboarding';
import { getApprovedMonthCentroid } from '../../garden/planting/approvedPlantingMasks';
import { MONTH_REGION_METAS } from '../../garden/planting/plantingRegionData';
import { fairyNameProblem, isOnboardingStep, stepIndex, type OnboardingStep } from '../onboardingSteps';

// DEV-only in-memory stand-in for the PetalPal API, used by /onboarding-preview. It answers the
// requests the real Garden, Events, Friends, Treehouse and tour make, so the real screens run
// unchanged. Nothing is sent anywhere: no Render, no Firebase, no database. State lives in
// memory and disappears on reload or "Reset preview state".

export const PREVIEW_OWNER_ID = 'onboarding-preview-owner';
export const previewUser = (locale: 'en' | 'zh-Hans'): SessionUser => ({
  id: PREVIEW_OWNER_ID, name: locale === 'zh-Hans' ? '预览用户' : 'Preview Visitor', avatar: 'avatar-01',
  email: 'preview@example.invalid', accountId: 'PREVIEW01', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  preferredLocale: locale,
} as SessionUser);

// The Primary Mood a preview Event grows, mapped to a species with approved Garden art.
const MOOD_SPECIES: Record<string, [string, string]> = {
  SUNNY_BLOOM: ['SUNFLOWER', 'Sunflower'], GENTLE_BLOOM: ['ROSE', 'Rose'], QUIET_BLOOM: ['BLUEBELL', 'Bluebell'],
  HEALING_BLOOM: ['CHAMOMILE', 'Chamomile'], FIRE_BLOOM: ['POPPY', 'Poppy'], WONDER_BLOOM: ['TULIP', 'Tulip'],
  DRIFTING_BLOOM: ['DANDELION', 'Dandelion'], PEACEFUL_BLOOM: ['LAVENDER', 'Lavender'],
};

type PreviewEvent = { id: string; content: string; occurredAt: string; localDate: string; primaryGardenMood: string;
  secondaryEmotions: string[]; emotionStatus: string; memoryProcessingAllowed: boolean };
type PreviewFlower = { id: string; userId: string; sourceEventId: string; name: string; speciesCode: string; mood: string;
  img: string; createdAt: string; supportCount: number; meaning?: string;
  worldX?: number; worldY?: number; left?: number; top?: number; regionId?: string; scale?: number; rotation?: number; layoutVersion?: number };

const freshTour = (): OnboardingProgress => ({ status: 'active', step: 'intro.name', fairyName: null, fairyNamed: false,
  firstEventId: null, firstFlowerId: null, flowerPlanted: false });
let user = previewUser('zh-Hans');
let tour = freshTour();
let events: PreviewEvent[] = [];
let flowers: PreviewFlower[] = [];
let allowGardenVisits = true;
let counter = 0;

const localDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: user.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const notFound = () => { throw new ApiError('Not available in the onboarding preview.', 404); };

export const previewBackend = {
  setUser(next: SessionUser) { user = next; },
  /** A brand-new account: no Events, no Flowers, the tour not yet started. */
  reset() { tour = freshTour(); events = []; flowers = []; allowGardenVisits = true; },
  tour: () => clone(tour),
  /** Give the account what a step needs (her name, a saved Event, a Flower, planted or not). */
  prepareFor(step: OnboardingStep, locale: 'en' | 'zh-Hans') {
    const at = stepIndex(step);
    tour = { ...tour, status: step === 'done' ? 'completed' : 'active', step };
    if (at > stepIndex('intro.name') && !tour.fairyNamed) {
      tour.fairyName = locale === 'zh-Hans' ? '小月' : 'Luna'; tour.fairyNamed = true;
    }
    if (at < stepIndex('event.flower')) {
      // Steps before the first Event start from an account without one.
      events = []; flowers = []; tour.firstEventId = null; tour.firstFlowerId = null; tour.flowerPlanted = false;
    } else if (!tour.firstEventId) {
      const { event, flower } = createEvent(locale === 'zh-Hans' ? '今天下午和朋友喝了一杯桂花拿铁。' : 'Had an osmanthus latte with a friend this afternoon.', 'SUNNY_BLOOM');
      tour.firstEventId = event.id; tour.firstFlowerId = flower.id;
    }
    tour.flowerPlanted = at > stepIndex('plant.place') && Boolean(tour.firstFlowerId);
    const firstFlower = flowers.find(item => item.id === tour.firstFlowerId);
    if (firstFlower) {
      if (tour.flowerPlanted && (typeof firstFlower.worldX !== 'number' || typeof firstFlower.worldY !== 'number')) {
        const month = Number(localDate().slice(5, 7)) || (new Date().getMonth() + 1);
        const centroid = getApprovedMonthCentroid(month);
        const landId = MONTH_REGION_METAS[month]?.landId || `Land${String(month).padStart(2, '0')}`;
        Object.assign(firstFlower, {
          worldX: centroid.x, worldY: centroid.y, left: centroid.x, top: centroid.y,
          regionId: landId, scale: 1, rotation: 0, layoutVersion: 2,
        });
      } else if (!tour.flowerPlanted) {
        delete firstFlower.worldX;
        delete firstFlower.worldY;
        delete firstFlower.left;
        delete firstFlower.top;
        delete firstFlower.regionId;
        delete firstFlower.layoutVersion;
      }
    }
    return clone(tour);
  },
};

function createEvent(content: string, mood: string) {
  const id = `preview-event-${++counter}`;
  const event: PreviewEvent = { id, content, occurredAt: new Date().toISOString(), localDate: localDate(),
    primaryGardenMood: mood, secondaryEmotions: [], emotionStatus: 'SKIPPED', memoryProcessingAllowed: false };
  const [speciesCode, name] = MOOD_SPECIES[mood] || MOOD_SPECIES.SUNNY_BLOOM;
  const flower: PreviewFlower = { id: `preview-flower-${counter}`, userId: user.id, sourceEventId: id, name, speciesCode, mood,
    img: '', createdAt: new Date().toISOString(), supportCount: 0 };
  events.push(event); flowers.push(flower);
  return { event, flower };
}

/** The request handler installed with setPreviewApiTransport. */
export async function previewRequest(path: string, method: string, body: Record<string, unknown> = {}): Promise<unknown> {
  const url = new URL(path, 'https://preview.invalid');
  const p = url.pathname, owner = `/users/${encodeURIComponent(user.id)}`;
  const flowerOut = (flower: PreviewFlower) => ({ ...flower, messages: [], dailyCheckIn: null,
    supportState: { isOwner: true, hasSupportedToday: false, canSupport: false } });
  switch (true) {
    case p === '/session': return { user, garden: { owner: { id: user.id } }, todayCheckIn: null, hasCheckedInToday: false, dailyGrowLimitEnabled: true,
      fairyState: { onboardingStep: tour.status === 'completed' ? 'GARDEN_UNLOCKED' : 'EMPTY_GARDEN', onboardingCompleted: tour.status === 'completed', unlockedFeatures: [] } };
    case p === `${owner}/garden`: return { owner: { id: user.id, name: user.name }, flowers: flowers.map(flowerOut), visitors: [] };
    case p.startsWith(`${owner}/flowers/`) && p.endsWith('/placement') && (method === 'POST' || method === 'PATCH'): {
      // Same contract as the real owner-only endpoint: world position + logical Land, kept in memory.
      const flower = flowers.find(item => item.id === decodeURIComponent(p.split('/').slice(-2)[0] || ''));
      if (!flower) return notFound();
      const { worldX, worldY, landId, scale = 1, rotation = 0 } = body as Record<string, number & string>;
      if (!Number.isFinite(worldX) || !Number.isFinite(worldY) || !/^Land(0[1-9]|1[0-2])$/.test(String(landId))) {
        throw new ApiError('Invalid flower position', 400);
      }
      if (typeof flower.worldX === 'number' && typeof flower.worldY === 'number' &&
          (flower.worldX !== worldX || flower.worldY !== worldY)) {
        throw new ApiError('This flower is already planted. Its spot can’t change.', 409, 'PLACEMENT_LOCKED');
      }
      Object.assign(flower, { worldX, worldY, left: worldX, top: worldY, regionId: landId, scale, rotation, layoutVersion: 2 });
      return { id: flower.id, flowerId: flower.id, worldX, worldY, landId, scale, rotation };
    }
    case p.startsWith(`${owner}/flowers/`): {
      const flower = flowers.find(item => item.id === decodeURIComponent(p.split('/').pop() || ''));
      return flower ? flowerOut(flower) : notFound();
    }
    case p === `${owner}/ai-consent`: return { aiProcessing: false, personalization: false, memoryEnabled: false };
    case p === '/ai/disclosure': return { version: '1.0' };
    case p === '/users/me/community-acceptance': return { accepted: true, version: '1.0' };
    case p === '/api/avatars': return {
      equipped: user.avatar || 'avatar-01', bondOn: true, level: 1,
      tiers: [{ tier: 1, unlockLevel: 1, total: 10, unlocked: true }, { tier: 2, unlockLevel: 3, total: 10, unlocked: false }, { tier: 3, unlockLevel: 6, total: 10, unlocked: false }],
      owned: ['avatar-01'], total: 30, welcome: { needed: false, selected: 'avatar-01', gifted: [] },
      pending: [], ready: 0, nextRewardLevel: 3, claims: [],
    };
    case p === '/api/redeem': return { redemptions: [] };
    case p === '/api/fairy/closeness': return {
      locale: user.preferredLocale || 'zh-Hans', localDate: localDate(), level: 1,
      title: user.preferredLocale === 'zh-Hans' ? '初识花伴' : 'New Companion',
      total: 10, pointsIntoLevel: 10, pointsForNextLevel: 50,
      nextTitle: { level: 2, title: user.preferredLocale === 'zh-Hans' ? '微风花友' : 'Breeze Friend' },
      maxed: false, greeting: '', daysTogether: 1, today: [],
      checkIn: { checkedInToday: false, streak: 1, cycleDay: 1, graceAvailable: false, checkInsToStreakReward: 6 },
      monthly: null, collection: { owned: 1, received: 1, total: 12 }, unlocks: [],
    };
    case p.startsWith('/api/fairy/check-ins'): return { locale: user.preferredLocale || 'zh-Hans', month: localDate().slice(0, 7), today: localDate(), days: [] };
    case p === '/api/fairy/keepsakes': return { locale: user.preferredLocale || 'zh-Hans', owned: 1, received: 1, total: 12, keepsakes: [] };
    case p === '/api/fairy/pets': return { unlocked: false, unlockLevel: 3, level: 1, activePet: null, pets: [] };
    case p.startsWith('/api/fairy/moments'): return { moments: [], nextBefore: null, profile: { avatar: null, cover: null } };
    case p.startsWith('/api/petal-cards/today'): return { localDate: localDate(), drawn: false, draw: null, reading: null };
    case p.startsWith(`${owner}/journals/`) && p.endsWith('/cover'): return { coverImage: typeof body.coverImage === 'string' ? body.coverImage : null };
    case p === `${owner}/journals` && method === 'GET': return { journals: [], nextCursor: null };
    case p === `${owner}/journals` && method === 'POST': return { id: `preview-journal-${++counter}`, content: String(body.content || '').trim() };
    case p.startsWith(`${owner}/journals/`) && method === 'PATCH': return { id: decodeURIComponent(p.split('/').pop() || ''), content: String(body.content || '').trim() };
    case p === `${owner}/check-ins`: return [];
    case p === `${owner}/events`: { const month = url.searchParams.get('month'); return { events: events.filter(item => !month || item.localDate.startsWith(month)).map(item => ({ ...item, flower: flowers.find(f => f.sourceEventId === item.id) || null })) }; }
    case p === `${owner}/friends`: return [];
    case p === `/friends/requests/${encodeURIComponent(user.id)}`: return { incoming: [], outgoing: [] };
    case p === '/users/search': return [];
    case p === '/users/me/blocks': return { users: [], nextCursor: null };
    case p === '/users/me/garden-privacy':
      if (method === 'PATCH' && typeof body.allowGardenVisits === 'boolean') allowGardenVisits = body.allowGardenVisits;
      return { allowGardenVisits };
    case p === '/users/me/garden-encouragements': return { localDate: localDate(), resetsAt: new Date(Date.now() + 864e5).toISOString(),
      support: { today: 0, total: 0, unread: 0 }, messages: { today: 0, unread: 0, items: [], nextCursor: null } };
    case p === '/api/flowers/today': return { localDate: localDate(), limit: 2, planted: flowers.length, remaining: Math.max(0, 2 - flowers.length) };
    case p === '/api/fairy/runtime':
      if (tour.status !== 'completed') throw new ApiError('Complete onboarding before starting the Fairy runtime', 409);
      return { currentState: 'IDLE', nextTransitionAt: null };
    case p === '/api/onboarding' && method === 'GET': return clone(tour);
    case p === '/api/onboarding' && method === 'PATCH': {
      if (body.fairyName !== undefined) {
        const name = String(body.fairyName).normalize('NFC').replace(/\s+/gu, ' ').trim();
        if (fairyNameProblem(name)) throw new ApiError('Give your fairy a name.', 400, 'FAIRY_NAME_REQUIRED');
        tour.fairyName = name; tour.fairyNamed = true;
      }
      if (typeof body.firstEventId === 'string') tour.firstEventId = body.firstEventId;
      if (typeof body.firstFlowerId === 'string') tour.firstFlowerId = body.firstFlowerId;
      if (body.flowerPlanted === true) tour.flowerPlanted = true;
      if (isOnboardingStep(body.step) && stepIndex(body.step) > stepIndex(tour.step)) tour.step = body.step;
      if (body.complete === true) { tour.status = 'completed'; tour.step = 'done'; }
      return clone(tour);
    }
    case p === '/events' && method === 'POST': {
      const mood = typeof body.primaryGardenMood === 'string' ? body.primaryGardenMood.trim() : '';
      if (!mood || !(mood in MOOD_SPECIES)) {
        throw new ApiError('Choose a mood for your Event.', 400, 'MOOD_REQUIRED');
      }
      const { event, flower } = createEvent(String(body.content || ''), mood);
      return { event, flower: flowerOut(flower), emotion: { status: 'SKIPPED', labels: [] }, memoryJob: null,
        dailyFlowers: { limit: 2, planted: flowers.length, limitReached: false } };
    }
    case p.startsWith('/events/'): {
      const event = events.find(item => item.id === decodeURIComponent(p.split('/').pop() || ''));
      return event ?? notFound();
    }
    default: return notFound();
  }
}
