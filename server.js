import { requestAccountDeletion } from './lib/account-deletion-workflow.js';
import { aiDisclosure, AI_DISCLOSURE_VERSION } from './lib/ai-disclosure.js';
import { installAiOutputReporting } from './lib/ai-output-reporting.js';
import { assertContentAllowed, contentSafetyResponse, CONTENT_REJECTED } from './lib/content-safety.js';
import { COMMUNITY_VERSION, assertSocialContent, requireCommunityAcceptance, installCommunityPolicy } from './lib/community-policy.js';
import { installSocialSafety } from "./lib/social-safety.js";
import { requireSocialPair, hiddenSocialIds, filterSocialPayload } from "./lib/garden-access.js";
import { isWebShellRequest } from "./lib/web-shell.js";
import { requestTiming, requestTimingEnabled } from "./lib/request-timing.js";
import { parseJournalPage, journalPageCursor } from "./lib/journal-pagination.js";
import { updateAiConsent } from "./lib/ai-consent.js";
import { CircuitBreaker } from "./lib/circuit-breaker.js";
import { createPresence } from "./lib/presence.js";
import { validateJournalCover } from './lib/journal-cover.js';
import "dotenv/config";
import express from "express";
import { speechAdmission, speechTranscriptionHandler } from "./lib/speech-transcription.js";
import { PrismaAiCostGate, aiCostHttpStatus, isAiCostError } from "./lib/ai-cost-gate.js";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import YAML from "yaml";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

import prisma from "./lib/prisma.js";
import { canVisitGarden, SocialAccessError, withSocialLocks, withSocialAuthorization, sendSocialError } from "./lib/garden-access.js";
import flowerDB from "./data/flowerDB.js";
import { loadMoodModel } from "./moodClassifier.js";
import { classifyEmotion } from "./lib/emotion-classifier.js";
import { generateFlowerMetadata } from "./lib/flower-engine.js";
import { classifyEventSecondaryEmotions, eventSecondaryEmotionEnabled, EVENT_SECONDARY_MODEL_ID, EVENT_SECONDARY_MODEL_VERSION } from "./lib/event-emotion.js";
import { classifyHaikuEventSecondaryEmotions, eventEmotionProvider, withHaikuEventWriteFence } from "./lib/haiku-event-emotion.js";
import { canonicalEventLabels, previewEventFlower } from "./lib/event-flower.js";
import {
  CANONICAL_PRIMARY_GARDEN_MOODS,
  isSupportedPrimaryGardenMood,
  speciesPoolForPrimary
} from "./lib/flower-variant-config.js";
import { selectFlowerSecondaryEmotions } from "./lib/secondary-emotion-selector.js";
import {
  reconcileFairyRuntime,
  formatFairyRuntimeResponse
} from "./lib/fairy-runtime.js";
import {
  fairyMomentsEnabledFor,
  fairyMomentsSince,
  hasUnreadFairyMoments,
  listFairyMoments,
  recordFairyMoments,
  setFairyMomentLike,
  setFairyMomentsAvatar,
  setFairyMomentsCover
} from "./lib/fairy-moments.js";
import { isMomentCover } from "./lib/moment-covers.js";
import { isLibraryAvatar } from "./lib/avatars.js";
import {
  awardCloseness,
  awardFairyTap,
  checkInWithFairy,
  closenessSummary,
  fairyClosenessEnabledFor,
  listCheckIns,
  listKeepsakes
} from "./lib/fairy-closeness.js";
import { petalCardsEnabledFor } from "./lib/petal-cards.js";
import { drawPetalCard, heavyCardsOn, PETAL_TOPIC_IDS, petalDrawsForMonth, todaysPetalDraw } from "./lib/petal-card-draw.js";
import { petalReadingFor, requestPetalReading } from "./lib/petal-reading.js";
import { listRedemptions, redeemCode, RedeemError } from "./lib/redeem-codes.js";
import { fairyMomentCaptionsEnabled, fillFairyMomentCaptions } from "./lib/haiku-fairy-moment.js";
import {
  STARTER_FAIRY,
  MONTHLY_FAIRY_UNLOCK_ACTIVE_DAYS,
  withOnboardingGuideFairy,
  nextUnlockableFairy
} from "./lib/fairy-config.js";
import { monthFromLocalDate, normalizeProgress } from "./lib/fairy-progress.js";
import { resolveDailyFlowerEmotion } from "./lib/daily-flower-input.js";
import {
  AI_JOB_TYPES,
  PrismaAiJobRepository,
  createEventAndEnqueueMemoryJob
} from "./lib/ai-jobs.js";
import {
  localDateForInstant,
  monthlyPeriodFor,
  previousMonthlyPeriod,
  reportPeriodStatus,
  latestReadyWeeklyPeriod,
  weeklyPeriodForLocalDate,
  weeklyReportPeriodStatus
} from "./lib/ai-periods.js";
import { createProductionAiWorker } from "./lib/ai-worker.js";
import { scheduleMonthlyReports, scheduleWeeklyReports } from "./lib/report-schedule.js";
import {
  aiJobDispatchAllowed,
  aiJobServiceAuthorized,
  dispatchAiJob,
  executeAiJobById,
  listDispatchableAiJobs
} from "./lib/ai-async-dispatch.js";
import { PrivateEventRepository } from "./lib/ai-events.js";
import { PrismaMemoryRepository } from "./lib/event-memory.js";
import { PrivateReportRepository } from "./lib/report-foundation.js";
import { InsightLoopRepository } from "./lib/insight-loop.js";
import { requireLockedMemoryConsent } from "./lib/semantic-retrieval.js";
import {
  REPORT_NARRATIVE_GENERATION_VERSION,
  configuredCloudflareReportNarrativeProvider
} from "./lib/report-narrative.js";
import { resolveFairyEvent } from "./lib/fairy-events.js";
import {
  serializeGardenResponse,
  toSocialFlower,
  toSocialMessage
} from "./lib/garden-response.js";
import {
  FlowerSupportError,
  getFlowerDetail,
  giveFlowerSupport,
  sendFlowerMessage,
  withGardenFlowerSupportState
} from "./lib/flower-support.js";
import http from "http";
import { Server } from "socket.io";
import {
  authenticateRequest,
  authenticateSocket,
  revalidateSocketIdentity,
  authenticateFirebaseIdentity,
  requireOwnUser,
  requireRecentAuthentication
} from "./lib/auth.js";
import { createRealtimeSecurity, SOCKET_MAX_PACKET_BYTES } from "./lib/socket-security.js";
import { createRateLimiter, rateLimiters } from "./lib/rate-limit.js";
import { deleteFirebaseUser } from "./lib/firebase-admin.js";
import { verifyFirebaseIdToken, findFirebaseUserByEmail } from './lib/firebase-admin.js';
import { createNativeSecurityHarnessBridge, nativeSecurityHarnessRouter, assertNativeTestDeletion } from './lib/native-security-harness.js';
import { assertDevelopmentDatabase } from "./lib/database-isolation.js";
import { deleteAccountDataInTransaction } from "./lib/account-deletion.js";
import {
  endpointNotFound,
  handleHttpError,
  requireJsonObject, requireJsonContentType, allowBodyFields
} from "./lib/http-errors.js";
import { logServerError } from "./lib/security-log.js";
import { requestId, emitSecurityEvent, securityRouteClass } from "./lib/security-events.js";
import { createAuditEvent } from "./lib/audit-events.js";
import { apiDocsEnabled, assertAllowedOrigin, isAllowedOrigin, trustProxySetting } from "./lib/security-config.js";
import { assertIntegrationEnvironment } from "./lib/integration-environment.js";
import { httpSecurity, securityHeaders, privateResponse } from "./lib/http-security.js";
import { historyFlowerSelect, historyFlowerMetadata, sessionMetadata } from "./lib/history-metadata.js";
import { flowerQuotaToday, reserveFlowerPlanting } from "./lib/flower-quota.js";
import { FlowerPlacementError, plantFlowerOnce } from "./lib/flower-placement.js";
import { isBetaTester } from "./lib/beta-cohort.js";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// No-op unless PETALPAL_ENVIRONMENT=integration (isolated test service only).
assertIntegrationEnvironment();
const openapiDocument = YAML.parse(
  fs.readFileSync(path.join(__dirname, "docs", "openapi.yaml"), "utf8")
);

const app = express();
app.use(httpSecurity);
if (process.env.NATIVE_SECURITY_TEST === '1') {
  app.get('/', (_req, res) => res.set('Cache-Control', 'no-store').json({
    environment: 'native-security-test', firebaseProject: 'petalpal-native-security-test',
    database: 'petalpal_native_security_test'
  }));
}
const PORT = Number(process.env.PORT) || 3000;
const server = http.createServer(app);
const { admission: admissionRateLimit, general: generalRateLimit, auth: authRateLimit, authAccount: authAccountRateLimit, ai: aiRateLimit } = rateLimiters();

app.use((req, res, next) => {
  req.requestId = requestId();
  res.set("X-Request-ID", req.requestId);
  next();
});
if (requestTimingEnabled()) app.use(requestTiming());

app.set("trust proxy", trustProxySetting());
let emotionClassifier = classifyEmotion;
let eventEmotionClassifier = classifyEventSecondaryEmotions;
const newEventEmotionBreaker = () => new CircuitBreaker({
  failureThreshold: Number(process.env.AI_CIRCUIT_FAILURE_THRESHOLD) || 5,
  cooldownMs: Number(process.env.AI_CIRCUIT_COOLDOWN_MS) || 30_000
});
let eventEmotionBreaker = newEventEmotionBreaker();
const aiCostGate = new PrismaAiCostGate(prisma);
let firebaseUserDeleter = deleteFirebaseUser;
const createDefaultWeeklyReportWorker = () => createProductionAiWorker({
  prisma,
  reportNarrativeProvider: configuredCloudflareReportNarrativeProvider()
});
let weeklyReportWorkerFactory = createDefaultWeeklyReportWorker;
let aiJobDispatcher = dispatchAiJob;

function isDailyGrowLimitEnabled() {
  return process.env.DAILY_GROW_LIMIT_ENABLED !== "false";
}

export function setEmotionClassifierForTests(classifier) {
  emotionClassifier = classifier || classifyEmotion;
}

export function setEventEmotionClassifierForTests(classifier) {
  eventEmotionClassifier = classifier || classifyEventSecondaryEmotions;
  eventEmotionBreaker = newEventEmotionBreaker();
}

export function setFirebaseUserDeleterForTests(deleter) {
  firebaseUserDeleter = deleter || deleteFirebaseUser;
}

export function setWeeklyReportWorkerFactoryForTests(factory) {
  weeklyReportWorkerFactory = factory || createDefaultWeeklyReportWorker;
}

let fairyMomentCaptionFiller = fillFairyMomentCaptions;
export function setFairyMomentCaptionFillerForTests(filler) {
  fairyMomentCaptionFiller = filler || fillFairyMomentCaptions;
}

export function setAiJobDispatcherForTests(dispatcher) {
  aiJobDispatcher = dispatcher || dispatchAiJob;
}

const io = new Server(server, {
  maxHttpBufferSize: SOCKET_MAX_PACKET_BYTES,
  // CORS alone does not reject direct WebSocket handshakes. Engine.IO calls this
  // for every new session (polling or direct WebSocket), applying the same
  // exact-origin policy as HTTP; an accepted session's upgrade inherits it.
  // Requests without Origin (native/React Native polling) remain allowed, as on
  // HTTP. Firebase token authentication below is still required for all clients.
  allowRequest: (req, callback) => callback(null, isAllowedOrigin(req.headers.origin)),
  cors: {
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
    methods: ["GET", "POST"]
  }
});

io.engine.on("headers", (headers, req) => {
  Object.assign(headers, securityHeaders(req), { "Cache-Control": "no-store" });
});

io.use(authenticateSocket);

const realtime = createRealtimeSecurity({ io, db: prisma, authenticate: revalidateSocketIdentity, logger: logServerError });

// Friends see each other online/offline (friends list + live "presenceChanged"). Only confirmed
// friends are told; blocking or removing a friend deletes the friendship first.
async function announcePresence(userId, online) {
  try {
    const friendships = await prisma.friendship.findMany({ where: { userId }, select: { friendId: true }, take: 500 });
    for (const { friendId } of friendships) realtime.to(`user:${friendId}`).emit("presenceChanged", { userId, online });
  } catch (error) { logServerError("Presence announcement error", error); }
}
const newPresence = () => createPresence({ onChange: (userId, online) => { void announcePresence(userId, online); } });
let presence = newPresence();
export function resetPresenceForTests() { presence = newPresence(); }

io.on("connection", (socket) => {
  if (!realtime.connection(socket)) return;
  socket.on("join-user", (payload, ack) => realtime.run(socket, payload, ack, async (_payload, version) => {
    const normalizedUserId = String(socket.data.currentUserId);
    await socket.join(`user:${normalizedUserId}`);
    if (!realtime.current(socket, version)) { await socket.leave(`user:${normalizedUserId}`); return false; }
    presence.join(normalizedUserId, socket.id);
    return true;
  }));
  socket.on("leave-user", (payload, ack) => realtime.run(socket, payload, ack, async () => {
    await socket.leave(`user:${socket.data.currentUserId}`);
    presence.leave(String(socket.data.currentUserId), socket.id);
    return true;
  }));
  socket.on("disconnect", () => presence.leave(String(socket.data.currentUserId), socket.id));
  socket.on("join-garden", (payload, ack) => realtime.run(socket, payload, ack, async (gardenOwnerId, version) => {
    const sequence = (socket.data.gardenJoinSequence || 0) + 1;
    socket.data.gardenJoinSequence = sequence;
    socket.data.pendingGarden = gardenOwnerId;
    try {
      if (!await realtime.gardenAllowed(socket, gardenOwnerId, version) || socket.data.gardenJoinSequence !== sequence) return false;
      if (socket.data.currentGarden) await socket.leave(`garden:${socket.data.currentGarden}`);
      socket.data.currentGarden = gardenOwnerId;
      socket.data.currentGardenJoinSequence = sequence;
      await socket.join(`garden:${gardenOwnerId}`);
      const allowed = await realtime.gardenAllowed(socket, gardenOwnerId, version);
      if (socket.data.gardenJoinSequence !== sequence || !allowed) {
        if (socket.data.currentGardenJoinSequence === sequence) {
          socket.data.currentGarden = undefined;
          await socket.leave(`garden:${gardenOwnerId}`);
        } else if (socket.data.currentGarden !== gardenOwnerId) await socket.leave(`garden:${gardenOwnerId}`);
        return false;
      }
      return true;
    } finally {
      if (socket.data.gardenJoinSequence === sequence) socket.data.pendingGarden = undefined;
    }
  }));
  socket.on("move-avatar", (payload, ack) => realtime.run(socket, payload, ack, async (data, version) => {
    const { gardenOwnerId, x, y } = data;
    const visitorId = String(socket.data.currentUserId);
    if (socket.data.currentGarden !== gardenOwnerId || !socket.rooms.has(`garden:${gardenOwnerId}`) ||
        !await realtime.gardenAllowed(socket, gardenOwnerId, version)) {
      await realtime.leaveGarden(socket, gardenOwnerId); return false;
    }
    const visitor = await prisma.user.findUnique({ where: { id: visitorId }, select: { name: true, avatar: true } });
    if (!visitor || !realtime.current(socket, version, gardenOwnerId)) return false;
    const published = await realtime.broadcast([`garden:${gardenOwnerId}`], "avatarMoved", {
      visitorId, userId: visitorId, gardenOwnerId, ownerId: gardenOwnerId,
      name: visitor.name, avatar: visitor.avatar, x, y
    }, { socket, version, ownerId: gardenOwnerId });
    return published !== false && realtime.current(socket, version, gardenOwnerId);
  }));
});


app.use((req, res, next) => {
  if (!assertAllowedOrigin(req.get("origin"))) {
    return res.status(403).json({ error: "Origin is not allowed" });
  }
  return next();
});
app.use(cors({
  origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
}));
// Admit before Firebase/profile work; authenticate and apply user/AI limits
// before accepting the larger voice-only body. These early routes terminate
// here, so each request consumes the shared admission budget exactly once.
app.post("/speech/transcribe", admissionRateLimit, authenticateRequest, generalRateLimit, aiRateLimit, speechAdmission(),
  requireJsonContentType, express.json({ limit: "12mb" }), requireJsonObject, allowBodyFields(["audio", "mimeType"]), speechTranscriptionHandler());
// This owner-only photo route is the sole Journal path accepting a larger body.
app.put("/users/:userId/journals/:journalId/cover", admissionRateLimit, authenticateRequest, generalRateLimit,
  (req, res, next) => { if (requireOwnUser(req, res, req.params.userId)) next(); },
  requireJsonContentType, express.json({ limit: "700kb" }), requireJsonObject, allowBodyFields(["coverImage"]), async (req, res) => {
    let coverImage;
    try { coverImage = validateJournalCover(req.body.coverImage); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    const result = await prisma.journal.updateMany({
      where: { id: req.params.journalId, userId: req.auth.userId }, data: { coverImage }
    });
    if (!result.count) return res.status(404).json({ error: "Journal not found" });
    res.json({ coverImage });
  });
// Bound session probes before body parsing or Firebase token verification.
app.use(["/auth", "/session"], authRateLimit);
app.use(requireJsonContentType);
app.use(express.json({ limit: "32kb" }));
app.use(requireJsonObject);
if (process.env.NATIVE_SECURITY_TEST === '1') {
  app.use('/native-security/harness', generalRateLimit, nativeSecurityHarnessRouter(createNativeSecurityHarnessBridge({
    prisma, verifyToken: verifyFirebaseIdToken, findUser: findFirebaseUserByEmail
  })));
}
app.use(express.static(path.join(__dirname, "public")));
app.use("/internal/ai-jobs", (req, res, next) => {
  if (!aiJobServiceAuthorized(req.get("Authorization"))) return res.status(401).json({ error: "Unauthorized" });
  next();
});
app.get("/internal/ai-jobs/dispatchable", async (req, res) => {
  if (Object.keys(req.query).length) return res.status(400).json({ error: "Invalid query" });
  try {
    return res.json({ jobs: await listDispatchableAiJobs(prisma) });
  } catch {
    return res.status(503).json({ error: "Dispatch reconciliation unavailable" });
  }
});
// Weekly reports written by the server from Sunday 23:59 local (lib/report-schedule.js); the cron sends the jobs on.
app.post("/internal/ai-jobs/schedule-weekly", async (req, res) => {
  if (Object.keys(req.body).length || Object.keys(req.query).length) return res.status(400).json({ error: "Invalid schedule request" });
  try {
    const jobs = [...await scheduleWeeklyReports({ prisma }), ...await scheduleMonthlyReports({ prisma })];
    return res.json({ jobs: jobs.filter(job => aiJobDispatchAllowed(job)).map(job => ({ jobId: job.id })) });
  } catch {
    return res.status(503).json({ error: "Weekly schedule unavailable" });
  }
});
app.post("/internal/ai-jobs/:id/execute", async (req, res) => {
  if (Object.keys(req.body).length || Object.keys(req.query).length) {
    return res.status(400).json({ error: "Invalid executor request" });
  }
  try {
    const result = await executeAiJobById({
      prisma,
      jobId: req.params.id,
      workerFactory: weeklyReportWorkerFactory
    });
    return res.json(result);
  } catch {
    return res.status(503).json({ error: "AI job execution unavailable" });
  }
});
if (apiDocsEnabled()) {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openapiDocument));
}

