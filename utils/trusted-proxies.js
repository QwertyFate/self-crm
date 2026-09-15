/**
 * Addresses whose X-Forwarded-* headers Express may trust.
 *
 * Passed to `app.set('trust proxy', ...)`. Express walks the forwarding chain
 * from the socket outward and stops at the first address NOT in this list —
 * that address becomes `req.ip`. So:
 *
 *   - A request that arrives straight from the internet (origin hit directly,
 *     bypassing Cloudflare) has an untrusted socket address, and any
 *     X-Forwarded-For it carries is ignored. It cannot spoof its own IP.
 *   - A request through Cloudflare, with or without nginx / cloudflared / a
 *     PaaS load balancer in between, resolves to the real client because every
 *     intermediate hop is in the list.
 *
 * A hop count (`trust proxy: 1`) cannot do both; it is only correct when the
 * number of proxies is exactly one and never changes.
 *
 * Cloudflare ranges are published at https://www.cloudflare.com/ips/ and
 * change rarely. Fetched 2026-09-15. Refresh when Cloudflare announces a
 * change; a stale list fails LOUD (everyone resolves to the new edge IP and
 * shares one rate-limit bucket), never silently.
 */
module.exports = [
  // Local and private hops: nginx / cloudflared on the same box, a PaaS
  // internal load balancer (10/8, 172.16/12, 192.168/16, fc00::/7).
  'loopback',
  'linklocal',
  'uniquelocal',

  // Cloudflare IPv4 — https://www.cloudflare.com/ips-v4
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',

  // Cloudflare IPv6 — https://www.cloudflare.com/ips-v6
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
];
