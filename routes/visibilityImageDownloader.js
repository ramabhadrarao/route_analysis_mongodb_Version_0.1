// File: routes/visibilityImageDownloader.js
// Purpose: Download images for BOTH sharp turns AND blind spots with database updates
// Enhanced version supporting all visibility hazards

const express = require('express');
const { auth } = require('../middleware/auth');
const Route = require('../models/Route');
const SharpTurn = require('../models/SharpTurn');
const BlindSpot = require('../models/BlindSpot');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

const router = express.Router();
router.use(auth);

// ============================================================================
// COMPREHENSIVE VISIBILITY IMAGE DOWNLOAD
// ============================================================================

/**
 * Download ALL visibility images (Sharp Turns + Blind Spots) for a route
 * POST /api/visibility-images/routes/:routeId/download-all-images
 */
router.post('/routes/:routeId/download-all-images', async (req, res) => {
  try {
    const { routeId } = req.params;
    const { 
      imageTypes = ['street_view', 'satellite', 'roadmap'], 
      quality = 'high', 
      updateDatabase = true,
      includeSharpTurns = true,
      includeBlindSpots = true,
      riskThreshold = 0 // Download images for all risk levels by default
    } = req.body;
    
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

    console.log(`📸 Starting COMPREHENSIVE visibility image download for route: ${route.routeId}`);
    console.log(`🎯 Sharp Turns: ${includeSharpTurns}, Blind Spots: ${includeBlindSpots}`);
    console.log(`⚡ Risk Threshold: ≥ ${riskThreshold}, Database Updates: ${updateDatabase}`);

    // Create download directory
    const downloadDir = path.join('./downloads', 'visibility-images', route.routeId);
    await fs.mkdir(downloadDir, { recursive: true });

    const downloadResults = {
      sharpTurns: { processed: 0, successful: 0, failed: 0, errors: [] },
      blindSpots: { processed: 0, successful: 0, failed: 0, errors: [] },
      databaseUpdates: { successful: 0, failed: 0, errors: [] },
      summary: {}
    };

    // =================================================================
    // SHARP TURNS IMAGE DOWNLOAD
    // =================================================================
    if (includeSharpTurns) {
      console.log('📍 Processing Sharp Turns...');
      
      const sharpTurns = await SharpTurn.find({ 
        routeId,
        riskScore: { $gte: riskThreshold }
      }).sort({ distanceFromStartKm: 1 });

      downloadResults.sharpTurns.processed = sharpTurns.length;
      console.log(`   Found ${sharpTurns.length} sharp turns (risk ≥ ${riskThreshold})`);

      for (let i = 0; i < sharpTurns.length; i++) {
        const turn = sharpTurns[i];
        
        try {
          console.log(`   📸 Turn ${i + 1}/${sharpTurns.length}: ${turn.turnSeverity} (Risk: ${turn.riskScore})`);
          
          // Download images for this turn
          const turnImages = await downloadSharpTurnImages(
            turn, 
            downloadDir, 
            imageTypes, 
            quality,
            i + 1
          );
          
          // Update database if requested
          if (updateDatabase && (turnImages.streetView || turnImages.satellite || turnImages.roadmap)) {
            try {
              await updateSharpTurnWithImages(turn._id, turnImages);
              downloadResults.databaseUpdates.successful++;
            } catch (dbError) {
              downloadResults.databaseUpdates.failed++;
              downloadResults.databaseUpdates.errors.push({
                type: 'sharp_turn',
                id: turn._id,
                error: dbError.message
              });
            }
          }
          
          downloadResults.sharpTurns.successful++;
          
        } catch (error) {
          console.error(`   ❌ Turn ${i + 1} failed:`, error.message);
          downloadResults.sharpTurns.failed++;
          downloadResults.sharpTurns.errors.push({
            turnId: turn._id,
            turnNumber: i + 1,
            coordinates: { latitude: turn.latitude, longitude: turn.longitude },
            error: error.message
          });
        }
      }
    }

    // =================================================================
    // BLIND SPOTS IMAGE DOWNLOAD
    // =================================================================
    if (includeBlindSpots) {
      console.log('🔍 Processing Blind Spots...');
      
      const blindSpots = await BlindSpot.find({ 
        routeId,
        riskScore: { $gte: riskThreshold }
      }).sort({ distanceFromStartKm: 1 });

      downloadResults.blindSpots.processed = blindSpots.length;
      console.log(`   Found ${blindSpots.length} blind spots (risk ≥ ${riskThreshold})`);

      for (let i = 0; i < blindSpots.length; i++) {
        const spot = blindSpots[i];
        
        try {
          console.log(`   🔍 Spot ${i + 1}/${blindSpots.length}: ${spot.spotType} (Risk: ${spot.riskScore})`);
          
          // Download images for this blind spot
          const spotImages = await downloadBlindSpotImages(
            spot, 
            downloadDir, 
            imageTypes, 
            quality,
            i + 1
          );
          
          // Update database if requested
          if (updateDatabase && (spotImages.streetView || spotImages.satellite || spotImages.roadmap)) {
            try {
              await updateBlindSpotWithImages(spot._id, spotImages);
              downloadResults.databaseUpdates.successful++;
            } catch (dbError) {
              downloadResults.databaseUpdates.failed++;
              downloadResults.databaseUpdates.errors.push({
                type: 'blind_spot',
                id: spot._id,
                error: dbError.message
              });
            }
          }
          
          downloadResults.blindSpots.successful++;
          
        } catch (error) {
          console.error(`   ❌ Spot ${i + 1} failed:`, error.message);
          downloadResults.blindSpots.failed++;
          downloadResults.blindSpots.errors.push({
            spotId: spot._id,
            spotNumber: i + 1,
            coordinates: { latitude: spot.latitude, longitude: spot.longitude },
            error: error.message
          });
        }
      }
    }

    // =================================================================
    // GENERATE COMPREHENSIVE SUMMARY
    // =================================================================
    const totalProcessed = downloadResults.sharpTurns.processed + downloadResults.blindSpots.processed;
    const totalSuccessful = downloadResults.sharpTurns.successful + downloadResults.blindSpots.successful;
    const totalFailed = downloadResults.sharpTurns.failed + downloadResults.blindSpots.failed;

    downloadResults.summary = {
      route: {
        routeId: route.routeId,
        routeName: route.routeName,
        fromName: route.fromName,
        toName: route.toName
      },
      processing: {
        totalVisibilityPoints: totalProcessed,
        successfulDownloads: totalSuccessful,
        failedDownloads: totalFailed,
        successRate: totalProcessed > 0 ? Math.round((totalSuccessful / totalProcessed) * 100) : 0
      },
      breakdown: {
        sharpTurns: {
          found: downloadResults.sharpTurns.processed,
          downloaded: downloadResults.sharpTurns.successful,
          failed: downloadResults.sharpTurns.failed
        },
        blindSpots: {
          found: downloadResults.blindSpots.processed,
          downloaded: downloadResults.blindSpots.successful,
          failed: downloadResults.blindSpots.failed
        }
      },
      databaseUpdates: updateDatabase ? {
        enabled: true,
        successful: downloadResults.databaseUpdates.successful,
        failed: downloadResults.databaseUpdates.failed,
        updateRate: totalSuccessful > 0 ? 
          Math.round((downloadResults.databaseUpdates.successful / totalSuccessful) * 100) : 0
      } : { enabled: false },
      settings: {
        imageTypes,
        quality,
        riskThreshold,
        includeSharpTurns,
        includeBlindSpots
      },
      paths: {
        downloadDirectory: downloadDir,
        summaryReport: path.join(downloadDir, 'visibility_download_summary.json')
      },
      timestamp: new Date().toISOString()
    };

    // Save comprehensive summary report
    await fs.writeFile(
      downloadResults.summary.paths.summaryReport,
      JSON.stringify({
        ...downloadResults.summary,
        detailedResults: downloadResults
      }, null, 2)
    );

    console.log(`✅ COMPREHENSIVE visibility image download completed`);
    console.log(`   📊 Sharp Turns: ${downloadResults.sharpTurns.successful}/${downloadResults.sharpTurns.processed}`);
    console.log(`   🔍 Blind Spots: ${downloadResults.blindSpots.successful}/${downloadResults.blindSpots.processed}`);
    console.log(`   💾 Database Updates: ${downloadResults.databaseUpdates.successful}/${downloadResults.databaseUpdates.successful + downloadResults.databaseUpdates.failed}`);

    res.status(200).json({
      success: true,
      message: 'Comprehensive visibility images downloaded successfully',
      data: downloadResults.summary,
      detailedResults: downloadResults
    });

  } catch (error) {
    console.error('Comprehensive visibility image download error:', error);
    res.status(500).json({
      success: false,
      message: 'Error during comprehensive visibility image download',
      error: error.message,
      troubleshooting: [
        'Ensure Google Maps API key is configured (GOOGLE_MAPS_API_KEY)',
        'Check sufficient disk space for image storage',
        'Verify route contains visibility analysis data',
        'Try reducing image quality or number of points if timeouts occur'
      ]
    });
  }
});

