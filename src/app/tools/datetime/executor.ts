import { AgentExecutorProps } from "@/app/agent/agent-common";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { formatLunar, toGregorian, toLunar } from "lunar";
import { ToolArgs } from "./types";

// Extend dayjs plugins
dayjs.extend(utc);
dayjs.extend(timezone);

export async function executor(
    _props: AgentExecutorProps,
    input: ToolArgs,
) {
    try {
        let currentDayjs: dayjs.Dayjs;
        const tz = input.timezone || dayjs.tz.guess();

        // 1. Handle input date
        if (input.now) {
            currentDayjs = dayjs();
        } else if (input.lunar && typeof input.lunar === 'object') {
            // Lunar to Gregorian
            const { date } = toGregorian({
                year: input.lunar.year,
                month: input.lunar.month,
                day: input.lunar.day,
                isLeapMonth: input.lunar.isLeap || false
            }, { timezone: tz });
            currentDayjs = dayjs(date).tz(tz);
        } else {
            // Standard date handling
            currentDayjs = input.date ? dayjs(input.date) : dayjs();
        }

        if (!currentDayjs.isValid()) {
            throw new Error("Invalid date input");
        }

        // 2. Handle arithmetic operations
        if (input.arithmetic && input.arithmetic.length > 0) {
            for (const op of input.arithmetic) {
                if (op.action === 'add') {
                    currentDayjs = currentDayjs.add(op.value, op.unit);
                } else {
                    currentDayjs = currentDayjs.subtract(op.value, op.unit);
                }
            }
        }

        // 3. Handle timezone conversion
        if (input.timezone) {
            currentDayjs = currentDayjs.tz(input.timezone);
        }

        const finalTz = input.timezone || tz;

        // 4. Prepare result
        const result: any = {
            status: 'ok',
            gregorian: {
                date: currentDayjs.toISOString(),
                formatted: currentDayjs.format(input.format || "YYYY-MM-DD HH:mm:ss"),
                timestamp: currentDayjs.valueOf(),
                unix: currentDayjs.unix(),
                timezone: finalTz,
            }
        };

        // 5. Gregorian to Lunar
        if (input.lunar === true || (typeof input.lunar === 'object')) {
            const { lunar } = toLunar(currentDayjs.toDate(), { timezone: finalTz });
            
            result.lunar = {
                year: lunar.year,
                month: lunar.month,
                day: lunar.day,
                isLeap: lunar.isLeapMonth,
                string: formatLunar(lunar, { prefix: false }),
                fullString: formatLunar(lunar, { zodiac: true }),
            };
        }

        return result;
    } catch (error: any) {
        return {
            status: 'error',
            message: error.message || "An error occurred during date processing"
        };
    }
}