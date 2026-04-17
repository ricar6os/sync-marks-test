import browser from "webextension-polyfill"

export const extensionBrowser = browser

export async function broadcastMessage(message: unknown): Promise<void> {
  try {
    await extensionBrowser.runtime.sendMessage(message)
  } catch {
    // Ignored when there are no active listeners.
  }
}

export function getIdentityRedirectURL(): string {
  if (!extensionBrowser.identity?.getRedirectURL) {
    throw new Error("Browser identity API is unavailable in this extension context.")
  }

  return extensionBrowser.identity.getRedirectURL()
}

export async function launchWebAuthFlow(details: {
  interactive: boolean
  url: string
}): Promise<string> {
  if (!extensionBrowser.identity?.launchWebAuthFlow) {
    throw new Error("Browser identity API is unavailable in this extension context.")
  }

  try {
    const redirectUrl = await extensionBrowser.identity.launchWebAuthFlow(details)
    if (!redirectUrl) {
      throw new Error("OAuth flow returned an empty redirect URL.")
    }

    return redirectUrl
  } catch (caughtError) {
    throw new Error(getIdentityErrorMessage(caughtError))
  }
}

function getIdentityErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "OAuth flow failed"
  const lower = message.toLowerCase()

  if (
    lower.includes("user cancelled") ||
    lower.includes("user canceled") ||
    lower.includes("authorization page could not be loaded") ||
    lower.includes("the user aborted")
  ) {
    return "Sign-in was cancelled before it finished."
  }

  return message
}
