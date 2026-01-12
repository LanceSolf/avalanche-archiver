const fs = require('fs');
const path = require('path');

const PDFS_DIR = path.join(__dirname, '../data/pdfs');
const CUTOFF_DATE = '2026-01-01';

if (!fs.existsSync(PDFS_DIR)) {
    console.log('PDFs directory not found.');
    process.exit(0);
}

console.log(`Cleaning up PDFs older than ${CUTOFF_DATE} in ${PDFS_DIR}...`);

const regions = fs.readdirSync(PDFS_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

let deletedCount = 0;
let keptCount = 0;

for (const region of regions) {
    const regionDir = path.join(PDFS_DIR, region);
    const files = fs.readdirSync(regionDir).filter(f => f.endsWith('.pdf'));

    for (const file of files) {
        const dateStr = file.replace('.pdf', '');

        // Simple string comparison works for ISO dates (YYYY-MM-DD)
        if (dateStr < CUTOFF_DATE) {
            fs.unlinkSync(path.join(regionDir, file));
            // console.log(`Deleted: ${region}/${file}`);
            deletedCount++;
        } else {
            keptCount++;
        }
    }
}

console.log(`Cleanup complete.`);
console.log(`Deleted: ${deletedCount}`);
console.log(`Kept: ${keptCount}`);
