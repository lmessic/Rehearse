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
    // public 下是第三方静态资源（含由 node_modules 复制来的 pdfjs worker），不参与 lint
    "public/**",
  ]),
  {
    // src/utils 是手写练习代码，刻意模仿原生实现（bind / call / apply / 深拷贝），
    // 因此保留 any、this 别名与 arguments 的写法。这不影响应用代码的规则。
    files: ["src/utils/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-this-alias": "off",
      "prefer-rest-params": "off",
    },
  },
]);

export default eslintConfig;
