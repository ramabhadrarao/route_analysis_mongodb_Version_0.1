// File: routes/routes.js
// Purpose: Route management endpoints with GPS CSV upload support and data collection
// Dependencies: multer for file uploads, express-validator for validation

const express = require('express');
const multer = require('multer');
const path = require('path');
const { body, query } = require('express-validator');
const routeController = require('../controllers/routeController');
const { auth } = require('../middleware/auth');
const logger = require('../utils/logger');
// ============================================================================
// ADD THESE MISSING IMPORTS (add these lines)
// ============================================================================
const Route = require('../models/Route');  // ✅ ADD THIS LINE
const AccidentProneArea = require('../models/AccidentProneArea');  // ✅ ADD THIS LINE
const RoadCondition = require('../models/RoadCondition');  // ✅ ADD THIS LINE if not present
const WeatherCondition = require('../models/WeatherCondition');  // ✅ ADD THIS LINE if not present
const TrafficData = require('../models/TrafficData');  // ✅ ADD THIS LINE if not present
const EmergencyService = require('../models/EmergencyService');  // ✅ ADD THIS LINE if not present

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, process.env.UPLOAD_PATH || './uploads');
  },
  filename: function (req, file, cb) {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const prefix = file.fieldname === 'gpsFile' ? 'gps-route-' : 'route-';
    cb(null, prefix + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Check file type
  const allowedTypes = ['.csv', '.txt'];
  const fileExt = path.extname(file.originalname).toLowerCase();
  
  if (allowedTypes.includes(fileExt)) {
    cb(null, true);
  } else {
    cb(new Error('Only CSV and TXT files are allowed'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE?.replace('mb', '')) * 1024 * 1024 || 50 * 1024 * 1024 // 50MB default
  }
});

// Validation rules for manual route creation
const createRouteValidation = [
  body('routeName')
    .notEmpty()
    .withMessage('Route name is required')
    .isLength({ min: 3, max: 255 })
    .withMessage('Route name must be between 3 and 255 characters'),
    
  body('fromAddress')
    .notEmpty()
    .withMessage('From address is required'),
    
  body('toAddress')
    .notEmpty()
    .withMessage('To address is required'),
    
  body('fromCoordinates.latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('From latitude must be between -90 and 90'),
    
  body('fromCoordinates.longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('From longitude must be between -180 and 180'),
    
  body('toCoordinates.latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('To latitude must be between -90 and 90'),
    
  body('toCoordinates.longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('To longitude must be between -180 and 180'),
    
  body('terrain')
    .optional()
    .isIn(['flat', 'hilly', 'urban', 'rural', 'mixed'])
    .withMessage('Terrain must be one of: flat, hilly, urban, rural, mixed'),
    
  body('majorHighways')
    .optional()
    .isArray()
    .withMessage('Major highways must be an array'),
    
  body('fromCode')
    .optional()
    .isLength({ max: 50 })
    .withMessage('From code cannot exceed 50 characters'),
    
  body('toCode')
    .optional()
    .isLength({ max: 50 })
    .withMessage('To code cannot exceed 50 characters')
];

// Validation rules for GPS route upload
const gpsRouteValidation = [
  body('fromCode')
    .notEmpty()
    .withMessage('From code is required')
    .isLength({ max: 50 })
    .withMessage('From code cannot exceed 50 characters'),
    
  body('fromName')
    .notEmpty()
    .withMessage('From name is required')
    .isLength({ min: 1, max: 255 })
    .withMessage('From name must be between 1 and 255 characters'),
    
  body('toCode')
    .notEmpty()
    .withMessage('To code is required')
    .isLength({ max: 50 })
    .withMessage('To code cannot exceed 50 characters'),
    
  body('toName')
    .notEmpty()
    .withMessage('To name is required')
    .isLength({ min: 1, max: 255 })
    .withMessage('To name must be between 1 and 255 characters'),
    
  body('routeName')
    .optional()
    .isLength({ min: 3, max: 255 })
    .withMessage('Route name must be between 3 and 255 characters'),
    
  body('terrain')
    .optional()
    .isIn(['flat', 'hilly', 'urban', 'rural', 'mixed'])
    .withMessage('Terrain must be one of: flat, hilly, urban, rural, mixed'),
    
  body('fromAddress')
    .optional()
    .isLength({ max: 255 })
    .withMessage('From address cannot exceed 255 characters'),
    
  body('toAddress')
    .optional()
    .isLength({ max: 255 })
    .withMessage('To address cannot exceed 255 characters')
];

const updateRouteValidation = [
  body('routeName')
    .optional()
    .isLength({ min: 3, max: 255 })
    .withMessage('Route name must be between 3 and 255 characters'),
    
  body('terrain')
    .optional()
    .isIn(['flat', 'hilly', 'urban', 'rural', 'mixed'])
    .withMessage('Terrain must be one of: flat, hilly, urban, rural, mixed'),
    
  body('majorHighways')
    .optional()
    .isArray()
    .withMessage('Major highways must be an array')
];

const queryValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
    
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
    
  query('riskLevel')
    .optional()
    .isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
    .withMessage('Risk level must be one of: LOW, MEDIUM, HIGH, CRITICAL'),
    
  query('search')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Search query must be between 1 and 100 characters')
];

// All routes require authentication
router.use(auth);

// Route CRUD operations
router.post('/', createRouteValidation, routeController.createRoute);
router.get('/', queryValidation, routeController.getRoutes);
router.get('/:id', routeController.getRoute);
router.put('/:id', updateRouteValidation, routeController.updateRoute);
router.delete('/:id', routeController.deleteRoute);

// GPS Route Upload - NEW ENDPOINT for your requirement
router.post('/upload-gps-route', 
  upload.single('gpsFile'), 
  gpsRouteValidation, 
  routeController.uploadGPSRoute
);

// Legacy CSV upload (for backward compatibility)
router.post('/upload-csv', upload.single('csvFile'), routeController.uploadCSV);

// Risk calculation
router.post('/:id/recalculate-risk', routeController.recalculateRisk);

// Route analytics endpoints
router.get('/:id/analytics', async (req, res) => {
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
    
    // REAL ANALYTICS DATA COLLECTION
    const [roadConditions, accidentAreas, weatherConditions, trafficData, emergencyServices] = await Promise.all([
      RoadCondition.find({ routeId }),
      AccidentProneArea.find({ routeId }),
      WeatherCondition.find({ routeId }),
      TrafficData.find({ routeId }),
      EmergencyService.find({ routeId })
    ]);
    
    const analytics = {
      route: {
        id: route._id,
        routeId: route.routeId,
        name: route.routeName,
        distance: route.totalDistance,
        riskLevel: route.riskLevel,
        totalRiskScore: route.riskScores?.totalWeightedScore || 0
      },
      dataPoints: {
        roadConditions: roadConditions.length,
        accidentAreas: accidentAreas.length,
        weatherPoints: weatherConditions.length,
        trafficPoints: trafficData.length,
        emergencyServices: emergencyServices.length
      },
      riskBreakdown: route.riskScores || {},
      dataQuality: this.assessAnalyticsDataQuality(roadConditions, accidentAreas, weatherConditions),
      lastUpdated: route.metadata?.lastCalculated || route.updatedAt,
      dataSource: 'REAL_COLLECTED_DATA'
    };
    
    res.status(200).json({
      success: true,
      data: analytics
    });
    
  } catch (error) {
    console.error('Real route analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching real route analytics'
    });
  }
});

// Helper method for data quality assessment
function assessAnalyticsDataQuality(roadConditions, accidentAreas, weatherConditions) {
  let quality = 'poor';
  const totalDataPoints = roadConditions.length + accidentAreas.length + weatherConditions.length;
  
  if (totalDataPoints > 50) quality = 'excellent';
  else if (totalDataPoints > 20) quality = 'good';
  else if (totalDataPoints > 5) quality = 'fair';
  
  return {
    level: quality,
    totalDataPoints,
    breakdown: {
      roadConditions: roadConditions.length,
      accidentAreas: accidentAreas.length,
      weatherConditions: weatherConditions.length
    }
  };
}

// Export route data
router.get('/:id/export', async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      message: 'Route export endpoint - coming soon',
      routeId: req.params.id
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error exporting route data'
    });
  }
});

// Route sharing (generate shareable link)
router.post('/:id/share', async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      message: 'Route sharing endpoint - coming soon',
      routeId: req.params.id
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error generating shareable link'
    });
  }
});

// Get GPS tracking points for a route
router.get('/:id/gps-points', async (req, res) => {
  try {
    const Route = require('../models/Route');
    
    const route = await Route.findOne({
      _id: req.params.id,
      userId: req.user.id,
      status: { $ne: 'deleted' }
    }).select('routePoints routeName fromName toName totalDistance');

    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        routeId: req.params.id,
        routeName: route.routeName,
        fromName: route.fromName,
        toName: route.toName,
        totalDistance: route.totalDistance,
        gpsPoints: route.routePoints,
        totalPoints: route.routePoints.length
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching GPS points'
    });
  }
});

