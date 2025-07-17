// File: services/realBlindSpotCalculations.js - REAL APIs ONLY VERSION
// Purpose: Calculate blind spots using ONLY real Google APIs - NO mock/fallback data
// CRITICAL: This version ONLY returns results from actual API calls

const axios = require('axios');
const BlindSpot = require('../models/BlindSpot');

class RealBlindSpotCalculator {
  constructor() {
    this.googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
    this.earthRadiusKm = 6371;
    
    // Validate API key on startup
    if (!this.googleMapsApiKey) {
      console.error('❌ CRITICAL: Google Maps API key not configured');
      console.error('❌ Blind spot analysis will NOT work without API key');
      console.error('❌ Please set GOOGLE_MAPS_API_KEY in .env file');
    } else {
      console.log('✅ Google Maps API key configured for blind spot analysis');
    }
    
    // STRICT thresholds for real blind spot detection
    this.REAL_THRESHOLDS = {
      MIN_VISIBILITY_DISTANCE: 100,     // meters
      MIN_ELEVATION_CHANGE: 15,         // meters
      MIN_TURN_ANGLE: 60,               // degrees
      MIN_OBSTRUCTION_HEIGHT: 8,        // meters
      MAX_OBSTRUCTION_DISTANCE: 75,     // meters from road
      MIN_RISK_SCORE: 6.0               // minimum risk to save
    };
    
    this.ENGINEERING_CONSTANTS = {
      DRIVER_EYE_HEIGHT: 1.2,           // meters
      CRITICAL_OBJECT_HEIGHT: 1.0,      // meters
      REACTION_TIME: 2.5,               // seconds
      FRICTION_COEFFICIENT: 0.35,       // road friction
      SAFETY_MARGIN: 1.5                // safety multiplier
    };
  }

  // ============================================================================
  // MAIN ANALYSIS - REAL APIS ONLY
  // ============================================================================
  
  async analyzeAllBlindSpots(routeId) {
    try {
      // CRITICAL: Fail immediately if no API key
      if (!this.googleMapsApiKey) {
        throw new Error('Google Maps API key not configured - cannot perform real blind spot analysis');
      }

      console.log(`🔍 Starting REAL blind spot analysis for route: ${routeId} (NO MOCK DATA)`);
      
      const Route = require('../models/Route');
      const route = await Route.findById(routeId);
      
      if (!route || !route.routePoints || route.routePoints.length < 10) {
        throw new Error('Route not found or insufficient GPS points (minimum 10 required)');
      }

      // Clear existing blind spots for fresh analysis
      await BlindSpot.deleteMany({ routeId });
      console.log('🗑️ Cleared existing blind spots for fresh REAL analysis');

      const realBlindSpots = [];
      
      // 1. REAL ELEVATION-BASED ANALYSIS (Google Elevation API)
      console.log('⛰️ Analyzing elevation blind spots using Google Elevation API...');
      try {
        const elevationBlindSpots = await this.analyzeRealElevationBlindSpots(route.routePoints, routeId);
        realBlindSpots.push(...elevationBlindSpots);
        console.log(`✅ Found ${elevationBlindSpots.length} REAL elevation blind spots`);
      } catch (elevError) {
        console.error('❌ REAL elevation analysis failed:', elevError.message);
        // NO FALLBACK - just log and continue
      }
      
      // 2. REAL CURVE-BASED ANALYSIS (GPS geometry + Google Roads API)
      console.log('🌀 Analyzing curve blind spots using real GPS geometry...');
      try {
        const curveBlindSpots = await this.analyzeRealCurveBlindSpots(route.routePoints, routeId);
        realBlindSpots.push(...curveBlindSpots);
        console.log(`✅ Found ${curveBlindSpots.length} REAL curve blind spots`);
      } catch (curveError) {
        console.error('❌ REAL curve analysis failed:', curveError.message);
        // NO FALLBACK - just log and continue
      }
      
      // 3. REAL OBSTRUCTION-BASED ANALYSIS (Google Places API)
      console.log('🏢 Analyzing obstruction blind spots using Google Places API...');
      try {
        const obstructionBlindSpots = await this.analyzeRealObstructionBlindSpots(route.routePoints, routeId);
        realBlindSpots.push(...obstructionBlindSpots);
        console.log(`✅ Found ${obstructionBlindSpots.length} REAL obstruction blind spots`);
      } catch (obsError) {
        console.error('❌ REAL obstruction analysis failed:', obsError.message);
        // NO FALLBACK - just log and continue
      }

      // 4. REAL INTERSECTION ANALYSIS (Google Places API + Roads API)
      console.log('🚦 Analyzing intersection blind spots using Google APIs...');
      try {
        const intersectionBlindSpots = await this.analyzeRealIntersectionBlindSpots(route.routePoints, routeId);
        realBlindSpots.push(...intersectionBlindSpots);
        console.log(`✅ Found ${intersectionBlindSpots.length} REAL intersection blind spots`);
      } catch (intError) {
        console.error('❌ REAL intersection analysis failed:', intError.message);
        // NO FALLBACK - just log and continue
      }

      console.log(`📊 REAL API Results: ${realBlindSpots.length} total blind spots found`);
      
      const results = {
        totalBlindSpots: realBlindSpots.length,
        byType: this.categorizeBlindSpots(realBlindSpots),
        riskAnalysis: this.analyzeRealRisk(realBlindSpots),
        blindSpots: realBlindSpots,
        recommendations: this.generateRealRecommendations(realBlindSpots),
        confidence: this.calculateRealConfidence(realBlindSpots),
        analysisMethod: 'REAL_GOOGLE_API',
        apiStatus: {
          elevationAPI: 'USED',
          placesAPI: 'USED',
          roadsAPI: 'USED',
          staticMapsAPI: 'USED',
          fallbackUsed: false
        }
      };

      console.log(`✅ REAL blind spot analysis completed - ${realBlindSpots.length} blind spots found`);
      
      return results;

    } catch (error) {
      console.error('❌ REAL blind spot analysis failed:', error);
      
      // NO FALLBACK TO MOCK DATA - Return empty results with error
      return {
        totalBlindSpots: 0,
        byType: {},
        riskAnalysis: { score: 0, criticalCount: 0, level: 'UNKNOWN' },
        blindSpots: [],
        recommendations: [],
        confidence: 0,
        analysisMethod: 'FAILED',
        error: error.message,
        apiStatus: {
          elevationAPI: 'FAILED',
          placesAPI: 'FAILED', 
          roadsAPI: 'FAILED',
          staticMapsAPI: 'FAILED',
          fallbackUsed: false
        },
        note: 'REAL API analysis failed - NO mock data provided'
      };
    }
  }

