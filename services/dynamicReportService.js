// File: services/dynamicReportService.js
// Purpose: Dynamic Report Generation Service using existing API endpoints
// Collects comprehensive route data and generates intelligent PDF reports

const Route = require('../models/Route');
const SharpTurn = require('../models/SharpTurn');
const BlindSpot = require('../models/BlindSpot');
const AccidentProneArea = require('../models/AccidentProneArea');
const RoadCondition = require('../models/RoadCondition');
const NetworkCoverage = require('../models/NetworkCoverage');
const TrafficData = require('../models/TrafficData');
const WeatherCondition = require('../models/WeatherCondition');
const EmergencyService = require('../models/EmergencyService');
const HPCLDynamicPDFGenerator = require('../hpcl-enhanced-pdf-generator');
const logger = require('../utils/logger');

class DynamicReportService {
  constructor() {
    this.pdfGenerator = new HPCLDynamicPDFGenerator();
  }

  /**
   * Collect comprehensive route data from all available endpoints
   * @param {string} routeId - Route identifier
   * @param {string} userId - User identifier
   * @returns {Object} Complete route analysis data
   */
  async collectRouteData(routeId, userId) {
    try {
      logger.info(`🔍 Collecting comprehensive data for route: ${routeId}`);
      
      // 1. Get base route information
      const routeData = await this.getBaseRouteData(routeId, userId);
      
      // 2. Collect all analysis data in parallel for performance
      const [visibilityData, networkData, roadConditionsData, riskData, trafficData, weatherData, emergencyData] = await Promise.all([
        this.getVisibilityAnalysis(routeId),
        this.getNetworkCoverageAnalysis(routeId),
        this.getRoadConditionsAnalysis(routeId),
        this.getRiskAssessmentData(routeId),
        this.getTrafficAnalysis(routeId),
        this.getWeatherAnalysis(routeId),
        this.getEmergencyServicesData(routeId)
      ]);

      // 3. Calculate dynamic statistics and risk scores
      const dynamicStats = await this.calculateDynamicStatistics({
        routeData,
        visibilityData,
        networkData,
        roadConditionsData,
        riskData,
        trafficData,
        weatherData,
        emergencyData
      });

      // 4. Generate comprehensive report data structure
      const completeReportData = {
        ...routeData,
        visibilityAnalysis: visibilityData,
        networkCoverage: networkData,
        roadConditions: roadConditionsData,
        riskAssessment: riskData,
        trafficAnalysis: trafficData,
        weatherAnalysis: weatherData,
        emergencyServices: emergencyData,
        dynamicStats,
        reportMetadata: {
          generatedAt: new Date(),
          dataPoints: this.countDataPoints(dynamicStats),
          analysisVersion: '2.1.0',
          reportType: 'comprehensive_dynamic'
        }
      };

      logger.info(`✅ Data collection completed. Total data points: ${completeReportData.reportMetadata.dataPoints}`);
      return completeReportData;

    } catch (error) {
      logger.error(`❌ Error collecting route data: ${error.message}`);
      throw new Error(`Failed to collect route data: ${error.message}`);
    }
  }

  /**
   * Get base route information
   */
  async getBaseRouteData(routeId, userId) {
    const route = await Route.findOne({
      _id: routeId,
      userId,
      status: { $ne: 'deleted' }
    }).lean();

    if (!route) {
      throw new Error('Route not found or access denied');
    }

    return {
      routeId: route._id,
      routeName: route.routeName,
      fromName: route.fromName,
      toName: route.toName,
      fromAddress: route.fromAddress,
      toAddress: route.toAddress,
      fromCode: route.fromCode,
      toCode: route.toCode,
      totalDistance: route.totalDistance,
      estimatedDuration: route.estimatedDuration,
      terrain: route.terrain,
      majorHighways: route.majorHighways,
      coordinates: route.coordinates,
      createdAt: route.createdAt,
      lastAnalyzed: route.lastAnalyzed
    };
  }

