// File: services/riskCalculationService.js - COMPLETELY FIXED VERSION
// Purpose: Enhanced risk calculation with comprehensive data integration
// CRITICAL FIX: Corrected model imports to use individual model files

const Route = require('../models/Route');
const RoadCondition = require('../models/RoadCondition');
// FIXED: Import models individually instead of non-existent EnhancedModels
const AccidentProneArea = require('../models/AccidentProneArea');
const WeatherCondition = require('../models/WeatherCondition');
const TrafficData = require('../models/TrafficData');
const EmergencyService = require('../models/EmergencyService');
const logger = require('../utils/logger');
const axios = require('axios'); // ✅ ADDED: Missing axios import

class EnhancedRiskCalculationService {
  constructor() {
    // Enhanced risk criteria weights based on comprehensive data
    this.riskWeights = {
      roadConditions: 15,           // Critical - Based on enhanced road condition data
      accidentProne: 15,            // Critical - Based on comprehensive accident analysis
      sharpTurns: 10,              // High - GPS-based turn analysis
      blindSpots: 10,              // High - Elevation and visibility analysis
      twoWayTraffic: 10,           // High - Route type analysis
      trafficDensity: 10,          // High - Real-time traffic data
      weatherConditions: 10,       // High - Comprehensive weather analysis
      emergencyServices: 5,        // Medium - Enhanced emergency service coverage
      networkCoverage: 5,          // Medium - Communication infrastructure
      amenities: 5,                // Medium - Food, fuel, rest facilities
      securityIssues: 5            // Medium - Security and crime analysis
    };
    
    // Enhanced risk grade thresholds
    this.gradeThresholds = {
      A: { min: 0, max: 2.0, level: 'Very Low Risk', color: '#28a745' },
      B: { min: 2.1, max: 4.0, level: 'Low Risk', color: '#20c997' },
      C: { min: 4.1, max: 6.0, level: 'Medium Risk', color: '#ffc107' },
      D: { min: 6.1, max: 8.0, level: 'High Risk', color: '#fd7e14' },
      F: { min: 8.1, max: 10.0, level: 'Critical Risk', color: '#dc3545' }
    };
  }

  // Main enhanced risk calculation function
  async calculateRouteRisk(routeId) {
    try {
      console.log(`🔄 Starting enhanced risk calculation for route: ${routeId}`);
      
      const route = await Route.findById(routeId);
      if (!route) {
        throw new Error('Route not found');
      }

      // Calculate individual risk scores with enhanced data
      const riskScores = {
        roadConditions: await this.calculateEnhancedRoadConditionsRisk(routeId),
        accidentProne: await this.calculateEnhancedAccidentProneRisk(routeId),
        sharpTurns: await this.calculateEnhancedSharpTurnsRisk(routeId),
        blindSpots: await this.calculateEnhancedBlindSpotsRisk(routeId),
        twoWayTraffic: await this.calculateEnhancedTwoWayTrafficRisk(routeId),
        trafficDensity: await this.calculateEnhancedTrafficDensityRisk(routeId),
        weatherConditions: await this.calculateEnhancedWeatherRisk(routeId),
        emergencyServices: await this.calculateEnhancedEmergencyServicesRisk(routeId),
        networkCoverage: await this.calculateEnhancedNetworkCoverageRisk(routeId),
        amenities: await this.calculateEnhancedAmenitiesRisk(routeId),
        securityIssues: await this.calculateEnhancedSecurityRisk(routeId)
      };

      // Calculate weighted total score
      const totalWeightedScore = this.calculateWeightedScore(riskScores);
      
      // Determine risk grade and level
      const riskGrade = this.determineRiskGrade(totalWeightedScore);
      const riskLevel = this.determineRiskLevel(totalWeightedScore);
      
      // Generate comprehensive risk explanation
      const riskExplanation = this.generateEnhancedRiskExplanation(riskScores, totalWeightedScore, riskGrade);
      
      const result = {
        ...riskScores,
        totalWeightedScore: Math.round(totalWeightedScore * 100) / 100,
        riskGrade,
        riskLevel,
        riskExplanation,
        topRiskFactors: this.identifyTopRiskFactors(riskScores),
        safetyRecommendations: this.generateComprehensiveSafetyRecommendations(riskScores, totalWeightedScore),
        calculatedAt: new Date(),
        dataQuality: await this.assessDataQuality(routeId),
        confidenceLevel: await this.calculateConfidenceLevel(routeId) // FIXED: Made async
      };

      // Update route with comprehensive risk assessment
      await Route.findByIdAndUpdate(routeId, {
        riskScores: result,
        riskLevel: riskLevel,
        'metadata.lastCalculated': new Date(),
        'metadata.riskVersion': '2.0'
      });

      console.log(`✅ Enhanced risk calculation completed for route ${routeId}: Score ${totalWeightedScore}, Grade ${riskGrade}, Level ${riskLevel}`);
      
      return result;

    } catch (error) {
      console.error(`❌ Enhanced risk calculation failed for route ${routeId}:`, error);
      throw error;
    }
  }

