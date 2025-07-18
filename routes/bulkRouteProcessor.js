// File: routes/bulkRouteProcessor.js
// Purpose: Bulk route processing from CSV with automatic GPS data loading and comprehensive data collection
// Upload CSV with route details, automatically find GPS files, create routes, and collect all data

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

// Configure multer for CSV upload
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
// BULK ROUTE PROCESSING ENDPOINT
// ============================================================================

/**
 * Process bulk routes from CSV file
 * POST /api/bulk-routes/process-csv
 * 
 * CSV Format: fromcode,fromname,tocode,toname
 * GPS Files Expected: data/{fromcode}_{tocode}.xls
 */
router.post('/process-csv', upload.single('routesCsvFile'), async (req, res) => {
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
      autoCollectData = true,
      maxConcurrentRoutes = 5,
      skipExistingRoutes = true
    } = req.body;

    console.log(`🚀 Starting BULK route processing from CSV: ${req.file.originalname}`);
    console.log(`📁 Data folder: ${dataFolderPath}`);
    console.log(`⚙️ Settings: terrain=${terrainType}, autoCollect=${autoCollectData}, maxConcurrent=${maxConcurrentRoutes}`);

    // Parse CSV file
    const routeEntries = await parseBulkRoutesCSV(req.file.path);
    console.log(`📊 Found ${routeEntries.length} route entries in CSV`);

    // Initialize processing results
    const processingResults = {
      totalRoutes: routeEntries.length,
      successful: [],
      failed: [],
      skipped: [],
      dataCollection: {
        attempted: 0,
        successful: 0,
        failed: 0
      },
      summary: {},
      startTime: Date.now()
    };

    // Process routes in batches to avoid overwhelming the system
    const batchSize = parseInt(maxConcurrentRoutes);
    const batches = [];
    
    for (let i = 0; i < routeEntries.length; i += batchSize) {
      batches.push(routeEntries.slice(i, i + batchSize));
    }

    console.log(`📦 Processing ${batches.length} batches of ${batchSize} routes each`);

    // Process each batch
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`\n🔄 Processing Batch ${batchIndex + 1}/${batches.length} (${batch.length} routes)`);

      // Process routes in current batch concurrently
      const batchPromises = batch.map(async (routeEntry, index) => {
        const globalIndex = batchIndex * batchSize + index + 1;
        return await processSingleRoute(
          routeEntry, 
          globalIndex, 
          req.user.id, 
          dataFolderPath, 
          terrainType, 
          autoCollectData,
          skipExistingRoutes
        );
      });

      // Wait for batch to complete
      const batchResults = await Promise.allSettled(batchPromises);

      // Collect results from batch
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          const routeResult = result.value;
          
          if (routeResult.status === 'successful') {
            processingResults.successful.push(routeResult);
          } else if (routeResult.status === 'skipped') {
            processingResults.skipped.push(routeResult);
          } else {
            processingResults.failed.push(routeResult);
          }

          // Track data collection attempts
          if (routeResult.dataCollectionAttempted) {
            processingResults.dataCollection.attempted++;
            if (routeResult.dataCollectionSuccessful) {
              processingResults.dataCollection.successful++;
              
              // Aggregate collection counts
              if (routeResult.collectionCounts) {
                const counts = routeResult.collectionCounts;
                processingResults.dataCollection.collectionBreakdown.emergencyServices += counts.emergencyServices || 0;
                processingResults.dataCollection.collectionBreakdown.weatherConditions += counts.weatherConditions || 0;
                processingResults.dataCollection.collectionBreakdown.trafficData += counts.trafficData || 0;
                processingResults.dataCollection.collectionBreakdown.accidentProneAreas += counts.accidentProneAreas || 0;
                processingResults.dataCollection.collectionBreakdown.roadConditions += counts.roadConditions || 0;
                processingResults.dataCollection.collectionBreakdown.sharpTurns += counts.sharpTurns || 0;
                processingResults.dataCollection.collectionBreakdown.blindSpots += counts.blindSpots || 0;
                processingResults.dataCollection.collectionBreakdown.networkCoverage += counts.networkCoverage || 0;
                processingResults.dataCollection.collectionBreakdown.seasonalWeatherData += counts.seasonalWeatherData || 0;
                
                // Calculate total records
                processingResults.dataCollection.totalRecordsCreated += Object.values(counts).reduce((sum, count) => sum + (count || 0), 0);
              }
            } else {
              processingResults.dataCollection.failed++;
            }
          }
        } else {
          const routeEntry = batch[index];
          processingResults.failed.push({
            routeNumber: batchIndex * batchSize + index + 1,
            fromCode: routeEntry.fromcode,
            toCode: routeEntry.tocode,
            status: 'failed',
            error: result.reason?.message || 'Unknown batch processing error',
            processingTime: 0
          });
        }
      });

      // Brief pause between batches to prevent system overload
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Generate comprehensive summary
    const totalProcessingTime = Date.now() - processingResults.startTime;
    
    processingResults.summary = {
      totalProcessingTime: `${(totalProcessingTime / 1000).toFixed(2)}s`,
      averageTimePerRoute: processingResults.successful.length > 0 ? 
        `${(totalProcessingTime / (processingResults.successful.length * 1000)).toFixed(2)}s` : '0s',
      successRate: Math.round((processingResults.successful.length / processingResults.totalRoutes) * 100),
      dataCollectionRate: processingResults.dataCollection.attempted > 0 ? 
        Math.round((processingResults.dataCollection.successful / processingResults.dataCollection.attempted) * 100) : 0,
      routesCreated: processingResults.successful.length,
      routesSkipped: processingResults.skipped.length,
      routesFailed: processingResults.failed.length,
      totalDataRecordsCreated: processingResults.dataCollection.totalRecordsCreated,
      completedAt: new Date().toISOString()
    };

    // Clean up uploaded file
    await fsPromises.unlink(req.file.path);

    // Save detailed results to file
    const resultsFilePath = path.join('./downloads', 'bulk-processing-results', `bulk-results-${Date.now()}.json`);
    await fsPromises.mkdir(path.dirname(resultsFilePath), { recursive: true });
    await fsPromises.writeFile(resultsFilePath, JSON.stringify({
      ...processingResults,
      settings: {
        dataFolderPath,
        terrainType,
        autoCollectData,
        maxConcurrentRoutes,
        skipExistingRoutes
      }
    }, null, 2));

    console.log(`\n✅ BULK PROCESSING COMPLETED`);
    console.log(`📊 Results: ${processingResults.successful.length} successful, ${processingResults.skipped.length} skipped, ${processingResults.failed.length} failed`);
    console.log(`⏱️ Total time: ${(totalProcessingTime / 1000).toFixed(2)}s`);
    console.log(`💾 Detailed results saved: ${resultsFilePath}`);
    
    // Display MongoDB Collections Summary Table
    if (processingResults.dataCollection.totalRecordsCreated > 0) {
      console.log(`\n📊 MONGODB COLLECTIONS SUMMARY TABLE`);
      console.log(`┌─────────────────────────────┬──────────┐`);
      console.log(`│ Collection                  │ Records  │`);
      console.log(`├─────────────────────────────┼──────────┤`);
      console.log(`│ Emergency Services          │ ${String(processingResults.dataCollection.collectionBreakdown.emergencyServices).padStart(8)} │`);
      console.log(`│ Weather Conditions          │ ${String(processingResults.dataCollection.collectionBreakdown.weatherConditions).padStart(8)} │`);
      console.log(`│ Traffic Data                │ ${String(processingResults.dataCollection.collectionBreakdown.trafficData).padStart(8)} │`);
      console.log(`│ Accident Prone Areas        │ ${String(processingResults.dataCollection.collectionBreakdown.accidentProneAreas).padStart(8)} │`);
      console.log(`│ Road Conditions             │ ${String(processingResults.dataCollection.collectionBreakdown.roadConditions).padStart(8)} │`);
      console.log(`│ Sharp Turns                 │ ${String(processingResults.dataCollection.collectionBreakdown.sharpTurns).padStart(8)} │`);
      console.log(`│ Blind Spots                 │ ${String(processingResults.dataCollection.collectionBreakdown.blindSpots).padStart(8)} │`);
      console.log(`│ Network Coverage            │ ${String(processingResults.dataCollection.collectionBreakdown.networkCoverage).padStart(8)} │`);
      console.log(`│ Seasonal Weather Data       │ ${String(processingResults.dataCollection.collectionBreakdown.seasonalWeatherData).padStart(8)} │`);
      console.log(`├─────────────────────────────┼──────────┤`);
      console.log(`│ TOTAL RECORDS CREATED       │ ${String(processingResults.dataCollection.totalRecordsCreated).padStart(8)} │`);
      console.log(`└─────────────────────────────┴──────────┘`);
    }

    res.status(200).json({
      success: true,
      message: 'Bulk route processing completed successfully',
      data: {
        summary: processingResults.summary,
        results: {
          successful: processingResults.successful.length,
          skipped: processingResults.skipped.length,
          failed: processingResults.failed.length,
          dataCollectionStats: processingResults.dataCollection
        },
        mongodbCollectionsSummary: {
          totalRecordsCreated: processingResults.dataCollection.totalRecordsCreated,
          breakdown: processingResults.dataCollection.collectionBreakdown,
          dataCollectionEnabled: autoCollectData,
          routesWithData: processingResults.dataCollection.successful,
          recordsPerRoute: processingResults.dataCollection.successful > 0 ? 
            Math.round(processingResults.dataCollection.totalRecordsCreated / processingResults.dataCollection.successful) : 0,
          debugInfo: {
            dataCollectionAttempted: processingResults.dataCollection.attempted,
            dataCollectionSuccessful: processingResults.dataCollection.successful,
            dataCollectionFailed: processingResults.dataCollection.failed,
            debugNote: processingResults.dataCollection.totalRecordsCreated === 0 && processingResults.dataCollection.attempted > 0 ? 
              "Data collection was attempted but no records were found. Use debug endpoint to investigate." : null
          }
        },
        detailedResults: {
          successful: processingResults.successful.slice(0, 10), // First 10 for brevity
          failed: processingResults.failed.slice(0, 10),
          skipped: processingResults.skipped.slice(0, 5)
        },
        files: {
          resultsFile: resultsFilePath,
          downloadUrl: `/downloads/bulk-processing-results/${path.basename(resultsFilePath)}`
        },
        nextSteps: [
          `${processingResults.successful.length} routes created and ready for use`,
          autoCollectData ? `${processingResults.dataCollection.successful} routes have comprehensive data collected` : 'Data collection was disabled',
          autoCollectData && processingResults.dataCollection.totalRecordsCreated > 0 ? 
            `${processingResults.dataCollection.totalRecordsCreated} total records created across ${Object.keys(processingResults.dataCollection.collectionBreakdown).length} MongoDB collections` : '',
          processingResults.failed.length > 0 ? `Review ${processingResults.failed.length} failed routes in detailed results` : 'All routes processed successfully',
          'Use individual route endpoints for detailed analysis',
          'Access created routes via /api/routes endpoint',
          autoCollectData ? 'MongoDB collections are now populated with comprehensive safety data' : ''
        ].filter(step => step !== '') // Remove empty steps
      }
    });

  } catch (error) {
    console.error('❌ Bulk route processing error:', error);
    
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
      message: 'Error during bulk route processing',
      error: error.message,
      troubleshooting: [
        'Ensure CSV file has correct format: fromcode,fromname,tocode,toname',
        'Verify data folder path contains GPS files in format: {fromcode}_{tocode}.xls',
        'Check that GPS Excel files contain Latitude,Longitude columns',
        'Reduce maxConcurrentRoutes if system is overloaded',
        'Ensure sufficient disk space for processing and data storage'
      ]
    });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse CSV file containing bulk route entries
 */
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
          // Validate required fields
          if (!data.fromcode || !data.fromname || !data.tocode || !data.toname) {
            errors.push(`Missing required fields: ${JSON.stringify(data)}`);
            return;
          }

          // Clean and validate data
          const route = {
            fromcode: data.fromcode.toString().trim(),
            fromname: data.fromname.toString().trim(),
            tocode: data.tocode.toString().trim(),
            toname: data.toname.toString().trim()
          };

          // Skip if essential data is empty
          if (!route.fromcode || !route.tocode) {
            errors.push(`Empty from/to codes: ${JSON.stringify(route)}`);
            return;
          }

          routes.push(route);

        } catch (parseError) {
          errors.push(`Parse error: ${parseError.message} for data: ${JSON.stringify(data)}`);
        }
      })
      .on('end', () => {
        if (errors.length > 0) {
          console.warn(`⚠️ CSV parsing warnings: ${errors.length} entries had issues`);
          errors.slice(0, 5).forEach(error => console.warn(`   ${error}`));
        }
        
        console.log(`✅ CSV parsed successfully: ${routes.length} valid routes found`);
        resolve(routes);
      })
      .on('error', (error) => {
        console.error('❌ CSV parsing error:', error);
        reject(error);
      });
  });
}