// ============================================================================
// INDIVIDUAL TYPE DOWNLOADS
// ============================================================================

/**
 * Download images for Sharp Turns only
 * POST /api/visibility-images/routes/:routeId/download-sharp-turns
 */
router.post('/routes/:routeId/download-sharp-turns', async (req, res) => {
  try {
    const { routeId } = req.params;
    const { imageTypes = ['street_view', 'satellite'], quality = 'high', riskThreshold = 0 } = req.body;
    
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

    const sharpTurns = await SharpTurn.find({ 
      routeId,
      riskScore: { $gte: riskThreshold }
    }).sort({ distanceFromStartKm: 1 });

    if (sharpTurns.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No sharp turns found with risk score ≥ ${riskThreshold}`
      });
    }

    console.log(`📍 Downloading images for ${sharpTurns.length} sharp turns`);

    const downloadDir = path.join('./downloads', 'visibility-images', route.routeId, 'sharp-turns');
    await fs.mkdir(downloadDir, { recursive: true });

    const results = { successful: 0, failed: 0, errors: [] };

    for (let i = 0; i < sharpTurns.length; i++) {
      const turn = sharpTurns[i];
      
      try {
        await downloadSharpTurnImages(turn, downloadDir, imageTypes, quality, i + 1);
        results.successful++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          turnId: turn._id,
          error: error.message
        });
      }
    }

    res.status(200).json({
      success: true,
      message: 'Sharp turn images downloaded successfully',
      data: {
        total: sharpTurns.length,
        successful: results.successful,
        failed: results.failed,
        successRate: Math.round((results.successful / sharpTurns.length) * 100),
        downloadPath: downloadDir,
        errors: results.errors
      }
    });

  } catch (error) {
    console.error('Sharp turn image download error:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading sharp turn images',
      error: error.message
    });
  }
});

/**
 * Download images for Blind Spots only
 * POST /api/visibility-images/routes/:routeId/download-blind-spots
 */
router.post('/routes/:routeId/download-blind-spots', async (req, res) => {
  try {
    const { routeId } = req.params;
    const { imageTypes = ['street_view', 'satellite'], quality = 'high', riskThreshold = 0 } = req.body;
    
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

    const blindSpots = await BlindSpot.find({ 
      routeId,
      riskScore: { $gte: riskThreshold }
    }).sort({ distanceFromStartKm: 1 });

    if (blindSpots.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No blind spots found with risk score ≥ ${riskThreshold}`
      });
    }

    console.log(`🔍 Downloading images for ${blindSpots.length} blind spots`);

    const downloadDir = path.join('./downloads', 'visibility-images', route.routeId, 'blind-spots');
    await fs.mkdir(downloadDir, { recursive: true });

    const results = { successful: 0, failed: 0, errors: [] };

    for (let i = 0; i < blindSpots.length; i++) {
      const spot = blindSpots[i];
      
      try {
        await downloadBlindSpotImages(spot, downloadDir, imageTypes, quality, i + 1);
        results.successful++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          spotId: spot._id,
          error: error.message
        });
      }
    }

    res.status(200).json({
      success: true,
      message: 'Blind spot images downloaded successfully',
      data: {
        total: blindSpots.length,
        successful: results.successful,
        failed: results.failed,
        successRate: Math.round((results.successful / blindSpots.length) * 100),
        downloadPath: downloadDir,
        errors: results.errors
      }
    });

  } catch (error) {
    console.error('Blind spot image download error:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading blind spot images',
      error: error.message
    });
  }
});

