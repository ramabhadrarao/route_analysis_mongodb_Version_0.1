// File: routes/networkCoverage.js - FIXED INTEGRATION VERSION
// Purpose: Network coverage API routes with proper service integration

const express = require('express');
const { auth } = require('../middleware/auth');
const { NetworkCoverageService } = require('../services/networkCoverageService'); // ✅ FIXED: Import from updated service
const Route = require('../models/Route');

const router = express.Router();

// All network coverage routes require authentication
router.use(auth);

// ============================================================================
// MAIN ANALYSIS ENDPOINTS
// ============================================================================

// Analyze network coverage for a route
router.post('/routes/:routeId/analyze', async (req, res) => {
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

    console.log(`🔄 Starting network coverage analysis for route: ${route.routeId}`);
    
    // Run comprehensive network analysis
    const coverageReport = await NetworkCoverageService.analyzeNetworkCoverage(routeId);

    res.status(200).json({
      success: true,
      message: 'Network coverage analysis completed successfully',
      data: coverageReport
    });

  } catch (error) {
    console.error('Network coverage analysis error:', error);
    res.status(500).json({
      success: false,
      message: 'Error analyzing network coverage',
      error: error.message
    });
  }
});

// Get network coverage overview for a route
router.get('/routes/:routeId/overview', async (req, res) => {
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

    const coverageData = await NetworkCoverageService.getNetworkCoverageForRoute(routeId);
    
    if (!coverageData.exists) {
      return res.status(404).json({
        success: false,
        message: 'No network coverage data found for this route',
        recommendation: 'Run network analysis first using POST /analyze endpoint'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        routeInfo: {
          routeId: route.routeId,
          routeName: route.routeName,
          totalDistance: route.totalDistance,
          terrain: route.terrain
        },
        coverageOverview: {
          totalAnalysisPoints: coverageData.totalPoints,
          deadZones: coverageData.deadZones,
          deadZonePercentage: Math.round((coverageData.deadZones / coverageData.totalPoints) * 100),
          averageSignalStrength: coverageData.averageSignal,
          communicationRisk: coverageData.communicationRisk,
          riskLevel: coverageData.communicationRisk > 7 ? 'HIGH' : 
                    coverageData.communicationRisk > 5 ? 'MEDIUM' : 'LOW'
        }
      }
    });

  } catch (error) {
    console.error('Network coverage overview error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching network coverage overview'
    });
  }
});

// ============================================================================
// DEAD ZONE SPECIFIC ENDPOINTS
// ============================================================================

// Get all dead zones for a route
router.get('/routes/:routeId/dead-zones', async (req, res) => {
  try {
    const { routeId } = req.params;
    const { severity, includeDetails = 'true' } = req.query;
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

    const deadZonesData = await NetworkCoverageService.getDeadZonesForRoute(routeId);
    
    let filteredDeadZones = deadZonesData.deadZones;
    
    // Filter by severity if specified
    if (severity) {
      filteredDeadZones = deadZonesData.deadZones.filter(dz => dz.severity === severity);
    }

    // Calculate additional statistics
    const statistics = {
      total: deadZonesData.total,
      filtered: filteredDeadZones.length,
      bySeverity: {
        critical: deadZonesData.deadZones.filter(dz => dz.severity === 'critical').length,
        severe: deadZonesData.deadZones.filter(dz => dz.severity === 'severe').length,
        moderate: deadZonesData.deadZones.filter(dz => dz.severity === 'moderate').length,
        minor: deadZonesData.deadZones.filter(dz => dz.severity === 'minor').length
      },
      totalDuration: deadZonesData.deadZones.reduce((sum, dz) => sum + dz.duration, 0),
      averageRadius: deadZonesData.deadZones.length > 0 ? 
        Math.round(deadZonesData.deadZones.reduce((sum, dz) => sum + dz.radius, 0) / deadZonesData.deadZones.length) : 0
    };

    const response = {
      success: true,
      data: {
        routeInfo: {
          routeId: route.routeId,
          routeName: route.routeName,
          totalDistance: route.totalDistance
        },
        statistics,
        deadZones: filteredDeadZones
      }
    };

    // Include detailed recommendations if requested
    if (includeDetails === 'true') {
      response.data.urgentRecommendations = generateUrgentDeadZoneRecommendations(deadZonesData.deadZones);
      response.data.equipmentRecommendations = generateEquipmentRecommendations(statistics);
    }

    res.status(200).json(response);

  } catch (error) {
    console.error('Dead zones fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dead zones data'
    });
  }
});

