// File: models/WeatherCondition.js
// Purpose: Store weather condition data
const mongoose = require('mongoose');
const weatherConditionSchema = new mongoose.Schema({
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
  
  // Basic Weather Data
  season: {
    type: String,
    enum: ['spring', 'summer', 'monsoon', 'winter'],
    required: true
  },
  weatherCondition: {
    type: String,
    enum: ['clear', 'rainy', 'foggy', 'icy', 'stormy'],
    required: true
  },
  
  // Temperature and Humidity
  averageTemperature: {
    type: Number
  },
  humidity: {
    type: Number,
    min: 0,
    max: 100
  },
  pressure: {
    type: Number,
    min: 0
  },
  
  // Precipitation and Wind
  precipitationMm: {
    type: Number,
    min: 0
  },
  windSpeedKmph: {
    type: Number,
    min: 0
  },
  windDirection: {
    type: String
  },
  
  // Visibility and Surface
  visibilityKm: {
    type: Number,
    min: 0
  },
  roadSurfaceCondition: {
    type: String,
    enum: ['dry', 'wet', 'icy', 'muddy'],
    required: true
  },
  
  // Risk Assessment
  riskScore: {
    type: Number,
    min: 1,
    max: 10,
    required: true
  },
  
  // Enhanced Weather Data
  uvIndex: {
    type: Number,
    min: 0,
    max: 15
  },
  monsoonRisk: {
    type: Number,
    min: 1,
    max: 10,
    default: 5
  },
  extremeWeatherHistory: [String],
  
  // Seasonal Data
  dataYear: {
    type: Number
  },
  
  // Weather Impact Assessment
  drivingConditionImpact: {
    type: String,
    enum: ['minimal', 'moderate', 'significant', 'severe'],
    default: 'minimal'
  },
  recommendedPrecautions: [String],
  
  // Data Quality
  dataSource: {
    type: String,
    default: 'WEATHER_API'
  },
  forecastAccuracy: {
    type: Number,
    min: 0,
    max: 100,
    default: 80
  }
}, {
  timestamps: true
});

// Indexes
weatherConditionSchema.index({ routeId: 1 });
weatherConditionSchema.index({ season: 1 });
weatherConditionSchema.index({ distanceFromStartKm: 1 });
weatherConditionSchema.index({ riskScore: -1 });
weatherConditionSchema.index({ weatherCondition: 1 });

// Virtual for comfort index
weatherConditionSchema.virtual('comfortIndex').get(function() {
  let comfort = 100;
  
  // Temperature comfort
  if (this.averageTemperature < 10 || this.averageTemperature > 35) comfort -= 30;
  else if (this.averageTemperature < 15 || this.averageTemperature > 30) comfort -= 15;
  
  // Humidity impact
  if (this.humidity > 80) comfort -= 20;
  else if (this.humidity > 60) comfort -= 10;
  
  // Wind impact
  if (this.windSpeedKmph > 50) comfort -= 25;
  else if (this.windSpeedKmph > 30) comfort -= 15;
  
  // Precipitation impact
  if (this.precipitationMm > 50) comfort -= 30;
  else if (this.precipitationMm > 10) comfort -= 15;
  
  return Math.max(0, comfort);
});

// Method to get driving recommendations
weatherConditionSchema.methods.getDrivingRecommendations = function() {
  const recommendations = [];
  
  if (this.weatherCondition === 'rainy') {
    recommendations.push('Reduce speed by 10-20%');
    recommendations.push('Increase following distance');
    recommendations.push('Use headlights during rain');
  }
  
  if (this.weatherCondition === 'foggy') {
    recommendations.push('Use fog lights');
    recommendations.push('Reduce speed significantly');
    recommendations.push('Use road reflectors as guide');
  }
  
  if (this.windSpeedKmph > 50) {
    recommendations.push('Be aware of strong crosswinds');
    recommendations.push('Maintain firm grip on steering');
  }
  
  if (this.visibilityKm < 1) {
    recommendations.push('Consider stopping at safe location');
    recommendations.push('Use hazard lights if stopped');
  }
  
  if (this.roadSurfaceCondition === 'icy') {
    recommendations.push('Use winter tires or chains');
    recommendations.push('Avoid sudden movements');
    recommendations.push('Allow extra time for journey');
  }
  
  return recommendations;
};

// Static method for weather risk analysis
weatherConditionSchema.statics.getRouteWeatherRisk = function(routeId) {
  return this.aggregate([
    { $match: { routeId: new mongoose.Types.ObjectId(routeId) }},
    {
      $group: {
        _id: null,
        avgRiskScore: { $avg: '$riskScore' },
        maxRiskScore: { $max: '$riskScore' },
        weatherConditions: { $addToSet: '$weatherCondition' },
        avgVisibility: { $avg: '$visibilityKm' },
        avgTemperature: { $avg: '$averageTemperature' },
        totalPrecipitation: { $sum: '$precipitationMm' },
        maxWindSpeed: { $max: '$windSpeedKmph' },
        riskAreas: {
          $sum: {
            $cond: [{ $gt: ['$riskScore', 6] }, 1, 0]
          }
        }
      }
    }
  ]);
};
  
  module.exports = mongoose.model('WeatherCondition', weatherConditionSchema);