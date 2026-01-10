# Daily Automation Setup (GitHub Actions)

Your repository is now configured to automatically fetch new avalanche bulletins and rebuild the archive every day at **15:00 CET** (14:00 UTC).

## 1. What has been added?
- **`tools/fetch_daily.js`**: A script that calculates the next day's date, downloads the corresponding JSON bulletin from `lawinen-warnung.eu`, and saves it to the `data/` folder.
- **`package.json`**: Defines `npm run fetch` and `npm run build` commands for the automation server.
- **`.github/workflows/daily-fetch.yml`**: The configuration file that tells GitHub to run the update every day.

## 2. How to enable it?
Since this runs on GitHub's servers, you need to push these new files to your GitHub repository.

1.  **Commit and Push**:
    Run the following commands in your terminal (or use VS Code):
    ```bash
    git add .
    git commit -m "Setup daily automation with GitHub Actions"
    git push origin main
    ```

2.  **Verify**:
    - Go to your repository on GitHub.
    - Click the **Values** tab (it might be labeled "Actions").
    - You should see "Daily Avalanche Fetch" listed on the left.
    - Since it is a scheduled task, it will run for the first time at the next 15:00 CET.
    - **Test it now**: You can click on "Daily Avalanche Fetch", then "Run workflow" (on the right side) to trigger it manually and confirm it works immediately.

## 3. How it works
1.  Every day at 15:00 CET, GitHub spins up a virtual server.
2.  It runs `node tools/fetch_daily.js` to try and download the bulletin for *tomorrow*.
3.  It runs `node tools/build.js` to generate the new HTML pages.
4.  It automatically commits the new `data/*.json` and `archive/*.html` files back to your repository.
5.  GitHub Pages (if enabled) detects the change and updates your live site.
