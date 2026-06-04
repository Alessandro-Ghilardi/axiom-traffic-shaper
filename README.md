# Traffic Shaper

Ultra-lightweight in-memory Rate Limiter for Express/Fastify - protect sensitive endpoints from brute force and DDoS attacks without needing Redis or external databases.

## 🚀 Features

- **Zero external dependencies** - Works completely in-memory
- **Ultra-lightweight** - Ideal for standalone VPS and small deployments
- **Flexible** - Supports limiting by IP or API token
- **Express/Fastify compatible** - Standard middleware
- **Configured presets** - Ready-to-use configurations for common cases
- **Auto-cleanup** - Automatic cleanup of expired records
- **Standard headers** - `X-RateLimit-*` headers for API clients

## 📦 Installation

```bash
npm install axiom-traffic-shaper
```

## 🛠️ Basic Usage

### Express.js

```javascript
const express = require('express');
const rateLimiter = require('axiom-traffic-shaper');

const app = express();

// Basic rate limiter: 100 requests every 15 minutes per IP
const limiter = rateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // max 100 requests per window
});

app.use('/api/', limiter);

app.get('/api/test', (req, res) => {
    res.json({ message: 'Hello World!' });
});

app.listen(3000);
```

### Fastify

```javascript
const fastify = require('fastify');
const rateLimiter = require('axiom-traffic-shaper');

const app = fastify();

// Register as hook
app.addHook('preHandler', rateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 100
}));

app.get('/api/test', async (request, reply) => {
    return { message: 'Hello World!' };
});

app.listen({ port: 3000 });
```

## 🔧 Advanced Configuration

### Available Options

```javascript
const limiter = rateLimiter({
    windowMs: 15 * 60 * 1000,    // Time window (default: 15 min)
    max: 100,                     // Max requests per window (default: 100)
    message: {                    // Custom error message
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: 0
    },
    skipSuccessfulRequests: false,  // Don't count requests with status < 400
    skipFailedRequests: false,      // Don't count requests with status >= 400
    keyGenerator: (req) => {        // Custom function to generate key
        return req.headers['x-user-id'] || req.ip;
    }
});
```

### API Token Limiting

```javascript
// Priority: API Key > IP
const limiter = rateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 1000,
    keyGenerator: (req) => {
        // Use API key if present, otherwise IP
        const apiKey = req.headers['x-api-key'] || req.query.token;
        return apiKey ? `token:${apiKey}` : `ip:${req.ip}`;
    }
});
```

## 🎯 Configured Presets

Traffic Shaper includes optimized presets for common use cases:

### API Endpoints (very restrictive)

```javascript
const { presets } = require('axiom-traffic-shaper');

app.use('/api/v1/', presets.api({
    max: 50,  // Override: 50 requests every 15 minutes
}));
```

### Login/Authentication (extremely restrictive)

```javascript
app.post('/auth/login', presets.auth({
    windowMs: 10 * 60 * 1000,  // 10 minutes
    max: 3,                     // Only 3 attempts
}));
```

### Webhook (moderate)

```javascript
app.post('/webhook', presets.webhook({
    max: 30,  // 30 webhooks per minute
}));
```

### File Upload (restrictive)

```javascript
app.post('/upload', presets.upload({
    max: 5,  // 5 uploads per hour
}));
```

## 🛡️ DevOps Use Cases

### Brute Force Login Protection

```javascript
const express = require('express');
const { presets } = require('axiom-traffic-shaper');

const app = express();

app.post('/login', presets.auth(), (req, res) => {
    // Login logic...
    res.json({ token: 'jwt-token' });
});

// Password reset even more restrictive
app.post('/reset-password', rateLimiter({
    windowMs: 60 * 60 * 1000,  // 1 hour
    max: 3,                     // Only 3 attempts per hour
    message: 'Too many password reset attempts. Try again in 1 hour.'
}), (req, res) => {
    // Password reset logic...
});
```

### Public API Protection

```javascript
// Public API: 1000 requests/hour per IP
app.use('/api/public', rateLimiter({
    windowMs: 60 * 60 * 1000,
    max: 1000
}));

// Premium API: 10000 requests/hour per API key
app.use('/api/premium', rateLimiter({
    windowMs: 60 * 60 * 1000,
    max: 10000,
    keyGenerator: (req) => `premium:${req.headers['x-api-key']}`
}));
```

### Multi-tier Rate Limiting

```javascript
const express = require('express');
const rateLimiter = require('axiom-traffic-shaper');

const app = express();

// Global limiter: very permissive
app.use(rateLimiter({
    windowMs: 60 * 1000,
    max: 1000
}));

// API specific: moderate
app.use('/api/', rateLimiter({
    windowMs: 60 * 1000,
    max: 100
}));

// Auth specific: restrictive
app.use('/api/auth/', rateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5
}));
```

## 📊 HTTP Headers

Traffic Shaper automatically adds informative headers:

```
X-RateLimit-Limit: 100        # Maximum limit per window
X-RateLimit-Remaining: 95      # Remaining requests
X-RateLimit-Reset: 1640995200  # Reset timestamp (Unix epoch)
Retry-After: 300              # Seconds to wait (only on 429)
```

## 🔄 Error Handling

```javascript
// Custom error handling
app.use((err, req, res, next) => {
    if (err.status === 429) {
        return res.status(429).json({
            error: 'Rate limit exceeded',
            retryAfter: err.retryAfter,
            nextReset: new Date(Date.now() + err.retryAfter * 1000)
        });
    }
    next(err);
});
```

## 🧪 Testing

```javascript
const request = require('supertest');
const express = require('express');
const rateLimiter = require('axiom-traffic-shaper');

const app = express();
app.use(rateLimiter({ windowMs: 1000, max: 2 }));

app.get('/test', (req, res) => res.json({ ok: true }));

// Test
describe('Rate Limiter', () => {
    it('should allow requests within limit', async () => {
        await request(app).get('/test').expect(200);
        await request(app).get('/test').expect(200);
    });

    it('should block requests exceeding limit', async () => {
        await request(app).get('/test').expect(200);
        await request(app).get('/test').expect(200);
        await request(app).get('/test').expect(429);
    });
});
```

## 🚀 Performance

- **Memory usage**: ~1KB per 1000 active clients
- **CPU overhead**: < 1ms per request
- **Cleanup**: Automatic every 60 seconds
- **Scalability**: Ideal for small/medium deployments

## 🔒 Security Considerations

- **IP spoofing**: Use `req.ip` with trust proxy configured
- **Memory exhaustion**: Monitor usage for high-traffic apps
- **Distributed attacks**: Consider CDN/WAF for large scale DDoS
- **Token leakage**: Use HTTPS to protect API keys

## 📝 License

MIT License - see LICENSE file for details

## 🤝 Contributions

Contributions welcome! Please open issues or PRs for improvements.

## 📞 Support

For issues or questions: open an issue on GitHub.
