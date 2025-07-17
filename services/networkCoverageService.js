// File: services/networkCoverageService.js - FIXED VERSION
// Purpose: Network coverage analysis service with proper model import

const NetworkCoverage = require('../models/NetworkCoverage'); // ✅ FIXED: Import separate model
const Route = require('../models/Route');
const axios = require('axios');

class NetworkCoverageService {
  
  constructor() {
    // Network coverage APIs (if available)
    this.openCellIdApiKey = process.env.OPENCELLID_API_KEY;
    this.hereApiKey = process.env.HERE_API_KEY;
    
    // Indian telecom operators
    this.operators = ['airtel', 'jio', 'vi', 'bsnl'];
    
    // Coverage prediction models based on terrain and population
    this.coverageModels = {
      urban: { baseStrength: 9, deadZoneChance: 0.05, towerDensity: 'high' },
      suburban: { baseStrength: 8, deadZoneChance: 0.10, towerDensity: 'medium' },
      rural: { baseStrength: 6, deadZoneChance: 0.25, towerDensity: 'low' },
      hilly: { baseStrength: 4, deadZoneChance: 0.40, towerDensity: 'very_low' },
      mountainous: { baseStrength: 2, deadZoneChance: 0.60, towerDensity: 'very_low' },
      forest: { baseStrength: 3, deadZoneChance: 0.50, towerDensity: 'very_low' },
      desert: { baseStrength: 5, deadZoneChance: 0.30, towerDensity: 'low' }
    };
  }

  // Main method to analyze network coverage for a route
  async analyzeNetworkCoverage(routeId) {
    try {
      console.log('📶 Starting comprehensive network coverage analysis...');
      
      const route = await Route.findById(routeId);
      if (!route) {
        throw new Error('Route not found');
      }
      
      // Clear existing network coverage data
      await NetworkCoverage.deleteMany({ routeId });
      console.log('🗑️ Cleared existing network coverage data');
      
      // Analyze coverage for route segments
      const coveragePoints = [];
      const routeSegments = this.createRouteSegments(route.routePoints, 30);
      
      console.log(`📍 Analyzing ${routeSegments.length} route segments for network coverage...`);
      
      for (let i = 0; i < routeSegments.length; i++) {
        const segment = routeSegments[i];
        
        try {
          const coverageData = await this.analyzeCoveragePoint(segment, route, i, routeSegments.length);
          
          if (coverageData) {
            const networkPoint = new NetworkCoverage(coverageData);
            await networkPoint.save();
            coveragePoints.push(networkPoint);
            
            if (coverageData.isDeadZone) {
              console.log(`   ❌ DEAD ZONE detected at ${segment.latitude.toFixed(4)}, ${segment.longitude.toFixed(4)} (${coverageData.deadZoneSeverity})`);
            } else {
              console.log(`   ✅ Coverage OK at ${segment.latitude.toFixed(4)}, ${segment.longitude.toFixed(4)} (Signal: ${coverageData.signalStrength}/10)`);
            }
          }
          
        } catch (pointError) {
          console.warn(`   ⚠️ Failed to analyze coverage for segment ${i + 1}:`, pointError.message);
        }
      }
      
      // Generate comprehensive report
      const coverageReport = {
        routeId: route.routeId,
        routeName: route.routeName,
        totalDistance: route.totalDistance,
        terrain: route.terrain,
        
        // Coverage Statistics
        totalAnalysisPoints: coveragePoints.length,
        deadZones: {
          total: coveragePoints.filter(p => p.isDeadZone).length,
          severe: coveragePoints.filter(p => p.isDeadZone && p.deadZoneSeverity === 'severe').length,
          critical: coveragePoints.filter(p => p.isDeadZone && p.deadZoneSeverity === 'critical').length,
          averageRadius: this.calculateAverageDeadZoneRadius(coveragePoints),
          totalDuration: this.calculateTotalDeadZoneDuration(coveragePoints)
        },
        
        // Signal Quality
        averageSignalStrength: this.calculateAverageSignalStrength(coveragePoints),
        weakSignalAreas: coveragePoints.filter(p => p.signalStrength < 4).length,
        
        // Operator Coverage
        operatorAnalysis: this.analyzeOperatorCoverage(coveragePoints),
        
        // Risk Assessment
        communicationRisk: this.calculateOverallCommunicationRisk(coveragePoints),
        emergencyRisk: this.calculateOverallEmergencyRisk(coveragePoints),
        
        // Recommendations
        recommendations: this.generateNetworkRecommendations(coveragePoints, route),
        
        // Alternative Communication
        alternativeCommunication: this.recommendAlternativeCommunication(coveragePoints),
        
        analysisDate: new Date(),
        dataQuality: this.assessNetworkDataQuality(coveragePoints)
      };
      
      console.log(`✅ Network coverage analysis completed:`);
      console.log(`   📊 Total Points: ${coverageReport.totalAnalysisPoints}`);
      console.log(`   ❌ Dead Zones: ${coverageReport.deadZones.total} (${Math.round((coverageReport.deadZones.total / coverageReport.totalAnalysisPoints) * 100)}%)`);
      console.log(`   📶 Average Signal: ${coverageReport.averageSignalStrength}/10`);
      console.log(`   ⚠️ Communication Risk: ${coverageReport.communicationRisk}/10`);
      
      return coverageReport;
      
    } catch (error) {
      console.error('❌ Network coverage analysis failed:', error);
      throw error;
    }
  }

