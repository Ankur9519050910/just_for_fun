import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Sparkles,
  Plane,
  Building2,
  CloudSun,
  MapPin,
  Bot,
  User,
  AlertCircle,
  Clock,
  Compass
} from 'lucide-react';
import { Navbar } from '../components/layout/Navbar';
import { sendChatMessageStream } from '../api/chatStreamApi';
import { NormalizedFlightOffer, NormalizedHotelOffer } from '../types/trip';

interface ChatMessage {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: string;
  isClarification?: boolean;
}

export const WorkspacePage: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'agent',
      text: "Hello! I am your autonomous AI Travel Companion. Where would you like to travel, from which city, and what is your budget or duration? (e.g. 'Plan a 5-day trip to Goa for two from Kolkata with a budget of ₹50,000')",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [activeTab, setActiveTab] = useState<'flights' | 'hotels' | 'attractions' | 'budget'>('flights');
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [providerErrorNotice, setProviderErrorNotice] = useState<string | null>(null);

  // Structured Agent Results
  const [flights, setFlights] = useState<NormalizedFlightOffer[]>([]);
  const [hotels, setHotels] = useState<NormalizedHotelOffer[]>([]);
  const [attractions, setAttractions] = useState<any[]>([]);
  const [weather, setWeather] = useState<any[]>([]);
  const [extractedIntent, setExtractedIntent] = useState<Record<string, any> | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentStep]);

  const handleSendMessage = async (customText?: string) => {
    const textToSend = customText || inputText;
    if (!textToSend.trim() || isStreaming) return;

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsStreaming(true);
    setCurrentStep('Analyzing intent and extracting constraints...');
    setProviderErrorNotice(null);

    try {
      await sendChatMessageStream(
        { message: textToSend, conversationId },
        {
          onWorkflowStep: (step) => {
            setCurrentStep(step.description);
          },
          onIntentExtracted: (intent) => {
            setExtractedIntent(intent.intent as any);
          },
          onNeedClarification: (data) => {
            setMessages((prev) => [
              ...prev,
              {
                id: `agent_${Date.now()}`,
                sender: 'agent',
                text: data.question,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                isClarification: true
              }
            ]);
            setCurrentStep(null);
          },
          onProviderError: (err) => {
            if (err.fallbackTriggered) {
              setProviderErrorNotice(`Live API (${err.provider}) returned ${err.errorCode}. Switched to deterministic test fixture.`);
            }
          },
          onFlightResults: (data) => {
            setFlights(data.flights);
            if (data.flights.length > 0) setActiveTab('flights');
          },
          onHotelResults: (data) => {
            setHotels(data.hotels);
          },
          onDestinationResults: (data) => {
            setAttractions(data.attractions);
            setWeather(data.weather);
          },
          onPlanReady: (plan) => {
            setMessages((prev) => [
              ...prev,
              {
                id: `agent_plan_${Date.now()}`,
                sender: 'agent',
                text: plan.summary,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              }
            ]);
          },
          onDone: (data) => {
            setConversationId(data.conversationId);
            setIsStreaming(false);
            setCurrentStep(null);
          },
          onError: (err) => {
            setMessages((prev) => [
              ...prev,
              {
                id: `agent_err_${Date.now()}`,
                sender: 'agent',
                text: `Error: ${err.message}`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              }
            ]);
            setIsStreaming(false);
            setCurrentStep(null);
          }
        }
      );
    } catch {
      setIsStreaming(false);
      setCurrentStep(null);
    }
  };

  const samplePrompt = "Plan a 5-day trip to Goa for two people from Kolkata. Total budget ₹50,000. I prefer comfortable hotels, beaches, adventure activities, and local food.";

  return (
    <div className="h-screen bg-slate-950 flex flex-col overflow-hidden">
      <Navbar />

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left Pane (40%): Conversational Chat & Streaming */}
        <div className="w-full md:w-[42%] border-r border-slate-800 flex flex-col bg-slate-900/40 backdrop-blur-md">
          {/* Header */}
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center border border-teal-500/20">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">Travel Orchestrator Agent</h2>
                <div className="flex items-center gap-1.5 text-[11px] text-teal-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
                  <span>LangGraph Stateful Runtime</span>
                </div>
              </div>
            </div>

            {conversationId && (
              <span className="text-[10px] text-slate-500 font-mono">
                Thread: {conversationId.slice(0, 8)}
              </span>
            )}
          </div>

          {/* Messages Stream */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'agent' && (
                  <div className="w-7 h-7 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center shrink-0 border border-teal-500/20 mt-0.5">
                    <Bot className="w-4 h-4" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl p-3.5 text-xs sm:text-sm leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-teal-600 text-white rounded-br-none shadow-md shadow-teal-600/20'
                      : msg.isClarification
                      ? 'bg-amber-500/10 border border-amber-500/30 text-amber-200 rounded-bl-none'
                      : 'bg-slate-800/80 border border-slate-700/60 text-slate-200 rounded-bl-none whitespace-pre-line'
                  }`}
                >
                  <p>{msg.text}</p>
                  <span className="block text-[10px] text-slate-400/80 mt-1 text-right">
                    {msg.timestamp}
                  </span>
                </div>
                {msg.sender === 'user' && (
                  <div className="w-7 h-7 rounded-lg bg-teal-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))}

            {/* Current Running Workflow Step Banner */}
            {isStreaming && currentStep && (
              <div className="p-3 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-300 text-xs flex items-center gap-2 animate-pulse">
                <Clock className="w-4 h-4 animate-spin text-teal-400 shrink-0" />
                <span>{currentStep}</span>
              </div>
            )}

            {/* Provider Error Notice if fallback occurred */}
            {providerErrorNotice && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{providerErrorNotice}</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Suggestion Pill */}
          {messages.length <= 1 && (
            <div className="px-4 py-2 bg-slate-950/60 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => handleSendMessage(samplePrompt)}
                className="w-full text-left p-2.5 rounded-xl bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 text-[11px] text-slate-300 hover:text-teal-300 transition-colors flex items-center gap-2"
              >
                <Sparkles className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                <span className="truncate">Sample: "Plan a 5-day trip to Goa for two from Kolkata (₹50k budget)"</span>
              </button>
            </div>
          )}

          {/* Chat Input Box */}
          <div className="p-3 border-t border-slate-800 bg-slate-950">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask your travel agent or answer follow-up questions..."
                disabled={isStreaming}
                className="flex-1 py-2.5 px-3.5 bg-slate-900 border border-slate-700/80 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isStreaming || !inputText.trim()}
                className="p-2.5 rounded-xl bg-teal-500 text-slate-950 font-bold hover:bg-teal-400 disabled:opacity-40 transition-colors shrink-0 shadow-md shadow-teal-500/20"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>

        {/* Right Pane (58%): Interactive Command Center */}
        <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
          {/* Tabs Navigation */}
          <div className="border-b border-slate-800 px-6 pt-3 flex items-center justify-between bg-slate-900/50">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab('flights')}
                className={`flex items-center gap-2 px-4 py-2.5 border-b-2 text-xs font-semibold transition-colors ${
                  activeTab === 'flights'
                    ? 'border-teal-400 text-teal-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Plane className="w-3.5 h-3.5" />
                <span>Flights ({flights.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('hotels')}
                className={`flex items-center gap-2 px-4 py-2.5 border-b-2 text-xs font-semibold transition-colors ${
                  activeTab === 'hotels'
                    ? 'border-teal-400 text-teal-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>Hotels ({hotels.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('attractions')}
                className={`flex items-center gap-2 px-4 py-2.5 border-b-2 text-xs font-semibold transition-colors ${
                  activeTab === 'attractions'
                    ? 'border-teal-400 text-teal-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <CloudSun className="w-3.5 h-3.5" />
                <span>Attractions & Weather</span>
              </button>

              <button
                onClick={() => setActiveTab('budget')}
                className={`flex items-center gap-2 px-4 py-2.5 border-b-2 text-xs font-semibold transition-colors ${
                  activeTab === 'budget'
                    ? 'border-teal-400 text-teal-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Compass className="w-3.5 h-3.5" />
                <span>Budget Preview</span>
              </button>
            </div>

            {extractedIntent?.destination && (
              <div className="hidden sm:flex items-center gap-2 text-xs text-slate-300 bg-slate-800/80 py-1 px-3 rounded-full border border-slate-700">
                <MapPin className="w-3 h-3 text-teal-400" />
                <span>{extractedIntent.origin || 'CCU'} → {extractedIntent.destination}</span>
              </div>
            )}
          </div>

          {/* Tab Content Display */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'flights' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Discovered Flight Combinations
                  </h3>
                  <span className="text-xs text-slate-400">Sorted by best value & duration</span>
                </div>

                {flights.length === 0 ? (
                  <div className="text-center py-16 border border-dashed border-slate-800 rounded-2xl p-6">
                    <Plane className="w-8 h-8 text-slate-600 mx-auto mb-2 animate-bounce" />
                    <p className="text-sm text-slate-400">No flights loaded yet</p>
                    <p className="text-xs text-slate-500 mt-1">Prompt the agent to begin inventory discovery</p>
                  </div>
                ) : (
                  flights.map((f) => (
                    <div
                      key={f.id}
                      className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-sm font-bold text-white">{f.airlineName}</span>
                          <span className="text-xs px-2 py-0.5 rounded bg-slate-800 font-mono text-slate-300">
                            {f.flightNumber}
                          </span>
                          {/* Provenance Badge */}
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                              f.isMockData
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            }`}
                          >
                            {f.source}
                          </span>
                        </div>

                        <div className="flex items-center gap-4 text-xs text-slate-300">
                          <div>
                            <span className="font-semibold text-white">{f.originAirport}</span>
                            <span className="text-slate-400 ml-1">{new Date(f.departureTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <span className="text-slate-500">→</span>
                          <div>
                            <span className="font-semibold text-white">{f.destAirport}</span>
                            <span className="text-slate-400 ml-1">{new Date(f.arrivalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <span className="text-slate-500">|</span>
                          <span>{Math.floor(f.durationMins / 60)}h {f.durationMins % 60}m</span>
                          <span className="text-slate-500">|</span>
                          <span>{f.stops === 0 ? 'Non-stop' : `${f.stops} Stop`}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-lg font-bold text-teal-400">
                          ₹{f.totalPrice.toLocaleString('en-IN')}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          ₹{f.pricePerPerson.toLocaleString('en-IN')} / person
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'hotels' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Verified Accommodation Options
                  </h3>
                  <span className="text-xs text-slate-400">Filtered for rating ≥4.0★</span>
                </div>

                {hotels.length === 0 ? (
                  <div className="text-center py-16 border border-dashed border-slate-800 rounded-2xl p-6">
                    <Building2 className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">No hotels loaded yet</p>
                  </div>
                ) : (
                  hotels.map((h) => (
                    <div
                      key={h.id}
                      className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all flex flex-col sm:flex-row justify-between gap-4"
                    >
                      <div className="flex gap-4">
                        {h.imageUrl && (
                          <img
                            src={h.imageUrl}
                            alt={h.hotelName}
                            className="w-24 h-24 rounded-lg object-cover border border-slate-800 shrink-0"
                          />
                        )}
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-sm font-bold text-white">{h.hotelName}</h4>
                            <span className="text-xs text-amber-400 font-semibold">★ {h.starRating}</span>
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                                h.isMockData
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              }`}
                            >
                              {h.source}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400">{h.address}</p>
                          <p className="text-xs text-teal-400/90 mt-1 font-medium">{h.roomType}</p>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {h.amenities.slice(0, 3).map((a: string, i: number) => (
                              <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                                {a}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="text-right sm:self-center">
                        <div className="text-lg font-bold text-emerald-400">
                          ₹{h.totalPrice.toLocaleString('en-IN')}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          ₹{h.pricePerNight.toLocaleString('en-IN')} / night
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'attractions' && (
              <div className="space-y-6">
                {/* Weather Forecast Row */}
                {weather.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <CloudSun className="w-4 h-4 text-teal-400" />
                      <span>Live Open-Meteo Weather Forecast</span>
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                      {weather.map((w, idx) => (
                        <div key={idx} className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-center">
                          <p className="text-[11px] text-slate-400 font-mono">{w.date}</p>
                          <p className="text-base font-bold text-white mt-1">{w.maxTempC}°C</p>
                          <p className="text-[10px] text-teal-400 truncate mt-0.5">{w.condition}</p>
                          <p className="text-[9px] text-slate-500 mt-1">Rain: {w.precipitationProbPercent}%</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Curated Attractions */}
                <div>
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-emerald-400" />
                    <span>Curated Experiences & Attractions</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {attractions.map((a, i) => (
                      <div key={i} className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold text-white">{a.title}</span>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20">
                            {a.category}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">{a.description}</p>
                        <div className="mt-2.5 pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                          <span>{a.locationName}</span>
                          <span className="text-emerald-400 font-semibold">Est: ₹{a.estimatedCost}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'budget' && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">
                  Deterministic Budget Optimization
                </h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs text-slate-300 mb-1">
                      <span>Flights (₹{flights[0]?.totalPrice || 12400})</span>
                      <span>{Math.round(((flights[0]?.totalPrice || 12400) / (extractedIntent?.totalBudget || 50000)) * 100)}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-teal-500 rounded-full"
                        style={{ width: `${Math.min(100, ((flights[0]?.totalPrice || 12400) / (extractedIntent?.totalBudget || 50000)) * 100)}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-slate-300 mb-1">
                      <span>Hotels (₹{hotels[0]?.totalPrice || 16800})</span>
                      <span>{Math.round(((hotels[0]?.totalPrice || 16800) / (extractedIntent?.totalBudget || 50000)) * 100)}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${Math.min(100, ((hotels[0]?.totalPrice || 16800) / (extractedIntent?.totalBudget || 50000)) * 100)}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-slate-300 mb-1">
                      <span>Activities, Dining & Buffer (~₹8,000)</span>
                      <span>16%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full bg-cyan-500 rounded-full" style={{ width: '16%' }} />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-400">Total Estimated Spend</p>
                      <h4 className="text-xl font-bold text-white mt-0.5">
                        ₹{((flights[0]?.totalPrice || 12400) + (hotels[0]?.totalPrice || 16800) + 8000).toLocaleString('en-IN')}
                      </h4>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Target Budget</p>
                      <h4 className="text-xl font-bold text-teal-400 mt-0.5">
                        ₹{(extractedIntent?.totalBudget || 50000).toLocaleString('en-IN')}
                      </h4>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
