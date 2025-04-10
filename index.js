const express = require("express");
const cors = require("cors");
const path = require("path");
const rateLimit = require("express-rate-limit");
const fs = require("fs");

const app = express();

// Path ke file views.json
const viewsFilePath = path.join(__dirname, "data", "views.json");

// Buat direktori data jika belum ada
if (!fs.existsSync(path.join(__dirname, "data"))) {
    fs.mkdirSync(path.join(__dirname, "data"));
}

// Buat file views.json jika belum ada
if (!fs.existsSync(viewsFilePath)) {
    fs.writeFileSync(viewsFilePath, JSON.stringify({ totalViews: 0 }));
}

// Baca jumlah view dari file
let viewData = JSON.parse(fs.readFileSync(viewsFilePath));
let totalViews = viewData.totalViews;
let totalRequests = 0;
let clients = [];

// Fungsi untuk menyimpan view count ke file
function saveViewCount() {
    fs.writeFileSync(viewsFilePath, JSON.stringify({ totalViews }));
}

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

app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

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
    res.json({ views: totalViews });
});

app.post("/api/views/increment", (req, res) => {
    totalViews++;
    // Simpan ke file setiap kali ada increment
    saveViewCount();
    res.json({ views: totalViews });
});

module.exports = app;
