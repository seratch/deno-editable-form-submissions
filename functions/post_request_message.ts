import { DefineFunction, Schema } from "deno-slack-sdk/mod.ts";
import { SlackFunction } from "deno-slack-sdk/mod.ts";
import { Env } from "deno-slack-sdk/types.ts";

// Using a 3rd party Slack API client for even better typing and debug logging
import {
  AnySendableMessageBlock,
  MessageMetadata,
  SlackAPIClient,
} from "slack-web-api-client/mod.ts";

export const def = DefineFunction({
  callback_id: "post_request_message",
  title: "Post a request to channel",
  description: "Create a request message from submitted form",
  source_file: "functions/post_request_message.ts",
  input_parameters: {
    properties: {
      channel: { type: Schema.slack.types.channel_id },
      submitterId: { type: Schema.slack.types.user_id },
      description: { type: Schema.types.string },
    },
    required: ["submitterId", "channel", "description"],
  },
  output_parameters: {
    properties: {},
    required: [],
  },
});

export default SlackFunction(
  def,
  async ({ inputs, token, env }) => {
    const { channel, description, submitterId } = inputs;
    const client = buildSlackAPIClient(token, env);
    const joining = await client.conversations.join({
      channel: inputs.channel,
    });
    if (joining.error) {
      const botUserId = (await client.auth.test({})).user_id;
      await client.chat.postMessage({
        channel: inputs.channel,
        text:
          `Please invite this app's bot user <@${botUserId}> to this channel <#${inputs.channel}>`,
      });
      const error = `Failed to join a channel: <#${inputs.channel}>`;
      return { error };
    }
    const newMessage = await client.chat.postMessage({
      channel,
      ...buildMessage(description, submitterId),
    });
    if (newMessage.error) {
      const error =
        `Failed to post a message (channel: ${inputs.channel}, error: ${newMessage.error})`;
      return { error };
    }
    return { completed: false };
  },
).addBlockActionsHandler(
  ["edit-message"],
  async ({ token, env, body, inputs }) => {
    const client = buildSlackAPIClient(token, env);
    if (!body.message) {
      const error =
        `The "edit" button is unexpectedly positioned in the non-channel message user interface! (channel: ${inputs.channel})`;
      return { error };
    }
    const replies = await client.conversations.replies({
      channel: inputs.channel,
      ts: body.message.ts,
      inclusive: true,
      include_all_metadata: true,
      limit: 1,
    });
    if (replies.error || !replies.messages || !replies.messages[0].metadata) {
      const error =
        `Failed to access a message (channel: ${inputs.channel}, ts: ${body.message.ts})`;
      return { error };
    }
    // Validate if the user who clicked the button matches the one in message metadata
    if (
      replies.messages[0].metadata.event_type !== messageMetadataEventType ||
      // If you want to allow admin users too, you can save their user IDs in this app
      // and then customize this part using the set of IDs.
      replies.messages[0].metadata.event_payload?.submitterId !== body.user.id
    ) {
      const modal = await client.views.open({
        interactivity_pointer: body.interactivity.interactivity_pointer,
        view: {
          "type": "modal",
          "callback_id": "edit-message",
          "title": { "type": "plain_text", "text": "Permission denied" },
          "close": { "type": "plain_text", "text": "Close" },
          "blocks": [
            {
              "type": "section",
              "text": {
                "type": "mrkdwn",
                "text":
                  ":warning: Sorry! Only the person who submitted this request has the ability to edit or delete the posted message.",
              },
            },
          ],
        },
      });
      if (modal.error) {
        const error = `Failed to open a modal view (error: ${modal.error})`;
        return { error };
      }
      return { completed: false }; // continue with following interactions
    }
    const description = replies.messages[0].metadata.event_payload.description;
    const modal = await client.views.open({
      interactivity_pointer: body.interactivity.interactivity_pointer,
      view: {
        "type": "modal",
        "callback_id": "edit-message",
        "title": { "type": "plain_text", "text": "Edit/delete message" },
        "submit": { "type": "plain_text", "text": "Save" },
        "close": { "type": "plain_text", "text": "Close" },
        "private_metadata": JSON.stringify({
          channel: inputs.channel,
          ts: body.message.ts,
          submitterId: inputs.submitterId,
        }),
        "blocks": [
          {
            "type": "section",
            "text": { "type": "mrkdwn", "text": " " },
            "accessory": {
              "type": "button",
              "style": "danger",
              "text": { "type": "plain_text", "text": "Delete" },
              "value": body.message.ts,
              "action_id": "delete-message",
            },
          },
          {
            "type": "input",
            "block_id": "description",
            "element": {
              "type": "plain_text_input",
              "multiline": true,
              "action_id": "input",
              "initial_value": description,
            },
            "label": { "type": "plain_text", "text": "Description" },
          },
        ],
      },
    });
    if (modal.error) {
      const error = `Failed to open a modal view (error: ${modal.error})`;
      return { error };
    }
    return { completed: false }; // continue with following interactions
  },
).addBlockActionsHandler(
  ["delete-message"],
  async ({ token, env, inputs, action, body }) => {
    const client = buildSlackAPIClient(token, env);
    const deletion = await client.chat.delete({
      channel: inputs.channel,
      ts: action.value,
    });
    if (deletion.error) {
      return {
        error: `Failed to delete a message (error: ${deletion.error})`,
      };
    }
    if (body.view) {
      const modalUpdate = await client.views.update({
        view_id: body.view.id,
        view: {
          "type": "modal",
          "callback_id": "message-deleted",
          "title": { "type": "plain_text", "text": "Message deleted" },
          "close": { "type": "plain_text", "text": "Close" },
          "blocks": [
            {
              "type": "section",
              "text": {
                "type": "mrkdwn",
                "text": "The message has been deleted!",
              },
            },
          ],
        },
      });
      if (modalUpdate.error) {
        const error =
          `Failed to update a modal view (error: ${modalUpdate.error})`;
        return { error };
      }
    }
    // Since the message has been deleted, there is no need to continue with this step
    return { completed: true };
  },
).addViewSubmissionHandler(["edit-message"], async ({ token, env, body }) => {
  const client = buildSlackAPIClient(token, env);
  const { channel, ts, submitterId } = JSON.parse(body.view.private_metadata!);
  const description = body.view.state.values.description.input.value;
  const modification = await client.chat.update({
    channel,
    ts,
    ...buildMessage(description, submitterId),
  });
  if (modification.error) {
    const error = `Failed to modify a message (error: ${modification.error})`;
    return { error };
  }
  // This worklow may receive more button click requests even after this modification.
  // Therefore, you don't need to call functions.completeSuccess API here.

  return {}; // Close this modal view
});

// -----------------------
// Internal functions and constants

const messageMetadataEventType = "editable-workflow-message";

function buildSlackAPIClient(token: string, env: Env): SlackAPIClient {
  return new SlackAPIClient(token, {
    logLevel: env.DEBUG_MODE ? "DEBUG" : "INFO",
  });
}

function buildMessage(
  description: string,
  submitterId: string,
): {
  text: string;
  blocks: AnySendableMessageBlock[];
  metadata: MessageMetadata;
} {
  return {
    text: `*Description of the issue:*\n${description}\n\n`,
    blocks: [
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `*Description of the issue:*\n${description}\n\n`,
        },
        "accessory": {
          "type": "button",
          "text": { "type": "plain_text", "text": "Edit" },
          "value": "clicked",
          "action_id": "edit-message",
        },
      },
    ],
    metadata: {
      event_type: messageMetadataEventType,
      event_payload: { description, submitterId },
    },
  };
}
