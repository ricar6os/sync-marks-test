import type { AuthConfig } from "convex/server"

export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL as string,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig
