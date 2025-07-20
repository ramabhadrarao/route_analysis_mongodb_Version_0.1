// File: routes/bulkRouteProcessor.js - COMPLETE ENHANCED VERSION WITH REAL-TIME STATUS
// Purpose: Enhanced bulk processing with automatic visibility analysis and real-time status tracking

const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const { auth } = require('../middleware/auth');
const Route = require('../models/Route');
const XLSX = require('xlsx');

const router = express.Router();

// ============================================================================
// GLOBAL PROCESSING STATE STORAGE (use Redis in production)
// ============================================================================

const processingStates = new Map();

// Helper functions for state management
const updateProcessingState = (userId, update) => {
  const key = `processing_${userId}`;
  const current = processingStates.get(key) || {};
  const updated = { 
    ...current, 
    ...update, 
    lastUpdate: new Date().toISOString() 
  };
  processingStates.set(key, updated);
  console.log(`📊 Processing state updated for user ${userId}:`, {
    status: updated.status,
    currentRoute: updated.currentRoute,
    completedRoutes: updated.completedRoutes,
    totalRoutes: updated.totalRoutes
  });
  return updated;
};

const getProcessingState = (userId) => {
  const key = `processing_${userId}`;
  return processingStates.get(key) || null;
};

const clearProcessingState = (userId) => {
  const key = `processing_${userId}`;
  processingStates.delete(key);
  console.log(`🗑️ Processing state cleared for user ${userId}`);
};

// ============================================================================
// FILE UPLOAD CONFIGURATION
// ============================================================================

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, process.env.UPLOAD_PATH || './uploads');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'bulk-routes-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.csv', '.txt'];
    const fileExt = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(fileExt)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and TXT files are allowed'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// All routes require authentication
router.use(auth);

// ============================================================================
// ENHANCED STATUS ENDPOINT WITH REAL-TIME TRACKING
// ============================================================================

/**
 * Enhanced status endpoint for real-time progress tracking
 * GET /api/bulk-routes/status
 */
router.get('/status', async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('📊 Status check requested for user:', userId);
    
    // Get current processing state
    const state = getProcessingState(userId);
    
    if (!state) {
      console.log('❌ No active processing found for user:', userId);
      return res.status(404).json({
        success: false,
        message: 'No active processing found',
        status: 'completed'
      });
    }
    
    // Check if processing is stale (older than 5 minutes)
    const lastUpdate = new Date(state.lastUpdate);
    const timeSinceUpdate = Date.now() - lastUpdate.getTime();
    
    if (timeSinceUpdate > 5 * 60 * 1000) { // 5 minutes
      console.log('⚠️ Processing state is stale, clearing...');
      clearProcessingState(userId);
      return res.status(200).json({
        success: true,
        status: 'completed',
        message: 'Processing completed (stale state cleared)'
      });
    }
    
    console.log('✅ Returning current processing state:', {
      status: state.status,
      completedRoutes: state.completedRoutes,
      totalRoutes: state.totalRoutes,
      currentRoute: state.currentRoute
    });
    
    // Return current state with all the progress data
    res.status(200).json({
      success: true,
      status: state.status || 'processing',
      currentRoute: state.currentRoute || 'Processing routes...',
      totalRoutes: state.totalRoutes || 0,
      completedRoutes: state.completedRoutes || 0,
      failedRoutes: state.failedRoutes || 0,
      estimatedTimeRemaining: state.estimatedTimeRemaining || 'Calculating...',
      
      // Enhanced data collection stats
      enhancedDataCollection: {
        attempted: state.enhancedDataCollection?.attempted || 0,
        successful: state.enhancedDataCollection?.successful || 0,
        failed: state.enhancedDataCollection?.failed || 0,
        sharpTurnsCollected: state.enhancedDataCollection?.sharpTurnsCollected || 0,
        blindSpotsCollected: state.enhancedDataCollection?.blindSpotsCollected || 0,
        networkCoverageAnalyzed: state.enhancedDataCollection?.networkCoverageAnalyzed || 0,
        roadConditionsAnalyzed: state.enhancedDataCollection?.roadConditionsAnalyzed || 0,
        accidentDataCollected: state.enhancedDataCollection?.accidentDataCollected || 0,
        seasonalWeatherCollected: state.enhancedDataCollection?.seasonalWeatherCollected || 0,
        totalRecordsCreated: state.enhancedDataCollection?.totalRecordsCreated || 0,
        collectionBreakdown: state.enhancedDataCollection?.collectionBreakdown || {}
      },
      
      // Visibility analysis stats
      visibilityAnalysis: {
        attempted: state.visibilityAnalysis?.attempted || 0,
        successful: state.visibilityAnalysis?.successful || 0,
        failed: state.visibilityAnalysis?.failed || 0,
        skipped: state.visibilityAnalysis?.skipped || 0,
        currentRoute: state.visibilityAnalysis?.currentRoute || null,
        totalSharpTurns: state.visibilityAnalysis?.totalSharpTurns || 0,
        totalBlindSpots: state.visibilityAnalysis?.totalBlindSpots || 0,
        criticalTurns: state.visibilityAnalysis?.criticalTurns || 0,
        criticalBlindSpots: state.visibilityAnalysis?.criticalBlindSpots || 0,
        analysisMode: state.visibilityAnalysis?.analysisMode || 'comprehensive',
        averageAnalysisTime: state.visibilityAnalysis?.averageAnalysisTime || null
      },
      
      // Processing metadata
      processingMode: state.processingMode || 'enhanced',
      dataCollectionMode: state.dataCollectionMode || 'comprehensive',
      backgroundProcessing: state.backgroundProcessing || false,
      startTime: state.startTime,
      lastUpdate: state.lastUpdate,
      
      // Results if available
      results: state.results || null
    });
    
  } catch (error) {
    console.error('❌ Status endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking processing status',
      error: error.message
    });
  }
});

/**
 * Cancel processing endpoint
 * POST /api/bulk-routes/cancel
 */
router.post('/cancel', async (req, res) => {
  try {
    const userId = req.user.id;
    const { processingId } = req.body;
    
    console.log('🛑 Cancel processing requested for user:', userId, 'processingId:', processingId);
    
    // Update state to cancelled
    updateProcessingState(userId, {
      status: 'cancelled',
      currentRoute: 'Processing cancelled by user',
      estimatedTimeRemaining: 'Cancelled'
    });
    
    res.status(200).json({
      success: true,
      message: 'Processing cancellation requested',
      data: {
        processingId,
        status: 'cancelled'
      }
    });
    
  } catch (error) {
    console.error('❌ Cancel processing error:', error);
    res.status(500).json({
      success: false,
      message: 'Error cancelling processing',
      error: error.message
    });
  }
});

/**
 * Background status endpoint (alternative)
 * GET /api/bulk-routes/background-status/:jobId
 */
router.get('/background-status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.user.id;
    
    console.log('📊 Background status check for jobId:', jobId, 'user:', userId);
    
    const state = getProcessingState(userId);
    
    if (!state) {
      return res.status(404).json({
        success: false,
        message: 'Job not found or completed',
        status: 'completed'
      });
    }
    
    res.status(200).json({
      success: true,
      jobId,
      ...state
    });
    
  } catch (error) {
    console.error('❌ Background status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking background job status',
      error: error.message
    });
  }
});

// ============================================================================
// ENHANCED PROCESSING ENDPOINT WITH AUTOMATIC VISIBILITY ANALYSIS
// ============================================================================

/**
 * ENHANCED Process bulk routes from CSV with COMPLETE data collection + AUTOMATIC VISIBILITY ANALYSIS
 * POST /api/bulk-routes/process-csv-enhanced
 */
