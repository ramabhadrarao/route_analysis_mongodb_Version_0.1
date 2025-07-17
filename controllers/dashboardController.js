// File: controllers/dashboardController.js
// Purpose: Dashboard data and analytics

const mongoose = require('mongoose');
const Route = require('../models/Route');
const RoadCondition = require('../models/RoadCondition');
const AccidentProneArea = require('../models/AccidentProneArea');
const WeatherCondition = require('../models/WeatherCondition');
const TrafficData = require('../models/TrafficData');
const EmergencyService = require('../models/EmergencyService');
const logger = require('../utils/logger');
// ADD THESE NEW IMPORTS:
const SharpTurn = require('../models/SharpTurn');
const BlindSpot = require('../models/BlindSpot');
// Get dashboard overview
exports.getDashboardOverview = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Basic route statistics
    const totalRoutes = await Route.countDocuments({ 
      userId, 
      status: { $ne: 'deleted' } 
    });
    
    const riskLevelCounts = await Route.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), status: { $ne: 'deleted' } }},
      { $group: { _id: '$riskLevel', count: { $sum: 1 } }}
    ]);
    
    const riskDistribution = {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      CRITICAL: 0
    };
    
    riskLevelCounts.forEach(item => {
      riskDistribution[item._id] = item.count;
    });
    
    // Recent routes
    const recentRoutes = await Route.find({
      userId,
      status: { $ne: 'deleted' }
    })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('routeId routeName fromName toName riskLevel totalDistance createdAt');
    
    // High risk routes that need attention
    const highRiskRoutes = await Route.find({
      userId,
      riskLevel: { $in: ['HIGH', 'CRITICAL'] },
      status: 'active'
    })
    .sort({ 'riskScores.totalWeightedScore': -1 })
    .limit(5)
    .select('routeId routeName fromName toName riskLevel riskScores');
    
    // Processing status
    const processingStatus = await Route.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), status: { $ne: 'deleted' } }},
      {
        $project: {
          routeId: 1,
          routeName: 1,
          isFullyProcessed: {
            $allElementsTrue: [
              { $objectToArray: '$dataProcessingStatus' },
              '$this.v'
            ]
          }
        }
      },
      {
        $group: {
          _id: '$isFullyProcessed',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const processing = {
      completed: 0,
      pending: 0
    };
    
    processingStatus.forEach(item => {
      if (item._id) processing.completed = item.count;
      else processing.pending = item.count;
    });
    
    res.status(200).json({
      success: true,
      data: {
        totalRoutes,
        riskDistribution,
        recentRoutes,
        highRiskRoutes,
        processingStatus: processing,
        summary: {
          totalDistance: await getTotalDistance(userId),
          averageRiskScore: await getAverageRiskScore(userId),
          lastUpdated: new Date()
        }
      }
    });
    
  } catch (error) {
    console.error('Dashboard overview error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard data'
    });
  }
};

// Get route statistics
exports.getRouteStatistics = async (req, res) => {
  try {
    const userId = req.user.id;
    const { timeframe = '30d' } = req.query;
    
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    
    switch (timeframe) {
      case '7d':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(endDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(endDate.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(endDate.getDate() - 30);
    }
    
    // Routes created over time
    const routeCreationTrend = await Route.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          createdAt: { $gte: startDate, $lte: endDate },
          status: { $ne: 'deleted' }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          count: { $sum: 1 },
          totalDistance: { $sum: '$totalDistance' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }}
    ]);
    
    // Risk level trends
    const riskTrends = await Route.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          createdAt: { $gte: startDate, $lte: endDate },
          status: { $ne: 'deleted' }
        }
      },
      {
        $group: {
          _id: {
            date: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: { $dayOfMonth: '$createdAt' }
            },
            riskLevel: '$riskLevel'
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.date.year': 1, '_id.date.month': 1, '_id.date.day': 1 }}
    ]);
    
    // Most used routes (by similar origin-destination pairs)
    const popularRoutes = await Route.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          status: { $ne: 'deleted' }
        }
      },
      {
        $group: {
          _id: {
            fromName: '$fromName',
            toName: '$toName'
          },
          count: { $sum: 1 },
          avgRiskScore: { $avg: '$riskScores.totalWeightedScore' },
          totalDistance: { $sum: '$totalDistance' }
        }
      },
      { $sort: { count: -1 }},
      { $limit: 10 }
    ]);
    
    res.status(200).json({
      success: true,
      data: {
        timeframe,
        routeCreationTrend,
        riskTrends,
        popularRoutes,
        summary: {
          totalRoutesInPeriod: routeCreationTrend.reduce((sum, item) => sum + item.count, 0),
          totalDistanceInPeriod: routeCreationTrend.reduce((sum, item) => sum + item.totalDistance, 0)
        }
      }
    });
    
  } catch (error) {
    console.error('Route statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching route statistics'
    });
  }
};

