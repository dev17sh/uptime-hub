import dns from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

export interface SecurityValidationResult {
  valid: boolean;
  status: 'VALID' | 'BLOCKED' | 'DNS_ERROR';
  error?: string;
  resolvedIps?: string[];
}

/**
 * Validates an IP address string against private, loopback, link-local,
 * multicast, carrier-grade, and reserved network ranges (both IPv4 and IPv6).
 */
export function isIpBlocked(ipString: string): boolean {
  try {
    let addr = ipaddr.parse(ipString);

    // If it's an IPv4-mapped IPv6 address (e.g. ::ffff:127.0.0.1), unmap to IPv4
    if (addr.kind() === 'ipv6') {
      const v6 = addr as ipaddr.IPv6;
      if (v6.isIPv4MappedAddress()) {
        addr = v6.toIPv4Address();
      }
    }

    const range = addr.range();

    // Blocked ranges for IPv4
    const blockedIpv4Ranges: string[] = [
      'unspecified',      // 0.0.0.0/8
      'broadcast',        // 255.255.255.255/32
      'multicast',        // 224.0.0.0/4
      'linkLocal',        // 169.254.0.0/16 (includes cloud metadata 169.254.169.254)
      'loopback',         // 127.0.0.0/8
      'private',          // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
      'carrierGradeNat',  // 100.64.0.0/10
      'reserved',         // 240.0.0.0/4 and others
    ];

    // Blocked ranges for IPv6
    const blockedIpv6Ranges: string[] = [
      'unspecified',      // ::
      'linkLocal',        // fe80::/10
      'multicast',        // ff00::/8
      'loopback',         // ::1
      'uniqueLocal',      // fc00::/7 (private IPv6)
      'reserved',
    ];

    if (addr.kind() === 'ipv4') {
      return blockedIpv4Ranges.includes(range);
    } else {
      return blockedIpv6Ranges.includes(range);
    }
  } catch (_e) {
    // If it cannot be parsed as a valid IP, treat as blocked
    return true;
  }
}

/**
 * Validates a URL for SSRF protection:
 * 1. Protocol must be http: or https:
 * 2. Hostname must be present
 * 3. Resolves DNS and checks ALL resolved IPs against blocked ranges
 */
export async function validateUrlSecurity(urlString: string): Promise<SecurityValidationResult> {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(urlString);
  } catch (_e) {
    return { valid: false, status: 'BLOCKED', error: 'Malformed URL' };
  }

  // 1. Only http: and https: allowed
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return {
      valid: false,
      status: 'BLOCKED',
      error: `Disallowed protocol "${parsedUrl.protocol}". Only http: and https: are permitted.`,
    };
  }

  const hostname = parsedUrl.hostname;
  if (!hostname) {
    return { valid: false, status: 'BLOCKED', error: 'Missing hostname in URL' };
  }

  // Check if hostname is directly an IP
  if (ipaddr.isValid(hostname)) {
    if (isIpBlocked(hostname)) {
      return {
        valid: false,
        status: 'BLOCKED',
        error: `Target IP address "${hostname}" is within a restricted or private range (SSRF Guard).`,
        resolvedIps: [hostname],
      };
    }
    return { valid: true, status: 'VALID', resolvedIps: [hostname] };
  }

  // Reject local and internal hostnames directly
  const lowerHost = hostname.toLowerCase();
  if (
    lowerHost === 'localhost' ||
    lowerHost.endsWith('.localhost') ||
    lowerHost.endsWith('.local') ||
    lowerHost.endsWith('.internal')
  ) {
    return {
      valid: false,
      status: 'BLOCKED',
      error: `Target hostname "${hostname}" is a private or local domain (SSRF Guard).`,
    };
  }

  // Resolve hostname via DNS lookup
  try {
    const addresses = await dns.lookup(hostname, { all: true });

    if (!addresses || addresses.length === 0) {
      return {
        valid: false,
        status: 'DNS_ERROR',
        error: `Could not resolve hostname "${hostname}" (DNS lookup failed).`,
      };
    }

    const resolvedIps = addresses.map((a) => a.address);

    for (const ip of resolvedIps) {
      if (isIpBlocked(ip)) {
        return {
          valid: false,
          status: 'BLOCKED',
          error: `Resolved IP address "${ip}" for host "${hostname}" is within a restricted range (SSRF Guard).`,
          resolvedIps,
        };
      }
    }

    return {
      valid: true,
      status: 'VALID',
      resolvedIps,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'DNS lookup error';
    return {
      valid: false,
      status: 'DNS_ERROR',
      error: `DNS resolution failed for "${hostname}": ${message}`,
    };
  }
}
