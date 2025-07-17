// File: routes/enhancedRoadConditions.js
// Purpose: API routes for Enhanced Road Conditions Service
// Provides endpoints to analyze, view, and manage enhanced road conditions data

const express = require('express');
const { auth } = require('../middleware/auth');
const Route = require('../models/Route');
const RoadCondition = require('../models/RoadCondition');
const enhancedRoadConditionsService = require('../services/enhancedRoadConditionsService');

const router = express.Router();

// All routes require authentication
router.use(auth);

// ============================================================================
// ENHANCED ROAD CONDITIONS ANALYSIS ENDPOINTS
// ============================================================================

// Analyze enhanced road conditions for a route
router.post('/routes/:routeId/analyze', async (req, res) => {
  try {
    const { routeId } = req.params;
    const userId = req.user.id;
    const { forceRefresh = false } = req.body;
    
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

    if (!route.routePoints || route.routePoints.length < 5) {
      return res.status(400).json({
        success: false,
        message: 'Route has insufficient GPS points for enhanced analysis',
        details: {
          currentPoints: route.routePoints?.length || 0,
          minimumRequired: 5,
          recommendation: 'Upload route with more detailed GPS tracking'
        }
      });
    }

    // Check if analysis already exists
    if (!forceRefresh) {
      const existingConditions = await RoadCondition.countDocuments({ routeId });
      if (existingConditions > 0) {
        return res.status(200).json({
          success: true,
          message: 'Enhanced road conditions analysis already exists',
          data: {
            existingAnalysis: true,
            segmentsAnalyzed: existingConditions,
            recommendation: 'Use GET endpoint to view results or set forceRefresh=true to reanalyze'
          }
        });
      }
    }

    console.log(`🛣️ Starting enhanced road conditions analysis for route: ${route.routeId}`);
    
    // Run enhanced analysis
    const analysisResults = await enhancedRoadConditionsService.collectEnhancedRoadConditions(routeId);

    res.status(200).json({
      success: true,
      message: 'Enhanced road conditions analysis completed successfully',
      data: {
        routeInfo: {
          routeId: route.routeId,
          routeName: route.routeName,
          fromName: route.fromName,
          toName: route.toName,
          totalDistance: route.totalDistance,
          terrain: route.terrain
        },
        analysisResults,
        enhancementInfo: {
          version: 'Enhanced_v3.0',
          multiApiIntegration: true,
          apiSources: ['Google Roads API', 'TomTom Map API', 'HERE Map Attributes API', 'Mapbox Directions API'],
          realDataOnly: true,
          analysisDate: new Date()
        },
        apiEndpoints: {
          viewResults: `/api/enhanced-road-conditions/routes/${routeId}/overview`,
          detailedData: `/api/enhanced-road-conditions/routes/${routeId}/segments`,
          riskAssessment: `/api/enhanced-road-conditions/routes/${routeId}/risk-assessment`,
          recommendations: `/api/enhanced-road-conditions/routes/${routeId}/recommendations`
        }
      }
    });

  } catch (error) {
    console.error('Enhanced road conditions analysis error:', error);
    res.status(500).json({
      success: false,
      message: 'Error during enhanced road conditions analysis',
      error: error.message,
      troubleshooting: [
        'Verify API keys are configured (GOOGLE_MAPS_API_KEY, TOMTOM_API_KEY, HERE_API_KEY)',
        'Check API rate limits and quotas',
        'Ensure route has valid GPS coordinates',
        'Try again with smaller route segments if this was a timeout'
      ]
    });
  }
});

// ============================================================================
// VIEW ENHANCED ROAD CONDITIONS DATA
// ============================================================================

// Get enhanced road conditions overview for a route
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

    // Get road conditions summary
    const summary = await enhancedRoadConditionsService.getRoadConditionsSummary(routeId);
    
    if (!summary.exists) {
      return res.status(404).json({
        success: false,
        message: 'No enhanced road conditions data found for this route',
        recommendation: 'Run enhanced analysis first using POST /analyze endpoint',
        analyzeEndpoint: `/api/enhanced-road-conditions/routes/${routeId}/analyze`
      });
    }

    res.status(200).json({
      success: true,
      data: {
        routeInfo: {
          routeId: route.routeId,
          routeName: route.routeName,
          fromName: route.fromName,
          toName: route.toName,
          totalDistance: route.totalDistance,
          terrain: route.terrain
        },
        roadConditionsSummary: summary,
        quickInsights: {
          overallCondition: this.determineOverallCondition(summary),
          primaryConcerns: this.identifyPrimaryConcerns(summary),
          travelRecommendation: this.generateTravelRecommendation(summary)
        }
      }
    });

  } catch (error) {
    console.error('Enhanced road conditions overview error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching enhanced road conditions overview'
    });
  }
});

