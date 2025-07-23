// File: services/ecoSensitiveZoneService.js
const EcoSensitiveZone = require('../models/EcoSensitiveZone');
const Route = require('../models/Route');

class EcoSensitiveZoneService {
  async detectEcoSensitiveZones(routeId) {
    try {
      console.log('🌳 Detecting eco-sensitive zones along route...');
      
      const route = await Route.findById(routeId);
      if (!route || !route.routePoints || route.routePoints.length === 0) {
        throw new Error('Invalid route or no GPS points');
      }

      const zones = [];
      const processedZones = new Set(); // Avoid duplicates

      // Sample every 5km of route
      const sampleDistance = 5; // km
      let currentDistance = 0;

      for (let i = 0; i < route.routePoints.length; i++) {
        const point = route.routePoints[i];
        
        if (i === 0 || point.distanceFromStart >= currentDistance) {
          currentDistance += sampleDistance;
          
          // Search for eco-sensitive zones near this point
          const nearbyZones = await this.searchNearbyEcoZones(
            point.latitude, 
            point.longitude,
            point.distanceFromStart || i
          );
          
          for (const zone of nearbyZones) {
            const zoneKey = `${zone.name}-${zone.type}`;
            if (!processedZones.has(zoneKey)) {
              processedZones.add(zoneKey);
              zones.push(zone);
            }
          }
        }
      }

      // Save to database
      if (zones.length > 0) {
        const savedZones = await EcoSensitiveZone.insertMany(
          zones.map(zone => ({
            ...zone,
            routeId: routeId
          }))
        );
        
        console.log(`✅ Found ${savedZones.length} eco-sensitive zones`);
        return {
          success: true,
          zonesFound: savedZones.length,
          zones: savedZones
        };
      }

      return {
        success: true,
        zonesFound: 0,
        zones: []
      };

    } catch (error) {
      console.error('Eco-sensitive zone detection error:', error);
      return {
        success: false,
        error: error.message,
        zonesFound: 0
      };
    }
  }

  async searchNearbyEcoZones(lat, lon, distanceFromStart) {
    const zones = [];
    
    // Use Google Places API if available
    if (process.env.GOOGLE_MAPS_API_KEY) {
      try {
        const placesResults = await this.searchGooglePlaces(lat, lon);
        zones.push(...placesResults);
      } catch (error) {
        console.error('Google Places search failed:', error.message);
      }
    }
    
    // Fallback to known wildlife sanctuaries database
    const knownZones = await this.checkKnownWildlifeSanctuaries(lat, lon);
    zones.push(...knownZones);
    
    // Add distance from start to each zone
    return zones.map(zone => ({
      ...zone,
      distanceFromStartKm: distanceFromStart
    }));
  }

  async searchGooglePlaces(lat, lon) {
    const axios = require('axios');
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    
    try {
      // Search for wildlife sanctuaries and national parks
      const types = ['park', 'natural_feature'];
      const keywords = ['wildlife sanctuary', 'national park', 'protected forest', 'eco sensitive zone'];
      const zones = [];

      for (const keyword of keywords) {
        const response = await axios.get(
          `https://maps.googleapis.com/maps/api/place/nearbysearch/json`, {
          params: {
            location: `${lat},${lon}`,
            radius: 10000, // 10km radius
            keyword: keyword,
            key: apiKey
          }
        });

        if (response.data.results) {
          for (const place of response.data.results) {
            // Check if it's actually an eco-sensitive zone
            if (this.isEcoSensitivePlace(place)) {
              zones.push({
                name: place.name,
                latitude: place.geometry.location.lat,
                longitude: place.geometry.location.lng,
                zoneType: this.determineZoneType(place),
                severity: this.determineSeverity(place),
                riskScore: this.calculateRiskScore(place),
                distanceFromRouteKm: this.calculateDistance(
                  lat, lon,
                  place.geometry.location.lat,
                  place.geometry.location.lng
                ),
                restrictions: this.getDefaultRestrictions(place),
                dataSource: 'GOOGLE_PLACES_API'
              });
            }
          }
        }
      }

      return zones;
    } catch (error) {
      console.error('Google Places API error:', error.message);
      return [];
    }
  }

  async checkKnownWildlifeSanctuaries(lat, lon) {
    // Database of known wildlife sanctuaries in India
    const knownSanctuaries = [
      { name: 'Jim Corbett National Park', lat: 29.5300, lon: 78.7747, type: 'national_park' },
      { name: 'Rajaji National Park', lat: 30.0869, lon: 78.2423, type: 'national_park' },
      { name: 'Sariska Tiger Reserve', lat: 27.3151, lon: 76.4032, type: 'wildlife_sanctuary' },
      // Add more known sanctuaries
    ];

    const nearbyZones = [];
    
    for (const sanctuary of knownSanctuaries) {
      const distance = this.calculateDistance(lat, lon, sanctuary.lat, sanctuary.lon);
      
      if (distance <= 10) { // Within 10km
        nearbyZones.push({
          name: sanctuary.name,
          latitude: sanctuary.lat,
          longitude: sanctuary.lon,
          zoneType: sanctuary.type,
          severity: 'critical',
          riskScore: 9,
          distanceFromRouteKm: distance,
          restrictions: [
            'Speed limit 40 km/h',
            'No honking',
            'No stopping except emergency',
            'Headlights on low beam'
          ],
          dataSource: 'KNOWN_DATABASE'
        });
      }
    }

    return nearbyZones;
  }

  isEcoSensitivePlace(place) {
    const keywords = ['wildlife', 'sanctuary', 'national park', 'reserve', 'protected', 'forest', 'eco'];
    const name = place.name.toLowerCase();
    return keywords.some(keyword => name.includes(keyword));
  }

  determineZoneType(place) {
    const name = place.name.toLowerCase();
    if (name.includes('wildlife sanctuary')) return 'wildlife_sanctuary';
    if (name.includes('national park')) return 'national_park';
    if (name.includes('reserve')) return 'biosphere_reserve';
    if (name.includes('protected forest')) return 'protected_forest';
    return 'eco_sensitive';
  }

  determineSeverity(place) {
    const name = place.name.toLowerCase();
    if (name.includes('tiger') || name.includes('elephant')) return 'critical';
    if (name.includes('national park')) return 'high';
    if (name.includes('sanctuary')) return 'high';
    return 'medium';
  }

  calculateRiskScore(place) {
    const severity = this.determineSeverity(place);
    if (severity === 'critical') return 9;
    if (severity === 'high') return 7;
    if (severity === 'medium') return 5;
    return 3;
  }

  getDefaultRestrictions(place) {
    return [
      'Speed limit 40 km/h',
      'No honking between 6 PM - 6 AM',
      'No stopping except designated areas',
      'Maintain silence',
      'Follow forest department guidelines'
    ];
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return Math.round(R * c * 100) / 100;
  }
}

module.exports = new EcoSensitiveZoneService();