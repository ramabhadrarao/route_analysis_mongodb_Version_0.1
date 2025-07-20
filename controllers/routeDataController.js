// ============================================================================
// FILE 1: controllers/routeDataController.js (FIXED VERSION)
// ============================================================================

const Route = require('../models/Route');
const WeatherCondition = require('../models/WeatherCondition');
const TrafficData = require('../models/TrafficData');
const SharpTurn = require('../models/SharpTurn');
const RoadCondition = require('../models/RoadCondition');
const NetworkCoverage = require('../models/NetworkCoverage');
const EmergencyService = require('../models/EmergencyService');
const BlindSpot = require('../models/BlindSpot');
const AccidentProneArea = require('../models/AccidentProneArea');

/**
 * Get ALL data for a route from all collections
 * GET /api/route-data/:routeId/getalldata
 */
const getAllRouteData = async (req, res) => {
  try {
    const { routeId } = req.params;
    const userId = req.user.id;
    
    console.log(`🔍 Fetching ALL data for route: ${routeId}`);
    
    // Verify route exists and belongs to user
    const route = await Route.findOne({
      _id: routeId,
      userId,
      status: { $ne: 'deleted' }
    });

    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found or access denied',
        routeId
      });
    }

    const startTime = Date.now();

    // Fetch ALL data from ALL collections in parallel
    const [
      weatherConditions,
      trafficData,
      sharpTurns,
      roadConditions,
      networkCoverage,
      emergencyServices,
      blindSpots,
      accidentProneAreas
    ] = await Promise.all([
      WeatherCondition.find({ routeId }).sort({ distanceFromStartKm: 1 }),
      TrafficData.find({ routeId }).sort({ distanceFromStartKm: 1 }),
      SharpTurn.find({ routeId }).sort({ distanceFromStartKm: 1 }),
      RoadCondition.find({ routeId }).sort({ distanceFromStartKm: 1 }),
      NetworkCoverage.find({ routeId }).sort({ distanceFromStartKm: 1 }),
      EmergencyService.find({ routeId }).sort({ distanceFromRouteKm: 1 }),
      BlindSpot.find({ routeId }).sort({ distanceFromStartKm: 1 }),
      AccidentProneArea.find({ routeId }).sort({ distanceFromStartKm: 1 })
    ]);

    const executionTime = Date.now() - startTime;

    // Calculate statistics
    const statistics = {
      totalDataPoints: weatherConditions.length + trafficData.length + sharpTurns.length + 
                      roadConditions.length + networkCoverage.length + emergencyServices.length + 
                      blindSpots.length + accidentProneAreas.length,
      
      dataDistribution: {
        weatherConditions: weatherConditions.length,
        trafficData: trafficData.length,
        sharpTurns: sharpTurns.length,
        roadConditions: roadConditions.length,
        networkCoverage: networkCoverage.length,
        emergencyServices: emergencyServices.length,
        blindSpots: blindSpots.length,
        accidentProneAreas: accidentProneAreas.length
      },
      
      averageRiskScores: {
        weather: weatherConditions.length > 0 ? 
          Math.round((weatherConditions.reduce((sum, w) => sum + w.riskScore, 0) / weatherConditions.length) * 100) / 100 : 0,
        traffic: trafficData.length > 0 ? 
          Math.round((trafficData.reduce((sum, t) => sum + t.riskScore, 0) / trafficData.length) * 100) / 100 : 0,
        sharpTurns: sharpTurns.length > 0 ? 
          Math.round((sharpTurns.reduce((sum, s) => sum + s.riskScore, 0) / sharpTurns.length) * 100) / 100 : 0,
        roadConditions: roadConditions.length > 0 ? 
          Math.round((roadConditions.reduce((sum, r) => sum + r.riskScore, 0) / roadConditions.length) * 100) / 100 : 0,
        blindSpots: blindSpots.length > 0 ? 
          Math.round((blindSpots.reduce((sum, b) => sum + b.riskScore, 0) / blindSpots.length) * 100) / 100 : 0,
        accidentAreas: accidentProneAreas.length > 0 ? 
          Math.round((accidentProneAreas.reduce((sum, a) => sum + a.riskScore, 0) / accidentProneAreas.length) * 100) / 100 : 0
      },
      
      criticalPoints: {
        sharpTurns: sharpTurns.filter(s => s.riskScore >= 8).length,
        blindSpots: blindSpots.filter(b => b.riskScore >= 8).length,
        accidentAreas: accidentProneAreas.filter(a => a.riskScore >= 8).length,
        networkDeadZones: networkCoverage.filter(n => n.isDeadZone).length
      }
    };

    // Risk assessment
    const averageRisk = Object.values(statistics.averageRiskScores).filter(score => score > 0);
    const overallRiskScore = averageRisk.length > 0 ? 
      Math.round((averageRisk.reduce((sum, score) => sum + score, 0) / averageRisk.length) * 100) / 100 : 0;
    
    let overallRiskLevel = 'LOW';
    if (overallRiskScore >= 8) overallRiskLevel = 'CRITICAL';
    else if (overallRiskScore >= 6) overallRiskLevel = 'HIGH';
    else if (overallRiskScore >= 4) overallRiskLevel = 'MEDIUM';

    const totalCriticalPoints = Object.values(statistics.criticalPoints).reduce((sum, count) => sum + count, 0);

    // Generate recommendations
    const recommendations = [];
    if (totalCriticalPoints > 5) {
      recommendations.push({
        priority: 'CRITICAL',
        message: `${totalCriticalPoints} critical risk points detected`,
        action: 'Consider alternative route or enhanced safety measures'
      });
    }

    // Detailed data
    const detailedData = {
      weatherConditions: weatherConditions.map(w => ({
        id: w._id,
        coordinates: { latitude: w.latitude, longitude: w.longitude },
        condition: w.weatherCondition,
        temperature: w.averageTemperature,
        riskScore: w.riskScore,
        surfaceCondition: w.roadSurfaceCondition
      })),
      
      trafficData: trafficData.map(t => ({
        id: t._id,
        coordinates: { latitude: t.latitude, longitude: t.longitude },
        congestionLevel: t.congestionLevel,
        averageSpeed: t.averageSpeedKmph,
        riskScore: t.riskScore
      })),
      
      sharpTurns: sharpTurns.map(s => ({
        id: s._id,
        coordinates: { latitude: s.latitude, longitude: s.longitude },
        turnAngle: s.turnAngle,
        turnDirection: s.turnDirection,
        severity: s.turnSeverity,
        riskScore: s.riskScore,
        recommendedSpeed: s.recommendedSpeed
      })),
      
      roadConditions: roadConditions.map(r => ({
        id: r._id,
        coordinates: { latitude: r.latitude, longitude: r.longitude },
        roadType: r.roadType,
        surfaceQuality: r.surfaceQuality,
        riskScore: r.riskScore,
        issues: {
          potholes: r.hasPotholes,
          construction: r.underConstruction
        }
      })),
      
      networkCoverage: networkCoverage.map(n => ({
        id: n._id,
        coordinates: { latitude: n.latitude, longitude: n.longitude },
        coverageType: n.coverageType,
        signalStrength: n.signalStrength,
        isDeadZone: n.isDeadZone,
        communicationRisk: n.communicationRisk
      })),
      
      emergencyServices: emergencyServices.map(e => ({
        id: e._id,
        type: e.serviceType,
        name: e.name,
        coordinates: { latitude: e.latitude, longitude: e.longitude },
        distanceFromRoute: e.distanceFromRouteKm,
        responseTime: e.responseTimeMinutes
      })),
      
      blindSpots: blindSpots.map(b => ({
        id: b._id,
        coordinates: { latitude: b.latitude, longitude: b.longitude },
        spotType: b.spotType,
        visibilityDistance: b.visibilityDistance,
        riskScore: b.riskScore,
        severity: b.severityLevel
      })),
      
      accidentProneAreas: accidentProneAreas.map(a => ({
        id: a._id,
        coordinates: { latitude: a.latitude, longitude: a.longitude },
        frequency: a.accidentFrequencyYearly,
        severity: a.accidentSeverity,
        riskScore: a.riskScore,
        commonTypes: a.commonAccidentTypes
      }))
    };

    console.log(`✅ All route data fetched successfully in ${executionTime}ms`);

    res.status(200).json({
      success: true,
      message: 'All route data fetched successfully',
      executionTime: `${executionTime}ms`,
      
      routeInfo: {
        routeId: route.routeId,
        routeName: route.routeName,
        fromName: route.fromName,
        toName: route.toName,
        totalDistance: route.totalDistance,
        terrain: route.terrain,
        riskLevel: route.riskLevel,
        gpsPoints: route.routePoints?.length || 0,
        liveMapLink: route.liveMapLink
      },
      
      statistics,
      
      riskAssessment: {
        overallRiskLevel,
        overallRiskScore,
        totalCriticalPoints,
        criticalBreakdown: statistics.criticalPoints
      },
      
      detailedData,
      recommendations,
      
      dataQuality: {
        completeness: Math.round((Object.values(statistics.dataDistribution).filter(count => count > 0).length / 8) * 100),
        totalCollections: 8,
        collectionsWithData: Object.values(statistics.dataDistribution).filter(count => count > 0).length
      },
      
      performanceMetrics: {
        executionTime,
        totalQueries: 8,
        dataPointsReturned: statistics.totalDataPoints,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Get all route data error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching comprehensive route data',
      error: error.message,
      routeId: req.params.routeId
    });
  }
};

module.exports = {
  getAllRouteData
};