// Get detailed road condition segments
router.get('/routes/:routeId/segments', async (req, res) => {
  try {
    const { routeId } = req.params;
    const { 
      riskLevel = 'all', 
      roadType = 'all', 
      surfaceQuality = 'all',
      includeApiDetails = 'false',
      limit = 50,
      offset = 0 
    } = req.query;
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

    // Build query filter
    let filter = { routeId };
    
    if (riskLevel !== 'all') {
      const riskMapping = {
        'low': { $lt: 4 },
        'medium': { $gte: 4, $lt: 7 },
        'high': { $gte: 7 }
      };
      if (riskMapping[riskLevel]) {
        filter.riskScore = riskMapping[riskLevel];
      }
    }
    
    if (roadType !== 'all') {
      filter.roadType = roadType;
    }
    
    if (surfaceQuality !== 'all') {
      filter.surfaceQuality = surfaceQuality;
    }

    // Get road condition segments
    let query = RoadCondition.find(filter)
      .sort({ 'metadata.segmentIndex': 1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));

    // Exclude detailed API metadata if not requested
    if (includeApiDetails === 'false') {
      query = query.select('-metadata.apiSources -metadata.successfulSources');
    }

    const segments = await query;
    const totalSegments = await RoadCondition.countDocuments(filter);

    // Format segments for response
    const formattedSegments = segments.map(segment => ({
      id: segment._id,
      coordinates: {
        latitude: segment.latitude,
        longitude: segment.longitude
      },
      roadCharacteristics: {
        type: segment.roadType,
        surfaceQuality: segment.surfaceQuality,
        width: segment.widthMeters,
        lanes: segment.laneCount
      },
      riskAssessment: {
        score: segment.riskScore,
        level: this.determineSegmentRiskLevel(segment.riskScore),
        hasPotholes: segment.hasPotholes,
        underConstruction: segment.underConstruction
      },
      dataQuality: {
        confidence: segment.metadata?.confidence || 0,
        dataQuality: segment.metadata?.dataQuality || 'unknown',
        apiSources: includeApiDetails === 'true' ? segment.metadata?.successfulSources : undefined
      },
      segmentIndex: segment.metadata?.segmentIndex || 0,
      lastUpdated: segment.updatedAt
    }));

    res.status(200).json({
      success: true,
      data: {
        routeInfo: {
          routeId: route.routeId,
          routeName: route.routeName
        },
        filters: {
          riskLevel,
          roadType,
          surfaceQuality,
          applied: filter
        },
        segments: formattedSegments,
        pagination: {
          total: totalSegments,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: (parseInt(offset) + formattedSegments.length) < totalSegments
        }
      }
    });

  } catch (error) {
    console.error('Road condition segments error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching road condition segments'
    });
  }
});

