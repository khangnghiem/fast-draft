#!/usr/bin/env node
import { runObserverDumpCli } from "../.opencode/plugins/agent-observer/dump.js";

const exitCode = await runObserverDumpCli(process.argv.slice(2));
process.exit(exitCode);
