import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Compass, Sparkles, User as UserIcon, LogOut, Calendar, Settings } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <nav className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center text-slate-950 shadow-lg shadow-teal-500/20 group-hover:scale-105 transition-transform duration-200">
              <Compass className="w-6 h-6 animate-spin-slow" />
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-teal-400 via-emerald-300 to-white bg-clip-text text-transparent">
                AI Travel Companion
              </span>
              <span className="block text-[10px] font-medium tracking-wider text-teal-400/80 uppercase">
                Autonomous Trip Agent
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-3">
                <Link
                  to="/dashboard"
                  className="px-3.5 py-1.5 text-sm font-medium text-slate-300 hover:text-teal-400 flex items-center gap-2 rounded-lg hover:bg-slate-800/60 transition-colors"
                >
                  <Calendar className="w-4 h-4 text-teal-400" />
                  <span>My Trips</span>
                </Link>

                <Link
                  to="/profile"
                  className="px-3.5 py-1.5 text-sm font-medium text-slate-300 hover:text-teal-400 flex items-center gap-2 rounded-lg hover:bg-slate-800/60 transition-colors"
                >
                  <Settings className="w-4 h-4 text-teal-400" />
                  <span>Preferences</span>
                </Link>

                <div className="h-5 w-[1px] bg-slate-800 mx-1" />

                <div className="flex items-center gap-2.5 bg-slate-800/70 border border-slate-700/60 rounded-full py-1 px-3">
                  <div className="w-6 h-6 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center text-xs font-semibold">
                    <UserIcon className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-medium text-slate-200 max-w-[120px] truncate">
                    {user.name}
                  </span>
                  <button
                    onClick={handleLogout}
                    title="Sign Out"
                    className="text-slate-400 hover:text-rose-400 transition-colors ml-1"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  to="/login"
                  className="text-sm font-medium text-slate-300 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-800/60 transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="text-sm font-medium bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-semibold px-4 py-2 rounded-lg shadow-md shadow-teal-500/20 hover:shadow-teal-500/40 transition-all duration-200 flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Get Started</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};
