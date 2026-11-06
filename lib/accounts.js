import { randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const SCRYPT = { N: 2 ** 15, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
export const MIN_PASSWORD_LENGTH = 8;
// A password set from now on (the sign-up page's rule, owner 2026-11-06): 8–16 characters with at
// least one letter and one number. Signing in still accepts any stored length up to the cap.
export const MAX_NEW_PASSWORD_LENGTH = 16;
const MAX_PASSWORD_LENGTH = 128;
// An account name chosen from now on: 4–20 letters, numbers or underscores (it is also the sign-in
// name, so it stays plain to type and to tell apart). Older display names still sign in as they are.
export const ACCOUNT_NAME_PATTERN = /^[A-Za-z0-9_]{4,20}$/;
// The Garden Fairy's name: any short name, shared by many (only the account name is unique).
export const MAX_FAIRY_NAME_LENGTH = 20;

// Must stay the same expression as the unique index "User_name_normalized_key":
// the database decides whether two names are the same name.
const nameKeySql = (value) => `lower(btrim(regexp_replace(normalize(${value}, NFKC), '\\s+', ' ', 'g')))`;

export function normalizeUsername(name) {
  return String(name ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

// A login is a name, a PP number or an email, so a name may not look like the other two.
export function usernameProblem(name) {
  const key = normalizeUsername(name);
  return key.includes("@") || /^pp\d+$/.test(key) ? "Choose a name without @, and not shaped like a PP number." : null;
}

// A new account's name: the plain shape above, and never a PP number's.
export function accountNameProblem(name) {
  const text = String(name ?? "");
  if (!ACCOUNT_NAME_PATTERN.test(text)) return "Use 4–20 letters, numbers or underscores.";
  return usernameProblem(text);
}

export const newAccountNumber = () => `PP${String(randomInt(100_000_000)).padStart(8, "0")}`;

export async function findUserByName(db, name) {
  const rows = await db.$queryRawUnsafe(`/* account:name */ SELECT "id", "firebaseUid" FROM "User"
    WHERE ${nameKeySql('"name"')} = ${nameKeySql("$1::text")} LIMIT 1`, String(name));
  return rows[0] || null;
}

export async function findUserByLogin(db, login) {
  const text = String(login ?? "").trim();
  if (/^@?PP\d{8}$/i.test(text)) {
    return db.user.findUnique({ where: { accountId: text.replace(/^@/, "").toUpperCase() }, select: { id: true, firebaseUid: true } });
  }
  return findUserByName(db, text);
}

export function validNewPassword(password) {
  return typeof password === "string" && password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_NEW_PASSWORD_LENGTH
    && /[A-Za-z]/.test(password) && /[0-9]/.test(password);
}
export const PASSWORD_RULE = `Use ${MIN_PASSWORD_LENGTH}–${MAX_NEW_PASSWORD_LENGTH} characters with letters and numbers.`;

const derive = (password, salt, { N, r, p, maxmem }) => scryptAsync(password, salt, 32, { N, r, p, maxmem });

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password, stored) {
  if (typeof password !== "string" || password.length > MAX_PASSWORD_LENGTH || typeof stored !== "string") return false;
  const [scheme, N, r, p, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64");
  const actual = await derive(password, Buffer.from(salt, "base64"), { N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// An unknown name costs the same time as a wrong password, so timing does not show which names have a password.
let decoy;
export async function spendPasswordTime(password) {
  decoy ||= hashPassword(randomBytes(16).toString("base64"));
  await verifyPassword(String(password ?? "").slice(0, MAX_PASSWORD_LENGTH), await decoy);
}
