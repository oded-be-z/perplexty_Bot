// server.js - Backend Server for FinanceBot Pro
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve static files from public directory

// System prompt for the financial assistant
const SYSTEM_PROMPT = `You are FinanceBot Pro, an expert financial assistant specializing in commodity markets, trading, and investment analysis. 

Your capabilities include:
- Providing real-time commodity prices (gold, silver, oil, natural gas, copper)
- Market analysis and trends
- Technical analysis and chart interpretation
- Portfolio recommendations
- Risk assessment
- Economic indicators analysis
- Trading strategies

Always provide accurate, data-driven insights. When discussing prices or market data, cite your sources and mention the timestamp. Be professional yet conversational. If you don't have access to real-time data for a specific query, explain this clearly and provide the most recent information available.

Format your responses with clear structure, using bullet points for lists and bold text for emphasis when appropriate.`;

// Perplexity API configuration
const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';

// Validate API key on startup
function validateApiKey() {
    if (!process.env.PERPLEXITY_API_KEY) {
        console.error('ERROR: PERPLEXITY_API_KEY not found in environment variables');
        return false;
    }
    
    if (!process.env.PERPLEXITY_API_KEY.startsWith('pplx-')) {
        console.error('ERROR: PERPLEXITY_API_KEY appears to be invalid (should start with "pplx-")');
        return false;
    }
    
    console.log('✓ Perplexity API key found and appears valid');
    return true;
}

// Create axios instance with timeout and retry configuration
const perplexityClient = axios.create({
    baseURL: 'https://api.perplexity.ai',
    timeout: 30000, // 30 second timeout
    headers: {
        'Content-Type': 'application/json'
    }
});

// Add request interceptor to include auth header
perplexityClient.interceptors.request.use((config) => {
    config.headers['Authorization'] = `Bearer ${process.env.PERPLEXITY_API_KEY}`;
    return config;
});

// Add response interceptor for better error handling
perplexityClient.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.code === 'ECONNABORTED') {
            console.error('Perplexity API request timed out');
            error.message = 'Request timed out - please try again';
        } else if (error.code === 'ECONNRESET' || error.message.includes('socket hang up')) {
            console.error('Connection to Perplexity API was reset');
            error.message = 'Connection error - please check your API key and try again';
        } else if (error.response?.status === 401) {
            console.error('Perplexity API authentication failed - check your API key');
            error.message = 'Invalid API key - please check your Perplexity API key';
        } else if (error.response?.status === 429) {
            console.error('Perplexity API rate limit exceeded');
            error.message = 'Rate limit exceeded - please try again later';
        }
        return Promise.reject(error);
    }
);

