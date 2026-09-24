import { withSentryConfig } from "@sentry/nextjs";
import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship raw TS source.
  transpilePackages: [
    "@training/api",
    "@training/ai",
    "@training/config",
    "@training/db",
    "@training/domain",
  ],
  webpack: (config, { isServer }) => {
    // Copies Prisma's query engine into the serverless bundle.
    // Required because Next.js's output file tracing does not follow
    // pnpm's symlinked node_modules layout in a monorepo.
    if (isServer) {
      config.plugins = [...config.plugins, new PrismaPlugin()];
    }
    return config;
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
});