router.post('/process-csv-enhanced', upload.single('routesCsvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No CSV file uploaded'
      });
    }

    const {
      dataFolderPath = './data',
      terrainType = 'mixed',
      dataCollectionMode = 'comprehensive',
      maxConcurrentRoutes = 2,
      skipExistingRoutes = true,
      backgroundProcessing = false,
      
      // Existing enhanced options
      includeSharpTurns = true,
      includeBlindSpots = true,
      includeNetworkCoverage = true,
      includeEnhancedRoadConditions = true,
      includeAccidentData = true,
      includeSeasonalWeather = true,
      downloadImages = false,
      generateReports = false,
      
      // NEW: Automatic visibility analysis options
      enableAutomaticVisibilityAnalysis = true,  // NEW: Default enabled
      visibilityAnalysisTimeout = 180000,        // NEW: 3 minutes per route max
      continueOnVisibilityFailure = true,        // NEW: Don't fail entire batch if visibility fails
      visibilityAnalysisMode = 'comprehensive'   // NEW: 'basic', 'comprehensive', 'detailed'
    } = req.body;

    console.log(`🚀 Starting ENHANCED bulk route processing with AUTOMATIC VISIBILITY ANALYSIS`);
    console.log(`📁 Data folder: ${dataFolderPath}`);
    console.log(`⚙️ Collection mode: ${dataCollectionMode}`);
    console.log(`🔍 Visibility analysis: ${enableAutomaticVisibilityAnalysis ? 'ENABLED' : 'DISABLED'}`);
    console.log(`🔄 Concurrent routes: ${maxConcurrentRoutes}`);

    // Parse CSV file
    const routeEntries = await parseBulkRoutesCSV(req.file.path);
    console.log(`📊 Found ${routeEntries.length} route entries in CSV`);

    // If background processing requested, start async and return immediately
    if (backgroundProcessing === 'true' || backgroundProcessing === true) {
      processRoutesInBackgroundEnhancedWithVisibility(routeEntries, req.user.id, {
        dataFolderPath,
        terrainType,
        dataCollectionMode,
        maxConcurrentRoutes,
        skipExistingRoutes,
        includeSharpTurns,
        includeBlindSpots,
        includeNetworkCoverage,
        includeEnhancedRoadConditions,
        includeAccidentData,
        includeSeasonalWeather,
        downloadImages,
        generateReports,
        // NEW: Visibility analysis options
        enableAutomaticVisibilityAnalysis,
        visibilityAnalysisTimeout,
        continueOnVisibilityFailure,
        visibilityAnalysisMode
      });

      return res.status(202).json({
        success: true,
        message: 'Enhanced bulk processing with automatic visibility analysis started in background',
        data: {
          totalRoutes: routeEntries.length,
          processingMode: 'background_enhanced_with_visibility',
          estimatedCompletion: new Date(Date.now() + (routeEntries.length * 240 * 1000)), // 4 min per route estimate (including visibility)
          statusEndpoint: '/api/bulk-routes/status',
          enhancedFeatures: {
            dataCollectionIncluded: {
              sharpTurns: includeSharpTurns,
              blindSpots: includeBlindSpots,
              networkCoverage: includeNetworkCoverage,
              enhancedRoadConditions: includeEnhancedRoadConditions,
              accidentData: includeAccidentData,
              seasonalWeather: includeSeasonalWeather
            },
            automaticVisibilityAnalysis: {
              enabled: enableAutomaticVisibilityAnalysis,
              mode: visibilityAnalysisMode,
              timeout: visibilityAnalysisTimeout,
              continueOnFailure: continueOnVisibilityFailure
            }
          }
        }
      });
    }

    // FOREGROUND ENHANCED PROCESSING WITH AUTOMATIC VISIBILITY ANALYSIS
    const processingResults = await processRoutesEnhancedWithVisibilityAndStatus(
      routeEntries,
      req.user.id,
      {
        dataFolderPath,
        terrainType,
        dataCollectionMode,
        maxConcurrentRoutes,
        skipExistingRoutes,
        includeSharpTurns,
        includeBlindSpots,
        includeNetworkCoverage,
        includeEnhancedRoadConditions,
        includeAccidentData,
        includeSeasonalWeather,
        downloadImages,
        generateReports,
        // NEW: Visibility analysis options
        enableAutomaticVisibilityAnalysis,
        visibilityAnalysisTimeout,
        continueOnVisibilityFailure,
        visibilityAnalysisMode
      }
    );

    // Clean up uploaded file
    await fsPromises.unlink(req.file.path);

    res.status(200).json({
      success: true,
      message: 'ENHANCED bulk route processing with automatic visibility analysis completed successfully',
      data: processingResults
    });

  } catch (error) {
    console.error('❌ Enhanced bulk route processing with visibility analysis error:', error);
    
    // Clean up uploaded file on error
    if (req.file && req.file.path) {
      try {
        await fsPromises.unlink(req.file.path);
      } catch (cleanupError) {
        console.error('File cleanup error:', cleanupError);
      }
    }

    res.status(500).json({
      success: false,
      message: 'Error during enhanced bulk route processing with visibility analysis',
      error: error.message,
      recommendations: [
        'Try backgroundProcessing=true for large batches',
        'Use dataCollectionMode=basic for quicker processing',
        'Reduce maxConcurrentRoutes if system is overloaded',
        'Set enableAutomaticVisibilityAnalysis=false to disable visibility analysis',
        'Consider processing smaller batches of routes'
      ]
    });
  }
});

// ============================================================================
// ENHANCED PROCESSING FUNCTIONS WITH REAL-TIME STATUS UPDATES
// ============================================================================

/**
 * ENHANCED main processing function with real-time status updates and automatic visibility analysis
 */
