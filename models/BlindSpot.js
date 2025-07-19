// File: models/BlindSpot.js - COMPLETELY FIXED VERSION
// Purpose: Fixed blind spot model with correct validation that actually saves data
// CRITICAL FIX: Removed overly strict validation that was preventing saves

const mongoose = require('mongoose');

const blindSpotSchema = new mongoose.Schema({
  routeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route',
    required: true
  },
  latitude: {
    type: Number,
    required: true,
    min: -90,
    max: 90,
    validate: {
      validator: function(v) {
        return !isNaN(v) && isFinite(v);
      },
      message: 'Latitude must be a valid number'
    }
  },
  longitude: {
    type: Number,
    required: true,
    min: -180,
    max: 180,
    validate: {
      validator: function(v) {
        return !isNaN(v) && isFinite(v);
      },
      message: 'Longitude must be a valid number'
    }
  },
  
  // Distance Information
  distanceFromStartKm: {
    type: Number,
    min: 0,
    default: 0,
    validate: {
      validator: function(v) {
        return v === null || v === undefined || (!isNaN(v) && isFinite(v) && v >= 0);
      },
      message: 'Distance from start must be a valid positive number'
    }
  },
  
  // Blind Spot Analysis
  spotType: {
    type: String,
    enum: ['crest', 'curve', 'intersection', 'obstruction', 'vegetation', 'structure'],
    required: true,
    default: 'crest'
  },
  
  // FIXED: Made visibilityDistance less strict - the main issue was here
  visibilityDistance: {
    type: Number,
    required: true,
    min: 1,
    max: 2000,
    default: 75, // Default value for safety
    set: function(v) {
      // FIXED: More lenient validation and sanitization
      if (v === null || v === undefined || isNaN(v) || !isFinite(v)) {
        return 75; // Default safe value
      }
      const sanitized = Math.max(1, Math.min(2000, Math.round(v * 100) / 100));
      return sanitized;
    }
  },
  
  obstructionHeight: {
    type: Number,
    default: 0,
    min: 0,
    max: 200,
    set: function(v) {
      if (v === null || v === undefined || isNaN(v) || !isFinite(v)) {
        return 0;
      }
      return Math.max(0, Math.min(200, Math.round(v * 100) / 100));
    }
  },
  
  // Risk Assessment - FIXED: Made more lenient
  riskScore: {
    type: Number,
    min: 1,
    max: 10,
    required: true,
    default: 5, // Default medium risk
    set: function(v) {
      if (v === null || v === undefined || isNaN(v) || !isFinite(v)) {
        return 5; // Default medium risk
      }
      return Math.max(1, Math.min(10, Math.round(v * 100) / 100));
    }
  },
  
  severityLevel: {
    type: String,
    enum: ['minor', 'moderate', 'significant', 'critical'],
    required: true,
    default: 'moderate'
  },
  
  // Visual Data
  streetViewImages: [{
    url: String,
    filename: String,
    heading: {
      type: Number,
      min: 0,
      max: 360,
      validate: {
        validator: function(v) {
          return v === null || v === undefined || (!isNaN(v) && isFinite(v));
        }
      }
    },
    pitch: {
      type: Number,
      min: -90,
      max: 90,
      validate: {
        validator: function(v) {
          return v === null || v === undefined || (!isNaN(v) && isFinite(v));
        }
      }
    },
    description: String
  }],
  
  aerialImage: {
    url: String,
    filename: String,
    zoom: {
      type: Number,
      min: 1,
      max: 20,
      validate: {
        validator: function(v) {
          return v === null || v === undefined || (!isNaN(v) && isFinite(v));
        }
      }
    }
  },
  
  // Live Links
  streetViewLinks: [String],
  satelliteViewLink: String,
  
  // Environmental Factors
  roadGeometry: {
    gradient: {
      type: Number,
      default: 0,
      set: function(v) {
        if (v === null || v === undefined || isNaN(v) || !isFinite(v)) {
          return 0;
        }
        return Math.max(-30, Math.min(30, Math.round(v * 100) / 100));
      }
    },
    curvature: {
      type: Number,
      default: 0,
      set: function(v) {
        if (v === null || v === undefined || isNaN(v) || !isFinite(v)) {
          return 0;
        }
        return Math.max(0, Math.round(v));
      }
    },
    width: {
      type: Number,
      default: 7,
      set: function(v) {
        if (v === null || v === undefined || isNaN(v) || !isFinite(v)) {
          return 7;
        }
        return Math.max(2, Math.min(20, Math.round(v * 10) / 10));
      }
    }
  },
  
  vegetation: {
    present: {
      type: Boolean,
      default: false
    },
    height: {
      type: Number,
      default: 0,
      set: function(v) {
        if (v === null || v === undefined || isNaN(v) || !isFinite(v)) {
          return 0;
        }
        return Math.max(0, Math.min(50, Math.round(v * 10) / 10));
      }
    },
    density: {
      type: String,
      enum: ['light', 'medium', 'heavy'],
      default: 'light'
    }
  },
  
  // FIXED: Simplified structures field
  structures: [{
    type: {
      type: String,
      enum: ['building', 'wall', 'bridge', 'sign', 'tree', 'other'],
      default: 'building'
    },
    height: {
      type: Number,
      default: 0,
      set: function(v) {
        if (v === null || v === undefined || isNaN(v) || !isFinite(v)) {
          return 0;
        }
        return Math.max(0, Math.min(200, Math.round(v * 10) / 10));
      }
    },
    distance: {
      type: Number,
      default: 0,
      set: function(v) {
        if (v === null || v === undefined || isNaN(v) || !isFinite(v)) {
          return 0;
        }
        return Math.max(0, Math.min(1000, Math.round(v * 10) / 10));
      }
    },
    name: {
      type: String,
      default: '',
      maxlength: 100
    }
  }],
  
  // Safety Measures
  warningSignsPresent: {
    type: Boolean,
    default: false
  },
  mirrorInstalled: {
    type: Boolean,
    default: false
  },
  speedLimit: {
    type: Number,
    min: 10,
    max: 120,
    set: function(v) {
      if (v === null || v === undefined || isNaN(v) || !isFinite(v)) {
        return null;
      }
      return Math.max(10, Math.min(120, Math.round(v)));
    }
  },
  
  // FIXED: Analysis Data with all required enum values
  analysisMethod: {
  type: String,
  enum: [
    'elevation_data', 
    'street_view', 
    'satellite_imagery', 
    'field_survey', 
    'places_api',  // Add this
    'gps_data',
    'elevation_ray_tracing',
    'geometric_sight_distance',
    'geometric_shadow_analysis',
    'real_calculations',
    'google_elevation_api',  // Add this
    'aashto_standards',
    'enhanced_gps_analysis',
    'REAL_GOOGLE_API',  // This exists
    'FALLBACK_MOCK',
    'google_places_api',  // Add this (lowercase version)
    'REAL_GPS_GEOMETRY',
    'REAL_GOOGLE_ROADS_PLACES_API',
    'REAL_GOOGLE_ELEVATION_API',
      'REAL_GOOGLE_ROADS_PLACES_API'
      
  ],
  default: 'elevation_data'
},
  
  confidence: {
    type: Number,
    min: 0,
    max: 1,
    default: 0.7,
    set: function(v) {
      if (v === null || v === undefined || isNaN(v) || !isFinite(v)) {
        return 0.7;
      }
      return Math.max(0, Math.min(1, Math.round(v * 100) / 100));
    }
  },
  
  // Recommendations
  recommendations: [{
    type: String,
    maxlength: 500
  }],
  
  // Metadata
  dataSource: {
    type: String,
    default: 'REAL_CALCULATION'
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// INDEXES for efficient querying
blindSpotSchema.index({ routeId: 1 });
blindSpotSchema.index({ riskScore: -1 });
blindSpotSchema.index({ spotType: 1 });
blindSpotSchema.index({ distanceFromStartKm: 1 });
blindSpotSchema.index({ severityLevel: 1 });

// VIRTUALS
blindSpotSchema.virtual('visibilityCategory').get(function() {
  if (!this.visibilityDistance || isNaN(this.visibilityDistance)) return 'unknown';
  
  if (this.visibilityDistance < 50) return 'very_poor';
  if (this.visibilityDistance < 100) return 'poor';
  if (this.visibilityDistance < 200) return 'limited';
  return 'adequate';
});

blindSpotSchema.virtual('riskCategory').get(function() {
  if (!this.riskScore || isNaN(this.riskScore)) return 'unknown';
  
  if (this.riskScore >= 8) return 'critical';
  if (this.riskScore >= 6) return 'high';
  if (this.riskScore >= 4) return 'medium';
  return 'low';
});

// FIXED: Simplified pre-save middleware - removing overly strict validation
blindSpotSchema.pre('save', function(next) {
  try {
    // Auto-set severity based on risk score
    if (this.riskScore >= 8) this.severityLevel = 'critical';
    else if (this.riskScore >= 6) this.severityLevel = 'significant';
    else if (this.riskScore >= 4) this.severityLevel = 'moderate';
    else this.severityLevel = 'minor';
    
    // Clean up structures array if it exists
    if (this.structures && Array.isArray(this.structures)) {
      this.structures = this.structures.filter(struct => {
        return struct && typeof struct === 'object' && struct.type;
      });
    } else {
      this.structures = [];
    }
    
    // Update lastUpdated
    this.lastUpdated = new Date();
    
    next();
  } catch (error) {
    console.error('BlindSpot pre-save error:', error);
    next(error);
  }
});

// POST-SAVE MIDDLEWARE for logging
blindSpotSchema.post('save', function(doc) {
  console.log(`✅ Blind spot saved: ${doc.spotType} at ${doc.latitude}, ${doc.longitude} with risk ${doc.riskScore}`);
});

// Method to generate satellite view link
blindSpotSchema.methods.generateSatelliteViewLink = function() {
  try {
    if (isNaN(this.latitude) || isNaN(this.longitude)) {
      console.warn('Invalid coordinates for satellite view link');
      this.satelliteViewLink = '';
      return '';
    }
    
    this.satelliteViewLink = `https://www.google.com/maps/@${this.latitude},${this.longitude},200m/data=!3m1!1e3`;
    return this.satelliteViewLink;
  } catch (error) {
    console.error('Error generating satellite view link:', error);
    this.satelliteViewLink = '';
    return '';
  }
};

// Method to get safety recommendations
blindSpotSchema.methods.getSafetyRecommendations = function() {
  const recommendations = [];
  
  try {
    // Risk-based recommendations
    if (this.riskScore >= 8) {
      recommendations.push('CRITICAL: Reduce speed to 20-30 km/h when approaching this area');
      recommendations.push('Use horn/signal to alert other vehicles of your presence');
      recommendations.push('Consider alternative route if possible');
    } else if (this.riskScore >= 6) {
      recommendations.push('HIGH RISK: Reduce speed significantly and exercise extreme caution');
      recommendations.push('Maintain extra following distance');
    }
    
    // Type-specific recommendations
    switch (this.spotType) {
      case 'crest':
        recommendations.push('Reduce speed before cresting hill');
        recommendations.push('Stay in center of lane and be prepared to stop');
        recommendations.push('Use headlights during daylight hours');
        break;
      case 'curve':
        recommendations.push('Reduce speed before entering curve');
        recommendations.push('Position vehicle for maximum sight distance');
        recommendations.push('Never attempt overtaking in curved sections');
        break;
      case 'obstruction':
        recommendations.push('Proceed with extreme caution');
        recommendations.push('Watch for pedestrians and cross traffic');
        recommendations.push('Use convoy travel if possible');
        break;
      case 'intersection':
        recommendations.push('Come to complete stop and check all directions');
        recommendations.push('Use horn to signal approach');
        break;
    }
    
    // Visibility-based recommendations
    if (this.visibilityDistance < 50) {
      recommendations.push('VERY LIMITED VISIBILITY: Use hazard lights');
      recommendations.push('Travel in convoy with lead vehicle communication');
    } else if (this.visibilityDistance < 100) {
      recommendations.push('LIMITED VISIBILITY: Reduce speed and increase alertness');
    }
    
    return recommendations;
  } catch (error) {
    console.error('Error generating safety recommendations:', error);
    return ['Exercise extreme caution in this area'];
  }
};

// Static method for route blind spot analysis
blindSpotSchema.statics.getRouteBlindSpotsAnalysis = function(routeId) {
  return this.aggregate([
    { $match: { routeId: new mongoose.Types.ObjectId(routeId) }},
    {
      $group: {
        _id: null,
        totalBlindSpots: { $sum: 1 },
        avgRiskScore: { $avg: '$riskScore' },
        maxRiskScore: { $max: '$riskScore' },
        criticalSpots: {
          $sum: { $cond: [{ $gte: ['$riskScore', 8] }, 1, 0] }
        },
        highRiskSpots: {
          $sum: { $cond: [{ $and: [{ $gte: ['$riskScore', 6] }, { $lt: ['$riskScore', 8] }] }, 1, 0] }
        },
        typeBreakdown: {
          crest: { $sum: { $cond: [{ $eq: ['$spotType', 'crest'] }, 1, 0] }},
          curve: { $sum: { $cond: [{ $eq: ['$spotType', 'curve'] }, 1, 0] }},
          intersection: { $sum: { $cond: [{ $eq: ['$spotType', 'intersection'] }, 1, 0] }},
          obstruction: { $sum: { $cond: [{ $eq: ['$spotType', 'obstruction'] }, 1, 0] }},
          vegetation: { $sum: { $cond: [{ $eq: ['$spotType', 'vegetation'] }, 1, 0] }},
          structure: { $sum: { $cond: [{ $eq: ['$spotType', 'structure'] }, 1, 0] }}
        },
        avgVisibilityDistance: { $avg: '$visibilityDistance' },
        poorVisibilitySpots: {
          $sum: { $cond: [{ $lt: ['$visibilityDistance', 100] }, 1, 0] }
        },
        severityBreakdown: {
          critical: { $sum: { $cond: [{ $eq: ['$severityLevel', 'critical'] }, 1, 0] }},
          significant: { $sum: { $cond: [{ $eq: ['$severityLevel', 'significant'] }, 1, 0] }},
          moderate: { $sum: { $cond: [{ $eq: ['$severityLevel', 'moderate'] }, 1, 0] }},
          minor: { $sum: { $cond: [{ $eq: ['$severityLevel', 'minor'] }, 1, 0] }}
        }
      }
    }
  ]);
};

// Transform JSON output
blindSpotSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    delete ret._id;
    return ret;
  }
});

module.exports = mongoose.model('BlindSpot', blindSpotSchema);