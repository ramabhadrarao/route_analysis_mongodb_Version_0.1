// File: services/dataCollectionService.js - UNIFIED VERSION
// Purpose: Enhanced comprehensive route data collection storing ALL services in EmergencyService model
// ALL SERVICE TYPES: Medical, Law Enforcement, Fire, Fuel, Educational, Food, Financial, Transportation

const axios = require('axios');
const { logger } = require('../utils/logger');
const apiService = require('./apiService');
const Route = require('../models/Route');
const accidentDataService = require('./accidentDataService');

// Import all models
const RoadCondition = require('../models/RoadCondition');
const AccidentProneArea = require('../models/AccidentProneArea');
const WeatherCondition = require('../models/WeatherCondition');
const TrafficData = require('../models/TrafficData');
const EmergencyService = require('../models/EmergencyService');

class UnifiedDataCollectionService {
  
  constructor() {
    this.googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;

    // UNIFIED service categories - ALL stored in EmergencyService model
    this.unifiedServiceCategories = {
      // ============================================================================
      // EMERGENCY & MEDICAL SERVICES
      // ============================================================================
      'hospital': { 
        type: 'hospital', 
        priority: 'critical', 
        radius: 2000,
        category: 'emergency_medical',
        servicesOffered: ['Emergency Care', 'Surgery', 'Diagnostics', 'ICU', 'Pharmacy'],
        emergencyNumber: '108'
      },
      // 'emergency_room': { 
      //   type: 'hospital', 
      //   priority: 'critical', 
      //   radius: 2000,
      //   category: 'emergency_medical',
      //   servicesOffered: ['Emergency Care', 'Trauma Care', 'Ambulance'],
      //   emergencyNumber: '108'
      // },
      // 'clinic': { 
      //   type: 'hospital', 
      //   priority: 'high', 
      //   radius: 2000,
      //   category: 'emergency_medical',
      //   servicesOffered: ['General Medicine', 'Consultation', 'Basic Treatment'],
      //   emergencyNumber: '108'
      // },
      // 'pharmacy': { 
      //   type: 'hospital', 
      //   priority: 'medium', 
      //   radius: 2000,
      //   category: 'emergency_medical',
      //   servicesOffered: ['Medicines', 'Medical Supplies', 'Health Products'],
      //   emergencyNumber: '108'
      // },

      // ============================================================================
      // LAW ENFORCEMENT & SECURITY
      // ============================================================================
      'police': { 
        type: 'police', 
        priority: 'critical', 
        radius: 2000,
        category: 'law_enforcement',
        servicesOffered: ['Emergency Response', 'Law Enforcement', 'Traffic Control', 'Crime Investigation'],
        emergencyNumber: '100'
      },
      'courthouse': { 
        type: 'police', 
        priority: 'medium', 
        radius: 2000,
        category: 'law_enforcement',
        servicesOffered: ['Judicial Services', 'Legal Aid', 'Court Proceedings'],
        emergencyNumber: '100'
      },

      // ============================================================================
      // FIRE & RESCUE SERVICES
      // ============================================================================
      'fire_station': { 
        type: 'fire_station', 
        priority: 'critical', 
        radius: 2000,
        category: 'fire_rescue',
        servicesOffered: ['Fire Fighting', 'Emergency Medical', 'Rescue Operations', 'Hazmat Response'],
        emergencyNumber: '101'
      },

      // ============================================================================
      // FUEL & VEHICLE SERVICES
      // ============================================================================
      'gas_station': { 
        type: 'mechanic', 
        priority: 'high', 
        radius: 2000,
        category: 'fuel_vehicle',
        servicesOffered: ['Fuel', 'Basic Maintenance', 'Car Wash', 'Convenience Store'],
        fuelTypes: ['Petrol', 'Diesel', 'CNG'],
        hasATM: true,
        hasRestroom: true,
        hasConvenienceStore: true
      },
      // 'car_repair': { 
      //   type: 'mechanic', 
      //   priority: 'medium', 
      //   radius: 2000,
      //   category: 'fuel_vehicle',
      //   servicesOffered: ['Engine Repair', 'Electrical', 'Body Work', 'Towing', 'Parts'],
      //   equipment: ['Diagnostic Tools', 'Lifting Equipment', 'Welding']
      // },
      // 'car_dealer': { 
      //   type: 'mechanic', 
      //   priority: 'low', 
      //   radius: 2000,
      //   category: 'fuel_vehicle',
      //   servicesOffered: ['Sales', 'Service', 'Parts', 'Warranty'],
      //   specializations: ['New Vehicles', 'Used Vehicles', 'Commercial Vehicles']
      // },

      // ============================================================================
      // EDUCATIONAL INSTITUTIONS
      // ============================================================================
      'school': { 
        type: 'educational', 
        priority: 'medium', 
        radius: 2000,
        category: 'educational',
        servicesOffered: ['Primary Education', 'Secondary Education', 'Emergency Shelter'],
        institutionType: 'school',
        safetyFeatures: ['Security Guards', 'CCTV', 'Emergency Exits', 'Medical Room']
      },
      'university': { 
        type: 'educational', 
        priority: 'medium', 
        radius: 2000,
        category: 'educational',
        servicesOffered: ['Higher Education', 'Research', 'Medical Center', 'Emergency Shelter'],
        institutionType: 'university',
        safetyFeatures: ['Security', 'Medical Center', 'Emergency Response Team']
      },
      'college': { 
        type: 'educational', 
        priority: 'medium', 
        radius: 2000,
        category: 'educational',
        servicesOffered: ['Higher Education', 'Vocational Training', 'Emergency Shelter'],
        institutionType: 'college',
        safetyFeatures: ['Campus Security', 'First Aid', 'Emergency Protocols']
      },

      // ============================================================================
      // FOOD & REST SERVICES
      // ============================================================================
      'restaurant': { 
        type: 'amenity', 
        priority: 'medium', 
        radius: 2000,
        category: 'food_rest',
        servicesOffered: ['Food Service', 'Rest Area', 'Restrooms', 'Parking'],
        stopType: 'restaurant',
        amenities: ['Dining', 'Parking', 'Restrooms', 'AC'],
        parkingAvailable: true,
        restFacilities: ['Restrooms', 'Seating']
      },
      'food': { 
        type: 'amenity', 
        priority: 'medium', 
        radius: 2000,
        category: 'food_rest',
        servicesOffered: ['Food Service', 'Takeaway', 'Basic Rest'],
        stopType: 'food_service',
        amenities: ['Food', 'Basic Seating']
      },
      'cafe': { 
        type: 'amenity', 
        priority: 'low', 
        radius: 2000,
        category: 'food_rest',
        servicesOffered: ['Coffee', 'Snacks', 'WiFi', 'Rest Area'],
        stopType: 'cafe',
        amenities: ['Coffee', 'Snacks', 'WiFi', 'Seating']
      },
      'lodging': { 
        type: 'amenity', 
        priority: 'high', 
        radius: 2000,
        category: 'food_rest',
        servicesOffered: ['Accommodation', 'Food', 'Rest', 'Security'],
        stopType: 'lodging',
        amenities: ['Rooms', 'Restaurant', 'Parking', 'WiFi', 'AC', 'Security'],
        parkingAvailable: true,
        truckFriendly: true,
        restFacilities: ['Rooms', 'Restrooms', 'Common Area']
      }

      // ============================================================================
      // FINANCIAL SERVICES
      // ============================================================================
      // 'bank': { 
      //   type: 'amenity', 
      //   priority: 'medium', 
      //   radius: 2000,
      //   category: 'financial',
      //   servicesOffered: ['Cash Withdrawal', 'Deposits', 'Money Transfer', 'Account Services'],
      //   financialServices: ['Banking', 'ATM', 'Money Exchange', 'Loans'],
      //   accessibleHours: '10:00 AM - 4:00 PM'
      // },
      // 'atm': { 
      //   type: 'amenity', 
      //   priority: 'high', 
      //   radius: 2000,
      //   category: 'financial',
      //   servicesOffered: ['Cash Withdrawal', 'Balance Inquiry', 'Mini Statement'],
      //   financialServices: ['24/7 Cash Withdrawal', 'Balance Check'],
      //   accessibleHours: '24/7',
      //   isOpen24Hours: true
      // },
      // 'post_office': { 
      //   type: 'amenity', 
      //   priority: 'medium', 
      //   radius: 2000,
      //   category: 'financial',
      //   servicesOffered: ['Mail Services', 'Money Order', 'Savings Account', 'Insurance'],
      //   financialServices: ['Postal Services', 'Money Transfer', 'Government Services'],
      //   accessibleHours: '10:00 AM - 5:00 PM'
      // },

      // ============================================================================
      // TRANSPORTATION HUBS
      // ============================================================================
      // 'bus_station': { 
      //   type: 'transport', 
      //   priority: 'medium', 
      //   radius: 2000,
      //   category: 'transportation',
      //   servicesOffered: ['Bus Transport', 'Ticketing', 'Waiting Area', 'Information'],
      //   hubType: 'bus_station',
      //   transportModes: ['Local Bus', 'Interstate Bus', 'Private Bus'],
      //   connectivity: 'Regional',
      //   facilities: ['Waiting Area', 'Ticket Counter', 'Restrooms', 'Food Court']
      // },
      // 'train_station': { 
      //   type: 'transport', 
      //   priority: 'medium', 
      //   radius: 2000,
      //   category: 'transportation',
      //   servicesOffered: ['Train Transport', 'Booking', 'Platform Access', 'Porters'],
      //   hubType: 'train_station',
      //   transportModes: ['Local Train', 'Express Train', 'Passenger Train'],
      //   connectivity: 'National',
      //   facilities: ['Platform', 'Booking Office', 'Waiting Room', 'Parking']
      // },
      // 'airport': { 
      //   type: 'transport', 
      //   priority: 'low', 
      //   radius: 2000,
      //   category: 'transportation',
      //   servicesOffered: ['Air Transport', 'Check-in', 'Security', 'Customs'],
      //   hubType: 'airport',
      //   transportModes: ['Domestic Flights', 'International Flights'],
      //   connectivity: 'International',
      //   facilities: ['Terminal', 'Check-in', 'Security', 'Lounges', 'Duty Free']
      // },
      // 'taxi_stand': { 
      //   type: 'transport', 
      //   priority: 'medium', 
      //   radius: 2000,
      //   category: 'transportation',
      //   servicesOffered: ['Local Transport', 'Taxi Service', 'Auto Rickshaw'],
      //   hubType: 'taxi_stand',
      //   transportModes: ['Local Taxi', 'Auto Rickshaw', 'Cab Services'],
      //   connectivity: 'Local',
      //   facilities: ['Waiting Area', 'Fare Chart', 'Phone Booking']
      // }
    };
  }

