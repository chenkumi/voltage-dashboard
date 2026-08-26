import { AgentExecutorProps } from "@/app/agent/agent-common";
import { ToolArgs } from "./types";

export async function executor(
    _props: AgentExecutorProps,
    input: ToolArgs,
) {
    try {
        if (input.mode === 'range') {
            const min = input.min ?? 1;
            const max = input.max ?? 100;
            const count = input.count ?? 1;
            const unique = input.unique ?? false;

            if (min > max) throw new Error("Minimum value cannot be greater than maximum value");
            if (unique && count > (max - min + 1)) {
                throw new Error("Insufficient numbers in range to generate requested count of unique random numbers");
            }

            const results: number[] = [];
            if (unique) {
                const pool: number[] = [];
                for (let i = min; i <= max; i++) pool.push(i);
                for (let i = 0; i < count; i++) {
                    const idx = Math.floor(Math.random() * pool.length);
                    results.push(pool.splice(idx, 1)[0]);
                }
            } else {
                for (let i = 0; i < count; i++) {
                    results.push(Math.floor(Math.random() * (max - min + 1)) + min);
                }
            }

            return {
                status: 'ok',
                mode: 'range',
                results,
                summary: `Randomly selected ${count} numbers between ${min} and ${max}`
            };
        } else if (input.mode === 'choice') {
            const options = input.options;
            if (!options || options.length === 0) throw new Error("Options list must be provided");
            
            const count = input.count ?? 1;
            const weights = input.weights;
            const replacement = input.replacement ?? true;

            if (weights && weights.length !== options.length) {
                throw new Error("Weight list length must match options list length");
            }

            if (!replacement && count > options.length) {
                throw new Error("Insufficient options to select requested count without duplicates");
            }

            const results: string[] = [];
            const tempOptions = [...options];
            const tempWeights = weights ? [...weights] : Array(options.length).fill(1);

            for (let i = 0; i < count; i++) {
                const totalWeight = tempWeights.reduce((a, b) => a + b, 0);
                if (totalWeight <= 0) throw new Error("Total weight must be greater than zero");

                let r = Math.random() * totalWeight;
                let selectedIdx = -1;
                for (let j = 0; j < tempWeights.length; j++) {
                    r -= tempWeights[j];
                    if (r <= 0) {
                        selectedIdx = j;
                        break;
                    }
                }

                if (selectedIdx === -1) selectedIdx = tempWeights.length - 1;

                results.push(tempOptions[selectedIdx]);

                if (!replacement) {
                    tempOptions.splice(selectedIdx, 1);
                    tempWeights.splice(selectedIdx, 1);
                }
            }

            return {
                status: 'ok',
                mode: 'choice',
                results,
                summary: `Selected ${count} results from ${options.length} options based on weights`
            };
        }

        throw new Error("Unknown random mode");
    } catch (error: any) {
        return {
            status: 'error',
            message: error.message || "An error occurred while generating random numbers"
        };
    }
}