// File: routes/bulkRouteProcessor.js - OPTIMIZED VERSION FOR 5800 ROUTES
// Purpose: Enhanced bulk processing with maximum concurrent connections
// Optimized for 2-3 days processing with Enhanced + Automatic Visibility Analysis

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
const ecoSensitiveZoneService = require('../services/ecoSensitiveZoneService');

// ============================================================================
// OPTIMIZED CONFIGURATION FOR 5800 ROUTES
// ============================================================================

const OPTIMIZED_CONFIG = {
  // Maximum concurrent processing based on API limits
  MAX_CONCURRENT_ROUTES: 10,          // Process 10 routes simultaneously
  MAX_CONCURRENT_API_CALLS: 50,       // Google Maps allows 50 QPS
  
  // Batch configuration
  OPTIMAL_BATCH_SIZE: 25,             // Process 25 routes per batch
  PAUSE_BETWEEN_BATCHES: 2000,        // 2 second pause between batches
  
  // Timeout configuration (increased for stability)
  ROUTE_TIMEOUT: 300000,              // 5 minutes per route
  VISIBILITY_TIMEOUT: 120000,         // 2 minutes for visibility analysis
  DATA_COLLECTION_TIMEOUT: 180000,    // 3 minutes for data collection
  
  // Retry configuration
  MAX_RETRIES: 3,
  RETRY_DELAY: 5000,                  // 5 seconds between retries
  
  // Memory management
  MEMORY_CHECK_INTERVAL: 50,          // Check every 50 routes
  GARBAGE_COLLECTION_INTERVAL: 100,   // Force GC every 100 routes
  
  // Progress tracking
  CHECKPOINT_INTERVAL: 100,           // Save progress every 100 routes
  STATUS_UPDATE_INTERVAL: 10,         // Update status every 10 routes
};

// ============================================================================
// GLOBAL PROCESSING STATE STORAGE WITH PERSISTENCE
// ============================================================================

const processingStates = new Map();
const progressCheckpoints = new Map();

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
  
  // Save checkpoint periodically
  if (updated.completedRoutes % OPTIMIZED_CONFIG.CHECKPOINT_INTERVAL === 0) {
    saveCheckpoint(userId, updated);
  }
  
  // Log progress every STATUS_UPDATE_INTERVAL
  if (updated.completedRoutes % OPTIMIZED_CONFIG.STATUS_UPDATE_INTERVAL === 0) {
    console.log(`📊 Progress: ${updated.completedRoutes}/${updated.totalRoutes} (${Math.round(updated.completedRoutes / updated.totalRoutes * 100)}%)`);
    console.log(`   ⏱️  Elapsed: ${Math.round((Date.now() - new Date(updated.startTime).getTime()) / 1000 / 60)} minutes`);
    console.log(`   📈 Rate: ${Math.round(updated.completedRoutes / ((Date.now() - new Date(updated.startTime).getTime()) / 1000 / 60))} routes/minute`);
  }
  
  return updated;
};

const getProcessingState = (userId) => {
  const key = `processing_${userId}`;
  return processingStates.get(key) || null;
};

const clearProcessingState = (userId) => {
  const key = `processing_${userId}`;
  processingStates.delete(key);
  progressCheckpoints.delete(userId);
  console.log(`🗑️ Processing state cleared for user ${userId}`);
};

// Save checkpoint for resume capability
async function saveCheckpoint(userId, state) {
  try {
    const checkpointPath = path.join('./checkpoints', `checkpoint_${userId}_${Date.now()}.json`);
    await fsPromises.mkdir(path.dirname(checkpointPath), { recursive: true });
    await fsPromises.writeFile(checkpointPath, JSON.stringify(state, null, 2));
    progressCheckpoints.set(userId, checkpointPath);
    console.log(`💾 Checkpoint saved: ${state.completedRoutes} routes completed`);
  } catch (error) {
    console.error('Checkpoint save error:', error);
  }
}

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
    fileSize: 50 * 1024 * 1024 // 50MB limit for large CSV files
  }
});

// All routes require authentication
router.use(auth);

// ============================================================================
// STATUS ENDPOINT - UNCHANGED FOR FRONTEND COMPATIBILITY
// ============================================================================

