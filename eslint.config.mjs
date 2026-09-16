import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    "playwright-report/**",
    "test-results/**",
  ]),

  // Playwright 픽스처의 콜백 인자 이름이 use 라서 react-hooks 규칙이 훅으로 오해한다.
  // e2e 디렉터리에는 React 가 없으므로 이 규칙만 끈다.
  {
    files: ["e2e/**/*.ts"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
]);

export default eslintConfig;
