import React from 'react';
import { PrizeStatus, PrizeTemplate, PrizeType, BountyStatus } from '../types';
import { Clock, CheckCircle, Gift, Edit2, CheckSquare, Wallet, Zap, FerrisWheel, HeartHandshake } from 'lucide-react';

interface PrizeCardProps {
  title: string;
  description: string;
  emoji: string;
  type?: PrizeType;
  themeColor?: string;
  status?: PrizeStatus | BountyStatus;
  onClick?: () => void;
  onEdit?: () => void;
  actionLabel?: string | null;
  customActions?: React.ReactNode;
  disabled?: boolean;
  variant?: 'template' | 'active' | 'history' | 'bounty';
  highlight?: boolean;
  count?: number;
  isFCFS?: boolean;
  hasDeadline?: boolean;
  assignedBy?: string;
  denialReason?: string; // Display denial reason on denied bounties
}

// Map pastel color classes to vibrant gradients
const getGradientFromThemeColor = (themeColor: string): { gradient: string; textColor: string; borderColor: string } | null => {
  if (themeColor === 'prize-wheel-gradient') {
    return {
      gradient: 'linear-gradient(to bottom right, rgb(244, 114, 182), rgb(192, 132, 252), rgb(99, 102, 241))',
      textColor: 'text-white',
      borderColor: 'border-pink-300 dark:border-purple-600'
    };
  }

  const colorMap: Record<string, { gradient: string; textColor: string; borderColor: string }> = {
    'bg-red-100 text-red-800 border-red-200': {
      gradient: 'linear-gradient(to bottom right, rgb(248, 113, 113), rgb(239, 68, 68))',
      textColor: 'text-white',
      borderColor: 'border-red-300 dark:border-red-600'
    },
    'bg-orange-100 text-orange-800 border-orange-200': {
      gradient: 'linear-gradient(to bottom right, rgb(251, 146, 60), rgb(249, 115, 22))',
      textColor: 'text-white',
      borderColor: 'border-orange-300 dark:border-orange-600'
    },
    'bg-amber-100 text-amber-800 border-amber-200': {
      gradient: 'linear-gradient(to bottom right, rgb(251, 191, 36), rgb(245, 158, 11))',
      textColor: 'text-white',
      borderColor: 'border-amber-300 dark:border-amber-600'
    },
    'bg-green-100 text-green-800 border-green-200': {
      gradient: 'linear-gradient(to bottom right, rgb(74, 222, 128), rgb(34, 197, 94))',
      textColor: 'text-white',
      borderColor: 'border-green-300 dark:border-green-600'
    },
    'bg-teal-100 text-teal-800 border-teal-200': {
      gradient: 'linear-gradient(to bottom right, rgb(45, 212, 191), rgb(20, 184, 166))',
      textColor: 'text-white',
      borderColor: 'border-teal-300 dark:border-teal-600'
    },
    'bg-blue-100 text-blue-800 border-blue-200': {
      gradient: 'linear-gradient(to bottom right, rgb(96, 165, 250), rgb(59, 130, 246))',
      textColor: 'text-white',
      borderColor: 'border-blue-300 dark:border-blue-600'
    },
    'bg-indigo-100 text-indigo-800 border-indigo-200': {
      gradient: 'linear-gradient(to bottom right, rgb(129, 140, 248), rgb(99, 102, 241))',
      textColor: 'text-white',
      borderColor: 'border-indigo-300 dark:border-indigo-600'
    },
    'bg-purple-100 text-purple-800 border-purple-200': {
      gradient: 'linear-gradient(to bottom right, rgb(192, 132, 252), rgb(168, 85, 247))',
      textColor: 'text-white',
      borderColor: 'border-purple-300 dark:border-purple-600'
    },
    'bg-pink-100 text-pink-800 border-pink-200': {
      gradient: 'linear-gradient(to bottom right, rgb(244, 114, 182), rgb(236, 72, 153))',
      textColor: 'text-white',
      borderColor: 'border-pink-300 dark:border-pink-600'
    },
    'bg-gray-100 text-gray-800 border-gray-200': {
      gradient: 'linear-gradient(to bottom right, rgb(156, 163, 175), rgb(107, 114, 128))',
      textColor: 'text-white',
      borderColor: 'border-gray-300 dark:border-gray-600'
    },
  };

  return colorMap[themeColor] || null;
};