app.use((req, res, next) => {
  const isPublicPage =
    ["GET", "HEAD"].includes(req.method) &&
    (isWebShellRequest(req) ||
      req.path === "/finish-sign-in" ||
      (Boolean(path.extname(req.path)) && !privateResponse(req)));
  const isFirebaseSession =
    req.method === "POST" && /^\/auth\/session\/?$/i.test(req.path);
  const isRemovedLegacyAuth =
    req.method === "POST" &&
    [
      "/register",
      "/login",
      "/auth/email-code/request",
      "/auth/email-code/verify",
      "/legacy-register-disabled",
      "/legacy-login-disabled"
    ].includes(req.path);

  if (isPublicPage || isFirebaseSession || isRemovedLegacyAuth) {
    return next();
  }

  // Public/session setup exceptions retain their existing handling above.
  // Service-executor routes terminate earlier and have separate workload policy.
  return admissionRateLimit(req, res, () => authenticateRequest(req, res, next));
});
app.use(generalRateLimit);

const activeVisitorsByGarden = {};
 
function getActiveVisitors(gardenId) {
  return activeVisitorsByGarden[gardenId] || [];
}

function setActiveVisitors(gardenId, visitors) {
  activeVisitorsByGarden[gardenId] = visitors;
}

const AI_TERMS_VERSION = AI_DISCLOSURE_VERSION;
const REPORT_CATEGORIES = new Set([
  "HARASSMENT",
  "HATE_SPEECH",
  "SELF_HARM",
  "SPAM",
  "PRIVACY",
  "OTHER"
]);
const FAIRY_STEPS = new Set([
  "EMPTY_GARDEN",
  "FAIRY_APPEARS",
  "MOOD_SELECTION",
  "PLANT_FIRST_FLOWER",
  "FLOWER_BLOOM",
  "GARDEN_UNLOCKED"
]);
const FAIRY_STEP_ORDER = [
  "EMPTY_GARDEN",
  "FAIRY_APPEARS",
  "MOOD_SELECTION",
  "PLANT_FIRST_FLOWER",
  "FLOWER_BLOOM",
  "GARDEN_UNLOCKED"
];
const MAX_DISPLAY_NAME_LENGTH = 80;
const MAX_AVATAR_LENGTH = 256;
const MAX_SEARCH_LENGTH = 80;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_REPORT_DETAILS_LENGTH = 2000;
const MAX_ID_LENGTH = 128;
const MAX_COORDINATE = 2000;

function validId(value) {
  return typeof value === "string" &&
    value.length > 0 && value.length <= MAX_ID_LENGTH &&
    /^[A-Za-z0-9_-]+$/.test(value);
}

function validOptionalString(value, maxLength) {
  return value === undefined ||
    (typeof value === "string" && value.trim().length <= maxLength);
}

function validCoordinate(value) {
  return Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE;
}

function hasOnlyBooleans(body, fields) {
  return fields.every((field) =>
    body[field] === undefined || typeof body[field] === "boolean"
  );
}

for (const parameter of ["userId", "id", "fairyId", "requestId", "flowerId", "eventId", "memoryId", "reportId"]) {
  app.param(parameter, (req, res, next, value) => {
    if (!validId(value)) return res.status(400).json({ error: `Invalid ${parameter}` });
    return next();
  });
}
function normalizeTimezone(value) {
  const timezone =
    typeof value === "string" && value.trim() && value.trim().length <= 64
      ? value.trim()
      : "UTC";

  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format();
    return timezone;
  } catch {
    return null;
  }
}

function normalizeLocale(value) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 35) {
    return null;
  }
  try {
    return new Intl.Locale(value.trim()).toString();
  } catch {
    return null;
  }
}

function getLocalDate(timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function hashAiInput(text) {
  return createHash("sha256").update(text).digest("hex");
}

async function lockTransaction(tx, namespace, value) {
  // pg_advisory_xact_lock returns void, which the PrismaPg adapter cannot
  // deserialize (P2010 UnsupportedNativeDataType); select it as text instead.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`${namespace}:${value}`}))::text AS "locked"`;
}

async function ensureStarterFairy(userId) {
  return prisma.$transaction(async (tx) => {
    await lockTransaction(tx, "fairy-owner", userId);
    const [existingStarter, activeFairy] = await Promise.all([
      tx.userFairy.findUnique({
        where: { userId_fairyType: { userId, fairyType: STARTER_FAIRY.type } },
        include: { runtime: true }
      }),
      tx.userFairy.findFirst({ where: { userId, isActive: true } })
    ]);

    const starter = existingStarter || await tx.userFairy.create({
      data: {
        userId,
        fairyType: STARTER_FAIRY.type,
        name: STARTER_FAIRY.name,
        unlockSource: STARTER_FAIRY.unlockSource,
        isActive: !activeFairy,
        runtime: { create: {} }
      },
      include: { runtime: true }
    });

    if (!starter.runtime) {
      await tx.fairyRuntime.create({ data: { userFairyId: starter.id } });
    }
    return activeFairy || starter;
  });
}

async function ensureStarterFairyInTransaction(tx, userId) {
  await lockTransaction(tx, "fairy-owner", userId);
  const existing = await tx.userFairy.findUnique({
    where: { userId_fairyType: { userId, fairyType: STARTER_FAIRY.type } }
  });
  if (existing) {
    await tx.fairyRuntime.upsert({
      where: { userFairyId: existing.id },
      update: {},
      create: { userFairyId: existing.id }
    });
    return existing;
  }
  const active = await tx.userFairy.findFirst({ where: { userId, isActive: true } });
  return tx.userFairy.create({
    data: {
      userId,
      fairyType: STARTER_FAIRY.type,
      name: STARTER_FAIRY.name,
      unlockSource: STARTER_FAIRY.unlockSource,
      isActive: !active,
      runtime: { create: {} }
    }
  });
}

async function syncMonthlyFairyProgress(tx, userId, month) {
  await lockTransaction(tx, "fairy-progress", userId);
  const [activeDays, owned] = await Promise.all([
    tx.dailyCheckIn.count({
      where: { userId, localDate: { startsWith: `${month}-` } }
    }),
    tx.userFairy.findMany({
      where: { userId },
      select: { fairyType: true }
    })
  ]);
  const nextFairy = nextUnlockableFairy(owned.map(({ fairyType }) => fairyType));
  const requiredDays = MONTHLY_FAIRY_UNLOCK_ACTIVE_DAYS;
  let progress = await tx.fairyMonthlyProgress.upsert({
    where: { userId_month: { userId, month } },
    update: { activeDays, requiredDays },
    create: { userId, month, activeDays, requiredDays }
  });
  let unlockedFairy = progress.unlockedFairyId
    ? await tx.userFairy.findUnique({ where: { id: progress.unlockedFairyId } })
    : null;

  if (!progress.unlockedThisMonth && nextFairy && activeDays >= requiredDays) {
    unlockedFairy = await tx.userFairy.upsert({
      where: { userId_unlockMonth: { userId, unlockMonth: month } },
      update: {},
      create: {
        userId,
        fairyType: nextFairy.type,
        name: nextFairy.name,
        unlockSource: nextFairy.unlockSource,
        unlockMonth: month,
        isActive: false,
        runtime: { create: {} }
      }
    });
    progress = await tx.fairyMonthlyProgress.update({
      where: { id: progress.id },
      data: {
        unlockedThisMonth: true,
        unlockedFairyId: unlockedFairy.id
      }
    });
  }

  return {
    ...normalizeProgress(progress),
    nextFairy: nextFairy
      ? { type: nextFairy.type, name: nextFairy.name }
      : null,
    unlockedFairy
  };
}

async function getUser(userId, database = prisma) {
  return database.user.findUnique({
    where: { id: userId },
    include: {
      garden: {
        include: {
          flowers: {
            include: {
              messages: true,
            },
            orderBy: {
              createdAt: "desc",
            },
          },
          visitRecords: {
            orderBy: {
              createdAt: "desc",
            },
            take: 30,
          },
        },
      },
    },
  });
}

async function ensureGarden(userId, database = prisma) {
  let garden = await database.garden.findUnique({
    where: { ownerId: userId },
  });

  if (!garden) {
    garden = await database.garden.create({
      data: {
        ownerId: userId,
        year: new Date().getFullYear(),
      },
    });
  }

  return garden;
}
function getNonOverlappingPosition(existingFlowers) {
    const gardenWidth = 700;
    const flowerWidth = 100;
    const grassStart = 520;
    const grassEnd = 640;
  
    let left = 0;
    let top = 0;
    let tries = 0;
    let overlapping = true;
  
    while (overlapping && tries < 100) {
      left = Math.random() * (gardenWidth - flowerWidth);
      top = grassStart + Math.random() * (grassEnd - grassStart);
  
      overlapping = existingFlowers.some((flower) => {
        const flowerLeft = Number(flower.left);
        const flowerTop = Number(flower.top);
  
        return (
          Math.abs(left - flowerLeft) < 90 &&
          Math.abs(top - flowerTop) < 90
        );
      });
  
      tries += 1;
    }
  
    return { left, top };
  }
  

async function getGardenResponse(userId, { includePrivate = false, viewerUserId = userId, database = prisma } = {}) {
  const user = await getUser(userId, database);

  if (!user) {
    return null;
  }

  const garden = user.garden || (await ensureGarden(user.id, database));

  const fullGarden = await database.garden.findUnique({
    where: { id: garden.id },
    include: {
      flowers: {
        include: {
          messages: true,
          ...(includePrivate
            ? {
                dailyCheckIn: {
                  select: {
                    createdAt: true,
                    journal: { select: { content: true } },
                    emotionResult: {
                      select: {
                        label: true,
                        secondaryEmotions: true,
                        intensity: true,
                        confidence: true
                      }
                    }
                  }
                },
                sourceEvent: { select: { secondaryEmotions: true } }
              }
            : {})
        },
        orderBy: {
          createdAt: "desc",
        },
      },
      visitRecords: {
        orderBy: {
          createdAt: "desc",
        },
        take: 30,
      },
    },
  });

  return filterSocialPayload(serializeGardenResponse({
    owner: user,
    garden: { ...fullGarden, flowers: await withGardenFlowerSupportState(database, fullGarden.flowers, viewerUserId) },
    activeVisitors: getActiveVisitors(fullGarden.id),
    includePrivate
  }), await hiddenSocialIds(database, viewerUserId));
}


installCommunityPolicy(app, prisma);
installAiOutputReporting(app, prisma);
app.get("/ai/disclosure", (_req,res) => res.json(aiDisclosure()));
installSocialSafety(app, { db: prisma, realtime, clearVisitors: async (tx, a, b) => {
  for (const [ownerId, visitorId] of [[a,b],[b,a]]) {
    const garden = await tx.garden.findUnique({ where: { ownerId }, select: { id: true } });
    if (garden) setActiveVisitors(garden.id, getActiveVisitors(garden.id).filter(v => v.visitorId !== visitorId));
  }
} });

app.get("/users", async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        avatar: true,
      },
      orderBy: {
        createdAt: "asc",
      },
      take: 100,
    });

    const hidden = await hiddenSocialIds(prisma, req.auth.userId);
    res.json(users.filter(user => !hidden.has(user.id)));
  } catch (err) {
    logServerError("GET /users error", err);
    res.status(500).json({ error: "Failed to get users" });
  }
});

app.get("/users/search", async (req, res) => {
    try {
      if (typeof req.query.name !== "string") {
        return res.status(400).json({ error: "Search name must be text" });
      }
      const name = req.query.name.trim();
      const currentUserId = req.auth.userId;

      if (name.length > MAX_SEARCH_LENGTH) {
        return res.status(413).json({ error: `Search name must be ${MAX_SEARCH_LENGTH} characters or fewer` });
      }
  
      if (!name) {
        return res.json([]);
      }
  
      const users = await prisma.user.findMany({
        where: {
          id: {
            not: currentUserId
          },
  
          OR: [
            { name: { contains: name, mode: "insensitive" } },
            { accountId: { contains: name.replace(/^@/, ""), mode: "insensitive" } }
          ]
        },
  
        select: {
          id: true,
          name: true,
          accountId: true,
          avatar: true
        },
  
        orderBy: {
          name: "asc"
        },
        take: 20
      });
  
      const hidden = await hiddenSocialIds(prisma, req.auth.userId);
    res.json(users.filter(user => !hidden.has(user.id)));
  
    } catch (err) {
  
      logServerError("Search user error", err);
  
      res.status(500).json({
        error: "Failed to search users"
      });
    }
  });

app.get("/users/me/garden-privacy", async (req, res) => {
  try {
    const settings = await prisma.user.findUnique({
      where: { id: req.auth.userId }, select: { allowGardenVisits: true }
    });
    if (!settings) return res.status(404).json({ error: "User not found" });
    res.json(settings);
  } catch (err) {
    logServerError("GET garden privacy error", err);
    res.status(500).json({ error: "Failed to load Garden privacy" });
  }
});

app.patch("/users/me/garden-privacy", allowBodyFields(["allowGardenVisits"]), async (req, res) => {
  if (typeof req.body?.allowGardenVisits !== "boolean") {
    return res.status(400).json({ error: "allowGardenVisits must be a boolean" });
  }
  try {
    const update = () => withSocialLocks(prisma, [req.auth.userId], async tx => {
      const settings = await tx.user.update({ where: { id: req.auth.userId },
        data: { allowGardenVisits: req.body.allowGardenVisits }, select: { allowGardenVisits: true } });
      if (!settings.allowGardenVisits) {
        const garden = await tx.garden.findUnique({ where: { ownerId: req.auth.userId }, select: { id: true } });
        if (garden) setActiveVisitors(garden.id, []);
      }
      return settings;
    });
    const settings = req.body.allowGardenVisits ? await update()
      : await realtime.withRevocation({ gardenOwnerId: req.auth.userId }, update);
    res.json(settings);
  } catch (err) {
    if (sendSocialError(res, err)) return;
    logServerError("PATCH garden privacy error", err);
    res.status(500).json({ error: "Failed to save Garden privacy" });
  }
});

app.get("/users/:userId/garden-access", async (req, res) => {
  try {
    const access = await withSocialLocks(prisma, [req.params.userId, req.auth.userId], async tx => {
      const owner = await tx.user.findUnique({ where: { id: req.params.userId }, select: { id: true, allowGardenVisits: true } });
      if (!owner) throw new SocialAccessError("User not found", 404);
      return { allowGardenVisits: owner.allowGardenVisits, canVisit: await canVisitGarden(tx, owner, req.auth.userId) };
    });
    res.json(access);
  } catch (err) {
    if (sendSocialError(res, err)) return;
    logServerError("GET Garden access error", err);
    res.status(500).json({ error: "Failed to load Garden access" });
  }
});

app.get("/users/:userId", async (req, res) => {
  try {
    await requireSocialPair(prisma, req.auth.userId, req.params.userId);
    const user = await prisma.user.findUnique({
      where: {
        id: req.params.userId,
      },
      ...(req.auth.userId === req.params.userId
        ? { include: { friends: true } }
        : { select: { id: true, name: true, avatar: true } }),
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      id: user.id,
      name: user.name,
      avatar: user.avatar,
      ...(Array.isArray(user.friends)
        ? { friends: user.friends.map((friendship) => friendship.friendId) }
        : {}),
    });
  } catch (err) {
    if (sendSocialError(res, err)) return;
    logServerError("GET /users/:userId error", err);
    res.status(500).json({ error: "Failed to get user" });
  }
});

