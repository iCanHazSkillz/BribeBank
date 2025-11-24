import React, { useState, useEffect } from 'react';
import { AssignedPrize, PrizeStatus, PrizeTemplate, User, PrizeType, HistoryEvent, AppNotification, AssignedBounty, BountyTemplate, BountyStatus } from '../types';
import { storageService } from '../services/storageService';
import { PrizeCard } from './PrizeCard';
import { History, Ticket, Bell, X, CheckCircle, XCircle, ListTodo, Play, Trash2, ThumbsUp, ThumbsDown } from 'lucide-react';

interface WalletViewProps {
  currentUser: User;
}

interface GroupedPrize {
    templateId: string;
    template: PrizeTemplate;
    ids: string[];
    count: number;
    status: PrizeStatus;
    assignedBy: string;
}

export const WalletView: React.FC<WalletViewProps> = ({ currentUser }) => {
  const [tab, setTab] = useState<'wallet' | 'tasks' | 'history'>('wallet');
  
  // Data State
  const [myPrizes, setMyPrizes] = useState<AssignedPrize[]>([]);
  const [myBounties, setMyBounties] = useState<AssignedBounty[]>([]);
  const [templates, setTemplates] = useState<PrizeTemplate[]>([]);
  const [bountyTemplates, setBountyTemplates] = useState<BountyTemplate[]>([]);
  const [historyEvents, setHistoryEvents] = useState<HistoryEvent[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [familyUsers, setFamilyUsers] = useState<User[]>([]);
  const [toast, setToast] = useState<{message: string, type: 'info' | 'success'} | null>(null);

  // UI State
  const [showNotifications, setShowNotifications] = useState(false);

  const refreshData = () => {
    const familyId = currentUser.familyId;
    setMyPrizes(storageService.getAssignments(familyId).filter(a => a.userId === currentUser.id));
    setMyBounties(storageService.getBountyAssignments(familyId).filter(b => b.userId === currentUser.id));
    setTemplates(storageService.getTemplates(familyId));
    setBountyTemplates(storageService.getBountyTemplates(familyId));
    setHistoryEvents(storageService.getHistoryEvents(currentUser.id));
    setNotifications(storageService.getNotifications(currentUser.id).filter(n => !n.isRead));
    setFamilyUsers(storageService.getFamilyUsers(familyId));
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 2000);
    return () => clearInterval(interval);
  }, [currentUser.id]);

  useEffect(() => {
      if(toast) {
          const timer = setTimeout(() => setToast(null), 3000);
          return () => clearTimeout(timer);
      }
  }, [toast]);

  const resolveUserName = (id: string) => familyUsers.find(u => u.id === id)?.name || 'Admin';

  // Actions
  const handleClaim = (assignmentId: string) => {
    storageService.claimPrize(assignmentId);
    setToast({ message: "Requested! Waiting for parents...", type: 'info' });
    refreshData();
  };

  const handleBountyAction = (bountyId: string, action: 'start' | 'finish' | 'reject') => {
      if (action === 'start') {
          storageService.updateBountyStatus(bountyId, BountyStatus.IN_PROGRESS);
          setToast({ message: "Task started!", type: 'info' });
      } else if (action === 'finish') {
          storageService.updateBountyStatus(bountyId, BountyStatus.COMPLETED);
          setToast({ message: "Marked as done! Waiting for verification.", type: 'success' });
      } else if (action === 'reject') {
          if(window.confirm("Reject this task?")) {
              storageService.deleteBountyAssignment(bountyId);
          }
      }
      refreshData();
  };
  
  const handleDismissNotification = (id: string) => {
      storageService.markNotificationRead(id);
      refreshData();
  };

  const handleClearAllNotifications = () => {
      storageService.markAllNotificationsRead(currentUser.id);
      refreshData();
      setShowNotifications(false);
  };

  // Group Identical Rewards
  const groupedPrizes: GroupedPrize[] = Object.values(myPrizes.reduce((acc, prize) => {
      if(prize.status === PrizeStatus.REDEEMED) return acc;
      const key = `${prize.templateId}-${prize.status}`;
      if (!acc[key]) {
          const template = templates.find(t => t.id === prize.templateId) || {
              id: 'unknown', familyId: currentUser.familyId, title: 'Unknown', description: '?', emoji: '❓', type: PrizeType.CUSTOM
          };
          acc[key] = {
              templateId: prize.templateId, template, ids: [], count: 0, status: prize.status, assignedBy: resolveUserName(prize.assignedBy)
          };
      }
      acc[key].ids.push(prize.id);
      acc[key].count++;
      return acc;
  }, {} as Record<string, GroupedPrize>));

  // Active Bounties
  const activeBounties = myBounties.filter(b => b.status !== BountyStatus.VERIFIED);

  return (
    <div className="pb-24 relative">
      {toast && (
          <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[60] w-[90%] max-w-sm">
              <div className="bg-gray-900 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 animate-fade-in-down">
                  <div className="bg-indigo-500 p-1 rounded-full"><CheckCircle size={16}/></div>
                  <p className="text-sm font-medium">{toast.message}</p>
              </div>
          </div>
      )}

      <header className="bg-white sticky top-0 z-50 px-6 py-4 shadow-sm mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className={`w-10 h-10 rounded-full ${currentUser.avatarColor} shadow-md border-2 border-white flex items-center justify-center text-white font-bold`}>
                 {currentUser.name.charAt(0)}
             </div>
             <div>
                <h1 className="text-lg font-extrabold text-gray-900 leading-tight">My Wallet</h1>
                <p className="text-xs text-gray-500">Hi, {currentUser.name}!</p>
             </div>
          </div>
          
          <div className="relative">
                <button 
                    onClick={() => setShowNotifications(!showNotifications)} 
                    className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                >
                    <Bell size={24} />
                    {notifications.length > 0 && (
                        <span className="absolute top-1 right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white flex items-center justify-center">
                           <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        </span>
                    )}
                </button>
                
                {showNotifications && (
                    <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-50 animate-fade-in">
                        <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-sm text-gray-700">Notifications</h3>
                            <div className="flex gap-2">
                                {notifications.length > 0 && (
                                    <button onClick={handleClearAllNotifications} className="text-xs text-indigo-600 font-semibold hover:text-indigo-800">Clear All</button>
                                )}
                                <button onClick={() => setShowNotifications(false)} className="text-gray-400 hover:text-gray-600"><X size={16}/></button>
                            </div>
                        </div>
                        <div className="max-h-64 overflow-y-auto p-2">
                            {notifications.length === 0 ? (
                                <div className="text-center py-8 text-gray-400">
                                    <Bell className="mx-auto mb-2 opacity-20" size={24} />
                                    <p className="text-sm italic">No new alerts</p>
                                </div>
                            ) : (
                                notifications.map(note => (
                                    <div key={note.id} className="p-3 mb-1 bg-white hover:bg-gray-50 rounded-xl border border-gray-100 transition-colors relative group">
                                        <p className="text-sm text-gray-800 pr-6">{note.message}</p>
                                        <p className="text-xs text-gray-400 mt-1">{new Date(note.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</p>
                                        <button onClick={(e) => { e.stopPropagation(); handleDismissNotification(note.id); }} className="absolute top-2 right-2 text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity"><X size={14}/></button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
      </header>

      <div className="flex px-4 mb-6 gap-2">
        <button onClick={() => setTab('wallet')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold transition-colors ${tab === 'wallet' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600'}`}><Ticket size={16} /> Rewards</button>
        <button onClick={() => setTab('tasks')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold transition-colors relative ${tab === 'tasks' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600'}`}>
            <ListTodo size={16} /> Tasks
            {activeBounties.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] flex items-center justify-center text-white border border-white">{activeBounties.length}</span>}
        </button>
        <button onClick={() => setTab('history')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold transition-colors ${tab === 'history' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600'}`}><History size={16} /> History</button>
      </div>

      <div className="px-4 space-y-4">
        {tab === 'wallet' && (
          <>
            {groupedPrizes.length === 0 ? (
              <div className="text-center py-16 opacity-60">
                <span className="text-6xl mb-4 block">😕</span>
                <h3 className="text-lg font-bold text-gray-800">No rewards yet</h3>
                <p className="text-sm text-gray-500 mt-1">Ask for more tasks!</p>
              </div>
            ) : (
              groupedPrizes.map(group => (
                <div key={`${group.templateId}-${group.status}`} className="relative">
                    <PrizeCard
                    {...group.template}
                    status={group.status}
                    count={group.count}
                    actionLabel={group.status === PrizeStatus.AVAILABLE ? "Use Card" : "Waiting..."}
                    onClick={group.status === PrizeStatus.AVAILABLE ? () => handleClaim(group.ids[0]) : undefined}
                    disabled={group.status === PrizeStatus.PENDING_APPROVAL}
                    />
                    {group.status === PrizeStatus.AVAILABLE && (
                        <div className="text-xs text-gray-400 text-center mt-1 mb-2">Assigned by {group.assignedBy}</div>
                    )}
                </div>
              ))
            )}
          </>
        )}

        {tab === 'tasks' && (
            <div className="space-y-4">
                {activeBounties.length === 0 && <div className="text-center py-10 text-gray-400 italic">No active tasks. Good job!</div>}
                {activeBounties.map(b => {
                    const t = bountyTemplates.find(temp => temp.id === b.bountyTemplateId);
                    if(!t) return null;
                    
                    return (
                        <div key={b.id} className="relative">
                            <PrizeCard 
                                title={t.title}
                                description={`Reward: ${t.rewardValue}`}
                                emoji={t.emoji}
                                variant="bounty"
                                status={b.status}
                                isFCFS={t.isFCFS}
                                actionLabel={null} // We render custom buttons below
                                onClick={undefined} // Remove click handler from card body
                                disabled={b.status === BountyStatus.COMPLETED}
                                themeColor="bg-white border-indigo-200 text-gray-900"
                                customActions={
                                    <div className="flex gap-2 mt-4">
                                        {b.status === BountyStatus.OFFERED ? (
                                            <>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleBountyAction(b.id, 'reject'); }} 
                                                    className="flex-1 py-2 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 flex items-center justify-center gap-1 text-sm"
                                                >
                                                    <X size={16}/> Refuse
                                                </button>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleBountyAction(b.id, 'start'); }} 
                                                    className="flex-[2] py-2 bg-green-600 text-white font-bold rounded-xl shadow-md hover:bg-green-700 flex items-center justify-center gap-1 text-sm"
                                                >
                                                    <ThumbsUp size={16}/> Accept
                                                </button>
                                            </>
                                        ) : b.status === BountyStatus.IN_PROGRESS ? (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleBountyAction(b.id, 'finish'); }} 
                                                className="w-full py-2 bg-indigo-600 text-white font-bold rounded-xl shadow-md hover:bg-indigo-700 flex items-center justify-center gap-1 text-sm"
                                            >
                                                <CheckCircle size={16}/> Mark Complete
                                            </button>
                                        ) : (
                                            <button 
                                                disabled
                                                className="w-full py-2 bg-gray-100 text-gray-400 font-bold rounded-xl border border-gray-200 cursor-not-allowed text-sm"
                                            >
                                                Pending Verification
                                            </button>
                                        )}
                                    </div>
                                }
                            />
                        </div>
                    );
                })}
            </div>
        )}

        {tab === 'history' && (
            <div className="space-y-3">
                {historyEvents.length === 0 && <p className="text-center text-gray-400 py-10">Nothing here yet.</p>}
                {historyEvents.map(event => (
                  <div key={event.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4 opacity-80 grayscale-[0.2]">
                      <span className="text-3xl">{event.emoji}</span>
                      <div className="flex-1">
                          <h4 className="font-bold text-gray-800">{event.title}</h4>
                          <p className="text-xs text-gray-500">
                             {new Date(event.timestamp).toLocaleDateString()} • {event.action.replace('_', ' ')}
                             <span className="block text-[10px] text-indigo-500">By {event.assignerName}</span>
                          </p>
                      </div>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${event.action.includes('APPROVED') || event.action.includes('VERIFIED') ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'}`}>
                          {event.action.includes('APPROVED') || event.action.includes('VERIFIED') ? <CheckCircle size={18}/> : <XCircle size={18}/>}
                      </div>
                  </div>
                ))}
            </div>
        )}
      </div>
    </div>
  );
};