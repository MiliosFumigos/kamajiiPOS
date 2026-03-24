/**
 * Extract subdomain from host
 * e.g. "acme.localhost:3000" -> "acme"
 * e.g. "acme.vercel.app" -> "acme"
 * e.g. "localhost:3000" -> null (root domain)
 */
export function getSubdomainFromHost(host: string): string | null {
  // Remove port
  const hostname = host.split(":")[0];

  // localhost or 127.0.0.1 - for local dev, first part before .localhost is subdomain
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return null;
  }

  if (hostname.endsWith(".localhost")) {
    const parts = hostname.split(".");
    if (parts.length >= 2) {
      return parts[0];
    }
  }

  // Local dev A 方案：*.lvh.me
  if (hostname.endsWith(".lvh.me")) {
    const parts = hostname.split(".");
    if (parts.length >= 3) {
      return parts[0];
    }
  }

  // Production: subdomain.example.com
  const parts = hostname.split(".");
  if (parts.length >= 3) {
    return parts[0];
  }

  return null;
  
}

/**
 * Check if current request is on root domain (marketing site)
 */
export function isRootDomain(host: string): boolean {
  return getSubdomainFromHost(host) === null;
}

// 從 request 的 host 字串拆出「子網域」或判斷是否為根網域，給 middleware 用