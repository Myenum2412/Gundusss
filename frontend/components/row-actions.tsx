"use client";

import { EllipsisIcon, EyeIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function RowActions({
  onView,
  onEdit,
  onDelete,
  viewLabel = "View details",
  editLabel = "Edit",
  deleteLabel = "Delete",
}: {
  onView?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  viewLabel?: string;
  editLabel?: string;
  deleteLabel?: string;
}) {
  const { can } = useAuth();
  // Read-only roles can still open the details view, but editing/deleting is
  // hidden (and rejected by the API regardless).
  const canWrite = can("data:write");
  const showEdit = canWrite && Boolean(onEdit);
  const showDelete = canWrite && Boolean(onDelete);

  if (!onView && !showEdit && !showDelete) {
    return null;
  }

  return (
    <div className="flex items-center justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger
          type="button"
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon-sm" }),
            "size-8 text-muted-foreground hover:text-foreground cursor-pointer focus-visible:ring-2"
          )}
          aria-label="Row actions"
          title="Row actions"
        >
          <EllipsisIcon className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="bottom">
          {onView && (
            <DropdownMenuItem onClick={onView}>
              <EyeIcon />
              {viewLabel}
            </DropdownMenuItem>
          )}
          {showEdit && (
            <DropdownMenuItem onClick={onEdit}>
              <PencilIcon />
              {editLabel}
            </DropdownMenuItem>
          )}
          {showDelete && (
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2Icon />
              {deleteLabel}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
