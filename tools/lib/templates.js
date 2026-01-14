const { translateAspect } = require('./utils');

// --- HTML TEMPLATES ---

/**
 * Generate Main or Month Index Page
 * @param {string} title - Page title
 * @param {string} relativePath - Path to root (e.g., "../../")
 * @param {Array} links - Array of { text, href }
 * @param {boolean} isIncident - Is this an incident page?
 * @param {string} backLink - Optional back link URL
 * @returns {string} HTML Content
 */
function generateIndexPage(title, relativePath, links, isIncident = false, backLink = '') {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link rel="stylesheet" href="${relativePath}styles.css">
    <style>
        .archive-list { 
            display: grid; 
            grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); 
            gap: 1.5rem; 
            margin: 0; 
            padding: 0; 
        }
        .archive-item { 
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background-color: #ffffff;
            padding: 1.5rem;
            text-align: center;
            text-decoration: none;
            color: #1e293b;
            border-radius: 12px;
            border: 1px solid #e2e8f0;
            font-weight: 600;
            transition: all 0.2s ease;
            box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
        }
        .archive-item:hover { 
            transform: translateY(-2px); 
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            border-color: #3b82f6;
            color: #3b82f6;
        }
        .archive-item h2 { margin: 0; font-size: 1rem; font-weight: 600; }
        .badge-update { 
            display: inline-block; 
            font-size: 0.7rem; 
            background: #fef3c7; 
            color: #92400e; 
            padding: 0.2rem 0.5rem; 
            border-radius: 4px; 
            margin-top: 0.5rem;
            font-weight: 500;
        }
        .weather-icon { font-size: 1.2rem; margin-top: 0.25rem; }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div class="header-content">
                <a href="${relativePath}index.html" class="logo">Avalanche Archive</a>
            </div>
        </header>

        <h1>${title}</h1>

        ${backLink ? `<div style="margin-bottom:1rem;"><a href="${backLink}">&larr; Back</a></div>` : ''}

        <div class="archive-list">
            ${links.map(link => {
        let inner;
        if (link.date && link.title) {
            const profileIcon = link.hasProfiles ? `<span style="background:#0284c7; width:12px; height:12px; border-radius:50%; border:2px solid white; box-shadow:0 1px 2px rgba(0,0,0,0.3); display:inline-block; flex-shrink:0;" title="Has Snow Profile"></span>` : '';
            const imagesIcon = link.hasImages ? `<span style="font-size:1.1rem; flex-shrink:0;" title="Has Images">📷</span>` : '';

            // Only render icon row if needed
            const iconsRow = (profileIcon || imagesIcon) ?
                `<div style="display:flex; align-items:center; justify-content:center; gap:8px; margin-top:2px;">
                    ${profileIcon}
                    ${imagesIcon}
                </div>` : '';

            inner = `<div style="display:flex; flex-direction:column; gap:0.25rem;">
                               <span style="font-size:0.85rem; color:#64748b; font-weight:500;">${link.date}</span>
                               <span style="font-size:1.1rem; color:#1e293b;">${link.title}</span>
                               ${iconsRow}
                             </div>`;
        } else {
            inner = `<h2>${link.text}</h2>`;
        }
        return `<a href="${link.href}" class="archive-item ${isIncident ? 'incident-item' : ''}">${inner}</a>`;
    }).join('')}
        </div>
    </div>
</body>
</html>`;
}

/**
 * Generate Profile Detail Page HTML
 */
function generateProfileDetailPage(p, profileImageBaseName, relativePath, backLink = null) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Profile: ${p.ort}</title>
    <link rel="stylesheet" href="${relativePath}styles.css">
    <style>
        .profile-image-container { margin-top: 2rem; text-align: center; }
        .profile-image img { max-width: 100%; height: auto; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .back-link { margin-bottom: 1rem; display: block; color: var(--primary-blue); text-decoration: none; }
        .back-link:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="container">
        <header><div class="header-content"><a href="${relativePath}index.html" class="logo">Avalanche Archive</a></div></header>
        
        ${backLink ? `<a href="${backLink}" id="dynamic-back-link" class="back-link">&larr; Back</a>` : ''}

        <h1>Snow Profile: ${p.ort}</h1>
        <div class="profile-image-container">
            <div class="profile-image">
                <a href="${profileImageBaseName}" target="_blank">
                    <img src="${profileImageBaseName}" alt="Snow Profile Image">
                </a>
            </div>
            <a href="https://lawis.at" target="_blank" class="lawis-link">View on LAWIS.at</a>
        </div>
    </div>
    <script>
        const urlParams = new URLSearchParams(window.location.search);
        const backUrl = urlParams.get('back');
        if (backUrl) {
            const link = document.getElementById('dynamic-back-link');
            if (link) {
                link.href = backUrl;
                if (backUrl.includes('map.html')) {
                    link.innerHTML = '&larr; Back to Map';
                    
                    // Check for incident context in the map URL
                    try {
                        const mapQuery = backUrl.split('?')[1];
                        if (mapQuery) {
                            const mapParams = new URLSearchParams(mapQuery);
                            const incFilename = mapParams.get('incFilename');
                            if (incFilename) {
                                // Create secondary link back to incident
                                const incUrl = '../incidents/' + incFilename;
                                const incLink = document.createElement('a');
                                incLink.href = incUrl;
                                incLink.className = 'back-link';
                                incLink.innerHTML = '&larr; Back to Incident';
                                incLink.style.marginTop = '0'; // Reduce gap slightly if needed, but default margin is fine
                                
                                // Insert after the Map link
                                link.parentNode.insertBefore(incLink, link.nextSibling);
                            }
                        }
                    } catch (e) {
                        console.error('Error parsing back URL params', e);
                    }

                } else if (backUrl.includes('incidents')) {
                    link.innerHTML = '&larr; Back to Incident';
                } else {
                    link.innerHTML = '&larr; Back';
                }
            }
        }
    </script>
</body>
</html>`;
}

