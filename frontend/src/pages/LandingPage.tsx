import React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Bot, Compass, ShieldCheck, Zap, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Navbar } from '../components/layout/Navbar';

export const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <Navbar />

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-20 pb-28">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-teal-500/15 via-emerald-500/10 to-indigo-500/15 blur-3xl pointer-events-none rounded-full" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 text-teal-300 text-xs font-semibold mb-6 shadow-sm">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Autonomous Multi-Agent Travel Intelligence</span>
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white max-w-4xl mx-auto leading-tight">
            Meet Your Autonomous{' '}
            <span className="bg-gradient-to-r from-teal-400 via-emerald-300 to-cyan-400 bg-clip-text text-transparent">
              AI Travel Agent
            </span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto font-normal leading-relaxed">
            From natural language prompts to verified flight search, hotel comparisons, budget constraint solving, and human-in-the-loop booking confirmations.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/register"
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-bold text-base shadow-lg shadow-teal-500/25 hover:shadow-teal-500/40 transition-all duration-200 flex items-center justify-center gap-2 group"
            >
              <span>Start Planning Your Trip</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>

            <Link
              to="/login"
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-slate-900 border border-slate-700/80 hover:border-slate-600 text-slate-200 hover:text-white font-semibold text-base transition-colors"
            >
              Sign In to Dashboard
            </Link>
          </div>

          {/* Sample Prompt Preview Box */}
          <div className="mt-14 max-w-3xl mx-auto bg-slate-900/80 border border-slate-800 rounded-2xl p-6 text-left shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-2 text-xs font-semibold text-teal-400 mb-2">
              <Bot className="w-4 h-4" />
              <span>Real Example Natural Language Request</span>
            </div>
            <p className="text-sm sm:text-base text-slate-200 font-mono bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
              "Plan a 5-day trip to Goa for two people from Kolkata. Total budget ₹50,000. I prefer comfortable hotels, beaches, adventure activities, and authentic seafood. Find flights, hotels, and prepare the best day-wise itinerary."
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
                <span>Deterministic Budget Solver</span>
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
                <span>Verified Inventory Providers</span>
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
                <span>Strict Human Confirmation Gate</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Highlights */}
      <section className="py-20 border-t border-slate-900 bg-slate-950/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl font-bold text-white">Engineered for Production Reliability</h2>
            <p className="text-slate-400 mt-3 text-sm">
              Not a basic chatbot. Built with state machines, tool calling, and strict verification.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-slate-900/50 border border-slate-800/80 p-8 rounded-2xl hover:border-slate-700 transition-all">
              <div className="w-12 h-12 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center mb-5 border border-teal-500/20">
                <Compass className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">LangGraph Orchestration</h3>
              <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                Persistent stateful graphs, checkpointing, and dynamic tool calls tailored for complex multi-leg journeys.
              </p>
            </div>

            <div className="bg-slate-900/50 border border-slate-800/80 p-8 rounded-2xl hover:border-slate-700 transition-all">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-5 border border-emerald-500/20">
                <Zap className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">Deterministic Optimization</h3>
              <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                Algorithmic constraint solver ensures your flights, accommodation, and activities never exceed your hard budget.
              </p>
            </div>

            <div className="bg-slate-900/50 border border-slate-800/80 p-8 rounded-2xl hover:border-slate-700 transition-all">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center mb-5 border border-cyan-500/20">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">Human-In-The-Loop Safety</h3>
              <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                Bookings are never made autonomously. Explicit user confirmation tokens and idempotency prevent accidental purchases.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-900 py-8 bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-slate-500">
          <p>© 2026 AI Travel Companion. Built with senior agentic AI engineering, LangGraph & React.</p>
        </div>
      </footer>
    </div>
  );
};
