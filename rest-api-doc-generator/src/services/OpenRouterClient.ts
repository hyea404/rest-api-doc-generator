import axios, { AxiosInstance, AxiosError } from 'axios';

/**
 * OpenRouter API Client
 * Handles communication dengan Gemma 3 12B-IT model via OpenRouter
 */
export class OpenRouterClient {
    private apiKey: string;
    private baseURL: string = 'https://openrouter.ai/api/v1';
    private model: string = 'google/gemma-3-12b-it:free';
    private client: AxiosInstance;
    private timeout: number = 30000; // 30 seconds (NF1: should be < 30s for actual inference)
    private maxRetries: number = 3;

    constructor(apiKey: string, model?: string) {
        this.apiKey = apiKey;
        if (model) {
            this.model = model;
        }

        // Create axios instance
        this.client = axios.create({
            baseURL: this.baseURL,
            timeout: this.timeout,
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://github.com/rest-api-doc-generator',
                'X-Title': 'REST API Doc Generator'
            }
        });
    }

    /**
     * Send prompt to Gemma model dan terima response
     */
    async generateDocumentation(
        codeSnippet: string,
        routeInfo?: string
    ): Promise<string> {
        const prompt = this.buildPrompt(codeSnippet, routeInfo);

        try {
            console.log('🤖 Sending request to OpenRouter...');
            const startTime = Date.now();

            const response = await this.sendRequestWithRetry({
                model: this.model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert API documentation assistant. Generate clear, accurate OpenAPI 3.1 documentation based on Express.js code.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3, // Lower for more consistent output
                max_tokens: 2000
            });

            const endTime = Date.now();
            const duration = endTime - startTime;

            console.log(`✅ Response received in ${duration}ms`);

            // Extract content from response
            const content = response.data.choices[0]?.message?.content;
            
            if (!content) {
                throw new Error('Empty response from AI model');
            }

            return content;

        } catch (error) {
            console.error('❌ OpenRouter API error:', error);
            throw this.handleError(error);
        }
    }

    /**
     * Build prompt untuk AI model
     */
    private buildPrompt(codeSnippet: string, routeInfo?: string): string {
        let prompt = `Generate OpenAPI 3.1 documentation for the following Express.js route:\n\n`;
        
        if (routeInfo) {
            prompt += `Route Information:\n${routeInfo}\n\n`;
        }

        prompt += `Code:\n\`\`\`javascript\n${codeSnippet}\n\`\`\`\n\n`;
        
        prompt += `Please provide:
1. Endpoint path and HTTP method
2. Description of what the endpoint does
3. Request parameters (path, query, body) with types
4. Response schemas with status codes
5. Format output as valid OpenAPI 3.1 YAML

Only return the YAML content, no additional explanation.`;

        return prompt;
    }

    /**
     * Send request dengan retry logic
     */
    private async sendRequestWithRetry(payload: any, retryCount: number = 0): Promise<any> {
        try {
            const response = await this.client.post('/chat/completions', payload);
            return response;
        } catch (error) {
            if (retryCount < this.maxRetries && this.isRetryableError(error)) {
                console.warn(`⚠️ Request failed, retrying... (${retryCount + 1}/${this.maxRetries})`);
                
                // Exponential backoff
                const delay = Math.pow(2, retryCount) * 1000;
                await this.sleep(delay);
                
                return this.sendRequestWithRetry(payload, retryCount + 1);
            }
            
            throw error;
        }
    }

    /**
     * Check if error is retryable
     */
    private isRetryableError(error: any): boolean {
        if (axios.isAxiosError(error)) {
            const status = error.response?.status;
            // Retry on 429 (rate limit), 500, 502, 503, 504
            return status === 429 || (status !== undefined && status >= 500);
        }
        return false;
    }

    /**
     * Handle errors dari API
     */
    private handleError(error: any): Error {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError;
            
            if (axiosError.response) {
                const status = axiosError.response.status;
                const data = axiosError.response.data as any;
                
                switch (status) {
                    case 401:
                        return new Error('Invalid API key. Please check your OpenRouter API key.');
                    case 429:
                        return new Error('Rate limit exceeded. Please try again later.');
                    case 500:
                    case 502:
                    case 503:
                    case 504:
                        return new Error(`OpenRouter server error (${status}). Please try again.`);
                    default:
                        return new Error(`API error: ${data.error?.message || 'Unknown error'}`);
                }
            } else if (axiosError.request) {
                return new Error('Network error. Please check your internet connection.');
            }
        }

        return new Error(`Unexpected error: ${error.message}`);
    }

    /**
     * Sleep utility untuk retry delay
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Test API connection
     */
    async testConnection(): Promise<boolean> {
        try {
            console.log('🧪 Testing OpenRouter connection...');
            console.log('🧪 Using model:', this.model);
            console.log('🧪 Timeout:', this.timeout, 'ms');
            
            const response = await this.client.post('/chat/completions', {
                model: this.model,
                messages: [
                    {
                        role: 'user',
                        content: 'Hi'
                    }
                ],
                max_tokens: 10, // Very small for quick test
                temperature: 1.0
            });

            console.log('✅ Response received:', response.status);
            console.log('✅ Response data:', response.data);

            const hasContent = response.data.choices?.[0]?.message?.content;
            
            if (hasContent) {
                console.log('✅ Connection test successful!');
                console.log('✅ Model response:', hasContent);
                return true;
            }
            
            console.warn('⚠️ Response received but no content');
            return false;

        } catch (error) {
            console.error('❌ Connection test failed:', error);
            
            if (axios.isAxiosError(error)) {
                console.error('❌ Error details:');
                console.error('   - Code:', error.code);
                console.error('   - Message:', error.message);
                console.error('   - Status:', error.response?.status);
                console.error('   - Response:', error.response?.data);
            }
            
            throw error; // Re-throw untuk error handling di extension.ts
        }
    }


    /**
     * Set model (untuk switching between Gemma versions)
     */
    setModel(model: string): void {
        this.model = model;
        console.log(`🔄 Model changed to: ${model}`);
    }

    /**
     * Get current model
     */
    getModel(): string {
        return this.model;
    }
}