// Get risk assessment for route
router.get('/routes/:routeId/risk-assessment', async (req, res) => {
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

    // Get all road conditions for risk assessment
    const roadConditions = await RoadCondition.find({ routeId });
    
    if (roadConditions.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No road conditions data available for risk assessment',
        recommendation: 'Run enhanced road conditions analysis first'
      });
    }

    // Perform detailed risk assessment
    const riskAssessment = enhancedRoadConditionsService.assessDetailedRoadRisk(roadConditions);
    
    // Get high-risk segments
    const highRiskSegments = roadConditions
      .filter(rc => rc.riskScore >= 7)
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 10)
      .map(segment => ({
        coordinates: {
          latitude: segment.latitude,
          longitude: segment.longitude
        },
        riskScore: segment.riskScore,
        issues: {
          surfaceQuality: segment.surfaceQuality,
          hasPotholes: segment.hasPotholes,
          underConstruction: segment.underConstruction,
          roadType: segment.roadType
        },
        segmentIndex: segment.metadata?.segmentIndex || 0
      }));

    res.status(200).json({
      success: true,
      data: {
        routeInfo: {
          routeId: route.routeId,
          routeName: route.routeName,
          totalDistance: route.totalDistance
        },
        riskAssessment: {
          overallRiskScore: riskAssessment.overallRiskScore,
          riskLevel: riskAssessment.riskLevel,
          riskFactors: riskAssessment.riskFactors,
          recommendations: riskAssessment.recommendations
        },
        criticalFindings: {
          highRiskSegments: highRiskSegments.length,
          poorSurfaceSegments: roadConditions.filter(rc => ['poor', 'critical'].includes(rc.surfaceQuality)).length,
          constructionZones: roadConditions.filter(rc => rc.underConstruction).length,
          potholeAreas: roadConditions.filter(rc => rc.hasPotholes).length
        },
        highRiskSegments,
        routeGrading: this.calculateRouteGrading(riskAssessment.overallRiskScore),
        comparisonMetrics: {
          betterThan: this.calculatePercentileBetter(riskAssessment.overallRiskScore),
          averageForTerrain: this.getAverageRiskForTerrain(route.terrain)
        }
      }
    });

  } catch (error) {
    console.error('Risk assessment error:', error);
    res.status(500).json({
      success: false,
      message: 'Error performing risk assessment'
    });
  }
});

// Get recommendations for route
router.get('/routes/:routeId/recommendations', async (req, res) => {
  try {
    const { routeId } = req.params;
    const { category = 'all' } = req.query;
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

    // Get road conditions for recommendations
    const roadConditions = await RoadCondition.find({ routeId });
    
    if (roadConditions.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No road conditions data available for recommendations'
      });
    }

    // Generate comprehensive recommendations
    const recommendations = enhancedRoadConditionsService.generateRoadConditionRecommendations(roadConditions, route);
    
    // Filter by category if specified
    let filteredRecommendations = recommendations;
    if (category !== 'all') {
      filteredRecommendations = recommendations.filter(rec => rec.category === category);
    }

    // Generate vehicle-specific recommendations
    const vehicleRecommendations = this.generateVehicleSpecificRecommendations(roadConditions);
    
    // Generate timing recommendations
    const timingRecommendations = this.generateTimingRecommendations(roadConditions, route);

    res.status(200).json({
      success: true,
      data: {
        routeInfo: {
          routeId: route.routeId,
          routeName: route.routeName
        },
        generalRecommendations: filteredRecommendations,
        vehicleSpecificRecommendations,
        timingRecommendations,
        emergencyPreparation: this.generateEmergencyPreparationRecommendations(roadConditions, route),
        summary: {
          totalRecommendations: filteredRecommendations.length,
          criticalActions: filteredRecommendations.filter(r => r.priority === 'CRITICAL').length,
          highPriorityActions: filteredRecommendations.filter(r => r.priority === 'HIGH').length,
          mediumPriorityActions: filteredRecommendations.filter(r => r.priority === 'MEDIUM').length
        },
        availableCategories: [...new Set(recommendations.map(r => r.category))]
      }
    });

  } catch (error) {
    console.error('Recommendations error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating recommendations'
    });
  }
});

// ============================================================================
// COMPARISON AND BENCHMARKING ENDPOINTS
// ============================================================================

