
import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon } from "./Icon";
import { IconSize } from "../types";

interface SortableIconProps {
  id: string;
  title: string;
  url?: string;
  customIconUrl?: string; // New prop
  onClick: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  isFolder?: boolean;
  itemCount?: number;
  subIcons?: string[];
  size?: IconSize;
}

export const SortableIcon: React.FC<SortableIconProps> = (props) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 99 : 'auto',
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Icon {...props} isDragging={isDragging} />
    </div>
  );
};