// ============================================================================
// IMAGE STATUS AND MANAGEMENT
// ============================================================================

/**
 * Check image status for all visibility points
 * GET /api/visibility-images/routes/:routeId/image-status
 */
router.get('/routes/:routeId/image-status', async (req, res) => {
  try {
    const { routeId } = req.params;
    
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

    // Get all visibility points
    const [sharpTurns, blindSpots] = await Promise.all([
      SharpTurn.find({ routeId }).sort({ distanceFromStartKm: 1 }),
      BlindSpot.find({ routeId }).sort({ distanceFromStartKm: 1 })
    ]);

    const downloadDir = path.join('./downloads', 'visibility-images', route.routeId);

    const imageStatus = {
      route: {
        routeId: route.routeId,
        routeName: route.routeName
      },
      summary: {
        sharpTurns: {
          total: sharpTurns.length,
          withDatabaseImages: 0,
          withFileSystemImages: 0,
          complete: 0
        },
        blindSpots: {
          total: blindSpots.length,
          withDatabaseImages: 0,
          withFileSystemImages: 0,
          complete: 0
        }
      },
      details: {
        sharpTurns: [],
        blindSpots: []
      }
    };

    // Check sharp turns
    for (let i = 0; i < sharpTurns.length; i++) {
      const turn = sharpTurns[i];
      const baseFilename = `turn_${String(i + 1).padStart(3, '0')}_risk_${turn.riskScore}`;
      
      const dbImages = {
        streetView: !!(turn.streetViewImage && turn.streetViewImage.localPath),
        satellite: !!(turn.satelliteImage && turn.satelliteImage.localPath),
        roadmap: !!(turn.roadmapImage && turn.roadmapImage.localPath)
      };
      
      const fsImages = await checkFileSystemImages(downloadDir, baseFilename);
      
      const turnStatus = {
        id: turn._id,
        type: 'sharp_turn',
        turnNumber: i + 1,
        coordinates: { latitude: turn.latitude, longitude: turn.longitude },
        riskScore: turn.riskScore,
        severity: turn.turnSeverity,
        database: dbImages,
        fileSystem: fsImages,
        status: getImageStatus(dbImages, fsImages)
      };
      
      imageStatus.details.sharpTurns.push(turnStatus);
      
      // Update summary
      if (dbImages.streetView || dbImages.satellite || dbImages.roadmap) {
        imageStatus.summary.sharpTurns.withDatabaseImages++;
      }
      if (fsImages.streetView || fsImages.satellite || fsImages.roadmap) {
        imageStatus.summary.sharpTurns.withFileSystemImages++;
      }
      if ((dbImages.streetView || dbImages.satellite) && (fsImages.streetView || fsImages.satellite)) {
        imageStatus.summary.sharpTurns.complete++;
      }
    }

    // Check blind spots
    for (let i = 0; i < blindSpots.length; i++) {
      const spot = blindSpots[i];
      const baseFilename = `blindspot_${String(i + 1).padStart(3, '0')}_risk_${spot.riskScore}`;
      
      const dbImages = {
        streetView: !!(spot.streetViewImages && spot.streetViewImages.length > 0),
        satellite: !!(spot.aerialImage && spot.aerialImage.localPath),
        roadmap: false // Blind spots typically don't have roadmap images
      };
      
      const fsImages = await checkFileSystemImages(downloadDir, baseFilename);
      
      const spotStatus = {
        id: spot._id,
        type: 'blind_spot',
        spotNumber: i + 1,
        coordinates: { latitude: spot.latitude, longitude: spot.longitude },
        riskScore: spot.riskScore,
        spotType: spot.spotType,
        database: dbImages,
        fileSystem: fsImages,
        status: getImageStatus(dbImages, fsImages)
      };
      
      imageStatus.details.blindSpots.push(spotStatus);
      
      // Update summary
      if (dbImages.streetView || dbImages.satellite) {
        imageStatus.summary.blindSpots.withDatabaseImages++;
      }
      if (fsImages.streetView || fsImages.satellite) {
        imageStatus.summary.blindSpots.withFileSystemImages++;
      }
      if ((dbImages.streetView || dbImages.satellite) && (fsImages.streetView || fsImages.satellite)) {
        imageStatus.summary.blindSpots.complete++;
      }
    }

    res.status(200).json({
      success: true,
      data: imageStatus
    });

  } catch (error) {
    console.error('Image status check error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking image status',
      error: error.message
    });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Download images specifically for sharp turns
async function downloadSharpTurnImages(turn, downloadDir, imageTypes, quality, index) {
  const results = {
    streetView: null,
    satellite: null,
    roadmap: null
  };

  const baseFilename = `turn_${String(index).padStart(3, '0')}_risk_${turn.riskScore}`;
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    throw new Error('Google Maps API key not configured');
  }

  // Street View
  if (imageTypes.includes('street_view')) {
    try {
      const streetViewUrl = generateSharpTurnStreetViewUrl(turn, apiKey, quality);
      const streetViewPath = path.join(downloadDir, `${baseFilename}_street_view.jpg`);
      
      await downloadImageWithRetry(streetViewUrl, streetViewPath);
      results.streetView = {
        localPath: streetViewPath,
        filename: path.basename(streetViewPath),
        url: streetViewUrl,
        publicUrl: getPublicImageUrl(path.basename(downloadDir), path.basename(streetViewPath))
      };
    } catch (error) {
      console.error(`Street view failed for turn ${index}:`, error.message);
    }
  }

  // Satellite
  if (imageTypes.includes('satellite')) {
    try {
      const satelliteUrl = generateSharpTurnSatelliteUrl(turn, apiKey, quality);
      const satellitePath = path.join(downloadDir, `${baseFilename}_satellite.jpg`);
      
      await downloadImageWithRetry(satelliteUrl, satellitePath);
      results.satellite = {
        localPath: satellitePath,
        filename: path.basename(satellitePath),
        url: satelliteUrl,
        publicUrl: getPublicImageUrl(path.basename(downloadDir), path.basename(satellitePath))
      };
    } catch (error) {
      console.error(`Satellite failed for turn ${index}:`, error.message);
    }
  }

  // Roadmap
  if (imageTypes.includes('roadmap')) {
    try {
      const roadmapUrl = generateSharpTurnRoadmapUrl(turn, apiKey, quality);
      const roadmapPath = path.join(downloadDir, `${baseFilename}_roadmap.jpg`);
      
      await downloadImageWithRetry(roadmapUrl, roadmapPath);
      results.roadmap = {
        localPath: roadmapPath,
        filename: path.basename(roadmapPath),
        url: roadmapUrl,
        publicUrl: getPublicImageUrl(path.basename(downloadDir), path.basename(roadmapPath))
      };
    } catch (error) {
      console.error(`Roadmap failed for turn ${index}:`, error.message);
    }
  }

  return results;
}

// Download images specifically for blind spots
async function downloadBlindSpotImages(spot, downloadDir, imageTypes, quality, index) {
  const results = {
    streetView: null,
    satellite: null,
    roadmap: null
  };

  const baseFilename = `blindspot_${String(index).padStart(3, '0')}_risk_${spot.riskScore}`;
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    throw new Error('Google Maps API key not configured');
  }

  // Street View (multiple angles for blind spots)
  if (imageTypes.includes('street_view')) {
    try {
      const streetViewUrl = generateBlindSpotStreetViewUrl(spot, apiKey, quality);
      const streetViewPath = path.join(downloadDir, `${baseFilename}_street_view.jpg`);
      
      await downloadImageWithRetry(streetViewUrl, streetViewPath);
      results.streetView = {
        localPath: streetViewPath,
        filename: path.basename(streetViewPath),
        url: streetViewUrl,
        publicUrl: getPublicImageUrl(path.basename(downloadDir), path.basename(streetViewPath))
      };
    } catch (error) {
      console.error(`Street view failed for blind spot ${index}:`, error.message);
    }
  }

  // Satellite/Aerial view
  if (imageTypes.includes('satellite')) {
    try {
      const satelliteUrl = generateBlindSpotSatelliteUrl(spot, apiKey, quality);
      const satellitePath = path.join(downloadDir, `${baseFilename}_satellite.jpg`);
      
      await downloadImageWithRetry(satelliteUrl, satellitePath);
      results.satellite = {
        localPath: satellitePath,
        filename: path.basename(satellitePath),
        url: satelliteUrl,
        publicUrl: getPublicImageUrl(path.basename(downloadDir), path.basename(satellitePath))
      };
    } catch (error) {
      console.error(`Satellite failed for blind spot ${index}:`, error.message);
    }
  }

  return results;
}

