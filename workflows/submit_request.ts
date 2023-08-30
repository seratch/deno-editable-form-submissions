import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { def as PostRequestMessage } from "../functions/post_request_message.ts";

const workflow = DefineWorkflow({
  callback_id: "submit-editable-request",
  title: "Submit an editable request",
  input_parameters: {
    properties: {
      interactivity: { type: Schema.slack.types.interactivity },
      channel: { type: Schema.slack.types.channel_id },
    },
    required: ["channel", "interactivity"],
  },
});

const inputForm = workflow.addStep(
  Schema.slack.functions.OpenForm,
  {
    title: "Submit a request",
    interactivity: workflow.inputs.interactivity,
    submit_label: "Submit",
    fields: {
      elements: [
        {
          name: "description",
          title: "Description",
          type: Schema.types.string,
          long: true,
        },
      ],
      required: ["description"],
    },
  },
);

workflow.addStep(
  PostRequestMessage,
  {
    submitterId: inputForm.outputs.interactivity.interactor.id,
    channel: workflow.inputs.channel,
    description: inputForm.outputs.fields.description,
  },
);

export default workflow;