async function processRoutesEnhancedWithVisibilityAndStatus(routeEntries, userId, options) {
  const startTime = Date.now();
  const {
    dataFolderPath,
    terrainType,
    dataCollectionMode,
    maxConcurrentRoutes,
    skipExistingRoutes,
    includeSharpTurns,
    includeBlindSpots,
    includeNetworkCoverage,
    includeEnhancedRoadConditions,
    includeAccidentData,
    includeSeasonalWeather,
    downloadImages,
    generateReports,
    // NEW: Visibility analysis options
    enableAutomaticVisibilityAnalysis,
    visibilityAnalysisTimeout,
    continueOnVisibilityFailure,
    visibilityAnalysisMode
  } = options;

  // Initialize processing state for real-time tracking
  updateProcessingState(userId, {
    status: 'starting',
    currentRoute: 'Initializing enhanced processing with visibility analysis...',
    totalRoutes: routeEntries.length,
    completedRoutes: 0,
    failedRoutes: 0,
    estimatedTimeRemaining: 'Calculating...',
    processingMode: 'enhanced_with_visibility',
    dataCollectionMode: dataCollectionMode || 'comprehensive',
    backgroundProcessing: false,
    startTime: new Date().toISOString(),
    enhancedDataCollection: {
      attempted: 0,
      successful: 0,
      failed: 0,
      sharpTurnsCollected: 0,
      blindSpotsCollected: 0,
      networkCoverageAnalyzed: 0,
      roadConditionsAnalyzed: 0,
      accidentDataCollected: 0,
      seasonalWeatherCollected: 0,
      totalRecordsCreated: 0,
      collectionBreakdown: {
        emergencyServices: 0,
        weatherConditions: 0,
        trafficData: 0,
        accidentProneAreas: 0,
        roadConditions: 0,
        sharpTurns: 0,
        blindSpots: 0,
        networkCoverage: 0,
        seasonalWeatherData: 0
      }
    },
    visibilityAnalysis: {
      enabled: enableAutomaticVisibilityAnalysis,
      attempted: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      totalSharpTurns: 0,
      totalBlindSpots: 0,
      criticalTurns: 0,
      criticalBlindSpots: 0,
      analysisBreakdown: {
        sharpTurnsSuccess: 0,
        blindSpotsSuccess: 0,
        sharpTurnsFailed: 0,
        blindSpotsFailed: 0
      },
      averageAnalysisTime: 0,
      errors: [],
      analysisMode: visibilityAnalysisMode
    }
  });

  const results = {
    totalRoutes: routeEntries.length,
    successful: [],
    failed: [],
    skipped: [],
    enhancedDataCollection: {
      attempted: 0,
      successful: 0,
      failed: 0,
      sharpTurnsCollected: 0,
      blindSpotsCollected: 0,
      networkCoverageAnalyzed: 0,
      roadConditionsAnalyzed: 0,
      accidentDataCollected: 0,
      seasonalWeatherCollected: 0,
      totalRecordsCreated: 0,
      collectionBreakdown: {
        emergencyServices: 0,
        weatherConditions: 0,
        trafficData: 0,
        accidentProneAreas: 0,
        roadConditions: 0,
        sharpTurns: 0,
        blindSpots: 0,
        networkCoverage: 0,
        seasonalWeatherData: 0
      }
    },
    // NEW: Visibility analysis tracking
    visibilityAnalysis: {
      enabled: enableAutomaticVisibilityAnalysis,
      attempted: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      totalSharpTurns: 0,
      totalBlindSpots: 0,
      criticalTurns: 0,
      criticalBlindSpots: 0,
      analysisBreakdown: {
        sharpTurnsSuccess: 0,
        blindSpotsSuccess: 0,
        sharpTurnsFailed: 0,
        blindSpotsFailed: 0
      },
      averageAnalysisTime: 0,
      errors: []
    }
  };

  // Update status to processing
  updateProcessingState(userId, {
    status: 'processing',
    currentRoute: 'Starting route processing...'
  });

  // Process routes in batches
  const batchSize = Math.min(parseInt(maxConcurrentRoutes), 2);
  const batches = [];
  
  for (let i = 0; i < routeEntries.length; i += batchSize) {
    batches.push(routeEntries.slice(i, i + batchSize));
  }

  console.log(`📦 Processing ${batches.length} enhanced batches of ${batchSize} routes each with automatic visibility analysis`);

  // Process each batch with enhanced data collection + automatic visibility analysis
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    console.log(`\n🔄 Processing Enhanced Batch ${batchIndex + 1}/${batches.length} (${batch.length} routes) with visibility analysis`);

    // Update status for current batch
    updateProcessingState(userId, {
      currentRoute: `Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} routes)`,
      estimatedTimeRemaining: `${Math.round((batches.length - batchIndex) * 3)} minutes remaining`
    });

    // PARALLEL processing within batch with enhanced data collection + automatic visibility
    const batchPromises = batch.map(async (routeEntry, index) => {
      const globalIndex = batchIndex * batchSize + index + 1;
      try {
        // Update status for current route
        updateProcessingState(userId, {
          currentRoute: `Processing route ${globalIndex}/${routeEntries.length}: ${routeEntry.fromcode} → ${routeEntry.tocode}`,
          
          // Update visibility analysis if enabled
          visibilityAnalysis: {
            ...getProcessingState(userId).visibilityAnalysis,
            currentRoute: enableAutomaticVisibilityAnalysis ? 
              `Analyzing visibility for ${routeEntry.fromcode} → ${routeEntry.tocode}` : null
          }
        });

        return await processSingleRouteEnhancedWithVisibility(
          routeEntry, 
          globalIndex, 
          userId, 
          dataFolderPath, 
          terrainType, 
          dataCollectionMode,
          skipExistingRoutes,
          {
            includeSharpTurns,
            includeBlindSpots,
            includeNetworkCoverage,
            includeEnhancedRoadConditions,
            includeAccidentData,
            includeSeasonalWeather,
            downloadImages,
            generateReports,
            // NEW: Visibility options
            enableAutomaticVisibilityAnalysis,
            visibilityAnalysisTimeout,
            continueOnVisibilityFailure,
            visibilityAnalysisMode
          }
        );
      } catch (error) {
        console.error(`❌ Enhanced Route ${globalIndex} failed:`, error.message);
        return {
          routeNumber: globalIndex,
          fromCode: routeEntry.fromcode,
          toCode: routeEntry.tocode,
          status: 'failed',
          error: error.message,
          processingTime: 0,
          visibilityAnalysisAttempted: false,
          visibilityAnalysisSuccessful: false
        };
      }
    });

    // Wait for batch completion with extended timeout (for visibility analysis)
    const batchResults = await Promise.allSettled(
      batchPromises.map(promise => 
        Promise.race([
          promise,
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Enhanced route processing with visibility timeout')), 400000) // 6.5 min per route max
          )
        ])
      )
    );

    // Collect enhanced results including visibility data
    batchResults.forEach((result, index) => {
      let routeResult;
      
      if (result.status === 'fulfilled') {
        routeResult = result.value;
      } else {
        const routeEntry = batch[index];
        routeResult = {
          routeNumber: batchIndex * batchSize + index + 1,
          fromCode: routeEntry.fromcode,
          toCode: routeEntry.tocode,
          status: 'failed',
          error: result.reason?.message || 'Unknown enhanced processing error',
          processingTime: 0,
          visibilityAnalysisAttempted: false,
          visibilityAnalysisSuccessful: false
        };
      }

      // Categorize result
      if (routeResult.status === 'successful') {
        results.successful.push(routeResult);
      } else if (routeResult.status === 'skipped') {
        results.skipped.push(routeResult);
      } else {
        results.failed.push(routeResult);
      }

      // Track enhanced data collection
      if (routeResult.enhancedDataCollectionAttempted) {
        results.enhancedDataCollection.attempted++;
        if (routeResult.enhancedDataCollectionSuccessful) {
          results.enhancedDataCollection.successful++;
          if (routeResult.enhancedCollectionCounts) {
            Object.keys(results.enhancedDataCollection.collectionBreakdown).forEach(key => {
              results.enhancedDataCollection.collectionBreakdown[key] += routeResult.enhancedCollectionCounts[key] || 0;
            });
            
            results.enhancedDataCollection.sharpTurnsCollected += routeResult.enhancedCollectionCounts.sharpTurns || 0;
            results.enhancedDataCollection.blindSpotsCollected += routeResult.enhancedCollectionCounts.blindSpots || 0;
            results.enhancedDataCollection.networkCoverageAnalyzed += routeResult.enhancedCollectionCounts.networkCoverage || 0;
            results.enhancedDataCollection.roadConditionsAnalyzed += routeResult.enhancedCollectionCounts.roadConditions || 0;
            results.enhancedDataCollection.accidentDataCollected += routeResult.enhancedCollectionCounts.accidentProneAreas || 0;
            results.enhancedDataCollection.seasonalWeatherCollected += routeResult.enhancedCollectionCounts.seasonalWeatherData || 0;
            
            const totalRecords = Object.values(routeResult.enhancedCollectionCounts).reduce((sum, count) => sum + (count || 0), 0);
            results.enhancedDataCollection.totalRecordsCreated += totalRecords;
          }
        } else {
          results.enhancedDataCollection.failed++;
        }
      }

      // NEW: Track visibility analysis results
      if (enableAutomaticVisibilityAnalysis) {
        if (routeResult.visibilityAnalysisAttempted) {
          results.visibilityAnalysis.attempted++;
          
          if (routeResult.visibilityAnalysisSuccessful) {
            results.visibilityAnalysis.successful++;
            
            // Aggregate visibility data
            if (routeResult.visibilityData) {
              results.visibilityAnalysis.totalSharpTurns += routeResult.visibilityData.sharpTurns || 0;
              results.visibilityAnalysis.totalBlindSpots += routeResult.visibilityData.blindSpots || 0;
              results.visibilityAnalysis.criticalTurns += routeResult.visibilityData.criticalTurns || 0;
              results.visibilityAnalysis.criticalBlindSpots += routeResult.visibilityData.criticalBlindSpots || 0;
              
              if (routeResult.visibilityData.sharpTurnsAnalyzed) {
                results.visibilityAnalysis.analysisBreakdown.sharpTurnsSuccess++;
              } else {
                results.visibilityAnalysis.analysisBreakdown.sharpTurnsFailed++;
              }
              
              if (routeResult.visibilityData.blindSpotsAnalyzed) {
                results.visibilityAnalysis.analysisBreakdown.blindSpotsSuccess++;
              } else {
                results.visibilityAnalysis.analysisBreakdown.blindSpotsFailed++;
              }
            }
          } else {
            results.visibilityAnalysis.failed++;
            if (routeResult.visibilityAnalysisError) {
              results.visibilityAnalysis.errors.push({
                routeNumber: routeResult.routeNumber,
                fromCode: routeResult.fromCode,
                toCode: routeResult.toCode,
                error: routeResult.visibilityAnalysisError
              });
            }
          }
        } else {
          results.visibilityAnalysis.skipped++;
        }
      }

      // Update real-time processing state after each route
      const currentState = getProcessingState(userId);
      const newCompletedRoutes = currentState.completedRoutes + (routeResult.status === 'successful' ? 1 : 0);
      const newFailedRoutes = currentState.failedRoutes + (routeResult.status === 'failed' ? 1 : 0);
      
      // Update enhanced data collection stats
      if (routeResult.enhancedCollectionCounts) {
        const currentEnhanced = currentState.enhancedDataCollection;
        const newEnhanced = {
          attempted: currentEnhanced.attempted + (routeResult.enhancedDataCollectionAttempted ? 1 : 0),
          successful: currentEnhanced.successful + (routeResult.enhancedDataCollectionSuccessful ? 1 : 0),
          failed: currentEnhanced.failed + (!routeResult.enhancedDataCollectionSuccessful && routeResult.enhancedDataCollectionAttempted ? 1 : 0),
         // Continuation from the previous part - completing the real-time status updates

          sharpTurnsCollected: currentEnhanced.sharpTurnsCollected + (routeResult.enhancedCollectionCounts.sharpTurns || 0),
          blindSpotsCollected: currentEnhanced.blindSpotsCollected + (routeResult.enhancedCollectionCounts.blindSpots || 0),
          networkCoverageAnalyzed: currentEnhanced.networkCoverageAnalyzed + (routeResult.enhancedCollectionCounts.networkCoverage || 0),
          roadConditionsAnalyzed: currentEnhanced.roadConditionsAnalyzed + (routeResult.enhancedCollectionCounts.roadConditions || 0),
          accidentDataCollected: currentEnhanced.accidentDataCollected + (routeResult.enhancedCollectionCounts.accidentProneAreas || 0),
          totalRecordsCreated: currentEnhanced.totalRecordsCreated + Object.values(routeResult.enhancedCollectionCounts).reduce((sum, count) => sum + (count || 0), 0),
          collectionBreakdown: {
            emergencyServices: currentEnhanced.collectionBreakdown.emergencyServices + (routeResult.enhancedCollectionCounts.emergencyServices || 0),
            weatherConditions: currentEnhanced.collectionBreakdown.weatherConditions + (routeResult.enhancedCollectionCounts.weatherConditions || 0),
            trafficData: currentEnhanced.collectionBreakdown.trafficData + (routeResult.enhancedCollectionCounts.trafficData || 0),
            accidentProneAreas: currentEnhanced.collectionBreakdown.accidentProneAreas + (routeResult.enhancedCollectionCounts.accidentProneAreas || 0),
            roadConditions: currentEnhanced.collectionBreakdown.roadConditions + (routeResult.enhancedCollectionCounts.roadConditions || 0),
            sharpTurns: currentEnhanced.collectionBreakdown.sharpTurns + (routeResult.enhancedCollectionCounts.sharpTurns || 0),
            blindSpots: currentEnhanced.collectionBreakdown.blindSpots + (routeResult.enhancedCollectionCounts.blindSpots || 0),
            networkCoverage: currentEnhanced.collectionBreakdown.networkCoverage + (routeResult.enhancedCollectionCounts.networkCoverage || 0),
            seasonalWeatherData: currentEnhanced.collectionBreakdown.seasonalWeatherData + (routeResult.enhancedCollectionCounts.seasonalWeatherData || 0)
          }
        };
        
        // Update visibility analysis stats if available
        const currentVisibility = currentState.visibilityAnalysis;
        const newVisibility = {
          ...currentVisibility,
          attempted: currentVisibility.attempted + (routeResult.visibilityAnalysisAttempted ? 1 : 0),
          successful: currentVisibility.successful + (routeResult.visibilityAnalysisSuccessful ? 1 : 0),
          failed: currentVisibility.failed + (!routeResult.visibilityAnalysisSuccessful && routeResult.visibilityAnalysisAttempted ? 1 : 0),
          totalSharpTurns: currentVisibility.totalSharpTurns + (routeResult.visibilityData?.sharpTurns || 0),
          totalBlindSpots: currentVisibility.totalBlindSpots + (routeResult.visibilityData?.blindSpots || 0),
          criticalTurns: currentVisibility.criticalTurns + (routeResult.visibilityData?.criticalTurns || 0),
          criticalBlindSpots: currentVisibility.criticalBlindSpots + (routeResult.visibilityData?.criticalBlindSpots || 0),
          currentRoute: null // Clear current route after completion
        };
        
        updateProcessingState(userId, {
          completedRoutes: newCompletedRoutes,
          failedRoutes: newFailedRoutes,
          enhancedDataCollection: newEnhanced,
          visibilityAnalysis: newVisibility,
          currentRoute: `Completed route ${routeResult.routeNumber}/${routeEntries.length}`,
          estimatedTimeRemaining: `${Math.round(((routeEntries.length - routeResult.routeNumber) / batchSize) * 3)} minutes remaining`
        });
      }
    });

    // Brief pause between batches
    if (batchIndex < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Calculate visibility analysis average time
  if (results.visibilityAnalysis.attempted > 0) {
    const totalVisibilityTime = results.successful
      .filter(r => r.visibilityAnalysisTime)
      .reduce((sum, r) => sum + r.visibilityAnalysisTime, 0);
    results.visibilityAnalysis.averageAnalysisTime = Math.round(totalVisibilityTime / results.visibilityAnalysis.attempted);
  }

  // Generate enhanced summary with visibility data
  const totalProcessingTime = Date.now() - startTime;
  const summary = {
    totalProcessingTime: `${(totalProcessingTime / 1000).toFixed(2)}s`,
    averageTimePerRoute: results.successful.length > 0 ? 
      `${(totalProcessingTime / (results.successful.length * 1000)).toFixed(2)}s` : '0s',
    successRate: Math.round((results.successful.length / results.totalRoutes) * 100),
    enhancedDataCollectionRate: results.enhancedDataCollection.attempted > 0 ? 
      Math.round((results.enhancedDataCollection.successful / results.enhancedDataCollection.attempted) * 100) : 0,
    
    // NEW: Visibility analysis summary
    visibilityAnalysisRate: results.visibilityAnalysis.attempted > 0 ? 
      Math.round((results.visibilityAnalysis.successful / results.visibilityAnalysis.attempted) * 100) : 0,
    
    routesCreated: results.successful.length,
    routesSkipped: results.skipped.length,
    routesFailed: results.failed.length,
    totalDataRecordsCreated: results.enhancedDataCollection.totalRecordsCreated,
    completedAt: new Date().toISOString(),
    
    enhancedFeatures: {
      sharpTurnsAnalyzed: results.enhancedDataCollection.sharpTurnsCollected,
      blindSpotsAnalyzed: results.enhancedDataCollection.blindSpotsCollected,
      networkCoverageAnalyzed: results.enhancedDataCollection.networkCoverageAnalyzed,
      roadConditionsAnalyzed: results.enhancedDataCollection.roadConditionsAnalyzed,
      accidentDataCollected: results.enhancedDataCollection.accidentDataCollected,
      seasonalWeatherCollected: results.enhancedDataCollection.seasonalWeatherCollected
    },
    
    // NEW: Visibility analysis summary
    visibilityAnalysisResults: {
      enabled: enableAutomaticVisibilityAnalysis,
      routesAnalyzed: results.visibilityAnalysis.successful,
      totalSharpTurns: results.visibilityAnalysis.totalSharpTurns,
      totalBlindSpots: results.visibilityAnalysis.totalBlindSpots,
      criticalTurns: results.visibilityAnalysis.criticalTurns,
      criticalBlindSpots: results.visibilityAnalysis.criticalBlindSpots,
      averageAnalysisTime: `${results.visibilityAnalysis.averageAnalysisTime}ms`,
      successRate: results.visibilityAnalysis.attempted > 0 ? 
        Math.round((results.visibilityAnalysis.successful / results.visibilityAnalysis.attempted) * 100) : 0,
      failedAnalyses: results.visibilityAnalysis.failed,
      analysisMode: visibilityAnalysisMode
    }
  };

  const finalResults = {
    summary,
    results: {
      successful: results.successful.length,
      skipped: results.skipped.length,
      failed: results.failed.length,
      enhancedDataCollectionStats: results.enhancedDataCollection,
      visibilityAnalysisStats: results.visibilityAnalysis
    },
    enhancedMongodbCollectionsSummary: {
      totalRecordsCreated: results.enhancedDataCollection.totalRecordsCreated + results.visibilityAnalysis.totalSharpTurns + results.visibilityAnalysis.totalBlindSpots,
      breakdown: {
        ...results.enhancedDataCollection.collectionBreakdown,
        sharpTurns: results.visibilityAnalysis.totalSharpTurns,
        blindSpots: results.visibilityAnalysis.totalBlindSpots
      },
      enhancedFeatures: summary.enhancedFeatures,
      visibilityAnalysisResults: summary.visibilityAnalysisResults,
      dataCollectionMode,
      routesWithEnhancedData: results.enhancedDataCollection.successful,
      routesWithVisibilityAnalysis: results.visibilityAnalysis.successful,
      recordsPerRoute: results.enhancedDataCollection.successful > 0 ? 
        Math.round(results.enhancedDataCollection.totalRecordsCreated / results.enhancedDataCollection.successful) : 0
    },
    detailedResults: {
      successful: results.successful.slice(0, 10),
      failed: results.failed.slice(0, 10),
      skipped: results.skipped.slice(0, 5),
      visibilityErrors: results.visibilityAnalysis.errors.slice(0, 5)
    },
    nextSteps: [
      `${results.successful.length} routes created with enhanced data collection`,
      `${results.enhancedDataCollection.totalRecordsCreated} total records created across all collections`,
      `${results.visibilityAnalysis.successful} routes analyzed for visibility (${results.visibilityAnalysis.totalSharpTurns} sharp turns, ${results.visibilityAnalysis.totalBlindSpots} blind spots)`,
      `Sharp Turns: ${results.visibilityAnalysis.totalSharpTurns} analyzed automatically (${results.visibilityAnalysis.criticalTurns} critical)`,
      `Blind Spots: ${results.visibilityAnalysis.totalBlindSpots} analyzed automatically (${results.visibilityAnalysis.criticalBlindSpots} critical)`,
      `Enhanced Road Conditions: ${results.enhancedDataCollection.roadConditionsAnalyzed} analyzed with multi-API integration`,
      `Accident Data: ${results.enhancedDataCollection.accidentDataCollected} collected with real APIs`,
      `Seasonal Weather: ${results.enhancedDataCollection.seasonalWeatherCollected} analyzed with advanced predictions`,
      'Use enhanced route endpoints for detailed analysis of all collected data',
      'Access visibility analysis results via /api/sharp-turns-blind-spots/routes/:routeId/visibility-analysis',
      'All MongoDB collections are populated with comprehensive safety data including automatic visibility analysis'
    ]
  };

  // Update final processing state
  updateProcessingState(userId, {
    status: 'completed',
    currentRoute: 'Processing completed successfully',
    completedRoutes: results.successful.length,
    failedRoutes: results.failed.length,
    estimatedTimeRemaining: 'Completed',
    results: finalResults
  });

  console.log(`\n✅ ENHANCED BULK PROCESSING WITH VISIBILITY ANALYSIS COMPLETED`);
  console.log(`📊 Results: ${results.successful.length} successful, ${results.skipped.length} skipped, ${results.failed.length} failed`);
  console.log(`⏱️ Total time: ${(totalProcessingTime / 1000).toFixed(2)}s`);
  console.log(`🎯 Enhanced data: ${results.enhancedDataCollection.totalRecordsCreated} total records created`);
  console.log(`🔍 Visibility analysis: ${results.visibilityAnalysis.successful}/${results.visibilityAnalysis.attempted} routes analyzed`);
  console.log(`📈 Sharp turns found: ${results.visibilityAnalysis.totalSharpTurns} (${results.visibilityAnalysis.criticalTurns} critical)`);
  console.log(`🚫 Blind spots found: ${results.visibilityAnalysis.totalBlindSpots} (${results.visibilityAnalysis.criticalBlindSpots} critical)`);

  return finalResults;
}

