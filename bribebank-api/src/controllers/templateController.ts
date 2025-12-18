import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { TemplateExportSchema, TemplateItem, RewardsExport, BountiesExport } from '../lib/templateValidator.js';
import { getRequestUser } from '../lib/authHelpers.js';

const prisma = new PrismaClient();

// Extend Express Request type to include userId property (set by authMiddleware)
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * Sanitize text by removing any potentially dangerous content
 * Server-side sanitization: strip HTML tags and dangerous patterns
 */
const sanitizeText = (text: string): string => {
  // Remove HTML tags
  const noHtml = text.replace(/<[^>]*>/g, '');
  
  // Remove script-like patterns
  const noScripts = noHtml
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/eval\s*\(/gi, '')
    .replace(/expression\s*\(/gi, '');
  
  // Trim whitespace
  return noScripts.trim();
};

/**
 * Map Prisma Reward to template item format
 */
const rewardToTemplateItem = (reward: any): TemplateItem => ({
  name: reward.title,
  description: reward.description || '',
  cost: 0, // Rewards don't have a cost field in schema, default to 0
  icon: reward.emoji || '🎁', // Export the actual emoji stored in database
  color: reward.themeColor || 'bg-blue-500', // Export original theme color
});

/**
 * Map Prisma Bounty to template item format
 */
const bountyToTemplateItem = (bounty: any): TemplateItem => {
  // Try to parse rewardValue as a number, fallback to 0 if it contains non-numeric content
  let cost = 0;
  if (bounty.rewardValue) {
    const parsed = parseInt(bounty.rewardValue);
    if (!isNaN(parsed)) {
      cost = parsed;
    }
  }
  
  return {
    name: bounty.title,
    description: '', // Bounties don't have description in schema
    cost, // Numeric cost, defaults to 0 if rewardValue is non-numeric
    icon: bounty.emoji || '✓', // Export the actual emoji stored in database
    color: bounty.themeColor || 'bg-blue-500', // Export original theme color
    rewardType: bounty.rewardType || undefined, // Export CUSTOM or TICKETS
    rewardValue: bounty.rewardValue || undefined, // Export custom text or ticket count
    isFCFS: bounty.isFCFS || false, // Export fast grab status
  };
};

/**
 * Export rewards or bounties as JSON file template
 * GET /templates/export?type=rewards|bounties
 */
export const exportTemplate = async (req: Request, res: Response) => {
  try {
    const { type } = req.query;
    
    // Get the authenticated user
    const user = await getRequestUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const familyId = user.familyId;

    if (type !== 'rewards' && type !== 'bounties') {
      return res.status(400).json({ error: 'Type must be "rewards" or "bounties"' });
    }

    const exportDate = new Date().toISOString();

    if (type === 'rewards') {
      const rewards = await prisma.reward.findMany({
        where: { familyId },
      });

      const items: TemplateItem[] = rewards.map(rewardToTemplateItem);

      const exportData: RewardsExport = {
        version: '1.0',
        exportDate,
        type: 'rewards',
        items,
      };

      return res.json(exportData);
    } else {
      // bounties
      const bounties = await prisma.bounty.findMany({
        where: { familyId },
      });

      const items: TemplateItem[] = bounties.map(bountyToTemplateItem);

      const exportData: BountiesExport = {
        version: '1.0',
        exportDate,
        type: 'bounties',
        items,
      };

      return res.json(exportData);
    }
  } catch (error) {
    console.error('[Templates] Export failed:', error);
    return res.status(500).json({ error: 'Export failed' });
  }
};

/**
 * Import rewards or bounties from JSON file template
 * POST /templates/import
 * Body: { type: 'rewards'|'bounties', items: TemplateItem[] }
 */
export const importTemplate = async (req: Request, res: Response) => {
  try {
    // Get the authenticated user
    const user = await getRequestUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const familyId = user.familyId;

    // Validate the imported data structure
    let validated;
    try {
      validated = TemplateExportSchema.parse(req.body);
    } catch (error: any) {
      console.error('[Templates] Validation failed');
      console.error('[Templates] Raw input:', JSON.stringify(req.body, null, 2));
      console.error('[Templates] Zod errors:', error.errors);
      
      // For union errors, show both branches
      if (error.errors?.[0]?.code === 'invalid_union' && error.errors[0].unionErrors) {
        console.error('[Templates] Union errors:');
        error.errors[0].unionErrors.forEach((ue: any, idx: number) => {
          console.error(`  Branch ${idx}:`, ue.issues);
        });
      }
      
      return res.status(400).json({
        error: 'Invalid template format',
        details: error.errors?.[0]?.message || 'Validation failed',
        allErrors: error.errors, // Include all errors for debugging
      });
    }

    const { type, items } = validated;
    const importedItems: any[] = [];
    const errors: string[] = [];

    if (type === 'rewards') {
      // Import rewards
      for (const item of items) {
        try {
          // Sanitize text fields
          const sanitizedItem = {
            title: sanitizeText(item.name),
            description: sanitizeText(item.description || ''),
            themeColor: item.color || 'bg-blue-500',
            emoji: item.icon || '🎁', // Use imported icon/emoji, default to gift
          };

          // Validate name is not empty after sanitization
          if (!sanitizedItem.title) {
            errors.push(`Item skipped: name is required after sanitization`);
            continue;
          }

          // Check if reward with identical properties already exists (strict matching)
          // Only overwrite if title, emoji, description, and color are ALL the same
          const existing = await prisma.reward.findFirst({
            where: {
              familyId,
              title: sanitizedItem.title,
              emoji: sanitizedItem.emoji,
              description: sanitizedItem.description,
              themeColor: sanitizedItem.themeColor,
            },
          });

          if (existing) {
            // Already exists with identical properties - skip or note it
            importedItems.push(existing);
          } else {
            // Create new (either title doesn't match, or other properties differ)
            const created = await prisma.reward.create({
              data: {
                familyId,
                title: sanitizedItem.title,
                description: sanitizedItem.description,
                themeColor: sanitizedItem.themeColor,
                emoji: sanitizedItem.emoji,
                type: 'PRIVILEGE', // Default type for imported rewards
              },
            });
            importedItems.push(created);
          }
        } catch (itemError: any) {
          errors.push(`Item "${item.name}": ${itemError.message}`);
        }
      }
    } else {
      // Import bounties
      for (const item of items) {
        try {
          // Sanitize text fields
          const sanitizedItem = {
            title: sanitizeText(item.name),
            themeColor: item.color || 'bg-blue-500',
            emoji: item.icon || '✓', // Use imported icon/emoji, default to checkmark
            rewardValue: item.rewardValue || item.cost.toString(), // Use rewardValue if available, fallback to cost
            isFCFS: item.isFCFS ?? false, // Use imported isFCFS status, default to false
            rewardType: item.rewardType || 'CUSTOM', // Use imported rewardType, default to CUSTOM
          };

          // Validate title is not empty after sanitization
          if (!sanitizedItem.title) {
            errors.push(`Item skipped: title is required after sanitization`);
            continue;
          }

          // Check if bounty with identical properties already exists (strict matching)
          // Only overwrite if title, emoji, rewardValue, and color are ALL the same
          const existing = await prisma.bounty.findFirst({
            where: {
              familyId,
              title: sanitizedItem.title,
              emoji: sanitizedItem.emoji,
              rewardValue: sanitizedItem.rewardValue,
              themeColor: sanitizedItem.themeColor,
            },
          });

          if (existing) {
            // Already exists with identical properties - skip or note it
            importedItems.push(existing);
          } else {
            // Create new (either title doesn't match, or other properties differ)
            const created = await prisma.bounty.create({
              data: {
                familyId,
                title: sanitizedItem.title,
                themeColor: sanitizedItem.themeColor,
                emoji: sanitizedItem.emoji,
                rewardValue: sanitizedItem.rewardValue,
                isFCFS: sanitizedItem.isFCFS,
                rewardType: sanitizedItem.rewardType,
              },
            });
            importedItems.push(created);
          }
        } catch (itemError: any) {
          errors.push(`Item "${item.name}": ${itemError.message}`);
        }
      }
    }

    return res.json({
      success: true,
      imported: importedItems.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully imported ${importedItems.length} items${
        errors.length > 0 ? ` with ${errors.length} errors` : ''
      }`,
    });
  } catch (error) {
    console.error('[Templates] Import failed:', error);
    return res.status(500).json({ error: 'Import failed' });
  }
};