/**
 * Process a single route entry
 */
async function processSingleRoute(routeEntry, routeNumber, userId, dataFolderPath, terrainType, autoCollectData, skipExistingRoutes) {
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
    dataCollectionAttempted: false,
    dataCollectionSuccessful: false,
    processingTime: 0,
    error: null
  };

  try {
    console.log(`  📍 Route ${routeNumber}: ${routeEntry.fromcode} → ${routeEntry.tocode}`);

    // Check if route already exists (optional)
    if (skipExistingRoutes) {
      const existingRoute = await Route.findOne({
        userId,
        fromCode: routeEntry.fromcode,
        toCode: routeEntry.tocode,
        status: { $ne: 'deleted' }
      });

      if (existingRoute) {
        result.status = 'skipped';
        result.routeId = existingRoute.routeId;
        result.error = 'Route already exists';
        result.processingTime = Date.now() - startTime;
        console.log(`    ⏭️ Skipped: Route already exists (${existingRoute.routeId})`);
        return result;
      }
    }

    // Find and load GPS data - check for both .xls and .xlsx formats
    let gpsFilePath = path.join(dataFolderPath, `${routeEntry.fromcode}_${routeEntry.tocode}.xlsx`);
    let fileExists = false;
    
    try {
      await fsPromises.access(gpsFilePath);
      fileExists = true;
    } catch (error) {
      // Try .xls format if .xlsx not found
      gpsFilePath = path.join(dataFolderPath, `${routeEntry.fromcode}_${routeEntry.tocode}.xls`);
      try {
        await fsPromises.access(gpsFilePath);
        fileExists = true;
      } catch (error2) {
        throw new Error(`GPS file not found: ${routeEntry.fromcode}_${routeEntry.tocode}.xlsx or ${routeEntry.fromcode}_${routeEntry.tocode}.xls in ${dataFolderPath}`);
      }
    }

    // Parse GPS Excel file
    const gpsPoints = await parseGPSExcelFile(gpsFilePath);
    
    if (gpsPoints.length < 2) {
      throw new Error(`Insufficient GPS points: ${gpsPoints.length} (minimum 2 required)`);
    }

    result.gpsPoints = gpsPoints.length;
    console.log(`    📊 Loaded ${gpsPoints.length} GPS points from ${path.basename(gpsFilePath)}`);

    // Calculate route details
    const routeDetails = calculateRouteDetails(gpsPoints, routeEntry);

    // Create route in database
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
      majorHighways: [],
      metadata: {
        uploadSource: 'gps_csv',
        originalFileName: `${routeEntry.fromcode}_${routeEntry.tocode}.xlsx`,
        processingNotes: [
          `Bulk processed from CSV`,
          `GPS data from: ${gpsFilePath}`,
          `${gpsPoints.length} GPS tracking points`,
          `Route ${routeNumber} of batch processing`,
          `Bulk CSV processing session`
        ],
        gpsTrackingPoints: gpsPoints.length,
        trackingAccuracy: 'excellent',
        bulkProcessing: true
      }
    });

    // Generate live map link
    route.generateLiveMapLink();

    // Save route
    await route.save();
    
    result.status = 'successful';
    result.routeId = route.routeId;
    
    console.log(`    ✅ Route created: ${route.routeId}`);

    // Automatic data collection if enabled
    if (autoCollectData) {
      result.dataCollectionAttempted = true;
      
      try {
        console.log(`    🔄 Starting comprehensive data collection for ${route.routeId}`);
        
        // Use enhanced data collection service with counting
        const collectionCounts = await collectAllRouteDataBulk(route._id);
        
        // Check if we actually got some data
        const totalRecords = Object.values(collectionCounts).reduce((sum, count) => sum + count, 0);
        
        if (totalRecords > 0) {
          result.dataCollectionSuccessful = true;
          result.collectionCounts = collectionCounts;
          console.log(`    ✅ Data collection completed for ${route.routeId}`);
          console.log(`       📊 Total records created: ${totalRecords}`);
          console.log(`       📋 Breakdown: Emergency(${collectionCounts.emergencyServices}) Weather(${collectionCounts.weatherConditions}) Traffic(${collectionCounts.trafficData}) Accidents(${collectionCounts.accidentProneAreas}) Roads(${collectionCounts.roadConditions}) Turns(${collectionCounts.sharpTurns}) Spots(${collectionCounts.blindSpots}) Network(${collectionCounts.networkCoverage})`);
        } else {
          // Data collection completed but no records found
          result.dataCollectionSuccessful = false;
          result.collectionCounts = collectionCounts;
          result.dataCollectionNote = "Data collection completed but no records were created in MongoDB collections";
          console.log(`    ⚠️ Data collection completed but no records found in collections for ${route.routeId}`);
        }
        
      } catch (dataError) {
        console.error(`    ❌ Data collection failed for ${route.routeId}:`, dataError.message);
        result.dataCollectionSuccessful = false;
        result.collectionCounts = null;
        result.dataCollectionError = dataError.message;
        // Don't fail the entire route creation for data collection errors
      }
    }

  } catch (error) {
    result.error = error.message;
    console.error(`    ❌ Route ${routeNumber} failed:`, error.message);
  }

  result.processingTime = Date.now() - startTime;
  return result;
}

