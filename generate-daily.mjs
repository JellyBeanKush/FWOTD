import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    // Note: I kept your specific Webhook URL and Thread ID
    DISCORD_URL: "https://discord.com/api/webhooks/1475400524881854495/A2eo18Vsm-cIA0p9wN-XdB60vMdEcZ5PJ1MOGLD5sRDM1weRLRk_1xWKo5C7ANTzjlH2?thread_id=1476866801286512733",
    SAVE_FILE: 'current-word.txt',
    HISTORY_FILE: 'word-history.json',
    // UPDATED: Floating aliases + fallbacks for 2026 reliability
    MODELS: [
        "gemini-flash-latest", // Currently points to Gemini 3.1 Flash-Lite
        "gemini-pro-latest",   // Fallback to 3.1 Pro if Flash is busy
        "gemini-2.5-flash",    // Reliable secondary
        "gemini-1.5-flash"     // Safety net
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

    const response = await fetch(CONFIG.DISCORD_URL, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(discordPayload) 
    });

    if (!response.ok) {
        console.error("Discord Post Failed:", await response.text());
    }
}

async function main() {
    let historyData = [];
    if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        try { historyData = JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8')); } catch (e) { historyData = []; }
    }

    if (historyData.length > 0 && historyData[0].generatedDate === todayFormatted) {
        console.log("Already generated a word for today.");
        return;
    }

    const usedWords = historyData.slice(0, 100).map(h => h.word);
    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
    
    const prompt = `Provide a unique "Foreign Word of the Day". 
    Dictionary tone for definition. 
    PHONETICS: Americanized phonetic spelling, CAPS for emphasis.
    EXAMPLE SENTENCE: Feature two streamers (a gay couple). One is a high-energy "Honey Bear" type and the other is a "Jelly Bean" type. Use these character descriptions. Contextual/natural.
    CONSTRAINTS: Max 15 words. No slang like "poggers".
    JSON ONLY: {
      "word": "Word",
      "originalScript": "Native Script or same as word",
      "phonetic": "PHONETIC",
      "partOfSpeech": "noun/verb/adj",
      "definition": "Definition",
      "locale": "LOCALE", 
      "example": "Example featuring the two streamer characters",
      "sourceUrl": "Wiktionary URL"
    }. Used words to avoid: ${usedWords.join(", ")}`;

    for (const modelName of CONFIG.MODELS) {
        try {
            console.log(`Attempting: ${modelName}...`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const responseText = result.response.text();
            
            // Extract JSON from potential markdown wrapping
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            const wordData = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
            
            console.log(`Success with ${modelName}!`);
            
            wordData.generatedDate = todayFormatted;
            
            // Save files
            fs.writeFileSync(CONFIG.SAVE_FILE, JSON.stringify(wordData, null, 2));
            historyData.unshift(wordData);
            fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(historyData.slice(0, 100), null, 2));
            
            // Post to Discord
            await postToDiscord(wordData);
            console.log("Process complete.");
            return; 

        } catch (err) {
            console.error(`Failed with ${modelName}: ${err.message}`);
            if (err.status === 429) {
                console.log("Rate limited. Waiting 10s before fallback...");
                await wait(10000);
            }
            // Loop continues to next model
        }
    }

    console.error("All models failed.");
    process.exit(1);
}

main();
