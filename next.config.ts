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
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "www.sports.ru" },
      { protocol: "https", hostname: "storage.yandexcloud.net" },
      { protocol: "https", hostname: "cdn-mmajunkie-com.translate.goog" },
      { protocol: "https", hostname: "mmajunkie.usatoday.com" },
      { protocol: "https", hostname: "cdn.vox-cdn.com" }
    ],
    formats: ["image/avif", "image/webp"]
  },
  async redirects() {
    // Шесть профилей были заведены под чужими slug: по адресу
    // /fighters/kristof-dzhotko отдавался Майк Малотт. Slug исправлены в базе,
    // а старые адреса Google уже проиндексировал — уводим их 301-м, чтобы
    // не терять накопленный вес и не плодить 404.
    const renamedFighterSlugs: Record<string, string> = {
      "kristof-dzhotko": "mike-malott",
      "kori-makkenna-6": "jasmine-jasudavicius",
      "kori-makkenna-7": "julia-polastri",
      "aleks-oliveyra-2": "mitch-raposo",
      "shiyunia-tafua": "junior-tafa",
      "lyudovit-klayn-1": "daniel-barez"
    };

    return Object.entries(renamedFighterSlugs).flatMap(([from, to]) =>
      ["/ru", "/en", ""].map((prefix) => ({
        source: `${prefix}/fighters/${from}`,
        destination: `${prefix}/fighters/${to}`,
        permanent: true
      }))
    );
  },
  async headers() {
    const isDev = process.env.NODE_ENV === "development";

    const csp = isDev ? "" : [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://mc.yandex.ru",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://dmxg5wxfqgb4u.cloudfront.net https://*.ufc.com https://ufc.com https://images.tapology.com https://www1-cdn.sherdog.com https://ss.sport-express.net https://www.sport-express.net https://upload.wikimedia.org https://www.sports.ru https://storage.yandexcloud.net https://cdn.vox-cdn.com https://mmajunkie.usatoday.com https://mc.yandex.ru",
      "font-src 'self'",
      "connect-src 'self' https://mc.yandex.ru",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join("; ");

    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }
    ];

    if (csp) {
      securityHeaders.push({ key: "Content-Security-Policy", value: csp });
    }

    return [
      {
        source: "/(.*)",
        headers: securityHeaders
      }
    ];
  }
};

export default nextConfig;
