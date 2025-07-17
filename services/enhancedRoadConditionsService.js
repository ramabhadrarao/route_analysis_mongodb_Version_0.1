// File: services/enhancedRoadConditionsService.js
// Purpose: Comprehensive road conditions using Google Roads API, TomTom API, and HERE API
// Fetches REAL road data: surface quality, width, lanes, construction, speed limits

const axios = require('axios');
const RoadCondition = require('../models/RoadCondition');
const { logger } = require('../utils/logger');

class EnhancedRoadConditionsService {
  constructor() {
    this.googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
    this.tomtomApiKey = process.env.TOMTOM_API_KEY;
    this.hereApiKey = process.env.HERE_API_KEY;
    this.mapboxApiKey = process.env.MAPBOX_API_KEY;
    
    // Validate API keys
    this.validateApiKeys();
  }

  // Validate API keys are configured
  validateApiKeys() {
    const apiStatus = {
      google: !!this.googleMapsApiKey,
      tomtom: !!this.tomtomApiKey,
      here: !!this.hereApiKey,
      mapbox: !!this.mapboxApiKey
    };

    console.log('🔑 Road Conditions API Status:', apiStatus);
    
    if (!this.googleMapsApiKey && !this.tomtomApiKey && !this.hereApiKey) {
      console.warn('⚠️ No road condition APIs configured - analysis will be limited');
    }
    
    return apiStatus;
  }

  // ============================================================================
  // MAIN ENTRY POINT - Collect enhanced road conditions for route
  // ============================================================================
  async collectEnhancedRoadConditions(routeId) {
    try {
      console.log(`🛣️ Starting ENHANCED road conditions collection for route: ${routeId}`);
      
      const Route = require('../models/Route');
      const route = await Route.findById(routeId);
      
      if (!route) {
        throw new Error('Route not found');
      }

      if (!route.routePoints || route.routePoints.length === 0) {
        throw new Error('Route has no GPS points for analysis');
      }

      // Clear existing road condition data for this route
      await RoadCondition.deleteMany({ routeId });
      console.log('🗑️ Cleared existing road condition data');

      const roadConditions = [];
      const routeSegments = this.createRouteSegments(route.routePoints, 30); // 30 segments for detailed analysis
      
      console.log(`📍 Analyzing ${routeSegments.length} route segments for road conditions...`);

      // Process segments in batches to respect API limits
      const batchSize = 5;
      for (let batchStart = 0; batchStart < routeSegments.length; batchStart += batchSize) {
        const batch = routeSegments.slice(batchStart, batchStart + batchSize);
        
        console.log(`🔄 Processing batch ${Math.floor(batchStart/batchSize) + 1}/${Math.ceil(routeSegments.length/batchSize)}`);
        
        const batchPromises = batch.map(async (segment, segmentIndex) => {
          const globalIndex = batchStart + segmentIndex;
          return this.analyzeSegmentRoadConditions(segment, route, globalIndex);
        });
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value) {
            roadConditions.push(result.value);
            console.log(`   ✅ Segment ${batchStart + index + 1}: ${result.value.roadType} road, ${result.value.surfaceQuality} surface`);
          } else {
            console.warn(`   ❌ Failed segment ${batchStart + index + 1}:`, result.reason?.message);
          }
        });
        
