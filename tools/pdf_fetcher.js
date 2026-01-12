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
            // Base filename: YYYY-MM-DD.pdf
            const baseDest = path.join(dataDir, 'pdfs', slug, `${dateStr}.pdf`);

            // If file doesn't exist, simple download
            if (!fs.existsSync(baseDest)) {
                try {
                    console.log(`  Downloading to: ${slug}/${dateStr}.pdf`);
                    await downloadPdf(url, baseDest);
                } catch (e) {
                    console.error(`  Failed to download PDF: ${e.message}`);
                }
                continue;
            }

            // File exists - check for update
            // Download to temp file to compare
            const tempDest = baseDest + '.tmp';
            try {
                // console.log(`  Checking for updates for: ${slug}/${dateStr}.pdf`);
                await downloadPdf(url, tempDest);

                // Compare file sizes (simple check)
                const statExisting = fs.statSync(baseDest);
                const statNew = fs.statSync(tempDest);

                // If sizes differ significantly or usually just binary comparison, assume update.
                // For PDFs, even a tiny change implies a rebuild.
                // Let's use exact size match as a proxy for identity, or simple buffer compare if needed.
                // But size + buffer compare is best.
                // If sizes differ significantly or usually just binary comparison, assume update.
                // For PDFs, dynamic generation (timestamps/IDs) can cause binary diffs even if content is same.
                // We rely on file size stability: meaningful content changes usually change the size.
                let isDifferent = (statExisting.size !== statNew.size);

                // Removed strict buffer comparison to avoid duplicates for identical-size downloads.

                if (isDifferent) {
                    // Double check with buffer comparison to be sure (avoid size-only false positives)
                    const bufBase = fs.readFileSync(baseDest);
                    const bufNewBase = fs.readFileSync(tempDest);
                    if (bufBase.equals(bufNewBase)) {
                        console.log(`  Update matches existing ${dateStr}.pdf (content check). Skipping.`);
                        isDifferent = false;
                    }
                }

                if (isDifferent) {
                    console.log(`  Update detected for ${slug}/${dateStr}.pdf!`);

                    let suffix = '_v2';
                    if (bulletin.publicationTime) {
                        try {
                            const d = new Date(bulletin.publicationTime);
                            const y = d.getUTCFullYear();
                            const m = String(d.getUTCMonth() + 1).padStart(2, '0');
                            const day = String(d.getUTCDate()).padStart(2, '0');
                            const H = String(d.getUTCHours()).padStart(2, '0');
                            const M = String(d.getUTCMinutes()).padStart(2, '0');
                            suffix = `_${y}${m}${day}-${H}${M}`;
                        } catch (err) {
                            console.error('Error formatting publicationTime for suffix:', err);
                        }
                    }

                    let versionDest = path.join(dataDir, 'pdfs', slug, `${dateStr}${suffix}.pdf`);

                    // Check if this specific version already exists
                    if (fs.existsSync(versionDest)) {
                        const bufExisting = fs.readFileSync(versionDest);
                        const bufNew = fs.readFileSync(tempDest);
                        if (bufExisting.equals(bufNew)) {
                            console.log(`  Update matches existing ${dateStr}${suffix}.pdf. Skipping.`);
                            isDifferent = false;
                        } else {
                            // Same timestamp but different content? Extremely rare. 
                            // Fallback to appending v2 to the timestamp
                            suffix += '_v2';
                            versionDest = path.join(dataDir, 'pdfs', slug, `${dateStr}${suffix}.pdf`);
                        }
                    }

                    if (isDifferent) {
                        fs.renameSync(tempDest, versionDest);
                        console.log(`  Archived update as: ${slug}/${dateStr}${suffix}.pdf`);
                    } else {
                        // Was duplicate
                        fs.unlinkSync(tempDest);
                    }
                } else {
                    // console.log(`  No change for ${slug}/${dateStr}.pdf`);
                    fs.unlinkSync(tempDest);
                }

            } catch (e) {
                console.error(`  Failed to check update: ${e.message}`);
                // Cleanup temp if exists
                if (fs.existsSync(tempDest)) {
                    fs.unlinkSync(tempDest);
                }
            }
        }
    }
}

module.exports = { processBulletinForPdfs };
