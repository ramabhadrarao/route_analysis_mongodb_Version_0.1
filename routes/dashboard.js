// File: routes/dashboard.js
// Purpose: Dashboard API endpoints for analytics and overview

const express = require('express');
const Route = require('../models/Route');
const { auth } = require('../middleware/auth'); // FIXED: Added destructuring
const mongoose = require('mongoose');
const dashboardController = require('../controllers/dashboardController');

const router = express.Router();

// All dashboard routes require authentication
router.use(auth);

// Dashboard overview
router.get('/overview', async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Basic route statistics
    const totalRoutes = await Route.countDocuments({ 
      userId, 
      status: { $ne: 'deleted' } 
    });
    
    // Risk level distribution (simplified)
    const routes = await Route.find({
      userId,
      status: { $ne: 'deleted' }
    }).select('riskLevel');
    
    const riskDistribution = {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      CRITICAL: 0
    };
    
    routes.forEach(route => {
      const level = route.riskLevel || 'LOW';
      riskDistribution[level]++;
    });
    
    // Recent routes
    const recentRoutes = await Route.find({
      userId,
      status: { $ne: 'deleted' }
    })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('routeId routeName fromName toName riskLevel totalDistance createdAt');
    
    // High risk routes
    const highRiskRoutes = await Route.find({
      userId,
      riskLevel: { $in: ['HIGH', 'CRITICAL'] },
      status: 'active'
    })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('routeId routeName fromName toName riskLevel');
    
    // Calculate total distance
    const totalDistanceResult = await Route.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), status: { $ne: 'deleted' } }},
      { $group: { _id: null, totalDistance: { $sum: '$totalDistance' }}}
    ]);
    
    const totalDistance = totalDistanceResult[0]?.totalDistance || 0;
    
    res.status(200).json({
      success: true,
      data: {
        totalRoutes,
        riskDistribution,
        recentRoutes,
        highRiskRoutes,
        summary: {
          totalDistance: Math.round(totalDistance),
          averageRiskScore: 4.5, // Mock value
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
});

// Route statistics
router.get('/statistics', async (req, res) => {
  try {
    const userId = req.user.id;
    const { timeframe = '30d' } = req.query;
    
    // Calculate real date range
    const endDate = new Date();
    const startDate = new Date();
    
    switch (timeframe) {
      case '7d': startDate.setDate(endDate.getDate() - 7); break;
      case '30d': startDate.setDate(endDate.getDate() - 30); break;
      case '90d': startDate.setDate(endDate.getDate() - 90); break;
      case '1y': startDate.setFullYear(endDate.getFullYear() - 1); break;
      default: startDate.setDate(endDate.getDate() - 30);
    }
    
    // REAL DATA AGGREGATION - Replace mock implementation
    const realRouteCreationTrend = await Route.aggregate([
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
          totalDistance: { $sum: '$totalDistance' },
          avgRiskScore: { $avg: '$riskScores.totalWeightedScore' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }}
    ]);
    
    // Format dates properly
    const formattedTrend = realRouteCreationTrend.map(item => ({
      date: `${item._id.year}-${String(item._id.month).padStart(2, '0')}-${String(item._id.day).padStart(2, '0')}`,
      count: item.count,
      totalDistance: Math.round(item.totalDistance),
      avgRiskScore: Math.round((item.avgRiskScore || 0) * 100) / 100
    }));
    
    res.status(200).json({
      success: true,
      data: {
        timeframe,
        routeCreationTrend: formattedTrend, // REAL DATA
        summary: {
          totalRoutesInPeriod: formattedTrend.reduce((sum, item) => sum + item.count, 0),
          totalDistanceInPeriod: formattedTrend.reduce((sum, item) => sum + item.totalDistance, 0),
          avgRiskScore: formattedTrend.reduce((sum, item) => sum + (item.avgRiskScore * item.count), 0) / 
                       formattedTrend.reduce((sum, item) => sum + item.count, 0) || 0
        },
        dataSource: 'REAL_DATABASE_AGGREGATION'
      }
    });
    
  } catch (error) {
    console.error('Real route statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching real route statistics'
    });
  }
});

