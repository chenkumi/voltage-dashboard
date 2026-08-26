import { z } from 'zod';

export const InputSchema = z.object({
    date: z.union([z.string(), z.number()]).optional().describe('Input date (ISO 8601 or timestamp), defaults to current time if omitted'),
    now: z.boolean().optional().describe('Whether to get the current time directly (takes precedence over date)'),
    timezone: z.string().optional().describe('Target timezone (e.g., "Asia/Taipei", "UTC")'),
    format: z.string().optional().describe('Output date format (dayjs format, e.g., "YYYY-MM-DD HH:mm:ss")'),
    lunar: z.union([
        z.boolean(),
        z.object({
            year: z.number(),
            month: z.number().describe('Lunar month (1-12)'),
            day: z.number().describe('Lunar day (1-30)'),
            isLeap: z.boolean().optional().describe('Whether it is a leap month')
        })
    ]).optional().describe('Lunar conversion. If true, converts date to lunar; if an object is provided, converts lunar to Gregorian'),
    arithmetic: z.array(z.object({
        action: z.enum(['add', 'subtract']),
        value: z.number(),
        unit: z.enum(['year', 'month', 'week', 'day', 'hour', 'minute', 'second'])
    })).optional().describe('Sequence of date arithmetic operations')
});

export type ToolArgs = z.infer<typeof InputSchema>;