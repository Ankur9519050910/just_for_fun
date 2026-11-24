import {
  NormalizedFlightOffer,
  NormalizedHotelOffer,
  DestinationAttraction,
  BudgetOptimizationResult,
  BudgetCategoryAllocation
} from '../agent/types';

export interface BudgetOptimizerInput {
  flightResults: NormalizedFlightOffer[];
  hotelResults: NormalizedHotelOffer[];
  attractionResults: DestinationAttraction[];
  targetBudget: number;
  totalDays: number;
  travelers: number;
  currency?: string;
}

export function optimizeBudget(input: BudgetOptimizerInput): BudgetOptimizationResult {
  const currency = input.currency || 'INR';

  // 1. Sanitize and validate inputs
  const targetBudget = Math.max(0, isNaN(Number(input.targetBudget)) ? 50000 : Number(input.targetBudget));
  const totalDays = Math.max(1, Math.floor(Number(input.totalDays)) || 1);
  const travelers = Math.max(1, Math.floor(Number(input.travelers)) || 1);

  // 5-day trip represents 4 hotel nights; 1-day trip is 1 day-use/night minimum
  const nights = Math.max(1, totalDays > 1 ? totalDays - 1 : 1);

  // 2. Calculate Flights Cost
  // PRICING CONTRACT:
  // - NormalizedFlightOffer.totalPrice represents the total quoted fare for the complete booking party.
  //   When totalPrice is present (> 0), it is respected as the authoritative total quoted fare.
  // - If totalPrice is absent or 0, but pricePerPerson is available (> 0), totalPrice is derived
  //   as pricePerPerson * travelers.
  // - Limitation: If a downstream provider returns a per-person fare in totalPrice without an explicit
  //   indicator, we avoid silently multiplying an ambiguous price.
  let flightsCost = 0;
  if (input.flightResults && input.flightResults.length > 0) {
    const validFlightCosts = input.flightResults
      .map((f) => {
        const rawTotal = Number(f.totalPrice);
        const rawPerPerson = Number(f.pricePerPerson);

        if (!isNaN(rawTotal) && rawTotal > 0) {
          return rawTotal;
        }

        if (!isNaN(rawPerPerson) && rawPerPerson > 0) {
          return rawPerPerson * travelers;
        }

        return 0;
      })
      .filter((cost) => cost > 0);

    if (validFlightCosts.length > 0) {
      flightsCost = Math.min(...validFlightCosts);
    }
  }

  // 3. Calculate Hotels Cost (prefer provider quoted stay totalPrice, or pricePerNight * nights)
  let hotelsCost = 0;
  if (input.hotelResults && input.hotelResults.length > 0) {
    const validHotelCosts = input.hotelResults
      .map((h) => {
        const rawTotal = Number(h.totalPrice);
        const rawPerNight = Number(h.pricePerNight);

        // If provider quoted full stay totalPrice
        if (!isNaN(rawTotal) && rawTotal > 0) {
          // If totalPrice equals pricePerNight but nights > 1, totalPrice was per-night
          if (!isNaN(rawPerNight) && rawPerNight > 0 && rawTotal === rawPerNight && nights > 1) {
            return rawPerNight * nights;
          }
          return rawTotal;
        }

        // Fallback to nightly rate * actual nights (e.g. 5 days = 4 nights)
        if (!isNaN(rawPerNight) && rawPerNight > 0) {
          return rawPerNight * nights;
        }

        return 0;
      })
      .filter((cost) => cost > 0);

    if (validHotelCosts.length > 0) {
      hotelsCost = Math.min(...validHotelCosts);
    }
  }

  // 4. Calculate Activities Cost (deduplicated to prevent accidental double-counting)
  let activitiesCost = 0;
  if (input.attractionResults && input.attractionResults.length > 0) {
    const seenAttractions = new Set<string>();

    activitiesCost = input.attractionResults.reduce((sum, a) => {
      const dedupeKey = (a.title || '').trim().toLowerCase() + '::' + (a.locationName || '').trim().toLowerCase();
      if (seenAttractions.has(dedupeKey)) {
        return sum; // Skip duplicate attraction
      }
      seenAttractions.add(dedupeKey);

      const cost = Math.max(0, Number(a.estimatedCost) || 0);
      return sum + cost;
    }, 0);
  }

  // 5. Total Quoted Inventory & 10% Contingency Buffer
  const totalQuotedInventory = flightsCost + hotelsCost + activitiesCost;
  const contingencyBuffer = Math.round(totalQuotedInventory * 0.10);
  const totalProjectedSpend = totalQuotedInventory + contingencyBuffer;

  // 6. Surplus / Deficit & 5% Classification Tolerance
  const remainingSurplusOrDeficit = targetBudget - totalProjectedSpend;
  const threshold = targetBudget * 0.05; // Strict 5% tolerance

  let status: 'OPTIMAL' | 'UNDER_BUDGET' | 'OVER_BUDGET';
  if (remainingSurplusOrDeficit < -threshold) {
    status = 'OVER_BUDGET';
  } else if (remainingSurplusOrDeficit > threshold) {
    status = 'UNDER_BUDGET';
  } else {
    status = 'OPTIMAL';
  }

  // 7. Category Breakdown
  const denominator = totalProjectedSpend > 0 ? totalProjectedSpend : targetBudget;
  const categoryBreakdown: BudgetCategoryAllocation[] = [
    {
      category: 'FLIGHTS',
      amount: flightsCost,
      percentage: denominator > 0 ? Math.round((flightsCost / denominator) * 100) : 0
    },
    {
      category: 'HOTELS',
      amount: hotelsCost,
      percentage: denominator > 0 ? Math.round((hotelsCost / denominator) * 100) : 0
    },
    {
      category: 'ACTIVITIES',
      amount: activitiesCost,
      percentage: denominator > 0 ? Math.round((activitiesCost / denominator) * 100) : 0
    },
    {
      category: 'CONTINGENCY',
      amount: contingencyBuffer,
      percentage: denominator > 0 ? Math.round((contingencyBuffer / denominator) * 100) : 0
    }
  ];

  // 8. Dynamic Actionable Recommendations
  const recommendations: string[] = [];
  if (status === 'OVER_BUDGET') {
    const deficitAbs = Math.abs(remainingSurplusOrDeficit);
    recommendations.push(
      `Projected spend exceeds target budget by ${currency} ${deficitAbs.toLocaleString('en-IN')}.`
    );
    if (flightsCost > 0) {
      recommendations.push('Consider choosing economy class flights or exploring alternative departure dates.');
    }
    if (hotelsCost > 0) {
      recommendations.push('Opt for budget-friendly 3-star lodging or boutique homestays to reduce nightly accommodation rates.');
    }
    recommendations.push('Consider reducing trip duration or prioritizing free public attractions and beaches.');
  } else if (status === 'UNDER_BUDGET') {
    recommendations.push(
      `You have a comfortable surplus of ${currency} ${remainingSurplusOrDeficit.toLocaleString('en-IN')}.`
    );
    recommendations.push('Consider upgrading to 4-star/5-star beachfront resorts or scheduling premium guided tours and fine dining experiences.');
  } else {
    recommendations.push('Budget allocation is well-balanced across flights, accommodation, activities, and contingency reserve.');
  }

  return {
    targetBudget,
    currency,
    totalQuotedInventory,
    flightsCost,
    hotelsCost,
    activitiesCost,
    contingencyBuffer,
    totalProjectedSpend,
    remainingSurplusOrDeficit,
    status,
    categoryBreakdown,
    recommendations
  };
}