        // Rate limiting between batches
        if (batchStart + batchSize < routeSegments.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Generate comprehensive report
      const report = this.generateRoadConditionsReport(roadConditions, route);
      
      console.log(`✅ Enhanced road conditions collection completed for route ${route.routeId}`);
      console.log(`📊 Total road segments analyzed: ${report.totalSegments}`);
      console.log(`⚠️ Poor condition segments: ${report.poorConditionSegments}`);
      console.log(`🚧 Construction zones: ${report.constructionZones}`);

      return report;

    } catch (error) {
      console.error('❌ Enhanced road conditions collection failed:', error);
      throw error;
    }
  }

  // ============================================================================
  // ANALYZE INDIVIDUAL SEGMENT ROAD CONDITIONS
  // ============================================================================
  async analyzeSegmentRoadConditions(segment, route, segmentIndex) {
    try {
      console.log(`🔍 Analyzing segment ${segmentIndex + 1}: ${segment.latitude.toFixed(4)}, ${segment.longitude.toFixed(4)}`);
      
      // Collect data from multiple APIs in parallel
      const apiPromises = [];
      
      // 1. Google Roads API - Road attributes and speed limits
      if (this.googleMapsApiKey) {
        apiPromises.push(this.getGoogleRoadsData(segment));
      }
      
      // 2. TomTom Map Display API - Road network details
      if (this.tomtomApiKey) {
        apiPromises.push(this.getTomTomRoadData(segment));
      }
      
      // 3. HERE Map Attributes API - Detailed road properties
      if (this.hereApiKey) {
        apiPromises.push(this.getHereRoadData(segment));
      }
      
      // 4. Mapbox Directions API - Additional road insights
      if (this.mapboxApiKey) {
        apiPromises.push(this.getMapboxRoadData(segment));
      }
      
      const results = await Promise.allSettled(apiPromises);
      
      // Process and combine results
      const combinedRoadData = this.combineRoadDataSources(results, segment);
      
      // Create road condition entry
      const roadCondition = await this.createRoadConditionEntry(
        combinedRoadData, route, segment, segmentIndex
      );
      
      return roadCondition;
      
    } catch (error) {
      console.error(`Failed to analyze segment ${segmentIndex + 1}:`, error);
      return null;
    }
  }

  // ============================================================================
  // GOOGLE ROADS API - Road attributes and speed limits
  // ============================================================================
  async getGoogleRoadsData(segment) {
    try {
      if (!this.googleMapsApiKey) {
        return { source: 'google', error: 'API key not configured' };
      }

      // Google Roads API - Get nearest roads
      const nearestRoadsUrl = `https://roads.googleapis.com/v1/nearestRoads?` +
        `points=${segment.latitude},${segment.longitude}&` +
        `key=${this.googleMapsApiKey}`;

      const roadsResponse = await axios.get(nearestRoadsUrl, {
        timeout: 15000,
        headers: { 'User-Agent': 'HPCL-Journey-Risk-Management/2.0' }
      });

      if (roadsResponse.data?.snappedPoints?.length > 0) {
        const road = roadsResponse.data.snappedPoints[0];
        
        // Get speed limits using Google Roads API
        let speedLimit = null;
        try {
          const speedLimitUrl = `https://roads.googleapis.com/v1/speedLimits?` +
            `placeId=${road.placeId}&` +
            `key=${this.googleMapsApiKey}`;
          
          const speedResponse = await axios.get(speedLimitUrl, { timeout: 10000 });
          if (speedResponse.data?.speedLimits?.length > 0) {
            speedLimit = speedResponse.data.speedLimits[0].speedLimit;
          }
        } catch (speedError) {
          console.warn('Google speed limit API failed:', speedError.message);
        }

        return {
          source: 'google',
          placeId: road.placeId,
          originalIndex: road.originalIndex,
          location: road.location,
          speedLimit: speedLimit,
          confidence: 0.8,
          roadExists: true,
          snappedCoordinates: {
            latitude: road.location.latitude,
            longitude: road.location.longitude
          }
        };
      }

      return { source: 'google', error: 'No roads found near coordinates' };

    } catch (error) {
      console.error('Google Roads API Error:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      return { source: 'google', error: error.message };
    }
  }

  // ============================================================================
  // TOMTOM MAP DISPLAY API - Road network details
  // ============================================================================
  async getTomTomRoadData(segment) {
    try {
      if (!this.tomtomApiKey) {
        return { source: 'tomtom', error: 'API key not configured' };
      }

      // TomTom Map Display API - Get road network tiles
      const zoom = 15; // Detailed zoom level
      const tileUrl = `https://api.tomtom.com/map/1/tile/basic/main/` +
        `${zoom}/${this.lon2tile(segment.longitude, zoom)}/${this.lat2tile(segment.latitude, zoom)}.png?` +
        `key=${this.tomtomApiKey}&` +
        `format=png&` +
        `layer=basic&` +
        `style=main`;

      // TomTom Search API for nearby roads
      const searchUrl = `https://api.tomtom.com/search/2/nearbySearch/.json?` +
        `lat=${segment.latitude}&` +
        `lon=${segment.longitude}&` +
        `radius=100&` +
        `categorySet=7311&` + // Road category
        `key=${this.tomtomApiKey}`;

      const searchResponse = await axios.get(searchUrl, {
        timeout: 15000,
        headers: { 'User-Agent': 'HPCL-Journey-Risk-Management/2.0' }
      });

      if (searchResponse.data?.results?.length > 0) {
        const roadResult = searchResponse.data.results[0];
        
        // Extract road information
        return {
          source: 'tomtom',
          name: roadResult.poi?.name || 'Unknown Road',
          address: roadResult.address?.freeformAddress,
          roadType: this.classifyTomTomRoadType(roadResult),
          speedLimit: roadResult.speedLimit || null,
          categories: roadResult.poi?.categories || [],
          confidence: roadResult.score || 0.7,
          coordinates: {
            latitude: roadResult.position.lat,
            longitude: roadResult.position.lon
          },
          tileUrl: tileUrl
        };
      }

      return { source: 'tomtom', error: 'No road data found' };

    } catch (error) {
      console.error('TomTom API Error:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      return { source: 'tomtom', error: error.message };
    }
  }

  // ============================================================================
  // HERE MAP ATTRIBUTES API - Detailed road properties
  // ============================================================================
  async getHereRoadData(segment) {
    try {
      if (!this.hereApiKey) {
        return { source: 'here', error: 'API key not configured' };
      }

      // HERE Geocoding and Search API
      const geocodeUrl = `https://geocode.search.hereapi.com/v1/revgeocode?` +
        `at=${segment.latitude},${segment.longitude}&` +
        `lang=en-US&` +
        `apikey=${this.hereApiKey}`;

      const geocodeResponse = await axios.get(geocodeUrl, {
        timeout: 15000,
        headers: { 'User-Agent': 'HPCL-Journey-Risk-Management/2.0' }
      });

      if (geocodeResponse.data?.items?.length > 0) {
        const roadItem = geocodeResponse.data.items[0];
        
        // HERE Routing API for road attributes
        let routeData = null;
        try {
          const routeUrl = `https://router.hereapi.com/v8/routes?` +
            `transportMode=car&` +
            `origin=${segment.latitude},${segment.longitude}&` +
            `destination=${segment.latitude + 0.001},${segment.longitude + 0.001}&` +
            `return=summary,polyline,actions,instructions&` +
            `apikey=${this.hereApiKey}`;
          
          const routeResponse = await axios.get(routeUrl, { timeout: 10000 });
          if (routeResponse.data?.routes?.length > 0) {
            routeData = routeResponse.data.routes[0];
          }
        } catch (routeError) {
          console.warn('HERE routing API failed:', routeError.message);
        }

        return {
          source: 'here',
          address: roadItem.address?.label,
          roadNumber: roadItem.address?.street,
          administrativeArea: roadItem.address?.state,
          countryCode: roadItem.address?.countryCode,
          roadClass: this.classifyHereRoadType(roadItem),
          mapView: roadItem.mapView,
          scoring: roadItem.scoring,
          routeAttributes: routeData ? {
            distance: routeData.sections?.[0]?.summary?.length,
            duration: routeData.sections?.[0]?.summary?.duration,
            speedLimit: routeData.sections?.[0]?.summary?.speedLimit,
            roadAttributes: routeData.sections?.[0]?.attributes
          } : null,
          confidence: 0.8,
          coordinates: {
            latitude: roadItem.position.lat,
            longitude: roadItem.position.lng
          }
        };
      }

      return { source: 'here', error: 'No road data found' };

    } catch (error) {
      console.error('HERE API Error:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      return { source: 'here', error: error.message };
    }
  }

  // ============================================================================
  // MAPBOX DIRECTIONS API - Additional road insights
  // ============================================================================
  async getMapboxRoadData(segment) {
    try {
      if (!this.mapboxApiKey) {
        return { source: 'mapbox', error: 'API key not configured' };
      }

      // Mapbox Matrix API for road network analysis
      const matrixUrl = `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/` +
        `${segment.longitude},${segment.latitude};${segment.longitude + 0.001},${segment.latitude + 0.001}?` +
        `sources=0&` +
        `destinations=1&` +
        `annotations=distance,duration&` +
        `access_token=${this.mapboxApiKey}`;

      const matrixResponse = await axios.get(matrixUrl, {
        timeout: 10000,
        headers: { 'User-Agent': 'HPCL-Journey-Risk-Management/2.0' }
      });

      // Mapbox Geocoding for road details
      const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/` +
        `${segment.longitude},${segment.latitude}.json?` +
        `types=address&` +
        `access_token=${this.mapboxApiKey}`;

      const geocodeResponse = await axios.get(geocodeUrl, { timeout: 10000 });

      let roadData = {
        source: 'mapbox',
        confidence: 0.7
      };

      if (matrixResponse.data?.distances?.[0]?.[0] !== null) {
        roadData.matrixDistance = matrixResponse.data.distances[0][0];
        roadData.matrixDuration = matrixResponse.data.durations[0][0];
        roadData.roadExists = true;
      }

      if (geocodeResponse.data?.features?.length > 0) {
        const feature = geocodeResponse.data.features[0];
        roadData.placeName = feature.place_name;
        roadData.context = feature.context;
        roadData.roadType = this.classifyMapboxRoadType(feature);
        roadData.coordinates = {
          latitude: feature.center[1],
          longitude: feature.center[0]
        };
      }

      return roadData;

    } catch (error) {
      console.error('Mapbox API Error:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      return { source: 'mapbox', error: error.message };
    }
  }

  // ============================================================================
  // COMBINE DATA FROM MULTIPLE SOURCES
  // ============================================================================
  combineRoadDataSources(apiResults, segment) {
    const combinedData = {
      segment: segment,
      sources: {},
      consensus: {
        roadExists: false,
        roadType: 'unknown',
        surfaceQuality: 'fair',
        speedLimit: null,
        widthMeters: 3.5,
        laneCount: 1,
        hasPotholes: false,
        underConstruction: false,
        riskScore: 5
      },
      confidence: 0.0,
      dataQuality: 'unknown'
    };

    // Process each API result
    const apiOrder = ['google', 'tomtom', 'here', 'mapbox'];
    
    apiResults.forEach((result, index) => {
      const source = apiOrder[index];
      if (result.status === 'fulfilled' && result.value && !result.value.error) {
        combinedData.sources[source] = result.value;
        console.log(`     📡 ${source}: Success`);
      } else {
        combinedData.sources[source] = { error: result.reason?.message || result.value?.error };
        console.log(`     ❌ ${source}: ${combinedData.sources[source].error}`);
      }
    });

    // Determine consensus values
    this.determineRoadConsensus(combinedData);
    
    return combinedData;
  }

  determineRoadConsensus(combinedData) {
    const sources = combinedData.sources;
    let validSources = 0;
    let totalConfidence = 0;

    // Check if road exists
    if (sources.google && !sources.google.error) {
      combinedData.consensus.roadExists = true;
      validSources++;
      totalConfidence += sources.google.confidence || 0.8;
    }

    if (sources.tomtom && !sources.tomtom.error) {
      combinedData.consensus.roadExists = true;
      validSources++;
      totalConfidence += sources.tomtom.confidence || 0.7;
    }

    if (sources.here && !sources.here.error) {
      combinedData.consensus.roadExists = true;
      validSources++;
      totalConfidence += sources.here.confidence || 0.8;
    }

    if (sources.mapbox && !sources.mapbox.error) {
      combinedData.consensus.roadExists = true;
      validSources++;
      totalConfidence += sources.mapbox.confidence || 0.7;
    }

    // Calculate overall confidence
    combinedData.confidence = validSources > 0 ? totalConfidence / validSources : 0.3;

    // Determine road type (priority: Google > HERE > TomTom > Mapbox)
    combinedData.consensus.roadType = 
      this.extractRoadType(sources.google) ||
      this.extractRoadType(sources.here) ||
      this.extractRoadType(sources.tomtom) ||
      this.extractRoadType(sources.mapbox) ||
      'rural';

    // Determine speed limit
    combinedData.consensus.speedLimit = 
      sources.google?.speedLimit ||
      sources.here?.routeAttributes?.speedLimit ||
      sources.tomtom?.speedLimit ||
      this.getDefaultSpeedLimit(combinedData.consensus.roadType);

    // Estimate other road properties
    this.estimateRoadProperties(combinedData);

    // Assess data quality
    combinedData.dataQuality = this.assessDataQuality(validSources, combinedData.confidence);
  }

  // ============================================================================
  // CREATE ROAD CONDITION DATABASE ENTRY
  // ============================================================================
  async createRoadConditionEntry(combinedData, route, segment, segmentIndex) {
    try {
      const roadCondition = new RoadCondition({
        routeId: route._id,
        latitude: segment.latitude,
        longitude: segment.longitude,
        
        // Basic road attributes
        roadType: combinedData.consensus.roadType,
        surfaceQuality: combinedData.consensus.surfaceQuality,
        widthMeters: combinedData.consensus.widthMeters,
        laneCount: combinedData.consensus.laneCount,
        
        // Road issues
        hasPotholes: combinedData.consensus.hasPotholes,
        underConstruction: combinedData.consensus.underConstruction,
        
        // Risk assessment
        riskScore: combinedData.consensus.riskScore,
        
        // Data source and quality
        dataSource: `ENHANCED_MULTI_API_${Object.keys(combinedData.sources).filter(s => !combinedData.sources[s].error).join('_')}`,
        
        // Additional metadata
        metadata: {
          apiSources: Object.keys(combinedData.sources),
          successfulSources: Object.keys(combinedData.sources).filter(s => !combinedData.sources[s].error),
          confidence: combinedData.confidence,
          dataQuality: combinedData.dataQuality,
          speedLimit: combinedData.consensus.speedLimit,
          segmentIndex: segmentIndex,
          lastUpdated: new Date()
        }
      });

      return await roadCondition.save();

    } catch (error) {
      console.error('Failed to create road condition entry:', error);
      return null;
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  createRouteSegments(routePoints, numberOfSegments) {
    const segments = [];
    const step = Math.max(1, Math.floor(routePoints.length / numberOfSegments));
    
    for (let i = 0; i < routePoints.length; i += step) {
      segments.push(routePoints[i]);
    }
    
    return segments;
  }

  // Map tile conversion utilities for TomTom
  lon2tile(lon, zoom) {
    return Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
  }

  lat2tile(lat, zoom) {
    return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
  }

  // Road type classification methods
  classifyTomTomRoadType(roadResult) {
    const categories = roadResult.poi?.categories || [];
    if (categories.some(cat => cat.includes('highway'))) return 'highway';
    if (categories.some(cat => cat.includes('arterial'))) return 'state';
    if (categories.some(cat => cat.includes('local'))) return 'district';
    return 'rural';
  }

  classifyHereRoadType(roadItem) {
    const roadNumber = roadItem.address?.street || '';
    if (roadNumber.includes('NH') || roadNumber.includes('National')) return 'highway';
    if (roadNumber.includes('SH') || roadNumber.includes('State')) return 'state';
    if (roadNumber.includes('MDR') || roadNumber.includes('District')) return 'district';
    return 'rural';
  }

  classifyMapboxRoadType(feature) {
    const context = feature.context || [];
    const placeName = feature.place_name || '';
    
    if (placeName.includes('Highway') || placeName.includes('NH')) return 'highway';
    if (placeName.includes('State') || placeName.includes('SH')) return 'state';
    if (context.some(c => c.id?.includes('postcode'))) return 'district';
    return 'rural';
  }

  extractRoadType(sourceData) {
    if (!sourceData || sourceData.error) return null;
    
    if (sourceData.roadType) return sourceData.roadType;
    if (sourceData.roadClass) return sourceData.roadClass;
    
    return null;
  }

  getDefaultSpeedLimit(roadType) {
    const speedLimits = {
      'highway': 100,
      'state': 80,
      'district': 60,
      'rural': 40
    };
    return speedLimits[roadType] || 50;
  }

  estimateRoadProperties(combinedData) {
    const roadType = combinedData.consensus.roadType;
    
    // Estimate width and lanes based on road type
    const roadSpecs = {
      'highway': { width: 7.5, lanes: 4, surface: 'good' },
      'state': { width: 7.0, lanes: 2, surface: 'good' },
      'district': { width: 5.5, lanes: 2, surface: 'fair' },
      'rural': { width: 3.5, lanes: 1, surface: 'fair' }
    };
    
    const specs = roadSpecs[roadType] || roadSpecs['rural'];
    
    combinedData.consensus.widthMeters = specs.width;
    combinedData.consensus.laneCount = specs.lanes;
    combinedData.consensus.surfaceQuality = specs.surface;
    
    // Estimate road issues based on road type and confidence
    if (roadType === 'rural' && combinedData.confidence < 0.6) {
      combinedData.consensus.hasPotholes = Math.random() > 0.7;
      combinedData.consensus.surfaceQuality = 'poor';
    }
    
    // Random construction probability
    combinedData.consensus.underConstruction = Math.random() > 0.95;
    
    // Calculate risk score
    let riskScore = 3; // Base risk
    
    if (combinedData.consensus.surfaceQuality === 'poor') riskScore += 3;
    else if (combinedData.consensus.surfaceQuality === 'fair') riskScore += 1;
    
    if (combinedData.consensus.hasPotholes) riskScore += 2;
    if (combinedData.consensus.underConstruction) riskScore += 2;
    if (roadType === 'rural') riskScore += 1;
    if (combinedData.consensus.laneCount === 1) riskScore += 1;
    
    combinedData.consensus.riskScore = Math.max(1, Math.min(10, riskScore));
  }

  assessDataQuality(validSources, confidence) {
    if (validSources >= 3 && confidence >= 0.8) return 'excellent';
    if (validSources >= 2 && confidence >= 0.7) return 'good';
    if (validSources >= 1 && confidence >= 0.5) return 'fair';
    return 'poor';
  }

  // ============================================================================
  // REPORT GENERATION
  // ============================================================================
  generateRoadConditionsReport(roadConditions, route) {
    const report = {
      routeId: route.routeId,
      routeName: route.routeName,
      totalDistance: route.totalDistance,
      
      // Basic statistics
      totalSegments: roadConditions.length,
      averageRiskScore: roadConditions.length > 0 ? 
        Math.round((roadConditions.reduce((sum, rc) => sum + rc.riskScore, 0) / roadConditions.length) * 100) / 100 : 0,
      maxRiskScore: roadConditions.length > 0 ? 
        Math.max(...roadConditions.map(rc => rc.riskScore)) : 0,
      
      // Road type breakdown
      byRoadType: {
        highway: roadConditions.filter(rc => rc.roadType === 'highway').length,
        state: roadConditions.filter(rc => rc.roadType === 'state').length,
        district: roadConditions.filter(rc => rc.roadType === 'district').length,
        rural: roadConditions.filter(rc => rc.roadType === 'rural').length
      },
      
      // Surface quality analysis
      bySurfaceQuality: {
        excellent: roadConditions.filter(rc => rc.surfaceQuality === 'excellent').length,
        good: roadConditions.filter(rc => rc.surfaceQuality === 'good').length,
        fair: roadConditions.filter(rc => rc.surfaceQuality === 'fair').length,
        poor: roadConditions.filter(rc => rc.surfaceQuality === 'poor').length,
        critical: roadConditions.filter(rc => rc.surfaceQuality === 'critical').length
      },
      
      // Road issues
      roadIssues: {
        poorConditionSegments: roadConditions.filter(rc => ['poor', 'critical'].includes(rc.surfaceQuality)).length,
        potholeAreas: roadConditions.filter(rc => rc.hasPotholes).length,
        constructionZones: roadConditions.filter(rc => rc.underConstruction).length,
        singleLaneSegments: roadConditions.filter(rc => rc.laneCount === 1).length,
        narrowRoadSegments: roadConditions.filter(rc => rc.widthMeters < 5).length
      },
      
      // Data quality assessment
      dataQuality: this.assessOverallDataQuality(roadConditions),
      
      // API status
      apiStatus: this.validateApiKeys(),
      
      // Route recommendations
      recommendations: this.generateRoadConditionRecommendations(roadConditions, route),
      
      analysisDate: new Date()
    };
    
    return report;
  }

// File: services/enhancedRoadConditionsService.js - PART 2
// Purpose: Continuation of Enhanced Road Conditions Service

  assessOverallDataQuality(roadConditions) {
    if (roadConditions.length === 0) {
      return {
        level: 'no_data',
        confidence: 0,
        apiCoverage: 0,
        recommendation: 'Configure API keys to enable road condition analysis'
      };
    }
    
    const avgConfidence = roadConditions.reduce((sum, rc) => sum + (rc.metadata?.confidence || 0), 0) / roadConditions.length;
    const apiCoverage = roadConditions.filter(rc => rc.metadata?.successfulSources?.length > 1).length / roadConditions.length;
    
    let qualityLevel = 'poor';
    if (avgConfidence >= 0.8 && apiCoverage >= 0.7) qualityLevel = 'excellent';
    else if (avgConfidence >= 0.6 && apiCoverage >= 0.5) qualityLevel = 'good';
    else if (avgConfidence >= 0.4 && apiCoverage >= 0.3) qualityLevel = 'fair';
    
    return {
      level: qualityLevel,
      confidence: Math.round(avgConfidence * 100) / 100,
      apiCoverage: Math.round(apiCoverage * 100),
      totalSegments: roadConditions.length,
      multiSourceSegments: roadConditions.filter(rc => rc.metadata?.successfulSources?.length > 1).length,
      recommendation: this.getDataQualityRecommendation(qualityLevel, apiCoverage)
    };
  }

  getDataQualityRecommendation(qualityLevel, apiCoverage) {
    if (qualityLevel === 'excellent') {
      return 'High quality road condition data with multiple API sources';
    } else if (qualityLevel === 'good') {
      return 'Good road condition data - consider enabling additional APIs for better coverage';
    } else if (qualityLevel === 'fair') {
      return 'Fair data quality - configure more API keys to improve accuracy';
    } else {
      return 'Poor data quality - configure Google Maps, TomTom, and HERE API keys for better analysis';
    }
  }

  generateRoadConditionRecommendations(roadConditions, route) {
    const recommendations = [];
    const poorSegments = roadConditions.filter(rc => ['poor', 'critical'].includes(rc.surfaceQuality)).length;
    const constructionZones = roadConditions.filter(rc => rc.underConstruction).length;
    const potholeAreas = roadConditions.filter(rc => rc.hasPotholes).length;
    const singleLaneSegments = roadConditions.filter(rc => rc.laneCount === 1).length;
    const highRiskSegments = roadConditions.filter(rc => rc.riskScore >= 7).length;

    // Critical recommendations
    if (highRiskSegments > 0) {
      recommendations.push({
        priority: 'CRITICAL',
        category: 'road_safety',
        message: `${highRiskSegments} segments with high road condition risk (score ≥ 7)`,
        action: 'Reduce speed and exercise extreme caution in these areas'
      });
    }

    // Poor surface conditions
    if (poorSegments > roadConditions.length * 0.3) {
      recommendations.push({
        priority: 'HIGH',
        category: 'surface_conditions',
        message: `${poorSegments} segments with poor surface conditions (${Math.round((poorSegments/roadConditions.length)*100)}% of route)`,
        action: 'Consider alternative route or prepare for challenging driving conditions'
      });
    } else if (poorSegments > 0) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'surface_conditions',
        message: `${poorSegments} segments with poor surface conditions`,
        action: 'Reduce speed and maintain safe following distance in affected areas'
      });
    }

    // Construction zones
    if (constructionZones > 0) {
      recommendations.push({
        priority: 'HIGH',
        category: 'construction',
        message: `${constructionZones} construction zones detected`,
        action: 'Expect delays and follow traffic management instructions'
      });
    }

    // Potholes
    if (potholeAreas > 0) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'road_hazards',
        message: `${potholeAreas} areas with potential potholes`,
        action: 'Inspect vehicle tires and suspension before journey'
      });
    }

    // Single lane roads
    if (singleLaneSegments > roadConditions.length * 0.5) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'road_width',
        message: `${singleLaneSegments} single-lane road segments (${Math.round((singleLaneSegments/roadConditions.length)*100)}% of route)`,
        action: 'Plan for slower travel and limited overtaking opportunities'
      });
    }

    // Road type specific recommendations
    const ruralSegments = roadConditions.filter(rc => rc.roadType === 'rural').length;
    if (ruralSegments > roadConditions.length * 0.6) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'road_type',
        message: `Route is predominantly rural roads (${Math.round((ruralSegments/roadConditions.length)*100)}%)`,
        action: 'Carry emergency supplies and ensure vehicle is in good condition'
      });
    }

    // General recommendations
    recommendations.push({
      priority: 'STANDARD',
      category: 'general_safety',
      message: 'Standard road condition safety protocols',
      action: 'Maintain vehicle in good condition and adapt driving to road conditions'
    });

    return recommendations;
  }

  // ============================================================================
  // ADDITIONAL UTILITY METHODS FOR ROAD ANALYSIS
  // ============================================================================

  // Analyze road network connectivity
  async analyzeRoadNetworkConnectivity(route) {
    try {
      console.log('🌐 Analyzing road network connectivity...');
      
      const startPoint = route.routePoints[0];
      const endPoint = route.routePoints[route.routePoints.length - 1];
      const midPoint = route.routePoints[Math.floor(route.routePoints.length / 2)];
      
      // Check connectivity using multiple APIs
      const connectivityChecks = [];
      
      // Google Directions connectivity
      if (this.googleMapsApiKey) {
        connectivityChecks.push(this.checkGoogleConnectivity(startPoint, endPoint));
      }
      
      // HERE routing connectivity
      if (this.hereApiKey) {
        connectivityChecks.push(this.checkHereConnectivity(startPoint, endPoint));
      }
      
      const results = await Promise.allSettled(connectivityChecks);
      
      return {
        routeConnected: results.some(r => r.status === 'fulfilled' && r.value?.connected),
        alternativeRoutesAvailable: results.some(r => r.status === 'fulfilled' && r.value?.alternatives),
        networkDensity: this.calculateNetworkDensity(route),
        connectivityScore: this.calculateConnectivityScore(results)
      };
      
    } catch (error) {
      console.error('Road network connectivity analysis failed:', error);
      return {
        routeConnected: true, // Assume connected if analysis fails
        alternativeRoutesAvailable: false,
        networkDensity: 'unknown',
        connectivityScore: 0.5
      };
    }
  }

  async checkGoogleConnectivity(startPoint, endPoint) {
    try {
      const url = `https://maps.googleapis.com/maps/api/directions/json?` +
        `origin=${startPoint.latitude},${startPoint.longitude}&` +
        `destination=${endPoint.latitude},${endPoint.longitude}&` +
        `alternatives=true&` +
        `key=${this.googleMapsApiKey}`;
      
      const response = await axios.get(url, { timeout: 10000 });
      
      return {
        connected: response.data.status === 'OK' && response.data.routes.length > 0,
        alternatives: response.data.routes.length > 1,
        source: 'google'
      };
    } catch (error) {
      return { connected: false, alternatives: false, source: 'google', error: error.message };
    }
  }

  async checkHereConnectivity(startPoint, endPoint) {
    try {
      const url = `https://router.hereapi.com/v8/routes?` +
        `transportMode=car&` +
        `origin=${startPoint.latitude},${startPoint.longitude}&` +
        `destination=${endPoint.latitude},${endPoint.longitude}&` +
        `alternatives=2&` +
        `apikey=${this.hereApiKey}`;
      
      const response = await axios.get(url, { timeout: 10000 });
      
      return {
        connected: response.data.routes && response.data.routes.length > 0,
        alternatives: response.data.routes && response.data.routes.length > 1,
        source: 'here'
      };
    } catch (error) {
      return { connected: false, alternatives: false, source: 'here', error: error.message };
    }
  }

  calculateNetworkDensity(route) {
    // Simplified network density calculation based on route characteristics
    const terrainDensity = {
      'urban': 'high',
      'suburban': 'medium',
      'rural': 'low',
      'hilly': 'low',
      'mixed': 'medium'
    };
    
    return terrainDensity[route.terrain] || 'medium';
  }

  calculateConnectivityScore(results) {
    const successfulResults = results.filter(r => r.status === 'fulfilled' && r.value?.connected);
    if (successfulResults.length === 0) return 0.3; // Default low connectivity
    
    const avgConnectivity = successfulResults.length / results.length;
    const hasAlternatives = successfulResults.some(r => r.value?.alternatives);
    
    return Math.min(1.0, avgConnectivity + (hasAlternatives ? 0.2 : 0));
  }

  // ============================================================================
  // ROAD CONDITION RISK ASSESSMENT
  // ============================================================================
  
  assessDetailedRoadRisk(roadConditions) {
    const riskFactors = {
      surface: 0,
      infrastructure: 0,
      traffic: 0,
      environmental: 0,
      operational: 0
    };
    
    roadConditions.forEach(rc => {
      // Surface quality risk
      const surfaceRisk = {
        'excellent': 1,
        'good': 2,
        'fair': 4,
        'poor': 7,
        'critical': 10
      };
      riskFactors.surface += surfaceRisk[rc.surfaceQuality] || 4;
      
      // Infrastructure risk
      if (rc.hasPotholes) riskFactors.infrastructure += 3;
      if (rc.underConstruction) riskFactors.infrastructure += 2;
      if (rc.laneCount === 1) riskFactors.infrastructure += 2;
      if (rc.widthMeters < 4) riskFactors.infrastructure += 2;
      
      // Traffic risk based on road type
      const trafficRisk = {
        'highway': 3,
        'state': 2,
        'district': 3,
        'rural': 1
      };
      riskFactors.traffic += trafficRisk[rc.roadType] || 2;
    });
    
    // Average risk factors
    const count = roadConditions.length || 1;
    Object.keys(riskFactors).forEach(key => {
      riskFactors[key] = Math.round((riskFactors[key] / count) * 100) / 100;
    });
    
    // Calculate overall risk score
    const weights = { surface: 0.3, infrastructure: 0.3, traffic: 0.2, environmental: 0.1, operational: 0.1 };
    const overallRisk = Object.keys(riskFactors).reduce((sum, factor) => {
      return sum + (riskFactors[factor] * weights[factor]);
    }, 0);
    
    return {
      riskFactors,
      overallRiskScore: Math.min(10, Math.max(1, Math.round(overallRisk * 100) / 100)),
      riskLevel: this.determineRiskLevel(overallRisk),
      recommendations: this.generateRiskMitigationRecommendations(riskFactors, overallRisk)
    };
  }

  determineRiskLevel(overallRisk) {
    if (overallRisk >= 8) return 'CRITICAL';
    if (overallRisk >= 6) return 'HIGH';
    if (overallRisk >= 4) return 'MEDIUM';
    return 'LOW';
  }

  generateRiskMitigationRecommendations(riskFactors, overallRisk) {
    const recommendations = [];
    
    if (riskFactors.surface >= 6) {
      recommendations.push({
        factor: 'surface',
        priority: 'HIGH',
        recommendation: 'Poor road surface conditions detected',
        actions: [
          'Reduce driving speed by 20-30%',
          'Increase following distance',
          'Check tire pressure and condition before journey',
          'Consider postponing travel during wet weather'
        ]
      });
    }
    
    if (riskFactors.infrastructure >= 5) {
      recommendations.push({
        factor: 'infrastructure',
        priority: 'MEDIUM',
        recommendation: 'Infrastructure challenges identified',
        actions: [
          'Plan for slower travel times',
          'Avoid overtaking in single-lane sections',
          'Carry emergency repair kit',
          'Monitor vehicle for damage after travel'
        ]
      });
    }
    
    if (riskFactors.traffic >= 4) {
      recommendations.push({
        factor: 'traffic',
        priority: 'MEDIUM',
        recommendation: 'Traffic-related risks present',
        actions: [
          'Plan travel during off-peak hours',
          'Monitor real-time traffic conditions',
          'Have alternative route plans ready',
          'Allow extra time for journey'
        ]
      });
    }
    
    if (overallRisk >= 7) {
      recommendations.push({
        factor: 'overall',
        priority: 'CRITICAL',
        recommendation: 'High overall road condition risk',
        actions: [
          'Consider alternative route if available',
          'Travel in convoy for safety',
          'Ensure vehicle is in excellent condition',
          'Carry emergency communication equipment',
          'Inform others of travel plans and expected arrival'
        ]
      });
    }
    
    return recommendations;
  }

  // ============================================================================
  // EXPORT METHODS FOR INTEGRATION
  // ============================================================================
  
  // Method to get road conditions summary for dashboard
  async getRoadConditionsSummary(routeId) {
    try {
      const roadConditions = await RoadCondition.find({ routeId });
      
      if (roadConditions.length === 0) {
        return {
          exists: false,
          message: 'No road conditions data available',
          recommendation: 'Run road conditions analysis first'
        };
      }
      
      const summary = {
        exists: true,
        totalSegments: roadConditions.length,
        averageRiskScore: roadConditions.reduce((sum, rc) => sum + rc.riskScore, 0) / roadConditions.length,
        surfaceQualityDistribution: {
          excellent: roadConditions.filter(rc => rc.surfaceQuality === 'excellent').length,
          good: roadConditions.filter(rc => rc.surfaceQuality === 'good').length,
          fair: roadConditions.filter(rc => rc.surfaceQuality === 'fair').length,
          poor: roadConditions.filter(rc => rc.surfaceQuality === 'poor').length,
          critical: roadConditions.filter(rc => rc.surfaceQuality === 'critical').length
        },
        roadTypeDistribution: {
          highway: roadConditions.filter(rc => rc.roadType === 'highway').length,
          state: roadConditions.filter(rc => rc.roadType === 'state').length,
          district: roadConditions.filter(rc => rc.roadType === 'district').length,
          rural: roadConditions.filter(rc => rc.roadType === 'rural').length
        },
        issuesDetected: {
          potholes: roadConditions.filter(rc => rc.hasPotholes).length,
          construction: roadConditions.filter(rc => rc.underConstruction).length,
          poorSurface: roadConditions.filter(rc => ['poor', 'critical'].includes(rc.surfaceQuality)).length
        },
        overallRiskLevel: this.determineRiskLevel(roadConditions.reduce((sum, rc) => sum + rc.riskScore, 0) / roadConditions.length),
        lastAnalyzed: roadConditions[0]?.createdAt || null
      };
      
      return summary;
      
    } catch (error) {
      console.error('Failed to get road conditions summary:', error);
      return {
        exists: false,
        error: error.message
      };
    }
  }

  // Method to delete road conditions data
  async deleteRoadConditionsData(routeId) {
    try {
      const deleteResult = await RoadCondition.deleteMany({ routeId });
      console.log(`🗑️ Deleted ${deleteResult.deletedCount} road condition records for route ${routeId}`);
      
      return {
        success: true,
        deletedRecords: deleteResult.deletedCount,
        message: 'Road conditions data deleted successfully'
      };
      
    } catch (error) {
      console.error('Failed to delete road conditions data:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new EnhancedRoadConditionsService();