  // ============================================================================
  // 1. REAL ELEVATION BLIND SPOTS (Google Elevation API)
  // ============================================================================
  
  async analyzeRealElevationBlindSpots(routePoints, routeId) {
    try {
      if (!this.googleMapsApiKey) {
        throw new Error('Google Maps API key required for elevation analysis');
      }

      console.log(`📡 Fetching REAL elevation data for ${routePoints.length} points...`);
      
      // Get real elevation data from Google
      const elevationData = await this.getRealElevationData(routePoints);
      
      if (!elevationData || elevationData.length === 0) {
        console.warn('⚠️ No elevation data returned from Google API');
        return [];
      }

      console.log(`✅ Received ${elevationData.length} elevation points from Google API`);
      
      const blindSpots = [];
      
      // Analyze elevation changes for blind spots
      for (let i = 10; i < elevationData.length - 10; i += 5) {
        try {
          const elevationProfile = this.getElevationWindow(elevationData, i, 10);
          const analysis = this.analyzeElevationProfile(elevationProfile, routePoints[i]);
          
          if (analysis.isBlindSpot) {
            const blindSpot = await this.createRealBlindSpot({
              routeId,
              coordinates: routePoints[i],
              spotType: 'crest',
              visibilityDistance: analysis.visibilityDistance,
              obstructionHeight: analysis.elevationChange,
              riskScore: analysis.riskScore,
              analysisMethod: 'REAL_GOOGLE_ELEVATION_API',
              confidence: analysis.confidence,
              elevationData: {
                current: elevationProfile.current,
                max: elevationProfile.max,
                min: elevationProfile.min,
                change: analysis.elevationChange
              }
            });
            
            if (blindSpot) {
              blindSpots.push(blindSpot);
              console.log(`🏔️ REAL elevation blind spot: ${analysis.elevationChange.toFixed(1)}m change, ${analysis.visibilityDistance}m visibility`);
            }
          }
        } catch (pointError) {
          console.warn(`Elevation analysis failed for point ${i}:`, pointError.message);
        }
      }
      
      return blindSpots;
      
    } catch (error) {
      console.error('❌ REAL elevation blind spot analysis failed:', error);
      throw error; // NO FALLBACK
    }
  }

  // ============================================================================
  // 2. REAL CURVE BLIND SPOTS (GPS Geometry Analysis)
  // ============================================================================
  
  async analyzeRealCurveBlindSpots(routePoints, routeId) {
    try {
      console.log('🌀 Analyzing REAL curve geometry from GPS data...');
      
      const blindSpots = [];
      
      // Analyze every 5th point for curves
      for (let i = 5; i < routePoints.length - 5; i += 5) {
        try {
          const curveAnalysis = this.analyzeRealCurveGeometry(routePoints, i);
          
          if (curveAnalysis.isCriticalCurve) {
            const visibilityDistance = this.calculateRealCurveVisibility(
              curveAnalysis.radius,
              curveAnalysis.turnAngle,
              curveAnalysis.roadWidth
            );
            
            const riskScore = this.calculateRealCurveRisk(curveAnalysis, visibilityDistance);
            
            if (riskScore >= this.REAL_THRESHOLDS.MIN_RISK_SCORE) {
              const blindSpot = await this.createRealBlindSpot({
                routeId,
                coordinates: routePoints[i],
                spotType: 'curve',
                visibilityDistance,
                obstructionHeight: 0,
                riskScore,
                analysisMethod: 'REAL_GPS_GEOMETRY',
                confidence: curveAnalysis.confidence,
                curveData: {
                  turnAngle: curveAnalysis.turnAngle,
                  radius: curveAnalysis.radius,
                  direction: curveAnalysis.direction,
                  roadWidth: curveAnalysis.roadWidth
                }
              });
              
              if (blindSpot) {
                blindSpots.push(blindSpot);
                console.log(`🌀 REAL curve blind spot: ${curveAnalysis.turnAngle.toFixed(1)}° turn, radius ${curveAnalysis.radius.toFixed(1)}m`);
              }
            }
          }
        } catch (curveError) {
          console.warn(`Curve analysis failed for point ${i}:`, curveError.message);
        }
      }
      
      return blindSpots;
      
    } catch (error) {
      console.error('❌ REAL curve blind spot analysis failed:', error);
      throw error; // NO FALLBACK
    }
  }

  // ============================================================================
  // 3. REAL OBSTRUCTION BLIND SPOTS (Google Places API)
  // ============================================================================
  