// Compare road conditions with other routes
router.get('/routes/:routeId/compare', async (req, res) => {
  try {
    const { routeId } = req.params;
    const { compareWith = 'user_routes' } = req.query;
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

    // Get current route summary
    const currentRouteSummary = await enhancedRoadConditionsService.getRoadConditionsSummary(routeId);
    
    if (!currentRouteSummary.exists) {
      return res.status(404).json({
        success: false,
        message: 'No road conditions data available for comparison'
      });
    }

    let comparisonRoutes = [];
    
    if (compareWith === 'user_routes') {
      // Compare with user's other routes
      const userRoutes = await Route.find({
        userId,
        _id: { $ne: routeId },
        status: { $ne: 'deleted' }
      }).limit(10);
      
      for (const userRoute of userRoutes) {
        const summary = await enhancedRoadConditionsService.getRoadConditionsSummary(userRoute._id);
        if (summary.exists) {
          comparisonRoutes.push({
            routeId: userRoute.routeId,
            routeName: userRoute.routeName,
            summary
          });
        }
      }
    }

    // Perform comparison analysis
    const comparisonResults = this.performRouteComparison(currentRouteSummary, comparisonRoutes);

    res.status(200).json({
      success: true,
      data: {
        currentRoute: {
          routeId: route.routeId,
          routeName: route.routeName,
          summary: currentRouteSummary
        },
        comparisonRoutes,
        comparisonResults,
        benchmarking: {
          percentileBetter: this.calculatePercentileBetter(currentRouteSummary.averageRiskScore),
          riskCategory: this.categorizeRiskLevel(currentRouteSummary.averageRiskScore),
          terrainComparison: this.compareWithTerrainAverage(route.terrain, currentRouteSummary.averageRiskScore)
        }
      }
    });

  } catch (error) {
    console.error('Route comparison error:', error);
    res.status(500).json({
      success: false,
      message: 'Error performing route comparison'
    });
  }
});

// ============================================================================
// UTILITIES AND MANAGEMENT ENDPOINTS
// ============================================================================

// Check API configuration status
router.get('/api-status', async (req, res) => {
  try {
    const apiStatus = enhancedRoadConditionsService.validateApiKeys();
    
    res.status(200).json({
      success: true,
      data: {
        apiStatus,
        capabilities: {
          googleRoads: {
            available: apiStatus.google,
            features: ['Road snapping', 'Speed limits', 'Road attributes']
          },
          tomtomMaps: {
            available: apiStatus.tomtom,
            features: ['Road network data', 'Map tiles', 'Search functionality']
          },
          hereMaps: {
            available: apiStatus.here,
            features: ['Geocoding', 'Routing', 'Map attributes']
          },
          mapbox: {
            available: apiStatus.mapbox,
            features: ['Geocoding', 'Matrix API', 'Directions']
          }
        },
        overallCapability: this.assessOverallCapability(apiStatus),
        recommendations: this.generateApiRecommendations(apiStatus)
      }
    });

  } catch (error) {
    console.error('API status check error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking API status'
    });
  }
});

// Delete enhanced road conditions data for a route
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

    // Delete road conditions data
    const deleteResult = await enhancedRoadConditionsService.deleteRoadConditionsData(routeId);

    res.status(200).json({
      success: true,
      message: 'Enhanced road conditions data deleted successfully',
      data: deleteResult
    });

  } catch (error) {
    console.error('Delete road conditions error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting road conditions data'
    });
  }
});

// ============================================================================
// HELPER METHODS
// ============================================================================

function determineOverallCondition(summary) {
  const poorPercentage = (summary.issuesDetected.poorSurface / summary.totalSegments) * 100;
  
  if (poorPercentage > 50) return 'Poor - Significant road condition issues';
  if (poorPercentage > 25) return 'Fair - Some road condition concerns';
  if (poorPercentage > 10) return 'Good - Minor road condition issues';
  return 'Excellent - Good road conditions throughout';
}

function identifyPrimaryConcerns(summary) {
  const concerns = [];
  
  if (summary.issuesDetected.poorSurface > 0) {
    concerns.push(`${summary.issuesDetected.poorSurface} segments with poor surface quality`);
  }
  
  if (summary.issuesDetected.construction > 0) {
    concerns.push(`${summary.issuesDetected.construction} construction zones`);
  }
  
  if (summary.issuesDetected.potholes > 0) {
    concerns.push(`${summary.issuesDetected.potholes} areas with potential potholes`);
  }
  
  if (concerns.length === 0) {
    concerns.push('No significant road condition concerns identified');
  }
  
  return concerns.slice(0, 3); // Top 3 concerns
}

function generateTravelRecommendation(summary) {
  if (summary.overallRiskLevel === 'CRITICAL') {
    return 'NOT RECOMMENDED - Severe road condition issues present';
  } else if (summary.overallRiskLevel === 'HIGH') {
    return 'PROCEED WITH EXTREME CAUTION - Significant road challenges';
  } else if (summary.overallRiskLevel === 'MEDIUM') {
    return 'PROCEED WITH CAUTION - Monitor road conditions';
  } else {
    return 'PROCEED WITH STANDARD SAFETY MEASURES';
  }
}

