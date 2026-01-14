const fs = require('fs');
const path = require('path');
const { generateProfileDetailPage } = require('../templates');
const { PATHS } = require('../config');

/**
 * Build Profile Pages
 */
function buildProfilePages() {
    // Determine source file. Use recent_profiles.json if available for "Latest" semantics, 
    // or profiles.json for a full archive. 
    // User context implies "Latest Snow Profiles (Last 48 Hours)".
    // Let's check recentProfiles first.
    const profilesPath = PATHS.recentProfiles || path.join(PATHS.data, 'recent_profiles.json');

    if (!fs.existsSync(profilesPath)) {
        console.warn(`Profiles data not found at ${profilesPath}, skipping profile build.`);
        return 0;
    };

    // Load recent profiles
    let profiles = [];
    if (fs.existsSync(profilesPath)) {
        profiles = JSON.parse(fs.readFileSync(profilesPath, 'utf8')).map(p => ({
            ...p,
            neigung: p.neigung || p.hangneigung,
            exposition: p.exposition || p.exposition_id
        }));
    }

    // Also load profiles linked in incidents
    const incidentsPath = PATHS.incidents; // Ensure this is defined in config or construct it
    if (fs.existsSync(incidentsPath)) {
        const incidents = JSON.parse(fs.readFileSync(incidentsPath, 'utf8'));
        incidents.forEach(inc => {
            if (inc.linked_profiles) {
                inc.linked_profiles.forEach(lp => {
                    // Check if already in profiles to avoid duplicates
                    // Normalize to string to avoid type mismatch
                    if (!profiles.find(p => String(p.profil_id || p.id) === String(lp.id))) {
                        // console.log(`Adding linked profile: ${lp.id}`);
                        // Adapt linked_profile structure to profile structure if needed
                        // linked_profile has { id, date, elevation, aspect, latitude, longitude, ... }
                        // templates expect { ort, datum, seehoehe, ... }
                        // We map what we have. 
                        profiles.push({
                            profil_id: lp.id,
                            ort: lp.location || `Profile ${lp.id}`, // Incidents might not have location name for profile
                            datum: lp.date,
                            seehoehe: lp.elevation,
                            exposition: lp.aspect,
                            neigung: lp.slope || '?', // Incidents might not have slope
                            region: 'Archived',
                            latitude: lp.latitude,
                            longitude: lp.longitude
                        });
                    }
                });
            }
        });
    }
    console.log(`Total profiles to build: ${profiles.length}`);

    const profilesDir = path.join(PATHS.archive, 'profiles');
    if (!fs.existsSync(profilesDir)) fs.mkdirSync(profilesDir, { recursive: true });

    // Copy map if exists (legacy)
    const mapSrc = path.join(PATHS.profiles || path.join(PATHS.root, 'tools'), 'map.html');
    if (fs.existsSync(mapSrc)) {
        let mapContent = fs.readFileSync(mapSrc, 'utf8');
        mapContent = mapContent.replace('javascript:history.back()', 'index.html');
        fs.writeFileSync(path.join(profilesDir, 'map.html'), mapContent);
    }

    let count = 0;

    // Sort by date descending
    profiles.sort((a, b) => new Date(b.datum).getTime() - new Date(a.datum).getTime());

    profiles.forEach(p => {
        // Image handling - LAWIS uses "snowprofile_{id}.png" naming
        // Incident linked profiles might have local_path
        const pId = p.profil_id || p.id;
        // console.log(`Building page for profile: ${pId}`);
        const imgName = `snowprofile_${pId}.png`;
        const imgPath = path.join(PATHS.profileImages, imgName);

        // Copy image
        const destImgDir = path.join(profilesDir, 'images');
        if (!fs.existsSync(destImgDir)) fs.mkdirSync(destImgDir, { recursive: true });

        if (fs.existsSync(imgPath)) {
            fs.copyFileSync(imgPath, path.join(destImgDir, imgName));
        }

        const html = generateProfileDetailPage(p, `images/${imgName}`, '../../', 'index.html');
        fs.writeFileSync(path.join(profilesDir, `${pId}.html`), html);
        count++;
    });

    // 4. Create Recent Profiles Subset (Last 48h)
    const cutoffTime = Date.now() - 172800000;
    const recentProfiles = profiles.filter(p => new Date(p.datum).getTime() >= cutoffTime);

    // 5. Inject Dynamic Markers into Map HTML
    if (fs.existsSync(path.join(profilesDir, 'map.html'))) {
        let mapContent = fs.readFileSync(path.join(profilesDir, 'map.html'), 'utf8');

        // Script to clear static markers and add recent ones
        const mapScript = `
        <script>
            document.addEventListener("DOMContentLoaded", function() {
                setTimeout(() => {
                    let map;
                    for (let key in window) {
                         if (window[key] instanceof L.Map) { map = window[key]; break; }
                    }
                    if (!map) return;
                    
                    // Remove existing static CircleMarkers
                    map.eachLayer(layer => {
                        if (layer instanceof L.CircleMarker) {
                            map.removeLayer(layer);
                        }
                    });
                    
                    // Add Recent Profiles
                    const profiles = ${JSON.stringify(recentProfiles)};
                    profiles.forEach(p => {
                        if (p.latitude && p.longitude) {
                            const marker = L.circleMarker([p.latitude, p.longitude], {
                                color: "#0284c7", fillColor: "#0284c7", fillOpacity: 0.7, radius: 8, weight:2
                            }).addTo(map);
                            const backParam = window.location.search; // Pass current context if any
                            marker.bindPopup(\`<b>\${p.ort}</b><br><span style="font-size:0.8rem">\${p.datum}</span><br><a href="\${p.profil_id || p.id}.html\${backParam}" style="color:#0284c7; font-weight:bold;">View Profile →</a>\`);
                        }
                    });
                }, 1000); // Delay to ensure static script ran
            });
        </script>`;

        // Append before body end
        mapContent = mapContent.replace('</body>', mapScript + '</body>');
        fs.writeFileSync(path.join(profilesDir, 'map.html'), mapContent);
    }


    // Custom Index Page Generation (matching User Request)
    const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Latest Snow Profiles</title>
    <link rel="stylesheet" href="../../styles.css">
    <style>
        .profile-list { display: grid; gap: 2rem; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); margin-top:2rem; }
        .station-card { background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border: 1px solid #e5e7eb; }
        .station-header { border-bottom: 2px solid #3b82f6; margin-bottom: 1rem; padding-bottom: 0.5rem; display:flex; justify-content:space-between; align-items:center; }
        .station-name { font-size: 1.1rem; margin:0; color: #1e40af; font-weight:700; }
        .latest-update { font-size: 0.85rem; color: #6b7280; }
        .data-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; margin-bottom: 1rem; }
        .data-item { display:flex; flex-direction:column; }
        .data-label { font-size: 0.75rem; text-transform:uppercase; color: #6b7280; font-weight:600; }
        .data-value { font-weight: 600; font-size: 0.95rem; }
        .source-link { color: #ef4444; font-weight: bold; text-decoration: none; font-size:0.9rem;}
        .source-link:hover { text-decoration: underline; }
        .map-container { width: 100%; height: 500px; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 1rem; }
        .stability-tag { display: inline-block; background: #fee2e2; color: #991b1b; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; font-weight: 600; margin-right: 4px; margin-bottom: 4px; border:1px solid #fca5a5; }
    </style>
</head>
<body>
    <div class="container">
        <header><div class="header-content"><a href="../../index.html" class="logo">Avalanche Archive</a></div></header>
        
        <h1>Latest Snow Profiles (Last 48 Hours)</h1>

        <!-- Requested Back Link -->
        <div style="margin-bottom: 1rem;"><a href="../../index.html">&larr; Back</a></div>

        <div class="map-container">
             <iframe src="map.html" width="100%" height="100%" style="border:none;"></iframe>
        </div>

        <div style="margin-top: 1rem; margin-bottom: 0rem;"><a href="../../index.html">&larr; Back</a></div>

        <div class="profile-list">
            ${recentProfiles.map(p => {
        const hs = getHS(p.profile);
        const tests = formatTests(p.stability_tests);
        const comments = p.comments_en || translateComments(p.comments);

        return `
            <div class="station-card">
                <div class="station-header">
                    <h2 class="station-name"><a href="${p.profil_id || p.id}.html" style="color:inherit; text-decoration:none;">${p.ort}</a></h2>
                    <span class="latest-update">${p.datum}</span>
                </div>
                <div class="data-grid">
                   <div class="data-item"><span class="data-label">Elev</span><span class="data-value">${p.seehoehe ? p.seehoehe + ' m' : '-'}</span></div>
                   <div class="data-item"><span class="data-label">Aspect</span><span class="data-value">${translateAspect(p.exposition) || '-'}</span></div>
                   <div class="data-item"><span class="data-label">Slope</span><span class="data-value">${p.neigung ? p.neigung + '°' : '-'}</span></div>
                   <div class="data-item"><span class="data-label">HS</span><span class="data-value">${hs ? hs + ' cm' : '-'}</span></div>
                </div>
                ${tests.length > 0 ? `<div style="margin-bottom:0.75rem;">
                    ${tests.map(t => {
            const style = t.isSafe
                ? 'background:#dcfce7; color:#166534; border:1px solid #bbf7d0;'
                : 'background:#fee2e2; color:#991b1b; border:1px solid #fca5a5;';
            return `<span class="stability-tag" style="${style}">${t.text}</span>`;
        }).join('')}
                </div>` : ''}
                ${comments ? `<div style="font-size:0.85rem; color:#4b5563; background:#f9fafb; padding:8px; border-radius:6px; margin-bottom:1rem; border:1px solid #f3f4f6;">
                    <strong>Comments:</strong><br>${comments.replace(/\n/g, '<br>')}
                </div>` : ''}
                <a href="${p.profil_id || p.id}.html" class="source-link">View Detail &rarr;</a>
            </div>`;
    }).join('')}
            
            <div class="station-card" style="border: 2px dashed #bae6fd; background: #f0f9ff; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center;">
                 <div style="font-size:3rem; margin-bottom:1rem;">🇦🇹</div>
                 <h2 class="station-name" style="margin-bottom:0.5rem;">See All Profiles</h2>
                 <p style="color:#666; margin-bottom:1rem;">View full database on Lawis.at</p>
                 <a href="https://lawis.at/profile/" target="_blank" class="source-link" style="font-size:1.1rem;">Go to Lawis &rarr;</a>
            </div>
        </div>
        
        <div style="margin-top:2rem"><a href="../../index.html">&larr; Back</a></div>
    </div>
</body>
</html>`;

    fs.writeFileSync(path.join(profilesDir, 'index.html'), indexHtml);
    console.log(`Generated ${count} profile pages and index.`);
    return count;
}

// Helper for aspect translation if not imported
function translateAspect(id) {
    if (!id) return '-';
    const map = { '1': 'N', '2': 'NE', '3': 'E', '4': 'SE', '5': 'S', '6': 'SW', '7': 'W', '8': 'NW' };
    return map[String(id)] || id;
}

function getHS(layers) {
    if (!layers || !layers.length) return null;
    let max = 0;
    layers.forEach(l => {
        if (l.height && l.height.max > max) max = l.height.max;
    });
    return max;
}

function formatTests(tests) {
    if (!tests || !tests.length) return [];
    return tests.map(t => {
        const type = t.type ? t.type.text : '?';
        const res = t.result ? t.result.text : '';

        // Safety Detection
        const isSafe = /no\s*break|kein\s*bruch|KB|ECTN|ECTX|no\s*prop/i.test(res);

        // Formatting
        const resCodeMatch = res.match(/\(([^)]+)\)/);
        const code = resCodeMatch ? resCodeMatch[1] : '';

        let label = type;
        if (code) label += code;

        let detail = ` ${t.step}`;
        if (t.height) detail += `@${t.height}cm`;

        // Append text if not clear from code
        if (!code && isSafe) detail += ' (No Break)';

        return { text: label + detail, isSafe };
    });
}

function translateComments(text) {
    if (!text) return '';
    let t = text;
    const map = [
        [/plötzlicher Bruch/gi, 'sudden fracture'],
        [/Teilbruch/gi, 'partial fracture'],
        [/ganzer Block/gi, 'whole block'],
        [/kein Bruch/gi, 'no fracture'],
        [/No break/gi, 'no fracture'], // Normalize
        [/KB/g, 'KB (no fracture)'],
        [/bis/gi, 'to'],
        [/Profil im Bereich der Anrisskante einer mittelgroßen Lawine vom Vortag – ausgelöst durch einzelnen Skifahrer/gi, 'Profile taken in the area of the crown of a medium‑sized avalanche from the previous day – triggered by a single skier']
    ];
    map.forEach(([re, rep]) => t = t.replace(re, rep));
    return t;
}

module.exports = { buildProfilePages };