  // Analyze coverage for a specific point
  async analyzeCoveragePoint(segment, route, segmentIndex, totalSegments) {
    try {
      // Determine terrain type for this specific point
      const pointTerrain = this.determinePointTerrain(segment, route);
      
      // Get elevation data
      const elevation = await this.getElevation(segment.latitude, segment.longitude);
      
      // Analyze population density
      const populationDensity = this.estimatePopulationDensity(segment, pointTerrain);
      
      // Calculate base signal strength
      const baseSignal = this.calculateBaseSignalStrength(pointTerrain, populationDensity, elevation);
      
      // Apply terrain-specific interference
      const interferenceFactors = this.identifyInterferenceFactors(pointTerrain, elevation, segment);
      const adjustedSignal = this.applyInterference(baseSignal, interferenceFactors);
      
      // Determine if this is a dead zone
      const isDeadZone = this.isDeadZonePoint(adjustedSignal, pointTerrain);
      
      // Analyze operator-specific coverage
      const operatorCoverage = this.analyzeOperatorSpecificCoverage(adjustedSignal, pointTerrain, populationDensity);
      
      // Calculate dead zone properties
      const deadZoneProperties = isDeadZone ? 
        this.calculateDeadZoneProperties(adjustedSignal, pointTerrain, route.totalDistance, segmentIndex, totalSegments) : 
        {};
      
      // Calculate risk scores
      const communicationRisk = this.calculateCommunicationRisk(adjustedSignal, isDeadZone, interferenceFactors);
      const emergencyRisk = this.calculateEmergencyRisk(adjustedSignal, isDeadZone, pointTerrain);
      
      return {
        routeId: route._id,
        latitude: segment.latitude,
        longitude: segment.longitude,
        distanceFromStartKm: this.calculateDistanceFromStart(route.routePoints, segment),
        
        // Coverage Analysis
        coverageType: this.determineCoverageType(adjustedSignal),
        signalStrength: Math.round(adjustedSignal * 10) / 10,
        
        // Operator Coverage
        operatorCoverage,
        
        // Dead Zone Information
        isDeadZone,
        deadZoneRadius: deadZoneProperties.radius || 0,
        deadZoneSeverity: deadZoneProperties.severity || 'minor',
        deadZoneDuration: deadZoneProperties.duration || 0,
        
        // Geographic Information
        terrain: pointTerrain,
        elevation: elevation,
        populationDensity,
        
        // Interference
        interferenceFactors,
        
        // Risk Assessment
        communicationRisk,
        emergencyRisk,
        
        // Alternative Methods
        alternativeMethods: this.recommendAlternativeMethodsForPoint(isDeadZone, pointTerrain),
        
        // Recommendations
        recommendations: this.generatePointRecommendations(adjustedSignal, isDeadZone, pointTerrain),
        
        // Analysis Details
        analysisMethod: 'terrain_analysis',
        confidence: this.calculateConfidence(pointTerrain, populationDensity),
        dataSource: 'NETWORK_COVERAGE_SERVICE',
        lastUpdated: new Date()
      };
      
    } catch (error) {
      console.error('Point coverage analysis failed:', error);
      return null;
    }
  }

