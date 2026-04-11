export const ADDON_TYPE = {
  AZURE_TERRAFORM: "azure-terraform",
  AWS_CDK: "aws-cdk",
  QUEUE_CONSUMER: "queue-consumer",
  EXTERNAL_API_CLIENT: "external-api-client",
  TEAMS_NOTIFICATION: "teams-notification",
  TIMER_JOB: "timer-job",
} as const;

export type AddonType = typeof ADDON_TYPE[keyof typeof ADDON_TYPE];