// Health check endpoint
app.get('/api/health', (req, res) => {
    const apiKeyValid = validateApiKey();
    res.json({ 
        status: apiKeyValid ? 'OK' : 'WARNING', 
        message: apiKeyValid ? 'FinanceBot Pro API is running' : 'API running but Perplexity API key may be invalid',
        timestamp: new Date().toISOString(),
        apiKeyConfigured: !!process.env.PERPLEXITY_API_KEY
    });
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { message, conversationHistory = [] } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Check API key before making request
        if (!process.env.PERPLEXITY_API_KEY) {
            return res.status(500).json({
                success: false,
                error: 'API key not configured',
                message: 'Perplexity API key is not configured. Please check your environment variables.'
            });
        }

        // Prepare messages for Perplexity API
        const messages = [
            {
                role: 'system',
                content: SYSTEM_PROMPT
            },
            ...conversationHistory.map(msg => ({
                role: msg.role,
                content: msg.content
            })),
            {
                role: 'user',
                content: message
            }
        ];

        console.log('Making request to Perplexity API...');

        // Call Perplexity API with improved error handling
        const response = await perplexityClient.post('/chat/completions', {
            model: 'llama-3.1-sonar-large-128k-online',
            messages: messages,
            temperature: 0.7,
            max_tokens: 1500,
            stream: false
        });

        // Extract the assistant's response
        const assistantMessage = response.data.choices[0].message.content;

        console.log('✓ Successfully received response from Perplexity API');

        res.json({
            success: true,
            message: assistantMessage,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Chat API Error:', error.message);
        
        let errorMessage = 'An error occurred while processing your request';
        let statusCode = 500;

        if (error.message.includes('Invalid API key')) {
            errorMessage = 'Invalid Perplexity API key. Please check your configuration.';
            statusCode = 401;
        } else if (error.message.includes('Connection error')) {
            errorMessage = 'Unable to connect to Perplexity API. Please check your internet connection and API key.';
            statusCode = 503;
        } else if (error.message.includes('Rate limit exceeded')) {
            errorMessage = 'API rate limit exceeded. Please try again in a few moments.';
            statusCode = 429;
        } else if (error.message.includes('Request timed out')) {
            errorMessage = 'Request timed out. Please try again.';
            statusCode = 408;
        }
        
        res.status(statusCode).json({
            success: false,
            error: 'Chat API Error',
            message: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Commodity prices endpoint (can integrate with real data sources)
app.get('/api/commodities', async (req, res) => {
    try {
        // In production, you would fetch real-time data from financial APIs
        // For now, returning structured data that can be easily replaced
        const commodityData = {
            gold: {
                symbol: 'GOLD',
                name: 'Gold',
                price: 2050.30,
                change: 12.50,
                changePercent: 0.61,
                unit: 'USD per ounce',
                lastUpdate: new Date().toISOString()
            },
            silver: {
                symbol: 'SILVER',
                name: 'Silver',
                price: 23.45,
                change: -0.15,
                changePercent: -0.64,
                unit: 'USD per ounce',
                lastUpdate: new Date().toISOString()
            },
            oil: {
                symbol: 'WTI',
                name: 'WTI Crude Oil',
                price: 78.25,
                change: 1.20,
                changePercent: 1.56,
                unit: 'USD per barrel',
                lastUpdate: new Date().toISOString()
            },
            brent: {
                symbol: 'BRENT',
                name: 'Brent Crude Oil',
                price: 82.50,
                change: 1.35,
                changePercent: 1.66,
                unit: 'USD per barrel',
                lastUpdate: new Date().toISOString()
            },
            naturalGas: {
                symbol: 'NATGAS',
                name: 'Natural Gas',
                price: 2.85,
                change: -0.08,
                changePercent: -2.73,
                unit: 'USD per MMBtu',
                lastUpdate: new Date().toISOString()
            },
            copper: {
                symbol: 'COPPER',
                name: 'Copper',
                price: 4.25,
                change: 0.05,
                changePercent: 1.19,
                unit: 'USD per pound',
                lastUpdate: new Date().toISOString()
            }
        };

        res.json({
            success: true,
            data: commodityData,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Commodities API Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch commodity data'
        });
    }
});

// Market analysis endpoint
app.post('/api/analyze', async (req, res) => {
    try {
        const { commodity, timeframe = '1D' } = req.body;

        // Check API key before making request
        if (!process.env.PERPLEXITY_API_KEY) {
            return res.status(500).json({
                success: false,
                error: 'API key not configured',
                message: 'Perplexity API key is not configured. Please check your environment variables.'
            });
        }

        // Create a specific analysis request for Perplexity
        const analysisPrompt = `Provide a technical and fundamental analysis for ${commodity} with a ${timeframe} timeframe. Include:
        1. Current market trends
        2. Key support and resistance levels
        3. Important news or events affecting the price
        4. Short-term outlook
        5. Trading recommendation`;

        console.log('Making analysis request to Perplexity API...');

        const response = await perplexityClient.post('/chat/completions', {
            model: 'llama-3.1-sonar-small-128k-online',
            messages: [
                {
                    role: 'system',
                    content: 'You are a professional financial analyst providing market analysis.'
                },
                {
                    role: 'user',
                    content: analysisPrompt
                }
            ],
            temperature: 0.7,
            max_tokens: 1000
        });

        console.log('✓ Successfully received analysis from Perplexity API');

        res.json({
            success: true,
            analysis: response.data.choices[0].message.content,
            commodity: commodity,
            timeframe: timeframe,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Analysis API Error:', error.message);
        
        let errorMessage = 'Failed to generate market analysis';
        let statusCode = 500;

        if (error.message.includes('Invalid API key')) {
            errorMessage = 'Invalid Perplexity API key. Please check your configuration.';
            statusCode = 401;
        } else if (error.message.includes('Connection error')) {
            errorMessage = 'Unable to connect to Perplexity API. Please check your internet connection and API key.';
            statusCode = 503;
        }

        res.status(statusCode).json({
            success: false,
            error: 'Analysis API Error',
            message: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Serve the frontend app for any unmatched routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`FinanceBot Pro server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Validate API key on startup
    validateApiKey();
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    app.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
});