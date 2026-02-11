import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Settings, X, GripVertical } from 'lucide-react';
import { useColumnPreferences } from '@/stores/columnPreferences';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export function ColumnSelector({ availableColumns }) {
  const [open, setOpen] = useState(false);
  const [draggedKey, setDraggedKey] = useState(null);
  const [dragOverKey, setDragOverKey] = useState(null);
  const { preferences, setColumnVisibility, updateColumnOrder, resetPreferences, initializePreferences } =
    useColumnPreferences();

  // Initialize preferences when columns change
  useState(() => {
    initializePreferences(availableColumns);
  });

  // Ensure preferences is a Map before using .values()
  const prefMap = preferences instanceof Map ? preferences : new Map();
  const visibleCount = Array.from(prefMap.values()).filter((p) => p.visible).length;

  const handleColumnToggle = (key) => {
    const prefMap = preferences instanceof Map ? preferences : new Map();
    const current = prefMap.get(key);
    const newVisibility = current ? !current.visible : false;
    setColumnVisibility(key, newVisibility);
  };

  const handleDragStart = (key) => {
    setDraggedKey(key);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (key) => {
    if (draggedKey && draggedKey !== key) {
      setDragOverKey(key);
    }
  };

  const handleDragLeave = () => {
    setDragOverKey(null);
  };

  const handleDrop = (dropKey) => {
    if (!draggedKey || draggedKey === dropKey) return;

    const prefMap = preferences instanceof Map ? preferences : new Map();
    const sortedKeys = Array.from(prefMap.values())
      .sort((a, b) => a.order - b.order)
      .map(p => p.key);

    const draggedIndex = sortedKeys.indexOf(draggedKey);
    const dropIndex = sortedKeys.indexOf(dropKey);

    if (draggedIndex !== -1 && dropIndex !== -1) {
      // Swap orders
      const draggedOrder = prefMap.get(draggedKey).order;
      const dropOrder = prefMap.get(dropKey).order;
      updateColumnOrder(draggedKey, dropOrder);
      updateColumnOrder(dropKey, draggedOrder);
    }

    setDraggedKey(null);
    setDragOverKey(null);
  };

  const handleResetColumns = () => {
    resetPreferences();
    initializePreferences(availableColumns);
  };

  // Sort columns by order and visibility
  const sortedColumns = Array.from(prefMap.values())
    .sort((a, b) => a.order - b.order);

  const findColumnLabel = (key) => {
    return availableColumns.find((c) => c.key === key)?.label || key;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          title="Customize columns"
        >
          <Settings className="h-4 w-4" />
          Columns ({visibleCount})
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Customize Report Columns
          </DialogTitle>
          <DialogDescription>
            Select which columns to display in your product report. You're viewing{' '}
            <span className="font-medium">{visibleCount}</span> out of{' '}
            <span className="font-medium">{availableColumns.length}</span> columns.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[400px] w-full rounded-md border p-4">
          <div className="space-y-2">
            {sortedColumns.map((pref) => (
              <div
                key={pref.key}
                draggable
                onDragStart={() => handleDragStart(pref.key)}
                onDragOver={handleDragOver}
                onDragEnter={() => handleDragEnter(pref.key)}
                onDragLeave={handleDragLeave}
                onDrop={() => handleDrop(pref.key)}
                className={cn(
                  'flex items-center gap-2 p-2 rounded transition-all cursor-move group',
                  draggedKey === pref.key && 'opacity-50 bg-muted',
                  dragOverKey === pref.key && 'bg-accent border-l-2 border-primary'
                )}
              >
                {/* Drag Handle */}
                <GripVertical className="h-4 w-4 text-muted-foreground opacity-50 group-hover:opacity-100 flex-shrink-0" />
                
                {/* Checkbox */}
                <Checkbox
                  id={`col-${pref.key}`}
                  checked={pref.visible}
                  onCheckedChange={() => handleColumnToggle(pref.key)}
                  className="cursor-pointer flex-shrink-0"
                />
                
                {/* Label */}
                <Label
                  htmlFor={`col-${pref.key}`}
                  className={cn(
                    'flex-1 cursor-pointer text-sm',
                    !pref.visible && 'text-muted-foreground line-through'
                  )}
                >
                  {findColumnLabel(pref.key)}
                </Label>
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleResetColumns}
            className="gap-1.5"
          >
            <X className="h-4 w-4" />
            Reset to Default
          </Button>
          <Button
            type="button"
            onClick={() => setOpen(false)}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
