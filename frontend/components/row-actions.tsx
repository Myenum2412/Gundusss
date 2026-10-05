"use client";

import { EllipsisIcon, EyeIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  return (
    <div className="flex items-center justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Row actions"
              title="Row actions"
              className="text-muted-foreground hover:text-foreground"
            />
          }
        >
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="bottom">
          {onView && (
            <DropdownMenuItem onClick={onView}>
              <EyeIcon />
              {viewLabel}
            </DropdownMenuItem>
          )}
          {onEdit && (
            <DropdownMenuItem onClick={onEdit}>
              <PencilIcon />
              {editLabel}
            </DropdownMenuItem>
          )}
          {onDelete && (
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
