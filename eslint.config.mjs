// eslint.config.mjs — ESLint 9 flat config for Next.js 16
import nextConfig from "eslint-config-next";

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
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
