import axios from 'axios';

async function testOpenRouter() {
    const API_KEY = 'sk-or-v1-PLACEHOLDER';
    const url = 'https://openrouter.ai/api/v1/chat/completions';
    
    try {
        console.log('Testing OpenRouter API...');
        
        const response = await axios.post(url, {
            model: 'google/gemma-3-12b-it',
            messages: [
                {
                    role: 'user',
                    content: 'Generate OpenAPI documentation for a simple GET /users endpoint'
                }
            ]
        }, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000 // 10 second timeout
        });
        
        console.log('✅ API Test Success!');
        console.log('Model:', response.data.model);
        console.log('Response:', response.data.choices[0].message.content);
        
    } catch (error: any) {
        console.error('❌ API Test Failed!');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Error:', error.response.data);
        } else {
            console.error('Error:', error.message);
        }
    }
}

testOpenRouter();