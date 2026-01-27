import * as vscode from 'vscode';

/**
 * Service untuk manage secure storage of API keys
 * Menggunakan VS Code SecretStorage API
 */
export class SecureStorageService {
    private static readonly OPENROUTER_API_KEY = 'openrouter_api_key';
    private secrets: vscode.SecretStorage;

    constructor(context: vscode.ExtensionContext) {
        this.secrets = context.secrets;
    }

    /**
     * Store OpenRouter API key secara aman
     */
    async storeApiKey(apiKey: string): Promise<void> {
        try {
            await this.secrets.store(SecureStorageService.OPENROUTER_API_KEY, apiKey);
            console.log('✅ API key stored successfully');
        } catch (error) {
            console.error('❌ Failed to store API key:', error);
            throw new Error('Failed to store API key');
        }
    }

    /**
     * Retrieve OpenRouter API key
     */
    async getApiKey(): Promise<string | undefined> {
        try {
            const apiKey = await this.secrets.get(SecureStorageService.OPENROUTER_API_KEY);
            if (!apiKey) {
                console.warn('⚠️ API key not found in storage');
            }
            return apiKey;
        } catch (error) {
            console.error('❌ Failed to retrieve API key:', error);
            throw new Error('Failed to retrieve API key');
        }
    }

    /**
     * Delete OpenRouter API key
     */
    async deleteApiKey(): Promise<void> {
        try {
            await this.secrets.delete(SecureStorageService.OPENROUTER_API_KEY);
            console.log('✅ API key deleted successfully');
        } catch (error) {
            console.error('❌ Failed to delete API key:', error);
            throw new Error('Failed to delete API key');
        }
    }

    /**
     * Check if API key exists
     */
    async hasApiKey(): Promise<boolean> {
        const apiKey = await this.getApiKey();
        return apiKey !== undefined && apiKey.length > 0;
    }
}