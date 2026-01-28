/**
 * Interface untuk informasi HTTP method
 */
export enum HttpMethod {
    GET = 'GET',
    POST = 'POST',
    PUT = 'PUT',
    DELETE = 'DELETE',
    PATCH = 'PATCH',
    OPTIONS = 'OPTIONS',
    HEAD = 'HEAD'
}

/**
 * Interface untuk parameter route
 */
export interface RouteParameter {
    name: string;
    type: 'path' | 'query' | 'body';
    required: boolean;
    description?: string;
    dataType?: string; // 'string', 'number', 'boolean', 'object', dll
}

/**
 * Interface untuk response information
 */
export interface RouteResponse {
    statusCode: number;
    description?: string;
    contentType?: string;
    schema?: any; // JSON schema dari response
}

/**
 * Interface untuk middleware info
 */
export interface MiddlewareInfo {
    name: string;
    type: 'auth' | 'validation' | 'custom';
}

/**
 * Main interface untuk Route Information
 */
export interface RouteInfo {
    method: HttpMethod;
    path: string;
    handler: string; // Nama function handler
    description?: string;
    parameters: RouteParameter[];
    responses: RouteResponse[];
    middlewares: MiddlewareInfo[];
    filePath: string; // Path ke file source
    lineNumber?: number;
}

/**
 * Interface untuk hasil scanning
 */
export interface ScanResult {
    routes: RouteInfo[];
    totalFiles: number;
    totalRoutes: number;
    errors: ScanError[];
}

/**
 * Interface untuk error saat scanning
 */
export interface ScanError {
    filePath: string;
    lineNumber?: number;
    message: string;
    error: Error;
}