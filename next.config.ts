import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pdf-parse", "mammoth", "yauzl"],
  outputFileTracingIncludes: {
    "/api/v1/*": [
      "./node_modules/pdf-parse/**/*",
      "./node_modules/@napi-rs/canvas/**/*",
      "./node_modules/@napi-rs/canvas-*/**/*",
      "./node_modules/pdfjs-dist/**/*",
      "./node_modules/mammoth/**/*",
      "./node_modules/@xmldom/xmldom/**/*",
      "./node_modules/mammoth/node_modules/argparse/**/*",
      "./node_modules/sprintf-js/**/*",
      "./node_modules/base64-js/**/*",
      "./node_modules/dingbat-to-unicode/**/*",
      "./node_modules/jszip/**/*",
      "./node_modules/lie/**/*",
      "./node_modules/immediate/**/*",
      "./node_modules/pako/**/*",
      "./node_modules/jszip/node_modules/readable-stream/**/*",
      "./node_modules/core-util-is/**/*",
      "./node_modules/inherits/**/*",
      "./node_modules/jszip/node_modules/isarray/**/*",
      "./node_modules/process-nextick-args/**/*",
      "./node_modules/jszip/node_modules/safe-buffer/**/*",
      "./node_modules/util-deprecate/**/*",
      "./node_modules/setimmediate/**/*",
      "./node_modules/lop/**/*",
      "./node_modules/duck/**/*",
      "./node_modules/underscore/**/*",
      "./node_modules/option/**/*",
      "./node_modules/xmlbuilder/**/*",
      "./node_modules/yauzl/**/*",
      "./node_modules/pend/**/*",
    ],
  },
  distDir: process.env.PDH_TEST_DIST_DIR ?? ".next",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src 'self' 'unsafe-inline' ${process.env.NODE_ENV === "development" ? "'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
          },
        ],
      },
      ...["/invite", "/reset-password", "/forgot-password"].map((source) => ({
        source,
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      })),
      {
        source: "/auth/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};
export default config;
