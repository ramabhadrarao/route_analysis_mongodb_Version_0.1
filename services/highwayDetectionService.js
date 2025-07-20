// File: services/highwayDetectionService.js
// Purpose: Detect and extract highway names from GPS route points using Google Roads API and reverse geocoding

const axios = require('axios');
const logger = require('../utils/logger');

class HighwayDetectionService {
  constructor() {
    this.googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
    this.highwayCache = new Map(); // Cache to avoid duplicate API calls
    
    // Common highway patterns in India
    this.highwayPatterns = {
      national: /\b(NH|National Highway)[\s-]?(\d+[A-Z]?)\b/gi,
      state: /\b(SH|State Highway)[\s-]?(\d+[A-Z]?)\b/gi,
      mdr: /\b(MDR|Major District Road)[\s-]?(\d+[A-Z]?)\b/gi,
      odr: /\b(ODR|Other District Road)[\s-]?(\d+[A-Z]?)\b/gi
    };
  }

  // Main function to detect highways along the route
  async detectHighwaysAlongRoute(routePoints) {
    try {
      console.log(`🛣️ Starting highway detection for ${routePoints.length} GPS points`);
      
      const detectedHighways = new Set();
      const highwaySegments = [];
      
      // Sample points along the route (every 5km or 20 points, whichever is smaller)
      const sampleInterval = Math.max(1, Math.floor(routePoints.length / 20));
      const samplePoints = [];
      
      for (let i = 0; i < routePoints.length; i += sampleInterval) {
        samplePoints.push(routePoints[i]);
      }
      
      // Always include the first and last points
      if (!samplePoints.includes(routePoints[0])) {
        samplePoints.unshift(routePoints[0]);
      }
      if (!samplePoints.includes(routePoints[routePoints.length - 1])) {
        samplePoints.push(routePoints[routePoints.length - 1]);
      }
      
      console.log(`📍 Sampling ${samplePoints.length} points for highway detection`);
      
      // Method 1: Use Google Roads API (if available)
      if (this.googleMapsApiKey) {
        const roadsApiResults = await this.detectUsingRoadsAPI(samplePoints);
        roadsApiResults.forEach(highway => detectedHighways.add(highway));
      }
      
      // Method 2: Use Reverse Geocoding
      for (let i = 0; i < samplePoints.length; i++) {
        const point = samplePoints[i];
        
        try {
          // Check cache first
          const cacheKey = `${point.latitude.toFixed(4)},${point.longitude.toFixed(4)}`;
          if (this.highwayCache.has(cacheKey)) {
            const cachedHighways = this.highwayCache.get(cacheKey);
            cachedHighways.forEach(hw => detectedHighways.add(hw));
            continue;
          }
          
          // Get highways at this point
          const highways = await this.detectHighwaysAtPoint(point.latitude, point.longitude);
          
          // Cache the result
          this.highwayCache.set(cacheKey, highways);
          
          // Add to detected highways
          highways.forEach(highway => {
            detectedHighways.add(highway);
            
            // Track segment information
            highwaySegments.push({
              highway: highway,
              startKm: point.distanceFromStart || (i * 5),
              latitude: point.latitude,
              longitude: point.longitude
            });
          });
          
          // Rate limiting
          if (i < samplePoints.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
        } catch (error) {
          console.warn(`Failed to detect highways at point ${i}:`, error.message);
        }
      }
      
      // Sort highways by type and number
      const sortedHighways = this.sortHighways(Array.from(detectedHighways));
      
      // Generate highway summary
      const summary = this.generateHighwaySummary(sortedHighways, highwaySegments);
      
      console.log(`✅ Highway detection complete. Found ${sortedHighways.length} highways`);
      
      return {
        majorHighways: sortedHighways,
        highwaySegments: highwaySegments,
        summary: summary
      };
      
    } catch (error) {
      console.error('Highway detection failed:', error);
      return {
        majorHighways: [],
        highwaySegments: [],
        summary: { error: error.message }
      };
    }
  }

  // Detect highways using Google Roads API
  async detectUsingRoadsAPI(samplePoints) {
    try {
      if (!this.googleMapsApiKey) {
        return [];
      }
      
      const highways = new Set();
      const batchSize = 100; // Google Roads API limit
      
      for (let i = 0; i < samplePoints.length; i += batchSize) {
        const batch = samplePoints.slice(i, i + batchSize);
        const path = batch.map(p => `${p.latitude},${p.longitude}`).join('|');
        
        const url = `https://roads.googleapis.com/v1/snapToRoads?` +
          `path=${encodeURIComponent(path)}&` +
          `interpolate=false&` +
          `key=${this.googleMapsApiKey}`;
        
        try {
          const response = await axios.get(url, { timeout: 10000 });
          
          if (response.data.snappedPoints) {
            for (const point of response.data.snappedPoints) {
              if (point.placeId) {
                // Get place details to find road name
                const roadName = await this.getRoadNameFromPlaceId(point.placeId);
                if (roadName) {
                  const extractedHighways = this.extractHighwayNames(roadName);
                  extractedHighways.forEach(hw => highways.add(hw));
                }
              }
            }
          }
        } catch (apiError) {
          console.warn('Roads API batch failed:', apiError.message);
        }
      }
      
      return Array.from(highways);
      
    } catch (error) {
      console.error('Roads API detection failed:', error);
      return [];
    }
  }

  // Get road name from Google Place ID
  async getRoadNameFromPlaceId(placeId) {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?` +
        `place_id=${placeId}&` +
        `fields=name,types&` +
        `key=${this.googleMapsApiKey}`;
      
      const response = await axios.get(url, { timeout: 5000 });
      
      if (response.data.status === 'OK' && response.data.result) {
        const place = response.data.result;
        if (place.types && place.types.includes('route')) {
          return place.name;
        }
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  // Detect highways at a specific point using reverse geocoding
  async detectHighwaysAtPoint(latitude, longitude) {
    const detectedHighways = new Set();
    
    try {
      // Method 1: Google Geocoding API
      if (this.googleMapsApiKey) {
        const googleHighways = await this.detectUsingGoogleGeocoding(latitude, longitude);
        googleHighways.forEach(hw => detectedHighways.add(hw));
      }
      
      // Method 2: Nominatim (OpenStreetMap) - Free alternative
      const osmHighways = await this.detectUsingNominatim(latitude, longitude);
      osmHighways.forEach(hw => detectedHighways.add(hw));
      
    } catch (error) {
      console.warn(`Highway detection failed at ${latitude},${longitude}:`, error.message);
    }
    
    return Array.from(detectedHighways);
  }

  // Use Google Geocoding API
  async detectUsingGoogleGeocoding(latitude, longitude) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?` +
        `latlng=${latitude},${longitude}&` +
        `result_type=route&` +
        `key=${this.googleMapsApiKey}`;
      
      const response = await axios.get(url, { timeout: 5000 });
      
      if (response.data.status === 'OK' && response.data.results) {
        const highways = new Set();
        
        for (const result of response.data.results) {
          // Check formatted address
          if (result.formatted_address) {
            const extracted = this.extractHighwayNames(result.formatted_address);
            extracted.forEach(hw => highways.add(hw));
          }
          
          // Check address components
          if (result.address_components) {
            for (const component of result.address_components) {
              if (component.types.includes('route')) {
                const extracted = this.extractHighwayNames(component.long_name);
                extracted.forEach(hw => highways.add(hw));
              }
            }
          }
        }
        
        return Array.from(highways);
      }
      
      return [];
      
    } catch (error) {
      console.warn('Google Geocoding failed:', error.message);
      return [];
    }
  }

