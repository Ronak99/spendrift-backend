/**
 * Sentry bootstrap, loaded via `node --import ./dist/instrument.js` BEFORE
 * dist/index.js. Under ESM ("type": "module") Sentry's auto-instrumentation
 * has to register its import hooks before express is first imported; calling
 * Sentry.init() from inside index.ts is too late and yields the
 * "express is not instrumented" warning at startup.
 *
 * Keep this file's imports minimal — anything imported here is loaded before
 * instrumentation is in place.
 */
import { initDiagnostics } from "./diagnostics.js";

initDiagnostics();
