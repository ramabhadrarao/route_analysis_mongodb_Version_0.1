// File: models/EmergencyService.js - Enhanced Version
// Purpose: Enhanced emergency service model with comprehensive fields

const mongoose = require('mongoose');

const emergencyServiceSchema = new mongoose.Schema({
  routeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route',
    required: true
  },
  serviceType: {
    type: String,
    enum: ['hospital', 'police', 'fire_station', 'ambulance', 'mechanic', 'educational', 'amenity', 'transport'],
    required: true
  },
  name: {
    type: String,
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
  
  // Contact Information
  phoneNumber: {
    type: String,
    default: 'Not available'
  },
  emergencyNumber: String,
  website: String,
  
  // Location Details
  address: String,
  operatingHours: String,
  
  // Distance Information
  distanceFromRouteKm: {
    type: Number,
    min: 0
  },
  distanceFromStartKm: {
    type: Number,
    min: 0
  },
  distanceFromEndKm: {
    type: Number,
    min: 0
  },
  
  // Service Information
  servicesOffered: [String],
  responseTimeMinutes: {
    type: Number,
    min: 0
  },
  availabilityScore: {
    type: Number,
    min: 1,
    max: 10
  },
  
  // Quality Metrics
  priority: {
    type: String,
    enum: ['critical', 'high', 'medium', 'low'],
    default: 'medium'
  },
  rating: {
    type: Number,
    min: 0,
    max: 5,
    default: 0
  },
  priceLevel: {
    type: Number,
    min: 0,
    max: 4,
    default: 0
  },
  
  // Accessibility & Features
  accessibility: String,
  amenities: [String],
  isOpen24Hours: {
    type: Boolean,
    default: false
  },
  
  // Specialized Fields for Different Service Types
  
  // For Medical Services
  specializations: [String],
  emergencyServices: [String],
  
  // For Law Enforcement
  jurisdiction: String,
  specializedUnits: [String],
  
  // For Fire & Rescue
  equipment: [String],
  
  // For Fuel Stations
  fuelTypes: [String],
  hasATM: Boolean,
  hasRestroom: Boolean,
  hasConvenienceStore: Boolean,
  
  // For Educational Institutions
  institutionType: String,
  studentCapacity: Number,
  safetyFeatures: [String],
  emergencyContact: String,
  
  // For Food & Rest Stops
  stopType: String,
  cuisineType: String,
  parkingAvailable: Boolean,
  truckFriendly: Boolean,
  restFacilities: [String],
  
  // For Transportation Hubs
  hubType: String,
  transportModes: [String],
  connectivity: String,
  facilities: [String],
  
  // Additional Metadata
  dataSource: String,
  verificationStatus: {
    type: String,
    enum: ['verified', 'unverified', 'needs_verification'],
    default: 'unverified'
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
emergencyServiceSchema.index({ routeId: 1 });
emergencyServiceSchema.index({ serviceType: 1 });
emergencyServiceSchema.index({ distanceFromRouteKm: 1 });
emergencyServiceSchema.index({ priority: 1 });
emergencyServiceSchema.index({ rating: -1 });
emergencyServiceSchema.index({ distanceFromStartKm: 1 });
emergencyServiceSchema.index({ latitude: 1, longitude: 1 });

// Virtual for formatted distance
emergencyServiceSchema.virtual('formattedDistance').get(function() {
  if (this.distanceFromRouteKm < 1) {
    return `${Math.round(this.distanceFromRouteKm * 1000)}m`;
  }
  return `${this.distanceFromRouteKm.toFixed(1)}km`;
});

// Virtual for response time category
emergencyServiceSchema.virtual('responseCategory').get(function() {
  if (this.responseTimeMinutes <= 10) return 'immediate';
  if (this.responseTimeMinutes <= 20) return 'fast';
  if (this.responseTimeMinutes <= 30) return 'moderate';
  return 'slow';
});

// Method to calculate priority score
emergencyServiceSchema.methods.calculatePriorityScore = function() {
  let score = 0;
  
  // Priority weight
  const priorityWeights = { critical: 4, high: 3, medium: 2, low: 1 };
  score += priorityWeights[this.priority] || 2;
  
  // Distance weight (closer is better)
  if (this.distanceFromRouteKm <= 5) score += 3;
  else if (this.distanceFromRouteKm <= 15) score += 2;
  else if (this.distanceFromRouteKm <= 30) score += 1;
  
  // Availability weight
  score += Math.floor(this.availabilityScore / 3);
  
  // 24/7 bonus
  if (this.isOpen24Hours) score += 1;
  
  return Math.min(10, score);
};

// Static method to find nearest services
emergencyServiceSchema.statics.findNearestServices = function(routeId, serviceType, maxDistance = 50) {
  return this.find({
    routeId,
    serviceType,
    distanceFromRouteKm: { $lte: maxDistance }
  })
  .sort({ distanceFromRouteKm: 1, availabilityScore: -1 })
  .limit(10);
};

// Static method to get service coverage analysis
emergencyServiceSchema.statics.getServiceCoverage = function(routeId) {
  return this.aggregate([
    { $match: { routeId: new mongoose.Types.ObjectId(routeId) }},
    {
      $group: {
        _id: '$serviceType',
        count: { $sum: 1 },
        avgDistance: { $avg: '$distanceFromRouteKm' },
        avgResponseTime: { $avg: '$responseTimeMinutes' },
        avgRating: { $avg: '$rating' },
        nearest: { $min: '$distanceFromRouteKm' },
        farthest: { $max: '$distanceFromRouteKm' }
      }
    },
    { $sort: { count: -1 }}
  ]);
};

// Transform JSON output
emergencyServiceSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('EmergencyService', emergencyServiceSchema);