app.get("/users/:userId/friends", async (req, res) => {
  try {
    if (!requireOwnUser(req, res, req.params.userId)) return;
    const user = await prisma.user.findUnique({
      where: {
        id: req.params.userId,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const friendships = await prisma.friendship.findMany({
      where: {
        userId: user.id,
      },
      include: {
        friend: {
          select: {
            id: true,
            name: true,
            accountId: true,
            allowGardenVisits: true,
            avatar: true,
          },
        },
      },
      take: 500,
    });

    const hidden = await hiddenSocialIds(prisma, req.auth.userId);
    res.json(friendships.map((item) => ({ ...item.friend, online: presence.isOnline(item.friend.id) }))
      .filter(user => !hidden.has(user.id)));
  } catch (err) {
    logServerError("GET /users/:userId/friends error", err);
    res.status(500).json({ error: "Failed to get friends" });
  }
});

app.get("/users/:userId/garden", async (req, res) => {
  if (req.query.view !== undefined) {
    if (req.query.view !== "metadata" || Object.keys(req.query).some(key => key !== "view")) {
      return res.status(400).json({ error: "Invalid Garden view" });
    }
    if (!requireOwnUser(req, res, req.params.userId)) return;
    try {
      const flowers = await prisma.flower.findMany({
        where: { userId: req.auth.userId }, select: historyFlowerSelect,
        orderBy: { createdAt: "desc" }
      });
      return res.json({ owner: { id: req.auth.userId }, flowers: flowers.map(historyFlowerMetadata) });
    } catch (error) {
      logServerError("GET Garden metadata error", error);
      return res.status(500).json({ error: "Unable to load Garden metadata" });
    }
  }
  try {
    const gardenResponse = await withSocialAuthorization(prisma, req.params.userId, req.auth.userId,
      tx => getGardenResponse(req.params.userId, {
        includePrivate: req.auth.userId === req.params.userId, viewerUserId: req.auth.userId, database: tx
      }));

    if (!gardenResponse) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(filterSocialPayload(gardenResponse, await hiddenSocialIds(prisma, req.auth.userId)));
  } catch (err) {
    if (sendSocialError(res, err)) return;
    logServerError("GET /users/:userId/garden error", err);
    res.status(500).json({ error: "Failed to get garden" });
  }
});
app.post("/auth/session", authenticateFirebaseIdentity, authAccountRateLimit, async (req, res) => {
  try {
    const identity = req.firebase;
    if (!identity.email || !identity.emailVerified) {
      return res.status(403).json({
        error: "Verify your email before entering PetalPal"
      });
    }

    if (await prisma.accountDeletion.findUnique({where:{firebaseUid:identity.uid},select:{userId:true}})) return res.status(403).json({error:"Account deletion is pending or complete",code:"ACCOUNT_DELETED"});
    const normalizedEmail = identity.email.trim().toLowerCase();
    let user = await prisma.user.findUnique({
      where: { firebaseUid: identity.uid }
    });
    let isNewUser = false;
    let fairyEvent = null;

    if (!user) {
      const legacyUser = await prisma.user.findUnique({
        where: { email: normalizedEmail }
      });
      if (legacyUser) {
        user = await prisma.user.update({
          where: { id: legacyUser.id },
          data: {
            firebaseUid: identity.uid,
            emailVerifiedAt: legacyUser.emailVerifiedAt || new Date()
          }
        });
      } else {
        isNewUser = true;
        if (req.body?.deferProfileCreation === true) {
          return res.json({
            user: null,
            isNewUser: true,
            needsProfile: true,
            email: normalizedEmail
          });
        }
        const requestedName = String(req.body?.name || identity.name || "").trim();
        if (!requestedName) {
          return res.status(400).json({ error: "Display name is required" });
        }
        if (requestedName.length > MAX_DISPLAY_NAME_LENGTH) {
          return res.status(413).json({ error: `Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer` });
        }
        if (!validOptionalString(req.body?.avatar, MAX_AVATAR_LENGTH)) {
          return res.status(413).json({ error: `Avatar must be ${MAX_AVATAR_LENGTH} characters or fewer` });
        }
        if (req.body.communityTermsVersion !== COMMUNITY_VERSION) return res.status(428).json({error:'Accept the Community Guidelines before creating a public profile.',code:'COMMUNITY_ACCEPTANCE_REQUIRED'});
        assertSocialContent(requestedName);
        assertSocialContent(req.body.avatar || '🦋');
        const now = Date.now();
        const timezone = normalizeTimezone(req.body?.timezone) || "UTC";
        const preferredLocale = req.body?.preferredLocale === undefined
          ? "en"
          : normalizeLocale(req.body.preferredLocale);
        if (!preferredLocale) {
          return res.status(400).json({ error: "Invalid preferred locale" });
        }
        fairyEvent = resolveFairyEvent({
          onboardingStep: "EMPTY_GARDEN",
          onboardingCompleted: false,
          distinctCheckInCount: 0
        });
        user = await prisma.user.create({
          data: {
            id: `user_${now}`,
            accountId: `PP${String(now).slice(-8)}`,
            firebaseUid: identity.uid,
            name: requestedName,
            communityTermsVersion: COMMUNITY_VERSION,
            communityAcceptedAt: new Date(),
            email: normalizedEmail,
            emailVerifiedAt: new Date(),
            avatar: req.body?.avatar || "🦋",
            timezone,
            preferredLocale,
            garden: { create: { year: new Date().getFullYear() } },
            fairyState: { create: { lastEvent: fairyEvent.code } },
            aiConsent: {
              create: {
                termsVersion: AI_TERMS_VERSION,
                aiProcessing: false,
                grantedAt: null
              }
            },
            subscriptionEntitlement: { create: {} }
          }
        });
      }
    }

    return res.json({
      user: {
        id: user.id,
        accountId: user.accountId,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        timezone: user.timezone,
        preferredLocale: user.preferredLocale,
        emailVerified: true
      },
      isNewUser,
      fairyEvent
    });
  } catch (error) {
    if (error?.code === "CONTENT_REJECTED") return res.status(422).json({error:"Please choose a profile that follows the Community Guidelines.",code:error.code});
    logServerError("POST /auth/session error", error);
    return res.status(500).json({ error: "Unable to create PetalPal session" });
  }
});

app.post("/auth/email-code/request", async (_req, res) => {
  return res.status(410).json({ error: "Use Firebase Authentication" });
  /* legacy implementation retained temporarily
  try {
    const email = normalizeEmail(req.body?.email);
    const purpose = req.body?.purpose === "REGISTER" ? "REGISTER" : "LOGIN";
    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (purpose === "REGISTER" && existingUser) {
      return res.status(409).json({ error: "This email already has an account. Log in instead." });
    }
    if (purpose === "LOGIN" && !existingUser) {
      return res.status(404).json({ error: "No account exists for this email. Create one first." });
    }

    const latest = await prisma.emailAuthCode.findFirst({
      where: { email, purpose, consumedAt: null },
      orderBy: { createdAt: "desc" }
    });
    if (latest && Date.now() - latest.createdAt.getTime() < OTP_RESEND_MS) {
      return res.status(429).json({ error: "Wait 60 seconds before requesting another code." });
    }

    const code = generateEmailCode();
    const record = await prisma.emailAuthCode.create({
      data: {
        email,
        purpose,
        codeHash: hashEmailCode(email, code),
        expiresAt: new Date(Date.now() + OTP_TTL_MS)
      }
    });

    try {
      await sendEmailCode(email, code);
    } catch (error) {
      await prisma.emailAuthCode.delete({ where: { id: record.id } }).catch(() => {});
      throw error;
    }

    return res.json({ success: true, expiresInSeconds: OTP_TTL_MS / 1000 });
  } catch (error) {
    console.error("POST /auth/email-code/request error:", error);
    return res.status(500).json({ error: error.message || "Unable to send verification code" });
  }
  */
});

app.post("/auth/email-code/verify", async (_req, res) => {
  return res.status(410).json({ error: "Use Firebase Authentication" });
  /* legacy implementation retained temporarily
  try {
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code || "").trim();
    const purpose = req.body?.purpose === "REGISTER" ? "REGISTER" : "LOGIN";
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: "Enter the 6-digit verification code" });
    }

    const record = await prisma.emailAuthCode.findFirst({
      where: { email, purpose, consumedAt: null },
      orderBy: { createdAt: "desc" }
    });
    if (!record || record.expiresAt <= new Date()) {
      return res.status(400).json({ error: "This code has expired. Request a new one." });
    }
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      return res.status(429).json({ error: "Too many incorrect attempts. Request a new code." });
    }
    if (!emailCodesMatch(record.codeHash, email, code)) {
      await prisma.emailAuthCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } }
      });
      return res.status(400).json({ error: "Incorrect verification code" });
    }

    let user = await prisma.user.findUnique({ where: { email } });
    if (purpose === "LOGIN" && !user) {
      return res.status(404).json({ error: "Account not found" });
    }
    const requestedName = String(req.body?.name || "").trim();
    if (purpose === "REGISTER" && !user && !requestedName) {
      return res.status(400).json({ error: "Display name is required" });
    }

    const consumed = await prisma.emailAuthCode.updateMany({
      where: { id: record.id, consumedAt: null },
      data: { consumedAt: new Date() }
    });
    if (consumed.count !== 1) {
      return res.status(409).json({ error: "This code has already been used" });
    }

    if (!user) {
      const now = Date.now();
      const timezone = normalizeTimezone(req.body?.timezone) || "UTC";
      user = await prisma.user.create({
        data: {
          id: `user_${now}`,
          accountId: `PP${String(now).slice(-8)}`,
          name: requestedName,
          email,
          emailVerifiedAt: new Date(),
          avatar: req.body?.avatar || "🦋",
          timezone,
          garden: { create: { year: new Date().getFullYear() } },
          fairyState: { create: {} },
          aiConsent: {
            create: {
              termsVersion: AI_TERMS_VERSION,
              aiProcessing: Boolean(req.body?.aiConsent),
              grantedAt: req.body?.aiConsent ? new Date() : null
            }
          },
          subscriptionEntitlement: { create: {} }
        }
      });
    } else if (!user.emailVerifiedAt) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() }
      });
    }

    const safeUser = {
      id: user.id,
      accountId: user.accountId,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      timezone: user.timezone,
      emailVerified: true
    };
    return res.json({ user: safeUser, token: createAccessToken(safeUser) });
  } catch (error) {
    console.error("POST /auth/email-code/verify error:", error);
    return res.status(500).json({ error: error.message || "Unable to verify code" });
  }
  */
});

app.post("/register", (_req, res) => {
  res.status(410).json({
    error: "Use Firebase Authentication to register"
  });
});

app.post("/login", (_req, res) => {
  res.status(410).json({
    error: "Use Firebase Authentication to log in"
  });
});

app.post("/legacy-register-disabled", async (req, res) => {
    return res.status(410).json({ error: "Use Firebase Authentication" });
    /* legacy implementation retained temporarily
    try {
      const {
        name,
        email,
        password,
        avatar,
        timezone: requestedTimezone,
        aiConsent = false
      } = req.body;
  
      if (!name || !email || !password) {
        return res.status(400).json({
          error: "Name, email and password are required"
        });
      }
  
      const normalizedEmail = email.trim().toLowerCase();
      const timezone = normalizeTimezone(requestedTimezone);

      if (!timezone) {
        return res.status(400).json({ error: "Invalid timezone" });
      }
  
      if (password.length < 6) {
        return res.status(400).json({
          error: "Password must be at least 6 characters"
        });
      }
  
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { email: normalizedEmail },
            {
              name: {
                equals: name.trim(),
                mode: "insensitive"
              }
            }
          ]
        }
      });
  
      if (existingUser) {
        return res.status(400).json({
          error: "Email or username already exists"
        });
      }
  
      const passwordHash = await bcrypt.hash(password, 12);
  
      const id = `user_${Date.now()}`;
      const accountId = `PP${Date.now().toString().slice(-8)}`;
  
      const user = await prisma.user.create({
        data: {
          id,
          accountId,
          name: name.trim(),
          email: normalizedEmail,
          passwordHash,
          avatar: avatar || "🦋",
          timezone,
          garden: {
            create: {
              year: new Date().getFullYear()
            }
          },
          fairyState: {
            create: {}
          },
          aiConsent: {
            create: {
              termsVersion: AI_TERMS_VERSION,
              aiProcessing: Boolean(aiConsent),
              grantedAt: aiConsent ? new Date() : null
            }
          },
          subscriptionEntitlement: {
            create: {}
          }
        },
        select: {
          id: true,
          accountId: true,
          name: true,
          email: true,
          avatar: true,
          timezone: true
        }
      });
  
      res.status(201).json({
        user,
        token: createAccessToken(user)
      });
    } catch (err) {
      console.error("REGISTER error:", err);
      res.status(500).json({
        error: "Failed to register"
      });
    }
    */
  });

  app.post("/legacy-login-disabled", async (req, res) => {
    return res.status(410).json({ error: "Use Firebase Authentication" });
    /* legacy implementation retained temporarily
    try {
      const { email, password } = req.body;
  
      if (!email || !password) {
        return res.status(400).json({
          error: "Email and password are required"
        });
      }
  
      const normalizedEmail = email.trim().toLowerCase();
  
      const user = await prisma.user.findUnique({
        where: {
          email: normalizedEmail
        }
      });
  
      if (!user || !user.passwordHash) {
        return res.status(401).json({
          error: "Invalid email or password"
        });
      }
  
      const passwordMatches = await bcrypt.compare(
        password,
        user.passwordHash
      );
      console.log("passwordMatches =", passwordMatches);
  
      if (!passwordMatches) {
        return res.status(401).json({
          error: "Invalid email or password"
        });
      }
  
      const safeUser = {
        id: user.id,
        accountId: user.accountId,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        timezone: user.timezone
      };

      res.json({
        user: safeUser,
        token: createAccessToken(safeUser)
      });
    } catch (err) {
      console.error("LOGIN error:", err);
      res.status(500).json({
        error: "Failed to log in"
      });
    }
    */
  });
  app.put("/users/avatar", async (req, res) => {
    try {
      const { avatar } = req.body;
      const userId = req.auth.userId;

      if (typeof avatar !== "string" || !avatar.trim() || avatar.trim().length > MAX_AVATAR_LENGTH) {
        return res.status(400).json({ error: `Avatar must be 1-${MAX_AVATAR_LENGTH} characters` });
      }
  
      await requireCommunityAcceptance(prisma, userId);
      assertSocialContent(avatar);
      const user = await prisma.user.update({
        where: {
          id: userId
        },
        data: {
          avatar: avatar.trim()
        },
        select: { id: true, avatar: true }
      });
  
      res.json(user);
    } catch (err) {
      if (err?.code === "CONTENT_REJECTED" || sendSocialError(res, err)) { if (!res.headersSent) res.status(422).json({error:"Please revise your profile.",code:err.code}); return; }
      logServerError("PUT /users/avatar error", err);
  
      res.status(500).json({
        error: "Failed to update avatar"
      });
    }
  });

app.put("/users/:userId/profile",
  (req, res, next) => { if (requireOwnUser(req, res, req.params.userId)) next(); },
  allowBodyFields(["preferredLocale"]), async (req, res) => {

  const preferredLocale = normalizeLocale(req.body?.preferredLocale);
  if (!preferredLocale) {
    return res.status(400).json({ error: "Invalid preferred locale" });
  }

  const user = await prisma.user.update({
    where: { id: req.auth.userId },
    data: { preferredLocale },
    select: {
      id: true,
      accountId: true,
      name: true,
      email: true,
      avatar: true,
      timezone: true,
      preferredLocale: true
    }
  });

  res.json({ user });
});

app.post("/users", (_req, res) => {
  res.status(410).json({
    error: "This endpoint has been removed. Use /register instead."
  });
});

app.get("/session", async (req, res) => {
  const metadata = req.query.view === "metadata";
  if (req.query.view !== undefined && (!metadata || Object.keys(req.query).some(key => key !== "view"))) {
    return res.status(400).json({ error: "Invalid session view" });
  }
  const account = await prisma.user.findUnique({
    where: { id: req.auth.userId },
    select: {
      id: true,
      accountId: true,
      name: true,
      email: true,
      avatar: true,
      timezone: true,
      preferredLocale: true,
      createdAt: true
    }
  });

  if (!account) {
    return res.status(401).json({ error: "Authenticated user no longer exists" });
  }
  const { createdAt, ...profile } = account;
  const user = { ...profile, betaTester: isBetaTester(createdAt) };

  const timezone = normalizeTimezone(user.timezone) || "UTC";
  const localDate = getLocalDate(timezone);

  const [fairyState, todayCheckIn, garden] = await Promise.all([
    metadata ? prisma.fairyState.findUnique({
      where: { userId: user.id },
      select: { onboardingStep: true, onboardingCompleted: true, lastEvent: true, unlockedFeatures: true }
    }) : prisma.fairyState.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id }
    }),
    prisma.dailyCheckIn.findFirst({
      where: {
        userId: user.id,
        localDate
      },
      orderBy: { createdAt: "desc" },
      ...(metadata ? { select: { id: true, localDate: true } } : { include: {
        journal: true,
        emotionResult: true,
        flower: { include: { messages: true } }
      } })
    }),
    metadata ? Promise.resolve(null) : getGardenResponse(user.id, { includePrivate: true })
  ]);

  if (metadata) return res.json(sessionMetadata({ user, fairyState, todayCheckIn,
    dailyGrowLimitEnabled: isDailyGrowLimitEnabled() }));

  res.json({
    user,
    fairyState: withOnboardingGuideFairy(fairyState),
    todayCheckIn,
    hasCheckedInToday: Boolean(todayCheckIn),
    dailyGrowLimitEnabled: isDailyGrowLimitEnabled(),
    garden
  });
});

// Private journals never enter Daily Grow, Events, or AI processing.
app.post("/users/:userId/journals",
  (req, res, next) => { if (requireOwnUser(req, res, req.params.userId)) next(); },
  allowBodyFields(["content"]), async (req, res) => {
  const content = req.body?.content;
  if (typeof content !== "string" || !content.trim()) {
    return res.status(400).json({ error: "Write something before saving your journal" });
  }
  if (content.length > 2000) return res.status(413).json({ error: "Journal must be 2000 characters or fewer" });
  try { assertContentAllowed(content); } catch (error) { if (error?.code === CONTENT_REJECTED) return res.status(422).json(contentSafetyResponse(req,error)); throw error; }
  const journal = await prisma.journal.create({
    data: { userId: req.auth.userId, content: content.trim() }
  });
  res.status(201).json(journal);
});

// Fix a saved journal: same rules as writing one. Only the owner's own journal changes.
app.put("/users/:userId/journals/:journalId",
  (req, res, next) => { if (requireOwnUser(req, res, req.params.userId)) next(); },
  allowBodyFields(["content"]), async (req, res) => {
  const content = req.body?.content;
  if (typeof content !== "string" || !content.trim()) {
    return res.status(400).json({ error: "Write something before saving your journal" });
  }
  if (content.length > 2000) return res.status(413).json({ error: "Journal must be 2000 characters or fewer" });
  try { assertContentAllowed(content); } catch (error) { if (error?.code === CONTENT_REJECTED) return res.status(422).json(contentSafetyResponse(req,error)); throw error; }
  const updated = await prisma.journal.updateMany({
    where: { id: req.params.journalId, userId: req.auth.userId },
    data: { content: content.trim() }
  });
  if (!updated.count) return res.status(404).json({ error: "Journal not found" });
  res.json({ id: req.params.journalId, content: content.trim() });
});

