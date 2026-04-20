// חישוב זמנים מדויקים מ-hebcal לבדיקות — MIN(Eilat, Nahariya) / MAX
import { HebrewCalendar, Location, flags } from "@hebcal/core";

const EILAT = new Location(29.5577, 34.9519, true, "Asia/Jerusalem", "Eilat", "IL", 5);
const NAHARIYA = new Location(33.0059, 35.0949, true, "Asia/Jerusalem", "Nahariya", "IL", 5);

function fmt(d) {
  if (!d) return "-";
  return d.toLocaleString("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getEventsFor(location, from, to) {
  return HebrewCalendar.calendar({
    start: from,
    end: to,
    location,
    candlelighting: true,
    havdalahMins: 50,
    il: true,
  });
}

function israelDateKey(d) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(d);
}

function pair(events) {
  const pairs = [];
  let cursor = 0;
  while (cursor < events.length) {
    const candleIdx = events.findIndex((x, j) => j >= cursor && x.getDesc() === "Candle lighting" && x.eventTime);
    if (candleIdx < 0) break;
    const havIdx = events.findIndex((x, j) => j > candleIdx && x.getDesc() === "Havdalah" && x.eventTime);
    if (havIdx < 0) break;
    const candle = events[candleIdx];
    const havdalah = events[havIdx];
    const between = events.slice(candleIdx + 1, havIdx);
    const chagEvent = between.find((x) => (x.getFlags() & flags.CHAG) !== 0);
    const ilWeekday = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", weekday: "short" }).format(candle.eventTime);
    const isFridayEve = ilWeekday === "Fri";
    if (chagEvent || isFridayEve) {
      pairs.push({
        candle: candle.eventTime,
        havdalah: havdalah.eventTime,
        chagName: chagEvent ? chagEvent.render("he") : null,
        reason: chagEvent ? "YOM_TOV" : "SHABBAT",
      });
    }
    cursor = havIdx + 1;
  }
  return pairs;
}

const ranges = [
  { label: "Winter Shabbat (Dec 2025)", from: "2025-12-10", to: "2025-12-15" },
  { label: "Summer Shabbat (Jun 2025)", from: "2025-06-10", to: "2025-06-15" },
  { label: "Rosh Hashana 5786 (Sep 2025)", from: "2025-09-20", to: "2025-09-26" },
  { label: "Yom Kippur 5786 (Oct 2025)", from: "2025-09-30", to: "2025-10-04" },
  { label: "Pesach 5785 (Apr 2025)", from: "2025-04-11", to: "2025-04-20" },
  { label: "Shavuot 5785 (Jun 2025)", from: "2025-06-01", to: "2025-06-05" },
  { label: "Sukkot 5786 (Oct 2025)", from: "2025-10-05", to: "2025-10-16" },
  { label: "Chol Hamoed Pesach (Apr 2025)", from: "2025-04-15", to: "2025-04-17" },
  { label: "Yom Haatzmaut (May 2025)", from: "2025-05-01", to: "2025-05-02" },
  { label: "Purim (Mar 2025)", from: "2025-03-13", to: "2025-03-16" },
  { label: "Chanukah (Dec 2025)", from: "2025-12-14", to: "2025-12-20" },
  { label: "9 Av (Aug 2025)", from: "2025-08-02", to: "2025-08-04" },
  { label: "DST transition (Oct 2025)", from: "2025-10-23", to: "2025-10-28" },
  { label: "Rosh Hashana adjacent to Shabbat (2024)", from: "2024-10-01", to: "2024-10-08" },
];

for (const range of ranges) {
  const from = new Date(range.from);
  const to = new Date(range.to);
  console.log(`\n━━━ ${range.label} (${range.from} → ${range.to}) ━━━`);
  const eilatPairs = pair(getEventsFor(EILAT, from, to));
  const nahariyaPairs = pair(getEventsFor(NAHARIYA, from, to));
  for (const ep of eilatPairs) {
    const np = nahariyaPairs.find((n) => israelDateKey(n.candle) === israelDateKey(ep.candle));
    if (!np) {
      console.log(`  [eilat only] ${ep.reason} ${ep.chagName ?? ""} ${fmt(ep.candle)} → ${fmt(ep.havdalah)}`);
      continue;
    }
    const start = new Date(Math.min(ep.candle.getTime(), np.candle.getTime()));
    const end = new Date(Math.max(ep.havdalah.getTime(), np.havdalah.getTime()));
    const earlierStart = ep.candle.getTime() < np.candle.getTime() ? "Eilat" : "Nahariya";
    const laterEnd = ep.havdalah.getTime() > np.havdalah.getTime() ? "Eilat" : "Nahariya";
    console.log(`  ${ep.reason} ${ep.chagName ?? ""}`);
    console.log(`    start: ${fmt(start)} IL  (earliest: ${earlierStart})`);
    console.log(`    end:   ${fmt(end)} IL  (latest:   ${laterEnd})`);
    console.log(`    eilat:   ${fmt(ep.candle)} → ${fmt(ep.havdalah)}`);
    console.log(`    nahariya: ${fmt(np.candle)} → ${fmt(np.havdalah)}`);
  }
  if (eilatPairs.length === 0) {
    console.log(`  (no blocking windows)`);
  }
}
