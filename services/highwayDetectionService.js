// File: services/highwayDetectionService.js
// Purpose: Simplified highway detection using only Google Maps API

const axios = require('axios');

class HighwayDetectionService {
  constructor() {
    this.googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
    this.highwayCache = new Map();
    
    // Common highway patterns in India
    this.highwayPatterns = {
      national: /\b(NH|National Highway)[\s-]?(\d+[A-Z]?)\b/gi,
      state: /\b(SH|State Highway)[\s-]?(\d+[A-Z]?)\b/gi,
      mdr: /\b(MDR|Major District Road)[\s-]?(\d+[A-Z]?)\b/gi,
      asian: /\b(AH|Asian Highway)[\s-]?(\d+)\b/gi
    };
  }

  // Main function to detect highways along the route
  async detectHighwaysAlongRoute(routePoints) {
    try {
      if (!this.googleMapsApiKey) {
        console.log('⚠️ Google Maps API key not configured - skipping highway detection');
        return { majorHighways: [], highwaySegments: [], summary: {} };
      }

      console.log(`🛣️ Starting highway detection for ${routePoints.length} GPS points`);
      
      const detectedHighways = new Set();
      
      // Sample points along the route (every 50 points or 10 samples max)
      const sampleInterval = Math.max(1, Math.floor(routePoints.length / 10));
      const samplePoints = [];
      
      for (let i = 0; i < routePoints.length; i += sampleInterval) {
        samplePoints.push(routePoints[i]);
      }
      
      // Always include first and last points
      if (!samplePoints.includes(routePoints[0])) {
        samplePoints.unshift(routePoints[0]);
      }
      if (!samplePoints.includes(routePoints[routePoints.length - 1])) {
        samplePoints.push(routePoints[routePoints.length - 1]);
      }
      
      console.log(`📍 Checking ${samplePoints.length} sample points for highways`);
      
      // Process each sample point
      for (let i = 0; i < samplePoints.length; i++) {
        const point = samplePoints[i];
        
        // Check cache first
        const cacheKey = `${point.latitude.toFixed(3)},${point.longitude.toFixed(3)}`;
        if (this.highwayCache.has(cacheKey)) {
          const cached = this.highwayCache.get(cacheKey);
          cached.forEach(hw => detectedHighways.add(hw));
          continue;
        }
        
        try {
          // Google Geocoding API call
          const url = `https://maps.googleapis.com/maps/api/geocode/json?` +
            `latlng=${point.latitude},${point.longitude}&` +
            `result_type=route&` +
            `key=${this.googleMapsApiKey}`;
          
          const response = await axios.get(url, { timeout: 5000 });
          
          if (response.data.status === 'OK' && response.data.results) {
            const pointHighways = new Set();
            
            // Extract highways from results
            for (const result of response.data.results) {
              // Check formatted address
              if (result.formatted_address) {
                const extracted = this.extractHighwayNames(result.formatted_address);
                extracted.forEach(hw => pointHighways.add(hw));
              }
              
              // Check address components
              if (result.address_components) {
                for (const component of result.address_components) {
                  if (component.types.includes('route')) {
                    const extracted = this.extractHighwayNames(component.long_name);
                    extracted.forEach(hw => pointHighways.add(hw));
                  }
                }
              }
            }
            
            // Cache the result
            this.highwayCache.set(cacheKey, Array.from(pointHighways));
            
            // Add to overall detected highways
            pointHighways.forEach(hw => detectedHighways.add(hw));
          }
          
          // Small delay to respect rate limits
          if (i < samplePoints.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
          
        } catch (error) {
          console.warn(`Failed to check point ${i + 1}:`, error.message);
        }
      }
      
      // Sort highways by type and number
      const sortedHighways = this.sortHighways(Array.from(detectedHighways));
      
      console.log(`✅ Found ${sortedHighways.length} highways: ${sortedHighways.join(', ')}`);
      
      return {
        majorHighways: sortedHighways,
        highwaySegments: [],
        summary: {
          totalHighways: sortedHighways.length,
          highways: sortedHighways
        }
      };
      
    } catch (error) {
      console.error('Highway detection error:', error);
      return { majorHighways: [], highwaySegments: [], summary: { error: error.message } };
    }
  }

  // Extract highway names from text
  extractHighwayNames(text) {
    const highways = new Set();
    
    if (!text) return [];
    
    // Check all patterns
    Object.entries(this.highwayPatterns).forEach(([type, pattern]) => {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const prefix = match[1].toUpperCase().replace('ATIONAL HIGHWAY', 'H');
        const number = match[2];
        highways.add(`${prefix}-${number}`);
      }
    });
    
    return Array.from(highways);
  }

  // Sort highways by type and number
  sortHighways(highways) {
    const typeOrder = { 'NH': 1, 'AH': 2, 'SH': 3, 'MDR': 4 };
    
    return highways.sort((a, b) => {
      const [aType, aNum] = a.split('-');
      const [bType, bNum] = b.split('-');
      
      // Sort by type priority
      const aOrder = typeOrder[aType] || 99;
      const bOrder = typeOrder[bType] || 99;
      
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      
      // Sort by number
      return parseInt(aNum) - parseInt(bNum);
    });
  }

  // Clear cache
  clearCache() {
    this.highwayCache.clear();
  }
}

module.exports = new HighwayDetectionService();