app.get("/users/:userId/journals/:journalId/cover", async (req, res) => {
  if (!requireOwnUser(req, res, req.params.userId)) return;
  const journal = await prisma.journal.findFirst({
    where: { id: req.params.journalId, userId: req.auth.userId }, select: { coverImage: true }
  });
  if (!journal) return res.status(404).json({ error: "Journal not found" });
  res.set("Cache-Control", "no-store").json(journal);
});

app.get("/users/:userId/journals", async (req, res) => {
  if (!requireOwnUser(req, res, req.params.userId)) return;
  let page;
  try { page = parseJournalPage(req.query, req.auth.userId); }
  catch { return res.status(400).json({ error: "Invalid Journal page" }); }
  if (page?.cursor) {
    // A cutoff is not an authorization grant. Verify its anchor in this owner's index.
    const anchor = await prisma.journal.findFirst({
      where: { userId: req.auth.userId, id: page.cursor.id, createdAt: new Date(page.cursor.createdAt) },
      select: { id: true }
    });
    if (!anchor) return res.status(400).json({ error: "Invalid Journal page" });
  }
  const user = await prisma.user.findUnique({ where: { id: req.auth.userId }, select: { timezone: true } });
  const timezone = normalizeTimezone(user?.timezone) || "UTC";
  const journals = await prisma.journal.findMany({
    where: { userId: req.auth.userId, ...(page?.cursor ? { OR: [
      { createdAt: { lt: new Date(page.cursor.createdAt) } },
      { createdAt: new Date(page.cursor.createdAt), id: { lt: page.cursor.id } }
    ] } : {}) },
    select: { id: true, content: true, createdAt: true, dailyCheckIn: { include: { emotionResult: true, flower: { include: { messages: true } } } } },
    orderBy: page ? [{ createdAt: "desc" }, { id: "desc" }] : { createdAt: "desc" },
    ...(page ? { take: page.limit + 1 } : {})
  });
  const visible = page ? journals.slice(0, page.limit) : journals;
  const entries = visible.map(journal => ({
    id: journal.id,
    createdAt: journal.createdAt,
    localDate: journal.dailyCheckIn?.localDate || new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit"
    }).format(journal.createdAt),
    journal: { id: journal.id, content: journal.content },
    emotionResult: journal.dailyCheckIn?.emotionResult || null,
    flower: journal.dailyCheckIn?.flower || null
  }));
  if (!page) return res.json(entries);
  return res.json({ journals: entries, nextCursor: journals.length > page.limit
    ? journalPageCursor(req.auth.userId, visible.at(-1)) : null });
});

app.get("/users/:userId/check-ins", async (req, res) => {
  if (!requireOwnUser(req, res, req.params.userId)) return;

  const checkIns = await prisma.dailyCheckIn.findMany({
    where: { userId: req.auth.userId },
    include: {
      journal: true,
      emotionResult: true,
      flower: { include: { messages: true } }
    },
    orderBy: { localDate: "desc" },
    take: 366
  });

  res.json(checkIns);
});

app.get("/users/:userId/fairy-state", async (req, res) => {
  if (!requireOwnUser(req, res, req.params.userId)) return;

  const fairyState = await prisma.fairyState.upsert({
    where: { userId: req.auth.userId },
    update: {},
    create: { userId: req.auth.userId }
  });

  res.json(withOnboardingGuideFairy(fairyState));
});

app.get("/api/fairies", async (req, res) => {
  const onboarding = await prisma.fairyState.findUnique({
    where: { userId: req.auth.userId },
    select: { onboardingCompleted: true }
  });
  if (onboarding?.onboardingCompleted) {
    await ensureStarterFairy(req.auth.userId);
  }
  const fairies = await prisma.userFairy.findMany({
    where: { userId: req.auth.userId },
    orderBy: { unlockedAt: "asc" },
    select: {
      id: true,
      fairyType: true,
      name: true,
      unlockSource: true,
      unlockMonth: true,
      unlockedAt: true,
      isActive: true,
      level: true,
      progression: true
    }
  });
  res.json({
    fairies: fairies.map(({ fairyType, ...fairy }) => ({
      ...fairy,
      type: fairyType
    })),
    activeFairyId: fairies.find(({ isActive }) => isActive)?.id || null
  });
});

app.put("/api/fairies/:fairyId/active", async (req, res) => {
  try {
    const activeFairy = await prisma.$transaction(async (tx) => {
      await lockTransaction(tx, "fairy-owner", req.auth.userId);
      const owned = await tx.userFairy.findFirst({
        where: { id: req.params.fairyId, userId: req.auth.userId }
      });
      if (!owned) return null;
      await tx.userFairy.updateMany({
        where: { userId: req.auth.userId, isActive: true },
        data: { isActive: false }
      });
      return tx.userFairy.update({
        where: { id: owned.id },
        data: { isActive: true }
      });
    });
    if (!activeFairy) return res.status(404).json({ error: "Fairy not owned" });
    res.json({
      activeFairyId: activeFairy.id,
      fairy: {
        id: activeFairy.id,
        type: activeFairy.fairyType,
        name: activeFairy.name
      }
    });
  } catch (error) {
    logServerError("PUT /api/fairies/:fairyId/active error", error);
    res.status(500).json({ error: "Unable to select active Fairy" });
  }
});

app.get("/api/fairy/progress", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.auth.userId },
    select: { timezone: true }
  });
  if (!user) return res.status(404).json({ error: "User not found" });
  const timezone = normalizeTimezone(user.timezone) || "UTC";
  const requestedMonth = typeof req.query.month === "string" ? req.query.month : null;
  const month = requestedMonth || monthFromLocalDate(getLocalDate(timezone));
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return res.status(400).json({ error: "month must use YYYY-MM format" });
  }
  const progress = await prisma.$transaction((tx) =>
    syncMonthlyFairyProgress(tx, req.auth.userId, month)
  );
  res.json(progress);
});

app.get("/api/fairy/runtime", async (req, res) => {
  try {
    const onboarding = await prisma.fairyState.findUnique({
      where: { userId: req.auth.userId },
      select: { onboardingCompleted: true }
    });
    if (!onboarding?.onboardingCompleted) {
      return res.status(409).json({
        error: "Complete onboarding before starting the Fairy runtime",
        onboardingCompleted: false
      });
    }

    await ensureStarterFairy(req.auth.userId);
    const now = new Date();
    const momentsEnabled = fairyMomentsEnabledFor(req.auth.userId);
    const captionsEnabled = momentsEnabled && fairyMomentCaptionsEnabled();
    const result = await prisma.$transaction(async (tx) => {
      let activeFairy = await tx.userFairy.findFirst({
        where: { userId: req.auth.userId, isActive: true },
        include: { runtime: true }
      });
      if (!activeFairy) throw new Error("ACTIVE_FAIRY_NOT_FOUND");
      await lockTransaction(tx, "fairy-runtime", activeFairy.id);
      activeFairy = await tx.userFairy.findUnique({
        where: { id: activeFairy.id },
        include: { runtime: true }
      });
      const runtime = activeFairy.runtime || await tx.fairyRuntime.create({
        data: { userFairyId: activeFairy.id }
      });
      // Her day and night follow the account time zone (lib/fairy-runtime.js).
      const owner = await tx.user.findUnique({
        where: { id: req.auth.userId },
        select: { timezone: true, preferredLocale: true }
      });
      const reconciled = reconcileFairyRuntime(runtime, {
        now,
        timezone: owner?.timezone,
        enteredSince: momentsEnabled ? fairyMomentsSince(now) : null
      });
      const persisted = await tx.fairyRuntime.update({
        where: { userFairyId: activeFairy.id },
        data: reconciled.update
      });
      const response = formatFairyRuntimeResponse(
        activeFairy,
        persisted,
        reconciled.transition
      );
      // Every owner's Garden follows her day now (she walks, takes tea, swings, sleeps); Moments stay on the list.
      if (!momentsEnabled) return { ...response, gardenSchedule: true };
      await recordFairyMoments(tx, {
        userId: req.auth.userId,
        userFairyId: activeFairy.id,
        entered: reconciled.entered,
        timezone: owner?.timezone,
        locale: owner?.preferredLocale,
        captionSource: captionsEnabled ? "PENDING" : "FALLBACK"
      });
      const unread = await hasUnreadFairyMoments(tx, {
        userFairyId: activeFairy.id,
        momentsSeenAt: activeFairy.momentsSeenAt,
        now
      });
      // Same owner list: the Garden places her by this schedule (she has her own day).
      return { ...response, moments: { unread }, gardenSchedule: true };
    });
    res.json(result);
    if (captionsEnabled) {
      // After the response: a slow or failed caption never delays the garden.
      void fairyMomentCaptionFiller({ prisma, ownerId: req.auth.userId })
        .catch((error) => logServerError("Fairy Moment caption fill failed", error));
    }
  } catch (error) {
    logServerError("GET /api/fairy/runtime error", error);
    res.status(500).json({ error: "Unable to load Fairy runtime" });
  }
});

const FAIRY_MOMENT_ID = /^[A-Za-z0-9_-]{1,64}$/;

app.get("/api/fairy/moments", async (req, res) => {
  if (!fairyMomentsEnabledFor(req.auth.userId)) return res.status(404).json({ error: "Not found" });
  let before = null;
  if (req.query.before !== undefined) {
    before = typeof req.query.before === "string" ? new Date(req.query.before) : null;
    if (!before || Number.isNaN(before.getTime())) {
      return res.status(400).json({ error: "before must be an ISO timestamp" });
    }
  }
  try {
    const result = await listFairyMoments(prisma, { userId: req.auth.userId, before, now: new Date() });
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  } catch (error) {
    logServerError("GET /api/fairy/moments error", error);
    res.status(500).json({ error: "Unable to load Fairy Moments" });
  }
});

app.post("/api/fairy/moments/:momentId/like", async (req, res) => {
  if (!fairyMomentsEnabledFor(req.auth.userId)) return res.status(404).json({ error: "Not found" });
  if (!FAIRY_MOMENT_ID.test(req.params.momentId) || typeof req.body.liked !== "boolean") {
    return res.status(400).json({ error: "liked must be a boolean" });
  }
  try {
    const updated = await setFairyMomentLike(prisma, {
      userId: req.auth.userId, momentId: req.params.momentId, liked: req.body.liked, now: new Date()
    });
    if (!updated) return res.status(404).json({ error: "Not found" });
    if (req.body.liked) await rewardCloseness(req.auth.userId, "MOMENT_LIKE", req.params.momentId);
    res.json({ liked: req.body.liked });
  } catch (error) {
    logServerError("POST /api/fairy/moments/:momentId/like error", error);
    res.status(500).json({ error: "Unable to update Fairy Moment" });
  }
});

app.put("/api/fairy/moments/avatar", async (req, res) => {
  if (!fairyMomentsEnabledFor(req.auth.userId)) return res.status(404).json({ error: "Not found" });
  const avatar = req.body?.avatar ?? null;
  if (avatar !== null && !isLibraryAvatar(avatar)) {
    return res.status(400).json({ error: "avatar must be a library avatar id or null" });
  }
  try {
    const updated = await setFairyMomentsAvatar(prisma, { userId: req.auth.userId, avatar });
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({ avatar });
  } catch (error) {
    logServerError("PUT /api/fairy/moments/avatar error", error);
    res.status(500).json({ error: "Unable to update the Moments avatar" });
  }
});

app.put("/api/fairy/moments/cover", allowBodyFields(["cover"]), async (req, res) => {
  if (!fairyMomentsEnabledFor(req.auth.userId)) return res.status(404).json({ error: "Not found" });
  const cover = req.body?.cover ?? null;
  if (cover !== null && !isMomentCover(cover)) {
    return res.status(400).json({ error: "cover must be a cover library id or null" });
  }
  try {
    const updated = await setFairyMomentsCover(prisma, { userId: req.auth.userId, cover });
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({ cover });
  } catch (error) {
    logServerError("PUT /api/fairy/moments/cover error", error);
    res.status(500).json({ error: "Unable to update the Moments cover" });
  }
});

// Closeness with PPL, the calendar check-in and her keepsakes (lib/fairy-closeness.js).
// Owner-scoped by req.auth.userId; off unless FAIRY_CLOSENESS_OWNER_IDS lists the owner.
async function rewardCloseness(userId, source, key) {
  if (!fairyClosenessEnabledFor(userId)) return null;
  try {
    return await awardCloseness(prisma, { userId, source, key, now: new Date() });
  } catch (error) {
    logServerError("Fairy closeness award error", error);
    return null;
  }
}

const closenessRoute = (label, handler) => async (req, res) => {
  if (!fairyClosenessEnabledFor(req.auth.userId)) return res.status(404).json({ error: "Not found" });
  try {
    const result = await handler(req);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  } catch (error) {
    logServerError(`${label} error`, error);
    res.status(500).json({ error: "Unable to load closeness" });
  }
};

app.get("/api/fairy/closeness", closenessRoute("GET /api/fairy/closeness",
  req => closenessSummary(prisma, { userId: req.auth.userId, now: new Date() })));

app.get("/api/fairy/check-ins", (req, res, next) => {
  const month = req.query.month;
  if (month !== undefined && (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))) {
    return res.status(400).json({ error: "month must be YYYY-MM" });
  }
  next();
}, closenessRoute("GET /api/fairy/check-ins", async req => {
  const month = await listCheckIns(prisma, { userId: req.auth.userId, month: req.query.month, now: new Date() });
  // The day's petal card sits beside its check-in on the calendar when petal cards are on.
  if (month && petalCardsEnabledFor(process.env, req.auth.userId)) {
    month.petalCards = await petalDrawsForMonth(prisma, { userId: req.auth.userId, month: month.month, lang: month.locale });
  }
  return month;
}));

app.post("/api/fairy/check-in", allowBodyFields([]), closenessRoute("POST /api/fairy/check-in",
  req => checkInWithFairy(prisma, { userId: req.auth.userId, now: new Date() })));

app.get("/api/fairy/keepsakes", closenessRoute("GET /api/fairy/keepsakes",
  req => listKeepsakes(prisma, { userId: req.auth.userId, now: new Date() })));

app.post("/api/fairy/closeness/tap", allowBodyFields([]), closenessRoute("POST /api/fairy/closeness/tap",
  req => awardFairyTap(prisma, { userId: req.auth.userId, now: new Date() })));

// The daily petal card draw (lib/petal-card-draw.js), owner-scoped, once per local day.
const petalDrawRoute = (label, handler) => async (req, res) => {
  if (!petalCardsEnabledFor(process.env, req.auth.userId)) return res.status(404).json({ error: "Not found" });
  try {
    const result = await handler(req);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  } catch (error) {
    logServerError(`${label} error`, error);
    res.status(500).json({ error: "Unable to draw a petal card" });
  }
};

// Today's planting count for the Events panel; see lib/flower-quota.js.
app.get("/api/flowers/today", async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.auth.userId }, select: { id: true, timezone: true } });
    if (!user) return res.status(404).json({ error: "User not found" });
    const localDate = getLocalDate(normalizeTimezone(user.timezone) || "UTC");
    res.json(await flowerQuotaToday(prisma, { userId: user.id, localDate }));
  } catch (err) {
    logServerError("GET /api/flowers/today error", err);
    res.status(500).json({ error: "Failed to load today's flowers" });
  }
});

// A drawn card carries its reading state (lib/petal-reading.js): whether this owner can have one, and how far it got.
// The reading is extra: if its state cannot be read, the card is still shown, without one.
async function petalReadingState(userId, drawId) {
  try { return await petalReadingFor(prisma, { userId, drawId, now: new Date() }); }
  catch (error) { logServerError("petal reading state error", error); return { available: false }; }
}
async function withPetalReading(userId, result) {
  if (result?.drawn) result.drawn.reading = await petalReadingState(userId, result.drawn.id);
  return result;
}
app.get("/api/petal-cards/today", petalDrawRoute("GET /api/petal-cards/today",
  // ?deck=full: an app that sends a topic and has art for all 78; an older app keeps its 69-card deck.
  async req => withPetalReading(req.auth.userId, await todaysPetalDraw(prisma,
    { userId: req.auth.userId, now: new Date(), heavy: req.query.deck === "full" && heavyCardsOn() }))));

app.post("/api/petal-cards/draw", allowBodyFields(["position", "topic"]), (req, res, next) => {
  const { position, topic } = req.body ?? {};
  if (!Number.isInteger(position) || position < 0 || position > 100_000) {
    return res.status(400).json({ error: "position must be a whole number from 0" });
  }
  // No topic: an app from before topics (lib/petal-card-draw.js draws it from the legacy deck).
  if (topic !== undefined && !PETAL_TOPIC_IDS.includes(topic)) return res.status(400).json({ error: "topic must be one of the petal card topics" });
  next();
}, petalDrawRoute("POST /api/petal-cards/draw", async req => {
  const result = await drawPetalCard(prisma, { userId: req.auth.userId, position: req.body.position, topic: req.body.topic,
    heavy: heavyCardsOn(), now: new Date() });
  if (result) result.reading = await petalReadingState(req.auth.userId, result.id);
  return result;
}));

// Today's tarot reading: written once (at most two model attempts) for Premium or listed owners.
app.post("/api/petal-cards/reading", aiRateLimit, allowBodyFields([]), petalDrawRoute("POST /api/petal-cards/reading",
  req => requestPetalReading(prisma, { userId: req.auth.userId, now: new Date() })));

// Redemption codes (lib/redeem-codes.js). Wrong guesses are limited per account; a code
// that works does not count against the limit.
const redeemRateLimit = createRateLimiter({ limit: 10, windowMs: 60 * 60 * 1000, skipSuccessfulRequests: true });

