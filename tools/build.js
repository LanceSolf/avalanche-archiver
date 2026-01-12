const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../data');
const archiveDir = path.join(__dirname, '../archive');
const outputDir = path.join(__dirname, '..');

// Clean archive directory
if (fs.existsSync(archiveDir)) {
    fs.rmSync(archiveDir, { recursive: true, force: true });
}
fs.mkdirSync(archiveDir, { recursive: true });

// Copy Images
const incImgSrc = path.join(dataDir, 'incident_images');
if (fs.existsSync(incImgSrc)) {
    fs.cpSync(incImgSrc, path.join(archiveDir, 'incident_images'), { recursive: true });
}
const profImgSrc = path.join(dataDir, 'profile_images');
if (fs.existsSync(profImgSrc)) {
    fs.cpSync(profImgSrc, path.join(archiveDir, 'profile_images'), { recursive: true });
}

// Copy Incident Bulletins (New Structure)
// User requested NOT to copy them to archive, but link to data/ directory directly.
// const bulletinsSrc = path.join(dataDir, 'incident_bulletins');
// if (fs.existsSync(bulletinsSrc)) {
//    fs.cpSync(bulletinsSrc, archiveDir, { recursive: true });
// }

const REGION_CONFIG = {
    'allgau-prealps': {
        label: 'Allgäu Prealps (Sonthofen)',
        slug: 'allgau-prealps',
        type: 'pdf'
    },
    'allgau-alps-central': {
        label: 'Allgäu Alps Central (Oberstdorf)',
        slug: 'allgau-alps-central',
        type: 'pdf'
    },
    'allgau-alps-west': {
        label: 'Allgäu Alps West (Kleinwalsertal)',
        slug: 'allgau-alps-west',
        type: 'pdf'
    },
    'allgau-alps-east': {
        label: 'Allgäu Alps East (Tannheimer Tal)',
        slug: 'allgau-alps-east',
        type: 'pdf'
    }
};

// --- HELPER FUNCTIONS ---

// --- HELPER FUNCTIONS ---
// (Removed HTML rendering functions as we now serve PDFs only)