function determineSegmentRiskLevel(riskScore) {
  if (riskScore >= 8) return 'CRITICAL';
  if (riskScore >= 6) return 'HIGH';
  if (riskScore >= 4) return 'MEDIUM';
  return 'LOW';
}

function calculateRouteGrading(riskScore) {
  if (riskScore <= 2) return 'A+';
  if (riskScore <= 3) return 'A';
  if (riskScore <= 4) return 'B';
  if (riskScore <= 5) return 'C';
  if (riskScore <= 6) return 'D';
  return 'F';
}

function calculatePercentileBetter(riskScore) {
  // Simplified percentile calculation
  const normalizedScore = Math.max(0, Math.min(10, riskScore));
  return Math.round((10 - normalizedScore) * 10);
}

function getAverageRiskForTerrain(terrain) {
  const terrainAverages = {
    'urban': 3.2,
    'rural': 5.8,
    'hilly': 6.5,
    'mixed': 4.7,
    'flat': 3.8
  };
  return terrainAverages[terrain] || 4.5;
}

function generateVehicleSpecificRecommendations(roadConditions) {
  const recommendations = {
    lightVehicles: [],
    heavyVehicles: [],
    motorcycles: []
  };
  
  const poorSegments = roadConditions.filter(rc => ['poor', 'critical'].includes(rc.surfaceQuality)).length;
  const potholeAreas = roadConditions.filter(rc => rc.hasPotholes).length;
  const singleLaneSegments = roadConditions.filter(rc => rc.laneCount === 1).length;
  
  if (poorSegments > 0) {
    recommendations.lightVehicles.push('Check tire condition and pressure before travel');
    recommendations.heavyVehicles.push('Reduce load and lower tire pressure for better traction');
    recommendations.motorcycles.push('Wear protective gear and reduce speed significantly');
  }
  
  if (potholeAreas > 0) {
    recommendations.lightVehicles.push('Maintain moderate speed and avoid sudden steering');
    recommendations.heavyVehicles.push('Plan route to avoid overloaded vehicle stress');
    recommendations.motorcycles.push('Exercise extreme caution - consider alternative transport');
  }
  
  if (singleLaneSegments > roadConditions.length * 0.5) {
    recommendations.heavyVehicles.push('Plan for limited passing opportunities');
    recommendations.motorcycles.push('Maintain safe distance from larger vehicles');
  }
  
  return recommendations;
}

function generateTimingRecommendations(roadConditions, route) {
  const recommendations = [];
  
  const constructionZones = roadConditions.filter(rc => rc.underConstruction).length;
  const averageRisk = roadConditions.reduce((sum, rc) => sum + rc.riskScore, 0) / roadConditions.length;
  
  if (constructionZones > 0) {
    recommendations.push({
      category: 'construction',
      recommendation: 'Travel during off-peak hours to avoid construction delays',
      bestTimes: ['Early morning (6-8 AM)', 'Late evening (8-10 PM)']
    });
  }
  
  if (averageRisk >= 6) {
    recommendations.push({
      category: 'safety',
      recommendation: 'Travel during daylight hours for better visibility of road conditions',
      bestTimes: ['Morning (8 AM - 12 PM)', 'Afternoon (2-6 PM)']
    });
  }
  
  if (route.terrain === 'rural') {
    recommendations.push({
      category: 'general',
      recommendation: 'Avoid night travel on rural roads with poor conditions',
      bestTimes: ['Daylight hours only']
    });
  }
  
  return recommendations;
}

function generateEmergencyPreparationRecommendations(roadConditions, route) {
  const recommendations = [];
  
  const highRiskSegments = roadConditions.filter(rc => rc.riskScore >= 7).length;
  const ruralSegments = roadConditions.filter(rc => rc.roadType === 'rural').length;
  
  if (highRiskSegments > 0) {
    recommendations.push({
      priority: 'HIGH',
      item: 'Vehicle Emergency Kit',
      details: ['Spare tire', 'Jump cables', 'Basic tools', 'Emergency triangles']
    });
    
    recommendations.push({
      priority: 'HIGH',
      item: 'Communication Equipment',
      details: ['Fully charged mobile phone', 'Emergency contact numbers', 'GPS device backup']
    });
  }
  
  if (ruralSegments > roadConditions.length * 0.5) {
    recommendations.push({
      priority: 'MEDIUM',
      item: 'Extended Supplies',
      details: ['Extra fuel', 'Water and snacks', 'First aid kit', 'Flashlight']
    });
  }
  
  recommendations.push({
    priority: 'STANDARD',
    item: 'Route Information',
    details: ['Share route plan with others', 'Expected arrival time', 'Alternative contact methods']
  });
  
  return recommendations;
}

