import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, User } from 'lucide-react';
import { api } from '../../api/index.js';
import { useAppStore } from '../../app/store.js';
import { LargeTitleScreen } from '../../components/ui/LargeTitleScreen.js';
import { InsetGroup, Row } from '../../components/ui/InsetGroup.js';
import { Sheet } from '../../components/ui/Sheet.js';
import { Button } from '../../components/ui/Button.js';

export const RemindersRepliesScreen: React.FC = () => {
  const queryClient = useQueryClient();
  const { currentCompanyId } = useAppStore();

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  // Fetch threads
  const { data: threads = [], isLoading } = useQuery({
    queryKey: ['reply-threads', currentCompanyId],
    queryFn: () => api.reminders.replies.list(currentCompanyId),
  });

  // Fetch parties to display customer names
  const { data: parties = [] } = useQuery({
    queryKey: ['parties', currentCompanyId],
    queryFn: () => api.parties.list(currentCompanyId),
  });

  const partyMap = new Map(parties.map((p) => [p.id, p]));
  const activeThread = threads.find((t) => t.id === selectedThreadId);
  const activeParty = activeThread ? partyMap.get(activeThread.partyId) : null;

  const sendReplyMutation = useMutation({
    mutationFn: (text: string) =>
      api.reminders.replies.send(selectedThreadId!, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reply-threads'] });
      setReplyText('');
    },
  });

  const handleSend = () => {
    if (replyText.trim() && selectedThreadId) {
      sendReplyMutation.mutate(replyText.trim());
    }
  };

  return (
    <LargeTitleScreen title="Customer Replies" showBack>
      <InsetGroup>
        {isLoading ? (
          <div className="p-8 text-center text-label-2 animate-pulse">
            Loading customer conversations...
          </div>
        ) : threads.length === 0 ? (
          <div className="p-8 text-center text-label-2 text-subhead">
            No incoming customer replies waiting.
          </div>
        ) : (
          threads.map((thread) => {
            const party = partyMap.get(thread.partyId);
            const lastMsg = thread.messages[thread.messages.length - 1];

            return (
              <Row
                key={thread.id}
                onClick={() => setSelectedThreadId(thread.id)}
                leading={
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-accent-soft text-accent flex items-center justify-center font-bold">
                      <User className="w-5 h-5" />
                    </div>
                    {thread.unread > 0 && (
                      <span className="w-2.5 h-2.5 rounded-full bg-accent absolute top-0 right-0 ring-2 ring-surface" />
                    )}
                  </div>
                }
                title={party?.name ?? 'Customer'}
                subtitle={lastMsg?.text ?? 'No messages'}
                trailing={
                  <span className="text-footnote text-label-2 font-medium">
                    {thread.lastCustomerMessageAt.slice(11, 16)}
                  </span>
                }
                chevron
              />
            );
          })
        )}
      </InsetGroup>

      {/* Conversation Thread Sheet */}
      <Sheet
        open={Boolean(selectedThreadId)}
        onOpenChange={(open) => !open && setSelectedThreadId(null)}
        title={activeParty?.name ?? 'Customer Conversation'}
        description={`WhatsApp session · ${activeParty?.phones[0] ?? ''}`}
      >
        <div className="flex flex-col h-[400px] pt-2">
          {/* Messages list */}
          <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-1 pb-4">
            {activeThread?.messages.map((m, idx) => {
              const isMe = m.from === 'us';
              return (
                <div
                  key={idx}
                  className={`flex flex-col max-w-[80%] ${
                    isMe ? 'self-end items-end' : 'self-start items-start'
                  }`}
                >
                  <div
                    className={`p-3.5 rounded-2xl text-body shadow-sm ${
                      isMe
                        ? 'bg-accent text-white rounded-br-xs'
                        : 'bg-fill/60 text-label rounded-bl-xs'
                    }`}
                  >
                    {m.text}
                  </div>
                  <span className="text-caption text-label-3 mt-1 px-1">
                    {m.at.slice(11, 16)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Composer or Window Closed Notice */}
          <div className="pt-3 border-t border-separator/40">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Type a message..."
                className="flex-1 h-11 px-3.5 bg-surface border border-separator/50 rounded-xl text-body text-label placeholder:text-label-3 outline-none focus:border-accent"
              />
              <Button
                size="small"
                onClick={handleSend}
                disabled={!replyText.trim() || sendReplyMutation.isPending}
                className="h-11 px-4"
              >
                <Send className="w-4 h-4 stroke-[2.2]" />
              </Button>
            </div>
            <p className="text-caption text-label-3 text-center mt-2">
              The 24-hour reply window is open. You may reply directly via WhatsApp Meta Cloud API.
            </p>
          </div>
        </div>
      </Sheet>
    </LargeTitleScreen>
  );
};
