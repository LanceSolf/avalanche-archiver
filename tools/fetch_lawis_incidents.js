const https = require('https');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../data/incidents.json');
const LOCATIONS_URL = 'https://lawis.at/lawis_api/v2_3/location/';
const INCIDENTS_URL = 'https://lawis.at/lawis_api/v2_3/incident/';

// Date Utils
function getSeasonDates() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12

    // Avalanche season usually starts around Sept/Oct.
    // If we are in Jan 2026, season started late 2025.
    // If we are in Oct 2025, season started late 2025.
    let startYear = currentYear;
    if (currentMonth < 9) {
        startYear = currentYear - 1;
    }

    return {
        startDate: `${startYear}-09-01`,
        endDate: `${startYear + 1}-09-01`
    };
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: { 'Accept': 'application/json', 'User-Agent': 'AvalancheArchiver/1.0' }
        }, (res) => {
            if (res.statusCode !== 200) {
                return reject(new Error(`Failed to fetch ${url}, status: ${res.statusCode}`));
            }
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

(async () => {
    try {
        console.log('Fetching locations...');
        const locations = await fetchJson(LOCATIONS_URL);

        // Recursive search for IDs
        const relevantSubregionIds = new Set();

        function findSubregions(obj, parentName = '') {
            if (!obj || typeof obj !== 'object') return;

            // If this object represents a region/subregion with a name
            if (obj.name && (obj.name.toLowerCase().includes('allgäu') || obj.name.toLowerCase().includes('kleinwalsertal'))) {
                // Try to determine the ID. In the Lawis structure, the ID is often the key in the parent object used to access this object.
                // However, we are iterating. If we are currently AT the object, we might not have the ID if it's the key.
                // But wait, usually `subregions` is a map of ID -> Object.
                // So when we iterate `Object.entries(parent.subregions)`, the key is the ID.
            }

            // Iterate children
            for (const key in obj) {
                const child = obj[key];
                if (key === 'subregions' && typeof child === 'object') {
                    // Iterate subregions map specifically to capture IDs
                    for (const subId in child) {
                        const subData = child[subId];
                        if (subData.name && (subData.name.toLowerCase().includes('allgäu') || subData.name.toLowerCase().includes('kleinwalsertal'))) {
                            console.log(`Found relevant subregion: ${subData.name} (ID: ${subId})`);
                            relevantSubregionIds.add(parseInt(subId));
                        }
                        // Recurse in case there are sub-subregions
                        findSubregions(subData, subData.name);
                    }
                } else {
                    findSubregions(child);
                }
            }
        }

        findSubregions(locations);

        if (relevantSubregionIds.size === 0) {
            console.warn('No relevant subregions found. Defaulting to known ID 82 (Allgäuer Alpen/Vorarlberg) as fallback.');
            relevantSubregionIds.add(82);
        }

        console.log('Fetching incidents...');
        // Fetch broad range to capture historical archive
        // User example was from 2021. Let's fetch from 2018.
        const incidentApiUrl = `${INCIDENTS_URL}?startDate=2018-09-01&endDate=${getSeasonDates().endDate}`;
        console.log(`Querying: ${incidentApiUrl}`);

        const allIncidents = await fetchJson(incidentApiUrl);

        if (!Array.isArray(allIncidents)) {
            throw new Error('Incidents API response is not an array');
        }

        const relevantIncidents = allIncidents.filter(inc =>
            relevantSubregionIds.has(inc.subregion_id)
        ).map(inc => ({
            id: inc.incident_id,
            date: inc.datum,
            location: inc.ort,
            regionId: inc.region_id,
            subregionId: inc.subregion_id,
            lat: inc.latitude,
            lon: inc.longitude,
            url: `https://lawis.at/incident/${inc.incident_id}`
        }));

        console.log(`Found ${relevantIncidents.length} relevant incidents.`);

        // 1. Load existing data to avoid re-fetching/re-translating
        let existingIncidentsMap = new Map();
        if (fs.existsSync(OUTPUT_FILE)) {
            try {
                const existingData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
                for (const inc of existingData) {
                    existingIncidentsMap.set(inc.id, inc);
                }
                console.log(`Loaded ${existingIncidentsMap.size} existing incidents from local cache.`);
            } catch (e) {
                console.warn('Could not read existing data file, starting fresh.');
            }
        }

        const detailedIncidents = [];
        let newOrUpdatedCount = 0;

        for (const simpleInc of relevantIncidents) {
            try {
                // Check if we already have this incident with full details and translation
                const existing = existingIncidentsMap.get(simpleInc.id);

                let needsUpdate = false;
                if (!existing) {
                    needsUpdate = true; // New incident
                } else if (!existing.details) {
                    needsUpdate = true; // No details
                } else if (existing.details.comments && !existing.details.comments_en) {
                    needsUpdate = true; // Available German comments but no translation -> Retry translation
                }

                if (!needsUpdate) {
                    // Reuse existing data
                    detailedIncidents.push(existing);
                    continue;
                }

                newOrUpdatedCount++;
                // Throttle slightly only if we are actually fetching
                await new Promise(r => setTimeout(r, 200));

                const detailUrl = `https://lawis.at/lawis_api/public/incident/${simpleInc.id}`;
                console.log(`Fetching details for ${simpleInc.id}...`);
                const details = await fetchJson(detailUrl);

                // Merge details
                let parsedImages = [];
                // 1. Try images from API response first
                if (details.images && Array.isArray(details.images)) {
                    parsedImages = details.images
                        .filter(img => img && img.url)
                        .map(img => ({
                            url: `https://lawis.at/lawis_api/v2_3/${img.url}`,
                            caption: img.caption,
                            comment: img.comment
                        }));
                }

                // 2. If no images found, try probing
                if (parsedImages.length === 0) {
                    console.log(`  Probing images for ${simpleInc.id}...`);
                    parsedImages = await probeImages(simpleInc.id);
                } else {
                    // console.log(`  Found ${parsedImages.length} images from API for ${simpleInc.id}.`);
                }

                // 3. Translate Comments
                // Only if we don't have it (though we entered here because we might not)
                // If we had existing data but just missed translation, details might differ? 
                // We fetched fresh details, so we use them.

                let commentsEn = null;
                // If we had an existing translation and text didn't change, we could keep it?
                // But simplified: just try to translate if text exists.
                // NOTE: If this is a "retry" for translation, we want to try.

                if (details.comments) {
                    // Check if we already had it translated in "existing" to avoid re-charge if we re-fetched for other reasons?
                    // But our logic says we only enter if !comments_en. So we are safe.
                    console.log(`  Translating text for ${simpleInc.id}...`);
                    commentsEn = await translateText(details.comments);
                    if (commentsEn) console.log(`  -> Success!`);
                    else console.log(`  -> Failed.`);
                }

                detailedIncidents.push({
                    ...simpleInc,
                    details: {
                        ...details,
                        images: parsedImages,
                        comments_en: commentsEn
                    }
                });

            } catch (err) {
                console.error(`Failed to fetch details for ${simpleInc.id}`, err);
                detailedIncidents.push(simpleInc);
            }
        }

        console.log(`Processed all incidents. ${newOrUpdatedCount} fetched/updated.`);

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(detailedIncidents, null, 2));
        console.log(`Saved ${detailedIncidents.length} incidents to ${OUTPUT_FILE}`);

    } catch (error) {
        console.error('Error in fetch_lawis_incidents:', error);
        process.exit(1);
    }
})();

