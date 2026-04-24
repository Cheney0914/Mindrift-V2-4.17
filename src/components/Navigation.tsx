import { NavLink } from 'react-router-dom';
import { Ear, Waves, Trees, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Navigation = () => {
  return (
    <nav className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[calc(100%-48px)] max-w-[440px] glass-dark rounded-full px-8 py-4 flex justify-around items-center z-50 shadow-2xl">
      <NavLink
        to="/"
        className={({ isActive }) =>
          cn(
            "flex flex-col items-center transition-all duration-300",
            isActive ? "text-primary scale-110" : "text-white/40 hover:text-white/70"
          )
        }
      >
        <Ear size={24} strokeWidth={2} />
      </NavLink>
      
      <NavLink
        to="/stream"
        className={({ isActive }) =>
          cn(
            "flex flex-col items-center transition-all duration-300",
            isActive ? "text-primary scale-110" : "text-white/40 hover:text-white/70"
          )
        }
      >
        <Waves size={24} strokeWidth={2} />
      </NavLink>

      <NavLink
        to="/synthesis"
        className={({ isActive }) =>
          cn(
            "flex flex-col items-center transition-all duration-300",
            isActive ? "text-primary scale-110" : "text-white/40 hover:text-white/70"
          )
        }
      >
        <Sparkles size={24} strokeWidth={2} />
      </NavLink>
      
      <NavLink
        to="/tree"
        className={({ isActive }) =>
          cn(
            "flex flex-col items-center transition-all duration-300",
            isActive ? "text-primary scale-110" : "text-white/40 hover:text-white/70"
          )
        }
      >
        <Trees size={24} strokeWidth={2} />
      </NavLink>
    </nav>
  );
};

