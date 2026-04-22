import { execSync } from "child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function gitInfo() {
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
    const commit = execSync("git rev-parse --short HEAD").toString().trim();
    return { branch, commit };
  } catch {
    return { branch: "unknown", commit: "unknown" };
  }
}

const { branch, commit } = gitInfo();

export default defineConfig({
  plugins: [react()],
  base: process.env.NODE_ENV === "production" ? "/TeslaPricing/" : "/",
  define: {
    __GIT_BRANCH__: JSON.stringify(branch),
    __GIT_COMMIT__: JSON.stringify(commit),
  },
  server: {
    port: 5173,
  },
});