async function probeImages(incidentId) {
    const base = "https://lawis.at/lawis_api/v2_3/files/incidents";
    const found = [];
    // Verify up to 5 images to keep it fast, user script said 20 but that's a lot of requests per incident
    for (let i = 0; i < 20; i++) {
        const index = String(i).padStart(3, '0');
        const url = `${base}/incident_${incidentId}_${index}.jpg`;
        // Check if exists using HEAD or GET
        try {
            const exists = await checkUrlExists(url);
            if (exists) {
                found.push({ url: url });
            } else if (i === 0) {
                // If the first one (000) fails, we assume no images and stop probing
                break;
            } else {
                // If a subsequent one fails, maybe gap? or end.
                // Usually sequential. Let's stop to save time.
                break;
            }
        } catch (e) {
            break;
        }
    }
    return found;
}

function checkUrlExists(url) {
    return new Promise((resolve) => {
        const req = https.request(url, { method: 'HEAD' }, (res) => {
            resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.end();
    });
}

// Google Translate API
// We expect GCP_TRANSLATE_KEY in env or .env file
function loadEnv() {
    try {
        const envPath = path.join(__dirname, '../.env');
        if (fs.existsSync(envPath)) {
            const lines = fs.readFileSync(envPath, 'utf8').split('\n');
            for (const line of lines) {
                const parts = line.split('=');
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    const val = parts.slice(1).join('=').trim();
                    if (key && val && !process.env[key]) {
                        process.env[key] = val;
                    }
                }
            }
        }
    } catch (e) { /* ignore */ }
}
loadEnv();

// Translation Cache to save costs
const TRANSLATION_CACHE_FILE = path.join(__dirname, '../data/translation_cache.json');
let translationCache = {};
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

// Simple hash for cache keys
function hashText(text) {
    return require('crypto').createHash('md5').update(text).digest('hex');
}

async function translateText(text) {
    const apiKey = process.env.GCP_TRANSLATE_KEY || process.env.GOOGLE_TRANSLATE_KEY;
    if (!apiKey) {
        // console.log('  Skipping translation: No GCP_TRANSLATE_KEY found.');
        return null;
    }
    if (!text || text.length < 2) return null;

    // Check Cache
    const key = hashText(text);
    if (translationCache[key]) {
        // console.log('  (Cached translation used)');
        return translationCache[key];
    }

    try {
        return new Promise((resolve) => {
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
                            // Save to cache
                            translationCache[key] = translated;
                            saveTranslationCache();
                            resolve(translated);
                        } else {
                            resolve(null);
                        }
                    } catch (e) { resolve(null); }
                });
            });
            req.on('error', () => resolve(null));
            req.write(JSON.stringify({
                q: text,
                source: 'de',
                target: 'en',
                format: 'text'
            }));
            req.end();
        });
    } catch (e) {
        return null;
    }
}

function callTranslate(url, text) {
    // Deprecated for Google API
    return null;
}
