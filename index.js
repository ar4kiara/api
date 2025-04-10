const express = require("express");
const cors = require("cors");
const path = require("path");
const rateLimit = require("express-rate-limit");
const fs = require("fs");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Path ke file views.json
const viewsFilePath = path.join(__dirname, "data", "views.json");

// Fungsi untuk membaca view count
function readViewCount() {
    try {
        // Buat direktori data jika belum ada
        if (!fs.existsSync(path.join(__dirname, "data"))) {
            fs.mkdirSync(path.join(__dirname, "data"), { recursive: true });
        }
        
        // Buat file views.json jika belum ada
        if (!fs.existsSync(viewsFilePath)) {
            fs.writeFileSync(viewsFilePath, JSON.stringify({ totalViews: 0 }), { flag: 'wx' });
            return 0;
        }
        
        const data = fs.readFileSync(viewsFilePath, 'utf8');
        const viewData = JSON.parse(data);
        return viewData.totalViews || 0;
    } catch (error) {
        console.error('Error reading view count:', error);
        return 0;
    }
}

// Fungsi untuk menyimpan view count
function saveViewCount(count) {
    try {
        fs.writeFileSync(viewsFilePath, JSON.stringify({ totalViews: count }, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving view count:', error);
        return false;
    }
}

// Inisialisasi view count
let totalViews = readViewCount();
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

app.get("/api/views", (req, res) => {
    try {
        // Baca ulang dari file untuk memastikan data terkini
        totalViews = readViewCount();
        res.json({ views: totalViews, success: true });
    } catch (error) {
        console.error('Error getting views:', error);
        res.status(500).json({ error: 'Gagal mengambil jumlah view', success: false });
    }
});

app.post("/api/views/increment", (req, res) => {
    try {
        totalViews++;
        const saved = saveViewCount(totalViews);
        
        if (!saved) {
            throw new Error('Gagal menyimpan view count');
        }
        
        res.json({ views: totalViews, success: true });
    } catch (error) {
        console.error('Error incrementing views:', error);
        res.status(500).json({ error: 'Gagal menambah view count', success: false });
    }
});

module.exports = app;