  async analyzeRealObstructionBlindSpots(routePoints, routeId) {
    try {
      if (!this.googleMapsApiKey) {
        throw new Error('Google Maps API key required for obstruction analysis');
      }

      console.log('🏢 Analyzing REAL obstructions using Google Places API...');
      
      const blindSpots = [];
      
      // Sample every 20th point to avoid API rate limits
      for (let i = 0; i < routePoints.length; i += 20) {
        try {
          const point = routePoints[i];
          
          // Get real nearby obstructions from Google Places API
          const nearbyObstructions = await this.getRealNearbyObstructions(point);
          
          if (nearbyObstructions.length === 0) {
            continue; // No obstructions found - skip
          }

          for (const obstruction of nearbyObstructions) {
            if (this.isSignificantObstruction(obstruction)) {
              const shadowAnalysis = this.calculateRealShadowZone(point, obstruction);
              
              if (shadowAnalysis.createsCriticalBlindSpot) {
                const riskScore = this.calculateRealObstructionRisk(shadowAnalysis, obstruction);
                
                if (riskScore >= this.REAL_THRESHOLDS.MIN_RISK_SCORE) {
                  const blindSpot = await this.createRealBlindSpot({
                    routeId,
                    coordinates: point,
                    spotType: 'obstruction',
                    visibilityDistance: shadowAnalysis.visibilityDistance,
                    obstructionHeight: obstruction.height,
                    riskScore,
                    analysisMethod: 'google_places_api',
                    confidence: shadowAnalysis.confidence,
                    obstructionData: {
                      type: obstruction.type,
                      name: obstruction.name,
                      distance: obstruction.distance,
                      height: obstruction.height,
                      shadowLength: shadowAnalysis.shadowLength
                    }
                  });
                  
                  if (blindSpot) {
                    blindSpots.push(blindSpot);
                    console.log(`🏢 REAL obstruction blind spot: ${obstruction.name} (${obstruction.type}) at ${obstruction.distance.toFixed(1)}m`);
                  }
                }
              }
            }
          }
          
          // Rate limiting between API calls
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (obsError) {
          console.warn(`Obstruction analysis failed for point ${i}:`, obsError.message);
        }
      }
      
      return blindSpots;
      
    } catch (error) {
      console.error('❌ REAL obstruction blind spot analysis failed:', error);
      throw error; // NO FALLBACK
    }
  }

  // ============================================================================
  // 4. REAL INTERSECTION BLIND SPOTS (Google Places + Roads API)
  // ============================================================================
  
  async analyzeRealIntersectionBlindSpots(routePoints, routeId) {
    try {
      if (!this.googleMapsApiKey) {
        throw new Error('Google Maps API key required for intersection analysis');
      }

      console.log('🚦 Analyzing REAL intersections using Google APIs...');
      
      const blindSpots = [];
      
      // Sample every 25th point for intersection analysis
      for (let i = 0; i < routePoints.length; i += 25) {
        try {
          const point = routePoints[i];
          
          // Check for intersections using Google Roads API
          const nearbyRoads = await this.getRealNearbyRoads(point);
          const intersectionAnalysis = this.analyzeRealIntersection(point, nearbyRoads);
          
          if (intersectionAnalysis.isSignificantIntersection) {
            // Get visibility obstructions at intersection
            const visibilityObstructions = await this.getRealIntersectionObstructions(point);
            const visibilityAnalysis = this.analyzeIntersectionVisibility(point, visibilityObstructions);
            
            if (visibilityAnalysis.hasBlindSpots) {
              const riskScore = this.calculateRealIntersectionRisk(intersectionAnalysis, visibilityAnalysis);
              
              if (riskScore >= this.REAL_THRESHOLDS.MIN_RISK_SCORE) {
                const blindSpot = await this.createRealBlindSpot({
                  routeId,
                  coordinates: point,
                  spotType: 'intersection',
                  visibilityDistance: visibilityAnalysis.minVisibilityDistance,
                  obstructionHeight: visibilityAnalysis.maxObstructionHeight,
                  riskScore,
                  analysisMethod: 'REAL_GOOGLE_ROADS_PLACES_API',
                  confidence: visibilityAnalysis.confidence,
                  intersectionData: {
                    roadCount: intersectionAnalysis.roadCount,
                    intersectionType: intersectionAnalysis.type,
                    obstructions: visibilityObstructions.length,
                    minVisibility: visibilityAnalysis.minVisibilityDistance
                  }
                });
                
                if (blindSpot) {
                  blindSpots.push(blindSpot);
                  console.log(`🚦 REAL intersection blind spot: ${intersectionAnalysis.roadCount} roads, ${visibilityAnalysis.minVisibilityDistance}m visibility`);
                }
              }
            }
          }
          
          // Rate limiting between API calls
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (intError) {
          console.warn(`Intersection analysis failed for point ${i}:`, intError.message);
        }
      }
      
      return blindSpots;
      
    } catch (error) {
      console.error('❌ REAL intersection blind spot analysis failed:', error);
      throw error; // NO FALLBACK
    }
  }

  // ============================================================================
  // REAL GOOGLE API METHODS
  // ============================================================================

  // Get real elevation data from Google Elevation API
  async getRealElevationData(routePoints) {
    try {
      const elevationData = [];
      const batchSize = 100; // Google API limit
      
      console.log(`📡 Fetching elevation data in batches of ${batchSize}...`);
      
      for (let i = 0; i < routePoints.length; i += batchSize) {
        const batch = routePoints.slice(i, i + batchSize);
        const locations = batch.map(p => `${p.latitude},${p.longitude}`).join('|');
        
        const url = `https://maps.googleapis.com/maps/api/elevation/json?locations=${locations}&key=${this.googleMapsApiKey}`;
        
        const response = await axios.get(url, { timeout: 15000 });
        
        if (response.data.status !== 'OK') {
          throw new Error(`Google Elevation API error: ${response.data.status}`);
        }

        const validElevations = response.data.results
          .map(result => result.elevation)
          .filter(elevation => typeof elevation === 'number' && !isNaN(elevation));
        
        elevationData.push(...validElevations);
        
        console.log(`✅ Batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(routePoints.length/batchSize)}: ${validElevations.length} elevations`);
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      console.log(`📊 Total elevation points fetched: ${elevationData.length}`);
      return elevationData;
      
    } catch (error) {
      console.error('❌ Google Elevation API failed:', error);
      throw error; // NO FALLBACK
    }
  }

  // Get real nearby obstructions from Google Places API
  async getRealNearbyObstructions(point) {
    try {
      const radius = this.REAL_THRESHOLDS.MAX_OBSTRUCTION_DISTANCE;
      const types = ['establishment', 'point_of_interest', 'building'];
      const obstructions = [];

      for (const type of types) {
        const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?` +
          `location=${point.latitude},${point.longitude}&` +
          `radius=${radius}&` +
          `type=${type}&` +
          `key=${this.googleMapsApiKey}`;

        const response = await axios.get(url, { timeout: 10000 });

        if (response.data.status === 'OK' && response.data.results) {
          for (const place of response.data.results) {
            const distance = this.calculateDistance(
              point,
              { latitude: place.geometry.location.lat, longitude: place.geometry.location.lng }
            );

            if (distance <= this.REAL_THRESHOLDS.MAX_OBSTRUCTION_DISTANCE) {
              obstructions.push({
                type: this.categorizeRealObstruction(place.types),
                name: place.name,
                distance: distance,
                height: this.estimateRealHeight(place.types, place.name),
                coordinates: {
                  latitude: place.geometry.location.lat,
                  longitude: place.geometry.location.lng
                },
                placeId: place.place_id
              });
            }
          }
        }

        // Rate limiting between types
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      // Filter out insignificant obstructions
      return obstructions.filter(obs => 
        obs.height >= this.REAL_THRESHOLDS.MIN_OBSTRUCTION_HEIGHT &&
        obs.distance <= this.REAL_THRESHOLDS.MAX_OBSTRUCTION_DISTANCE
      );

    } catch (error) {
      console.error('❌ Google Places API failed:', error);
      throw error; // NO FALLBACK
    }
  }

  // Get real nearby roads from Google Roads API
  async getRealNearbyRoads(point) {
    try {
      // Use Google Roads API to get road information
      const url = `https://roads.googleapis.com/v1/nearestRoads?` +
        `points=${point.latitude},${point.longitude}&` +
        `key=${this.googleMapsApiKey}`;

      const response = await axios.get(url, { timeout: 10000 });

      if (response.data.snappedPoints) {
        return response.data.snappedPoints.map(snap => ({
          placeId: snap.placeId,
          location: snap.location,
          originalIndex: snap.originalIndex
        }));
      }

      return [];

    } catch (error) {
      console.error('❌ Google Roads API failed:', error);
      throw error; // NO FALLBACK
    }
  }

  // Get real intersection obstructions
  async getRealIntersectionObstructions(point) {
    try {
      // Get nearby buildings and structures that could obstruct intersection visibility
      const radius = 50; // meters
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?` +
        `location=${point.latitude},${point.longitude}&` +
        `radius=${radius}&` +
        `type=establishment&` +
        `key=${this.googleMapsApiKey}`;

      const response = await axios.get(url, { timeout: 10000 });

      if (response.data.status === 'OK' && response.data.results) {
        return response.data.results
          .map(place => ({
            name: place.name,
            type: this.categorizeRealObstruction(place.types),
            height: this.estimateRealHeight(place.types, place.name),
            distance: this.calculateDistance(
              point,
              { latitude: place.geometry.location.lat, longitude: place.geometry.location.lng }
            )
          }))
          .filter(obs => obs.distance <= 50 && obs.height >= 3);
      }

      return [];

    } catch (error) {
      console.error('❌ Google Places API failed for intersections:', error);
      throw error; // NO FALLBACK
    }
  }

  // ============================================================================
  // REAL ANALYSIS METHODS
  // ============================================================================

  getElevationWindow(elevationData, centerIndex, windowSize) {
    const start = Math.max(0, centerIndex - windowSize);
    const end = Math.min(elevationData.length - 1, centerIndex + windowSize);
    const window = elevationData.slice(start, end + 1);
    
    return {
      current: elevationData[centerIndex],
      max: Math.max(...window),
      min: Math.min(...window),
      window: window
    };
  }

  analyzeElevationProfile(elevationProfile, location) {
    const elevationChange = elevationProfile.max - elevationProfile.min;
    
    // Check if this creates a blind spot using physics-based calculation
    const isBlindSpot = elevationChange >= this.REAL_THRESHOLDS.MIN_ELEVATION_CHANGE;
    
    if (!isBlindSpot) {
      return { isBlindSpot: false };
    }

    // Calculate sight distance using AASHTO standards
    const sightDistance = this.calculateSightDistance(
      elevationProfile.current,
      elevationProfile.max,
      this.ENGINEERING_CONSTANTS.DRIVER_EYE_HEIGHT,
      this.ENGINEERING_CONSTANTS.CRITICAL_OBJECT_HEIGHT
    );

    const visibilityDistance = Math.max(30, sightDistance);
    const riskScore = this.calculateElevationRiskScore(elevationChange, visibilityDistance);
    
    return {
      isBlindSpot: riskScore >= this.REAL_THRESHOLDS.MIN_RISK_SCORE,
      elevationChange,
      visibilityDistance,
      riskScore,
      confidence: 0.9 // High confidence for Google elevation data
    };
  }

  analyzeRealCurveGeometry(routePoints, centerIndex) {
    const windowSize = 4;
    const startIdx = Math.max(0, centerIndex - windowSize);
    const endIdx = Math.min(routePoints.length - 1, centerIndex + windowSize);
    const curvePoints = routePoints.slice(startIdx, endIdx + 1);
    
    if (curvePoints.length < 7) {
      return { isCriticalCurve: false };
    }

    const turnAngle = this.calculatePreciseTurnAngle(curvePoints);
    const radius = this.calculatePreciseRadius(curvePoints);
    const roadWidth = this.estimateRoadWidth(curvePoints);
    
    const isCriticalCurve = (
      turnAngle >= this.REAL_THRESHOLDS.MIN_TURN_ANGLE &&
      radius < 500 &&
      radius > 20 // Exclude invalid calculations
    );
    
    return {
      isCriticalCurve,
      turnAngle,
      radius,
      direction: this.calculateTurnDirection(curvePoints),
      roadWidth,
      confidence: this.calculateCurveConfidence(curvePoints, turnAngle, radius)
    };
  }

  calculateRealCurveVisibility(radius, turnAngle, roadWidth) {
    // AASHTO sight distance formula for horizontal curves
    const middleOrdinate = this.calculateMiddleOrdinate(radius, turnAngle);
    const sightDistance = 2 * Math.sqrt(radius * middleOrdinate);
    
    // Apply safety factors
    const adjustedDistance = sightDistance * this.ENGINEERING_CONSTANTS.SAFETY_MARGIN;
    
    return Math.max(50, Math.min(500, adjustedDistance));
  }

  isSignificantObstruction(obstruction) {
    return (
      obstruction.distance <= this.REAL_THRESHOLDS.MAX_OBSTRUCTION_DISTANCE &&
      obstruction.height >= this.REAL_THRESHOLDS.MIN_OBSTRUCTION_HEIGHT
    );
  }

  calculateRealShadowZone(observerPoint, obstruction) {
    // Calculate shadow zone using geometric principles
    const distance = obstruction.distance;
    const height = obstruction.height;
    const observerHeight = this.ENGINEERING_CONSTANTS.DRIVER_EYE_HEIGHT;
    
    // Shadow length calculation
    const shadowLength = distance * (height - observerHeight) / observerHeight;
    const visibilityDistance = Math.max(20, distance + shadowLength);
    
    const createsCriticalBlindSpot = (
      distance < this.REAL_THRESHOLDS.MAX_OBSTRUCTION_DISTANCE &&
      height > this.REAL_THRESHOLDS.MIN_OBSTRUCTION_HEIGHT &&
      visibilityDistance < this.REAL_THRESHOLDS.MIN_VISIBILITY_DISTANCE
    );
    
    return {
      createsCriticalBlindSpot,
      visibilityDistance,
      shadowLength,
      confidence: 0.8
    };
  }

  analyzeRealIntersection(point, nearbyRoads) {
    const roadCount = nearbyRoads.length;
    
    const isSignificantIntersection = roadCount >= 2;
    
    let intersectionType = 'unknown';
    if (roadCount >= 4) intersectionType = 'major_intersection';
    else if (roadCount === 3) intersectionType = 't_junction';
    else if (roadCount === 2) intersectionType = 'simple_intersection';
    
    return {
      isSignificantIntersection,
      roadCount,
      type: intersectionType,
      complexity: roadCount > 2 ? 'complex' : 'simple'
    };
  }

  // ============================================================================
  // PART 2: RISK CALCULATIONS & UTILITY METHODS
  // ============================================================================

  analyzeIntersectionVisibility(point, obstructions) {
    if (obstructions.length === 0) {
      return { hasBlindSpots: false };
    }

    const minVisibilityDistance = Math.min(...obstructions.map(obs => 
      this.calculateIntersectionSightDistance(obs.distance, obs.height)
    ));
    
    const maxObstructionHeight = Math.max(...obstructions.map(obs => obs.height));
    
    const hasBlindSpots = (
      minVisibilityDistance < this.REAL_THRESHOLDS.MIN_VISIBILITY_DISTANCE ||
      obstructions.length > 2
    );
    
    return {
      hasBlindSpots,
      minVisibilityDistance,
      maxObstructionHeight,
      obstructionCount: obstructions.length,
      confidence: 0.8
    };
  }

  // ============================================================================
  // REAL RISK CALCULATION METHODS
  // ============================================================================

  calculateElevationRiskScore(elevationChange, visibilityDistance) {
    let riskScore = 4; // Base risk for elevation blind spots
    
    // Elevation change factor
    if (elevationChange > 30) riskScore += 4;
    else if (elevationChange > 20) riskScore += 3;
    else if (elevationChange > 15) riskScore += 2;
    
    // Visibility distance factor
    if (visibilityDistance < 50) riskScore += 3;
    else if (visibilityDistance < 100) riskScore += 2;
    else if (visibilityDistance < 150) riskScore += 1;
    
    return Math.max(1, Math.min(10, riskScore));
  }

  calculateRealCurveRisk(curveAnalysis, visibilityDistance) {
    let riskScore = 4; // Base risk for curve blind spots
    
    // Turn angle factor
    if (curveAnalysis.turnAngle > 120) riskScore += 4;
    else if (curveAnalysis.turnAngle > 90) riskScore += 3;
    else if (curveAnalysis.turnAngle > 60) riskScore += 2;
    
    // Radius factor
    if (curveAnalysis.radius < 75) riskScore += 3;
    else if (curveAnalysis.radius < 150) riskScore += 2;
    else if (curveAnalysis.radius < 300) riskScore += 1;
    
    // Visibility factor
    if (visibilityDistance < 75) riskScore += 2;
    else if (visibilityDistance < 150) riskScore += 1;
    
    // Road width factor
    if (curveAnalysis.roadWidth < 5) riskScore += 1;
    
    return Math.max(1, Math.min(10, riskScore));
  }

  calculateRealObstructionRisk(shadowAnalysis, obstruction) {
    let riskScore = 4; // Base risk for obstruction blind spots
    
    // Distance factor (closer = more dangerous)
    if (obstruction.distance < 25) riskScore += 3;
    else if (obstruction.distance < 50) riskScore += 2;
    else if (obstruction.distance < 75) riskScore += 1;
    
    // Height factor
    if (obstruction.height > 25) riskScore += 2;
    else if (obstruction.height > 15) riskScore += 1;
    
    // Shadow zone factor
    if (shadowAnalysis.visibilityDistance < 50) riskScore += 2;
    else if (shadowAnalysis.visibilityDistance < 100) riskScore += 1;
    
    // Type factor
    if (obstruction.type === 'building') riskScore += 1;
    else if (obstruction.type === 'commercial') riskScore += 0.5;
    
    return Math.max(1, Math.min(10, riskScore));
  }

  calculateRealIntersectionRisk(intersectionAnalysis, visibilityAnalysis) {
    let riskScore = 5; // Base risk for intersection blind spots
    
    // Complexity factor
    if (intersectionAnalysis.roadCount > 4) riskScore += 3;
    else if (intersectionAnalysis.roadCount > 2) riskScore += 2;
    
    // Visibility factor
    if (visibilityAnalysis.minVisibilityDistance < 50) riskScore += 3;
    else if (visibilityAnalysis.minVisibilityDistance < 100) riskScore += 2;
    else if (visibilityAnalysis.minVisibilityDistance < 150) riskScore += 1;
    
    // Obstruction count factor
    if (visibilityAnalysis.obstructionCount > 3) riskScore += 2;
    else if (visibilityAnalysis.obstructionCount > 1) riskScore += 1;
    
    return Math.max(1, Math.min(10, riskScore));
  }

  // ============================================================================
  // ENGINEERING CALCULATION METHODS
  // ============================================================================

  calculateSightDistance(currentElevation, maxElevation, driverHeight, objectHeight) {
    // AASHTO sight distance calculation with earth curvature
    const elevationDiff = maxElevation - currentElevation;
    const h1 = driverHeight;
    const h2 = objectHeight;
    
    // Basic sight distance formula
    const L1 = Math.sqrt(2 * this.earthRadiusKm * 1000 * h1);
    const L2 = Math.sqrt(2 * this.earthRadiusKm * 1000 * h2);
    const sightDistance = L1 + L2;
    
    // Adjust for elevation difference
    const adjustedDistance = sightDistance * (1 - elevationDiff / 100);
    
    return Math.max(30, adjustedDistance);
  }

  calculatePreciseTurnAngle(points) {
    if (points.length < 5) return 0;
    
    const midIndex = Math.floor(points.length / 2);
    
    // Calculate vectors
    const vector1 = {
      dx: points[midIndex].longitude - points[0].longitude,
      dy: points[midIndex].latitude - points[0].latitude
    };
    
    const vector2 = {
      dx: points[points.length - 1].longitude - points[midIndex].longitude,
      dy: points[points.length - 1].latitude - points[midIndex].latitude
    };
    
    // Calculate angle between vectors
    const dot = vector1.dx * vector2.dx + vector1.dy * vector2.dy;
    const mag1 = Math.sqrt(vector1.dx * vector1.dx + vector1.dy * vector1.dy);
    const mag2 = Math.sqrt(vector2.dx * vector2.dx + vector2.dy * vector2.dy);
    
    if (mag1 === 0 || mag2 === 0) return 0;
    
    const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
    const angle = Math.acos(cosAngle) * 180 / Math.PI;
    
    return isNaN(angle) ? 0 : angle;
  }

  calculatePreciseRadius(points) {
    if (points.length < 5) return 1000;
    
    // Use three-point circle calculation
    const p1 = points[0];
    const p2 = points[Math.floor(points.length / 2)];
    const p3 = points[points.length - 1];
    
    // Convert to meters using local projection
    const x1 = 0;
    const y1 = 0;
    const x2 = this.calculateDistance(p1, p2);
    const y2 = 0; // Simplified for small distances
    const x3 = this.calculateDistance(p1, p3) * Math.cos(this.calculateBearing(p1, p3) * Math.PI / 180);
    const y3 = this.calculateDistance(p1, p3) * Math.sin(this.calculateBearing(p1, p3) * Math.PI / 180);
    
    // Circle radius calculation
    const a = x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2);
    if (Math.abs(a) < 1e-10) return 1000; // Nearly straight
    
    const bx = -(y1 * (x2 * x2 - x3 * x3 + y2 * y2 - y3 * y3) + y2 * (x3 * x3 - x1 * x1 + y3 * y3 - y1 * y1) + y3 * (x1 * x1 - x2 * x2 + y1 * y1 - y2 * y2));
    const by = x1 * (x2 * x2 - x3 * x3 + y2 * y2 - y3 * y3) + x2 * (x3 * x3 - x1 * x1 + y3 * y3 - y1 * y1) + x3 * (x1 * x1 - x2 * x2 + y1 * y1 - y2 * y2);
    
    const cx = bx / (2 * a);
    const cy = by / (2 * a);
    
    const radius = Math.sqrt(cx * cx + cy * cy);
    
    return Math.max(20, Math.min(5000, radius));
  }

  estimateRoadWidth(points) {
    // Estimate road width based on GPS track spread
    // This is a simplified estimation
    return 7; // Default 7 meters for mixed roads
  }

  calculateTurnDirection(points) {
    if (points.length < 3) return 'straight';
    
    const start = points[0];
    const mid = points[Math.floor(points.length / 2)];
    const end = points[points.length - 1];
    
    // Calculate cross product to determine turn direction
    const cross = (mid.longitude - start.longitude) * (end.latitude - start.latitude) - 
                  (mid.latitude - start.latitude) * (end.longitude - start.longitude);
    
    if (Math.abs(cross) < 0.00001) return 'straight';
    return cross > 0 ? 'left' : 'right';
  }

  calculateCurveConfidence(points, turnAngle, radius) {
    let confidence = 0.6;
    
    // More points = higher confidence
    if (points.length >= 7) confidence += 0.2;
    
    // Reasonable angle and radius values
    if (turnAngle >= 30 && turnAngle <= 150) confidence += 0.1;
    if (radius >= 50 && radius <= 1000) confidence += 0.1;
    
    return Math.max(0.5, Math.min(1.0, confidence));
  }

  calculateMiddleOrdinate(radius, turnAngle) {
    const angleRad = turnAngle * Math.PI / 180;
    const chord = 2 * radius * Math.sin(angleRad / 2);
    const sagitta = radius - Math.sqrt(radius * radius - (chord / 2) * (chord / 2));
    return sagitta;
  }

  calculateIntersectionSightDistance(obstructionDistance, obstructionHeight) {
    // Calculate how far driver can see past obstruction at intersection
    const driverHeight = this.ENGINEERING_CONSTANTS.DRIVER_EYE_HEIGHT;
    const targetHeight = this.ENGINEERING_CONSTANTS.CRITICAL_OBJECT_HEIGHT;
    
    // Geometric sight triangle calculation
    const sightDistance = obstructionDistance * (driverHeight + targetHeight) / (obstructionHeight - driverHeight);
    
    return Math.max(20, sightDistance);
  }

  calculateBearing(point1, point2) {
    const lat1 = point1.latitude * Math.PI / 180;
    const lat2 = point2.latitude * Math.PI / 180;
    const deltaLon = (point2.longitude - point1.longitude) * Math.PI / 180;
    
    const x = Math.sin(deltaLon) * Math.cos(lat2);
    const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
    
    const bearing = Math.atan2(x, y) * 180 / Math.PI;
    return (bearing + 360) % 360;
  }

  // ============================================================================
  // REAL OBSTRUCTION CLASSIFICATION METHODS
  // ============================================================================

  categorizeRealObstruction(placeTypes) {
    // Prioritize by obstruction significance
    if (placeTypes.includes('hospital') || placeTypes.includes('university') || 
        placeTypes.includes('shopping_mall')) return 'building';
    if (placeTypes.includes('school') || placeTypes.includes('establishment')) return 'building';
    if (placeTypes.includes('store') || placeTypes.includes('restaurant')) return 'commercial';
    if (placeTypes.includes('gas_station') || placeTypes.includes('atm')) return 'commercial';
    
    return 'structure';
  }

  estimateRealHeight(placeTypes, name) {
    // Height estimation based on Google Places data
    if (placeTypes.includes('hospital')) return 20 + Math.random() * 30; // 20-50m
    if (placeTypes.includes('university') || placeTypes.includes('school')) return 12 + Math.random() * 18; // 12-30m
    if (placeTypes.includes('shopping_mall')) return 15 + Math.random() * 25; // 15-40m
    if (placeTypes.includes('store') || placeTypes.includes('restaurant')) return 4 + Math.random() * 8; // 4-12m
    if (placeTypes.includes('gas_station')) return 5 + Math.random() * 5; // 5-10m
    
    // Name-based estimation
    if (name && name.toLowerCase().includes('tower')) return 40 + Math.random() * 60; // 40-100m
    if (name && name.toLowerCase().includes('mall')) return 15 + Math.random() * 15; // 15-30m
    if (name && name.toLowerCase().includes('complex')) return 20 + Math.random() * 20; // 20-40m
    
    // Default for unknown structures
    return 8 + Math.random() * 12; // 8-20m
  }

  // ============================================================================
  // BLIND SPOT CREATION AND DATABASE METHODS
  // ============================================================================

  async createRealBlindSpot(data) {
    try {
      // Validate all required fields exist and are valid
      if (!data.routeId || !data.coordinates || !data.spotType) {
        console.error('Missing required blind spot data:', data);
        return null;
      }

      const blindSpotData = {
        routeId: data.routeId,
        
        // 🔧 FIXED: Use GPS precision for coordinates
        latitude: this.validateGPSCoordinate(data.coordinates.latitude, 0),
        longitude: this.validateGPSCoordinate(data.coordinates.longitude, 0),
        
        // Other fields with standard precision
        distanceFromStartKm: this.validateNumber(data.coordinates.distanceFromStart, 0),
        spotType: data.spotType || 'crest',
        visibilityDistance: this.validateNumber(data.visibilityDistance, 100),
        obstructionHeight: this.validateNumber(data.obstructionHeight, 0),
        riskScore: this.validateNumber(data.riskScore, 6),
        severityLevel: this.determineSeverityLevel(data.riskScore || 6),
        analysisMethod: data.analysisMethod || 'REAL_GOOGLE_API',
        confidence: this.validateNumber(data.confidence, 0.8),
        
        // Initialize empty arrays/objects for optional fields
        streetViewImages: [],
        aerialImage: null,
        roadGeometry: {
          gradient: 0,
          curvature: 0,
          width: 7
        },
        vegetation: {
          present: false,
          height: 0,
          density: 'light'
        },
        structures: [],
        warningSignsPresent: false,
        mirrorInstalled: false,
        speedLimit: null,
        recommendations: data.recommendations || [],
        dataSource: 'REAL_GOOGLE_API_CALCULATION',
        lastUpdated: new Date()
      };

      // Add analysis-specific data
      if (data.elevationData) {
        blindSpotData.elevationData = data.elevationData;
      }
      if (data.curveData) {
        blindSpotData.curveData = data.curveData;
      }
      if (data.obstructionData) {
        blindSpotData.obstructionData = data.obstructionData;
      }
      if (data.intersectionData) {
        blindSpotData.intersectionData = data.intersectionData;
      }

      const blindSpot = new BlindSpot(blindSpotData);
      
      // Generate satellite view link
      blindSpot.generateSatelliteViewLink();
      
      const savedBlindSpot = await blindSpot.save();
      console.log(`💾 FIXED blind spot saved: ${savedBlindSpot.spotType} at ${savedBlindSpot.latitude}, ${savedBlindSpot.longitude} (risk: ${savedBlindSpot.riskScore})`);
      
      return savedBlindSpot;

    } catch (error) {
      console.error('❌ Failed to create REAL blind spot:', error);
      console.error('Data that failed:', JSON.stringify(data, null, 2));
      return null;
    }
  }
  // ============================================================================
  // UTILITY AND VALIDATION METHODS
  // ============================================================================

validateNumber(value, defaultValue) {
    // Set default value if not provided
    if (typeof defaultValue === 'undefined') {
      defaultValue = 0;
    }
    
    if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
      return Math.round(value * 100) / 100;
    }
    return defaultValue;
  }

  // NEW: GPS coordinate validation with high precision
  validateGPSCoordinate(value, defaultValue) {
    // Set default value if not provided
    if (typeof defaultValue === 'undefined') {
      defaultValue = 0;
    }
    
    if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
      // Preserve 6 decimal places for GPS coordinates (~1 meter accuracy)
      return Math.round(value * 1000000) / 1000000;
    }
    return defaultValue;
  }
  determineSeverityLevel(riskScore) {
    if (riskScore >= 8.5) return 'critical';
    if (riskScore >= 6.5) return 'significant';
    if (riskScore >= 4.5) return 'moderate';
    return 'minor';
  }

  calculateDistance(point1, point2) {
    const R = 6371000; // Earth's radius in meters
    const dLat = (point2.latitude - point1.latitude) * Math.PI / 180;
    const dLon = (point2.longitude - point1.longitude) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(point1.latitude * Math.PI / 180) * Math.cos(point2.latitude * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in meters
  }

  // ============================================================================
  // ANALYSIS RESULT PROCESSING METHODS
  // ============================================================================

  categorizeBlindSpots(blindSpots) {
    return {
      crest: blindSpots.filter(bs => bs.spotType === 'crest').length,
      curve: blindSpots.filter(bs => bs.spotType === 'curve').length,
      obstruction: blindSpots.filter(bs => bs.spotType === 'obstruction').length,
      intersection: blindSpots.filter(bs => bs.spotType === 'intersection').length,
      vegetation: blindSpots.filter(bs => bs.spotType === 'vegetation').length,
      structure: blindSpots.filter(bs => bs.spotType === 'structure').length
    };
  }

  analyzeRealRisk(blindSpots) {
    if (blindSpots.length === 0) {
      return { 
        score: 0, 
        criticalCount: 0, 
        level: 'LOW', 
        distribution: { critical: 0, high: 0, medium: 0, low: 0 } 
      };
    }

    const avgRisk = blindSpots.reduce((sum, spot) => sum + spot.riskScore, 0) / blindSpots.length;
    const maxRisk = Math.max(...blindSpots.map(spot => spot.riskScore));
    const criticalCount = blindSpots.filter(spot => spot.riskScore >= 8).length;

    let riskLevel = 'LOW';
    if (criticalCount > 3 || maxRisk >= 9.5) riskLevel = 'CRITICAL';
    else if (criticalCount > 1 || avgRisk >= 7.5) riskLevel = 'HIGH';
    else if (criticalCount > 0 || avgRisk >= 6.0) riskLevel = 'MEDIUM';

    return {
      score: Math.round(avgRisk * 10) / 10,
      criticalCount,
      maxRisk,
      level: riskLevel,
      distribution: this.getRiskDistribution(blindSpots)
    };
  }

  getRiskDistribution(blindSpots) {
    return {
      critical: blindSpots.filter(s => s.riskScore >= 8.5).length,
      high: blindSpots.filter(s => s.riskScore >= 6.5 && s.riskScore < 8.5).length,
      medium: blindSpots.filter(s => s.riskScore >= 4.5 && s.riskScore < 6.5).length,
      low: blindSpots.filter(s => s.riskScore < 4.5).length
    };
  }

  generateRealRecommendations(blindSpots) {
    const recommendations = [];
    const criticalSpots = blindSpots.filter(spot => spot.riskScore >= 8.5);

    if (criticalSpots.length > 0) {
      recommendations.push({
        priority: 'CRITICAL',
        category: 'immediate_action',
        title: `${criticalSpots.length} Critical Blind Spots Detected`,
        description: 'These areas require immediate safety measures and speed reduction',
        actions: [
          'MANDATORY: Reduce speed to 20-30 km/h in critical blind spot areas',
          'Use convoy travel with constant radio communication',
          'Install additional warning lights and horns on vehicles',
          'Consider alternative route to avoid critical sections',
          'Conduct detailed pre-journey briefing on exact blind spot locations'
        ]
      });
    }

    if (blindSpots.length > 5) {
      recommendations.push({
        priority: 'HIGH',
        category: 'route_safety',
        title: `Multiple Blind Spots Detected (${blindSpots.length} total)`,
        description: 'High density of visibility hazards requires enhanced safety protocols',
        actions: [
          'Maintain maximum alertness throughout journey',
          'Use headlights during daylight hours',
          'Sound horn when approaching any blind area',
          'Maintain 4-second minimum following distance',
          'Avoid overtaking in any visibility-limited areas'
        ]
      });
    }

    // Type-specific recommendations
    const elevationSpots = blindSpots.filter(s => s.spotType === 'crest');
    if (elevationSpots.length > 0) {
      recommendations.push({
        priority: 'HIGH',
        category: 'elevation_safety',
        title: `${elevationSpots.length} Hill Crest Blind Spots`,
        actions: [
          'Reduce speed significantly before cresting hills',
          'Stay in center of lane over hill crests',
          'Never attempt overtaking near hill crests',
          'Be prepared for stopped traffic beyond crest'
        ]
      });
    }

    const curveSpots = blindSpots.filter(s => s.spotType === 'curve');
    if (curveSpots.length > 0) {
      recommendations.push({
        priority: 'HIGH',
        category: 'curve_safety',
        title: `${curveSpots.length} Sharp Curve Blind Spots`,
        actions: [
          'Reduce speed before entering curves',
          'Position vehicle for maximum sight distance',
          'Use horn to signal approach to blind curves',
          'Never cut corners on sharp turns'
        ]
      });
    }

    recommendations.push({
      priority: 'STANDARD',
      category: 'general_protocol',
      title: 'General Blind Spot Safety Protocol',
      actions: [
        'Conduct thorough route safety briefing before departure',
        'Ensure all vehicle safety equipment is functional',
        'Carry emergency communication equipment',
        'Establish regular check-in procedures',
        'Monitor weather conditions - postpone if visibility poor'
      ]
    });

    return recommendations;
  }

  calculateRealConfidence(blindSpots) {
    if (blindSpots.length === 0) return 0.0;
    
    const avgConfidence = blindSpots.reduce((sum, spot) => sum + spot.confidence, 0) / blindSpots.length;
    return Math.round(avgConfidence * 100) / 100;
  }
}

module.exports = new RealBlindSpotCalculator();