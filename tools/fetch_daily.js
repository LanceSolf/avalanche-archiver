const https = require('https');
const fs = require('fs');
const path = require('path');

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
    targetDate.setDate(targetDate.getDate() + 1);
}

const dateStr = formatDate(targetDate);
const url = `https://static.lawinen-warnung.eu/bulletins/${dateStr}/DE-BY.json`;
const dest = path.join(dataDir, `DE-BY_${dateStr}.json`);

console.log(`Target Date: ${dateStr}`);
console.log(`Fetching: ${url}`);

const file = fs.createWriteStream(dest);

https.get(url, (response) => {
    if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
            file.close(() => {
                console.log(`Successfully downloaded to ${dest}`);
            });
        });
    } else {
        console.error(`Failed to fetch. Status Code: ${response.statusCode}`);
        file.close();
        fs.unlink(dest, () => { }); // Delete empty file
        // Optional: failing the script so GitHub Action knows it failed
        // process.exit(1);
        // But for daily cron, maybe we don't want to crash the whole workflow if data isn't there yet?
        // User requested "accessible ... at 1600". If it fails, we just don't have new data.
        // Let's exit with 0 but log error.
    }
}).on('error', (err) => {
    console.error(`Error: ${err.message}`);
    fs.unlink(dest, () => { });
    process.exit(1);
});