app.get("/api/redeem", async (req, res) => {
  try {
    res.json({ redemptions: await listRedemptions(prisma, { userId: req.auth.userId }) });
  } catch (error) {
    logServerError("GET /api/redeem error", error);
    res.status(500).json({ error: "Unable to load your codes" });
  }
});

app.post("/api/redeem", redeemRateLimit, allowBodyFields(["code"]), async (req, res) => {
  if (typeof req.body?.code !== "string") return res.status(400).json({ error: "code is required", code: "INVALID_CODE" });
  try {
    res.json(await redeemCode(prisma, { userId: req.auth.userId, code: req.body.code }));
  } catch (error) {
    if (error instanceof RedeemError) return res.status(error.status).json({ error: error.message, code: error.code });
    logServerError("POST /api/redeem error", error);
    res.status(500).json({ error: "Unable to redeem this code" });
  }
});

app.put("/users/:userId/fairy-state", async (req, res) => {
  if (!requireOwnUser(req, res, req.params.userId)) return;

  const { onboardingStep, unlockedFeatures } = req.body;

  if (onboardingStep && !FAIRY_STEPS.has(onboardingStep)) {
    return res.status(400).json({ error: "Invalid onboarding step" });
  }
  if (["FLOWER_BLOOM", "GARDEN_UNLOCKED"].includes(onboardingStep)) {
    return res.status(400).json({
      error: "Flower completion steps are controlled by the backend"
    });
  }

  if (unlockedFeatures && !Array.isArray(unlockedFeatures)) {
    return res.status(400).json({ error: "unlockedFeatures must be an array" });
  }
  if (Array.isArray(unlockedFeatures) && (
    unlockedFeatures.length > 50 ||
    unlockedFeatures.some((item) => typeof item !== "string" || item.length > 64)
  )) {
    return res.status(400).json({ error: "unlockedFeatures must contain at most 50 short strings" });
  }

  const existing = await prisma.fairyState.findUnique({
    where: { userId: req.auth.userId }
  });
  if (existing?.onboardingCompleted) {
    return res.json(withOnboardingGuideFairy(existing));
  }
  if (onboardingStep && existing) {
    const currentIndex = FAIRY_STEP_ORDER.indexOf(existing.onboardingStep);
    const requestedIndex = FAIRY_STEP_ORDER.indexOf(onboardingStep);
    if (requestedIndex < currentIndex) {
      return res.status(409).json({ error: "Onboarding cannot move backwards" });
    }
  }

  const data = {
    ...(onboardingStep ? { onboardingStep } : {}),
    ...(Array.isArray(unlockedFeatures)
      ? { unlockedFeatures: unlockedFeatures.slice(0, 50) }
      : {})
  };

  const fairyState = await prisma.fairyState.upsert({
    where: { userId: req.auth.userId },
    update: data,
    create: { userId: req.auth.userId, ...data }
  });

  res.json(withOnboardingGuideFairy(fairyState));
});

app.get("/users/:userId/ai-consent", async (req, res) => {
  if (!requireOwnUser(req, res, req.params.userId)) return;

  const consent = await prisma.aiConsent.upsert({
    where: { userId: req.auth.userId },
    update: {},
    create: {
      userId: req.auth.userId,
      termsVersion: AI_TERMS_VERSION
    }
  });

  res.json(consent);
});

app.put("/users/:userId/ai-consent",
  (req, res, next) => { if (requireOwnUser(req, res, req.params.userId)) next(); },
  allowBodyFields(["aiProcessing", "personalization", "memoryEnabled", "disclosureVersion"]), async (req, res) => {

  if (!hasOnlyBooleans(req.body, ["aiProcessing", "personalization", "memoryEnabled"])) {
    return res.status(400).json({ error: "AI consent fields must be booleans" });
  }

  if (req.body.aiProcessing === true && req.body.disclosureVersion !== AI_DISCLOSURE_VERSION) return res.status(428).json({error:"Read the current AI processing disclosure before enabling AI.",code:"AI_DISCLOSURE_REQUIRED"});
  const aiProcessing = Boolean(req.body.aiProcessing);
  const personalization = aiProcessing && Boolean(req.body.personalization);
  const memoryEnabled = personalization && Boolean(req.body.memoryEnabled);
  const now = new Date();

  const consent = await updateAiConsent(prisma, { identity: req.auth, termsVersion: AI_TERMS_VERSION,
    aiProcessing, personalization, memoryEnabled, now });

  try {
    await createAuditEvent({
      eventType: aiProcessing ? (personalization || memoryEnabled ? "AI_PROCESSING_GRANTED" : "AI_PROCESSING_GRANTED") : "AI_PROCESSING_REVOKED",
      outcome: "COMPLETED", correlationId: req.requestId, actorUserId: req.auth.userId,
      targetClass: "ai_consent", actionCode: "AI_CONSENT"
    });
  } catch (auditError) {
    emitSecurityEvent({ eventType: "database_failure", outcome: "failed", correlationId: req.requestId, routeClass: securityRouteClass(req), resourceClass: "audit_event", safeReason: "audit_write_failed", fallbackUsed: true });
  }
  emitSecurityEvent({ eventType: "ai_consent_changed", outcome: "completed", correlationId: req.requestId, routeClass: securityRouteClass(req), resourceClass: "ai_consent", actorId: req.auth.userId, success: true });
  res.json(consent);
});

function withEmotionLabDiagnostics(result, includeDiagnostics, details = result.diagnostics) {
  if (!includeDiagnostics) return result;
  return { ...result, diagnostics: {
    provider: result.provider || "Cloudflare Workers AI",
    model: result.modelId || EVENT_SECONDARY_MODEL_ID.replace(/^@/, ""),
    attempted: details?.attempted ?? result.status !== "SKIPPED",
    status: details?.status || (result.status === "FAILED"
      ? (result.fallbackReason === "INVALID_MODEL_OUTPUT" ? "INVALID_RESPONSE" : "PROVIDER_ERROR")
      : result.status),
    fallbackReason: details?.fallbackReason ?? result.fallbackReason ?? null,
    workerLabels: details?.workerLabels || [],
    productLabels: details?.productLabels || [],
    validatedLabels: details?.validatedLabels || [],
    removedLabels: details?.removedLabels || []
  } };
}

async function eventEmotionResult({ userId, eventId, text, primaryGardenMood, aiProcessingAllowed, createdConsentUpdatedAt, includeDiagnostics = false }) {
  if (eventEmotionProvider() !== "workers-ai") {
    const result = await classifyHaikuEventSecondaryEmotions({ prisma, identity: { userId }, eventId,
      text, primaryGardenMood, aiProcessingAllowed, createdConsentUpdatedAt });
    return withEmotionLabDiagnostics(result, includeDiagnostics);
  }
  if (aiProcessingAllowed !== true) return withEmotionLabDiagnostics(
    { status: "SKIPPED", labels: [], latencyMs: 0, fallbackReason: "CONSENT_DISABLED" }, includeDiagnostics,
    { attempted: false, status: "SKIPPED", fallbackReason: "AI_CONSENT_DISABLED" });
  if (!primaryGardenMood || !eventSecondaryEmotionEnabled()) return withEmotionLabDiagnostics(
    { status: "SKIPPED", labels: [], latencyMs: 0, fallbackReason: "FEATURE_DISABLED" }, includeDiagnostics,
    { attempted: false, status: "SKIPPED", fallbackReason: "FEATURE_DISABLED" });
  // While Workers AI keeps failing, skip the call (and its cost reservation); the Event
  // keeps the user's Primary and a deterministic Flower, as on any other AI failure.
  if (!eventEmotionBreaker.allow()) return withEmotionLabDiagnostics(
    { status: "SKIPPED", labels: [], latencyMs: 0, fallbackReason: "CIRCUIT_OPEN" }, includeDiagnostics,
    { attempted: false, status: "SKIPPED", fallbackReason: "CIRCUIT_OPEN" });
  let result;
  let inferenceStarted = false;
  let processingEpoch = null;
  try {
    const reservation = await aiCostGate.reserve({ identity: { userId }, action: "EVENT_EMOTION", key: eventId ? `${eventId}:${EVENT_SECONDARY_MODEL_VERSION}` : null });
    if (new Date(reservation.consentUpdatedAt).getTime() !== new Date(createdConsentUpdatedAt).getTime()) throw Object.assign(new Error("Consent changed"), {code:"AI_FORBIDDEN"});
    await aiCostGate.checkProcessingConsent({ identity: { userId }, consentUpdatedAt: reservation.consentUpdatedAt });
    processingEpoch = reservation.consentUpdatedAt;
    inferenceStarted = true;
    result = await eventEmotionClassifier({ userId, eventId, text, primaryGardenMood,
      ...(includeDiagnostics ? { includeDiagnostics: true } : {}) });
    if (result?.status === "SUCCESS" || result?.status === "FAILED") eventEmotionBreaker.record(result.status === "SUCCESS");
    await aiCostGate.checkProcessingConsent({ identity: { userId }, consentUpdatedAt: reservation.consentUpdatedAt });
  } catch (error) {
    return withEmotionLabDiagnostics(
      { status: "FAILED", labels: [], latencyMs: 0, fallbackReason: isAiCostError(error) ? error.code : "RUNTIME_UNAVAILABLE" }, includeDiagnostics,
      { attempted: inferenceStarted, status: "PROVIDER_ERROR", fallbackReason: isAiCostError(error) ? error.code : "RUNTIME_UNAVAILABLE" });
  }
  const labels = canonicalEventLabels(result, primaryGardenMood);
  if (labels === null) return withEmotionLabDiagnostics(
    { status: "FAILED", labels: [], latencyMs: result?.latencyMs || 0, fallbackReason: "INVALID_MODEL_OUTPUT" }, includeDiagnostics,
    { ...result?.diagnostics, attempted: true, status: "INVALID_RESPONSE", fallbackReason: "INVALID_MODEL_OUTPUT", validatedLabels: [] });
  return withEmotionLabDiagnostics({ ...result, labels, consentUpdatedAt: processingEpoch }, includeDiagnostics);
}

function eventEmotionMetadata(emotion) {
  const success = emotion.status === "SUCCESS";
  const attempted = success || emotion.status === "FAILED";
  return {
    emotionStatus: emotion.status,
    emotionOutcome: success ? (emotion.labels.length ? `INFERRED_${emotion.labels.length}` : "ABSTAINED") : emotion.status,
    emotionProvenance: attempted ? "INFERRED_UNCONFIRMED" : null,
    emotionModelId: attempted ? (emotion.modelId || EVENT_SECONDARY_MODEL_ID) : null,
    emotionModelVersion: attempted ? (emotion.modelVersion || EVENT_SECONDARY_MODEL_VERSION) : null,
    emotionModelStatus: attempted ? (emotion.modelId ? "gateway" : "production") : null,
    emotionProbabilities: null
  };
}

async function enrichCreatedEvent(event, primaryGardenMood, aiProcessingAllowed, createdConsentUpdatedAt) {
  const haikuSelected = eventEmotionProvider() !== "workers-ai";
  const emotion = await eventEmotionResult({
    userId: event.ownerId, eventId: event.id, text: event.content, primaryGardenMood, aiProcessingAllowed, createdConsentUpdatedAt
  });
  const persist = async (database, safeEmotion) => {
    let flower = null;
    let flowerQuota = null;
    const metadata = eventEmotionMetadata(safeEmotion);
    await database.event.update({
      where: { id: event.id, ownerId: event.ownerId },
      data: { primaryGardenMood, secondaryEmotions: safeEmotion.labels, ...metadata }
    });
    // A third Event in one day is still saved; it just grows no flower (lib/flower-quota.js).
    if (primaryGardenMood && !await database.flower.findUnique({ where: { sourceEventId: event.id } })) {
      flowerQuota = await reserveFlowerPlanting(database, { userId: event.ownerId, localDate: event.localDate });
    }
    if (primaryGardenMood && flowerQuota?.granted !== false) {
      const garden = await ensureGarden(event.ownerId, database);
      const recentFlowers = await database.flower.findMany({
        where: { userId: event.ownerId }, orderBy: { createdAt: "desc" }, take: 5,
        select: { name: true, left: true, top: true }
      });
      const chosen = previewEventFlower({
        userId: event.ownerId, localDate: event.localDate, primaryGardenMood,
        labels: safeEmotion.labels, recentFlowers
      });
      flower = await database.flower.upsert({
        where: { sourceEventId: event.id },
        update: {},
        create: {
          mood: primaryGardenMood, event: "", name: chosen.name, meaning: chosen.meaning,
          img: chosen.img, speciesCode: chosen.speciesCode, colorAccent: chosen.colorAccent,
          visualEffect: chosen.visualEffect, season: chosen.season, generationSeed: chosen.generationSeed,
          variant: chosen.variant, rarity: chosen.rarity, growthState: chosen.growthState,
          ...getNonOverlappingPosition(recentFlowers), userId: event.ownerId,
          gardenId: garden.id, sourceEventId: event.id
        }
      });
    }
    return { emotion: safeEmotion, flower, flowerQuota };
  };
  try {
    return await withHaikuEventWriteFence(prisma, { event, emotion }, persist);
  } catch {
    console.info("Event enrichment persistence failed", { eventId: event.id, status: "FAILED" });
    try {
      const data = { emotionStatus: "FAILED", emotionOutcome: "FAILED", secondaryEmotions: [], emotionProbabilities: null };
      if (!haikuSelected) {
        await prisma.event.update({ where: { id: event.id, ownerId: event.ownerId }, data });
      } else {
        await prisma.event.updateMany({ where: { id: event.id, ownerId: event.ownerId,
          content: event.content, primaryGardenMood, emotionStatus: "PENDING" }, data });
      }
    } catch { /* A later retry or repair must resolve an Event still marked PENDING. */ }
    return { emotion: { ...emotion, status: "FAILED", labels: [], latencyMs: emotion.latencyMs, fallbackReason: "PERSISTENCE_FAILED" }, flower: null };
  }
}

app.post("/events", aiRateLimit, async (req, res) => {
  // Diagnostics only: wall time spent in the Event + memory-job transaction call.
  let transactionStartedAt = null;
  let transactionElapsedMs = null;
  try {
    if (req.get("x-petalpal-emotion-lab") === "1") {
      try {
        assertDevelopmentDatabase();
      } catch {
        return res.status(503).json({ error: "Emotion Lab development database is not configured safely" });
      }
      const testEmail = process.env.AUTH_E2E_TEST_EMAIL?.trim().toLowerCase();
      if (!testEmail || req.firebase?.email?.trim().toLowerCase() !== testEmail) {
        return res.status(403).json({ error: "Emotion Lab requires the dedicated E2E test account" });
      }
    }
    if (Object.hasOwn(req.body, "ownerId") || Object.hasOwn(req.body, "userId") || req.query.ownerId !== undefined || req.query.userId !== undefined) {
      return res.status(400).json({ error: "Event ownership is derived from the authenticated Firebase identity" });
    }
    // Event time is server-assigned. A client timestamp could backdate or
    // future-date Events into already-closed or not-yet-open report periods.
    if (Object.hasOwn(req.body, "occurredAt")) {
      return res.status(400).json({ error: "Event time is assigned by the server" });
    }
    // No simulated-time capability exists in this build; never silently ignore the header.
    if (req.get("x-petalpal-simulated-time") !== undefined) {
      return res.status(403).json({ error: "Simulated time is only available in an isolated test environment" });
    }
    const primaryGardenMood = req.body.primaryGardenMood ?? null;
    if (primaryGardenMood !== null && !CANONICAL_PRIMARY_GARDEN_MOODS.includes(primaryGardenMood)) {
      return res.status(400).json({ error: "Unsupported Primary Garden Mood" });
    }
    transactionStartedAt = Date.now();
    const result = await createEventAndEnqueueMemoryJob({
      prisma,
      identity: req.auth,
      content: req.body.content,
      primaryGardenMood,
      enrichmentPending: Boolean(primaryGardenMood),
      occurredAt: new Date(),
      idempotencyKey: req.get("idempotency-key")
    });
    transactionElapsedMs = Date.now() - transactionStartedAt;
    if (result.created) await rewardCloseness(req.auth.userId, "EVENT", result.event.id);
    const enrichment = result.created
      ? (primaryGardenMood
          ? await enrichCreatedEvent(result.event, primaryGardenMood, result.aiProcessingAllowed, result.aiProcessingConsentUpdatedAt)
          : { emotion: { status: "SKIPPED", labels: [], latencyMs: 0, fallbackReason: "FEATURE_DISABLED" }, flower: null })
      : { emotion: { status: result.event.emotionStatus || "SKIPPED", labels: result.event.secondaryEmotions || [] },
          flower: await prisma.flower.findUnique({ where: { sourceEventId: result.event.id } }).catch(() => null) };
    if (result.job && aiJobDispatchAllowed(result.job)) {
      try {
        await aiJobDispatcher(result.job);
      } catch {
        // The canonical PENDING AiJob remains available to the bounded reconciler.
        console.warn("AI job dispatch deferred", { jobId: result.job.id });
      }
    }
    return res.status(result.created ? 201 : 200).json({
      event: { ...result.event, primaryGardenMood: result.created ? primaryGardenMood : result.event.primaryGardenMood,
        secondaryEmotions: enrichment.emotion.labels, ...(result.created ? eventEmotionMetadata(enrichment.emotion) : {}) },
      emotion: { status: enrichment.emotion.status, labels: enrichment.emotion.labels, latencyMs: enrichment.emotion.latencyMs, fallbackReason: enrichment.emotion.fallbackReason },
      flower: enrichment.flower,
      ...(enrichment.flowerQuota?.limit ? { dailyFlowers: { limit: enrichment.flowerQuota.limit,
        planted: enrichment.flowerQuota.planted, limitReached: !enrichment.flowerQuota.granted } } : {}),
      memoryJob: result.job ? { id: result.job.id, status: result.job.status } : null
    });
  } catch (error) {
    if (error?.code === "INVALID_IDEMPOTENCY_KEY" || error?.code === "INVALID_EVENT") {
      return res.status(400).json({ error: error.message });
    }
    if (error?.code === CONTENT_REJECTED) return res.status(422).json(contentSafetyResponse(req,error));
    if (error?.code === "EVENT_TOO_LARGE") return res.status(413).json({ error: error.message });
    if (error?.code === "IDEMPOTENCY_CONFLICT") return res.status(409).json({ error: error.message });
    if (transactionStartedAt !== null && transactionElapsedMs === null) transactionElapsedMs = Date.now() - transactionStartedAt;
    logServerError("POST /events error", error, transactionElapsedMs === null ? {} : { transactionElapsedMs });
    return res.status(500).json({ error: "Failed to create Event" });
  }
});