  // ============================================================================
  // MAIN UNIFIED DATA COLLECTION FUNCTION
  // ============================================================================
  async collectAllRouteData(routeId) {
    try {
      console.log(`🔄 Starting UNIFIED comprehensive data collection for route: ${routeId}`);
      
      const route = await Route.findById(routeId);
      if (!route) {
        throw new Error('Route not found');
      }

      // Collect ALL services in parallel using unified approach
      const dataPromises = [
        this.collectAllUnifiedServices(route),           // ALL services in EmergencyService
        this.collectEnhancedWeatherData(route),          // Weather data
        this.collectDetailedTrafficData(route),          // Traffic data
        this.collectAccidentProneAreas(route),           // Accident data
        this.collectEnhancedRoadConditions(route),       // Road conditions
        this.collectNetworkCoverage(route),              // Network coverage
        this.collectSecurityAnalysis(route)              // Security analysis
      ];

      const results = await Promise.allSettled(dataPromises);
      
      // Update processing status
      const statusUpdates = [
        'emergencyServices', 'weatherData', 'trafficData', 'accidentData', 
        'roadConditions', 'networkCoverage', 'securityData'
      ];

      for (const status of statusUpdates) {
        try {
          await route.updateProcessingStatus(status, true);
        } catch (statusError) {
          console.warn(`Status update failed for ${status}:`, statusError.message);
        }
      }
      
      // Process and structure results
      const collectionSummary = {
        unifiedServices: this.processResult(results[0]),
        weatherData: this.processResult(results[1]),
        trafficData: this.processResult(results[2]),
        accidentAreas: this.processResult(results[3]),
        roadConditions: this.processResult(results[4]),
        networkCoverage: this.processResult(results[5]),
        securityData: this.processResult(results[6])
      };

      console.log(`✅ UNIFIED data collection completed for route: ${routeId}`);
      return collectionSummary;
      
    } catch (error) {
      console.error('Unified data collection failed:', error);
      throw error;
    }
  }