// Get risk alerts
exports.getRiskAlerts = async (req, res) => {
  try {
    const userId = req.user.id;
    const { priority = 'all' } = req.query;
    
    // Find routes with high risk scores
    let matchCondition = {
      userId: new mongoose.Types.ObjectId(userId),
      status: 'active'
    };
    
    if (priority === 'critical') {
      matchCondition.riskLevel = 'CRITICAL';
    } else if (priority === 'high') {
      matchCondition.riskLevel = { $in: ['HIGH', 'CRITICAL'] };
    }
    
    const alerts = await Route.find(matchCondition)
      .sort({ 'riskScores.totalWeightedScore': -1 })
      .limit(20)
      .select('routeId routeName fromName toName riskLevel riskScores metadata');
    
    // Generate alert messages
    const processedAlerts = alerts.map(route => {
      const alerts = [];
      
      if (route.riskLevel === 'CRITICAL') {
        alerts.push({
          type: 'CRITICAL',
          message: `Route ${route.routeName} has critical risk level (${route.riskScores?.totalWeightedScore || 'N/A'})`,
          recommendation: 'Consider alternative routes or additional safety measures'
        });
      }
      
      if (route.riskScores) {
        if (route.riskScores.roadConditions > 7) {
          alerts.push({
            type: 'WARNING',
            message: 'Poor road conditions detected',
            recommendation: 'Check vehicle condition and reduce speed'
          });
        }
        
        if (route.riskScores.accidentProne > 7) {
          alerts.push({
            type: 'WARNING',
            message: 'High accident-prone areas on route',
            recommendation: 'Exercise extreme caution and consider convoy travel'
          });
        }
        
        if (route.riskScores.weatherConditions > 7) {
          alerts.push({
            type: 'INFO',
            message: 'Adverse weather conditions expected',
            recommendation: 'Monitor weather updates and delay if necessary'
          });
        }
      }
      
      return {
        routeId: route.routeId,
        routeName: route.routeName,
        fromName: route.fromName,
        toName: route.toName,
        riskLevel: route.riskLevel,
        totalRiskScore: route.riskScores?.totalWeightedScore || 0,
        alerts,
        lastUpdated: route.metadata?.lastCalculated || route.updatedAt
      };
    });
    
    res.status(200).json({
      success: true,
      data: {
        totalAlerts: processedAlerts.length,
        alerts: processedAlerts,
        summary: {
          critical: processedAlerts.filter(a => a.riskLevel === 'CRITICAL').length,
          high: processedAlerts.filter(a => a.riskLevel === 'HIGH').length,
          medium: processedAlerts.filter(a => a.riskLevel === 'MEDIUM').length
        }
      }
    });
    
  } catch (error) {
    console.error('Risk alerts error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching risk alerts'
    });
  }
};

