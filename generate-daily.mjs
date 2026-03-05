import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: "https://discord.com/api/webhooks/1475400524881854495/A2eo18Vsm-cIA0p9wN-XdB60vMdEcZ5PJ1MOGLD5sRDM1weRLRk_1xWKo5C7ANTzjlH2?thread_id=1476866801286512733",
    SAVE_FILE: 'current-word.txt',
    HISTORY_FILE: 'word-history.json',
    // Prioritizing stability to avoid the hang seen in your logs
    MODELS: ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-flash-latest"],
    TIMEOUT_MS: 30000 
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
        console.log("FWOTD already generated for today.");
        return;
    }

    const usedWords = history.slice(0, 50).map(h => h.word).join(", ");
    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
    
    const prompt = `Provide a unique "Foreign Word of the Day". 

    FORMATTING RULES:
    - No parentheses after the main word.
    - Example for pronunciation: "yuh-KOT-tuh". 
    - Locale: Just the language name (e.g., "SWEDISH"). Do NOT include the word "Origin:".

    EXAMPLE SENTENCE RULES:
    - Feature HoneyBear and JellyBean.
    - Length: Strictly 15 to 20 words total.
    
    JSON ONLY: {
        "word": "WORD", 
        "phonetic": "PHONETIC", 
        "partOfSpeech": "noun/verb", 
        "definition": "Definition", 
        "locale": "LANGUAGE", 
        "example": "One short sentence with HoneyBear and JellyBean.", 
        "sourceUrl": "Wiki Link"
    }
    DO NOT USE: ${usedWords}`;

    for (const modelName of CONFIG.MODELS) {
        try {
            console.log(`Attempting FWOTD with ${modelName}...`);
            const model = genAI.getGenerativeModel({ 
                model: modelName,
                generationConfig: { response_mime_type: "application/json" } 
            });

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);

            const result = await model.generateContent(prompt);
            clearTimeout(timeout);

            const responseText = result.response.text();
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            const wordData = JSON.parse(jsonMatch[0]);
            
            wordData.generatedDate = todayKey;
            
            fs.writeFileSync(CONFIG.SAVE_FILE, JSON.stringify(wordData, null, 2));
            history.unshift(wordData);
            fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(history, null, 2));

            // Minimalist "Voorpret" Styling
            await fetch(CONFIG.DISCORD_URL, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({
                    embeds: [{
                        title: `Foreign Word of the Day - ${displayDate}`,
                        description: `\n# ${wordData.word.toUpperCase()}\n\n${wordData.phonetic} / *${wordData.partOfSpeech}*\n**${wordData.locale.toUpperCase()}**\n\n**Definition**\n${wordData.definition}\n\n**Example**\n*${wordData.example}*\n\n**[Learn More](${wordData.sourceUrl})**`,
                        color: 0x9b59b6
                    }]
                }) 
            });

            console.log("Success with minimalist formatting!");
            return;
        } catch (err) {
            console.error(`⚠️ ${modelName} failed or timed out: ${err.message}`);
        }
    }
}

main().catch(err => { console.error(err); process.exit(1); });
