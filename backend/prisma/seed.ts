import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  const passwordHash = await bcrypt.hash('Password123!', 10);

  // Upsert demo user
  const user = await prisma.user.upsert({
    where: { email: 'demo@travelcompanion.ai' },
    update: {},
    create: {
      email: 'demo@travelcompanion.ai',
      name: 'Priya & Rahul Sharma',
      passwordHash,
      role: 'USER',
      preferences: {
        create: {
          homeAirport: 'CCU',
          preferredAirlines: JSON.stringify(['6E', 'AI']),
          hotelMinRating: 4.0,
          dietaryPref: JSON.stringify(['Local Goan', 'Seafood']),
          travelPace: 'BALANCED',
          currency: 'INR'
        }
      }
    }
  });

  console.log(`👤 Seeded User: ${user.email} (ID: ${user.id})`);

  // Upsert sample 5-day Goa trip
  const trip = await prisma.trip.create({
    data: {
      userId: user.id,
      title: '5-Day Coastal & Adventure Getaway to Goa',
      destination: 'Goa, India',
      origin: 'Kolkata (CCU)',
      startDate: new Date('2026-12-10T00:00:00.000Z'),
      endDate: new Date('2026-12-15T00:00:00.000Z'),
      totalDays: 5,
      travelers: 2,
      totalBudget: 50000,
      currency: 'INR',
      status: 'PLANNING',
      flightOptions: {
        create: [
          {
            airlineCode: '6E',
            airlineName: 'IndiGo Airlines',
            flightNumber: '6E-205',
            originAirport: 'CCU',
            destAirport: 'GOI',
            departureTime: new Date('2026-12-10T06:15:00.000Z'),
            arrivalTime: new Date('2026-12-10T09:10:00.000Z'),
            durationMins: 175,
            stops: 0,
            cabinClass: 'ECONOMY',
            pricePerPerson: 6200,
            totalPrice: 12400,
            currency: 'INR',
            offerReference: 'INDIGO_CCU_GOI_MOCK_01',
            isMockData: true,
            isSelected: true
          },
          {
            airlineCode: 'AI',
            airlineName: 'Air India',
            flightNumber: 'AI-780',
            originAirport: 'CCU',
            destAirport: 'GOI',
            departureTime: new Date('2026-12-10T11:45:00.000Z'),
            arrivalTime: new Date('2026-12-10T16:20:00.000Z'),
            durationMins: 275,
            stops: 1,
            cabinClass: 'ECONOMY',
            pricePerPerson: 5800,
            totalPrice: 11600,
            currency: 'INR',
            offerReference: 'AIRINDIA_CCU_GOI_MOCK_02',
            isMockData: true,
            isSelected: false
          }
        ]
      },
      hotelOptions: {
        create: [
          {
            hotelName: 'Heritage Village Resort & Spa Goa',
            hotelId: 'AMADEUS_HOTEL_GOA_01',
            address: 'Arossim Beach Road, Cansaulim',
            city: 'South Goa',
            latitude: 15.3262,
            longitude: 73.9103,
            starRating: 4.5,
            userRating: 4.6,
            pricePerNight: 4200,
            totalPrice: 16800,
            currency: 'INR',
            roomType: 'Deluxe Heritage Room with Balcony',
            amenities: JSON.stringify(['Free WiFi', 'Outdoor Swimming Pool', 'Spa', 'Breakfast Included']),
            imageUrl: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80',
            isMockData: true,
            isSelected: true
          },
          {
            hotelName: 'Santana Beach Resort',
            hotelId: 'AMADEUS_HOTEL_GOA_02',
            address: 'Shop No 1, Candolim Beach Rd',
            city: 'North Goa',
            latitude: 15.5173,
            longitude: 73.7631,
            starRating: 3.8,
            userRating: 4.2,
            pricePerNight: 3100,
            totalPrice: 12400,
            currency: 'INR',
            roomType: 'Standard Garden View Room',
            amenities: JSON.stringify(['Free WiFi', 'Beachfront Access', 'Bar']),
            imageUrl: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80',
            isMockData: true,
            isSelected: false
          }
        ]
      },
      itineraries: {
        create: {
          version: 1,
          isApproved: true,
          summary: 'Balanced 5-day itinerary balancing South Goa tranquility, heritage churches, thrilling water sports at Baga, and authentic beach shacks.',
          totalCost: 39500,
          activities: {
            create: [
              {
                dayNumber: 1,
                timeSlot: 'MORNING',
                startTime: '09:30',
                endTime: '11:00',
                title: 'Airport Transfer & Check-in at Arossim',
                description: 'Arrive at Dabolim/MOPA Airport, transfer to resort, and unpack.',
                locationName: 'Arossim Beach, South Goa',
                latitude: 15.3262,
                longitude: 73.9103,
                estimatedCost: 1200,
                category: 'TRANSIT',
                sortOrder: 1
              },
              {
                dayNumber: 1,
                timeSlot: 'AFTERNOON',
                startTime: '13:00',
                endTime: '15:30',
                title: 'Authentic Goan Thali Lunch at Martin’s Corner',
                description: 'Famous local restaurant serving Kingfish rawa fry, prawn curry, and pork vindaloo.',
                locationName: 'Martin’s Corner, Betalbatim',
                latitude: 15.2936,
                longitude: 73.9216,
                estimatedCost: 1400,
                category: 'DINING',
                sortOrder: 2
              },
              {
                dayNumber: 1,
                timeSlot: 'EVENING',
                startTime: '16:30',
                endTime: '19:00',
                title: 'Sunset at Majorda Beach',
                description: 'Relaxed walk along quiet golden sands and peaceful coastal views.',
                locationName: 'Majorda Beach',
                latitude: 15.3094,
                longitude: 73.9118,
                estimatedCost: 300,
                category: 'RELAXATION',
                sortOrder: 3
              },
              {
                dayNumber: 2,
                timeSlot: 'MORNING',
                startTime: '09:00',
                endTime: '13:00',
                title: 'UNESCO Old Goa Heritage Walk',
                description: 'Explore Basilica of Bom Jesus, Se Cathedral, and Church of St. Francis of Assisi.',
                locationName: 'Old Goa',
                latitude: 15.5009,
                longitude: 73.9116,
                estimatedCost: 600,
                category: 'SIGHTSEEING',
                sortOrder: 1
              },
              {
                dayNumber: 2,
                timeSlot: 'EVENING',
                startTime: '16:30',
                endTime: '19:30',
                title: 'Fontainhas Latin Quarter Heritage Photography',
                description: 'Stroll through colorful Portuguese villas, art galleries, and historic bakeries.',
                locationName: 'Fontainhas, Panaji',
                latitude: 15.4989,
                longitude: 73.8315,
                estimatedCost: 500,
                category: 'SIGHTSEEING',
                sortOrder: 2
              }
            ]
          }
        }
      }
    }
  });

  console.log(`✈️ Seeded Trip: ${trip.title} (ID: ${trip.id})`);
  console.log('✅ Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
