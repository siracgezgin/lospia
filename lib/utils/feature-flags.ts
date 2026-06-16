/** Feature flag helpers — all read from NEXT_PUBLIC_ env vars */

export const featureFlags = {
  uploads: process.env.NEXT_PUBLIC_FEATURE_UPLOADS_ENABLED === "true",
  slack: process.env.NEXT_PUBLIC_FEATURE_SLACK_ENABLED === "true",
  emailToTask: process.env.NEXT_PUBLIC_FEATURE_EMAIL_TO_TASK_ENABLED === "true",
  ai: process.env.NEXT_PUBLIC_FEATURE_AI_ENABLED === "true",
  realtime: process.env.NEXT_PUBLIC_FEATURE_REALTIME_ENABLED === "true",
} as const;
