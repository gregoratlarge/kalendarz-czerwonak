import { describe, it, expect } from 'vitest';
import { detectPlatform } from '../src/platform';

// Real-world user agents, trimmed to the parts that matter for detection.
const UA = {
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0',
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  chromeIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1',
  ipadLegacy:
    'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  // iPadOS 13+ reports itself as macOS to get desktop sites.
  ipadOs13: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  desktopChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  desktopFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
};

describe('detectPlatform', () => {
  it('detects Android, including Firefox', () => {
    expect(detectPlatform(UA.chromeAndroid, 5)).toBe('android');
    expect(detectPlatform(UA.firefoxAndroid, 5)).toBe('android');
  });

  it('detects iPhone, in both Safari and Chrome', () => {
    expect(detectPlatform(UA.iphoneSafari, 5)).toBe('ios');
    expect(detectPlatform(UA.chromeIos, 5)).toBe('ios');
  });

  it('detects legacy iPads by name', () => {
    expect(detectPlatform(UA.ipadLegacy, 5)).toBe('ios');
  });

  it('treats iPadOS 13+ (masquerading as macOS) as iOS when it reports touch', () => {
    expect(detectPlatform(UA.ipadOs13, 5)).toBe('ios');
  });

  it('treats a real Mac as desktop even though it matches the macOS UA', () => {
    expect(detectPlatform(UA.ipadOs13, 0)).toBe('desktop');
    expect(detectPlatform(UA.desktopChrome, 0)).toBe('desktop');
  });

  it('treats a touchscreen Windows laptop as desktop', () => {
    expect(detectPlatform(UA.desktopFirefox, 10)).toBe('desktop');
  });
});