/**
 * Parse GPS data from Excel file
 */
async function parseGPSExcelFile(filePath) {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0]; // Use first sheet
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    if (data.length < 2) {
      throw new Error('Excel file contains insufficient data');
    }

    // Find header row and identify Latitude/Longitude columns
    let headerRowIndex = -1;
    let latCol = -1;
    let lonCol = -1;

    for (let i = 0; i < Math.min(5, data.length); i++) {
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
      throw new Error('Could not find Latitude/Longitude columns in Excel file');
    }

    // Extract GPS points
    const gpsPoints = [];
    for (let i = headerRowIndex + 1; i < data.length; i++) {
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

/**
 * Calculate route details from GPS points
 */
function calculateRouteDetails(gpsPoints, routeEntry) {
  // Simple distance calculation function
  function calculateDistance(coord1, coord2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (coord2.latitude - coord1.latitude) * Math.PI / 180;
    const dLon = (coord2.longitude - coord1.longitude) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(coord1.latitude * Math.PI / 180) * Math.cos(coord2.latitude * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  // Calculate total distance and prepare route points
  let totalDistance = 0;
  const routePoints = [];

  for (let i = 0; i < gpsPoints.length; i++) {
    if (i > 0) {
      totalDistance += calculateDistance(gpsPoints[i-1], gpsPoints[i]);
    }

    routePoints.push({
      latitude: gpsPoints[i].latitude,
      longitude: gpsPoints[i].longitude,
      pointOrder: i,
      distanceFromStart: totalDistance,
      distanceToEnd: 0, // Will be calculated after total distance is known
      elevation: null
    });
  }

  // Update distanceToEnd for all points
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
    estimatedDuration: Math.round(totalDistance * 1.5), // Rough estimate
    routePoints
  };
}

/**
 * Enhanced data collection for bulk processing with detailed tracking
 */
async function collectAllRouteDataBulk(routeId) {
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

  try {
    console.log(`    🔄 Starting comprehensive data collection...`);
    
    // Use existing data collection service with error handling
    const dataCollectionService = require('../services/dataCollectionService');
    
    // Call the existing comprehensive data collection but with timeout
    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Data collection timeout after 180 seconds')), 180000) // 3 minute timeout
    );
    
    const dataCollection = dataCollectionService.collectAllRouteData(routeId);
    
    await Promise.race([dataCollection, timeout]);
    
    console.log(`    ✅ Data collection service completed successfully`);
    
    // Count records created in each collection AFTER data collection completes
    console.log(`    📊 Counting records in MongoDB collections...`);
    
    try {
      const EmergencyService = require('../models/EmergencyService');
      const WeatherCondition = require('../models/WeatherCondition');
      const TrafficData = require('../models/TrafficData');
      const AccidentProneArea = require('../models/AccidentProneArea');
      const RoadCondition = require('../models/RoadCondition');
      const SharpTurn = require('../models/SharpTurn');
      const BlindSpot = require('../models/BlindSpot');
      const NetworkCoverage = require('../models/NetworkCoverage');
      
      // Count records for this route with a small delay to ensure all data is saved
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
      
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
        EmergencyService.countDocuments({ routeId }),
        WeatherCondition.countDocuments({ routeId }),
        TrafficData.countDocuments({ routeId }),
        AccidentProneArea.countDocuments({ routeId }),
        RoadCondition.countDocuments({ routeId }),
        SharpTurn.countDocuments({ routeId }),
        BlindSpot.countDocuments({ routeId }),
        NetworkCoverage.countDocuments({ routeId })
      ]);

      collectionCounts.emergencyServices = emergencyCount;
      collectionCounts.weatherConditions = weatherCount;
      collectionCounts.trafficData = trafficCount;
      collectionCounts.accidentProneAreas = accidentCount;
      collectionCounts.roadConditions = roadCount;
      collectionCounts.sharpTurns = sharpTurnCount;
      collectionCounts.blindSpots = blindSpotCount;
      collectionCounts.networkCoverage = networkCount;
      // Note: seasonalWeatherData might be in WeatherCondition or separate collection

      const totalRecords = Object.values(collectionCounts).reduce((sum, count) => sum + count, 0);
      console.log(`    📊 Records counted: ${totalRecords} total across ${Object.keys(collectionCounts).length} collections`);
      
      if (totalRecords === 0) {
        console.warn(`    ⚠️ Warning: No records found in collections, but data collection appeared to complete`);
      }

    } catch (countError) {
      console.error(`    ❌ Error counting records:`, countError.message);
    }

    return collectionCounts;
    
  } catch (error) {
    console.error(`    ❌ Data collection failed for route ${routeId}:`, error.message);
    throw error; // Re-throw to track the failure
  }
}

