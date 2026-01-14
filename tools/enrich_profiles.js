const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config();

// Translation Cache
const TRANSLATION_CACHE_FILE = path.join(__dirname, '../data/translation_cache.json');
let translationCache = {};
if (fs.existsSync(TRANSLATION_CACHE_FILE)) {
    try { translationCache = JSON.parse(fs.readFileSync(TRANSLATION_CACHE_FILE, 'utf8')); }
    catch (e) { console.warn('Failed to load translation cache'); }
}
function saveTranslationCache() {
    try { fs.writeFileSync(TRANSLATION_CACHE_FILE, JSON.stringify(translationCache, null, 2)); }
    catch (e) { }
}

function hashText(text) {
    return require('crypto').createHash('md5').update(text).digest('hex');
}

async function translateText(text) {
    const apiKey = process.env.GCP_TRANSLATE_KEY || process.env.GOOGLE_TRANSLATE_KEY;
    if (!apiKey) return null;
    if (!text || text.length < 2) return null;

    const key = hashText(text);
    if (translationCache[key]) return translationCache[key];

    try {
        return new Promise((resolve) => {
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
                        } else { resolve(null); }
                    } catch (e) { resolve(null); }
                });
            });
            req.on('error', () => resolve(null));
            req.write(JSON.stringify({ q: text, source: 'de', target: 'en', format: 'text' }));
            req.end();
        });
    } catch (e) { return null; }
}

const rootDir = path.resolve(__dirname, '..');
const incidentsPath = path.join(rootDir, 'data', 'incidents.json');
const recentPath = path.join(rootDir, 'data', 'recent_profiles.json');

async function fetchProfile(id) {
    return new Promise((resolve) => {
        const url = `https://lawis.at/lawis_api/v2_3/profile/${id}`;
        https.get(url, (res) => {
            if (res.statusCode !== 200) {
                console.log(`[WARN] Failed to fetch ${id}: ${res.statusCode}`);
                resolve(null);
                return;
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    console.error(`[ERR] Failed to parse ${id}`);
                    resolve(null);
                }
            });
        }).on('error', (e) => {
            console.error(`[ERR] valid URL ${url}: ${e.message}`);
            resolve(null);
        });
    });
}

function parseTests(comment) {
    if (!comment) return [];
    // Match "ECTP 13 @ 16.0cm" or "ECTP 13@16.0cm" or "ECTP 13"
    // Regex: /(ECT[A-Z]*\s*\d+)(?:\s*@\s*([\d.]+)\s*cm)?/
    const tests = [];
    const regex = /(ECT[A-Z]*\s*\d+)(?:\s*@\s*([\d.]+)\s*cm)?/g;
    let match;

    // Normalize newlines to avoid issues
    comment = comment.replace(/\r\n/g, '\n');

    while ((match = regex.exec(comment)) !== null) {
        const rawText = match[1]; // "ECTP 13"
        const height = match[2];  // "16.0" (optional)

        // Parse "ECTP 13"
        const parts = rawText.match(/([A-Z]+)\s*(\d+)/);
        if (!parts) continue;

        const typeStr = parts[1]; // "ECTP"
        const step = parts[2];     // "13"

        // Determine P (Propagation) or N (No Prop)
        let code = '';
        let baseType = typeStr;
        if (typeStr.endsWith('P')) {
            code = 'P';
            baseType = typeStr.slice(0, -1);
        } else if (typeStr.endsWith('N')) {
            code = 'N';
            baseType = typeStr.slice(0, -1);
        }

        // Create structure to match buildProfilePages expectations
        // build uses: t.type.text, t.result.text (regex extracted), t.step, t.height
        // result text needs to contain "(P)" for P, etc.
        const resultText = code === 'P' ? 'propagation (P)' : (code === 'N' ? 'no propagation (N)' : '');

        tests.push({
            type: { text: baseType },
            step: parseInt(step),
            height: height ? parseFloat(height) : null,
            result: { text: resultText }
        });
    }
    return tests;
}

async function run() {
    console.log('Enriching profiles with detailed metadata...');

    let incidents = [];
    let recent = [];

    if (fs.existsSync(incidentsPath)) incidents = JSON.parse(fs.readFileSync(incidentsPath, 'utf8'));
    if (fs.existsSync(recentPath)) recent = JSON.parse(fs.readFileSync(recentPath, 'utf8'));

    // Collect unique IDs to fetch
    const profilesToFetch = new Map();

    // From Recent
    recent.forEach(p => {
        const id = p.profil_id || p.id;
        if (id) profilesToFetch.set(String(id), p);
    });

    // From Incidents
    incidents.forEach(inc => {
        if (inc.linked_profiles) {
            inc.linked_profiles.forEach(p => {
                const id = p.id || p.profil_id;
                if (id) profilesToFetch.set(String(id), p);
            });
        }
    });

    console.log(`Found ${profilesToFetch.size} unique profiles.`);
    let enrichedCount = 0;

    for (const [id, localObj] of profilesToFetch) {
        // Skip if we already have "slope" and "weather" (user might have good data?)
        // Actually, fetch overwrites usually lack specific details. "ort" usually missing in scraper?
        // Scraper fills "location" with subregion?
        // We ALWAYS fetch to get "bemerkungen" for stability tests.

        const data = await fetchProfile(id);
        if (data) {
            // Update Local Object (in memory, affects incidents/recent arrays because objects are refs?
            // Wait, profilesToFetch values are references to objects in recent/incidents arrays?
            // Yes, JS objects are refs.

            // Map API fields to our Schema
            // API: ort, bemerkungen, seehoehe(int), hangneigung(int), exposition_id(int)
            // Local: location, comments, elevation, slope, aspect

            if (data.ort) localObj.location = data.ort;
            if (data.ort) localObj.ort = data.ort; // For recent

            if (data.seehoehe) localObj.elevation = data.seehoehe;
            if (data.seehoehe) localObj.seehoehe = data.seehoehe;

            if (data.hangneigung) localObj.slope = data.hangneigung;
            if (data.hangneigung) localObj.neigung = data.hangneigung;
            if (data.hangneigung) localObj.hangneigung = data.hangneigung;

            if (data.exposition_id) localObj.aspect = data.exposition_id;
            if (data.exposition_id) localObj.exposition = data.exposition_id; // Mapping ID
            if (data.exposition_id) localObj.exposition_id = data.exposition_id;

            if (data.bemerkungen) {
                localObj.comments = data.bemerkungen;

                // Translate
                if (process.env.GCP_TRANSLATE_KEY || process.env.GOOGLE_TRANSLATE_KEY) {
                    const translated = await translateText(data.bemerkungen);
                    if (translated) localObj.comments_en = translated;
                }

                const tests = parseTests(data.bemerkungen);
                if (tests.length > 0) {
                    localObj.stability_tests = tests; // Enriched!
                }
            }
            enrichedCount++;
            process.stdout.write('.');
        }
    }
    console.log(`\nEnriched ${enrichedCount} profiles.`);

    // Save
    fs.writeFileSync(incidentsPath, JSON.stringify(incidents, null, 2));
    fs.writeFileSync(recentPath, JSON.stringify(recent, null, 2));
    console.log('Saved enrichment updates.');
}

run();
