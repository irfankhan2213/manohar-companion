import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Printer,
  Share2,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  Plus,
  Camera,
  Upload,
  X,
  Image as ImageIcon,
} from 'lucide-react';
import { formatINR, Task, User } from '@saas/shared';
import { api } from '../../api/index.js';
import { useAppStore } from '../../app/store.js';
import { LargeTitleScreen } from '../../components/ui/LargeTitleScreen.js';
import { InsetGroup, Row } from '../../components/ui/InsetGroup.js';
import { Button } from '../../components/ui/Button.js';
import { Sheet } from '../../components/ui/Sheet.js';
import { StatusText } from '../../components/ui/StatusText.js';
import { useToast } from '../../components/ui/Toast.js';
import { SAMPLE_TASK_PHOTO_1, SAMPLE_TASK_PHOTO_2 } from '../../mock/seed.js';

export const ChallanDetailScreen: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentCompanyId } = useAppStore();
  const { showToast } = useToast();

  const [taskSheetOpen, setTaskSheetOpen] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

  // Task form state
  const [taskAssigneeId, setTaskAssigneeId] = useState('u5'); // Suresh Kumar
  const [taskTitle, setTaskTitle] = useState('');
  const [taskNotes, setTaskNotes] = useState('');
  const [taskPhotoUrl, setTaskPhotoUrl] = useState('');

  const { data: challan, isLoading } = useQuery({
    queryKey: ['challan', id],
    queryFn: () => api.challans.get(id),
    refetchInterval: (query) => {
      // Auto-poll if queued
      return query.state.data?.status === 'queued' ? 1500 : false;
    },
  });

  const { data: party } = useQuery({
    queryKey: ['party', challan?.partyId],
    queryFn: () => (challan ? api.parties.get(challan.partyId) : null),
    enabled: !!challan,
  });

  const { data: godowns = [] } = useQuery({
    queryKey: ['godowns', currentCompanyId],
    queryFn: () => api.godowns.list(currentCompanyId),
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', currentCompanyId, id],
    queryFn: () => api.tasks.list(currentCompanyId, { challanId: id }),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.users.list(),
  });

  const userMap = new Map<string, User>(users.map((u) => [u.id, u]));

  const retryMutation = useMutation({
    mutationFn: () => api.challans.retry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challan', id] });
      queryClient.invalidateQueries({ queryKey: ['challans'] });
      queryClient.invalidateQueries({ queryKey: ['outbox'] });
      showToast({ message: 'Challan sync retried' });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: (data: Omit<Task, 'id' | 'createdAt'>) => api.tasks.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      showToast({
        message: 'Task assigned and notification sent to assignee',
        variant: 'success',
      });
      setTaskSheetOpen(false);
      setTaskTitle('');
      setTaskNotes('');
      setTaskPhotoUrl('');
    },
  });

  const updateTaskStatusMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: Task['status'] }) =>
      api.tasks.update(taskId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      showToast({ message: 'Task status updated' });
    },
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setTaskPhotoUrl(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim() || !challan) return;

    createTaskMutation.mutate({
      companyId: currentCompanyId,
      title: taskTitle.trim(),
      description: taskNotes.trim() || undefined,
      assignedToUserId: taskAssigneeId,
      assignedByUserId: 'u1',
      challanId: challan.id,
      photoUrl: taskPhotoUrl || undefined,
      status: 'pending',
      priority: 'normal',
    });
  };

  if (isLoading) {
    return (
      <LargeTitleScreen title="Challan Details">
        <div className="p-8 text-center text-label-2 text-subhead">
          Loading challan details...
        </div>
      </LargeTitleScreen>
    );
  }

  if (!challan) {
    return (
      <LargeTitleScreen title="Challan Details">
        <div className="p-8 text-center text-label-2 text-subhead flex flex-col items-center gap-3">
          <AlertCircle className="w-8 h-8 text-danger" />
          <span>Challan not found</span>
          <Button variant="tinted" size="small" onClick={() => navigate('/challans')}>
            Back to Challans
          </Button>
        </div>
      </LargeTitleScreen>
    );
  }

  const subtotalPaise = challan.lines.reduce((acc, l) => acc + l.amount, 0);
  const gstPaise = Math.round(subtotalPaise * 0.18);
  const grandTotalPaise = subtotalPaise + gstPaise;
  const godownName = godowns.find((g) => g.id === challan.godownId)?.name ?? 'Main Godown (Ludhiana)';

  const handleShareWhatsApp = () => {
    const phone = party?.phones[0]?.replace(/\D/g, '') || '';
    const itemSummary = challan.lines.map((l) => `${l.qty}x ${l.description}`).join(', ');
    const text = encodeURIComponent(
      `Hello ${party?.name ?? 'Customer'}, your ${challan.type.toUpperCase()} CHALLAN ${challan.number} dated ${challan.date} for ${formatINR(grandTotalPaise)} has been generated.` +
      ` Items: ${itemSummary}.` +
      (challan.vehicleNo ? ` Vehicle: ${challan.vehicleNo}.` : '') +
      ` Dispatched from Manohar Traders.`
    );
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
  };

  return (
    <LargeTitleScreen
      title={challan.number}
      headerAction={
        <button
          type="button"
          onClick={() => navigate('/challans')}
          className="text-subhead font-semibold text-accent hover:opacity-80"
        >
          Done
        </button>
      }
    >
      {/* Status Hero Card */}
      <div className="bg-surface rounded-ios-card p-4 border border-separator/50 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {challan.status === 'synced' && (
              <CheckCircle2 className="w-5 h-5 text-ok" />
            )}
            {challan.status === 'queued' && (
              <Clock className="w-5 h-5 text-warn animate-spin" />
            )}
            {challan.status === 'failed' && (
              <AlertCircle className="w-5 h-5 text-danger" />
            )}
            {challan.status === 'draft' && (
              <FileText className="w-5 h-5 text-label-2" />
            )}
            <span className="text-headline font-bold text-label capitalize">
              {challan.type} Challan
            </span>
          </div>

          <div>
            {challan.status === 'synced' && (
              <StatusText text="Updated in Tally" variant="ok" />
            )}
            {challan.status === 'queued' && (
              <StatusText text="Waiting for Tally" variant="warn" />
            )}
            {challan.status === 'failed' && (
              <StatusText text="Couldn't update" variant="danger" />
            )}
            {challan.status === 'draft' && (
              <StatusText text="Draft" variant="neutral" />
            )}
          </div>
        </div>

        {challan.status === 'queued' && (
          <p className="text-footnote text-label-2 bg-fill/40 p-2.5 rounded-xl">
            This voucher has been written to the offline queue and will sync to TallyPrime on the office PC.
          </p>
        )}

        {challan.status === 'failed' && (
          <div className="flex flex-col gap-2 bg-danger/10 p-3 rounded-xl">
            <span className="text-footnote font-medium text-danger">
              Sync Error: {challan.failureReason ?? 'Tally connection timeout.'}
            </span>
            <Button
              variant="tinted"
              size="small"
              disabled={retryMutation.isPending}
              onClick={() => retryMutation.mutate()}
              className="self-start"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              <span>Retry Sync</span>
            </Button>
          </div>
        )}

        {challan.status === 'synced' && (
          <span className="text-caption text-label-2">
            Verified in TallyPrime · Master AlterID #1480
          </span>
        )}
      </div>

      {/* Primary Actions: Print & Share */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="primary"
          onClick={() => navigate(`/print/challan/${challan.id}`)}
          className="h-11 flex items-center justify-center gap-2"
        >
          <Printer className="w-4 h-4" />
          <span>View / Print PDF</span>
        </Button>

        <Button
          variant="tinted"
          onClick={handleShareWhatsApp}
          className="h-11 flex items-center justify-center gap-2 text-[#1B5E20] border-[#C5E1A5] bg-[#E8F5E9]"
        >
          <Share2 className="w-4 h-4" />
          <span>Share WhatsApp</span>
        </Button>
      </div>

      {/* Consignee / Party Details */}
      <InsetGroup title="Consignee / Party">
        <Row
          title="Party Name"
          trailing={<span className="font-semibold text-label">{party?.name ?? '—'}</span>}
        />
        <Row
          title="City / Station"
          trailing={<span className="text-label">{party?.city ?? '—'}</span>}
        />
        <Row
          title="Phone"
          trailing={<span className="text-label">{party?.phones[0] ?? '—'}</span>}
        />
        {party?.gstin && (
          <Row
            title="GSTIN"
            trailing={<span className="font-mono text-label">{party.gstin}</span>}
          />
        )}
      </InsetGroup>

      {/* Dispatch & Transport */}
      <InsetGroup title="Dispatch & Transport">
        <Row
          title="Challan Date"
          trailing={<span className="font-semibold text-label">{challan.date}</span>}
        />
        <Row
          title="Source Godown"
          trailing={<span className="text-label">{godownName}</span>}
        />
        {challan.vehicleNo && (
          <Row
            title="Vehicle Number"
            trailing={
              <span className="font-mono font-bold text-label">
                {challan.vehicleNo}
              </span>
            }
          />
        )}
        {challan.lrNo && (
          <Row
            title="LR / Bilty Number"
            trailing={<span className="font-semibold text-label">{challan.lrNo}</span>}
          />
        )}
        {challan.transporter && (
          <Row
            title="Transporter"
            trailing={<span className="text-label">{challan.transporter}</span>}
          />
        )}
        {challan.narration && (
          <Row
            title="Remarks"
            subtitle={challan.narration}
          />
        )}
      </InsetGroup>

      {/* Items Breakdown */}
      <InsetGroup title={`Items Dispatched (${challan.lines.length})`}>
        {challan.lines.map((line, idx) => (
          <div
            key={idx}
            className="p-3.5 flex items-center justify-between border-b last:border-b-0 border-separator/30"
          >
            <div className="flex flex-col min-w-0 pr-3">
              <span className="text-subhead font-semibold text-label">
                {line.description}
              </span>
              <span className="text-caption text-label-2 tabular-nums">
                {line.qty} {line.unit} × {formatINR(line.rate)}
              </span>
            </div>
            <span className="text-subhead font-bold text-label tabular-nums">
              {formatINR(line.amount)}
            </span>
          </div>
        ))}
      </InsetGroup>

      {/* Assigned Tasks & Photos Section */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-accent" />
            <span className="text-subhead font-bold uppercase tracking-wider text-label-2">
              Assigned Tasks & Photos ({tasks.length})
            </span>
          </div>
          <Button
            size="small"
            variant="tinted"
            onClick={() => setTaskSheetOpen(true)}
            className="flex items-center gap-1.5 h-8 text-caption"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.2]" />
            <span>Assign Task</span>
          </Button>
        </div>

        {tasks.length === 0 ? (
          <div className="p-6 bg-surface rounded-ios-card border border-separator/40 text-center flex flex-col items-center justify-center gap-2">
            <FileText className="w-6 h-6 text-label-3" />
            <span className="text-footnote font-semibold text-label">
              No tasks assigned on this challan yet
            </span>
            <span className="text-caption text-label-2">
              Assign dispatch instructions or require photo proof (signed bilty, machine serial).
            </span>
            <Button
              variant="tinted"
              size="small"
              onClick={() => setTaskSheetOpen(true)}
              className="mt-1"
            >
              + Assign First Task
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {tasks.map((task) => {
              const assignee = userMap.get(task.assignedToUserId);
              const isDone = task.status === 'completed';

              return (
                <div
                  key={task.id}
                  className={`bg-surface rounded-ios-card p-4 border border-separator/40 shadow-sm flex flex-col gap-3 ${
                    isDone ? 'opacity-80' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-accent/15 text-accent font-bold text-caption flex items-center justify-center">
                        {assignee?.name.charAt(0) ?? 'U'}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-subhead font-semibold text-label">
                          {assignee?.name ?? 'Assigned Staff'}
                        </span>
                        <span className="text-caption text-label-3">
                          {assignee?.role.replace('_', ' ').toUpperCase()}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        updateTaskStatusMutation.mutate({
                          taskId: task.id,
                          status: isDone ? 'pending' : 'completed',
                        })
                      }
                      className={`px-2.5 py-1 rounded-full text-caption font-semibold flex items-center gap-1.5 transition-colors ${
                        isDone
                          ? 'bg-ok/15 text-ok'
                          : 'bg-warn/15 text-warn hover:bg-ok/15 hover:text-ok'
                      }`}
                    >
                      {isDone ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Done</span>
                        </>
                      ) : (
                        <>
                          <Clock className="w-3.5 h-3.5" />
                          <span>Pending</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <span className={`text-subhead font-semibold text-label ${isDone ? 'line-through text-label-2' : ''}`}>
                      {task.title}
                    </span>
                    {task.description && (
                      <p className="text-footnote text-label-2">
                        {task.description}
                      </p>
                    )}
                  </div>

                  {/* Attached Photo */}
                  {task.photoUrl && (
                    <div className="pt-1">
                      <div
                        onClick={() => setLightboxPhoto(task.photoUrl!)}
                        className="relative rounded-xl overflow-hidden border border-separator/60 w-fit max-w-[200px] h-28 bg-fill/40 group cursor-pointer shadow-sm"
                      >
                        <img
                          src={task.photoUrl}
                          alt="Task attachment"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                        <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-1 text-caption font-semibold">
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span>View Photo</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Assign Task Modal */}
      <Sheet
        open={taskSheetOpen}
        onOpenChange={setTaskSheetOpen}
        title={`Assign Task on Challan ${challan.number}`}
        description="The assigned staff member will get a push notification and see it on this delivery challan."
      >
        <form onSubmit={handleCreateTask} className="flex flex-col gap-4 py-2">
          {/* Assign To */}
          <div className="flex flex-col gap-1.5">
            <label className="text-footnote font-semibold uppercase text-label-2">
              Assign To
            </label>
            <select
              value={taskAssigneeId}
              onChange={(e) => setTaskAssigneeId(e.target.value)}
              className="w-full h-11 px-3 bg-surface border border-separator/60 rounded-xl text-subhead text-label font-semibold focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role.replace('_', ' ').toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          {/* Task Title */}
          <div className="flex flex-col gap-1.5">
            <label className="text-footnote font-semibold uppercase text-label-2">
              Instructions (Text) *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Inspect needle plate & take photo of bilty before dispatch"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              className="w-full h-11 px-3 bg-surface border border-separator/60 rounded-xl text-subhead text-label placeholder:text-label-3 focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-footnote font-semibold uppercase text-label-2">
              Additional Notes (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="Include phone number, driver contact or extra details..."
              value={taskNotes}
              onChange={(e) => setTaskNotes(e.target.value)}
              className="w-full p-3 bg-surface border border-separator/60 rounded-xl text-subhead text-label placeholder:text-label-3 focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>

          {/* Photo Attachment (Text + Photo) */}
          <div className="flex flex-col gap-2">
            <label className="text-footnote font-semibold uppercase text-label-2">
              Attach Photo Proof (Text + Photo)
            </label>

            {taskPhotoUrl ? (
              <div className="relative rounded-xl overflow-hidden border border-separator/60 w-fit h-32 bg-fill/40">
                <img
                  src={taskPhotoUrl}
                  alt="Attached preview"
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => setTaskPhotoUrl('')}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <label className="flex items-center justify-center gap-2 p-3.5 border-2 border-dashed border-separator/60 rounded-xl cursor-pointer hover:border-accent hover:bg-fill/30 transition-colors">
                  <Upload className="w-5 h-5 text-accent" />
                  <span className="text-subhead font-semibold text-label">
                    Upload Photo from Camera / Gallery
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>

                <div className="flex items-center gap-2">
                  <span className="text-caption text-label-3">Quick preset:</span>
                  <button
                    type="button"
                    onClick={() => setTaskPhotoUrl(SAMPLE_TASK_PHOTO_1)}
                    className="text-caption text-accent font-semibold px-2 py-1 rounded bg-accent-soft hover:underline"
                  >
                    + Machine Inspection Photo
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaskPhotoUrl(SAMPLE_TASK_PHOTO_2)}
                    className="text-caption text-accent font-semibold px-2 py-1 rounded bg-accent-soft hover:underline"
                  >
                    + Signed Bilty Photo
                  </button>
                </div>
              </div>
            )}
          </div>

          <Button
            type="submit"
            fullWidth
            disabled={!taskTitle.trim() || createTaskMutation.isPending}
            className="h-12 mt-2"
          >
            <Plus className="w-4 h-4 mr-1.5 stroke-[2.2]" />
            <span>Assign Task & Send Notification</span>
          </Button>
        </form>
      </Sheet>

      {/* Lightbox Modal */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setLightboxPhoto(null)}
        >
          <div
            className="relative max-w-lg w-full bg-surface rounded-2xl overflow-hidden shadow-2xl p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightboxPhoto(null)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors z-10"
              aria-label="Close photo"
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={lightboxPhoto}
              alt="Enlarged preview"
              className="w-full h-auto max-h-[75vh] object-contain rounded-xl"
            />
            <div className="p-3 text-center text-subhead font-semibold text-label">
              Attached Challan Task Photo
            </div>
          </div>
        </div>
      )}
    </LargeTitleScreen>
  );
};