  // 1. ENHANCED ROAD CONDITIONS RISK
  async calculateEnhancedRoadConditionsRisk(routeId) {
    try {
      const roadConditions = await RoadCondition.find({ routeId });
      
      if (roadConditions.length === 0) return 5;
      
      let totalRisk = 0;
      let weightedPoints = 0;
      
      for (const condition of roadConditions) {
        let segmentRisk = condition.riskScore || 5;
        let weight = 1;
        
        // Enhanced risk factors
        const riskFactors = {
          surfaceQuality: {
            'critical': 4, 'poor': 3, 'fair': 1, 'good': -1, 'excellent': -2
          },
          maintenance: {
            potholes: condition.hasPotholes ? 2 : 0,
            construction: condition.underConstruction ? 3 : 0
          },
          infrastructure: {
            narrowWidth: (condition.widthMeters && condition.widthMeters < 4) ? 2 : 0,
            noShoulder: (condition.shoulderWidth && condition.shoulderWidth < 1) ? 1 : 0,
            poorLighting: (condition.lightingQuality === 'poor') ? 2 : 0,
            poorDrainage: (condition.drainageQuality === 'poor') ? 1 : 0
          },
          environmental: {
            bridges: (condition.bridgesCulverts || 0) * 0.5,
            steepSlope: (condition.slopeGradient > 6) ? 2 : 0
          }
        };
        
        // Apply risk factors
        segmentRisk += riskFactors.surfaceQuality[condition.surfaceQuality] || 0;
        segmentRisk += riskFactors.maintenance.potholes + riskFactors.maintenance.construction;
        segmentRisk += riskFactors.infrastructure.narrowWidth + riskFactors.infrastructure.noShoulder;
        segmentRisk += riskFactors.infrastructure.poorLighting + riskFactors.infrastructure.poorDrainage;
        segmentRisk += riskFactors.environmental.bridges + riskFactors.environmental.steepSlope;
        
        // Weight by distance (longer segments have more impact)
        if (condition.distanceFromStartKm !== undefined) {
          weight = Math.max(0.5, Math.min(2, condition.segmentLength || 1));
        }
        
        totalRisk += Math.max(1, Math.min(10, segmentRisk)) * weight;
        weightedPoints += weight;
      }
      
      return Math.round((totalRisk / weightedPoints) * 100) / 100;
      
    } catch (error) {
      console.error('Enhanced road conditions risk calculation failed:', error);
      return 5;
    }
  }

  // 2. ENHANCED ACCIDENT-PRONE AREAS RISK
  async calculateEnhancedAccidentProneRisk(routeId) {
    try {
      const accidentAreas = await AccidentProneArea.find({ routeId });
      
      if (accidentAreas.length === 0) return 3;
      
      let totalRisk = 0;
      let riskAreaCount = 0;
      
      for (const area of accidentAreas) {
        let areaRisk = area.riskScore || 5;
        
        // Enhanced accident risk factors
        const enhancedFactors = {
          frequency: {
            veryHigh: area.accidentFrequencyYearly > 20 ? 3 : 0,
            high: area.accidentFrequencyYearly > 10 ? 2 : 0,
            medium: area.accidentFrequencyYearly > 5 ? 1 : 0
          },
          severity: {
            fatal: area.accidentSeverity === 'fatal' ? 4 : 0,
            major: area.accidentSeverity === 'major' ? 2 : 0,
            minor: area.accidentSeverity === 'minor' ? 1 : 0
          },
          timeRisk: {
            night: (area.timeOfDayRisk?.night || 5) > 7 ? 2 : 0,
            peak: (area.timeOfDayRisk?.peak || 5) > 7 ? 1 : 0
          },
          environmental: {
            weather: (area.weatherRelatedRisk || 5) > 6 ? 2 : 0,
            infrastructure: (area.infrastructureRisk || 5) > 6 ? 1 : 0,
            traffic: (area.trafficVolumeRisk || 5) > 6 ? 1 : 0
          },
          trend: {
            increasing: area.accidentTrend === 'increasing' ? 2 : 0,
            stable: area.accidentTrend === 'stable' ? 0 : 0,
            decreasing: area.accidentTrend === 'decreasing' ? -1 : 0
          }
        };
        
        // Apply enhanced factors
        areaRisk += Math.max(enhancedFactors.frequency.veryHigh, enhancedFactors.frequency.high, enhancedFactors.frequency.medium);
        areaRisk += Math.max(enhancedFactors.severity.fatal, enhancedFactors.severity.major, enhancedFactors.severity.minor);
        areaRisk += enhancedFactors.timeRisk.night + enhancedFactors.timeRisk.peak;
        areaRisk += enhancedFactors.environmental.weather + enhancedFactors.environmental.infrastructure + enhancedFactors.environmental.traffic;
        areaRisk += enhancedFactors.trend.increasing + enhancedFactors.trend.stable + enhancedFactors.trend.decreasing;
        
        totalRisk += Math.max(1, Math.min(10, areaRisk));
        riskAreaCount++;
      }
      
      return riskAreaCount > 0 ? Math.round((totalRisk / riskAreaCount) * 100) / 100 : 3;
      
    } catch (error) {
      console.error('Enhanced accident-prone risk calculation failed:', error);
      return 3;
    }
  }