// Get critical dead zones only
router.get('/routes/:routeId/critical-dead-zones', async (req, res) => {
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

    const NetworkCoverage = require('../models/NetworkCoverage');
    const criticalDeadZones = await NetworkCoverage.find({
      routeId,
      isDeadZone: true,
      deadZoneSeverity: { $in: ['critical', 'severe'] }
    }).sort({ distanceFromStartKm: 1 });

    const criticalAlerts = criticalDeadZones.map(zone => ({
      location: {
        latitude: zone.latitude,
        longitude: zone.longitude,
        distanceFromStart: zone.distanceFromStartKm
      },
      severity: zone.deadZoneSeverity,
      duration: zone.deadZoneDuration,
      radius: zone.deadZoneRadius,
      terrain: zone.terrain,
      emergencyRisk: zone.emergencyRisk,
      criticalFactors: identifyCriticalFactors(zone),
      immediateActions: generateImmediateActions(zone)
    }));

    res.status(200).json({
      success: true,
      data: {
        routeId: route.routeId,
        criticalDeadZones: criticalAlerts,
        totalCritical: criticalAlerts.length,
        overallEmergencyRisk: criticalAlerts.length > 0 ? 
          Math.max(...criticalAlerts.map(z => z.emergencyRisk)) : 0,
        routeRecommendation: generateRouteRecommendation(criticalAlerts, route)
      }
    });

  } catch (error) {
    console.error('Critical dead zones error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching critical dead zones'
    });
  }
});

// ============================================================================
// OPERATOR SPECIFIC ENDPOINTS
// ============================================================================

// Get coverage by specific operator
router.get('/routes/:routeId/operator/:operator', async (req, res) => {
  try {
    const { routeId, operator } = req.params;
    const userId = req.user.id;
    
    if (!['airtel', 'jio', 'vi', 'bsnl'].includes(operator.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid operator. Supported: airtel, jio, vi, bsnl'
      });
    }
    
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

    const operatorCoverage = await NetworkCoverageService.getCoverageByOperator(routeId, operator.toLowerCase());
    
    if (operatorCoverage.error) {
      return res.status(404).json({
        success: false,
        message: operatorCoverage.error
      });
    }

    res.status(200).json({
      success: true,
      data: {
        routeInfo: {
          routeId: route.routeId,
          routeName: route.routeName
        },
        operatorCoverage,
        recommendations: generateOperatorRecommendations(operatorCoverage, operator)
      }
    });

  } catch (error) {
    console.error('Operator coverage error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching operator coverage'
    });
  }
});

// Compare all operators for a route
router.get('/routes/:routeId/operator-comparison', async (req, res) => {
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

    const operators = ['airtel', 'jio', 'vi', 'bsnl'];
    const operatorComparison = {};
    
    for (const operator of operators) {
      try {
        const coverage = await NetworkCoverageService.getCoverageByOperator(routeId, operator);
        if (!coverage.error) {
          operatorComparison[operator] = coverage;
        }
      } catch (error) {
        console.warn(`Failed to get coverage for ${operator}:`, error.message);
      }
    }

    // Calculate best and worst operators
    const operatorRankings = rankOperators(operatorComparison);
    
    res.status(200).json({
      success: true,
      data: {
        routeInfo: {
          routeId: route.routeId,
          routeName: route.routeName
        },
        operatorComparison,
        rankings: operatorRankings,
        recommendations: generateMultiOperatorRecommendations(operatorComparison)
      }
    });

  } catch (error) {
    console.error('Operator comparison error:', error);
    res.status(500).json({
      success: false,
      message: 'Error comparing operator coverage'
    });
  }
});

// ============================================================================
// UTILITY ENDPOINTS
// ============================================================================

// Delete network coverage data for a route
router.delete('/routes/:routeId', async (req, res) => {
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

    const deleteResult = await NetworkCoverageService.deleteNetworkCoverageData(routeId);

    res.status(200).json({
      success: true,
      message: 'Network coverage data deleted successfully',
      data: deleteResult
    });

  } catch (error) {
    console.error('Delete coverage data error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting coverage data'
    });
  }
});

// Check if network analysis exists for a route
router.get('/routes/:routeId/exists', async (req, res) => {
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

    const NetworkCoverage = require('../models/NetworkCoverage');
    const count = await NetworkCoverage.countDocuments({ routeId });
    const lastAnalysis = await NetworkCoverage.findOne({ routeId }).sort({ lastUpdated: -1 });

    res.status(200).json({
      success: true,
      data: {
        exists: count > 0,
        analysisPoints: count,
        lastAnalyzed: lastAnalysis?.lastUpdated || null,
        needsReanalysis: lastAnalysis ? 
          (Date.now() - lastAnalysis.lastUpdated.getTime() > 7 * 24 * 60 * 60 * 1000) : true // 7 days old
      }
    });

  } catch (error) {
    console.error('Check analysis existence error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking analysis existence'
    });
  }
});

