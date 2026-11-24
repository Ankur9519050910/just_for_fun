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
  const targetBudget = Number(input.targetBudget) || 50000;
  const totalDays = Math.max(1, input.totalDays || 1);

  // 1. Calculate Flights Cost (best available flight offer)
  let flightsCost = 0;
  if (input.flightResults && input.flightResults.length > 0) {
    const prices = input.flightResults.map((f) => Number(f.totalPrice)).filter((p) => !isNaN(p) && p > 0);
    if (prices.length > 0) {
      flightsCost = Math.min(...prices);
    }
  }

  // 2. Calculate Hotels Cost (cheapest per night * totalDays)
  let hotelsCost = 0;
  if (input.hotelResults && input.hotelResults.length > 0) {
    const nightPrices = input.hotelResults
      .map((h) => Number(h.pricePerNight))
      .filter((p) => !isNaN(p) && p > 0);
    if (nightPrices.length > 0) {
      const minPerNight = Math.min(...nightPrices);
      hotelsCost = minPerNight * totalDays;
    } else {
      const totalPrices = input.hotelResults
        .map((h) => Number(h.totalPrice))
        .filter((p) => !isNaN(p) && p > 0);
      if (totalPrices.length > 0) {
        hotelsCost = Math.min(...totalPrices);
      }
    }
  }

  // 3. Calculate Activities Cost
  let activitiesCost = 0;
  if (input.attractionResults && input.attractionResults.length > 0) {
    activitiesCost = input.attractionResults.reduce((sum, a) => {
      const cost = Number(a.estimatedCost) || 0;
      return sum + cost;
    }, 0);
  }

  // 4. Subtotal & 10% Contingency Buffer
  const totalQuotedInventory = flightsCost + hotelsCost + activitiesCost;
  const contingencyBuffer = Math.round(totalQuotedInventory * 0.10);
  const totalProjectedSpend = totalQuotedInventory + contingencyBuffer;

  // 5. Surplus / Deficit & Status
  const remainingSurplusOrDeficit = targetBudget - totalProjectedSpend;
  const threshold = targetBudget * 0.05; // 5% tolerance

  let status: 'OPTIMAL' | 'UNDER_BUDGET' | 'OVER_BUDGET';
  if (remainingSurplusOrDeficit < -threshold) {
    status = 'OVER_BUDGET';
  } else if (remainingSurplusOrDeficit > threshold) {
    status = 'UNDER_BUDGET';
  } else {
    status = 'OPTIMAL';
  }

  // 6. Category Breakdown
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

  // 7. Dynamic Recommendations
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
    recommendations.push('Consider reducing trip duration or prioritizing free public beaches and cultural sights.');
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
