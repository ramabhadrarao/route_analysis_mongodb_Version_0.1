// File: routes/risk.js - FIXED VERSION
// Purpose: Risk assessment and calculation endpoints with FIXED logger import

const express = require('express');
const Route = require('../models/Route');
const { auth } = require('../middleware/auth');
const { logger } = require('../utils/logger'); // ✅ FIXED: Destructured logger import

const router = express.Router();

// All risk routes require authentication
router.use(auth);

// Calculate risk for specific route
router.get('/calculate/:routeId', async (req, res) => {
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

    console.log(`🔄 Starting real risk calculation for route: ${route.routeId}`);

    // REAL RISK CALCULATION using the enhanced service
    try {
      const riskCalculationService = require('../services/riskCalculationService');
      const realRiskScore = await riskCalculationService.calculateRouteRisk(routeId);
      
      // Generate comprehensive risk explanation
      const explanation = {
        grade: realRiskScore.riskGrade,
        score: realRiskScore.totalWeightedScore,
        level: realRiskScore.riskLevel,
        explanation: realRiskScore.riskExplanation,
        topRiskFactors: realRiskScore.topRiskFactors,
        recommendations: realRiskScore.safetyRecommendations,
        dataQuality: realRiskScore.dataQuality,
        confidence: realRiskScore.confidenceLevel,
        calculatedAt: realRiskScore.calculatedAt
      };
      
      console.log(`✅ Real risk calculation completed: Score ${realRiskScore.totalWeightedScore}, Grade ${realRiskScore.riskGrade}`);
      
      res.status(200).json({
        success: true,
        message: 'Route risk calculated successfully using comprehensive data',
        data: {
          routeInfo: {
            routeId: route.routeId,
            routeName: route.routeName,
            fromName: route.fromName,
            toName: route.toName,
            totalDistance: route.totalDistance,
            terrain: route.terrain
          },
          riskAssessment: {
            totalScore: realRiskScore.totalWeightedScore,
            riskGrade: realRiskScore.riskGrade,
            riskLevel: realRiskScore.riskLevel,
            confidence: realRiskScore.confidenceLevel
          },
          riskBreakdown: {
            roadConditions: realRiskScore.roadConditions,
            accidentProne: realRiskScore.accidentProne,
            sharpTurns: realRiskScore.sharpTurns,
            blindSpots: realRiskScore.blindSpots,
            twoWayTraffic: realRiskScore.twoWayTraffic,
            trafficDensity: realRiskScore.trafficDensity,
            weatherConditions: realRiskScore.weatherConditions,
            emergencyServices: realRiskScore.emergencyServices,
            networkCoverage: realRiskScore.networkCoverage,
            amenities: realRiskScore.amenities,
            securityIssues: realRiskScore.securityIssues
          },
          analysis: explanation,
          dataQuality: realRiskScore.dataQuality,
          lastCalculated: realRiskScore.calculatedAt
        }
      });
      
    } catch (riskError) {
      console.error('Risk calculation service error:', riskError);
      
      // Fallback to basic risk assessment
      const fallbackRisk = await this.calculateBasicRisk(route);
      
      res.status(200).json({
        success: true,
        message: 'Basic risk assessment completed (enhanced calculation unavailable)',
        data: {
          routeInfo: {
            routeId: route.routeId,
            routeName: route.routeName,
            fromName: route.fromName,
            toName: route.toName,
            totalDistance: route.totalDistance,
            terrain: route.terrain
          },
          riskAssessment: fallbackRisk,
          note: 'Using basic risk calculation due to service unavailability',
          error: riskError.message
        }
      });
    }

  } catch (error) {
    logger.error('Risk calculation API error:', error); // ✅ FIXED: Now logger.error works
    res.status(500).json({
      success: false,
      message: 'Error calculating route risk',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Helper method for basic risk calculation fallback
async function calculateBasicRisk(route) {
  let baseRisk = 3; // Start with low-medium risk
  
  // Terrain-based risk
  const terrainRisk = {
    'flat': 0,
    'urban': 1,
    'rural': 2,
    'hilly': 3,
    'mixed': 1.5
  };
  
  baseRisk += terrainRisk[route.terrain] || 1;
  
  // Distance-based risk
  if (route.totalDistance > 300) baseRisk += 1.5;
  else if (route.totalDistance > 150) baseRisk += 1;
  else if (route.totalDistance > 50) baseRisk += 0.5;
  
  // Highway presence (reduces risk)
  if (route.majorHighways && route.majorHighways.length > 0) {
    if (route.majorHighways.some(hw => hw.startsWith('NH'))) baseRisk -= 1;
    else baseRisk -= 0.5;
  }
  
  const finalRisk = Math.max(1, Math.min(10, baseRisk));
  
  let riskGrade = 'C';
  let riskLevel = 'Medium Risk';
  
  if (finalRisk <= 2) { riskGrade = 'A'; riskLevel = 'Very Low Risk'; }
  else if (finalRisk <= 4) { riskGrade = 'B'; riskLevel = 'Low Risk'; }
  else if (finalRisk <= 6) { riskGrade = 'C'; riskLevel = 'Medium Risk'; }
  else if (finalRisk <= 8) { riskGrade = 'D'; riskLevel = 'High Risk'; }
  else { riskGrade = 'F'; riskLevel = 'Critical Risk'; }
  
  return {
    totalScore: Math.round(finalRisk * 100) / 100,
    riskGrade,
    riskLevel,
    confidence: 60, // Lower confidence for basic calculation
    explanation: `Basic risk assessment based on route terrain (${route.terrain}), distance (${route.totalDistance}km), and highway presence.`,
    calculationType: 'basic_fallback'
  };
}

// Get risk calculation history
router.get('/history/:routeId', async (req, res) => {
  try {
    const { routeId } = req.params;
    const userId = req.user.id;
    
    // Verify route ownership
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
    
    // Return current risk score as history
    const history = [];
    
    if (route.riskScores && route.riskScores.totalWeightedScore) {
      history.push({
        calculatedAt: route.metadata?.lastCalculated || route.updatedAt,
        riskScore: route.riskScores.totalWeightedScore,
        riskGrade: route.riskScores.riskGrade || 'C',
        riskLevel: route.riskLevel || 'MEDIUM',
        calculationType: 'comprehensive'
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        routeId: route.routeId,
        routeName: route.routeName,
        history,
        totalCalculations: history.length,
        latestCalculation: history[0] || null
      }
    });
    
  } catch (error) {
    logger.error('Risk history API error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching risk history'
    });
  }
});

// Batch calculate risks for multiple routes
router.post('/batch-calculate', async (req, res) => {
  try {
    const { routeIds } = req.body;
    const userId = req.user.id;
    
    if (!routeIds || !Array.isArray(routeIds)) {
      return res.status(400).json({
        success: false,
        message: 'Route IDs array is required'
      });
    }
    
    if (routeIds.length > 10) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 10 routes can be processed at once'
      });
    }
    
    // Verify all routes belong to user
    const routes = await Route.find({
      _id: { $in: routeIds },
      userId,
      status: { $ne: 'deleted' }
    });
    
    if (routes.length !== routeIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Some routes not found or not accessible'
      });
    }
    
    console.log(`🔄 Starting batch risk calculation for ${routes.length} routes`);
    
    // Calculate risks for all routes
    const results = [];
    
    for (const route of routes) {
      try {
        const riskCalculationService = require('../services/riskCalculationService');
        const riskResult = await riskCalculationService.calculateRouteRisk(route._id);
        
        results.push({
          routeId: route.routeId,
          routeName: route.routeName,
          success: true,
          riskScore: riskResult.totalWeightedScore,
          riskGrade: riskResult.riskGrade,
          riskLevel: riskResult.riskLevel,
          confidence: riskResult.confidenceLevel,
          calculatedAt: riskResult.calculatedAt
        });
        
        console.log(`   ✅ Calculated risk for ${route.routeName}: ${riskResult.riskGrade} (${riskResult.totalWeightedScore})`);
        
      } catch (error) {
        console.error(`   ❌ Risk calculation failed for ${route.routeName}:`, error.message);
        
        results.push({
          routeId: route.routeId,
          routeName: route.routeName,
          success: false,
          error: error.message
        });
      }
    }
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    console.log(`✅ Batch calculation completed: ${successful.length} successful, ${failed.length} failed`);
    
    res.status(200).json({
      success: true,
      message: 'Batch risk calculation completed',
      data: {
        totalProcessed: results.length,
        successful: successful.length,
        failed: failed.length,
        results,
        summary: {
          averageRiskScore: successful.length > 0 ? 
            successful.reduce((sum, r) => sum + r.riskScore, 0) / successful.length : 0,
          highRiskRoutes: successful.filter(r => r.riskScore > 6).length,
          criticalRiskRoutes: successful.filter(r => r.riskScore > 8).length
        }
      }
    });
    
  } catch (error) {
    logger.error('Batch risk calculation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error in batch risk calculation'
    });
  }
});

