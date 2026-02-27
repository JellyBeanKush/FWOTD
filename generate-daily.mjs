import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: process.env.DISCORD_WEBHOOK_URL,
    SAVE_FILE: 'current-word.txt',        
    HISTORY_FILE: 'word-history.json',    
    // Model Tier List
    MODELS: ["gemini-3-flash", "gemini-2.5-flash", "gemini-1.5-flash-latest"]
};

const todayFormatted = new Date().toDateString(); 
const options = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' };
const displayDate = new Date().toLocaleDateString('en-US', options);

async function postToDiscord(wordData) {
    const discordPayload = {
        embeds: [{
            title: `Word of the Day - ${displayDate}`,
            description: `# ${wordData.word.toUpperCase()}\n` +
                         `*[${wordData.phonetic}] (${wordData.partOfSpeech})*\n\n` +
                         `**Definition**\n> ${wordData.definition}\n\n` +
                         `**Example**\n*${wordData.example}*\n\n` +
                         `[Learn More](${wordData.sourceUrl})`,
            color: 0x9b59b6,
            footer: { text: `Locale: ${wordData.locale}` }
        }]
    };
    await fetch(CONFIG.DISCORD_URL, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(discordPayload) 
    });
}

async function main() {
    let historyData = [];
    if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        try { 
            const content = fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8');
            historyData = JSON.parse(content);
        } catch (e) { historyData = []; }
    }

    // Don't run if we already generated a word today
    if (historyData.length > 0 && historyData[0].generatedDate === todayFormatted) return;

    const usedWords = historyData.slice(0, 100).map(h => h.word);
    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
    
    const prompt = `Provide a unique "Foreign Word of the Day". 
    Dictionary tone for the definition.
    PHONETICS: Must use "Americanized" phonetic spelling with CAPS for emphasis (e.g., "shuh-NAN-ih-gunz").
    EXAMPLE SENTENCE: Must be grounded and streaming-related. Use variety: mention "the streamer(s)," "HoneyBear," "JellyBean," "chat," "game lore," or "co-op gameplay." 
    CONSTRAINTS: Max 15 words for the example. No "poggers," "pogs," or cringe-heavy slang. Avoid specific names; use character descriptions only.
    JSON ONLY: {
      "word": "WORD",
      "phonetic": "PHONETIC",
      "partOfSpeech": "noun/verb/adj",
      "definition": "Definition",
      "locale": "LOCALE", 
      "example": "Example",
      "sourceUrl": "Wiktionary URL"
    }. DO NOT use: ${usedWords.join(", ")}`;

    let wordData = null;

    // Loop through models until one works
    for (const modelName of CONFIG.MODELS) {
        try {
            console.log(`Attempting to generate with: ${modelName}...`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const responseText = result.response.text().replace(/```json|```/g, "").trim();
            wordData = JSON.parse(responseText);
            console.log(`Success with ${modelName}!`);
            break; // Exit loop on success
        } catch (err) {
            console.error(`Failed with ${modelName}:`, err.message);
            continue; // Try next model
        }
    }

    if (!wordData) {
        console.error("All models failed to generate content.");
        return;
    }

    wordData.generatedDate = todayFormatted;

    // Save files
    fs.writeFileSync(CONFIG.SAVE_FILE, JSON.stringify(wordData, null, 2));
    historyData.unshift(wordData);
    fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(historyData, null, 2));

    await postToDiscord(wordData);
}

main();
