# Recurring task scheduler

Recurring tasks are advanced by the trusted Netlify scheduled function
`netlify/functions/recurring-task-reset.ts`. The browser does not perform
recurrence maintenance.

## Production configuration

1. Set `FIREBASE_SERVICE_ACCOUNT` in the Netlify site's environment variables
   to the Firebase service-account JSON for the production project.
2. Deploy the site from a branch containing the schedule in `netlify.toml`.
   Scheduled functions run only on published production deploys, not Deploy
   Previews.
3. Confirm **Functions > recurring-task-reset** shows the
   `15 0 * * *` schedule. This runs daily at 00:15 UTC. Cycle boundaries are
   calculated in `Asia/Jerusalem`, including daylight-saving and year changes.
4. Grant the service account permission to read and update `tasks` and to write
   `systemJobs/recurringTaskReset`.
5. Keep the Netlify build runtime on Node.js 22 or newer, as configured in
   `netlify.toml` and required by the installed Firebase Admin SDK.

Each run writes its state and counts to `systemJobs/recurringTaskReset`.
Netlify function logs also contain an explicit success summary or failure.
Configure a Netlify log drain or function-failure alert for production
notification.

The job reads task IDs in pages of 400 and applies each page in a Firestore
transaction. Firestore retries a page when a task changes concurrently. A task
updated after the run starts keeps its current status while still advancing its
cycle key, so a concurrent completion is not reverted. A legacy or newly
created task without a cycle key is bootstrapped without reopening it when its
last update belongs to the current recurrence cycle.
