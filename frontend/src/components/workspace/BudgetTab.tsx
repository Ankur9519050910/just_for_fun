import React from 'react';
import {
  DollarSign,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  ShieldCheck,
  Plane,
  Building2,
  Ticket,
  Shield
} from 'lucide-react';
import { BudgetOptimizationResult } from '../../types/trip';

interface BudgetTabProps {
  budget: BudgetOptimizationResult | null;
  targetBudget?: number;
}

export const BudgetTab: React.FC<BudgetTabProps> = ({ budget, targetBudget }) => {
  if (!budget) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-slate-900/40 rounded-2xl border border-slate-800">
        <div className="w-12 h-12 rounded-2xl bg-teal-500/10 text-teal-400 flex items-center justify-center mb-3">
          <DollarSign className="w-6 h-6" />
        </div>
        <h4 className="text-sm font-semibold text-slate-200">Budget Analysis Pending</h4>
        <p className="text-xs text-slate-400 mt-1 max-w-sm">
          Run a search in the agent chat to generate inventory quotes and a transparent budget optimization breakdown.
        </p>
      </div>
    );
  }

  const effectiveTarget = targetBudget || budget.targetBudget;
  const currencySymbol = budget.currency === 'INR' ? '₹' : budget.currency + ' ';
  const spendPercent = Math.min(
    100,
    Math.round((budget.totalProjectedSpend / (effectiveTarget || 1)) * 100)
  );

  const getStatusBadge = () => {
    switch (budget.status) {
      case 'OPTIMAL':
        return {
          icon: <CheckCircle className="w-4 h-4 text-emerald-400" />,
          label: 'Optimal Budget Alignment',
          bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
        };
      case 'UNDER_BUDGET':
        return {
          icon: <ShieldCheck className="w-4 h-4 text-cyan-400" />,
          label: 'Within Budget (Surplus Available)',
          bg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
        };
      case 'OVER_BUDGET':
        return {
          icon: <AlertTriangle className="w-4 h-4 text-rose-400" />,
          label: 'Exceeds Target Budget Ceiling',
          bg: 'bg-rose-500/10 text-rose-400 border-rose-500/30'
        };
    }
  };

  const statusBadge = getStatusBadge();

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'FLIGHTS':
        return <Plane className="w-3.5 h-3.5 text-teal-400" />;
      case 'HOTELS':
        return <Building2 className="w-3.5 h-3.5 text-emerald-400" />;
      case 'ACTIVITIES':
        return <Ticket className="w-3.5 h-3.5 text-amber-400" />;
      case 'CONTINGENCY':
        return <Shield className="w-3.5 h-3.5 text-indigo-400" />;
      default:
        return <DollarSign className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'FLIGHTS':
        return 'bg-teal-500';
      case 'HOTELS':
        return 'bg-emerald-500';
      case 'ACTIVITIES':
        return 'bg-amber-500';
      case 'CONTINGENCY':
        return 'bg-indigo-500';
      default:
        return 'bg-slate-500';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Status */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-teal-400" />
            <span>Deterministic Budget Optimization</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Transparent breakdown including flight fares, accommodation, activities, and 10% contingency buffer
          </p>
        </div>

        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold ${statusBadge.bg}`}>
          {statusBadge.icon}
          <span>{statusBadge.label}</span>
        </div>
      </div>

      {/* Primary Spend Overview Card */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-xl shadow-black/20">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="text-xs text-slate-400 block mb-1">Target Budget</span>
            <span className="text-2xl font-bold text-teal-400">
              {currencySymbol}{effectiveTarget.toLocaleString('en-IN')}
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="text-xs text-slate-400 block mb-1">Total Projected Spend</span>
            <span className="text-2xl font-bold text-white">
              {currencySymbol}{budget.totalProjectedSpend.toLocaleString('en-IN')}
            </span>
            <span className="text-[11px] text-slate-400 block mt-0.5">
              Includes 10% buffer ({currencySymbol}{budget.contingencyBuffer.toLocaleString('en-IN')})
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="text-xs text-slate-400 block mb-1">
              {budget.remainingSurplusOrDeficit >= 0 ? 'Surplus Reserve' : 'Budget Deficit'}
            </span>
            <span
              className={`text-2xl font-bold ${
                budget.remainingSurplusOrDeficit >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {budget.remainingSurplusOrDeficit < 0 ? '-' : '+'}
              {currencySymbol}{Math.abs(budget.remainingSurplusOrDeficit).toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* Global Progress Bar */}
        <div>
          <div className="flex justify-between text-xs text-slate-300 mb-2">
            <span>Overall Spend Utilization</span>
            <span className="font-bold">{spendPercent}% of target budget</span>
          </div>
          <div className="w-full h-3 rounded-full bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                budget.status === 'OVER_BUDGET'
                  ? 'bg-rose-500'
                  : budget.status === 'OPTIMAL'
                  ? 'bg-emerald-500'
                  : 'bg-teal-500'
              }`}
              style={{ width: `${spendPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Category Breakdown Cards */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
          Category Allocation Breakdown
        </h4>

        <div className="space-y-3.5">
          {budget.categoryBreakdown.map((cat, idx) => (
            <div key={idx} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-slate-300">
                  {getCategoryIcon(cat.category)}
                  <span className="font-semibold">{cat.category}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-slate-400 font-medium">{cat.percentage}%</span>
                  <span className="text-white font-bold">
                    {currencySymbol}{cat.amount.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${getCategoryColor(
                    cat.category
                  )}`}
                  style={{ width: `${Math.min(100, cat.percentage)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Agent Recommendations */}
      {budget.recommendations && budget.recommendations.length > 0 && (
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-teal-400" />
            <span>Optimization Insights & Recommendations</span>
          </h4>
          <ul className="space-y-2">
            {budget.recommendations.map((rec, i) => (
              <li
                key={i}
                className="text-xs text-slate-300 flex items-start gap-2 p-2.5 rounded-xl bg-slate-950/50 border border-slate-800/60"
              >
                <span className="text-teal-400 font-bold mt-0.5">•</span>
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
