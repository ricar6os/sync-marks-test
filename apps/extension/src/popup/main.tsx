import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"

import { PopupApp } from "./app"

const container = document.getElementById("root")

if (!container) {
  throw new Error("Missing popup root container")
}

createRoot(container).render(
  <StrictMode>
    <PopupApp />
  </StrictMode>
)
