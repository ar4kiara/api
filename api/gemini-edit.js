const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const rateLimit = require('express-rate-limit');
const geminiConfig = require('../config/gemini');

// Rate limiter: 5 request per IP per menit
const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: {
        sukses: false,
        error: 'Terlalu banyak request, silakan coba lagi dalam 1 menit'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Konfigurasi multer untuk upload file
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(process.cwd(), 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, `edit_${Date.now()}${path.extname(file.originalname)}`);
    }
});

const upload = multer({
    storage: storage,
    fileFilter: function (req, file, cb) {
        if (!file.mimetype.match(/^image\/(jpeg|jpg|png|webp)$/)) {
            return cb(new Error('Hanya file gambar (jpeg/jpg/png/webp) yang diperbolehkan!'), false);
        }
        cb(null, true);
    },
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

// Fungsi untuk mengoptimasi gambar
async function optimizeImage(imagePath) {
    try {
        console.log('📸 Mengoptimasi gambar...');
        const optimized = await sharp(imagePath)
            .resize(1024, 1024, { 
                fit: 'inside',
                withoutEnlargement: true
            })
            .jpeg({ 
                quality: 85,
                progressive: true
            })
            .toBuffer();

        // Tulis kembali file yang sudah dioptimasi
        await fs.promises.writeFile(imagePath, optimized);
        
        console.log('✨ Gambar berhasil dioptimasi');
        return true;
    } catch (error) {
        console.error('❌ Gagal mengoptimasi gambar:', error);
        return false;
    }
}

// Fungsi untuk mencoba request ke Gemini dengan timeout
async function tryGeminiRequest(genAI, contents, timeout = 45000) {
    return Promise.race([
        genAI.getGenerativeModel({
            model: "gemini-2.0-flash-exp-image-generation",
            generationConfig: {
                responseModalities: ["Text", "Image"],
            },
        }).generateContent(contents),
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout menunggu respons dari Gemini AI')), timeout)
        )
    ]);
}

router.post('/', limiter, upload.single('image'), async (req, res) => {
    const startTime = Date.now();
    console.log(`\n🚀 Request baru diterima pada ${new Date().toISOString()}`);
    
    try {
        if (!req.file) {
            console.log('❌ Tidak ada file yang dikirim');
            return res.status(400).json({
                sukses: false,
                error: "File gambar diperlukan"
            });
        }
        console.log('📁 File diterima:', {
            filename: req.file.filename,
            size: req.file.size,
            mimetype: req.file.mimetype
        });

        const { prompt } = req.body;
        if (!prompt) {
            console.log('❌ Tidak ada prompt yang dikirim');
            return res.status(400).json({
                sukses: false,
                error: "Parameter prompt diperlukan"
            });
        }
        console.log('💭 Prompt:', prompt);

        // Optimasi gambar
        await optimizeImage(req.file.path);

        let retryCount = 0;
        const maxRetries = geminiConfig.apiKeys.length;
        let resultImage = null;
        let lastError = null;

        while (retryCount < maxRetries) {
            try {
                const currentKey = geminiConfig.getApiKey();
                console.log(`🔄 Mencoba dengan API key #${retryCount + 1}`);
                
                const genAI = new GoogleGenerativeAI(currentKey);
                const imageData = await fs.promises.readFile(req.file.path);
                const base64Image = imageData.toString('base64');

                console.log('🖼️ Gambar dikonversi ke base64');

                const contents = [
                    { text: prompt.trim() },
                    {
                        inlineData: {
                            mimeType: req.file.mimetype,
                            data: base64Image,
                        },
                    }
                ];

                console.log('🤖 Memulai proses Gemini AI...');
                const response = await tryGeminiRequest(genAI, contents);
                console.log('✅ Respons diterima dari Gemini AI');

                if (!response?.response?.candidates?.[0]?.content?.parts) {
                    throw new Error("Respons tidak valid dari Gemini AI");
                }

                for (const part of response.response.candidates[0].content.parts) {
                    if (part.inlineData) {
                        resultImage = Buffer.from(part.inlineData.data, "base64");
                        console.log('🎨 Gambar hasil ditemukan');
                        break;
                    }
                }

                if (resultImage) {
                    // Hapus file upload
                    await fs.promises.unlink(req.file.path);
                    console.log('🗑️ File temporary dibersihkan');

                    const processingTime = Date.now() - startTime;
                    console.log(`✨ Proses selesai dalam ${processingTime}ms`);

                    // Kirim response
                    return res.json({
                        sukses: true,
                        gambar: `data:image/png;base64,${resultImage.toString('base64')}`,
                        teks: "Berhasil mengedit gambar!",
                        processingTime: `${processingTime}ms`
                    });
                } else {
                    throw new Error("Tidak ada gambar yang dihasilkan");
                }
            } catch (error) {
                lastError = error;
                console.error('❌ Error:', error.message);
                
                const isQuotaError = error.message.includes("429") || 
                                   error.message.includes("quota") ||
                                   error.message.includes("rate limit");
                
                if (isQuotaError) {
                    console.log("⚠️ API key limit, mencoba key berikutnya...");
                    retryCount++;
                    continue;
                }
                
                // Error lain yang tidak berhubungan dengan quota
                break;
            }
        }

        // Hapus file temporary jika masih ada
        if (req.file && fs.existsSync(req.file.path)) {
            await fs.promises.unlink(req.file.path);
        }

        if (retryCount >= maxRetries) {
            console.log('❌ Semua API key telah dicoba');
            return res.status(500).json({
                sukses: false,
                error: "Semua API key telah melebihi kuota permintaan"
            });
        }

        // Error umum
        return res.status(500).json({
            sukses: false,
            error: lastError?.message || "Gagal mendapatkan hasil dari AI"
        });

    } catch (error) {
        console.error('🔥 Fatal error:', error);
        
        // Hapus file temporary jika masih ada
        if (req.file && fs.existsSync(req.file.path)) {
            await fs.promises.unlink(req.file.path);
        }

        res.status(500).json({
            sukses: false,
            error: error.message
        });
    }
});

module.exports = router; 
