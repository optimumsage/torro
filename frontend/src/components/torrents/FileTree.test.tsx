import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileTree } from './FileTree';
import type { TorrentFile } from '@/types';

const files: TorrentFile[] = [
  { name: 'Movie/video.mp4', index: 0, size: 100, progress: 0, priority: 1 },
  { name: 'Movie/subs.srt', index: 1, size: 10, progress: 0, priority: 1 },
  { name: 'readme.txt', index: 2, size: 5, progress: 0, priority: 1 },
];

describe('FileTree', () => {
  it('renders folders and nested files when expanded', () => {
    render(
      <FileTree
        files={files}
        selected={new Set()}
        expanded={new Set(['Movie'])}
        toggleSelect={() => {}}
        toggleExpand={() => {}}
      />
    );
    expect(screen.getByText('Movie')).toBeInTheDocument();
    expect(screen.getByText('video.mp4')).toBeInTheDocument();
    expect(screen.getByText('subs.srt')).toBeInTheDocument();
    expect(screen.getByText('readme.txt')).toBeInTheDocument();
  });

  it('invokes toggleSelect with the leaf index when a file checkbox is clicked', async () => {
    const toggleSelect = vi.fn();
    render(
      <FileTree
        files={files}
        selected={new Set()}
        expanded={new Set()}
        toggleSelect={toggleSelect}
        toggleExpand={() => {}}
      />
    );
    await userEvent.click(screen.getByLabelText('Select readme.txt'));
    expect(toggleSelect).toHaveBeenCalledWith([2], true);
  });
});
