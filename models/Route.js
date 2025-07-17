// File: models/Route.js
// Purpose: Enhanced route schema with GPS upload support

const mongoose = require('mongoose');

// Route Points Sub-schema
const routePointSchema = new mongoose.Schema({
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
  pointOrder: {
    type: Number,
    required: true
  },
  elevation: Number,
  address: String,
  distanceFromStart: Number, // in km
  distanceToEnd: Number // in km
}, { _id: false });

// Risk Scores Sub-schema
const riskScoreSchema = new mongoose.Schema({
  roadConditions: { type: Number, default: 0 },
  accidentProne: { type: Number, default: 0 },
  sharpTurns: { type: Number, default: 0 },
  blindSpots: { type: Number, default: 0 },
  twoWayTraffic: { type: Number, default: 0 },
  trafficDensity: { type: Number, default: 0 },
  weatherConditions: { type: Number, default: 0 },
  emergencyServices: { type: Number, default: 0 },
  networkCoverage: { type: Number, default: 0 },
  amenities: { type: Number, default: 0 },
  securityIssues: { type: Number, default: 0 },
  totalWeightedScore: { type: Number, default: 0 },
  riskGrade: {
    type: String,
    enum: ['A', 'B', 'C', 'D', 'F'],
    default: 'A'
  },
  calculatedAt: { type: Date, default: Date.now }
}, { _id: false });

// Main Route Schema
const routeSchema = new mongoose.Schema({
  routeId: {
    type: String,
    unique: true
    // Removed required: true - will be auto-generated
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  routeName: {
    type: String,
    required: true,
    trim: true
  },
  
  // Origin Details
  fromAddress: {
    type: String,
    required: true
  },
  fromCode: String,
  fromName: String,
  fromCoordinates: {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true }
  },
  
  // Destination Details
  toAddress: {
    type: String,
    required: true
  },
  toCode: String,
  toName: String,
  toCoordinates: {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true }
  },
  
  // Route Details
  totalDistance: {
    type: Number,
    required: true
  }, // in km
  estimatedDuration: {
    type: Number,
    required: true
  }, // in minutes
  
  // Route Points (waypoints along the route)
  routePoints: [routePointSchema],
  
  // Major highways/roads
  majorHighways: [String],
  
  // Terrain type
  terrain: {
    type: String,
    enum: ['flat', 'hilly', 'urban', 'rural', 'mixed'],
    default: 'mixed'
  },
  
  // Risk Assessment
  riskScores: riskScoreSchema,
  
  riskLevel: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    default: 'LOW'
  },
  
  // Route Status
  status: {
    type: String,
    enum: ['active', 'archived', 'deleted'],
    default: 'active'
  },
  
  // Data Processing Status
  dataProcessingStatus: {
    roadConditions: { type: Boolean, default: false },
    accidentData: { type: Boolean, default: false },
    weatherData: { type: Boolean, default: false },
    trafficData: { type: Boolean, default: false },
    emergencyServices: { type: Boolean, default: false },
    amenities: { type: Boolean, default: false },
    networkCoverage: { type: Boolean, default: false },
    securityData: { type: Boolean, default: false }
  },
  
  // Live Map Link
  liveMapLink: String,
  
  // Additional metadata
  metadata: {
    uploadSource: {
      type: String,
      enum: ['csv', 'manual', 'api', 'gps_csv'],
      default: 'manual'
    },
    originalFileName: String,
    processingNotes: [String],
    lastCalculated: Date,
    calculationVersion: { type: String, default: '1.0' },
    gpsTrackingPoints: Number, // Number of GPS points
    trackingAccuracy: String   // Accuracy indicator
  }
  
}, {
  timestamps: true
});

// Indexes
routeSchema.index({ routeId: 1 });
routeSchema.index({ userId: 1 });
routeSchema.index({ 'fromCoordinates.latitude': 1, 'fromCoordinates.longitude': 1 });
routeSchema.index({ 'toCoordinates.latitude': 1, 'toCoordinates.longitude': 1 });
routeSchema.index({ riskLevel: 1 });
routeSchema.index({ status: 1 });
routeSchema.index({ createdAt: -1 });

// Generate route ID before save
routeSchema.pre('save', function(next) {
  if (!this.routeId) {
    this.routeId = 'RT' + Date.now() + Math.random().toString(36).substr(2, 5).toUpperCase();
  }
  next();
});

// Method to calculate risk level based on total score
routeSchema.methods.calculateRiskLevel = function() {
  const score = this.riskScores?.totalWeightedScore || 0;
  if (score >= 8) return 'CRITICAL';
  if (score >= 6) return 'HIGH';
  if (score >= 4) return 'MEDIUM';
  return 'LOW';
};

// Method to generate live map link
routeSchema.methods.generateLiveMapLink = function() {
  const from = `${this.fromCoordinates.latitude},${this.fromCoordinates.longitude}`;
  const to = `${this.toCoordinates.latitude},${this.toCoordinates.longitude}`;
  
  // Google Maps link with waypoints
  let link = `https://www.google.com/maps/dir/${from}/${to}`;
  
  if (this.routePoints && this.routePoints.length > 2) {
    // Add some intermediate points for better route visualization
    const samplePoints = [];
    const step = Math.floor(this.routePoints.length / 10); // Sample every 10th point
    
    for (let i = step; i < this.routePoints.length - step; i += step) {
      samplePoints.push(`${this.routePoints[i].latitude},${this.routePoints[i].longitude}`);
      if (samplePoints.length >= 8) break; // Google Maps limit
    }
    
    if (samplePoints.length > 0) {
      link = `https://www.google.com/maps/dir/${from}/${samplePoints.join('/')}/${to}`;
    }
  }
  
  this.liveMapLink = link;
  return link;
};

// Method to update processing status
routeSchema.methods.updateProcessingStatus = function(type, status) {
  this.dataProcessingStatus[type] = status;
  return this.save();
};

// Method to check if all data is processed
routeSchema.methods.isFullyProcessed = function() {
  return Object.values(this.dataProcessingStatus).every(status => status === true);
};

// Virtual for completion percentage
routeSchema.virtual('processingCompletion').get(function() {
  const total = Object.keys(this.dataProcessingStatus).length;
  const completed = Object.values(this.dataProcessingStatus).filter(status => status === true).length;
  return Math.round((completed / total) * 100);
});

// Transform JSON output
routeSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Route', routeSchema);