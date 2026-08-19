#!/usr/bin/env node
import { asObject, asString, parseJsonObject } from "../json.js";
import { ReviewIndex } from "../review-index.js";
import { isMainModule } from "./main-guard.js";

/**
 * Runs once per `pane.closed`/`pane.exited` event. herdr has no persistent subscription a plugin
 * can hold open for panes it doesn't yet know the id of, so the manifest's `[[events]]` hooks spawn
 * this as a short-lived process per event, reading the payload from `HERDR_PLUGIN_EVENT_JSON`
 * (confirmed shape: `{ event: "pane_closed", data: { type, pane_id, workspace_id } }`).
 *
 * Clears stale pane tracking so a later `review`/`review:pr` call doesn't think a since-closed
 * pane is still there to reuse — there was previously no cleanup hook at all, flagged by a real
 * Codex review of this exact plugin's code.
 */
export function main(env: NodeJS.ProcessEnv): number {
  const event = parseJsonObject(env.HERDR_PLUGIN_EVENT_JSON);
  const data = asObject(event?.data);
  const paneId = asString(data?.pane_id);
  if (!paneId) return 0;

  const stateDir = env.HERDR_PLUGIN_STATE_DIR ?? ".";
  new ReviewIndex(stateDir).clearPaneById(paneId);
  return 0;
}

if (isMainModule(import.meta.url)) {
  process.exit(main(process.env));
}
