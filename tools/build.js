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


function generateIncidentPage(inc) {
    const details = inc.details || {};
    const cssPath = `../../styles.css`;

    // Format values
    const elev = details.elevation ? `${details.elevation} m` : 'N/A';
    const incline = details.incline ? `${details.incline}°` : 'N/A';
    const aspect = details.aspect_id ? translateAspect(details.aspect_id) : 'N/A';

    // Build tables or grid
    const infoGrid = `
        <div class="incident-meta-grid">
            <div class="meta-item"><strong>Date:</strong> ${inc.date}</div>
            <div class="meta-item"><strong>Location:</strong> ${inc.location}</div>
            <div class="meta-item"><strong>Elevation:</strong> ${elev}</div>
            <div class="meta-item"><strong>Incline:</strong> ${incline}</div>
            <div class="meta-item"><strong>Aspect:</strong> ${aspect}</div>
            <div class="meta-item"><strong>Coordinates:</strong> ${inc.lat}, ${inc.lon}</div>
        </div>
    `;

    // Images
    let galleryHtml = '';
    if (details.images && details.images.length > 0) {
        galleryHtml = `
        <div class="incident-gallery">
            <h3>Images</h3>
            <div class="gallery-grid">
                ${details.images.map(img => `
                    <div class="gallery-item">
                        <a href="${img.url}" target="_blank">
                            <img src="${img.url}" alt="${img.caption || 'Incident Image'}">
                        </a>
                        ${img.comment ? `<p class="img-caption">${img.comment}</p>` : ''}
                    </div>
                `).join('')}
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
            
            ${descriptionHtml}

            ${galleryHtml}
            
            <div class="incident-links" style="text-align:center;">
                <a href="https://lawis.at/incident/" target="_blank" style="color:#666; text-decoration:underline;">Original Source (Lawis Austria)</a>
            </div>
        </div>

        <div style="margin-top:2rem"><a href="index.html">&larr; Back to Incidents</a></div>
    </div>
</body>
</html>`;
}

function translateAspect(id) {
    const map = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    if (id >= 1 && id <= 8) return map[id - 1];
    return id;
}
