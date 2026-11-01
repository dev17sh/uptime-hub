import { describe, it, expect } from 'vitest';
import { isIpBlocked, validateUrlSecurity } from '../ssrf.js';

describe('SSRF Guard Security Module', () => {
  describe('isIpBlocked', () => {
    it('blocks IPv4 loopback (127.0.0.1, 127.0.0.254)', () => {
      expect(isIpBlocked('127.0.0.1')).toBe(true);
      expect(isIpBlocked('127.0.0.254')).toBe(true);
    });

    it('blocks IPv4 private ranges (10.x, 172.16.x, 192.168.x)', () => {
      expect(isIpBlocked('10.0.0.1')).toBe(true);
      expect(isIpBlocked('172.16.0.1')).toBe(true);
      expect(isIpBlocked('172.31.255.255')).toBe(true);
      expect(isIpBlocked('192.168.1.1')).toBe(true);
    });

    it('blocks cloud metadata address (169.254.169.254)', () => {
      expect(isIpBlocked('169.254.169.254')).toBe(true);
      expect(isIpBlocked('169.254.1.1')).toBe(true);
    });

    it('blocks IPv6 loopback and private', () => {
      expect(isIpBlocked('::1')).toBe(true);
      expect(isIpBlocked('fc00::1')).toBe(true);
      expect(isIpBlocked('fe80::1')).toBe(true);
    });

    it('blocks IPv4-mapped IPv6 loopback (::ffff:127.0.0.1)', () => {
      expect(isIpBlocked('::ffff:127.0.0.1')).toBe(true);
    });

    it('allows public IPv4 and IPv6 addresses', () => {
      expect(isIpBlocked('8.8.8.8')).toBe(false);
      expect(isIpBlocked('1.1.1.1')).toBe(false);
      expect(isIpBlocked('2606:4700:4700::1111')).toBe(false);
    });
  });

  describe('validateUrlSecurity', () => {
    it('rejects non-http/https protocols', async () => {
      const ftp = await validateUrlSecurity('ftp://example.com/file');
      expect(ftp.valid).toBe(false);

      const file = await validateUrlSecurity('file:///etc/passwd');
      expect(file.valid).toBe(false);

      const gopher = await validateUrlSecurity('gopher://example.com');
      expect(gopher.valid).toBe(false);
    });

    it('rejects localhost and local hostnames', async () => {
      const res1 = await validateUrlSecurity('http://localhost:3000');
      expect(res1.valid).toBe(false);
      expect(res1.error).toContain('SSRF Guard');

      const res2 = await validateUrlSecurity('http://app.local');
      expect(res2.valid).toBe(false);
    });

    it('rejects URLs pointing to private/cloud metadata IPs', async () => {
      const res = await validateUrlSecurity('http://169.254.169.254/latest/meta-data/');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('SSRF Guard');
    });

    it('allows public valid domains', async () => {
      const res = await validateUrlSecurity('https://example.com');
      expect(res.valid).toBe(true);
    });
  });
});

