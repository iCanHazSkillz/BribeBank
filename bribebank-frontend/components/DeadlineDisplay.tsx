import React, { useState, useEffect } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';

interface DeadlineDisplayProps {
  deadlineExpiresAt?: number; // Timestamp in milliseconds
  completedAt?: number; // Timestamp when task was submitted (for frozen display)
  compact?: boolean; // Whether to show compact version (for cards)
}

export const DeadlineDisplay: React.FC<DeadlineDisplayProps> = ({ 
  deadlineExpiresAt,
  completedAt,
  compact = false
}) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    // Only update if not completed (frozen state)
    if (completedAt) return;
    
    // Update every minute
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 60000);

    return () => clearInterval(interval);
  }, [completedAt]);

  if (!deadlineExpiresAt) {
    return null;
  }

  // If completed, use completedAt timestamp instead of current time
  const referenceTime = completedAt || now;
  const timeRemaining = deadlineExpiresAt - referenceTime;
  const isOverdue = timeRemaining < 0;
  const absTimeRemaining = Math.abs(timeRemaining);

  const totalHours = Math.floor(absTimeRemaining / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const remainingHours = totalHours % 24;
  const minutes = Math.floor((absTimeRemaining % (1000 * 60 * 60)) / (1000 * 60));

  let displayText = '';
  
  if (days > 0) {
    // Show days and hours
    if (remainingHours > 0) {
      displayText = `${days}d ${remainingHours}h`;
    } else {
      displayText = `${days}d`;
    }
  } else if (totalHours > 0) {
    // Show hours and optionally minutes if less than 2 hours
    if (totalHours < 2 && minutes > 0) {
      displayText = `${totalHours}h ${minutes}m`;
    } else {
      displayText = `${totalHours}h`;
    }
  } else {
    // Less than 1 hour - show minutes
    displayText = `${Math.max(1, minutes)}m`;
  }

  if (isOverdue) {
    // Overdue
    if (compact) {
      return (
        <div className="flex items-center gap-1 px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-md text-xs font-semibold">
          <AlertTriangle size={12} />
          <span>{completedAt ? 'Completed ' : ''}Overdue {displayText}</span>
        </div>
      );
    }
    
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <AlertTriangle size={16} className="text-red-600 dark:text-red-400" />
        <div>
          <p className="text-sm font-bold text-red-700 dark:text-red-300">
            {completedAt ? 'Completed ' : ''}Overdue by {displayText}
          </p>
          {!completedAt && <p className="text-xs text-red-600 dark:text-red-400">Can still complete, but may be denied</p>}
        </div>
      </div>
    );
  }

  // Time remaining
  const isUrgent = timeRemaining < 3600000; // Less than 1 hour
  const colorClasses = isUrgent 
    ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800'
    : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';

  if (compact) {
    return (
      <div className={`flex items-center gap-1 px-2 py-1 ${colorClasses} rounded-md text-xs font-semibold`}>
        <Clock size={12} />
        <span>{completedAt ? 'Completed with ' : ''}{displayText} {completedAt ? 'left' : 'left'}</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-2 ${colorClasses} border rounded-lg`}>
      <Clock size={16} />
      <div>
        <p className="text-sm font-bold">
          {completedAt ? 'Completed with ' : ''}{displayText} {completedAt ? 'to spare' : 'remaining'}
        </p>
        {isUrgent && !completedAt && <p className="text-xs">Hurry up!</p>}
      </div>
    </div>
  );
};