// Update sharp turn database with image information
async function updateSharpTurnWithImages(turnId, imageResults) {
  const updateData = { lastUpdated: new Date() };

  if (imageResults.streetView) {
    updateData.streetViewImage = {
      ...imageResults.streetView,
      downloadedAt: new Date(),
      downloadStatus: 'completed'
    };
  }

  if (imageResults.satellite) {
    updateData.satelliteImage = {
      ...imageResults.satellite,
      downloadedAt: new Date(),
      downloadStatus: 'completed'
    };
  }

  if (imageResults.roadmap) {
    updateData.roadmapImage = {
      ...imageResults.roadmap,
      downloadedAt: new Date(),
      downloadStatus: 'completed'
    };
  }

  return await SharpTurn.findByIdAndUpdate(turnId, updateData, { new: true });
}

// Update blind spot database with image information
async function updateBlindSpotWithImages(spotId, imageResults) {
  const updateData = { lastUpdated: new Date() };

  if (imageResults.streetView) {
    updateData.streetViewImages = [{
      ...imageResults.streetView,
      downloadedAt: new Date(),
      heading: 0, // Could be enhanced with multiple angles
      pitch: 0,
      description: 'Blind spot street view'
    }];
  }

  if (imageResults.satellite) {
    updateData.aerialImage = {
      ...imageResults.satellite,
      downloadedAt: new Date(),
      zoom: 18
    };
  }

  return await BlindSpot.findByIdAndUpdate(spotId, updateData, { new: true });
}

