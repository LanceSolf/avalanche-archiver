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
    'DE-BY-11': {
        label: 'Allgäu Prealps (Sonthofen)',
        slug: 'allgau-prealps',
        type: 'json'
    },
    'DE-BY-12': {
        label: 'Allgäu Alps Central (Oberstdorf)',
        slug: 'allgau-alps-central',
        type: 'json'
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

function generateCompass(aspects) {
    const activeColor = "#19ABFF"; // Light blue as requested
    const inactiveColor = "none";
    const strokeColor = "#222";

    // Map CAAML aspects to our SVG paths
    // order: N, NE, E, SE, S, SW, W, NW
    const paths = {
        'N': 'm25 .958 7.071 7.071L25 25 17.929 8.03z',
        'NE': 'M42 8H32l-7 17 17-7z',
        'E': 'm49 25-7.071-7.071L24.959 25l16.97 7.071z',
        'SE': 'M42 42H32l-7-17 17 7z',
        'S': 'm25 49 7.071-7.071L25 24.959l-7.071 16.97z',
        'SW': 'M8 42h10l7-17-17 7z',
        'W': 'm.958 25 7.071-7.071L25 25 8.03 32.071z',
        'NW': 'M8 8h10l7 17-17-7z'
    };

    const aspectSet = new Set(aspects);
    let sectorsHtml = '';

    for (const [dir, d] of Object.entries(paths)) {
        const fill = aspectSet.has(dir) ? activeColor : inactiveColor;
        sectorsHtml += `<path d="${d}" fill="${fill}" stroke="${strokeColor}" stroke-linecap="round" stroke-linejoin="round"></path>`;
    }

    // Text labels moved OUTSIDE the rosette (translated further out)
    // Adjusted ViewBox to 0 -10 50 80.
    // Center is 25, 25 relative to 50x50.
    // N (top) was at ~1. We place text at -2.
    // S (bottom) was at ~52. We place text at 58.
    const textHtml = `
        <g fill="#222" font-size="8" font-weight="bold" letter-spacing=".5">
            <text transform="translate(25 -2)" text-anchor="middle">N</text>
            <text transform="translate(25 58)" text-anchor="middle">S</text>
        </g>
    `;

    return `<svg viewBox="0 -10 50 80" class="compass-svg" width="60" height="80">${sectorsHtml}${textHtml}</svg>`;
}

function getDangerInfo(rating) {
    const levelRef = {
        'low': { val: 1, color: '#CCFF66', desc: 'Low' },
        'moderate': { val: 2, color: '#FFFF00', desc: 'Moderate' },
        'considerable': { val: 3, color: '#FF9900', desc: 'Considerable' },
        'high': { val: 4, color: '#FF0000', desc: 'High' },
        'very_high': { val: 5, color: '#500000', desc: 'Very High' }
    };
    return levelRef[rating] || { val: '?', color: '#ccc', desc: rating };
}

function renderDangerTriangle(dangerRatings, width = 100, height = 85, showLabel = true) {
    // Parse ratings to find above/below split
    let ratingAbove = null;
    let ratingBelow = null;
    let elevationLabel = '';

    if (dangerRatings.length === 1) {
        ratingAbove = dangerRatings[0];
        ratingBelow = dangerRatings[0];
        elevationLabel = ''; // No split
    } else {
        const r1 = dangerRatings[0];
        const r2 = dangerRatings[1];

        if (r1.elevation && r1.elevation.lowerBound) ratingAbove = r1;
        else if (r1.elevation && r1.elevation.upperBound) ratingBelow = r1;

        if (r2.elevation && r2.elevation.lowerBound) ratingAbove = r2;
        else if (r2.elevation && r2.elevation.upperBound) ratingBelow = r2;

        if (ratingAbove && ratingAbove.elevation && ratingAbove.elevation.lowerBound) {
            elevationLabel = ratingAbove.elevation.lowerBound;
        } else if (ratingBelow && ratingBelow.elevation && ratingBelow.elevation.upperBound) {
            elevationLabel = ratingBelow.elevation.upperBound;
        }
    }

    if (!ratingAbove) ratingAbove = { mainValue: 'low' };
    if (!ratingBelow) ratingBelow = { mainValue: 'low' };

    const valAbove = getDangerInfo(ratingAbove.mainValue).val;
    const colorAbove = getDangerInfo(ratingAbove.mainValue).color;
    const valBelow = getDangerInfo(ratingBelow.mainValue).val;
    const colorBelow = getDangerInfo(ratingBelow.mainValue).color;

    // Using viewBox="0 0 65 55"
    // Elevation Label is at y=54 in original.
    // We can conditionally hide it.

    const labelSvg = showLabel ? `<text x="32" y="54" text-anchor="middle" font-size="10" fill="#333" font-weight="bold">${elevationLabel}</text>` : '';
    const viewBoxH = showLabel ? 60 : 48; // Adjust height if no label

    return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 65 ${viewBoxH}" width="${width}" height="${height}">
        <defs>
            <path id="p1" d="M11.334 0h39.462l10.34 18H.87z" />
            <path id="p2" d="M.95 27 14.03 4.501l3.57 6.247a.5.5 0 0 0 .873-.009L24.046.523 39.256 27H.95Z" />
        </defs>
        <g fill="none" fill-rule="evenodd">
             <path fill="#222" d="M51.875 28h12.626v1H52.45l10.484 18.25a.5.5 0 0 1-.433.75H.5a.5.5 0 0 1-.433-.751l25-43a.5.5 0 0 1 .867.003l3.556 6.222L35.06.261a.5.5 0 0 1 .873-.01L51.875 28Z"/>
             <g transform="translate(.5 29)">
                <mask id="m1" fill="#fff"><use xlink:href="#p1"></use></mask>
                <g fill="${colorBelow}" mask="url(#m1)"><path d="M-1-30h65v50H-1z"></path></g>
                <text text-anchor="middle" fill="#222" x="32" y="14" font-weight="bold" font-size="14">${valBelow}</text>
             </g>
             <g transform="translate(11.5 1)">
                <mask id="m2" fill="#fff"><use xlink:href="#p2"></use></mask>
                <g fill="${colorAbove}" mask="url(#m2)"><path d="M-12-2h65v50h-65z"></path></g>
                <text text-anchor="middle" fill="#222" x="21" y="23" font-weight="bold" font-size="14">${valAbove}</text>
             </g>
        </g>
        ${labelSvg}
    </svg>`;
}

function renderBulletin(dateStr, bulletin, regionConfig, pathToRoot) {
    // Calculate primary danger text
    const maxVal = Math.max(...bulletin.dangerRatings.map(r => getDangerInfo(r.mainValue).val));
    let maxRatingObj = bulletin.dangerRatings.find(r => getDangerInfo(r.mainValue).val === maxVal);
    if (!maxRatingObj) maxRatingObj = bulletin.dangerRatings[0] || { mainValue: 'low' };
    const dangerInfo = getDangerInfo(maxRatingObj.mainValue);

    let problemsHtml = '';
    if (bulletin.avalancheProblems) {
        const distinctProblems = [];
        const seenProblems = new Set();
        bulletin.avalancheProblems.forEach(p => {
            const key = [
                p.problemType,
                (p.aspects || []).sort().join(','),
                (p.elevation && p.elevation.lowerBound) || '',
                (p.elevation && p.elevation.upperBound) || ''
            ].join('|');
            if (!seenProblems.has(key)) {
                seenProblems.add(key);
                distinctProblems.push(p);
            }
        });

        problemsHtml = distinctProblems.map(p => {
            const compass = generateCompass(p.aspects);

            const smallTriangle = renderDangerTriangle(bulletin.dangerRatings, 50, 45, false); // No label, small

            const parts = [];
            if (p.elevation.lowerBound) parts.push(`> ${p.elevation.lowerBound}`);
            if (p.elevation.upperBound) parts.push(`< ${p.elevation.upperBound}`);
            let problemElevLabel = parts.join('<br>');

            return `
            <div class="problem-card">
                <div class="problem-details">
                    <div class="problem-name">${p.problemType.replace(/_/g, ' ')}</div>
                    <div class="aspect-elevation-wrapper">
                        <div class="problem-icon ${p.problemType}"></div>
                        <div class="compass-wrapper">${compass}</div>
                        <div class="elevation-group">
                             <div class="danger-icon-small">${smallTriangle}</div>
                             <div class="elevation-label">${problemElevLabel}</div>
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    // Fix paths for assets/styles since we are deep in folders
    const cssPath = `${pathToRoot}styles.css`;
    const jsPath = `${pathToRoot}script.js`;
    const indexPath = `${pathToRoot}index.html`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${regionConfig.label} - ${dateStr}</title>
    <link rel="stylesheet" href="${cssPath}">
    <style>
        /* Fix absolute paths for icons */
        .problem-icon.new_snow { background-image: url('${pathToRoot}assets/new_snow.webp'); }
        .problem-icon.wind_slab { background-image: url('${pathToRoot}assets/wind_slab.webp'); }
        .problem-icon.persistent_weak_layers { background-image: url('${pathToRoot}assets/persistent_weak_layers.webp'); }
        .problem-icon.wet_snow { background-image: url('${pathToRoot}assets/wet_snow.webp'); }
        .problem-icon.gliding_snow { background-image: url('${pathToRoot}assets/gliding_snow.webp'); }
        
        .elevation-group {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-size: 0.8rem;
            color: #666;
            margin-left: 10px;
        }
    </style>
    <script src="${jsPath}" defer></script>
</head>
<body>
    <div class="container">
        <header>
            <div class="container header-content">
                <a href="${indexPath}" class="logo">Avalanche Archive</a>
                <div class="date-nav">
                    <span>${regionConfig.label} | ${dateStr}</span>
                </div>
                <div>
                   <button onclick="window.print()" class="btn-print">Print / Save PDF</button>
                </div>
            </div>
        </header>

        <main>
            <div class="bulletin-card">
                <div class="bulletin-header">
                     <h2 class="region-title">${regionConfig.label}</h2>
                     <p>Valid: ${new Date(bulletin.validTime.startTime).toLocaleString()} - ${new Date(bulletin.validTime.endTime).toLocaleString()}</p>
                </div>
                
                <div class="danger-section">
                    <div class="danger-content">
                        <div class="danger-title">
                            Highest Level: ${maxVal} - ${dangerInfo.desc}
                        </div>
                        
                        <div class="problems-grid">
                            ${problemsHtml}
                        </div>
                    </div>
                </div>
            </div>

            <div class="text-section">
                <h3>Avalanche Danger</h3>
                <div class="highlight-box">
                    ${bulletin.avalancheActivity.highlights}
                </div>
                <p>${bulletin.avalancheActivity.comment}</p>
            </div>

            <div class="text-section">
                <h3>Snowpack Structure</h3>
                <p>${bulletin.snowpackStructure.comment}</p>
            </div>
            
            <div class="text-section">
                <h3>Tendency</h3>
                <p>${bulletin.tendency?.[0]?.highlights || ''}</p>
            </div>
        </main>

        <footer>
            <p>Archived data from Avalanche.report</p>
        </footer>
    </div>
</body>
</html>`;
    return html;
}

// --- MAIN EXECUTION ---
(async () => {
    // 1. Gather Data
    const allData = {}; // structure: { regionId: { month: { date: payload } } } (payload is bulletin obj OR {pdf: true})

    for (const regionId of Object.keys(REGION_CONFIG)) {
        allData[regionId] = {};
    }

    // Process JSON Files
    const files = fs.readdirSync(dataDir).filter(f => f.startsWith('DE-BY') && f.endsWith('.json'));
    for (const f of files) {
        const dateStr = f.replace('DE-BY_', '').replace('.json', ''); // YYYY-MM-DD
        const monthStr = dateStr.slice(0, 7); // YYYY-MM
        const content = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf-8'));

        if (!content.bulletins) continue;

        for (const bulletin of content.bulletins) {
            const regionIds = bulletin.regions.map(r => r.regionID);

            // Check if this bulletin belongs to any of our target JSON regions
            for (const targetId of Object.keys(REGION_CONFIG)) {
                if (REGION_CONFIG[targetId].type === 'json' && regionIds.includes(targetId)) {
                    if (!allData[targetId][monthStr]) {
                        allData[targetId][monthStr] = {};
                    }
                    allData[targetId][monthStr][dateStr] = bulletin;
                }
            }
        }
    }

    // Process PDF Files
    const pdfsBaseDir = path.join(__dirname, '../data/pdfs');
    if (fs.existsSync(pdfsBaseDir)) {
        for (const regionSlug of fs.readdirSync(pdfsBaseDir)) {
            // Find matching config key (which is actually the slug for PDF regions in our map keys)
            // We used slug as key for PDF regions in index? No, keys in REGION_CONFIG are region IDs or slugs.
            // We added 'allgau-alps-west' as the KEY in REGION_CONFIG.
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
    //       {yyyy-mm-dd}.html (Bulletin)

    for (const [regionId, monthsData] of Object.entries(allData)) {
        const config = REGION_CONFIG[regionId];
        const regionDir = path.join(archiveDir, config.slug);

        if (!fs.existsSync(regionDir)) fs.mkdirSync(regionDir, { recursive: true });

        // Generate Region Index (List of Months)
        const sortedMonths = Object.keys(monthsData).sort().reverse();
        let monthsHtml = generateIndexPage(
            `${config.label} - Select Month`,
            `../../`,
            sortedMonths.map(m => ({ text: getMonthName(m), href: `${m}/index.html` }))
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
                    const isPdf = datesData[d].type === 'pdf';
                    return {
                        text: d + (isPdf ? ' (PDF)' : ''),
                        href: `${d}.${isPdf ? 'pdf' : 'html'}`
                    };
                })
            );
            fs.writeFileSync(path.join(monthDir, 'index.html'), daysHtml);

            // Generate Bulletin Pages or Copy PDFs
            for (const [date, payload] of Object.entries(datesData)) {
                if (payload.type === 'pdf') {
                    // Copy PDF
                    fs.copyFileSync(payload.src, path.join(monthDir, `${date}.pdf`));
                    console.log(`Copied PDF: ${config.slug}/${month}/${date}.pdf`);
                } else {
                    // Render HTML
                    const html = renderBulletin(date, payload, config, '../../../');
                    fs.writeFileSync(path.join(monthDir, `${date}.html`), html);
                    console.log(`Generated: ${config.slug}/${month}/${date}.html`);
                }
            }
        }
    }

    // 3. Generate Global Landing Page
    const regionsList = Object.keys(REGION_CONFIG).map(id => ({
        text: REGION_CONFIG[id].label,
        href: `archive/${REGION_CONFIG[id].slug}/index.html`
    }));

    let landingHtml = generateIndexPage(
        'Avalanche Bulletin Archive',
        '', // root
        regionsList,
        true // isMain
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

function generateIndexPage(title, relativeRoot, items, isMain = false) {
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
            ${items.map(item => `<a href="${item.href}" class="archive-item">${item.text}</a>`).join('')}
        </div>
        ${!isMain ? `<div style="margin-top:2rem"><a href="../index.html">&larr; Back</a></div>` : ''}
    </div>
</body>
</html>`;
}
