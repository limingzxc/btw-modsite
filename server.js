const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const SALT_ROUNDS = 12;

// 加载环境变量
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'btw.db');

// 安全响应头
app.use(helmet({
    contentSecurityPolicy: false, // 允许内联样式和脚本
    crossOriginEmbedderPolicy: { policy: "require-corp" },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));

// CORS限制允许的来源
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',') 
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(cors({
    origin: ALLOWED_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// 信任反向代理传递的IP
app.set('trust proxy', true);

app.use(bodyParser.json({ limit: '10kb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10kb' }));

// 日志中间件 - 记录所有API请求
app.use((req, res, next) => {
    const startTime = Date.now();
    const originalSend = res.send;

    res.send = function(data) {
        // 排除日志API请求，避免无限循环记录
        if (LOG_EXCLUDE_PATHS.some(path => req.path.startsWith(path))) {
            originalSend.call(this, data);
            return;
        }

        const responseTime = Date.now() - startTime;
        // 优先从反向代理获取真实IP
        const realIP = req.get('X-Forwarded-For') ||
                       req.get('X-Real-IP') ||
                       req.ip ||
                       req.connection.remoteAddress;
        const logData = {
            method: req.method,
            path: req.path,
            ip: realIP.split(',')[0].trim(), // 处理X-Forwarded-For可能包含多个IP
            userAgent: req.get('user-agent') || '',
            statusCode: res.statusCode,
            responseTime: responseTime,
            timestamp: new Date().toISOString()
        };

        // 记录用户信息（如果有）
        if (req.user) {
            logData.userId = req.user.id;
            logData.username = req.user.username;
        } else if (req.admin) {
            logData.adminId = req.admin.id;
            logData.adminName = req.admin.username;
        }

        // 记录请求参数（仅限POST/PUT/PATCH）
        if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
            // 过滤敏感信息
            const safeBody = { ...req.body };
            delete safeBody.password;
            delete safeBody.token;
            if (Object.keys(safeBody).length > 0) {
                logData.body = JSON.stringify(safeBody).substring(0, 500);
            }
        }

        // 记录错误信息
        if (res.statusCode >= 400) {
            logData.error = data;
        }

        // 数据验证和清理
        const cleanPath = (logData.path || '').substring(0, 500);
        const cleanUserAgent = (logData.userAgent || '').substring(0, 500);
        const cleanBody = logData.body ? logData.body.substring(0, 5000) : null;
        const cleanError = logData.error ? logData.error.substring(0, 2000) : null;

        // 异步写入日志到数据库（使用预处理语句避免SQL注入）
        db.run(
            `INSERT INTO api_logs (method, path, ip, user_agent, status_code, response_time, user_id, username, admin_id, admin_name, request_body, error, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                logData.method,
                cleanPath,
                logData.ip,
                cleanUserAgent,
                logData.statusCode,
                logData.responseTime,
                logData.userId || null,
                logData.username || null,
                logData.adminId || null,
                logData.adminName || null,
                cleanBody,
                cleanError,
                logData.timestamp
            ],
            (err) => {
                if (err) {
                    console.error('日志记录失败:', err);
                }
            }
        );

        originalSend.call(this, data);
    };

    next();
});

// IP 速率限制（简单实现）
const rateLimitMap = new Map();
function checkRateLimit(req, res, next, maxRequests = 10, windowMs = 60000) {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();

    if (!rateLimitMap.has(ip)) {
        rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
        return next();
    }

    const data = rateLimitMap.get(ip);

    if (now > data.resetTime) {
        rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
        return next();
    }

    if (data.count >= maxRequests) {
        return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
    }

    data.count++;
    rateLimitMap.set(ip, data);
    next();
}

// 安全中间件 - 阻止访问数据目录和敏感文件
const secureStatic = express.static(__dirname, {
    setHeaders: (res, filePath) => {
        const relativePath = path.relative(__dirname, filePath);

        // 阻止访问data目录
        if (relativePath.startsWith('data') || relativePath.startsWith('node_modules')) {
            return res.status(403).end('Forbidden');
        }

        // 阻止访问数据库文件
        if (filePath.match(/\.(db|sqlite|sqlite3)$/i)) {
            return res.status(403).end('Forbidden');
        }
    }
});

// 定义允许访问的文件扩展名白名单
const ALLOWED_EXTENSIONS = [
    '.html', '.htm',
    '.css',
    '.js',
    '.json',
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico',
    '.woff', '.woff2', '.ttf', '.eot',
    '.txt', '.md'
];

// 定义允许访问的文件白名单
const ALLOWED_FILES = [
    'index.html',
    'admin.html',
    'login.html',
    'register.html',
    'mod-detail.html',
    'styles.css',
    'admin.css',
    'mod-detail.css',
    'auth.css',
    'script.js',
    'admin.js',
    'mod-detail.js',
    'utils.js',
    'logs.js',
    'favicon.ico'
];

app.use((req, res, next) => {
    const filePath = path.join(__dirname, req.path);

    // 检查路径穿越
    const normalizedPath = path.normalize(filePath);
    if (!normalizedPath.startsWith(__dirname)) {
        return res.status(403).json({ error: '路径穿越攻击被阻止' });
    }

    // 检查敏感目录
    const relativePath = path.relative(__dirname, normalizedPath);
    if (relativePath.startsWith('data') || relativePath.startsWith('node_modules')) {
        return res.status(403).json({ error: '访问被拒绝' });
    }

    // 检查数据库文件
    if (relativePath.match(/\.(db|sqlite|sqlite3)$/i)) {
        return res.status(403).json({ error: '访问被拒绝' });
    }

    // 检查环境变量文件
    if (relativePath.match(/^\.env/i)) {
        return res.status(403).json({ error: '访问被拒绝' });
    }

    // 检查日志文件
    if (relativePath.match(/\.log$/i)) {
        return res.status(403).json({ error: '访问被拒绝' });
    }

    // 检查服务器文件
    if (relativePath === 'server.js' || relativePath === 'package.json') {
        return res.status(403).json({ error: '访问被拒绝' });
    }

    // 检查文件扩展名（仅对静态资源请求）
    if (!req.path.startsWith('/api/')) {
        const ext = path.extname(filePath).toLowerCase();

        // 允许的扩展名白名单检查
        if (ext && !ALLOWED_EXTENSIONS.includes(ext)) {
            return res.status(403).json({ error: '不允许的文件类型' });
        }

        // 检查特定文件白名单
        const fileName = path.basename(filePath);
        if (!ALLOWED_FILES.includes(fileName) && ext) {
            return res.status(403).json({ error: '文件访问被拒绝' });
        }
    }

    next();
});

app.use(secureStatic);

// 确保数据目录存在
const dataDir = path.join(__dirname, 'data');
if (!require('fs').existsSync(dataDir)) {
    require('fs').mkdirSync(dataDir);
}

// 初始化数据库
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('数据库连接失败:', err);
    } else {
        console.log('数据库连接成功');
        initDatabase();
    }
});

// 初始化数据库表
function initDatabase() {
    // 创建管理员表
    db.run(`CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        token TEXT,
        tokenExpires DATETIME,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, () => {
        // 创建索引以提高查询性能
        db.run('CREATE INDEX IF NOT EXISTS idx_admins_token ON admins(token)', (err) => {
            if (err) console.error('创建admins token索引失败:', err);
        });
        db.run('CREATE INDEX IF NOT EXISTS idx_admins_username ON admins(username)', (err) => {
            if (err) console.error('创建admins username索引失败:', err);
        });
        db.run('CREATE INDEX IF NOT EXISTS idx_admins_token_expires ON admins(tokenExpires)', (err) => {
            if (err) console.error('创建admins tokenExpires索引失败:', err);
        });

        // 初始化管理员账户
        db.get('SELECT COUNT(*) as count FROM admins', async (err, row) => {
            if (err || row.count === 0) {
                const token = crypto.randomBytes(32).toString('hex');
                const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
                const defaultPassword = crypto.randomBytes(12).toString('base64');
                const hashedPassword = await hashPassword(defaultPassword);
                db.run('INSERT INTO admins (username, password, token, tokenExpires) VALUES (?, ?, ?, ?)',
                    ['admin', hashedPassword, token, expires]);
                console.log('=================================');
                console.log('默认管理员账户:');
                console.log('用户名: admin');
                console.log('密码:', defaultPassword);
                console.log('=================================');
            }
        });
    });

    // 创建用户表
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        token TEXT,
        tokenExpires DATETIME,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, () => {
        // 创建索引以提高查询性能
        db.run('CREATE INDEX IF NOT EXISTS idx_users_token ON users(token)', (err) => {
            if (err) console.error('创建users token索引失败:', err);
        });
        db.run('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)', (err) => {
            if (err) console.error('创建users username索引失败:', err);
        });
        db.run('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)', (err) => {
            if (err) console.error('创建users email索引失败:', err);
        });
        db.run('CREATE INDEX IF NOT EXISTS idx_users_token_expires ON users(tokenExpires)', (err) => {
            if (err) console.error('创建users tokenExpires索引失败:', err);
        });
    });

    // 创建模组表
    db.run(`CREATE TABLE IF NOT EXISTS mods (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT,
        tags TEXT,
        rating REAL DEFAULT 0,
        downloads INTEGER DEFAULT 0,
        icon TEXT,
        cloudLink TEXT,
        sourceLink TEXT,
        backgroundImage TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, () => {
        // 创建索引以提高查询性能
        db.run('CREATE INDEX IF NOT EXISTS idx_mods_category ON mods(category)', (err) => {
            if (err) console.error('创建mods category索引失败:', err);
        });
        db.run('CREATE INDEX IF NOT EXISTS idx_mods_rating ON mods(rating)', (err) => {
            if (err) console.error('创建mods rating索引失败:', err);
        });
        db.run('CREATE INDEX IF NOT EXISTS idx_mods_downloads ON mods(downloads)', (err) => {
            if (err) console.error('创建mods downloads索引失败:', err);
        });
        db.run('CREATE INDEX IF NOT EXISTS idx_mods_name ON mods(name)', (err) => {
            if (err) console.error('创建mods name索引失败:', err);
        });
    });

    // 创建分类表
    db.run(`CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        icon TEXT,
        description TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, () => {
        // 创建索引以提高查询性能
        db.run('CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name)', (err) => {
            if (err) console.error('创建categories name索引失败:', err);
        });

        // 初始化分类数据
        db.get('SELECT COUNT(*) as count FROM categories', (err, row) => {
            if (err || row.count === 0) {
                initCategoriesData();
            }
        });
    });

    // 创建评分表
    db.run(`CREATE TABLE IF NOT EXISTS ratings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        modId INTEGER NOT NULL,
        userId INTEGER NOT NULL,
        username TEXT,
        rating INTEGER NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (modId) REFERENCES mods(id),
        FOREIGN KEY (userId) REFERENCES users(id),
        UNIQUE(modId, userId)
    )`, () => {
        // 创建索引以提高查询性能
        db.run('CREATE INDEX IF NOT EXISTS idx_ratings_modid ON ratings(modId)', (err) => {
            if (err) console.error('创建ratings modId索引失败:', err);
        });
        db.run('CREATE INDEX IF NOT EXISTS idx_ratings_userid ON ratings(userId)', (err) => {
            if (err) console.error('创建ratings userId索引失败:', err);
        });
        db.run('CREATE INDEX IF NOT EXISTS idx_ratings_modid_userid ON ratings(modId, userId)', (err) => {
            if (err) console.error('创建ratings复合索引失败:', err);
        });

        // 检查是否需要初始化模组数据
        db.get('SELECT COUNT(*) as count FROM mods', (err, row) => {
            if (err || row.count === 0) {
                initModsData();
            }
        });
    });

    // 创建API日志表
    db.run(`CREATE TABLE IF NOT EXISTS api_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        ip TEXT,
        user_agent TEXT,
        status_code INTEGER,
        response_time INTEGER,
        user_id INTEGER,
        username TEXT,
        admin_id INTEGER,
        admin_name TEXT,
        request_body TEXT,
        error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, () => {
        // 创建复合索引以提高日志查询性能
        // 时间+方法组合查询索引
        db.run('CREATE INDEX IF NOT EXISTS idx_api_logs_created_method ON api_logs(created_at DESC, method)', (err) => {
            if (err) console.error('创建api_logs created_at+method索引失败:', err);
        });
        // 时间+状态码组合查询索引
        db.run('CREATE INDEX IF NOT EXISTS idx_api_logs_created_status ON api_logs(created_at DESC, status_code)', (err) => {
            if (err) console.error('创建api_logs created_at+status_code索引失败:', err);
        });
        // 用户ID+时间组合查询索引
        db.run('CREATE INDEX IF NOT EXISTS idx_api_logs_user_created ON api_logs(user_id, created_at DESC)', (err) => {
            if (err) console.error('创建api_logs user_id+created_at索引失败:', err);
        });
        // 管理员ID+时间组合查询索引
        db.run('CREATE INDEX IF NOT EXISTS idx_api_logs_admin_created ON api_logs(admin_id, created_at DESC)', (err) => {
            if (err) console.error('创建api_logs admin_id+created_at索引失败:', err);
        });
        // 路径LIKE查询优化索引（使用SUBSTR进行前缀索引）
        db.run('CREATE INDEX IF NOT EXISTS idx_api_logs_path_prefix ON api_logs(SUBSTR(path, 1, 255))', (err) => {
            if (err) console.error('创建api_logs path前缀索引失败:', err);
        });
        // IP统计查询索引
        db.run('CREATE INDEX IF NOT EXISTS idx_api_logs_ip_count ON api_logs(ip, created_at DESC)', (err) => {
            if (err) console.error('创建api_logs ip+created_at索引失败:', err);
        });
        // 路径统计查询索引
        db.run('CREATE INDEX IF NOT EXISTS idx_api_logs_path_count ON api_logs(path, created_at DESC)', (err) => {
            if (err) console.error('创建api_logs path+created_at索引失败:', err);
        });
        // 用于清理旧日志的索引
        db.run('CREATE INDEX IF NOT EXISTS idx_api_logs_cleanup ON api_logs(created_at)', (err) => {
            if (err) console.error('创建api_logs cleanup索引失败:', err);
        });
        console.log('API日志表和索引初始化完成');
    });
}

// 初始化分类数据
function initCategoriesData() {
    const categories = [
        { name: 'adventure', icon: '⚔️', description: '冒险探索' },
        { name: 'technology', icon: '⚡', description: '科技自动化' },
        { name: 'magic', icon: '✨', description: '魔法奇幻' },
        { name: 'decoration', icon: '🏠', description: '建筑装饰' },
        { name: 'utility', icon: '🔧', description: '实用工具' }
    ];

    const stmt = db.prepare('INSERT INTO categories (name, icon, description) VALUES (?, ?, ?)');
    categories.forEach(cat => {
        stmt.run(cat.name, cat.icon, cat.description);
    });
    stmt.finalize();
    console.log('分类数据初始化完成');
}

// 初始化模组数据
function initModsData() {
    const mods = [
        {
            name: "工业时代",
            description: "完善的工业体系，自动化生产线",
            category: "technology",
            tags: JSON.stringify(["科技", "自动化"]),
            rating: 4.8,
            downloads: 15000,
            icon: "⚡",
            cloudLink: "https://pan.baidu.com/s/example1"
        },
        {
            name: "神秘时代",
            description: "探索魔法奥秘，学习强大的法术",
            category: "magic",
            tags: JSON.stringify(["魔法", "探索"]),
            rating: 5.0,
            downloads: 25000,
            icon: "✨",
            cloudLink: "https://pan.baidu.com/s/example2"
        },
        {
            name: "暮色森林",
            description: "全新的维度探索，挑战强大的BOSS",
            category: "adventure",
            tags: JSON.stringify(["冒险", "BOSS"]),
            rating: 4.9,
            downloads: 30000,
            icon: "🗡️",
            cloudLink: "https://pan.baidu.com/s/example3"
        },
        {
            name: "建筑工艺",
            description: "精美的装饰方块，打造完美建筑",
            category: "decoration",
            tags: JSON.stringify(["装饰", "建筑"]),
            rating: 4.7,
            downloads: 12000,
            icon: "🏠",
            cloudLink: "https://pan.baidu.com/s/example4"
        },
        {
            name: "JEI物品管理",
            description: "强大的物品查询和配方查看工具",
            category: "utility",
            tags: JSON.stringify(["实用", "工具"]),
            rating: 4.9,
            downloads: 50000,
            icon: "🔧",
            cloudLink: "https://pan.baidu.com/s/example5"
        },
        {
            name: "应用能源2",
            description: "先进的能源系统，科技与魔法的完美结合",
            category: "technology",
            tags: JSON.stringify(["科技", "能源"]),
            rating: 4.9,
            downloads: 20000,
            icon: "🔬",
            cloudLink: "https://pan.baidu.com/s/example6"
        },
        {
            name: "Aether以太",
            description: "天空维度冒险，探索神秘的空中世界",
            category: "adventure",
            tags: JSON.stringify(["冒险", "维度"]),
            rating: 4.8,
            downloads: 18000,
            icon: "🏰",
            cloudLink: "https://pan.baidu.com/s/example7"
        },
        {
            name: "血魔法",
            description: "以生命为代价的强大魔法，黑暗力量的极致",
            category: "magic",
            tags: JSON.stringify(["魔法", "黑暗"]),
            rating: 4.7,
            downloads: 22000,
            icon: "🌙",
            cloudLink: "https://pan.baidu.com/s/example8"
        }
    ];

    const stmt = db.prepare('INSERT INTO mods (name, description, category, tags, rating, downloads, icon, cloudLink) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    mods.forEach(mod => {
        stmt.run(mod.name, mod.description, mod.category, mod.tags, mod.rating, mod.downloads, mod.icon, mod.cloudLink);
    });
    stmt.finalize();
    console.log('模组数据初始化完成');
}

// 密码加密函数
async function hashPassword(password) {
    return await bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

// 验证令牌
function verifyToken(req, res, next) {
    const token = req.headers.authorization;
    if (!token) {
        return res.status(401).json({ error: '未提供认证令牌' });
    }

    db.get('SELECT id, username, email, tokenExpires FROM users WHERE token = ?', [token], (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: '无效的认证令牌' });
        }

        // 检查token是否过期
        if (user.tokenExpires) {
            const expires = new Date(user.tokenExpires);
            if (new Date() > expires) {
                // 清理过期token
                db.run('UPDATE users SET token = NULL, tokenExpires = NULL WHERE id = ?', [user.id]);
                return res.status(401).json({ error: '令牌已过期，请重新登录' });
            }
        }

        req.user = user;
        next();
    });
}

// ==================== 用户认证API ====================

// 输入验证函数
function validateInput(input, type = 'text') {
    if (!input) return false;

    switch (type) {
        case 'username':
            return /^[a-zA-Z0-9_\u4e00-\u9fa5]{2,20}$/.test(input);
        case 'email':
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
        case 'url':
            try {
                new URL(input);
                return input.startsWith('http://') || input.startsWith('https://');
            } catch {
                return false;
            }
        case 'text':
            return typeof input === 'string' && input.length > 0 && input.length <= 1000;
        default:
            return false;
    }
}

// 用户注册
app.post('/api/auth/register', checkRateLimit, (req, res) => {
    const { username, password, email } = req.body;

    if (!username || !password || !email) {
        return res.status(400).json({ error: '用户名、密码和邮箱不能为空' });
    }

    if (password.length < 6 || password.length > 50) {
        return res.status(400).json({ error: '密码长度必须在6-50位之间' });
    }

    if (!validateInput(username, 'username')) {
        return res.status(400).json({ error: '用户名只能包含字母、数字、下划线和中文，长度2-20位' });
    }

    if (!validateInput(email, 'email')) {
        return res.status(400).json({ error: '邮箱格式不正确' });
    }

    // 检查用户名是否已存在
    db.get('SELECT id FROM users WHERE username = ? LIMIT 1', [username], (err, row) => {
        if (err) {
            return res.status(500).json({ error: '数据库查询失败' });
        }

        if (row) {
            return res.status(400).json({ error: '用户名已存在' });
        }

        // 检查邮箱是否已存在
        db.get('SELECT id FROM users WHERE email = ? LIMIT 1', [email], async (err, row) => {
            if (err) {
                return res.status(500).json({ error: '数据库查询失败' });
            }

            if (row) {
                return res.status(400).json({ error: '邮箱已被注册' });
            }

            // 生成令牌
            const token = crypto.randomBytes(32).toString('hex');
            const tokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

            const hashedPassword = await hashPassword(password);
            db.run(
                'INSERT INTO users (username, email, password, token, tokenExpires) VALUES (?, ?, ?, ?, ?)',
                [username, email, hashedPassword, token, tokenExpires],
                function(err) {
                    if (err) {
                        return res.status(500).json({ error: '注册失败' });
                    }

                    res.status(201).json({
                        message: '注册成功',
                        user: {
                            id: this.lastID,
                            username: username,
                            email: email,
                            token: token
                        }
                    });
                }
            );
        });
    });
});

// 用户登录
app.post('/api/auth/login', checkRateLimit, (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    if (password.length > 50) {
        return res.status(400).json({ error: '密码过长' });
    }

    db.get('SELECT id, username, email, password FROM users WHERE username = ? LIMIT 1', [username], async (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: '用户名或密码错误' });
        }

        const passwordMatch = await verifyPassword(password, user.password);
        if (!passwordMatch) {
            return res.status(401).json({ error: '用户名或密码错误' });
        }

        // 生成新令牌
        const newToken = crypto.randomBytes(32).toString('hex');
        const tokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        db.run('UPDATE users SET token = ?, tokenExpires = ? WHERE id = ?', [newToken, tokenExpires, user.id], (err) => {
            if (err) {
                return res.status(500).json({ error: '登录失败' });
            }

            res.json({
                message: '登录成功',
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    token: newToken
                }
            });
        });
    });
});

// 验证令牌
app.get('/api/auth/verify', verifyToken, (req, res) => {
    res.json({
        user: {
            id: req.user.id,
            username: req.user.username,
            email: req.user.email
        }
    });
});

// 用户登出
app.post('/api/auth/logout', verifyToken, (req, res) => {
    db.run('UPDATE users SET token = NULL, tokenExpires = NULL WHERE id = ?', [req.user.id], (err) => {
        if (err) {
            return res.status(500).json({ error: '登出失败' });
        }
        res.json({ message: '登出成功' });
    });
});

// ==================== 管理员API ====================

// 管理员登录
app.post('/api/admin/login', checkRateLimit, (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    if (password.length > 50) {
        return res.status(400).json({ error: '密码过长' });
    }

    db.get('SELECT id, username, password FROM admins WHERE username = ? LIMIT 1', [username], async (err, admin) => {
        if (err || !admin) {
            return res.status(401).json({ error: '用户名或密码错误' });
        }

        const passwordMatch = await verifyPassword(password, admin.password);
        if (!passwordMatch) {
            return res.status(401).json({ error: '用户名或密码错误' });
        }

        // 生成token
        const token = crypto.randomBytes(32).toString('hex');
        const tokenExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        db.run('UPDATE admins SET token = ?, tokenExpires = ? WHERE id = ?', [token, tokenExpires, admin.id], (err) => {
            if (err) {
                return res.status(500).json({ error: '登录失败' });
            }

            res.json({
                message: '登录成功',
                admin: {
                    id: admin.id,
                    username: admin.username,
                    token: token
                }
            });
        });
    });
});

// 验证管理员令牌
function verifyAdminToken(req, res, next) {
    const token = req.headers.authorization;
    if (!token) {
        return res.status(401).json({ error: '未提供认证令牌' });
    }

    db.get('SELECT id, username, tokenExpires FROM admins WHERE token = ?', [token], (err, admin) => {
        if (err || !admin) {
            return res.status(401).json({ error: '无效的认证令牌' });
        }

        // 检查token是否过期
        if (admin.tokenExpires) {
            const expires = new Date(admin.tokenExpires);
            if (new Date() > expires) {
                // 清理过期token
                db.run('UPDATE admins SET token = NULL, tokenExpires = NULL WHERE id = ?', [admin.id]);
                return res.status(401).json({ error: '令牌已过期，请重新登录' });
            }
        }

        req.admin = admin;
        next();
    });
}

// 管理员登出
app.post('/api/admin/logout', verifyAdminToken, (req, res) => {
    db.run('UPDATE admins SET token = NULL, tokenExpires = NULL WHERE id = ?', [req.admin.id], (err) => {
        if (err) {
            return res.status(500).json({ error: '登出失败' });
        }
        res.json({ message: '登出成功' });
    });
});

// ==================== 分类API ====================

// 获取所有分类
app.get('/api/categories', (req, res) => {
    db.all('SELECT id, name, icon, description FROM categories ORDER BY id', (err, categories) => {
        if (err) {
            return res.status(500).json({ error: '获取分类列表失败' });
        }
        res.json(categories);
    });
});

// 获取单个分类
app.get('/api/categories/:id', (req, res) => {
    db.get('SELECT id, name, icon, description FROM categories WHERE id = ?', [parseInt(req.params.id)], (err, category) => {
        if (err || !category) {
            return res.status(404).json({ error: '分类未找到' });
        }
        res.json(category);
    });
});

// 添加分类（管理员）
app.post('/api/categories', verifyAdminToken, (req, res) => {
    const { name, icon, description } = req.body;

    // 输入验证
    if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: '分类名称不能为空' });
    }

    if (name.length > 50) {
        return res.status(400).json({ error: '分类名称不能超过50个字符' });
    }

    if (description && description.length > 200) {
        return res.status(400).json({ error: '分类描述不能超过200个字符' });
    }

    db.run(
        'INSERT INTO categories (name, icon, description) VALUES (?, ?, ?)',
        [name.trim(), icon, description],
        function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: '分类名称已存在' });
                }
                return res.status(500).json({ error: '添加分类失败' });
            }

            db.get('SELECT id, name, icon, description FROM categories WHERE id = ?', [this.lastID], (err, category) => {
                if (err || !category) {
                    return res.status(500).json({ error: '获取新分类失败' });
                }
                res.status(201).json(category);
            });
        }
    );
});

// 更新分类（管理员）
app.put('/api/categories/:id', verifyAdminToken, (req, res) => {
    const { name, icon, description } = req.body;
    const id = parseInt(req.params.id);

    // 输入验证
    if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: '分类名称不能为空' });
    }

    if (name.length > 50) {
        return res.status(400).json({ error: '分类名称不能超过50个字符' });
    }

    if (description && description.length > 200) {
        return res.status(400).json({ error: '分类描述不能超过200个字符' });
    }

    db.run(
        'UPDATE categories SET name = ?, icon = ?, description = ? WHERE id = ?',
        [name.trim(), icon, description, id],
        function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: '分类名称已存在' });
                }
                return res.status(404).json({ error: '分类未找到或更新失败' });
            }

            db.get('SELECT id, name, icon, description FROM categories WHERE id = ?', [id], (err, category) => {
                if (err || !category) {
                    return res.status(500).json({ error: '获取分类失败' });
                }
                res.json(category);
            });
        }
    );
});

// 删除分类（管理员）
app.delete('/api/categories/:id', verifyAdminToken, (req, res) => {
    const id = parseInt(req.params.id);

    // 优化：使用子查询和JOIN来检查和获取分类，减少数据库查询次数
    db.get('SELECT c.id, c.name, c.icon, c.description, COUNT(m.id) as modCount FROM categories c LEFT JOIN mods m ON c.name = m.category WHERE c.id = ? GROUP BY c.id', [id], (err, result) => {
        if (err) {
            return res.status(500).json({ error: '检查分类使用情况失败' });
        }

        if (!result) {
            return res.status(404).json({ error: '分类未找到' });
        }

        if (result.modCount > 0) {
            return res.status(400).json({ error: `该分类下还有${result.modCount}个模组，无法删除` });
        }

        const category = {
            id: result.id,
            name: result.name,
            icon: result.icon,
            description: result.description
        };

        db.run('DELETE FROM categories WHERE id = ?', [id], (err) => {
            if (err) {
                return res.status(500).json({ error: '删除分类失败' });
            }
            res.json(category);
        });
    });
});

// ==================== 模组API ====================

// 获取所有模组
app.get('/api/mods', (req, res) => {
    const { category, sortBy } = req.query;

    // 验证sortBy参数，防止SQL注入
    const validSortOptions = ['default', 'rating', 'downloads', 'name'];
    if (sortBy && !validSortOptions.includes(sortBy)) {
        return res.status(400).json({ error: '无效的排序方式' });
    }

    // 验证category参数，防止SQL注入
    if (category && category !== 'all' && !/^[a-zA-Z0-9_-]+$/.test(category)) {
        return res.status(400).json({ error: '无效的分类参数' });
    }

    let sql = 'SELECT id, name, description, category, tags, rating, downloads, icon, cloudLink, sourceLink, backgroundImage FROM mods';
    let params = [];

    // 分类筛选 - 只允许已存在的分类名称
    if (category && category !== 'all') {
        // 验证分类是否存在
        db.get('SELECT name FROM categories WHERE name = ?', [category], (err, cat) => {
            if (err) {
                return res.status(500).json({ error: '数据库查询失败' });
            }
            if (!cat) {
                return res.status(400).json({ error: '无效的分类' });
            }

            sql += ' WHERE category = ?';
            params.push(category);

            executeModsQuery(sql, params, sortBy, res);
        });
    } else {
        executeModsQuery(sql, params, sortBy, res);
    }
});

function executeModsQuery(sql, params, sortBy, res) {
    // 使用SQL ORDER BY替代JavaScript排序，提高性能
    switch (sortBy) {
        case 'rating':
            sql += ' ORDER BY rating DESC';
            break;
        case 'downloads':
            sql += ' ORDER BY downloads DESC';
            break;
        case 'name':
            sql += ' ORDER BY name COLLATE NOCASE';
            break;
        default:
            sql += ' ORDER BY id';
    }

    db.all(sql, params, (err, mods) => {
        if (err) {
            return res.status(500).json({ error: '获取模组列表失败' });
        }

        // 解析tags JSON字符串
        mods = mods.map(mod => ({
            ...mod,
            tags: mod.tags ? JSON.parse(mod.tags) : []
        }));

        res.json(mods);
    });
}

// 获取单个模组
app.get('/api/mods/:id', (req, res) => {
    db.get('SELECT * FROM mods WHERE id = ?', [parseInt(req.params.id)], (err, mod) => {
        if (err || !mod) {
            return res.status(404).json({ error: '模组未找到' });
        }

        // 解析tags
        mod.tags = mod.tags ? JSON.parse(mod.tags) : [];
        res.json(mod);
    });
});

// 增加下载量
app.post('/api/mods/:id/download', (req, res) => {
    db.run('UPDATE mods SET downloads = downloads + 1 WHERE id = ?', [parseInt(req.params.id)], function(err) {
        if (err || this.changes === 0) {
            return res.status(404).json({ error: '模组未找到' });
        }

        db.get('SELECT downloads FROM mods WHERE id = ?', [parseInt(req.params.id)], (err, mod) => {
            if (err) {
                return res.status(500).json({ error: '获取下载量失败' });
            }
            res.json({ success: true, downloads: mod.downloads });
        });
    });
});

// 添加模组
app.post('/api/mods', verifyAdminToken, (req, res) => {
    const { name, description, category, tags, rating, downloads, icon, cloudLink, sourceLink, backgroundImage } = req.body;

    // 输入验证
    if (!name || !description || !category) {
        return res.status(400).json({ error: '名称、描述和分类不能为空' });
    }

    if (cloudLink && !validateInput(cloudLink, 'url')) {
        return res.status(400).json({ error: '网盘链接格式不正确' });
    }

    if (sourceLink && !validateInput(sourceLink, 'url')) {
        return res.status(400).json({ error: '源码链接格式不正确' });
    }

    if (backgroundImage && !validateInput(backgroundImage, 'url')) {
        return res.status(400).json({ error: '背景图片链接格式不正确' });
    }

    if (rating && (rating < 0 || rating > 5)) {
        return res.status(400).json({ error: '评分必须在0-5之间' });
    }

    if (downloads && downloads < 0) {
        return res.status(400).json({ error: '下载量不能为负数' });
    }

    db.run(
        'INSERT INTO mods (name, description, category, tags, rating, downloads, icon, cloudLink, sourceLink, backgroundImage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [name, description, category, JSON.stringify(tags), rating || 0, downloads || 0, icon, cloudLink, sourceLink, backgroundImage || null],
        function(err) {
            if (err) {
                return res.status(500).json({ error: '添加模组失败' });
            }

            db.get('SELECT * FROM mods WHERE id = ?', [this.lastID], (err, mod) => {
                if (err || !mod) {
                    return res.status(500).json({ error: '获取新模组失败' });
                }

                mod.tags = JSON.parse(mod.tags);
                res.status(201).json(mod);
            });
        }
    );
});

// 更新模组
app.put('/api/mods/:id', verifyAdminToken, (req, res) => {
    const { name, description, category, tags, rating, downloads, icon, cloudLink, sourceLink, backgroundImage } = req.body;
    const id = parseInt(req.params.id);

    // 输入验证
    if (!name || !description || !category) {
        return res.status(400).json({ error: '名称、描述和分类不能为空' });
    }

    if (cloudLink && !validateInput(cloudLink, 'url')) {
        return res.status(400).json({ error: '网盘链接格式不正确' });
    }

    if (sourceLink && !validateInput(sourceLink, 'url')) {
        return res.status(400).json({ error: '源码链接格式不正确' });
    }

    if (backgroundImage && !validateInput(backgroundImage, 'url')) {
        return res.status(400).json({ error: '背景图片链接格式不正确' });
    }

    if (rating && (rating < 0 || rating > 5)) {
        return res.status(400).json({ error: '评分必须在0-5之间' });
    }

    if (downloads && downloads < 0) {
        return res.status(400).json({ error: '下载量不能为负数' });
    }

    db.run(
        'UPDATE mods SET name = ?, description = ?, category = ?, tags = ?, rating = ?, downloads = ?, icon = ?, cloudLink = ?, sourceLink = ?, backgroundImage = ? WHERE id = ?',
        [name, description, category, JSON.stringify(tags), rating, downloads, icon, cloudLink, sourceLink, backgroundImage || null, id],
        function(err) {
            if (err || this.changes === 0) {
                return res.status(404).json({ error: '模组未找到' });
            }

            db.get('SELECT * FROM mods WHERE id = ?', [id], (err, mod) => {
                if (err || !mod) {
                    return res.status(500).json({ error: '获取模组失败' });
                }

                mod.tags = JSON.parse(mod.tags);
                res.json(mod);
            });
        }
    );
});

// 删除模组
app.delete('/api/mods/:id', verifyAdminToken, (req, res) => {
    const id = parseInt(req.params.id);

    db.get('SELECT * FROM mods WHERE id = ?', [id], (err, mod) => {
        if (err || !mod) {
            return res.status(404).json({ error: '模组未找到' });
        }

        mod.tags = JSON.parse(mod.tags);

        db.run('DELETE FROM mods WHERE id = ?', [id], (err) => {
            if (err) {
                return res.status(500).json({ error: '删除模组失败' });
            }
            res.json(mod);
        });
    });
});

// ==================== 评分API ====================

// 获取模组的评分记录
app.get('/api/mods/:id/ratings', (req, res) => {
    db.all('SELECT * FROM ratings WHERE modId = ?', [parseInt(req.params.id)], (err, ratings) => {
        if (err) {
            return res.status(500).json({ error: '获取评分记录失败' });
        }
        res.json(ratings);
    });
});

// 检查用户是否已评分
app.get('/api/mods/:id/rated', verifyToken, (req, res) => {
    const modId = parseInt(req.params.id);

    db.get(
        'SELECT id, rating FROM ratings WHERE modId = ? AND userId = ? LIMIT 1',
        [modId, req.user.id],
        (err, rating) => {
            if (err) {
                return res.status(500).json({ error: '检查评分状态失败' });
            }

            res.json({
                hasRated: !!rating,
                rating: rating ? rating.rating : null
            });
        }
    );
});

// 评价模组（需要登录）
app.post('/api/mods/:id/rate', verifyToken, (req, res) => {
    const { rating } = req.body;
    const modId = parseInt(req.params.id);

    // 验证评分值
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ error: '评分必须是1-5之间的整数' });
    }

    // 检查是否已评分
    db.get(
        'SELECT id FROM ratings WHERE modId = ? AND userId = ? LIMIT 1',
        [modId, req.user.id],
        (err, existingRating) => {
            if (err) {
                return res.status(500).json({ error: '检查评分状态失败' });
            }

            if (existingRating) {
                return res.status(400).json({ error: '您已经评价过这个模组了' });
            }

            // 使用事务确保数据一致性
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');

                // 添加评分记录
                db.run(
                    'INSERT INTO ratings (modId, userId, username, rating) VALUES (?, ?, ?, ?)',
                    [modId, req.user.id, req.user.username, rating],
                    function(err) {
                        if (err) {
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: '添加评分失败' });
                        }

                        const ratingId = this.lastID;

                        // 使用SQL AVG函数计算平均评分，减少数据传输
                        db.get(
                            'SELECT ROUND(AVG(rating), 1) as avgRating, COUNT(*) as ratingCount FROM ratings WHERE modId = ?',
                            [modId],
                            (err, result) => {
                                if (err) {
                                    db.run('ROLLBACK');
                                    return res.status(500).json({ error: '计算平均评分失败' });
                                }

                                const avgRating = result.avgRating || 0;

                                db.run(
                                    'UPDATE mods SET rating = ? WHERE id = ?',
                                    [avgRating, modId],
                                    (err) => {
                                        if (err) {
                                            db.run('ROLLBACK');
                                            return res.status(500).json({ error: '更新模组评分失败' });
                                        }

                                        db.run('COMMIT');

                                        res.json({
                                            success: true,
                                            rating: {
                                                id: ratingId,
                                                modId: modId,
                                                userId: req.user.id,
                                                rating: rating
                                            }
                                        });
                                    }
                                );
                            }
                        );
                    }
                );
            });
        }
    );
});

// ==================== 日志API ====================

// 排除日志记录的路径列表
const LOG_EXCLUDE_PATHS = ['/api/logs', '/logs.js', '/admin_logs.js', '/admin.js', '/logs'];

// 获取日志列表（管理员）
app.get('/api/logs', verifyAdminToken, (req, res) => {
    const { page = 1, limit = 50, method, path, statusCode, userId, adminId } = req.query;

    // 验证参数
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    if (pageNum < 1 || limitNum < 1 || limitNum > 200) {
        return res.status(400).json({ error: '分页参数无效' });
    }

    // 验证method参数
    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
    if (method && !validMethods.includes(method.toUpperCase())) {
        return res.status(400).json({ error: '无效的请求方法' });
    }

    // 构建查询条件和参数
    let whereConditions = [];
    let params = [];

    // 验证并添加方法过滤条件
    if (method) {
        whereConditions.push(`method = ?`);
        params.push(method.toUpperCase());
    }

    // 验证并添加路径过滤条件（防止SQL注入）
    if (path) {
        const sanitizedPath = path.trim().replace(/[%;'"]/g, '');
        if (sanitizedPath.length > 500) {
            return res.status(400).json({ error: '路径长度不能超过500字符' });
        }
        whereConditions.push(`path LIKE ?`);
        params.push(`%${sanitizedPath}%`);
    }

    // 验证并添加状态码过滤条件
    if (statusCode) {
        const code = parseInt(statusCode);
        if (isNaN(code) || code < 100 || code > 599) {
            return res.status(400).json({ error: '无效的状态码' });
        }
        whereConditions.push(`status_code = ?`);
        params.push(code);
    }

    // 验证并添加用户ID过滤条件
    if (userId) {
        const uid = parseInt(userId);
        if (isNaN(uid) || uid < 1) {
            return res.status(400).json({ error: '无效的用户ID' });
        }
        whereConditions.push(`user_id = ?`);
        params.push(uid);
    }

    // 验证并添加管理员ID过滤条件
    if (adminId) {
        const aid = parseInt(adminId);
        if (isNaN(aid) || aid < 1) {
            return res.status(400).json({ error: '无效的管理员ID' });
        }
        whereConditions.push(`admin_id = ?`);
        params.push(aid);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // 使用事务确保数据一致性
    db.serialize(() => {
        // 获取总数
        db.get(
            `SELECT COUNT(*) as total FROM api_logs ${whereClause}`,
            params,
            (err, countResult) => {
                if (err) {
                    console.error('获取日志总数失败:', err);
                    return res.status(500).json({ error: '获取日志总数失败' });
                }

                const total = countResult.total;
                const offset = (pageNum - 1) * limitNum;

                // 获取日志列表（优化字段选择，只查询必要的字段）
                db.all(
                    `SELECT id, method, path, ip, user_agent, status_code, response_time,
                            user_id, username, admin_id, admin_name,
                            SUBSTR(request_body, 1, 500) as request_body_preview,
                            SUBSTR(error, 1, 500) as error_preview,
                            created_at
                     FROM api_logs
                     ${whereClause}
                     ORDER BY created_at DESC
                     LIMIT ? OFFSET ?`,
                    [...params, limitNum, offset],
                    (err, logs) => {
                        if (err) {
                            console.error('获取日志列表失败:', err);
                            return res.status(500).json({ error: '获取日志列表失败' });
                        }

                        res.json({
                            logs: logs,
                            pagination: {
                                page: pageNum,
                                limit: limitNum,
                                total: total,
                                totalPages: Math.ceil(total / limitNum)
                            }
                        });
                    }
                );
            }
        );
    });
});

// 获取日志统计信息（管理员）- 必须放在 /api/logs/:id 之前
app.get('/api/logs/stats', verifyAdminToken, (req, res) => {
    // 并行执行多个查询，提高性能
    db.get(`
        SELECT
            COUNT(*) as total,
            ROUND(AVG(response_time), 2) as avgResponseTime,
            MAX(response_time) as maxResponseTime,
            MIN(response_time) as minResponseTime,
            COUNT(CASE WHEN status_code >= 400 THEN 1 END) as errorCount
        FROM api_logs
    `, (err, overallStats) => {
        if (err) {
            console.error('获取总体统计失败:', err);
            return res.status(500).json({ error: '获取总体统计失败' });
        }

        db.all(`
            SELECT
                method,
                COUNT(*) as count
            FROM api_logs
            GROUP BY method
            ORDER BY count DESC
        `, (err, methodStats) => {
            if (err) {
                console.error('获取方法统计失败:', err);
                return res.status(500).json({ error: '获取方法统计失败' });
            }

            db.all(`
                SELECT
                    SUBSTR(path, 1, 100) as path,
                    COUNT(*) as count,
                    ROUND(AVG(response_time), 2) as avgResponseTime
                FROM api_logs
                GROUP BY SUBSTR(path, 1, 100)
                ORDER BY count DESC
                LIMIT 10
            `, (err, topPaths) => {
                if (err) {
                    console.error('获取热门路径失败:', err);
                    return res.status(500).json({ error: '获取热门路径失败' });
                }

                db.all(`
                    SELECT
                        ip,
                        COUNT(*) as count
                    FROM api_logs
                    GROUP BY ip
                    ORDER BY count DESC
                    LIMIT 10
                `, (err, topIPs) => {
                    if (err) {
                        console.error('获取热门IP失败:', err);
                        return res.status(500).json({ error: '获取热门IP失败' });
                    }

                    res.json({
                        overall: overallStats,
                        byMethod: methodStats,
                        topPaths: topPaths,
                        topIPs: topIPs
                    });
                });
            });
        });
    });
});

// 获取单条日志详情（管理员）
app.get('/api/logs/:id', verifyAdminToken, (req, res) => {
    const logId = parseInt(req.params.id);

    if (isNaN(logId) || logId < 1) {
        return res.status(400).json({ error: '无效的日志ID' });
    }

    db.get(
        `SELECT id, method, path, ip, user_agent, status_code, response_time,
                user_id, username, admin_id, admin_name, request_body, error, created_at
         FROM api_logs
         WHERE id = ?`,
        [logId],
        (err, log) => {
            if (err) {
                return res.status(500).json({ error: '获取日志详情失败' });
            }

            if (!log) {
                return res.status(404).json({ error: '日志未找到' });
            }

            res.json(log);
        }
    );
});

// 清理旧日志（管理员）
app.delete('/api/logs/cleanup', verifyAdminToken, (req, res) => {
    const { days = 30 } = req.query;
    const daysNum = parseInt(days);

    // 参数验证
    if (isNaN(daysNum) || daysNum < 1 || daysNum > 365) {
        return res.status(400).json({ error: '天数必须在1-365之间' });
    }

    const cutoffDate = new Date(Date.now() - daysNum * 24 * 60 * 60 * 1000).toISOString();

    // 使用事务确保数据一致性
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        db.run('DELETE FROM api_logs WHERE created_at < ?', [cutoffDate], function(err) {
            if (err) {
                db.run('ROLLBACK');
                console.error('清理日志失败:', err);
                return res.status(500).json({ error: '清理日志失败' });
            }

            const deletedCount = this.changes;

            // 优化：清理后执行VACUUM以回收空间（仅在删除大量记录时）
            if (deletedCount > 1000) {
                db.run('VACUUM', (vacuumErr) => {
                    if (vacuumErr) {
                        console.error('数据库优化失败:', vacuumErr);
                    }
                });
            }

            db.run('COMMIT');
            res.json({
                message: `成功清理${deletedCount}条日志记录`,
                deletedCount: deletedCount,
                cutoffDate: cutoffDate
            });
        });
    });
});

// 导出日志（管理员）
app.get('/api/logs/export', verifyAdminToken, (req, res) => {
    const { limit = 1000, format = 'csv' } = req.query;
    const limitNum = parseInt(limit);

    // 参数验证
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 10000) {
        return res.status(400).json({ error: '导出数量必须在1-10000之间' });
    }

    if (format !== 'csv' && format !== 'json') {
        return res.status(400).json({ error: '导出格式必须是csv或json' });
    }

    // 使用流式导出，避免内存溢出
    db.each(
        `SELECT id, method, path, ip, user_agent, status_code, response_time,
                user_id, username, admin_id, admin_name, request_body, error, created_at
         FROM api_logs
         ORDER BY created_at DESC
         LIMIT ?`,
        [limitNum],
        (err, log) => {
            if (err) {
                console.error('导出日志失败:', err);
            }

            // 流式处理每条记录
            if (format === 'json') {
                // JSON格式导出（简化示例）
                res.write(JSON.stringify(log) + '\n');
            }
        },
        (err) => {
            if (err) {
                console.error('导出日志错误:', err);
                if (!res.headersSent) {
                    return res.status(500).json({ error: '导出日志失败' });
                }
            }

            if (format === 'csv') {
                // CSV格式导出（完整的批量处理）
                db.all(
                    `SELECT id, method, path, ip, user_agent, status_code, response_time,
                            user_id, username, admin_id, admin_name, request_body, error, created_at
                     FROM api_logs
                     ORDER BY created_at DESC
                     LIMIT ?`,
                    [limitNum],
                    (err, logs) => {
                        if (err) {
                            console.error('导出日志失败:', err);
                            return res.status(500).json({ error: '导出日志失败' });
                        }

                        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
                        res.setHeader('Content-Disposition', `attachment; filename=logs_${new Date().toISOString().split('T')[0]}.csv`);

                        // CSV头部
                        const headers = ['ID', 'Method', 'Path', 'IP', 'User Agent', 'Status Code',
                                       'Response Time', 'User ID', 'Username', 'Admin ID', 'Admin Name',
                                       'Request Body', 'Error', 'Created At'];
                        let csv = headers.map(h => `"${h}"`).join(',') + '\n';

                        // CSV内容（使用流式构建，避免内存溢出）
                        logs.forEach(log => {
                            const row = [
                                log.id,
                                log.method,
                                `"${(log.path || '').replace(/"/g, '""')}"`,
                                log.ip || '',
                                `"${(log.user_agent || '').replace(/"/g, '""')}"`,
                                log.status_code,
                                log.response_time,
                                log.user_id || '',
                                log.username || '',
                                log.admin_id || '',
                                log.admin_name || '',
                                `"${(log.request_body || '').replace(/"/g, '""')}"`,
                                `"${(log.error || '').replace(/"/g, '""')}"`,
                                log.created_at
                            ];
                            csv += row.join(',') + '\n';

                            // 分块发送响应
                            if (csv.length > 100000) { // 每100KB发送一次
                                res.write(csv);
                                csv = '';
                            }
                        });

                        // 发送剩余数据
                        if (csv.length > 0) {
                            res.write(csv);
                        }
                        res.end();
                    }
                );
            }
        }
    );
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
    console.log(`前端页面: http://localhost:${PORT}/index.html`);
    console.log(`管理页面: http://localhost:${PORT}/admin.html`);
});

// 定期清理过期token（每小时执行一次）
setInterval(() => {
    const now = new Date().toISOString();
    db.run('UPDATE users SET token = NULL, tokenExpires = NULL WHERE tokenExpires < ?', [now], (err) => {
        if (err) {
            console.error('清理用户过期token失败:', err);
        } else {
            console.log('已清理用户过期token');
        }
    });

    db.run('UPDATE admins SET token = NULL, tokenExpires = NULL WHERE tokenExpires < ?', [now], (err) => {
        if (err) {
            console.error('清理管理员过期token失败:', err);
        } else {
            console.log('已清理管理员过期token');
        }
    });
}, 60 * 60 * 1000); // 每小时执行一次