// Risk alerts
router.get('/alerts', async (req, res) => {
  try {
    const userId = req.user.id;
    const { priority = 'all' } = req.query;
    
    // Find routes with high risk
    let matchCondition = {
      userId,
      status: 'active'
    };
    
    if (priority === 'critical') {
      matchCondition.riskLevel = 'CRITICAL';
    } else if (priority === 'high') {
      matchCondition.riskLevel = { $in: ['HIGH', 'CRITICAL'] };
    }
    
    const routes = await Route.find(matchCondition)
      .sort({ createdAt: -1 })
      .limit(20)
      .select('routeId routeName fromName toName riskLevel riskScores createdAt');
    
    // Generate alert messages
    const alerts = routes.map(route => {
      const routeAlerts = [];
      
      if (route.riskLevel === 'CRITICAL') {
        routeAlerts.push({
          type: 'CRITICAL',
          message: `Route ${route.routeName} has critical risk level`,
          recommendation: 'Consider alternative routes or additional safety measures'
        });
      } else if (route.riskLevel === 'HIGH') {
        routeAlerts.push({
          type: 'WARNING',
          message: `Route ${route.routeName} has high risk level`,
          recommendation: 'Exercise extra caution and monitor conditions'
        });
      }
      
      return {
        routeId: route.routeId,
        routeName: route.routeName,
        fromName: route.fromName,
        toName: route.toName,
        riskLevel: route.riskLevel,
        totalRiskScore: route.riskScores?.totalWeightedScore || 0,
        alerts: routeAlerts,
        lastUpdated: route.createdAt
      };
    });
    
    res.status(200).json({
      success: true,
      data: {
        totalAlerts: alerts.length,
        alerts,
        summary: {
          critical: alerts.filter(a => a.riskLevel === 'CRITICAL').length,
          high: alerts.filter(a => a.riskLevel === 'HIGH').length,
          medium: alerts.filter(a => a.riskLevel === 'MEDIUM').length
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
});
// Visibility analysis for dashboard
router.get('/visibility-analysis', dashboardController.getVisibilityAnalysis);

// Route safety summary
router.get('/route-safety-summary', async (req, res) => {
  try {
    const userId = req.user.id;
    const SharpTurn = require('../models/SharpTurn');
    const BlindSpot = require('../models/BlindSpot');
    
    // Get routes with safety data
    const routes = await Route.find({
      userId,
      status: { $ne: 'deleted' }
    }).select('routeId routeName totalDistance riskLevel');
    
    const routeSafetySummary = [];
    
    for (const route of routes) {
      const [turns, spots] = await Promise.all([
        SharpTurn.countDocuments({ routeId: route._id }),
        BlindSpot.countDocuments({ routeId: route._id })
      ]);
      
      const [criticalTurns, criticalSpots] = await Promise.all([
        SharpTurn.countDocuments({ routeId: route._id, riskScore: { $gte: 8 }}),
        BlindSpot.countDocuments({ routeId: route._id, riskScore: { $gte: 8 }})
      ]);
      
      const safetyScore = this.calculateRouteSafetyScore(turns, spots, criticalTurns, criticalSpots, route.totalDistance);
      
      routeSafetySummary.push({
        routeId: route.routeId,
        routeName: route.routeName,
        distance: route.totalDistance,
        riskLevel: route.riskLevel,
        sharpTurns: turns,
        blindSpots: spots,
        criticalPoints: criticalTurns + criticalSpots,
        safetyScore: safetyScore,
        safetyGrade: this.getSafetyGrade(safetyScore),
        needsAttention: criticalTurns > 0 || criticalSpots > 0
      });
    }
    
    // Sort by safety score (lower is better)
    routeSafetySummary.sort((a, b) => a.safetyScore - b.safetyScore);
    
    res.status(200).json({
      success: true,
      data: {
        totalRoutes: routes.length,
        routesNeedingAttention: routeSafetySummary.filter(r => r.needsAttention).length,
        averageSafetyScore: routeSafetySummary.reduce((sum, r) => sum + r.safetyScore, 0) / routeSafetySummary.length,
        routes: routeSafetySummary
      }
    });
    
  } catch (error) {
    console.error('Route safety summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching route safety summary'
    });
  }
});

// Helper methods for safety calculations
function calculateRouteSafetyScore(turns, spots, criticalTurns, criticalSpots, distance) {
  let score = 100; // Start with perfect score
  
  // Deduct points for visibility issues
  score -= (turns * 2); // 2 points per sharp turn
  score -= (spots * 3); // 3 points per blind spot
  score -= (criticalTurns * 10); // 10 points per critical turn
  score -= (criticalSpots * 15); // 15 points per critical blind spot
  
  // Factor in density (issues per km)
  if (distance > 0) {
    const density = (turns + spots) / distance;
    if (density > 1) score -= (density - 1) * 10; // Penalty for high density
  }
  
  return Math.max(0, Math.min(100, Math.round(score)));
}

function getSafetyGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

module.exports = router;