// URL generation functions for sharp turns
function generateSharpTurnStreetViewUrl(turn, apiKey, quality) {
  const size = quality === 'high' ? '640x640' : '400x400';
  let heading = 0;
  
  // Smart heading based on turn direction
  if (turn.turnDirection === 'left') heading = 270;
  else if (turn.turnDirection === 'right') heading = 90;
  else if (turn.turnDirection === 'hairpin') heading = 180;
  
  // Adjust based on turn angle
  if (turn.turnAngle) {
    heading = (heading + (turn.turnAngle * 0.3)) % 360;
  }
  
  return `https://maps.googleapis.com/maps/api/streetview?` +
    `location=${turn.latitude},${turn.longitude}&` +
    `size=${size}&` +
    `heading=${heading}&` +
    `pitch=0&` +
    `fov=120&` +
    `key=${apiKey}`;
}

function generateSharpTurnSatelliteUrl(turn, apiKey, quality) {
  const size = quality === 'high' ? '640x640' : '400x400';
  const markerColor = turn.riskScore >= 8 ? 'red' : turn.riskScore >= 6 ? 'orange' : 'yellow';
  
  return `https://maps.googleapis.com/maps/api/staticmap?` +
    `center=${turn.latitude},${turn.longitude}&` +
    `zoom=18&` +
    `size=${size}&` +
    `maptype=satellite&` +
    `markers=color:${markerColor}%7Clabel:T%7C${turn.latitude},${turn.longitude}&` +
    `key=${apiKey}`;
}

function generateSharpTurnRoadmapUrl(turn, apiKey, quality) {
  const size = quality === 'high' ? '640x640' : '400x400';
  const markerColor = turn.riskScore >= 8 ? 'red' : turn.riskScore >= 6 ? 'orange' : 'yellow';
  
  return `https://maps.googleapis.com/maps/api/staticmap?` +
    `center=${turn.latitude},${turn.longitude}&` +
    `zoom=17&` +
    `size=${size}&` +
    `maptype=roadmap&` +
    `markers=color:${markerColor}%7Clabel:T%7C${turn.latitude},${turn.longitude}&` +
    `key=${apiKey}`;
}

// URL generation functions for blind spots
function generateBlindSpotStreetViewUrl(spot, apiKey, quality) {
  const size = quality === 'high' ? '640x640' : '400x400';
  let heading = 0;
  
  // Heading based on blind spot type
  switch (spot.spotType) {
    case 'crest':
      heading = 0; // Look forward over the crest
      break;
    case 'curve':
      heading = 45; // Angle to show the curve
      break;
    case 'intersection':
      heading = 0; // Look straight at intersection
      break;
    case 'obstruction':
      heading = 90; // Side angle to show obstruction
      break;
    case 'vegetation':
      heading = 270; // Opposite side angle
      break;
    default:
      heading = 0;
  }
  
  return `https://maps.googleapis.com/maps/api/streetview?` +
    `location=${spot.latitude},${spot.longitude}&` +
    `size=${size}&` +
    `heading=${heading}&` +
    `pitch=0&` +
    `fov=120&` +
    `key=${apiKey}`;
}

function generateBlindSpotSatelliteUrl(spot, apiKey, quality) {
  const size = quality === 'high' ? '640x640' : '400x400';
  const markerColor = spot.riskScore >= 8 ? 'red' : spot.riskScore >= 6 ? 'orange' : 'yellow';
  
  return `https://maps.googleapis.com/maps/api/staticmap?` +
    `center=${spot.latitude},${spot.longitude}&` +
    `zoom=18&` +
    `size=${size}&` +
    `maptype=satellite&` +
    `markers=color:${markerColor}%7Clabel:B%7C${spot.latitude},${spot.longitude}&` +
    `key=${apiKey}`;
}

