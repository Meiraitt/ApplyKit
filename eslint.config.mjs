import tseslint from "typescript-eslint";
import stylistic from "@stylistic/eslint-plugin";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "data/**",
      "runtime/**",
      "release/**",
      ".maintenance/**",
      "**/coverage/**",
    ],
  },
  {
    files: ["**/*.{ts,tsx,js,mjs}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "@stylistic": stylistic },
    rules: {
      "@stylistic/padding-line-between-statements": [
        "error",
        {
          blankLine: "always",
          prev: "*",
          next: [
            "return",
            "throw",
            "function",
            "class",
            "export",
            "if",
            "for",
            "while",
            "switch",
            "try",
          ],
        },
        {
          blankLine: "always",
          prev: [
            "import",
            "const",
            "let",
            "var",
            "block-like",
            "multiline-expression",
          ],
          next: "*",
        },
        {
          blankLine: "any",
          prev: ["const", "let", "var"],
          next: ["const", "let", "var"],
        },
        { blankLine: "never", prev: "import", next: "import" },
      ],
      "@stylistic/no-multiple-empty-lines": [
        "error",
        { max: 1, maxBOF: 0, maxEOF: 0 },
      ],
    },
  },
];
