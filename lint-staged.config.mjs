const quotePath = (filePath) => `"${filePath.replace(/"/g, '\\"')}"`;

const buildFileArgs = (files) => files.map(quotePath).join(" ");

export default {
  "apps/api/**/*.{ts,tsx}": (files) =>
    `npm exec --workspace api -- eslint --fix -- ${buildFileArgs(files)}`,
  "apps/web/**/*.{js,jsx,ts,tsx}": (files) =>
    `npm exec --workspace web -- eslint --fix -- ${buildFileArgs(files)}`,
  "packages/shared/**/*.ts": () => "npm run lint:shared",
  "lint-staged.config.mjs": (files) =>
    files.map((file) => `node --check ${quotePath(file)}`),
  "scripts/**/*.mjs": (files) =>
    files.map((file) => `node --check ${quotePath(file)}`),
};
