import tseslint from "typescript-eslint";

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    rules: {
      // Allow unused vars prefixed with _, and unused rest-destructuring
      // siblings (e.g. `const { config: _drop, ...rest } = cfg` to omit a key)
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
  {
    ignores: ["dist/", "website/"],
  },
);
