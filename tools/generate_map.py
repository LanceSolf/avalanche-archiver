import json
import folium
import os
import sys
from datetime import datetime, timedelta

# Paths
DATA_DIR = os.path.join(os.path.dirname(__file__), '../data')
ARCHIVE_DIR = os.path.join(os.path.dirname(__file__), '../archive')
PROFILES_FILE = os.path.join(DATA_DIR, 'recent_profiles.json')
MAP_OUTPUT = os.path.join(ARCHIVE_DIR, 'profiles/map.html')

def generate_map():
    if not os.path.exists(PROFILES_FILE):
        print(f"No profiles file found at {PROFILES_FILE}")
        return

    try:
        with open(PROFILES_FILE, 'r', encoding='utf-8') as f:
            profiles = json.load(f)
    except Exception as e:
        print(f"Failed to load profiles: {e}")
        return

    if not profiles:
        print("No profiles to map.")
        return

    # Center map on Oberstdorf
    center_lat = 47.4099
    center_lon = 10.2797
    
    m = folium.Map(location=[center_lat, center_lon], zoom_start=10, tiles='OpenStreetMap')

    now = datetime.now()

    for p in profiles:
        lat = p.get('latitude')
        lon = p.get('longitude')
        if not lat or not lon:
            continue
        
        # Parse date
        p_date_str = p.get('datum')
        try:
            # Format: YYYY-MM-DD HH:mm:ss
            p_date = datetime.strptime(p_date_str, '%Y-%m-%d %H:%M:%S')
        except:
            continue

        # Color logic
        age = now - p_date
        
        # User requested: Blue if < 24h, Grey otherwise
        # (Though we filtered list to 48h, so it will be mix)
        color = 'blue' if age < timedelta(hours=24) else 'grey'
        
        # Popup Link
        profile_id = p.get('profil_id')
        popup_html = f'<a href="{profile_id}.html" target="_blank" style="font-size:14px; font-weight:bold;">View Profile<br>{p_date_str}</a>'
        
        folium.CircleMarker(
            location=[lat, lon],
            radius=8,
            popup=folium.Popup(popup_html, max_width=200),
            color=color,
            fill=True,
            fill_color=color,
            fill_opacity=0.7
        ).add_to(m)

    # Add Legend/Title? 
    # Folium map is simple. Let's keep it clean.
    
    # Add JS to handle URL parameters for centering
    # This script finds the Leaflet map instance and updates the view if lat/lon params are present
    js_script = """
    <script>
    document.addEventListener("DOMContentLoaded", function() {
        const urlParams = new URLSearchParams(window.location.search);
        const lat = parseFloat(urlParams.get('lat'));
        const lon = parseFloat(urlParams.get('lon'));
        if (!isNaN(lat) && !isNaN(lon)) {
            // Wait slightly for map var to initialize if needed, though DOMContentLoaded is usually enough
            setTimeout(() => {
                for (let key in window) {
                    if (window[key] instanceof L.Map) {
                        window[key].setView([lat, lon], 15);
                        // Add a marker at the centered location
                        L.marker([lat, lon]).addTo(window[key])
                          .bindPopup("<b>Incident Profile Location</b>")
                          .openPopup();
                        break;
                    }
                }
            }, 500);
        }
    });
    </script>
    """
    m.get_root().html.add_child(folium.Element(js_script))
    
    # Ensure directory exists
    os.makedirs(os.path.dirname(MAP_OUTPUT), exist_ok=True)
    
    m.save(MAP_OUTPUT)
    print(f"Map generated at {MAP_OUTPUT}")

if __name__ == "__main__":
    generate_map()