// Check what images exist in file system
async function checkFileSystemImages(downloadDir, baseFilename) {
  const images = {
    streetView: false,
    satellite: false,
    roadmap: false,
    any: false
  };

  try {
    const filesToCheck = [
      { type: 'streetView', filename: `${baseFilename}_street_view.jpg` },
      { type: 'satellite', filename: `${baseFilename}_satellite.jpg` },
      { type: 'roadmap', filename: `${baseFilename}_roadmap.jpg` }
    ];

    for (const file of filesToCheck) {
      try {
        await fs.access(path.join(downloadDir, file.filename));
        images[file.type] = true;
      } catch (error) {
        // File doesn't exist
      }
    }

    images.any = images.streetView || images.satellite || images.roadmap;
    
  } catch (error) {
    console.error('Error checking file system images:', error);
  }

  return images;
}

// Get image status description
function getImageStatus(databaseImages, fileSystemImages) {
  const dbHasAny = databaseImages.streetView || databaseImages.satellite || databaseImages.roadmap;
  const fsHasAny = fileSystemImages.streetView || fileSystemImages.satellite || fileSystemImages.roadmap;
  
  if (dbHasAny && fsHasAny) {
    return 'COMPLETE - Both database and files';
  } else if (fsHasAny && !dbHasAny) {
    return 'FILES_ONLY - Images exist but database not updated';
  } else if (dbHasAny && !fsHasAny) {
    return 'DATABASE_ONLY - Database has paths but files missing';
  } else {
    return 'MISSING - No images in database or files';
  }
}

// Generate public URL for image access
function getPublicImageUrl(routeId, filename) {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  return `${baseUrl}/downloads/visibility-images/${routeId}/${filename}`;
}

// Enhanced image download with retry logic
async function downloadImageWithRetry(url, filepath, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: 30000
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const writer = await fs.open(filepath, 'w');
      const stream = writer.createWriteStream();
      
      response.data.pipe(stream);
      
      await new Promise((resolve, reject) => {
        stream.on('finish', async () => {
          await writer.close();
          
          // Verify file size
          const stats = await fs.stat(filepath);
          if (stats.size < 1000) {
            throw new Error('Downloaded file too small, likely an error image');
          }
          
          resolve();
        });
        stream.on('error', reject);
      });
      
      return; // Success, exit retry loop
      
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      
      console.log(`    ⚠️  Attempt ${attempt} failed, retrying... (${error.message})`);
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
    }
  }
}

// ============================================================================
// BULK OPERATIONS
// ============================================================================

/**
 * Delete all visibility images for a route
 * DELETE /api/visibility-images/routes/:routeId/delete-all-images
 */
router.delete('/routes/:routeId/delete-all-images', async (req, res) => {
  try {
    const { routeId } = req.params;
    const { updateDatabase = true } = req.body;
    
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

    const downloadDir = path.join('./downloads', 'visibility-images', route.routeId);
    
    // Delete files
    let filesDeleted = 0;
    try {
      const files = await fs.readdir(downloadDir);
      for (const file of files) {
        await fs.unlink(path.join(downloadDir, file));
        filesDeleted++;
      }
      await fs.rmdir(downloadDir);
    } catch (error) {
      // Directory might not exist
    }

    // Clear database references if requested
    let dbUpdates = { sharpTurns: 0, blindSpots: 0 };
    if (updateDatabase) {
      const [sharpTurnUpdate, blindSpotUpdate] = await Promise.all([
        SharpTurn.updateMany(
          { routeId },
          { 
            $unset: { 
              streetViewImage: 1, 
              satelliteImage: 1, 
              roadmapImage: 1 
            },
            $set: { lastUpdated: new Date() }
          }
        ),
        BlindSpot.updateMany(
          { routeId },
          { 
            $unset: { 
              streetViewImages: 1, 
              aerialImage: 1 
            },
            $set: { lastUpdated: new Date() }
          }
        )
      ]);
      
      dbUpdates.sharpTurns = sharpTurnUpdate.modifiedCount;
      dbUpdates.blindSpots = blindSpotUpdate.modifiedCount;
    }

    res.status(200).json({
      success: true,
      message: 'All visibility images deleted successfully',
      data: {
        filesDeleted,
        databaseUpdates: updateDatabase ? dbUpdates : { enabled: false },
        deletedDirectory: downloadDir
      }
    });

  } catch (error) {
    console.error('Delete all images error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting visibility images',
      error: error.message
    });
  }
});

/**
 * Sync database with existing image files
 * POST /api/visibility-images/routes/:routeId/sync-database
 */
