import { AgentExecutorProps } from "@/app/agent/agent-common";
import { toolPartial, toolSucceed } from "../shared/response";
import { ToolArgs } from "./types";

/**
 * 驗證是否為有效的 IANA 時區字串
 */
const isValidTimezone = (tz: string): boolean => {
    try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
    } catch (e) {
        return false;
    }
};

export async function executor(
    _props: AgentExecutorProps,
    input: ToolArgs,
) {
    const { cmd, args = [] } = input;
    const errorArgs: Record<string, string> = {};
    const resultPayload: any = {};

    switch (cmd) {
        case 'CURRENT_TIME':
            let date = new Date();
            let targetTimezone: string | undefined = undefined;
            const appliedOffsets: string[] = [];

            for (const arg of args) {
                const offsetMatch = arg.match(/^([yMdhms])([+-])(\d+)$/);

                if (offsetMatch) {
                    const [_, unit, operator, valueStr] = offsetMatch;
                    const value = parseInt(valueStr) * (operator === '+' ? 1 : -1);
                    switch (unit) {
                        case 'y': date.setFullYear(date.getFullYear() + value); break;
                        case 'M': date.setMonth(date.getMonth() + value); break;
                        case 'd': date.setDate(date.getDate() + value); break;
                        case 'h': date.setHours(date.getHours() + value); break;
                        case 'm': date.setMinutes(date.getMinutes() + value); break;
                        case 's': date.setSeconds(date.getSeconds() + value); break;
                    }
                    appliedOffsets.push(arg);
                } else if (isValidTimezone(arg)) {
                    // 驗證成功才賦值，且後面的時區會覆蓋前面的
                    targetTimezone = arg;
                } else {
                    // 無法辨識為偏移量也非合法時區
                    errorArgs[arg] = "無效的參數格式：既非合法時間偏移 (如 d+1) 也非有效的 IANA 時區字串。";
                }
            }

            const options: Intl.DateTimeFormatOptions = {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
                hour12: false,
                timeZone: targetTimezone
            };

            Object.assign(resultPayload, {
                value: date.toLocaleString('zh-TW', options),
                timezone: targetTimezone || "System Local",
                applied_offsets: appliedOffsets
            });
            break;

        case 'OS':
            if (args.length > 0) args.forEach(a => errorArgs[a] = "OS 指令不支援任何參數。");
            Object.assign(resultPayload, {
                platform: process.platform,
                arch: process.arch,
                // uptime: `${(os.uptime() / 3600).toFixed(2)}h`
            });
            break;

        // case 'PWD':
        //     if (args.length > 0) args.forEach(a => errorArgs[a] = "PWD 指令不支援任何參數。");
        //     resultPayload.cwd = process.cwd();
        //     break;

        // case 'USER':
        //     if (args.length > 0) args.forEach(a => errorArgs[a] = "USER 指令不支援任何參數。");
        //     const user = os.userInfo();
        //     Object.assign(resultPayload, { username: user.username, homedir: user.homedir });
        //     break;
    }

    // console.log("systemEnv cmd:" + cmd + " args:" + JSON.stringify(args));
    // console.log("systemEnv cmd:" + cmd + " resultPayload:" + JSON.stringify(resultPayload));
    // if (Object.keys(errorArgs).length > 0) {
    //     console.log("systemEnv cmd:" + cmd + " errorArgs:" + JSON.stringify(errorArgs));
    // }


    // 統一回傳結構
    if (Object.keys(errorArgs).length > 0) {
        return toolPartial(
            "系統資訊已取得，但部分參數無效。",
            {
                ...resultPayload,
                errorArgs,
            },
            "忽略無效參數並使用目前結果，或修正 args 後重新呼叫 systemEnv。",
            {
                type: "PARTIAL_ARGUMENT_ERROR",
                detail: "部分附加參數無法解析。",
                retryable: true,
            },
        );
    }

    return toolSucceed(
        "系統資訊取得成功。",
        resultPayload,
        "根據 data 內容繼續下一步。",
    );
}