const getTypeColor = (type: PrizeType) => {
  switch (type) {
    case PrizeType.FOOD: return 'bg-orange-100 dark:bg-orange-900/30 text-orange-900 dark:text-orange-200 border-orange-200 dark:border-orange-700';
    case PrizeType.ACTIVITY: return 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-200 border-blue-200 dark:border-blue-700';
    case PrizeType.PRIVILEGE: return 'bg-purple-100 dark:bg-purple-900/30 text-purple-900 dark:text-purple-200 border-purple-200 dark:border-purple-700';
    case PrizeType.MONEY: return 'bg-green-100 dark:bg-green-900/30 text-green-900 dark:text-green-200 border-green-200 dark:border-green-700';
    default: return 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600';
  }
};

const getStatusBadge = (status: PrizeStatus | BountyStatus) => {
  switch (status) {
    case PrizeStatus.PENDING_APPROVAL:
      return (
        <div className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30 rounded-full border border-amber-200 dark:border-amber-700">
          <Clock size={12} /> Waiting
        </div>
      );
    case PrizeStatus.REDEEMED:
      return (
        <div className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded-full">
          <CheckCircle size={12} /> Used
        </div>
      );
    case BountyStatus.IN_PROGRESS:
      return (
        <div className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30 rounded-full border border-blue-200 dark:border-blue-700">
            <Clock size={12} /> In Progress
        </div>
      );
    case BountyStatus.COMPLETED:
        return (
          <div className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/30 rounded-full border border-green-200 dark:border-green-700">
              <CheckSquare size={12} /> Done
          </div>
        );
    default:
      return null;
  }
};