router.post('/routes/:routeId/sync-database', async (req, res) => {
  try {
    const { routeId } = req.params;
    
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

    const downloadDir = path.join('./downloads', 'visibility-images', route.routeId);
    
    // Check if download directory exists
    try {
      await fs.access(downloadDir);
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: 'No images found - download directory does not exist'
      });
    }

    // Get all visibility points
    const [sharpTurns, blindSpots] = await Promise.all([
      SharpTurn.find({ routeId }).sort({ distanceFromStartKm: 1 }),
      BlindSpot.find({ routeId }).sort({ distanceFromStartKm: 1 })
    ]);

    console.log(`🔄 Syncing database with file system for ${sharpTurns.length} turns and ${blindSpots.length} spots`);

    const syncResults = {
      sharpTurns: { successful: 0, failed: 0, skipped: 0 },
      blindSpots: { successful: 0, failed: 0, skipped: 0 },
      errors: []
    };

    // Sync sharp turns
    for (let i = 0; i < sharpTurns.length; i++) {
      const turn = sharpTurns[i];
      const baseFilename = `turn_${String(i + 1).padStart(3, '0')}_risk_${turn.riskScore}`;
      
      try {
        const existingImages = await checkFileSystemImages(downloadDir, baseFilename);
        
        if (!existingImages.any) {
          syncResults.sharpTurns.skipped++;
          continue;
        }
        
        const updateData = { lastUpdated: new Date() };
        
        if (existingImages.streetView) {
          updateData.streetViewImage = {
            localPath: path.join(downloadDir, `${baseFilename}_street_view.jpg`),
            filename: `${baseFilename}_street_view.jpg`,
            publicUrl: getPublicImageUrl(route.routeId, `${baseFilename}_street_view.jpg`),
            downloadedAt: new Date(),
            downloadStatus: 'completed'
          };
        }
        
        if (existingImages.satellite) {
          updateData.satelliteImage = {
            localPath: path.join(downloadDir, `${baseFilename}_satellite.jpg`),
            filename: `${baseFilename}_satellite.jpg`,
            publicUrl: getPublicImageUrl(route.routeId, `${baseFilename}_satellite.jpg`),
            downloadedAt: new Date(),
            downloadStatus: 'completed'
          };
        }
        
        if (existingImages.roadmap) {
          updateData.roadmapImage = {
            localPath: path.join(downloadDir, `${baseFilename}_roadmap.jpg`),
            filename: `${baseFilename}_roadmap.jpg`,
            publicUrl: getPublicImageUrl(route.routeId, `${baseFilename}_roadmap.jpg`),
            downloadedAt: new Date(),
            downloadStatus: 'completed'
          };
        }
        
        await SharpTurn.findByIdAndUpdate(turn._id, updateData);
        syncResults.sharpTurns.successful++;
        
      } catch (error) {
        syncResults.sharpTurns.failed++;
        syncResults.errors.push({
          type: 'sharp_turn',
          id: turn._id,
          error: error.message
        });
      }
    }

    // Sync blind spots
    for (let i = 0; i < blindSpots.length; i++) {
      const spot = blindSpots[i];
      const baseFilename = `blindspot_${String(i + 1).padStart(3, '0')}_risk_${spot.riskScore}`;
      
      try {
        const existingImages = await checkFileSystemImages(downloadDir, baseFilename);
        
        if (!existingImages.any) {
          syncResults.blindSpots.skipped++;
          continue;
        }
        
        const updateData = { lastUpdated: new Date() };
        
        if (existingImages.streetView) {
          updateData.streetViewImages = [{
            localPath: path.join(downloadDir, `${baseFilename}_street_view.jpg`),
            filename: `${baseFilename}_street_view.jpg`,
            publicUrl: getPublicImageUrl(route.routeId, `${baseFilename}_street_view.jpg`),
            downloadedAt: new Date(),
            heading: 0,
            pitch: 0,
            description: 'Blind spot street view'
          }];
        }
        
        if (existingImages.satellite) {
          updateData.aerialImage = {
            localPath: path.join(downloadDir, `${baseFilename}_satellite.jpg`),
            filename: `${baseFilename}_satellite.jpg`,
            publicUrl: getPublicImageUrl(route.routeId, `${baseFilename}_satellite.jpg`),
            downloadedAt: new Date(),
            zoom: 18
          };
        }
        
        await BlindSpot.findByIdAndUpdate(spot._id, updateData);
        syncResults.blindSpots.successful++;
        
      } catch (error) {
        syncResults.blindSpots.failed++;
        syncResults.errors.push({
          type: 'blind_spot',
          id: spot._id,
          error: error.message
        });
      }
    }

    const totalSynced = syncResults.sharpTurns.successful + syncResults.blindSpots.successful;
    const totalSkipped = syncResults.sharpTurns.skipped + syncResults.blindSpots.skipped;
    const totalFailed = syncResults.sharpTurns.failed + syncResults.blindSpots.failed;

    console.log(`✅ Database sync completed: ${totalSynced} synced, ${totalSkipped} skipped, ${totalFailed} failed`);

    res.status(200).json({
      success: true,
      message: 'Database synced with file system successfully',
      data: {
        route: {
          routeId: route.routeId,
          routeName: route.routeName
        },
        syncResults,
        summary: {
          totalSynced,
          totalSkipped,
          totalFailed,
          successRate: totalSynced + totalFailed > 0 ? 
            Math.round((totalSynced / (totalSynced + totalFailed)) * 100) : 0
        },
        downloadDirectory: downloadDir
      }
    });

  } catch (error) {
    console.error('Database sync error:', error);
    res.status(500).json({
      success: false,
      message: 'Error syncing database with files',
      error: error.message
    });
  }
});

// ============================================================================
// EXPORT MANAGEMENT
// ============================================================================

/**
 * Generate comprehensive image download report
 * GET /api/visibility-images/routes/:routeId/download-report
 */
