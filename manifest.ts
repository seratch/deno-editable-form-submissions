import { Manifest } from "deno-slack-sdk/mod.ts";
import { def as PostRequestMessage } from "./functions/post_request_message.ts";
import SubmitRequestWorkflow from "./workflows/submit_request.ts";

export default Manifest({
  name: "deno-editable-request",
  description: "Request workflow that enables submitters to delete",
  icon: "assets/default_new_app_icon.png",
  workflows: [SubmitRequestWorkflow],
  functions: [PostRequestMessage],
  outgoingDomains: [],
  // https://api.slack.com/scopes
  botScopes: [
    "commands",
    "chat:write",
    "chat:write.public",
    "channels:join",
    "channels:history",
  ],
});
