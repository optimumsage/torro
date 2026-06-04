import { useMemo } from 'react';
import { Folder, FileVideo, File as FileIcon, ChevronRight } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn, formatBytes } from '@/lib/utils';
import type { TorrentFile } from '@/types';

interface TreeNode {
  name: string;
  path: string;
  size: number;
  isFile: boolean;
  index?: number;
  children: Map<string, TreeNode>;
}

const VIDEO_RE = /\.(mp4|mkv|avi|mov|webm|m4v)$/i;

function buildTree(files: TorrentFile[]): TreeNode {
  const root: TreeNode = { name: '', path: '', size: 0, isFile: false, children: new Map() };
  for (const f of files) {
    const parts = f.name.split('/');
    let node = root;
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1;
      let child = node.children.get(part);
      if (!child) {
        child = {
          name: part,
          path: parts.slice(0, i + 1).join('/'),
          size: isFile ? f.size : 0,
          isFile,
          index: isFile ? f.index : undefined,
          children: new Map(),
        };
        node.children.set(part, child);
      }
      node = child;
    });
  }
  return root;
}

function leafIndices(node: TreeNode): number[] {
  if (node.isFile) return node.index != null ? [node.index] : [];
  return [...node.children.values()].flatMap(leafIndices);
}

function nodeSize(node: TreeNode): number {
  if (node.isFile) return node.size;
  return [...node.children.values()].reduce((s, c) => s + nodeSize(c), 0);
}

interface RowProps {
  node: TreeNode;
  depth: number;
  selected: Set<number>;
  expanded: Set<string>;
  toggleSelect: (indices: number[], on: boolean) => void;
  toggleExpand: (path: string) => void;
}

function TreeRow({ node, depth, selected, expanded, toggleSelect, toggleExpand }: RowProps) {
  const indices = leafIndices(node);
  const selectedCount = indices.filter((i) => selected.has(i)).length;
  const checkState: boolean | 'indeterminate' =
    selectedCount === 0 ? false : selectedCount === indices.length ? true : 'indeterminate';
  const isOpen = expanded.has(node.path);
  const isVideo = node.isFile && VIDEO_RE.test(node.name);

  return (
    <>
      <div
        className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/60"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <Checkbox
          checked={checkState}
          onCheckedChange={(v) => toggleSelect(indices, v === true)}
          aria-label={`Select ${node.name}`}
        />
        {node.isFile ? (
          isVideo ? (
            <FileVideo className="h-4 w-4 shrink-0 text-primary" />
          ) : (
            <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          )
        ) : (
          <button
            type="button"
            onClick={() => toggleExpand(node.path)}
            className="flex items-center gap-1.5 text-left"
          >
            <ChevronRight className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', isOpen && 'rotate-90')} />
            <Folder className="h-4 w-4 shrink-0 text-amber-500" />
          </button>
        )}
        <span className="flex-1 truncate text-sm">{node.name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(nodeSize(node))}</span>
      </div>
      {!node.isFile &&
        isOpen &&
        [...node.children.values()]
          .sort((a, b) => Number(a.isFile) - Number(b.isFile) || a.name.localeCompare(b.name))
          .map((child) => (
            <TreeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              selected={selected}
              expanded={expanded}
              toggleSelect={toggleSelect}
              toggleExpand={toggleExpand}
            />
          ))}
    </>
  );
}

interface FileTreeProps {
  files: TorrentFile[];
  selected: Set<number>;
  expanded: Set<string>;
  toggleSelect: (indices: number[], on: boolean) => void;
  toggleExpand: (path: string) => void;
}

export function FileTree({ files, selected, expanded, toggleSelect, toggleExpand }: FileTreeProps) {
  const tree = useMemo(() => buildTree(files), [files]);
  const top = [...tree.children.values()].sort(
    (a, b) => Number(a.isFile) - Number(b.isFile) || a.name.localeCompare(b.name)
  );
  return (
    <div className="space-y-0.5">
      {top.map((node) => (
        <TreeRow
          key={node.path}
          node={node}
          depth={0}
          selected={selected}
          expanded={expanded}
          toggleSelect={toggleSelect}
          toggleExpand={toggleExpand}
        />
      ))}
    </div>
  );
}