// Get network coverage statistics
router.get('/routes/:routeId/statistics', async (req, res) => {
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

    const statsData = await NetworkCoverageService.getNetworkCoverageStats(routeId);
    
    if (!statsData.exists) {
      return res.status(404).json({
        success: false,
        message: 'No network coverage statistics available'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        routeInfo: {
          routeId: route.routeId,
          routeName: route.routeName,
          totalDistance: route.totalDistance,
          terrain: route.terrain
        },
        statistics: statsData.stats
      }
    });

  } catch (error) {
    console.error('Coverage statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Error calculating coverage statistics'
    });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// File: routes/networkCoverage.js - Helper Functions Part
// Purpose: Helper functions for network coverage routes

function generateUrgentDeadZoneRecommendations(deadZones) {
  const recommendations = [];
  const criticalZones = deadZones.filter(dz => dz.severity === 'critical');
  const severeZones = deadZones.filter(dz => dz.severity === 'severe');
  
  if (criticalZones.length > 0) {
    recommendations.push({
      priority: 'CRITICAL',
      message: `${criticalZones.length} critical dead zones detected`,
      action: 'Mandatory satellite communication equipment required'
    });
  }
  
  if (severeZones.length > 0) {
    recommendations.push({
      priority: 'HIGH',
      message: `${severeZones.length} severe dead zones identified`,
      action: 'Convoy travel and backup communication methods required'
    });
  }
  
  const totalDuration = deadZones.reduce((sum, dz) => sum + dz.duration, 0);
  if (totalDuration > 60) {
    recommendations.push({
      priority: 'CRITICAL',
      message: `Total ${totalDuration} minutes without coverage`,
      action: 'Consider alternative route or emergency positioning'
    });
  }
  
  return recommendations;
}

function generateEquipmentRecommendations(statistics) {
  const recommendations = [];
  
  if (statistics.bySeverity.critical > 0) {
    recommendations.push({
      equipment: 'Satellite Phone',
      necessity: 'MANDATORY',
      reason: 'Critical dead zones present',
      cost: 'High'
    });
    
    recommendations.push({
      equipment: 'Emergency Beacon',
      necessity: 'MANDATORY',
      reason: 'Emergency location in dead zones',
      cost: 'Medium'
    });
  }
  
  if (statistics.total > 5) {
    recommendations.push({
      equipment: 'Two-Way Radio',
      necessity: 'HIGHLY RECOMMENDED',
      reason: 'Multiple dead zones detected',
      cost: 'Medium'
    });
  }
  
  recommendations.push({
    equipment: 'External Antenna',
    necessity: 'RECOMMENDED',
    reason: 'Improve signal in weak areas',
    cost: 'Low'
  });
  
  return recommendations;
}

function identifyCriticalFactors(zone) {
  const factors = [];
  
  if (zone.deadZoneDuration > 30) {
    factors.push('Extended coverage gap (>30 minutes)');
  }
  
  if (zone.deadZoneRadius > 3000) {
    factors.push('Large coverage area (>3km radius)');
  }
  
  if (zone.terrain === 'mountainous') {
    factors.push('Mountainous terrain - physical obstruction');
  }
  
  if (zone.emergencyRisk > 8) {
    factors.push('High emergency response risk');
  }
  
  return factors;
}

function generateImmediateActions(zone) {
  const actions = [];
  
  actions.push('Brief all drivers on dead zone location and duration');
  actions.push('Test communication immediately before entering area');
  actions.push('Establish check-in protocol before and after dead zone');
  
  if (zone.deadZoneSeverity === 'critical') {
    actions.push('Use satellite communication or postpone travel');
    actions.push('Coordinate with emergency services for route monitoring');
  }
  
  return actions;
}

function generateRouteRecommendation(criticalAlerts, route) {
  const totalCritical = criticalAlerts.length;
  const maxEmergencyRisk = criticalAlerts.length > 0 ? 
    Math.max(...criticalAlerts.map(z => z.emergencyRisk)) : 0;
  
  if (totalCritical > 3 || maxEmergencyRisk > 9) {
    return {
      recommendation: 'NOT RECOMMENDED',
      reason: 'Too many critical dead zones present significant safety risk',
      alternative: 'Seek alternative route or upgrade to satellite communication'
    };
  } else if (totalCritical > 0) {
    return {
      recommendation: 'PROCEED WITH EXTREME CAUTION',
      reason: 'Critical dead zones require enhanced safety measures',
      alternative: 'Enhanced communication equipment and convoy travel required'
    };
  } else {
    return {
      recommendation: 'PROCEED WITH STANDARD SAFETY MEASURES',
      reason: 'No critical dead zones detected',
      alternative: 'Standard communication protocols sufficient'
    };
  }
}

function generateOperatorRecommendations(operatorCoverage, operator) {
  const recommendations = [];
  
  if (operatorCoverage.averageCoverage < 50) {
    recommendations.push(`${operator.toUpperCase()} has poor coverage on this route (${operatorCoverage.averageCoverage}%)`);
    recommendations.push('Consider using multiple operators for redundancy');
  }
  
  if (operatorCoverage.deadZones > 5) {
    recommendations.push(`${operatorCoverage.deadZones} dead zones detected for ${operator.toUpperCase()}`);
    recommendations.push('Use alternative communication methods in dead zones');
  }
  
  if (operatorCoverage.averageSignal < 4) {
    recommendations.push(`Weak signal strength detected (${operatorCoverage.averageSignal}/10)`);
    recommendations.push('Use signal boosters or external antennas');
  }
  
  if (operatorCoverage.averageCoverage > 80 && operatorCoverage.averageSignal > 6) {
    recommendations.push(`${operator.toUpperCase()} provides good coverage for this route`);
    recommendations.push('Primary operator recommendation for this route');
  }
  
  return recommendations;
}

function rankOperators(operatorComparison) {
  const rankings = Object.entries(operatorComparison)
    .map(([operator, data]) => ({
      operator: operator.toUpperCase(),
      score: calculateOperatorScore(data),
      averageCoverage: data.averageCoverage,
      averageSignal: data.averageSignal,
      deadZones: data.deadZones,
      reliability: data.reliability || 'unknown'
    }))
    .sort((a, b) => b.score - a.score);
  
  return {
    best: rankings[0]?.operator || 'None',
    worst: rankings[rankings.length - 1]?.operator || 'None',
    rankings,
    analysis: {
      bestScore: rankings[0]?.score || 0,
      worstScore: rankings[rankings.length - 1]?.score || 0,
      scoreRange: (rankings[0]?.score || 0) - (rankings[rankings.length - 1]?.score || 0)
    }
  };
}

function calculateOperatorScore(operatorData) {
  // Calculate composite score based on coverage and reliability
  let score = operatorData.averageCoverage || 0; // Base score from coverage percentage
  
  // Signal strength bonus
  score += (operatorData.averageSignal || 0) * 5; // Signal strength contributes up to 50 points
  
  // Dead zone penalty
  score -= (operatorData.deadZones || 0) * 3; // Each dead zone reduces score by 3
  
  // Reliability bonus
  const reliabilityBonus = {
    'excellent': 20,
    'good': 10,
    'fair': 0,
    'poor': -10
  };
  score += reliabilityBonus[operatorData.reliability] || 0;
  
  return Math.max(0, Math.min(100, Math.round(score)));
}

function generateMultiOperatorRecommendations(operatorComparison) {
  const recommendations = [];
  const operators = Object.keys(operatorComparison);
  
  if (operators.length > 1) {
    recommendations.push({
      priority: 'HIGH',
      category: 'redundancy',
      recommendation: 'Use multiple SIM cards for redundancy',
      reason: 'Different operators have varying coverage patterns'
    });
    
    const rankings = rankOperators(operatorComparison);
    const bestOperator = rankings.best;
    
    if (bestOperator !== 'None') {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'primary_operator',
        recommendation: `Primary: ${bestOperator} (best overall coverage)`,
        reason: `Highest combined score of ${rankings.rankings[0].score}/100`
      });
    }
    
    recommendations.push({
      priority: 'MEDIUM',
      category: 'device_setup',
      recommendation: 'Configure automatic network switching',
      reason: 'Seamless transition between operators'
    });
  }
  
  // Check for poor overall coverage
  const avgCoverage = Object.values(operatorComparison)
    .reduce((sum, op) => sum + (op.averageCoverage || 0), 0) / operators.length;
  
  if (avgCoverage < 60) {
    recommendations.push({
      priority: 'CRITICAL',
      category: 'alternative_communication',
      recommendation: 'Mandatory satellite communication backup',
      reason: `Poor overall cellular coverage (${Math.round(avgCoverage)}% average)`
    });
  }
  
  recommendations.push({
    priority: 'STANDARD',
    category: 'testing',
    recommendation: 'Test all operators before journey',
    reason: 'Verify actual performance vs predicted coverage'
  });
  
  return recommendations;
}

module.exports = router;