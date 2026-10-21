import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, ExternalLink, Image as ImageIcon, X } from 'lucide-react';
import { api } from '../../api/index.js';
import { useAppStore } from '../../app/store.js';
import { Sheet } from './Sheet.js';
import { Notification } from '@saas/shared';

export const NotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentCompanyId } = useAppStore();
  const [open, setOpen] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', currentCompanyId],
    queryFn: () => api.notifications.list(undefined, currentCompanyId),
    refetchInterval: 5000,
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.notifications.markAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.notifications.markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const handleOpenNotification = (n: Notification) => {
    if (!n.read) {
      markReadMutation.mutate(n.id);
    }
    if (n.challanId) {
      setOpen(false);
      navigate(`/challans/${n.challanId}`);
    } else if (n.taskId) {
      setOpen(false);
      navigate('/tasks');
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Notifications"
        className="relative p-2 rounded-xl text-label-2 hover:text-label hover:bg-fill/60 active:scale-95 transition-all"
      >
        <Bell className="w-5 h-5 stroke-[2]" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center leading-none shadow-sm animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Notifications Sheet */}
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Notifications"
        description="Task assignments and delivery updates"
      >
        <div className="flex flex-col gap-3 py-2">
          {unreadCount > 0 && (
            <div className="flex items-center justify-between pb-1 border-b border-separator/40">
              <span className="text-footnote font-semibold text-label-2">
                {unreadCount} unread
              </span>
              <button
                type="button"
                onClick={() => markAllReadMutation.mutate()}
                className="text-footnote font-semibold text-accent flex items-center gap-1 hover:underline"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all as read</span>
              </button>
            </div>
          )}

          {notifications.length === 0 ? (
            <div className="p-8 text-center text-label-2 text-subhead flex flex-col items-center gap-2">
              <Bell className="w-8 h-8 text-label-3" />
              <span>No notifications yet</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 max-h-[60vh] overflow-y-auto">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleOpenNotification(n)}
                  className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all flex flex-col gap-2 ${
                    n.read
                      ? 'bg-surface border-separator/50 text-label-2'
                      : 'bg-accent-soft/40 border-accent/30 text-label shadow-sm'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {!n.read && (
                        <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
                      )}
                      <span className="text-subhead font-semibold text-label">
                        {n.title}
                      </span>
                    </div>
                    <span className="text-caption text-label-3 shrink-0">
                      {new Date(n.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <p className="text-footnote leading-relaxed text-label">
                    {n.body}
                  </p>

                  {/* Attached Photo Preview Thumbnail */}
                  {n.photoUrl && (
                    <div
                      className="relative rounded-lg overflow-hidden border border-separator/60 w-fit max-w-[200px] h-24 bg-fill/40 group mt-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewPhoto(n.photoUrl!);
                      }}
                    >
                      <img
                        src={n.photoUrl}
                        alt="Task attachment"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                        <ImageIcon className="w-4 h-4" />
                      </div>
                    </div>
                  )}

                  {n.challanId && (
                    <div className="flex items-center gap-1 text-accent text-caption font-semibold mt-0.5">
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open Delivery Challan</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Sheet>

      {/* Enlarged Photo Lightbox Modal */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setPreviewPhoto(null)}
        >
          <div
            className="relative max-w-lg w-full bg-surface rounded-2xl overflow-hidden shadow-2xl p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewPhoto(null)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors z-10"
              aria-label="Close photo"
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={previewPhoto}
              alt="Enlarged preview"
              className="w-full h-auto max-h-[75vh] object-contain rounded-xl"
            />
            <div className="p-3 text-center text-subhead font-semibold text-label">
              Attached Task Photo
            </div>
          </div>
        </div>
      )}
    </>
  );
};