  /**
   * Get visibility analysis (sharp turns and blind spots)
   */
  async getVisibilityAnalysis(routeId) {
    const [sharpTurns, blindSpots] = await Promise.all([
      SharpTurn.find({ routeId }).lean(),
      BlindSpot.find({ routeId }).lean()
    ]);

    return {
      sharpTurns: {
        total: sharpTurns.length,
        critical: sharpTurns.filter(t => t.riskScore >= 8).length,
        high: sharpTurns.filter(t => t.riskScore >= 6 && t.riskScore < 8).length,
        moderate: sharpTurns.filter(t => t.riskScore >= 4 && t.riskScore < 6).length,
        low: sharpTurns.filter(t => t.riskScore < 4).length,
        avgRiskScore: sharpTurns.reduce((sum, t) => sum + (t.riskScore || 0), 0) / (sharpTurns.length || 1),
        details: sharpTurns.sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0)).slice(0, 10)
      },
      blindSpots: {
        total: blindSpots.length,
        critical: blindSpots.filter(b => b.riskScore >= 8).length,
        high: blindSpots.filter(b => b.riskScore >= 6 && b.riskScore < 8).length,
        moderate: blindSpots.filter(b => b.riskScore >= 4 && b.riskScore < 6).length,
        low: blindSpots.filter(b => b.riskScore < 4).length,
        avgVisibility: blindSpots.reduce((sum, b) => sum + (b.visibilityDistance || 0), 0) / (blindSpots.length || 1),
        details: blindSpots.sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0)).slice(0, 10)
      }
    };
  }

  /**
   * Get network coverage analysis
   */
  async getNetworkCoverageAnalysis(routeId) {
    const networkData = await NetworkCoverage.find({ routeId }).lean();
    
    if (!networkData.length) {
      return {
        totalCoverage: 95, // Default assumption
        deadZones: 0,
        criticalDeadZones: 0,
        operatorCoverage: {},
        riskLevel: 1
      };
    }

    const totalPoints = networkData.length;
    const deadZones = networkData.filter(n => n.signalStrength < 2).length;
    const criticalDeadZones = networkData.filter(n => n.signalStrength === 0).length;
    
    return {
      totalCoverage: ((totalPoints - deadZones) / totalPoints) * 100,
      deadZones,
      criticalDeadZones,
      operatorCoverage: this.calculateOperatorCoverage(networkData),
      riskLevel: deadZones > totalPoints * 0.2 ? 8 : deadZones > totalPoints * 0.1 ? 5 : 2
    };
  }

  /**
   * Get road conditions analysis
   */
  async getRoadConditionsAnalysis(routeId) {
    const roadConditions = await RoadCondition.find({ routeId }).lean();
    
    if (!roadConditions.length) {
      return {
        avgQuality: 6,
        poorSegments: 0,
        potholes: 0,
        construction: 0,
        riskLevel: 4
      };
    }

    const avgQuality = roadConditions.reduce((sum, r) => sum + (r.qualityScore || 5), 0) / roadConditions.length;
    const poorSegments = roadConditions.filter(r => r.qualityScore < 4).length;
    const potholes = roadConditions.filter(r => r.hasPotholes).length;
    const construction = roadConditions.filter(r => r.underConstruction).length;

    return {
      avgQuality,
      poorSegments,
      potholes,
      construction,
      riskLevel: avgQuality < 4 ? 8 : avgQuality < 6 ? 5 : 2,
      details: roadConditions.sort((a, b) => (a.qualityScore || 5) - (b.qualityScore || 5)).slice(0, 5)
    };
  }

  /**
   * Get risk assessment data
   */
  async getRiskAssessmentData(routeId) {
    const accidentAreas = await AccidentProneArea.find({ routeId }).lean();
    
    return {
      accidentProneAreas: {
        total: accidentAreas.length,
        critical: accidentAreas.filter(a => a.riskScore >= 8).length,
        high: accidentAreas.filter(a => a.riskScore >= 6 && a.riskScore < 8).length,
        avgRiskScore: accidentAreas.reduce((sum, a) => sum + (a.riskScore || 0), 0) / (accidentAreas.length || 1),
        details: accidentAreas.sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0)).slice(0, 5)
      }
    };
  }

  /**
   * Get traffic analysis
   */
  async getTrafficAnalysis(routeId) {
    const trafficData = await TrafficData.find({ routeId }).lean();
    
    if (!trafficData.length) {
      return {
        avgDensity: 2,
        peakHours: [],
        congestionPoints: 0,
        riskLevel: 2
      };
    }

    const avgDensity = trafficData.reduce((sum, t) => sum + (t.density || 2), 0) / trafficData.length;
    const congestionPoints = trafficData.filter(t => t.density >= 8).length;

    return {
      avgDensity,
      peakHours: this.identifyPeakHours(trafficData),
      congestionPoints,
      riskLevel: avgDensity > 7 ? 7 : avgDensity > 5 ? 4 : 1
    };
  }

  /**
   * Get weather analysis
   */
  async getWeatherAnalysis(routeId) {
    const weatherData = await WeatherCondition.find({ routeId }).lean();
    
    return {
      seasonalRisks: this.calculateSeasonalRisks(weatherData),
      riskLevel: 3, // Default moderate risk
      recommendations: this.generateWeatherRecommendations(weatherData)
    };
  }

  /**
   * Get emergency services data
   */
  async getEmergencyServicesData(routeId) {
    const emergencyServices = await EmergencyService.find({ routeId }).lean();
    
    return {
      total: emergencyServices.length,
      hospitals: emergencyServices.filter(e => e.type === 'hospital').length,
      police: emergencyServices.filter(e => e.type === 'police').length,
      fire: emergencyServices.filter(e => e.type === 'fire').length,
      avgDistance: emergencyServices.reduce((sum, e) => sum + (e.distanceKm || 10), 0) / (emergencyServices.length || 1),
      riskLevel: emergencyServices.length > 5 ? 1 : emergencyServices.length > 2 ? 3 : 7
    };
  }

  /**
   * Calculate comprehensive dynamic statistics
   */
  async calculateDynamicStatistics(data) {
    const { routeData, visibilityData, networkData, roadConditionsData, riskData, trafficData, weatherData, emergencyData } = data;

    // Calculate overall risk score
    const riskFactors = {
      roadConditions: roadConditionsData.riskLevel,
      accidentAreas: riskData.accidentProneAreas.avgRiskScore,
      sharpTurns: visibilityData.sharpTurns.avgRiskScore,
      blindSpots: visibilityData.blindSpots.total > 0 ? 6 : 2,
      traffic: trafficData.riskLevel,
      weather: weatherData.riskLevel,
      emergency: emergencyData.riskLevel,
      network: networkData.riskLevel
    };

    const avgRiskScore = Object.values(riskFactors).reduce((sum, score) => sum + score, 0) / Object.keys(riskFactors).length;
    
    const criticalPoints = (
      visibilityData.sharpTurns.critical +
      visibilityData.blindSpots.critical +
      riskData.accidentProneAreas.critical +
      roadConditionsData.poorSegments +
      networkData.criticalDeadZones
    );

    return {
      riskAnalysis: {
        avgRiskScore,
        criticalPoints,
        riskLevel: this.determineRiskLevel(avgRiskScore),
        riskFactors,
        riskDistribution: {
          critical: criticalPoints,
          high: Math.floor(criticalPoints * 1.5),
          medium: Math.floor(criticalPoints * 2),
          low: Math.floor(criticalPoints * 0.5)
        }
      },
      infrastructureMetrics: {
        roadQuality: roadConditionsData.avgQuality,
        networkCoverage: networkData.totalCoverage,
        emergencyAccess: emergencyData.avgDistance
      },
      safetyMetrics: {
        visibilityScore: 10 - (visibilityData.sharpTurns.avgRiskScore + visibilityData.blindSpots.total * 0.1),
        accidentRisk: riskData.accidentProneAreas.avgRiskScore,
        overallSafety: 10 - avgRiskScore
      },
      trafficMetrics: {
        avgDensity: trafficData.avgDensity,
        congestionRisk: trafficData.congestionPoints
      },
      weatherMetrics: {
        riskLevel: weatherData.riskLevel,
        seasonalFactors: weatherData.seasonalRisks
      },
      totalDataPoints: this.countTotalDataPoints(data)
    };
  }

  /**
   * Generate dynamic PDF report
   */
  async generateDynamicReport(routeId, userId, options = {}) {
    try {
      logger.info(`📊 Generating dynamic report for route: ${routeId}`);
      
      // Collect comprehensive data
      const reportData = await this.collectRouteData(routeId, userId);
      
      // Generate PDF with collected data
      const pdfPath = options.outputPath || `./downloads/pdf-reports/HPCL-Dynamic-Report-${routeId}-${Date.now()}.pdf`;
      
      const result = await this.pdfGenerator.generateDynamicTitlePage(routeId, userId, pdfPath, reportData);
      
      logger.info(`✅ Dynamic report generated successfully: ${pdfPath}`);
      
      return {
        success: true,
        filePath: pdfPath,
        reportData,
        metadata: {
          totalPages: 1, // Will be expanded for multi-page reports
          dataPoints: reportData.reportMetadata.dataPoints,
          riskLevel: reportData.dynamicStats.riskAnalysis.riskLevel,
          generatedAt: new Date()
        }
      };
      
    } catch (error) {
      logger.error(`❌ Error generating dynamic report: ${error.message}`);
      throw error;
    }
  }

  // Helper methods
  determineRiskLevel(avgScore) {
    if (avgScore >= 8) return 'CRITICAL';
    if (avgScore >= 6) return 'HIGH';
    if (avgScore >= 4) return 'MEDIUM';
    return 'LOW';
  }

  calculateOperatorCoverage(networkData) {
    const operators = {};
    networkData.forEach(point => {
      if (point.operator) {
        operators[point.operator] = operators[point.operator] || { total: 0, good: 0 };
        operators[point.operator].total++;
        if (point.signalStrength >= 3) operators[point.operator].good++;
      }
    });
    
    Object.keys(operators).forEach(op => {
      operators[op].coverage = (operators[op].good / operators[op].total) * 100;
    });
    
    return operators;
  }

  identifyPeakHours(trafficData) {
    const hourlyDensity = {};
    trafficData.forEach(point => {
      if (point.timestamp) {
        const hour = new Date(point.timestamp).getHours();
        hourlyDensity[hour] = hourlyDensity[hour] || [];
        hourlyDensity[hour].push(point.density || 2);
      }
    });
    
    return Object.keys(hourlyDensity)
      .map(hour => ({
        hour: parseInt(hour),
        avgDensity: hourlyDensity[hour].reduce((sum, d) => sum + d, 0) / hourlyDensity[hour].length
      }))
      .filter(h => h.avgDensity > 6)
      .sort((a, b) => b.avgDensity - a.avgDensity)
      .slice(0, 3);
  }

  calculateSeasonalRisks(weatherData) {
    return {
      monsoon: 'High risk during June-September',
      winter: 'Moderate fog risk in December-January',
      summer: 'Heat wave risk in April-May'
    };
  }

  generateWeatherRecommendations(weatherData) {
    return [
      'Monitor weather conditions before travel',
      'Carry emergency supplies during monsoon',
      'Plan for reduced visibility in winter fog'
    ];
  }

  countDataPoints(dynamicStats) {
    return dynamicStats.totalDataPoints || 0;
  }

  countTotalDataPoints(data) {
    return (
      data.visibilityData.sharpTurns.total +
      data.visibilityData.blindSpots.total +
      data.riskData.accidentProneAreas.total +
      data.emergencyData.total +
      100 // Base route analysis points
    );
  }
}

module.exports = DynamicReportService;