/**
 * NEW: Background processing for enhanced routes with visibility analysis and real-time status
 */
async function processRoutesInBackgroundEnhancedWithVisibility(routeEntries, userId, options) {
  console.log(`🔄 Starting enhanced background processing with automatic visibility analysis for ${routeEntries.length} routes`);
  
  try {
    const results = await processRoutesEnhancedWithVisibilityAndStatus(routeEntries, userId, options);
    
    // Save results to file
    const resultsFilePath = path.join('./downloads/bulk-processing-results', `enhanced-with-visibility-background-results-${Date.now()}.json`);
    await fsPromises.mkdir(path.dirname(resultsFilePath), { recursive: true });
    await fsPromises.writeFile(resultsFilePath, JSON.stringify(results, null, 2));
    
    console.log(`✅ Enhanced background processing with visibility analysis completed. Results saved: ${resultsFilePath}`);
    
  } catch (error) {
    console.error('❌ Enhanced background processing with visibility analysis failed:', error);
    
    // Update state with error
    updateProcessingState(userId, {
      status: 'failed',
      currentRoute: 'Background processing failed',
      error: error.message
    });
  }
}

// ============================================================================
// SINGLE ROUTE PROCESSING WITH VISIBILITY ANALYSIS
// ============================================================================

/**
 * ENHANCED single route processing with automatic visibility analysis
 */
