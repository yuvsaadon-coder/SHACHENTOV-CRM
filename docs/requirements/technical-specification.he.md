# שחנטוב CRM — מפרט טכני

> מקור: [Claude Artifact](https://claude.ai/code/artifact/39111d83-93a9-458a-8a9e-ba6d2b66d203)  
> גרסת מקור: v1.0, ספטמבר 2026  
> תאריך קליטה למאגר: 6 בספטמבר 2026  
> קהל יעד במקור: הנדסה  
> סיווג במקור: סודי  
> הערה: מסמך זה משמר את מפרט המקור. הוא מתאר מצב רצוי וגם טענות על מצב קיים; יש לאמת כל טענה מול הקוד, התצורה וסביבת הייצור.

## 1. ארכיטקטורת מערכת

המערכת מתוארת כיישום SPA מלא ללא שרת אפליקציה קבוע, המגובה ב-Firebase BaaS:

- React 19 ו-React Router 7 בדפדפן.
- Tailwind CSS v4 לעיצוב.
- Firebase SDK v12 לגישה ל-Firestore, להזדהות ולאחסון.
- `onSnapshot` לעדכונים בזמן אמת.
- Firebase Auth להזדהות.
- Firebase Storage לקבצים מצורפים.
- Netlify Functions ללוגיקה המחייבת הקשר שרת.
- Firebase Admin SDK לאימות tokens ולקריאות מורשות.
- Anthropic Claude API עבור יכולות AI.

אין Server-Side Rendering. Netlify מגיש את `dist/index.html`, וניתוב SPA מטופל באמצעות catch-all redirect לאחר נתיבי הפונקציות.

## 2. מחסנית טכנולוגית

| תחום | טכנולוגיה | כוונת המפרט |
|---|---|---|
| Runtime | React 19 | CSR בלבד |
| שפה | TypeScript 6 | `strict: true`, ללא `any` בליבת הטיפוסים |
| Build | Vite 8 + Rolldown | HMR בפיתוח ו-build חסום על שגיאות TypeScript |
| עיצוב | Tailwind CSS v4 | טוקנים מותאמים דרך `@theme` |
| מסד נתונים | Cloud Firestore | מודל מסמכים NoSQL ועדכוני זמן אמת |
| הזדהות | Firebase Auth | דוא"ל/סיסמה ו-ID tokens |
| קבצים | Firebase Storage | קבצים מצורפים עם metadata ב-Firestore |
| Serverless | Netlify Functions | Node.js 20 ו-esbuild |
| AI | Anthropic Claude | proxy בצד השרת בלבד |
| Drag and Drop | `@dnd-kit` | Kanban נגיש |
| לוח שנה | `react-big-calendar` | חודש, שבוע ויום |
| חגים עבריים | `@hebcal/core` | תזמון משימות ביחס לחגים |

## 3. אירוח ו-Deploy

- אירוח ב-Netlify.
- כל push לענף הייעודי מפעיל build.
- Preview Deploys של Pull Requests משמשים כסביבת קדם-ייצור.
- פקודת build: `npm run build`, הכוללת `tsc -b && vite build`.
- Node.js 20.
- פונקציות Netlify מקובצות עם esbuild.
- נתיבי `/.netlify/functions/*` חייבים להופיע לפני catch-all של ה-SPA.
- Secrets מנוהלים באמצעות Netlify Environment Variables.
- המפרט מציין timeout מורחב לנקודות AI.
- אין סביבת staging קבועה נפרדת.

## 4. הזדהות ו-RBAC

לאחר Firebase login, הלקוח קורא את `users/{uid}` ומפיק ממנו את תפקיד המשתמש.

| תפקיד | משטח גישה |
|---|---|
| `admin` | CRM מלא ודפי אדמין |
| `CEO`, `JLM`, `SUP`, `FIN`, `DON`, `DES`, `PUB`, `VOL` | CRM ללא דפי אדמין, עם ברירת מחדל מסוננת לתחום |
| `coordinator` | `/portal/*` בלבד |

רכזים נכנסים דרך `portal-login`, שמקבל שם ומספר טלפון, מאמת אותם מול Firestore ומנפיק Firebase Custom Token.

Route guards בצד הלקוח:

- משתמש לא מזוהה מנותב ל-`/login`.
- רכז מנותב ל-`/portal/home`.
- משתמש מטה נכנס לעץ ה-CRM.

אכיפת ההרשאות בפועל נדרשת גם בכללי Firestore, Storage ובפונקציות השרת; guards בצד הלקוח אינם גבול אבטחה.

## 5. מודל נתונים

| Collection | שדות מרכזיים | Subcollections / הערות |
|---|---|---|
| `users/{uid}` | `name`, `email`, `role`, `branchId`, `active` | `personalTasks`; התפקיד מניע RBAC |
| `tasks/{id}` | `domain`, `category`, `title`, `steps`, `frequency`, `startDate`, `endDate`, `status`, `cycleKey`, `involved[]`, `contactRefs[]`, `dependsOn[]`, `parentTaskId`, `attachmentCount` | `attachments`, `comments`, `history` |
| `contacts/{id}` | `name`, `type`, `domainTags[]`, `phone`, `email`, `organization`, `role`, `category`, `needsInfo` | קישור למשימות דרך `contactRefs[]` |
| `roles/{id}` / `orgRoles/{id}` | `roleName`, `level`, `area`, `holderName`, `status`, `priority`, `recruitmentUrgency`, `linkedTaskIds[]`, `delegatedTo`, `volunteerInfo` | שם ה-collection חייב להיות מוכרע ואחיד |
| `branches/{id}` | `name`, `type`, `city`, `coordinatorUids[]`, `distributionFrequency`, `weeklyBaskets`, `monthlyBaskets`, `address` | ידע מקומי לפי מודל המימוש |
| `quarterlyReports/{id}` | `branchId`, `branchType`, `quarter`, `year`, `submittedAt`, `data` או `answers` | סכמת התשובות חייבת להיות מוגדרת ואחידה |
| `reportQuestions/{id}` | `branchType`, `key`, `label`, `section`, `type`, `options[]`, `firstReportOnly`, `order` | שאלות ניתנות להגדרה |
| `hq_knowledge/{id}` | `domain`, `category`, `title`, `content`, `fileUrl`, `tags[]`, `visibleToCoordinators` | ידע מטה |
| `knowledgeItems/{id}` | ידע סניפי/כללי לפי `branchId` | המודל בפועל נדרש לאימות |
| `knowledge_articles/{id}` | מאמרים ומחקר | המודל בפועל נדרש לאימות |
| היסטוריית צ'אט | הודעות, בעלים ו-`updatedAt` | הנתיב המדויק חייב להיות אחיד בין המפרט והמימוש |

כל מסמך אמור להשתמש ב-`serverTimestamp()` עבור זמני יצירה ועדכון. דה-נורמליזציה שמתבצעת בצד הלקוח דורשת טרנזקציות, מנגנוני תיקון ובדיקות עקביות.

## 6. שכבת זמן אמת

ה-collections המרכזיים נעטפים ב-custom hooks המשתמשים ב-`onSnapshot` ומחזירים חוזה בסגנון:

```ts
{ data, loading, error }
```

ה-hooks המתוארים:

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

המפרט אינו דורש state manager גלובלי, אך מחייב ניהול נכון של subscriptions, שגיאות, pagination, cache ועלויות קריאה ככל שהארגון גדל.

## 7. פונקציות Serverless

| פונקציה | Method | Auth | מטרה |
|---|---|---|---|
| `portal-login` | POST | ציבורי | אימות רכז והנפקת Custom Token |
| `chat` | POST | Firebase token, coordinator | עוזר AI לסניף |
| `hq-chat` | POST | Firebase token, non-coordinator | עוזר AI למטה |
| `hq-chat-health` | GET | במקור מתואר כאבחון ציבורי | בדיקת תצורת Firebase ו-Anthropic |
| `summarize-article` | POST | במקור מתואר ללא Auth | סיכום תוכן דרך Claude |
| `ai-proxy` | POST | טרם הוגדר | scaffold לסוכן עתידי |

כל פונקציה מורשית אמורה:

1. לאמת Method ו-Content-Type.
2. לאמת Firebase ID token.
3. לאמת role ו-scope בצד השרת.
4. לבצע validation מלא לגוף הבקשה.
5. להחיל rate limit, מגבלות גודל ו-timeout.
6. להחזיר שגיאות בטוחות ללא secrets או פרטי ספק.
7. להפיק לוגים ו-metrics עם correlation ID.

## 8. אינטגרציית AI

מפתח Anthropic נשמר בצד השרת בלבד. צ'אט המטה מאפשר בחירת scopes:

| Scope | מקור |
|---|---|
| `hq` | `hq_knowledge` |
| `research` | `knowledge_articles` / ידע מחקרי |
| `global` | ידע כלל-ארגוני |
| `branch` | ידע סניפי |
| `reports` | `quarterlyReports` |

דרישות:

- הגבלת הנתונים הנשלחים למודל לפי זהות, role, domain וסניף.
- מניעת prompt injection ממסמכים ומקלט משתמש.
- הגבלת מספר הודעות, אורך הודעה, גודל context, tokens ועלות.
- timeout, retry מבוקר ו-circuit breaker.
- audit trail ללא שמירת secrets או PII מיותר.
- מדיניות retention ומחיקה להיסטוריית שיחה.
- תשובות מבוססות מקורות וציון המקור.
- פעולות כתיבה עתידיות של AI דורשות human approval ואינן מופעלות כברירת מחדל.

## 9. Routing

עץ ה-CRM:

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

עץ הפורטל:

- `/portal/home`
- `/portal/report`
- `/portal/knowledge`
- `/portal/chat`

## 10. מודולי פיצ'רים

### משימות

CRUD מלא, תצוגות רשימה/Kanban/לוח שנה/גאנט, קבצים, תגובות, היסטוריה, אנשי קשר, תלויות ותתי-משימות.

### דשבורד

סיכום סטטוסים, סינון תקופה, זיהוי איחורים, סיכוני איוש ועדכון סטטוס מהיר.

### אנשי קשר

אנשי מטה, ספקים ותורמים; CRUD וקישור למשימות.

### תפקידים ואיוש

סטטוס איוש, עדיפות, דחיפות גיוס, האצלה, משימות מקושרות ונתוני מתנדבים.

### תרשים ארגוני

עץ היררכי עם drill-down לסניפים ולנתונים תפעוליים.

### סניפים

נתוני תפעול, כתובות, לוחות אריזה/חלוקה, כמויות וקישור רכזים.

### דיווחים

דיווח רבעוני, שאלות דינמיות ודשבורד כיסוי.

### ידע

ספריית ידע ארגונית וסניפית, מסמכים, קישורים, טיפים, מאמרים, קבצים וצ'קליסטים.

### משימות אישיות

רשימה פרטית לכל משתמש תחת מסלול נתונים מבודד.

## 11. פורטל רכזים

פורטל נפרד לרכזים החולק את אותו bundle אך משתמש ב-layout, routes והרשאות שונים.

| נתיב | יכולת |
|---|---|
| `/portal/home` | סקירת סניף ודיווחים אחרונים |
| `/portal/report` | הגשת דיווח רבעוני |
| `/portal/knowledge` | ידע מורשה של המטה וידע סניפי |
| `/portal/chat` | עוזר AI המבוסס על ידע הסניף |

רכז חייב להיות מוגבל בצד השרת ובכללי הנתונים לסניפים שאליהם הוא משויך.

## 12. משימות חוזרות

מפרט המקור מתאר איפוס בצד הלקוח בעת טעינת `TasksPage` על ידי admin:

- `cycleKey` חודשי: `YYYY-M`.
- רבעוני: `YYYY-QN`.
- חצי-שנתי: `YYYY-HN`.
- שנתי או לפי חג: `YYYY`.
- חד-פעמי: ללא איפוס.

מגבלת המימוש המתוארת: האמינות תלויה בכך ש-admin יפתח את הדף. יעד הייצור הוא job מתוזמן בצד השרת, אידמפוטנטי, עם נעילה/עסקה, audit trail וניסיון חוזר.

## 13. משתני סביבה

### צד לקוח

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

מפתחות Firebase בצד הלקוח הם ציבוריים מטבעם, אך יש להגביל אותם באמצעות הגדרות Firebase, App Check וכללי אבטחה.

### צד שרת

- `FIREBASE_SERVICE_ACCOUNT`
- `ANTHROPIC_API_KEY`

Secrets חייבים להיות מנוהלים במערכת secrets, עם least privilege, rotation, הפרדה בין סביבות וללא הדפסה בלוגים.

## 14. בדיקות

המסגרת המתוארת:

| שכבה | Framework |
|---|---|
| Unit / Component | Vitest + Testing Library |
| E2E | Playwright |
| Lint | oxlint |
| Type checking | TypeScript build |

יעד הייצור דורש בנוסף:

- בדיקות Firebase Emulator ו-Security Rules.
- בדיקות אינטגרציה ל-Firestore, Auth ו-Storage.
- בדיקות חוזה לכל Netlify Function.
- בדיקות E2E לתרחישי HQ, admin ורכז.
- בדיקות נגישות, ביצועים, עומס והתאוששות.
- fixtures/builders יציבים ונתוני בדיקה מבודדים.
- coverage thresholds ומדדי mutation.
- CI שחוסם merge על lint, typecheck, unit, rules, integration ו-E2E קריטי.

## 15. מודל אבטחה

גבולות האבטחה הנדרשים:

- Firebase Auth מזהה את המשתמש.
- הרשאות נאכפות בכללי Firestore ו-Storage ובפונקציות השרת.
- role או branch שמגיעים מהלקוח לעולם אינם מקור סמכות.
- גישת רכז מוגבלת לסניפים המשויכים אליו.
- גישת אנשי מטה מוגבלת לפי מדיניות התחום שהארגון מאשר.
- קבצים מוגבלים לפי בעלות, סוג, גודל וסריקת תוכן.
- נקודות קצה ציבוריות מוגנות מפני enumeration, brute force, abuse ועלויות AI.
- audit logging קיים לפעולות רגישות.
- נתוני קשר, דיווחים וצ'אט מקבלים מדיניות פרטיות, retention ומחיקה.

## 16. מגבלות וצעדים עתידיים שהוזכרו במקור

| תחום | מצב שתואר במקור | יעד |
|---|---|---|
| Firestore Security Rules | הרשאות רחבות מדי | RBAC ו-scope מלאים בצד השרת |
| איפוס משימות חוזרות | client-side | job מתוזמן ואמין |
| AI כותב | scaffold בלבד | tool calling עם אישור אנושי |
| Push notifications | לא ממומש | FCM להתראות |
| Offline | לא מופעל | persistence לרכזי שטח לפי צורך |
| Bundle | גדול יחסית | route-level code splitting |

## סתירות שיש להכריע לפני מימוש

1. שם collection התפקידים: `roles` לעומת `orgRoles`.
2. מבנה דיווח רבעוני: `data` לעומת `answers`.
3. נתיב היסטוריית צ'אט: collection שורשי לעומת subcollection תחת משתמש.
4. מודל הידע הסניפי: subcollection תחת סניף לעומת `knowledgeItems` עם `branchId`.
5. האם משתמשי domain מורשים לראות את כל נתוני המטה או רק את התחום שלהם.
6. האם כניסת רכז באמצעות שם וטלפון היא דרישה עסקית סופית או פתרון זמני.
7. אילו סוגי מידע מותר להעביר לספק ה-AI ובאילו תנאים.