// ============================================================================
// STATUS AND MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * Get bulk processing status
 * GET /api/bulk-routes/status
 */
router.get('/status', async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get recent bulk processing results
    const resultsDir = './downloads/bulk-processing-results';
    let recentResults = [];
    
    try {
      const files = await fsPromises.readdir(resultsDir);
      const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse().slice(0, 5);
      
      for (const file of jsonFiles) {
        try {
          const content = await fsPromises.readFile(path.join(resultsDir, file), 'utf8');
          const data = JSON.parse(content);
          recentResults.push({
            file: file,
            timestamp: data.summary?.completedAt || 'Unknown',
            totalRoutes: data.totalRoutes || 0,
            successful: data.successful?.length || 0,
            failed: data.failed?.length || 0,
            skipped: data.skipped?.length || 0,
            successRate: data.summary?.successRate || 0
          });
        } catch (parseError) {
          console.warn(`Could not parse results file ${file}:`, parseError.message);
        }
      }
    } catch (dirError) {
      // Results directory doesn't exist yet
    }

    // Get user's route statistics
    const totalRoutes = await Route.countDocuments({ 
      userId, 
      status: { $ne: 'deleted' } 
    });
    
    const routesFromBulk = await Route.countDocuments({
      userId,
      'metadata.bulkProcessing': true,
      status: { $ne: 'deleted' }
    });

    res.status(200).json({
      success: true,
      data: {
        userStatistics: {
          totalRoutes,
          routesFromBulkProcessing: routesFromBulk,
          bulkProcessingPercentage: totalRoutes > 0 ? 
            Math.round((routesFromBulk / totalRoutes) * 100) : 0
        },
        recentBulkProcessing: recentResults,
        capabilities: {
          maxConcurrentRoutes: 10,
          supportedFileTypes: ['CSV', 'TXT'],
          maxFileSize: '10MB',
          dataCollectionAvailable: true,
          gpsFileFormats: ['Excel (.xls, .xlsx)'],
          gpsFileNaming: '{fromcode}_{tocode}.xlsx or {fromcode}_{tocode}.xls'
        },
        usage: {
          csvFormat: 'fromcode,fromname,tocode,toname',
          gpsFileNaming: '{fromcode}_{tocode}.xlsx or {fromcode}_{tocode}.xls',
          requiredColumns: ['Latitude', 'Longitude'],
          dataFolder: './data'
        }
      }
    });

  } catch (error) {
    console.error('Bulk processing status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching bulk processing status',
      error: error.message
    });
  }
});