  // ============================================================================
  // HELPER METHODS (keeping the essential ones from original code)
  // ============================================================================

  createRouteSegments(routePoints, numberOfSegments) {
    const segments = [];
    const step = Math.max(1, Math.floor(routePoints.length / numberOfSegments));
    
    for (let i = 0; i < routePoints.length; i += step) {
      segments.push(routePoints[i]);
    }
    
    return segments;
  }

  calculateDistanceFromStart(routePoints, targetPoint) {
    if (!routePoints || routePoints.length === 0) return 0;
    
    let minDistance = Infinity;
    let nearestPointIndex = 0;
    
    for (let i = 0; i < routePoints.length; i++) {
      const distance = this.calculateDistance(
        routePoints[i].latitude, routePoints[i].longitude,
        targetPoint.latitude, targetPoint.longitude
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        nearestPointIndex = i;
      }
    }
    
    return routePoints[nearestPointIndex].distanceFromStart || 0;
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
    return R * c;
  }

  determinePointTerrain(segment, route) {
    const routeTerrain = route.terrain;
    const terrainVariations = {
      'urban': ['urban', 'suburban'],
      'rural': ['rural', 'suburban'],
      'hilly': ['hilly', 'mountainous'],
      'mixed': ['urban', 'suburban', 'rural', 'hilly'],
      'flat': ['rural', 'suburban']
    };
    
    const possibleTerrains = terrainVariations[routeTerrain] || [routeTerrain];
    return possibleTerrains[Math.floor(Math.random() * possibleTerrains.length)];
  }

  async getElevation(latitude, longitude) {
    try {
      // Rough elevation estimation for India
      if (latitude > 28 && latitude < 36) {
        return Math.random() * 3000 + 1000; // Himalayan region
      }
      
      if ((longitude > 73 && longitude < 77) && (latitude > 8 && latitude < 21)) {
        return Math.random() * 1500 + 500; // Western Ghats
      }
      
      return Math.random() * 300 + 50; // Plains
      
    } catch (error) {
      return 200; // Default elevation
    }
  }

  estimatePopulationDensity(segment, terrain) {
    const densityMapping = {
      'urban': 'very_high',
      'suburban': 'high',
      'rural': 'low',
      'hilly': 'very_low',
      'mountainous': 'very_low',
      'forest': 'very_low',
      'desert': 'very_low'
    };
    
    return densityMapping[terrain] || 'medium';
  }

  calculateBaseSignalStrength(terrain, populationDensity, elevation) {
    let baseStrength = this.coverageModels[terrain]?.baseStrength || 5;
    
    const densityAdjustments = {
      'very_high': 2, 'high': 1, 'medium': 0, 'low': -1, 'very_low': -2
    };
    
    baseStrength += densityAdjustments[populationDensity] || 0;
    
    // Elevation adjustments
    if (elevation > 2000) baseStrength -= 3;
    else if (elevation > 1000) baseStrength -= 2;
    else if (elevation > 500) baseStrength -= 1;
    
    return Math.max(0, Math.min(10, baseStrength));
  }

  identifyInterferenceFactors(terrain, elevation, segment) {
    const factors = [];
    
    if (terrain === 'mountainous' || terrain === 'hilly') factors.push('mountains');
    if (terrain === 'forest') factors.push('forests');
    if (terrain === 'urban') factors.push('buildings');
    if (elevation > 1500) factors.push('distance_from_tower');
    if (Math.random() > 0.8) factors.push('weather');
    
    return factors;
  }

  applyInterference(baseSignal, interferenceFactors) {
    let adjustedSignal = baseSignal;
    
    const interferenceImpact = {
      'mountains': -2, 'forests': -1.5, 'buildings': -1,
      'weather': -0.5, 'electronic_interference': -1, 'distance_from_tower': -1.5
    };
    
    interferenceFactors.forEach(factor => {
      adjustedSignal += interferenceImpact[factor] || 0;
    });
    
    return Math.max(0, Math.min(10, adjustedSignal));
  }

