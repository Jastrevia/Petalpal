// The cached zone validation and formatters in lib/ai-periods.js must give exactly the same
// local dates as building a fresh Intl.DateTimeFormat each time, must never cache an unknown
// zone, and must stay bounded however many distinct zone spellings clients send.
import assert from "node:assert/strict";
import test from "node:test";

import { localDateForInstant, normalizeIanaTimezone, timezoneCacheSizesForTests } from "../../lib/ai-periods.js";

function freshLocalDate(instant, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(instant);
  const value = (type) => parts.find((part) => part.type === type).value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

test("cached local dates match a fresh formatter across zones, midnights and DST changes", () => {
  const zones = ["UTC", "America/Vancouver", "America/Toronto", "Europe/London", "Asia/Shanghai", "Asia/Kolkata", "Australia/Lord_Howe", "Pacific/Kiritimati"];
  const instants = [
    "2026-03-08T09:59:59Z", "2026-03-08T10:00:00Z", "2026-03-29T00:59:59Z", "2026-03-29T01:00:00Z",
    "2026-09-29T06:59:59Z", "2026-09-29T07:00:00Z", "2026-11-01T08:30:00Z", "2026-11-01T09:30:00Z",
    "2026-12-31T23:59:59Z", "2027-01-01T00:00:00Z"
  ].map((value) => new Date(value));
  for (const zone of zones) {
    assert.equal(normalizeIanaTimezone(zone), zone);
    assert.equal(normalizeIanaTimezone(` ${zone} `), zone);
    for (const instant of instants) {
      const expected = freshLocalDate(instant, zone);
      assert.equal(localDateForInstant(instant, zone), expected, `${zone} ${instant.toISOString()}`);
      assert.equal(localDateForInstant(instant, zone), expected, `${zone} ${instant.toISOString()} (cached)`);
    }
  }
});

test("unknown zones are rejected every time and never cached", () => {
  const before = timezoneCacheSizesForTests();
  for (let attempt = 0; attempt < 3; attempt++) assert.equal(normalizeIanaTimezone("Not/A_Zone"), null);
  for (let index = 0; index < 50; index++) assert.equal(normalizeIanaTimezone(`Invalid/Zone_${index}`), null);
  for (const value of [undefined, null, "", "   ", 42, "A".repeat(65)]) assert.equal(normalizeIanaTimezone(value), null);
  assert.throws(() => localDateForInstant(new Date("2026-11-07T00:00:00Z"), "Not/A_Zone"), /valid IANA timezone/);
  assert.deepEqual(timezoneCacheSizesForTests(), before);
});

test("caches stay bounded when clients send many distinct valid spellings", () => {
  const letters = "America/Vancouver";
  const positions = [...letters].map((character, index) => (/[a-z]/i.test(character) ? index : -1)).filter((index) => index >= 0);
  const instant = new Date("2026-11-07T20:00:00Z");
  const expected = freshLocalDate(instant, "America/Vancouver");
  for (let variant = 0; variant < 1200; variant++) {
    const spelling = [...letters].map((character, index) => {
      const bit = positions.indexOf(index);
      return bit >= 0 && (variant >> (bit % 16)) & 1 ? character.toUpperCase() : character.toLowerCase();
    }).join("");
    assert.equal(normalizeIanaTimezone(spelling), spelling);
    assert.equal(localDateForInstant(instant, spelling), expected);
  }
  const sizes = timezoneCacheSizesForTests();
  assert.ok(sizes.validTimezones <= 1000, `validTimezones ${sizes.validTimezones}`);
  assert.ok(sizes.zonedFormatters <= 1000, `zonedFormatters ${sizes.zonedFormatters}`);
});