/**
 * Get detailed results from a specific bulk processing session
 * GET /api/bulk-routes/results/:filename
 */
router.get('/results/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join('./downloads/bulk-processing-results', filename);
    
    try {
      const content = await fsPromises.readFile(filePath, 'utf8');
      const results = JSON.parse(content);
      
      res.status(200).json({
        success: true,
        data: results
      });
      
    } catch (error) {
      res.status(404).json({
        success: false,
        message: 'Results file not found',
        error: error.message
      });
    }

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching results',
      error: error.message
    });
  }
});

/**
 * Debug endpoint to check collection counts for a specific route
 * GET /api/bulk-routes/debug-collections/:routeId
 */
router.get('/debug-collections/:routeId', async (req, res) => {
  try {
    const { routeId } = req.params;
    
    // Verify route ownership
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

    // Count all collections
    const EmergencyService = require('../models/EmergencyService');
    const WeatherCondition = require('../models/WeatherCondition');
    const TrafficData = require('../models/TrafficData');
    const AccidentProneArea = require('../models/AccidentProneArea');
    const RoadCondition = require('../models/RoadCondition');
    const SharpTurn = require('../models/SharpTurn');
    const BlindSpot = require('../models/BlindSpot');
    const NetworkCoverage = require('../models/NetworkCoverage');

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
      EmergencyService.countDocuments({ routeId }),
      WeatherCondition.countDocuments({ routeId }),
      TrafficData.countDocuments({ routeId }),
      AccidentProneArea.countDocuments({ routeId }),
      RoadCondition.countDocuments({ routeId }),
      SharpTurn.countDocuments({ routeId }),
      BlindSpot.countDocuments({ routeId }),
      NetworkCoverage.countDocuments({ routeId })
    ]);

    const collectionCounts = {
      emergencyServices: emergencyCount,
      weatherConditions: weatherCount,
      trafficData: trafficCount,
      accidentProneAreas: accidentCount,
      roadConditions: roadCount,
      sharpTurns: sharpTurnCount,
      blindSpots: blindSpotCount,
      networkCoverage: networkCount
    };

    const totalRecords = Object.values(collectionCounts).reduce((sum, count) => sum + count, 0);

    res.status(200).json({
      success: true,
      data: {
        routeInfo: {
          routeId: route.routeId,
          routeName: route.routeName,
          _id: route._id
        },
        collectionCounts,
        totalRecords,
        isEmpty: totalRecords === 0
      }
    });

  } catch (error) {
    console.error('Debug collections error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking collections',
      error: error.message
    });
  }
});

module.exports = router;