// File: routes/sharpTurnImageDownloaderEnhanced.js
// Purpose: Download images AND update SharpTurn model with image details

const express = require('express');
const { auth } = require('../middleware/auth');
const Route = require('../models/Route');
const SharpTurn = require('../models/SharpTurn');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

const router = express.Router();
router.use(auth);

// ============================================================================
// ENHANCED DOWNLOAD WITH DATABASE UPDATES
// ============================================================================

// Download all sharp turn images AND update database with image details
router.post('/routes/:routeId/download-all-images', async (req, res) => {
  try {
    const { routeId } = req.params;
    const { imageTypes = ['street', 'satellite', 'roadmap'], quality = 'high', updateDatabase = true } = req.body;
    
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

    // Get all sharp turns for this route
    const sharpTurns = await SharpTurn.find({ routeId })
      .sort({ distanceFromStartKm: 1 });

    if (sharpTurns.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No sharp turns found for this route'
      });
    }

    console.log(`📸 Starting ENHANCED image download for ${sharpTurns.length} sharp turns on route: ${route.routeId}`);
    console.log(`🔄 Database updates: ${updateDatabase ? 'ENABLED' : 'DISABLED'}`);

    // Create download directory
    const downloadDir = path.join('./downloads', 'sharp-turn-images', route.routeId);
    await fs.mkdir(downloadDir, { recursive: true });

    const downloadResults = {
      successful: [],
      failed: [],
      databaseUpdates: {
        successful: 0,
        failed: 0,
        errors: []
      }
    };

    // Process each sharp turn
    for (let i = 0; i < sharpTurns.length; i++) {
      const turn = sharpTurns[i];
      
      try {
        console.log(`  📍 Processing turn ${i + 1}/${sharpTurns.length}: ${turn.turnSeverity} turn at ${turn.latitude}, ${turn.longitude}`);
        
        // Download images
        const turnImages = await downloadSharpTurnImagesEnhanced(
          turn, 
          downloadDir, 
          imageTypes, 
          quality,
          i + 1
        );
        
        // Update database with image details if requested
        let databaseUpdate = null;
        if (updateDatabase) {
          try {
            databaseUpdate = await updateSharpTurnWithImageDetails(turn._id, turnImages, downloadDir);
            downloadResults.databaseUpdates.successful++;
            console.log(`    💾 Database updated for turn ${i + 1}`);
          } catch (dbError) {
            console.error(`    ❌ Database update failed for turn ${i + 1}:`, dbError.message);
            downloadResults.databaseUpdates.failed++;
            downloadResults.databaseUpdates.errors.push({
              turnId: turn._id,
              turnNumber: i + 1,
              error: dbError.message
            });
          }
        }
        
        downloadResults.successful.push({
          turnId: turn._id,
          turnNumber: i + 1,
          coordinates: { latitude: turn.latitude, longitude: turn.longitude },
          distanceFromStart: turn.distanceFromStartKm,
          severity: turn.turnSeverity,
          riskScore: turn.riskScore,
          images: turnImages,
          databaseUpdated: !!databaseUpdate
        });

      } catch (error) {
        console.error(`  ❌ Failed to download images for turn ${i + 1}:`, error.message);
        downloadResults.failed.push({
          turnId: turn._id,
          turnNumber: i + 1,
          coordinates: { latitude: turn.latitude, longitude: turn.longitude },
          error: error.message
        });
      }
    }

    // Create enhanced summary report
    const summaryReport = {
      route: {
        routeId: route.routeId,
        routeName: route.routeName,
        fromName: route.fromName,
        toName: route.toName
      },
      downloadSummary: {
        totalTurns: sharpTurns.length,
        successful: downloadResults.successful.length,
        failed: downloadResults.failed.length,
        successRate: Math.round((downloadResults.successful.length / sharpTurns.length) * 100)
      },
      databaseUpdateSummary: updateDatabase ? {
        enabled: true,
        successful: downloadResults.databaseUpdates.successful,
        failed: downloadResults.databaseUpdates.failed,
        updateRate: Math.round((downloadResults.databaseUpdates.successful / downloadResults.successful.length) * 100)
      } : { enabled: false },
      downloadPath: downloadDir,
      timestamp: new Date().toISOString(),
      imageTypes: imageTypes,
      quality: quality
    };

    // Save enhanced summary report
    await fs.writeFile(
      path.join(downloadDir, 'enhanced_download_summary.json'),
      JSON.stringify({
        ...summaryReport,
        detailedResults: downloadResults
      }, null, 2)
    );

    console.log(`✅ ENHANCED image download completed for route ${route.routeId}`);
    console.log(`   📊 Images: ${downloadResults.successful.length}/${sharpTurns.length} (${summaryReport.downloadSummary.successRate}%)`);
    if (updateDatabase) {
      console.log(`   💾 Database: ${downloadResults.databaseUpdates.successful}/${downloadResults.successful.length} updated`);
    }

    res.status(200).json({
      success: true,
      message: 'Enhanced sharp turn images downloaded and database updated successfully',
      data: {
        ...summaryReport,
        detailedResults: downloadResults,
        fileLocations: {
          downloadDirectory: downloadDir,
          summaryReport: path.join(downloadDir, 'enhanced_download_summary.json')
        }
      }
    });

  } catch (error) {
    console.error('Enhanced download error:', error);
    res.status(500).json({
      success: false,
      message: 'Error during enhanced image download',
      error: error.message
    });
  }
});

