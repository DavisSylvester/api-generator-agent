export const TEMPLATE_TYPE = {
  BASE: "base",
  ADDON: "addon",
} as const;

export type TemplateType = typeof TEMPLATE_TYPE[keyof typeof TEMPLATE_TYPE];
