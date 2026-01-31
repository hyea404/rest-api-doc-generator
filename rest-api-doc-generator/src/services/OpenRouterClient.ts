import axios, { AxiosInstance, AxiosError } from 'axios';
import { PromptBuilder } from '../utils/PromptBuilder';
import { RouteInfo } from '../types/RouteInfo';

/**
 * OpenRouter API Client
 * Handles communication dengan Gemma 3 12B-IT model via OpenRouter
 */
export class OpenRouterClient {
    private apiKey: string;
    private baseURL: string = 'https://openrouter.ai/api/v1';
    private model: string = 'google/gemma-3-12b-it:free';
    private client: AxiosInstance;
    private timeout: number = 60000; // 60 seconds (NF1: should be <= 60s for actual inference)
    private maxRetries: number = 3;

    constructor(apiKey: string, model?: string) {
        this.apiKey = apiKey;
        
        // Try different model names (in order of preference)
        const modelOptions = [
            'google/gemma-3-12b-it:free',
            'google/gemma-2-9b-it:free', 
            'google/gemma-2-9b-it',
            'meta-llama/llama-3.2-3b-instruct:free'
        ];
        
        this.model = model || modelOptions[0];

        // Create axios instance
        this.client = axios.create({
            baseURL: this.baseURL,
            timeout: this.timeout,
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                // 'HTTP-Referer': 'https://github.com/rest-api-doc-generator', // COMMENT OUT
                // 'X-Title': 'REST API Doc Generator' // COMMENT OUT
            }
        });

    }


    /**
     * Generate documentation untuk single route
     */
    async generateDocumentation(
        route: RouteInfo,
        codeSnippet?: string
    ): Promise<string> {
        const prompt = PromptBuilder.buildRoutePrompt(route, codeSnippet);

        try {
            console.log('🤖 Generating documentation for:', route.method, route.path);
            const startTime = Date.now();

            const response = await this.sendRequestWithRetry({
                model: this.model,
                messages: [
                    {
                        role: 'user',
                        content: `
                        You are an expert API documentation assistant.
                        Generate clear, accurate OpenAPI 3.1 documentation.

                        ${prompt}
                        `
                    }
                ],
                temperature: 0.2, // Very low for consistency
                max_tokens: 2000
            });

            const endTime = Date.now();
            const duration = endTime - startTime;
            console.log(`✅ Documentation generated in ${duration}ms`);

            // Extract content
            const content = response.data.choices[0]?.message?.content;
            
            if (!content) {
                throw new Error('Empty response from AI model');
            }

            // Extract YAML and validate
            const yaml = PromptBuilder.extractYAML(content);
            const validation = PromptBuilder.validateResponse(yaml);

            if (!validation.isValid) {
                console.warn('⚠️ AI response validation warnings:', validation.errors);
            }

            return yaml;

        } catch (error) {
            console.error('❌ OpenRouter API error:', error);
            throw this.handleError(error);
        }
    }

    /**
     * Generate documentation untuk multiple routes sekaligus
     */
    async generateBatchDocumentation(routes: RouteInfo[]): Promise<string> {
        const prompt = PromptBuilder.buildMultipleRoutesPrompt(routes);

        try {
            console.log(`🤖 Generating documentation for ${routes.length} routes...`);
            const startTime = Date.now();

            const response = await this.sendRequestWithRetry({
                model: this.model,
                messages: [
                    {
                        role: 'user',
                        content: `
                        You are an expert API documentation assistant.
                        Generate clear, accurate OpenAPI 3.1 documentation
                        for multiple Express.js routes.

                        ${prompt}
                        `
                    }
                ],
                temperature: 0.2,
                max_tokens: 4000 // More tokens for multiple routes
            });

            const endTime = Date.now();
            const duration = endTime - startTime;
            console.log(`✅ Batch documentation generated in ${duration}ms`);

            const content = response.data.choices[0]?.message?.content;
            
            if (!content) {
                throw new Error('Empty response from AI model');
            }

            return PromptBuilder.extractYAML(content);

        } catch (error) {
            console.error('❌ Batch generation error:', error);
            throw this.handleError(error);
        }
    }

    /**
     * Send request dengan retry logic
     */
    private async sendRequestWithRetry(payload: any, retryCount: number = 0): Promise<any> {
        try {
            // LOG PAYLOAD YANG DIKIRIM
            console.log('📤 Request Payload:', JSON.stringify(payload, null, 2));
            
            const response = await this.client.post('/chat/completions', payload);
            
            // LOG RESPONSE
            console.log('📥 Response Status:', response.status);
            console.log('📥 Response Data:', JSON.stringify(response.data, null, 2));
            
            return response;
        } catch (error) {
            // LOG ERROR DETAILS
            if (axios.isAxiosError(error) && error.response) {
                console.error('❌ Error Response:', JSON.stringify(error.response.data, null, 2));
            }
            
            if (retryCount < this.maxRetries && this.isRetryableError(error)) {
                console.warn(`⚠️ Request failed, retrying... (${retryCount + 1}/${this.maxRetries})`);
                
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
                
                // LOG DETAIL ERROR
                console.error('❌ OpenRouter Error Details:');
                console.error('   Status:', status);
                console.error('   Data:', JSON.stringify(data, null, 2));
                
                switch (status) {
                    case 400:
                        return new Error(`Bad Request: ${JSON.stringify(data)}`);
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
                        return new Error(`API error: ${data.error?.message || JSON.stringify(data)}`);
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
            
            const response = await this.client.post('/chat/completions', {
                model: this.model,
                messages: [
                    {
                        role: 'user',
                        content: 'Say hello in one word'
                    }
                ]
                // Remove temperature, max_tokens untuk test basic
            });

            console.log('✅ Raw response:', JSON.stringify(response.data, null, 2));

            const hasContent = response.data.choices?.[0]?.message?.content;
            
            if (hasContent) {
                console.log('✅ Connection test successful!');
                console.log('✅ Response:', hasContent);
                return true;
            }
            
            return false;

        } catch (error) {
            console.error('❌ Connection test failed:', error);
            
            // Log detailed error
            if (axios.isAxiosError(error) && error.response) {
                console.error('❌ Error Status:', error.response.status);
                console.error('❌ Error Data:', JSON.stringify(error.response.data, null, 2));
            }
            
            return false;
        }
    }

    /**
     * Get available models from OpenRouter
     */
    async getAvailableModels(): Promise<any> {
        try {
            const response = await this.client.get('/models');
            return response.data;
        } catch (error) {
            console.error('❌ Failed to get models:', error);
            throw error;
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