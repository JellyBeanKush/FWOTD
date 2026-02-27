import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: "https://discord.com/api/webhooks/1475400524881854495/A2eo18Vsm-cIA0p9wN-XdB60vMdEcZ5PJ1MOGLD5sRDM1weRLRk_1xWKo5C7ANTzjlH2?thread_id=1476866801286512733",
    SAVE_FILE: 'current-word.txt',
    HISTORY_FILE: 'word-history.json',
    // Prioritizing the 2.5 Flash experimental builds
    MODELS: [
        "gemini-2.5-flash-exp", 
        "gemini-2.5-flash", 
        "gemini-1.5-flash-002"
    ]
};

const wait = (ms) => new Promise(res => setTimeout(res, ms));
const todayFormatted = new Date().toDateString();
const options = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' };
const displayDate = new Date().toLocaleDateString('en-US', options);

async function postToDiscord(wordData) {
    const displayWord = wordData.originalScript && wordData.originalScript !== wordData.word 
        ? `${wordData.word.toUpperCase()} (${wordData.originalScript})`
        : wordData.word.toUpperCase();

    const discordPayload = {
        embeds: [{
            title: `Foreign Word of the Day - ${displayDate}`,
            description: `\n\n# ${displayWord}\n${wordData.phonetic} / *${wordData.partOfSpeech}*\n**${wordData.locale.toUpperCase()}**\n\n**Definition**\n${wordData.definition}\n\n**Example**\n*${wordData.example}*\n\n**[Learn More](${wordData.sourceUrl})**`,
            color: 0x9b59b6
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
        try { historyData = JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8')); } catch (e) { historyData = []; }
    }

    if (historyData.length > 0 && historyData[0].generatedDate === todayFormatted) return;

    const usedWords = historyData.slice(0, 100).map(h => h.word);
    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
    
    const prompt = `Provide a unique "Foreign Word of the Day". 
Dictionary tone for definition. 
PHONETICS: Americanized phonetic spelling, CAPS for emphasis.
EXAMPLE SENTENCE: Feature HoneyBear and JellyBean (gay couple/streamers). Use their names. Contextual/natural.
CONSTRAINTS: Max 15 words. No "poggers".
JSON ONLY: {
  "word": "Word",
  "originalScript": "Native Script or same as word",
  "phonetic": "PHONETIC",
  "partOfSpeech": "noun/verb/adj",
  "definition": "Definition",
  "locale": "LOCALE", 
  "example": "Example with HoneyBear and JellyBean",
  "sourceUrl": "Wiktionary URL"
}. Used: ${usedWords.join(", ")}`;

    let wordData = null;
    for (const modelName of CONFIG.MODELS) {
        try {
            console.log(`Attempting: ${modelName}...`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const responseText = result.response.text().replace(/```json|```/g, "").trim();
            wordData = JSON.parse(responseText);
            console.log(`Success with ${modelName}!`);
            break; 
        } catch (err) {
            console.error(`Failed with ${modelName}: ${err.message}`);
            // If we hit a quota, wait before trying the backup model
            if (err.message.includes("429")) {
                console.log("Waiting 15 seconds to bypass rate limit...");
                await wait(15000);
            }
            continue; 
        }
    }

    if (!wordData) return console.error("All models failed.");
    wordData.generatedDate = todayFormatted;
    fs.writeFileSync(CONFIG.SAVE_FILE, JSON.stringify(wordData, null, 2));
    historyData.unshift(wordData);
    fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(historyData, null, 2));
    await postToDiscord(wordData);
    console.log("Success!");
}

main();
