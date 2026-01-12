const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
require('dotenv').config(); // Load environment variables

const OUTPUT_FILE = path.join(__dirname, '../data/weather_archive.json');
const TRANSLATION_CACHE_FILE = path.join(__dirname, '../data/translation_cache.json');
let translationCache = {};

// --- Translation Setup ---
if (fs.existsSync(TRANSLATION_CACHE_FILE)) {
    try {
        translationCache = JSON.parse(fs.readFileSync(TRANSLATION_CACHE_FILE, 'utf8'));
    } catch (e) {
        console.warn('Failed to load translation cache');
    }
}

function saveTranslationCache() {
    try {
        fs.writeFileSync(TRANSLATION_CACHE_FILE, JSON.stringify(translationCache, null, 2));
    } catch (e) {
        console.error('Failed to save translation cache', e);
    }
}

function hashText(text) {
    return require('crypto').createHash('md5').update(text).digest('hex');
}

const translateText = (text) => {
    return new Promise((resolve) => {
        const apiKey = process.env.GOOGLE_TRANSLATE_KEY || process.env.GCP_TRANSLATE_KEY;
        if (!apiKey || !text || text.length < 2) return resolve(null);

        const key = hashText(text);
        if (translationCache[key]) return resolve(translationCache[key]);

        const https = require('https');
        const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;

        const req = https.request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, (res) => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.data && json.data.translations && json.data.translations.length > 0) {
                        const translated = json.data.translations[0].translatedText;
                        translationCache[key] = translated;
                        saveTranslationCache();
                        resolve(translated);
                    } else {
                        console.error('Translation API error or empty:', data);
                        resolve(null);
                    }
                } catch (e) {
                    console.error('Translation parse error:', e);
                    resolve(null);
                }
            });
        });

        req.on('error', (e) => {
            console.error('Translation Request Error:', e);
            resolve(null);
        });

        req.write(JSON.stringify({
            q: text,
            source: 'de',
            target: 'en',
            format: 'html' // Preserve limited HTML if present, though extracted text is usually clean
        }));
        req.end();
    });
};

// --- Fetching Logic ---

const main = async () => {
    console.log('Fetching LWD Bayern Weather Report via Puppeteer...');

    // Launch Puppeteer (headless)
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox'] // Required for some CI environments
    });

    try {
        const page = await browser.newPage();
        // Go directly to the iframe source for cleaner DOM, or the main page?
        // Main page might be heavier. Let's try iframe source which we found earlier.
        // Url: https://lawinenwarndienst.bayern.de/webclient/weather-report
        await page.goto('https://lawinenwarndienst.bayern.de/webclient/weather-report', {
            waitUntil: 'networkidle0',
            timeout: 60000
        });

        // Wait for the content to appear
        const selector = '.panel-body.weather-report.lwdb-p';
        try {
            await page.waitForSelector(selector, { timeout: 10000 });
        } catch (e) {
            console.log('Specific selector not found, trying general weather-report class...');
            // Fallback
        }

        // Extract HTML content
        const content = await page.evaluate(() => {
            const el = document.querySelector('.panel-body.weather-report.lwdb-p') || document.querySelector('.weather-report');
            return el ? el.outerHTML : null;
        });

        if (!content) {
            console.log('No weather report content found.');
            await browser.close();
            return;
        }

        // Extract Text for Translation (stripping extraction container tags if needed, but keeping inner structure)
        // Actually, we want to translate the *content*. 
        // For simplicity, let's translate the raw HTML string if Google API supports it (it does, format: 'html').
        // This preserves <br> and formatting.

        // Extract Date for Archiving
        // We can use regex on the content string.
        // "on Sunday, 11.01.2026, at 2.30 p.m." OR German "am Montag, den 12.01.2026, um 14.30 Uhr"
        // The regex needs to handle German locale now since we are potentially getting German text directly?
        // Wait, the "webclient-light" URL might serve German.
        // Let's assume German date format based on user sample: 
        // "am Montag, den 12.01.2026, um 14.30 Uhr"

        let datePart, timePart;
        const germanDateMatch = content.match(/(\d{2}\.\d{2}\.\d{4}), um (\d{2}\.\d{2}) Uhr/);
        const englishDateMatch = content.match(/(\d{2}\.\d{2}\.\d{4}), at (\d{1,2}\.\d{2}) (a\.m\.|p\.m\.)/);

        let issuedDate;

        if (germanDateMatch) {
            // 12.01.2026, 14.30
            datePart = germanDateMatch[1];
            timePart = germanDateMatch[2];
            const [day, month, year] = datePart.split('.');
            const [hour, minute] = timePart.split('.');
            issuedDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:00`);
        } else if (englishDateMatch) {
            datePart = englishDateMatch[1];
            const timeRaw = englishDateMatch[2];
            const ampm = englishDateMatch[3];
            const [day, month, year] = datePart.split('.');
            let [hour, minute] = timeRaw.split('.').map(Number);
            if (ampm === 'p.m.' && hour !== 12) hour += 12;
            if (ampm === 'a.m.' && hour === 12) hour = 0;
            issuedDate = new Date(`${year}-${month}-${day}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`);
        } else {
            console.log('Could not parse date from content.');
            console.log(content.substring(0, 300));
            // Fallback to now? No, risky for archive.
            await browser.close();
            return;
        }

        console.log(`Report Issued: ${issuedDate.toLocaleString()}`);

        const hour = issuedDate.getHours();
        let targetDate = new Date(issuedDate);
        if (hour >= 14) {
            targetDate.setDate(targetDate.getDate() + 1);
        }
        const targetDateStr = targetDate.toISOString().split('T')[0];
        console.log(`Target Date for Archive: ${targetDateStr}`);


        // Translate
        console.log('Translating content...');
        // We translate the whole HTML block.
        const translatedHtml = await translateText(content);

        // Prepare Entry
        let archive = [];
        if (fs.existsSync(OUTPUT_FILE)) {
            archive = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
        }

        // Format Issued String (e.g. "Monday, 12.01.2026, at 14.30")
        const dayStr = issuedDate.toLocaleDateString('en-GB', { weekday: 'long' });
        const dateStr = issuedDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeStr = issuedDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }).replace(':', '.');
        const formattedIssued = `${dayStr}, ${dateStr}, at ${timeStr}`;

        const newEntry = {
            date: targetDateStr,
            title: `Mountain Weather Report (${targetDateStr})`,
            issued: formattedIssued,
            html_content: content,
            translated_content: translatedHtml || content, // Fallback to original
            fetched_at: new Date().toISOString()
        };

        const existingIndex = archive.findIndex(a => a.date === targetDateStr);
        if (existingIndex >= 0) {
            console.log(`Updating existing entry for ${targetDateStr}`);
            archive[existingIndex] = newEntry;
        } else {
            console.log(`Creating new entry for ${targetDateStr}`);
            archive.push(newEntry);
            archive.sort((a, b) => b.date.localeCompare(a.date));
        }

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(archive, null, 2));
        console.log(`Weather archive updated.`);

    } catch (e) {
        console.error('Error fetching weather:', e);
    } finally {
        await browser.close();
    }
};

main();
