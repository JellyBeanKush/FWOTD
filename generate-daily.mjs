import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    // Using your specific thread-enabled webhook
    DISCORD_URL: "https://discord.com/api/webhooks/1475400524881854495/A2eo18Vsm-cIA0p9wN-XdB60vMdEcZ5PJ1MOGLD5sRDM1weRLRk_1xWKo5C7ANTzjlH2?thread_id=1476866801286512733",
    SAVE_FILE: 'current-word.txt',
    HISTORY_FILE: 'word-history.json',
    MODELS: ["gemini-flash-latest", "gemini-pro-latest", "gemini-2.5-flash", "gemini-1.5-flash"]
};

const displayDate = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' 
});
const todayKey = new Date().toDateString();

async function main() {
    let history = [];
    if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        try { history = JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8')); } catch (e) { history = []; }
    }

    if (history.length > 0 && history[0].generatedDate === todayKey) {
        console.log("Already generated for today.");
        return;
    }

    const usedWords = history.slice(0, 50).map(h => h.word).join(", ");
    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
    
    const prompt = `Provide a unique "Foreign Word of the Day". 
    Dictionary tone. PHONETICS: Americanized, CAPS for emphasis.
    EXAMPLE SENTENCE: Feature a gay streamer couple. One is a high-energy "Honey Bear" type and the other is a "Jelly Bean" type. Use these character descriptions. Contextual/natural.
    JSON ONLY: {
        "word": "Word", 
        "originalScript": "Native Script", 
        "phonetic": "PHONETIC", 
        "partOfSpeech": "noun/verb", 
        "definition": "Definition", 
        "locale": "Language/Origin", 
        "example": "The example sentence", 
        "sourceUrl": "Wikipedia or Etymology link"
    }.
    STRICT: DO NOT USE: ${usedWords}`;

    for (const modelName of CONFIG.MODELS) {
        try {
            console.log(`Attempting Foreign Word with ${modelName}...`);
            const model = genAI.getGenerativeModel({ 
                model: modelName,
                generationConfig: { response_mime_type: "application/json" } 
            });
            const result = await model.generateContent(prompt);
            const responseText = result.response.text();
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            const wordData = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
            
            wordData.generatedDate = todayKey;
            
            // Save Master Files
            fs.writeFileSync(CONFIG.SAVE_FILE, JSON.stringify(wordData, null, 2));
            history.unshift(wordData);
            fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(history, null, 2)); // INFINITE

            const payload = {
                embeds: [{
                    title: `Foreign Word of the Day - ${displayDate}`,
                    description: `\n# ${wordData.word.toUpperCase()} (${wordData.originalScript})\n${wordData.phonetic} / *${wordData.partOfSpeech}*\n**Origin: ${wordData.locale.toUpperCase()}**\n\n**Definition**\n> ${wordData.definition}\n\n**Example**\n*${wordData.example}*\n\n**[Learn More about this word](${wordData.sourceUrl})**`,
                    color: 0x9b59b6
                }]
            };

            await fetch(CONFIG.DISCORD_URL, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify(payload) 
            });
            console.log("Foreign Word Successful!");
            return;
        } catch (err) {
            console.warn(`${modelName} failed: ${err.message}`);
            if (err.message.includes("429")) await new Promise(r => setTimeout(r, 10000));
        }
    }
}
main();
