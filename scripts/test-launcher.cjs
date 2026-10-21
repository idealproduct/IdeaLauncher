const { readFileSync } = require("node:fs");
const ts = require("typescript");

// Use the project's existing TypeScript compiler; no additional test dependency.
require.extensions[".ts"] = (module, filename) => {
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(outputText, filename);
};
require("../tests/launcher.test.ts");
require("../tests/content.test.ts");
require("../tests/downloads.test.ts");
require("../tests/fabric.test.ts");