// ============================================================================
// CHECK DATABASE IMAGE STATUS
// ============================================================================

// Check which turns have images in database vs file system
router.get('/routes/:routeId/image-status', async (req, res) => {
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

    // Get all sharp turns with image information
    const turns = await SharpTurn.find({ routeId })
      .sort({ distanceFromStartKm: 1 })
      .select('_id latitude longitude riskScore streetViewImage satelliteImage roadmapImage streetViewLink mapsLink distanceFromStartKm turnSeverity');

    const downloadDir = path.join('./downloads', 'sharp-turn-images', route.routeId);
    
    const imageStatus = {
      route: {
        routeId: route.routeId,
        routeName: route.routeName
      },
      summary: {
        totalTurns: turns.length,
        turnsWithDatabaseImages: 0,
        turnsWithFileSystemImages: 0,
        turnsWithBoth: 0,
        turnsWithNeither: 0
      },
      turns: []
    };

    // Check each turn
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      const turnNumber = i + 1;
      
      // Check database image fields
      const hasDatabaseImages = {
        streetView: !!turn.streetViewImage,
        satellite: !!turn.satelliteImage,
        roadmap: !!turn.roadmapImage,
        any: !!(turn.streetViewImage || turn.satelliteImage || turn.roadmapImage)
      };
      
      // Check file system
      const baseFilename = `turn_${String(turnNumber).padStart(3, '0')}_risk_${turn.riskScore}`;
      const hasFileSystemImages = await checkFileSystemImages(downloadDir, baseFilename);
      
      const turnStatus = {
        turnNumber,
        turnId: turn._id,
        coordinates: { latitude: turn.latitude, longitude: turn.longitude },
        riskScore: turn.riskScore,
        severity: turn.turnSeverity,
        distanceFromStart: turn.distanceFromStartKm,
        database: hasDatabaseImages,
        fileSystem: hasFileSystemImages,
        status: getImageStatus(hasDatabaseImages, hasFileSystemImages),
        links: {
          streetView: turn.streetViewLink,
          maps: turn.mapsLink
        }
      };
      
      imageStatus.turns.push(turnStatus);
      
      // Update summary
      if (hasDatabaseImages.any) imageStatus.summary.turnsWithDatabaseImages++;
      if (hasFileSystemImages.any) imageStatus.summary.turnsWithFileSystemImages++;
      if (hasDatabaseImages.any && hasFileSystemImages.any) imageStatus.summary.turnsWithBoth++;
      if (!hasDatabaseImages.any && !hasFileSystemImages.any) imageStatus.summary.turnsWithNeither++;
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
// UPDATE DATABASE WITH EXISTING IMAGES
// ============================================================================

// Scan file system and update database with existing image paths
router.post('/routes/:routeId/sync-database-with-files', async (req, res) => {
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

    const downloadDir = path.join('./downloads', 'sharp-turn-images', route.routeId);
    
    // Check if download directory exists
    try {
      await fs.access(downloadDir);
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: 'No images found - download directory does not exist'
      });
    }

    // Get all sharp turns
    const turns = await SharpTurn.find({ routeId })
      .sort({ distanceFromStartKm: 1 });

    console.log(`🔄 Syncing database with file system for ${turns.length} turns`);

    const syncResults = {
      successful: 0,
      failed: 0,
      skipped: 0,
      errors: []
    };

    // Process each turn
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      const turnNumber = i + 1;
      const baseFilename = `turn_${String(turnNumber).padStart(3, '0')}_risk_${turn.riskScore}`;
      
      try {
        // Check what files exist
        const existingImages = await checkFileSystemImages(downloadDir, baseFilename);
        
        if (!existingImages.any) {
          syncResults.skipped++;
          continue;
        }
        
        // Build image paths for database
        const imageData = {
          streetViewImage: existingImages.streetView ? {
            localPath: path.join(downloadDir, `${baseFilename}_street_view.jpg`),
            filename: `${baseFilename}_street_view.jpg`,
            url: getPublicImageUrl(route.routeId, `${baseFilename}_street_view.jpg`),
            downloadedAt: new Date()
          } : undefined,
          
          satelliteImage: existingImages.satellite ? {
            localPath: path.join(downloadDir, `${baseFilename}_satellite.jpg`),
            filename: `${baseFilename}_satellite.jpg`,
            url: getPublicImageUrl(route.routeId, `${baseFilename}_satellite.jpg`),
            downloadedAt: new Date()
          } : undefined,
          
          roadmapImage: existingImages.roadmap ? {
            localPath: path.join(downloadDir, `${baseFilename}_roadmap.jpg`),
            filename: `${baseFilename}_roadmap.jpg`,
            url: getPublicImageUrl(route.routeId, `${baseFilename}_roadmap.jpg`),
            downloadedAt: new Date()
          } : undefined,
          
          lastUpdated: new Date()
        };
        
        // Remove undefined fields
        Object.keys(imageData).forEach(key => {
          if (imageData[key] === undefined) {
            delete imageData[key];
          }
        });
        
        // Update database
        await SharpTurn.findByIdAndUpdate(turn._id, imageData);
        syncResults.successful++;
        
        console.log(`  ✅ Synced turn ${turnNumber}: ${Object.keys(imageData).length - 1} image fields updated`);
        
      } catch (error) {
        console.error(`  ❌ Failed to sync turn ${turnNumber}:`, error.message);
        syncResults.failed++;
        syncResults.errors.push({
          turnNumber,
          turnId: turn._id,
          error: error.message
        });
      }
    }

    console.log(`✅ Database sync completed: ${syncResults.successful} updated, ${syncResults.skipped} skipped, ${syncResults.failed} failed`);

    res.status(200).json({
      success: true,
      message: 'Database synced with file system successfully',
      data: {
        route: {
          routeId: route.routeId,
          routeName: route.routeName
        },
        syncResults,
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
// ENHANCED HELPER FUNCTIONS
// ============================================================================

// Enhanced image download with database update capabilities
async function downloadSharpTurnImagesEnhanced(turn, downloadDir, imageTypes, quality, index, riskPrefix = '') {
  const results = {
    streetView: null,
    satellite: null,
    roadmap: null,
    metadata: null
  };

  const baseFilename = riskPrefix ? 
    `${riskPrefix}_turn_${String(index).padStart(3, '0')}_risk_${turn.riskScore}` :
    `turn_${String(index).padStart(3, '0')}_risk_${turn.riskScore}`;

  // Google Maps API key
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error('Google Maps API key not configured');
  }

  // 1. Download Street View Image
  if (imageTypes.includes('street')) {
    try {
      const streetViewUrl = generateStreetViewUrlEnhanced(turn, apiKey, quality);
      const streetViewPath = path.join(downloadDir, `${baseFilename}_street_view.jpg`);
      
      await downloadImageWithRetry(streetViewUrl, streetViewPath);
      results.streetView = {
        localPath: streetViewPath,
        filename: path.basename(streetViewPath),
        url: streetViewUrl,
        publicUrl: getPublicImageUrl(path.basename(downloadDir), path.basename(streetViewPath)),
        type: 'street_view'
      };
      
      console.log(`    📸 Street view saved: ${path.basename(streetViewPath)}`);
      
    } catch (error) {
      console.error(`    ❌ Street view failed for turn ${index}:`, error.message);
    }
  }

  // 2. Download Satellite Image
  if (imageTypes.includes('satellite')) {
    try {
      const satelliteUrl = generateSatelliteUrlEnhanced(turn, apiKey, quality);
      const satellitePath = path.join(downloadDir, `${baseFilename}_satellite.jpg`);
      
      await downloadImageWithRetry(satelliteUrl, satellitePath);
      results.satellite = {
        localPath: satellitePath,
        filename: path.basename(satellitePath),
        url: satelliteUrl,
        publicUrl: getPublicImageUrl(path.basename(downloadDir), path.basename(satellitePath)),
        type: 'satellite'
      };
      
      console.log(`    🛰️  Satellite saved: ${path.basename(satellitePath)}`);
      
    } catch (error) {
      console.error(`    ❌ Satellite failed for turn ${index}:`, error.message);
    }
  }

  // 3. Download Road Map Image
  if (imageTypes.includes('roadmap')) {
    try {
      const roadmapUrl = generateRoadmapUrlEnhanced(turn, apiKey, quality);
      const roadmapPath = path.join(downloadDir, `${baseFilename}_roadmap.jpg`);
      
      await downloadImageWithRetry(roadmapUrl, roadmapPath);
      results.roadmap = {
        localPath: roadmapPath,
        filename: path.basename(roadmapPath),
        url: roadmapUrl,
        publicUrl: getPublicImageUrl(path.basename(downloadDir), path.basename(roadmapPath)),
        type: 'roadmap'
      };
      
      console.log(`    🗺️  Roadmap saved: ${path.basename(roadmapPath)}`);
      
    } catch (error) {
      console.error(`    ❌ Roadmap failed for turn ${index}:`, error.message);
    }
  }

  // Save enhanced metadata
  const metadataPath = path.join(downloadDir, `${baseFilename}_metadata.json`);
  const metadata = {
    turnInfo: {
      id: turn._id,
      coordinates: { latitude: turn.latitude, longitude: turn.longitude },
      distanceFromStart: turn.distanceFromStartKm,
      turnAngle: turn.turnAngle,
      turnDirection: turn.turnDirection,
      riskScore: turn.riskScore,
      severity: turn.turnSeverity,
      recommendedSpeed: turn.recommendedSpeed,
      analysisMethod: turn.analysisMethod,
      confidence: turn.confidence
    },
    images: results,
    downloadInfo: {
      timestamp: new Date().toISOString(),
      quality: quality,
      imageTypes: imageTypes,
      apiKey: apiKey ? 'configured' : 'missing'
    },
    urls: {
      streetView: imageTypes.includes('street') ? generateStreetViewUrlEnhanced(turn, apiKey, quality) : null,
      satellite: imageTypes.includes('satellite') ? generateSatelliteUrlEnhanced(turn, apiKey, quality) : null,
      roadmap: imageTypes.includes('roadmap') ? generateRoadmapUrlEnhanced(turn, apiKey, quality) : null
    }
  };
  
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  results.metadata = metadataPath;

  return results;
}

// Update SharpTurn model with image details
async function updateSharpTurnWithImageDetails(turnId, imageResults, downloadDir) {
  try {
    const updateData = {
      lastUpdated: new Date()
    };

    // Add image details to update data
    if (imageResults.streetView) {
      updateData.streetViewImage = {
        localPath: imageResults.streetView.localPath,
        filename: imageResults.streetView.filename,
        publicUrl: imageResults.streetView.publicUrl,
        downloadedAt: new Date(),
        size: await getFileSize(imageResults.streetView.localPath)
      };
    }

    if (imageResults.satellite) {
      updateData.satelliteImage = {
        localPath: imageResults.satellite.localPath,
        filename: imageResults.satellite.filename,
        publicUrl: imageResults.satellite.publicUrl,
        downloadedAt: new Date(),
        size: await getFileSize(imageResults.satellite.localPath)
      };
    }

    if (imageResults.roadmap) {
      updateData.roadmapImage = {
        localPath: imageResults.roadmap.localPath,
        filename: imageResults.roadmap.filename,
        publicUrl: imageResults.roadmap.publicUrl,
        downloadedAt: new Date(),
        size: await getFileSize(imageResults.roadmap.localPath)
      };
    }

    // Update the database record
    const updatedTurn = await SharpTurn.findByIdAndUpdate(
      turnId,
      updateData,
      { new: true }
    );

    return updatedTurn;
  } catch (error) {
    console.error('Database update error:', error);
    throw new Error(`Failed to update database: ${error.message}`);
  }
}

// Check what images exist in file system
async function checkFileSystemImages(downloadDir, baseFilename) {
  const images = {
    streetView: false,
    satellite: false,
    roadmap: false,
    metadata: false,
    any: false
  };

  try {
    // Check each image type
    const filesToCheck = [
      { type: 'streetView', filename: `${baseFilename}_street_view.jpg` },
      { type: 'satellite', filename: `${baseFilename}_satellite.jpg` },
      { type: 'roadmap', filename: `${baseFilename}_roadmap.jpg` },
      { type: 'metadata', filename: `${baseFilename}_metadata.json` }
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
  if (databaseImages.any && fileSystemImages.any) {
    return 'COMPLETE - Both database and files';
  } else if (fileSystemImages.any && !databaseImages.any) {
    return 'FILES_ONLY - Images exist but database not updated';
  } else if (databaseImages.any && !fileSystemImages.any) {
    return 'DATABASE_ONLY - Database has paths but files missing';
  } else {
    return 'MISSING - No images in database or files';
  }
}

// Generate public URL for image access
function getPublicImageUrl(routeId, filename) {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  return `${baseUrl}/downloads/sharp-turn-images/${routeId}/${filename}`;
}

// Get file size
async function getFileSize(filepath) {
  try {
    const stats = await fs.stat(filepath);
    return stats.size;
  } catch (error) {
    return 0;
  }
}

// Enhanced URL generation functions with better parameters
function generateStreetViewUrlEnhanced(turn, apiKey, quality) {
  const size = quality === 'high' ? '640x640' : '400x400';
  const fov = 120;
  
  // Smarter heading calculation
  let heading = 0;
  if (turn.turnDirection === 'left') heading = 270;
  else if (turn.turnDirection === 'right') heading = 90;
  else if (turn.turnDirection === 'hairpin') heading = 180;
  
  // Adjust based on turn angle
  const angleAdjustment = (turn.turnAngle || 0) * 0.3;
  heading = (heading + angleAdjustment) % 360;
  
  return `https://maps.googleapis.com/maps/api/streetview?` +
    `location=${turn.latitude},${turn.longitude}&` +
    `size=${size}&` +
    `heading=${heading}&` +
    `pitch=0&` +
    `fov=${fov}&` +
    `key=${apiKey}`;
}

function generateSatelliteUrlEnhanced(turn, apiKey, quality) {
  const size = quality === 'high' ? '640x640' : '400x400';
  const zoom = 18;
  
  // Risk-based marker color
  let markerColor = 'red';
  if (turn.riskScore >= 8) markerColor = 'red';
  else if (turn.riskScore >= 6) markerColor = 'orange';
  else if (turn.riskScore >= 4) markerColor = 'yellow';
  else markerColor = 'green';
  
  return `https://maps.googleapis.com/maps/api/staticmap?` +
    `center=${turn.latitude},${turn.longitude}&` +
    `zoom=${zoom}&` +
    `size=${size}&` +
    `maptype=satellite&` +
    `markers=color:${markerColor}%7Clabel:${Math.round(turn.riskScore)}%7C${turn.latitude},${turn.longitude}&` +
    `key=${apiKey}`;
}

function generateRoadmapUrlEnhanced(turn, apiKey, quality) {
  const size = quality === 'high' ? '640x640' : '400x400';
  const zoom = 17;
  
  // Risk-based marker
  let markerColor = 'red';
  if (turn.riskScore >= 8) markerColor = 'red';
  else if (turn.riskScore >= 6) markerColor = 'orange';
  else if (turn.riskScore >= 4) markerColor = 'yellow';
  else markerColor = 'green';
  
  return `https://maps.googleapis.com/maps/api/staticmap?` +
    `center=${turn.latitude},${turn.longitude}&` +
    `zoom=${zoom}&` +
    `size=${size}&` +
    `maptype=roadmap&` +
    `markers=color:${markerColor}%7Clabel:T%7C${turn.latitude},${turn.longitude}&` +
    `key=${apiKey}`;
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

module.exports = router;