// --- MAIN EXECUTION ---
(async () => {
    // 1. Gather Data
    const allData = {}; // structure: { regionId: { month: { date: payload } } } (payload is {type: 'pdf', src: string})

    for (const regionId of Object.keys(REGION_CONFIG)) {
        allData[regionId] = {};
    }


    // Load Incidents
    let incidents = [];
    const incidentsPath = path.join(__dirname, '../data/incidents.json');
    if (fs.existsSync(incidentsPath)) {
        try {
            incidents = JSON.parse(fs.readFileSync(incidentsPath, 'utf8'));
            console.log(`Loaded ${incidents.length} incidents.`);
        } catch (e) {
            console.error('Failed to load incidents.json', e);
        }
    }

    // Process PDF Files
    const pdfsBaseDir = path.join(__dirname, '../data/pdfs');
    if (fs.existsSync(pdfsBaseDir)) {
        for (const regionSlug of fs.readdirSync(pdfsBaseDir)) {
            // Check if this slug matches a known configuration
            // Note: REGION_CONFIG keys are currently slugs for our setup
            const regionKey = regionSlug;
            if (!REGION_CONFIG[regionKey]) continue;

            const regionDir = path.join(pdfsBaseDir, regionSlug);
            const pdfFiles = fs.readdirSync(regionDir).filter(f => f.endsWith('.pdf'));

            for (const pdfFile of pdfFiles) {
                const dateStr = pdfFile.replace('.pdf', '');
                const monthStr = dateStr.slice(0, 7);

                if (!allData[regionKey][monthStr]) {
                    allData[regionKey][monthStr] = {};
                }
                // Mark payload as PDF
                allData[regionKey][monthStr][dateStr] = { type: 'pdf', src: path.join(regionDir, pdfFile) };
            }
        }
    }

    // 2. Build Hierarchy
    // archive/
    //   {slug}/
    //     index.html (Months list)
    //     {yyyy-mm}/
    //       index.html (Days list)
    //       {yyyy-mm-dd}.pdf

    for (const [regionId, monthsData] of Object.entries(allData)) {
        const config = REGION_CONFIG[regionId];
        const regionDir = path.join(archiveDir, config.slug);

        if (!fs.existsSync(regionDir)) fs.mkdirSync(regionDir, { recursive: true });

        // Generate Region Index (List of Months)
        const sortedMonths = Object.keys(monthsData).sort().reverse();
        // Only include months that are actually present in the data (incidents might add months not in PDFs?)
        // The check line 68 ensures month object exists.

        let monthsHtml = generateIndexPage(
            `${config.label} - Select Month`,
            `../../`,
            sortedMonths.map(m => ({ text: getMonthName(m), href: `${m}/index.html` })),
            false,
            `../../index.html`
        );
        fs.writeFileSync(path.join(regionDir, 'index.html'), monthsHtml);

        for (const [month, datesData] of Object.entries(monthsData)) {
            const monthDir = path.join(regionDir, month);
            if (!fs.existsSync(monthDir)) fs.mkdirSync(monthDir, { recursive: true });

            // Generate Month Index (List of Days)
            const sortedDates = Object.keys(datesData).sort().reverse();
            let daysHtml = generateIndexPage(
                `${config.label} - ${getMonthName(month)}`,
                `../../../`,
                sortedDates.map(d => {
                    return {
                        text: d, // The date string (e.g. 2025-01-01)
                        href: `${d}.pdf`
                    };
                }),
                false,
                `../index.html`
            );
            fs.writeFileSync(path.join(monthDir, 'index.html'), daysHtml);

            // Copy PDFs
            for (const [date, payload] of Object.entries(datesData)) {
                if (payload.type === 'pdf') {
                    fs.copyFileSync(payload.src, path.join(monthDir, `${date}.pdf`));
                    // console.log(`Copied PDF: ${config.slug}/${month}/${date}.pdf`);
                }
            }
        }
    }

    // --- Build Dedicated Incidents Page ---
    if (incidents.length > 0) {
        const incidentsDir = path.join(archiveDir, 'incidents');
        if (!fs.existsSync(incidentsDir)) fs.mkdirSync(incidentsDir, { recursive: true });

        // Sort incidents by date desc
        incidents.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Group by Season or just list? Let's just list with headers as requested.
        // We will pass pre-formatted HTML items to generateIndexPage if possible, 
        // or we need to modify generateIndexPage to handle non-link items or just different structure.
        // Actually, generateIndexPage expects {text, href}.
        // Let's create a custom HTML content for incidents.

        const incidentItems = incidents.map(inc => {
            // Generate Detail Page
            const safeDate = inc.date.split(' ')[0];
            const detailFilename = `${safeDate}_${inc.id}.html`;
            const detailPath = path.join(incidentsDir, detailFilename);

            const detailHtml = generateIncidentPage(inc);
            fs.writeFileSync(detailPath, detailHtml);

            return {
                text: `<span class="inc-date">${safeDate}</span><br><span class="inc-loc">${inc.location}</span>`,
                href: detailFilename, // Link to local file
                className: 'incident-card'
            };
        });

        const incidentsHtml = generateIndexPage(
            'Avalanche Incidents (Allgäu)',
            '../../',
            incidentItems,
            false,
            '../../index.html'
        );
        fs.writeFileSync(path.join(incidentsDir, 'index.html'), incidentsHtml);
    }



    // --- Build Recent Profiles Page ---
    const profilesPath = path.join(__dirname, '../data/recent_profiles.json');
    let recentProfiles = [];
    if (fs.existsSync(profilesPath)) {
        try {
            recentProfiles = JSON.parse(fs.readFileSync(profilesPath, 'utf8'));
            const profilesDir = path.join(archiveDir, 'profiles');
            if (!fs.existsSync(profilesDir)) fs.mkdirSync(profilesDir, { recursive: true });

            // Generate Individual Profile Pages
            recentProfiles.forEach(p => {
                const pHtml = generateProfileDetailPage(p);
                fs.writeFileSync(path.join(profilesDir, `${p.profil_id}.html`), pHtml);
            });

            // Run Map Generator (Python)
            try {
                const { execSync } = require('child_process');
                console.log('Generating Map...');
                execSync('python tools/generate_map.py', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
            } catch (err) {
                console.error('Failed to generate map:', err.message);
            }

            const profilesHtml = generateProfilesPage(recentProfiles);
            fs.writeFileSync(path.join(profilesDir, 'index.html'), profilesHtml);
        } catch (e) {
            console.error('Failed to load recent profiles', e);
        }
    }

    // 3. Generate Global Landing Page
    const regionsList = Object.keys(REGION_CONFIG).map(id => ({
        text: REGION_CONFIG[id].label,
        href: `archive/${REGION_CONFIG[id].slug}/index.html`
    }));

    // Add Incidents Link
    if (incidents.length > 0) {
        regionsList.push({
            text: '⚠️ Avalanche Incidents',
            href: 'archive/incidents/index.html',
            className: 'landing-incident-item' // Red accent class
        });
    }

    // Add Profiles Link
    if (recentProfiles.length > 0) {
        regionsList.push({
            text: '❄️ Latest Snow Profiles',
            href: 'archive/profiles/index.html'
        });
    }

    // Add Weather Link (Always present)
    regionsList.push({
        text: '🌨️ Weather (Snow Depth)',
        href: 'snow-depth/index.html'
    });

    let landingHtml = generateIndexPage(
        'Avalanche Bulletin Archive',
        '', // root
        regionsList,
        true
    );


    // We overwrite the root index.html to be the region selector
    fs.writeFileSync(path.join(outputDir, 'index.html'), landingHtml);
    console.log('Site build complete.');

})();

function getMonthName(yyyy_mm) {
    const [y, m] = yyyy_mm.split('-');
    const date = new Date(y, parseInt(m) - 1, 1);
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
}

function generateIndexPage(title, relativeRoot, items, isMain = false, backLink = '../index.html') {
    const cssPath = `${relativeRoot}styles.css`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link rel="stylesheet" href="${cssPath}">
</head>
<body>
    <div class="container">
        <header>
             <div class="header-content">
                <a href="${isMain ? '#' : relativeRoot + 'index.html'}" class="logo">Avalanche Archive</a>
             </div>
        </header>

        <h1>${title}</h1>
        <div class="archive-list">
            ${items.map(item => `<a href="${item.href}" class="archive-item ${item.className || ''}">${item.text}</a>`).join('')}
        </div>
        ${!isMain ? `<div style="margin-top:2rem"><a href="${backLink}">&larr; Back</a></div>` : ''}
    </div>
</body>
</html>`;
}

function generateProfilesPage(profiles) {
    const cssPath = `../../styles.css`;
    const profileItems = profiles.map(p => `
        <div class="station-card">
            <div class="station-header">
                <h2 class="station-name">${p.name || 'Snow Profile'}</h2>
                <span class="latest-update">${p.datum}</span>
            </div>
            <div class="data-grid">
               <div class="data-item"><span class="data-label">Elev</span><span class="data-value">${p.seehoehe || '-'} m</span></div>
               <div class="data-item"><span class="data-label">Aspect</span><span class="data-value">${translateAspect(p.exposition)}</span></div>
               <div class="data-item"><span class="data-label">Slope</span><span class="data-value">${p.hangneigung || '-'}°</span></div>
            </div>
            <a href="${p.profil_id}.html" class="source-link">View Detail &rarr;</a>
        </div>
    `).join('');

    // Add Static "More" Card
    const lawisCard = `
        <div class="station-card" style="border: 2px dashed #bae6fd; background: #f0f9ff; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center;">
             <div style="font-size:3rem; margin-bottom:1rem;">🇦🇹</div>
             <h2 class="station-name" style="margin-bottom:0.5rem;">See All Profiles</h2>
             <p style="color:#666; margin-bottom:1rem;">View full database on Lawis.at</p>
             <a href="https://lawis.at/profile/" target="_blank" class="source-link" style="font-size:1.1rem;">Go to Lawis &rarr;</a>
        </div>
    `;

    const allProfileItems = profileItems + lawisCard;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Latest Snow Profiles</title>
    <link rel="stylesheet" href="${cssPath}">
    <style>
        .profile-list { display: grid; gap: 2rem; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); margin-top:2rem; }
        .station-card { background: white; padding: 1.5rem; border-radius: 12px; box-shadow: var(--shadow-sm); border: 1px solid var(--border-color); }
        .station-header { border-bottom: 2px solid var(--primary-blue); margin-bottom: 1rem; padding-bottom: 0.5rem; display:flex; justify-content:space-between; align-items:center; }
        .station-name { font-size: 1.1rem; margin:0; color: var(--primary-blue); font-weight:700; }
        .latest-update { font-size: 0.85rem; color: var(--text-secondary); }
        .data-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1rem; }
        .data-item { display:flex; flex-direction:column; }
        .data-label { font-size: 0.75rem; text-transform:uppercase; color: var(--text-secondary); }
        .data-value { font-weight: 600; }
        .source-link { color: var(--accent-red); font-weight: bold; }
        .map-container { width: 100%; height: 500px; border-radius: 12px; overflow: hidden; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); margin-bottom: 2rem; }
    </style>
</head>
<body>
    <div class="container">
        <header><div class="header-content"><a href="../../index.html" class="logo">Avalanche Archive</a></div></header>
        
        <h1>Latest Snow Profiles (Last 48 Hours)</h1>

        <div class="map-container">
             <iframe src="map.html" width="100%" height="100%" style="border:none;"></iframe>
        </div>
        
        <div class="profile-list">
            ${allProfileItems}
        </div>
        <div style="margin-top:2rem"><a href="../../index.html">&larr; Back</a></div>
    </div>
</body>
</html>`;
}


function generateIncidentPage(inc) {
    const details = inc.details || {};
    const cssPath = `../../styles.css`;

    // Format values
    const elev = details.elevation ? `${details.elevation} m` : 'N/A';
    const incline = details.incline ? `${details.incline}°` : 'N/A';
    const aspect = details.aspect_id ? translateAspect(details.aspect_id) : 'N/A';

    // Generate PDF Link
    let pdfLink = '<span style="color:#888; font-style:italic;">No Report</span>';
    if (inc.pdf_path) {
        // If it comes from the new incident_bulletins structure
        if (inc.pdf_path.startsWith('incident_bulletins/')) {
            // Link to ../../data/incident_bulletins/... (Relative to archive/incidents/xxx.html)
            const pdfUrl = `../../data/${inc.pdf_path}`;
            pdfLink = `<a href="${pdfUrl}" target="_blank" style="color:#0284c7; text-decoration:underline;">Archived Bulletin</a>`;
        }
        // Fallback for legacy "pdfs/" structure if any remain
        else if (inc.pdf_path.startsWith('pdfs/')) {
            const parts = inc.pdf_path.split('/');
            if (parts.length >= 3) {
                const slug = parts[1];
                const filename = parts[2]; // date.pdf
                const date = filename.replace('.pdf', '');
                const month = date.slice(0, 7);
                // Old structure was archive/{slug}/{month}/{date}.pdf.
                // But wait, the daily fetcher stores in data/pdfs/{slug}/{date}.pdf (no month folder?).
                // Let's check build.js logic for daily PDFs again.
                // Lines 88-96 in build.js implies daily PDFs are flattened in data/pdfs/{slug}/ but sorted into {month} folders in archive.
                // So line 362 `../${slug}/${month}/${filename}` was correct for the daily archive.
                // We keep this for backward compatibility if mixed.
                const pdfUrl = `../${slug}/${month}/${filename}`;
                pdfLink = `<a href="${pdfUrl}" target="_blank" style="color:#0284c7; text-decoration:underline;">Archived Bulletin</a>`;
            }
        }
    }

    // Build tables or grid
    const infoGrid = `
        <div class="incident-meta-grid">
            <div class="meta-item"><strong>Date:</strong> ${inc.date}</div>
            <div class="meta-item"><strong>Location:</strong> ${inc.location}</div>
            <div class="meta-item"><strong>Elevation:</strong> ${elev}</div>
            <div class="meta-item"><strong>Incline:</strong> ${incline}</div>
            <div class="meta-item"><strong>Aspect:</strong> ${aspect}</div>
            <div class="meta-item"><strong>Coordinates:</strong> ${inc.lat}, ${inc.lon}</div>
            ${pdfLink ? `<div class="meta-item"><strong>Forecast:</strong> ${pdfLink}</div>` : ''}
        </div>
    `;

    // Linked Profiles
    let profilesHtml = '';
    if (inc.linked_profiles && inc.linked_profiles.length > 0) {
        profilesHtml = `
        <div class="incident-profiles" style="margin-top:2rem; padding-top:1rem; border-top:1px solid #eee;">
            <h3>Nearby Snow Profiles</h3>
            <p style="color:#666; font-size:0.9rem;">Snow pits within 500m & 7 days.</p>
            <div style="display:grid; gap:1rem; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); margin-top:1rem;">
                ${inc.linked_profiles.map(p => {
            const imgUrl = p.local_path ? `../${p.local_path}` : p.url;
            // Create map link if coordinates exist
            let distDisplay = `${p.dist_km} km away`;
            if (p.latitude && p.longitude) {
                // Link to local interactive map with query params
                distDisplay = `<a href="../profiles/map.html?lat=${p.latitude}&lon=${p.longitude}" target="_blank" style="color:#0284c7; text-decoration:underline;" title="View on Interactive Map">📍 ${p.dist_km} km away</a>`;
            } else {
                distDisplay = `<span style="color:#0284c7;">${p.dist_km} km away</span>`;
            }

            return `
                    <div style="background:#f0f9ff; padding:1rem; border-radius:8px; border:1px solid #bae6fd;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem;">
                            <strong>${p.date.split(' ')[0]}</strong>
                            ${distDisplay}
                        </div>
                        <div style="font-size:0.9rem; margin-bottom:0.5rem;">
                            Elev: ${p.elevation}m | Aspect: ${translateAspect(p.aspect)}
                        </div>
                        <a href="${imgUrl}" target="_blank" style="color:#0284c7; font-weight:bold; text-decoration:underline;">View Profile &rarr;</a>
                    </div>
                `;
        }).join('')}
            </div>
        </div>`;
    }

    // Images
    let galleryHtml = '';
    if (details.images && details.images.length > 0) {
        galleryHtml = `
        <div class="incident-gallery">
            <h3>Images</h3>
            <div class="gallery-grid">
                ${details.images.map(img => {
            const imgUrl = img.local_path ? `../${img.local_path}` : img.url;
            return `
                    <div class="gallery-item">
                        <a href="${imgUrl}" target="_blank">
                            <img src="${imgUrl}" alt="${img.caption || 'Incident Image'}">
                        </a>
                        ${img.comment ? `<p class="img-caption">${img.comment}</p>` : ''}
                    </div>
                `;
        }).join('')}
            </div>
        </div>`;
    }

    let descriptionHtml = '';
    const descriptionText = details.comments || 'No description available.';

    if (details.comments_en) {
        descriptionHtml = `
            <div class="incident-description">
                <h3>Description</h3>
                <p>${details.comments_en}</p>
                <details style="margin-top:1rem; color:#666;">
                    <summary style="cursor:pointer; font-size:0.9rem;">Show Original (German)</summary>
                    <p style="margin-top:0.5rem; font-style:italic;">${descriptionText}</p>
                </details>
            </div>`;
    } else {
        // Fallback translation link
        const translateUrl = `https://translate.google.com/?sl=auto&tl=en&text=${encodeURIComponent(descriptionText)}`;
        descriptionHtml = `
            <div class="incident-description">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 2px solid #eee; margin-bottom:0.5rem;">
                    <h3 style="border-bottom:none; margin:0; padding:0;">Description</h3>
                    <a href="${translateUrl}" target="_blank" style="font-size:0.9rem; color:#004481; text-decoration:none;">Translate to English &nearr;</a>
                </div>
                <p>${descriptionText}</p>
            </div>`;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Incident: ${inc.location}</title>
    <link rel="stylesheet" href="${cssPath}">
</head>
<body>
    <div class="container">
        <header>
             <div class="header-content">
                <a href="../../index.html" class="logo">Avalanche Archive</a>
             </div>
        </header>

        <h1>Incident Report</h1>
        <h2 style="color: #d32f2f;">${inc.location}</h2>
        <h4 style="color: #666;">${inc.date}</h4>

        <div class="incident-detail-container">
            ${infoGrid}
            
            ${profilesHtml}

            ${descriptionHtml}

            ${galleryHtml}
            
            <div class="incident-links" style="text-align:center;">
                <a href="${inc.url}" target="_blank" style="color:#666; text-decoration:underline;">Source: Lawis Austria</a>
            </div>
        </div>

        <div style="margin-top:2rem"><a href="index.html">&larr; Back to Incidents</a></div>
    </div>
</body>
</html>`;
}

function translateAspect(id) {
    if (!id) return '-';
    // Handle both ID (1-8) and direct string values if API returns them
    const map = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    if (typeof id === 'number' && id >= 1 && id <= 8) return map[id - 1];
    return id;
}

function generateProfileDetailPage(p) {
    const title = `Snow Profile: ${p.ort}`;
    const date = p.datum;
    const imageUrl = `https://lawis.at/lawis_api/v2_3/files/profiles/snowprofile_${p.profil_id}.png`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link rel="stylesheet" href="../../styles.css">
</head>
<body>
    <div class="container">
        <header>
            <div class="header-content">
                 <a href="../../index.html" class="logo">Avalanche Archive</a>
            </div>
            <nav>
                <a href="map.html" style="font-weight:bold;">View Map</a>
            </nav>
        </header>
        
        <h1>${title}</h1>
        <div class="meta-item"><strong>Date:</strong> ${date}</div>
        <div class="meta-item"><strong>Elevation:</strong> ${p.seehoehe}m</div>
        <div class="meta-item"><strong>Location:</strong> ${p.latitude}, ${p.longitude}</div>
        
        <div style="margin-top:20px; text-align:center;">
            <img src="${imageUrl}" style="max-width:100%; border-radius:8px; box-shadow:0 4px 6px rgba(0,0,0,0.1);">
        </div>

        <div style="margin-top:2rem; text-align:center;">
            <a href="https://lawis.at/profile/${p.profil_id}" target="_blank" style="color:#666; text-decoration:underline;">Source: Lawis Austria</a>
        </div>
        
        <div style="margin-top:2rem"><a href="map.html">&larr; Back to Map</a> | <a href="index.html">List View</a></div>
    </div>
</body>
</html>`;
}
