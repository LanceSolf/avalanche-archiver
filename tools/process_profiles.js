const https = require('https');
const fs = require('fs');
const path = require('path');

const INCIDENTS_FILE = path.join(__dirname, '../data/incidents.json');
const RECENT_PROFILES_FILE = path.join(__dirname, '../data/recent_profiles.json');
const PROFILE_API_URL = 'https://lawis.at/lawis_api/v2_3/profile/';
const IMAGES_DIR = path.join(__dirname, '../data/profile_images');

if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

function downloadImage(url, profileId) {
    return new Promise((resolve) => {
        if (!url) return resolve(null);

        // Extract filename
        const filename = path.basename(url).split('?')[0];
        const destDir = IMAGES_DIR; // Flat structure for profiles? or subfolders? Flat is fine for IDs.
        // Actually incidents used ID folder. Profiles have unique IDs too.

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


// Configuration
const MATCH_DIST_KM = 0.5; // 500m
const MATCH_TIME_DAYS = 7;
const RECENT_WINDOW_DAYS = 2;

// Helper to fetch JSON
function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'AvalancheArchiver/1.0' } }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    console.error('JSON Parse error', data.substring(0, 100));
                    resolve([]);
                }
            });
        }).on('error', reject);
    });
}

// Haversine Distance
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

(async () => {
    console.log('--- Processing Snow Profiles ---');

    // 1. Load Incidents
    let incidents = [];
    if (fs.existsSync(INCIDENTS_FILE)) {
        incidents = JSON.parse(fs.readFileSync(INCIDENTS_FILE, 'utf8'));
    }
    console.log(`Loaded ${incidents.length} incidents.`);

    // 2. Fetch Profiles (Historical Pass logic: fetch from 2018?)
    // In production, we might want to be smarter, but for now, let's fetch broad.
    // However, fetching 6 years of profiles might be heavy. 
    // Optimization: If we have many incidents, we definitely want matching.
    // Let's simpler: Fetch ALL from 2018-01-01. Lawis API is usually fast enough for a few thousand items.

    // Calculate start date: Earliest incident date - 7 days, OR default to 2018.
    // For now, let's hardcode a reasonable historical start for the "one-time" pass.
    // User requested "one-time historical pass".
    const startDate = '2018-09-01';
    console.log(`Fetching profiles since ${startDate}...`);

    const profiles = await fetchJson(`${PROFILE_API_URL}?startDate=${startDate}`);
    console.log(`Fetched ${profiles.length} profiles.`);

    // 3. Match Profiles to Incidents
    let mtachedCount = 0;

    // We should enable "Germany" and "Allgau" filtering for recent profiles.
    // Simple Bounding Box/Region Check for "Recent" list (Allgau + Bayern)
    // Approximate box for Bavarian Alps + Allgau:
    // Lat: 47.2 - 47.8, Lon: 9.9 - 13.5
    // Center: Oberstdorf (47.4099, 10.2797) - Radius: 25km
    function isRelevantRegion(p) {
        const lat = p.latitude;
        const lon = p.longitude;
        if (!lat || !lon) return false;

        const dist = getDistance(47.4099, 10.2797, lat, lon);
        return dist <= 25;
    }

    const now = new Date();
    const recentProfiles = [];

    // Helper to parse date "YYYY-MM-DD HH:mm:ss"
    function parseDate(dStr) {
        return new Date(dStr.replace(' ', 'T'));
    }

    profiles.forEach(p => {
        const pDate = parseDate(p.datum); // Assuming "datum" field

        // A. Recent Profiles Logic
        const diffDays = (now - pDate) / (1000 * 60 * 60 * 24);
        if (diffDays <= RECENT_WINDOW_DAYS && diffDays >= 0) {
            // Check region
            if (isRelevantRegion(p)) {
                recentProfiles.push(p);
            }
        }
    });

    // B. Incident Matching Logic
    // B. Incident Matching Logic
    for (const inc of incidents) {
        const iDate = parseDate(inc.date);

        // Initialize or clear matches
        inc.linked_profiles = [];

        for (const p of profiles) {
            if (!p.latitude || !p.longitude) continue;

            // 1. Time Check
            const pDate = parseDate(p.datum);
            const timeDiff = Math.abs((iDate - pDate) / (1000 * 60 * 60 * 24));

            if (timeDiff <= MATCH_TIME_DAYS) {
                // 2. Distance Check
                const dist = getDistance(inc.lat, inc.lon, p.latitude, p.longitude);
                if (dist <= MATCH_DIST_KM) {
                    // Match!
                    const imgUrl = `https://lawis.at/lawis_api/v2_3/files/profiles/snowprofile_${p.profil_id}.png?v=${p.revision || 1}`;
                    let localPath = null;
                    try {
                        // We can await here now
                        localPath = await downloadImage(imgUrl, p.profil_id);
                        if (localPath) localPath = localPath.replace(/\\/g, '/');
                    } catch (e) { console.error('Error downloading profile image', e); }

                    inc.linked_profiles.push({
                        id: p.profil_id,
                        date: p.datum,
                        dist_km: dist.toFixed(3),
                        elevation: p.seehoehe,
                        aspect: p.exposition, // or expo? need to verify field
                        latitude: p.latitude,
                        longitude: p.longitude,
                        url: imgUrl,
                        local_path: localPath
                    });
                }
            }
        }

        if (inc.linked_profiles.length > 0) {
            mtachedCount++;
            // Sort by distance
            inc.linked_profiles.sort((a, b) => parseFloat(a.dist_km) - parseFloat(b.dist_km));
        }
    }

    console.log(`Matched profiles to ${mtachedCount} incidents.`);
    console.log(`Found ${recentProfiles.length} recent profiles in region.`);

    // 4. Save
    fs.writeFileSync(INCIDENTS_FILE, JSON.stringify(incidents, null, 2));

    // Sort recent by date desc
    recentProfiles.sort((a, b) => parseDate(b.datum) - parseDate(a.datum));
    fs.writeFileSync(RECENT_PROFILES_FILE, JSON.stringify(recentProfiles, null, 2));

    console.log('Saved updates.');

})();
