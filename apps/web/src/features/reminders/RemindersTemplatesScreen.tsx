import React, { useState } from 'react';
import { Info, CheckCircle2 } from 'lucide-react';
import { LargeTitleScreen } from '../../components/ui/LargeTitleScreen.js';
import { Sheet } from '../../components/ui/Sheet.js';
import { Button } from '../../components/ui/Button.js';

interface TemplateItem {
  key: string;
  name: string;
  status: 'Approved' | 'Waiting for approval';
  text: React.ReactNode;
}

export const RemindersTemplatesScreen: React.FC = () => {
  const [infoOpen, setInfoOpen] = useState(false);

  const templates: TemplateItem[] = [
    {
      key: 'due_soon',
      name: 'Due Soon Reminder (3 days before)',
      status: 'Approved',
      text: (
        <span>
          Hello <span className="text-accent font-semibold">&#123;&#123;1&#125;&#125;</span>, this is a reminder from Manohar Traders. Invoice <span className="text-accent font-semibold">&#123;&#123;2&#125;&#125;</span> for ₹<span className="text-accent font-semibold">&#123;&#123;3&#125;&#125;</span> is due on <span className="text-accent font-semibold">&#123;&#123;4&#125;&#125;</span>. Please arrange payment by the due date. If you have already paid, please ignore this message.
        </span>
      ),
    },
    {
      key: 'due_today',
      name: 'Due Today Reminder',
      status: 'Approved',
      text: (
        <span>
          Hello <span className="text-accent font-semibold">&#123;&#123;1&#125;&#125;</span>, invoice <span className="text-accent font-semibold">&#123;&#123;2&#125;&#125;</span> for ₹<span className="text-accent font-semibold">&#123;&#123;3&#125;&#125;</span> from Manohar Traders is due today (<span className="text-accent font-semibold">&#123;&#123;4&#125;&#125;</span>). Please arrange payment today. If you have already paid, thank you, and please ignore this message.
        </span>
      ),
    },
    {
      key: 'overdue',
      name: 'Overdue Follow-up',
      status: 'Approved',
      text: (
        <span>
          Hello <span className="text-accent font-semibold">&#123;&#123;1&#125;&#125;</span>, invoice <span className="text-accent font-semibold">&#123;&#123;2&#125;&#125;</span> for ₹<span className="text-accent font-semibold">&#123;&#123;3&#125;&#125;</span> from Manohar Traders was due on <span className="text-accent font-semibold">&#123;&#123;4&#125;&#125;</span> and is still unpaid. Please arrange payment at the earliest, or call us on <span className="text-accent font-semibold">&#123;&#123;5&#125;&#125;</span> if there is any problem. If you have already paid, please ignore this message.
        </span>
      ),
    },
    {
      key: 'payment_received',
      name: 'Payment Receipt Confirmation',
      status: 'Approved',
      text: (
        <span>
          Hello <span className="text-accent font-semibold">&#123;&#123;1&#125;&#125;</span>, we have received your payment of ₹<span className="text-accent font-semibold">&#123;&#123;2&#125;&#125;</span> against invoice <span className="text-accent font-semibold">&#123;&#123;3&#125;&#125;</span>. Thank you. Manohar Traders
        </span>
      ),
    },
  ];

  return (
    <LargeTitleScreen
      title="Message Templates"
      showBack
      headerAction={
        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          className="w-9 h-9 rounded-full bg-surface/80 border border-separator/40 flex items-center justify-center text-label hover:bg-fill/60 active:scale-95 transition-all"
          aria-label="Template guidelines"
        >
          <Info className="w-4 h-4 text-label-2" />
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        {templates.map((tpl) => (
          <div
            key={tpl.key}
            className="bg-surface rounded-ios-card p-4 border border-separator/40 shadow-sm flex flex-col gap-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-headline font-semibold text-label">
                {tpl.name}
              </span>
              <div className="flex items-center gap-1.5 text-ok text-footnote font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                <span>{tpl.status}</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-fill/30 border border-separator/30 text-body leading-relaxed text-label">
              {tpl.text}
            </div>

            <span className="text-caption text-label-3">
              Standard transactional category · Meta Cloud API
            </span>
          </div>
        ))}
      </div>

      {/* Info Sheet */}
      <Sheet
        open={infoOpen}
        onOpenChange={setInfoOpen}
        title="WhatsApp Template Approval"
      >
        <div className="flex flex-col gap-3 py-2 text-subhead text-label leading-relaxed">
          <p>
            Templates are registered directly on your WhatsApp Business Account. Meta requires pre-approval for outbound marketing and utility messages.
          </p>
          <p className="text-footnote text-label-2">
            Changes need WhatsApp approval, which takes 24–48 hours. When you wish to modify text, contact your administrator.
          </p>
          <Button
            variant="tinted"
            fullWidth
            onClick={() => setInfoOpen(false)}
            className="mt-3"
          >
            Understood
          </Button>
        </div>
      </Sheet>
    </LargeTitleScreen>
  );
};
