import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isWebShellRequest } from "../../lib/web-shell.js";

// Published policies (mobile/public/legal): served as plain files by the Worker, linked from the app.
const pages = ["privacy", "terms", "account-deletion"];
const read = name => readFileSync(new URL(`../../mobile/public/legal/${name}.html`, import.meta.url), "utf8");

test("published policies are final: owners, contact, adult audience, no draft markers", () => {
  for (const name of pages) {
    const html = read(name);
    assert.match(html, /^<!doctype html>/i, name);
    assert.match(html, /Xingran Ma and Jinyin Cao/, name);
    assert.match(html, /contact@jastrevia\.com/, name);
    assert.match(html, /Effective November 26, 2026/, name);
    assert.doesNotMatch(html, /\[(?:OWNER|LEGAL|APPROVED|VERIFY)|draft|not been published|<script/i, name);
    for (const other of pages.filter(page => page !== name)) assert.ok(html.includes(`href="${other}.html"`), `${name} links ${other}`);
  }
  for (const name of ["privacy", "terms"]) assert.match(read(name), /at least 19 years old, or the age of majority where you live, whichever is higher/, name);
  assert.match(read("terms"), /laws of the Province of British Columbia/);
  // Backups are manual database exports kept at most 30 days (owner decision, 2026-10-23).
  // Optional Garden weather (2026-11-26): rounded location only, MET Norway named, deleted when turned off.
  assert.match(read("privacy"), /about 11 km/);
  assert.match(read("privacy"), /MET Norway/);
  assert.match(read("privacy"), /never uses location in the background/);
  assert.match(read("privacy"), /Turning Garden weather off, or deleting your account, deletes the saved point/);
  // PetalPal VIP (2026-11-26): Apple takes the payment, RevenueCat is named, renewal and cancelling are explained,
  // and deleting the account says it does not cancel the subscription.
  assert.match(read("privacy"), /RevenueCat/);
  assert.match(read("terms"), /renews automatically every month/);
  assert.match(read("terms"), /Founding Member/);
  assert.match(read("account-deletion"), /does not cancel your App Store subscription/);
  for (const name of ["privacy", "account-deletion"]) {
    assert.match(read(name), /no more than 30 days/, name);
    assert.match(read(name), /never used to restore a deleted account|never to restore a deleted account/, name);
  }
});

test("the Worker serves them as files, never the app shell, and the web build links them", () => {
  for (const name of pages) assert.equal(isWebShellRequest({ method: "GET", path: `/legal/${name}.html` }), false, name);
  const build = readFileSync(new URL("../../scripts/build-cloudflare-web.mjs", import.meta.url), "utf8");
  assert.match(build, /const legal = 'https:\/\/app\.jastrevia\.com\/legal'/);
  for (const [name, file] of [["PRIVACY_POLICY", "privacy"], ["TERMS", "terms"], ["DELETION", "account-deletion"]]) {
    assert.ok(build.includes(`EXPO_PUBLIC_${name}_URL: \`\${legal}/${file}.html\``), name);
  }
});
