import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  CheckCircle2,
  Clock,
  Camera,
  FileSpreadsheet,
  X,
  Upload,
  Image as ImageIcon,
} from 'lucide-react';
import { Task, User } from '@saas/shared';
import { api } from '../../api/index.js';
import { useAppStore } from '../../app/store.js';
import { LargeTitleScreen } from '../../components/ui/LargeTitleScreen.js';
import { Button } from '../../components/ui/Button.js';
import { Sheet } from '../../components/ui/Sheet.js';
import { SegmentedControl } from '../../components/ui/SegmentedControl.js';
import { useToast } from '../../components/ui/Toast.js';
import { SAMPLE_TASK_PHOTO_1, SAMPLE_TASK_PHOTO_2 } from '../../mock/seed.js';

export const TasksScreen: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentCompanyId } = useAppStore();
  const { showToast } = useToast();

  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

  // Form State
  const [assignedToUserId, setAssignedToUserId] = useState('u5'); // Suresh Kumar default
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedChallanId, setSelectedChallanId] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string>('');

  // Fetch data
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', currentCompanyId],
    queryFn: () => api.tasks.list(currentCompanyId),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.users.list(),
  });

  const { data: challans = [] } = useQuery({
    queryKey: ['challans', currentCompanyId],
    queryFn: () => api.challans.list(currentCompanyId),
  });

  const userMap = new Map<string, User>(users.map((u) => [u.id, u]));
  const challanMap = new Map(challans.map((c) => [c.id, c]));

  // Task creation mutation
  const createTaskMutation = useMutation({
    mutationFn: (data: Omit<Task, 'id' | 'createdAt'>) => api.tasks.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      showToast({
        message: 'Task assigned and notification sent to assignee',
        variant: 'success',
      });
      setCreateSheetOpen(false);
      setTitle('');
      setDescription('');
      setSelectedChallanId('');
      setPhotoDataUrl('');
    },
  });

  // Task status update mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Task['status'] }) =>
      api.tasks.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      showToast({ message: 'Task status updated' });
    },
  });

  // Handle Photo File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setPhotoDataUrl(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    createTaskMutation.mutate({
      companyId: currentCompanyId,
      title: title.trim(),
      description: description.trim() || undefined,
      assignedToUserId,
      assignedByUserId: 'u1', // Owner (Manohar Lal)
      challanId: selectedChallanId || undefined,
      photoUrl: photoDataUrl || undefined,
      status: 'pending',
      priority: 'normal',
    });
  };

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'pending') return t.status === 'pending' || t.status === 'in_progress';
    if (filter === 'completed') return t.status === 'completed';
    return true;
  });

  return (
    <LargeTitleScreen
      title="Tasks"
      headerAction={
        <Button
          size="small"
          onClick={() => setCreateSheetOpen(true)}
          className="flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4 stroke-[2.2]" />
          <span>Assign Task</span>
        </Button>
      }
    >
      {/* Filter Segment */}
      <SegmentedControl
        options={[
          { value: 'all', label: `All (${tasks.length})` },
          {
            value: 'pending',
            label: `Pending (${tasks.filter((t) => t.status !== 'completed').length})`,
          },
          {
            value: 'completed',
            label: `Done (${tasks.filter((t) => t.status === 'completed').length})`,
          },
        ]}
        value={filter}
        onChange={(val) => setFilter(val as any)}
      />

      {/* Task List */}
      <div className="flex flex-col gap-3">
        {isLoading ? (
          <div className="p-8 text-center text-label-2 text-subhead">
            Loading company tasks...
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="bg-surface rounded-ios-card p-10 border border-separator/50 flex flex-col items-center justify-center gap-2 text-center">
            <CheckCircle2 className="w-10 h-10 text-ok" />
            <span className="text-subhead font-semibold text-label">
              No tasks found
            </span>
            <span className="text-footnote text-label-2">
              All delivery and company operations are up to date.
            </span>
            <Button
              variant="tinted"
              size="small"
              onClick={() => setCreateSheetOpen(true)}
              className="mt-2"
            >
              Assign New Task
            </Button>
          </div>
        ) : (
          filteredTasks.map((task) => {
            const assignee = userMap.get(task.assignedToUserId);
            const assigner = userMap.get(task.assignedByUserId);
            const challan = task.challanId ? challanMap.get(task.challanId) : null;
            const isDone = task.status === 'completed';

            return (
              <div
                key={task.id}
                className={`bg-surface rounded-ios-card p-4 border border-separator/40 shadow-sm flex flex-col gap-3 transition-all ${
                  isDone ? 'opacity-75' : ''
                }`}
              >
                {/* Header: Assignee & Status */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-accent/15 text-accent font-bold text-caption flex items-center justify-center">
                      {assignee?.name.charAt(0) ?? 'U'}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-subhead font-semibold text-label">
                        {assignee?.name ?? 'Assigned Staff'}
                      </span>
                      <span className="text-caption text-label-3">
                        From {assigner?.name ?? 'Management'} · {task.priority.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      updateStatusMutation.mutate({
                        id: task.id,
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
                        <span>Completed</span>
                      </>
                    ) : (
                      <>
                        <Clock className="w-3.5 h-3.5" />
                        <span>Pending</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Task Title & Notes */}
                <div className="flex flex-col gap-1">
                  <span className={`text-body font-semibold text-label ${isDone ? 'line-through text-label-2' : ''}`}>
                    {task.title}
                  </span>
                  {task.description && (
                    <p className="text-footnote text-label-2 leading-relaxed">
                      {task.description}
                    </p>
                  )}
                </div>

                {/* Linked Challan Pill */}
                {challan && (
                  <button
                    type="button"
                    onClick={() => navigate(`/challans/${challan.id}`)}
                    className="self-start flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-fill/50 hover:bg-fill/80 border border-separator/40 text-footnote font-semibold text-label transition-colors"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-accent" />
                    <span>Challan: {challan.number}</span>
                    <span className="text-caption text-label-3">
                      ({challan.lines.map((l) => l.description).join(', ')})
                    </span>
                  </button>
                )}

                {/* Attached Photo Preview */}
                {task.photoUrl && (
                  <div className="pt-1 flex flex-col gap-1">
                    <span className="text-caption font-semibold text-label-2 flex items-center gap-1">
                      <Camera className="w-3 h-3 text-accent" />
                      <span>Attached Photo Proof:</span>
                    </span>
                    <div
                      onClick={() => setLightboxPhoto(task.photoUrl!)}
                      className="relative rounded-xl overflow-hidden border border-separator/60 w-fit max-w-[240px] h-32 bg-fill/40 group cursor-pointer shadow-sm"
                    >
                      <img
                        src={task.photoUrl}
                        alt="Task attachment"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                      <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-1 text-footnote font-semibold">
                        <ImageIcon className="w-4 h-4" />
                        <span>Enlarge Photo</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Assign Task Sheet (Send Text or Text + Photo) */}
      <Sheet
        open={createSheetOpen}
        onOpenChange={setCreateSheetOpen}
        title="Assign Task to Team Member"
        description="Assignee will receive a notification and see it on the linked delivery challan."
      >
        <form onSubmit={handleCreateSubmit} className="flex flex-col gap-4 py-2">
          {/* Select Assignee */}
          <div className="flex flex-col gap-1.5">
            <label className="text-footnote font-semibold uppercase text-label-2">
              Assign To
            </label>
            <select
              value={assignedToUserId}
              onChange={(e) => setAssignedToUserId(e.target.value)}
              className="w-full h-11 px-3 bg-surface border border-separator/60 rounded-xl text-subhead text-label font-semibold focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role.replace('_', ' ').toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          {/* Task Title (Text) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-footnote font-semibold uppercase text-label-2">
              Task Instructions (Text) *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Inspect TAI MACHINE motor seal before truck leaves"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full h-11 px-3 bg-surface border border-separator/60 rounded-xl text-subhead text-label placeholder:text-label-3 focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>

          {/* Task Detailed Notes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-footnote font-semibold uppercase text-label-2">
              Additional Notes (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="Include specific instructions, delivery address, or safety checks..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-3 bg-surface border border-separator/60 rounded-xl text-subhead text-label placeholder:text-label-3 focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>

          {/* Link to Delivery Challan */}
          <div className="flex flex-col gap-1.5">
            <label className="text-footnote font-semibold uppercase text-label-2">
              Link to Delivery Challan (Optional)
            </label>
            <select
              value={selectedChallanId}
              onChange={(e) => setSelectedChallanId(e.target.value)}
              className="w-full h-11 px-3 bg-surface border border-separator/60 rounded-xl text-subhead text-label focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              <option value="">-- No specific challan (General task) --</option>
              {challans.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.number} · {c.lines.map((l) => l.description).join(', ')} ({c.date})
                </option>
              ))}
            </select>
          </div>

          {/* Photo Attachment Section */}
          <div className="flex flex-col gap-2">
            <label className="text-footnote font-semibold uppercase text-label-2">
              Attach Photo Proof (Text + Photo)
            </label>

            {photoDataUrl ? (
              <div className="relative rounded-xl overflow-hidden border border-separator/60 w-fit h-36 bg-fill/40">
                <img
                  src={photoDataUrl}
                  alt="Attached preview"
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => setPhotoDataUrl('')}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-separator/60 rounded-xl cursor-pointer hover:border-accent hover:bg-fill/30 transition-colors">
                  <Upload className="w-5 h-5 text-accent" />
                  <span className="text-subhead font-semibold text-label">
                    Upload Photo from Device
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>

                {/* Preset Machine Inspection Photos for Quick Testing */}
                <div className="flex items-center gap-2">
                  <span className="text-caption text-label-3">Or quick preset:</span>
                  <button
                    type="button"
                    onClick={() => setPhotoDataUrl(SAMPLE_TASK_PHOTO_1)}
                    className="text-caption text-accent font-semibold px-2 py-1 rounded bg-accent-soft hover:underline"
                  >
                    + Machine Inspection Mark
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhotoDataUrl(SAMPLE_TASK_PHOTO_2)}
                    className="text-caption text-accent font-semibold px-2 py-1 rounded bg-accent-soft hover:underline"
                  >
                    + Signed Bilty Proof
                  </button>
                </div>
              </div>
            )}
          </div>

          <Button
            type="submit"
            fullWidth
            disabled={!title.trim() || createTaskMutation.isPending}
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
              Attached Task Photo
            </div>
          </div>
        </div>
      )}
    </LargeTitleScreen>
  );
};
