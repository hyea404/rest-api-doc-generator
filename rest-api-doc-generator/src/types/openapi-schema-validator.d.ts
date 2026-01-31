declare module 'openapi-schema-validator' {
    interface ValidatorOptions {
        version?: number;
        extensions?: Record<string, any>;
    }

    interface ValidationError {
        message: string;
        instancePath?: string;
        dataPath?: string;
        keyword?: string;
        params?: any;
        schemaPath?: string;
    }

    interface ValidationResult {
        errors: ValidationError[];
    }

    class OpenAPISchemaValidator {
        constructor(options: ValidatorOptions);
        validate(schema: any): ValidationResult;
    }

    export = OpenAPISchemaValidator;
}