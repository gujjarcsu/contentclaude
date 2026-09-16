/**
 * This is intended to be a basic starting point for linting in your app.
 * It relies on recommended configs out of the box for simplicity, but you can
 * and should modify this configuration to best suit your team's needs.
 */

/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
  },
  env: {
    browser: true,
    commonjs: true,
    es6: true,
  },
  ignorePatterns: ["!**/.server", "!**/.client"],

  // Base config
  extends: ["eslint:recommended"],

  overrides: [
    // React
    {
      files: ["**/*.{js,jsx,ts,tsx}"],
      plugins: ["react", "jsx-a11y"],
      extends: [
        "plugin:react/recommended",
        "plugin:react/jsx-runtime",
        "plugin:react-hooks/recommended",
        "plugin:jsx-a11y/recommended",
      ],
      settings: {
        react: {
          version: "detect",
        },
        formComponents: ["Form"],
        linkComponents: [
          { name: "Link", linkAttribute: "to" },
          { name: "NavLink", linkAttribute: "to" },
        ],
        "import/resolver": {
          typescript: {},
        },
      },
      rules: {
        "react/no-unknown-property": ["error", { ignore: ["variant"] }],
        // JS project — prop-types is noisy; type safety via Polaris contracts + server validation
        "react/prop-types": "off",
        // Apostrophes/quotes in JSX text nodes are fine as-is
        "react/no-unescaped-entities": "off",
      },
    },

    // Phase 16 — IMPORT ATTRIBUTES. `app/i18n/` loads JSON with
    // `with { type: "json" }`, which is what Node's own ESM loader requires and
    // what the WORKER process uses (fly.toml runs `node worker.js`, which
    // imports the source tree rather than the Vite bundle). Without the
    // attribute the weekly report threw on every 60-second tick for weeks.
    //
    // ESLint 8.57's parser is espree 9.6, which cannot parse the syntax at any
    // `ecmaVersion` — "latest" caps at ES2024 and import attributes are ES2025.
    // `@typescript-eslint/parser` is already a dependency of this config, is
    // already the parser for every .ts file here, and reads the syntax fine via
    // the installed TypeScript 5.9. So these two files borrow it rather than the
    // repo taking a new devDependency for a lint-only problem. When ESLint
    // moves to 9, this override can go.
    {
      files: ["app/i18n/**/*.js"],
      parser: "@typescript-eslint/parser",
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
    },

    // Typescript
    {
      files: ["**/*.{ts,tsx}"],
      plugins: ["@typescript-eslint", "import"],
      parser: "@typescript-eslint/parser",
      settings: {
        "import/internal-regex": "^~/",
        "import/resolver": {
          node: {
            extensions: [".ts", ".tsx"],
          },
          typescript: {
            alwaysTryTypes: true,
          },
        },
      },
      extends: [
        "plugin:@typescript-eslint/recommended",
        "plugin:import/recommended",
        "plugin:import/typescript",
      ],
    },

    // Node
    {
      files: [
        ".eslintrc.cjs",
        "vite.config.{js,ts}",
        ".graphqlrc.{js,ts}",
        "shopify.server.{js,ts}",
        "**/*.server.{js,ts}",
        "screenshots/**/*.js",
      ],
      env: {
        node: true,
      },
    },
  ],
  globals: {
    shopify: "readonly",
    // Node.js globals available in all server-side files
    process: "readonly",
    Buffer: "readonly",
    globalThis: "readonly",
    // ES2020 globals not covered by es6 env
    BigInt: "readonly",
  },
  rules: {
    // JS project — prop-types is noisy without TypeScript.
    // Type safety is enforced by Polaris component contracts + server validation.
    "react/prop-types": "off",
  },
};