app.post("/dev/emotion-preview", aiRateLimit, async (req, res) => {
  if (process.env.NODE_ENV === "production") return res.status(404).json({ error: "Not found" });
  const testEmail = process.env.AUTH_E2E_TEST_EMAIL?.trim().toLowerCase();
  if (!testEmail || req.firebase?.email?.trim().toLowerCase() !== testEmail) {
    return res.status(403).json({ error: "Emotion Lab requires the dedicated E2E test account" });
  }
  if (Object.hasOwn(req.body, "ownerId") || Object.hasOwn(req.body, "userId") || req.query.ownerId !== undefined || req.query.userId !== undefined) {
    return res.status(400).json({ error: "Owner is derived from the authenticated session" });
  }
  const { text, primaryGardenMood = null } = req.body;
  if (typeof text !== "string" || !text.trim() || text.length > 4000) return res.status(400).json({ error: "Valid Event text is required" });
  if (primaryGardenMood !== null && !CANONICAL_PRIMARY_GARDEN_MOODS.includes(primaryGardenMood)) return res.status(400).json({ error: "Unsupported Primary Garden Mood" });
  const user = await prisma.user.findUnique({ where: { id: req.auth.userId }, select: { timezone: true, aiConsent: { select: { aiProcessing: true } } } });
  if (!user) return res.status(404).json({ error: "User not found" });
  const aiProcessingAllowed = user.aiConsent?.aiProcessing === true;
  const emotion = await eventEmotionResult({ userId: req.auth.userId, text, primaryGardenMood, aiProcessingAllowed, includeDiagnostics: true });
  const recentFlowers = primaryGardenMood ? await prisma.flower.findMany({
    where: { userId: req.auth.userId }, orderBy: { createdAt: "desc" }, take: 5, select: { name: true }
  }) : [];
  const flower = previewEventFlower({
    userId: req.auth.userId,
    localDate: localDateForInstant(new Date(), normalizeTimezone(user.timezone) || "UTC"),
    primaryGardenMood, labels: emotion.labels, recentFlowers
  });
  return res.json({ classifierEnabled: aiProcessingAllowed && eventEmotionProvider() === "workers-ai" && eventSecondaryEmotionEnabled(), inferenceStatus: emotion.status,
    labels: emotion.labels, flower, diagnostics: emotion.diagnostics,
    latencyMs: emotion.latencyMs, fallbackReason: emotion.fallbackReason || null });
});

app.get("/events/:eventId", async (req, res) => {
  const event = await new PrivateEventRepository(prisma).getEventById({
    identity: req.auth,
    eventId: req.params.eventId
  });
  if (!event) return res.status(404).json({ error: "Event not found" });
  return res.json(event);
});

app.delete("/events/:eventId", async (req, res) => {
  try {
    const deleted = await new PrivateEventRepository(prisma).deleteEventAndAffectedReports({
      identity: req.auth,
      eventId: req.params.eventId
    });
    if (!deleted) return res.status(404).json({ error: "Event not found" });
    return res.json({ success: true, ...deleted });
  } catch (error) {
    logServerError("DELETE /events/:eventId error", error);
    return res.status(500).json({ error: "Failed to delete Event" });
  }
});

app.get("/ai/memories/:memoryId", async (req, res) => {
  try {
    const memory = await new PrismaMemoryRepository(prisma).getMemoryById({
      identity: req.auth,
      memoryId: req.params.memoryId
    });
    if (!memory) return res.status(404).json({ error: "Event memory not found" });
    return res.json(memory);
  } catch (error) {
    if (error?.code === "AI_FORBIDDEN") return res.status(403).json({ error: "AI processing is not currently authorized" });
    throw error;
  }
});

// Metadata discovery only. Detail reads and generation keep their existing routes.
app.get("/ai/reports", async (req, res) => {
  if (Object.keys(req.query).some(key => !["limit", "cursor"].includes(key))) {
    return res.status(400).json({ error: "Only limit and cursor are supported; owner comes from authentication" });
  }
  const rawLimit = req.query.limit ?? "20";
  if (typeof rawLimit !== "string" || !/^[1-9]\d?$/.test(rawLimit) || Number(rawLimit) > 50) {
    return res.status(400).json({ error: "limit must be an integer from 1 to 50" });
  }
  let cursor = null;
  if (req.query.cursor !== undefined) {
    try {
      if (typeof req.query.cursor !== "string" || req.query.cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(req.query.cursor)) throw Error();
      cursor = JSON.parse(Buffer.from(req.query.cursor, "base64url").toString("utf8"));
      if (!cursor || !["weekly", "monthly"].includes(cursor.type) || !validId(cursor.id)
        || typeof cursor.start !== "string" || new Date(cursor.start).toISOString() !== cursor.start) throw Error();
    } catch { return res.status(400).json({ error: "Invalid report cursor" }); }
  }
  try {
    return res.json(await new PrivateReportRepository(prisma).listSavedReports({ identity: req.auth, limit: Number(rawLimit), cursor }));
  } catch (error) {
    if (error?.code === "AI_FORBIDDEN") return res.status(403).json({ error: "AI processing is not currently authorized" });
    logServerError("GET /ai/reports error", error);
    return res.status(500).json({ error: "Unable to load saved reports" });
  }
});

app.get("/ai/reports/:reportType/:reportId", async (req, res) => {
  const reports = new PrivateReportRepository(prisma);
  const input = { identity: req.auth, reportId: req.params.reportId };
  const readers = {
    weekly: () => reports.getWeeklyReportById(input),
    monthly: () => reports.getMonthlyReportById(input),
    yearly: () => reports.getYearlyReportById(input)
  };
  const read = Object.hasOwn(readers, req.params.reportType) ? readers[req.params.reportType] : null;
  if (!read) return res.status(400).json({ error: "Unsupported AI report type" });
  try {
    const report = await read();
    if (!report) return res.status(404).json({ error: "AI report not found" });
    if (req.params.reportType === "weekly") await rewardCloseness(req.auth.userId, "WEEKLY_READ", req.params.reportId);
    return res.json(report);
  } catch (error) {
    if (error?.code === "AI_FORBIDDEN") return res.status(403).json({ error: "AI processing is not currently authorized" });
    throw error;
  }
});

// Weekly 2.0: the owner marks one insight of their own Weekly report "INACCURATE" or "HIDDEN" (null clears it).
app.post("/ai/reports/weekly/:reportId/insights/:index/feedback", async (req, res) => {
  const index = /^\d{1,2}$/.test(req.params.index) ? Number(req.params.index) : -1;
  if (!validId(req.params.reportId) || Object.keys(req.query).length || Object.keys(req.body ?? {}).some(key => key !== "verdict")
      || !Object.hasOwn(req.body ?? {}, "verdict")) {
    return res.status(400).json({ error: "Send only the verdict for one insight of your Weekly report" });
  }
  try {
    const sections = await new PrivateReportRepository(prisma).setWeeklyInsightFeedback({ identity: req.auth,
      reportId: req.params.reportId, index, verdict: req.body.verdict });
    if (!sections) return res.status(404).json({ error: "Insight not found" });
    return res.json({ narrativeSections: sections });
  } catch (error) {
    if (error?.code === "INSIGHT_FEEDBACK_INVALID") return res.status(400).json({ error: "Send only the verdict for one insight of your Weekly report" });
    if (error?.code === "AI_FORBIDDEN") return res.status(403).json({ error: "AI processing is not currently authorized" });
    throw error;
  }
});

// Weekly 2.0 闭环 (lib/insight-loop.js, docs/product/WEEKLY_2.0.md): 花语集, 跟进线索, 回答问题, 给未来的信, 屏蔽.
// Owner comes from authentication only; every route needs Memory consent.
const insightLoop = new InsightLoopRepository(prisma);
async function insightLoopRoute(req, res, fields, run) {
  const body = req.body ?? {};
  if (Object.keys(req.query).length || Object.keys(body).some(key => !fields.includes(key)) || fields.some(key => !Object.hasOwn(body, key))) {
    return res.status(400).json({ error: "Unsupported request" });
  }
  try {
    const result = await run(body);
    if (result === null || result === false) return res.status(404).json({ error: "Not found" });
    return res.json(result);
  } catch (error) {
    if (error?.code === "INSIGHT_LOOP_INVALID") return res.status(400).json({ error: "Unsupported request" });
    if (error?.code === "INSIGHT_LOOP_LIMIT") return res.status(409).json({ error: "Limit reached", code: "INSIGHT_LOOP_LIMIT" });
    if (error?.code === "AI_FORBIDDEN") return res.status(403).json({ error: "AI processing is not currently authorized" });
    throw error;
  }
}
const loopIndex = value => /^\d{1,2}$/.test(value) ? Number(value) : -1;
app.post("/ai/reports/weekly/:reportId/insights/:index/keep", (req, res) => !validId(req.params.reportId) ? res.status(400).json({ error: "Unsupported request" })
  : insightLoopRoute(req, res, ["kept"], body => insightLoop.keep({ identity: req.auth, reportId: req.params.reportId, index: loopIndex(req.params.index), kept: body.kept })));
app.post("/ai/reports/weekly/:reportId/insights/:index/follow", (req, res) => !validId(req.params.reportId) ? res.status(400).json({ error: "Unsupported request" })
  : insightLoopRoute(req, res, [], () => insightLoop.follow({ identity: req.auth, reportId: req.params.reportId, index: loopIndex(req.params.index) })));
app.delete("/ai/insight-threads/:threadId", (req, res) => !validId(req.params.threadId) ? res.status(400).json({ error: "Unsupported request" })
  : insightLoopRoute(req, res, [], () => insightLoop.unfollow({ identity: req.auth, threadId: req.params.threadId })));
app.post("/ai/reports/weekly/:reportId/answer", (req, res) => !validId(req.params.reportId) ? res.status(400).json({ error: "Unsupported request" })
  : insightLoopRoute(req, res, ["eventId"], body => validId(body.eventId)
    ? insightLoop.answer({ identity: req.auth, reportId: req.params.reportId, eventId: body.eventId }) : Promise.reject(Object.assign(new Error(), { code: "INSIGHT_LOOP_INVALID" }))));
app.post("/ai/future-letters", (req, res) => insightLoopRoute(req, res, ["text", "deliverOn"],
  body => insightLoop.writeLetter({ identity: req.auth, text: body.text, deliverOn: body.deliverOn })));
app.delete("/ai/future-letters/:letterId", (req, res) => !validId(req.params.letterId) ? res.status(400).json({ error: "Unsupported request" })
  : insightLoopRoute(req, res, [], () => insightLoop.withdrawLetter({ identity: req.auth, letterId: req.params.letterId })));
app.put("/ai/insight-mutes", (req, res) => insightLoopRoute(req, res, ["word", "muted"],
  body => insightLoop.mute({ identity: req.auth, word: body.word, muted: body.muted })));
app.get("/ai/insight-collection", (req, res) => insightLoopRoute(req, res, [], () => insightLoop.collection({ identity: req.auth })));

app.post("/ai/reports/weekly/trigger", aiRateLimit, async (req, res) => {
  const allowedBodyFields = new Set(["localDate"]);
  if (Object.keys(req.body).some((field) => !allowedBodyFields.has(field)) || Object.keys(req.query).length > 0) {
    return res.status(400).json({ error: "Weekly report ownership and job type are fixed by this endpoint" });
  }

  try {
    const ownerId = req.auth.userId;
    const owner = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { timezone: true }
    });
    if (!owner) return res.status(403).json({ error: "Authenticated PetalPal owner was not found" });

    const now = new Date();
    let period;
    try {
      // From Sunday 23:59 local the trigger writes this week; before then, last week (time.md §3).
      period = req.body.localDate === undefined
        ? latestReadyWeeklyPeriod(now, owner.timezone)
        : weeklyPeriodForLocalDate(req.body.localDate, owner.timezone);
      weeklyReportPeriodStatus(period, now);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const repository = new PrismaAiJobRepository(prisma);
    const job = await prisma.$transaction(async (tx) => {
      await requireLockedMemoryConsent(tx, req.auth);
      return repository.enqueue({
        identity: req.auth,
        jobType: AI_JOB_TYPES.WEEKLY_REPORT,
        resourceId: period.periodKey,
        processingVersion: REPORT_NARRATIVE_GENERATION_VERSION,
        maxAttempts: 1,
        transaction: tx
      });
    });
    if (aiJobDispatchAllowed(job)) {
      let dispatched = false;
      try {
        dispatched = (await aiJobDispatcher(job)).dispatched;
      } catch {
        console.warn("AI job dispatch deferred", { jobId: job.id });
      }
      const [storedJob, report] = await Promise.all([
        prisma.aiJob.findFirst({
          where: { id: job.id, ownerId, jobType: AI_JOB_TYPES.WEEKLY_REPORT },
          select: { id: true, status: true, attemptCount: true, completedAt: true }
        }),
        prisma.weeklyReport.findUnique({
          where: { ownerId_periodKey: { ownerId, periodKey: period.periodKey } },
          select: { id: true, periodKey: true, narrativeStatus: true, generationVersion: true }
        })
      ]);
      return res.status(storedJob?.status === "SUCCEEDED" ? 200 : 202).json({
        periodKey: period.periodKey,
        job: storedJob,
        report,
        execution: storedJob?.status === "SUCCEEDED" ? "ALREADY_FINALIZED" :
          dispatched ? "QUEUED" : "PENDING_DISPATCH"
      });
    }
    const execution = await weeklyReportWorkerFactory().runJob({
      jobId: job.id,
      ownerId,
      jobType: AI_JOB_TYPES.WEEKLY_REPORT,
      now: new Date()
    });
    const storedJob = await prisma.aiJob.findFirst({
      where: { id: job.id, ownerId, jobType: AI_JOB_TYPES.WEEKLY_REPORT },
      select: { id: true, status: true, attemptCount: true, completedAt: true }
    });
    const report = await prisma.weeklyReport.findUnique({
      where: { ownerId_periodKey: { ownerId, periodKey: period.periodKey } },
      select: { id: true, periodKey: true, narrativeStatus: true, generationVersion: true }
    });
    const payload = {
      periodKey: period.periodKey,
      job: storedJob,
      report,
      execution: execution.claimed
        ? (execution.succeeded ? "COMPLETED" : "FAILED")
        : "ALREADY_RUNNING_OR_FINALIZED"
    };
    if (execution.claimed && !execution.succeeded) {
      if (["AI_QUOTA_EXCEEDED", "AI_INFERENCE_ALREADY_RESERVED", "AI_BUDGET_UNAVAILABLE"].includes(execution.error?.code)) {
        return res.status(aiCostHttpStatus(execution.error.code)).json({ ...payload, errorCode: execution.error.code });
      }
      return res.status(502).json({ ...payload, errorCode: execution.error?.code || "WEEKLY_REPORT_JOB_FAILED" });
    }
    if (storedJob?.status === "FAILED") {
      return res.status(502).json({ ...payload, errorCode: "WEEKLY_REPORT_JOB_FAILED" });
    }
    return res.status(storedJob?.status === "SUCCEEDED" ? 200 : 202).json(payload);
  } catch (error) {
    if (error?.code === "AI_FORBIDDEN") return res.status(403).json({ error: "AI memory processing is not currently authorized" });
    logServerError("POST /ai/reports/weekly/trigger error", {
      name: error?.name,
      code: error?.meta?.driverAdapterError?.cause?.originalCode || error?.meta?.code || error?.code
    });
    return res.status(500).json({ error: "Failed to trigger Weekly report" });
  }
});

