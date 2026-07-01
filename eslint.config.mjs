// eslint.config.mjs — ESLint 9 flat config for Next.js 16
import nextConfig from "eslint-config-next";

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  // Reference-only vendored repos — never linted or bundled by Lospia.
  { ignores: ["example/**", ".next/**", "node_modules/**"] },
  ...nextConfig,
  {
    // Override rules from next config without adding new plugins
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "off",
    },
  },
];

export default eslintConfig;
