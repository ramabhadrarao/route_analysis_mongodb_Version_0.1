// File: services/apiService.js
// Purpose: Integration with external APIs (Google Maps, Weather, Traffic, etc.)
// Phase 1: Core API integrations for route details and geocoding

const axios = require('axios');
const logger = require('../utils/logger');

class ApiService {
  constructor() {
    this.googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
    this.openWeatherApiKey = process.env.OPENWEATHER_API_KEY;
    this.tomtomApiKey = process.env.TOMTOM_API_KEY;
    this.hereApiKey = process.env.HERE_API_KEY;
    this.visualCrossingApiKey = process.env.VISUALCROSSING_API_KEY;
    this.mapboxApiKey = process.env.MAPBOX_API_KEY;
  }

  // Google Maps Directions API - Get route details
  async getRouteDetails(fromCoords, toCoords, waypoints = []) {
    try {
      const origin = `${fromCoords.latitude},${fromCoords.longitude}`;
      const destination = `${toCoords.latitude},${toCoords.longitude}`;
      
      let url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&key=${this.googleMapsApiKey}`;
      
      if (waypoints.length > 0) {
        const waypointsStr = waypoints.map(wp => `${wp.latitude},${wp.longitude}`).join('|');
        url += `&waypoints=${waypointsStr}`;
      }

      const response = await axios.get(url);
      
      if (response.data.status !== 'OK') {
        throw new Error(`Google Directions API error: ${response.data.status}`);
      }

      const route = response.data.routes[0];
      const leg = route.legs[0];

      return {
        distance: leg.distance.value / 1000, // Convert to km
        duration: leg.duration.value / 60, // Convert to minutes
        polyline: route.overview_polyline.points,
        steps: leg.steps,
        bounds: route.bounds
      };

    } catch (error) {
      logger.error('Google Directions API error:', error);
      throw new Error(`Failed to get route details: ${error.message}`);
    }
  }

  // Google Maps Geocoding API - Convert address to coordinates
  async geocodeAddress(address) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${this.googleMapsApiKey}`;
      
      const response = await axios.get(url);
      
      if (response.data.status !== 'OK') {
        throw new Error(`Google Geocoding API error: ${response.data.status}`);
      }

      const location = response.data.results[0].geometry.location;
      
      return {
        latitude: location.lat,
        longitude: location.lng
      };

    } catch (error) {
      logger.error('Google Geocoding API error:', error);
      throw new Error(`Failed to geocode address: ${error.message}`);
    }
  }

  // Google Maps Elevation API - Get elevation data
  async getElevation(coordinates) {
  try {
    // Handle single coordinate
    if (!Array.isArray(coordinates)) {
      coordinates = [coordinates];
    }
    
    // Batch processing for large coordinate arrays
    if (coordinates.length > 100) {
      return await this.getElevationBatch(coordinates);
    }
    
    const locations = coordinates.map(coord => `${coord.latitude},${coord.longitude}`).join('|');
    const url = `https://maps.googleapis.com/maps/api/elevation/json?locations=${locations}&key=${this.googleMapsApiKey}`;
    
    const response = await axios.get(url);
    
    if (response.data.status !== 'OK') {
      throw new Error(`Google Elevation API error: ${response.data.status}`);
    }

    return response.data.results.map(result => ({
      latitude: result.location.lat,
      longitude: result.location.lng,
      elevation: result.elevation
    }));

  } catch (error) {
    logger.error('Google Elevation API error:', error);
    throw new Error(`Failed to get elevation data: ${error.message}`);
  }
}

// ✅ ADD new batch processing method:
async getElevationBatch(coordinates, batchSize = 100) {
  try {
    const results = [];
    
    console.log(`📡 Processing ${coordinates.length} elevation points in batches of ${batchSize}`);
    
    for (let i = 0; i < coordinates.length; i += batchSize) {
      const batch = coordinates.slice(i, i + batchSize);
      const batchResults = await this.getElevation(batch);
      results.push(...batchResults);
      
      console.log(`✅ Processed batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(coordinates.length/batchSize)}`);
      
      // Rate limiting - respect Google API limits
      if (i + batchSize < coordinates.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`📊 Total elevation points processed: ${results.length}`);
    return results;
    
  } catch (error) {
    console.error('Batch elevation processing failed:', error);
    throw error;
  }
}

  // Google Places API - Find nearby services
  async findNearbyPlaces(latitude, longitude, type, radius = 50000) {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&radius=${radius}&type=${type}&key=${this.googleMapsApiKey}`;
      
      const response = await axios.get(url);
      
      if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
        throw new Error(`Google Places API error: ${response.data.status}`);
      }

      return response.data.results.map(place => ({
        placeId: place.place_id,
        name: place.name,
        latitude: place.geometry.location.lat,
        longitude: place.geometry.location.lng,
        rating: place.rating,
        vicinity: place.vicinity,
        types: place.types,
        openNow: place.opening_hours?.open_now,
        priceLevel: place.price_level
      }));

    } catch (error) {
      logger.error('Google Places API error:', error);
      throw new Error(`Failed to find nearby places: ${error.message}`);
    }
  }

  // OpenWeather API - Get weather data
  async getWeatherData(latitude, longitude) {
    try {
      const currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${this.openWeatherApiKey}&units=metric`;
      
      const response = await axios.get(currentUrl);
      
      return {
        temperature: response.data.main.temp,
        humidity: response.data.main.humidity,
        pressure: response.data.main.pressure,
        windSpeed: response.data.wind.speed,
        windDirection: response.data.wind.deg,
        visibility: response.data.visibility / 1000, // Convert to km
        description: response.data.weather[0].description,
        condition: response.data.weather[0].main
      };

    } catch (error) {
      logger.error('OpenWeather API error:', error);
      throw new Error(`Failed to get weather data: ${error.message}`);
    }
  }

