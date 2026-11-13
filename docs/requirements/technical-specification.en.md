# Shachentov CRM — Technical Specification

> Source: [Claude Artifact](https://claude.ai/code/artifact/39111d83-93a9-458a-8a9e-ba6d2b66d203)  
> Source version: v1.0, September 2026  
> Repository ingestion date: September 6, 2026  
> Source audience: Engineering  
> Source classification: Confidential  
> Hebrew source capture: [technical-specification.he.md](technical-specification.he.md)  
> Note: This document preserves the source specification. It describes both desired behavior and claims about the current state; every claim must be verified against the code, configuration, and production environment.

## 1. System Architecture

The system is described as a full SPA without a persistent application server, backed by Firebase BaaS:

- React 19 and React Router 7 in the browser.
- Tailwind CSS v4 for styling.
- Firebase SDK v12 for Firestore, authentication, and storage access.
- `onSnapshot` for real-time updates.
- Firebase Auth for authentication.
- Firebase Storage for file attachments.
- Netlify Functions for logic requiring a server context.
- Firebase Admin SDK for token verification and authorized calls.
- Anthropic Claude API for AI capabilities.

There is no Server-Side Rendering. Netlify serves `dist/index.html`, and SPA routing is handled by a catch-all redirect placed after the function routes.

## 2. Technology Stack

| Area | Technology | Specification Intent |
|---|---|---|
| Runtime | React 19 | CSR only |
| Language | TypeScript 6 | `strict: true`, without `any` in core types |
| Build | Vite 8 + Rolldown | HMR in development; TypeScript errors block the build |
| Styling | Tailwind CSS v4 | Custom tokens through `@theme` |
| Database | Cloud Firestore | NoSQL document model and real-time updates |
| Authentication | Firebase Auth | Email/password and ID tokens |
| Files | Firebase Storage | File attachments with metadata in Firestore |
| Serverless | Netlify Functions | Node.js 20 and esbuild |
| AI | Anthropic Claude | Server-side proxy only |
| Drag and Drop | `@dnd-kit` | Accessible Kanban |
| Calendar | `react-big-calendar` | Month, week, and day views |
| Hebrew holidays | `@hebcal/core` | Task scheduling relative to holidays |

## 3. Hosting and Deployment

- Hosted on Netlify.
- Every push to the designated branch triggers a build.
- Pull Request Preview Deploys serve as the pre-production environment.
- Build command: `npm run build`, which runs `tsc -b && vite build`.
- Node.js 20.
- Netlify Functions are bundled with esbuild.
- `/.netlify/functions/*` routes must appear before the SPA catch-all.
- Secrets are managed through Netlify Environment Variables.
- The specification identifies an extended timeout for AI endpoints.
- There is no separate permanent staging environment.

## 4. Authentication and RBAC

After Firebase login, the client reads `users/{uid}` and derives the user's role from it.

| Role | Access Surface |
|---|---|
| `admin` | Full CRM and admin pages |
| `CEO`, `JLM`, `SUP`, `FIN`, `DON`, `DES`, `PUB`, `VOL` | CRM without admin pages, with a domain-filtered default view |
| `coordinator` | `/portal/*` only |

Coordinators sign in through `portal-login`, which receives a name and phone number, validates them against Firestore, and issues a Firebase Custom Token.

Client-side route guards:

- An unauthenticated user is redirected to `/login`.
- A coordinator is redirected to `/portal/home`.
- A headquarters user enters the CRM route tree.

Actual authorization must also be enforced in Firestore rules, Storage rules, and server functions; client-side guards are not a security boundary.

## 5. Data Model

| Collection | Core Fields | Subcollections / Notes |
|---|---|---|
| `users/{uid}` | `name`, `email`, `role`, `branchId`, `active` | `personalTasks`; the role drives RBAC |
| `tasks/{id}` | `domain`, `category`, `title`, `steps`, `frequency`, `startDate`, `endDate`, `status`, `cycleKey`, `involved[]`, `contactRefs[]`, `dependsOn[]`, `parentTaskId`, `attachmentCount` | `attachments`, `comments`, `history` |
| `contacts/{id}` | `name`, `type`, `domainTags[]`, `phone`, `email`, `organization`, `role`, `category`, `needsInfo` | Linked to tasks through `contactRefs[]` |
| `roles/{id}` / `orgRoles/{id}` | `roleName`, `level`, `area`, `holderName`, `status`, `priority`, `recruitmentUrgency`, `linkedTaskIds[]`, `delegatedTo`, `volunteerInfo` | The collection name must be decided and standardized |
| `branches/{id}` | `name`, `type`, `city`, `coordinatorUids[]`, `distributionFrequency`, `weeklyBaskets`, `monthlyBaskets`, `address` | Local knowledge according to the implementation model |
| `quarterlyReports/{id}` | `branchId`, `branchType`, `quarter`, `year`, `submittedAt`, `data` or `answers` | The answer schema must be defined and standardized |
| `reportQuestions/{id}` | `branchType`, `key`, `label`, `section`, `type`, `options[]`, `firstReportOnly`, `order` | Configurable questions |
| `hq_knowledge/{id}` | `domain`, `category`, `title`, `content`, `fileUrl`, `tags[]`, `visibleToCoordinators` | Headquarters knowledge |
| `knowledgeItems/{id}` | Branch/global knowledge according to `branchId` | The actual model requires verification |
| `knowledge_articles/{id}` | Articles and research | The actual model requires verification |
| Chat history | Messages, owner, and `updatedAt` | The exact path must be consistent between the specification and implementation |

Every document should use `serverTimestamp()` for creation and update times. Denormalization performed on the client requires transactions, repair mechanisms, and consistency tests.

## 6. Real-Time Layer

The main collections are wrapped in custom hooks that use `onSnapshot` and return a contract in the following form:

```ts
{ data, loading, error }
```

The described hooks are:

- `useTasks`
- `useContacts`
- `useRoles`
- `useBranch`
- `useQuarterlyReports`
- `useAllQuarterlyReports`
- `useReportQuestions`
- `useKnowledge`
- `useHQKnowledge`
- `usePersonalTasks`
- `useChatHistory`

The specification does not require a global state manager, but it does require correct subscription, error, pagination, caching, and read-cost management as the organization grows.

## 7. Serverless Functions

| Function | Method | Auth | Purpose |
|---|---|---|---|
| `portal-login` | POST | Public | Validate a coordinator and issue a Custom Token |
| `chat` | POST | Firebase token, coordinator | Branch AI assistant |
| `hq-chat` | POST | Firebase token, non-coordinator | Headquarters AI assistant |
| `hq-chat-health` | GET | Described in the source as public diagnostics | Check Firebase and Anthropic configuration |
| `summarize-article` | POST | Described in the source as having no Auth | Summarize content through Claude |
| `ai-proxy` | POST | Not yet defined | Scaffold for a future agent |

Every authorized function should:

1. Validate the Method and Content-Type.
2. Validate the Firebase ID token.
3. Validate the role and scope on the server side.
4. Fully validate the request body.
5. Apply rate limits, size limits, and a timeout.
6. Return safe errors without secrets or provider details.
7. Produce logs and metrics with a correlation ID.

## 8. AI Integration

The Anthropic key is stored only on the server side. Headquarters chat allows scopes to be selected:

| Scope | Source |
|---|---|
| `hq` | `hq_knowledge` |
| `research` | `knowledge_articles` / research knowledge |
| `global` | Organization-wide knowledge |
| `branch` | Branch knowledge |
| `reports` | `quarterlyReports` |

Requirements:

- Limit data sent to the model according to identity, role, domain, and branch.
- Prevent prompt injection from documents and user input.
- Limit the number of messages, message length, context size, tokens, and cost.
- Apply a timeout, controlled retries, and a circuit breaker.
- Maintain an audit trail without storing secrets or unnecessary PII.
- Define retention and deletion policies for chat history.
- Produce source-grounded answers and identify the source.
- Future AI write operations require human approval and are not enabled by default.

## 9. Routing

CRM route tree:

- `/login`
- `/`
- `/dashboard`
- `/tasks`
- `/tasks/:id`
- `/my-tasks`
- `/contacts`
- `/roles`
- `/orgchart`
- `/branches`
- `/reports`
- `/knowledge`
- `/hq-knowledge`
- `/hq-chat`
- `/admin/hierarchy`
- `/admin/branches`
- `/admin/knowledge`
- `/admin/report-questions`

Portal route tree:

- `/portal/home`
- `/portal/report`
- `/portal/knowledge`
- `/portal/chat`

## 10. Feature Modules

### Tasks

Full CRUD, list/Kanban/calendar/Gantt views, files, comments, history, contacts, dependencies, and subtasks.

### Dashboard

Status summary, period filtering, overdue detection, staffing-risk indicators, and quick status updates.

### Contacts

Headquarters staff, suppliers, and donors; CRUD and task linking.

### Roles and Staffing

Staffing status, priority, recruitment urgency, delegation, linked tasks, and volunteer data.

### Organizational Chart

A hierarchical tree with drill-down into branches and operational data.

### Branches

Operational data, addresses, packing/distribution schedules, quantities, and coordinator linking.

### Reports

Quarterly reporting, dynamic questions, and a coverage dashboard.

### Knowledge

Organizational and branch knowledge libraries containing documents, links, tips, articles, files, and checklists.

### Personal Tasks

A private list for each user under an isolated data path.

## 11. Coordinator Portal

A separate portal for coordinators that shares the same bundle but uses different layout, routes, and authorization.

| Route | Capability |
|---|---|
| `/portal/home` | Branch overview and recent reports |
| `/portal/report` | Quarterly report submission |
| `/portal/knowledge` | Authorized headquarters knowledge and branch knowledge |
| `/portal/chat` | AI assistant based on branch knowledge |

A coordinator must be restricted on the server side and in data rules to the branches to which they are assigned.

## 12. Recurring Tasks

The source specification describes a client-side reset when an admin loads `TasksPage`:

- Monthly `cycleKey`: `YYYY-M`.
- Quarterly: `YYYY-QN`.
- Semiannual: `YYYY-HN`.
- Annual or holiday-based: `YYYY`.
- One-time: no reset.

Described implementation limitation: reliability depends on an admin opening the page. The production target is an idempotent scheduled server-side job with locking/transactions, an audit trail, and retries.

## 13. Environment Variables

### Client Side

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

Firebase client keys are inherently public, but they must be restricted through Firebase configuration, App Check, and security rules.

### Server Side

- `FIREBASE_SERVICE_ACCOUNT`
- `ANTHROPIC_API_KEY`

Secrets must be managed through a secrets system with least privilege, rotation, environment separation, and no logging.

## 14. Testing

The described framework:

| Layer | Framework |
|---|---|
| Unit / Component | Vitest + Testing Library |
| E2E | Playwright |
| Lint | oxlint |
| Type checking | TypeScript build |

The production target additionally requires:

- Firebase Emulator and Security Rules tests.
- Integration tests for Firestore, Auth, and Storage.
- Contract tests for every Netlify Function.
- E2E tests for headquarters, admin, and coordinator scenarios.
- Accessibility, performance, load, and recovery tests.
- Stable fixtures/builders and isolated test data.
- Coverage thresholds and mutation metrics.
- CI that blocks merging on lint, typecheck, unit, rules, integration, and critical E2E failures.

## 15. Security Model

Required security boundaries:

- Firebase Auth identifies the user.
- Authorization is enforced in Firestore rules, Storage rules, and server functions.
- A role or branch received from the client is never an authority source.
- Coordinator access is limited to assigned branches.
- Headquarters staff access is restricted according to the domain policy approved by the organization.
- Files are constrained by ownership, type, size, and content scanning.
- Public endpoints are protected against enumeration, brute force, abuse, and AI-related cost exposure.
- Audit logging exists for sensitive operations.
- Contact, report, and chat data have privacy, retention, and deletion policies.

## 16. Limitations and Future Steps Mentioned in the Source

| Area | State Described in the Source | Target |
|---|---|---|
| Firestore Security Rules | Permissions are too broad | Full server-side RBAC and scope enforcement |
| Recurring-task reset | Client-side | Reliable scheduled job |
| AI writer | Scaffold only | Tool calling with human approval |
| Push notifications | Not implemented | FCM notifications |
| Offline | Not enabled | Persistence for field coordinators as needed |
| Bundle | Relatively large | Route-level code splitting |

## Contradictions to Resolve Before Implementation

1. Role collection name: `roles` versus `orgRoles`.
2. Quarterly report structure: `data` versus `answers`.
3. Chat-history path: root collection versus a subcollection under a user.
4. Branch-knowledge model: subcollection under a branch versus `knowledgeItems` with `branchId`.
5. Whether domain users may see all headquarters data or only data from their own domain.
6. Whether coordinator login using a name and phone number is a final business requirement or a temporary solution.
7. Which types of information may be transferred to the AI provider and under what conditions.
