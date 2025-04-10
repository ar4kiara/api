const express = require("express");
const cors = require("cors");
const path = require("path");
const rateLimit = require("express-rate-limit");
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

// Path ke file views.json
const viewsFilePath = path.join(__dirname, 'data', 'views.json');

// Fungsi untuk membaca view count
function readViewCount() {
    try {
        if (!fs.existsSync(viewsFilePath)) {
            fs.writeFileSync(viewsFilePath, JSON.stringify({ totalViews: 0 }));
            return 0;
        }
        const data = fs.readFileSync(viewsFilePath, 'utf8');
        return JSON.parse(data).totalViews || 0;
    } catch (error) {
        console.error('Error reading view count:', error);
        return 0;
    }
}

// Fungsi untuk menyimpan view count
function saveViewCount(count) {
    try {
        fs.writeFileSync(viewsFilePath, JSON.stringify({ totalViews: count }));
        return true;
    } catch (error) {
        console.error('Error saving view count:', error);
        return false;
    }
}

// Simpan IP yang sudah mengakses dalam 24 jam
const recentVisitors = new Map();

// Fungsi untuk increment view count dengan pengecekan IP
function incrementViewCount(ip) {
    try {
        const now = Date.now();
        const lastVisit = recentVisitors.get(ip);
        
        // Cek apakah IP sudah mengakses dalam 24 jam
        if (lastVisit && (now - lastVisit) < 24 * 60 * 60 * 1000) {
            console.log('IP already viewed in last 24 hours:', ip);
            return readViewCount();
        }
        
        // Update last visit time
        recentVisitors.set(ip, now);
        
        // Cleanup old entries (lebih dari 24 jam)
        for (const [visitorIp, visitTime] of recentVisitors.entries()) {
            if (now - visitTime > 24 * 60 * 60 * 1000) {
                recentVisitors.delete(visitorIp);
            }
        }
        
        // Increment dan simpan count
        const currentCount = readViewCount();
        const newCount = currentCount + 1;
        if (saveViewCount(newCount)) {
            console.log('Incremented view count to:', newCount);
            return newCount;
        }
        return currentCount;
    } catch (error) {
        console.error('Error incrementing view count:', error);
        return readViewCount();
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

app.get("/api/views", (req, res) => {
    try {
        console.log('GET /api/views called');
        const views = readViewCount();
        console.log('Current view count:', views);
        res.json({ views, success: true });
    } catch (error) {
        console.error('Error getting views:', error);
        res.status(500).json({ error: 'Gagal mengambil jumlah view', success: false });
    }
});

app.post("/api/views/increment", (req, res) => {
    try {
        console.log('POST /api/views/increment called');
        const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
        console.log('Client IP:', ip);
        const views = incrementViewCount(ip);
        console.log('View count after increment:', views);
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
