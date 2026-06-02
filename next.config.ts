import type { NextConfig } from "next";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  [
    "connect-src",
    "'self'",
    "blob:",
    "data:",
    "https://*.supabase.co",
    "https://*.walletconnect.com",
    "https://*.walletconnect.org",
    "wss://*.walletconnect.com",
    "wss://*.walletconnect.org",
    "https://*.reown.com",
    "wss://*.reown.com",
    "https://*.base.org",
    "https://*.alchemy.com",
    "https://*.g.alchemy.com",
  ].join(" "),
  [
    "frame-src",
    "'self'",
    "https://*.walletconnect.com",
    "https://*.walletconnect.org",
    "https://*.reown.com",
  ].join(" "),
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const miniAppContentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  [
    "frame-ancestors",
    "'self'",
    "https://farcaster.xyz",
    "https://*.farcaster.xyz",
    "https://warpcast.com",
    "https://*.warpcast.com",
  ].join(" "),
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.reown.com",
  "media-src 'self' blob:",
  [
    "connect-src",
    "'self'",
    "blob:",
    "data:",
    "https://*.supabase.co",
    "https://*.walletconnect.com",
    "https://*.walletconnect.org",
    "wss://*.walletconnect.com",
    "wss://*.walletconnect.org",
    "https://api.web3modal.org",
    "https://*.reown.com",
    "wss://*.reown.com",
    "https://*.base.org",
    "https://*.alchemy.com",
    "https://*.g.alchemy.com",
    "https://farcaster.xyz",
    "https://*.farcaster.xyz",
    "https://warpcast.com",
    "https://*.warpcast.com",
  ].join(" "),
  [
    "frame-src",
    "'self'",
    "https://*.walletconnect.com",
    "https://*.walletconnect.org",
    "https://*.reown.com",
    "https://farcaster.xyz",
    "https://*.farcaster.xyz",
    "https://warpcast.com",
    "https://*.warpcast.com",
  ].join(" "),
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const sharedSecurityHeaders = [
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const strictSecurityHeaders = [
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  ...sharedSecurityHeaders,
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy,
  },
];

const miniAppSecurityHeaders = [
  ...sharedSecurityHeaders,
  {
    key: "Content-Security-Policy",
    value: miniAppContentSecurityPolicy,
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/mini/:path*",
        headers: miniAppSecurityHeaders,
      },
      {
        source: "/",
        headers: strictSecurityHeaders,
      },
      {
        source: "/:path((?!mini(?:/|$)).*)",
        headers: strictSecurityHeaders,
      },
    ];
  },
};

export default nextConfig;