async function processSingleRouteEnhancedWithVisibility(routeEntry, routeNumber, userId, dataFolderPath, terrainType, dataCollectionMode, skipExistingRoutes, enhancedOptions) {
  const startTime = Date.now();
  const result = {
    routeNumber,
    fromCode: routeEntry.fromcode,
    toCode: routeEntry.tocode,
    fromName: routeEntry.fromname,
    toName: routeEntry.toname,
    status: 'failed',
    routeId: null,
    gpsPoints: 0,
    enhancedDataCollectionAttempted: false,
    enhancedDataCollectionSuccessful: false,
    // NEW: Visibility analysis tracking
    visibilityAnalysisAttempted: false,
    visibilityAnalysisSuccessful: false,
    visibilityAnalysisTime: 0,
    visibilityAnalysisError: null,
    visibilityData: {
      sharpTurns: 0,
      blindSpots: 0,
      criticalTurns: 0,
      criticalBlindSpots: 0,
      sharpTurnsAnalyzed: false,
      blindSpotsAnalyzed: false,
      analysisMethod: 'none'
    },
    processingTime: 0,
    error: null,
    enhancedCollectionCounts: {}
  };

  try {
    console.log(`  📍 Enhanced Route ${routeNumber} with Auto-Visibility: ${routeEntry.fromcode} → ${routeEntry.tocode}`);

    // Check if route already exists
    if (skipExistingRoutes) {
      const existingRoute = await Route.findOne({
        userId,
        fromCode: routeEntry.fromcode,
        toCode: routeEntry.tocode,
        status: { $ne: 'deleted' }
      });

      if (existingRoute) {
        result.status = 'skipped';
        result.routeId = existingRoute._id;
        result.error = 'Route already exists';
        result.processingTime = Date.now() - startTime;
        console.log(`    ⏭️ Skipped: Route already exists (${existingRoute.routeId})`);
        
        // NEW: Try visibility analysis on existing route if enabled
        if (enhancedOptions.enableAutomaticVisibilityAnalysis) {
          try {
            const visibilityResult = await performAutomaticVisibilityAnalysis(
              existingRoute._id, 
              enhancedOptions.visibilityAnalysisMode,
              enhancedOptions.visibilityAnalysisTimeout
            );
            result.visibilityAnalysisAttempted = true;
            result.visibilityAnalysisSuccessful = visibilityResult.success;
            result.visibilityData = visibilityResult.data;
            result.visibilityAnalysisTime = visibilityResult.analysisTime;
            if (!visibilityResult.success) {
              result.visibilityAnalysisError = visibilityResult.error;
            }
          } catch (visError) {
            result.visibilityAnalysisError = visError.message;
            if (!enhancedOptions.continueOnVisibilityFailure) {
              result.status = 'failed';
              result.error = `Visibility analysis failed: ${visError.message}`;
            }
          }
        }
        
        return result;
      }
    }

    // Find and load GPS data
    const gpsPoints = await loadGPSDataOptimized(dataFolderPath, routeEntry);
    
    if (gpsPoints.length < 2) {
      throw new Error(`Insufficient GPS points: ${gpsPoints.length} (minimum 2 required)`);
    }

    result.gpsPoints = gpsPoints.length;
    console.log(`    📊 Loaded ${gpsPoints.length} GPS points`);

    // Create route
    const route = await createRouteOptimized(gpsPoints, routeEntry, userId, terrainType);
    result.status = 'successful';
    result.routeId = route._id;
    
    console.log(`    ✅ Route created: ${route.routeId}`);

    // ENHANCED DATA COLLECTION (existing functionality)
    if (dataCollectionMode !== 'none') {
      result.enhancedDataCollectionAttempted = true;
      
      try {
        const enhancedCollectionCounts = await collectEnhancedDataForRoute(route._id, dataCollectionMode, enhancedOptions);
        
        const totalRecords = Object.values(enhancedCollectionCounts).reduce((sum, count) => sum + count, 0);
        
        if (totalRecords > 0) {
          result.enhancedDataCollectionSuccessful = true;
          result.enhancedCollectionCounts = enhancedCollectionCounts;
          console.log(`    ✅ Enhanced data collection completed: ${totalRecords} records across ${Object.keys(enhancedCollectionCounts).filter(k => enhancedCollectionCounts[k] > 0).length} collections`);
        } else {
          result.enhancedDataCollectionSuccessful = false;
          result.enhancedCollectionCounts = enhancedCollectionCounts;
          console.log(`    ⚠️ Enhanced data collection completed but no records created`);
        }
        
      } catch (dataError) {
        console.error(`    ❌ Enhanced data collection failed:`, dataError.message);
        result.enhancedDataCollectionSuccessful = false;
        result.enhancedDataCollectionError = dataError.message;
      }
    }

    // NEW: AUTOMATIC VISIBILITY ANALYSIS
    if (enhancedOptions.enableAutomaticVisibilityAnalysis) {
      console.log(`    🔍 Starting automatic visibility analysis (mode: ${enhancedOptions.visibilityAnalysisMode})...`);
      result.visibilityAnalysisAttempted = true;
      
      const visibilityStartTime = Date.now();
      
      try {
        const visibilityResult = await performAutomaticVisibilityAnalysis(
          route._id, 
          enhancedOptions.visibilityAnalysisMode,
          enhancedOptions.visibilityAnalysisTimeout
        );
        
        result.visibilityAnalysisTime = Date.now() - visibilityStartTime;
        result.visibilityAnalysisSuccessful = visibilityResult.success;
        result.visibilityData = visibilityResult.data;
        
        if (visibilityResult.success) {
          console.log(`    ✅ Visibility analysis completed: ${visibilityResult.data.sharpTurns} turns, ${visibilityResult.data.blindSpots} blind spots (${result.visibilityAnalysisTime}ms)`);
          if (visibilityResult.data.criticalTurns > 0 || visibilityResult.data.criticalBlindSpots > 0) {
            console.log(`    ⚠️ CRITICAL visibility issues found: ${visibilityResult.data.criticalTurns} critical turns, ${visibilityResult.data.criticalBlindSpots} critical blind spots`);
          }
        } else {
          result.visibilityAnalysisError = visibilityResult.error;
          console.error(`    ❌ Visibility analysis failed: ${visibilityResult.error} (${result.visibilityAnalysisTime}ms)`);
          
          // Check if we should fail the entire route processing
          if (!enhancedOptions.continueOnVisibilityFailure) {
            result.status = 'failed';
            result.error = `Visibility analysis failed: ${visibilityResult.error}`;
          }
        }
        
      } catch (visibilityError) {
        result.visibilityAnalysisTime = Date.now() - visibilityStartTime;
        result.visibilityAnalysisError = visibilityError.message;
        console.error(`    ❌ Visibility analysis exception: ${visibilityError.message} (${result.visibilityAnalysisTime}ms)`);
        
        if (!enhancedOptions.continueOnVisibilityFailure) {
          result.status = 'failed';
          result.error = `Visibility analysis exception: ${visibilityError.message}`;
        }
      }
    } else {
      console.log(`    ⏭️ Automatic visibility analysis disabled`);
    }

  } catch (error) {
    result.error = error.message;
    console.error(`    ❌ Enhanced Route ${routeNumber} failed:`, error.message);
  }

  result.processingTime = Date.now() - startTime;
  return result;
}

/**
 * NEW: Perform automatic visibility analysis for a route
 */
