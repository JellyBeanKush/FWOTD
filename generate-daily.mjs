import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    // Targeted directly to your thread
    DISCORD_URL: "https://discord.com/api/webhooks/1475400524881854495/A2eo18Vsm-cIA0p9wN-XdB60vMdEcZ5PJ1MOGLD5sRDM1weRLRk_1xWKo5C7ANTzjlH2?thread_id=1476866801286512733",
    SAVE_FILE: 'current-word.txt',
    HISTORY_FILE: 'word-history.json',
    // Using official stable IDs to prevent 404 errors
    MODELS: ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-flash-8b"]
};

const todayFormatted = new Date().toDateString();
const options = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' };
const displayDate = new Date().toLocaleDateString('en-US', options);

async function postToDiscord(wordData) {
    // Show original script only if it differs from the romanized word
    const displayWord = wordData.originalScript && wordData.originalScript !== wordData.word 
        ? `${wordData.word.toUpperCase()} (${wordData.originalScript})`
        : wordData.word.toUpperCase();

    const discordPayload = {
        embeds: [{
            title: `Foreign Word of the Day - ${displayDate}`,
            description: `\n\n` +
                         `# ${displayWord}\n` +
                         `${wordData.phonetic} / *${wordData.partOfSpeech}*\n` +
                         `**${wordData.locale.toUpperCase()}**\n\n` +
                         `**Definition**\n${wordData.definition}\n\n` +
                         `**Example**\n*${wordData.example}*\n\n` +
                         `**[Learn More](${wordData.sourceUrl})**`,
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
        try { 
            historyData = JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8'));
        } catch (e) { historyData = []; }
    }

    // Prevents duplicate posts on the same day
    if (historyData.length > 0 && historyData[0].generatedDate === todayFormatted) {
        console.log("Word already generated for today. Skipping.");
        return;
    }

    const usedWords = historyData.slice(0, 100).map(h => h.word);
    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
    
    const prompt = `Provide a unique "Foreign Word of the Day". 
Dictionary tone for the definition.
PHONETICS: Must use "Americanized" phonetic spelling with CAPS for emphasis (e.g., "shuh-NAN-ih-gunz").
EXAMPLE SENTENCE: Create a natural scenario featuring HoneyBear and JellyBean (a gay couple and Twitch streamers). Use the names. The word must be used contextually and make sense.
CONSTRAINTS: Max 15 words. No "poggers" or "pogs". 
JSON ONLY: {
  "word": "Romanized Word",
  "originalScript": "Native Script (e.g. Kanji/Cyrillic) or same as word if Latin",
  "phonetic": "PHONETIC",
  "partOfSpeech": "noun/verb/adj",
  "definition": "Definition",
  "locale": "LOCALE", 
  "example": "Example with HoneyBear and JellyBean",
  "sourceUrl": "Wiktionary URL"
}. DO NOT use: ${usedWords.join(", ")}`;

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
            continue; 
        }
    }

    if (!wordData) return console.error("All models failed.");

    wordData.generatedDate = todayFormatted;
    fs.writeFileSync(CONFIG.SAVE_FILE, JSON.stringify(wordData, null, 2));
    historyData.unshift(wordData);
    fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(historyData, null, 2));

    await postToDiscord(wordData);
    console.log("Post successful!");
}

main();
