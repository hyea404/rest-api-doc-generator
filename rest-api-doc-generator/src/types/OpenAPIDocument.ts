/**
 * OpenAPI 3.1 Document Structure
 */
export interface OpenAPIDocument {
    openapi: string;
    info: OpenAPIInfo;
    servers?: OpenAPIServer[];
    paths: OpenAPIPaths;
    components?: OpenAPIComponents;
    tags?: OpenAPITag[];
}

export interface OpenAPIInfo {
    title: string;
    version: string;
    description?: string;
    contact?: {
        name?: string;
        email?: string;
        url?: string;
    };
    license?: {
        name: string;
        url?: string;
    };
}

export interface OpenAPIServer {
    url: string;
    description?: string;
}

export interface OpenAPIPaths {
    [path: string]: OpenAPIPathItem;
}

export interface OpenAPIPathItem {
    get?: OpenAPIOperation;
    post?: OpenAPIOperation;
    put?: OpenAPIOperation;
    delete?: OpenAPIOperation;
    patch?: OpenAPIOperation;
    options?: OpenAPIOperation;
    head?: OpenAPIOperation;
}

export interface OpenAPIOperation {
    summary?: string;
    description?: string;
    operationId?: string;
    tags?: string[];
    parameters?: OpenAPIParameter[];
    requestBody?: OpenAPIRequestBody;
    responses: OpenAPIResponses;
    security?: any[];
}

export interface OpenAPIParameter {
    name: string;
    in: 'path' | 'query' | 'header' | 'cookie';
    description?: string;
    required?: boolean;
    schema: {
        type: string;
        format?: string;
        enum?: any[];
    };
}

export interface OpenAPIRequestBody {
    description?: string;
    required?: boolean;
    content: {
        [mediaType: string]: {
            schema: any;
        };
    };
}

export interface OpenAPIResponses {
    [statusCode: string]: {
        description: string;
        content?: {
            [mediaType: string]: {
                schema: any;
            };
        };
    };
}

export interface OpenAPIComponents {
    schemas?: {
        [name: string]: any;
    };
    securitySchemes?: {
        [name: string]: any;
    };
}

export interface OpenAPITag {
    name: string;
    description?: string;
}