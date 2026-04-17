import GitHub from "@auth/core/providers/github"
import Google from "@auth/core/providers/google"
import { convexAuth } from "@convex-dev/auth/server"

import { ROOT_DEFINITIONS, ROOT_ORDER } from "./lib/constants"

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Google({
      allowDangerousEmailAccountLinking: false,
      checks: ["pkce", "state"],
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email.toLowerCase(),
          image: profile.picture,
          emailVerified: profile.email_verified === true,
        }
      },
    }),
    GitHub({
      allowDangerousEmailAccountLinking: false,
      checks: ["pkce", "state"],
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      async userinfo({ provider, tokens }) {
        const profile = await fetch(provider.userinfo?.url as URL, {
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
            "User-Agent": "authjs",
          },
        }).then(async (response) => await response.json())

        const emailResponse = await fetch("https://api.github.com/user/emails", {
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
            "User-Agent": "authjs",
          },
        })

        if (emailResponse.ok) {
          const emails = (await emailResponse.json()) as Array<{
            email: string
            primary: boolean
            verified: boolean
          }>
          const primaryEmail = emails.find((entry) => entry.primary) ?? emails[0]
          if (primaryEmail) {
            profile.email = primaryEmail.email
            profile.email_verified = primaryEmail.verified
          }
        }

        return profile
      },
      profile(profile) {
        return {
          id: String(profile.id),
          name: profile.name ?? profile.login,
          email: typeof profile.email === "string" ? profile.email.toLowerCase() : undefined,
          image: profile.avatar_url,
          emailVerified: profile.email_verified === true,
        }
      },
    }),
  ],
  callbacks: {
    async redirect({ redirectTo }) {
      const siteUrl = requireEnv("SITE_URL")
      if (redirectTo.startsWith("?") || redirectTo.startsWith("/")) {
        return `${siteUrl}${redirectTo}`
      }

      if (isAllowedSiteRedirect(redirectTo, siteUrl) || isAllowedExtensionRedirect(redirectTo)) {
        return redirectTo
      }

      throw new Error(`Invalid redirect destination: ${redirectTo}`)
    },
    async afterUserCreatedOrUpdated(ctx, args) {
      const bookmarks = (await ctx.db.query("bookmarks").collect()).filter(
        (bookmark) => bookmark.userId === args.userId
      )

      const existingKeys = new Set(
        bookmarks
          .filter((bookmark) => !bookmark.deleted && bookmark.rootKey)
          .map((bookmark) => bookmark.rootKey)
      )

      for (const definition of ROOT_DEFINITIONS) {
        if (existingKeys.has(definition.key)) {
          continue
        }

        await ctx.db.insert("bookmarks", {
          userId: args.userId,
          title: definition.title,
          url: null,
          parentId: null,
          order: ROOT_ORDER[definition.key],
          type: "folder",
          updatedAt: Date.now(),
          deleted: false,
          rootKey: definition.key,
        })
      }
    },
  },
})

function requireEnv(name: "SITE_URL"): string {
  const value = process.env[name]?.replace(/\/$/, "")
  if (!value) {
    throw new Error(`Missing environment variable \`${name}\``)
  }

  return value
}

function isAllowedSiteRedirect(redirectTo: string, siteUrl: string): boolean {
  if (!redirectTo.startsWith(siteUrl)) {
    return false
  }

  const suffix = redirectTo.slice(siteUrl.length, siteUrl.length + 1)
  return suffix === "" || suffix === "/" || suffix === "?"
}

function isAllowedExtensionRedirect(redirectTo: string): boolean {
  let url: URL
  try {
    url = new URL(redirectTo)
  } catch {
    return false
  }

  if (url.protocol === "https:" && url.hostname.endsWith(".chromiumapp.org")) {
    return true
  }

  if (url.protocol === "https:" && url.hostname.endsWith(".extensions.allizom.org")) {
    return true
  }

  if (
    url.protocol === "http:" &&
    url.hostname === "127.0.0.1" &&
    url.pathname.startsWith("/mozoauth2/")
  ) {
    return true
  }

  return false
}
