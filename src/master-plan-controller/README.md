# MASTER_PLAN controller

This component runs the bounded strategy controller and its Guardian communication channel. The
canonical operating model is in [OPERATIONS](../../docs/OPERATIONS.md); this page is the practical
setup guide for connecting a Slack workspace.

## What is already in the repository

- `guardian-cycle.yml` runs the Guardian every hour and accepts optional `sender` and `message`
  workflow-dispatch inputs.
- `strategy/guardian-inbox.json` holds queued messages; `guardian-questions.json` holds bounded
  human questions; `guardian-updates.json` holds progress and replies until delivery succeeds.
- `SLACK_WEBHOOK_URL`, when configured as a GitHub Actions secret, publishes undelivered Guardian
  updates to Slack without blocking strategy work if Slack is unavailable.
- `npm run guardian:status` answers the current operational status; `help`, a normal message, and
  `answer <question-id> <text>` are handled by the communication layer.

The repository deliberately does **not** contain a public web service or workspace credentials.
Those belong to your deployment environment, not to Git history.

## Slack setup checklist

Complete these in order.

1. In Slack, create an app for this workspace and give it a clear name such as `MASTER_PLAN
   Guardian`.
2. Enable **Incoming Webhooks**, add one for the channel where progress updates should appear, and
   copy the generated webhook URL.
3. In GitHub, open this repository’s **Settings → Secrets and variables → Actions**, create a secret
   named `SLACK_WEBHOOK_URL`, and paste the webhook URL. Never commit it or place it in workflow
   output.
4. Create a small public **slash command relay** for `/guardian`. Its request URL is the only public
   service required. Configure the relay with the Slack app’s signing secret and verify every raw
   Slack request signature and timestamp before processing it.
5. Give that relay a GitHub fine-grained token limited to this repository with **Actions: write**.
   Store it in the relay’s secret manager, not in this repository or Slack message text.
6. Make the relay send ordinary Slack messages to GitHub’s workflow-dispatch endpoint:

   ```text
   POST /repos/rookdaemon/MASTER_PLAN/actions/workflows/guardian-cycle.yml/dispatches
   {
     "ref": "main",
     "inputs": {
       "sender": "<Slack user ID>",
       "message": "<the slash-command text>"
     }
   }
   ```

7. Have the relay respond to Slack immediately: `status` and `help` return an operational answer;
   any other text returns “Queued for the next Guardian cycle.” It should forward
   `answer <question-id> <text>` unchanged. The workflow begins straight away after dispatch, and
   the Guardian’s fuller reply is posted through the incoming webhook.
8. Configure the slash command in Slack with the relay’s HTTPS URL, install the app into the
   workspace, and restrict command use to the people or channels you intend to operate it.

Slack’s signing-secret verification and request-URL contract are documented by Slack, while the
workflow-dispatch endpoint and its required Actions permission are documented by GitHub:

- [Verify requests from Slack](https://docs.slack.dev/authentication/verifying-requests-from-slack/)
- [Create a workflow dispatch event](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event)

## Test before connecting Slack

First validate the repository-side path without workspace credentials:

```bash
npm run guardian:status
gh workflow run guardian-cycle.yml --ref main --raw-field sender=U_TEST --raw-field message="status"
```

Then confirm that the workflow completes and that `strategy/guardian-updates.json` receives one
explanatory cycle summary. After `SLACK_WEBHOOK_URL` is configured, the next successful cycle delivers
all pending updates and marks them delivered. Test `/guardian help`, a normal message, and a bounded
answer to an actual Guardian question.

## Relay responsibilities

The relay is intentionally thin. It verifies Slack requests, provides the two immediate operational
responses, and dispatches the workflow. It must not interpret a message as approval, consent,
credential sharing, or a constitutional amendment. The Guardian records those messages as input and
only asks questions when the controller has an exceptional, intrinsically human boundary.
