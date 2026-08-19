#!/usr/bin/env node
import { buildRuntime, dispatch } from "../runtime.js";
import { isMainModule } from "./main-guard.js";

export async function main(argv: string[], env: NodeJS.ProcessEnv): Promise<number> {
  const actionId = argv[2] ?? env.HERDR_PLUGIN_ACTION_ID ?? "";
  return dispatch(actionId, buildRuntime(env));
}

if (isMainModule(import.meta.url)) {
  process.exit(await main(process.argv, process.env));
}