  isDeadZonePoint(signalStrength, terrain) {
    const deadZoneThresholds = {
      'urban': 2, 'suburban': 1.5, 'rural': 1, 'hilly': 0.5,
      'mountainous': 0.5, 'forest': 0.5, 'desert': 1
    };
    
    const threshold = deadZoneThresholds[terrain] || 1;
    return signalStrength <= threshold;
  }

  analyzeOperatorSpecificCoverage(signalStrength, terrain, populationDensity) {
    const operators = {};
    
    const operatorAdjustments = {
      airtel: { urban: 0.5, rural: 0, hilly: -0.5 },
      jio: { urban: 1, rural: 0.5, hilly: 0 },
      vi: { urban: 0, rural: -0.5, hilly: -1 },
      bsnl: { urban: -0.5, rural: 0.5, hilly: 0.5 }
    };
    
    this.operators.forEach(operator => {
      const adjustment = operatorAdjustments[operator][terrain] || 0;
      const operatorSignal = Math.max(0, Math.min(10, signalStrength + adjustment));
      
      operators[operator] = {
        coverage: Math.round(operatorSignal * 10),
        signalStrength: Math.round(operatorSignal * 10) / 10,
        technology: this.determineTechnology(operatorSignal, operator)
      };
    });
    
    return operators;
  }

  determineTechnology(signalStrength, operator) {
    if (signalStrength === 0) return 'No Service';
    if (signalStrength < 2) return '2G';
    if (signalStrength < 4) return '3G';
    if (signalStrength < 8) return '4G';
    return operator === 'jio' ? '5G' : '4G';
  }

  calculateDeadZoneProperties(signalStrength, terrain, totalDistance, segmentIndex, totalSegments) {
    const radiusEstimates = {
      'urban': 200, 'suburban': 500, 'rural': 1000, 'hilly': 2000,
      'mountainous': 5000, 'forest': 1500, 'desert': 3000
    };
    
    const baseRadius = radiusEstimates[terrain] || 1000;
    const radius = baseRadius * (1 - signalStrength / 10);
    
    let severity = 'minor';
    if (signalStrength === 0) severity = 'critical';
    else if (signalStrength < 0.5) severity = 'severe';
    else if (signalStrength < 1) severity = 'moderate';
    
    const duration = Math.max(1, Math.round((radius / 1000 / 50) * 60));
    
    return {
      radius: Math.round(radius),
      severity,
      duration
    };
  }

  determineCoverageType(signalStrength) {
    if (signalStrength === 0) return 'dead_zone';
    if (signalStrength < 2) return 'weak_signal';
    if (signalStrength < 6) return 'partial_coverage';
    return 'full_coverage';
  }

  calculateCommunicationRisk(signalStrength, isDeadZone, interferenceFactors) {
    let risk = 5;
    
    if (isDeadZone) risk += 4;
    else if (signalStrength < 3) risk += 2;
    else if (signalStrength < 5) risk += 1;
    else risk -= 1;
    
    risk += interferenceFactors.length * 0.5;
    
    return Math.max(1, Math.min(10, Math.round(risk * 10) / 10));
  }

  calculateEmergencyRisk(signalStrength, isDeadZone, terrain) {
    let risk = 3;
    
    if (isDeadZone) {
      risk += 5;
      if (terrain === 'mountainous' || terrain === 'forest') risk += 2;
    } else if (signalStrength < 2) {
      risk += 3;
    } else if (signalStrength < 4) {
      risk += 1;
    }
    
    return Math.max(1, Math.min(10, Math.round(risk * 10) / 10));
  }

  recommendAlternativeMethodsForPoint(isDeadZone, terrain) {
    const methods = [];
    
    if (isDeadZone) {
      methods.push('satellite_phone', 'two_way_radio');
      if (terrain === 'mountainous' || terrain === 'forest') {
        methods.push('emergency_beacon');
      }
    } else {
      methods.push('two_way_radio');
    }
    
    return methods;
  }