/**
 * Generate Weather Report HTML
 */
function generateWeatherPage(w, content) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mountain Weather - ${w.date}</title>
    <link rel="stylesheet" href="../../styles.css">
    <style>
        .weather-content { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
        .original-text { margin-top: 2rem; border-top: 1px solid #eee; padding-top: 1rem; color: #555; }
        .original-text summary { cursor: pointer; color: var(--primary-blue); font-weight: 500; }
    </style>
</head>
<body>
    <div class="container">
        <header><div class="header-content"><a href="../../index.html" class="logo">Avalanche Archive</a></div></header>
        <div style="margin-bottom:1rem;"><a href="#" onclick="history.back(); return false;">&larr; Back</a></div>
        <h1>Mountain Weather Report</h1>
        <h2 style="color: #666; font-weight: 400;">${w.date} (Issued: ${w.issued})</h2>
        <div class="weather-content">
            ${content}
        </div>
    </div>
</body>
</html>`;
}

/**
 * Generate Incident Weather Context Page (Chart + Text)
 */
function generateIncidentWeatherPage(inc, weatherHtml, historicText) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Weather Context: ${inc.location}</title>
    <link rel="stylesheet" href="../../styles.css">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        .chart-container { position: relative; height: 400px; width: 100%; margin-bottom: 2rem; }
        .weather-text { background: #f9f9f9; padding: 1.5rem; border-radius: 8px; margin-bottom: 2rem; border-left: 4px solid var(--primary-blue); }
        .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
        .meta-item { background: white; padding: 1rem; border-radius: 4px; border: 1px solid #eee; }
        .meta-label { font-size: 0.85rem; color: #666; text-transform: uppercase; letter-spacing: 0.05em; }
        .meta-value { font-size: 1.1rem; font-weight: 600; color: #333; margin-top: 0.25rem; }
    </style>
</head>
<body>
    <div class="container">
        <header><div class="header-content"><a href="../../index.html" class="logo">Avalanche Archive</a></div></header>
        <div style="margin-bottom:1rem;"><a href="index.html">&larr; Back to Incidents</a></div>
        
        <h1>Weather Context</h1>
        <h2 style="color: #666;">${inc.location} - ${inc.date}</h2>

        <div class="weather-text">
            <h3>Weather Report (${inc.date})</h3>
            ${historicText ? `<p style="white-space: pre-line;">${historicText}</p>` : '<p>No text report available for this specific location/date in historic records.</p>'}
        </div>

        <h3>Station Data: ${inc.closestStation.name} (${inc.closestStation.dist}km away)</h3>
        <p style="color: #666; font-size: 0.9rem; margin-bottom: 1rem;">Data from previous 48hrs leading up to incident.</p>
        
        <div class="chart-container">
            <canvas id="weatherChart"></canvas>
        </div>

        <script>
            const ctx = document.getElementById('weatherChart').getContext('2d');
            const data = ${JSON.stringify(inc.weatherData)};
            
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: data.map(d => new Date(d.TS).toLocaleString('de-DE', { day: '2-digit', hour: '2-digit', minute: '2-digit' })),
                    datasets: [
                        {
                            label: 'Snow Height (cm)',
                            data: data.map(d => d.HS),
                            borderColor: '#3498db',
                            yAxisID: 'y',
                        },
                        {
                            label: 'Air Temp (°C)',
                            data: data.map(d => d.TL),
                            borderColor: '#e74c3c',
                            yAxisID: 'y1',
                        },
                        {
                            label: 'Wind Speed (km/h)',
                            data: data.map(d => d.ff ? d.ff * 3.6 : null), // m/s to km/h
                            borderColor: '#2ecc71',
                            yAxisID: 'y',
                            hidden: true
                        }
                    ]
                },
                options: {
                    responsive: true,
                    interaction: { mode: 'index', intersect: false },
                    scales: {
                        y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Snow (cm) / Wind (km/h)' } },
                        y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Temperature (°C)' } }
                    }
                }
            });
        </script>
    </div>
</body>
</html>`;
}

/**
 * Generate Incident Detail Page HTML (matches original format)
 */
function generateIncidentPage(inc, imagesHtml, weatherLink, profilesHtml, relativePath) {
    // Handle missing fields gracefully
    const elevation = inc.elevation || inc.details?.location?.elevation?.value || 'N/A';
    const incline = inc.incline || inc.details?.location?.incline?.value || 'N/A';
    const aspect = inc.aspect || inc.details?.location?.aspect?.text || 'N/A';
    const lat = inc.lat || inc.details?.location?.latitude;
    const lon = inc.lon || inc.details?.location?.longitude;
    const dateTime = inc.datetime || inc.date || '';
    const location = inc.location || inc.details?.location?.text || 'Unknown Location';
    const description_en = inc.comments_en || inc.details?.comments_en || '';
    const description_de = inc.comments || inc.details?.comments || '';

    // Build coordinates link if available (includes incId for map back-link)
    // If we have a closest profile, include it so we show BOTH pins.
    // context=coords parameter tells map to use specific popup text.
    let coordsUrl = `../profiles/map.html?incLat=${lat}&incLon=${lon}&incId=${inc.id}&incFilename=${inc.filename || ''}&context=coords`;

    if (inc.closestProfile) {
        coordsUrl += `&lat=${inc.closestProfile.latitude}&lon=${inc.closestProfile.longitude}&profileId=${inc.closestProfile.id}`;
    }

    const coordsHtml = (lat && lon) ? `
        <div class="meta-item"><strong>Coordinates:</strong> 
            <a href="${coordsUrl}" style="color:#0284c7; text-decoration:none;">
                ${lat}, ${lon}
            </a>
        </div>` : '';

    // Build forecast link if available (path is relative to incidents folder)
    const forecastHtml = inc.pdf_path ? `
        <div class="meta-item"><strong>Forecast:</strong> <a href="${inc.pdf_path}" target="_blank" style="color:#0284c7; text-decoration:none;">Archived Bulletin</a></div>` : '';

    // Build weather link if available
    const weatherHtml = weatherLink ? `
        <div class="meta-item"><strong>Weather:</strong> ${weatherLink}</div>` : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Incident: ${location}</title>
    <link rel="stylesheet" href="../../styles.css">
</head>
<body>
    <div class="container">
        <header>
             <div class="header-content">
                <a href="../../index.html" class="logo">Avalanche Archive</a>
             </div>
        </header>

        <h1>Incident Report</h1>
        <h2 style="color: #d32f2f;">${location}</h2>
        <h4 style="color: #666;">${dateTime}</h4>

        <div class="incident-detail-container">
            
        <div class="incident-meta-grid">
            <div class="meta-item"><strong>Date:</strong> ${dateTime}</div>
            <div class="meta-item"><strong>Location:</strong> ${location}</div>
            <div class="meta-item"><strong>Elevation:</strong> ${elevation}${elevation !== 'N/A' ? 'm' : ''}</div>
            <div class="meta-item"><strong>Incline:</strong> ${incline}${incline !== 'N/A' ? '°' : ''}</div>
            <div class="meta-item"><strong>Aspect:</strong> ${aspect}</div>
            ${coordsHtml}
            ${forecastHtml}
            ${weatherHtml}
        </div>
    
            ${profilesHtml ? `
        <div class="incident-profiles" style="margin-top:2rem; padding-top:1rem; border-top:1px solid #eee;">
            <h3>Nearby Snow Profiles</h3>
            <p style="color:#666; font-size:0.9rem;">Snow pits within 1km & 48hrs.</p>
            <div style="display:grid; gap:1rem; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); margin-top:1rem;">
                ${profilesHtml}
            </div>
        </div>
` : ''}
            
            ${description_en ? `
            <div class="incident-description">
                <h3>Description</h3>
                <p>${description_en}</p>
                ${description_de ? `
                <details style="margin-top:1rem; color:#666;">
                    <summary style="cursor:pointer; font-size:0.9rem;">Show Original (German)</summary>
                    <p style="margin-top:0.5rem; font-style:italic;">${description_de}</p>
                </details>` : ''}
            </div>
` : ''}

            ${imagesHtml ? `
        <div class="incident-gallery">
            <h3>Images</h3>
            <div class="gallery-grid">
                ${imagesHtml}
            </div>
        </div>
` : ''}
            
            <div class="incident-links" style="text-align:center;">
                <a href="https://lawis.at" target="_blank" class="lawis-link">View on LAWIS.at</a>
            </div>
        </div>

        <div style="margin-top:2rem"><a href="index.html">&larr; Back to Incidents</a></div>
    </div>
</body>
</html>`;
}

module.exports = {
    generateIndexPage,
    generateProfileDetailPage,
    generateWeatherPage,
    generateIncidentWeatherPage,
    generateIncidentPage
};
