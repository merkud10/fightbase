import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "dmxg5wxfqgb4u.cloudfront.net" },
      { protocol: "https", hostname: "www.ufc.com" },
      { protocol: "https", hostname: "ufc.com" },
      { protocol: "https", hostname: "images.tapology.com" },
      { protocol: "https", hostname: "www1-cdn.sherdog.com" },
      { protocol: "https", hostname: "ss.sport-express.net" },
      { protocol: "https", hostname: "www.sport-express.net" },
      { protocol: "https", hostname: "upload.wikimedia.org" }
    ],
    formats: ["image/avif", "image/webp"]
  },
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://dmxg5wxfqgb4u.cloudfront.net https://*.ufc.com https://ufc.com https://images.tapology.com https://www1-cdn.sherdog.com https://ss.sport-express.net https://www.sport-express.net https://upload.wikimedia.org",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: csp }
        ]
      }
    ];
  }
};

export default nextConfig;
