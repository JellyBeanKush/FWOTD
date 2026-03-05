import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: "https://discord.com/api/webhooks/1475400524881854495/A2eo18Vsm-cIA0p9wN-XdB60vMdEcZ5PJ1MOGLD5sRDM1weRLRk_1xWKo5C7ANTzjlH2?thread_id=1476866801286512733",
    SAVE_FILE: 'current-word.txt',
    HISTORY_FILE: 'word-history.json',
    MODELS: ["gemini-flash-latest", "gemini-pro-latest", "gemini-2.5-flash", "gemini-1.5-flash"]
};

const todayFormatted = new Date().toDateString();
const displayDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' });

async function main() {
    let history = fs.existsSync(CONFIG.HISTORY_FILE) ? JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8')) : [];
    if (history.length > 0 && history[0].generatedDate === todayFormatted) return;

    const usedWords = history.slice(0, 50).map(h => h.word); // Context limit for prompt
    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
    
    const prompt = `Provide a unique "Foreign Word of the Day". 
    Dictionary tone. PHONETICS: Americanized, CAPS for emphasis.
    EXAMPLE: Feature two streamer characters (gay couple). One is a high-energy "Honey Bear" type, the other is a "Jelly Bean" type. Use character descriptions.
    JSON ONLY: {"word": "Word", "originalScript": "Native", "phonetic": "PHONETIC", "partOfSpeech": "noun", "definition": "Def", "locale": "LOCALE", "example": "Ex", "sourceUrl": "URL"}.
    Avoid: ${usedWords.join(", ")}`;

    for (const modelName of CONFIG.MODELS) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const responseText = result.response.text();
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            const wordData = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
            
            wordData.generatedDate = todayFormatted;
            fs.writeFileSync(CONFIG.SAVE_FILE, JSON.stringify(wordData, null, 2));
            history.unshift(wordData);
            fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(history, null, 2)); // INFINITE

            const payload = { embeds: [{
                title: `Foreign Word of the Day - ${displayDate}`,
                description: `\n# ${wordData.word.toUpperCase()} (${wordData.originalScript})\n${wordData.phonetic} / *${wordData.partOfSpeech}*\n**${wordData.locale.toUpperCase()}**\n\n**Definition**\n${wordData.definition}\n\n**Example**\n*${wordData.example}*\n\n**[Learn More](${wordData.sourceUrl})**`,
                color: 0x9b59b6
            }]};
            await fetch(CONFIG.DISCORD_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            return;
        } catch (err) { console.warn(`${modelName} failed.`); }
    }
}
main();