// Get risk assessment summary for all user routes
router.get('/summary', async (req, res) => {
  try {
    const userId = req.user.id;
    
    const routes = await Route.find({
      userId,
      status: { $ne: 'deleted' }
    }).select('routeId routeName riskLevel riskScores totalDistance terrain');
    
    const riskSummary = {
      totalRoutes: routes.length,
      riskDistribution: {
        LOW: routes.filter(r => r.riskLevel === 'LOW').length,
        MEDIUM: routes.filter(r => r.riskLevel === 'MEDIUM').length,
        HIGH: routes.filter(r => r.riskLevel === 'HIGH').length,
        CRITICAL: routes.filter(r => r.riskLevel === 'CRITICAL').length
      },
      averageRiskScore: routes.length > 0 ? 
        routes.reduce((sum, r) => sum + (r.riskScores?.totalWeightedScore || 0), 0) / routes.length : 0,
      highestRiskRoute: routes.reduce((highest, current) => {
        const currentScore = current.riskScores?.totalWeightedScore || 0;
        const highestScore = highest.riskScores?.totalWeightedScore || 0;
        return currentScore > highestScore ? current : highest;
      }, routes[0]),
      lowestRiskRoute: routes.reduce((lowest, current) => {
        const currentScore = current.riskScores?.totalWeightedScore || 10;
        const lowestScore = lowest.riskScores?.totalWeightedScore || 10;
        return currentScore < lowestScore ? current : lowest;
      }, routes[0]),
      routesNeedingAttention: routes.filter(r => 
        r.riskLevel === 'HIGH' || r.riskLevel === 'CRITICAL'
      ).map(r => ({
        routeId: r.routeId,
        routeName: r.routeName,
        riskLevel: r.riskLevel,
        riskScore: r.riskScores?.totalWeightedScore || 0
      }))
    };
    
    res.status(200).json({
      success: true,
      data: riskSummary
    });
    
  } catch (error) {
    logger.error('Risk summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching risk summary'
    });
  }
});

