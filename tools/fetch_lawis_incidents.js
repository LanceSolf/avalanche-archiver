const https = require('https');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../data/incidents.json');
const IMAGES_DIR = path.join(__dirname, '../data/incident_images');
const LOCATIONS_URL = 'https://lawis.at/lawis_api/v2_3/location/';
const INCIDENTS_URL = 'https://lawis.at/lawis_api/v2_3/incident/';

if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

function downloadImage(url, incidentId) {
    return new Promise((resolve) => {
        if (!url) return resolve(null);

        // Extract filename
        const filename = path.basename(url).split('?')[0];
        const destDir = path.join(IMAGES_DIR, incidentId.toString());
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

        const destPath = path.join(destDir, filename);

        // Skip if exists
        if (fs.existsSync(destPath)) return resolve(path.relative(path.join(__dirname, '..', 'data'), destPath));

        https.get(url, (res) => {
            if (res.statusCode === 200) {
                const file = fs.createWriteStream(destPath);
                res.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve(path.relative(path.join(__dirname, '..', 'data'), destPath));
                });
            } else {
                resolve(null);
            }
        }).on('error', () => resolve(null));
    });
}

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

                let finalInc = simpleInc;
                let details = null;
                let parsedImages = [];
                let commentsEn = null;

                if (!needsUpdate) {
                    finalInc = existing;
                } else {
                    newOrUpdatedCount++;
                    // Throttle slightly only if we are actually fetching
                    await new Promise(r => setTimeout(r, 200));

                    const detailUrl = `https://lawis.at/lawis_api/public/incident/${simpleInc.id}`;
                    console.log(`Fetching details for ${simpleInc.id}...`);
                    try {
                        details = await fetchJson(detailUrl);
                    } catch (e) {
                        console.error(`Failed to fetch details for ${simpleInc.id}`, e);
                        detailedIncidents.push(simpleInc);
                        continue;
                    }

                    // Merge details
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
                        // console.log(`  Probing images for ${simpleInc.id}...`);
                        parsedImages = await probeImages(simpleInc.id);
                    } else {
                        // console.log(`  Found ${parsedImages.length} images from API for ${simpleInc.id}.`);
                    }

                    // DOWNLOAD IMAGES
                    for (const img of parsedImages) {
                        try {
                            const localRelPath = await downloadImage(img.url, simpleInc.id);
                            if (localRelPath) {
                                img.local_path = localRelPath.replace(/\\/g, '/'); // Normalize for JSON
                            }
                        } catch (e) {
                            console.error(`Failed to download image ${img.url}`, e);
                        }
                    }

                    if (details.comments) {
                        console.log(`  Translating text for ${simpleInc.id}...`);
                        commentsEn = await translateText(details.comments);
                        if (commentsEn) console.log(`  -> Success!`);
                        else console.log(`  -> Failed.`);
                    }

                    finalInc = {
                        ...simpleInc,
                        details: {
                            ...details,
                            images: parsedImages,
                            comments_en: commentsEn
                        }
                    };
                }

                // ALWAYS Re-Run PDF Logic
                await ensurePdfLink(finalInc);

                detailedIncidents.push(finalInc);

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

async function ensurePdfLink(inc) {
    const DAILY_PDF_DIR = path.join(__dirname, '../data/pdfs');
    const INCIDENT_PDF_DIR = path.join(__dirname, '../data/incident_bulletins');

    const dateStr = inc.date || (inc.details && inc.details.date);
    if (!dateStr) return;
    const iDate = dateStr.split(' ')[0].split('T')[0];

    // Priority slugs based on heuristics, but we will check all
    const slugs = [
        'allgau-alps-central',
        'allgau-alps-west',
        'allgau-alps-east',
        'allgau-prealps'
    ];

    // Determine a "primary" slug for copy target if we need to copy from Daily
    let primarySlug = 'allgau-alps-central';
    if (inc.regionId === 2) primarySlug = 'allgau-alps-west';
    else if (inc.regionId === 1) primarySlug = 'allgau-alps-east';
    // ... (keep refined logic if needed, but for now simple mapping is better than strict)

    const dateObj = new Date(iDate);
    if (isNaN(dateObj.getTime())) return;
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const ym = `${year}-${month}`;

    let foundPath = null;

    // 1. Check if it already exists in Incident Archive (any slug)
    for (const slug of slugs) {
        const checkPath = path.join(INCIDENT_PDF_DIR, slug, ym, `${iDate}.pdf`);
        if (fs.existsSync(checkPath)) {
            foundPath = `incident_bulletins/${slug}/${ym}/${iDate}.pdf`;
            break;
        }
    }

    // 2. If not in Incident Archive, try to find in Daily Archive (any slug) and COPY
    if (!foundPath) {
        for (const slug of slugs) {
            const checkPath = path.join(DAILY_PDF_DIR, slug, `${iDate}.pdf`);
            if (fs.existsSync(checkPath)) {
                // Found in Daily! Copy to Incident Archive (using the SAME slug to preserve structure)
                const targetAbsPath = path.join(INCIDENT_PDF_DIR, slug, ym, `${iDate}.pdf`);
                try {
                    fs.mkdirSync(path.dirname(targetAbsPath), { recursive: true });
                    fs.copyFileSync(checkPath, targetAbsPath);
                    foundPath = `incident_bulletins/${slug}/${ym}/${iDate}.pdf`;
                } catch (e) {
                    // ignore
                }
                break;
            }
        }
    }

    if (foundPath) {
        inc.pdf_path = foundPath;
    }
}
