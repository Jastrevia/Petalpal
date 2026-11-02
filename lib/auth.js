import prisma from "./prisma.js";
import { createFirebaseSignInToken, verifyFirebaseIdToken } from "./firebase-admin.js";
import { logServerError } from "./security-log.js";
import { emitSecurityEvent, securityRouteClass } from "./security-events.js";

let tokenVerifier = verifyFirebaseIdToken;
let signInTokenIssuer = createFirebaseSignInToken;
// Private server-only token context; never put credentials in adapter-visible data.
const socketIdentities = new WeakMap();
const socketIdentityChecks = new WeakMap();

export function setFirebaseTokenVerifierForTests(verifier) {
  tokenVerifier = verifier || verifyFirebaseIdToken;
}

export function setFirebaseSignInTokenIssuerForTests(issuer) {
  signInTokenIssuer = issuer || createFirebaseSignInToken;
}
export const issueFirebaseSignInToken = (uid) => signInTokenIssuer(uid);

function readBearerToken(header) {
  if (typeof header !== "string") return null;
  return header.match(/^Bearer\s+(.+)$/i)?.[1] || null;
}

function safeTokenMetadata(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || parts[1].length > 16_384) return { malformed: true };
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return {
      issuer: typeof claims.iss === "string" && claims.iss.length <= 256 ? claims.iss : null,
      audience: typeof claims.aud === "string" && claims.aud.length <= 128 ? claims.aud : null,
      expirationTimestamp: Number.isSafeInteger(claims.exp) ? claims.exp : null
    };
  } catch {
    return { malformed: true };
  }
}

function tokenFailureReason(error, metadata, expectedProjectId) {
  if (error?.code === "app/invalid-credential" || error?.code === "auth/insufficient-permission") return "admin_credential_unavailable";
  if (error?.code === "FIREBASE_ADMIN_PROJECT_MISMATCH") return "admin_project_mismatch";
  if (metadata.malformed) return "malformed_token";
  if (metadata.audience && metadata.audience !== expectedProjectId) return "wrong_audience";
  if (metadata.issuer && metadata.issuer !== `https://securetoken.google.com/${expectedProjectId}`) return "wrong_issuer";
  if (metadata.expirationTimestamp && metadata.expirationTimestamp <= Math.floor(Date.now() / 1000)) return "expired_token";
  if (error?.code === "auth/id-token-expired") return "expired_token";
  if (error?.code === "auth/id-token-revoked") return "revoked_token";
  if (error?.code === "auth/invalid-id-token" || error?.code === "auth/argument-error") return "invalid_token";
  return "verification_error";
}

export async function authenticateFirebaseIdentity(req, res, next) {
  const token = readBearerToken(req.get("authorization"));
  if (!token) {
    emitSecurityEvent({ eventType: "authentication_failure", outcome: "denied", correlationId: req.requestId, routeClass: securityRouteClass(req), safeReason: "missing_token" });
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const decoded = await tokenVerifier(token);
    req.firebase = {
      uid: decoded.uid,
      email: decoded.email || null,
      emailVerified: decoded.email_verified === true,
      authTime: Number.isSafeInteger(decoded.auth_time) ? decoded.auth_time : null,
      name: decoded.name || null,
      picture: decoded.picture || null,
      provider: decoded.firebase?.sign_in_provider || null
    };
    return next();
  } catch (error) {
    const expectedProjectId = process.env.FIREBASE_PROJECT_ID || "petalpal-b212c";
    const metadata = safeTokenMetadata(token);
    const reason = tokenFailureReason(error, metadata, expectedProjectId);
    // Never log unverified JWT claims or provider messages, even after regex redaction.
    try { console.info("Firebase token verification failed", { expectedProjectId, reason }); }
    catch { /* Diagnostics must not interfere with an authentication rejection. */ }
    emitSecurityEvent({ eventType: "authentication_failure", outcome: "denied", correlationId: req.requestId, routeClass: securityRouteClass(req), safeReason: reason });
    if (reason === "admin_credential_unavailable" || reason === "admin_project_mismatch") {
      return res.status(503).json({ error: "Authentication service unavailable" });
    }
    return res.status(401).json({ error: "Invalid or expired Firebase token" });
  }
}

