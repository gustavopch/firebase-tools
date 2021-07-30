// This is an independently executed script that parses triggers
// from a functions package directory.
"use strict";

var extractTriggers = require("./extractTriggers");
var EXIT = function () {
  process.exit(0);
};

/**
 * Dynamically load import function to prevent TypeScript from
 * transpiling into a require.
 *
 * See https://github.com/microsoft/TypeScript/issues/43329.
 */
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const dynamicImport = new Function("modulePath", "return import(modulePath)");

async function loadModule(packageDir) {
  try {
    return require(packageDir);
  } catch (e) {
    if (e.code === "ERR_REQUIRE_ESM") {
      const mod = await dynamicImport(require.resolve(packageDir));
      return mod;
    }
    throw e;
  }
}

(async function () {
  if (!process.send) {
    console.warn("Could not parse function triggers (process.send === undefined).");
    process.exit(1);
  }

  // wrap in function to allow return without exiting process
  var packageDir = process.argv[2];
  if (!packageDir) {
    process.send({ error: "Must supply package directory for functions trigger parsing." }, EXIT);
    return;
  }

  var mod;
  var triggers = [];
  try {
    mod = await loadModule(packageDir);
  } catch (e) {
    if (e.code === "MODULE_NOT_FOUND") {
      process.send(
        {
          error:
            "Error parsing triggers: " +
            e.message +
            '\n\nTry running "npm install" in your functions directory before deploying.',
        },
        EXIT
      );
      return;
    }
    if (/Firebase config variables are not available/.test(e.message)) {
      process.send(
        {
          error:
            "Error occurred while parsing your function triggers. " +
            'Please ensure you have the latest firebase-functions SDK by running "npm i --save firebase-functions@latest" inside your functions folder.\n\n' +
            e.stack,
        },
        EXIT
      );
      return;
    }

    process.send(
      {
        error: "Error occurred while parsing your function triggers.\n\n" + e.stack,
      },
      EXIT
    );
    return;
  }

  try {
    extractTriggers(mod, triggers);
  } catch (err) {
    if (/Maximum call stack size exceeded/.test(err.message)) {
      process.send(
        {
          error:
            "Error occurred while parsing your function triggers. Please ensure that index.js only " +
            "exports cloud functions.\n\n",
        },
        EXIT
      );
      return;
    }
    process.send({ error: err.message }, EXIT);
  }

  let spec = null;
  try {
    const optsModule = await loadModule("firebase-functions/v2/options");
    if (optsModule && optsModule.__getSpec) {
      spec = optsModule.__getSpec();
    }
  } catch (e) {
    process.send({ error: e.message }, EXIT);
  }
  process.send({ triggers: triggers, spec }, EXIT);
})();
