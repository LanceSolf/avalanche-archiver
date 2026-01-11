const https = require('https');
const fs = require('fs');
const path = require('path');
const { processBulletinForPdfs } = require('./pdf_fetcher');

const dataDir = path.join(__dirname, '../data');

// Helper to get YYYY-MM-DD
function formatDate(date) {
    return date.toISOString().split('T')[0];
}

// Determine target date
// Default: Tomorrow (Date.now() + 24h)
// Override: CLI argument (YYYY-MM-DD)
let targetDate = new Date();
if (process.argv[2]) {
    targetDate = new Date(process.argv[2]);
} else {
    // Default to today
}

const dateStr = formatDate(targetDate);
// Define sources
const SOURCES = [
    {
        name: 'DE-BY',
        url: (date) => `https://static.avalanche.report/eaws_bulletins/eaws_bulletins/${date}/${date}-DE-BY.json`,
        type: 'lawinen-warnung'
    },
    {
        name: 'AT-08',
        url: (date) => `https://static.avalanche.report/eaws_bulletins/eaws_bulletins/${date}/${date}-AT-08.json`,
        type: 'lawinen-warnung'
    },
    {
        name: 'AT-07',
        url: (date) => `https://static.avalanche.report/eaws_bulletins/eaws_bulletins/${date}/${date}-AT-07.json`,
        type: 'avalanche-report'
    }
];

// Helper to fetch and process a single source
async function fetchAndProcess(source, dateStr) {
    const url = source.url(dateStr);
    const dest = path.join(dataDir, `${source.name}_${dateStr}.json`);

    console.log(`\nFetching ${source.name}: ${url}`);

    return new Promise((resolve) => {
        const file = fs.createWriteStream(dest);
        const req = https.get(url, (response) => {
            if (response.statusCode === 200) {
                response.pipe(file);
                file.on('finish', () => {
                    file.close(async () => {
                        console.log(`  Saved to ${dest}`);
                        try {
                            const content = JSON.parse(fs.readFileSync(dest, 'utf-8'));
                            const bulletins = Array.isArray(content) ? content : content.bulletins;
                            if (bulletins) {
                                for (const bulletin of bulletins) {
                                    await processBulletinForPdfs(bulletin, dateStr, source.type);
                                }
                                // Cleanup JSON file
                                try {
                                    fs.unlinkSync(dest);
                                    console.log(`  Cleaned up ${dest}`);
                                } catch (cleanupErr) {
                                    console.error(`  Failed to delete JSON: ${cleanupErr.message}`);
                                }
                            }
                            resolve(true);
                        } catch (e) {
                            console.error(`  Error processing ${source.name} PDFs:`, e.message);
                            resolve(false);
                        }
                    });
                });
            } else {
                console.error(`  Failed to fetch ${source.name}. Status: ${response.statusCode}`);
                file.close();
                fs.unlink(dest, () => { });
                resolve(false);
            }
        });

        req.on('error', (err) => {
            console.error(`  Network Error for ${source.name}: ${err.message}`);
            fs.unlink(dest, () => { });
            resolve(false);
        });
    });
}

(async () => {
    const dates = [targetDate];

    // If running automatically (no CLI arg) and it is evening (UTC Hour >= 15)
    // 15:00 UTC = 16:00 CET / 17:00 CEST.
    // Avalanche bulletins usually publish around 17:00 local time.
    // So picking fetching Next Day's bulletin in the evening makes sense.
    if (!process.argv[2]) {
        const utcHour = new Date().getUTCHours();
        if (utcHour >= 15) {
            const tomorrow = new Date(targetDate);
            tomorrow.setDate(tomorrow.getDate() + 1);
            dates.push(tomorrow);
            console.log(`Evening run detected (UTC ${utcHour}:00). Including tomorrow's bulletin.`);
        }
    }

    for (const date of dates) {
        const dStr = formatDate(date);
        console.log(`\n=== Processing Date: ${dStr} ===`);
        for (const source of SOURCES) {
            await fetchAndProcess(source, dStr);
        }
    }
})();