// Monthly mirrors the Weekly trigger: one MONTHLY_REPORT job per owner and closed month,
// no automatic retry. Without a body it targets the previous month in the account timezone.
app.post("/ai/reports/monthly/trigger", aiRateLimit, async (req, res) => {
  if (Object.keys(req.body).some((field) => field !== "month") || Object.keys(req.query).length > 0) {
    return res.status(400).json({ error: "Monthly report ownership and job type are fixed by this endpoint" });
  }

  try {
    const ownerId = req.auth.userId;
    const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { timezone: true } });
    if (!owner) return res.status(403).json({ error: "Authenticated PetalPal owner was not found" });

    const now = new Date();
    let period;
    try {
      if (req.body.month === undefined) {
        const [year, month] = localDateForInstant(now, owner.timezone).split("-").map(Number);
        period = previousMonthlyPeriod({ year, month, timezone: owner.timezone });
      } else {
        const match = /^(\d{4})-(\d{2})$/.exec(String(req.body.month));
        if (!match) throw new Error("month must be YYYY-MM");
        period = monthlyPeriodFor({ year: Number(match[1]), month: Number(match[2]), timezone: owner.timezone });
      }
      reportPeriodStatus(period.periodEndUtc, now);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const job = await prisma.$transaction(async (tx) => {
      await requireLockedMemoryConsent(tx, req.auth);
      return new PrismaAiJobRepository(prisma).enqueue({
        identity: req.auth,
        jobType: AI_JOB_TYPES.MONTHLY_REPORT,
        resourceId: period.periodKey,
        processingVersion: REPORT_NARRATIVE_GENERATION_VERSION,
        maxAttempts: 1,
        transaction: tx
      });
    });
    const stored = () => Promise.all([
      prisma.aiJob.findFirst({
        where: { id: job.id, ownerId, jobType: AI_JOB_TYPES.MONTHLY_REPORT },
        select: { id: true, status: true, attemptCount: true, completedAt: true }
      }),
      prisma.monthlyReport.findUnique({
        where: { ownerId_periodKey: { ownerId, periodKey: period.periodKey } },
        select: { id: true, periodKey: true, narrativeStatus: true, generationVersion: true }
      })
    ]);
    if (aiJobDispatchAllowed(job)) {
      let dispatched = false;
      try {
        dispatched = (await aiJobDispatcher(job)).dispatched;
      } catch {
        console.warn("AI job dispatch deferred", { jobId: job.id });
      }
      const [storedJob, report] = await stored();
      return res.status(storedJob?.status === "SUCCEEDED" ? 200 : 202).json({
        periodKey: period.periodKey, job: storedJob, report,
        execution: storedJob?.status === "SUCCEEDED" ? "ALREADY_FINALIZED" : dispatched ? "QUEUED" : "PENDING_DISPATCH"
      });
    }
    const execution = await weeklyReportWorkerFactory().runJob({
      jobId: job.id, ownerId, jobType: AI_JOB_TYPES.MONTHLY_REPORT, now: new Date()
    });
    const [storedJob, report] = await stored();
    const payload = {
      periodKey: period.periodKey, job: storedJob, report,
      execution: execution.claimed ? (execution.succeeded ? "COMPLETED" : "FAILED") : "ALREADY_RUNNING_OR_FINALIZED"
    };
    if (execution.claimed && !execution.succeeded) {
      if (["AI_QUOTA_EXCEEDED", "AI_INFERENCE_ALREADY_RESERVED", "AI_BUDGET_UNAVAILABLE"].includes(execution.error?.code)) {
        return res.status(aiCostHttpStatus(execution.error.code)).json({ ...payload, errorCode: execution.error.code });
      }
      return res.status(502).json({ ...payload, errorCode: execution.error?.code || "MONTHLY_REPORT_JOB_FAILED" });
    }
    if (storedJob?.status === "FAILED") return res.status(502).json({ ...payload, errorCode: "MONTHLY_REPORT_JOB_FAILED" });
    return res.status(storedJob?.status === "SUCCEEDED" ? 200 : 202).json(payload);
  } catch (error) {
    if (error?.code === "AI_FORBIDDEN") return res.status(403).json({ error: "AI memory processing is not currently authorized" });
    logServerError("POST /ai/reports/monthly/trigger error", {
      name: error?.name,
      code: error?.meta?.driverAdapterError?.cause?.originalCode || error?.meta?.code || error?.code
    });
    return res.status(500).json({ error: "Failed to trigger Monthly report" });
  }
});

app.get("/users/:userId/subscription", async (req, res) => {
  if (!requireOwnUser(req, res, req.params.userId)) return;

  const entitlement = await prisma.subscriptionEntitlement.upsert({
    where: { userId: req.auth.userId },
    update: {},
    create: { userId: req.auth.userId }
  });

  res.json(entitlement);
});

  // Get incoming and outgoing requests
  app.get(
    "/friends/requests/:userId",
    async (req, res) => {
      try {
        const userId =
          req.params.userId;

        if (!requireOwnUser(req, res, userId)) return;
  
        const user =
          await prisma.user.findUnique({
            where: {
              id: userId
            }
          });
  
        if (!user) {
          return res.status(404).json({
            error: "User not found"
          });
        }
  
        const [incoming, outgoing] =
          await Promise.all([
            prisma.friendRequest.findMany({
              where: {
                receiverId: userId,
                status: "pending"
              },
              include: {
                sender: {
                  select: {
                    id: true,
                    name: true,
                    accountId: true,
                    avatar: true
                  }
                }
              },
              orderBy: {
                createdAt: "desc"
              },
              take: 100
            }),
  
            prisma.friendRequest.findMany({
              where: {
                senderId: userId,
                status: "pending"
              },
              include: {
                receiver: {
                  select: {
                    id: true,
                    name: true,
                    accountId: true,
                    avatar: true
                  }
                }
              },
              orderBy: {
                createdAt: "desc"
              },
              take: 100
            })
          ]);
  
        const hidden = await hiddenSocialIds(prisma, req.auth.userId);
        res.json(filterSocialPayload({ incoming, outgoing }, hidden));
      } catch (err) {
        logServerError("GET /friends/requests/:userId error", err);
  
        res.status(500).json({
          error: "Failed to get friend requests"
        });
      }
    }
  );
  
  // Accept a friend request
  app.post(
    "/friends/requests/:requestId/accept",
    async (req, res) => {
      try {
        const requestId =
          req.params.requestId;
  
        const userId = req.auth.userId;
  
        const friendRequest =
          await prisma.friendRequest.findUnique({
            where: {
              id: requestId
            }
          });
  
        if (!friendRequest) {
          return res.status(404).json({
            error: "Friend request not found"
          });
        }
  
        if (
          String(friendRequest.receiverId) !==
          String(userId)
        ) {
          return res.status(403).json({
            error:
              "You cannot accept this friend request"
          });
        }
  
        if (
          friendRequest.status !== "pending"
        ) {
          return res.status(409).json({
            error:
              "This friend request is no longer pending"
          });
        }
  
        const senderId =
          friendRequest.senderId;
  
        const receiverId =
          friendRequest.receiverId;
  
        await withSocialLocks(prisma, [senderId, receiverId], async tx => {
          await tx.$queryRawUnsafe('SELECT id FROM "FriendRequest" WHERE id=$1 FOR UPDATE', friendRequest.id);
          await requireSocialPair(tx, senderId, receiverId);
          const current = await tx.friendRequest.findUnique({ where: { id: friendRequest.id } });
          if (!current || current.status !== "pending" || current.senderId !== senderId || current.receiverId !== receiverId) {
            throw new SocialAccessError("Friend request not found or no longer pending", 404);
          }
          await tx.friendship.upsert({
            where: {
              userId_friendId: {
                userId: senderId,
                friendId: receiverId
              }
            },
            update: {},
            create: {
              userId: senderId,
              friendId: receiverId
            }
          });
  
          await tx.friendship.upsert({
            where: {
              userId_friendId: {
                userId: receiverId,
                friendId: senderId
              }
            },
            update: {},
            create: {
              userId: receiverId,
              friendId: senderId
            }
          });
  
          await tx.friendRequest.deleteMany({
            where: {
              OR: [
                {
                  senderId,
                  receiverId
                },
                {
                  senderId: receiverId,
                  receiverId: senderId
                }
              ]
            }
          });
        });
  
        realtime
          .to(`user:${senderId}`)
          .to(`user:${receiverId}`)
          .emit("friendRequestUpdated", {
            type: "request-accepted",
            senderId,
            receiverId
          });
          realtime
          .to(`user:${senderId}`)
          .to(`user:${receiverId}`)
          .emit("friendListUpdated", {
            type: "friend-added",
            senderId,
            receiverId
          });
  
        res.json({
          success: true,
          message: "Friend request accepted"
        });
      } catch (err) {
    if (sendSocialError(res, err)) return;
        logServerError("POST /friends/requests/:requestId/accept error", err);
  
        res.status(500).json({
          error:
            "Failed to accept friend request"
        });
      }
    }
  );
  
  // Reject a friend request
  app.post(
    "/friends/requests/:requestId/reject",
    async (req, res) => {
      try {
        const requestId =
          req.params.requestId;
  
        const userId = req.auth.userId;
  
        const friendRequest =
          await prisma.friendRequest.findUnique({
            where: {
              id: requestId
            }
          });
  
        if (!friendRequest) {
          return res.status(404).json({
            error: "Friend request not found"
          });
        }
  
        if (
          String(friendRequest.receiverId) !==
          String(userId)
        ) {
          return res.status(403).json({
            error:
              "You cannot reject this friend request"
          });
        }
  
        await prisma.friendRequest.delete({
          where: {
            id: requestId
          }
        });
  
        realtime
  .to(`user:${friendRequest.senderId}`)
  .to(`user:${friendRequest.receiverId}`)
  .emit("friendRequestUpdated", {
    type: "request-rejected",
    requestId,
    senderId:
      friendRequest.senderId,
    receiverId:
      friendRequest.receiverId
  });
  
        res.json({
          success: true,
          message: "Friend request rejected"
        });
      } catch (err) {
        logServerError("POST /friends/requests/:requestId/reject error", err);
  
        res.status(500).json({
          error:
            "Failed to reject friend request"
        });
      }
    }
  );

app.post("/friends/remove", async (req, res) => {
  try {
    const { friendId } = req.body;
    const userId = req.auth.userId;

    if (!validId(friendId)) {
      return res.status(400).json({ error: "Invalid friend" });
    }

    await realtime.withRevocation({ friends: [userId, friendId] }, () =>
      withSocialLocks(prisma, [userId, friendId], async tx => {
        await tx.friendship.deleteMany({ where: { OR: [{ userId, friendId }, { userId: friendId, friendId: userId }] } });
        for (const [ownerId, visitorId] of [[userId, friendId], [friendId, userId]]) {
          const garden = await tx.garden.findUnique({ where: { ownerId }, select: { id: true } });
          if (garden) setActiveVisitors(garden.id, getActiveVisitors(garden.id).filter(v => v.visitorId !== visitorId));
        }
      }));

    realtime
  .to(`user:${userId}`)
  .to(`user:${friendId}`)
  .emit("friendListUpdated", {
    type: "friend-removed",
    userId,
    friendId
  });
  
    res.json({
      success: true,
      message: "Friend removed successfully",
      userFriends: [],
      friendFriends: [],
    });
  } catch (err) {
    if (sendSocialError(res, err)) return;
    logServerError("POST /friends/remove error", err);
    res.status(500).json({ error: "Failed to remove friend" });
  }
});