function performRouteComparison(currentRoute, comparisonRoutes) {
  if (comparisonRoutes.length === 0) {
    return {
      comparison: 'No comparison routes available',
      ranking: 'Unable to rank',
      insights: []
    };
  }
  
  const currentRisk = currentRoute.averageRiskScore;
  const betterRoutes = comparisonRoutes.filter(route => route.summary.averageRiskScore < currentRisk).length;
  const worseRoutes = comparisonRoutes.filter(route => route.summary.averageRiskScore > currentRisk).length;
  
  return {
    comparison: `Current route ranks ${betterRoutes + 1} out of ${comparisonRoutes.length + 1} routes`,
    ranking: {
      better: betterRoutes,
      worse: worseRoutes,
      total: comparisonRoutes.length
    },
    insights: [
      `${betterRoutes} routes have better road conditions`,
      `${worseRoutes} routes have worse road conditions`,
      currentRisk < 4 ? 'Your route has relatively good road conditions' : 
      currentRisk > 6 ? 'Your route has challenging road conditions' : 'Your route has average road conditions'
    ]
  };
}

function assessOverallCapability(apiStatus) {
  const availableApis = Object.values(apiStatus).filter(status => status).length;
  const totalApis = Object.keys(apiStatus).length;
  
  if (availableApis === 0) return 'No APIs configured - Limited functionality';
  if (availableApis === 1) return 'Basic functionality - Single API source';
  if (availableApis === 2) return 'Good functionality - Multiple API sources';
  if (availableApis >= 3) return 'Excellent functionality - Comprehensive API coverage';
  return 'Unknown';
}

function generateApiRecommendations(apiStatus) {
  const recommendations = [];
  
  if (!apiStatus.google) {
    recommendations.push({
      priority: 'HIGH',
      api: 'Google Roads API',
      reason: 'Provides the most accurate road snapping and speed limit data',
      setup: 'Configure GOOGLE_MAPS_API_KEY environment variable'
    });
  }
  
  if (!apiStatus.here) {
    recommendations.push({
      priority: 'MEDIUM',
      api: 'HERE Maps API',
      reason: 'Excellent for geocoding and routing capabilities',
      setup: 'Configure HERE_API_KEY environment variable'
    });
  }
  
  if (!apiStatus.tomtom) {
    recommendations.push({
      priority: 'MEDIUM',
      api: 'TomTom Maps API',
      reason: 'Good for road network analysis and traffic data',
      setup: 'Configure TOMTOM_API_KEY environment variable'
    });
  }
  
  if (!apiStatus.mapbox) {
    recommendations.push({
      priority: 'LOW',
      api: 'Mapbox API',
      reason: 'Additional geocoding and matrix analysis capabilities',
      setup: 'Configure MAPBOX_API_KEY environment variable'
    });
  }
  
  if (Object.values(apiStatus).every(status => status)) {
    recommendations.push({
      priority: 'INFO',
      message: 'All APIs configured - Maximum functionality available'
    });
  }
  
  return recommendations;
}

function categorizeRiskLevel(riskScore) {
  if (riskScore <= 2) return 'Excellent';
  if (riskScore <= 4) return 'Good';
  if (riskScore <= 6) return 'Fair';
  if (riskScore <= 8) return 'Poor';
  return 'Critical';
}

function compareWithTerrainAverage(terrain, currentScore) {
  const terrainAverage = getAverageRiskForTerrain(terrain);
  const difference = currentScore - terrainAverage;
  
  if (difference <= -1) return `Better than average for ${terrain} terrain`;
  if (difference >= 1) return `Worse than average for ${terrain} terrain`;
  return `Similar to average for ${terrain} terrain`;
}

module.exports = router;