export async function authenticateRequest(req, res, next) {
  return authenticateFirebaseIdentity(req, res, async () => {
    try {
      // The account is its Firebase uid. An email is optional, and stored only once verified.
      const user = await prisma.user.findUnique({
        where: { firebaseUid: req.firebase.uid },
        select: { id: true }
      });
      if (!user && req.method === 'DELETE') {
        const pending = await prisma.accountDeletion.findUnique({where:{firebaseUid:req.firebase.uid},select:{userId:true}});
        if (pending && req.path === `/users/${pending.userId}`) { req.auth={userId:pending.userId,firebaseUid:req.firebase.uid}; return next(); }
      }
      if (!user) {
        emitSecurityEvent({ eventType: "authentication_failure", outcome: "denied", correlationId: req.requestId, routeClass: securityRouteClass(req), safeReason: "profile_not_found" });
        return res.status(403).json({ error: "PetalPal profile setup required" });
      }
      req.auth = { userId: user.id, firebaseUid: req.firebase.uid };
      return next();
    } catch (error) {
      logServerError("Authentication profile lookup failed", error);
      return res.status(503).json({ error: "Authentication service unavailable" });
    }
  });
}

export async function authenticateSocket(socket, next) {
  const token = socket.handshake.auth?.token ||
    readBearerToken(socket.handshake.headers.authorization);
  if (typeof token !== "string" || !token || token.length > 8192) return next(new Error("Authentication required"));

  try {
    const decoded = await tokenVerifier(token);
    const user = await prisma.user.findUnique({
      where: { firebaseUid: decoded.uid },
      select: { id: true }
    });
    if (!user) return next(new Error("PetalPal profile setup required"));
    socket.data.currentUserId = user.id;
    socket.data.firebaseUid = decoded.uid;
    socketIdentities.set(socket, Object.freeze({ token, userId: user.id, firebaseUid: decoded.uid }));
    return next();
  } catch {
    return next(new Error("Invalid or expired Firebase token"));
  }
}

export async function revalidateSocketIdentity(socket) {
  const context = socketIdentities.get(socket);
  if (!context || !socket.connected) return false;
  // Share only an in-flight verification, never a completed authorization cache.
  if (socketIdentityChecks.has(socket)) return socketIdentityChecks.get(socket);
  const check = (async () => {
    try {
      const decoded = await tokenVerifier(context.token);
      if (decoded.uid !== context.firebaseUid ||
          (decoded.exp !== undefined && decoded.exp * 1000 <= Date.now())) throw new Error("Invalid session");
      const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid }, select: { id: true } });
      if (user?.id !== context.userId || socket.data.currentUserId !== context.userId ||
          socket.data.firebaseUid !== context.firebaseUid) throw new Error("Invalid session");
      return socket.connected;
    } catch {
      socket.disconnect(true);
      return false;
    }
  })();
  socketIdentityChecks.set(socket, check);
  try { return await check; } finally { socketIdentityChecks.delete(socket); }
}

export function requireOwnUser(req, res, userId) {
  if (String(req.auth?.userId || "") !== String(userId || "")) {
    emitSecurityEvent({ eventType: "authorization_denial", outcome: "denied", correlationId: req.requestId, routeClass: securityRouteClass(req), resourceClass: "owner_resource", safeReason: "owner_mismatch", actorId: req.auth?.userId });
    res.status(403).json({ error: "You are not authorized to modify this user" });
    return false;
  }
  return true;
}


// Token refresh changes iat, not auth_time. Require an actual recent sign-in.
export function signedInRecently(req, nowSeconds = Math.floor(Date.now() / 1000)) {
  const authTime = req.firebase?.authTime;
  const age = nowSeconds - authTime;
  return Number.isSafeInteger(authTime) && authTime > 0 && age >= 0 && age <= 5 * 60;
}

export function requireRecentAuthentication(req, res, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!signedInRecently(req, nowSeconds)) {
    res.status(403).json({
      error: "Sign out and sign in again before deleting your account.",
      code: "auth/requires-recent-login"
    });
    return false;
  }
  return true;
}
