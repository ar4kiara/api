// API Keys Configuration
global.gemini = "AIzaSyAAf6AvcwccbfQmVolMi2Qd5x0wCH3JLF0" // get apikey: https://ai.google.dev/gemini-api/docs?hl=id
global.gemini2 = "AIzaSyDuXo-bcBI7nnfVVYmrUhlwGh5M4C2KjIw"
global.gemini3 = "AIzaSyDS1wYHIKcYAUunCtxWoqti-0sbt1L-gt0"
global.gemini4 = "AIzaSyDR2hu_LlT4r6RNlODZxApYtvqCdCViq1I"
global.gemini5 = "AIzaSyDaRN9rMMG9J5lscRCvD0DVx2FVBiU6zfQ"

// Array of Gemini API keys for rotation
global.geminiKeys = [
    global.gemini,
    global.gemini2,
    global.gemini3,
    global.gemini4,
    global.gemini5
];

module.exports = {
    geminiKeys: global.geminiKeys
}; 