  generatePointRecommendations(signalStrength, isDeadZone, terrain) {
    const recommendations = [];
    
    if (isDeadZone) {
      recommendations.push('CRITICAL: No cellular coverage - use alternative communication');
      recommendations.push('Carry satellite phone or emergency beacon');
      recommendations.push('Inform control room before entering this area');
    } else if (signalStrength < 3) {
      recommendations.push('Weak signal area - test communication before proceeding');
      recommendations.push('Keep devices fully charged');
    }
    
    return recommendations;
  }

  calculateConfidence(terrain, populationDensity) {
    let confidence = 0.7;
    
    if (terrain === 'urban') confidence += 0.2;
    if (populationDensity === 'very_high') confidence += 0.1;
    if (terrain === 'mountainous' || terrain === 'forest') confidence -= 0.2;
    if (populationDensity === 'very_low') confidence -= 0.1;
    
    return Math.max(0.3, Math.min(0.95, confidence));
  }

  // ============================================================================
  // SUMMARY CALCULATION METHODS
  // ============================================================================

  calculateAverageDeadZoneRadius(coveragePoints) {
    const deadZones = coveragePoints.filter(p => p.isDeadZone && p.deadZoneRadius > 0);
    if (deadZones.length === 0) return 0;
    
    return Math.round(deadZones.reduce((sum, dz) => sum + dz.deadZoneRadius, 0) / deadZones.length);
  }

// File: services/networkCoverageService.js - Part 2 (Summary & API Methods)
// Purpose: Continuation of Network Coverage Service

  calculateTotalDeadZoneDuration(coveragePoints) {
    return coveragePoints
      .filter(p => p.isDeadZone)
      .reduce((sum, dz) => sum + dz.deadZoneDuration, 0);
  }

  calculateAverageSignalStrength(coveragePoints) {
    if (coveragePoints.length === 0) return 0;
    
    return Math.round((coveragePoints.reduce((sum, p) => sum + p.signalStrength, 0) / coveragePoints.length) * 10) / 10;
  }

  analyzeOperatorCoverage(coveragePoints) {
    const analysis = {};
    
    this.operators.forEach(operator => {
      const operatorData = coveragePoints.map(p => p.operatorCoverage[operator]);
      
      analysis[operator] = {
        averageCoverage: Math.round(operatorData.reduce((sum, data) => sum + data.coverage, 0) / operatorData.length),
        averageSignal: Math.round((operatorData.reduce((sum, data) => sum + data.signalStrength, 0) / operatorData.length) * 10) / 10,
        deadZones: operatorData.filter(data => data.coverage === 0).length,
        technology: this.findDominantTechnology(operatorData),
        reliability: this.calculateOperatorReliability(operatorData)
      };
    });
    
    return analysis;
  }

  findDominantTechnology(operatorData) {
    const techCounts = operatorData.reduce((counts, data) => {
      counts[data.technology] = (counts[data.technology] || 0) + 1;
      return counts;
    }, {});
    
    return Object.entries(techCounts).reduce((dominant, [tech, count]) => {
      return count > (techCounts[dominant[0]] || 0) ? [tech, count] : dominant;
    }, ['No Service', 0])[0];
  }

  calculateOperatorReliability(operatorData) {
    const reliablePoints = operatorData.filter(data => data.signalStrength >= 5).length;
    const reliability = (reliablePoints / operatorData.length) * 100;
    
    if (reliability >= 90) return 'excellent';
    if (reliability >= 75) return 'good';
    if (reliability >= 50) return 'fair';
    return 'poor';
  }

  calculateOverallCommunicationRisk(coveragePoints) {
    if (coveragePoints.length === 0) return 5;
    
    return Math.round((coveragePoints.reduce((sum, p) => sum + p.communicationRisk, 0) / coveragePoints.length) * 10) / 10;
  }

  calculateOverallEmergencyRisk(coveragePoints) {
    if (coveragePoints.length === 0) return 5;
    
    return Math.round((coveragePoints.reduce((sum, p) => sum + p.emergencyRisk, 0) / coveragePoints.length) * 10) / 10;
  }