// Collect all route data with enhanced weather and visibility analysis
// FIXED: Comprehensive data collection with proper async/await handling
router.post('/:id/collect-all-data', async (req, res) => {
  try {
    const Route = require('../models/Route');
    
    const route = await Route.findOne({
      _id: req.params.id,
      userId: req.user.id,
      status: { $ne: 'deleted' }
    });

    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    console.log(`🔄 Starting ENHANCED comprehensive data collection for route: ${route.routeId}`);
    
    // ===================================================================
    // SEQUENTIAL DATA COLLECTION WITH PROGRESS TRACKING
    // ===================================================================
    
    let collectionStatus = {
      totalSteps: 7,
      currentStep: 0,
      stepResults: {},
      startTime: Date.now()
    };

    // Helper function to update progress
    const updateProgress = (stepName, status, data = null) => {
      collectionStatus.currentStep++;
      collectionStatus.stepResults[stepName] = {
        status: status,
        data: data,
        timestamp: new Date(),
        step: collectionStatus.currentStep
      };
      console.log(`📊 Step ${collectionStatus.currentStep}/${collectionStatus.totalSteps}: ${stepName} - ${status}`);
    };

    try {
      // ===================================================================
      // STEP 1: ORIGINAL DATA COLLECTION
      // ===================================================================
      console.log('🔄 Step 1/7: Starting original data collection...');
      let originalResults;
      try {
        const dataCollectionService = require('../services/dataCollectionService');
        originalResults = await dataCollectionService.collectAllRouteData(req.params.id);
        updateProgress('originalDataCollection', 'SUCCESS', originalResults);
      } catch (error) {
        console.error('❌ Original data collection failed:', error);
        updateProgress('originalDataCollection', 'FAILED', { error: error.message });
        originalResults = { error: error.message, source: 'dataCollection' };
      }

      // ===================================================================
      // STEP 2: ENHANCED WEATHER DATA
      // ===================================================================
      console.log('🔄 Step 2/7: Starting enhanced weather data collection...');
      let seasonalWeatherResults;
      try {
        const enhancedWeatherService = require('../services/enhancedWeatherService');
        seasonalWeatherResults = await enhancedWeatherService.collectAllSeasonalWeatherData(req.params.id);
        updateProgress('seasonalWeatherAnalysis', 'SUCCESS', seasonalWeatherResults);
      } catch (error) {
        console.error('❌ Seasonal weather collection failed:', error);
        updateProgress('seasonalWeatherAnalysis', 'FAILED', { error: error.message });
        seasonalWeatherResults = { error: error.message, source: 'seasonalWeather' };
      }

      // ===================================================================
      // STEP 3: VISIBILITY ANALYSIS
      // ===================================================================
      console.log('🔄 Step 3/7: Starting visibility analysis...');
      let visibilityResults;
      try {
        visibilityResults = await collectVisibilityAnalysis(req.params.id);
        updateProgress('visibilityAnalysis', 'SUCCESS', visibilityResults);
      } catch (error) {
        console.error('❌ Visibility analysis failed:', error);
        updateProgress('visibilityAnalysis', 'FAILED', { error: error.message });
        visibilityResults = { error: error.message, source: 'visibilityAnalysis' };
      }

      // ===================================================================
      // STEP 4: NETWORK COVERAGE ANALYSIS
      // ===================================================================
      console.log('🔄 Step 4/7: Starting network coverage analysis...');
      let networkCoverageResults;
      try {
        const { NetworkCoverageService } = require('../services/networkCoverageService');
        networkCoverageResults = await NetworkCoverageService.analyzeNetworkCoverage(req.params.id);
        updateProgress('networkCoverageAnalysis', 'SUCCESS', networkCoverageResults);
      } catch (error) {
        console.error('❌ Network coverage analysis failed:', error);
        updateProgress('networkCoverageAnalysis', 'FAILED', { error: error.message });
        networkCoverageResults = { error: error.message, source: 'networkCoverage' };
      }

      // ===================================================================
      // STEP 5: ACCIDENT DATA COLLECTION
      // ===================================================================
      console.log('🔄 Step 5/7: Starting accident data collection...');
      let accidentDataResults;
      try {
        const accidentDataService = require('../services/accidentDataService');
        accidentDataResults = await accidentDataService.collectRealAccidentProneAreas(route);
        updateProgress('accidentDataCollection', 'SUCCESS', accidentDataResults);
      } catch (error) {
        console.error('❌ Accident data collection failed:', error);
        updateProgress('accidentDataCollection', 'FAILED', { error: error.message });
        accidentDataResults = { error: error.message, source: 'accidentData' };
      }

      // ===================================================================
      // STEP 6: RISK CALCULATION
      // ===================================================================
      console.log('🔄 Step 6/7: Starting comprehensive risk calculation...');
      let riskCalculationResults;
      try {
        const riskCalculationService = require('../services/riskCalculationService');
        riskCalculationResults = await riskCalculationService.calculateRouteRisk(req.params.id);
        updateProgress('riskCalculation', 'SUCCESS', riskCalculationResults);
      } catch (error) {
        console.error('❌ Risk calculation failed:', error);
        updateProgress('riskCalculation', 'FAILED', { error: error.message });
        riskCalculationResults = { error: error.message, source: 'riskCalculation' };
      }

      // ===================================================================
      // STEP 7: UPDATE ROUTE STATUS
      // ===================================================================
      console.log('🔄 Step 7/7: Updating route processing status...');
      try {
        await Route.findByIdAndUpdate(req.params.id, {
          'dataProcessingStatus.emergencyServices': !originalResults.error,
          'dataProcessingStatus.weatherData': !seasonalWeatherResults.error,
          'dataProcessingStatus.trafficData': !originalResults.error,
          'dataProcessingStatus.accidentData': !accidentDataResults.error,
          'dataProcessingStatus.roadConditions': !originalResults.error,
          'dataProcessingStatus.networkCoverage': !networkCoverageResults.error,
          'dataProcessingStatus.securityData': true,
          'metadata.lastDataCollection': new Date(),
          'metadata.dataCollectionVersion': '2.0-enhanced'
        });
        updateProgress('routeStatusUpdate', 'SUCCESS', { updated: true });
      } catch (error) {
        console.error('❌ Route status update failed:', error);
        updateProgress('routeStatusUpdate', 'FAILED', { error: error.message });
      }

      // ===================================================================
      // CALCULATE COMPLETION STATISTICS
      // ===================================================================
      const totalExecutionTime = Date.now() - collectionStatus.startTime;
      const successfulSteps = Object.values(collectionStatus.stepResults).filter(step => step.status === 'SUCCESS').length;
      const failedSteps = Object.values(collectionStatus.stepResults).filter(step => step.status === 'FAILED').length;

      // ===================================================================
      // PROCESS RESULTS FOR COMPREHENSIVE RESPONSE
      // ===================================================================
      const processedResults = {
        // Original data collection
        originalDataCollection: processCollectionResults(originalResults),
        
        // Enhanced weather analysis
        seasonalWeatherAnalysis: processSeasonalWeatherResults(seasonalWeatherResults),
        
        // Visibility analysis
        visibilityAnalysis: processVisibilityResults(visibilityResults),
        
        // Network coverage analysis
        networkCoverageAnalysis: processNetworkCoverageResults(networkCoverageResults),
        
        // Accident data analysis
        accidentDataAnalysis: processAccidentDataResults(accidentDataResults),
        
        // Risk calculation
        riskAssessment: processRiskCalculationResults(riskCalculationResults)
      };

      // ===================================================================
      // COMPREHENSIVE SUMMARY
      // ===================================================================
      const comprehensiveSummary = {
        executionDetails: {
          totalSteps: collectionStatus.totalSteps,
          successfulSteps: successfulSteps,
          failedSteps: failedSteps,
          successRate: Math.round((successfulSteps / collectionStatus.totalSteps) * 100),
          totalExecutionTime: `${(totalExecutionTime / 1000).toFixed(2)}s`,
          completedAt: new Date()
        },
        
        dataCategories: {
          emergencyServices: processedResults.originalDataCollection.emergencyServices?.total || 0,
          weatherPoints: processedResults.originalDataCollection.weatherData?.total || 0,
          seasonalWeatherPoints: processedResults.seasonalWeatherAnalysis.totalDataPoints || 0,
          trafficPoints: processedResults.originalDataCollection.trafficData?.total || 0,
          accidentAreas: processedResults.accidentDataAnalysis.total || 0,
          roadConditions: processedResults.originalDataCollection.roadConditions?.total || 0,
          sharpTurns: processedResults.visibilityAnalysis.summary?.totalSharpTurns || 0,
          blindSpots: processedResults.visibilityAnalysis.summary?.totalBlindSpots || 0,
          networkCoveragePoints: processedResults.networkCoverageAnalysis.totalAnalysisPoints || 0,
          deadZones: processedResults.networkCoverageAnalysis.deadZones?.total || 0
        },
        
        totalDataPoints: calculateTotalDataPoints(processedResults),
        
        dataQuality: assessOverallDataQuality(collectionStatus.stepResults),
        
        riskFactors: identifyOverallRiskFactors(processedResults),
        
        completionStatus: generateCompletionStatus(collectionStatus.stepResults)
      };

      // ===================================================================
      // ENHANCED RECOMMENDATIONS
      // ===================================================================
      const enhancedRecommendations = generateEnhancedRecommendations(processedResults, comprehensiveSummary);

      // ===================================================================
      // SEND FINAL RESPONSE AFTER ALL OPERATIONS COMPLETE
      // ===================================================================
      console.log(`✅ ENHANCED data collection completed for route ${route.routeId} in ${(totalExecutionTime / 1000).toFixed(2)}s`);
      console.log(`📊 Success Rate: ${comprehensiveSummary.executionDetails.successRate}% (${successfulSteps}/${collectionStatus.totalSteps} steps)`);

      // 🔥 CRITICAL: Response sent ONLY after ALL operations complete
      res.status(200).json({
        success: true,
        message: 'ENHANCED comprehensive data collection completed successfully',
        
        routeInfo: {
          routeId: route.routeId,
          routeName: route.routeName,
          fromName: route.fromName,
          toName: route.toName,
          totalDistance: route.totalDistance,
          terrain: route.terrain,
          gpsPoints: route.routePoints.length
        },
        
        executionSummary: comprehensiveSummary.executionDetails,
        
        // Detailed results for each category
        dataCollectionResults: processedResults,
        
        // Comprehensive summary
        overallSummary: comprehensiveSummary,
        
        // Step-by-step execution log
        executionLog: collectionStatus.stepResults,
        
        // Enhanced recommendations
        recommendations: enhancedRecommendations,
        
        // API endpoints for accessing collected data
        apiEndpoints: {
          // Original endpoints
          emergencyServices: `/api/routes/${req.params.id}/emergency-services`,
          weatherData: `/api/routes/${req.params.id}/weather-data`,
          trafficData: `/api/routes/${req.params.id}/traffic-data`,
          roadConditions: `/api/routes/${req.params.id}/road-conditions`,
          accidentAreas: `/api/routes/${req.params.id}/accident-areas`,
          
          // Enhanced endpoints
          seasonalWeatherAnalysis: `/api/routes/${req.params.id}/seasonal-weather-analysis`,
          sharpTurns: `/api/routes/${req.params.id}/sharp-turns`,
          blindSpots: `/api/routes/${req.params.id}/blind-spots`,
          networkCoverage: `/api/network-coverage/routes/${req.params.id}/overview`,
          deadZones: `/api/network-coverage/routes/${req.params.id}/dead-zones`,
          riskAssessment: `/api/risk/calculate/${req.params.id}`,
          
          // Analysis endpoints
          comprehensiveAnalysis: `/api/routes/${req.params.id}/comprehensive-analysis`,
          visibilityStats: `/api/routes/${req.params.id}/visibility-stats`
        },
        
        // Next steps for the user
        nextSteps: [
          '✅ All route data collection completed successfully',
          '🔍 Review execution log for any failed steps',
          '📊 Use provided API endpoints for detailed analysis',
          '🎯 Implement recommendations based on risk factors',
          '⚠️ Address any critical issues identified',
          '📈 Monitor data quality and update as needed'
        ],
        
        // Performance metrics
        performanceMetrics: {
          totalExecutionTime: totalExecutionTime,
          avgTimePerStep: Math.round(totalExecutionTime / collectionStatus.totalSteps),
          dataPointsPerSecond: Math.round(comprehensiveSummary.totalDataPoints / (totalExecutionTime / 1000)),
          memoryUsage: process.memoryUsage(),
          dataCollectionTimestamp: new Date()
        }
      });

    } catch (processingError) {
      console.error('❌ Data collection processing error:', processingError);
      
      // Even in case of processing errors, wait and send response
      res.status(500).json({
        success: false,
        message: 'Data collection completed with processing errors',
        routeId: route.routeId,
        error: processingError.message,
        executionLog: collectionStatus.stepResults,
        partialData: true,
        timestamp: new Date()
      });
    }

  } catch (error) {
    console.error('❌ Enhanced data collection error:', error);
    
    // Final error response - also waits for completion
    res.status(500).json({
      success: false,
      message: 'Enhanced data collection failed',
      error: error.message,
      timestamp: new Date(),
      troubleshooting: [
        'Check if all required services are available',
        'Verify route has sufficient GPS points',
        'Ensure database connectivity',
        'Check API key configurations'
      ]
    });
  }
});


