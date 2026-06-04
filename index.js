/**
 * Traffic Shaper - Ultra-lightweight in-memory Rate Limiter
 * Middleware for Express/Fastify to limit requests based on IP or token
 */

/**
 * In-memory store for tracking requests
 */
class MemoryStore {
    constructor() {
        this.clients = new Map();
        // Periodic cleanup to remove old records
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 60000); // Cleanup every minute
    }

    /**
     * Increments the counter for a client
     * @param {string} key - Client key (IP or token)
     * @param {number} windowMs - Time window in milliseconds
     * @returns {Object} Rate limit information
     */
    increment(key, windowMs) {
        const now = Date.now();
        const windowStart = now - windowMs;

        if (!this.clients.has(key)) {
            this.clients.set(key, {
                requests: [],
                resetTime: now + windowMs
            });
        }

        const client = this.clients.get(key);

        // Remove requests outside the time window
        client.requests = client.requests.filter(timestamp => timestamp > windowStart);

        // Add the current request
        client.requests.push(now);
        client.resetTime = now + windowMs;

        return {
            totalRequests: client.requests.length,
            resetTime: client.resetTime
        };
    }

    /**
     * Cleans up expired records
     */
    cleanup() {
        const now = Date.now();
        for (const [key, client] of this.clients.entries()) {
            if (client.requests.length === 0 || client.resetTime < now) {
                this.clients.delete(key);
            }
        }
    }

    /**
     * Destroys the store and clears the interval
     */
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.clients.clear();
    }
}

/**
 * Creates a rate limiter middleware
 * @param {Object} options - Configuration options
 * @param {number} options.windowMs - Time window in milliseconds (default: 15 minutes)
 * @param {number} options.max - Maximum requests per window (default: 100)
 * @param {string} options.message - Custom error message
 * @param {boolean} options.skipSuccessfulRequests - Skip requests with status < 400
 * @param {boolean} options.skipFailedRequests - Skip requests with status >= 400
 * @param {Function} options.keyGenerator - Function to generate custom key
 * @returns {Function} Middleware function
 */
function createRateLimiter(options = {}) {
    const config = {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100,
        message: {
            error: 'Too Many Requests',
            message: 'Rate limit exceeded. Please try again later.',
            retryAfter: 0
        },
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
        keyGenerator: null,
        ...options
    };

    const store = new MemoryStore();

    return function rateLimiter(req, res, next) {
        try {
            // Generate key to identify the client
            const key = config.keyGenerator
                ? config.keyGenerator(req)
                : getClientKey(req);

            // Increment the counter
            const result = store.increment(key, config.windowMs);

            // Informative headers
            const remaining = Math.max(0, config.max - result.totalRequests);
            const resetTime = Math.ceil(result.resetTime / 1000);
            const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);

            res.setHeader('X-RateLimit-Limit', config.max);
            res.setHeader('X-RateLimit-Remaining', remaining);
            res.setHeader('X-RateLimit-Reset', resetTime);

            // Check if the limit is exceeded
            if (result.totalRequests > config.max) {
                res.setHeader('Retry-After', retryAfter);

                const errorResponse = typeof config.message === 'string'
                    ? { error: config.message, retryAfter }
                    : { ...config.message, retryAfter };

                return res.status(429).json(errorResponse);
            }

            // Skip logic for successful/failed requests
            if (config.skipSuccessfulRequests || config.skipFailedRequests) {
                const originalEnd = res.end;
                res.end = function (...args) {
                    const statusCode = res.statusCode;
                    const shouldSkip = (config.skipSuccessfulRequests && statusCode < 400) ||
                        (config.skipFailedRequests && statusCode >= 400);

                    if (shouldSkip) {
                        // Decrement the counter if the request is skipped
                        const client = store.clients.get(key);
                        if (client && client.requests.length > 0) {
                            client.requests.pop();
                        }
                    }

                    originalEnd.apply(this, args);
                };
            }

            next();
        } catch (error) {
            // In case of error, continue with the request
            next();
        }
    };
}

/**
 * Extracts the client key from the request
 * @param {Object} req - Request object
 * @returns {string} Client key
 */
function getClientKey(req) {
    // Priority: API Key token > IP
    const apiKey = req.headers['x-api-key'] ||
        req.headers['authorization']?.replace('Bearer ', '') ||
        req.query?.token ||
        req.query?.apikey;

    if (apiKey) {
        return `token:${apiKey}`;
    }

    // Fallback to IP
    return req.ip ||
        req.connection?.remoteAddress ||
        req.socket?.remoteAddress ||
        req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        'unknown';
}

/**
 * Helper functions for common configurations
 */
const presets = {
    /**
     * Rate limiter for API endpoints (very restrictive)
     */
    api: (options = {}) => createRateLimiter({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 50,
        message: 'API rate limit exceeded',
        ...options
    }),

    /**
     * Rate limiter for login endpoints (extremely restrictive)
     */
    auth: (options = {}) => createRateLimiter({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 5,
        message: 'Too many login attempts. Please try again later.',
        skipSuccessfulRequests: true, // Don't count successful logins
        ...options
    }),

    /**
     * Rate limiter for webhook (moderate)
     */
    webhook: (options = {}) => createRateLimiter({
        windowMs: 60 * 1000, // 1 minute
        max: 30,
        message: 'Webhook rate limit exceeded',
        ...options
    }),

    /**
     * Rate limiter for file upload (restrictive)
     */
    upload: (options = {}) => createRateLimiter({
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 10,
        message: 'Upload rate limit exceeded',
        ...options
    })
};

// Main export
module.exports = createRateLimiter;

// Export helpers and presets
module.exports.presets = presets;
module.exports.MemoryStore = MemoryStore;

// Export for CommonJS compatibility
module.exports.default = createRateLimiter;