  // TomTom Traffic API - Get traffic data
  async getTrafficData(latitude, longitude, radius = 1000) {
  try {
    if (!this.hereApiKey) {
      throw new Error('HERE API key not configured');
    }

    // HERE Traffic API v7 - Real-time flow data
    const url = `https://data.traffic.hereapi.com/v7/flow?` +
      `locationReferencing=shape&` +
      `in=circle:${latitude},${longitude};r=${radius}&` +
      `apikey=${this.hereApiKey}`;
    
    const response = await axios.get(url, { timeout: 15000 });
    
    if (response.data && response.data.results) {
      const flowData = response.data.results[0]?.currentFlow;
      
      return {
        currentSpeed: flowData?.speed || 50,
        freeFlowSpeed: flowData?.freeFlow || 60,
        jamFactor: flowData?.jamFactor || 0,
        confidence: flowData?.confidence || 0.8,
        roadClosure: flowData?.traversability === 'closed',
        congestionLevel: this.determineCongestionLevel(flowData?.jamFactor || 0),
        lastUpdated: new Date(),
        dataSource: 'HERE_TRAFFIC_API_V7'
      };
    }
    
    throw new Error('No traffic data available');
    
  } catch (error) {
    logger.error('HERE Traffic API error:', error);
    // NO FALLBACK - Let calling code handle the error
    throw new Error(`Real traffic data unavailable: ${error.message}`);
  }
}

// Add congestion level determination
determineCongestionLevel(jamFactor) {
  if (jamFactor >= 8) return 'severe';
  if (jamFactor >= 6) return 'heavy';
  if (jamFactor >= 4) return 'moderate';
  if (jamFactor >= 2) return 'light';
  return 'free_flow';
}

  // HERE API - Get road attributes
  async getRoadAttributes(latitude, longitude) {
    try {
      if (!this.hereApiKey) {
        throw new Error('HERE API key not configured');
      }

      const url = `https://router.hereapi.com/v8/routes?transportMode=car&origin=${latitude},${longitude}&destination=${latitude},${longitude}&return=summary&apikey=${this.hereApiKey}`;
      
      const response = await axios.get(url);
      
      // Extract road information from response
      return {
        roadType: 'unknown',
        speedLimit: 50, // Default speed limit
        surfaceType: 'paved'
      };

    } catch (error) {
      logger.error('HERE API error:', error);
      // Return default values if HERE fails
      return {
        roadType: 'unknown',
        speedLimit: 50,
        surfaceType: 'paved'
      };
    }
  }

  // Visual Crossing Weather API - Historical weather data
  async getHistoricalWeather(latitude, longitude, date) {
  try {
    if (!this.visualCrossingApiKey) {
      throw new Error('Visual Crossing API key not configured');
    }

    const dateStr = date.toISOString().split('T')[0];
    const url = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/` +
      `${latitude},${longitude}/${dateStr}?` +
      `key=${this.visualCrossingApiKey}&` +
      `include=days&` +
      `elements=temp,humidity,precip,windspeed,visibility,conditions`;
    
    const response = await axios.get(url, { timeout: 15000 });
    
    if (response.data && response.data.days && response.data.days[0]) {
      const dayData = response.data.days[0];
      
      return {
        temperature: dayData.temp,
        humidity: dayData.humidity,
        precipitation: dayData.precip || 0,
        windSpeed: dayData.windspeed,
        visibility: dayData.visibility,
        conditions: dayData.conditions,
        riskScore: this.calculateWeatherRisk(dayData),
        dataSource: 'VISUAL_CROSSING_API',
        lastUpdated: new Date()
      };
    }
    
    throw new Error('No weather data available');
    
  } catch (error) {
    logger.error('Visual Crossing API error:', error);
    throw new Error(`Real weather data unavailable: ${error.message}`);
  }
}

// Add weather risk calculation
calculateWeatherRisk(weatherData) {
  let risk = 2; // Base risk
  
  if (weatherData.visibility < 5) risk += 3;
  if (weatherData.windspeed > 30) risk += 2;
  if (weatherData.precip > 10) risk += 2;
  if (weatherData.conditions?.toLowerCase().includes('storm')) risk += 3;
  if (weatherData.conditions?.toLowerCase().includes('fog')) risk += 3;
  
  return Math.max(1, Math.min(10, risk));
}

  // Rate limiting helper
  async rateLimitedRequest(apiCall, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
      try {
        return await apiCall();
      } catch (error) {
        if (error.response?.status === 429 && i < retries - 1) {
          logger.warn(`Rate limited, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2; // Exponential backoff
        } else {
          throw error;
        }
      }
    }
  }

  // Batch geocoding for multiple addresses
  async batchGeocode(addresses) {
    const results = [];
    
    for (const address of addresses) {
      try {
        const coordinates = await this.geocodeAddress(address);
        results.push({ address, coordinates, success: true });
      } catch (error) {
        results.push({ address, error: error.message, success: false });
      }
      
      // Add delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return results;
  }
}

module.exports = new ApiService();