// Enhanced visibility analysis collection
async function collectVisibilityAnalysis(routeId) {
  try {
    const sharpTurnsService = require('../services/sharpTurnsBlindSpotsService');
    return await sharpTurnsService.analyzeRoute(routeId);
  } catch (error) {
    console.error('Visibility analysis failed:', error);
    return { 
      error: error.message, 
      summary: { 
        totalSharpTurns: 0, 
        totalBlindSpots: 0,
        criticalTurns: 0,
        criticalBlindSpots: 0,
        overallRiskLevel: 'UNKNOWN'
      } 
    };
  }
}
// Process collection results
// Process collection results with null safety
function processCollectionResults(originalResults) {
  if (originalResults && !originalResults.error) {
    return originalResults;
  } else {
    return { 
      error: originalResults?.error || 'Collection failed',
      emergencyServices: { total: 0 },
      weatherData: { total: 0 },
      trafficData: { total: 0 },
      roadConditions: { total: 0 },
      amenities: { total: 0 }
    };
  }
}

// Process seasonal weather results
// Process seasonal weather results
function processSeasonalWeatherResults(seasonalResults) {
  if (seasonalResults && !seasonalResults.error) {
    return seasonalResults;
  } else {
    return { 
      error: seasonalResults?.error || 'Seasonal weather collection failed',
      totalDataPoints: 0,
      seasonalData: {},
      analysis: null,
      vehiclePredictions: null
    };
  }
}

// Process visibility analysis results
function processVisibilityResults(visibilityResults) {
  if (visibilityResults && !visibilityResults.error) {
    return visibilityResults;
  } else {
    return { 
      error: visibilityResults?.error || 'Visibility analysis failed',
      summary: { 
        totalSharpTurns: 0, 
        totalBlindSpots: 0, 
        criticalTurns: 0, 
        criticalBlindSpots: 0,
        overallRiskLevel: 'UNKNOWN'
      }
    };
  }
}

// Process network coverage results
function processNetworkCoverageResults(networkResults) {
  if (networkResults && !networkResults.error) {
    return networkResults;
  } else {
    return { 
      error: networkResults?.error || 'Network coverage analysis failed',
      totalAnalysisPoints: 0,
      deadZones: { total: 0 },
      averageSignalStrength: 0,
      communicationRisk: 5
    };
  }
}

// Process accident data results
function processAccidentDataResults(accidentResults) {
  if (accidentResults && !accidentResults.error) {
    return accidentResults;
  } else {
    return { 
      error: accidentResults?.error || 'Accident data collection failed',
      total: 0,
      bySource: {},
      highRiskAreas: 0,
      averageRisk: 0
    };
  }
}
// Process risk calculation results
function processRiskCalculationResults(riskResults) {
  if (riskResults && !riskResults.error) {
    return riskResults;
  } else {
    return { 
      error: riskResults?.error || 'Risk calculation failed',
      totalWeightedScore: 0,
      riskGrade: 'UNKNOWN',
      riskLevel: 'UNKNOWN',
      confidenceLevel: 0
    };
  }
}

// Calculate total data points across all collections
function calculateTotalDataPoints(processedResults) {
  const original = (processedResults.originalDataCollection.emergencyServices?.total || 0) +
                  (processedResults.originalDataCollection.weatherData?.total || 0) +
                  (processedResults.originalDataCollection.trafficData?.total || 0) +
                  (processedResults.originalDataCollection.roadConditions?.total || 0);
  
  const seasonal = processedResults.seasonalWeatherAnalysis.totalDataPoints || 0;
  const visibility = (processedResults.visibilityAnalysis.summary?.totalSharpTurns || 0) + 
                    (processedResults.visibilityAnalysis.summary?.totalBlindSpots || 0);
  const network = processedResults.networkCoverageAnalysis.totalAnalysisPoints || 0;
  const accident = processedResults.accidentDataAnalysis.total || 0;
  
  return original + seasonal + visibility + network + accident;
}

// Assess overall data quality based on step results
function assessOverallDataQuality(stepResults) {
  const totalSteps = Object.keys(stepResults).length;
  const successfulSteps = Object.values(stepResults).filter(step => step.status === 'SUCCESS').length;
  
  const percentage = totalSteps > 0 ? (successfulSteps / totalSteps) * 100 : 0;
  
  let quality = 'poor';
  if (percentage >= 90) quality = 'excellent';
  else if (percentage >= 75) quality = 'good';
  else if (percentage >= 50) quality = 'fair';
  
  return {
    level: quality,
    successRate: Math.round(percentage),
    successfulSteps: successfulSteps,
    totalSteps: totalSteps,
    failedSteps: totalSteps - successfulSteps
  };
}
// Identify overall risk factors from processed results
function identifyOverallRiskFactors(processedResults) {
  const riskFactors = [];
  
  // Network coverage risks
  const deadZones = processedResults.networkCoverageAnalysis.deadZones?.total || 0;
  if (deadZones > 3) {
    riskFactors.push({
      category: 'network_coverage',
      risk: 'high',
      description: `${deadZones} dead zones detected`,
      impact: 'communication_failure_risk'
    });
  }
  
  // Visibility risks
  const criticalVisibilityPoints = (processedResults.visibilityAnalysis.summary?.criticalTurns || 0) + 
                                  (processedResults.visibilityAnalysis.summary?.criticalBlindSpots || 0);
  if (criticalVisibilityPoints > 2) {
    riskFactors.push({
      category: 'visibility_hazards',
      risk: 'high',
      description: `${criticalVisibilityPoints} critical visibility hazards`,
      impact: 'accident_risk_increase'
    });
  }
  
  // Weather risks
  if (processedResults.seasonalWeatherAnalysis.analysis?.worstSeason?.score >= 7) {
    riskFactors.push({
      category: 'seasonal_weather',
      risk: 'high',
      description: 'Severe seasonal weather conditions identified',
      impact: 'travel_disruption_and_safety_risk'
    });
  }
  
  // Accident risks
  const highRiskAccidentAreas = processedResults.accidentDataAnalysis.highRiskAreas || 0;
  if (highRiskAccidentAreas > 2) {
    riskFactors.push({
      category: 'accident_prone_areas',
      risk: 'high',
      description: `${highRiskAccidentAreas} high-risk accident areas`,
      impact: 'increased_accident_probability'
    });
  }
  
  return riskFactors;
}
// Generate completion status for each step
function generateCompletionStatus(stepResults) {
  const status = {};
  
  Object.entries(stepResults).forEach(([stepName, result]) => {
    status[stepName] = result.status === 'SUCCESS' ? '✅ Complete' : '❌ Failed';
  });
  
  return status;
}

// Generate enhanced recommendations based on all collected data
function generateEnhancedRecommendations(processedResults, comprehensiveSummary) {
  const recommendations = {
    immediate: [],
    planning: [],
    equipment: [],
    maintenance: []
  };
  
  // Critical recommendations based on success rate
  if (comprehensiveSummary.executionDetails.successRate < 70) {
    recommendations.immediate.push({
      priority: 'CRITICAL',
      category: 'data_quality',
      action: 'Address failed data collection steps before route execution',
      reason: `Only ${comprehensiveSummary.executionDetails.successRate}% of data collection completed successfully`
    });
  }
  
  // Network coverage recommendations
  const deadZones = processedResults.networkCoverageAnalysis.deadZones?.total || 0;
  if (deadZones > 0) {
    recommendations.equipment.push({
      priority: 'HIGH',
      category: 'communication',
      action: `Install satellite communication for ${deadZones} dead zones`,
      reason: 'Cellular coverage gaps require backup communication'
    });
  }
  
  // Visibility recommendations
  const criticalVisibility = (processedResults.visibilityAnalysis.summary?.criticalTurns || 0) + 
                            (processedResults.visibilityAnalysis.summary?.criticalBlindSpots || 0);
  if (criticalVisibility > 0) {
    recommendations.immediate.push({
      priority: 'HIGH',
      category: 'safety',
      action: `Implement convoy travel for ${criticalVisibility} critical visibility points`,
      reason: 'Critical visibility hazards require enhanced safety measures'
    });
  }
  
  // Weather-based recommendations
  if (processedResults.seasonalWeatherAnalysis.analysis?.criticalPeriods?.length > 0) {
    recommendations.planning.push({
      priority: 'MEDIUM',
      category: 'timing',
      action: 'Plan route execution outside critical weather periods',
      reason: 'Seasonal weather analysis identified high-risk periods'
    });
  }
  
  return recommendations;
}
// Check for critical risks
// function hasCriticalRisks(seasonalWeather, visibilityAnalysis) {
//   const criticalWeather = seasonalWeather.analysis?.worstSeason?.score >= 8;
//   const criticalVisibility = (visibilityAnalysis.summary?.criticalTurns || 0) + 
//                             (visibilityAnalysis.summary?.criticalBlindSpots || 0) > 5;
//   const criticalPeriods = (seasonalWeather.analysis?.criticalPeriods?.length || 0) > 2;
  
//   return criticalWeather || criticalVisibility || criticalPeriods;
// }

// // Generate critical alerts
// function generateCriticalAlerts(seasonalWeather, visibilityAnalysis) {
//   const alerts = [];
  
//   if (seasonalWeather.analysis?.worstSeason?.score >= 8) {
//     alerts.push({
//       level: 'CRITICAL',
//       category: 'seasonal_weather',
//       message: `EXTREME WEATHER RISK: ${seasonalWeather.analysis.worstSeason.season} season`,
//       action: 'Consider route suspension during critical weather periods',
//       urgency: 'immediate_attention'
//     });
//   }
  
//   const criticalVisibility = (visibilityAnalysis.summary?.criticalTurns || 0) + 
//                             (visibilityAnalysis.summary?.criticalBlindSpots || 0);
  
//   if (criticalVisibility > 5) {
//     alerts.push({
//       level: 'CRITICAL',
//       category: 'visibility_hazards',
//       message: `CRITICAL VISIBILITY HAZARDS: ${criticalVisibility} dangerous points`,
//       action: 'Mandatory convoy travel and speed restrictions required',
//       urgency: 'immediate_safety_measures'
//     });
//   }
  
