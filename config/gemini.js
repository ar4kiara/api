module.exports = {
    apiKeys: [
        "AIzaSyAAf6AvcwccbfQmVolMi2Qd5x0wCH3JLF0",
        "AIzaSyDuXo-bcBI7nnfVVYmrUhlwGh5M4C2KjIw",
        "AIzaSyDS1wYHIKcYAUunCtxWoqti-0sbt1L-gt0",
        "AIzaSyDR2hu_LlT4r6RNlODZxApYtvqCdCViq1I",
        "AIzaSyDaRN9rMMG9J5lscRCvD0DVx2FVBiU6zfQ"
    ],
    currentKeyIndex: 0,
    
    getApiKey() {
        const key = this.apiKeys[this.currentKeyIndex];
        this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
        return key;
    }
}; 