  // Use Nominatim (OpenStreetMap) API
  async detectUsingNominatim(latitude, longitude) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?` +
        `lat=${latitude}&lon=${longitude}&` +
        `format=json&addressdetails=1&extratags=1`;
      
      const response = await axios.get(url, {
        timeout: 5000,
        headers: {
          'User-Agent': 'HPCL-Journey-Risk-Management/1.0'
        }
      });
      
      if (response.data) {
        const highways = new Set();
        
        // Check display name
        if (response.data.display_name) {
          const extracted = this.extractHighwayNames(response.data.display_name);
          extracted.forEach(hw => highways.add(hw));
        }
        
        // Check address details
        if (response.data.address) {
          const addressString = Object.values(response.data.address).join(' ');
          const extracted = this.extractHighwayNames(addressString);
          extracted.forEach(hw => highways.add(hw));
        }
        
        // Check extra tags for ref numbers
        if (response.data.extratags) {
          if (response.data.extratags.ref) {
            const extracted = this.extractHighwayNames(response.data.extratags.ref);
            extracted.forEach(hw => highways.add(hw));
          }
          if (response.data.extratags.name) {
            const extracted = this.extractHighwayNames(response.data.extratags.name);
            extracted.forEach(hw => highways.add(hw));
          }
        }
        
        return Array.from(highways);
      }
      
      return [];
      
    } catch (error) {
      console.warn('Nominatim API failed:', error.message);
      return [];
    }
  }

  // Extract highway names from text using patterns
  extractHighwayNames(text) {
    const highways = new Set();
    
    if (!text) return [];
    
    // National Highways (NH)
    const nhMatches = text.matchAll(this.highwayPatterns.national);
    for (const match of nhMatches) {
      const highwayNumber = match[2];
      highways.add(`NH-${highwayNumber}`);
    }
    
    // State Highways (SH)
    const shMatches = text.matchAll(this.highwayPatterns.state);
    for (const match of shMatches) {
      const highwayNumber = match[2];
      highways.add(`SH-${highwayNumber}`);
    }
    
    // Major District Roads (MDR)
    const mdrMatches = text.matchAll(this.highwayPatterns.mdr);
    for (const match of mdrMatches) {
      const roadNumber = match[2];
      highways.add(`MDR-${roadNumber}`);
    }
    
    // Other patterns for Indian highways
    // AH (Asian Highway)
    const ahPattern = /\b(AH)[\s-]?(\d+)\b/gi;
    const ahMatches = text.matchAll(ahPattern);
    for (const match of ahMatches) {
      highways.add(`AH-${match[2]}`);
    }
    
    return Array.from(highways);
  }

  // Sort highways by type and number
  sortHighways(highways) {
    const typeOrder = { 'NH': 1, 'AH': 2, 'SH': 3, 'MDR': 4, 'ODR': 5 };
    
    return highways.sort((a, b) => {
      const aType = a.split('-')[0];
      const bType = b.split('-')[0];
      const aNum = parseInt(a.split('-')[1]) || 0;
      const bNum = parseInt(b.split('-')[1]) || 0;
      
      if (typeOrder[aType] !== typeOrder[bType]) {
        return (typeOrder[aType] || 99) - (typeOrder[bType] || 99);
      }
      
      return aNum - bNum;
    });
  }

  // Generate highway summary
  generateHighwaySummary(highways, segments) {
    const summary = {
      totalHighways: highways.length,
      byType: {
        nationalHighways: highways.filter(h => h.startsWith('NH-')).length,
        stateHighways: highways.filter(h => h.startsWith('SH-')).length,
        majorDistrictRoads: highways.filter(h => h.startsWith('MDR-')).length,
        asianHighways: highways.filter(h => h.startsWith('AH-')).length
      },
      primaryHighway: highways[0] || null,
      highwayList: highways
    };
    
    // Calculate coverage for each highway
    if (segments.length > 0) {
      summary.coverage = {};
      for (const highway of highways) {
        const hwSegments = segments.filter(s => s.highway === highway);
        summary.coverage[highway] = {
          segments: hwSegments.length,
          firstAppearance: hwSegments[0]?.startKm || 0,
          lastAppearance: hwSegments[hwSegments.length - 1]?.startKm || 0
        };
      }
    }
    
    return summary;
  }

  // Clear cache
  clearCache() {
    this.highwayCache.clear();
  }
}

module.exports = new HighwayDetectionService();