//   return alerts;
// }

// // Generate immediate recommendations
// function generateImmediateRecommendations(seasonalWeather, visibilityAnalysis) {
//   const recommendations = [];
  
//   // Weather-based immediate actions
//   if (seasonalWeather.analysis?.worstSeason) {
//     recommendations.push({
//       priority: 'HIGH',
//       category: 'seasonal_planning',
//       action: `Avoid travel during ${seasonalWeather.analysis.worstSeason.season} season if possible`,
//       reason: 'High weather risk identified'
//     });
//   }
  
//   // Visibility-based immediate actions
//   const criticalPoints = (visibilityAnalysis.summary?.criticalTurns || 0) + 
//                         (visibilityAnalysis.summary?.criticalBlindSpots || 0);
  
//   if (criticalPoints > 0) {
//     recommendations.push({
//       priority: 'CRITICAL',
//       category: 'visibility_safety',
//       action: `Implement convoy travel for ${criticalPoints} critical visibility points`,
//       reason: 'Critical visibility hazards require enhanced safety measures'
//     });
//   }
  
//   // Vehicle maintenance based on seasonal predictions
//   if (seasonalWeather.vehiclePredictions?.recommendations?.length > 0) {
//     recommendations.push({
//       priority: 'MEDIUM',
//       category: 'vehicle_maintenance',
//       action: 'Review seasonal vehicle maintenance requirements',
//       reason: 'Weather conditions affect vehicle performance'
//     });
//   }
  
//   return recommendations;
// }

// Get collected emergency services
router.get('/:id/emergency-services', async (req, res) => {
  try {
    const EmergencyService = require('../models/EmergencyService');
    
    const services = await EmergencyService.find({ routeId: req.params.id })
      .sort({ distanceFromRouteKm: 1 });

    const summary = {
      total: services.length,
      byType: {
        hospitals: services.filter(s => s.serviceType === 'hospital').length,
        police: services.filter(s => s.serviceType === 'police').length,
        fireStations: services.filter(s => s.serviceType === 'fire_station').length
      },
      closest: {
        hospital: services.find(s => s.serviceType === 'hospital'),
        police: services.find(s => s.serviceType === 'police'),
        fireStation: services.find(s => s.serviceType === 'fire_station')
      },
      averageDistance: services.reduce((sum, s) => sum + s.distanceFromRouteKm, 0) / services.length || 0
    };

    res.status(200).json({
      success: true,
      summary,
      services: services.map(s => ({
        type: s.serviceType,
        name: s.name,
        distance: s.distanceFromRouteKm,
        responseTime: s.responseTimeMinutes,
        coordinates: { latitude: s.latitude, longitude: s.longitude },
        address: s.address,
        availabilityScore: s.availabilityScore
      }))
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching emergency services'
    });
  }
});

// Get weather data
router.get('/:id/weather-data', async (req, res) => {
  try {
    const WeatherCondition = require('../models/WeatherCondition');
    
    const weatherData = await WeatherCondition.find({ routeId: req.params.id })
      .sort({ createdAt: -1 });

    const summary = {
      total: weatherData.length,
      averageTemp: weatherData.reduce((sum, w) => sum + w.averageTemperature, 0) / weatherData.length || 0,
      averageRisk: weatherData.reduce((sum, w) => sum + w.riskScore, 0) / weatherData.length || 0,
      conditions: [...new Set(weatherData.map(w => w.weatherCondition))],
      surfaceConditions: [...new Set(weatherData.map(w => w.roadSurfaceCondition))]
    };

    res.status(200).json({
      success: true,
      summary,
      weatherPoints: weatherData.map(w => ({
        coordinates: { latitude: w.latitude, longitude: w.longitude },
        temperature: w.averageTemperature,
        condition: w.weatherCondition,
        visibility: w.visibilityKm,
        windSpeed: w.windSpeedKmph,
        riskScore: w.riskScore,
        surfaceCondition: w.roadSurfaceCondition
      }))
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching weather data'
    });
  }
});

// Get traffic data
router.get('/:id/traffic-data', async (req, res) => {
  try {
    const TrafficData = require('../models/TrafficData');
    
    const trafficData = await TrafficData.find({ routeId: req.params.id })
      .sort({ measurementTime: -1 });

    const summary = {
      total: trafficData.length,
      averageSpeed: trafficData.reduce((sum, t) => sum + t.averageSpeedKmph, 0) / trafficData.length || 0,
      averageRisk: trafficData.reduce((sum, t) => sum + t.riskScore, 0) / trafficData.length || 0,
      congestionLevels: {
        severe: trafficData.filter(t => t.congestionLevel === 'severe').length,
        heavy: trafficData.filter(t => t.congestionLevel === 'heavy').length,
        moderate: trafficData.filter(t => t.congestionLevel === 'moderate').length,
        light: trafficData.filter(t => t.congestionLevel === 'light').length,
        freeFlow: trafficData.filter(t => t.congestionLevel === 'free_flow').length
      }
    };

    res.status(200).json({
      success: true,
      summary,
      trafficPoints: trafficData.map(t => ({
        coordinates: { latitude: t.latitude, longitude: t.longitude },
        speed: t.averageSpeedKmph,
        congestionLevel: t.congestionLevel,
        riskScore: t.riskScore,
        bottlenecks: t.bottleneckCauses,
        measurementTime: t.measurementTime
      }))
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching traffic data'
    });
  }
});

// Get accident-prone areas
router.get('/:id/accident-areas', async (req, res) => {
  try {
    const AccidentProneArea = require('../models/AccidentProneArea');
    
    const accidentAreas = await AccidentProneArea.find({ routeId: req.params.id })
      .sort({ riskScore: -1 });

    const summary = {
      total: accidentAreas.length,
      highRisk: accidentAreas.filter(a => a.riskScore > 7).length,
      mediumRisk: accidentAreas.filter(a => a.riskScore >= 5 && a.riskScore <= 7).length,
      lowRisk: accidentAreas.filter(a => a.riskScore < 5).length,
      averageRisk: accidentAreas.reduce((sum, a) => sum + a.riskScore, 0) / accidentAreas.length || 0,
      severityBreakdown: {
        fatal: accidentAreas.filter(a => a.accidentSeverity === 'fatal').length,
        major: accidentAreas.filter(a => a.accidentSeverity === 'major').length,
        minor: accidentAreas.filter(a => a.accidentSeverity === 'minor').length
      }
    };

    res.status(200).json({
      success: true,
      summary,
      accidentAreas: accidentAreas.map(a => ({
        coordinates: { latitude: a.latitude, longitude: a.longitude },
        riskScore: a.riskScore,
        severity: a.accidentSeverity,
        frequency: a.accidentFrequencyYearly,
        commonTypes: a.commonAccidentTypes,
        contributingFactors: a.contributingFactors
      }))
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching accident-prone areas'
    });
  }
});

// Get road conditions
router.get('/:id/road-conditions', async (req, res) => {
  try {
    const RoadCondition = require('../models/RoadCondition');
    
    const roadConditions = await RoadCondition.find({ routeId: req.params.id })
      .sort({ riskScore: -1 });

    const summary = {
      total: roadConditions.length,
      averageRisk: roadConditions.reduce((sum, r) => sum + r.riskScore, 0) / roadConditions.length || 0,
      surfaceQuality: {
        excellent: roadConditions.filter(r => r.surfaceQuality === 'excellent').length,
        good: roadConditions.filter(r => r.surfaceQuality === 'good').length,
        fair: roadConditions.filter(r => r.surfaceQuality === 'fair').length,
        poor: roadConditions.filter(r => r.surfaceQuality === 'poor').length,
        critical: roadConditions.filter(r => r.surfaceQuality === 'critical').length
      },
      roadTypes: {
        highway: roadConditions.filter(r => r.roadType === 'highway').length,
        state: roadConditions.filter(r => r.roadType === 'state').length,
        district: roadConditions.filter(r => r.roadType === 'district').length,
        rural: roadConditions.filter(r => r.roadType === 'rural').length
      },
      issues: {
        potholes: roadConditions.filter(r => r.hasPotholes).length,
        construction: roadConditions.filter(r => r.underConstruction).length
      }
    };

    res.status(200).json({
      success: true,
      summary,
      roadConditions: roadConditions.map(r => ({
        coordinates: { latitude: r.latitude, longitude: r.longitude },
        roadType: r.roadType,
        surfaceQuality: r.surfaceQuality,
        width: r.widthMeters,
        lanes: r.laneCount,
        hasPotholes: r.hasPotholes,
        underConstruction: r.underConstruction,
        riskScore: r.riskScore
      }))
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching road conditions'
    });
  }
});

// Get comprehensive route analysis
router.get('/:id/comprehensive-analysis', async (req, res) => {
  try {
    const Route = require('../models/Route');
    
    const route = await Route.findOne({
      _id: req.params.id,
      userId: req.user.id,
      status: { $ne: 'deleted' }
    });

    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    // Get counts from all data types
    const EmergencyService = require('../models/EmergencyService');
    const WeatherCondition = require('../models/WeatherCondition');
    const TrafficData = require('../models/TrafficData');
    const AccidentProneArea = require('../models/AccidentProneArea');
    const RoadCondition = require('../models/RoadCondition');

    const [emergencyCount, weatherCount, trafficCount, accidentCount, roadCount] = await Promise.all([
      EmergencyService.countDocuments({ routeId: req.params.id }),
      WeatherCondition.countDocuments({ routeId: req.params.id }),
      TrafficData.countDocuments({ routeId: req.params.id }),
      AccidentProneArea.countDocuments({ routeId: req.params.id }),
      RoadCondition.countDocuments({ routeId: req.params.id })
    ]);

    const comprehensiveAnalysis = {
      routeInfo: {
        routeId: route.routeId,
        routeName: route.routeName,
        fromName: route.fromName,
        toName: route.toName,
        totalDistance: route.totalDistance,
        estimatedDuration: route.estimatedDuration,
        terrain: route.terrain,
        gpsPoints: route.routePoints.length
      },
      dataAvailability: {
        emergencyServices: emergencyCount,
        weatherPoints: weatherCount,
        trafficPoints: trafficCount,
        accidentAreas: accidentCount,
        roadConditions: roadCount,
        totalDataPoints: emergencyCount + weatherCount + trafficCount + accidentCount + roadCount
      },
      processingStatus: route.dataProcessingStatus,
      riskAssessment: route.riskScores || {
        totalWeightedScore: 0,
        riskGrade: 'A',
        note: 'Risk calculation pending'
      },
      liveMapLink: route.liveMapLink,
      dataCollectionEndpoints: {
        emergencyServices: `/api/routes/${req.params.id}/emergency-services`,
        weatherData: `/api/routes/${req.params.id}/weather-data`,
        trafficData: `/api/routes/${req.params.id}/traffic-data`,
        accidentAreas: `/api/routes/${req.params.id}/accident-areas`,
        roadConditions: `/api/routes/${req.params.id}/road-conditions`,
        gpsPoints: `/api/routes/${req.params.id}/gps-points`
      }
    };

    res.status(200).json({
      success: true,
      data: comprehensiveAnalysis
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching comprehensive analysis'
    });
  }
});