async function performAutomaticVisibilityAnalysis(routeId, analysisMode, timeout) {
  const result = {
    success: false,
    data: {
      sharpTurns: 0,
      blindSpots: 0,
      criticalTurns: 0,
      criticalBlindSpots: 0,
      sharpTurnsAnalyzed: false,
      blindSpotsAnalyzed: false,
      analysisMethod: 'none'
    },
    error: null,
    analysisTime: 0
  };

  const analysisStartTime = Date.now();

  try {
    // Import the visibility analysis service
    const sharpTurnsService = require('../services/sharpTurnsBlindSpotsService');
    
    // Set timeout for the analysis
    const analysisPromise = sharpTurnsService.analyzeRoute(routeId);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Visibility analysis timeout after ${timeout}ms`)), timeout)
    );

    // Run analysis with timeout
    const analysisResults = await Promise.race([analysisPromise, timeoutPromise]);
    
    // Process results
    if (analysisResults && typeof analysisResults === 'object') {
      // Extract sharp turns data
      if (analysisResults.sharpTurns && analysisResults.sharpTurns.turns) {
        result.data.sharpTurns = analysisResults.sharpTurns.turns.length;
        result.data.criticalTurns = analysisResults.sharpTurns.turns.filter(turn => turn.riskScore >= 8).length;
        result.data.sharpTurnsAnalyzed = true;
      }
      
      // Extract blind spots data
      if (analysisResults.blindSpots && analysisResults.blindSpots.spots) {
        result.data.blindSpots = analysisResults.blindSpots.spots.length;
        result.data.criticalBlindSpots = analysisResults.blindSpots.spots.filter(spot => spot.riskScore >= 8).length;
        result.data.blindSpotsAnalyzed = true;
      }
      
      // Set analysis method
      result.data.analysisMethod = analysisResults.blindSpots?.analysisMethod || 'automatic';
      
      // Determine if analysis was successful
      result.success = result.data.sharpTurnsAnalyzed || result.data.blindSpotsAnalyzed;
      
      if (!result.success) {
        result.error = 'No visibility data was successfully analyzed';
      }
      
    } else {
      result.error = 'Invalid analysis results returned';
    }

  } catch (error) {
    result.error = error.message;
    console.error(`Automatic visibility analysis error for route ${routeId}:`, error);
  }

  result.analysisTime = Date.now() - analysisStartTime;
  
  return result;
}

// ============================================================================
// ENHANCED DATA COLLECTION FUNCTIONS (EXISTING - REUSED)
// ============================================================================

/**
 * Collect enhanced data using all available services (existing function - reused)
 */
async function collectEnhancedDataForRoute(routeId, mode, enhancedOptions) {
  const collectionCounts = {
    emergencyServices: 0,
    weatherConditions: 0,
    trafficData: 0,
    accidentProneAreas: 0,
    roadConditions: 0,
    sharpTurns: 0,
    blindSpots: 0,
    networkCoverage: 0,
    seasonalWeatherData: 0
  };

  const collectionPromises = [];

  try {
    // 1. Basic Data Collection (if mode is basic or comprehensive)
    if (mode === 'basic' || mode === 'comprehensive' || mode === 'complete') {
      collectionPromises.push(
        collectBasicRouteData(routeId).catch(error => {
          console.error('Basic data collection failed:', error.message);
          return { error: error.message };
        })
      );
    }

    // 2. Sharp Turns Analysis (if enabled) - NOTE: This is separate from automatic visibility analysis
    if (enhancedOptions.includeSharpTurns && (mode === 'comprehensive' || mode === 'complete')) {
      collectionPromises.push(
        collectSharpTurnsAndBlindSpots(routeId).catch(error => {
          console.error('Sharp turns/blind spots analysis failed:', error.message);
          return { error: error.message };
        })
      );
    }

    // 3. Network Coverage Analysis (if enabled)
    if (enhancedOptions.includeNetworkCoverage && (mode === 'comprehensive' || mode === 'complete')) {
      collectionPromises.push(
        collectNetworkCoverageData(routeId).catch(error => {
          console.error('Network coverage analysis failed:', error.message);
          return { error: error.message };
        })
      );
    }

    // 4. Enhanced Road Conditions (if enabled)
    if (enhancedOptions.includeEnhancedRoadConditions && (mode === 'comprehensive' || mode === 'complete')) {
      collectionPromises.push(
        collectEnhancedRoadConditions(routeId).catch(error => {
          console.error('Enhanced road conditions failed:', error.message);
          return { error: error.message };
        })
      );
    }

    // 5. Accident Data Collection (if enabled)
    if (enhancedOptions.includeAccidentData && (mode === 'comprehensive' || mode === 'complete')) {
      collectionPromises.push(
        collectAccidentData(routeId).catch(error => {
          console.error('Accident data collection failed:', error.message);
          return { error: error.message };
        })
      );
    }

    // 6. Seasonal Weather Analysis (if enabled)
    if (enhancedOptions.includeSeasonalWeather && mode === 'complete') {
      collectionPromises.push(
        collectSeasonalWeatherData(routeId).catch(error => {
          console.error('Seasonal weather analysis failed:', error.message);
          return { error: error.message };
        })
      );
    }

    // Execute all collections with timeout
    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Enhanced data collection timeout after 180 seconds')), 180000)
    );
    
    await Promise.race([Promise.all(collectionPromises), timeout]);
    
    // Count actual records created
    const actualCounts = await countRecordsCreated(routeId);
    
    return actualCounts;
    
  } catch (error) {
    console.error(`Enhanced data collection failed: ${error.message}`);
    return collectionCounts; // Return empty counts on failure
  }
}

/**
 * Collect basic route data (original data collection service)
 */
async function collectBasicRouteData(routeId) {
  try {
    const dataCollectionService = require('../services/dataCollectionService');
    return await dataCollectionService.collectAllRouteData(routeId);
  } catch (error) {
    console.error('Basic data collection failed:', error);
    throw error;
  }
}

/**
 * Collect sharp turns and blind spots using the enhanced service
 */
async function collectSharpTurnsAndBlindSpots(routeId) {
  try {
    const sharpTurnsService = require('../services/sharpTurnsBlindSpotsService');
    return await sharpTurnsService.analyzeRoute(routeId);
  } catch (error) {
    console.error('Sharp turns and blind spots analysis failed:', error);
    throw error;
  }
}

/**
 * Collect network coverage data using the network coverage service
 */
async function collectNetworkCoverageData(routeId) {
  try {
    const { NetworkCoverageService } = require('../services/networkCoverageService');
    return await NetworkCoverageService.analyzeNetworkCoverage(routeId);
  } catch (error) {
    console.error('Network coverage analysis failed:', error);
    throw error;
  }
}

/**
 * Collect enhanced road conditions using the enhanced service
 */
async function collectEnhancedRoadConditions(routeId) {
  try {
    const enhancedRoadConditionsService = require('../services/enhancedRoadConditionsService');
    return await enhancedRoadConditionsService.collectEnhancedRoadConditions(routeId);
  } catch (error) {
    console.error('Enhanced road conditions analysis failed:', error);
    throw error;
  }
}

// Continuation from Part 2 - completing the data collection and utility functions

/**
 * Collect accident data using the accident service
 */
async function collectAccidentData(routeId) {
  try {
    const accidentDataService = require('../services/accidentDataService');
    const route = await Route.findById(routeId);
    return await accidentDataService.collectRealAccidentProneAreas(route);
  } catch (error) {
    console.error('Accident data collection failed:', error);
    throw error;
  }
}

/**
 * Collect seasonal weather data using the enhanced weather service
 */
async function collectSeasonalWeatherData(routeId) {
  try {
    const enhancedWeatherService = require('../services/enhancedWeatherService');
    return await enhancedWeatherService.collectAllSeasonalWeatherData(routeId);
  } catch (error) {
    console.error('Seasonal weather analysis failed:', error);
    throw error;
  }
}

/**
 * Count records created efficiently across all collections
 */
async function countRecordsCreated(routeId) {
  try {
    const [
      emergencyCount,
      weatherCount,
      trafficCount,
      accidentCount,
      roadCount,
      sharpTurnCount,
      blindSpotCount,
      networkCount
    ] = await Promise.all([
      require('../models/EmergencyService').countDocuments({ routeId }),
      require('../models/WeatherCondition').countDocuments({ routeId }),
      require('../models/TrafficData').countDocuments({ routeId }),
      require('../models/AccidentProneArea').countDocuments({ routeId }),
      require('../models/RoadCondition').countDocuments({ routeId }),
      require('../models/SharpTurn').countDocuments({ routeId }),
      require('../models/BlindSpot').countDocuments({ routeId }),
      require('../models/NetworkCoverage').countDocuments({ routeId })
    ]);

    return {
      emergencyServices: emergencyCount,
      weatherConditions: weatherCount,
      trafficData: trafficCount,
      accidentProneAreas: accidentCount,
      roadConditions: roadCount,
      sharpTurns: sharpTurnCount,
      blindSpots: blindSpotCount,
      networkCoverage: networkCount,
      seasonalWeatherData: 0 // Would need separate model for seasonal data
    };
  } catch (error) {
    console.error('Error counting records:', error);
    return {
      emergencyServices: 0,
      weatherConditions: 0,
      trafficData: 0,
      accidentProneAreas: 0,
      roadConditions: 0,
      sharpTurns: 0,
      blindSpots: 0,
      networkCoverage: 0,
      seasonalWeatherData: 0
    };
  }
}

// ============================================================================
// UTILITY FUNCTIONS (EXISTING - REUSED)
// ============================================================================

// Reuse existing helper functions from original code
async function loadGPSDataOptimized(dataFolderPath, routeEntry) {
  const possiblePaths = [
    path.join(dataFolderPath, `${routeEntry.fromcode}_${routeEntry.tocode}.xlsx`),
    path.join(dataFolderPath, `${routeEntry.fromcode}_${routeEntry.tocode}.xls`)
  ];
  
  let gpsFilePath = null;
  for (const testPath of possiblePaths) {
    try {
      await fsPromises.access(testPath);
      gpsFilePath = testPath;
      break;
    } catch (error) {
      continue;
    }
  }
  
  if (!gpsFilePath) {
    throw new Error(`GPS file not found: ${routeEntry.fromcode}_${routeEntry.tocode}.xlsx or .xls`);
  }

  return await parseGPSExcelFileOptimized(gpsFilePath);
}

async function parseGPSExcelFileOptimized(filePath) {
  try {
    const workbook = XLSX.readFile(filePath, { 
      sheetStubs: false,
      cellDates: false,
      cellStyles: false
    });
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    if (data.length < 2) {
      throw new Error('Excel file contains insufficient data');
    }

    let headerRowIndex = -1;
    let latCol = -1;
    let lonCol = -1;

    for (let i = 0; i < Math.min(3, data.length); i++) {
      const row = data[i];
      if (Array.isArray(row)) {
        for (let j = 0; j < row.length; j++) {
          const cell = row[j]?.toString().toLowerCase().trim();
          if (cell && (cell.includes('lat') || cell === 'latitude')) {
            headerRowIndex = i;
            latCol = j;
          }
          if (cell && (cell.includes('lon') || cell.includes('lng') || cell === 'longitude')) {
            headerRowIndex = i;
            lonCol = j;
          }
        }
        if (latCol >= 0 && lonCol >= 0) break;
      }
    }

    if (latCol === -1 || lonCol === -1) {
      throw new Error('Could not find Latitude/Longitude columns');
    }

    const gpsPoints = [];
    const maxPoints = 50000;
    
    for (let i = headerRowIndex + 1; i < Math.min(data.length, headerRowIndex + 1 + maxPoints); i++) {
      const row = data[i];
      if (Array.isArray(row) && row.length > Math.max(latCol, lonCol)) {
        const lat = parseFloat(row[latCol]);
        const lon = parseFloat(row[lonCol]);

        if (!isNaN(lat) && !isNaN(lon) && 
            lat >= -90 && lat <= 90 && 
            lon >= -180 && lon <= 180) {
          gpsPoints.push({
            latitude: lat,
            longitude: lon,
            pointOrder: gpsPoints.length
          });
        }
      }
    }

    return gpsPoints;

  } catch (error) {
    throw new Error(`Failed to parse GPS Excel file: ${error.message}`);
  }
}

async function createRouteOptimized(gpsPoints, routeEntry, userId, terrainType) {
  const routeDetails = calculateRouteDetailsOptimized(gpsPoints, routeEntry);

  const route = new Route({
    userId,
    routeName: `${routeEntry.fromname} to ${routeEntry.toname}`,
    fromAddress: routeEntry.fromname,
    fromCode: routeEntry.fromcode,
    fromName: routeEntry.fromname,
    fromCoordinates: routeDetails.fromCoordinates,
    toAddress: routeEntry.toname,
    toCode: routeEntry.tocode,
    toName: routeEntry.toname,
    toCoordinates: routeDetails.toCoordinates,
    totalDistance: routeDetails.totalDistance,
    estimatedDuration: routeDetails.estimatedDuration,
    routePoints: routeDetails.routePoints,
    terrain: terrainType,
    metadata: {
      uploadSource: 'gps_csv',
      gpsTrackingPoints: gpsPoints.length,
      trackingAccuracy: 'excellent',
      bulkProcessing: true,
      enhancedProcessing: true,
      automaticVisibilityAnalysis: true, // NEW: Flag for automatic visibility
      processingVersion: 'enhanced_with_visibility_v1.0'
    }
  });

  route.generateLiveMapLink();
  await route.save();
  return route;
}

function calculateRouteDetailsOptimized(gpsPoints, routeEntry) {
  function calculateDistance(coord1, coord2) {
    const R = 6371;
    const dLat = (coord2.latitude - coord1.latitude) * Math.PI / 180;
    const dLon = (coord2.longitude - coord1.longitude) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(coord1.latitude * Math.PI / 180) * Math.cos(coord2.latitude * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  let totalDistance = 0;
  const routePoints = [];
  const maxRoutePoints = 1000;
  const step = Math.max(1, Math.floor(gpsPoints.length / maxRoutePoints));

  for (let i = 0; i < gpsPoints.length; i += step) {
    if (i > 0) {
      totalDistance += calculateDistance(gpsPoints[i-step] || gpsPoints[i-1], gpsPoints[i]);
    }

    routePoints.push({
      latitude: gpsPoints[i].latitude,
      longitude: gpsPoints[i].longitude,
      pointOrder: routePoints.length,
      distanceFromStart: totalDistance,
      distanceToEnd: 0
    });
  }

  routePoints.forEach(point => {
    point.distanceToEnd = totalDistance - point.distanceFromStart;
    point.distanceFromStart = Math.round(point.distanceFromStart * 100) / 100;
    point.distanceToEnd = Math.round(point.distanceToEnd * 100) / 100;
  });

  return {
    fromCoordinates: {
      latitude: gpsPoints[0].latitude,
      longitude: gpsPoints[0].longitude
    },
    toCoordinates: {
      latitude: gpsPoints[gpsPoints.length - 1].latitude,
      longitude: gpsPoints[gpsPoints.length - 1].longitude
    },
    totalDistance: Math.round(totalDistance * 100) / 100,
    estimatedDuration: Math.round(totalDistance * 1.5),
    routePoints
  };
}

// Helper function to parse CSV (existing)
async function parseBulkRoutesCSV(csvFilePath) {
  return new Promise((resolve, reject) => {
    const routes = [];
    const errors = [];

    fs.createReadStream(csvFilePath)
      .pipe(csv({
        headers: ['fromcode', 'fromname', 'tocode', 'toname'],
        skipEmptyLines: true,
        trim: true
      }))
      .on('data', (data) => {
        try {
          if (!data.fromcode || !data.fromname || !data.tocode || !data.toname) {
            errors.push(`Missing required fields: ${JSON.stringify(data)}`);
            return;
          }

          const route = {
            fromcode: data.fromcode.toString().trim(),
            fromname: data.fromname.toString().trim(),
            tocode: data.tocode.toString().trim(),
            toname: data.toname.toString().trim()
          };

          if (!route.fromcode || !route.tocode) {
            errors.push(`Empty from/to codes: ${JSON.stringify(route)}`);
            return;
          }

          routes.push(route);

        } catch (parseError) {
          errors.push(`Parse error: ${parseError.message}`);
        }
      })
      .on('end', () => {
        if (errors.length > 0) {
          console.warn(`⚠️ CSV parsing warnings: ${errors.length} entries had issues`);
        }
        
        console.log(`✅ CSV parsed successfully: ${routes.length} valid routes found`);
        resolve(routes);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

// ============================================================================
// ADDITIONAL ENDPOINTS FOR ENHANCED FUNCTIONALITY
// ============================================================================

/**
 * NEW: Add automatic visibility analysis to existing routes
 * POST /api/bulk-routes/add-visibility-to-existing-routes
 */
router.post('/add-visibility-to-existing-routes', async (req, res) => {
  try {
    const { 
      routeIds, 
      visibilityAnalysisMode = 'comprehensive',
      visibilityAnalysisTimeout = 180000,
      continueOnFailure = true,
      maxConcurrentRoutes = 2,
      onlyAnalyzeMissingRoutes = true
    } = req.body;
    
    const userId = req.user.id;
    
    if (!routeIds || !Array.isArray(routeIds)) {
      return res.status(400).json({
        success: false,
        message: 'Route IDs array is required'
      });
    }

    if (routeIds.length > 50) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 50 routes can be processed at once'
      });
    }

    console.log(`🔍 Starting visibility analysis for ${routeIds.length} existing routes`);

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

    // Filter routes if only analyzing missing routes
    let routesToAnalyze = routes;
    if (onlyAnalyzeMissingRoutes) {
      const [routesWithSharpTurns, routesWithBlindSpots] = await Promise.all([
        require('../models/SharpTurn').distinct('routeId', { routeId: { $in: routeIds } }),
        require('../models/BlindSpot').distinct('routeId', { routeId: { $in: routeIds } })
      ]);
      
      const routesWithVisibility = new Set([...routesWithSharpTurns, ...routesWithBlindSpots]);
      routesToAnalyze = routes.filter(route => !routesWithVisibility.has(route._id.toString()));
      
      console.log(`📊 Filtered to ${routesToAnalyze.length} routes without existing visibility analysis`);
    }

    const visibilityResults = {
      totalRoutes: routesToAnalyze.length,
      successful: [],
      failed: [],
      skipped: [],
      totalSharpTurns: 0,
      totalBlindSpots: 0,
      criticalTurns: 0,
      criticalBlindSpots: 0,
      totalAnalysisTime: 0
    };

    // Process routes in batches
    const batchSize = Math.min(parseInt(maxConcurrentRoutes), 2);
    for (let i = 0; i < routesToAnalyze.length; i += batchSize) {
      const batch = routesToAnalyze.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (route) => {
        const startTime = Date.now();
        
        try {
          console.log(`  🔍 Analyzing route: ${route.routeId || route.routeName}`);
          
          const visibilityResult = await performAutomaticVisibilityAnalysis(
            route._id, 
            visibilityAnalysisMode,
            visibilityAnalysisTimeout
          );
          
          const analysisTime = Date.now() - startTime;
          
          if (visibilityResult.success) {
            // Update route metadata
            await Route.findByIdAndUpdate(route._id, {
              'metadata.automaticVisibilityAnalysis': true,
              'metadata.visibilityAnalysisDate': new Date(),
              'metadata.visibilityAnalysisMode': visibilityAnalysisMode
            });
            
            return {
              routeId: route.routeId || route._id,
              routeName: route.routeName,
              success: true,
              analysisTime,
              visibilityData: visibilityResult.data
            };
          } else {
            return {
              routeId: route.routeId || route._id,
              routeName: route.routeName,
              success: false,
              error: visibilityResult.error,
              analysisTime
            };
          }
        } catch (error) {
          const analysisTime = Date.now() - startTime;
          console.error(`Visibility analysis failed for ${route.routeName}:`, error.message);
          return {
            routeId: route.routeId || route._id,
            routeName: route.routeName,
            success: false,
            error: error.message,
            analysisTime
          };
        }
      });

      const batchResults = await Promise.allSettled(
        batchPromises.map(promise => 
          Promise.race([
            promise,
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Visibility analysis timeout')), visibilityAnalysisTimeout + 30000)
            )
          ])
        )
      );

      batchResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          const routeResult = result.value;
          visibilityResults.totalAnalysisTime += routeResult.analysisTime || 0;
          
          if (routeResult.success) {
            visibilityResults.successful.push(routeResult);
            visibilityResults.totalSharpTurns += routeResult.visibilityData?.sharpTurns || 0;
            visibilityResults.totalBlindSpots += routeResult.visibilityData?.blindSpots || 0;
            visibilityResults.criticalTurns += routeResult.visibilityData?.criticalTurns || 0;
            visibilityResults.criticalBlindSpots += routeResult.visibilityData?.criticalBlindSpots || 0;
          } else {
            if (continueOnFailure) {
              visibilityResults.failed.push(routeResult);
            } else {
              throw new Error(`Visibility analysis failed for ${routeResult.routeName}: ${routeResult.error}`);
            }
          }
        } else {
          visibilityResults.failed.push({
            routeId: 'unknown',
            success: false,
            error: result.reason?.message || 'Processing timeout'
          });
        }
      });
      
      // Brief pause between batches
      if (i + batchSize < routesToAnalyze.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    const averageAnalysisTime = visibilityResults.successful.length > 0 ? 
      Math.round(visibilityResults.totalAnalysisTime / visibilityResults.successful.length) : 0;

    console.log(`✅ Visibility analysis completed: ${visibilityResults.successful.length} successful, ${visibilityResults.failed.length} failed`);

    res.status(200).json({
      success: true,
      message: 'Visibility analysis for existing routes completed',
      data: {
        ...visibilityResults,
        summary: {
          successRate: Math.round((visibilityResults.successful.length / visibilityResults.totalRoutes) * 100),
          averageAnalysisTime: `${averageAnalysisTime}ms`,
          totalVisibilityPoints: visibilityResults.totalSharpTurns + visibilityResults.totalBlindSpots,
          criticalPoints: visibilityResults.criticalTurns + visibilityResults.criticalBlindSpots,
          analysisMode: visibilityAnalysisMode,
          onlyMissingRoutes: onlyAnalyzeMissingRoutes
        },
        configuration: {
          visibilityAnalysisMode,
          visibilityAnalysisTimeout,
          continueOnFailure,
          maxConcurrentRoutes,
          onlyAnalyzeMissingRoutes
        },
        nextSteps: [
          `${visibilityResults.successful.length} routes now have visibility analysis`,
          `${visibilityResults.totalSharpTurns} sharp turns identified across all routes`,
          `${visibilityResults.totalBlindSpots} blind spots identified across all routes`,
          `${visibilityResults.criticalTurns + visibilityResults.criticalBlindSpots} critical visibility points require immediate attention`,
          'Use /api/sharp-turns-blind-spots/routes/:routeId/visibility-analysis for detailed analysis',
          'Review failed analyses and retry if needed'
        ]
      }
    });

  } catch (error) {
    console.error('Add visibility analysis to existing routes error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding visibility analysis to existing routes',
      error: error.message
    });
  }
});

/**
 * NEW: Get enhanced processing configuration options
 * GET /api/bulk-routes/configuration
 */
router.get('/configuration', async (req, res) => {
  try {
    const configuration = {
      processingModes: {
        original: {
          description: 'Basic route processing with standard data collection',
          endpoint: 'POST /api/bulk-routes/process-csv',
          dataCollection: 'basic',
          visibilityAnalysis: false,
          maxConcurrentRoutes: 10,
          estimatedTimePerRoute: '60s'
        },
        enhanced: {
          description: 'Enhanced route processing with comprehensive data collection',
          endpoint: 'POST /api/bulk-routes/process-csv-enhanced',
          dataCollection: 'comprehensive',
          visibilityAnalysis: 'optional',
          maxConcurrentRoutes: 5,
          estimatedTimePerRoute: '120s'
        },
        enhancedWithVisibility: {
          description: 'Enhanced route processing with automatic visibility analysis',
          endpoint: 'POST /api/bulk-routes/process-csv-enhanced (enableAutomaticVisibilityAnalysis=true)',
          dataCollection: 'comprehensive',
          visibilityAnalysis: 'automatic',
          maxConcurrentRoutes: 3,
          estimatedTimePerRoute: '180s'
        }
      },
      dataCollectionModes: {
        none: {
          description: 'No additional data collection',
          collections: []
        },
        basic: {
          description: 'Basic data collection (emergency services, weather, traffic)',
          collections: ['emergencyServices', 'weatherConditions', 'trafficData']
        },
        comprehensive: {
          description: 'Comprehensive data collection including enhanced APIs',
          collections: [
            'emergencyServices', 'weatherConditions', 'trafficData',
            'accidentProneAreas', 'roadConditions', 'networkCoverage'
          ]
        },
        complete: {
          description: 'Complete data collection with all available services',
          collections: [
            'emergencyServices', 'weatherConditions', 'trafficData',
            'accidentProneAreas', 'roadConditions', 'networkCoverage',
            'sharpTurns', 'blindSpots', 'seasonalWeatherData'
          ]
        }
      },
      visibilityAnalysisModes: {
        basic: {
          description: 'Basic visibility analysis with standard algorithms',
          features: ['sharpTurns', 'basicBlindSpots'],
          estimatedTime: '30s'
        },
        comprehensive: {
          description: 'Comprehensive visibility analysis with enhanced algorithms',
          features: ['sharpTurns', 'blindSpots', 'elevationAnalysis', 'curveAnalysis'],
          estimatedTime: '60s'
        },
        detailed: {
          description: 'Detailed visibility analysis with all available features',
          features: [
            'sharpTurns', 'blindSpots', 'elevationAnalysis', 'curveAnalysis',
            'obstructionAnalysis', 'intersectionAnalysis', 'criticalRiskDetection'
          ],
          estimatedTime: '120s'
        }
      },
      defaultParameters: {
        enhancedWithVisibility: {
          dataCollectionMode: 'comprehensive',
          maxConcurrentRoutes: 2,
          skipExistingRoutes: true,
          enableAutomaticVisibilityAnalysis: true,
          visibilityAnalysisMode: 'comprehensive',
          visibilityAnalysisTimeout: 180000,
          continueOnVisibilityFailure: true,
          includeSharpTurns: true,
          includeBlindSpots: true,
          includeNetworkCoverage: true,
          includeEnhancedRoadConditions: true,
          includeAccidentData: true,
          includeSeasonalWeather: false,
          downloadImages: false,
          generateReports: false
        }
      },
      limits: {
        maxFileSize: '10MB',
        maxRoutesPerBatch: 100,
        maxConcurrentRoutes: 10,
        timeoutPerRoute: 400000,
        visibilityAnalysisTimeout: 180000
      },
      apiRequirements: {
        googleMapsApiKey: {
          required: true,
          purpose: 'Elevation data, places data, roads data for visibility analysis',
          envVariable: 'GOOGLE_MAPS_API_KEY'
        },
        openWeatherApiKey: {
          required: false,
          purpose: 'Enhanced weather data collection',
          envVariable: 'OPENWEATHER_API_KEY'
        }
      }
    };

    res.status(200).json({
      success: true,
      data: configuration
    });

  } catch (error) {
    console.error('Configuration endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching configuration',
      error: error.message
    });
  }
});

// ============================================================================
// EXPORT ROUTER
// ============================================================================

module.exports = router;