router.get('/status', async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('📊 Status check requested for user:', userId);
    
    const state = getProcessingState(userId);
    
    if (!state) {
      console.log('❌ No active processing found for user:', userId);
      return res.status(404).json({
        success: false,
        message: 'No active processing found',
        status: 'completed'
      });
    }
    
    // Calculate statistics
    const elapsedTime = Date.now() - new Date(state.startTime).getTime();
    const routesPerMinute = state.completedRoutes / (elapsedTime / 1000 / 60);
    const remainingRoutes = state.totalRoutes - state.completedRoutes;
    const estimatedTimeRemaining = remainingRoutes / routesPerMinute;
    
    console.log(`✅ Returning current processing state:`, {
      status: state.status,
      completedRoutes: state.completedRoutes,
      totalRoutes: state.totalRoutes,
      currentRoute: state.currentRoute,
      routesPerMinute: Math.round(routesPerMinute * 10) / 10,
      estimatedHoursRemaining: Math.round(estimatedTimeRemaining / 60 * 10) / 10
    });
    
    res.status(200).json({
      success: true,
      status: state.status || 'processing',
      currentRoute: state.currentRoute || 'Processing routes...',
      totalRoutes: state.totalRoutes || 0,
      completedRoutes: state.completedRoutes || 0,
      failedRoutes: state.failedRoutes || 0,
      estimatedTimeRemaining: estimatedTimeRemaining > 0 ? 
        `${Math.round(estimatedTimeRemaining / 60)} hours ${Math.round(estimatedTimeRemaining % 60)} minutes` : 
        'Calculating...',
      
      performanceMetrics: {
        routesPerMinute: Math.round(routesPerMinute * 10) / 10,
        elapsedHours: Math.round(elapsedTime / 1000 / 60 / 60 * 10) / 10,
        successRate: state.completedRoutes > 0 ? 
          Math.round(((state.completedRoutes - state.failedRoutes) / state.completedRoutes) * 100) : 0
      },
      
      enhancedDataCollection: state.enhancedDataCollection || {},
      visibilityAnalysis: state.visibilityAnalysis || {},
      
      processingMode: state.processingMode || 'enhanced',
      dataCollectionMode: state.dataCollectionMode || 'comprehensive',
      backgroundProcessing: state.backgroundProcessing || false,
      startTime: state.startTime,
      lastUpdate: state.lastUpdate,
      
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

// ============================================================================
// OPTIMIZED ENHANCED PROCESSING ENDPOINT
// ============================================================================

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
      
      // OPTIMIZED SETTINGS FOR 5800 ROUTES
      maxConcurrentRoutes = OPTIMIZED_CONFIG.MAX_CONCURRENT_ROUTES,
      batchSize = OPTIMIZED_CONFIG.OPTIMAL_BATCH_SIZE,
      
      skipExistingRoutes = true,
      backgroundProcessing = true, // ALWAYS USE BACKGROUND FOR LARGE BATCHES
      
      // Enhanced options - ALL ENABLED FOR MAXIMUM DATA
      includeSharpTurns = true,
      includeBlindSpots = true,
      includeNetworkCoverage = true,
      includeEnhancedRoadConditions = true,
      includeAccidentData = true,
      includeSeasonalWeather = true,
      downloadImages = false, // Disable images to save time
      generateReports = false,
      
      // Visibility analysis options - OPTIMIZED
      enableAutomaticVisibilityAnalysis = true,
      visibilityAnalysisTimeout = OPTIMIZED_CONFIG.VISIBILITY_TIMEOUT,
      continueOnVisibilityFailure = true,
      visibilityAnalysisMode = 'comprehensive',
      
      // Resume options
      resumeFromRoute = 0,
      useCheckpoint = false
    } = req.body;

    console.log(`🚀 Starting OPTIMIZED bulk route processing for large dataset`);
    console.log(`📁 Data folder: ${dataFolderPath}`);
    console.log(`⚙️ Collection mode: ${dataCollectionMode}`);
    console.log(`🔍 Visibility analysis: ${enableAutomaticVisibilityAnalysis ? 'ENABLED' : 'DISABLED'}`);
    console.log(`🔄 Concurrent routes: ${maxConcurrentRoutes}, Batch size: ${batchSize}`);

    // Parse CSV file
    const routeEntries = await parseBulkRoutesCSV(req.file.path);
    const totalEntries = routeEntries.length;
    
    console.log(`📊 Found ${totalEntries} route entries in CSV`);
    
    // Slice if resuming
    const routesToProcess = resumeFromRoute > 0 ? 
      routeEntries.slice(resumeFromRoute) : 
      routeEntries;
    
    console.log(`🎯 Processing ${routesToProcess.length} routes (starting from index ${resumeFromRoute})`);

    // For 5800 routes, ALWAYS use background processing
    if (totalEntries > 100 || backgroundProcessing) {
      // Start background processing
      processRoutesInBackgroundOptimized(routesToProcess, req.user.id, {
        dataFolderPath,
        terrainType,
        dataCollectionMode,
        maxConcurrentRoutes,
        batchSize,
        skipExistingRoutes,
        includeSharpTurns,
        includeBlindSpots,
        includeNetworkCoverage,
        includeEnhancedRoadConditions,
        includeAccidentData,
        includeSeasonalWeather,
        downloadImages,
        generateReports,
        enableAutomaticVisibilityAnalysis,
        visibilityAnalysisTimeout,
        continueOnVisibilityFailure,
        visibilityAnalysisMode,
        startIndex: resumeFromRoute
      });

      const estimatedHours = Math.round((routesToProcess.length / 100) * 2); // ~2 hours per 100 routes
      
      return res.status(202).json({
        success: true,
        message: 'Optimized bulk processing started in background',
        data: {
          totalRoutes: routesToProcess.length,
          processingMode: 'background_enhanced_optimized',
          estimatedCompletion: `${estimatedHours} hours (${Math.round(estimatedHours / 24)} days)`,
          statusEndpoint: '/api/bulk-routes/status',
          configuration: {
            concurrentRoutes: maxConcurrentRoutes,
            batchSize: batchSize,
            dataCollectionMode: dataCollectionMode,
            visibilityAnalysisEnabled: enableAutomaticVisibilityAnalysis,
            allDataFeaturesEnabled: true
          },
          tips: [
            'Monitor progress via the status endpoint',
            'Processing is optimized for stability over 2-3 days',
            'Checkpoints are saved every 100 routes for resume capability',
            'System will automatically manage API rate limits',
            'Memory usage is monitored to prevent crashes'
          ]
        }
      });
    }

    // Foreground processing (not recommended for 5800 routes)
    const processingResults = await processRoutesEnhancedOptimized(
      routesToProcess,
      req.user.id,
      {
        dataFolderPath,
        terrainType,
        dataCollectionMode,
        maxConcurrentRoutes,
        batchSize,
        skipExistingRoutes,
        includeSharpTurns,
        includeBlindSpots,
        includeNetworkCoverage,
        includeEnhancedRoadConditions,
        includeAccidentData,
        includeSeasonalWeather,
        downloadImages,
        generateReports,
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
      message: 'Bulk route processing completed',
      data: processingResults
    });

  } catch (error) {
    console.error('❌ Bulk route processing error:', error);
    
    if (req.file && req.file.path) {
      try {
        await fsPromises.unlink(req.file.path);
      } catch (cleanupError) {
        console.error('File cleanup error:', cleanupError);
      }
    }

    res.status(500).json({
      success: false,
      message: 'Error during bulk route processing',
      error: error.message,
      recommendations: [
        'For 5800 routes, use backgroundProcessing=true',
        'Ensure sufficient disk space (>10GB)',
        'Monitor server resources during processing',
        'Consider processing in smaller chunks if issues persist'
      ]
    });
  }
});