app.post("/users/:userId/flowers", aiRateLimit, async (req, res) => {
  try {
    if (!requireOwnUser(req, res, req.params.userId)) return;

    const user = await prisma.user.findUnique({
      where: {
        id: req.params.userId,
      },
      select: {
        id: true,
        timezone: true,
        fairyState: {
          select: {
            onboardingStep: true,
            onboardingCompleted: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    let resolvedEmotion;
    try {
      if (req.body.journalText !== undefined && req.body.event !== undefined) {
        return res.status(400).json({ error: "Send journalText or the deprecated event alias, not both" });
      }
      const journalText = req.body.journalText !== undefined
        ? req.body.journalText
        : req.body.event;
      if (req.body.event !== undefined) res.set("Deprecation", "true");
      resolvedEmotion = await resolveDailyFlowerEmotion({
        mood: req.body.mood,
        event: journalText
      });
    } catch (error) {
      if (error?.code === CONTENT_REJECTED) return res.status(422).json(contentSafetyResponse(req,error));
      if ([400, 403, 413].includes(error?.status)) {
        return res.status(error.status).json({ error: error.message });
      }
      logServerError("Daily Grow emotion resolution error", error);
      return res.status(503).json({ error: "Emotion analysis is temporarily unavailable" });
    }

    const { event, mood, emotionSource, classification } = resolvedEmotion;
    let aiMetadata = null;
    const selectedSecondaryEmotions = selectFlowerSecondaryEmotions({
      primaryGardenMood: mood,
      candidates: classification?.secondaryEmotions || []
    });
    const secondaryEmotions = selectedSecondaryEmotions.map(({ label }) => label);
    const secondaryEmotion = secondaryEmotions[0] || null;
    const emotionIntensity = classification?.intensity ?? null;
    const inferencePath = classification?.inferencePath || "NO_AI";

    if (classification?.provider) {
      aiMetadata = {
        task: "EMOTION_CLASSIFICATION",
        provider: classification.provider,
        model: classification.model,
        inputHash: hashAiInput(event),
        outputLabel: mood,
        confidence: classification.confidence,
        latencyMs: classification.latencyMs,
        success: classification.success,
        errorCode: classification.errorCode,
        inferencePath
      };
    }

    if (!isSupportedPrimaryGardenMood(mood)) {
      return res.status(400).json({ error: "Unsupported mood" });
    }

    const garden = await ensureGarden(user.id);
    const timezone = normalizeTimezone(user.timezone) || "UTC";
    const localDate = getLocalDate(timezone);

    const dailyGrowLimitEnabled = isDailyGrowLimitEnabled();
    const existingCheckIn = dailyGrowLimitEnabled && await prisma.dailyCheckIn.findFirst({
      where: {
        userId: user.id,
        localDate
      },
      orderBy: { createdAt: "desc" },
      include: { flower: { include: { messages: true } } }
    });

    if (existingCheckIn) {
      return res.status(409).json({
        error: "You have already completed today's check-in",
        checkInId: existingCheckIn.id,
        flower: existingCheckIn.flower
      });
    }

    const existingFlowers = await prisma.flower.findMany({
      where: {
        gardenId: garden.id,
      },
      select: { left: true, top: true },
      orderBy: { createdAt: "desc" },
      take: 1000
    });

    const recentFlowers = await prisma.flower.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { name: true }
    });

    const priorCheckIns = await prisma.dailyCheckIn.findMany({
      where: { userId: user.id },
      distinct: ["localDate"],
      select: { localDate: true }
    });
    const distinctCheckInCount = new Set([
      ...priorCheckIns.map((checkIn) => checkIn.localDate),
      localDate
    ]).size;

    const { pool: options, source: speciesPoolSource } = speciesPoolForPrimary(mood, flowerDB);

if (!Array.isArray(options) || options.length === 0) {
  return res.status(400).json({
    error: "No flower configuration found for this mood",
  });
}

const chosen = generateFlowerMetadata({
  options,
  primaryGardenMood: mood,
  secondaryEmotions: selectedSecondaryEmotions,
  intensity: emotionIntensity,
  localDate,
  userId: user.id,
  recentFlowers
});

const fairyEvent = resolveFairyEvent({
  onboardingStep: user.fairyState?.onboardingStep,
  onboardingCompleted: user.fairyState?.onboardingCompleted,
  distinctCheckInCount,
  newFlowerRarity: chosen.rarity
});

const position =
  getNonOverlappingPosition(existingFlowers);

const createdFlower = await prisma.$transaction(async (tx) => {
  if (!(await reserveFlowerPlanting(tx, { userId: user.id, localDate })).granted) return null;
  const checkIn = await tx.dailyCheckIn.create({
    data: {
      userId: user.id,
      localDate,
      timezone,
      dailyLimitEnforced: dailyGrowLimitEnabled,
      ...(event
        ? {
            journal: {
              create: {
                userId: user.id,
                content: event
              }
            }
          }
        : {}),
      emotionResult: {
        create: {
          userId: user.id,
          label: mood,
          source: emotionSource,
          confidence: aiMetadata?.confidence ?? null,
          secondaryEmotion,
          secondaryEmotions,
          intensity: emotionIntensity,
          modelVersion: aiMetadata?.model ?? null,
          inferencePath
        }
      }
    }
  });

  const createdFlower = await tx.flower.create({
    data: {
      mood,
      speciesCode: chosen.speciesCode,
      colorAccent: chosen.colorAccent,
      event,
      name: chosen.name,
      meaning: chosen.meaning,
      img: chosen.img,
      left: position.left,
      top: position.top,
      supportCount: 0,
      variant: chosen.variant,
      rarity: chosen.rarity,
      growthState: chosen.growthState,
      visualEffect: chosen.visualEffect,
      season: chosen.season,
      generationSeed: chosen.generationSeed,
      userId: user.id,
      gardenId: garden.id,
      dailyCheckInId: checkIn.id
    },
    include: { messages: true }
  });

  if (aiMetadata) {
    await tx.aiInteractionMetadata.create({
      data: {
        userId: user.id,
        dailyCheckInId: checkIn.id,
        ...aiMetadata
      }
    });
  }

  await tx.fairyState.upsert({
    where: { userId: user.id },
    update: {
      onboardingStep: "GARDEN_UNLOCKED",
      onboardingCompleted: true,
      ...(fairyEvent ? { lastEvent: fairyEvent.code } : {})
    },
    create: {
      userId: user.id,
      onboardingStep: "GARDEN_UNLOCKED",
      onboardingCompleted: true,
      lastEvent: fairyEvent?.code || null
    }
  });

  return createdFlower;
});
    if (!createdFlower) {
      return res.status(409).json({ error: "Today's flowers are already planted", code: "DAILY_FLOWER_LIMIT" });
    }

    let fairyProgress = null;
    try {
      fairyProgress = await prisma.$transaction(async (tx) => {
        await ensureStarterFairyInTransaction(tx, user.id);
        return syncMonthlyFairyProgress(
          tx,
          user.id,
          monthFromLocalDate(localDate)
        );
      });
    } catch (progressError) {
      logServerError("POST /users/:userId/flowers Fairy progression error", progressError);
    }

    res.status(201).json({
      ...createdFlower,
      primaryGardenMood: mood,
      secondaryEmotions,
      flower: {
        species: createdFlower.speciesCode,
        variant: {
          colorAccent: createdFlower.colorAccent,
          effect: createdFlower.visualEffect
        },
        speciesPoolSource
      },
      fairyEvent,
      fairyProgress
    });
  } catch (err) {
    logServerError("POST /users/:userId/flowers error", err);
    if (err?.code === "P2002") {
      return res.status(409).json({
        error: "You have already completed today's check-in"
      });
    }
    res.status(500).json({ error: "Failed to create flower" });
  }
});

// Direct Flower URLs/actions must enforce the same access policy as the Garden.
async function requireSocialGardenAccess(req, res, next) {
  try {
    const owner = await prisma.user.findUnique({
      where: { id: req.params.userId }, select: { id: true, allowGardenVisits: true }
    });
    if (!owner) return res.status(404).json({ error: "User not found" });
    if (!await canVisitGarden(prisma, owner, req.auth.userId)) {
      return res.status(403).json({ error: "Garden visits require a confirmed friendship and the owner's permission" });
    }
    return next();
  } catch (error) { return next(error); }
}

app.get("/users/:userId/flowers/:flowerId", requireSocialGardenAccess, async (req, res) => {
  try {
    const flower = await getFlowerDetail(prisma, {
      ownerUserId: req.params.userId,
      flowerId: req.params.flowerId,
      viewerUserId: req.auth.userId
    });
    res.json(flower);
  } catch (error) {
    if (error instanceof FlowerSupportError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    if (sendSocialError(res, error)) return;
    logServerError("GET /users/:userId/flowers/:flowerId error", error);
    res.status(500).json({ error: "Failed to get flower details" });
  }
});

// Plants the owner's flower at its Garden spot, once. There is no move: another spot is a 409.
app.post("/users/:userId/flowers/:flowerId/placement", async (req, res) => {
  try {
    if (!requireOwnUser(req, res, req.params.userId)) return;
    const result = await plantFlowerOnce(prisma, {
      userId: req.auth.userId, flowerId: req.params.flowerId, body: req.body
    });
    res.status(result.created ? 201 : 200).json(result.placement);
  } catch (error) {
    if (error instanceof FlowerPlacementError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    logServerError("POST /users/:userId/flowers/:flowerId/placement error", error);
    res.status(500).json({ error: "Failed to plant flower" });
  }
});

app.post("/users/:userId/flowers/:flowerId/support", requireSocialGardenAccess, async (req, res) => {
  try {
    if (!validOptionalString(req.body?.visitorAvatar, MAX_AVATAR_LENGTH)) {
      return res.status(413).json({ error: `Avatar must be ${MAX_AVATAR_LENGTH} characters or fewer` });
    }
    const result = await giveFlowerSupport(prisma, {
      ownerUserId: req.params.userId,
      flowerId: req.params.flowerId,
      supporterUserId: req.auth.userId,
      visitorAvatar: req.body?.visitorAvatar
    });
    if (result.visitRecord) {
      // Only a newly committed social action emits notifications. Repeated
      // same-day calls return the authoritative count without duplicate events.
      // Support state belongs to the initiating viewer, not every socket peer.
      const { supportState: _viewerState, ...sharedFlower } = result.flower;
      realtime.to(`garden:${req.params.userId}`).to(`user:${req.params.userId}`)
        .emit("supportUpdated", {
          gardenOwnerId: req.params.userId,
          flowerId: result.flower.id,
          flower: sharedFlower
        });
      realtime.to(`garden:${req.params.userId}`).to(`user:${req.params.userId}`)
        .emit("visitRecordAdded", result.visitRecord);
    }
    res.json(filterSocialPayload(result.flower, await hiddenSocialIds(prisma, req.auth.userId)));
  } catch (error) {
    if (error?.code === CONTENT_REJECTED) return res.status(422).json(contentSafetyResponse(req,error));
    if (error instanceof FlowerSupportError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    if (sendSocialError(res, error)) return;
    logServerError("POST /users/:userId/flowers/:flowerId/support error", error);
    res.status(500).json({ error: "Failed to support flower" });
  }
});
  
  app.post(
    "/users/:userId/flowers/:flowerId/message", requireSocialGardenAccess,
    async (req, res) => {
      const startTime = Date.now();
  
      try {
        const { userId, flowerId } = req.params;
  
        const {
          text,
          visitorAvatar
        } = req.body;
        const visitorUserId = req.auth.userId;
  
        const trimmedText =
          typeof text === "string"
            ? text.trim()
            : "";
  
        if (!trimmedText) {
          return res.status(400).json({
            error: "Message cannot be empty"
          });
        }
        if (trimmedText.length > MAX_MESSAGE_LENGTH) {
          return res.status(413).json({
            error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer`
          });
        }
        if (!validOptionalString(visitorAvatar, MAX_AVATAR_LENGTH)) {
          return res.status(413).json({
            error: `Avatar must be ${MAX_AVATAR_LENGTH} characters or fewer`
          });
        }
  
        const result = await sendFlowerMessage(prisma, {
          ownerUserId: userId, flowerId, viewerUserId: visitorUserId, text: trimmedText, visitorAvatar
        });
        const socialFlower = result.flower;
        realtime.to(`garden:${userId}`).to(`user:${userId}`).emit("messageAdded", {
          gardenOwnerId: userId, flowerId, message: toSocialMessage(result.message), flower: socialFlower
        });
        realtime.to(`garden:${userId}`).to(`user:${userId}`).emit("visitRecordAdded", {
          gardenOwnerId: userId, record: result.visitRecord
        });

        console.log(
          `message completed in ${Date.now() - startTime}ms`
        );
  
        res.json(filterSocialPayload(socialFlower, await hiddenSocialIds(prisma, visitorUserId)));
  
      } catch (err) {
        if (err?.code === "CONTENT_REJECTED") return res.status(422).json({error:"Please revise this message to follow the Community Guidelines.",code:err.code});
        if (err instanceof FlowerSupportError) return res.status(err.status).json({ error: err.message });
    if (sendSocialError(res, err)) return;
        logServerError("POST /users/:userId/flowers/:flowerId/message error", err, {
          latencyMs: Date.now() - startTime
        });
  
        res.status(500).json({
          error: "Failed to add message"
        });
      }
    }
  );


app.delete("/users/:userId/flowers/:flowerId", async (req, res) => {
  try {
    if (!requireOwnUser(req, res, req.params.userId)) return;

    const user = await prisma.user.findUnique({
      where: {
        id: req.params.userId,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const flower = await prisma.flower.findFirst({
      where: {
        id: req.params.flowerId,
        userId: user.id,
      },
    });

    if (!flower) {
      return res.status(404).json({ error: "Flower not found" });
    }

    await prisma.message.deleteMany({
      where: {
        flowerId: flower.id,
      },
    });

    const removedFlower = await prisma.flower.delete({
      where: {
        id: flower.id,
      },
    });

    res.json({
      success: true,
      message: "Flower deleted successfully",
      deletedFlower: removedFlower,
    });
  } catch (err) {
    logServerError("DELETE /flowers error", err);
    res.status(500).json({ error: "Failed to delete flower" });
  }
});

app.post("/visit", async (req, res) => {
  let publishedGardenId;
  try {
    const {
      hostUserId,
      visitorAvatar,
      x = 120,
      y = 520,
    } = req.body;
    const visitorUserId = req.auth.userId;

    if (!validId(hostUserId) || !validCoordinate(x) || !validCoordinate(y)) {
      return res.status(400).json({ error: "Invalid visit input" });
    }
    if (!validOptionalString(visitorAvatar, MAX_AVATAR_LENGTH)) {
      return res.status(413).json({ error: `Avatar must be ${MAX_AVATAR_LENGTH} characters or fewer` });
    }

    const result = await withSocialAuthorization(prisma, hostUserId, visitorUserId, async tx => {
      const host = await tx.user.findUnique({ where: { id: hostUserId } });
      const visitor = await tx.user.findUnique({ where: { id: visitorUserId } });
      if (!visitor) throw new SocialAccessError("User not found", 404);
      await requireCommunityAcceptance(tx, visitorUserId);
      assertSocialContent(visitor.name);
      assertSocialContent(visitor.avatar || "🦋");
      const hostGarden = await ensureGarden(host.id, tx);
      const newVisitRecord = await tx.visitRecord.create({
        data: {
          visitorId: visitor.id,
          visitorName: visitor.name,
          visitorAvatar:
            visitor.avatar ||
            "🦋",
          action: "started visiting your garden",
          gardenId: hostGarden.id,
          userId: visitor.id,
        },
      });

      const visitRecords = await tx.visitRecord.findMany({
        where: {
          gardenId: hostGarden.id,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 30,
      });

      const visitors = getActiveVisitors(hostGarden.id).map(v => ({ ...v }));
      const existing = visitors.find((item) => item.visitorId === visitor.id);

      if (existing) {
        existing.x = x;
        existing.y = y;
        existing.avatar = visitor.avatar || "🦋";
        existing.name = visitor.name;
      } else {
        visitors.push({
          visitorId: visitor.id,
          name: visitor.name,
          avatar: visitor.avatar || "🦋",
          x,
          y,
        });
      }

      setActiveVisitors(hostGarden.id, visitors);
      publishedGardenId = hostGarden.id;

      return { newVisitRecord, hostId: host.id, activeVisitors: visitors, visitRecords };
    });
    realtime
      .to(`garden:${result.hostId}`)
      .to(`user:${result.hostId}`)
      .emit("visitRecordAdded", {
        gardenOwnerId: result.hostId,
        record: result.newVisitRecord
      });

    res.json(filterSocialPayload({ success: true, activeVisitors: result.activeVisitors, visitRecords: result.visitRecords }, await hiddenSocialIds(prisma, visitorUserId)));
  } catch (err) {
    if (publishedGardenId) setActiveVisitors(publishedGardenId, getActiveVisitors(publishedGardenId).filter(v => v.visitorId !== req.auth.userId));
    if (sendSocialError(res, err)) return;
    if (err?.code === CONTENT_REJECTED) return res.status(422).json(contentSafetyResponse(req,err));
    logServerError("POST /visit error", err);
    res.status(500).json({ error: "Failed to visit garden" });
  }
});

app.post("/visit/move", async (req, res) => {
  let publishedGardenId;
  try {
    const { hostUserId, x, y, visitorAvatar } = req.body;
    const visitorUserId = req.auth.userId;

    if (!validId(hostUserId) || !validCoordinate(x) || !validCoordinate(y)) {
      return res.status(400).json({ error: "Invalid movement input" });
    }
    if (!validOptionalString(visitorAvatar, MAX_AVATAR_LENGTH)) {
      return res.status(413).json({ error: `Avatar must be ${MAX_AVATAR_LENGTH} characters or fewer` });
    }

    const result = await withSocialAuthorization(prisma, hostUserId, visitorUserId, async tx => {
      const visitor = await tx.user.findUnique({ where: { id: visitorUserId } });
      if (!visitor) throw new SocialAccessError("User not found", 404);
      await requireCommunityAcceptance(tx, visitorUserId);
      assertSocialContent(visitor.name);
      assertSocialContent(visitor.avatar || "🦋");
      const hostGarden = await ensureGarden(hostUserId, tx);
      const visitors = getActiveVisitors(hostGarden.id).map(v => ({ ...v }));
      const activeVisitor = visitors.find(
        (item) => item.visitorId === visitorUserId
      );

      if (!activeVisitor) {
        throw new SocialAccessError("Visitor not active in this garden", 404);
      }

      activeVisitor.x = x;
      activeVisitor.y = y;

      activeVisitor.avatar = visitor.avatar || "🦋";

      setActiveVisitors(hostGarden.id, visitors);
      publishedGardenId = hostGarden.id;

      const movedVisitor = {
        visitorId: activeVisitor.visitorId,
        name: activeVisitor.name,
        avatar: activeVisitor.avatar,
        x: activeVisitor.x,
        y: activeVisitor.y,
      };

      return { movedVisitor, visitors };
    });
    realtime.to(`garden:${hostUserId}`).emit("avatarMoved", result.movedVisitor);
    res.json(filterSocialPayload({ success: true, activeVisitors: result.visitors }, await hiddenSocialIds(prisma, visitorUserId)));

  } catch (err) {
    if (publishedGardenId) setActiveVisitors(publishedGardenId, getActiveVisitors(publishedGardenId).filter(v => v.visitorId !== req.auth.userId));
    if (sendSocialError(res, err)) return;
    if (err?.code === CONTENT_REJECTED) return res.status(422).json(contentSafetyResponse(req,err));
    logServerError("POST /visit/move error", err);
    res.status(500).json({ error: "Failed to move visitor" });
  }
});

app.post("/leave", async (req, res) => {
  let publishedGardenId;
  try {
    const { hostUserId, visitorAvatar } = req.body;
    const visitorUserId = req.auth.userId;
    if (!validId(hostUserId)) return res.status(400).json({ error: "Invalid host user" });
    if (!validOptionalString(visitorAvatar, MAX_AVATAR_LENGTH)) return res.status(413).json({ error: `Avatar must be ${MAX_AVATAR_LENGTH} characters or fewer` });
    const result = await withSocialLocks(prisma, [hostUserId, visitorUserId], async tx => {
      await requireSocialPair(tx, hostUserId, visitorUserId);
      const host = await tx.user.findUnique({ where: { id: hostUserId } });
      const visitor = await tx.user.findUnique({ where: { id: visitorUserId } });
      if (!host || !visitor) throw new SocialAccessError("User not found", 404);
      if (!await canVisitGarden(tx, host, visitorUserId)) {
        // Revoked visitors may remove only their own cached presence. No Garden
        // contents, record, broadcast, or other visitor identity is returned.
        const garden = await tx.garden.findUnique({ where: { ownerId: hostUserId }, select: { id: true } });
        if (garden) setActiveVisitors(garden.id, getActiveVisitors(garden.id).filter(v => v.visitorId !== visitorUserId));
        return { cleanupOnly: true };
      }
      await requireCommunityAcceptance(tx, visitorUserId);
      assertSocialContent(visitor.name);
      assertSocialContent(visitor.avatar || "🦋");
      const garden = await ensureGarden(host.id, tx);
      const remaining = getActiveVisitors(garden.id).filter(v => v.visitorId !== visitorUserId);
      const record = await tx.visitRecord.create({ data: {
        visitorId: visitor.id, visitorName: visitor.name, visitorAvatar: visitor.avatar || "🦋",
        action: "left your garden", gardenId: garden.id, userId: visitor.id
      } });
      setActiveVisitors(garden.id, remaining);
      publishedGardenId = garden.id;
      return { gardenOwnerId: host.id, visitorId: visitor.id, record, activeVisitors: remaining };
    });
    if (result.cleanupOnly) return res.json({ success: true, activeVisitors: [], record: null });
    await realtime.to(`garden:${hostUserId}`).to(`user:${hostUserId}`).emit("visitorLeft", result);
    await realtime.to(`garden:${hostUserId}`).to(`user:${hostUserId}`).emit("visitRecordAdded", result);
    res.json(filterSocialPayload({ success: true, activeVisitors: result.activeVisitors, record: result.record }, await hiddenSocialIds(prisma, visitorUserId)));
  } catch (error) {
    if (publishedGardenId) setActiveVisitors(publishedGardenId, getActiveVisitors(publishedGardenId).filter(v => v.visitorId !== req.auth.userId));
    if (sendSocialError(res, error)) return;
    if (error?.code === CONTENT_REJECTED) return res.status(422).json(contentSafetyResponse(req,error));
    logServerError("POST /leave error", error);
    res.status(500).json({ error: "Failed to leave Garden" });
  }
});

app.post("/analyze-mood", aiRateLimit, async (req, res) => {
  try {
    const { text } = req.body;

    if (typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Text is required" });
    }
    if (text.trim().length > 2000) {
      return res.status(413).json({ error: "Text must be 2000 characters or fewer" });
    }

    const consent = await prisma.aiConsent.findUnique({
      where: { userId: req.auth.userId }
    });

    if (!consent?.aiProcessing) {
      return res.status(403).json({
        error: "AI mood analysis requires your consent"
      });
    }

    const normalizedText = text.trim();
    const startedAt = Date.now();
    const mood = await predictMood(normalizedText);

    await prisma.aiInteractionMetadata.create({
      data: {
        userId: req.auth.userId,
        task: "EMOTION_CLASSIFICATION",
        provider: "LOCAL",
        model: "natural-mood-classifier",
        inputHash: hashAiInput(normalizedText),
        outputLabel: mood,
        latencyMs: Date.now() - startedAt,
        success: true
      }
    });

    res.json({ mood });
  } catch (err) {
    logServerError("Mood analysis error", err);
    res.status(500).json({ error: "Failed to analyze mood" });
  }
});

app.delete("/users/:id", async (req, res) => {
    try {
      const id = req.params.id;

      if (!requireOwnUser(req, res, id)) return;
      if (!requireRecentAuthentication(req, res)) return;

      if (process.env.NATIVE_SECURITY_TEST === '1') {
        const target = await prisma.user.findUnique({ where: { id }, select: { email: true, firebaseUid: true } });
        try { assertNativeTestDeletion(target); }
        catch { return res.status(403).json({ error: 'Only disposable isolated C deletion is authorized' }); }
      }

      try {
        await createAuditEvent({ eventType: "ACCOUNT_DELETION_REQUESTED", outcome: "REQUESTED", correlationId: req.requestId, actorUserId: req.auth.userId, targetClass: "account", targetSafeId: id, actionCode: "ACCOUNT_DELETION" });
      } catch (auditError) {
        emitSecurityEvent({ eventType: "database_failure", outcome: "failed", correlationId: req.requestId, routeClass: securityRouteClass(req), resourceClass: "audit_event", safeReason: "audit_write_failed", fallbackUsed: true });
        return res.status(503).json({ error: "Account deletion is temporarily unavailable" });
      }

      const deletion = await realtime.withRevocation({ userId: id }, () => requestAccountDeletion(prisma,
        { userId:id, firebaseUid:req.auth.firebaseUid }, firebaseUserDeleter));
      res.status(deletion.success ? 200 : 202).json(deletion);
      if (!deletion.success) return;
      try {
        await createAuditEvent({ eventType: "ACCOUNT_DELETION_COMPLETED", outcome: "COMPLETED", correlationId: req.requestId, actorUserId: req.auth.userId, targetClass: "account", targetSafeId: id, actionCode: "ACCOUNT_DELETION" });
      } catch {
        emitSecurityEvent({ eventType: "database_failure", outcome: "failed", correlationId: req.requestId, routeClass: securityRouteClass(req), resourceClass: "audit_event", safeReason: "completed_audit_write_failed", fallbackUsed: true });
      }
    } catch (err) {
      logServerError("DELETE /users/:id error", err);
      res.status(500).json({
        error: "Failed to delete user"
      });
    }
  });

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectRun) {
  loadMoodModel()
    .then(() => {
      console.log("Mood model loaded.");
    })
    .catch((err) => {
      logServerError("Failed to load mood model", err);
    });
}
  const clientDistPath = path.join(
    __dirname,
    "client",
    "dist"
  );
  
  app.use(express.static(clientDistPath));
  
  app.use((req, res, next) => {
    if (
      !isWebShellRequest(req)
    ) {
      return next();
    }
  
    res.sendFile(
      path.join(
        clientDistPath,
        "index.html"
      )
    );
  });

app.use(endpointNotFound);
app.use(handleHttpError);

if (isDirectRun) {
  server.listen(PORT, process.env.NATIVE_SECURITY_TEST === '1' ? '127.0.0.1' : '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export { app, server };
