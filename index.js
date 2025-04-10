const express = require("express");
const cors = require("cors");
const path = require("path");
const rateLimit = require("express-rate-limit");
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const fs = require('fs');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Buat folder data jika belum ada
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('Created data directory:', dataDir);
}

// Inisialisasi database
let db;
(async () => {
    try {
        console.log('Initializing database...');
        db = await open({
            filename: path.join(__dirname, 'data', 'database.sqlite'),
            driver: sqlite3.Database
        });
        console.log('Database connection established');
        
        // Buat tabel views jika belum ada
        await db.exec(`
            CREATE TABLE IF NOT EXISTS views (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                count INTEGER DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS view_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ip TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Database tables created');
        
        // Insert initial count jika belum ada
        const count = await db.get('SELECT count FROM views LIMIT 1');
        if (!count) {
            await db.run('INSERT INTO views (count) VALUES (0)');
            console.log('Initialized view count to 0');
        } else {
            console.log('Current view count:', count.count);
        }
    } catch (err) {
        console.error('Database initialization error:', err);
    }
})();

// Fungsi untuk mendapatkan view count
async function getViewCount() {
    try {
        const result = await db.get('SELECT count FROM views LIMIT 1');
        console.log('Getting view count:', result ? result.count : 0);
        return result ? result.count : 0;
    } catch (error) {
        console.error('Error getting view count:', error);
        return 0;
    }
}

// Fungsi untuk increment view count dengan pengecekan IP
async function incrementViewCount(ip) {
    try {
        console.log('Incrementing view count for IP:', ip);
        
        // Cek apakah IP sudah mengakses dalam 24 jam terakhir
        const recentView = await db.get(
            'SELECT * FROM view_logs WHERE ip = ? AND timestamp > datetime("now", "-1 day")',
            [ip]
        );
        
        if (recentView) {
            console.log('IP already viewed in last 24 hours');
            return await getViewCount();
        }
        
        // Increment count dan log IP
        await db.run('BEGIN TRANSACTION');
        await db.run('UPDATE views SET count = count + 1');
        await db.run('INSERT INTO view_logs (ip) VALUES (?)', [ip]);
        await db.run('COMMIT');
        
        const newCount = await getViewCount();
        console.log('New view count:', newCount);
        return newCount;
    } catch (error) {
        console.error('Error incrementing view count:', error);
        if (db) await db.run('ROLLBACK');
        return await getViewCount();
    }
}

let totalRequests = 0;
let clients = [];

const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: "Terlalu banyak permintaan, coba lagi nanti." },
    keyGenerator: (req) => {
        return req.headers["x-forwarded-for"]?.split(",")[0] || req.ip;
    },
    standardHeaders: true,
    legacyHeaders: false
});

app.use((req, res, next) => {
    totalRequests++;
    sendUpdateToClients();
    next();
});

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/monitor-page", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "monitor", "monitor.html"));
});

app.get("/monitor", (req, res) => {
    res.set({
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
    });
    res.flushHeaders();

    const clientId = Date.now();
    const newClient = { id: clientId, res };
    clients.push(newClient);

    res.write(`data: ${JSON.stringify({ totalRequests })}\n\n`);

    req.on("close", () => {
        clients = clients.filter(client => client.id !== clientId);
    });
});

function sendUpdateToClients() {
    clients.forEach(client => {
        client.res.write(`data: ${JSON.stringify({ totalRequests })}\n\n`);
    });
}

app.get("/api/views", async (req, res) => {
    try {
        console.log('GET /api/views called');
        const views = await getViewCount();
        console.log('Sending view count:', views);
        res.json({ views, success: true });
    } catch (error) {
        console.error('Error getting views:', error);
        res.status(500).json({ error: 'Gagal mengambil jumlah view', success: false });
    }
});

app.post("/api/views/increment", async (req, res) => {
    try {
        console.log('POST /api/views/increment called');
        const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
        console.log('Client IP:', ip);
        const views = await incrementViewCount(ip);
        console.log('Incremented view count:', views);
        res.json({ views, success: true });
    } catch (error) {
        console.error('Error incrementing views:', error);
        res.status(500).json({ error: 'Gagal menambah view count', success: false });
    }
});

const routes = ["ytdl", "twitterdl", "igdl", "fbdl", "ttdl", "gitclone", "githubstalk", "searchgroups", "ttsearch", "ytsearch", "npmsearch", "pinterest", "llama-3.3-70b-versatile", "gemini", "txt2img", "ssweb", "translate", "nulis", "cuaca", "qrcodegenerator", "vcc", "cekkhodam", "tahukahkamu", "brat", "qc", "detiknews", "kompasnews"];
routes.forEach(route => {
    app.use(`/api/${route}`, limiter, require(`./api/${route}`));
});

module.exports = app;