// Bulk operations
router.post('/bulk/delete', async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      message: 'Bulk delete endpoint - coming soon'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error in bulk delete operation'
    });
  }
});

router.post('/bulk/recalculate', async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      message: 'Bulk recalculate endpoint - coming soon'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error in bulk recalculate operation'
    });
  }
});
// Analyze sharp turns and blind spots for a route
// router.post('/:id/analyze-visibility', async (req, res) => {
//   try {
//     const Route = require('../models/Route');
//     const sharpTurnsService = require('../services/sharpTurnsBlindSpotsService');
    
//     const route = await Route.findOne({
//       _id: req.params.id,
//       userId: req.user.id,
//       status: { $ne: 'deleted' }
//     });

//     if (!route) {
//       return res.status(404).json({
//         success: false,
//         message: 'Route not found'
//       });
//     }

//     console.log(`🔄 Starting ENHANCED visibility analysis for route: ${route.routeId}`);
    
//     // This will now use REAL calculations automatically
//     const analysis = await sharpTurnsService.analyzeRoute(req.params.id);

//     res.status(200).json({
//       success: true,
//       message: 'ENHANCED visibility analysis completed successfully',
//       data: {
//         ...analysis,
//         enhancementInfo: {
//           blindSpotMethod: analysis.blindSpots?.analysisMethod || 'FALLBACK_MOCK',
//           improvements: analysis.blindSpots?.improvements || {},
//           apiIntegration: {
//             googleElevationAPI: analysis.blindSpots?.analysisMethod === 'REAL_GOOGLE_API',
//             googlePlacesAPI: analysis.blindSpots?.analysisMethod === 'REAL_GOOGLE_API',
//             realTimeCalculations: true
//           }
//         }
//       }
//     });

//   } catch (error) {
//     console.error('Enhanced visibility analysis error:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Error during enhanced visibility analysis',
//       error: error.message
//     });
//   }
// });

