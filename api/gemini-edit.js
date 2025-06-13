const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const geminiConfig = require('../config/gemini');

router.post('/', async (req, res) => {
    try {
        console.log('📥 Request body:', req.body);
        const { image_url, prompt } = req.body;
        
        if (!image_url) {
            return res.status(400).json({
                sukses: false,
                error: "Parameter image_url diperlukan"
            });
        }

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
                // Download gambar dari URL
                console.log('⬇️ Mengunduh gambar dari URL:', image_url);
                const imageResponse = await axios.get(image_url, {
                    responseType: 'arraybuffer',
                    timeout: 5000 // 5 detik timeout untuk download
                });
                
                const imageData = Buffer.from(imageResponse.data);
                const base64Image = imageData.toString('base64');
                const mimeType = imageResponse.headers['content-type'] || 'image/jpeg';

                const genAI = new GoogleGenerativeAI(geminiConfig.getApiKey());
                const contents = [
                    {
                        text: prompt
                    },
                    {
                        inlineData: {
                            mimeType: mimeType,
                            data: base64Image,
                        },
                    },
                ];

                const model = genAI.getGenerativeModel({
                    model: "gemini-pro-vision",
                    generationConfig: {
                        temperature: 0.4,
                        topK: 32,
                        topP: 1,
                        maxOutputTokens: 2048,
                    },
                });

                console.log('🤖 Memproses dengan Gemini AI...');
                const response = await model.generateContent(contents);

                if (!response?.response?.candidates?.[0]?.content?.parts) {
                    throw new Error("Gagal mendapatkan hasil dari AI");
                }

                let resultText = "";
                for (const part of response.response.candidates[0].content.parts) {
                    if (part.text) {
                        resultText += part.text;
                    }
                }

                // Kirim response
                res.json({
                    sukses: true,
                    gambar: image_url,
                    teks: resultText || "Gambar berhasil diproses"
                });
                break;

            } catch (error) {
                console.error('Error:', error.message);
                if (error.message.includes("429 Too Many Requests")) {
                    console.log("API key telah melebihi kuota, mencoba API key lain...");
                    retryCount++;
                } else {
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