router.get('/routes/:routeId/download-report', async (req, res) => {
  try {
    const { routeId } = req.params;
    
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

    // Get all visibility points with image data
    const [sharpTurns, blindSpots] = await Promise.all([
      SharpTurn.find({ routeId }).sort({ distanceFromStartKm: 1 }),
      BlindSpot.find({ routeId }).sort({ distanceFromStartKm: 1 })
    ]);

    const downloadDir = path.join('./downloads', 'visibility-images', route.routeId);

    // Generate comprehensive report
    const report = {
      metadata: {
        reportType: 'VISIBILITY_IMAGE_DOWNLOAD_REPORT',
        generatedAt: new Date().toISOString(),
        generatedBy: req.user.username || req.user.email,
        version: '2.0'
      },
      routeInformation: {
        routeId: route.routeId,
        routeName: route.routeName,
        fromLocation: route.fromName,
        toLocation: route.toName,
        totalDistance: route.totalDistance,
        terrain: route.terrain
      },
      imageStatus: {
        sharpTurns: {
          total: sharpTurns.length,
          withImages: sharpTurns.filter(t => 
            (t.streetViewImage && t.streetViewImage.downloadStatus === 'completed') ||
            (t.satelliteImage && t.satelliteImage.downloadStatus === 'completed') ||
            (t.roadmapImage && t.roadmapImage.downloadStatus === 'completed')
          ).length,
          missingImages: sharpTurns.filter(t => 
            !t.streetViewImage && !t.satelliteImage && !t.roadmapImage
          ).length
        },
        blindSpots: {
          total: blindSpots.length,
          withImages: blindSpots.filter(s => 
            (s.streetViewImages && s.streetViewImages.length > 0) ||
            (s.aerialImage && s.aerialImage.filename)
          ).length,
          missingImages: blindSpots.filter(s => 
            (!s.streetViewImages || s.streetViewImages.length === 0) && !s.aerialImage
          ).length
        }
      },
      detailedBreakdown: {
        sharpTurns: sharpTurns.map((turn, index) => ({
          turnNumber: index + 1,
          turnId: turn._id,
          coordinates: { latitude: turn.latitude, longitude: turn.longitude },
          riskScore: turn.riskScore,
          severity: turn.turnSeverity,
          images: {
            streetView: turn.streetViewImage ? {
              available: true,
              filename: turn.streetViewImage.filename,
              downloadedAt: turn.streetViewImage.downloadedAt,
              status: turn.streetViewImage.downloadStatus
            } : { available: false },
            satellite: turn.satelliteImage ? {
              available: true,
              filename: turn.satelliteImage.filename,
              downloadedAt: turn.satelliteImage.downloadedAt,
              status: turn.satelliteImage.downloadStatus
            } : { available: false },
            roadmap: turn.roadmapImage ? {
              available: true,
              filename: turn.roadmapImage.filename,
              downloadedAt: turn.roadmapImage.downloadedAt,
              status: turn.roadmapImage.downloadStatus
            } : { available: false }
          }
        })),
        blindSpots: blindSpots.map((spot, index) => ({
          spotNumber: index + 1,
          spotId: spot._id,
          coordinates: { latitude: spot.latitude, longitude: spot.longitude },
          riskScore: spot.riskScore,
          spotType: spot.spotType,
          images: {
            streetView: spot.streetViewImages && spot.streetViewImages.length > 0 ? {
              available: true,
              count: spot.streetViewImages.length,
              filenames: spot.streetViewImages.map(img => img.filename)
            } : { available: false },
            aerial: spot.aerialImage ? {
              available: true,
              filename: spot.aerialImage.filename,
              downloadedAt: spot.aerialImage.downloadedAt
            } : { available: false }
          }
        }))
      },
      downloadDirectory: downloadDir,
      recommendations: generateImageRecommendations(sharpTurns, blindSpots)
    };

    res.status(200).json({
      success: true,
      message: 'Visibility image download report generated successfully',
      data: report
    });

  } catch (error) {
    console.error('Download report generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating download report',
      error: error.message
    });
  }
});

// Generate recommendations based on image availability
function generateImageRecommendations(sharpTurns, blindSpots) {
  const recommendations = [];
  
  const turnsWithoutImages = sharpTurns.filter(t => 
    !t.streetViewImage && !t.satelliteImage && !t.roadmapImage
  );
  
  const spotsWithoutImages = blindSpots.filter(s => 
    (!s.streetViewImages || s.streetViewImages.length === 0) && !s.aerialImage
  );
  
  if (turnsWithoutImages.length > 0) {
    recommendations.push({
      priority: 'HIGH',
      category: 'sharp_turns',
      message: `${turnsWithoutImages.length} sharp turns missing images`,
      action: 'Download images for visibility analysis and driver briefing'
    });
  }
  
  if (spotsWithoutImages.length > 0) {
    recommendations.push({
      priority: 'HIGH', 
      category: 'blind_spots',
      message: `${spotsWithoutImages.length} blind spots missing images`,
      action: 'Download images for visibility assessment and safety planning'
    });
  }
  
  const criticalTurnsWithoutImages = turnsWithoutImages.filter(t => t.riskScore >= 8);
  const criticalSpotsWithoutImages = spotsWithoutImages.filter(s => s.riskScore >= 8);
  
  if (criticalTurnsWithoutImages.length > 0 || criticalSpotsWithoutImages.length > 0) {
    recommendations.push({
      priority: 'CRITICAL',
      category: 'high_risk_points',
      message: `${criticalTurnsWithoutImages.length + criticalSpotsWithoutImages.length} critical risk points missing images`,
      action: 'URGENT: Download images for all critical risk points immediately'
    });
  }
  
  if (recommendations.length === 0) {
    recommendations.push({
      priority: 'INFO',
      category: 'complete',
      message: 'All visibility points have image coverage',
      action: 'Maintain regular image updates and quality checks'
    });
  }
  
  return recommendations;
}

module.exports = router;