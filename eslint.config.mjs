import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Nothing in the web bundle's static graph may reach `@tauri-apps/*` (§ Desktop shell).
 * Static imports are forbidden everywhere (type-only imports are erased and allowed);
 * `import()` inside a function is allowed only where the desktop code lives. The same
 * rule is enforced without lint by `src/test/tauriImports.test.ts`.
 */
const TAURI_DYNAMIC_ALLOWED = ["src/platform/**", "src/desktop/**", "src/storage/fileStore.ts"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^@tauri-apps/",
              allowTypeImports: true,
              message:
                "Static @tauri-apps imports reach the web bundle. Use `await import()` inside a function behind isDesktop(), in src/platform or src/desktop.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: TAURI_DYNAMIC_ALLOWED,
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportExpression[source.value=/^@tauri-apps\\//]",
          message: "Reach Tauri through src/platform or src/desktop, never from here.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src-tauri/target/**",
  ]),
]);

export default eslintConfig;
