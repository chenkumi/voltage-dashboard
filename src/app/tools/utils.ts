import z, { ZodError } from 'zod';
export const ValidationError = (inputSchema:any, error:ZodError) =>{    
    return {
        status: 'error',
        message: 'ARGUMENTS FORMAT ERROR',
        errors: z.treeifyError(error),
        inputSchema:zodToJsonSchema(inputSchema),
    };
}

export const zodToJsonSchema = (obj:z.ZodObject) =>{
    const rawSchema = z.toJSONSchema(obj);
    const {type, required, properties, description, additionalProperties} = rawSchema;
    return {type, required, properties, description, additionalProperties};
}

export const jsonSchemaToZod = (schema:any):z.ZodType =>{
    return z.fromJSONSchema(schema);
}