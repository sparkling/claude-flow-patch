#!/usr/bin/env node
// Thin shim — delegates to the full hook-handler in the npm package.
// This file is kept local so Claude Code's hook config can reference it by path.
process.env.__GUIDANCE_HELPERS_DIR = process.env.__GUIDANCE_HELPERS_DIR || __dirname;
require('@sparkleideas/claude-flow-guidance/hook-handler');
