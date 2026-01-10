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
                        text: d,
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
                    console.log(`Copied PDF: ${config.slug}/${month}/${date}.pdf`);
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
            ${items.map(item => `<a href="${item.href}" class="archive-item">${item.text}</a>`).join('')}
        </div>
        ${!isMain ? `<div style="margin-top:2rem"><a href="${backLink}">&larr; Back</a></div>` : ''}
    </div>
</body>
</html>`;
}
