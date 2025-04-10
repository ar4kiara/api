const express = require("express");
const cors = require("cors");
const path = require("path");
const rateLimit = require("express-rate-limit");
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Debug environment variables
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'Set' : 'Not set');
console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'Set' : 'Not set');

// Inisialisasi Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Fungsi untuk membaca view count dari Supabase
async function readViewCount() {
    try {
        const { data, error } = await supabase
            .from('views')
            .select('total_views')
            .single();

        if (error) throw error;
        return data?.total_views || 0;
    } catch (error) {
        console.error('Error reading view count:', error);
        return 0;
    }
}

// Fungsi untuk menyimpan view count dan session data ke Supabase
async function saveViewData(totalViews, sessions) {
    try {
        if (typeof totalViews !== 'number' || totalViews < 0) {
            console.error('Invalid view count:', totalViews);
            return false;
        }

        // Update view count
        const { error } = await supabase
            .from('views')
            .upsert({ 
                id: 1, 
                total_views: totalViews,
                sessions: sessions,
                updated_at: new Date().toISOString()
            });

        if (error) throw error;
        console.log('Successfully saved view data:', { totalViews, sessions });
        return true;
    } catch (error) {
        console.error('Error saving view data:', error);
        return false;
    }
}

// Fungsi untuk mendapatkan session data dari Supabase
async function getSessionData() {
    try {
        const { data, error } = await supabase
            .from('views')
            .select('sessions')
            .single();

        if (error) throw error;
        return (data && data.sessions) || {};
    } catch (error) {
        console.error('Error reading session data:', error);
        return {};
    }
}

// Fungsi untuk increment view count dengan session tracking
async function incrementViewCount(ip) {
    try {
        const now = Date.now();
        const { data: viewData, error: viewError } = await supabase
            .from('views')
            .select('*')
            .single();

        if (viewError) throw viewError;

        // Jika tidak ada data, buat baru
        if (!viewData) {
            const { data, error } = await supabase
                .from('views')
                .insert([{ 
                    id: 1,
                    total_views: 1,
                    sessions: {}
                }])
                .single();
            
            if (error) throw error;
            return 1;
        }

        // Selalu increment view count untuk sementara (testing)
        const newCount = (viewData.total_views || 0) + 1;
        
        const { error: updateError } = await supabase
            .from('views')
            .update({ 
                total_views: newCount,
                updated_at: new Date().toISOString()
            })
            .eq('id', 1);

        if (updateError) throw updateError;
        console.log('View count updated:', newCount);
        return newCount;

    } catch (error) {
        console.error('Error in incrementViewCount:', error);
        try {
            const { data } = await supabase
                .from('views')
                .select('total_views')
                .single();
            return data?.total_views || 0;
        } catch (e) {
            return 0;
        }
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
        const views = await readViewCount();
        console.log('Current view count:', views);
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
        console.log('User Agent:', req.headers['user-agent']);
        const views = await incrementViewCount(ip);
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
