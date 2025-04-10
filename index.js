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
            // Jika file tidak ada, buat dengan data awal
            const initialData = { totalViews: 0, sessions: {} };
            fs.writeFileSync(viewsFilePath, JSON.stringify(initialData, null, 2));
            return 0;
        }
        const data = fs.readFileSync(viewsFilePath, 'utf8');
        const parsedData = JSON.parse(data);
        
        // Pastikan data memiliki format yang benar
        if (!parsedData.hasOwnProperty('totalViews')) {
            console.error('Invalid data format in views.json');
            const correctedData = {
                totalViews: typeof parsedData === 'number' ? parsedData : 0,
                sessions: {}
            };
            fs.writeFileSync(viewsFilePath, JSON.stringify(correctedData, null, 2));
            return correctedData.totalViews;
        }
        
        return parsedData.totalViews;
    } catch (error) {
        console.error('Error reading view count:', error);
        return 0;
    }
}

// Fungsi untuk menyimpan view count dan session data
function saveViewData(totalViews, sessions) {
    try {
        // Validasi input
        if (typeof totalViews !== 'number' || totalViews < 0) {
            console.error('Invalid view count:', totalViews);
            return false;
        }

        // Baca data yang ada terlebih dahulu
        let currentData = { totalViews: 0, sessions: {} };
        if (fs.existsSync(viewsFilePath)) {
            try {
                const fileContent = fs.readFileSync(viewsFilePath, 'utf8');
                currentData = JSON.parse(fileContent);
            } catch (err) {
                console.error('Error reading existing data:', err);
            }
        }

        // Pastikan totalViews tidak berkurang dari nilai sebelumnya
        const newTotalViews = Math.max(totalViews, currentData.totalViews);
        
        const dataToSave = {
            totalViews: newTotalViews,
            sessions: sessions || currentData.sessions || {}
        };

        fs.writeFileSync(viewsFilePath, JSON.stringify(dataToSave, null, 2));
        console.log('Successfully saved view data:', dataToSave);
        return true;
    } catch (error) {
        console.error('Error saving view data:', error);
        return false;
    }
}

// Fungsi untuk mendapatkan session data
function getSessionData() {
    try {
        if (!fs.existsSync(viewsFilePath)) {
            return {};
        }
        const data = fs.readFileSync(viewsFilePath, 'utf8');
        return JSON.parse(data).sessions || {};
    } catch (error) {
        console.error('Error reading session data:', error);
        return {};
    }
}

// Fungsi untuk increment view count dengan session tracking
function incrementViewCount(ip) {
    try {
        const now = Date.now();
        const sessions = getSessionData();
        const currentCount = readViewCount();
        
        // Hapus sesi yang sudah expired (lebih dari 30 menit)
        Object.keys(sessions).forEach(sessionIp => {
            if (now - sessions[sessionIp] > 30 * 60 * 1000) { // 30 menit
                delete sessions[sessionIp];
            }
        });
        
        // Cek apakah IP masih dalam sesi aktif
        if (sessions[ip] && (now - sessions[ip] < 30 * 60 * 1000)) {
            console.log('IP masih dalam sesi aktif:', ip);
            return currentCount;
        }
        
        // Update sesi dan increment count
        sessions[ip] = now;
        const newCount = currentCount + 1;
        
        if (saveViewData(newCount, sessions)) {
            console.log('View count bertambah menjadi:', newCount);
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