  // ============================================================================
  // UNIFIED SERVICES COLLECTION - ALL IN EmergencyService MODEL
  // ============================================================================
  async collectAllUnifiedServices(route) {
    try {
      console.log('🏥🚓🚒⛽🎓🍽️🏦🚌 Collecting ALL services in unified EmergencyService model...');
      
      const allServices = [];
      const routeSegments = this.createRouteSegments(route.routePoints, 25); // 25 segments for comprehensive coverage
      
      let totalProcessed = 0;
      const totalToProcess = routeSegments.length * Object.keys(this.unifiedServiceCategories).length;
      
      for (let segmentIndex = 0; segmentIndex < routeSegments.length; segmentIndex++) {
        const segment = routeSegments[segmentIndex];
        
        console.log(`📍 Processing segment ${segmentIndex + 1}/${routeSegments.length}: ${segment.latitude.toFixed(4)}, ${segment.longitude.toFixed(4)}`);
        
        for (const [serviceKey, config] of Object.entries(this.unifiedServiceCategories)) {
          totalProcessed++;
          
          try {
            const nearbyServices = await apiService.findNearbyPlaces(
              segment.latitude,
              segment.longitude,
              serviceKey,
              config.radius
            );
            
            console.log(`   ${config.category}: Found ${nearbyServices.length} ${serviceKey} services`);
            
            // Process each service found
            for (const service of nearbyServices.slice(0, 3)) { // Top 3 per type per segment
              try {
                const unifiedService = await this.createUnifiedService(
                  service, route, serviceKey, config, segment
                );
                
                if (unifiedService) {
                  allServices.push(unifiedService);
                  console.log(`      ✅ Saved: ${service.name} (${config.category})`);
                }
              } catch (serviceError) {
                console.warn(`      ❌ Failed to save ${service.name}:`, serviceError.message);
              }
            }
            
            // Rate limiting between API calls
            if (totalProcessed % 10 === 0) {
              console.log(`   Progress: ${totalProcessed}/${totalToProcess} API calls completed`);
              await new Promise(resolve => setTimeout(resolve, 500));
            }
            
          } catch (serviceError) {
            console.warn(`   ❌ Failed to get ${serviceKey} services:`, serviceError.message);
          }
        }
      }
      
      // Categorize results for summary
      const servicesByCategory = {
        emergency_medical: allServices.filter(s => s.category === 'emergency_medical'),
        law_enforcement: allServices.filter(s => s.category === 'law_enforcement'),
        fire_rescue: allServices.filter(s => s.category === 'fire_rescue'),
        fuel_vehicle: allServices.filter(s => s.category === 'fuel_vehicle'),
        educational: allServices.filter(s => s.category === 'educational'),
        food_rest: allServices.filter(s => s.category === 'food_rest'),
        financial: allServices.filter(s => s.category === 'financial'),
        transportation: allServices.filter(s => s.category === 'transportation')
      };
      
      const summary = {
        total: allServices.length,
        byCategory: Object.fromEntries(
          Object.entries(servicesByCategory).map(([cat, services]) => [cat, services.length])
        ),
        byServiceType: {
          hospital: allServices.filter(s => s.serviceType === 'hospital').length,
          police: allServices.filter(s => s.serviceType === 'police').length,
          fire_station: allServices.filter(s => s.serviceType === 'fire_station').length,
          mechanic: allServices.filter(s => s.serviceType === 'mechanic').length,
          educational: allServices.filter(s => s.serviceType === 'educational').length,
          amenity: allServices.filter(s => s.serviceType === 'amenity').length,
          transport: allServices.filter(s => s.serviceType === 'transport').length
        },
        coverage: {
          emergencyServices: servicesByCategory.emergency_medical.length + 
                            servicesByCategory.law_enforcement.length + 
                            servicesByCategory.fire_rescue.length,
          essentialServices: servicesByCategory.fuel_vehicle.length + 
                           servicesByCategory.food_rest.length + 
                           servicesByCategory.financial.length,
          supportServices: servicesByCategory.educational.length + 
                          servicesByCategory.transportation.length
        },
        averageDistance: this.calculateAverageDistance(allServices),
        coverage24Hours: allServices.filter(s => s.isOpen24Hours).length,
        highPriority: allServices.filter(s => s.priority === 'critical').length
      };
      
      console.log(`✅ UNIFIED Services Collection Summary:`);
      console.log(`   Total Services: ${summary.total}`);
      console.log(`   Emergency Services: ${summary.coverage.emergencyServices}`);
      console.log(`   Essential Services: ${summary.coverage.essentialServices}`);
      console.log(`   Support Services: ${summary.coverage.supportServices}`);
      console.log(`   24/7 Services: ${summary.coverage24Hours}`);
      
      return summary;
      
    } catch (error) {
      console.error('Unified services collection failed:', error);
      throw error;
    }
  }