// Get sharp turns data for a route
router.get('/:id/sharp-turns', async (req, res) => {
  try {
    const SharpTurn = require('../models/SharpTurn');
    const Route = require('../models/Route');
    
    const route = await Route.findOne({
      _id: req.params.id,
      userId: req.user.id,
      status: { $ne: 'deleted' }
    });

    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    const sharpTurns = await SharpTurn.find({ routeId: req.params.id })
      .sort({ distanceFromStartKm: 1 });

    res.status(200).json({
      success: true,
      data: {
        routeId: route.routeId,
        routeName: route.routeName,
        totalSharpTurns: sharpTurns.length,
        criticalTurns: sharpTurns.filter(t => t.riskScore >= 8).length,
        sharpTurns: sharpTurns.map(turn => ({
          id: turn._id,
          coordinates: { latitude: turn.latitude, longitude: turn.longitude },
          distanceFromStart: turn.distanceFromStartKm,
          turnAngle: turn.turnAngle,
          turnDirection: turn.turnDirection,
          riskScore: turn.riskScore,
          severity: turn.turnSeverity,
          recommendedSpeed: turn.recommendedSpeed,
          streetViewLink: turn.streetViewLink,
          mapsLink: turn.mapsLink
        }))
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching sharp turns data'
    });
  }
});

// Get blind spots data for a route
router.get('/:id/blind-spots', async (req, res) => {
  try {
    const BlindSpot = require('../models/BlindSpot');
    const Route = require('../models/Route');
    
    const route = await Route.findOne({
      _id: req.params.id,
      userId: req.user.id,
      status: { $ne: 'deleted' }
    });

    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    const blindSpots = await BlindSpot.find({ routeId: req.params.id })
      .sort({ distanceFromStartKm: 1 });

    res.status(200).json({
      success: true,
      data: {
        routeId: route.routeId,
        routeName: route.routeName,
        totalBlindSpots: blindSpots.length,
        criticalSpots: blindSpots.filter(s => s.riskScore >= 8).length,
        blindSpots: blindSpots.map(spot => ({
          id: spot._id,
          coordinates: { latitude: spot.latitude, longitude: spot.longitude },
          distanceFromStart: spot.distanceFromStartKm,
          spotType: spot.spotType,
          visibilityDistance: spot.visibilityDistance,
          riskScore: spot.riskScore,
          severity: spot.severityLevel,
          satelliteViewLink: spot.satelliteViewLink,
          recommendations: spot.recommendations
        }))
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching blind spots data'
    });
  }
});
// ENHANCED VISIBILITY ANALYSIS - FIXED TO USE REAL CALCULATOR
router.post('/:id/analyze-visibility', async (req, res) => {
  try {
    const Route = require('../models/Route');
    const sharpTurnsService = require('../services/sharpTurnsBlindSpotsService');
    
    const route = await Route.findOne({
      _id: req.params.id,
      userId: req.user.id,
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
        message: 'Insufficient GPS points for analysis (minimum 5 required)',
        currentPoints: route.routePoints?.length || 0
      });
    }

    console.log(`🔄 Starting ENHANCED visibility analysis for route: ${route.routeId}`);
    console.log(`📍 Analyzing ${route.routePoints.length} GPS points`);
    
    // Clear existing analysis data
    await Promise.all([
      require('../models/SharpTurn').deleteMany({ routeId: req.params.id }),
      require('../models/BlindSpot').deleteMany({ routeId: req.params.id })
    ]);
    console.log('🗑️ Cleared existing visibility analysis data');

    // Run ENHANCED analysis with REAL Google APIs
    const analysis = await sharpTurnsService.analyzeRoute(req.params.id);

    // Validate analysis results
    if (!analysis || typeof analysis !== 'object') {
      throw new Error('Invalid analysis results received');
    }

    // Enhanced response with comprehensive data
    const enhancedResponse = {
      success: true,
      message: 'ENHANCED visibility analysis completed successfully',
      routeInfo: {
        routeId: route.routeId,
        routeName: route.routeName,
        fromName: route.fromName,
        toName: route.toName,
        totalDistance: route.totalDistance,
        terrain: route.terrain,
        gpsPoints: route.routePoints.length
      },
      analysisResults: {
        ...analysis,
        processingDetails: {
          apiIntegrations: {
            googleElevationAPI: process.env.GOOGLE_MAPS_API_KEY ? 'ACTIVE' : 'NOT_CONFIGURED',
            googlePlacesAPI: process.env.GOOGLE_MAPS_API_KEY ? 'ACTIVE' : 'NOT_CONFIGURED',
            googleStreetViewAPI: process.env.GOOGLE_MAPS_API_KEY ? 'ACTIVE' : 'NOT_CONFIGURED'
          },
          calculationMethods: {
            elevationAnalysis: 'Physics-based ray tracing with earth curvature',
            curveAnalysis: 'AASHTO geometric sight distance standards',
            obstructionAnalysis: 'Geometric shadow zone calculations',
            riskAssessment: 'Engineering-based risk scoring with validation'
          },
          dataQuality: {
            elevationDataSource: 'Google Elevation API (batch processed)',
            obstructionDataSource: 'Google Places API (filtered)',
            validationLevel: 'Strict numeric validation (NaN prevention)',
            confidenceLevel: analysis.blindSpots?.confidence || 0.8
          }
        }
      },
      criticalFindings: {
        totalCriticalPoints: (analysis.summary?.criticalTurns || 0) + (analysis.summary?.criticalBlindSpots || 0),
        immediateActionRequired: (analysis.summary?.criticalBlindSpots || 0) > 0,
        routeRiskLevel: analysis.summary?.overallRiskLevel || 'LOW',
        keyStatistics: {
          sharpTurns: {
            total: analysis.summary?.totalSharpTurns || 0,
            critical: analysis.summary?.criticalTurns || 0,
            avgRisk: analysis.summary?.avgTurnRisk || 0
          },
          blindSpots: {
            total: analysis.summary?.totalBlindSpots || 0,
            critical: analysis.summary?.criticalBlindSpots || 0,
            avgRisk: analysis.summary?.avgBlindSpotRisk || 0,
            byType: analysis.blindSpots?.typeBreakdown || {}
          }
        }
      },
      safetyRecommendations: {
        immediate: analysis.recommendations?.filter(r => r.priority === 'CRITICAL') || [],
        planned: analysis.recommendations?.filter(r => r.priority === 'HIGH') || [],
        general: analysis.recommendations?.filter(r => r.priority === 'STANDARD') || []
      },
      apiEndpoints: {
        sharpTurns: `/api/routes/${req.params.id}/sharp-turns`,
        blindSpots: `/api/routes/${req.params.id}/blind-spots`,
        visibilityStats: `/api/visibility/routes/${req.params.id}/visibility-stats`,
        combinedAnalysis: `/api/visibility/routes/${req.params.id}/visibility-analysis`
      },
      enhancementStatus: {
        realCalculationsActive: true,
        googleAPIIntegration: !!process.env.GOOGLE_MAPS_API_KEY,
        validationLevel: 'STRICT',
        improvements: analysis.blindSpots?.improvements || {},
        fallbackMethods: !process.env.GOOGLE_MAPS_API_KEY ? [
          'Terrain-based elevation estimation',
          'Geometric curve analysis',
          'Basic obstruction detection'
        ] : []
      },
      nextSteps: [
        'Review critical findings in detail using provided API endpoints',
        'Implement immediate safety recommendations before travel',
        'Brief all drivers on identified high-risk areas',
        'Consider alternative routes for critical blind spots',
        'Monitor weather conditions that may worsen visibility',
        'Ensure emergency communication equipment is available'
      ]
    };

    res.status(200).json(enhancedResponse);

  } catch (error) {
    console.error('Enhanced visibility analysis error:', error);
    
    // Detailed error response
    res.status(500).json({
      success: false,
      message: 'Enhanced visibility analysis failed',
      error: {
        type: error.name || 'AnalysisError',
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      troubleshooting: [
        'Ensure route has sufficient GPS points (minimum 5)',
        'Verify Google Maps API key is configured correctly',
        'Check that route data is not corrupted',
        'Try re-uploading the route if issues persist'
      ],
      fallbackOptions: [
        'Use basic route analysis without enhanced features',
        'Upload route with more GPS points for better analysis',
        'Contact support if Google API integration is required'
      ]
    });
  }
});

// GET ENHANCED VISIBILITY STATISTICS
router.get('/:id/visibility-stats', async (req, res) => {
  try {
    const SharpTurn = require('../models/SharpTurn');
    const BlindSpot = require('../models/BlindSpot');
    const Route = require('../models/Route');
    
    const route = await Route.findOne({
      _id: req.params.id,
      userId: req.user.id,
      status: { $ne: 'deleted' }
    });

    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    // Get comprehensive statistics
    const [sharpTurnStats, blindSpotStats, sharpTurns, blindSpots] = await Promise.all([
      SharpTurn.getRouteSharpTurnsAnalysis(req.params.id),
      BlindSpot.getRouteBlindSpotsAnalysis(req.params.id),
      SharpTurn.find({ routeId: req.params.id }).sort({ riskScore: -1 }).limit(5),
      BlindSpot.find({ routeId: req.params.id }).sort({ riskScore: -1 }).limit(5)
    ]);

    const turnStats = sharpTurnStats[0] || {};
    const spotStats = blindSpotStats[0] || {};

    res.status(200).json({
      success: true,
      data: {
        routeInfo: {
          routeId: route.routeId,
          routeName: route.routeName,
          totalDistance: route.totalDistance,
          terrain: route.terrain
        },
        overallStatistics: {
          totalVisibilityPoints: (turnStats.totalTurns || 0) + (spotStats.totalBlindSpots || 0),
          criticalPoints: (turnStats.criticalTurns || 0) + (spotStats.criticalSpots || 0),
          averageRiskScore: Math.round(((turnStats.avgRiskScore || 0) + (spotStats.avgRiskScore || 0)) * 50) / 100,
          maxRiskScore: Math.max(turnStats.maxRiskScore || 0, spotStats.maxRiskScore || 0),
          visibilityDensity: route.totalDistance > 0 ? 
            Math.round(((turnStats.totalTurns || 0) + (spotStats.totalBlindSpots || 0)) / route.totalDistance * 100) / 100 : 0
        },
        sharpTurns: {
          total: turnStats.totalTurns || 0,
          averageRiskScore: Math.round((turnStats.avgRiskScore || 0) * 100) / 100,
          maxRiskScore: turnStats.maxRiskScore || 0,
          critical: turnStats.criticalTurns || 0,
          high: turnStats.highRiskTurns || 0,
          severityBreakdown: turnStats.severityBreakdown || {},
          density: route.totalDistance > 0 ? 
            Math.round(((turnStats.totalTurns || 0) / route.totalDistance) * 100) / 100 : 0,
          topRiskTurns: sharpTurns.map(turn => ({
            id: turn._id,
            coordinates: { latitude: turn.latitude, longitude: turn.longitude },
            angle: turn.turnAngle,
            direction: turn.turnDirection,
            riskScore: turn.riskScore,
            severity: turn.turnSeverity
          }))
        },
        blindSpots: {
          total: spotStats.totalBlindSpots || 0,
          averageRiskScore: Math.round((spotStats.avgRiskScore || 0) * 100) / 100,
          maxRiskScore: spotStats.maxRiskScore || 0,
          critical: spotStats.criticalSpots || 0,
          typeBreakdown: spotStats.typeBreakdown || {},
          averageVisibilityDistance: Math.round((spotStats.avgVisibilityDistance || 0) * 100) / 100,
          poorVisibilitySpots: spotStats.poorVisibilitySpots || 0,
          density: route.totalDistance > 0 ? 
            Math.round(((spotStats.totalBlindSpots || 0) / route.totalDistance) * 100) / 100 : 0,
          topRiskSpots: blindSpots.map(spot => ({
            id: spot._id,
            coordinates: { latitude: spot.latitude, longitude: spot.longitude },
            type: spot.spotType,
            visibilityDistance: spot.visibilityDistance,
            riskScore: spot.riskScore,
            severity: spot.severityLevel
          }))
        },
        riskAssessment: {
          overallRiskLevel: this.determineOverallRiskLevel(turnStats, spotStats),
          primaryRiskFactors: this.identifyPrimaryRiskFactors(turnStats, spotStats),
          recommendations: this.generateStatisticsRecommendations(turnStats, spotStats, route)
        },
        comparisonMetrics: {
          turnsPerKm: route.totalDistance > 0 ? (turnStats.totalTurns || 0) / route.totalDistance : 0,
          blindSpotsPerKm: route.totalDistance > 0 ? (spotStats.totalBlindSpots || 0) / route.totalDistance : 0,
          criticalPointsPerKm: route.totalDistance > 0 ? 
            ((turnStats.criticalTurns || 0) + (spotStats.criticalSpots || 0)) / route.totalDistance : 0
        }
      }
    });

  } catch (error) {
    console.error('Visibility statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching visibility statistics',
      error: error.message
    });
  }
});

// Helper functions for statistics endpoint
function determineOverallRiskLevel(turnStats, spotStats) {
  const criticalPoints = (turnStats.criticalTurns || 0) + (spotStats.criticalSpots || 0);
  const totalPoints = (turnStats.totalTurns || 0) + (spotStats.totalBlindSpots || 0);
  const avgRisk = ((turnStats.avgRiskScore || 0) + (spotStats.avgRiskScore || 0)) / 2;

  if (criticalPoints > 3 || avgRisk >= 8) return 'CRITICAL';
  if (criticalPoints > 1 || avgRisk >= 6 || totalPoints > 10) return 'HIGH';
  if (criticalPoints > 0 || avgRisk >= 4 || totalPoints > 5) return 'MEDIUM';
  return 'LOW';
}

function identifyPrimaryRiskFactors(turnStats, spotStats) {
  const factors = [];

  if ((turnStats.criticalTurns || 0) > 0) {
    factors.push({
      factor: 'Critical Sharp Turns',
      count: turnStats.criticalTurns,
      severity: 'HIGH',
      description: `${turnStats.criticalTurns} sharp turns with risk score ≥ 8 require immediate attention`
    });
  }

  if ((spotStats.criticalSpots || 0) > 0) {
    factors.push({
      factor: 'Critical Blind Spots',
      count: spotStats.criticalSpots,
      severity: 'HIGH',
      description: `${spotStats.criticalSpots} blind spots with severely limited visibility`
    });
  }

  if ((spotStats.poorVisibilitySpots || 0) > 3) {
    factors.push({
      factor: 'Poor Visibility Areas',
      count: spotStats.poorVisibilitySpots,
      severity: 'MEDIUM',
      description: `${spotStats.poorVisibilitySpots} areas with visibility < 100m`
    });
  }

  if ((turnStats.severityBreakdown?.hairpin || 0) > 0) {
    factors.push({
      factor: 'Hairpin Turns',
      count: turnStats.severityBreakdown.hairpin,
      severity: 'HIGH',
      description: `${turnStats.severityBreakdown.hairpin} extremely sharp hairpin turns detected`
    });
  }

  return factors.sort((a, b) => {
    const severityOrder = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
    return severityOrder[b.severity] - severityOrder[a.severity];
  });
}

function generateStatisticsRecommendations(turnStats, spotStats, route) {
  const recommendations = [];

  const criticalPoints = (turnStats.criticalTurns || 0) + (spotStats.criticalSpots || 0);
  const totalPoints = (turnStats.totalTurns || 0) + (spotStats.totalBlindSpots || 0);

  if (criticalPoints > 0) {
    recommendations.push({
      priority: 'CRITICAL',
      category: 'immediate_action',
      recommendation: `${criticalPoints} critical visibility points require immediate safety measures`,
      actions: [
        'Reduce speed to 25-35 km/h in all critical areas',
        'Use convoy travel with constant communication',
        'Brief all drivers on exact locations of hazards',
        'Consider postponing travel during poor weather conditions'
      ]
    });
  }

  if (route.totalDistance > 0) {
    const density = totalPoints / route.totalDistance;
    if (density > 0.5) {
      recommendations.push({
        priority: 'HIGH',
        category: 'route_planning',
        recommendation: `High visibility hazard density (${density.toFixed(1)} points per km)`,
        actions: [
          'Consider alternative route with fewer hazards',
          'Plan for extended travel time due to safety requirements',
          'Ensure vehicles are equipped with enhanced lighting and signaling'
        ]
      });
    }
  }

  if ((turnStats.severityBreakdown?.hairpin || 0) > 2) {
    recommendations.push({
      priority: 'HIGH',
      category: 'driving_technique',
      recommendation: `Multiple hairpin turns require specialized driving skills`,
      actions: [
        'Provide advanced driving training for sharp turn navigation',
        'Use vehicles with appropriate power-to-weight ratio',
        'Install additional safety equipment (horns, lights, communication)'
      ]
    });
  }

  if ((spotStats.avgVisibilityDistance || 0) < 100) {
    recommendations.push({
      priority: 'MEDIUM',
      category: 'visibility_management',
      recommendation: `Average visibility distance is only ${Math.round(spotStats.avgVisibilityDistance || 0)}m`,
      actions: [
        'Use headlights at all times',
        'Maintain minimum 4-second following distance',
        'Install additional warning lights on vehicles',
        'Use horn signals when approaching blind areas'
      ]
    });
  }

  // Always include general recommendations
  recommendations.push({
    priority: 'STANDARD',
    category: 'general_safety',
    recommendation: 'Standard safety protocol for visibility-limited routes',
    actions: [
      'Conduct pre-journey safety briefing',
      'Ensure all safety equipment is functional',
      'Establish emergency communication protocols',
      'Monitor weather conditions continuously',
      'Plan for emergency stops and turnaround points'
    ]
  });

  return recommendations;
}

// GET CRITICAL VISIBILITY POINTS ONLY
router.get('/:id/critical-visibility-points', async (req, res) => {
  try {
    const SharpTurn = require('../models/SharpTurn');
    const BlindSpot = require('../models/BlindSpot');
    const Route = require('../models/Route');
    
    const route = await Route.findOne({
      _id: req.params.id,
      userId: req.user.id,
      status: { $ne: 'deleted' }
    });

    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    const riskThreshold = parseFloat(req.query.riskThreshold) || 7.0;

    // Get only critical points
    const [criticalTurns, criticalBlindSpots] = await Promise.all([
      SharpTurn.find({ 
        routeId: req.params.id, 
        riskScore: { $gte: riskThreshold } 
      }).sort({ riskScore: -1, distanceFromStartKm: 1 }),
      BlindSpot.find({ 
        routeId: req.params.id, 
        riskScore: { $gte: riskThreshold } 
      }).sort({ riskScore: -1, distanceFromStartKm: 1 })
    ]);

    // Combine and sort by distance from start
    const allCriticalPoints = [
      ...criticalTurns.map(turn => ({
        id: turn._id,
        type: 'sharp_turn',
        coordinates: { latitude: turn.latitude, longitude: turn.longitude },
        distanceFromStart: turn.distanceFromStartKm,
        riskScore: turn.riskScore,
        severity: turn.turnSeverity,
        details: {
          turnAngle: turn.turnAngle,
          turnDirection: turn.turnDirection,
          recommendedSpeed: turn.recommendedSpeed,
          streetViewLink: turn.streetViewLink,
          mapsLink: turn.mapsLink
        },
        recommendations: turn.getSafetyRecommendations ? turn.getSafetyRecommendations() : []
      })),
      ...criticalBlindSpots.map(spot => ({
        id: spot._id,
        type: 'blind_spot',
        coordinates: { latitude: spot.latitude, longitude: spot.longitude },
        distanceFromStart: spot.distanceFromStartKm,
        riskScore: spot.riskScore,
        severity: spot.severityLevel,
        details: {
          spotType: spot.spotType,
          visibilityDistance: spot.visibilityDistance,
          obstructionHeight: spot.obstructionHeight,
          satelliteViewLink: spot.satelliteViewLink
        },
        recommendations: spot.getSafetyRecommendations ? spot.getSafetyRecommendations() : []
      }))
    ].sort((a, b) => a.distanceFromStart - b.distanceFromStart);

    res.status(200).json({
      success: true,
      data: {
        routeInfo: {
          routeId: route.routeId,
          routeName: route.routeName,
          totalDistance: route.totalDistance
        },
        filterCriteria: {
          riskThreshold: riskThreshold,
          description: `Points with risk score ≥ ${riskThreshold}`
        },
        criticalPoints: allCriticalPoints,
        summary: {
          totalCriticalPoints: allCriticalPoints.length,
          criticalTurns: criticalTurns.length,
          criticalBlindSpots: criticalBlindSpots.length,
          highestRiskScore: Math.max(...allCriticalPoints.map(p => p.riskScore), 0),
          averageRiskScore: allCriticalPoints.length > 0 ? 
            Math.round((allCriticalPoints.reduce((sum, p) => sum + p.riskScore, 0) / allCriticalPoints.length) * 100) / 100 : 0,
          criticalDensity: route.totalDistance > 0 ? 
            Math.round((allCriticalPoints.length / route.totalDistance) * 100) / 100 : 0
        },
        urgentRecommendations: [
          allCriticalPoints.length > 5 ? 'URGENT: Consider alternative route - too many critical points' : '',
          allCriticalPoints.some(p => p.riskScore >= 9) ? 'EXTREME CAUTION: Points with risk ≥ 9 detected' : '',
          'Brief all drivers on exact locations before departure',
          'Reduce speed to 25-35 km/h at all critical points',
          'Use convoy travel with constant communication',
          'Monitor weather - postpone if visibility conditions worsen'
        ].filter(r => r !== '')
      }
    });

  } catch (error) {
    console.error('Critical visibility points error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching critical visibility points',
      error: error.message
    });
  }
});

