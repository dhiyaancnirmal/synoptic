import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const config = [
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/coverage/**",
      "**/prisma/*.js",
      "**/prisma/*.js.map",
      "**/prisma/*.d.ts",
      "packages/contracts/artifacts/**",
      "packages/contracts/cache/**",
      "packages/contracts/typechain-types/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      parserOptions: {
        projectService: true
      },
      globals: {
        ...globals.node
      }
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off"
    }
  },
  {
    files: [
      "apps/dashboard/app/**/*.{tsx,ts}",
      "apps/dashboard/components/**/*.{tsx,ts}"
    ],
    ignores: ["apps/dashboard/app/api/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message:
            "Use dashboard API clients in apps/dashboard/lib/api instead of direct fetch in UI routes/components."
        }
      ]
    }
  }
];

export default config;
