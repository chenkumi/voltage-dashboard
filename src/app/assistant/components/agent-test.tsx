import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldTitle } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { AgentCommon } from "../../agent/agent-common";
import { Agent } from "../../agent/agent-impl-openai";
import { ModelMessageContentView} from "../../types";

const agent = new Agent("agent-test");

export const AgentTest = ()=>{
    const [reply, setReply] = useState("");
    const [loading, setLoading] = useState(false);

    const execute = (formData:FormData)=>{
        const system_instruction = (formData.get("system_instruction")?.toString()) ?? "";
        const prompt = (formData.get("prompt")?.toString()) ?? "";

        console.log("form:" , {system_instruction, prompt});

        agent.setSystemInstruction(system_instruction);

        const inputMsg:ModelMessageContentView= {
            id:"I01", 
            msgId:"M01",
            role:'user', 
            content:{id:"M01", text:prompt}};

            setLoading(true);

        agent.generate({
            threadId: AgentCommon.genId(),
            msgId: AgentCommon.genId(),
            segmentId: AgentCommon.genId(),
            historyMessages: [],
            inputMessage: inputMsg,
        }).then(result=>{
            setLoading(false);
            const replyText = (result.content?.text) ?? "";
            setReply(replyText);
        });



    }
    return <div className="flex flex-col gap-12 px-4 py-3">
        <form action={execute}>
        <FieldGroup>
            <Field>
                <FieldTitle>System Instruction</FieldTitle>
                <Textarea className="h-40" name="system_instruction"/>
            </Field>

            <Field>
                <FieldTitle>Prompt</FieldTitle>
                <Textarea className="h-40" name="prompt"/>
            </Field>

            {/* <FieldSeparator/> */}

            <Field orientation="horizontal">
                {
                    loading ? <Spinner /> : <Button type="submit">Submit</Button>
                }
            </Field>

            
        </FieldGroup>

        </form>

        <FieldGroup>
            <Field>
                <FieldTitle>Output</FieldTitle>
                <Textarea className="h-80" value={reply} onChange={e=>setReply(e.target.value)}/>
            </Field>
        </FieldGroup>
        
        
        
    </div>
};
