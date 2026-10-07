import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/*
  adli/no-session-in-cache: a "use cache" result is shared by every visitor, so a file that caches anything must
  not import what reads the session (cookies, the cookie-based Supabase clients, the auth guards). Cached reads use
  src/lib/supabase/public.ts. "use cache: private" is per visitor and is allowed to read cookies.
*/
const SESSION_MODULES = ["next/headers", "@/lib/supabase/server", "@/lib/supabase/client", "@/lib/auth/guards"];

const adli = {
  rules: {
    "no-session-in-cache": {
      meta: {
        type: "problem",
        messages: {
          session:
            "«{{source}}» reads the session, and this file has \"use cache\": the cached result would be shared by everyone. Read through @/lib/supabase/public, or move the session read out of this file.",
        },
        schema: [],
      },
      create(context) {
        const imports = [];
        let cached = false;
        return {
          ImportDeclaration(node) {
            if (SESSION_MODULES.includes(node.source.value)) imports.push(node);
          },
          "ExpressionStatement[directive]"(node) {
            if (/^use cache(: *remote)?$/.test(node.directive.trim())) cached = true;
          },
          "Program:exit"() {
            if (!cached) return;
            for (const node of imports) context.report({ node, messageId: "session", data: { source: node.source.value } });
          },
        };
      },
    },
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { adli },
    rules: { "adli/no-session-in-cache": "error" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