  // 3. ENHANCED SHARP TURNS RISK CALCULATION
  async calculateEnhancedSharpTurnsRisk(routeId) {
    try {
      const SharpTurn = require('../models/SharpTurn');
      const sharpTurns = await SharpTurn.find({ routeId });
      
      if (sharpTurns.length === 0) return 3; // Low base risk
      
      let totalRisk = 0;
      let weightedPoints = 0;
      
      for (const turn of sharpTurns) {
        let turnRisk = turn.riskScore || 5;
        let weight = 1;
        
        // Enhanced risk factors
        const riskFactors = {
          angle: {
            hairpin: turn.turnAngle > 120 ? 3 : 0,
            sharp: turn.turnAngle > 90 ? 2 : 0,
            moderate: turn.turnAngle > 60 ? 1 : 0
          },
          radius: {
            veryTight: turn.turnRadius < 50 ? 3 : 0,
            tight: turn.turnRadius < 100 ? 2 : 0,
            moderate: turn.turnRadius < 200 ? 1 : 0
          },
          safety: {
            noGuardrails: !turn.guardrails ? 2 : 0,
            noWarningSigns: !turn.warningSigns ? 1 : 0,
            poorVisibility: turn.visibility === 'poor' ? 2 : 0,
            poorSurface: turn.roadSurface === 'poor' ? 1 : 0
          },
          environment: {
            banking: turn.bankingAngle && turn.bankingAngle < -5 ? 2 : 0, // Adverse banking
            noLighting: !turn.lightingAvailable ? 1 : 0
          }
        };
        
        // Apply enhanced factors
        turnRisk += Math.max(riskFactors.angle.hairpin, riskFactors.angle.sharp, riskFactors.angle.moderate);
        turnRisk += Math.max(riskFactors.radius.veryTight, riskFactors.radius.tight, riskFactors.radius.moderate);
        turnRisk += riskFactors.safety.noGuardrails + riskFactors.safety.noWarningSigns;
        turnRisk += riskFactors.safety.poorVisibility + riskFactors.safety.poorSurface;
        turnRisk += riskFactors.environment.banking + riskFactors.environment.noLighting;
        
        // Weight by severity
        if (turn.turnSeverity === 'hairpin') weight = 2;
        else if (turn.turnSeverity === 'sharp') weight = 1.5;
        
        totalRisk += Math.max(1, Math.min(10, turnRisk)) * weight;
        weightedPoints += weight;
      }
      
      const avgRisk = weightedPoints > 0 ? totalRisk / weightedPoints : 3;
      
      return Math.round(avgRisk * 100) / 100;
      
    } catch (error) {
      console.error('Enhanced sharp turns risk calculation failed:', error);
      return 3;
    }
  }

  // 4. ENHANCED BLIND SPOTS RISK CALCULATION  
  async calculateEnhancedBlindSpotsRisk(routeId) {
    try {
      const BlindSpot = require('../models/BlindSpot');
      const blindSpots = await BlindSpot.find({ routeId });
      
      if (blindSpots.length === 0) return 2; // Very low base risk
      
      let totalRisk = 0;
      let weightedPoints = 0;
      
      for (const spot of blindSpots) {
        let spotRisk = spot.riskScore || 5;
        let weight = 1;
        
        // Enhanced risk factors
        const riskFactors = {
          visibility: {
            veryPoor: spot.visibilityDistance < 50 ? 4 : 0,
            poor: spot.visibilityDistance < 100 ? 3 : 0,
            limited: spot.visibilityDistance < 200 ? 2 : 0
          },
          spotType: {
            crest: spot.spotType === 'crest' ? 2 : 0,
            curve: spot.spotType === 'curve' ? 1 : 0,
            obstruction: spot.spotType === 'obstruction' ? 3 : 0
          },
          safety: {
            noWarnings: !spot.warningSignsPresent ? 2 : 0,
            noMirror: !spot.mirrorInstalled ? 1 : 0,
            highSpeed: (spot.speedLimit || 60) > 60 ? 1 : 0
          },
          environment: {
            vegetation: spot.vegetation?.density === 'heavy' ? 2 : 0,
            structures: (spot.structures || []).length > 0 ? 1 : 0,
            elevation: spot.obstructionHeight > 10 ? 1 : 0
          }
        };
        
        // Apply enhanced factors
        spotRisk += Math.max(riskFactors.visibility.veryPoor, riskFactors.visibility.poor, riskFactors.visibility.limited);
        spotRisk += Math.max(riskFactors.spotType.crest, riskFactors.spotType.curve, riskFactors.spotType.obstruction);
        spotRisk += riskFactors.safety.noWarnings + riskFactors.safety.noMirror + riskFactors.safety.highSpeed;
        spotRisk += riskFactors.environment.vegetation + riskFactors.environment.structures + riskFactors.environment.elevation;
        
        // Weight by severity
        if (spot.severityLevel === 'critical') weight = 2;
        else if (spot.severityLevel === 'significant') weight = 1.5;
        
        totalRisk += Math.max(1, Math.min(10, spotRisk)) * weight;
        weightedPoints += weight;
      }
      
      const avgRisk = weightedPoints > 0 ? totalRisk / weightedPoints : 2;
      
      return Math.round(avgRisk * 100) / 100;
      
    } catch (error) {
      console.error('Enhanced blind spots risk calculation failed:', error);
      return 2;
    }
  }

