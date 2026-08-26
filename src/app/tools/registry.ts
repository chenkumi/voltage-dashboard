import { AgentTool } from "@/app/agent/agent-common";

class ToolRegistry {
    private tools: Map<string, AgentTool> = new Map();

    register(tool: AgentTool) {
        this.tools.set(tool.name, tool);
    }

    get(name: string): AgentTool | undefined {
        return this.tools.get(name);
    }

    list(): AgentTool[] {
        return Array.from(this.tools.values());
    }
}

export const dynamicToolRegistry = new ToolRegistry();