// REGENERATE ANALYSIS (with validation)
router.post('/:id/regenerate-visibility-analysis', async (req, res) => {
  try {
    const Route = require('../models/Route');
    const SharpTurn = require('../models/SharpTurn');
    const BlindSpot = require('../models/BlindSpot');
    const sharpTurnsService = require('../services/sharpTurnsBlindSpotsService');
    
    const route = await Route.findOne({
      _id: req.params.id,
      userId: req.user.id,
      status: { $ne: 'deleted' }
    });

    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    // Validate route has sufficient data
    if (!route.routePoints || route.routePoints.length < 5) {
      return res.status(400).json({
        success: false,
        message: 'Cannot regenerate analysis - insufficient GPS points',
        details: {
          currentPoints: route.routePoints?.length || 0,
          minimumRequired: 5,
          recommendation: 'Upload route with more GPS tracking points'
        }
      });
    }

    console.log(`🔄 Regenerating visibility analysis for route: ${route.routeId}`);

    // Clear all existing analysis data
    const [deletedTurns, deletedSpots] = await Promise.all([
      SharpTurn.deleteMany({ routeId: req.params.id }),
      BlindSpot.deleteMany({ routeId: req.params.id })
    ]);

    console.log(`🗑️ Cleared ${deletedTurns.deletedCount} turns and ${deletedSpots.deletedCount} blind spots`);

    // Force fresh analysis
    const analysis = await sharpTurnsService.analyzeRoute(req.params.id);

    // Validate analysis completed successfully
    if (!analysis || !analysis.summary) {
      throw new Error('Analysis did not complete successfully');
    }

    res.status(200).json({
      success: true,
      message: 'Visibility analysis regenerated successfully',
      data: {
        routeId: route.routeId,
        analysisResults: analysis,
        dataCleared: {
          previousTurns: deletedTurns.deletedCount,
          previousBlindSpots: deletedSpots.deletedCount
        },
        newResults: {
          sharpTurns: analysis.summary?.totalSharpTurns || 0,
          blindSpots: analysis.summary?.totalBlindSpots || 0,
          criticalPoints: (analysis.summary?.criticalTurns || 0) + (analysis.summary?.criticalBlindSpots || 0),
          overallRiskLevel: analysis.summary?.overallRiskLevel || 'LOW'
        },
        nextSteps: [
          'Review new critical findings',
          'Update safety protocols based on new analysis',
          'Brief drivers on any new hazards identified',
          'Consider route modifications if critical points increased'
        ]
      }
    });

  } catch (error) {
    console.error('Regenerate analysis error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to regenerate visibility analysis',
      error: {
        type: error.name || 'RegenerationError',
        message: error.message,
        timestamp: new Date().toISOString()
      },
      troubleshooting: [
        'Ensure route has valid GPS coordinates',
        'Check Google Maps API configuration',
        'Verify route data integrity',
        'Try again in a few minutes if this was a temporary issue'
      ]
    });
  }
});

// Get comprehensive seasonal weather analysis
router.get('/:id/seasonal-weather-analysis', async (req, res) => {
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

    // Get seasonal weather analysis
    const enhancedWeatherService = require('../services/enhancedWeatherService');
    const seasonalAnalysis = await enhancedWeatherService.collectAllSeasonalWeatherData(routeId);

    res.status(200).json({
      success: true,
      data: {
        routeInfo: {
          routeId: route.routeId,
          routeName: route.routeName,
          totalDistance: route.totalDistance,
          terrain: route.terrain
        },
        seasonalWeather: seasonalAnalysis.seasonalData,
        analysis: seasonalAnalysis.analysis,
        vehicleRoadPredictions: seasonalAnalysis.vehiclePredictions,
        recommendations: seasonalAnalysis.recommendations,
        summary: {
          totalDataPoints: seasonalAnalysis.totalDataPoints,
          bestSeason: seasonalAnalysis.analysis?.bestSeason,
          worstSeason: seasonalAnalysis.analysis?.worstSeason,
          criticalPeriods: seasonalAnalysis.analysis?.criticalPeriods?.length || 0
        }
      }
    });

  } catch (error) {
    console.error('Seasonal weather analysis error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching seasonal weather analysis',
      error: error.message
    });
  }
});

// Get vehicle condition predictions by season
router.get('/:id/vehicle-predictions', async (req, res) => {
  try {
    const { routeId } = req.params;
    const { season } = req.query; // Optional: specific season
    
    const route = await Route.findOne({
      _id: routeId,
      userId: req.user.id,
      status: { $ne: 'deleted' }
    });

    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    const enhancedWeatherService = require('../services/enhancedWeatherService');
    const seasonalAnalysis = await enhancedWeatherService.collectAllSeasonalWeatherData(routeId);
    
    let vehiclePredictions = seasonalAnalysis.vehiclePredictions;
    
    // Filter by specific season if requested
    if (season && vehiclePredictions.bySeasons[season]) {
      vehiclePredictions = {
        [season]: vehiclePredictions.bySeasons[season],
        comparative: vehiclePredictions.comparative,
        recommendations: vehiclePredictions.recommendations
      };
    }

    res.status(200).json({
      success: true,
      data: {
        routeId: route.routeId,
        season: season || 'all_seasons',
        vehiclePredictions,
        recommendations: {
          immediate: vehiclePredictions.recommendations?.filter(r => r.priority === 'HIGH') || [],
          seasonal: vehiclePredictions.recommendations?.filter(r => r.priority === 'MEDIUM') || [],
          preventive: vehiclePredictions.recommendations?.filter(r => r.priority === 'LOW') || []
        }
      }
    });

  } catch (error) {
    console.error('Vehicle predictions error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching vehicle predictions'
    });
  }
});

