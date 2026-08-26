import { z } from 'zod';

export const InputSchema = z.object({
    mode: z.enum(['range', 'choice']).describe('Random mode: range (numeric range), choice (random selection from options)'),
    
    // Range mode parameters
    min: z.number().optional().describe('Minimum value (inclusive, default: 1)'),
    max: z.number().optional().describe('Maximum value (inclusive, default: 100)'),
    count: z.number().optional().describe('Number of items to generate (default: 1)'),
    unique: z.boolean().optional().describe('Whether to generate unique numbers (default: false)'),
    
    // Choice mode parameters
    options: z.array(z.string()).optional().describe('List of random options'),
    weights: z.array(z.number()).optional().describe('Weight list (corresponding to options, equal probability if omitted)'),
    replacement: z.boolean().optional().describe('Whether to allow replacement/duplicates (default: true)'),
});

export type ToolArgs = z.infer<typeof InputSchema>;