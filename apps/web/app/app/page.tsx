import { isAuthenticatedNextjs } from "@convex-dev/auth/nextjs/server"
import { redirect } from "next/navigation"

import { DashboardClient } from "@/components/dashboard-client"

export default async function AppPage() {
  if (!(await isAuthenticatedNextjs())) {
    redirect("/login")
  }

  return <DashboardClient />
}