  // 5. ENHANCED TWO-WAY TRAFFIC RISK
  async calculateEnhancedTwoWayTrafficRisk(routeId) {
    try {
      const route = await Route.findById(routeId);
      if (!route) return 5;
      
      let trafficRisk = 4; // Base risk
      
      // Route characteristics
      if (route.terrain === 'hilly') trafficRisk += 2;
      if (route.terrain === 'rural') trafficRisk += 1;
      if (route.totalDistance > 200) trafficRisk += 1;
      
      // Highway analysis
      if (route.majorHighways && route.majorHighways.length > 0) {
        const hasNationalHighway = route.majorHighways.some(hw => hw.startsWith('NH'));
        if (hasNationalHighway) trafficRisk -= 1;
        else trafficRisk += 1; // State/district roads have higher two-way risk
      } else {
        trafficRisk += 2; // No major highways = higher risk
      }
      
      return Math.max(1, Math.min(10, trafficRisk));
      
    } catch (error) {
      console.error('Enhanced two-way traffic risk calculation failed:', error);
      return 5;
    }
  }

  // 6. ENHANCED TRAFFIC DENSITY RISK
  async calculateEnhancedTrafficDensityRisk(routeId) {
    try {
      const trafficData = await TrafficData.find({ routeId });
      
      if (trafficData.length === 0) return 5;
      
      let totalRisk = 0;
      let dataPoints = 0;
      
      for (const traffic of trafficData) {
        let trafficRisk = traffic.riskScore || 5;
        
        // Enhanced traffic risk factors
        const enhancedFactors = {
          congestion: {
            severe: traffic.congestionLevel === 'severe' ? 4 : 0,
            heavy: traffic.congestionLevel === 'heavy' ? 3 : 0,
            moderate: traffic.congestionLevel === 'moderate' ? 1 : 0,
            light: traffic.congestionLevel === 'light' ? 0 : 0,
            free_flow: traffic.congestionLevel === 'free_flow' ? -1 : 0
          },
          speed: {
            crawling: traffic.averageSpeedKmph < 20 ? 3 : 0,
            slow: traffic.averageSpeedKmph < 40 ? 2 : 0,
            normal: traffic.averageSpeedKmph >= 40 ? 0 : 0
          },
          infrastructure: {
            tollPoints: (traffic.tollPoints || 0) * 1,
            construction: (traffic.constructionZones || 0) * 2,
            trafficLights: (traffic.trafficLights || 0) * 0.5
          },
          incidents: {
            accidents: (traffic.accidentReports || 0) * 2,
            weatherImpact: traffic.weatherImpact === 'severe' ? 2 : 
                          traffic.weatherImpact === 'moderate' ? 1 : 0
          },
          timing: {
            peak: traffic.timeOfDay === 'morning_peak' || traffic.timeOfDay === 'evening_peak' ? 1 : 0
          }
        };
        
        // Apply enhanced factors
        trafficRisk += Math.max(...Object.values(enhancedFactors.congestion));
        trafficRisk += Math.max(...Object.values(enhancedFactors.speed));
        trafficRisk += enhancedFactors.infrastructure.tollPoints + enhancedFactors.infrastructure.construction + enhancedFactors.infrastructure.trafficLights;
        trafficRisk += enhancedFactors.incidents.accidents + enhancedFactors.incidents.weatherImpact;
        trafficRisk += enhancedFactors.timing.peak;
        
        totalRisk += Math.max(1, Math.min(10, trafficRisk));
        dataPoints++;
      }
      
      return dataPoints > 0 ? Math.round((totalRisk / dataPoints) * 100) / 100 : 5;
      
    } catch (error) {
      console.error('Enhanced traffic density risk calculation failed:', error);
      return 5;
    }
  }