export const PrizeCard: React.FC<PrizeCardProps> = ({
  title,
  description,
  emoji,
  type,
  themeColor,
  status,
  onClick,
  onEdit,
  actionLabel,
  customActions,
  disabled,
  variant = 'active',
  highlight = false,
  count,
  isFCFS,  hasDeadline,  assignedBy,
  denialReason,
}) => {
  const baseStyles = "relative flex flex-col p-4 rounded-2xl border-2 transition-all duration-200 shadow-sm overflow-hidden";
  const hoverStyles = !disabled && onClick ? "hover:scale-[1.02] hover:shadow-md active:scale-[0.98] cursor-pointer" : "";
  
  const isPrizeWheel = themeColor === 'prize-wheel-gradient';
  const gradientConfig = themeColor ? getGradientFromThemeColor(themeColor) : null;
  
  const colorStyles = gradientConfig
    ? `${gradientConfig.textColor} ${gradientConfig.borderColor}`
    : (type ? getTypeColor(type) : 'bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-200 border-gray-200 dark:border-gray-600');
  
  const highlightStyles = highlight ? "ring-4 ring-offset-2 ring-indigo-300" : "";

  const isBounty = variant === 'bounty';

  return (
    <div 
      className={`${baseStyles} ${colorStyles} ${hoverStyles} ${highlightStyles} ${variant === 'history' ? 'opacity-60 grayscale-[0.5]' : ''}`}
      style={gradientConfig ? {
        background: gradientConfig.gradient
      } : undefined}
      onClick={!disabled ? onClick : undefined}
    >
      {/* Count Badge */}
      {count && count > 1 && (
        <div className="absolute -top-1 -right-1 w-8 h-8 bg-red-600 dark:bg-red-500 text-white rounded-full flex items-center justify-center font-bold text-sm shadow-md border-2 border-white dark:border-gray-800 z-20">
            {count}
        </div>
      )}

      {/* FCFS Badge */}
      {isFCFS && (
        <div className="absolute -top-1 -left-1 px-2 py-1 bg-orange-500 dark:bg-orange-600 text-white rounded-br-xl rounded-tl-xl flex items-center gap-1 font-bold text-[10px] shadow-sm border-b border-r border-white dark:border-gray-800 z-20">
            <Zap size={10} fill="currentColor" />
            <span>FAST GRAB</span>
        </div>
      )}

      {/* DEADLINE Badge */}
      {hasDeadline && (
        <div className={`absolute -top-1 ${isFCFS ? 'left-[85px] rounded-b-xl' : '-left-1 rounded-br-xl rounded-tl-xl'} px-2 py-1 bg-amber-500 dark:bg-amber-600 text-white flex items-center gap-1 font-bold text-[10px] shadow-sm border-b border-r border-white dark:border-gray-800 z-20`}>
            <Clock size={10} />
            <span>DEADLINE</span>
        </div>
      )}

      <div className="flex justify-between items-start mb-2 z-10 mt-1">
        <span className="text-4xl shadow-sm filter drop-shadow-md">{emoji}</span>
        
        <div className="flex gap-1">
            {status && getStatusBadge(status)}
            
            {!status && onEdit && (
                <button 
                    onClick={(e) => { e.stopPropagation(); onEdit(); }}
                    className="p-2 bg-white/80 dark:bg-gray-700/80 hover:bg-white dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-full shadow-sm transition-all backdrop-blur-sm"
                >
                    <Edit2 size={14}/>
                </button>
            )}

            {!status && variant === 'template' && !onEdit && (
                <div className="p-1 bg-white/50 dark:bg-gray-700/50 rounded-full"><Gift size={14}/></div>
            )}
        </div>
      </div>
      
      <h3 className="text-lg font-bold leading-tight mb-1 z-10">{title}</h3>
      <p className={`text-sm leading-snug mb-4 flex-grow z-10 ${isBounty ? 'font-semibold opacity-90' : 'opacity-80'}`}>{description}</p>
      
      {/* Denial Reason Display */}
      {denialReason && status === BountyStatus.DENIED && (
        <div className="text-xs font-semibold text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30 px-2 py-1.5 rounded-lg mb-3 z-10 border border-red-200 dark:border-red-700">
          ❌ {denialReason}
        </div>
      )}
      
      {/* Decoration for Prize Wheel */}
      {isPrizeWheel && (
          <div className="absolute -bottom-4 -right-4 opacity-20  text-white">
              <FerrisWheel size={200} strokeWidth={1.5} />
          </div>
      )}

      {/* Decoration for Rewards (when gradientConfig exists and not prize wheel) */}
      {gradientConfig && !isPrizeWheel && !isBounty && (
          <div className="absolute -bottom-6 -right-6 opacity-20 transform rotate-12 text-white">
              <Gift size={180} strokeWidth={1.5} />
          </div>
      )}

      {/* Decoration for Bounties */}
      {isBounty && gradientConfig && (
          <div className="absolute -bottom-4 -right-4 opacity-20 transform rotate-12 text-white">
              <HeartHandshake size={220} strokeWidth={1.5} />
          </div>
      )}

      {customActions ? (
          <div className="mt-auto z-10">{customActions}</div>
      ) : (
          actionLabel && (
            <button
              disabled={disabled}
              className={`mt-auto w-full py-2 px-4 rounded-xl font-bold text-sm shadow-sm transition-colors z-10 border
                ${disabled 
                  ? 'bg-black/5 dark:bg-white/5 text-black/30 dark:text-white/30 border-transparent cursor-not-allowed' 
                  : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600 border-gray-100 dark:border-gray-600'
                }`}
              onClick={(e) => {
                e.stopPropagation();
                if(onClick && !disabled) onClick();
              }}
            >
              {actionLabel}
            </button>
          )
      )}
    </div>
  );
};