// ============================================================================
// OPTIMIZED PROCESSING FUNCTIONS
// ============================================================================

async function processRoutesEnhancedOptimized(routeEntries, userId, options) {
  const startTime = Date.now();
  const {
    maxConcurrentRoutes,
    batchSize,
  } = options;

  // Initialize processing state
  updateProcessingState(userId, {
    status: 'starting',
    currentRoute: 'Initializing optimized processing...',
    totalRoutes: routeEntries.length,
    completedRoutes: 0,
    failedRoutes: 0,
    startTime: new Date().toISOString(),
    processingMode: 'enhanced_optimized',
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
      totalRecordsCreated: 0
    },
    visibilityAnalysis: {
      enabled: options.enableAutomaticVisibilityAnalysis,
      attempted: 0,
      successful: 0,
      failed: 0,
      totalSharpTurns: 0,
      totalBlindSpots: 0,
      criticalTurns: 0,
      criticalBlindSpots: 0
    }
  });

  const results = {
    totalRoutes: routeEntries.length,
    successful: [],
    failed: [],
    skipped: []
  };

  // Update status to processing
  updateProcessingState(userId, {
    status: 'processing',
    currentRoute: 'Starting optimized route processing...'
  });

  // Process routes in optimized batches
  const batches = [];
  for (let i = 0; i < routeEntries.length; i += batchSize) {
    batches.push({
      routes: routeEntries.slice(i, i + batchSize),
      startIndex: i
    });
  }

  console.log(`📦 Processing ${batches.length} batches of ${batchSize} routes each`);
  console.log(`🚀 Using ${maxConcurrentRoutes} concurrent connections`);

  // Process batches with controlled concurrency
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const batchStartTime = Date.now();
    
    console.log(`\n🔄 Processing Batch ${batchIndex + 1}/${batches.length} (${batch.routes.length} routes)`);
    
    // Update status
    updateProcessingState(userId, {
      currentRoute: `Processing batch ${batchIndex + 1}/${batches.length}`,
      currentBatch: batchIndex + 1,
      totalBatches: batches.length
    });

    // Process routes in parallel within batch
    const batchPromises = [];
    const concurrencyLimit = Math.min(maxConcurrentRoutes, batch.routes.length);
    
    // Use promise pool for controlled concurrency
    for (let i = 0; i < batch.routes.length; i += concurrencyLimit) {
      const chunk = batch.routes.slice(i, i + concurrencyLimit);
      const chunkPromises = chunk.map(async (routeEntry, index) => {
        const globalIndex = batch.startIndex + i + index + 1;
        
        try {
          // Add small delay to prevent API overload
          await new Promise(resolve => setTimeout(resolve, index * 100));
          
          return await processSingleRouteOptimized(
            routeEntry, 
            globalIndex, 
            userId, 
            options
          );
        } catch (error) {
          console.error(`❌ Route ${globalIndex} failed:`, error.message);
          return {
            routeNumber: globalIndex,
            fromCode: routeEntry.fromcode,
            toCode: routeEntry.tocode,
            status: 'failed',
            error: error.message
          };
        }
      });
      
      // Wait for chunk to complete before starting next
      const chunkResults = await Promise.allSettled(chunkPromises);
      batchPromises.push(...chunkResults);
    }

    // Process batch results
    batchPromises.forEach((result, index) => {
      let routeResult;
      
      if (result.status === 'fulfilled') {
        routeResult = result.value;
      } else {
        const routeEntry = batch.routes[index];
        routeResult = {
          routeNumber: batch.startIndex + index + 1,
          fromCode: routeEntry.fromcode,
          toCode: routeEntry.tocode,
          status: 'failed',
          error: result.reason?.message || 'Unknown error'
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

      // Update state after each route
      const currentState = getProcessingState(userId);
      updateProcessingState(userId, {
        completedRoutes: currentState.completedRoutes + 1,
        failedRoutes: routeResult.status === 'failed' ? 
          currentState.failedRoutes + 1 : currentState.failedRoutes
      });
    });

    // Check memory usage
    if (batchIndex % OPTIMIZED_CONFIG.MEMORY_CHECK_INTERVAL === 0) {
      const memUsage = process.memoryUsage();
      const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
      
      if (heapUsedPercent > 85) {
        console.log(`⚠️ High memory usage (${Math.round(heapUsedPercent)}%), triggering garbage collection...`);
        if (global.gc) {
          global.gc();
        }
        // Additional pause for memory recovery
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    const batchTime = Date.now() - batchStartTime;
    console.log(`✅ Batch ${batchIndex + 1} completed in ${Math.round(batchTime / 1000)}s`);
    console.log(`   Success: ${results.successful.length}, Failed: ${results.failed.length}, Skipped: ${results.skipped.length}`);

    // Pause between batches to respect API limits
    if (batchIndex < batches.length - 1) {
      console.log(`⏸️ Pausing ${OPTIMIZED_CONFIG.PAUSE_BETWEEN_BATCHES}ms before next batch...`);
      await new Promise(resolve => setTimeout(resolve, OPTIMIZED_CONFIG.PAUSE_BETWEEN_BATCHES));
    }
  }

  // Calculate final statistics
  const totalProcessingTime = Date.now() - startTime;
  const hours = Math.floor(totalProcessingTime / 1000 / 60 / 60);
  const minutes = Math.floor((totalProcessingTime / 1000 / 60) % 60);
  
  const finalResults = {
    summary: {
      totalProcessingTime: `${hours} hours ${minutes} minutes`,
      totalRoutes: results.totalRoutes,
      successful: results.successful.length,
      failed: results.failed.length,
      skipped: results.skipped.length,
      successRate: Math.round((results.successful.length / results.totalRoutes) * 100),
      averageTimePerRoute: Math.round(totalProcessingTime / results.totalRoutes / 1000) + 's',
      routesPerHour: Math.round(results.totalRoutes / (totalProcessingTime / 1000 / 60 / 60))
    },
    results: {
      successful: results.successful.length,
      failed: results.failed.length,
      skipped: results.skipped.length
    }
  };

  // Update final state
  updateProcessingState(userId, {
    status: 'completed',
    currentRoute: 'Processing completed successfully',
    results: finalResults
  });

  console.log(`\n✅ OPTIMIZED BULK PROCESSING COMPLETED`);
  console.log(`📊 Total time: ${hours}h ${minutes}m`);
  console.log(`📈 Success rate: ${finalResults.summary.successRate}%`);
  console.log(`⚡ Performance: ${finalResults.summary.routesPerHour} routes/hour`);

  return finalResults;
}

// Background processing for large batches
async function processRoutesInBackgroundOptimized(routeEntries, userId, options) {
  console.log(`🔄 Starting optimized background processing for ${routeEntries.length} routes`);
  console.log(`⏱️ Estimated completion: ${Math.round(routeEntries.length / 100 * 2)} hours`);
  
  try {
    const results = await processRoutesEnhancedOptimized(routeEntries, userId, options);
    
    // Save final results
    const resultsFilePath = path.join(
      './downloads/bulk-processing-results', 
      `optimized-results-${Date.now()}.json`
    );
    await fsPromises.mkdir(path.dirname(resultsFilePath), { recursive: true });
    await fsPromises.writeFile(resultsFilePath, JSON.stringify(results, null, 2));
    
    console.log(`✅ Background processing completed. Results saved: ${resultsFilePath}`);
    
    // Send notification (implement as needed)
    // await sendCompletionNotification(userId, results);
    
  } catch (error) {
    console.error('❌ Background processing failed:', error);
    
    updateProcessingState(userId, {
      status: 'failed',
      currentRoute: 'Background processing failed',
      error: error.message
    });
  }
}

// Optimized single route processing
async function processSingleRouteOptimized(routeEntry, routeNumber, userId, options) {
  const startTime = Date.now();
  const result = {
    routeNumber,
    fromCode: routeEntry.fromcode,
    toCode: routeEntry.tocode,
    fromName: routeEntry.fromname,
    toName: routeEntry.toname,
    status: 'failed',
    routeId: null,
    processingTime: 0,
    error: null
  };

  try {
    // Quick check if route exists
    if (options.skipExistingRoutes) {
      const existingRoute = await Route.findOne({
        userId,
        fromCode: routeEntry.fromcode,
        toCode: routeEntry.tocode,
        status: { $ne: 'deleted' }
      }).select('_id routeId');

      if (existingRoute) {
        result.status = 'skipped';
        result.routeId = existingRoute._id;
        result.error = 'Route already exists';
        result.processingTime = Date.now() - startTime;
        
        // Still run visibility analysis if needed
        if (options.enableAutomaticVisibilityAnalysis) {
          await performVisibilityAnalysisOptimized(existingRoute._id, options);
        }
        
        return result;
      }
    }

    // Load GPS data
    const gpsPoints = await loadGPSDataOptimized(options.dataFolderPath, routeEntry);
    
    if (gpsPoints.length < 2) {
      throw new Error(`Insufficient GPS points: ${gpsPoints.length}`);
    }

    // Create route
    const route = await createRouteOptimized(gpsPoints, routeEntry, userId, options.terrainType);
    result.status = 'successful';
    result.routeId = route._id;

    // Run data collection and visibility analysis in parallel
    const [dataCollectionResult, visibilityResult] = await Promise.all([
      // Data collection
      options.dataCollectionMode !== 'none' ? 
        collectEnhancedDataOptimized(route._id, options) : 
        Promise.resolve(null),
      
      // Visibility analysis
      options.enableAutomaticVisibilityAnalysis ? 
        performVisibilityAnalysisOptimized(route._id, options) : 
        Promise.resolve(null)
    ]);

    // Update result with collection data
    if (dataCollectionResult) {
      result.enhancedDataCollected = dataCollectionResult.totalRecords;
    }
    
    if (visibilityResult) {
      result.visibilityAnalyzed = visibilityResult.success;
      result.sharpTurns = visibilityResult.sharpTurns;
      result.blindSpots = visibilityResult.blindSpots;
    }

  } catch (error) {
    result.error = error.message;
    console.error(`Route ${routeNumber} error:`, error.message);
  }

  result.processingTime = Date.now() - startTime;
  return result;
}

// Optimized visibility analysis with timeout handling
async function performVisibilityAnalysisOptimized(routeId, options) {
  const timeout = options.visibilityAnalysisTimeout || OPTIMIZED_CONFIG.VISIBILITY_TIMEOUT;
  
  try {
    const sharpTurnsService = require('../services/sharpTurnsBlindSpotsService');
    
    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Visibility timeout after ${timeout}ms`)), timeout)
    );
    
    // Race between analysis and timeout
    const result = await Promise.race([
      sharpTurnsService.analyzeRoute(routeId),
      timeoutPromise
    ]);
    
    return {
      success: true,
      sharpTurns: result.sharpTurns?.turns?.length || 0,
      blindSpots: result.blindSpots?.spots?.length || 0
    };
    
  } catch (error) {
    console.error(`Visibility analysis error for ${routeId}:`, error.message);
    
    // Continue processing if configured
    if (options.continueOnVisibilityFailure) {
      return {
        success: false,
        error: error.message,
        sharpTurns: 0,
        blindSpots: 0
      };
    }
    
    throw error;
  }
}

// Optimized data collection with parallel API calls
async function collectEnhancedDataOptimized(routeId, options) {
  const collections = [];
  
  // Add collections based on options
  if (options.includeSharpTurns || options.includeBlindSpots) {
    collections.push(
      require('../services/sharpTurnsBlindSpotsService').analyzeRoute(routeId)
        .catch(err => ({ error: err.message, type: 'visibility' }))
    );
  }
  
  if (options.includeNetworkCoverage) {
    collections.push(
      require('../services/networkCoverageService').NetworkCoverageService.analyzeNetworkCoverage(routeId)
        .catch(err => ({ error: err.message, type: 'network' }))
    );
  }
  
  if (options.includeEnhancedRoadConditions) {
    collections.push(
      require('../services/enhancedRoadConditionsService').collectEnhancedRoadConditions(routeId)
        .catch(err => ({ error: err.message, type: 'roadConditions' }))
    );
  }
  
  if (options.includeAccidentData) {
    collections.push(
      Route.findById(routeId).then(route => 
        require('../services/accidentDataService').collectRealAccidentProneAreas(route)
      ).catch(err => ({ error: err.message, type: 'accident' }))
    );
  }
  
  if (options.includeSeasonalWeather) {
    collections.push(
      require('../services/enhancedWeatherService').collectAllSeasonalWeatherData(routeId)
        .catch(err => ({ error: err.message, type: 'weather' }))
    );
  }
  
  // Always include basic data collection
  collections.push(
    require('../services/dataCollectionService').collectAllRouteData(routeId)
      .catch(err => ({ error: err.message, type: 'basic' }))
  );
  
  // Execute all collections with timeout
  const collectionTimeout = options.dataCollectionTimeout || OPTIMIZED_CONFIG.DATA_COLLECTION_TIMEOUT;
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Data collection timeout')), collectionTimeout)
  );
  
  try {
    const results = await Promise.race([
      Promise.allSettled(collections),
      timeoutPromise
    ]);
    
    let totalRecords = 0;
    let successfulCollections = 0;
    
    if (Array.isArray(results)) {
      results.forEach(result => {
        if (result.status === 'fulfilled' && !result.value.error) {
          successfulCollections++;
          // Count records (implementation specific)
          totalRecords += result.value.totalRecords || 1;
        }
      });
    }
    
    return {
      totalRecords,
      successfulCollections,
      totalCollections: collections.length
    };
    
  } catch (error) {
    console.error('Data collection timeout:', error.message);
    return {
      totalRecords: 0,
      successfulCollections: 0,
      error: error.message
    };
  }
}

// Cancel processing endpoint
router.post('/cancel', async (req, res) => {
  try {
    const userId = req.user.id;
    
    console.log('🛑 Cancel processing requested for user:', userId);
    
    updateProcessingState(userId, {
      status: 'cancelled',
      currentRoute: 'Processing cancelled by user'
    });
    
    res.status(200).json({
      success: true,
      message: 'Processing cancellation requested'
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

// Resume from checkpoint
router.post('/resume', async (req, res) => {
  try {
    const userId = req.user.id;
    const { checkpointFile } = req.body;
    
    console.log('🔄 Resume processing requested for user:', userId);
    
    // Load checkpoint
    const checkpointPath = checkpointFile || progressCheckpoints.get(userId);
    if (!checkpointPath) {
      return res.status(404).json({
        success: false,
        message: 'No checkpoint found'
      });
    }
    
    const checkpoint = JSON.parse(await fsPromises.readFile(checkpointPath, 'utf8'));
    
    res.status(200).json({
      success: true,
      message: 'Processing can be resumed',
      data: {
        completedRoutes: checkpoint.completedRoutes,
        totalRoutes: checkpoint.totalRoutes,
        lastUpdate: checkpoint.lastUpdate,
        resumeFrom: checkpoint.completedRoutes
      }
    });
    
  } catch (error) {
    console.error('❌ Resume error:', error);
    res.status(500).json({
      success: false,
      message: 'Error resuming processing',
      error: error.message
    });
  }
});

// Utility functions (reuse existing ones)
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
const highwayDetectionService = require('../services/highwayDetectionService');
  const highwayResults = await highwayDetectionService.detectHighwaysAlongRoute(gpsPoints);
  const majorHighways = highwayResults.majorHighways || [];

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
    majorHighways: majorHighways,
    metadata: {
      uploadSource: 'gps_csv',
      gpsTrackingPoints: gpsPoints.length,
      trackingAccuracy: 'excellent',
      bulkProcessing: true,
      enhancedProcessing: true,
      automaticVisibilityAnalysis: true,
      processingVersion: 'optimized_v2.0'
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

// Get configuration for large scale processing
router.get('/configuration', async (req, res) => {
  try {
    const configuration = {
      optimizedFor5800Routes: {
        maxConcurrentRoutes: OPTIMIZED_CONFIG.MAX_CONCURRENT_ROUTES,
        optimalBatchSize: OPTIMIZED_CONFIG.OPTIMAL_BATCH_SIZE,
        routeTimeout: OPTIMIZED_CONFIG.ROUTE_TIMEOUT,
        visibilityTimeout: OPTIMIZED_CONFIG.VISIBILITY_TIMEOUT,
        estimatedProcessingTime: '48-72 hours',
        recommendedSettings: {
          backgroundProcessing: true,
          dataCollectionMode: 'comprehensive',
          enableAutomaticVisibilityAnalysis: true,
          continueOnVisibilityFailure: true,
          skipExistingRoutes: true
        }
      },
      systemRequirements: {
        minimumRAM: '8GB',
        recommendedRAM: '16GB',
        diskSpace: '20GB',
        cpuCores: '4+',
        networkBandwidth: '10Mbps+'
      },
      apiLimits: {
        googleMaps: '50 requests/second',
        tomtom: '5 requests/second',
        here: '5 requests/second'
      },
      monitoring: {
        statusEndpoint: '/api/bulk-routes/status',
        checkpointInterval: OPTIMIZED_CONFIG.CHECKPOINT_INTERVAL,
        memoryCheckInterval: OPTIMIZED_CONFIG.MEMORY_CHECK_INTERVAL
      }
    };

    res.status(200).json({
      success: true,
      data: configuration
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching configuration',
      error: error.message
    });
  }
});

module.exports = router;