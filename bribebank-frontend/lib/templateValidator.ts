import { z } from 'zod';

// Must match backend ICON_OPTIONS
export const ICON_OPTIONS = [
  'Gift', 'Zap', 'Star', 'Heart', 'Trophy', 'Gamepad2',
  'Pizza', 'Plane', 'Smartphone', 'Music', 'Dumbbell', 'BookOpen'
] as const;

// Must match backend AVATAR_COLORS
export const AVATAR_COLORS = [
  'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500',
  'bg-blue-500', 'bg-indigo-500', 'bg-purple-500', 'bg-pink-500',
  'bg-cyan-500', 'bg-emerald-500', 'bg-violet-500', 'bg-rose-500'
] as const;

// Validation schema for individual items
export const TemplateItemSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name must be 100 characters or less'),
  description: z.string()
    .max(500, 'Description must be 500 characters or less')
    .optional()
    .default(''),
  cost: z.number()
    .int('Cost must be a whole number')
    .min(0, 'Cost must be 0 or greater')
    .max(10000, 'Cost must not exceed 10000'),
  icon: z.string().optional().default('Zap'), // Accept any string (emoji or icon name)
  color: z.string().optional().default('bg-blue-500'), // Accept any color string
});

// Schema for rewards export/import
export const RewardsExportSchema = z.object({
  version: z.literal('1.0'),
  exportDate: z.string(),
  type: z.literal('rewards'),
  items: z.array(TemplateItemSchema)
    .min(1, 'Must have at least one reward')
    .max(1000, 'Cannot import more than 1000 items'),
});

// Schema for bounties export/import
export const BountiesExportSchema = z.object({
  version: z.literal('1.0'),
  exportDate: z.string(),
  type: z.literal('bounties'),
  items: z.array(TemplateItemSchema)
    .min(1, 'Must have at least one bounty')
    .max(1000, 'Cannot import more than 1000 items'),
});

// Combined schema
export const TemplateExportSchema = z.union([
  RewardsExportSchema,
  BountiesExportSchema,
]);

export type TemplateItem = z.infer<typeof TemplateItemSchema>;
export type RewardsExport = z.infer<typeof RewardsExportSchema>;
export type BountiesExport = z.infer<typeof BountiesExportSchema>;
export type TemplateExport = z.infer<typeof TemplateExportSchema>;
