import { Trigger } from "deno-slack-sdk/types.ts";
import { TriggerContextData, TriggerTypes } from "deno-slack-api/mod.ts";
import workflow from "../workflows/submit_request.ts";

const trigger: Trigger<typeof workflow.definition> = {
  type: TriggerTypes.Shortcut,
  name: "Submit an editable request",
  description: "Submit an editable request to the channel",
  workflow: `#/workflows/${workflow.definition.callback_id}`,
  inputs: {
    interactivity: { value: TriggerContextData.Shortcut.interactivity },
    channel: { value: TriggerContextData.Shortcut.channel_id },
  },
};

export default trigger;
