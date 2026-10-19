import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";
import globals from "globals";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The service worker is plain JavaScript running in the service-worker scope.
    files: ["public/sw.js"],
    languageOptions: {
      sourceType: "script",
      globals: { ...globals.serviceworker },
    },
  },
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "supabase/.temp/**",
    "src/lib/supabase/database.types.ts",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