  // 7. ENHANCED WEATHER CONDITIONS RISK
  async calculateEnhancedWeatherRisk(routeId) {
    try {
      const weatherConditions = await WeatherCondition.find({ routeId });
      
      if (weatherConditions.length === 0) return 4;
      
      let totalRisk = 0;
      let dataPoints = 0;
      
      for (const weather of weatherConditions) {
        let weatherRisk = weather.riskScore || 4;
        
        // Enhanced weather risk factors
        const enhancedFactors = {
          condition: {
            stormy: weather.weatherCondition === 'stormy' ? 4 : 0,
            foggy: weather.weatherCondition === 'foggy' ? 3 : 0,
            rainy: weather.weatherCondition === 'rainy' ? 2 : 0,
            icy: weather.weatherCondition === 'icy' ? 4 : 0,
            clear: weather.weatherCondition === 'clear' ? -1 : 0
          },
          visibility: {
            veryPoor: (weather.visibilityKm || 10) < 1 ? 4 : 0,
            poor: (weather.visibilityKm || 10) < 5 ? 3 : 0,
            limited: (weather.visibilityKm || 10) < 10 ? 1 : 0
          },
          wind: {
            extreme: (weather.windSpeedKmph || 0) > 70 ? 3 : 0,
            high: (weather.windSpeedKmph || 0) > 50 ? 2 : 0,
            moderate: (weather.windSpeedKmph || 0) > 30 ? 1 : 0
          },
          surface: {
            icy: weather.roadSurfaceCondition === 'icy' ? 4 : 0,
            muddy: weather.roadSurfaceCondition === 'muddy' ? 2 : 0,
            wet: weather.roadSurfaceCondition === 'wet' ? 1 : 0
          },
          seasonal: {
            monsoon: weather.monsoonRisk > 7 ? 2 : 0,
            extreme: (weather.extremeWeatherHistory || []).length > 2 ? 1 : 0
          },
          temperature: {
            extreme: (weather.averageTemperature < 5 || weather.averageTemperature > 45) ? 2 : 0,
            uncomfortable: (weather.averageTemperature < 10 || weather.averageTemperature > 40) ? 1 : 0
          }
        };
        
        // Apply enhanced factors
        weatherRisk += Math.max(...Object.values(enhancedFactors.condition));
        weatherRisk += Math.max(...Object.values(enhancedFactors.visibility));
        weatherRisk += Math.max(...Object.values(enhancedFactors.wind));
        weatherRisk += Math.max(...Object.values(enhancedFactors.surface));
        weatherRisk += enhancedFactors.seasonal.monsoon + enhancedFactors.seasonal.extreme;
        weatherRisk += Math.max(...Object.values(enhancedFactors.temperature));
        
        totalRisk += Math.max(1, Math.min(10, weatherRisk));
        dataPoints++;
      }
      
      return dataPoints > 0 ? Math.round((totalRisk / dataPoints) * 100) / 100 : 4;
      
    } catch (error) {
      console.error('Enhanced weather risk calculation failed:', error);
      return 4;
    }
  }

  // 8. ENHANCED EMERGENCY SERVICES RISK
  async calculateEnhancedEmergencyServicesRisk(routeId) {
    try {
      const emergencyServices = await EmergencyService.find({ routeId });
      
      if (emergencyServices.length === 0) return 8; // High risk for no services
      
      // Categorize services by type
      const servicesByType = {
        hospital: emergencyServices.filter(s => s.serviceType === 'hospital'),
        police: emergencyServices.filter(s => s.serviceType === 'police'),
        fire_station: emergencyServices.filter(s => s.serviceType === 'fire_station'),
        fuel: emergencyServices.filter(s => s.serviceType === 'mechanic')
      };
      
      let totalRisk = 0;
      let riskFactors = [];
      
      // Assess each service type
      for (const [serviceType, services] of Object.entries(servicesByType)) {
        let serviceRisk = 8; // Default high risk
        
        if (services.length === 0) {
          riskFactors.push({ type: serviceType, risk: 8, reason: 'No services available' });
          continue;
        }
        
        // Find best service of this type
        const bestService = services.reduce((best, current) => {
          const bestScore = this.calculateServiceScore(best);
          const currentScore = this.calculateServiceScore(current);
          return currentScore > bestScore ? current : best;
        });
        
        // Calculate risk based on best available service
        serviceRisk = this.calculateServiceRisk(bestService, serviceType);
        
        totalRisk += serviceRisk;
      }
      
      const avgRisk = totalRisk / Object.keys(servicesByType).length;
      
      // Apply coverage bonus/penalty
      const coverageBonus = this.calculateCoverageBonus(emergencyServices);
      const finalRisk = Math.max(1, Math.min(10, avgRisk - coverageBonus));
      
      return Math.round(finalRisk * 100) / 100;
      
    } catch (error) {
      console.error('Enhanced emergency services risk calculation failed:', error);
      return 6;
    }
  }