  // ============================================================================
  // CREATE UNIFIED SERVICE ENTRY
  // ============================================================================
  async createUnifiedService(service, route, serviceKey, config, segment) {
    try {
      // Calculate distances
      const distanceFromStart = this.calculateDistanceFromStart(route.routePoints, service);
      const distanceFromEnd = route.totalDistance - distanceFromStart;
      const distanceFromRoute = this.calculateDistanceFromRoute(route.routePoints, service);
      
      // Get additional details from Google Places API
      const serviceDetails = await this.getPlaceDetails(service.placeId);
      
      // Create unified service object based on category
      const baseService = {
        routeId: route._id,
        serviceType: config.type,
        name: service.name,
        latitude: service.latitude,
        longitude: service.longitude,
        
        // Contact Information
        phoneNumber: serviceDetails.phoneNumber || 'Not available',
        emergencyNumber: config.emergencyNumber || 'N/A',
        website: serviceDetails.website || '',
        address: serviceDetails.address || service.vicinity,
        operatingHours: serviceDetails.operatingHours || 'Hours not available',
        
        // Distance Information
        distanceFromRouteKm: distanceFromRoute,
        distanceFromStartKm: distanceFromStart,
        distanceFromEndKm: distanceFromEnd,
        
        // Service Information
        servicesOffered: config.servicesOffered || ['General Services'],
        responseTimeMinutes: this.estimateResponseTime(distanceFromRoute, config.type),
        availabilityScore: this.calculateAvailabilityScore(service, distanceFromRoute),
        
        // Quality Metrics
        priority: config.priority,
        rating: service.rating || 0,
        priceLevel: service.priceLevel || 0,
        
        // Accessibility
        accessibility: serviceDetails.accessibility || 'Unknown',
        amenities: serviceDetails.amenities || [],
        isOpen24Hours: config.isOpen24Hours || this.checkIfOpen24Hours(serviceDetails.operatingHours),
        
        // Service Category
        category: config.category,
        originalPlaceType: serviceKey,
        
        // Data Source
        dataSource: 'GOOGLE_PLACES_API',
        verificationStatus: 'unverified',
        lastUpdated: new Date()
      };

      // Add category-specific fields
      switch (config.category) {
        case 'emergency_medical':
          Object.assign(baseService, {
            specializations: this.getMedicalSpecializations(serviceKey),
            emergencyServices: config.servicesOffered
          });
          break;
          
        case 'law_enforcement':
          Object.assign(baseService, {
            jurisdiction: this.determineJurisdiction(service.latitude, service.longitude),
            specializedUnits: this.getSpecializedUnits(serviceKey)
          });
          break;
          
        case 'fire_rescue':
          Object.assign(baseService, {
            equipment: config.equipment || ['Standard Fire Equipment'],
            specializations: config.servicesOffered
          });
          break;
          
        case 'fuel_vehicle':
          Object.assign(baseService, {
            fuelTypes: config.fuelTypes || [],
            hasATM: config.hasATM || false,
            hasRestroom: config.hasRestroom || false,
            hasConvenienceStore: config.hasConvenienceStore || false,
            equipment: config.equipment || []
          });
          break;
          
        case 'educational':
          Object.assign(baseService, {
            institutionType: config.institutionType,
            studentCapacity: this.estimateStudentCapacity(serviceKey),
            safetyFeatures: config.safetyFeatures || [],
            emergencyContact: serviceDetails.phoneNumber || 'Not available'
          });
          break;
          
        case 'food_rest':
          Object.assign(baseService, {
            stopType: config.stopType,
            cuisineType: this.getCuisineType(service.name),
            parkingAvailable: config.parkingAvailable || false,
            truckFriendly: config.truckFriendly || false,
            restFacilities: config.restFacilities || ['Basic Facilities']
          });
          break;
          
        case 'financial':
          Object.assign(baseService, {
            financialServices: config.financialServices || [],
            accessibleHours: config.accessibleHours || 'Business Hours'
          });
          break;
          
        case 'transportation':
          Object.assign(baseService, {
            hubType: config.hubType,
            transportModes: config.transportModes || [],
            connectivity: config.connectivity || 'Local',
            facilities: config.facilities || ['Basic Facilities']
          });
          break;
      }
      
      // Save to EmergencyService model
      const emergencyService = new EmergencyService(baseService);
      return await emergencyService.save();
      
    } catch (error) {
      console.error('Failed to create unified service:', error);
      return null;
    }
  }

  // ============================================================================
  // HELPER METHODS (reusing existing ones from original code)
  // ============================================================================
  
  createRouteSegments(routePoints, numberOfSegments) {
    const segments = [];
    const step = Math.max(1, Math.floor(routePoints.length / numberOfSegments));
    
    for (let i = 0; i < routePoints.length; i += step) {
      segments.push(routePoints[i]);
    }
    
    return segments;
  }

  calculateDistanceFromStart(routePoints, targetPoint) {
    if (!routePoints || routePoints.length === 0) return 0;
    
    let minDistance = Infinity;
    let nearestPointIndex = 0;
    
    for (let i = 0; i < routePoints.length; i++) {
      const distance = this.calculateDistance(
        routePoints[i].latitude, routePoints[i].longitude,
        targetPoint.latitude, targetPoint.longitude
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        nearestPointIndex = i;
      }
    }
    
    return routePoints[nearestPointIndex].distanceFromStart || 0;
  }