// Get route analytics for specific route
exports.getRouteAnalytics = async (req, res) => {
  try {
    const { routeId } = req.params;
    const userId = req.user.id;
    
    const route = await Route.findOne({
      _id: routeId,
      userId,
      status: { $ne: 'deleted' }
    });
    
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }
    
    // Get detailed risk breakdown
    const roadConditions = await RoadCondition.find({ routeId });
    const accidentAreas = await AccidentProneArea.find({ routeId });
    const weatherConditions = await WeatherCondition.find({ routeId });
    const trafficData = await TrafficData.find({ routeId });
    const emergencyServices = await EmergencyService.find({ routeId });
    
    const analytics = {
      route: {
        id: route._id,
        routeId: route.routeId,
        name: route.routeName,
        from: route.fromName,
        to: route.toName,
        distance: route.totalDistance,
        duration: route.estimatedDuration,
        riskLevel: route.riskLevel,
        totalRiskScore: route.riskScores?.totalWeightedScore || 0
      },
      riskBreakdown: route.riskScores || {},
      dataPoints: {
        roadConditions: roadConditions.length,
        accidentAreas: accidentAreas.length,
        weatherPoints: weatherConditions.length,
        trafficPoints: trafficData.length,
        emergencyServices: emergencyServices.length
      },
      topRisks: this.identifyTopRisks(route.riskScores || {}),
      recommendations: this.generateRecommendations(route),
      processingStatus: route.dataProcessingStatus,
      lastUpdated: route.metadata?.lastCalculated || route.updatedAt
    };
    
    res.status(200).json({
      success: true,
      data: analytics
    });
    
  } catch (error) {
    console.error('Route analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching route analytics'
    });
  }
};

// Helper functions
async function getTotalDistance(userId) {
  const result = await Route.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId), status: { $ne: 'deleted' } }},
    { $group: { _id: null, totalDistance: { $sum: '$totalDistance' }}}
  ]);
  
  return result[0]?.totalDistance || 0;
}

async function getAverageRiskScore(userId) {
  const result = await Route.aggregate([
    { 
      $match: { 
        userId: new mongoose.Types.ObjectId(userId), 
        status: { $ne: 'deleted' },
        'riskScores.totalWeightedScore': { $exists: true }
      }
    },
    { $group: { _id: null, avgRisk: { $avg: '$riskScores.totalWeightedScore' }}}
  ]);
  
  return Math.round((result[0]?.avgRisk || 0) * 100) / 100;
}

