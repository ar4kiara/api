const express = require("express");
const cors = require("cors");
const path = require("path");
const rateLimit = require("express-rate-limit");
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Inisialisasi database
let db;
(async () => {
    db = await open({
        filename: path.join(__dirname, 'data', 'database.sqlite'),
        driver: sqlite3.Database
    });
    
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
    
    // Insert initial count jika belum ada
    const count = await db.get('SELECT count FROM views LIMIT 1');
    if (!count) {
        await db.run('INSERT INTO views (count) VALUES (0)');
    }
})().catch(err => {
    console.error('Error initializing database:', err);
});

// Fungsi untuk mendapatkan view count
async function getViewCount() {
    try {
        const result = await db.get('SELECT count FROM views LIMIT 1');
        return result ? result.count : 0;
    } catch (error) {
        console.error('Error getting view count:', error);
        return 0;
    }
}

// Fungsi untuk increment view count dengan pengecekan IP
async function incrementViewCount(ip) {
    try {
        // Cek apakah IP sudah mengakses dalam 24 jam terakhir
        const recentView = await db.get(
            'SELECT * FROM view_logs WHERE ip = ? AND timestamp > datetime("now", "-1 day")',
            [ip]
        );
        
        if (recentView) {
            return await getViewCount(); // Return current count tanpa increment
        }
        
        // Increment count dan log IP
        await db.run('BEGIN TRANSACTION');
        await db.run('UPDATE views SET count = count + 1');
        await db.run('INSERT INTO view_logs (ip) VALUES (?)', [ip]);
        await db.run('COMMIT');
        
        return await getViewCount();
    } catch (error) {
        await db.run('ROLLBACK');
        console.error('Error incrementing view count:', error);
        return await getViewCount();
    }
}

// Inisialisasi view count dari file
let totalViews = getViewCount();
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

const routes = ["ytdl", "twitterdl", "igdl", "fbdl", "ttdl", "gitclone", "githubstalk", "searchgroups", "ttsearch", "ytsearch", "npmsearch", "pinterest", "llama-3.3-70b-versatile", "gemini", "txt2img", "ssweb", "translate", "nulis", "cuaca", "qrcodegenerator", "vcc", "cekkhodam", "tahukahkamu", "brat", "qc", "detiknews", "kompasnews"];
routes.forEach(route => {
    app.use(`/api/${route}`, limiter, require(`./api/${route}`));
});

app.get("/api/views", async (req, res) => {
    try {
        const views = await getViewCount();
        res.json({ views, success: true });
    } catch (error) {
        console.error('Error getting views:', error);
        res.status(500).json({ error: 'Gagal mengambil jumlah view', success: false });
    }
});

app.post("/api/views/increment", async (req, res) => {
    try {
        const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
        const views = await incrementViewCount(ip);
        res.json({ views, success: true });
    } catch (error) {
        console.error('Error incrementing views:', error);
        res.status(500).json({ error: 'Gagal menambah view count', success: false });
    }
});

module.exports = app;