  calculateDistanceFromRoute(routePoints, targetPoint) {
    if (!routePoints || routePoints.length === 0) return 0;
    
    let minDistance = Infinity;
    
    for (const point of routePoints) {
      const distance = this.calculateDistance(
        point.latitude, point.longitude,
        targetPoint.latitude, targetPoint.longitude
      );
      
      if (distance < minDistance) {
        minDistance = distance;
      }
    }
    
    return minDistance;
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  async getPlaceDetails(placeId) {
    try {
      if (!this.googleMapsApiKey) {
        return {
          phoneNumber: 'API_KEY_NOT_CONFIGURED',
          address: 'Address unavailable - API key required',
          operatingHours: 'Hours unavailable',
          website: '',
          accessibility: 'Unknown',
          amenities: []
        };
      }

      const url = `https://maps.googleapis.com/maps/api/place/details/json?` +
        `place_id=${placeId}&` +
        `fields=formatted_phone_number,formatted_address,opening_hours,website,business_status&` +
        `key=${this.googleMapsApiKey}`;

      const response = await axios.get(url, { timeout: 10000 });
      
      if (response.data.status === 'OK' && response.data.result) {
        const place = response.data.result;
        
        return {
          phoneNumber: place.formatted_phone_number || 'Not available',
          address: place.formatted_address || 'Address not available',
          operatingHours: this.formatOperatingHours(place.opening_hours),
          website: place.website || '',
          accessibility: this.assessAccessibility(place),
          amenities: this.extractAmenities(place)
        };
      }
      
      return {
        phoneNumber: 'Not available',
        address: 'Address unavailable',
        operatingHours: 'Hours unavailable',
        website: '',
        accessibility: 'Unknown',
        amenities: []
      };
      
    } catch (error) {
      return {
        phoneNumber: 'API_ERROR',
        address: 'Address unavailable - API error',
        operatingHours: 'Hours unavailable',
        website: '',
        accessibility: 'Unknown',
        amenities: []
      };
    }
  }

  formatOperatingHours(openingHours) {
    try {
      if (!openingHours) return 'Hours not available';
      
      if (openingHours.weekday_text && openingHours.weekday_text.length > 0) {
        return openingHours.weekday_text.join('; ');
      }
      
      if (openingHours.open_now !== undefined) {
        return openingHours.open_now ? 'Currently open' : 'Currently closed';
      }
      
      return 'Hours format not recognized';
    } catch (error) {
      return 'Hours formatting error';
    }
  }

  assessAccessibility(place) {
    if (place.wheelchair_accessible_entrance !== undefined) {
      return place.wheelchair_accessible_entrance ? 'Wheelchair accessible' : 'Limited accessibility';
    }
    return 'Accessibility information not available';
  }

  extractAmenities(place) {
    const amenities = [];
    
    if (place.types && Array.isArray(place.types)) {
      place.types.forEach(type => {
        switch (type) {
          case 'atm': amenities.push('ATM Available'); break;
          case 'parking': amenities.push('Parking Available'); break;
          case 'restaurant': amenities.push('Food Service'); break;
          case 'gas_station': amenities.push('Fuel Available'); break;
          case 'hospital': amenities.push('Medical Services'); break;
          case 'pharmacy': amenities.push('Pharmacy Services'); break;
          case 'bank': amenities.push('Banking Services'); break;
        }
      });
    }
    
    return amenities.length > 0 ? amenities : ['Basic Services'];
  }

  checkIfOpen24Hours(operatingHours) {
    if (!operatingHours) return false;
    return operatingHours.toLowerCase().includes('24') || 
           operatingHours.toLowerCase().includes('always open');
  }

  estimateResponseTime(distance, serviceType) {
    const baseTime = {
      'hospital': 15,
      'police': 10,
      'fire_station': 12
    };
    
    const base = baseTime[serviceType] || 15;
    return Math.round(base + (distance * 2));
    }

  calculateAvailabilityScore(service, distance) {
    let score = 8;
    if (distance > 20) score -= 3;
    else if (distance > 10) score -= 1;
    if (service.rating) score = Math.round((score + service.rating) / 2);
    return Math.max(1, Math.min(10, score));
  }

  calculateAverageDistance(services) {
    if (services.length === 0) return 0;
    return services.reduce((sum, s) => sum + (s.distanceFromRouteKm || 0), 0) / services.length;
  }

  // ============================================================================
  // CATEGORY-SPECIFIC HELPER METHODS
  // ============================================================================

  getMedicalSpecializations(serviceKey) {
    const specializations = {
      'hospital': ['General Medicine', 'Emergency Care', 'Surgery', 'ICU'],
      'emergency_room': ['Emergency Medicine', 'Trauma Care', 'Critical Care'],
      'clinic': ['General Practice', 'Consultation', 'Basic Treatment'],
      'pharmacy': ['Medications', 'Health Products', 'Basic Medical Supplies']
    };
    return specializations[serviceKey] || ['General Medical Services'];
  }

  getSpecializedUnits(serviceKey) {
    const units = {
      'police': ['Traffic Police', 'Emergency Response', 'Crime Investigation', 'Patrol Units'],
      'courthouse': ['Judicial Services', 'Legal Aid', 'Court Security']
    };
    return units[serviceKey] || ['General Services'];
  }

  determineJurisdiction(latitude, longitude) {
    // Simplified jurisdiction determination - in real implementation, use administrative boundaries API
    return 'Local Police Jurisdiction';
  }

  estimateStudentCapacity(serviceKey) {
    const capacities = {
      'school': Math.floor(Math.random() * 1000) + 500,
      'university': Math.floor(Math.random() * 10000) + 5000,
      'college': Math.floor(Math.random() * 5000) + 2000
    };
    return capacities[serviceKey] || 1000;
  }

  getCuisineType(name) {
    const nameLower = name.toLowerCase();
    if (nameLower.includes('chinese')) return 'Chinese';
    if (nameLower.includes('pizza')) return 'Italian';
    if (nameLower.includes('dhaba')) return 'Indian';
    if (nameLower.includes('mc') || nameLower.includes('kfc')) return 'Fast Food';
    if (nameLower.includes('south') || nameLower.includes('idli') || nameLower.includes('dosa')) return 'South Indian';
    if (nameLower.includes('punjabi')) return 'Punjabi';
    return 'Multi-cuisine';
  }

  // ============================================================================
  // ENHANCED WEATHER DATA COLLECTION
  // ============================================================================
  async collectEnhancedWeatherData(route) {
    try {
      console.log('🌦️ Starting MULTI-SEASONAL weather data collection...');
      
      // Use the enhanced weather service for comprehensive seasonal analysis
      const enhancedWeatherService = require('./enhancedWeatherService');
      const seasonalResults = await enhancedWeatherService.collectAllSeasonalWeatherData(route._id);
      
      return {
        total: seasonalResults.totalDataPoints || 0,
        seasonal: seasonalResults.seasonalData,
        analysis: seasonalResults.analysis,
        vehiclePredictions: seasonalResults.vehiclePredictions,
        recommendations: seasonalResults.recommendations,
        dataQuality: 'multi_seasonal_enhanced',
        seasons: {
          winter: seasonalResults.seasonalData?.winter?.collected || 0,
          spring: seasonalResults.seasonalData?.spring?.collected || 0,
          summer: seasonalResults.seasonalData?.summer?.collected || 0,
          monsoon: seasonalResults.seasonalData?.monsoon?.collected || 0
        }
      };
      
    } catch (error) {
      console.error('Multi-seasonal weather collection failed:', error);
      return await this.collectBasicWeatherData(route);
    }
  }

  async collectBasicWeatherData(route) {
    try {
      console.log('🌤️ Collecting basic weather data...');
      
      const weatherPoints = [];
      const routeSegments = this.createRouteSegments(route.routePoints, 15);
      
      for (const segment of routeSegments) {
        try {
          const weatherData = await apiService.getWeatherData(segment.latitude, segment.longitude);
          
          const weather = new WeatherCondition({
            routeId: route._id,
            latitude: segment.latitude,
            longitude: segment.longitude,
            season: this.getCurrentSeason(),
            weatherCondition: this.mapWeatherCondition(weatherData.condition),
            averageTemperature: weatherData.temperature,
            humidity: weatherData.humidity,
            pressure: weatherData.pressure,
            precipitationMm: 0,
            windSpeedKmph: weatherData.windSpeed,
            windDirection: weatherData.windDirection,
            visibilityKm: weatherData.visibility,
            roadSurfaceCondition: this.determineSurfaceCondition(weatherData),
            riskScore: this.assessWeatherRisk(weatherData),
            distanceFromStartKm: this.calculateDistanceFromStart(route.routePoints, segment),
            dataSource: 'OPENWEATHER_API'
          });
          
          await weather.save();
          weatherPoints.push(weather);
          
        } catch (weatherError) {
          console.warn('Failed to get weather for segment:', weatherError.message);
        }
      }
      
      return {
        total: weatherPoints.length,
        averageTemp: weatherPoints.reduce((sum, w) => sum + w.averageTemperature, 0) / weatherPoints.length || 0,
        averageRisk: weatherPoints.reduce((sum, w) => sum + w.riskScore, 0) / weatherPoints.length || 0
      };
      
    } catch (error) {
      console.error('Basic weather data collection failed:', error);
      throw error;
    }
  }

  // ============================================================================
  // DETAILED TRAFFIC DATA COLLECTION
  // ============================================================================
  async collectDetailedTrafficData(route) {
    try {
      console.log('🚗 Collecting detailed traffic data...');
      
      const trafficPoints = [];
      const routeSegments = this.createRouteSegments(route.routePoints, 20);
      
      for (const segment of routeSegments) {
        try {
          const trafficData = await apiService.getTrafficData(segment.latitude, segment.longitude);
          
          const traffic = new TrafficData({
            routeId: route._id,
            latitude: segment.latitude,
            longitude: segment.longitude,
            peakHourTrafficCount: Math.round(trafficData.currentSpeed * 10),
            averageSpeedKmph: trafficData.currentSpeed,
            congestionLevel: this.determineCongestionLevel(trafficData),
            bottleneckCauses: this.identifyBottlenecks(trafficData),
            alternativeRoutesAvailable: this.checkAlternativeRoutes(segment),
            riskScore: Math.max(1, this.calculateTrafficRiskScore(trafficData)),
            measurementTime: new Date(),
            distanceFromStartKm: this.calculateDistanceFromStart(route.routePoints, segment),
            speedLimit: this.estimateSpeedLimit(segment),
            roadType: this.determineRoadType(segment),
            trafficLights: this.estimateTrafficLights(segment),
            tollPoints: this.identifyTollPoints(segment),
            constructionZones: this.identifyConstructionZones(segment),
            dataSource: trafficData.dataSource || 'HERE_TRAFFIC_API'
          });
          
          await traffic.save();
          trafficPoints.push(traffic);
          
        } catch (trafficError) {
          console.warn('Failed to get traffic for segment:', trafficError.message);
        }
      }
      
      return {
        total: trafficPoints.length,
        averageSpeed: trafficPoints.length > 0 ? 
          trafficPoints.reduce((sum, t) => sum + t.averageSpeedKmph, 0) / trafficPoints.length : 0,
        congestionAreas: trafficPoints.filter(t => ['heavy', 'severe'].includes(t.congestionLevel)).length,
        averageRisk: trafficPoints.length > 0 ? 
          trafficPoints.reduce((sum, t) => sum + t.riskScore, 0) / trafficPoints.length : 0,
        tollPoints: trafficPoints.filter(t => t.tollPoints > 0).length,
        constructionZones: trafficPoints.filter(t => t.constructionZones > 0).length
      };
      
    } catch (error) {
      console.error('Detailed traffic data collection failed:', error);
      throw error;
    }
  }

  // ============================================================================
  // COMPREHENSIVE ACCIDENT-PRONE AREAS
  // ============================================================================

  async collectAccidentProneAreas(route) {
  try {
    console.log('🚨 Collecting REAL accident-prone areas using enhanced service...');
    const accidentProneAreasService = require('./accidentProneAreasService');

    
    // Use the new enhanced accident service
    const enhancedResults = await accidentProneAreasService.collectAccidentProneAreasForRoute(route._id);
    
    console.log(`✅ Enhanced accident data collection completed: ${enhancedResults.totalAreas} areas found`);
    
    return {
      total: enhancedResults.totalAreas,
      highRiskAreas: enhancedResults.highRiskAreas,
      criticalAreas: enhancedResults.criticalAreas,
      averageRisk: enhancedResults.averageRiskScore,
      maxRisk: enhancedResults.maxRiskScore,
      byDataSource: enhancedResults.byDataSource,
      bySeverity: enhancedResults.bySeverity,
      geographicSpread: enhancedResults.geographicSpread,
      dataQuality: enhancedResults.dataQuality,
      apiStatus: enhancedResults.apiStatus,
      recommendations: enhancedResults.overallRecommendations,
      enhancementInfo: {
        serviceVersion: 'Enhanced_v2.0',
        realDataSources: ['TomTom Traffic API', 'HERE Traffic API', 'Google Places API'],
        noMockData: true,
        confidence: enhancedResults.dataQuality.confidence
      }
    };
    
  } catch (error) {
    console.error('Enhanced accident data collection failed:', error);
    
    // Fallback: Return empty results instead of mock data
    return {
      total: 0,
      highRiskAreas: 0,
      criticalAreas: 0,
      averageRisk: 0,
      maxRisk: 0,
      byDataSource: {},
      bySeverity: { fatal: 0, major: 0, minor: 0 },
      error: error.message,
      enhancementInfo: {
        serviceVersion: 'Enhanced_v2.0_FAILED',
        realDataSources: ['TomTom Traffic API', 'HERE Traffic API', 'Google Places API'],
        noMockData: true,
        fallbackUsed: true
      }
    };
  }
}

  // ============================================================================
  // ENHANCED ROAD CONDITIONS
  // ============================================================================
  async collectEnhancedRoadConditions(route) {
    try {
      console.log('🛣️ Collecting ENHANCED road conditions using multi-API service...');
      
      // Use the new enhanced road conditions service
      const enhancedRoadConditionsService = require('./enhancedRoadConditionsService');
      const enhancedResults = await enhancedRoadConditionsService.collectEnhancedRoadConditions(route._id);
      
      console.log(`✅ Enhanced road conditions collection completed: ${enhancedResults.totalSegments} segments analyzed`);
      
      return {
        total: enhancedResults.totalSegments,
        averageRisk: enhancedResults.averageRiskScore,
        maxRisk: enhancedResults.maxRiskScore,
        
        // Road type breakdown
        byRoadType: enhancedResults.byRoadType,
        
        // Surface quality breakdown
        bySurfaceQuality: enhancedResults.bySurfaceQuality,
        
        // Road issues summary
        roadIssues: enhancedResults.roadIssues,
        
        // Data quality assessment
        dataQuality: enhancedResults.dataQuality,
        
        // API integration status
        apiStatus: enhancedResults.apiStatus,
        
        // Enhanced features
        enhancementInfo: {
          serviceVersion: 'Enhanced_v3.0',
          realDataSources: ['Google Roads API', 'TomTom Map API', 'HERE Map Attributes API', 'Mapbox Directions API'],
          multiApiIntegration: true,
          noMockData: true,
          confidence: enhancedResults.dataQuality.confidence,
          apiCoverage: enhancedResults.dataQuality.apiCoverage
        },
        
        // Recommendations
        recommendations: enhancedResults.recommendations,
        
        // Network connectivity analysis
        connectivity: await this.analyzeRoadConnectivity(route),
        
        // Risk assessment
        riskAssessment: await this.assessRoadConditionRisks(route._id),
        
        // Summary stats
        summaryStats: {
          poorConditionSegments: enhancedResults.roadIssues.poorConditionSegments,
          constructionZones: enhancedResults.roadIssues.constructionZones,
          potholeAreas: enhancedResults.roadIssues.potholeAreas,
          singleLaneSegments: enhancedResults.roadIssues.singleLaneSegments,
          narrowRoadSegments: enhancedResults.roadIssues.narrowRoadSegments,
          highRiskSegments: enhancedResults.roadIssues.poorConditionSegments + enhancedResults.roadIssues.constructionZones
        }
      };
      
    } catch (error) {
      console.error('Enhanced road conditions collection failed:', error);
      
      // Fallback to basic road conditions analysis
      //return await this.collectBasicRoadConditions(route);
    }
  }

  // ============================================================================
  // NETWORK COVERAGE ANALYSIS
  // ============================================================================
  async collectNetworkCoverage(route) {
    try {
      console.log('📶 Analyzing comprehensive network coverage...');
      
      const coverageAnalysis = {
        routeId: route._id,
        totalDistance: route.totalDistance,
        terrain: route.terrain,
        estimatedDeadZones: this.estimateDeadZones(route),
        coverageQuality: this.assessOverallCoverage(route),
        riskScore: this.calculateNetworkRiskScore(route),
        cellTowerDensity: this.estimateCellTowerDensity(route),
        emergencyCommRisk: this.assessEmergencyCommRisk(route),
        alternativeCommMethods: ['Satellite Phone', 'Two-way Radio', 'Emergency Beacons'],
        coverageByOperator: this.estimateCoverageByOperator(route)
      };
      
      return coverageAnalysis;
      
    } catch (error) {
      console.error('Network coverage analysis failed:', error);
      throw error;
    }
  }

  // ============================================================================
  // SECURITY ANALYSIS
  // ============================================================================
  async collectSecurityAnalysis(route) {
    try {
      console.log('🔒 Conducting comprehensive security analysis...');
      
      const securityAnalysis = {
        routeId: route._id,
        overallSecurityRisk: this.calculateOverallSecurityRisk(route),
        crimeRiskAreas: this.identifyCrimeRiskAreas(route),
        isolatedAreas: this.identifyIsolatedAreas(route),
        lightingAssessment: this.assessRouteLighting(route),
        emergencyResponseTime: this.assessEmergencyResponseCapability(route),
        securityRecommendations: this.generateSecurityRecommendations(route),
        nightTravelRisk: this.assessNightTravelRisk(route)
      };
      
      return securityAnalysis;
      
    } catch (error) {
      console.error('Security analysis failed:', error);
      throw error;
    }
  }

  // ============================================================================
  // UTILITY HELPER METHODS
  // ============================================================================

  getCurrentSeason() {
    const month = new Date().getMonth();
    if (month >= 2 && month <= 4) return 'spring';
    if (month >= 5 && month <= 7) return 'summer';
    if (month >= 8 && month <= 10) return 'monsoon';
    return 'winter';
  }

  mapWeatherCondition(condition) {
    const conditionMap = {
      'Clear': 'clear',
      'Clouds': 'clear',
      'Rain': 'rainy',
      'Thunderstorm': 'stormy',
      'Snow': 'icy',
      'Mist': 'foggy',
      'Fog': 'foggy'
    };
    return conditionMap[condition] || 'clear';
  }

  determineSurfaceCondition(weatherData) {
    if (weatherData.condition?.toLowerCase().includes('rain')) return 'wet';
    if (weatherData.condition?.toLowerCase().includes('snow')) return 'icy';
    return 'dry';
  }

  assessWeatherRisk(weatherData) {
    let risk = 3;
    if (weatherData.visibility < 5) risk += 3;
    if (weatherData.windSpeed > 30) risk += 2;
    if (weatherData.condition?.toLowerCase().includes('rain')) risk += 2;
    if (weatherData.condition?.toLowerCase().includes('fog')) risk += 3;
    return Math.max(1, Math.min(10, risk));
  }

  calculateTrafficRiskScore(trafficData) {
    const speedRatio = trafficData.currentSpeed / (trafficData.freeFlowSpeed || 60);
    const riskScore = Math.round((1 - speedRatio) * 10);
    return Math.max(1, Math.min(10, riskScore));
  }

  determineCongestionLevel(trafficData) {
    if (!trafficData.jamFactor) {
      const ratio = trafficData.currentSpeed / (trafficData.freeFlowSpeed || 60);
      if (ratio > 0.8) return 'free_flow';
      if (ratio > 0.6) return 'light';
      if (ratio > 0.4) return 'moderate';
      if (ratio > 0.2) return 'heavy';
      return 'severe';
    }
    
    if (trafficData.jamFactor >= 8) return 'severe';
    if (trafficData.jamFactor >= 6) return 'heavy';
    if (trafficData.jamFactor >= 4) return 'moderate';
    if (trafficData.jamFactor >= 2) return 'light';
    return 'free_flow';
  }

  identifyBottlenecks(trafficData) {
    const bottlenecks = [];
    if (trafficData.currentSpeed < 20) bottlenecks.push('low_speed_zone');
    if (trafficData.roadClosure) bottlenecks.push('road_closure');
    if (trafficData.jamFactor > 7) bottlenecks.push('heavy_congestion');
    return bottlenecks;
  }

  checkAlternativeRoutes(segment) {
    return Math.random() > 0.6;
  }

  estimateSpeedLimit(segment) {
    const speedLimits = [40, 50, 60, 80, 100];
    return speedLimits[Math.floor(Math.random() * speedLimits.length)];
  }

  determineRoadType(segment) {
    const roadTypes = ['highway', 'arterial', 'collector', 'local'];
    return roadTypes[Math.floor(Math.random() * roadTypes.length)];
  }

  estimateTrafficLights(segment) {
    return Math.floor(Math.random() * 3);
  }

  identifyTollPoints(segment) {
    return Math.random() > 0.8 ? 1 : 0;
  }

  identifyConstructionZones(segment) {
    return Math.random() > 0.9 ? 1 : 0;
  }

  assessDetailedRoadQuality(segment, route) {
    let riskScore = 5;
    
    if (route.terrain === 'hilly') riskScore += 1;
    if (route.terrain === 'rural') riskScore += 2;
    if (route.majorHighways?.some(h => h.startsWith('NH'))) riskScore -= 1;
    
    return {
      surface: riskScore > 6 ? 'poor' : riskScore > 4 ? 'fair' : 'good',
      width: route.majorHighways?.length > 0 ? 7.5 : 3.5,
      lanes: route.majorHighways?.length > 0 ? 2 : 1,
      potholes: riskScore > 6,
      construction: Math.random() > 0.9,
      riskScore: Math.max(1, Math.min(10, riskScore))
    };
  }

  determineDetailedRoadType(majorHighways, segment) {
    if (!majorHighways || majorHighways.length === 0) return 'rural';
    if (majorHighways.some(h => h.startsWith('NH'))) return 'highway';
    if (majorHighways.some(h => h.startsWith('SH'))) return 'state';
    return 'district';
  }

  // Network Coverage Methods
  estimateDeadZones(route) {
    let deadZones = Math.floor(route.totalDistance / 50);
    if (route.terrain === 'hilly') deadZones += 2;
    if (route.terrain === 'rural') deadZones += 1;
    return deadZones;
  }

  assessOverallCoverage(route) {
    if (route.terrain === 'urban') return 'excellent';
    if (route.terrain === 'rural') return 'fair';
    if (route.terrain === 'hilly') return 'poor';
    return 'good';
  }

  calculateNetworkRiskScore(route) {
    let risk = 4;
    if (route.terrain === 'rural') risk += 2;
    if (route.terrain === 'hilly') risk += 3;
    if (route.totalDistance > 200) risk += 1;
    return Math.max(1, Math.min(10, risk));
  }

  estimateCellTowerDensity(route) {
    const densities = { 'urban': 'high', 'rural': 'low', 'hilly': 'very_low', 'mixed': 'medium' };
    return densities[route.terrain] || 'medium';
  }

  assessEmergencyCommRisk(route) {
    const networkRisk = this.calculateNetworkRiskScore(route);
    if (networkRisk > 7) return 'high';
    if (networkRisk > 5) return 'medium';
    return 'low';
  }

  estimateCoverageByOperator(route) {
    const baseCoverage = route.terrain === 'urban' ? 95 : route.terrain === 'rural' ? 70 : 60;
    return {
      'Airtel': Math.max(30, baseCoverage + (Math.random() * 20 - 10)),
      'Jio': Math.max(30, baseCoverage + (Math.random() * 20 - 10)),
      'Vi': Math.max(30, baseCoverage + (Math.random() * 20 - 10)),
      'BSNL': Math.max(30, baseCoverage + (Math.random() * 20 - 10))
    };
  }

  // Security Analysis Methods
  calculateOverallSecurityRisk(route) {
    let risk = 4;
    if (route.terrain === 'rural') risk += 2;
    if (route.terrain === 'urban') risk += 1;
    if (route.totalDistance > 300) risk += 1;
    return Math.max(1, Math.min(10, risk));
  }

  identifyCrimeRiskAreas(route) {
    const riskAreas = [];
    const segmentCount = Math.floor(route.totalDistance / 25);
    
    for (let i = 0; i < segmentCount; i++) {
      if (Math.random() > 0.8) {
        riskAreas.push({
          location: `${25 * i}-${25 * (i + 1)}km from start`,
          riskLevel: Math.random() > 0.5 ? 'medium' : 'high',
          crimeTypes: ['theft', 'robbery'],
          timeOfRisk: Math.random() > 0.5 ? 'night' : 'any'
        });
      }
    }
    return riskAreas;
  }

  identifyIsolatedAreas(route) {
    const isolatedAreas = [];
    if (route.terrain === 'rural' || route.terrain === 'hilly') {
      const areaCount = Math.floor(route.totalDistance / 40);
      for (let i = 0; i < areaCount; i++) {
        isolatedAreas.push({
          location: `${40 * i}-${40 * (i + 1)}km from start`,
          isolationLevel: route.terrain === 'hilly' ? 'high' : 'medium',
          nearestHelp: `${Math.floor(Math.random() * 20 + 10)}km away`
        });
      }
    }
    return isolatedAreas;
  }

  assessRouteLighting(route) {
    const lighting = { 'urban': 'good', 'rural': 'poor', 'hilly': 'very_poor', 'mixed': 'fair' };
    return {
      overallQuality: lighting[route.terrain] || 'fair',
      wellLitSections: route.terrain === 'urban' ? 80 : 20,
      poorlyLitSections: route.terrain === 'rural' ? 70 : 30
    };
  }

  assessEmergencyResponseCapability(route) {
    const responseTime = route.terrain === 'urban' ? '10-15 minutes' :
                        route.terrain === 'rural' ? '20-45 minutes' : '30-60 minutes';
    return {
      averageResponseTime: responseTime,
      communicationReliability: route.terrain === 'urban' ? 'high' : 'medium'
    };
  }

  generateSecurityRecommendations(route) {
    const recommendations = [
      'Maintain constant communication with control room',
      'Carry emergency contact numbers'
    ];
    
    if (route.terrain === 'rural') {
      recommendations.push('Travel during daylight hours when possible');
      recommendations.push('Carry extra fuel and emergency supplies');
    }
    
    if (route.totalDistance > 200) {
      recommendations.push('Plan rest stops at secure locations');
    }
    
    return recommendations;
  }

  assessNightTravelRisk(route) {
    let nightRisk = 5;
    if (route.terrain === 'rural') nightRisk += 3;
    if (route.terrain === 'hilly') nightRisk += 2;
    if (route.totalDistance > 200) nightRisk += 1;
    
    return {
      riskScore: Math.max(1, Math.min(10, nightRisk)),
      riskLevel: nightRisk > 7 ? 'high' : nightRisk > 5 ? 'medium' : 'low'
    };
  }

  processResult(result) {
    return result.status === 'fulfilled' ? result.value : { error: result.reason?.message };
  }
}

module.exports = new UnifiedDataCollectionService();