  // 9. ENHANCED NETWORK COVERAGE RISK
  async calculateEnhancedNetworkCoverageRisk(routeId) {
    try {
      const route = await Route.findById(routeId);
      if (!route) return 5;
      
      let networkRisk = 4; // Base risk
      
      // Terrain-based risk assessment
      const terrainRisk = {
        'urban': 2,
        'rural': 6,
        'hilly': 8,
        'mixed': 5
      };
      
      networkRisk = terrainRisk[route.terrain] || 5;
      
      // Distance factor
      if (route.totalDistance > 300) networkRisk += 1;
      
      // Route type factor
      if (route.majorHighways && route.majorHighways.length > 0) {
        const hasNationalHighway = route.majorHighways.some(hw => hw.startsWith('NH'));
        if (hasNationalHighway) networkRisk -= 1;
      }
      
      return Math.max(1, Math.min(10, networkRisk));
      
    } catch (error) {
      console.error('Enhanced network coverage risk calculation failed:', error);
      return 5;
    }
  }

  // 10. ENHANCED AMENITIES RISK
 // 10. ENHANCED AMENITIES RISK (continued from Part 1)
  async calculateEnhancedAmenitiesRisk(routeId) {
    try {
      const amenityServices = await EmergencyService.find({ 
        routeId, 
        serviceType: { $in: ['amenity', 'mechanic'] }
      });
      
      const route = await Route.findById(routeId);
      let amenityRisk = 6; // Default medium-high risk
      
      // Categorize amenities
      const amenityTypes = {
        fuel: amenityServices.filter(s => s.name.toLowerCase().includes('gas') || 
                                          s.name.toLowerCase().includes('petrol') ||
                                          s.fuelTypes?.length > 0),
        food: amenityServices.filter(s => s.name.toLowerCase().includes('restaurant') ||
                                          s.name.toLowerCase().includes('dhaba')),
        rest: amenityServices.filter(s => s.name.toLowerCase().includes('hotel') ||
                                          s.name.toLowerCase().includes('lodge')),
        repair: amenityServices.filter(s => s.serviceType === 'mechanic')
      };
      
      // Simple amenity assessment
      for (const [type, services] of Object.entries(amenityTypes)) {
        if (services.length === 0) {
          amenityRisk += 1; // Penalty for missing amenity type
        } else {
          amenityRisk -= 0.5; // Bonus for available amenity
        }
      }
      
      // Route characteristics
      if (route.terrain === 'rural') amenityRisk += 1;
      if (route.totalDistance > 300) amenityRisk += 1;
      
      return Math.max(1, Math.min(10, amenityRisk));
      
    } catch (error) {
      console.error('Enhanced amenities risk calculation failed:', error);
      return 6;
    }
  }

  // 11. ENHANCED SECURITY RISK
  async calculateEnhancedSecurityRisk(routeId) {
    try {
      const route = await Route.findById(routeId);
      if (!route) return 4;
      
      let securityRisk = 4; // Base risk
      
      // Terrain-based security assessment
      if (route.terrain === 'rural') securityRisk += 2;
      if (route.terrain === 'hilly') securityRisk += 1;
      if (route.totalDistance > 300) securityRisk += 1;
      
      // Police presence assessment
      const policeServices = await EmergencyService.find({ 
        routeId, 
        serviceType: 'police' 
      });
      
      if (policeServices.length === 0) {
        securityRisk += 2;
      } else {
        const avgPoliceDistance = policeServices.reduce((sum, s) => sum + s.distanceFromRouteKm, 0) / policeServices.length;
        if (avgPoliceDistance > 30) securityRisk += 1;
      }
      
      return Math.max(1, Math.min(10, securityRisk));
      
    } catch (error) {
      console.error('Enhanced security risk calculation failed:', error);
      return 4;
    }
  }

  // ============================================================================
  // HELPER METHODS FOR ENHANCED CALCULATIONS
  // ============================================================================

  calculateServiceScore(service) {
    let score = 0;
    
    // Distance score (closer is better)
    const distance = service.distanceFromRouteKm || 50;
    score += Math.max(0, 10 - (distance / 5));
    
    // Availability score
    score += service.availabilityScore || 5;
    
    // Response time score
    const responseTime = service.responseTimeMinutes || 30;
    score += Math.max(0, 10 - (responseTime / 3));
    
    // 24/7 bonus
    if (service.isOpen24Hours) score += 2;
    
    // Rating bonus
    if (service.rating) score += service.rating;
    
    return score;
  }

