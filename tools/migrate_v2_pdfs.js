const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../data');
const cacheDir = path.join(dataDir, 'bulletin_cache');

const SLUG_MAP = {
    'allgau-prealps': 'DE-BY-11',
    'allgau-alps-central': 'DE-BY-12',
    'allgau-alps-west': 'AT-08-01',
    'allgau-alps-east': 'AT-07-01'
};

const CACHE_FILES_MAP = {
    'DE-BY-11': 'DE-BY',
    'DE-BY-12': 'DE-BY',
    'AT-08-01': 'AT-08',
    'AT-07-01': 'AT-07'
};

function getPublicationTime(regionId, dateStr) {
    const prefix = CACHE_FILES_MAP[regionId];
    if (!prefix) return null;

    const cacheFile = path.join(cacheDir, `${prefix}_${dateStr}.json`);
    if (!fs.existsSync(cacheFile)) return null;

    try {
        const content = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        const bulletins = Array.isArray(content) ? content : content.bulletins;

        for (const b of bulletins) {
            // Check if this bulletin covers our region
            const rIds = b.regions.map(r => (typeof r === 'string' ? r : r.regionID));
            if (rIds.includes(regionId)) {
                return b.publicationTime;
            }
        }
    } catch (e) {
        console.error('Error reading cache:', e);
    }
    return null;
}

function formatSuffix(isoString) {
    try {
        const d = new Date(isoString);
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        const H = String(d.getUTCHours()).padStart(2, '0');
        const M = String(d.getUTCMinutes()).padStart(2, '0');
        return `_${y}${m}${day}-${H}${M}`;
    } catch (e) {
        return null;
    }
}

// Walk through PDFs
const pdfsDir = path.join(dataDir, 'pdfs');
if (fs.existsSync(pdfsDir)) {
    const slugs = fs.readdirSync(pdfsDir);
    for (const slug of slugs) {
        const regionId = SLUG_MAP[slug];
        if (!regionId) continue;

        const slugDir = path.join(pdfsDir, slug);
        const files = fs.readdirSync(slugDir);

        for (const file of files) {
            if (file.endsWith('_v2.pdf')) {
                const dateStr = file.replace('_v2.pdf', '');

                const pubTime = getPublicationTime(regionId, dateStr);
                if (pubTime) {
                    const suffix = formatSuffix(pubTime);
                    if (suffix) {
                        const oldPath = path.join(slugDir, file);
                        const newPath = path.join(slugDir, `${dateStr}${suffix}.pdf`);

                        console.log(`Renaming ${file} -> ${dateStr}${suffix}.pdf`);
                        fs.renameSync(oldPath, newPath);
                    } else {
                        console.log(`Could not format suffix for ${file} (PubTime: ${pubTime})`);
                    }
                } else {
                    console.log(`No cache/pubTime found for ${slug}/${file}`);
                }
            }
        }
    }
}
