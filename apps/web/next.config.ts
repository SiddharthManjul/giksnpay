import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    const apiOrigin = process.env.NEXT_PUBLIC_MINDPAY_API_URL ?? "http://localhost:8787";
    const socketOrigin = apiOrigin.replace(/^http/u, "ws");
    const scriptPolicy = [
      "'self'",
      "'unsafe-inline'",
      ...(process.env.NODE_ENV === "development" ? ["'unsafe-eval'"] : []),
      "https://checkout.razorpay.com",
    ].join(" ");
    return [
      {
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              `connect-src 'self' ${apiOrigin} ${socketOrigin} https://*.razorpay.com wss://*.razorpay.com`,
              "font-src 'self' data:",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "frame-src https://api.razorpay.com https://*.razorpay.com",
              "img-src 'self' data: https://*.razorpay.com",
              "object-src 'none'",
              `script-src ${scriptPolicy}`,
              "style-src 'self' 'unsafe-inline'",
            ].join("; "),
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), payment=(), publickey-credentials-create=(self), publickey-credentials-get=(self)",
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
        source: "/:path*",
      },
    ];
  },
  reactStrictMode: true,
};

export default nextConfig;
