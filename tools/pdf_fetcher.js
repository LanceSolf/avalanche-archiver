const https = require('https');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../data');

// Configuration for which regions need PDFs
// Map RegionID -> Slug
const REGION_PDF_MAP = {
    'DE-BY-11': 'allgau-prealps',
    'DE-BY-12': 'allgau-alps-central',
    'AT-08-01': 'allgau-alps-west', // Kleinwalsertal
    'AT-07-01': 'allgau-alps-east'  // Außerfern (Tannheimer Tal)
};

async function downloadPdf(url, destPath) {
    return new Promise((resolve, reject) => {
        fs.mkdirSync(path.dirname(destPath), { recursive: true });

        const file = fs.createWriteStream(destPath);
        const request = https.get(url, (response) => {
            if (response.statusCode === 200) {
                response.pipe(file);
                file.on('finish', () => {
                    file.close(() => resolve(true));
                });
            } else {
                file.close();
                fs.unlink(destPath, () => { });
                reject(new Error(`Status ${response.statusCode}`));
            }
        });

        request.on('error', (err) => {
            fs.unlink(destPath, () => { });
            reject(err);
        });

        request.setTimeout(30000, () => {
            request.destroy();
            fs.unlink(destPath, () => { });
            reject(new Error('Request timed out'));
        });
    });
}

// sourceType: 'lawinen-warnung' (Bavaria/Vorarlberg) or 'avalanche-report' (Tyrol/Euregio)
async function processBulletinForPdfs(bulletin, dateStr, sourceType = 'lawinen-warnung') {
    if (!bulletin.regions) return;

    // Check if this bulletin contains any of our target regions
    const regions = bulletin.regions.map(r => (typeof r === 'string' ? r : r.regionID));

    const matchedSlugs = [];
    for (const rid of regions) {
        if (REGION_PDF_MAP[rid]) {
            matchedSlugs.push(REGION_PDF_MAP[rid]);
        }
    }

    const uuid = bulletin.id || bulletin.bulletinID;

    if (matchedSlugs.length > 0 && uuid) {
        let url;
        if (sourceType === 'lawinen-warnung') {
            // Bavaria (DE-BY) and Vorarlberg (AT-08)
            // Determine region param based on the matched region code
            // Default to DE-BY, switch to AT-08 if the region ID starts with AT-08

            const isAt08 = regions.some(r => r.startsWith('AT-08'));
            const regionParam = isAt08 ? 'AT-08' : 'DE-BY';

            url = `https://admin.lawinen-warnung.eu/albina/api/bulletins/${uuid}/pdf?region=${regionParam}&lang=en&grayscale=false`;
        } else {
            // Tyrol (AT-07) / Euregio
            url = `https://api.avalanche.report/albina/api/bulletins/${uuid}/pdf?region=EUREGIO&lang=en&grayscale=false`;
        }

        console.log(`Found relevant bulletin ${uuid} for regions: ${matchedSlugs.join(', ')}`);
        console.log(`PDF URL: ${url}`);

        for (const slug of matchedSlugs) {
            const dest = path.join(dataDir, 'pdfs', slug, `${dateStr}.pdf`);
            if (fs.existsSync(dest)) {
                console.log(`  Skipping (exists): ${slug}/${dateStr}.pdf`);
                continue;
            }

            try {
                console.log(`  Downloading to: ${slug}/${dateStr}.pdf`);
                await downloadPdf(url, dest);
            } catch (e) {
                console.error(`  Failed to download PDF: ${e.message}`);
            }
        }
    }
}

module.exports = { processBulletinForPdfs };