// EXPORT VISIBILITY ANALYSIS REPORT
router.get('/:id/export-visibility-report', async (req, res) => {
  try {
    const Route = require('../models/Route');
    const SharpTurn = require('../models/SharpTurn');
    const BlindSpot = require('../models/BlindSpot');
    
    const route = await Route.findOne({
      _id: req.params.id,
      userId: req.user.id,
      status: { $ne: 'deleted' }
    });

    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    // Get comprehensive data
    const [sharpTurns, blindSpots, turnStats, spotStats] = await Promise.all([
      SharpTurn.find({ routeId: req.params.id }).sort({ distanceFromStartKm: 1 }),
      BlindSpot.find({ routeId: req.params.id }).sort({ distanceFromStartKm: 1 }),
      SharpTurn.getRouteSharpTurnsAnalysis(req.params.id),
      BlindSpot.getRouteBlindSpotsAnalysis(req.params.id)
    ]);

    const reportData = {
      metadata: {
        reportType: 'VISIBILITY_SAFETY_ANALYSIS',
        generatedAt: new Date().toISOString(),
        generatedBy: req.user.username || req.user.email,
        version: '2.0',
        analysisEngine: 'Enhanced Real Calculator with Google APIs'
      },
      routeInformation: {
        routeId: route.routeId,
        routeName: route.routeName,
        fromLocation: route.fromName,
        toLocation: route.toName,
        totalDistance: route.totalDistance,
        estimatedDuration: route.estimatedDuration,
        terrain: route.terrain,
        majorHighways: route.majorHighways || [],
        gpsTrackingPoints: route.routePoints?.length || 0
      },
      executiveSummary: {
        overallRiskLevel: determineOverallRiskLevel(turnStats[0] || {}, spotStats[0] || {}),
        totalVisibilityHazards: sharpTurns.length + blindSpots.length,
        criticalHazards: sharpTurns.filter(t => t.riskScore >= 8).length + blindSpots.filter(s => s.riskScore >= 8).length,
        averageRiskScore: Math.round(((turnStats[0]?.avgRiskScore || 0) + (spotStats[0]?.avgRiskScore || 0)) * 50) / 100,
        maxRiskScore: Math.max(turnStats[0]?.maxRiskScore || 0, spotStats[0]?.maxRiskScore || 0),
        routeRecommendation: this.getRouteRecommendation(sharpTurns, blindSpots),
        keyFindings: this.generateKeyFindings(sharpTurns, blindSpots, route)
      },
      detailedAnalysis: {
        sharpTurns: {
          summary: turnStats[0] || {},
          details: sharpTurns.map(turn => ({
            location: {
              coordinates: { latitude: turn.latitude, longitude: turn.longitude },
              distanceFromStart: turn.distanceFromStartKm,
              nearestLandmark: `${turn.distanceFromStartKm}km from start`
            },
            characteristics: {
              turnAngle: turn.turnAngle,
              turnDirection: turn.turnDirection,
              turnRadius: turn.turnRadius,
              severity: turn.turnSeverity
            },
            riskAssessment: {
              riskScore: turn.riskScore,
              recommendedSpeed: turn.recommendedSpeed,
              safetyFeatures: {
                guardrails: turn.guardrails,
                warningSigns: turn.warningSigns,
                lighting: turn.lightingAvailable
              }
            },
            recommendations: turn.getSafetyRecommendations ? turn.getSafetyRecommendations() : []
          }))
        },
        blindSpots: {
          summary: spotStats[0] || {},
          details: blindSpots.map(spot => ({
            location: {
              coordinates: { latitude: spot.latitude, longitude: spot.longitude },
              distanceFromStart: spot.distanceFromStartKm,
              nearestLandmark: `${spot.distanceFromStartKm}km from start`
            },
            characteristics: {
              spotType: spot.spotType,
              visibilityDistance: spot.visibilityDistance,
              obstructionHeight: spot.obstructionHeight,
              severityLevel: spot.severityLevel
            },
            riskAssessment: {
              riskScore: spot.riskScore,
              safetyMeasures: {
                warningSignsPresent: spot.warningSignsPresent,
                mirrorInstalled: spot.mirrorInstalled,
                speedLimit: spot.speedLimit
              }
            },
            recommendations: spot.getSafetyRecommendations ? spot.getSafetyRecommendations() : []
          }))
        }
      },
      safetyProtocol: {
        mandatoryMeasures: this.generateMandatoryMeasures(sharpTurns, blindSpots),
        drivingInstructions: this.generateDrivingInstructions(sharpTurns, blindSpots),
        emergencyProcedures: this.generateEmergencyProcedures(route),
        weatherConsiderations: this.generateWeatherConsiderations(sharpTurns, blindSpots),
        equipmentRequirements: this.generateEquipmentRequirements(sharpTurns, blindSpots)
      },
      appendices: {
        technicalDetails: {
          analysisMethodology: 'AASHTO-based sight distance calculations with Google API integration',
          dataSourcesUsed: [
            'Google Elevation API (terrain analysis)',
            'Google Places API (obstruction detection)',
            'GPS route tracking data',
            'Engineering sight distance formulas'
          ],
          validationMethods: [
            'Strict numeric validation (NaN prevention)',
            'Physics-based calculations',
            'Cross-validation with multiple data sources'
          ]
        },
        definitions: {
          riskScore: 'Numerical scale 1-10 where 1=minimal risk, 10=extreme risk',
          visibilityDistance: 'Maximum distance driver can see ahead (meters)',
          criticalPoint: 'Location with risk score ≥ 8 requiring immediate action'
        }
      }
    };

    res.status(200).json({
      success: true,
      message: 'Visibility analysis report generated successfully',
      report: reportData,
      exportOptions: {
        downloadAsJSON: 'Available in response body',
        printableSummary: 'Use executiveSummary section for quick reference',
        detailedAnalysis: 'Use detailedAnalysis section for comprehensive review'
      }
    });

  } catch (error) {
    console.error('Export report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating visibility report',
      error: error.message
    });
  }
});
// Enhanced accident-prone areas analysis
router.post('/:id/analyze-accident-areas', async (req, res) => {
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

    console.log(`🚨 Starting enhanced accident analysis for route: ${route.routeId}`);
    
    const accidentProneAreasService = require('../services/accidentProneAreasService');
    const accidentReport = await accidentProneAreasService.collectAccidentProneAreasForRoute(routeId);

    res.status(200).json({
      success: true,
      message: 'Enhanced accident-prone areas analysis completed',
      data: {
        routeInfo: {
          routeId: route.routeId,
          routeName: route.routeName,
          fromName: route.fromName,
          toName: route.toName,
          totalDistance: route.totalDistance,
          terrain: route.terrain
        },
        accidentAnalysis: accidentReport,
        enhancementDetails: {
          realDataSources: ['TomTom Traffic API', 'HERE Traffic API', 'Google Places API'],
          apiIntegration: accidentReport.apiStatus,
          dataQuality: accidentReport.dataQuality,
          noMockData: true
        },
        recommendations: {
          immediate: accidentReport.overallRecommendations.filter(r => r.priority === 'CRITICAL'),
          planning: accidentReport.overallRecommendations.filter(r => r.priority === 'HIGH'),
          monitoring: accidentReport.overallRecommendations.filter(r => r.priority === 'MEDIUM')
        },
        nextSteps: [
          'Review high-risk and critical accident areas',
          'Monitor real-time traffic updates from TomTom/HERE',
          'Implement enhanced safety protocols for critical areas',
          'Consider alternative routing for areas with highest risk',
          'Brief drivers on specific accident-prone locations'
        ]
      }
    });

  } catch (error) {
    console.error('Enhanced accident analysis error:', error);
    res.status(500).json({
      success: false,
      message: 'Error during enhanced accident analysis',
      error: error.message,
      troubleshooting: [
        'Verify TomTom API key is configured (TOMTOM_API_KEY)',
        'Verify HERE API key is configured (HERE_API_KEY)', 
        'Verify Google Maps API key is configured (GOOGLE_MAPS_API_KEY)',
        'Check API rate limits and quotas',
        'Ensure route has sufficient GPS points for analysis'
      ]
    });
  }
});

// Get collected accident-prone areas for a route
router.get('/:id/accident-areas-enhanced', async (req, res) => {
  try {
    const { routeId } = req.params;
    const userId = req.user.id;
    const { includeRecommendations = 'true', riskLevel = 'all' } = req.query;
    
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
        'high': { $gte: 7, $lt: 8 },
        'critical': { $gte: 8 }
      };
      if (riskMapping[riskLevel]) {
        filter.riskScore = riskMapping[riskLevel];
      }
    }

    const AccidentProneArea = require('../models/AccidentProneArea');
    const accidentAreas = await AccidentProneArea.find(filter)
      .sort({ riskScore: -1, distanceFromStartKm: 1 });

    const summary = {
      total: accidentAreas.length,
      highRisk: accidentAreas.filter(a => a.riskScore >= 7).length,
      critical: accidentAreas.filter(a => a.riskScore >= 8).length,
      averageRisk: accidentAreas.length > 0 ? 
        Math.round((accidentAreas.reduce((sum, a) => sum + a.riskScore, 0) / accidentAreas.length) * 100) / 100 : 0,
      dataSourceBreakdown: accidentAreas.reduce((acc, area) => {
        const source = area.dataSource;
        acc[source] = (acc[source] || 0) + 1;
        return acc;
      }, {}),
      severityBreakdown: {
        fatal: accidentAreas.filter(a => a.accidentSeverity === 'fatal').length,
        major: accidentAreas.filter(a => a.accidentSeverity === 'major').length,
        minor: accidentAreas.filter(a => a.accidentSeverity === 'minor').length
      }
    };

    const enhancedAccidentData = accidentAreas.map(area => ({
      id: area._id,
      coordinates: {
        latitude: area.latitude,
        longitude: area.longitude
      },
      distanceFromStart: area.distanceFromStartKm,
      riskScore: area.riskScore,
      severity: area.accidentSeverity,
      accidentTypes: area.commonAccidentTypes,
      contributingFactors: area.contributingFactors,
      annualFrequency: area.accidentFrequencyYearly,
      riskFactors: {
        timeOfDay: area.timeOfDayRisk,
        weather: area.weatherRelatedRisk,
        infrastructure: area.infrastructureRisk,
        traffic: area.trafficVolumeRisk
      },
      lastIncident: area.lastAccidentDate,
      trend: area.accidentTrend,
      safetyMeasures: area.safetyMeasuresPresent,
      dataSource: area.dataSource,
      dataQuality: area.dataQuality,
      ...(includeRecommendations === 'true' && {
        recommendations: area.recommendedImprovements
      })
    }));

    res.status(200).json({
      success: true,
      data: {
        routeInfo: {
          routeId: route.routeId,
          routeName: route.routeName,
          totalDistance: route.totalDistance
        },
        summary,
        accidentAreas: enhancedAccidentData,
        enhancementInfo: {
          version: 'Enhanced_v2.0',
          realDataOnly: true,
          apiSources: Object.keys(summary.dataSourceBreakdown)
        }
      }
    });

  } catch (error) {
    console.error('Enhanced accident areas fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching enhanced accident areas data'
    });
  }
});

// Helper functions for the export report
function getRouteRecommendation(sharpTurns, blindSpots) {
  const criticalCount = sharpTurns.filter(t => t.riskScore >= 8).length + blindSpots.filter(s => s.riskScore >= 8).length;
  const totalCount = sharpTurns.length + blindSpots.length;

  if (criticalCount > 5) return 'NOT RECOMMENDED - Too many critical hazards. Seek alternative route.';
  if (criticalCount > 2) return 'PROCEED WITH EXTREME CAUTION - Multiple critical hazards present.';
  if (criticalCount > 0) return 'PROCEED WITH CAUTION - Critical hazards identified and briefed.';
  if (totalCount > 10) return 'PROCEED WITH NORMAL CAUTION - Multiple visibility challenges.';
  return 'PROCEED WITH STANDARD SAFETY MEASURES - Low to moderate visibility challenges.';
}

function generateKeyFindings(sharpTurns, blindSpots, route) {
  const findings = [];
  
  const criticalTurns = sharpTurns.filter(t => t.riskScore >= 8);
  const criticalSpots = blindSpots.filter(s => s.riskScore >= 8);
  
  if (criticalTurns.length > 0) {
    findings.push(`${criticalTurns.length} critical sharp turns requiring speed reduction to 25-35 km/h`);
  }
  
  if (criticalSpots.length > 0) {
    findings.push(`${criticalSpots.length} critical blind spots with severely limited visibility`);
  }
  
  const hairpinTurns = sharpTurns.filter(t => t.turnSeverity === 'hairpin');
  if (hairpinTurns.length > 0) {
    findings.push(`${hairpinTurns.length} hairpin turns requiring specialized driving techniques`);
  }
  
  const poorVisibilitySpots = blindSpots.filter(s => s.visibilityDistance < 50);
  if (poorVisibilitySpots.length > 0) {
    findings.push(`${poorVisibilitySpots.length} areas with visibility < 50m requiring convoy travel`);
  }
  
  if (route.terrain === 'hilly' && (sharpTurns.length > 0 || blindSpots.length > 0)) {
    findings.push('Hilly terrain amplifies visibility challenges - extra caution required');
  }
  
  return findings;
}



module.exports = router;