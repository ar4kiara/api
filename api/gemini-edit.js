const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('../config.js'); // Import config file

// Konfigurasi multer untuk menangani upload file
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(process.cwd(), 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    fileFilter: function (req, file, cb) {
        if (!file.mimetype.match(/^image\/(jpeg|jpg|png)$/)) {
            return cb(new Error('Hanya file gambar JPEG/JPG/PNG yang diperbolehkan!'), false);
        }
        cb(null, true);
    }
});

let currentKeyIndex = 0;

const getApiKey = () => {
    const key = global.geminiKeys[currentKeyIndex];
    currentKeyIndex = (currentKeyIndex + 1) % global.geminiKeys.length;
    return key;
};

router.post('/', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                sukses: false,
                error: "File gambar diperlukan",
                contoh: {
                    method: "POST",
                    url: "/gemini-edit",
                    body: "form-data",
                    fields: {
                        image: "file gambar (jpg/jpeg/png)",
                        prompt: "deskripsi edit dalam bahasa inggris"
                    }
                }
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
        const maxRetries = global.geminiKeys.length;
        let success = false;

        while (retryCount < maxRetries && !success) {
            try {
                const genAI = new GoogleGenerativeAI(getApiKey());
                const imageData = fs.readFileSync(req.file.path);
                const base64Image = imageData.toString('base64');

                const contents = [
                    { text: prompt },
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
                    const outputPath = path.join(process.cwd(), 'uploads', `edited_${Date.now()}.png`);
                    fs.writeFileSync(outputPath, resultImage);

                    res.json({
                        sukses: true,
                        hasil: {
                            teks: resultText,
                            gambar: `/uploads/${path.basename(outputPath)}`
                        }
                    });

                    // Hapus file temporary setelah 5 menit
                    setTimeout(() => {
                        try {
                            fs.unlinkSync(req.file.path);
                            fs.unlinkSync(outputPath);
                        } catch (error) {
                            console.error('Error deleting temporary files:', error);
                        }
                    }, 300000);

                    success = true;
                } else {
                    throw new Error("Tidak ada gambar hasil yang dihasilkan");
                }
            } catch (error) {
                if (error.message.includes("429 Too Many Requests")) {
                    console.log("API key telah melebihi kuota, mencoba API key lain...");
                    retryCount++;
                } else {
                    throw error;
                }
            }
        }

        if (!success) {
            throw new Error("Semua API key telah melebihi kuota permintaan");
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