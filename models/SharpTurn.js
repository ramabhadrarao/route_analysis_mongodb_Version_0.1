// File: models/SharpTurn.js - ENHANCED VERSION WITH EXTENDED IMAGE SUPPORT
// Purpose: Enhanced Sharp Turn model with comprehensive image storage
// MAINTAINS COMPATIBILITY with existing fields while adding new image capabilities

const mongoose = require('mongoose');

const sharpTurnSchema = new mongoose.Schema({
  routeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route',
    required: true
  },
  latitude: {
    type: Number,
    required: true,
    min: -90,
    max: 90
  },
  longitude: {
    type: Number,
    required: true,
    min: -180,
    max: 180
  },
  
  // Distance Information
  distanceFromStartKm: {
    type: Number,
    min: 0
  },
  
  // Turn Analysis
  turnAngle: {
    type: Number,
    required: true,
    min: 0,
    max: 180 // Degrees
  },
  
  turnDirection: {
    type: String,
    enum: ['left', 'right', 'hairpin', 'straight'],
    required: true,
    default: 'straight'
  },
  
  turnRadius: {
    type: Number,
    min: 0 // Meters
  },
  approachSpeed: {
    type: Number,
    default: 40 // km/h
  },
  recommendedSpeed: {
    type: Number,
    required: true // km/h
  },
  
  // Risk Assessment
  riskScore: {
    type: Number,
    min: 1,
    max: 10,
    required: true,
    validate: {
      validator: function(v) {
        return !isNaN(v) && isFinite(v) && v >= 1 && v <= 10;
      },
      message: 'Risk score must be a valid number between 1 and 10'
    }
  },
  turnSeverity: {
    type: String,
    enum: ['gentle', 'moderate', 'sharp', 'hairpin'],
    required: true
  },
  
  // ============================================================================
  // ENHANCED IMAGE DATA FIELDS (Backward Compatible)
  // ============================================================================
  
  // Original streetViewImage field (kept for compatibility)
  streetViewImage: {
    url: String,
    filename: String,
    heading: Number, // Direction of camera
    pitch: Number,   // Up/down angle
    fov: Number,     // Field of view
    
    // NEW: Enhanced fields for downloaded images
    localPath: String,        // Local file path
    publicUrl: String,        // Public accessible URL
    downloadedAt: Date,       // When image was downloaded
    size: Number,             // File size in bytes
    quality: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'high'
    },
    downloadStatus: {
      type: String,
      enum: ['pending', 'downloading', 'completed', 'failed'],
      default: 'pending'
    }
  },
  
  // NEW: Satellite image field (separate from mapImage for clarity)
  satelliteImage: {
    url: String,              // Google Maps satellite API URL
    filename: String,         // File name
    localPath: String,        // Local file path
    publicUrl: String,        // Public accessible URL
    downloadedAt: Date,       // When image was downloaded
    size: Number,             // File size in bytes
    zoom: {
      type: Number,
      default: 18
    },
    quality: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'high'
    },
    downloadStatus: {
      type: String,
      enum: ['pending', 'downloading', 'completed', 'failed'],
      default: 'pending'
    }
  },
  
  // Enhanced mapImage field (kept for compatibility, enhanced for roadmap)
  mapImage: {
    url: String,
    filename: String,
    zoom: Number,
    mapType: String,
    
    // NEW: Enhanced fields
    localPath: String,        // Local file path
    publicUrl: String,        // Public accessible URL
    downloadedAt: Date,       // When image was downloaded
    size: Number,             // File size in bytes
    quality: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'high'
    },
    downloadStatus: {
      type: String,
      enum: ['pending', 'downloading', 'completed', 'failed'],
      default: 'pending'
    }
  },
  
  // NEW: Roadmap image field (dedicated for roadmap downloads)
  roadmapImage: {
    url: String,              // Google Maps roadmap API URL
    filename: String,         // File name
    localPath: String,        // Local file path
    publicUrl: String,        // Public accessible URL
    downloadedAt: Date,       // When image was downloaded
    size: Number,             // File size in bytes
    zoom: {
      type: Number,
      default: 17
    },
    quality: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'high'
    },
    downloadStatus: {
      type: String,
      enum: ['pending', 'downloading', 'completed', 'failed'],
      default: 'pending'
    }
  },
  
  // ============================================================================
  // IMAGE METADATA & TRACKING
  // ============================================================================
  
  // Track overall image download status
  imageDownloadInfo: {
    totalImages: {
      type: Number,
      default: 0
    },
    completedImages: {
      type: Number,
      default: 0
    },
    lastDownloadAttempt: Date,
    lastSuccessfulDownload: Date,
    downloadErrors: [String],
    imageTypes: [{
      type: String,
      enum: ['street_view', 'satellite', 'roadmap', 'map']
    }]
  },
  
  // ============================================================================
  // EXISTING FIELDS (Unchanged)
  // ============================================================================
  
  // Live Links (kept as-is)
  streetViewLink: String,
  mapsLink: String,
  
  // Environmental Factors
  visibility: {
    type: String,
    enum: ['excellent', 'good', 'limited', 'poor'],
    default: 'good'
  },
  roadSurface: {
    type: String,
    enum: ['excellent', 'good', 'fair', 'poor'],
    default: 'good'
  },
  bankingAngle: {
    type: Number,
    default: 0 // Degrees of road banking
  },
  elevation: Number,
  
  // Safety Features
  guardrails: {
    type: Boolean,
    default: false
  },
  warningSigns: {
    type: Boolean,
    default: false
  },
  lightingAvailable: {
    type: Boolean,
    default: false
  },
  
  // Analysis Method
  analysisMethod: {
    type: String,
    enum: [
      'gps_data', 
      'satellite_imagery', 
      'street_view', 
      'manual',
      'enhanced_gps_analysis',
      'real_calculations',
      'geometric_analysis'
    ],
    default: 'gps_data'
  },
  
  confidence: {
    type: Number,
    min: 0,
    max: 1,
    default: 0.8,
    validate: {
      validator: function(v) {
        return !isNaN(v) && isFinite(v) && v >= 0 && v <= 1;
      },
      message: 'Confidence must be a valid number between 0 and 1'
    }
  },
  
  // Metadata
  dataSource: {
    type: String,
    default: 'ROUTE_ANALYSIS'
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
sharpTurnSchema.index({ routeId: 1 });
sharpTurnSchema.index({ riskScore: -1 });
sharpTurnSchema.index({ turnSeverity: 1 });
sharpTurnSchema.index({ distanceFromStartKm: 1 });
sharpTurnSchema.index({ 'imageDownloadInfo.completedImages': 1 }); // NEW: Index for image tracking

// ============================================================================
// ENHANCED METHODS WITH IMAGE SUPPORT
// ============================================================================

// Pre-save validation with image tracking
sharpTurnSchema.pre('save', function(next) {
  try {
    // Handle straight turns (angle < 15 degrees)
    if (this.turnAngle < 15) {
      this.turnDirection = 'straight';
      this.turnSeverity = 'gentle';
    }
    
    // Validate and fix numeric fields
    if (isNaN(this.riskScore) || !isFinite(this.riskScore)) {
      this.riskScore = 5; // Default medium risk
    }
    
    if (isNaN(this.confidence) || !isFinite(this.confidence)) {
      this.confidence = 0.8; // Default confidence
    }
    
    // Auto-set severity based on angle if not set
    if (!this.turnSeverity || this.turnSeverity === 'gentle') {
      if (this.turnAngle > 120) this.turnSeverity = 'hairpin';
      else if (this.turnAngle > 90) this.turnSeverity = 'sharp';
      else if (this.turnAngle > 45) this.turnSeverity = 'moderate';
      else this.turnSeverity = 'gentle';
    }
    
    // NEW: Update image tracking information
    this.updateImageDownloadInfo();
    
    // Update lastUpdated
    this.lastUpdated = new Date();
    
    next();
  } catch (error) {
    console.error('SharpTurn pre-save validation error:', error);
    next(error);
  }
});

// NEW: Update image download tracking info
sharpTurnSchema.methods.updateImageDownloadInfo = function() {
  if (!this.imageDownloadInfo) {
    this.imageDownloadInfo = {
      totalImages: 0,
      completedImages: 0,
      imageTypes: []
    };
  }
  
  let completedCount = 0;
  const imageTypes = [];
  
  // Check street view image
  if (this.streetViewImage && this.streetViewImage.downloadStatus === 'completed') {
    completedCount++;
    imageTypes.push('street_view');
  }
  
  // Check satellite image
  if (this.satelliteImage && this.satelliteImage.downloadStatus === 'completed') {
    completedCount++;
    imageTypes.push('satellite');
  }
  
  // Check roadmap image
  if (this.roadmapImage && this.roadmapImage.downloadStatus === 'completed') {
    completedCount++;
    imageTypes.push('roadmap');
  }
  
  // Check map image (legacy)
  if (this.mapImage && this.mapImage.downloadStatus === 'completed') {
    completedCount++;
    if (!imageTypes.includes('roadmap')) { // Avoid duplicate if roadmap is also set
      imageTypes.push('map');
    }
  }
  
  this.imageDownloadInfo.completedImages = completedCount;
  this.imageDownloadInfo.imageTypes = imageTypes;
  this.imageDownloadInfo.totalImages = Math.max(completedCount, this.imageDownloadInfo.totalImages || 0);
  
  if (completedCount > 0) {
    this.imageDownloadInfo.lastSuccessfulDownload = new Date();
  }
};

// Virtual for risk category (unchanged)
sharpTurnSchema.virtual('riskCategory').get(function() {
  if (this.riskScore >= 8) return 'critical';
  if (this.riskScore >= 6) return 'high';
  if (this.riskScore >= 4) return 'medium';
  return 'low';
});

// NEW: Virtual for image completion status
sharpTurnSchema.virtual('imageCompletionStatus').get(function() {
  if (!this.imageDownloadInfo || this.imageDownloadInfo.completedImages === 0) {
    return 'no_images';
  }
  
  const expectedImages = 3; // street_view, satellite, roadmap
  const completed = this.imageDownloadInfo.completedImages;
  
  if (completed >= expectedImages) return 'complete';
  if (completed >= 2) return 'mostly_complete';
  if (completed >= 1) return 'partial';
  return 'no_images';
});

// NEW: Check if all images are downloaded
sharpTurnSchema.virtual('hasAllImages').get(function() {
  return this.imageCompletionStatus === 'complete';
});

// Method to generate street view link (enhanced)
sharpTurnSchema.methods.generateStreetViewLink = function() {
  const baseUrl = 'https://www.google.com/maps/@';
  const heading = this.streetViewImage?.heading || 0;
  const params = `${this.latitude},${this.longitude},3a,75y,${heading}h,90t`;
  this.streetViewLink = `${baseUrl}${params}`;
  return this.streetViewLink;
};

// Method to generate maps link (unchanged)
sharpTurnSchema.methods.generateMapsLink = function() {
  this.mapsLink = `https://www.google.com/maps/place/${this.latitude},${this.longitude}/@${this.latitude},${this.longitude},17z`;
  return this.mapsLink;
};

// NEW: Method to update image download status
sharpTurnSchema.methods.updateImageStatus = function(imageType, status, imageData = {}) {
  const validTypes = ['streetView', 'satellite', 'roadmap', 'map'];
  const validStatuses = ['pending', 'downloading', 'completed', 'failed'];
  
  if (!validTypes.includes(imageType) || !validStatuses.includes(status)) {
    throw new Error('Invalid image type or status');
  }
  
  const imageField = imageType + 'Image';
  
  if (!this[imageField]) {
    this[imageField] = {};
  }
  
  this[imageField].downloadStatus = status;
  
  if (status === 'completed' && imageData) {
    Object.assign(this[imageField], {
      ...imageData,
      downloadedAt: new Date()
    });
  }
  
  if (status === 'failed' && imageData.error) {
    if (!this.imageDownloadInfo) this.imageDownloadInfo = {};
    if (!this.imageDownloadInfo.downloadErrors) this.imageDownloadInfo.downloadErrors = [];
    this.imageDownloadInfo.downloadErrors.push(`${imageType}: ${imageData.error}`);
  }
  
  this.updateImageDownloadInfo();
};

// NEW: Method to get image summary
sharpTurnSchema.methods.getImageSummary = function() {
  return {
    street_view: {
      exists: !!(this.streetViewImage && this.streetViewImage.downloadStatus === 'completed'),
      filename: this.streetViewImage?.filename,
      publicUrl: this.streetViewImage?.publicUrl,
      size: this.streetViewImage?.size,
      downloadedAt: this.streetViewImage?.downloadedAt
    },
    satellite: {
      exists: !!(this.satelliteImage && this.satelliteImage.downloadStatus === 'completed'),
      filename: this.satelliteImage?.filename,
      publicUrl: this.satelliteImage?.publicUrl,
      size: this.satelliteImage?.size,
      downloadedAt: this.satelliteImage?.downloadedAt
    },
    roadmap: {
      exists: !!(this.roadmapImage && this.roadmapImage.downloadStatus === 'completed'),
      filename: this.roadmapImage?.filename,
      publicUrl: this.roadmapImage?.publicUrl,
      size: this.roadmapImage?.size,
      downloadedAt: this.roadmapImage?.downloadedAt
    },
    completion: this.imageCompletionStatus,
    totalImages: this.imageDownloadInfo?.completedImages || 0
  };
};

// Enhanced safety recommendations method (unchanged)
sharpTurnSchema.methods.getSafetyRecommendations = function() {
  const recommendations = [];
  
  // Risk-based recommendations
  if (this.riskScore >= 8) {
    recommendations.push('CRITICAL: Reduce speed to 15-25 km/h');
    recommendations.push('Use convoy travel with constant communication');
    recommendations.push('Consider alternative route if possible');
  } else if (this.riskScore >= 6) {
    recommendations.push('HIGH RISK: Reduce speed significantly');
    recommendations.push('Exercise extreme caution');
  }
  
  // Turn-specific recommendations
  if (this.turnSeverity === 'hairpin') {
    recommendations.push('Hairpin turn: Use engine braking');
    recommendations.push('Stay in center of lane');
    recommendations.push('No overtaking allowed');
  } else if (this.turnSeverity === 'sharp') {
    recommendations.push('Sharp turn: Reduce speed before entering');
    recommendations.push('Position for maximum visibility');
  }
  
  // Safety feature recommendations
  if (!this.guardrails) {
    recommendations.push('No guardrails: Exercise extra caution');
  }
  
  if (!this.warningSigns) {
    recommendations.push('No warning signs: Approach with extreme care');
  }
  
  if (this.visibility === 'poor' || this.visibility === 'limited') {
    recommendations.push('Poor visibility: Use horn when approaching');
    recommendations.push('Maintain constant vigilance');
  }
  
  return recommendations;
};

// Enhanced static method for route analysis with image info
SharpTurnSchema.statics.getRouteSharpTurnsAnalysis = function(routeId) {
  return this.aggregate([
    { $match: { routeId: mongoose.Types.ObjectId(routeId) } },
    {
      $group: {
        _id: '$routeId',
        totalTurns: { $sum: 1 },
        avgRiskScore: { $avg: '$riskScore' },
        maxRiskScore: { $max: '$riskScore' },
        criticalTurns: {
          $sum: { $cond: [{ $gte: ['$riskScore', 8] }, 1, 0] }
        },
        highRiskTurns: {
          $sum: { $cond: [{ $gte: ['$riskScore', 6] }, 1, 0] }
        },
        // ✅ FIXED: Use separate accumulator fields
        hairpinCount: { $sum: { $cond: [{ $eq: ['$turnSeverity', 'hairpin'] }, 1, 0] } },
        sharpCount: { $sum: { $cond: [{ $eq: ['$turnSeverity', 'sharp'] }, 1, 0] } },
        moderateCount: { $sum: { $cond: [{ $eq: ['$turnSeverity', 'moderate'] }, 1, 0] } },
        gentleCount: { $sum: { $cond: [{ $eq: ['$turnSeverity', 'gentle'] }, 1, 0] } }
      }
    },
    {
      // ✅ Add projection stage to create nested severityBreakdown object
      $project: {
        _id: 1,
        totalTurns: 1,
        avgRiskScore: 1,
        maxRiskScore: 1,
        criticalTurns: 1,
        highRiskTurns: 1,
        severityBreakdown: {
          hairpin: '$hairpinCount',
          sharp: '$sharpCount',
          moderate: '$moderateCount',
          gentle: '$gentleCount'
        }
      }
    }
  ]);
};

// NEW: Static method to get image download statistics
sharpTurnSchema.statics.getImageDownloadStats = function(routeId) {
  return this.aggregate([
    { $match: { routeId: new mongoose.Types.ObjectId(routeId) }},
    {
      $group: {
        _id: null,
        totalTurns: { $sum: 1 },
        turnsWithStreetView: {
          $sum: { $cond: [{ $eq: ['$streetViewImage.downloadStatus', 'completed'] }, 1, 0] }
        },
        turnsWithSatellite: {
          $sum: { $cond: [{ $eq: ['$satelliteImage.downloadStatus', 'completed'] }, 1, 0] }
        },
        turnsWithRoadmap: {
          $sum: { $cond: [{ $eq: ['$roadmapImage.downloadStatus', 'completed'] }, 1, 0] }
        },
        turnsWithAllImages: {
          $sum: { $cond: [{ $gte: ['$imageDownloadInfo.completedImages', 3] }, 1, 0] }
        },
        turnsWithNoImages: {
          $sum: { $cond: [{ $eq: ['$imageDownloadInfo.completedImages', 0] }, 1, 0] }
        }
      }
    }
  ]);
};

// Transform JSON output with image info
sharpTurnSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    delete ret._id;
    
    // Ensure numeric fields are valid
    if (isNaN(ret.riskScore)) ret.riskScore = 5;
    if (isNaN(ret.confidence)) ret.confidence = 0.8;
    
    // Add image summary to JSON output
    ret.imageSummary = doc.getImageSummary();
    
    return ret;
  }
});

module.exports = mongoose.model('SharpTurn', sharpTurnSchema);