  generateNetworkRecommendations(coveragePoints, route) {
    const recommendations = [];
    const deadZones = coveragePoints.filter(p => p.isDeadZone);
    const weakSignalAreas = coveragePoints.filter(p => p.signalStrength < 4 && !p.isDeadZone);
    
    // Dead zone recommendations
    if (deadZones.length > 0) {
      const deadZonePercentage = (deadZones.length / coveragePoints.length) * 100;
      
      if (deadZonePercentage > 30) {
        recommendations.push({
          priority: 'CRITICAL',
          category: 'route_planning',
          recommendation: `${Math.round(deadZonePercentage)}% of route has no cellular coverage - consider alternative route`,
          action: 'Evaluate alternative routing options'
        });
      }
      
      recommendations.push({
        priority: 'HIGH',
        category: 'communication_equipment',
        recommendation: `${deadZones.length} dead zones identified - mandatory satellite communication`,
        action: 'Equip vehicles with satellite phones or emergency beacons'
      });
      
      recommendations.push({
        priority: 'HIGH',
        category: 'safety_protocol',
        recommendation: 'Implement dead zone safety protocols',
        action: 'Brief drivers on dead zone locations and emergency procedures'
      });
    }
    
    // Weak signal recommendations
    if (weakSignalAreas.length > 0) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'equipment',
        recommendation: `${weakSignalAreas.length} areas with weak signal detected`,
        action: 'Use external antennas and keep devices fully charged'
      });
    }
    
    // Terrain-specific recommendations
    if (route.terrain === 'hilly' || route.terrain === 'mountainous') {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'terrain_specific',
        recommendation: 'Mountainous terrain affects signal quality',
        action: 'Carry backup communication methods for mountain areas'
      });
    }
    
    // General recommendations
    recommendations.push({
      priority: 'STANDARD',
      category: 'general_safety',
      recommendation: 'Standard communication safety protocols',
      action: 'Test communication at regular intervals and report status'
    });
    
    return recommendations;
  }

  recommendAlternativeCommunication(coveragePoints) {
    const deadZones = coveragePoints.filter(p => p.isDeadZone);
    const severeCoverageIssues = coveragePoints.filter(p => p.signalStrength < 2);
    
    const recommendations = {
      essential: [],
      recommended: [],
      optional: []
    };
    
    if (deadZones.length > 0) {
      recommendations.essential.push({
        method: 'satellite_phone',
        description: 'Satellite communication for dead zones',
        coverage: 'Global coverage, works in all dead zones',
        cost: 'High initial cost, per-minute charges'
      });
      
      recommendations.essential.push({
        method: 'two_way_radio',
        description: 'VHF/UHF radio communication',
        coverage: '10-50km range depending on terrain',
        cost: 'Moderate one-time cost'
      });
    }
    
    if (severeCoverageIssues.length > coveragePoints.length * 0.2) {
      recommendations.recommended.push({
        method: 'emergency_beacon',
        description: 'GPS emergency locator beacon',
        coverage: 'Global emergency services notification',
        cost: 'Moderate, subscription required'
      });
    }
    
    recommendations.optional.push({
      method: 'wifi_hotspot',
      description: 'Mobile WiFi hotspot devices',
      coverage: 'Better coverage in some areas',
      cost: 'Low to moderate'
    });
    
    return recommendations;
  }

  assessNetworkDataQuality(coveragePoints) {
    let qualityScore = 0;
    let maxScore = 0;
    
    // Analysis point density
    maxScore += 30;
    if (coveragePoints.length >= 25) qualityScore += 30;
    else if (coveragePoints.length >= 15) qualityScore += 20;
    else if (coveragePoints.length >= 10) qualityScore += 15;
    else qualityScore += 10;
    
    // Confidence level
    maxScore += 30;
    const avgConfidence = coveragePoints.reduce((sum, p) => sum + p.confidence, 0) / coveragePoints.length;
    qualityScore += Math.round(avgConfidence * 30);
    
    // Data completeness
    maxScore += 40;
    const completePoints = coveragePoints.filter(p => 
      p.operatorCoverage && 
      p.terrain && 
      p.signalStrength !== undefined
    ).length;
    qualityScore += Math.round((completePoints / coveragePoints.length) * 40);
    
    const percentage = Math.round((qualityScore / maxScore) * 100);
    
    let quality = 'poor';
    if (percentage >= 90) quality = 'excellent';
    else if (percentage >= 75) quality = 'good';
    else if (percentage >= 60) quality = 'fair';
    
    return {
      level: quality,
      score: percentage,
      details: {
        analysisPoints: coveragePoints.length,
        averageConfidence: Math.round(avgConfidence * 100) / 100,
        dataCompleteness: Math.round((completePoints / coveragePoints.length) * 100)
      }
    };
  }

  // ============================================================================
  // PUBLIC API METHODS FOR ROUTE INTEGRATION
  // ============================================================================

  async getNetworkCoverageForRoute(routeId) {
    try {
      const coveragePoints = await NetworkCoverage.find({ routeId }).sort({ distanceFromStartKm: 1 });
      
      if (coveragePoints.length === 0) {
        return {
          exists: false,
          message: 'No network coverage analysis found for this route'
        };
      }
      
      return {
        exists: true,
        totalPoints: coveragePoints.length,
        deadZones: coveragePoints.filter(p => p.isDeadZone).length,
        averageSignal: this.calculateAverageSignalStrength(coveragePoints),
        communicationRisk: this.calculateOverallCommunicationRisk(coveragePoints),
        points: coveragePoints
      };
      
    } catch (error) {
      throw new Error(`Failed to get network coverage: ${error.message}`);
    }
  }

  async getDeadZonesForRoute(routeId) {
    try {
      const deadZones = await NetworkCoverage.find({ 
        routeId, 
        isDeadZone: true 
      }).sort({ distanceFromStartKm: 1 });
      
      return {
        total: deadZones.length,
        deadZones: deadZones.map(dz => ({
          location: {
            latitude: dz.latitude,
            longitude: dz.longitude,
            distanceFromStart: dz.distanceFromStartKm
          },
          severity: dz.deadZoneSeverity,
          radius: dz.deadZoneRadius,
          duration: dz.deadZoneDuration,
          terrain: dz.terrain,
          recommendations: dz.recommendations
        }))
      };
      
    } catch (error) {
      throw new Error(`Failed to get dead zones: ${error.message}`);
    }
  }

  async getCoverageByOperator(routeId, operator) {
    try {
      const coveragePoints = await NetworkCoverage.find({ routeId });
      
      if (coveragePoints.length === 0) {
        return { error: 'No coverage data found' };
      }
      
      const operatorData = coveragePoints.map(p => ({
        location: {
          latitude: p.latitude,
          longitude: p.longitude,
          distanceFromStart: p.distanceFromStartKm
        },
        coverage: p.operatorCoverage[operator]?.coverage || 0,
        signalStrength: p.operatorCoverage[operator]?.signalStrength || 0,
        technology: p.operatorCoverage[operator]?.technology || 'No Service'
      }));
      
      return {
        operator: operator.toUpperCase(),
        totalPoints: operatorData.length,
        averageCoverage: Math.round(operatorData.reduce((sum, d) => sum + d.coverage, 0) / operatorData.length),
        deadZones: operatorData.filter(d => d.coverage === 0).length,
        averageSignal: Math.round((operatorData.reduce((sum, d) => sum + d.signalStrength, 0) / operatorData.length) * 10) / 10,
        points: operatorData
      };
      
    } catch (error) {
      throw new Error(`Failed to get operator coverage: ${error.message}`);
    }
  }

  // ============================================================================
  // ADDITIONAL UTILITY METHODS
  // ============================================================================

  async deleteNetworkCoverageData(routeId) {
    try {
      const deleteResult = await NetworkCoverage.deleteMany({ routeId });
      return {
        success: true,
        deletedPoints: deleteResult.deletedCount,
        message: `Deleted ${deleteResult.deletedCount} network coverage points`
      };
    } catch (error) {
      throw new Error(`Failed to delete network coverage data: ${error.message}`);
    }
  }

  async getNetworkCoverageStats(routeId) {
    try {
      const stats = await NetworkCoverage.getRouteCoverageAnalysis(routeId);
      
      if (stats.length === 0) {
        return {
          exists: false,
          message: 'No network coverage statistics available'
        };
      }
      
      return {
        exists: true,
        stats: stats[0]
      };
      
    } catch (error) {
      throw new Error(`Failed to get network coverage stats: ${error.message}`);
    }
  }
}

// Export the service instance
module.exports = {
  NetworkCoverageService: new NetworkCoverageService()
};