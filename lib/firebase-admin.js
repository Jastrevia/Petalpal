import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { assertNativeSecurityEnvironment } from './native-security.js';

function normalizePrivateKey(value) {
  return String(value || "").replace(/\\n/g, "\n");
}

export function readFirebaseAdminConfig(env = process.env) {
  assertNativeSecurityEnvironment(env);
  const projectId = env.FIREBASE_PROJECT_ID || "petalpal-b212c";
  const rawServiceAccount = env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (rawServiceAccount) {
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(rawServiceAccount);
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must be valid JSON");
    }
    if (serviceAccount.project_id !== projectId) {
      const error = new Error("Firebase Admin credential project does not match FIREBASE_PROJECT_ID");
      error.code = "FIREBASE_ADMIN_PROJECT_MISMATCH";
      throw error;
    }
    serviceAccount.private_key = normalizePrivateKey(serviceAccount.private_key);
    return { projectId, serviceAccount };
  }

  const clientEmail = env.FIREBASE_CLIENT_EMAIL;
  const privateKey = env.FIREBASE_PRIVATE_KEY;
  if (clientEmail || privateKey) {
    if (!clientEmail || !privateKey) {
      throw new Error("FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY must be configured together");
    }
    return {
      projectId,
      serviceAccount: {
        project_id: projectId,
        client_email: clientEmail,
        private_key: normalizePrivateKey(privateKey)
      }
    };
  }

  return { projectId, serviceAccount: null };
}

function firebaseApp() {
  const { projectId, serviceAccount } = readFirebaseAdminConfig();
  const existing = getApps()[0];
  if (existing) {
    if (existing.options.projectId !== projectId) {
      const error = new Error("Firebase Admin app project does not match FIREBASE_PROJECT_ID");
      error.code = "FIREBASE_ADMIN_PROJECT_MISMATCH";
      throw error;
    }
    return existing;
  }

  if (serviceAccount) {
    return initializeApp({ credential: cert(serviceAccount), projectId });
  }

  return initializeApp({ projectId });
}

// The account's sign-in pass: Firebase makes the user on first use, with no provider to enable.
export async function createFirebaseSignInToken(uid) {
  return getAuth(firebaseApp()).createCustomToken(uid);
}

export async function verifyFirebaseIdToken(token) {
  return getAuth(firebaseApp()).verifyIdToken(token, true);
}

export async function findFirebaseUserByEmail(email) {
  try {
    return await getAuth(firebaseApp()).getUserByEmail(email);
  } catch (error) {
    if (error?.code === "auth/user-not-found") return null;
    throw error;
  }
}

export async function deleteFirebaseUser(uid, auth = getAuth(firebaseApp())) {
  try {
    await auth.deleteUser(uid);
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
  }
}
