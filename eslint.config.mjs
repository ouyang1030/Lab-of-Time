import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    "dist/**",
    ".vinext/**",
    ".wrangler/**",
    ".sites-runtime/**",
    "outputs/**",
    "work/**",
  ]),
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "@next/next/no-html-link-for-pages": "off",
      "@next/next/no-img-element": "off",
    },
  },
]);

export default eslintConfig;
