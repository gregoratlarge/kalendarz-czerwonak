// Detects where the page is being read, so the subscribe links can pick the
// only path that actually works there.
//
// Ground rules this encodes:
// - Google Calendar's mobile apps cannot subscribe to a feed at all, on either
//   platform. Google's own help: "You can't subscribe to a calendar in the
//   Google Calendar app for Android, iPhone, or iPad." The only route on a
//   phone is the web "Add by URL" form (Desktop Site mode).
// - webcal:// has no handler on Android at all (issuetracker 465755643), while
//   iOS has a system-wide one that opens Apple Calendar with one tap.
// - Google's /render?cid= deep link works in a desktop browser only.

export type Platform = 'desktop' | 'android' | 'ios';

export function detectPlatform(ua: string, maxTouchPoints: number): Platform {
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  // iPadOS 13+ reports itself as macOS to stay compatible with desktop sites;
  // a real Mac has no touch digitiser, so touch count disambiguates.
  if (/Macintosh|Mac OS X/i.test(ua) && maxTouchPoints > 1) return 'ios';
  return 'desktop';
}