exports.identifyTopRisks = (riskScores) => {
  const risks = Object.entries(riskScores)
    .filter(([key, value]) => key !== 'totalWeightedScore' && key !== 'riskGrade' && key !== 'calculatedAt')
    .map(([key, value]) => ({ criterion: key, score: value }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
    
  return risks;
};

exports.generateRecommendations = (route) => {
  const recommendations = [];
  const risks = route.riskScores || {};
  
  if (risks.roadConditions > 6) {
    recommendations.push('Inspect vehicle thoroughly before journey, especially brakes and tires');
  }
  
  if (risks.accidentProne > 6) {
    recommendations.push('Consider convoy travel and maintain extra following distance');
  }
  
  if (risks.weatherConditions > 6) {
    recommendations.push('Monitor weather conditions and be prepared for delays');
  }
  
  if (risks.emergencyServices > 6) {
    recommendations.push('Carry additional emergency supplies and ensure communication devices are working');
  }
  
  if (route.riskLevel === 'CRITICAL') {
    recommendations.push('CRITICAL: Consider postponing journey or using alternative route');
  }
  
  return recommendations;
};
// Get visibility analysis for dashboard
exports.getVisibilityAnalysis = async (req, res) => {
  try {
    const userId = req.user.id;
    const SharpTurn = require('../models/SharpTurn');
    const BlindSpot = require('../models/BlindSpot');
    
    // Get all routes for the user
    const userRoutes = await Route.find({
      userId,
      status: { $ne: 'deleted' }
    }).select('_id routeId routeName totalDistance');
    
    const routeIds = userRoutes.map(r => r._id);
    
    // Get sharp turns and blind spots data
    const [sharpTurns, blindSpots] = await Promise.all([
      SharpTurn.find({ routeId: { $in: routeIds }}),
      BlindSpot.find({ routeId: { $in: routeIds }})
    ]);
    
    // Calculate overall statistics
    const totalSharpTurns = sharpTurns.length;
    const totalBlindSpots = blindSpots.length;
    const criticalTurns = sharpTurns.filter(t => t.riskScore >= 8).length;
    const criticalSpots = blindSpots.filter(s => s.riskScore >= 8).length;
    
    const avgTurnRisk = totalSharpTurns > 0 ? 
      sharpTurns.reduce((sum, t) => sum + t.riskScore, 0) / totalSharpTurns : 0;
    const avgSpotRisk = totalBlindSpots > 0 ? 
      blindSpots.reduce((sum, s) => sum + s.riskScore, 0) / totalBlindSpots : 0;
    
    // Get route-wise breakdown
    const routeAnalysis = userRoutes.map(route => {
      const routeTurns = sharpTurns.filter(t => t.routeId.toString() === route._id.toString());
      const routeSpots = blindSpots.filter(s => s.routeId.toString() === route._id.toString());
      
      return {
        routeId: route.routeId,
        routeName: route.routeName,
        distance: route.totalDistance,
        sharpTurns: routeTurns.length,
        blindSpots: routeSpots.length,
        criticalTurns: routeTurns.filter(t => t.riskScore >= 8).length,
        criticalSpots: routeSpots.filter(s => s.riskScore >= 8).length,
        turnDensity: route.totalDistance > 0 ? 
          Math.round((routeTurns.length / route.totalDistance) * 100) / 100 : 0,
        spotDensity: route.totalDistance > 0 ? 
          Math.round((routeSpots.length / route.totalDistance) * 100) / 100 : 0
      };
    });
    
    // Identify most dangerous routes
    const dangerousRoutes = routeAnalysis
      .filter(r => r.criticalTurns > 0 || r.criticalSpots > 0)
      .sort((a, b) => (b.criticalTurns + b.criticalSpots) - (a.criticalTurns + a.criticalSpots))
      .slice(0, 5);
    
    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalRoutes: userRoutes.length,
          totalSharpTurns,
          totalBlindSpots,
          criticalTurns,
          criticalSpots,
          avgTurnRisk: Math.round(avgTurnRisk * 100) / 100,
          avgSpotRisk: Math.round(avgSpotRisk * 100) / 100,
          totalCriticalPoints: criticalTurns + criticalSpots
        },
        breakdown: {
          turnSeverity: {
            hairpin: sharpTurns.filter(t => t.turnSeverity === 'hairpin').length,
            sharp: sharpTurns.filter(t => t.turnSeverity === 'sharp').length,
            moderate: sharpTurns.filter(t => t.turnSeverity === 'moderate').length,
            gentle: sharpTurns.filter(t => t.turnSeverity === 'gentle').length
          },
          spotTypes: {
            crest: blindSpots.filter(s => s.spotType === 'crest').length,
            curve: blindSpots.filter(s => s.spotType === 'curve').length,
            obstruction: blindSpots.filter(s => s.spotType === 'obstruction').length,
            other: blindSpots.filter(s => !['crest', 'curve', 'obstruction'].includes(s.spotType)).length
          }
        },
        dangerousRoutes,
        routeAnalysis: routeAnalysis.slice(0, 10), // Top 10 routes
        recommendations: this.generateDashboardVisibilityRecommendations(
          totalSharpTurns, totalBlindSpots, criticalTurns, criticalSpots
        )
      }
    });
    
  } catch (error) {
    console.error('Visibility analysis error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching visibility analysis'
    });
  }
};

// Helper method for dashboard recommendations
exports.generateDashboardVisibilityRecommendations = function(totalTurns, totalSpots, criticalTurns, criticalSpots) {
  const recommendations = [];
  
  if (criticalTurns > 0 || criticalSpots > 0) {
    recommendations.push({
      priority: 'critical',
      category: 'immediate_action',
      message: `${criticalTurns + criticalSpots} critical visibility points require immediate attention`,
      action: 'Review and plan alternative routes for high-risk segments'
    });
  }
  
  if (totalTurns > 50) {
    recommendations.push({
      priority: 'high',
      category: 'training',
      message: `${totalTurns} sharp turns across all routes`,
      action: 'Conduct specialized driver training for sharp turn navigation'
    });
  }
  
  if (totalSpots > 20) {
    recommendations.push({
      priority: 'high',
      category: 'equipment',
      message: `${totalSpots} blind spots identified`,
      action: 'Equip vehicles with enhanced signaling and communication devices'
    });
  }
  
  recommendations.push({
    priority: 'medium',
    category: 'monitoring',
    message: 'Regular visibility analysis recommended',
    action: 'Schedule monthly route safety reviews'
  });
  
  return recommendations;
};
module.exports = exports;