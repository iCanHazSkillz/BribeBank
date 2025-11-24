import React from 'react';
import { PrizeStatus, PrizeTemplate, PrizeType, BountyStatus } from '../types';
import { Clock, CheckCircle, Gift, Edit2, CheckSquare, Wallet, Zap } from 'lucide-react';

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
}

const getTypeColor = (type: PrizeType) => {
  switch (type) {
    case PrizeType.FOOD: return 'bg-orange-100 text-orange-900 border-orange-200';
    case PrizeType.ACTIVITY: return 'bg-blue-100 text-blue-900 border-blue-200';
    case PrizeType.PRIVILEGE: return 'bg-purple-100 text-purple-900 border-purple-200';
    case PrizeType.MONEY: return 'bg-green-100 text-green-900 border-green-200';
    default: return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

const getStatusBadge = (status: PrizeStatus | BountyStatus) => {
  switch (status) {
    case PrizeStatus.PENDING_APPROVAL:
      return (
        <div className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-amber-700 bg-amber-100 rounded-full border border-amber-200">
          <Clock size={12} /> Waiting
        </div>
      );
    case PrizeStatus.REDEEMED:
      return (
        <div className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-gray-500 bg-gray-100 rounded-full">
          <CheckCircle size={12} /> Used
        </div>
      );
    case BountyStatus.IN_PROGRESS:
      return (
        <div className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-blue-700 bg-blue-100 rounded-full border border-blue-200">
            <Clock size={12} /> In Progress
        </div>
      );
    case BountyStatus.COMPLETED:
        return (
          <div className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-green-700 bg-green-100 rounded-full border border-green-200">
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
  isFCFS
}) => {
  const baseStyles = "relative flex flex-col p-4 rounded-2xl border-2 transition-all duration-200 shadow-sm overflow-hidden";
  const hoverStyles = !disabled && onClick ? "hover:scale-[1.02] hover:shadow-md active:scale-[0.98] cursor-pointer" : "";
  
  const colorStyles = themeColor || (type ? getTypeColor(type) : 'bg-gray-50 text-gray-900 border-gray-200');
  const highlightStyles = highlight ? "ring-4 ring-offset-2 ring-indigo-300" : "";

  const isBounty = variant === 'bounty';

  return (
    <div 
      className={`${baseStyles} ${colorStyles} ${hoverStyles} ${highlightStyles} ${variant === 'history' ? 'opacity-60 grayscale-[0.5]' : ''}`}
      onClick={!disabled ? onClick : undefined}
    >
      {/* Count Badge */}
      {count && count > 1 && (
        <div className="absolute -top-1 -right-1 w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center font-bold text-sm shadow-md border-2 border-white z-20">
            {count}
        </div>
      )}

      {/* FCFS Badge */}
      {isFCFS && (
        <div className="absolute -top-1 -left-1 px-2 py-1 bg-orange-500 text-white rounded-br-xl rounded-tl-xl flex items-center gap-1 font-bold text-[10px] shadow-sm border-b border-r border-white z-20">
            <Zap size={10} fill="currentColor" />
            <span>FAST GRAB</span>
        </div>
      )}

      <div className="flex justify-between items-start mb-2 z-10 mt-1">
        <span className="text-4xl shadow-sm filter drop-shadow-md">{emoji}</span>
        
        <div className="flex gap-1">
            {status && getStatusBadge(status)}
            
            {!status && onEdit && (
                <button 
                    onClick={(e) => { e.stopPropagation(); onEdit(); }}
                    className="p-2 bg-white/80 hover:bg-white text-gray-700 rounded-full shadow-sm transition-all backdrop-blur-sm"
                >
                    <Edit2 size={14}/>
                </button>
            )}

            {!status && variant === 'template' && !onEdit && (
                <div className="p-1 bg-white/50 rounded-full"><Gift size={14}/></div>
            )}
        </div>
      </div>
      
      <h3 className="text-lg font-bold leading-tight mb-1 z-10">{title}</h3>
      <p className={`text-sm leading-snug mb-4 flex-grow z-10 ${isBounty ? 'font-semibold opacity-90' : 'opacity-80'}`}>{description}</p>
      
      {/* Decoration for Bounties */}
      {isBounty && (
          <div className="absolute -bottom-4 -right-4 opacity-10 transform rotate-12 text-current">
              <Wallet size={80} />
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
                  ? 'bg-black/5 text-black/30 border-transparent cursor-not-allowed' 
                  : 'bg-white text-gray-900 hover:bg-gray-50 border-gray-100'
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