const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const geminiConfig = require('../config/gemini');

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
        if (!file.mimetype.match(/^image\/(jpeg|jpg|png)$/)) {
            return cb(new Error('Hanya file gambar (jpeg/jpg/png) yang diperbolehkan!'), false);
        }
        cb(null, true);
    },
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

router.post('/', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                sukses: false,
                error: "File gambar diperlukan"
            });
        }

        const { prompt } = req.body;
        if (!prompt) {
            return res.status(400).json({
                sukses: false,
                error: "Parameter prompt diperlukan"
            });
        }

        let retryCount = 0;
        const maxRetries = geminiConfig.apiKeys.length;

        while (retryCount < maxRetries) {
            try {
                const genAI = new GoogleGenerativeAI(geminiConfig.getApiKey());
                const imageData = fs.readFileSync(req.file.path);
                const base64Image = imageData.toString('base64');

                const contents = [
                    {
                        text: prompt
                    },
                    {
                        inlineData: {
                            mimeType: req.file.mimetype,
                            data: base64Image,
                        },
                    },
                ];

                const model = genAI.getGenerativeModel({
                    model: "gemini-1.5-flash",
                    generationConfig: {
                        responseModalities: ["Text", "Image"],
                    },
                });

                const response = await model.generateContent(contents);

                if (!response?.response?.candidates?.[0]?.content?.parts) {
                    throw new Error("Gagal mendapatkan hasil dari AI");
                }

                let resultImage;
                let resultText = "";

                for (const part of response.response.candidates[0].content.parts) {
                    if (part.text) {
                        resultText += part.text;
                    } else if (part.inlineData) {
                        resultImage = Buffer.from(part.inlineData.data, "base64");
                    }
                }

                if (resultImage) {
                    // Hapus file upload setelah selesai
                    fs.unlinkSync(req.file.path);

                    // Kirim response
                    res.json({
                        sukses: true,
                        gambar: `data:image/png;base64,${resultImage.toString('base64')}`,
                        teks: resultText || ""
                    });
                    break;
                } else {
                    throw new Error("Tidak ada gambar yang dihasilkan");
                }
            } catch (error) {
                if (error.message.includes("429 Too Many Requests")) {
                    console.log("API key telah melebihi kuota, mencoba API key lain...");
                    retryCount++;
                } else {
                    console.error(error);
                    res.status(500).json({
                        sukses: false,
                        error: error.message
                    });
                    break;
                }
            }
        }

        if (retryCount >= maxRetries) {
            res.status(500).json({
                sukses: false,
                error: "Semua API key telah melebihi kuota permintaan"
            });
        }

    } catch (error) {
        console.error(error);
        res.status(500).json({
            sukses: false,
            error: error.message
        });
    }
});

module.exports = router; 