// Recalculate risk with force refresh
router.post('/recalculate/:routeId', async (req, res) => {
  try {
    const { routeId } = req.params;
    const userId = req.user.id;
    const { forceRefresh = false } = req.body;
    
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
    
    console.log(`🔄 Recalculating risk for route: ${route.routeId} (force: ${forceRefresh})`);
    
    const riskCalculationService = require('../services/riskCalculationService');
    const riskResult = await riskCalculationService.calculateRouteRisk(routeId);
    
    res.status(200).json({
      success: true,
      message: 'Route risk recalculated successfully',
      data: {
        routeId: route.routeId,
        routeName: route.routeName,
        previousRisk: {
          score: route.riskScores?.totalWeightedScore || 0,
          grade: route.riskScores?.riskGrade || 'N/A',
          level: route.riskLevel || 'UNKNOWN'
        },
        newRisk: {
          score: riskResult.totalWeightedScore,
          grade: riskResult.riskGrade,
          level: riskResult.riskLevel,
          confidence: riskResult.confidenceLevel
        },
        improvement: (route.riskScores?.totalWeightedScore || 0) - riskResult.totalWeightedScore,
        dataQuality: riskResult.dataQuality,
        calculatedAt: riskResult.calculatedAt
      }
    });
    
  } catch (error) {
    logger.error('Risk recalculation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error recalculating risk'
    });
  }
});

module.exports = router;