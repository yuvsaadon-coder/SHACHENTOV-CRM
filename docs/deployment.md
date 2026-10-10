# Deployment

Netlify and local/CI tooling use Node.js 22.23.2, matching the `package.json`
engine. This satisfies `firebase-admin` 14's Node.js 22 or newer requirement
while keeping builds reproducible.

`shachentovcrmsource.zip` was removed because it was an outdated generated copy
of files already tracked by Git, including local-only configuration. It was not
read or loaded by the application or Netlify at runtime. Git remains the source
of truth, and `.gitignore` prevents the bundle from being committed again.
