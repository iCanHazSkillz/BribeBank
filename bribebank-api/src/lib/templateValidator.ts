import { z } from 'zod';

// Validation schema for individual reward/bounty items
export const TemplateItemSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name must be 100 characters or less'),
  description: z.string()
    .max(500, 'Description must be 500 characters or less')
    .optional()
    .default(''),
  cost: z.union([z.number(), z.null(), z.string().transform(s => parseInt(s) || 0)])
    .optional()
    .default(0)
    .transform((val) => {
      if (val === null || val === undefined) return 0;
      if (typeof val === 'string') return parseInt(val) || 0;
      if (typeof val === 'number') return val;
      return 0;
    }),
  icon: z.string()
    .optional()
    .default('Zap'), // Accept any string (emoji or icon name)
  color: z.string()
    .optional()
    .default('bg-blue-500'), // Accept any color string
  rewardType: z.enum(['CUSTOM', 'TICKETS']).optional(), // For bounties: CUSTOM or TICKETS
  rewardValue: z.string().optional(), // For bounties: the custom text or ticket count
  isFCFS: z.boolean().optional(), // For bounties: fast grab/first come first served
  recurrenceEnabled: z.boolean().optional(),
  recurrenceCadence: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']).optional(),
  recurrencePattern: z.enum(['DAY_OF_WEEK', 'DAY_OF_MONTH']).optional(),
  recurrenceDayOfWeek: z.number().int().min(0).max(6).optional(),
  recurrenceDayOfMonth: z.number().int().min(1).max(31).optional(),
  recurrenceWeekOfMonth: z.number().int().min(1).max(5).optional(),
  recurrenceMonthOfYear: z.number().int().min(1).max(12).optional(),
  streakEnabled: z.boolean().optional(),
  streakMilestones: z.array(z.object({
    threshold: z.number().int().min(1),
    rewardType: z.enum(['CUSTOM', 'TICKETS']),
    rewardValue: z.string().min(1),
  })).optional(),
}).passthrough(); // Allow extra fields

// Validation schema for rewards export/import
export const RewardsExportSchema = z.object({
  version: z.string().optional(), // Make version optional - be lenient
  exportDate: z.string().optional(), // Make exportDate optional
  type: z.literal('rewards'),
  items: z.array(TemplateItemSchema)
    .min(1, 'Must have at least one reward')
    .max(1000, 'Cannot import more than 1000 items'),
}).passthrough(); // Allow extra fields

// Validation schema for bounties export/import
export const BountiesExportSchema = z.object({
  version: z.string().optional(), // Make version optional - be lenient
  exportDate: z.string().optional(), // Make exportDate optional
  type: z.literal('bounties'),
  items: z.array(TemplateItemSchema)
    .min(1, 'Must have at least one bounty')
    .max(1000, 'Cannot import more than 1000 items'),
}).passthrough(); // Allow extra fields

// Combined schema for either type
export const TemplateExportSchema = z.union([
  RewardsExportSchema,
  BountiesExportSchema,
]);

export type TemplateItem = z.infer<typeof TemplateItemSchema>;
export type RewardsExport = z.infer<typeof RewardsExportSchema>;
export type BountiesExport = z.infer<typeof BountiesExportSchema>;
export type TemplateExport = z.infer<typeof TemplateExportSchema>;