  calculateServiceRisk(service, serviceType) {
    let risk = 2; // Base low risk for available service
    
    // Distance penalty
    const distance = service.distanceFromRouteKm || 0;
    if (distance > 50) risk += 4;
    else if (distance > 25) risk += 2;
    else if (distance > 10) risk += 1;
    
    // Response time penalty
    const responseTime = service.responseTimeMinutes || 15;
    if (responseTime > 60) risk += 3;
    else if (responseTime > 30) risk += 2;
    else if (responseTime > 15) risk += 1;
    
    // Availability penalty
    const availability = service.availabilityScore || 5;
    if (availability < 5) risk += 2;
    else if (availability < 7) risk += 1;
    
    return Math.max(1, Math.min(10, risk));
  }

  calculateCoverageBonus(services) {
    let bonus = 0;
    
    // High service density bonus
    if (services.length > 20) bonus += 1;
    else if (services.length > 10) bonus += 0.5;
    
    // 24/7 services bonus
    const h24Services = services.filter(s => s.isOpen24Hours).length;
    if (h24Services > 5) bonus += 1;
    else if (h24Services > 2) bonus += 0.5;
    
    return bonus;
  }

  // ============================================================================
  // ANALYSIS AND REPORTING METHODS
  // ============================================================================

  identifyTopRiskFactors(riskScores) {
    return Object.entries(riskScores)
      .filter(([key, value]) => key !== 'totalWeightedScore' && key !== 'riskGrade' && key !== 'calculatedAt')
      .map(([key, value]) => ({
        factor: key,
        score: typeof value === 'object' ? value.riskScore || value : value,
        weight: this.riskWeights[key] || 0
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  generateComprehensiveSafetyRecommendations(riskScores, totalScore) {
    const recommendations = [];
    
    // Critical recommendations based on total score
    if (totalScore >= 8) {
      recommendations.push({
        priority: 'critical',
        category: 'general',
        recommendation: 'CRITICAL RISK: Consider postponing journey or using alternative route'
      });
    }
    
    // Factor-specific recommendations
    Object.entries(riskScores).forEach(([factor, score]) => {
      const actualScore = typeof score === 'object' ? score.riskScore || score : score;
      if (actualScore > 7) {
        recommendations.push(...this.getFactorSpecificRecommendations(factor, actualScore));
      }
    });
    
    // General safety recommendations
    recommendations.push(
      {
        priority: 'high',
        category: 'communication',
        recommendation: 'Maintain constant communication with control room'
      },
      {
        priority: 'medium',
        category: 'preparation',
        recommendation: 'Carry comprehensive emergency kit'
      },
      {
        priority: 'medium',
        category: 'documentation',
        recommendation: 'Keep emergency contact numbers accessible'
      }
    );
    
    return recommendations;
  }

  getFactorSpecificRecommendations(factor, score) {
    const recommendations = {
      roadConditions: [
        { priority: 'high', category: 'vehicle', recommendation: 'Inspect vehicle thoroughly, especially brakes and suspension' },
        { priority: 'high', category: 'driving', recommendation: 'Reduce speed and increase following distance' }
      ],
      accidentProne: [
        { priority: 'critical', category: 'route', recommendation: 'Exercise extreme caution in identified accident zones' },
        { priority: 'high', category: 'convoy', recommendation: 'Consider convoy travel through high-risk areas' }
      ],
      sharpTurns: [
        { priority: 'high', category: 'driving', recommendation: 'Reduce speed significantly before sharp turns' },
        { priority: 'high', category: 'safety', recommendation: 'Use horn signals when approaching blind curves' }
      ],
      blindSpots: [
        { priority: 'critical', category: 'visibility', recommendation: 'Exercise extreme caution in areas with limited visibility' },
        { priority: 'high', category: 'speed', recommendation: 'Reduce speed to 25-35 km/h in blind spot areas' }
      ],
      trafficDensity: [
        { priority: 'medium', category: 'timing', recommendation: 'Avoid peak traffic hours if possible' },
        { priority: 'medium', category: 'fuel', recommendation: 'Maintain higher fuel levels due to potential delays' }
      ],
      weatherConditions: [
        { priority: 'high', category: 'weather', recommendation: 'Monitor weather conditions continuously' },
        { priority: 'high', category: 'timing', recommendation: 'Delay travel during severe weather warnings' }
      ],
      emergencyServices: [
        { priority: 'medium', category: 'emergency', recommendation: 'Carry additional emergency supplies due to limited services' },
        { priority: 'medium', category: 'communication', recommendation: 'Ensure reliable communication equipment' }
      ]
    };
    
    return recommendations[factor] || [];
  }

  generateEnhancedRiskExplanation(riskScores, totalScore, riskGrade) {
    const topRisks = this.identifyTopRiskFactors(riskScores);
    const gradeInfo = this.gradeThresholds[riskGrade];
    
    let explanation = `Route risk assessment: Grade ${riskGrade} (${gradeInfo.level}) with a total weighted score of ${totalScore}. `;
    
    if (topRisks.length > 0) {
      explanation += `Primary risk factors include: `;
      explanation += topRisks.slice(0, 3).map(risk => 
        `${risk.factor} (score: ${risk.score})`
      ).join(', ');
      explanation += '. ';
    }
    
    if (totalScore >= 8) {
      explanation += 'This route presents critical safety concerns and alternative options should be strongly considered.';
    } else if (totalScore >= 6) {
      explanation += 'This route requires enhanced safety measures and careful monitoring.';
    } else if (totalScore >= 4) {
      explanation += 'This route has moderate risk factors that should be addressed with standard safety protocols.';
    } else {
      explanation += 'This route presents low risk with standard safety measures recommended.';
    }
    
    return explanation;
  }

  calculateWeightedScore(riskScores) {
    let totalScore = 0;
    
    Object.entries(riskScores).forEach(([criterion, score]) => {
      if (this.riskWeights[criterion]) {
        const actualScore = typeof score === 'object' ? score.riskScore || score : score;
        totalScore += (actualScore * this.riskWeights[criterion]) / 100;
      }
    });
    
    return totalScore;
  }

  determineRiskGrade(totalScore) {
    for (const [grade, threshold] of Object.entries(this.gradeThresholds)) {
      if (totalScore >= threshold.min && totalScore <= threshold.max) {
        return grade;
      }
    }
    return 'F';
  }

  determineRiskLevel(totalScore) {
    const grade = this.determineRiskGrade(totalScore);
    return this.gradeThresholds[grade].level;
  }

  async assessDataQuality(routeId) {
    try {
      const route = await Route.findById(routeId);
      const processingStatus = route.dataProcessingStatus || {};
      
      const totalCategories = Object.keys(processingStatus).length;
      const completedCategories = Object.values(processingStatus).filter(status => status === true).length;
      
      const completionPercentage = totalCategories > 0 ? (completedCategories / totalCategories) * 100 : 0;
      
      let quality = 'low';
      if (completionPercentage >= 90) quality = 'high';
      else if (completionPercentage >= 70) quality = 'medium';
      
      return {
        level: quality,
        completionPercentage: Math.round(completionPercentage),
        missingData: Object.entries(processingStatus)
          .filter(([key, value]) => !value)
          .map(([key]) => key)
      };
    } catch (error) {
      return { level: 'unknown', completionPercentage: 0, missingData: [] };
    }
  }

  async calculateConfidenceLevel(routeId) {
    try {
      const quality = await this.assessDataQuality(routeId);
      let confidence = 50; // Base confidence
      
      // Data quality factors
      if (quality.completionPercentage >= 90) confidence += 30;
      else if (quality.completionPercentage >= 70) confidence += 20;
      else if (quality.completionPercentage >= 50) confidence += 10;
      
      // Additional factors
      const route = await Route.findById(routeId);
      if (route.routePoints && route.routePoints.length > 20) confidence += 10;
      if (route.metadata?.lastCalculated) {
        const timeSinceLastCalc = Date.now() - route.metadata.lastCalculated.getTime();
        if (timeSinceLastCalc < 24 * 60 * 60 * 1000) confidence += 10; // Within 24 hours
      }
      
      return Math.min(95, Math.max(30, confidence));
      
    } catch (error) {
      console.error('Confidence level calculation failed:', error);
      return 70; // Default confidence
    }
  }

  // ============================================================================
  // API SUCCESS RATE AND HEALTH CHECK METHODS
  // ============================================================================

  async getApiSuccessRate() {
    try {
      // Mock API success rate - in real implementation, this would track actual API calls
      return 0.95; // 95% success rate
    } catch (error) {
      return 0.8; // Default moderate success rate
    }
  }

  async checkExternalApiHealth() {
    try {
      // Mock API health check - in real implementation, this would ping actual APIs
      const healthChecks = {
        googleMaps: process.env.GOOGLE_MAPS_API_KEY ? 'healthy' : 'unavailable',
        openWeather: process.env.OPENWEATHER_API_KEY ? 'healthy' : 'unavailable',
        tomTom: process.env.TOMTOM_API_KEY ? 'healthy' : 'unavailable',
        here: process.env.HERE_API_KEY ? 'healthy' : 'unavailable'
      };
      
      const healthyCount = Object.values(healthChecks).filter(status => status === 'healthy').length;
      const totalApis = Object.keys(healthChecks).length;
      
      if (healthyCount === totalApis) return 'healthy';
      if (healthyCount >= totalApis * 0.7) return 'degraded';
      return 'unhealthy';
      
    } catch (error) {
      return 'unknown';
    }
  }
}

module.exports = new EnhancedRiskCalculationService();